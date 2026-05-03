// Captures every unhandled JS error and promise rejection so we can paint
// them to the user's screen — Android release APKs hide this from us
// otherwise and "stuck on splash" gives no actionable signal.

type Entry = { time: number; kind: "error" | "rejection" | "fatal"; message: string; stack?: string };

const log: Entry[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) {
    try { fn(); } catch {}
  }
}

export function pushGlobalError(kind: Entry["kind"], err: unknown) {
  const e: Entry = {
    time: Date.now(),
    kind,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  };
  log.push(e);
  if (log.length > 50) log.shift();
  notify();
}

export function getGlobalErrors(): Entry[] {
  return log.slice();
}

export function subscribeGlobalErrors(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
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
  if (log.length === 0) return "No global errors captured.";
  return log
    .map((e, i) => {
      const d = new Date(e.time).toISOString().slice(11, 19);
      return `#${i + 1} [${d}] ${e.kind.toUpperCase()}: ${e.message}${e.stack ? `\n${e.stack}` : ""}`;
    })
    .join("\n\n----------------------------------------\n\n");
}
