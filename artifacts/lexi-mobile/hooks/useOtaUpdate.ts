import { useEffect, useState } from "react";
import * as Updates from "expo-updates";

export type OtaState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "upToDate" }
  | { status: "available" }
  | { status: "downloading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export function useOtaUpdate() {
  const [state, setState] = useState<OtaState>({ status: "idle" });

  const checkForUpdate = async () => {
    if (__DEV__) {
      setState({ status: "upToDate" });
      return;
    }
    setState({ status: "checking" });
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setState({ status: "available" });
      } else {
        setState({ status: "upToDate" });
      }
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Update check failed" });
    }
  };

  const downloadAndApply = async () => {
    setState({ status: "downloading" });
    try {
      await Updates.fetchUpdateAsync();
      setState({ status: "ready" });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Download failed" });
    }
  };

  const applyNow = async () => {
    await Updates.reloadAsync();
  };

  useEffect(() => {
    const timer = setTimeout(() => checkForUpdate(), 3000);
    return () => clearTimeout(timer);
  }, []);

  return { state, checkForUpdate, downloadAndApply, applyNow };
}
