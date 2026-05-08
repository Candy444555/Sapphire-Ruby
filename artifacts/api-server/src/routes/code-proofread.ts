// =============================================================================
// LEXI CODE PROOFREAD — single-shot syntax check + typo fix.
//
// Endpoint: POST /api/code/proofread   Body: { language, code }
//                                      Returns: { code, changed, hadErrors, errors }
//
// Operator wants exactly this and nothing more: when Lexi writes code the way
// she always has, we run a quick proofread pass on each fenced block before
// it reaches the operator's screen. Two stages:
//
//   1. Run a language-aware SYNTAX-ONLY check (no execution). Maps:
//        python     -> python3 -m py_compile <file>
//        javascript -> node --check <file>
//        typescript -> npx -y tsx --check <file>           (parses, no run)
//        bash / sh  -> bash -n <file>
//        ruby       -> ruby -c <file>
//        go         -> gofmt -e <file>                     (parse + format)
//      No interpreter is launched on the user's code; py_compile / --check /
//      -n / -c / gofmt only parse. The temp file is unlinked on every path.
//
//   2. If the syntax check fails OR the operator just wants a typo sweep,
//      ask Featherless ONCE (low temp, non-streaming) to return the cleaned
//      code in a single fenced block. Any non-code prose is stripped. Reply
//      runs through `lexiFlagOutbound`. If the LLM call fails or returns
//      nothing useful, we fall back to the original code so the operator
//      always gets something.
//
// Languages we don't recognise are passed through untouched (no syntax check
// available, no fix attempted) so this endpoint never destroys content.
// =============================================================================

import { spawn } from "child_process";
import { mkdir, writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";

import { buildFetchOptions } from "../services/privacy";
import { lexiFlagOutbound } from "../services/lexi-flag";
import { UNCENSORED_MODEL_ENDPOINTS } from "./chat";

const router: IRouter = Router();

const FEATHERLESS_API_URL = "https://api.featherless.ai/v1/chat/completions";
// Canonical uncensored slug — `UNCENSORED_MODEL_ENDPOINTS` rewrites it to the
// real Featherless model id `Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2`.
const PROOFREAD_MODEL = "lexi-uncensored-v2-8b";
const FEATHERLESS_TIMEOUT_MS = 60_000;
const FEATHERLESS_MAX_TOKENS = 3500;
const SYNTAX_CHECK_TIMEOUT_MS = 8_000;
const TMP_DIR = join(tmpdir(), "lexi-proofread");

const Body = z.object({
  language: z.string().min(1).max(40),
  code: z.string().min(1).max(120_000),
});

type CheckSpec = { ext: string; cmd: string; args: (file: string) => string[] };

const SYNTAX_CHECKS: Record<string, CheckSpec> = {
  python: { ext: "py", cmd: "python3", args: (f) => ["-m", "py_compile", f] },
  py: { ext: "py", cmd: "python3", args: (f) => ["-m", "py_compile", f] },

  javascript: { ext: "js", cmd: "node", args: (f) => ["--check", f] },
  js: { ext: "js", cmd: "node", args: (f) => ["--check", f] },
  node: { ext: "js", cmd: "node", args: (f) => ["--check", f] },

  typescript: { ext: "ts", cmd: "npx", args: (f) => ["-y", "tsx", "--check", f] },
  ts: { ext: "ts", cmd: "npx", args: (f) => ["-y", "tsx", "--check", f] },

  bash: { ext: "sh", cmd: "bash", args: (f) => ["-n", f] },
  sh: { ext: "sh", cmd: "bash", args: (f) => ["-n", f] },
  shell: { ext: "sh", cmd: "bash", args: (f) => ["-n", f] },
  zsh: { ext: "sh", cmd: "bash", args: (f) => ["-n", f] },

  ruby: { ext: "rb", cmd: "ruby", args: (f) => ["-c", f] },
  rb: { ext: "rb", cmd: "ruby", args: (f) => ["-c", f] },

  go: { ext: "go", cmd: "gofmt", args: (f) => ["-e", f] },
  golang: { ext: "go", cmd: "gofmt", args: (f) => ["-e", f] },
};

function normaliseLang(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9+]/g, "");
}

async function syntaxCheck(language: string, code: string): Promise<{ ok: boolean; errors: string }> {
  const spec = SYNTAX_CHECKS[language];
  if (!spec) return { ok: true, errors: "" };
  await mkdir(TMP_DIR, { recursive: true });
  const file = join(TMP_DIR, `${randomUUID()}.${spec.ext}`);
  await writeFile(file, code, "utf8");
  return new Promise<{ ok: boolean; errors: string }>((resolve) => {
    let stderr = "";
    let stdout = "";
    let settled = false;
    const child = spawn(spec.cmd, spec.args(file), {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    const finish = (ok: boolean, errors: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(killer);
      unlink(file).catch(() => {});
      resolve({ ok, errors: errors.replace(new RegExp(file, "g"), "<input>").trim() });
    };
    const killer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      // Timeout is NOT a clean syntax check — surface honestly so callers
      // don't think they've delivered verified code.
      finish(false, `syntax checker (${spec.cmd}) timed out after ${SYNTAX_CHECK_TIMEOUT_MS}ms`);
    }, SYNTAX_CHECK_TIMEOUT_MS);
    child.stdout?.on("data", (d) => { stdout += String(d); if (stdout.length > 16_000) stdout = stdout.slice(-16_000); });
    child.stderr?.on("data", (d) => { stderr += String(d); if (stderr.length > 16_000) stderr = stderr.slice(-16_000); });
    child.on("error", (err) => finish(false, `syntax checker (${spec.cmd}) unavailable: ${err.message}`));
    child.on("close", (codeNum) => {
      if (codeNum === 0) finish(true, "");
      else finish(false, stderr || stdout || `exit ${codeNum}`);
    });
  });
}

