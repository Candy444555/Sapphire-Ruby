#!/usr/bin/env node
// njsscan — Node.js SAST from MobSF Labs. Detects insecure code patterns
// (eval, child_process, weak crypto, prototype pollution sinks, etc.).
// Requires `njsscan` (pip) on PATH. Skipped/logged if missing.

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

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("njsscan", reportsDir);
  log.info("scan:start", { target: targetDir });

  const findings = [];
  const njs = which("njsscan");
  if (!njs) {
    log.warn("skipped", { target: "njsscan", outputs: { reason: "binary not found (pip install njsscan)" } });
    writeReport(reportsDir, "njsscan.summary.json", {
      target: targetDir, findings: [], counts: zero(), skipped: true,
      reason: "njsscan binary not installed", generatedAt: new Date().toISOString(),
    });
    return;
  }

  await log.span("njsscan", async () => {
    const outFile = path.join(reportsDir, "njsscan.json");
    const r = runCmd("njsscan", [
      "--json", "-o", outFile, targetDir,
    ], { cwd: targetDir, log, logAction: "njsscan", timeoutMs: 10 * 60 * 1000 });

    if (!fs.existsSync(outFile)) {
      writeReport(reportsDir, "njsscan.json", r.stdout || r.stderr || "{}");
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(outFile, "utf8"));
      const buckets = parsed.nodejs || parsed.results?.nodejs || {};
      for (const [ruleId, rule] of Object.entries(buckets)) {
        const sev = (rule?.metadata?.severity || "warning").toLowerCase();
        const norm = sev === "warning" ? "moderate" : sev === "error" ? "high" : sev;
        for (const f of rule.files || []) {
          findings.push({
            tool: "njsscan", severity: norm, id: ruleId,
            module: f.file_path, title: rule?.metadata?.description || ruleId,
            url: rule?.metadata?.reference,
          });
          log.warn("finding", { target: f.file_path, outputs: { id: ruleId, severity: sev, line: f.match_lines } });
        }
      }
    } catch (err) {
      log.warn("parse-failed", { target: "njsscan", outputs: { exit: r.code, error: err && err.message } });
    }
  }, { target: targetDir });

  writeReport(reportsDir, "njsscan.summary.json", {
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

main().catch((err) => { console.error("scan-njsscan failed:", err); process.exit(1); });
