import { Router, type IRouter, type Request, type Response } from "express";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const router: IRouter = Router();

// Map tool id -> CLI command + arg builder. All commands write JSON / SARIF
// into <reportsDir>; we then parse the per-tool .summary.json that the
// existing scripts already produce, plus best-effort native parsers for the
// new tools.
type ToolWrap = {
  id: string;
  available: () => boolean;
  // True if the tool wants the original .apk file path; otherwise it's
  // handed the decompiled / extracted code directory.
  wantsApk?: boolean;
  // Return command + args, or null if it cannot run for the given source.
  build?: (target: string, reportsDir: string) => { cmd: string; args: string[]; cwd?: string } | null;
  // Optional inline runner (no subprocess). Receives the target dir/file and
  // a `send(event, payload)` to stream findings/tool events.
  runInline?: (
    target: string,
    reportsDir: string,
    send: (event: string, data: unknown) => void,
  ) => Promise<{ findings: Array<Record<string, unknown>>; status: "ok" | "issues" | "skipped" | "error"; reason?: string; error?: string }>;
  // Optional parser: given reportsDir, returns array of {id,severity,title,module,...}
  parse?: (reportsDir: string) => Array<Record<string, unknown>>;
};

function which(bin: string): string | null {
  const r = spawnSyncCapture(process.platform === "win32" ? "where" : "which", [bin]);
  return r.code === 0 ? r.stdout.trim().split(/\r?\n/)[0] : null;
}

