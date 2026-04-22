import { useState, useCallback, useEffect, useRef } from "react";
import { storage, randomId } from "@/lib/storage";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/system-prompts";

export type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
};

const CONVERSATIONS_KEY = "lexi_conversations";
const ACTIVE_ID_KEY = "lexi_active_conversation";

function generateTitle(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.content ?? "";
  const trimmed = first.trim().slice(0, 50);
  return trimmed.length < first.trim().length ? trimmed + "…" : trimmed || "New Chat";
}

export function useConversations(defaultModel: string) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const skipSaveRef = useRef(true);

  useEffect(() => {
    (async () => {
      const loaded = await storage.getJSON<Conversation[]>(CONVERSATIONS_KEY, []);
      const stored = await storage.getString(ACTIVE_ID_KEY, "");
      setConversations(Array.isArray(loaded) ? loaded : []);
      const initialId = stored && loaded.find((c) => c.id === stored) ? stored : (loaded[0]?.id ?? "");
      setActiveId(initialId);
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipSaveRef.current) { skipSaveRef.current = false; return; }
    storage.setJSON(CONVERSATIONS_KEY, conversations);
  }, [conversations, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    storage.setString(ACTIVE_ID_KEY, activeId);
  }, [activeId, hydrated]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  const createConversation = useCallback(
    (model?: string, systemPrompt?: string): Conversation => {
      const newConvo: Conversation = {
        id: randomId(),
        title: "New Chat",
        messages: [],
        model: model ?? defaultModel,
        systemPrompt: systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setConversations((prev) => [newConvo, ...prev]);
      setActiveId(newConvo.id);
      return newConvo;
    },
    [defaultModel],
  );

  const updateConversation = useCallback(
    (id: string, updates: Partial<Omit<Conversation, "id" | "createdAt">>) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const merged = { ...c, ...updates, updatedAt: Date.now() };
          if (updates.messages && merged.title === "New Chat" && updates.messages.length > 0) {
            merged.title = generateTitle(updates.messages);
          }
          return merged;
        }),
      );
    },
    [],
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => {
        const next = prev.filter((c) => c.id !== id);
        if (id === activeId) setActiveId(next[0]?.id ?? "");
        return next;
      });
    },
    [activeId],
  );

  const selectConversation = useCallback((id: string) => setActiveId(id), []);

  return {
    conversations,
    activeConversation,
    activeId,
    hydrated,
    createConversation,
    updateConversation,
    deleteConversation,
    selectConversation,
  };
}
