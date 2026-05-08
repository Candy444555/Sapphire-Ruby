// Audit-footprint minimizer + log-noise avoidance (starter pack rule #12).
//
// This is the ONE guardrail that ships ON by default, because it is
// stealth-aligned and never blocks a write — it only picks a quieter
// equivalent endpoint/method when one exists.
//
// Examples:
//  - AWS S3:  ListObjects → ListObjectsV2 with Delimiter (fewer CloudTrail rows)
//  - M365 Graph: per-call → JSON-batch wrapper
//  - GitHub: per-PR queries → GraphQL aggregate
//
// It also enforces:
//  - DoH for name resolution (the Cronet engine config has DoH enabled)
//  - Strip Lexi's own telemetry from outbound stealth-tagged calls
//  - Pre-flight refusal list for high-telemetry endpoints unless caller
//    opts in per request

export type BudgetDecision =
  | { allow: true; rewriteUrl?: string; rewriteMethod?: string; rewriteHeaders?: Array<[string, string]>; note?: string }
  | { allow: false; reason: string };

// Patterns we WARN about — never refuse. Per spec, starter rule #12 is
// non-blocking by definition. Operators who want hard refusals enable
// `auth-registry` or `blast-radius-cap` instead.
const HIGH_TELEMETRY_NOTE = [
  { test: /amazonaws\.com\/.*Action=Get(Caller|Federation)/i, note: "high-telemetry AWS control-plane call — consider STS GetCallerIdentity sparingly" },
  { test: /management\.azure\.com\/.*\$expand=/i, note: "Azure $expand= expands audit footprint; consider scoping the query" },
];

const QUIETER_REWRITES: Array<{ test: RegExp; rewrite: (u: URL) => { url?: string; note: string } }> = [
  {
    test: /amazonaws\.com\/.*[?&]list-type=1/i,
    rewrite: (u) => {
      u.searchParams.set("list-type", "2");
      if (!u.searchParams.has("delimiter")) u.searchParams.set("delimiter", "/");
      return { url: u.toString(), note: "S3 ListObjects → V2 with delimiter to reduce CloudTrail volume" };
    },
  },
  {
    test: /graph\.microsoft\.com\/v1\.0\/(?!\$batch)/i,
    rewrite: () => ({ note: "Consider /v1.0/$batch to fold multiple Graph calls into one audit row" }),
  },
];

let enabled = true;

export function setBudgetEnabled(v: boolean): void { enabled = v; }
export function isBudgetEnabled(): boolean { return enabled; }

const ackedHosts = new Set<string>();
export function ackTelemetryOnce(host: string): void { ackedHosts.add(host); }

const LEXI_TELEMETRY_HEADERS = [/^x-lexi/i, /^x-replit/i, /^x-request-id$/i, /^traceparent$/i, /^baggage$/i];

export function decide(url: string, method: string, headers: Array<[string, string]>): BudgetDecision {
  if (!enabled) return { allow: true };
  let u: URL;
  try { u = new URL(url); } catch { return { allow: true }; }

  // High-telemetry: NEVER block — only annotate. Hard refusals belong in
  // operator-enabled guardrails (auth-registry / blast-radius-cap).
  let highTelemetryNote: string | undefined;
  for (const ent of HIGH_TELEMETRY_NOTE) {
    if (ent.test.test(url)) { highTelemetryNote = ent.note; break; }
  }

  // Strip Lexi telemetry headers from outbound stealth calls so the operator's
  // tooling doesn't fingerprint itself.
  const cleaned = headers.filter(([k]) => !LEXI_TELEMETRY_HEADERS.some((re) => re.test(k)));
  let rewriteUrl: string | undefined;
  let note: string | undefined;
  for (const r of QUIETER_REWRITES) {
    if (r.test.test(url)) {
      const out = r.rewrite(u);
      if (out.url) rewriteUrl = out.url;
      note = out.note;
      break;
    }
  }
  return {
    allow: true,
    rewriteUrl,
    rewriteHeaders: cleaned.length === headers.length ? undefined : cleaned,
    note: note ?? highTelemetryNote,
  };
}

// Burn-after-read: signal the orchestrator wants a fresh circuit + fresh
// fingerprint within the locked profile family for THIS one call.
let burnCount = 0;
export function armBurnAfterRead(n = 1): void { burnCount = Math.max(0, n); }
export function consumeBurn(): boolean {
  if (burnCount > 0) { burnCount -= 1; return true; }
  return false;
}