function spawnSyncCapture(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

const SCRIPTS_DIR = path.resolve(process.cwd(), "../lexi-mobile/scripts");

function nodeScript(name: string): ToolWrap["build"] {
  return (target, reportsDir) => ({
    cmd: process.execPath,
    args: [path.join(SCRIPTS_DIR, name), "--path", target, "--reports", reportsDir],
  });
}

function parseSummary(name: string): NonNullable<ToolWrap["parse"]> {
  return (reportsDir) => {
    const p = path.join(reportsDir, name);
    if (!existsSync(p)) return [];
    try {
      const j = JSON.parse(readFileSync(p, "utf8"));
      const arr = Array.isArray(j.findings) ? j.findings : [];
      return arr;
    } catch { return []; }
  };
}

const TOOLS: Record<string, ToolWrap> = {
  // Existing #14 scanners (re-wired through this aggregator).
  semgrep: { id: "semgrep", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-static.js")),
    build: nodeScript("scan-static.js"), parse: parseSummary("static.summary.json") },
  gitleaks: { id: "gitleaks", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-secrets.js")),
    build: nodeScript("scan-secrets.js"), parse: parseSummary("secrets.summary.json") },
  trufflehog: { id: "trufflehog", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-secrets.js")),
    build: nodeScript("scan-secrets.js"), parse: parseSummary("secrets.summary.json") },
  "eslint-security": { id: "eslint-security", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-static.js")),
    build: nodeScript("scan-static.js"), parse: parseSummary("static.summary.json") },
  "expo-doctor": { id: "expo-doctor", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-expo.js")),
    build: nodeScript("scan-expo.js"), parse: parseSummary("expo.summary.json") },
  "pnpm-audit": { id: "pnpm-audit", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-deps.js")),
    build: nodeScript("scan-deps.js"), parse: parseSummary("deps.summary.json") },
  retire: { id: "retire", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-retire.js")),
    build: nodeScript("scan-retire.js"), parse: parseSummary("retire.summary.json") },
  bearer: { id: "bearer", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-bearer.js")),
    build: nodeScript("scan-bearer.js"), parse: parseSummary("bearer.summary.json") },
  njsscan: { id: "njsscan", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-njsscan.js")),
    build: nodeScript("scan-njsscan.js"), parse: parseSummary("njsscan.summary.json") },
  mobsf: {
    id: "mobsf", available: () => which("mobsfscan") != null, wantsApk: false,
    build: (target, reportsDir) => {
      // mobsfscan runs over decompiled mobile source (apk pre-decompile pipeline points target at codeDir).
      const out = path.join(reportsDir, "mobsf.json");
      return { cmd: "mobsfscan", args: ["--json", "-o", out, target] };
    },
    parse: (reportsDir) => {
      const p = path.join(reportsDir, "mobsf.json");
      if (!existsSync(p)) return [];
      try {
        const j = JSON.parse(readFileSync(p, "utf8")) as { results?: Record<string, { metadata?: Record<string, unknown>; files?: Array<{ file_path?: string; match_lines?: number[] }> }> };
        const out: Array<Record<string, unknown>> = [];
        for (const [rule, body] of Object.entries(j.results || {})) {
          const sev = String(body.metadata?.severity || "info").toLowerCase();
          const desc = String(body.metadata?.description || rule);
          for (const f of body.files || []) {
            out.push({ id: rule, severity: sev, title: desc, module: `${f.file_path}:${(f.match_lines || [])[0] ?? ""}` });
          }
        }
        return out;
      } catch { return []; }
    },
  },
  "dep-scan": {
    id: "dep-scan", available: () => which("depscan") != null || which("dep-scan") != null,
    build: (target, reportsDir) => {
      const out = path.join(reportsDir, "depscan");
      mkdirSync(out, { recursive: true });
      const bin = which("depscan") != null ? "depscan" : "dep-scan";
      return { cmd: bin, args: ["--src", target, "--reports-dir", out, "--no-banner"] };
    },
    parse: (reportsDir) => {
      const dir = path.join(reportsDir, "depscan");
      if (!existsSync(dir)) return [];
      const out: Array<Record<string, unknown>> = [];
      let entries: string[] = []; try { entries = readdirSync(dir); } catch { return []; }
      for (const name of entries) {
        if (!/\.json$/i.test(name)) continue;
        try {
          const txt = readFileSync(path.join(dir, name), "utf8");
          for (const line of txt.split("\n")) {
            const t = line.trim(); if (!t || !t.startsWith("{")) continue;
            try {
              const j = JSON.parse(t);
              out.push({
                id: j.id || j.cve_id || j.vulnerability_id || "vuln",
                severity: String(j.severity || "low").toLowerCase(),
                title: j.short_description || j.title || j.description || j.id,
                module: j.package_issue?.affected_location?.package || j.matched_by || j.location,
                url: j.url || j.source_url,
              });
            } catch { /* per-line ignore */ }
          }
        } catch { /* file ignore */ }
      }
      return out;
    },
  },

  // New tools added by this task.
  trivy: { id: "trivy", available: () => existsSync(path.join(SCRIPTS_DIR, "scan-trivy.js")),
    build: nodeScript("scan-trivy.js"), parse: parseSummary("trivy.summary.json") },
  bandit: {
    id: "bandit", available: () => which("bandit") != null,
    build: (target, reportsDir) => {
      const out = path.join(reportsDir, "bandit.json");
      return { cmd: "bandit", args: ["-q", "-r", target, "-f", "json", "-o", out] };
    },
    parse: (reportsDir) => {
      const p = path.join(reportsDir, "bandit.json");
      if (!existsSync(p)) return [];
      try {
        const j = JSON.parse(readFileSync(p, "utf8"));
        return (j.results || []).map((r: Record<string, unknown>) => ({
          id: r.test_id, severity: String(r.issue_severity || "low").toLowerCase(),
          title: r.issue_text, module: `${r.filename}:${r.line_number}`, url: r.more_info,
        }));
      } catch { return []; }
    },
  },
  nuclei: {
    id: "nuclei", available: () => which("nuclei") != null,
    build: (target, reportsDir) => {
      const out = path.join(reportsDir, "nuclei.jsonl");
      // Code-template scan against directory; users can add their own templates.
      return { cmd: "nuclei", args: ["-target", target, "-jsonl", "-o", out, "-silent"] };
    },
    parse: (reportsDir) => {
      const p = path.join(reportsDir, "nuclei.jsonl");
      if (!existsSync(p)) return [];
      const out: Array<Record<string, unknown>> = [];
      for (const line of readFileSync(p, "utf8").split("\n")) {
        const t = line.trim(); if (!t) continue;
        try {
          const j = JSON.parse(t);
          out.push({
            id: j["template-id"] || j.templateID,
            severity: String(j.info?.severity || "low").toLowerCase(),
            title: j.info?.name, module: j["matched-at"] || j.host, url: j.info?.reference?.[0],
          });
        } catch { /* ignore */ }
      }
      return out;
    },
  },
  "ai-review": {
    id: "ai-review", available: () => !!process.env.FEATHERLESS_API_KEY,
    runInline: async (target) => {
      const key = process.env.FEATHERLESS_API_KEY;
      if (!key) return { findings: [], status: "skipped", reason: "FEATHERLESS_API_KEY not set on server" };
      // Walk target dir for code-like files, build a single capped blob.
      const codeExt = new Set(["js","jsx","ts","tsx","py","go","java","kt","rb","php","rs","c","cpp","cs","sh","sql"]);
      const blobs: string[] = []; let total = 0; const limit = 60_000;
      const walk = (dir: string) => {
        if (total >= limit) return;
        let entries: string[] = []; try { entries = readdirSync(dir); } catch { return; }
        for (const name of entries) {
          if (total >= limit) return;
          const p = path.join(dir, name);
          let stat; try { stat = require("node:fs").statSync(p); } catch { continue; }
          if (stat.isDirectory()) {
            if (name === ".git" || name === "node_modules") continue;
            walk(p); continue;
          }
          const ext = name.split(".").pop()?.toLowerCase();
          if (!ext || !codeExt.has(ext)) continue;
          try {
            const text = readFileSync(p, "utf8");
            const slice = text.slice(0, Math.max(0, limit - total));
            blobs.push(`// ${path.relative(target, p)}\n${slice}`);
            total += slice.length;
          } catch { /* ignore */ }
        }
      };
      try {
        const stat = require("node:fs").statSync(target);
        if (stat.isDirectory()) walk(target);
        else { try { blobs.push(readFileSync(target, "utf8").slice(0, limit)); total = blobs[0].length; } catch { /* ignore */ } }
      } catch { return { findings: [], status: "error", error: "target not readable" }; }
      if (blobs.length === 0) return { findings: [], status: "ok", reason: "no code files" };
      const prompt =
        "You are a security reviewer. Reply ONLY with a JSON array of " +
        "{id,severity,title,module,line?} findings (severity in low|medium|high|critical). " +
        "If nothing concerning, return [].\n\n" + blobs.join("\n\n");
      try {
        const r = await fetch("https://api.featherless.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: "moonshotai/Kimi-K2-Instruct-0905",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 2000,
          }),
        });
        if (!r.ok) return { findings: [], status: "error", error: `featherless ${r.status}` };
        const j = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
        const txt = j.choices?.[0]?.message?.content || "[]";
        const m = txt.match(/\[[\s\S]*\]/);
        const arr = m ? JSON.parse(m[0]) : [];
        return { findings: Array.isArray(arr) ? arr : [], status: arr.length ? "issues" : "ok" };
      } catch (err) {
        return { findings: [], status: "error", error: err instanceof Error ? err.message : String(err) };
      }
    },
  },
  apktool: {
    id: "apktool", available: () => which("apktool") != null, wantsApk: true,
    build: (target, reportsDir) => {
      // target is an APK file path; output goes to <reportsDir>/apktool-out
      const out = path.join(reportsDir, "apktool-out");
      return { cmd: "apktool", args: ["d", "-f", "-o", out, target] };
    },
    parse: (reportsDir) => {
      const out = path.join(reportsDir, "apktool-out");
      if (!existsSync(out)) return [];
      // Minimal: report success of decompile so downstream tools can run.
      return [{ id: "apk-decompiled", severity: "info", title: "APK decompiled — feed dir into semgrep / secrets / ai-review", module: out }];
    },
  },
  jadx: {
    id: "jadx", available: () => which("jadx") != null, wantsApk: true,
    build: (target, reportsDir) => {
      const out = path.join(reportsDir, "jadx-out");
      return { cmd: "jadx", args: ["-d", out, "--no-res", target] };
    },
    parse: (reportsDir) => {
      const out = path.join(reportsDir, "jadx-out");
      if (!existsSync(out)) return [];
      return [{ id: "apk-jadx", severity: "info", title: "APK Java sources extracted", module: out }];
    },
  },
};

