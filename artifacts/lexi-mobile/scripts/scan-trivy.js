#!/usr/bin/env node
// Trivy filesystem scanner.
// Single binary that finds: vulnerabilities (deps), secrets, IaC misconfig,
// and license issues. Skipped (logged) if `trivy` is not installed.

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
  const log = makeNdjsonLogger("trivy", reportsDir);
  log.info("scan:start", { target: targetDir });

  const findings = [];
  const trivy = which("trivy");
  if (!trivy) {
    log.warn("skipped", { target: "trivy", outputs: { reason: "binary not found" } });
    writeReport(reportsDir, "trivy.summary.json", {
      target: targetDir, findings: [], counts: zeroCounts(),
      skipped: true, reason: "trivy binary not installed",
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  await log.span("trivy-fs", async () => {
    const outFile = path.join(reportsDir, "trivy.fs.json");
    const r = runCmd("trivy", [
      "fs",
      "--scanners", "vuln,secret,misconfig,license",
      "--format", "json",
      "--output", outFile,
      "--quiet",
      targetDir,
    ], { cwd: targetDir, log, logAction: "trivy-fs", timeoutMs: 10 * 60 * 1000 });

    if (!fs.existsSync(outFile)) {
      writeReport(reportsDir, "trivy.fs.json", r.stdout || r.stderr || "{}");
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(outFile, "utf8"));
      for (const result of parsed.Results || []) {
        for (const v of result.Vulnerabilities || []) {
          findings.push({
            tool: "trivy", kind: "vuln",
            severity: (v.Severity || "").toLowerCase(),
            id: v.VulnerabilityID, module: v.PkgName,
            title: v.Title || v.Description, url: v.PrimaryURL,
          });
          log.warn("finding", { target: v.PkgName, outputs: { id: v.VulnerabilityID, severity: v.Severity, title: v.Title } });
        }
        for (const s of result.Secrets || []) {
          findings.push({ tool: "trivy", kind: "secret", severity: (s.Severity || "high").toLowerCase(), id: s.RuleID, module: result.Target, title: s.Title });
          log.warn("finding", { target: result.Target, outputs: { id: s.RuleID, severity: s.Severity, title: s.Title } });
        }
        for (const m of result.Misconfigurations || []) {
          findings.push({ tool: "trivy", kind: "misconfig", severity: (m.Severity || "").toLowerCase(), id: m.ID, module: result.Target, title: m.Title });
          log.warn("finding", { target: result.Target, outputs: { id: m.ID, severity: m.Severity, title: m.Title } });
        }
        for (const l of result.Licenses || []) {
          findings.push({ tool: "trivy", kind: "license", severity: (l.Severity || "low").toLowerCase(), id: l.Name, module: l.PkgName, title: `License ${l.Name}` });
        }
      }
    } catch (err) {
      log.warn("parse-failed", { target: "trivy", outputs: { exit: r.code, error: err && err.message } });
    }
  }, { target: targetDir });

  writeReport(reportsDir, "trivy.summary.json", {
    target: targetDir, findings, counts: countSeverities(findings),
    generatedAt: new Date().toISOString(),
  });
  log.info("scan:end", { target: targetDir, outputs: { findings: findings.length, counts: countSeverities(findings) } });
  if (findings.some((f) => isHighOrCritical(f.severity))) process.exitCode = 1;
}

function zeroCounts() { return { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }; }
function countSeverities(findings) {
  const c = zeroCounts();
  for (const f of findings) {
    const s = (f.severity || "").toLowerCase();
    const k = s === "medium" ? "moderate" : s === "unknown" ? "info" : s;
    if (c[k] != null) c[k]++;
  }
  return c;
}

main().catch((err) => { console.error("scan-trivy failed:", err); process.exit(1); });
