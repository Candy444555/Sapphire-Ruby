#!/usr/bin/env node
// bandit — Python security linter. Skipped if binary not found.
const fs = require("fs");
const path = require("path");
const {
  parseArgs, makeNdjsonLogger, which, runCmd, writeReport,
} = require("./scan-shared");

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("bandit", reportsDir);
  log.info("scan:start", { target: targetDir });
  if (!which("bandit")) {
    log.warn("skipped", { target: "bandit", outputs: { reason: "binary not found" } });
    writeReport(reportsDir, "bandit.summary.json", JSON.stringify({ skipped: true }, null, 2));
    return;
  }
  await log.span("bandit", async () => {
    const out = path.join(reportsDir, "bandit.json");
    runCmd("bandit", ["-r", targetDir, "-f", "json", "-o", out, "-q", "--exit-zero"]);
    if (!fs.existsSync(out)) {
      log.warn("no-output", { target: "bandit" });
      return;
    }
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(out, "utf8")); }
    catch (e) { log.warn("parse-failed", { target: "bandit", outputs: { error: e.message } }); return; }
    const results = parsed.results || [];
    let count = 0;
    for (const r of results) {
      const sev = String(r.issue_severity || "MEDIUM").toLowerCase();
      log.warn("finding", {
        target: r.filename,
        outputs: {
          severity: sev,
          rule: r.test_id,
          line: r.line_number,
          summary: r.issue_text,
          confidence: r.issue_confidence,
        },
      });
      count++;
    }
    writeReport(reportsDir, "bandit.summary.json", JSON.stringify({ count, results: results.length }, null, 2));
  }, { target: targetDir });
}

main().catch((err) => { console.error(err); process.exit(1); });
