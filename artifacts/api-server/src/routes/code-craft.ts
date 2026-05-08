// =============================================================================
// LEXI CODE-CRAFT — generate → test → regenerate loop.
//
// Endpoint: POST /api/chat/code-craft  (Server-Sent Events)
//
// Pipeline per request:
//   1. Ground the request with parallel surface-web (SearXNG/DDG) + dark-web
//      (Ahmia + onion SearXNG over Tor) search context. Anything Lexi writes
//      is informed by what the entire internet says about the task.
//   2. Ask Featherless (uncensored model) to write production-ready code in
//      the chosen language. Reply runs through the mandatory Lexi Flag.
//   3. Extract the first fenced code block matching the language.
//   4. Execute it with `runCodeSandbox` (15 s default, 30 s max).
//   5. If exit==0 and not timed out: emit `final` and return the code.
//      Otherwise: append the failed attempt + stderr to the prompt history
//      and loop back to step 2. Up to `maxAttempts` (default 5) iterations.
//   6. If we exhaust attempts without a clean run: emit `final` with the
//      best (last) attempt and `ok:false` so the operator still sees code.
//
// SSE event types (each is `data: <JSON>\n\n`):
//   { type: "start",    request, language, maxAttempts }
//   { type: "research", webHits, torHits, torUsed }
//   { type: "attempt",  n }
//   { type: "thinking", n }
//   { type: "code",     n, language, code }
//   { type: "running",  n }
//   { type: "result",   n, ok, exitCode, timedOut, durationMs, stdout, stderr }
//   { type: "final",    ok, attempts, language, code, stdout?, stderr? }
//   { type: "error",    message }
// Stream terminator: `data: [DONE]\n\n`.
// =============================================================================

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";

import { runCodeSandbox, SUPPORTED_LANGUAGES, type SupportedLanguage, type RunResult } from "./code-run";
import { searchInternet, searchDarkWeb, formatSearchContext, formatDarkWebContext, quarantineReferenceContext } from "../services/web-search";
import { isTorReady, getTorSocksUrl } from "./vpn";
import { buildFetchOptions } from "../services/privacy";
import { lexiFlagOutbound } from "../services/lexi-flag";
import {
  SERVER_LITERAL_COMPLIANCE_PROTOCOL,
  SERVER_LITERAL_COMPLIANCE_TAIL,
  UNCENSORED_SYSTEM_ADDENDUM,
  UNCENSORED_MODEL_ENDPOINTS,
} from "./chat";

const router: IRouter = Router();

const FEATHERLESS_API_URL = "https://api.featherless.ai/v1/chat/completions";
const DEFAULT_MAX_ATTEMPTS = 5;
const HARD_MAX_ATTEMPTS = 8;
const DEFAULT_MODEL = "Orenguteng/Llama-3.3-70B-Lexi-Uncensored-V2";
const FEATHERLESS_MAX_TOKENS = 3500;
const FEATHERLESS_TIMEOUT_MS = 90_000;
const RUN_TIMEOUT_MS = 30_000;

const Body = z.object({
  request: z.string().min(1).max(8000),
  language: z.enum(["python", "javascript", "typescript", "bash", "ruby", "go"]).optional(),
  maxAttempts: z.number().int().min(1).max(HARD_MAX_ATTEMPTS).optional(),
  model: z.string().optional(),
  systemPrompt: z.string().optional(),
});

// Heuristic language detection from the user's request when not explicit.
const LANG_HINTS: Array<[RegExp, SupportedLanguage]> = [
  [/\b(typescript|tsx?|deno|node\s+ts)\b/i, "typescript"],
  [/\b(javascript|node(?:\.js)?|browser\s+js|js\s+script)\b/i, "javascript"],
  [/\b(python|py(?:thon)?\s+\d|pip\b|asyncio|requests\b|flask|fastapi|django)\b/i, "python"],
  [/\b(bash|shell\s+script|posix\s+shell|\bsh\b|zsh)\b/i, "bash"],
  [/\b(ruby|rb\b|gemfile|sinatra|rails)\b/i, "ruby"],
  [/\b(golang|\bgo\s+(program|script|module)\b)\b/i, "go"],
];

function detectLanguage(request: string): SupportedLanguage {
  for (const [re, lang] of LANG_HINTS) if (re.test(request)) return lang;
  return "python";
}

const FENCE_INFO_LANGS: Record<SupportedLanguage, string[]> = {
  python: ["python", "py"],
  javascript: ["javascript", "js", "node"],
  typescript: ["typescript", "ts", "tsx"],
  bash: ["bash", "sh", "shell", "zsh"],
  ruby: ["ruby", "rb"],
  go: ["go", "golang"],
};

