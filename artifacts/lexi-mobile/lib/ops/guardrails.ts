// Operator-defined guardrail engine.
//
// Ships with the engine wired and ZERO rules registered. The operator writes
// rules in the Guardrails tab — either in plain English (parsed in
// `starter-pack.ts` and the UI), or as raw TS predicates pasted in. Every
// write-capable primitive in `lib/ops/actions.ts` calls `runGuards(action)`
// before executing.
//
// The contract is intentionally minimal so an operator can read it in one
// sitting:
//
//   registerGuard({ name, predicate, action })
//   listGuards() / disableGuard(name) / enableGuard(name) / removeGuard(name)
//   runGuards(actionDescriptor) → GuardOutcome
//
// `predicate` returns true when the guard "matches" the about-to-execute
// action; `action` controls what happens when it matches. `transform` lets
// a guard rewrite the payload (e.g. "if it's a delete, change to a soft-
// delete by setting deleted_at instead").

import { pushOpsEvent } from "@/lib/stealth/operator-eyes";

export type ActionDescriptor = {
  kind: "http" | "graphql" | "cloud" | "saas" | "web-form";
  target: string;        // hostname or service id
  url: string;
  method: string;        // GET/POST/PUT/PATCH/DELETE
  payload?: unknown;
  estimatedBlastRadius?: "single" | "few" | "many" | "wide";
  // Free-form labels the operator's rules can read.
  tags?: Record<string, string>;
};

export type GuardActionKind = "block" | "confirm" | "dry-run-only" | "log" | "transform";

export type GuardActionResult =
  | { kind: "block"; reason: string }
  | { kind: "confirm"; prompt: string }
  | { kind: "dry-run-only"; reason: string }
  | { kind: "log"; note: string }
  | { kind: "transform"; rewritten: ActionDescriptor; note: string };

export type GuardPredicate = (a: ActionDescriptor) => boolean | Promise<boolean>;
export type GuardAction = (a: ActionDescriptor) => GuardActionResult | Promise<GuardActionResult>;

export type Guard = {
  name: string;
  description?: string;
  source: "plain-english" | "raw-ts" | "starter-pack";
  enabled: boolean;
  predicate: GuardPredicate;
  action: GuardAction;
};

export type GuardOutcome =
  | { decision: "allow"; events: GuardActionResult[]; rewritten: ActionDescriptor }
  | { decision: "block"; reason: string; events: GuardActionResult[] }
  | { decision: "confirm"; prompts: string[]; events: GuardActionResult[]; rewritten: ActionDescriptor }
  | { decision: "dry-run-only"; reasons: string[]; events: GuardActionResult[]; rewritten: ActionDescriptor };

const guards = new Map<string, Guard>();

export function registerGuard(g: Guard): void {
  guards.set(g.name, g);
  pushOpsEvent("guardrail", `registered guard "${g.name}"`, { source: g.source });
}

export function listGuards(): Guard[] {
  return Array.from(guards.values());
}

export function disableGuard(name: string): void {
  const g = guards.get(name); if (g) { g.enabled = false; }
}

export function enableGuard(name: string): void {
  const g = guards.get(name); if (g) { g.enabled = true; }
}

export function removeGuard(name: string): void {
  guards.delete(name);
}

export function clearGuards(): void { guards.clear(); }

export async function runGuards(a: ActionDescriptor): Promise<GuardOutcome> {
  const events: GuardActionResult[] = [];
  let rewritten = a;
  let confirmPrompts: string[] = [];
  let dryRunReasons: string[] = [];
  for (const g of guards.values()) {
    let matched = false;
    try { matched = !!(await g.predicate(rewritten)); } catch (e) {
      pushOpsEvent("guardrail", `guard "${g.name}" predicate threw`, { error: String(e) });
      continue;
    }
    if (!matched) {
      // Shadow log so the operator sees what would have triggered if enabled.
      if (!g.enabled) pushOpsEvent("guardrail-shadow", `"${g.name}" did not match`, { target: rewritten.target });
      continue;
    }
    if (!g.enabled) {
      pushOpsEvent("guardrail-shadow", `"${g.name}" would have triggered`, { target: rewritten.target, method: rewritten.method, url: rewritten.url });
      continue;
    }
    let result: GuardActionResult;
    try { result = await g.action(rewritten); } catch (e) {
      pushOpsEvent("guardrail", `guard "${g.name}" action threw`, { error: String(e) });
      continue;
    }
    events.push(result);
    pushOpsEvent("guardrail", `"${g.name}" → ${result.kind}`, { result });
    switch (result.kind) {
      case "block":
        return { decision: "block", reason: result.reason, events };
      case "confirm":
        confirmPrompts.push(result.prompt);
        break;
      case "dry-run-only":
        dryRunReasons.push(result.reason);
        break;
      case "log":
        break;
      case "transform":
        rewritten = result.rewritten;
        break;
    }
  }
  if (dryRunReasons.length) return { decision: "dry-run-only", reasons: dryRunReasons, events, rewritten };
  if (confirmPrompts.length) return { decision: "confirm", prompts: confirmPrompts, events, rewritten };
  return { decision: "allow", events, rewritten };
}
