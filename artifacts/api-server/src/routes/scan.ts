import { Router, type IRouter, type Request, type Response } from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";

const router: IRouter = Router();

// ===================================================================
// Tool registry — server-side capabilities. The mobile app has its own
// registry that mirrors this and additionally exposes phone-only tools
// (e.g. on-device AI review and regex secret scan).
// ===================================================================
type ServerTool = {
  id: string;
  label: string;
  script?: string;     // path under artifacts/lexi-mobile/scripts/
  needsApk?: boolean;  // tool needs an APK file path, not a directory
  binary?: string;     // optional native binary check (informational)
};

const SCRIPT_DIR = path.resolve(process.cwd(), "../lexi-mobile/scripts");

const SERVER_TOOLS: Record<string, ServerTool> = {
  semgrep:    { id: "semgrep",    label: "Semgrep (multi-language SAST)",   script: "scan-static.js" },
  eslint:     { id: "eslint",     label: "ESLint security",                  script: "scan-static.js" },
  gitleaks:   { id: "gitleaks",   label: "gitleaks (secrets)",               script: "scan-secrets.js" },
  trufflehog: { id: "trufflehog", label: "trufflehog (secrets)",             script: "scan-secrets.js" },
  trivy:      { id: "trivy",      label: "Trivy (CVE / SBOM)",               script: "scan-trivy.js" },
  bearer:     { id: "bearer",     label: "Bearer (data-flow SAST)",          script: "scan-bearer.js" },
  njsscan:    { id: "njsscan",    label: "njsscan (Node.js SAST)",           script: "scan-njsscan.js" },
  retire:     { id: "retire",     label: "retire.js (vuln deps)",            script: "scan-retire.js" },
  deps:       { id: "deps",       label: "pnpm/npm audit",                   script: "scan-deps.js" },
  expo:       { id: "expo",       label: "expo-doctor",                      script: "scan-expo.js" },
  shell:      { id: "shell",      label: "shellcheck",                       script: "scan-shell.js" },
  quality:    { id: "quality",    label: "Code quality",                     script: "scan-quality.js" },
  bandit:     { id: "bandit",     label: "bandit (Python security)",         script: "scan-bandit.js" },
  nuclei:     { id: "nuclei",     label: "nuclei (template scan)",           script: "scan-nuclei.js" },
  apk:        { id: "apk",        label: "MobSF (static APK)",               script: "scan-apk.js", needsApk: true },
  apktool:    { id: "apktool",    label: "apktool + jadx (decompile)",       script: "scan-apk-decompile.js", needsApk: true },
  "ai-review": { id: "ai-review", label: "AI code review (Featherless)",     script: "scan-ai-review.js" },
};

router.get("/api/scan/tools", (_req, res) => {
  res.json({
    tools: Object.values(SERVER_TOOLS).map((t) => ({
      id: t.id, label: t.label, needsApk: !!t.needsApk,
    })),
  });
});

// ===================================================================
// POST /api/scan/run  — SSE stream of NDJSON scanner events
// Body: {
//   tools: string[],
//   source: { kind: "workspace" | "github" | "upload-text" | "apk-path", payload: ... },
//   options?: { timeoutMs?, model? }
// }
// Events:
//   event: status   data: { phase, tool?, message }
//   event: finding  data: { tool, severity, file?, line?, rule?, summary, raw }
//   event: tool-end data: { tool, durationMs, status, findingCount }
//   event: done     data: { totalFindings, durationMs }
//   event: error    data: { message }
// ===================================================================
type RunBody = {
  tools?: string[];
  source?: {
    kind?: string;
    path?: string;
    repo?: string;
    text?: string;
    filename?: string;
    apkPath?: string;
  };
  options?: { timeoutMs?: number; model?: string };
};