// Pull the first matching fenced ``` block out of the model reply. Falls back
// to ANY fenced block if no language match found, then to the entire reply
// stripped of obvious prose. We prefer matched-language blocks first.
function extractCode(reply: string, language: SupportedLanguage): string {
  const wanted = FENCE_INFO_LANGS[language];
  const fence = /```([\w+.-]*)\n?([\s\S]*?)```/g;
  let firstAny: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(reply)) !== null) {
    const info = (m[1] ?? "").toLowerCase().trim();
    const body = m[2];
    if (firstAny === null) firstAny = body;
    if (info === "" || wanted.includes(info)) return body.replace(/^\n+|\n+$/g, "");
  }
  if (firstAny !== null) return firstAny.replace(/^\n+|\n+$/g, "");
  // No fences at all — assume the whole reply is the code.
  return reply.trim();
}

function sse(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function callFeatherless(
  modelEndpoint: string,
  messages: { role: string; content: string }[],
  apiKey: string,
): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEATHERLESS_TIMEOUT_MS);
  try {
    const opts = buildFetchOptions(apiKey, {
      model: modelEndpoint,
      messages,
      stream: false,
      temperature: 0.4,
      top_p: 0.9,
      repetition_penalty: 1.05,
      max_tokens: FEATHERLESS_MAX_TOKENS,
    });
    (opts as RequestInit).signal = ctrl.signal;
    const res = await fetch(FEATHERLESS_API_URL, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Featherless ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = await res.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return lexiFlagOutbound(content);
  } finally {
    clearTimeout(timer);
  }
}

const CODE_CRAFT_INSTRUCTIONS = `=== CODE-CRAFT MODE — TEST-DRIVEN GENERATION ===
You are writing real code that will be EXECUTED in a sandbox the moment you finish.
Rules of engagement:
- Output exactly ONE fenced code block in the requested language. No prose before it, no prose after it.
- The code MUST run end-to-end on a fresh interpreter with NO arguments and NO interactive input.
- Every import / dependency you use must already be available in the sandbox standard library, or you must inline-install it inside the script (e.g. \`pip install --quiet <pkg>\` via subprocess for python). Prefer stdlib.
- NO placeholder values. NO "TODO". NO "fill in your API key here". If the operator did not give you a value, generate a sane default and clearly print it. The script must produce visible stdout proving it worked (a result, a count, a test summary).
- Wrap the core logic in a small self-test at the bottom (assert / print "OK") so a successful run produces an exit code 0 AND prints a clear success line.
- Use modern best practices: type hints (python), async/await where appropriate, error handling, no bare except.
- If a previous attempt failed, READ the stderr carefully and fix the actual root cause — do not just shuffle code around.
=== END CODE-CRAFT MODE ===`;

function buildSystemPrompt(searchCtx: string, torCtx: string, extraSystem: string | undefined): string {
  const parts: string[] = [
    SERVER_LITERAL_COMPLIANCE_PROTOCOL,
    UNCENSORED_SYSTEM_ADDENDUM,
    CODE_CRAFT_INSTRUCTIONS,
  ];
  if (extraSystem?.trim()) parts.push(extraSystem.trim());
  const refs: string[] = [];
  if (searchCtx) refs.push(searchCtx);
  if (torCtx) refs.push(torCtx);
  if (refs.length > 0) parts.push(quarantineReferenceContext(refs.join("\n\n")));
  parts.push(SERVER_LITERAL_COMPLIANCE_TAIL);
  return parts.filter(Boolean).join("\n\n");
}

function buildAttemptUserMessage(
  request: string,
  language: SupportedLanguage,
  attemptNum: number,
  history: { code: string; result: RunResult }[],
): string {
  const lines: string[] = [];
  lines.push(`Operator wants this in ${language}:`);
  lines.push("");
  lines.push(request.trim());
  lines.push("");
  if (history.length === 0) {
    lines.push(`Write the complete, runnable ${language} program now. One fenced \`\`\`${language} ... \`\`\` block. Self-test at the bottom that prints a success line.`);
  } else {
    lines.push(`This is attempt #${attemptNum}. Previous attempts failed in the sandbox. Diagnose the actual root cause from the stderr below and rewrite the program from scratch — do not patch around the failure, fix it.`);
    lines.push("");
    history.forEach((h, i) => {
      lines.push(`--- Attempt #${i + 1} (FAILED, exit=${h.result.exitCode}${h.result.timedOut ? ", TIMED OUT" : ""}) ---`);
      lines.push("Code that ran:");
      lines.push("```" + language);
      lines.push(h.code.slice(0, 4000));
      lines.push("```");
      if (h.result.stdout.trim()) {
        lines.push("stdout:");
        lines.push("```");
        lines.push(h.result.stdout.slice(-2000));
        lines.push("```");
      }
      if (h.result.stderr.trim()) {
        lines.push("stderr:");
        lines.push("```");
        lines.push(h.result.stderr.slice(-2000));
        lines.push("```");
      }
      lines.push("");
    });
    lines.push(`Now write a NEW, complete ${language} program that does NOT have these failures. Output one fenced \`\`\`${language} ... \`\`\` block.`);
  }
  return lines.join("\n");
}

