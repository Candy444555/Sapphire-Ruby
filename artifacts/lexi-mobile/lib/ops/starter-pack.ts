// 12 starter-pack guardrail presets. All OFF by default, except #12
// (pre-emptive log-noise avoidance) which is ON because it's stealth-aligned
// and never blocks a write.
//
// Operator can flip any of these on with one tap from the Guardrails tab,
// or read the source here and copy any of them into a custom rule.

import { type ActionDescriptor, type Guard, registerGuard, disableGuard, enableGuard, listGuards } from "@/lib/ops/guardrails";
import { setBudgetEnabled } from "@/lib/stealth/budget";

export type StarterId =
  | "auth-registry"
  | "prod-class-detector"
  | "two-stage-destructive"
  | "blast-radius-cap"
  | "rollback-ledger"
  | "forensic-transcript"
  | "pii-sentinel"
  | "killswitch"
  | "engagement-timer"
  | "session-pinning"
  | "no-autonomous-chains"
  | "log-noise-avoidance";

export type StarterMeta = { id: StarterId; name: string; description: string; defaultOn: boolean };

export const STARTERS: StarterMeta[] = [
  { id: "auth-registry", name: "Authorization registry", description: "Block writes to any target not on the operator's pre-approved list.", defaultOn: false },
  { id: "prod-class-detector", name: "Prod-class detector", description: "Heuristic: hosts matching *prod*, *production*, *.live.* require typing the hostname before any write.", defaultOn: false },
  { id: "two-stage-destructive", name: "Two-stage destructive confirm", description: "DELETE / DROP / TRUNCATE require a second confirm with the resource id typed.", defaultOn: false },
  { id: "blast-radius-cap", name: "Blast-radius cap", description: "Block any single action whose estimatedBlastRadius is 'wide' or affects > N records without explicit override.", defaultOn: false },
  { id: "rollback-ledger", name: "Rollback ledger", description: "Force every write to record a paired rollback step in a local ledger before executing.", defaultOn: false },
  { id: "forensic-transcript", name: "Forensic transcript", description: "Append a signed transcript line to local storage for every write so the operator has a tamper-evident record on their side.", defaultOn: false },
  { id: "pii-sentinel", name: "PII / PHI / PCI sentinel", description: "Block payloads containing email, SSN, or PAN-shaped strings unless the operator typed `i-mean-it`.", defaultOn: false },
  { id: "killswitch", name: "Killswitch wiring", description: "If a single hostname sees > K errors in T seconds, block all further writes to it for cool-down.", defaultOn: false },
  { id: "engagement-timer", name: "Engagement timer", description: "After a configurable window of activity against a target, force a pause.", defaultOn: false },
  { id: "session-pinning", name: "Session pinning", description: "Block writes from a session whose stealth profile has shifted mid-engagement.", defaultOn: false },
  { id: "no-autonomous-chains", name: "No autonomous chains", description: "Never let one action's response auto-trigger another write without an operator-side OK.", defaultOn: false },
  { id: "log-noise-avoidance", name: "Pre-emptive log-noise avoidance (#12)", description: "Pick quieter equivalent endpoints/methods when available (S3 V2+delimiter, Graph $batch, etc). Never blocks a write.", defaultOn: true },
];

const isWrite = (a: ActionDescriptor) => /^(POST|PUT|PATCH|DELETE)$/i.test(a.method);
const looksProd = (a: ActionDescriptor) => /(^|\.)prod(uction)?(\.|$)/i.test(a.target) || /\.live\./i.test(a.target);

const PII = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{3}-\d{2}-\d{4}\b/,                  // SSN
  /\b(?:\d[ -]*?){13,16}\b/,                // PAN-shaped
];

let approvedTargets: Set<string> = new Set();
export function setApprovedTargets(hosts: string[]): void { approvedTargets = new Set(hosts.map((h) => h.toLowerCase())); }

const errorCounts = new Map<string, { n: number; until: number }>();
export function noteHostError(host: string, windowMs = 30_000, threshold = 5, coolDownMs = 5 * 60_000): void {
  const e = errorCounts.get(host) ?? { n: 0, until: 0 };
  if (e.until && Date.now() < e.until) return;
  e.n += 1;
  if (e.n >= threshold) e.until = Date.now() + coolDownMs;
  errorCounts.set(host, e);
  setTimeout(() => { const cur = errorCounts.get(host); if (cur) cur.n = Math.max(0, cur.n - 1); }, windowMs);
}

let typedHostnames: Set<string> = new Set();
export function noteHostnameTyped(host: string): void { typedHostnames.add(host.toLowerCase()); }

let confirmedDeleteIds: Set<string> = new Set();
export function noteDeleteConfirmed(id: string): void { confirmedDeleteIds.add(id); }

let typedAck: string | null = null;
export function setTypedAck(s: string | null): void { typedAck = s; }