// Strict GitHub URL: https://github.com/<owner>/<repo>(.git)?/  — no IPs,
// no other hosts, no userinfo, no query/fragment. Prevents the server from
// being used to git-clone arbitrary URLs (SSRF).
const GH_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/;

function listToolIds(): string[] { return Object.keys(TOOLS); }

router.get("/scan/tools", (_req, res) => {
  res.json({
    tools: listToolIds().map((id) => ({ id, available: TOOLS[id].available() })),
  });
});

// Materialize the source the operator picked into a local directory the
// scanners can run against. Returns { dir, cleanup }.
async function materializeSource(source: { kind: string; payload: unknown }): Promise<{ dir: string; cleanup: () => void }> {
  const root = mkdtempSync(path.join(tmpdir(), "lexi-scan-"));
  const cleanup = () => { try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ } };
  if (source.kind === "workspace") {
    // Lexi may scan her own Replit project, but the `ai-chat` artifact is
    // explicitly out-of-scope for this task and for Lexi at large. Build a
    // sandboxed view of the monorepo using symlinks that mirrors every
    // top-level entry except `artifacts/ai-chat`. Scanners read through the
    // symlinks transparently; nothing outside the denylist is reachable.
    const monorepoRoot = path.resolve(process.cwd(), "../..");
    const view = path.join(root, "workspace");
    mkdirSync(view, { recursive: true });
    const DENY_TOP = new Set([".git", "node_modules"]);
    const DENY_ARTIFACTS = new Set(["ai-chat"]);
    for (const name of readdirSync(monorepoRoot)) {
      if (DENY_TOP.has(name)) continue;
      const src = path.join(monorepoRoot, name);
      if (name !== "artifacts") { symlinkSync(src, path.join(view, name)); continue; }
      const artView = path.join(view, "artifacts");
      mkdirSync(artView, { recursive: true });
      for (const child of readdirSync(src)) {
        if (DENY_ARTIFACTS.has(child)) continue;
        symlinkSync(path.join(src, child), path.join(artView, child));
      }
    }
    return { dir: view, cleanup };
  }
  if (source.kind === "github") {
    const url = String((source.payload as { url?: string })?.url || "").trim();
    if (!url) throw new Error("github source missing url");
    // Strict allowlist: only https GitHub repos, no leading dash, no whitespace,
    // limit length. Defends against git argument-injection (--upload-pack etc.)
    // and non-https transports (file://, ssh://, ext::).
    const ok =
      url.length <= 200 &&
      !url.startsWith("-") &&
      !/\s/.test(url) &&
      /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}(?:\.git)?$/.test(url);
    if (!ok) throw new Error("Repo URL rejected: must be https://github.com/owner/repo");
    const dir = path.join(root, "repo");
    // The trailing `--` ensures git treats `url` and `dir` as positionals.
    await new Promise<void>((resolve, reject) => {
      const p = spawn(
        "git",
        ["clone", "--depth", "1", "--single-branch", "--no-tags", "--", url, dir],
        { stdio: "ignore", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      );
      p.on("close", (c) => c === 0 ? resolve() : reject(new Error(`git clone exit ${c}`)));
      p.on("error", reject);
    });
    return { dir, cleanup };
  }
  if (source.kind === "zip") {
    const b64 = String((source.payload as { contentBase64?: string })?.contentBase64 || "");
    const zipPath = path.join(root, "input.zip");
    writeFileSync(zipPath, Buffer.from(b64, "base64"));
    const out = path.join(root, "unpacked");
    mkdirSync(out, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const p = spawn("unzip", ["-o", "-q", zipPath, "-d", out]);
      p.on("close", (c) => c === 0 ? resolve() : reject(new Error(`unzip exit ${c}`)));
      p.on("error", reject);
    });
    return { dir: out, cleanup };
  }
  if (source.kind === "upload") {
    // payload: { files: { name: string, contentBase64: string }[] }
    const files = (source.payload as { files?: { name: string; contentBase64: string }[] })?.files || [];
    for (const f of files) {
      const safe = f.name.replace(/\.\.+/g, ".").replace(/^\/+/, "");
      const dest = path.join(root, safe);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, Buffer.from(f.contentBase64, "base64"));
    }
    return { dir: root, cleanup };
  }
  if (source.kind === "apk") {
    const b64 = String((source.payload as { contentBase64?: string })?.contentBase64 || "");
    const name = String((source.payload as { name?: string })?.name || "input.apk");
    const dest = path.join(root, name);
    writeFileSync(dest, Buffer.from(b64, "base64"));
    return { dir: dest, cleanup }; // for apk, "dir" is the file path itself
  }
  throw new Error(`unsupported source kind: ${source.kind}`);
}

