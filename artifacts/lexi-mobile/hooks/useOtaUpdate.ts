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
      return false;
    }
    setState({ status: "checking" });
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setState({ status: "available" });
        return true;
      } else {
        setState({ status: "upToDate" });
        return false;
      }
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Update check failed" });
      return false;
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

  /** One-shot: check → if available download → mark ready (user then taps Restart) */
  const checkAndApply = async () => {
    const available = await checkForUpdate();
    if (available) {
      await downloadAndApply();
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => checkForUpdate(), 3000);
    return () => clearTimeout(timer);
  }, []);

  return { state, checkForUpdate, downloadAndApply, applyNow, checkAndApply };
}
