// Captures every unhandled JS error and promise rejection.
//
// All writes go through the structured logger (`@/lib/logger`) — that is the
// single source of truth for log lines in this app. Helpers below are thin
// views over the logger's in-memory ring buffer so existing screens
// (DebugErrorOverlay, ErrorFallback) keep working without their own list.

import {
  getRecentEntries,
  log as structured,
  subscribeLogs,
  type LogEntry,
} from "@/lib/logger";

export type Entry = { time: number; kind: "error" | "rejection" | "fatal"; message: string; stack?: string };

function entryFromLog(e: LogEntry): Entry | null {
  if (e.category !== "global") return null;
  const kind = (e.action as Entry["kind"]) ?? "error";
  if (kind !== "error" && kind !== "rejection" && kind !== "fatal") return null;
  return {
    time: e.ts,
    kind,
    message: e.error?.message ?? "(no message)",
    stack: e.error?.stack,
  };
}

export function pushGlobalError(kind: Entry["kind"], err: unknown) {
  structured.error("global", kind, {
    actor: "system",
    target: "globalThis",
    error: err,
    status: kind,
  });
}

export function getGlobalErrors(): Entry[] {
  const out: Entry[] = [];
  for (const e of getRecentEntries()) {
    const m = entryFromLog(e);
    if (m) out.push(m);
  }
  return out.slice(-50);
}

export function subscribeGlobalErrors(fn: () => void): () => void {
  return subscribeLogs((e) => {
    if (entryFromLog(e)) fn();
  });
}

let installed = false;
export function installGlobalErrorHandlers() {
  if (installed) return;
  installed = true;

  // React Native's ErrorUtils — captures unhandled JS exceptions including
  // those that fire during module init / startup before ErrorBoundary mounts.
  try {
    const EU: any = (globalThis as any).ErrorUtils;
    if (EU && typeof EU.setGlobalHandler === "function") {
      const prev = typeof EU.getGlobalHandler === "function" ? EU.getGlobalHandler() : null;
      EU.setGlobalHandler((err: unknown, isFatal?: boolean) => {
        pushGlobalError(isFatal ? "fatal" : "error", err);
        if (typeof prev === "function") {
          try { prev(err, isFatal); } catch {}
        }
      });
    }
  } catch {}

  // Unhandled promise rejections.
  try {
    const tracking: any = (globalThis as any).HermesInternal?.enablePromiseRejectionTracker;
    if (typeof tracking === "function") {
      tracking({
        allRejections: true,
        onUnhandled: (_id: number, err: unknown) => pushGlobalError("rejection", err),
      });
    }
  } catch {}

  // Browser-style fallback (also fires under react-native-web).
  try {
    if (typeof (globalThis as any).addEventListener === "function") {
      (globalThis as any).addEventListener("unhandledrejection", (ev: any) => {
        pushGlobalError("rejection", ev?.reason ?? ev);
      });
      (globalThis as any).addEventListener("error", (ev: any) => {
        pushGlobalError("error", ev?.error ?? ev?.message ?? ev);
      });
    }
  } catch {}
}

export function formatGlobalErrors(): string {
  const list = getGlobalErrors();
  if (list.length === 0) return "No global errors captured.";
  return list
    .map((e, i) => {
      const d = new Date(e.time).toISOString().slice(11, 19);
      return `#${i + 1} [${d}] ${e.kind.toUpperCase()}: ${e.message}${e.stack ? `\n${e.stack}` : ""}`;
    })
    .join("\n\n----------------------------------------\n\n");
}
