// Per-finding contract: every scanner — built-in, server, on-phone, or
// forged — flows its findings through this normalizer. Guarantees:
//   1. Each finding is logged via lib/logger so it shows up in the Logs tab.
//   2. Each finding can be passed unchanged to the Fix and Reproduce
//      buttons, which call /api/scan/explain.
//
// The Fix and Reproduce calls themselves never execute or weaponize the
// finding; explain.js produces description-only output (#20 contract).

import { log, type LogLevel } from "@/lib/logger";
import { getApiUrl } from "@/lib/lexi-api";

export type ExplainMode = "fix" | "reproduce";

export type Severity = "critical" | "high" | "medium" | "moderate" | "low" | "info" | "warn" | "warning";

export type RawFinding = {
  id?: string;
  rule?: string;
  severity?: string;
  title?: string;
  message?: string;
  description?: string;
  module?: string;
  file?: string;
  line?: number;
  url?: string;
  reference?: string;
  why?: string;
  summary?: string;
  [k: string]: unknown;
};

export type NormalizedFinding = {
  uid: string;            // unique per-tool finding id used as React key
  tool: string;           // scanner id, e.g. "semgrep", "bandit", "ai-review", or forged slug
  id: string;             // rule id within the tool
  severity: Severity;
  title: string;
  module: string;         // path:line when known
  url?: string;
  raw: RawFinding;
};

export function normalizeSeverity(s: string | undefined): Severity {
  const v = (s ?? "").toLowerCase();
  if (v === "critical" || v === "fatal") return "critical";
  if (v === "high" || v === "error") return "high";
  if (v === "medium" || v === "moderate" || v === "warning" || v === "warn") return "medium";
  if (v === "low") return "low";
  return "info";
}

function sevToLevel(s: Severity): LogLevel {
  if (s === "critical" || s === "high") return "error";
  if (s === "medium" || s === "moderate" || s === "warn" || s === "warning") return "warn";
  return "info";
}

let _seq = 0;
function nextUid(): string {
  _seq++;
  return `${Date.now().toString(36)}-${_seq.toString(36)}`;
}

export function normalizeFinding(tool: string, raw: RawFinding, correlationId?: string): NormalizedFinding {
  const id = String(raw.id || raw.rule || "unknown");
  const severity = normalizeSeverity(raw.severity);
  const title = String(raw.title || raw.message || raw.summary || raw.description || id);
  const module = String(raw.module || (raw.file ? `${raw.file}${raw.line != null ? `:${raw.line}` : ""}` : ""));
  const url = raw.url ? String(raw.url) : raw.reference ? String(raw.reference) : undefined;
  const norm: NormalizedFinding = { uid: nextUid(), tool, id, severity, title, module, url, raw };
  // Emit a `scan/finding` log entry that the Logs tab's existing Fix/Reproduce
  // row picks up (see logs.tsx → isFinding check).
  log[sevToLevel(severity)]("scan", "finding", {
    actor: `scanner:${tool}` as const,
    target: module || `${tool}:${id}`,
    correlationId,
    outputs: {
      id, severity, title, module, url,
      message: title, description: raw.description, why: raw.why,
    },
  });
  return norm;
}

export async function* streamExplain(
  finding: NormalizedFinding,
  mode: ExplainMode,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const url = getApiUrl("/api/scan/explain");
  log.info("scan", "explain:start", {
    actor: `scanner:${finding.tool}` as const,
    target: finding.module || finding.tool,
    inputs: { mode, rule: finding.id },
  });
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finding, mode }),
      signal,
    });
  } catch (err) {
    yield `\n[error] Could not reach server: ${err instanceof Error ? err.message : String(err)}\n`;
    yield "\n(Tip: set the Server URL in Profile so explanations can be generated.)\n";
    return;
  }
  if (!res.ok || !res.body) {
    yield `\n[error] Server returned HTTP ${res.status}\n`;
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield dec.decode(value, { stream: true });
  }
  log.info("scan", "explain:end", {
    actor: `scanner:${finding.tool}` as const,
    target: finding.module || finding.tool,
    inputs: { mode },
  });
}

export function buildExplainPrompt(f: NormalizedFinding, mode: ExplainMode): string {
  return [
    `Static-analysis finding (mode: ${mode}):`,
    `- tool: ${f.tool}`,
    `- id: ${f.id}`,
    `- severity: ${f.severity}`,
    `- module: ${f.module || "(unknown)"}`,
    `- title: ${f.title}`,
    `- url: ${f.url || "(none)"}`,
    "",
    mode === "fix"
      ? "Show me the concrete patch for this finding."
      : "Show me a faithful, self-contained reproduction of this finding on paper. Do not instruct me to run anything.",
  ].join("\n");
}

export const FIX_SYSTEM_PROMPT =
  "You are Lexi, a senior security and code-quality engineer. The user shows you exactly one static-analysis finding. Reply with concise GitHub-flavored Markdown containing exactly three short sections in order:\n" +
  "1. **Root cause** — one short paragraph explaining why the finding is real.\n" +
  "2. **Patch** — a single fenced code block with the corrected code or config.\n" +
  "3. **Why this works** — one sentence.\n" +
  "Do not propose running anything; only show the patch.";

export const REPRO_SYSTEM_PROMPT =
  "You are Lexi, a senior security and code-quality engineer. The user shows you exactly one static-analysis finding. Produce a self-contained, copy-pasteable reproduction that demonstrates the bug or vulnerability ON PAPER ONLY — never instruct the user to execute anything.\n" +
  "Reply with concise Markdown containing exactly three sections in order:\n" +
  "1. **Setup** — one short paragraph naming the file/function/payload involved.\n" +
  "2. **Reproduction** — a single fenced code block with the minimal vulnerable code, including any sample input or payload as literals or comments.\n" +
  "3. **Broken output** — a fenced block showing the resulting error, leaked data, or incorrect behavior the snippet would produce.\n" +
  "Do NOT include shell commands, build steps, or any instruction to run the snippet.";

