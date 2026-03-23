import { useState, useRef, useCallback, useEffect } from "react";
import type { ChatMessage } from "@workspace/api-client-react/src/generated/api.schemas";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface UseChatOptions {
  conversationId?: string;
  initialMessages?: ChatMessage[];
  onMessagesChange?: (messages: ChatMessage[]) => void;
}

export function useChat({
  conversationId,
  initialMessages = [],
  onMessagesChange,
}: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>(initialMessages);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onMessagesChangeRef = useRef(onMessagesChange);
  onMessagesChangeRef.current = onMessagesChange;

  // Only reset when the conversation ID changes (not when messages array updates)
  const prevConversationId = useRef<string | undefined>(conversationId);
  useEffect(() => {
    if (prevConversationId.current === conversationId) return;
    prevConversationId.current = conversationId;
    messagesRef.current = initialMessages;
    setMessages(initialMessages);
    setError(null);
  }); // intentionally no dependency array — runs every render but guards with ref

  const updateMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const sendMessage = useCallback(
    async (content: string, model: string, systemPrompt?: string) => {
      if (!content.trim() || !model) return;

      setError(null);
      setIsStreaming(true);

      const history = messagesRef.current;
      const newMessages: ChatMessage[] = [...history, { role: "user", content }];
      updateMessages(newMessages);
      onMessagesChangeRef.current?.(newMessages);

      const withPlaceholder: ChatMessage[] = [
        ...newMessages,
        { role: "assistant", content: "" },
      ];
      updateMessages(withPlaceholder);

      abortControllerRef.current = new AbortController();

      try {
        const res = await fetch(`${BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: newMessages, systemPrompt }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Server error ${res.status}`);
        }

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
              throw new Error(dataStr.slice(8));
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

        // Save completed conversation
        onMessagesChangeRef.current?.(messagesRef.current);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          onMessagesChangeRef.current?.(messagesRef.current);
        } else {
          const msg =
            err instanceof Error ? err.message : "Failed to generate response";
          setError(msg);
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
    }
  }, []);

  const clearMessages = useCallback(() => {
    stopStreaming();
    updateMessages([]);
    onMessagesChangeRef.current?.([]);
    setError(null);
  }, [stopStreaming, updateMessages]);

  return { messages, sendMessage, isStreaming, error, clearMessages, stopStreaming };
}