function sse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function materializeSource(src: NonNullable<RunBody["source"]>): Promise<{
  targetDir: string;
  apkPath?: string;
  cleanup: () => Promise<void>;
}> {
  const kind = src.kind ?? "workspace";
  if (kind === "workspace") {
    return {
      targetDir: path.resolve(process.cwd(), "../lexi-mobile"),
      cleanup: async () => {},
    };
  }
  if (kind === "apk-path") {
    if (!src.apkPath) throw new Error("apk-path source needs apkPath");
    return {
      targetDir: path.dirname(src.apkPath),
      apkPath: src.apkPath,
      cleanup: async () => {},
    };
  }
  // github + upload-text both extract into a temp dir.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "lexi-scan-"));
  if (kind === "upload-text") {
    const filename = (src.filename || "snippet.txt").replace(/[^a-zA-Z0-9._-]/g, "_");
    await fs.writeFile(path.join(tmp, filename), src.text ?? "", "utf8");
    return {
      targetDir: tmp,
      cleanup: async () => { try { await fs.rm(tmp, { recursive: true, force: true }); } catch {} },
    };
  }
  if (kind === "github") {
    if (!src.repo) throw new Error("github source needs repo");
    const repo = String(src.repo).trim();
    // Strict allowlist: only https GitHub repos, no leading dash, no whitespace,
    // limit length. Defends against git argument-injection (--upload-pack etc.)
    // and non-https transports (file://, ssh://, ext::).
    const ok =
      repo.length <= 200 &&
      !repo.startsWith("-") &&
      !/\s/.test(repo) &&
      /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}(?:\.git)?$/.test(repo);
    if (!ok) throw new Error("Repo URL rejected: must be https://github.com/owner/repo");
    // The trailing `--` ensures git treats `repo` and `tmp` as positionals.
    await new Promise<void>((resolve, reject) => {
      const p = spawn("git", ["clone", "--depth", "1", "--single-branch", "--no-tags", "--", repo, tmp],
        { stdio: "ignore", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
      p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`git clone exit ${code}`))));
      p.on("error", reject);
    });
    return {
      targetDir: tmp,
      cleanup: async () => { try { await fs.rm(tmp, { recursive: true, force: true }); } catch {} },
    };
  }
  throw new Error(`Unknown source kind: ${kind}`);
}

// Run one script in its OWN reports subdirectory so parallel scripts can't
// race on scan.ndjson. Returns the per-script reports dir; caller reads
// findings from there and filters by tool id (actor).
async function runScript(
  scriptName: string,
  targetDir: string,
  apkPath: string | undefined,
  rootReportsDir: string,
  needsApk: boolean,
  options: { timeoutMs: number },
): Promise<{ status: "ok" | "error"; message?: string; durationMs: number; perScriptReports: string }> {
  const start = Date.now();
  const perScriptReports = path.join(rootReportsDir, scriptName.replace(/\.js$/, ""));
  await fs.mkdir(perScriptReports, { recursive: true });
  const scriptPath = path.join(SCRIPT_DIR, scriptName);
  const args = needsApk
    ? ["--apk", apkPath ?? "", "--reports", perScriptReports]
    : ["--path", targetDir, "--reports", perScriptReports];
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const t = setTimeout(() => child.kill("SIGKILL"), options.timeoutMs);
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("exit", (code) => {
      clearTimeout(t);
      resolve({
        status: code === 0 ? "ok" : "error",
        message: code === 0 ? undefined : (stderr.split("\n").slice(-3).join("\n") || `exit ${code}`),
        durationMs: Date.now() - start,
        perScriptReports,
      });
    });
    child.on("error", (err) => {
      clearTimeout(t);
      resolve({
        status: "error", message: err.message, durationMs: Date.now() - start, perScriptReports,
      });
    });
  });
}

async function readNdjsonFindings(perScriptReports: string, toolIdsOfInterest: Set<string>): Promise<unknown[]> {
  const events: unknown[] = [];
  try {
    const ndjson = await fs.readFile(path.join(perScriptReports, "scan.ndjson"), "utf8");
    for (const line of ndjson.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const ev = JSON.parse(t) as Record<string, unknown>;
        if (ev.action !== "finding") continue;
        const actorTool = typeof ev.actor === "string" && ev.actor.startsWith("scanner:")
          ? (ev.actor as string).slice("scanner:".length)
          : null;
        if (actorTool && toolIdsOfInterest.has(actorTool)) events.push(ev);
      } catch {}
    }
  } catch {}
  return events;
}

