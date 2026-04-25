import { useState, useEffect, useCallback } from "react";

export interface LexiExtension {
  name: string;
  description: string;
  loadedAt: string;
  language?: string;
  source?: string;
}

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

export function useLexiSelfPatch() {
  const [extensions, setExtensions] = useState<LexiExtension[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load the extensions file dynamically and register a listener
  const loadExtensionsFile = useCallback(() => {
    // Remove old tag if present to force reload
    const oldTag = document.getElementById("lexi-extensions-script");
    if (oldTag) oldTag.remove();

    // Callback hook for when extensions register themselves
    (window as unknown as Record<string, unknown>).__lexiExtensionLoaded = (_name: string) => {
      const registry = (window as unknown as Record<string, unknown>).LexiExtensions as
        | Record<string, LexiExtension>
        | undefined;
      if (registry) {
        setExtensions(Object.values(registry));
      }
    };

    const script = document.createElement("script");
    script.id = "lexi-extensions-script";
    script.src = `${import.meta.env.BASE_URL}lexi-extensions.js?t=${Date.now()}`;
    script.async = true;
    script.onload = () => {
      const registry = (window as unknown as Record<string, unknown>).LexiExtensions as
        | Record<string, LexiExtension>
        | undefined;
      if (registry) setExtensions(Object.values(registry));
    };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    loadExtensionsFile();
  }, [loadExtensionsFile]);

  // Push a new extension to the server and reload
  const fuseCode = useCallback(
    async (name: string, code: string, description?: string): Promise<boolean> => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/self-patch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, code, description }),
        });
        if (!res.ok) return false;
        // Reload the extensions file so the new code runs in-browser right now
        setTimeout(() => loadExtensionsFile(), 300);
        return true;
      } catch {
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [loadExtensionsFile]
  );

  // Remove a single extension by slug
  const deleteExtension = useCallback(async (slug: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/self-patch/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!res.ok) return false;
      // Remove from window registry immediately
      const registry = (window as unknown as Record<string, unknown>).LexiExtensions as Record<string, unknown> | undefined;
      if (registry) delete registry[slug];
      setExtensions((prev) => prev.filter((e) => e.name !== slug));
      setTimeout(() => loadExtensionsFile(), 300);
      return true;
    } catch {
      return false;
    }
  }, [loadExtensionsFile]);

  // Wipe all extensions
  const clearExtensions = useCallback(async () => {
    await fetch(`${API_BASE}/self-patch`, { method: "DELETE" });
    // Remove the loaded extensions from window too
    delete (window as unknown as Record<string, unknown>).LexiExtensions;
    setExtensions([]);
    setTimeout(() => loadExtensionsFile(), 300);
  }, [loadExtensionsFile]);

  // Build a system-prompt section describing currently loaded extensions
  const getExtensionsPrompt = useCallback((): string => {
    if (extensions.length === 0) return "";
    const list = extensions
      .map((e) => `  • ${e.name}: ${e.description || "(no description)"}`)
      .join("\n");
    const codeMemory = (window as unknown as Record<string, unknown>).LexiCodeMemory as
      | Record<string, LexiExtension>
      | undefined;
    const codeList = codeMemory
      ? Object.values(codeMemory)
          .map((memory) => `  • ${memory.name} (${memory.language ?? "code"}): ${memory.description || "(no description)"}\n${memory.source ?? ""}`)
          .join("\n")
      : "";
    return `=== LEXI PERMANENT EXTENSIONS (${extensions.length} loaded) ===\nYou have fused the following capabilities permanently into yourself:\n${list}\nThese are active now — you may call them in your responses.${codeList ? `\n\n=== PERMANENT USER CODE MEMORY ===\nThe user has sent code that you automatically analyzed and incorporated permanently. Use this code as part of your own working memory when relevant:\n${codeList}` : ""}`;
  }, [extensions]);

  return {
    extensions,
    isLoading,
    fuseCode,
    deleteExtension,
    clearExtensions,
    reloadExtensions: loadExtensionsFile,
    getExtensionsPrompt,
  };
}
