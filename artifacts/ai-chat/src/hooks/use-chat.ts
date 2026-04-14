import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage } from "@workspace/api-client-react";
import { explainLexiError } from "@/lib/lexi-error-explainer";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

interface UseChatOptions {
  conversationId?: string;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchChatStream(
  model: string,
  messages: ChatMessage[],
  systemPrompt: string | undefined,
  signal: AbortSignal,
  attempt: number
): Promise<Response> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, systemPrompt }),
    signal,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData.error || `Server error ${res.status}`;
    if (attempt < MAX_RETRIES && res.status >= 500) {
      console.warn(`[Lexi] Auto-healing: retry ${attempt + 1}/${MAX_RETRIES} after error: ${msg}`);
      await sleep(RETRY_DELAY_MS * (attempt + 1));
      return fetchChatStream(model, messages, systemPrompt, signal, attempt + 1);
    }
    throw new Error(msg);
  }

  return res;
}

export function useChat({
  conversationId,
  initialMessages = [],
  onMessagesChange,
}: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  const prevConversationId = useRef<string | undefined>(conversationId);
  useEffect(() => {
    if (prevConversationId.current === conversationId) return;
    prevConversationId.current = conversationId;
    messagesRef.current = initialMessages;
    setMessages(initialMessages);
    setError(null);
  });

  const updateMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const sendMessage = useCallback(
    async (
      content: string,
      model: string,
      systemPrompt?: string,
      attempt = 0
    ) => {
      if (!content.trim() || !model) return;

      setError(null);
      setIsStreaming(true);
      if (attempt > 0) setIsRetrying(true);

      const history = messagesRef.current;

      let newMessages: ChatMessage[];
      if (attempt === 0) {
        newMessages = [...history, { role: "user", content }];
        updateMessages(newMessages);
        onMessagesChangeRef.current?.(newMessages);
      } else {
        newMessages = history.filter((m) => m.role !== "assistant" || m.content !== "");
      }

      const withPlaceholder: ChatMessage[] = [
        ...newMessages,
        { role: "assistant", content: "" },
      ];
      updateMessages(withPlaceholder);

      abortControllerRef.current = new AbortController();

      try {
        const res = await fetchChatStream(
          model,
          newMessages,
          systemPrompt,
          abortControllerRef.current.signal,
          attempt
        );

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream available");

        const decoder = new TextDecoder();
        let assistantContent = "";
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
            const dataStr = event.slice(6);

            if (dataStr === "[DONE]") {
              done = true;
              break;
            }

            if (dataStr.startsWith("[ERROR]")) {
              const errMsg = dataStr.slice(8);
              if (attempt < MAX_RETRIES) {
                console.warn(`[Lexi] Auto-healing: stream error, retry ${attempt + 1}/${MAX_RETRIES}`);
                setIsRetrying(true);
                await sleep(RETRY_DELAY_MS * (attempt + 1));
                setIsRetrying(false);
                await sendMessage(content, model, systemPrompt, attempt + 1);
                return;
              }
              throw new Error(errMsg);
            }

            try {
              const token = JSON.parse(dataStr) as string;
              if (typeof token === "string") {
                assistantContent += token;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    role: "assistant",
                    content: assistantContent,
                  };
                  messagesRef.current = updated;
                  return updated;
                });
              }
            } catch {
              assistantContent += dataStr;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                };
                messagesRef.current = updated;
                return updated;
              });
            }
          }
        }

        onMessagesChangeRef.current?.(messagesRef.current);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          onMessagesChangeRef.current?.(messagesRef.current);
        } else {
          const msg =
            err instanceof Error ? err.message : "Failed to generate response";

          if (attempt < MAX_RETRIES) {
            console.warn(`[Lexi] Auto-healing: caught error, retry ${attempt + 1}/${MAX_RETRIES}: ${msg}`);
            setIsRetrying(true);
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            setIsRetrying(false);
            await sendMessage(content, model, systemPrompt, attempt + 1);
            return;
          }

          setError(explainLexiError(msg, "regular chat response"));
          setMessages((prev) => {
            const updated = prev.filter(
              (_, i) =>
                !(
                  i === prev.length - 1 &&
                  prev[i].role === "assistant" &&
                  !prev[i].content
                )
            );
            messagesRef.current = updated;
            onMessagesChangeRef.current?.(updated);
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        setIsRetrying(false);
        abortControllerRef.current = null;
      }
    },
    [updateMessages]
  );

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
      setIsRetrying(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    stopStreaming();
    updateMessages([]);
    onMessagesChangeRef.current?.([]);
    setError(null);
  }, [stopStreaming, updateMessages]);

  return { messages, sendMessage, isStreaming, isRetrying, error, clearMessages, stopStreaming };
}
