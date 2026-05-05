#!/usr/bin/env node
// Nuclei wrapper (template-based). Skipped if `nuclei` is not installed.
const fs = require("fs");
const path = require("path");
const {
  parseArgs, makeNdjsonLogger, which, runCmd, writeReport, isHighOrCritical,
} = require("./scan-shared");

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("nuclei", reportsDir);
  log.info("scan:start", { target: targetDir });
  const findings = [];
  const bin = which("nuclei");
  if (!bin) {
    log.warn("skipped", { target: "nuclei", outputs: { reason: "binary not found" } });
    writeReport(reportsDir, "nuclei.summary.json", { target: targetDir, findings: [], skipped: true, reason: "nuclei not installed", generatedAt: new Date().toISOString() });
    return;
  }
  await log.span("nuclei", async () => {
    const out = path.join(reportsDir, "nuclei.jsonl");
    runCmd("nuclei", [
      "-target", targetDir,
      "-jsonl", "-o", out,
      "-silent", "-disable-update-check"
    ], { log, logAction: "nuclei", timeoutMs: 15 * 60 * 1000 });
    if (!fs.existsSync(out)) return;
    for (const line of fs.readFileSync(out, "utf8").split("\n")) {
      const t = line.trim(); if (!t) continue;
      try {
        const j = JSON.parse(t);
        const f = {
          id: j["template-id"] || j.templateID,
          severity: String(j.info?.severity || "low").toLowerCase(),
          title: j.info?.name, module: j["matched-at"] || j.host,
          url: (j.info?.reference || [])[0],
        };
        findings.push(f);
        log[isHighOrCritical(f.severity) ? "warn" : "info"]("finding", { target: f.module, outputs: f });
      } catch { /* ignore */ }
    }
  });
  writeReport(reportsDir, "nuclei.summary.json", { target: targetDir, findings, generatedAt: new Date().toISOString() });
  log.info("scan:end", { target: targetDir, outputs: { count: findings.length } });
}

main().catch((err) => { console.error(err); process.exit(1); });
