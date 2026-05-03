import { useState, useRef, useCallback, useEffect } from "react";
import { streamLexi, type ChatMsg, type ChatPathMode } from "@/lib/lexi-api";
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
  }, [stopStreaming, updateMessages]);

  return { messages, sendMessage, isStreaming, isRetrying, error, lastMode, clearMessages, stopStreaming };
}