router.post("/api/scan/run", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as RunBody;
  const requestedTools = body.tools ?? [];
  const source = body.source ?? { kind: "workspace" };
  const timeoutMs = Math.min(body.options?.timeoutMs ?? 5 * 60_000, 15 * 60_000);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const tools = requestedTools
    .map((id) => SERVER_TOOLS[id])
    .filter((t): t is ServerTool => !!t);
  if (tools.length === 0) {
    sse(res, "error", { message: "No valid tools selected" });
    res.end();
    return;
  }

  const startAll = Date.now();
  let cleanup: (() => Promise<void>) | null = null;
  let reportsDir: string | null = null;
  try {
    const mat = await materializeSource(source);
    cleanup = mat.cleanup;
    reportsDir = await fs.mkdtemp(path.join(os.tmpdir(), "lexi-reports-"));

    sse(res, "status", { phase: "ready", tools: tools.map((t) => t.id), targetDir: mat.targetDir });

    // Group tools by their backing script so a script that produces
    // findings for several tool ids only runs once.
    const byScript = new Map<string, ServerTool[]>();
    for (const t of tools) {
      if (!t.script) continue;
      const arr = byScript.get(t.script) ?? [];
      arr.push(t);
      byScript.set(t.script, arr);
    }

    let totalFindings = 0;
    const runs = Array.from(byScript.entries()).map(async ([script, scriptTools]) => {
      const needsApk = scriptTools.some((t) => t.needsApk);
      for (const t of scriptTools) {
        sse(res, "status", { phase: "tool-start", tool: t.id, message: `Starting ${t.label}` });
      }
      const r = await runScript(script, mat.targetDir, mat.apkPath, reportsDir!, needsApk, { timeoutMs });
      const interest = new Set(scriptTools.map((t) => t.id));
      const events = await readNdjsonFindings(r.perScriptReports, interest);
      // Bucket events per tool so per-tool counts are accurate.
      const perTool = new Map<string, unknown[]>();
      for (const ev of events) {
        const e = ev as Record<string, unknown>;
        const actor = String(e.actor ?? "");
        const toolId = actor.startsWith("scanner:") ? actor.slice("scanner:".length) : "unknown";
        const list = perTool.get(toolId) ?? [];
        list.push(ev);
        perTool.set(toolId, list);
        const out = (e.outputs ?? {}) as Record<string, unknown>;
        sse(res, "finding", {
          tool: toolId,
          severity: out.severity ?? e.severity ?? "medium",
          file: e.target,
          rule: out.rule ?? out.detector,
          line: out.line,
          summary: out.summary ?? out.detector ?? out.rule ?? e.action,
          raw: e,
        });
      }
      for (const t of scriptTools) {
        const cnt = (perTool.get(t.id) ?? []).length;
        totalFindings += cnt;
        sse(res, "tool-end", {
          tool: t.id,
          durationMs: r.durationMs,
          status: r.status,
          findingCount: cnt,
          message: r.message,
        });
      }
    });

    await Promise.all(runs);
    sse(res, "done", { totalFindings, durationMs: Date.now() - startAll });
  } catch (err) {
    sse(res, "error", { message: err instanceof Error ? err.message : String(err) });
  } finally {
    try { await cleanup?.(); } catch {}
    if (reportsDir) { try { await fs.rm(reportsDir, { recursive: true, force: true }); } catch {} }
    res.end();
  }
});

