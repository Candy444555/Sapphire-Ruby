// On-phone scanners. These run inside the React Native runtime so the
// operator can scan a file or screen-capture without a server URL set.
//
// Currently shipped:
//   - regex-secrets: regex-based secret/key detection
//   - ai-review: direct Featherless call (no server proxy)
//   - eslint: heuristic JS/TS lint (regex-based subset, since real ESLint
//     can't run on RN; full ESLint runs on server)
//
// Forged tools register here at runtime via lib/tool-forge.

import { getFeatherlessKey } from "@/lib/lexi-api";
import { log } from "@/lib/logger";
import type { NormalizedFinding, ToolDef } from "./registry";
import { BUILTIN_TOOLS } from "./registry";

const SECRET_RULES: Array<{ rule: string; severity: NormalizedFinding["severity"]; re: RegExp; summary: string }> = [
  { rule: "aws-access-key-id",    severity: "critical", re: /\bAKIA[0-9A-Z]{16}\b/g, summary: "AWS Access Key ID" },
  { rule: "aws-secret",            severity: "critical", re: /aws(.{0,20})?(secret|key)[\"'\s:=]{1,5}([A-Za-z0-9/+=]{40})/gi, summary: "Possible AWS secret" },
  { rule: "google-api-key",        severity: "high",    re: /\bAIza[0-9A-Za-z_\-]{35}\b/g, summary: "Google API Key" },
  { rule: "github-pat",            severity: "critical", re: /\bghp_[A-Za-z0-9]{36}\b/g, summary: "GitHub Personal Access Token" },
  { rule: "github-fine-grained",   severity: "critical", re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g, summary: "GitHub fine-grained PAT" },
  { rule: "slack-token",           severity: "high",    re: /\bxox[baprs]-[A-Za-z0-9-]{10,48}\b/g, summary: "Slack token" },
  { rule: "stripe-live",           severity: "critical", re: /\bsk_live_[0-9a-zA-Z]{24,}\b/g, summary: "Stripe live secret key" },
  { rule: "stripe-restricted",     severity: "critical", re: /\brk_live_[0-9a-zA-Z]{24,}\b/g, summary: "Stripe restricted key" },
  { rule: "openai-key",            severity: "critical", re: /\bsk-[A-Za-z0-9]{20,}\b/g, summary: "OpenAI-style API key" },
  { rule: "private-key-pem",       severity: "critical", re: /-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, summary: "Private key in source" },
  { rule: "jwt",                   severity: "medium",  re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, summary: "JSON Web Token" },
  { rule: "generic-password",      severity: "low",     re: /(?:password|passwd|pwd)\s*[:=]\s*['\"][^'\"\n]{6,}['\"]/gi, summary: "Hard-coded password assignment" },
  { rule: "basic-auth-url",        severity: "high",    re: /https?:\/\/[^\s/:]+:[^\s/@]+@[^\s/]+/g, summary: "Basic-auth credentials embedded in URL" },
];

const ESLINT_HEURISTICS: Array<{ rule: string; severity: NormalizedFinding["severity"]; re: RegExp; summary: string }> = [
  { rule: "eval",                severity: "high",    re: /\beval\s*\(/g, summary: "Use of eval() — arbitrary code execution risk" },
  { rule: "function-ctor",       severity: "high",    re: /\bnew\s+Function\s*\(/g, summary: "new Function() acts like eval()" },
  { rule: "innerhtml",            severity: "high",   re: /\.innerHTML\s*=/g, summary: "innerHTML assignment — XSS risk" },
  { rule: "document-write",      severity: "high",    re: /document\.write\s*\(/g, summary: "document.write() — XSS / overwrite risk" },
  { rule: "child-process-exec",  severity: "high",    re: /child_process[\s\S]{0,40}\.(exec|execSync)\s*\(/g, summary: "child_process.exec — command-injection risk" },
  { rule: "weak-random",          severity: "medium",  re: /Math\.random\s*\(\s*\)/g, summary: "Math.random() — not crypto-secure" },
  { rule: "cors-wildcard",        severity: "medium",  re: /['\"]Access-Control-Allow-Origin['\"]\s*[:,]\s*['\"]\*['\"]/g, summary: "CORS wildcard origin" },
  { rule: "todo-fixme",           severity: "low",     re: /\b(?:TODO|FIXME|XXX|HACK)\b/g, summary: "Open code-quality marker" },
];

function lineFor(content: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < content.length; i++) if (content[i] === "\n") line++;
  return line;
}

function scanRegexes(
  filename: string,
  content: string,
  toolId: string,
  rules: typeof SECRET_RULES,
): NormalizedFinding[] {
  const out: NormalizedFinding[] = [];
  for (const r of rules) {
    r.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = r.re.exec(content)) !== null) {
      out.push({
        tool: toolId,
        severity: r.severity,
        file: filename,
        line: lineFor(content, m.index),
        rule: r.rule,
        summary: r.summary,
        raw: { match: m[0].slice(0, 60) },
      });
      if (!r.re.global) break;
    }
  }
  return out;
}

async function regexSecretsRunner(
  target: { kind: "text" | "file"; filename: string; content: string },
): Promise<NormalizedFinding[]> {
  return scanRegexes(target.filename, target.content, "regex-secrets", SECRET_RULES);
}

async function eslintHeuristicRunner(
  target: { kind: "text" | "file"; filename: string; content: string },
): Promise<NormalizedFinding[]> {
  if (!/\.(js|jsx|ts|tsx|mjs|cjs)$/i.test(target.filename)) return [];
  return scanRegexes(target.filename, target.content, "eslint", ESLINT_HEURISTICS);
}

const FL_BASE = "https://api.featherless.ai/v1";

async function aiReviewRunner(
  target: { kind: "text" | "file"; filename: string; content: string },
): Promise<NormalizedFinding[]> {
  const key = getFeatherlessKey();
  if (!key) {
    log.warn("scan", "ai-review:no-key", { actor: "scanner:ai-review" });
    return [{
      tool: "ai-review",
      severity: "low",
      file: target.filename,
      rule: "no-key",
      summary: "AI review skipped: set Featherless API key in Profile.",
    }];
  }
  // Trim very large files so we don't blow context.
  const MAX = 12_000;
  const snippet = target.content.length > MAX
    ? target.content.slice(0, MAX) + `\n\n[... truncated ${target.content.length - MAX} chars]`
    : target.content;
  const sys = [
    "You are Lexi performing a security and code-quality review.",
    "Read the file and respond with a JSON array of findings ONLY (no prose, no markdown).",
    "Each finding must be: { severity: 'low'|'medium'|'high'|'critical', line: number, rule: string, summary: string }.",
    "Focus on real bugs, security vulnerabilities, injection risks, hard-coded secrets, unsafe defaults, and missing validation.",
    "If nothing is wrong, return [].",
  ].join("\n");
  const user = `File: ${target.filename}\n\n${snippet}`;
  try {
    const r = await fetch(`${FL_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: 800,
      }),
    });
    if (!r.ok) {
      return [{ tool: "ai-review", severity: "low", file: target.filename, rule: "http-error",
        summary: `AI review HTTP ${r.status}` }];
    }
    const j = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = j.choices?.[0]?.message?.content ?? "";
    // Extract first JSON array from the response.
    const m = text.match(/\[\s*[\s\S]*?\]/);
    if (!m) return [];
    let arr: Array<Record<string, unknown>> = [];
    try { arr = JSON.parse(m[0]); } catch { return []; }
    return arr
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        tool: "ai-review",
        severity: (["low","medium","high","critical"].includes(String(x.severity)) ? x.severity : "medium") as NormalizedFinding["severity"],
        file: target.filename,
        line: typeof x.line === "number" ? x.line : undefined,
        rule: String(x.rule ?? "ai-review"),
        summary: String(x.summary ?? "AI-flagged issue"),
        raw: x,
      }));
  } catch (err) {
    return [{ tool: "ai-review", severity: "low", file: target.filename, rule: "exception",
      summary: `AI review failed: ${err instanceof Error ? err.message : String(err)}` }];
  }
}

// Wire phone runners into the registry. Called once at module import.
function attachPhoneRunners(): void {
  for (const t of BUILTIN_TOOLS) {
    if (t.id === "regex-secrets") t.phoneRunner = regexSecretsRunner;
    if (t.id === "eslint")        t.phoneRunner = eslintHeuristicRunner;
    if (t.id === "ai-review")     t.phoneRunner = aiReviewRunner;
  }
}
attachPhoneRunners();

export const ON_PHONE_TOOL_IDS = BUILTIN_TOOLS
  .filter((t) => t.runsOn !== "server" && t.phoneRunner)
  .map((t) => t.id);
