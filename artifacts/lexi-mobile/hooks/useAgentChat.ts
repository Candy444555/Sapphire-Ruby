import { useState, useRef, useCallback, useEffect } from "react";
import { streamAgent, type AgentRawEvent, type ChatMsg } from "@/lib/lexi-api";
import { explainLexiError } from "@/lib/lexi-error-explainer";

export type AgentEvent = Exclude<AgentRawEvent, { type: "session" }>;

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
  initialMessages?: ChatMsg[];
  onMessagesChange?: (messages: AgentMessage[]) => void;
  onSelfPatch?: (name: string, description: string) => void;
}

let counter = 0;
const makeId = () => `amsg-${Date.now()}-${counter++}`;

function hydrate(raw: ChatMsg[]): AgentMessage[] {
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
    initialMessages && initialMessages.length > 0 ? hydrate(initialMessages) : [],
  );
  const [isRunning, setIsRunning] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const messagesRef = useRef<AgentMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onChangeRef = useRef(onMessagesChange);
  const onSelfPatchRef = useRef(onSelfPatch);
  onChangeRef.current = onMessagesChange;
  onSelfPatchRef.current = onSelfPatch;

  const prevConvId = useRef<string | undefined>(conversationId);
  useEffect(() => {
    if (conversationId !== prevConvId.current) {
      prevConvId.current = conversationId;
      const next = initialMessages && initialMessages.length > 0 ? hydrate(initialMessages) : [];
      messagesRef.current = next;
      setMessages(next);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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

      const userMsg: AgentMessage = { id: makeId(), role: "user", content, timestamp: Date.now() };
      const assistantMsg: AgentMessage = { id: makeId(), role: "assistant", content: "", events: [], timestamp: Date.now() };
      const prior = messagesRef.current;
      updateMessages([...prior, userMsg, assistantMsg]);

      const historyForApi: ChatMsg[] = prior
        .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
        .map((m) => ({ role: m.role, content: m.content }));
      historyForApi.push({ role: "user", content });

      abortRef.current = new AbortController();

      try {
        await streamAgent(
          { model, messages: historyForApi, systemPrompt, sessionId: sessionIdRef.current ?? undefined },
          (parsed) => {
            if (parsed.type === "session") {
              sessionIdRef.current = parsed.sessionId;
              setSessionId(parsed.sessionId);
              return;
            }
            if (parsed.type === "thinking") setIsThinking(true);
            else setIsThinking(false);

            if (parsed.type === "error") {
              setError(explainLexiError(parsed.message, "agent stream"));
              return;
            }

            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (!last || last.role !== "assistant") return prev;
              const updatedLast = { ...last, events: [...(last.events ?? [])] };
              if (parsed.type === "text") {
                updatedLast.content += parsed.content;
                updatedLast.events!.push(parsed);
              } else if (parsed.type === "needs_input") {
                updatedLast.needsInput = parsed.question;
                updatedLast.events!.push(parsed);
              } else if (parsed.type === "self_patch") {
                updatedLast.events!.push(parsed);
                onSelfPatchRef.current?.(parsed.name, parsed.description);
              } else if (
                parsed.type === "self_patch_error" ||
                parsed.type === "project_complete" ||
                parsed.type === "cmd_start" ||
                parsed.type === "cmd_result" ||
                parsed.type === "done"
              ) {
                updatedLast.events!.push(parsed);
              }
              updated[updated.length - 1] = updatedLast;
              messagesRef.current = updated;
              return updated;
            });
          },
          abortRef.current.signal,
        );
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
    [isRunning, updateMessages],
  );

  const replyToInputRequest = useCallback(
    async (answer: string, model: string, systemPrompt?: string) => {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant") updated[updated.length - 1] = { ...last, needsInput: undefined };
        messagesRef.current = updated;
        return updated;
      });
      await sendMessage(answer, model, systemPrompt);
    },
    [sendMessage],
  );

  return { messages, sendMessage, replyToInputRequest, isRunning, isThinking, error, sessionId, clearMessages, stop };
}
