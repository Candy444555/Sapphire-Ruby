// Operator-eyes debug drawer log buffer.
//
// All telemetry suppression (`budget.ts` strips Lexi headers from outbound
// stealth-tagged calls) does NOT apply to this buffer. The operator gets
// total visibility on their side: real IP, every request, every response,
// every backend switch, every guardrail hit (and what it would have done
// even when disabled).

export type OpsEvent = {
  id: string;
  ts: number;
  kind:
    | "request"
    | "response"
    | "backend-switch"
    | "guardrail"
    | "guardrail-shadow" // would-have-triggered
    | "tor"
    | "fingerprint"
    | "engine"
    | "info"
    | "error";
  title: string;
  detail?: Record<string, unknown>;
};

let buffer: OpsEvent[] = [];
const MAX = 1000;
const subs = new Set<(e: OpsEvent) => void>();

export function pushOpsEvent(kind: OpsEvent["kind"], title: string, detail?: Record<string, unknown>): OpsEvent {
  const e: OpsEvent = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ts: Date.now(), kind, title, detail };
  buffer.push(e);
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
  for (const fn of subs) try { fn(e); } catch {}
  return e;
}

export function getOpsBuffer(): OpsEvent[] {
  return buffer.slice();
}

export function subscribeOps(fn: (e: OpsEvent) => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function clearOpsBuffer(): void { buffer = []; }