// ===================================================================
// POST /api/scan/explain  — Fix or Reproduce for a single finding.
// Wraps scripts/explain.js logic but as an HTTP endpoint so the mobile
// app can call it for any finding card without shelling out.
// Body: { finding: {...}, mode: "fix" | "reproduce" }
// Streams plain text back.
// ===================================================================
router.post("/api/scan/explain", async (req: Request, res: Response) => {
  const { finding, mode } = (req.body ?? {}) as { finding?: Record<string, unknown>; mode?: "fix" | "reproduce" };
  if (!finding) {
    res.status(400).json({ error: "finding required" });
    return;
  }
  const explainScript = path.join(SCRIPT_DIR, "explain.js");
  const tool = String(finding.tool ?? "unknown");
  const id = String(finding.rule ?? finding.id ?? "generic");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.flushHeaders?.();

  const args = [
    explainScript, tool, id,
    "--mode", mode === "reproduce" ? "reproduce" : "fix",
  ];
  if (finding.file) args.push("--module", `${finding.file}${finding.line ? `:${finding.line}` : ""}`);
  if (finding.summary) args.push("--title", String(finding.summary));

  const child = spawn(process.execPath, args, {
    env: { ...process.env, NO_COLOR: "1", LEXI_API_BASE: `http://localhost:${process.env.PORT ?? 8080}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => res.write(d));
  child.stderr?.on("data", (d) => res.write(d));
  child.on("exit", () => res.end());
  child.on("error", (e) => { res.write(`\n[error] ${e.message}\n`); res.end(); });
});

// ===================================================================
// POST /api/scan/forge  — Lexi authors a new scanner from a description.
// Returns the proposed scanner JS as text + a slug. The mobile app puts
// it in its approval queue; nothing is installed or executed server-side
// until the operator approves locally.
// Body: { name, description, language?, fileTypes?, detectionLogic }
// ===================================================================
router.post("/api/scan/forge", async (req: Request, res: Response) => {
  const { name, description, language, fileTypes, detectionLogic } = (req.body ?? {}) as {
    name?: string; description?: string; language?: string; fileTypes?: string[]; detectionLogic?: string;
  };
  if (!name || !detectionLogic) {
    res.status(400).json({ error: "name and detectionLogic required" });
    return;
  }
  const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `forged-${Date.now()}`;

  // Compose a system prompt for Lexi to write the scanner.
  const sys = [
    "You are a security tooling engineer. Write ONE complete JavaScript module that exports a default async function `scan(target)`.",
    "`target` is { kind: 'text', filename: string, content: string }.",
    "The function MUST return an array of findings: { severity: 'low'|'medium'|'high'|'critical', line?: number, summary: string, rule: string }.",
    "Use only built-in JavaScript and regex — no Node API, no fs, no network. Code runs in a sandboxed Function() in the mobile app.",
    "Output ONLY the JavaScript code (no Markdown fences, no commentary).",
  ].join("\n");
  const user = [
    `Tool name: ${name}`,
    `Description: ${description ?? ""}`,
    `Language target: ${language ?? "any"}`,
    `File types: ${(fileTypes ?? []).join(", ") || "any"}`,
    `Detection logic: ${detectionLogic}`,
  ].join("\n");

  // Forward to the existing /api/chat endpoint via direct call.
  try {
    const port = process.env.PORT ?? "8080";
    const r = await fetch(`http://localhost:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.LEXI_FORGE_MODEL || "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",
        messages: [{ role: "user", content: user }],
        systemPrompt: sys,
      }),
    });
    let text = "";
    const reader = r.body?.getReader();
    if (reader) {
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value);
      }
    } else {
      text = await r.text();
    }
    // Best-effort: if SSE-formatted, extract content deltas.
    const code = text.includes("data:")
      ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => {
          const j = l.slice(5).trim();
          if (!j || j === "[DONE]") return "";
          try { const o = JSON.parse(j); return o.choices?.[0]?.delta?.content ?? o.choices?.[0]?.message?.content ?? ""; } catch { return ""; }
        }).join("")
      : text;
    res.json({
      slug,
      code: code.replace(/^```(?:javascript|js)?\n?/i, "").replace(/```\s*$/, "").trim(),
      meta: { name, description, language, fileTypes, detectionLogic, createdAt: Date.now() },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Health probe so the mobile runner can decide phone-only vs server.
router.get("/api/scan/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now(), hash: crypto.randomBytes(4).toString("hex") });
});

export default router;
