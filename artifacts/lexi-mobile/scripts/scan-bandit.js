#!/usr/bin/env node
// Bandit (Python SAST) wrapper. Skipped if `bandit` is not installed.
const fs = require("fs");
const path = require("path");
const {
  parseArgs, makeNdjsonLogger, which, runCmd, writeReport, isHighOrCritical,
} = require("./scan-shared");

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("bandit", reportsDir);
  log.info("scan:start", { target: targetDir });
  const findings = [];
  const bin = which("bandit");
  if (!bin) {
    log.warn("skipped", { target: "bandit", outputs: { reason: "binary not found" } });
    writeReport(reportsDir, "bandit.summary.json", { target: targetDir, findings: [], skipped: true, reason: "bandit not installed", generatedAt: new Date().toISOString() });
    return;
  }
  await log.span("bandit", async () => {
    const out = path.join(reportsDir, "bandit.json");
    runCmd("bandit", ["-q", "-r", targetDir, "-f", "json", "-o", out, "--exit-zero"], { log, logAction: "bandit", timeoutMs: 10 * 60 * 1000 });
    if (!fs.existsSync(out)) return;
    try {
      const j = JSON.parse(fs.readFileSync(out, "utf8"));
      for (const r of j.results || []) {
        const f = {
          id: r.test_id,
          severity: String(r.issue_severity || "low").toLowerCase(),
          confidence: String(r.issue_confidence || "low").toLowerCase(),
          title: r.issue_text,
          module: `${r.filename}:${r.line_number}`,
          url: r.more_info,
        };
        findings.push(f);
        log[isHighOrCritical(f.severity) ? "warn" : "info"]("finding", { target: f.module, outputs: f });
      }
    } catch (err) { log.error("parse-failed", { error: { message: err.message } }); }
  });
  writeReport(reportsDir, "bandit.summary.json", { target: targetDir, findings, generatedAt: new Date().toISOString() });
  log.info("scan:end", { target: targetDir, outputs: { count: findings.length } });
}

main().catch((err) => { console.error(err); process.exit(1); });
