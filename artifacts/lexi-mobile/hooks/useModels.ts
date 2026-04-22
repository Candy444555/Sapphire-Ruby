import { useEffect, useState } from "react";
import { listModels, type ModelInfo } from "@/lib/lexi-api";

export function useModels() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let alive = true;
    listModels()
      .then((m) => { if (alive) setModels(m); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e : new Error(String(e))); })
      .finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; };
  }, []);

  return { models, isLoading, error };
}
