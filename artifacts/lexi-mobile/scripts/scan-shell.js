#!/usr/bin/env node
// shellcheck — finds bugs and footguns in shell scripts under the target.
// Skipped (logged) if `shellcheck` is not installed.

const fs = require("fs");
const path = require("path");
const {
  parseArgs,
  makeNdjsonLogger,
  which,
  runCmd,
  writeReport,
  isHighOrCritical,
} = require("./scan-shared");

function listShellScripts(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" ||
        e.name === "build" || e.name === ".expo" || e.name === "android" ||
        e.name === "ios" || e.name === "security-reports") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listShellScripts(full, out);
    else if (e.isFile() && /\.(sh|bash)$/.test(e.name)) out.push(full);
  }
  return out;
}

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("shell", reportsDir);
  log.info("scan:start", { target: targetDir });

  const findings = [];
  const sc = which("shellcheck");
  if (!sc) {
    log.warn("skipped", { target: "shellcheck", outputs: { reason: "binary not found" } });
    writeReport(reportsDir, "shell.summary.json", {
      target: targetDir, findings: [], counts: zero(), skipped: true,
      reason: "shellcheck binary not installed", generatedAt: new Date().toISOString(),
    });
    return;
  }

  const scripts = listShellScripts(targetDir);
  log.info("discover", { target: targetDir, outputs: { scriptCount: scripts.length } });
  if (scripts.length === 0) {
    writeReport(reportsDir, "shell.summary.json", {
      target: targetDir, findings: [], counts: zero(), generatedAt: new Date().toISOString(),
    });
    log.info("scan:end", { target: targetDir, outputs: { findings: 0 } });
    return;
  }

  await log.span("shellcheck", async () => {
    const r = runCmd("shellcheck", ["--format=json", "--severity=info", ...scripts], {
      cwd: targetDir, log, logAction: "shellcheck", timeoutMs: 5 * 60 * 1000,
    });
    writeReport(reportsDir, "shell.shellcheck.json", r.stdout || r.stderr || "[]");
    try {
      const parsed = JSON.parse(r.stdout || "[]");
      for (const issue of parsed) {
        const sev = (issue.level || "info").toLowerCase();
        const norm = sev === "warning" ? "moderate" : sev === "style" ? "low" : sev === "error" ? "high" : sev;
        findings.push({
          tool: "shellcheck", severity: norm,
          id: `SC${issue.code}`, module: `${issue.file}:${issue.line}`,
          title: issue.message,
          url: `https://www.shellcheck.net/wiki/SC${issue.code}`,
        });
        log.warn("finding", { target: issue.file, outputs: { id: `SC${issue.code}`, line: issue.line, message: issue.message } });
      }
    } catch (err) {
      log.warn("parse-failed", { target: "shellcheck", outputs: { exit: r.code, error: err && err.message } });
    }
  }, { target: targetDir });

  writeReport(reportsDir, "shell.summary.json", {
    target: targetDir, findings, counts: countSeverities(findings),
    generatedAt: new Date().toISOString(),
  });
  log.info("scan:end", { target: targetDir, outputs: { findings: findings.length, counts: countSeverities(findings) } });
  if (findings.some((f) => isHighOrCritical(f.severity))) process.exitCode = 1;
}

function zero() { return { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }; }
function countSeverities(findings) {
  const c = zero();
  for (const f of findings) { const s = (f.severity || "").toLowerCase(); if (c[s] != null) c[s]++; }
  return c;
}

main().catch((err) => { console.error("scan-shell failed:", err); process.exit(1); });