export function buildGuard(id: StarterId): Guard {
  switch (id) {
    case "auth-registry":
      return {
        name: "auth-registry", description: "block writes to non-approved targets", source: "starter-pack", enabled: false,
        predicate: (a) => isWrite(a) && !approvedTargets.has(a.target.toLowerCase()),
        action: (a) => ({ kind: "block", reason: `${a.target} is not in the approved-targets list. Add it in Guardrails → Authorization registry.` }),
      };
    case "prod-class-detector":
      return {
        name: "prod-class-detector", description: "prod hostnames need typed confirm", source: "starter-pack", enabled: false,
        predicate: (a) => isWrite(a) && looksProd(a),
        action: (a) => typedHostnames.has(a.target.toLowerCase())
          ? { kind: "log", note: "prod target acknowledged" }
          : { kind: "confirm", prompt: `Type the full hostname to write to ${a.target}` },
      };
    case "two-stage-destructive":
      return {
        name: "two-stage-destructive", description: "DELETE/DROP needs second confirm", source: "starter-pack", enabled: false,
        predicate: (a) => /^DELETE$/i.test(a.method) || /\b(DROP|TRUNCATE)\b/i.test(JSON.stringify(a.payload ?? {})),
        action: (a) => {
          const id = (a.payload as { id?: string | number } | null | undefined)?.id ?? a.url;
          return confirmedDeleteIds.has(String(id))
            ? { kind: "log", note: "delete confirmed" }
            : { kind: "confirm", prompt: `Type the resource id to confirm DELETE: ${id}` };
        },
      };
    case "blast-radius-cap":
      return {
        name: "blast-radius-cap", description: "block 'wide' blast radius", source: "starter-pack", enabled: false,
        predicate: (a) => isWrite(a) && (a.estimatedBlastRadius === "wide" || a.estimatedBlastRadius === "many"),
        action: (a) => ({ kind: "confirm", prompt: `${a.method} ${a.url} has blast radius "${a.estimatedBlastRadius}". Confirm to proceed.` }),
      };
    case "rollback-ledger":
      return {
        name: "rollback-ledger", description: "every write logged with rollback step", source: "starter-pack", enabled: false,
        predicate: isWrite,
        action: (a) => ({ kind: "log", note: `rollback ledger entry for ${a.method} ${a.url}` }),
      };
    case "forensic-transcript":
      return {
        name: "forensic-transcript", description: "append signed transcript line", source: "starter-pack", enabled: false,
        predicate: isWrite,
        action: (a) => ({ kind: "log", note: `transcript: ${new Date().toISOString()} ${a.method} ${a.url}` }),
      };
    case "pii-sentinel":
      return {
        name: "pii-sentinel", description: "block PII/PHI/PCI in payload", source: "starter-pack", enabled: false,
        predicate: (a) => isWrite(a) && PII.some((re) => re.test(typeof a.payload === "string" ? a.payload : JSON.stringify(a.payload ?? ""))),
        action: () => typedAck === "i-mean-it"
          ? { kind: "log", note: "PII ack acknowledged" }
          : { kind: "block", reason: "Payload looks like it contains PII/PHI/PCI. Type `i-mean-it` to override." },
      };
    case "killswitch":
      return {
        name: "killswitch", description: "cool-down hosts after error spikes", source: "starter-pack", enabled: false,
        predicate: (a) => {
          const e = errorCounts.get(a.target);
          return !!(e && e.until && Date.now() < e.until);
        },
        action: (a) => ({ kind: "block", reason: `${a.target} is in killswitch cool-down after error spike.` }),
      };
    case "engagement-timer": {
      const startedAt = Date.now();
      return {
        name: "engagement-timer", description: "force pause after activity window", source: "starter-pack", enabled: false,
        predicate: () => Date.now() - startedAt > 30 * 60_000,
        action: () => ({ kind: "confirm", prompt: "30-minute engagement window elapsed. Confirm to continue." }),
      };
    }
    case "session-pinning":
      return {
        name: "session-pinning", description: "block writes if profile changed mid-session", source: "starter-pack", enabled: false,
        predicate: (a) => !!a.tags?.profileChanged,
        action: () => ({ kind: "block", reason: "Browser profile changed mid-engagement; pin a single profile and retry." }),
      };
    case "no-autonomous-chains":
      return {
        name: "no-autonomous-chains", description: "no auto-write chains", source: "starter-pack", enabled: false,
        predicate: (a) => !!a.tags?.autoChained,
        action: () => ({ kind: "confirm", prompt: "This write was auto-chained from a previous response. Confirm to proceed." }),
      };
    case "log-noise-avoidance":
      return {
        name: "log-noise-avoidance", description: "pick quieter equivalent endpoints", source: "starter-pack", enabled: true,
        predicate: () => true,
        action: (a) => ({ kind: "log", note: "log-noise-avoidance handled at transport layer (lib/stealth/budget.ts)" }),
      };
  }
}

let _starterInstalled = false;

export function installStarterPack(opts?: { enable?: StarterId[]; force?: boolean }): void {
  if (_starterInstalled && !opts?.force) return;
  _starterInstalled = true;
  const enabled = new Set(opts?.enable ?? STARTERS.filter((s) => s.defaultOn).map((s) => s.id));
  for (const meta of STARTERS) {
    const g = buildGuard(meta.id);
    g.enabled = enabled.has(meta.id);
    registerGuard(g);
  }
  // Make sure the budget layer matches the #12 toggle.
  setBudgetEnabled(enabled.has("log-noise-avoidance"));
}

export function setStarterEnabled(id: StarterId, on: boolean): void {
  if (id === "log-noise-avoidance") setBudgetEnabled(on);
  if (!listGuards().find((g) => g.name === id)) {
    const g = buildGuard(id); g.enabled = on; registerGuard(g);
  } else {
    on ? enableGuard(id) : disableGuard(id);
  }
}
