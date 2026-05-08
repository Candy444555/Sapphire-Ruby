import { useState, useRef, useCallback, useEffect } from "react";
import { streamLexi, streamCodeCraft, type ChatMsg, type ChatPathMode, type CodeCraftEvent, type CodeCraftLanguage } from "@/lib/lexi-api";
import { explainLexiError } from "@/lib/lexi-error-explainer";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface UseChatOptions {
  conversationId?: string;
  initialMessages?: ChatMsg[];
  onMessagesChange?: (messages: ChatMsg[]) => void;
}

export function useChat({ conversationId, initialMessages = [], onMessagesChange }: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<ChatPathMode | null>(null);
  const messagesRef = useRef<ChatMsg[]>(initialMessages);
  const abortRef = useRef<AbortController | null>(null);
  const onChangeRef = useRef(onMessagesChange);
  onChangeRef.current = onMessagesChange;

  const prevConvIdRef = useRef<string | undefined>(conversationId);
  useEffect(() => {
    if (prevConvIdRef.current === conversationId) return;
    prevConvIdRef.current = conversationId;
    messagesRef.current = initialMessages;
    setMessages(initialMessages);
    setError(null);
    setLastMode(null);
  });

  const updateMessages = useCallback((next: ChatMsg[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const sendMessage = useCallback(
    async (content: string, model: string, systemPrompt?: string, attempt = 0) => {
      if (!content.trim() || !model) return;
      setError(null);
      setIsStreaming(true);
      if (attempt > 0) setIsRetrying(true);

      const history = messagesRef.current;
      let newMessages: ChatMsg[];
      if (attempt === 0) {
        newMessages = [...history, { role: "user", content }];
        updateMessages(newMessages);
        onChangeRef.current?.(newMessages);
      } else {
        newMessages = history.filter((m) => m.role !== "assistant" || m.content !== "");
      }

      const withPlaceholder: ChatMsg[] = [...newMessages, { role: "assistant", content: "" }];
      updateMessages(withPlaceholder);

      abortRef.current = new AbortController();

      try {
        let assistantContent = "";
        await streamLexi(
          newMessages,
          (tok) => {
            assistantContent += tok;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: assistantContent };
              messagesRef.current = updated;
              return updated;
            });
          },
          { model, systemPrompt, signal: abortRef.current.signal, onMode: setLastMode },
        );
        onChangeRef.current?.(messagesRef.current);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          onChangeRef.current?.(messagesRef.current);
        } else {
          const msg = err instanceof Error ? err.message : "Failed to generate response";
          if (attempt < MAX_RETRIES) {
            setIsRetrying(true);
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            setIsRetrying(false);
            await sendMessage(content, model, systemPrompt, attempt + 1);
            return;
          }
          setError(explainLexiError(msg, "regular chat response"));
          setMessages((prev) => {
            const updated = prev.filter(
              (_, i) => !(i === prev.length - 1 && prev[i].role === "assistant" && !prev[i].content),
            );
            messagesRef.current = updated;
            onChangeRef.current?.(updated);
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        setIsRetrying(false);
        abortRef.current = null;
      }
    },
    [updateMessages],
  );

  // ---------------------------------------------------------------------------
  // CRAFT mode — generate → test → regenerate until the code actually runs.
  // Pushes the operator's request as a normal user message, then a single
  // assistant message that progressively renders the loop's state. On
  // success the assistant message ends with the verified fenced code block.
  // ---------------------------------------------------------------------------
  const craftCode = useCallback(
    async (
      request: string,
      model: string,
      opts: { language?: CodeCraftLanguage; maxAttempts?: number; systemPrompt?: string } = {},
    ) => {
      if (!request.trim() || !model) return;
      setError(null);
      setIsStreaming(true);
      setLastMode("server");

      const history = messagesRef.current;
      const withUser: ChatMsg[] = [...history, { role: "user", content: request }];
      updateMessages(withUser);
      onChangeRef.current?.(withUser);

      const initial = "🔨 Crafting code…";
      const withPlaceholder: ChatMsg[] = [...withUser, { role: "assistant", content: initial }];
      updateMessages(withPlaceholder);

      abortRef.current = new AbortController();
      const lang = opts.language;
      let header = "";
      const lines: string[] = [];
      let finalCode = "";
      let finalOk = false;
      let detectedLang: CodeCraftLanguage = lang ?? "python";

      const flush = () => {
        const body = lines.join("\n");
        const text = header ? `${header}\n\n${body}` : body || initial;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: text };
          messagesRef.current = updated;
          return updated;
        });
      };

      try {
        await streamCodeCraft(
          {
            request,
            language: lang,
            maxAttempts: opts.maxAttempts,
            model,
            systemPrompt: opts.systemPrompt,
          },
          (ev: CodeCraftEvent) => {
            switch (ev.type) {
              case "start":
                detectedLang = ev.language;
                header = `🔨 **Crafting ${ev.language} code** — up to ${ev.maxAttempts} attempts.`;
                flush();
                break;
              case "research":
                lines.push(`🔎 Researched ${ev.webHits} web result${ev.webHits === 1 ? "" : "s"}${ev.torUsed ? ` + ${ev.torHits} dark-web` : ""}.`);
                flush();
                break;
              case "attempt":
                lines.push(`\n**Attempt ${ev.n}** — writing…`);
                flush();
                break;
              case "thinking":
                // already represented by "writing…" above; suppress.
                break;
              case "code": {
                const lineCount = ev.code.split("\n").length;
                lines.push(`✏️ Wrote ${lineCount} lines of ${ev.language}, executing…`);
                flush();
                break;
              }
              case "running":
                break;
              case "result":
                if (ev.ok) {
                  lines.push(`✅ Exit 0 in ${ev.durationMs} ms — code works.`);
                } else {
                  const err = ev.timedOut
                    ? `timed out after ${ev.durationMs} ms`
                    : `exit ${ev.exitCode ?? "?"}`;
                  const tail = (ev.stderr || ev.stdout || "").trim().split("\n").slice(-3).join(" | ").slice(0, 240);
                  lines.push(`❌ ${err}${tail ? ` — ${tail}` : ""}`);
                }
                flush();
                break;
              case "final":
                finalOk = ev.ok;
                finalCode = ev.code;
                detectedLang = ev.language;
                if (ev.ok) {
                  lines.push(`\n🎯 Verified working after ${ev.attempts} attempt${ev.attempts === 1 ? "" : "s"}. Final code:`);
                } else {
                  lines.push(`\n⚠️ Could not get a clean run in ${ev.attempts} attempt${ev.attempts === 1 ? "" : "s"}. Best attempt below — last error: ${(ev.stderr || "").trim().split("\n").slice(-1)[0]?.slice(0, 200) ?? "unknown"}.`);
                }
                lines.push("```" + ev.language);
                lines.push(ev.code);
                lines.push("```");
                flush();
                break;
              case "error":
                lines.push(`⚠️ ${ev.message}`);
                flush();
                break;
            }
          },
          abortRef.current.signal,
        );
        // Persist via onMessagesChange.
        onChangeRef.current?.(messagesRef.current);
        // suppress unused-var warnings while keeping the values available for
        // future callers / debugging.
        void finalCode; void finalOk; void detectedLang;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          onChangeRef.current?.(messagesRef.current);
        } else {
          const msg = err instanceof Error ? err.message : "Code-Craft failed";
          setError(explainLexiError(msg, "code-craft"));
          lines.push(`\n⚠️ Code-Craft failed: ${msg}`);
          flush();
          onChangeRef.current?.(messagesRef.current);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [updateMessages],
  );

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsStreaming(false);
      setIsRetrying(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    stopStreaming();
    updateMessages([]);
    onChangeRef.current?.([]);
    setError(null);
    setLastMode(null);
  }, [stopStreaming, updateMessages]);

  return { messages, sendMessage, craftCode, isStreaming, isRetrying, error, lastMode, clearMessages, stopStreaming };
}