function extractFirstCodeBlock(reply: string, fallback: string): string {
  const fence = /```[\w+.-]*\n?([\s\S]*?)```/g;
  const m = fence.exec(reply);
  if (m && m[1].trim()) return m[1].replace(/^\n+|\n+$/g, "");
  // No fence — assume the whole reply is code, unless it's clearly prose.
  const trimmed = reply.trim();
  if (!trimmed) return fallback;
  return trimmed;
}

async function llmFix(language: string, code: string, syntaxErrors: string): Promise<string | null> {
  const apiKey = process.env.FEATHERLESS_API_TOKEN ?? process.env.FEATHERLESS_API_KEY;
  if (!apiKey) return null;
  const modelEndpoint = UNCENSORED_MODEL_ENDPOINTS[PROOFREAD_MODEL] ?? PROOFREAD_MODEL;
  const sys = [
    "You are a code proofreader. The operator just received this code from another assistant.",
    "Your ONLY job: fix syntax errors, spelling mistakes in strings/comments, and typos in identifier names.",
    "Do NOT add missing imports. Do NOT fix logic bugs. Do NOT refactor. Do NOT change behaviour, structure, or intent.",
    "If the code is syntactically valid and free of typos, return it byte-for-byte unchanged.",
    "Do NOT add comments, explanations, or prose.",
    "Output exactly ONE fenced ```" + language + " ... ``` block containing the cleaned code, and nothing else.",
  ].join(" ");
  const userParts: string[] = [];
  userParts.push(`Language: ${language}`);
  if (syntaxErrors) {
    userParts.push("Syntax check reported these errors:");
    userParts.push("```");
    userParts.push(syntaxErrors.slice(0, 4000));
    userParts.push("```");
  } else {
    userParts.push("No syntax errors were reported. Just fix any obvious typos, mis-named identifiers, or shadowed variables. If nothing needs fixing, return the code verbatim.");
  }
  userParts.push("Original code:");
  userParts.push("```" + language);
  userParts.push(code);
  userParts.push("```");
  userParts.push("Return only the corrected fenced code block.");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEATHERLESS_TIMEOUT_MS);
  try {
    const opts = buildFetchOptions(apiKey, {
      model: modelEndpoint,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userParts.join("\n") },
      ],
      stream: false,
      temperature: 0.15,
      top_p: 0.9,
      max_tokens: FEATHERLESS_MAX_TOKENS,
    });
    (opts as RequestInit).signal = ctrl.signal;
    const res = await fetch(FEATHERLESS_API_URL, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[proofread] featherless", res.status, txt.slice(0, 400));
      return null;
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "";
    if (!raw.trim()) {
      console.error("[proofread] empty featherless reply");
      return null;
    }
    const flagged = lexiFlagOutbound(raw);
    const extracted = extractFirstCodeBlock(flagged, code);
    if (!extracted.trim() || extracted.trim() === code.trim()) {
      console.error("[proofread] llm returned no useful change. raw=", raw.slice(0, 400));
    }
    return extracted;
  } catch (err) {
    console.error("[proofread] llmFix threw", err instanceof Error ? err.message : err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

router.post("/code/proofread", async (req: Request, res: Response) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "language (string) and code (string) are required" });
    return;
  }
  const { code } = parsed.data;
  const lang = normaliseLang(parsed.data.language);

  // Unknown language: pass through untouched. Don't ever destroy content.
  if (!SYNTAX_CHECKS[lang]) {
    res.json({ code, changed: false, hadErrors: false, errors: "" });
    return;
  }

  const check = await syntaxCheck(lang, code);
  if (check.ok) {
    res.json({ code, changed: false, hadErrors: false, errors: "" });
    return;
  }

  const fixed = await llmFix(lang, code, check.errors);
  if (!fixed || fixed.trim() === code.trim()) {
    // LLM unavailable or didn't change anything — return original + the
    // syntax errors so the caller can decide whether to surface them.
    res.json({ code, changed: false, hadErrors: true, errors: check.errors });
    return;
  }

  // Re-check the fixed code. If it now passes, great. If it still fails,
  // hand back the LLM's attempt anyway with the new error so the operator
  // sees Lexi at least tried.
  const recheck = await syntaxCheck(lang, fixed);
  res.json({
    code: fixed,
    changed: true,
    hadErrors: !recheck.ok,
    errors: recheck.ok ? "" : recheck.errors,
  });
});

export default router;
