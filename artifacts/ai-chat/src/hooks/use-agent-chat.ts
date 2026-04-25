import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage } from "@workspace/api-client-react";
import { explainLexiError } from "@/lib/lexi-error-explainer";

export type AgentEvent =
  | { type: "text"; content: string }
  | { type: "cmd_start"; command: string }
  | { type: "cmd_result"; command: string; output: string; exitCode: number; cwd: string }
  | { type: "needs_input"; question: string }
  | { type: "self_patch"; name: string; description: string }
  | { type: "self_patch_error"; name: string; error: string }
  | { type: "project_complete"; projectId: string; name: string; path: string; mainFile: string; projectType: string }
  | { type: "session"; sessionId: string }
  | { type: "thinking" }
  | { type: "done" }
  | { type: "error"; message: string };

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  events?: AgentEvent[];
  needsInput?: string;
  timestamp: number;
}

interface UseAgentChatOptions {
  conversationId?: string;
  initialMessages?: { role: "user" | "assistant" | "system"; content: string }[];
  onMessagesChange?: (messages: AgentMessage[]) => void;
  onSelfPatch?: (name: string, description: string) => void;
}

let msgCounter = 0;
function makeId() {
  return `amsg-${Date.now()}-${msgCounter++}`;
}

function hydrateInitialMessages(
  raw: { role: "user" | "assistant" | "system"; content: string }[]
): AgentMessage[] {
  return raw
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: makeId(),
      role: m.role as "user" | "assistant",
      content: m.content,
      events: m.role === "assistant" && m.content ? [{ type: "text" as const, content: m.content }] : [],
      timestamp: Date.now(),
    }));
}

export function useAgentChat({ conversationId, initialMessages, onMessagesChange, onSelfPatch }: UseAgentChatOptions = {}) {
  const [messages, setMessages] = useState<AgentMessage[]>(() =>
    initialMessages && initialMessages.length > 0 ? hydrateInitialMessages(initialMessages) : []
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const messagesRef = useRef<AgentMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const prevConversationIdRef = useRef<string | undefined>(conversationId);
  useEffect(() => {
    if (conversationId !== prevConversationIdRef.current) {
      prevConversationIdRef.current = conversationId;
      const hydrated = initialMessages && initialMessages.length > 0
        ? hydrateInitialMessages(initialMessages)
        : [];
      // Only protect when actively running; otherwise always reload the new convo
      if (isRunning) return;
      messagesRef.current = hydrated;
      setMessages(hydrated);
      setError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);
  const onChangeRef = useRef(onMessagesChange);
  onChangeRef.current = onMessagesChange;
  const onSelfPatchRef = useRef(onSelfPatch);
  onSelfPatchRef.current = onSelfPatch;
  const sessionIdRef = useRef<string | null>(null);

  const updateMessages = useCallback((next: AgentMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    onChangeRef.current?.(next);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
    setIsThinking(false);
  }, []);

  const clearMessages = useCallback(() => {
    stop();
    updateMessages([]);
    setError(null);
  }, [stop, updateMessages]);

  const sendMessage = useCallback(
    async (content: string, model: string, systemPrompt?: string) => {
      if (!content.trim() || !model || isRunning) return;

      setError(null);
      setIsRunning(true);
      setIsThinking(false);

      const userMsg: AgentMessage = {
        id: makeId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      const assistantMsg: AgentMessage = {
        id: makeId(),
        role: "assistant",
        content: "",
        events: [],
        timestamp: Date.now(),
      };

      // Capture prior history BEFORE updateMessages mutates messagesRef.current
      const priorMessages = messagesRef.current;

      const next = [...messagesRef.current, userMsg, assistantMsg];
      updateMessages(next);

      const historyForApi: ChatMessage[] = priorMessages
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
        .map((m) => ({ role: m.role, content: m.content }));

      historyForApi.push({ role: "user", content });

      abortRef.current = new AbortController();

      const requestBody = {
        model,
        messages: historyForApi,
        systemPrompt,
        sessionId: sessionIdRef.current ?? undefined,
      };
      console.log("[agent] sending request — model:", model, "messages:", historyForApi.length, "first role:", historyForApi[0]?.role);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server error ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");

        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;

        while (!done) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;

          buffer += decoder.decode(value, { stream: true });
          let boundary: number;

          while ((boundary = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);

            if (!event.startsWith("data: ")) continue;
            const dataStr = event.slice(6).trim();
            if (!dataStr || dataStr === "[DONE]") {
              done = true;
              break;
            }

            let parsed: AgentEvent | null = null;
            try {
              parsed = JSON.parse(dataStr);
            } catch { continue; }

            if (!parsed) continue;

            if (parsed.type === "session") {
              const sid = (parsed as { type: "session"; sessionId: string }).sessionId;
              sessionIdRef.current = sid;
              setSessionId(sid);
              continue;
            }

            if (parsed.type === "thinking") {
              setIsThinking(true);
            } else {
              setIsThinking(false);
            }

            if (parsed.type === "error") {
              setError(explainLexiError(parsed.message, "agent stream"));
              done = true;
              break;
            }

            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (!last || last.role !== "assistant") return prev;

              const updatedLast = { ...last, events: [...(last.events ?? [])] };

              if (parsed!.type === "text") {
                updatedLast.content += parsed!.content;
                updatedLast.events!.push(parsed!);
              } else if (parsed!.type === "needs_input") {
                updatedLast.needsInput = parsed!.question;
                updatedLast.events!.push(parsed!);
              } else if (parsed!.type === "self_patch") {
                updatedLast.events!.push(parsed!);
                onSelfPatchRef.current?.(parsed!.name, parsed!.description);
              } else if (parsed!.type === "self_patch_error") {
                updatedLast.events!.push(parsed!);
              } else if (parsed!.type === "project_complete") {
                updatedLast.events!.push(parsed!);
              } else if (
                parsed!.type === "cmd_start" ||
                parsed!.type === "cmd_result" ||
                parsed!.type === "done"
              ) {
                updatedLast.events!.push(parsed!);
              }

              updated[updated.length - 1] = updatedLast;
              messagesRef.current = updated;
              return updated;
            });
          }
        }

        onChangeRef.current?.(messagesRef.current);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          onChangeRef.current?.(messagesRef.current);
        } else {
          setError(explainLexiError(err instanceof Error ? err.message : "Failed to run agent", "agent task"));
        }
      } finally {
        setIsRunning(false);
        setIsThinking(false);
        abortRef.current = null;
      }
    },
    [isRunning, updateMessages]
  );

  const replyToInputRequest = useCallback(
    async (answer: string, model: string, systemPrompt?: string) => {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") {
          updated[updated.length - 1] = { ...last, needsInput: undefined };
        }
        messagesRef.current = updated;
        return updated;
      });
      await sendMessage(answer, model, systemPrompt);
    },
    [sendMessage]
  );

  return {
    messages,
    sendMessage,
    replyToInputRequest,
    isRunning,
    isThinking,
    error,
    sessionId,
    clearMessages,
    stop,
  };
}
