import { useState, useRef, useCallback, useEffect } from "react";
import { streamLexi, proofreadCode, type ChatMsg, type ChatPathMode } from "@/lib/lexi-api";
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
        // After the normal stream finishes, if Lexi included any fenced code
        // blocks in her reply, run each one through the server-side proofread
        // pass (syntax check + LLM typo fix). Pure post-processing — leaves
        // every other part of the response untouched.
        if (assistantContent.includes("```")) {
          await proofreadAssistantMessage();
        }
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
  // CODE-MODE PROOFREAD — runs after the normal stream finishes when the
  // operator had the green CODE pill on. Walks every fenced ``` block in the
  // assistant message, sends each to /api/code/proofread for a syntax check
  // + typo fix, and rewrites the message in place if any block was cleaned
  // up. Pure post-processing on top of Lexi's existing generation flow.
  // ---------------------------------------------------------------------------
  const proofreadAssistantMessage = useCallback(async () => {
    const cur = messagesRef.current;
    if (cur.length === 0) return;
    // Capture the EXACT message we're proofreading by index + content.
    // After the awaits below the conversation may have been cleared, switched,
    // or had another message appended — we must only mutate the same message
    // we sampled, never blindly overwrite "the last one".
    const targetIdx = cur.length - 1;
    const target = cur[targetIdx];
    if (target.role !== "assistant" || !target.content.includes("```")) return;
    const original = target.content;
    const fence = /```([\w+.-]*)\n([\s\S]*?)```/g;
    type Block = { lang: string; code: string; index: number; raw: string };
    const blocks: Block[] = [];
    let m: RegExpExecArray | null;
    while ((m = fence.exec(original)) !== null) {
      blocks.push({ lang: (m[1] || "").toLowerCase().trim(), code: m[2], index: m.index, raw: m[0] });
    }
    if (blocks.length === 0) return;
    const fixed = await Promise.all(blocks.map((b) => proofreadCode(b.lang || "text", b.code)));
    const anyChanged = fixed.some((r) => r.changed);
    if (!anyChanged) return;
    let out = "";
    let cursor = 0;
    blocks.forEach((b, i) => {
      out += original.slice(cursor, b.index);
      const r = fixed[i];
      const lang = b.lang || "";
      out += "```" + lang + "\n" + (r.changed ? r.code : b.code) + "\n```";
      cursor = b.index + b.raw.length;
    });
    out += original.slice(cursor);
    if (fixed.some((r) => r.hadErrors)) out += "\n\n_✓ proofread — fixed syntax/typos before delivery._";
    setMessages((prev) => {
      // Identity guard — only rewrite if the same message is still sitting at
      // the same index with the same content. Otherwise the user cleared the
      // chat, switched conversations, or the agent appended new turns; in any
      // of those cases we silently skip rather than corrupt history.
      if (prev.length <= targetIdx) return prev;
      const stillThere = prev[targetIdx];
      if (stillThere.role !== "assistant" || stillThere.content !== original) return prev;
      const updated = [...prev];
      updated[targetIdx] = { role: "assistant", content: out };
      messagesRef.current = updated;
      return updated;
    });
    onChangeRef.current?.(messagesRef.current);
  }, []);

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

  return { messages, sendMessage, isStreaming, isRetrying, error, lastMode, clearMessages, stopStreaming };
}
