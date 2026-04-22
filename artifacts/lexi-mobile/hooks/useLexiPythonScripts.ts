import { useCallback, useEffect, useState } from "react";
import {
  clearPythonScripts,
  deletePythonScript as apiDelete,
  listPythonScripts,
} from "@/lib/lexi-api";

export interface PythonScript {
  slug: string;
  description: string;
  filePath: string;
  addedAt: string;
}

export function useLexiPythonScripts() {
  const [scripts, setScripts] = useState<PythonScript[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await listPythonScripts();
      setScripts(list);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const deleteScript = useCallback(async (slug: string) => {
    const ok = await apiDelete(slug);
    if (ok) setScripts((p) => p.filter((s) => s.slug !== slug));
    return ok;
  }, []);

  const clearScripts = useCallback(async () => {
    await clearPythonScripts();
    setScripts([]);
  }, []);

  const getPythonPrompt = useCallback(() => {
    if (scripts.length === 0) return "";
    const list = scripts.map((s) => `  • python3 ${s.filePath} — ${s.description}`).join("\n");
    return `=== LEXI FUSED PYTHON SCRIPTS (${scripts.length} scripts on disk) ===\nYou have these Python scripts permanently stored. Run them any time with <cmd>python3 PATH ARGS</cmd>:\n${list}`;
  }, [scripts]);

  return { scripts, isLoading, deleteScript, clearScripts, reloadScripts: reload, getPythonPrompt };
}
