import { useCallback, useEffect, useState } from "react";
import {
  clearSelfPatches,
  createSelfPatch,
  deleteSelfPatch as apiDelete,
  listSelfPatches,
} from "@/lib/lexi-api";

export interface LexiExtension {
  name: string;
  description: string;
  loadedAt?: string;
  language?: string;
  source?: string;
}

export function useLexiSelfPatch() {
  const [extensions, setExtensions] = useState<LexiExtension[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const reload = useCallback(async () => {
    const list = await listSelfPatches();
    setExtensions(list);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const fuseCode = useCallback(async (name: string, code: string, description?: string) => {
    setIsLoading(true);
    try {
      const ok = await createSelfPatch(name, code, description);
      if (ok) await reload();
      return ok;
    } finally {
      setIsLoading(false);
    }
  }, [reload]);

  const deleteExtension = useCallback(async (slug: string) => {
    const ok = await apiDelete(slug);
    if (ok) setExtensions((p) => p.filter((e) => e.name !== slug));
    return ok;
  }, []);

  const clearExtensions = useCallback(async () => {
    await clearSelfPatches();
    setExtensions([]);
  }, []);

  const getExtensionsPrompt = useCallback(() => {
    if (extensions.length === 0) return "";
    const list = extensions.map((e) => `  • ${e.name}: ${e.description || "(no description)"}`).join("\n");
    return `=== LEXI PERMANENT EXTENSIONS (${extensions.length} loaded) ===\nYou have fused the following capabilities permanently into yourself:\n${list}\nThese are active now — you may call them in your responses.`;
  }, [extensions]);

  return { extensions, isLoading, fuseCode, deleteExtension, clearExtensions, reloadExtensions: reload, getExtensionsPrompt };
}
