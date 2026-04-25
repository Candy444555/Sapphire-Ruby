import { useListModels } from "@workspace/api-client-react";
import type { ModelInfo } from "@workspace/api-client-react";

export function useModels() {
  const { data, isLoading, error } = useListModels({
    query: {
      queryKey: ["listModels"],
      staleTime: 1000 * 60 * 60, // Cache for 1 hour
      retry: 2,
    }
  });

  const models: ModelInfo[] = data?.models ?? [];

  return {
    models,
    isLoading,
    error,
  };
}
