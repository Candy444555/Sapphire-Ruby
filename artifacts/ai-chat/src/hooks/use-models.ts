import { useListModels } from "@workspace/api-client-react";

export function useModels() {
  const { data, isLoading, error } = useListModels({
    query: {
      staleTime: 1000 * 60 * 60, // Cache for 1 hour
      retry: 2,
    }
  });

  return {
    models: data?.models || [],
    isLoading,
    error,
  };
}
