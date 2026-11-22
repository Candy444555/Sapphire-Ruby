import { useCallback, useEffect, useState } from "react";

import {
  cancelLocalModelDownload,
  ensureLocalModelDownloaded,
  getLocalModelState,
  subscribeLocalModelState,
  type LocalModelState,
} from "@/lib/local-agent-model";

export function useLocalAgentModel() {
  const [state, setState] = useState<LocalModelState>(getLocalModelState);

  useEffect(
    () => subscribeLocalModelState((next) => setState({ ...next })),
    [],
  );

  const retry = useCallback(async () => {
    try {
      await ensureLocalModelDownloaded();
    } catch {
      // The shared state contains the message shown in the UI.
    }
  }, []);

  const cancel = useCallback(async () => {
    try {
      await cancelLocalModelDownload();
    } catch {
      // The shared state contains the error shown in the status card.
    }
  }, []);

  return { state, retry, cancel };
}