// SSE stream of per-tool events.
router.post("/scan/run", async (req: Request, res: Response) => {
  const { tools, source } = (req.body || {}) as { tools?: string[]; source?: { kind: string; payload: unknown } };
  if (!Array.isArray(tools) || tools.length === 0) {
    res.status(400).json({ error: "tools[] required" }); return;
  }
  if (!source || typeof source.kind !== "string") {
    res.status(400).json({ error: "source.kind required" }); return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let cleanup = () => {};
  try {
    const mat = await materializeSource(source);
    cleanup = mat.cleanup;
    const reportsDir = mkdtempSync(path.join(tmpdir(), "lexi-reports-"));

    // For APK sources: pre-decompile (apktool preferred, jadx fallback) so
    // every non-APK-aware tool runs against the extracted code dir, not the
    // raw .apk file. apktool/jadx tools still receive the .apk path.
    let codeDir: string = mat.dir;
    if (source.kind === "apk") {
      const out = path.join(reportsDir, "apk-extracted");
      mkdirSync(out, { recursive: true });
      let decompiled = false;
      if (which("apktool")) {
        await new Promise<void>((resolve) => {
          const p = spawn("apktool", ["d", "-f", "-o", out, mat.dir]);
          p.on("close", (c) => { decompiled = c === 0; resolve(); });
          p.on("error", () => resolve());
        });
      }
      if (!decompiled && which("jadx")) {
        await new Promise<void>((resolve) => {
          const p = spawn("jadx", ["-d", out, "--no-res", mat.dir]);
          p.on("close", (c) => { decompiled = c === 0; resolve(); });
          p.on("error", () => resolve());
        });
      }
      if (decompiled) codeDir = out;
    }
    send("ready", { reportsDir, target: mat.dir, codeDir, tools });

    await Promise.all(tools.map((tid) => new Promise<void>(async (resolve) => {
      const wrap = TOOLS[tid];
      if (!wrap) {
        send("tool", { tool: tid, status: "skipped", reason: "unknown tool — server does not implement this scanner" });
        resolve(); return;
      }
      if (!wrap.available()) {
        send("tool", { tool: tid, status: "skipped", reason: "binary not installed" });
        resolve(); return;
      }
      const target = wrap.wantsApk ? mat.dir : codeDir;
      const start = Date.now();
      send("tool", { tool: tid, status: "start" });

      // Inline runners (e.g. ai-review) bypass spawn entirely.
      if (wrap.runInline) {
        try {
          const r = await wrap.runInline(target, reportsDir, send);
          for (const f of r.findings) send("finding", { tool: tid, ...f });
          send("tool", {
            tool: tid, status: r.status,
            durationMs: Date.now() - start, findingCount: r.findings.length,
            reason: r.reason, error: r.error,
          });
        } catch (err) {
          send("tool", { tool: tid, status: "error", error: err instanceof Error ? err.message : String(err), durationMs: Date.now() - start });
        }
        resolve(); return;
      }

      const built = wrap.build?.(target, reportsDir);
      if (!built) { send("tool", { tool: tid, status: "skipped", reason: "not applicable" }); resolve(); return; }
      const proc = spawn(built.cmd, built.args, { cwd: built.cwd, env: process.env });
      let stderr = "";
      proc.stderr?.on("data", (d) => { stderr += d.toString().slice(-2048); });
      proc.on("error", (err) => {
        send("tool", { tool: tid, status: "error", error: err.message, durationMs: Date.now() - start });
        resolve();
      });
      proc.on("close", (code) => {
        const findings = wrap.parse?.(reportsDir) ?? [];
        for (const f of findings) {
          send("finding", { tool: tid, ...f });
        }
        send("tool", {
          tool: tid, status: code === 0 ? "ok" : "issues", exit: code,
          durationMs: Date.now() - start, findingCount: findings.length, stderrTail: stderr,
        });
        resolve();
      });
    })));

    send("done", { reportsDir });
  } catch (err) {
    send("error", { message: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
    cleanup();
  }
});

export default router;
