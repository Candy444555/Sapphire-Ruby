#!/usr/bin/env node
// Bearer SAST + sensitive-data-flow scanner for JS/TS.
// Skipped (logged) if `bearer` is not installed.

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
  const log = makeNdjsonLogger("bearer", reportsDir);
  log.info("scan:start", { target: targetDir });

  const findings = [];
  const bearer = which("bearer");
  if (!bearer) {
    log.warn("skipped", { target: "bearer", outputs: { reason: "binary not found" } });
    writeReport(reportsDir, "bearer.summary.json", {
      target: targetDir, findings: [], counts: zero(), skipped: true,
      reason: "bearer binary not installed", generatedAt: new Date().toISOString(),
    });
    return;
  }

  await log.span("bearer-scan", async () => {
    const outFile = path.join(reportsDir, "bearer.json");
    const r = runCmd("bearer", [
      "scan", targetDir,
      "--format", "json",
      "--output", outFile,
      "--quiet",
      "--exit-code", "0",
    ], { cwd: targetDir, log, logAction: "bearer-scan", timeoutMs: 15 * 60 * 1000 });

    if (!fs.existsSync(outFile)) {
      writeReport(reportsDir, "bearer.json", r.stdout || r.stderr || "{}");
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(outFile, "utf8"));
      for (const sev of ["critical", "high", "medium", "low", "warning"]) {
        for (const f of parsed[sev] || []) {
          const norm = sev === "medium" ? "moderate" : sev === "warning" ? "low" : sev;
          findings.push({
            tool: "bearer", severity: norm,
            id: f.id || f.cwe_ids?.[0],
            module: f.filename, title: f.title || f.description,
            url: f.documentation_url,
          });
          log.warn("finding", { target: f.filename, outputs: { id: f.id, severity: sev, title: f.title } });
        }
      }
    } catch (err) {
      log.warn("parse-failed", { target: "bearer", outputs: { exit: r.code, error: err && err.message } });
    }
  }, { target: targetDir });

  writeReport(reportsDir, "bearer.summary.json", {
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

main().catch((err) => { console.error("scan-bearer failed:", err); process.exit(1); });