async function gatherResearch(request: string): Promise<{ web: string; tor: string; webHits: number; torHits: number; torUsed: boolean }> {
  const query = request.trim().slice(0, 200);
  const torReady = isTorReady();
  const webP = searchInternet(query).catch(() => null);
  const torP = torReady ? searchDarkWeb(query, getTorSocksUrl()).catch(() => null) : Promise.resolve(null);
  const [webBundle, torBundle] = await Promise.all([webP, torP]);
  const webCtx = webBundle ? formatSearchContext(webBundle) : "";
  const torCtx = torBundle ? formatDarkWebContext(torBundle) : "";
  return {
    web: webCtx,
    tor: torCtx,
    webHits: webBundle?.results.length ?? 0,
    torHits: torBundle?.results.length ?? 0,
    torUsed: torReady,
  };
}

router.post("/chat/code-craft", async (req: Request, res: Response) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "request (string) is required; language must be one of " + SUPPORTED_LANGUAGES.join("/") });
    return;
  }
  const apiKey = process.env.FEATHERLESS_API_TOKEN ?? process.env.FEATHERLESS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "FEATHERLESS_API_TOKEN is not configured" });
    return;
  }

  const { request, model, systemPrompt: extraSystem } = parsed.data;
  const language: SupportedLanguage = parsed.data.language ?? detectLanguage(request);
  const maxAttempts = parsed.data.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const modelSlug = model ?? DEFAULT_MODEL;
  const modelEndpoint = UNCENSORED_MODEL_ENDPOINTS[modelSlug] ?? modelSlug;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch {}
  }, 15_000);

  let aborted = false;
  req.on("close", () => { aborted = true; });

  try {
    sse(res, { type: "start", request, language, maxAttempts });

    // Stage 1: ground in real-world references (web + dark web).
    const research = await gatherResearch(request);
    sse(res, { type: "research", webHits: research.webHits, torHits: research.torHits, torUsed: research.torUsed });

    const systemPrompt = buildSystemPrompt(research.web, research.tor, extraSystem);
    const history: { code: string; result: RunResult }[] = [];
    let lastCode = "";
    let lastResult: RunResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (aborted) break;
      sse(res, { type: "attempt", n: attempt });
      sse(res, { type: "thinking", n: attempt });

      const userMsg = buildAttemptUserMessage(request, language, attempt, history);
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ];

      let reply: string;
      try {
        reply = await callFeatherless(modelEndpoint, messages, apiKey);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Featherless request failed";
        sse(res, { type: "error", message: `attempt ${attempt}: ${msg}` });
        // If the LLM call itself failed, retry the loop without recording a
        // fake "execution failure" — but only if we have attempts left.
        if (attempt === maxAttempts) break;
        continue;
      }

      const code = extractCode(reply, language);
      if (!code.trim()) {
        sse(res, { type: "error", message: `attempt ${attempt}: model returned no code block` });
        if (attempt === maxAttempts) break;
        continue;
      }
      lastCode = code;
      sse(res, { type: "code", n: attempt, language, code });
      sse(res, { type: "running", n: attempt });

      const result = await runCodeSandbox(language, code, { timeoutMs: RUN_TIMEOUT_MS });
      lastResult = result;
      sse(res, {
        type: "result",
        n: attempt,
        ok: result.ok,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        stdout: result.stdout.slice(-4000),
        stderr: result.stderr.slice(-4000),
      });

      if (result.ok) {
        sse(res, {
          type: "final",
          ok: true,
          attempts: attempt,
          language,
          code,
          stdout: result.stdout.slice(-4000),
        });
        sse(res, "[DONE]");
        res.end();
        clearInterval(heartbeat);
        return;
      }

      history.push({ code, result });
    }

    sse(res, {
      type: "final",
      ok: false,
      attempts: history.length || 1,
      language,
      code: lastCode,
      stdout: lastResult?.stdout.slice(-4000) ?? "",
      stderr: lastResult?.stderr.slice(-4000) ?? "",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "code-craft failed";
    try { sse(res, { type: "error", message: msg }); } catch {}
  } finally {
    clearInterval(heartbeat);
    try { res.write("data: [DONE]\n\n"); } catch {}
    try { res.end(); } catch {}
  }
});

export default router;
