import { useState, useRef, useCallback } from "react";
import type { ChatMessage } from "@workspace/api-client-react/src/generated/api.schemas";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a ref so sendMessage never has a stale snapshot of messages
  const messagesRef = useRef<ChatMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

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

      // Add empty assistant placeholder
      const withPlaceholder: ChatMessage[] = [...newMessages, { role: "assistant", content: "" }];
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

          // Process all complete SSE events (delimited by \n\n)
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

            // Backend sends JSON-encoded token strings (e.g. "hello" or "line1\nline2")
            try {
              const token = JSON.parse(dataStr) as string;
              if (typeof token === "string") {
                assistantContent += token;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                  messagesRef.current = updated;
                  return updated;
                });
              }
            } catch {
              // Fallback: treat as raw string if not valid JSON
              assistantContent += dataStr;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: "assistant", content: assistantContent };
                messagesRef.current = updated;
                return updated;
              });
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // User cancelled — keep whatever was streamed so far
        } else {
          const msg = err instanceof Error ? err.message : "Failed to generate response";
          setError(msg);
          // Remove the empty assistant placeholder on error
          setMessages((prev) => {
            const updated = prev.filter((_, i) => !(i === prev.length - 1 && prev[i].role === "assistant" && !prev[i].content));
            messagesRef.current = updated;
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
    setError(null);
  }, [stopStreaming, updateMessages]);

  return { messages, sendMessage, isStreaming, error, clearMessages, stopStreaming };
}
