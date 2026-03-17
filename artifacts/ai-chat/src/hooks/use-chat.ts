import { useState, useRef, useCallback } from "react";
import type { ChatMessage, ChatRequest } from "@workspace/api-client-react/src/generated/api.schemas";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Ref to hold the AbortController for cancelling streams
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string, model: string, systemPrompt?: string) => {
    if (!content.trim() || !model) return;

    setError(null);
    setIsStreaming(true);

    const newMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(newMessages);

    // Add placeholder for assistant response
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // Initialize abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const requestBody: ChatRequest = {
        model,
        messages: newMessages,
        ...(systemPrompt ? { systemPrompt } : {})
      };

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error! status: ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let assistantContent = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Parse SSE format: segments separated by \n\n
          let newlineIdx;
          while ((newlineIdx = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 2);

            if (event.startsWith('data: ')) {
              const dataStr = event.slice(6);
              
              if (dataStr === '[DONE]') {
                break;
              }

              // Try parsing as JSON first (common standard), fallback to raw text
              try {
                const json = JSON.parse(dataStr);
                if (json.choices?.[0]?.delta?.content) {
                  assistantContent += json.choices[0].delta.content;
                } else if (typeof json === 'string') {
                  assistantContent += json;
                } else {
                  assistantContent += dataStr; // Unrecognized JSON structure
                }
              } catch {
                // If it's not JSON, it's a raw token string
                // Handle escaped newlines from raw string serialization
                let token = dataStr.replace(/\\n/g, '\n');
                // Remove wrapping quotes if present
                if (token.startsWith('"') && token.endsWith('"')) {
                  token = token.slice(1, -1);
                }
                assistantContent += token;
              }

              // Update the last message
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = { 
                  ...updated[updated.length - 1], 
                  content: assistantContent 
                };
                return updated;
              });
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log("Stream aborted by user");
      } else {
        console.error("Chat streaming error:", err);
        setError(err.message || "Failed to generate response.");
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [messages]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    stopStreaming();
    setMessages([]);
    setError(null);
  }, [stopStreaming]);

  return { 
    messages, 
    sendMessage, 
    isStreaming, 
    error, 
    clearMessages,
    stopStreaming
  };
}
