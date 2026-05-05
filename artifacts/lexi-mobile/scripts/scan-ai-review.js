#!/usr/bin/env node
// AI code review via Featherless. Walks the target directory, sends each
// source file (within a budget) to the model and parses a JSON array of
// findings out of the reply.
const fs = require("fs");
const path = require("path");
const https = require("https");
const {
  parseArgs, makeNdjsonLogger, writeReport,
} = require("./scan-shared");

const MAX_FILES = parseInt(process.env.LEXI_AI_MAX_FILES || "20", 10);
const MAX_BYTES_PER_FILE = parseInt(process.env.LEXI_AI_MAX_BYTES || "12000", 10);
const MODEL = process.env.LEXI_EXPLAIN_MODEL || "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2";
const FL_KEY = process.env.FEATHERLESS_KEY || process.env.FEATHERLESS_API_KEY || "";

const SOURCE_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|py|java|kt|swift|go|rs|rb|php|sh)$/i;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "android", "ios", ".expo", "security-reports", "assets"]);

function* walk(dir) {
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(path.join(dir, e.name));
    } else if (e.isFile() && SOURCE_EXT.test(e.name)) {
      yield path.join(dir, e.name);
    }
  }
}

function callFeatherless(payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.featherless.ai",
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FL_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = "";
      res.on("data", (d) => { buf += d.toString(); });
      res.on("end", () => {
        try { resolve({ ok: res.statusCode < 400, body: JSON.parse(buf) }); }
        catch { resolve({ ok: false, body: buf }); }
      });
    });
    req.on("error", (err) => resolve({ ok: false, body: err.message }));
    req.write(body);
    req.end();
  });
}

async function reviewFile(absPath, relPath, log) {
  const stat = fs.statSync(absPath);
  let content = fs.readFileSync(absPath, "utf8");
  if (content.length > MAX_BYTES_PER_FILE) {
    content = content.slice(0, MAX_BYTES_PER_FILE) + `\n\n[... truncated ${content.length - MAX_BYTES_PER_FILE} chars]`;
  }
  const sys = [
    "You are a senior security/code-quality reviewer.",
    "Reply with ONLY a JSON array (no markdown, no prose).",
    "Each entry: { severity:'low'|'medium'|'high'|'critical', line:number, rule:string, summary:string }.",
    "Return [] when nothing is wrong.",
  ].join("\n");
  const r = await callFeatherless({
    model: MODEL,
    messages: [{ role: "system", content: sys }, { role: "user", content: `File: ${relPath}\n\n${content}` }],
    temperature: 0.2, max_tokens: 800,
  });
  if (!r.ok) {
    log.warn("ai-review:http", { target: relPath, outputs: { error: typeof r.body === "string" ? r.body : "non-2xx" } });
    return 0;
  }
  const text = r.body?.choices?.[0]?.message?.content ?? "";
  const m = text.match(/\[\s*[\s\S]*?\]/);
  if (!m) return 0;
  let arr = [];
  try { arr = JSON.parse(m[0]); } catch { return 0; }
  let count = 0;
  for (const f of arr) {
    if (!f || typeof f !== "object") continue;
    const sev = String(f.severity || "medium").toLowerCase();
    log.warn("finding", {
      target: relPath,
      outputs: {
        severity: ["low","medium","high","critical"].includes(sev) ? sev : "medium",
        rule: String(f.rule || "ai-review"),
        line: typeof f.line === "number" ? f.line : undefined,
        summary: String(f.summary || "AI-flagged issue"),
      },
    });
    count++;
  }
  void stat;
  return count;
}

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("ai-review", reportsDir);
  log.info("scan:start", { target: targetDir });
  if (!FL_KEY) {
    log.warn("skipped", { target: "ai-review", outputs: { reason: "FEATHERLESS_KEY not set on server" } });
    writeReport(reportsDir, "ai-review.summary.json", JSON.stringify({ skipped: true }, null, 2));
    return;
  }
  const files = [];
  for (const f of walk(targetDir)) { files.push(f); if (files.length >= MAX_FILES) break; }
  let total = 0;
  for (const abs of files) {
    const rel = path.relative(targetDir, abs);
    try {
      total += await reviewFile(abs, rel, log);
    } catch (err) {
      log.warn("ai-review:exception", { target: rel, outputs: { error: err.message } });
    }
  }
  writeReport(reportsDir, "ai-review.summary.json", JSON.stringify({ files: files.length, findings: total }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
