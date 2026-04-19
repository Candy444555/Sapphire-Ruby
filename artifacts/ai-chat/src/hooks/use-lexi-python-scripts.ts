import { useState, useEffect, useCallback } from "react";

export interface PythonScript {
  slug: string;
  description: string;
  filePath: string;
  addedAt: string;
}

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") + "/api";

export function useLexiPythonScripts() {
  const [scripts, setScripts] = useState<PythonScript[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadScripts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/python-scripts`);
      if (!res.ok) return;
      const data = await res.json();
      setScripts(data.scripts ?? []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { loadScripts(); }, [loadScripts]);

  const deleteScript = useCallback(async (slug: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/python-scripts/${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!res.ok) return false;
      setScripts((prev) => prev.filter((s) => s.slug !== slug));
      return true;
    } catch { return false; }
  }, []);

  const clearScripts = useCallback(async () => {
    await fetch(`${API_BASE}/python-scripts`, { method: "DELETE" });
    setScripts([]);
  }, []);

  const getPythonPrompt = useCallback((): string => {
    if (scripts.length === 0) return "";
    const list = scripts.map((s) => `  • python3 ${s.filePath} — ${s.description}`).join("\n");
    return `=== LEXI FUSED PYTHON SCRIPTS (${scripts.length} scripts on disk) ===\nYou have these Python scripts permanently stored. Run them any time with <cmd>python3 PATH ARGS</cmd>:\n${list}`;
  }, [scripts]);

  return { scripts, isLoading, deleteScript, clearScripts, reloadScripts: loadScripts, getPythonPrompt };
}
