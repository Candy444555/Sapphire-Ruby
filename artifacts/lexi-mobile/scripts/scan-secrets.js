#!/usr/bin/env node
// Secret scanner. Runs gitleaks + trufflehog filesystem against the target.
// Both binaries are optional — missing tools are reported as skipped.

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
  const log = makeNdjsonLogger("secrets", reportsDir);
  log.info("scan:start", { target: targetDir });

  const findings = [];

  if (which("gitleaks")) {
    await log.span("gitleaks", async () => {
      const out = path.join(reportsDir, "secrets.gitleaks.json");
      const r = runCmd("gitleaks", [
        "detect", "--no-git", "--source", targetDir,
        "--report-format", "json", "--report-path", out,
      ]);
      if (!fs.existsSync(out)) writeReport(reportsDir, "secrets.gitleaks.json", r.stdout || "[]");
      try {
        const parsed = JSON.parse(fs.readFileSync(out, "utf8"));
        for (const f of parsed || []) {
          findings.push({
            tool: "gitleaks",
            severity: "high",
            file: f.File || f.file,
            line: f.StartLine || f.startLine,
            rule: f.RuleID || f.ruleID,
            description: f.Description || f.description,
          });
          log.warn("finding", {
            target: f.File || f.file,
            outputs: { rule: f.RuleID || f.ruleID, line: f.StartLine || f.startLine },
          });
        }
      } catch {
        log.warn("parse-failed", { target: "gitleaks", outputs: { exit: r.code } });
      }
    }, { target: targetDir });
  } else {
    log.warn("skipped", { target: "gitleaks", outputs: { reason: "binary not found" } });
  }

  if (which("trufflehog")) {
    await log.span("trufflehog", async () => {
      const r = runCmd("trufflehog", ["filesystem", targetDir, "--json", "--no-update"]);
      writeReport(reportsDir, "secrets.trufflehog.ndjson", r.stdout);
      let count = 0;
      for (const line of (r.stdout || "").split("\n")) {
        const t = line.trim();
        if (!t) continue;
        try {
          const ev = JSON.parse(t);
          findings.push({
            tool: "trufflehog",
            severity: ev.Verified ? "critical" : "high",
            file: ev.SourceMetadata && ev.SourceMetadata.Data && ev.SourceMetadata.Data.Filesystem && ev.SourceMetadata.Data.Filesystem.file,
            rule: ev.DetectorName,
            verified: !!ev.Verified,
          });
          count++;
          log.warn("finding", {
            target: ev.SourceMetadata && ev.SourceMetadata.Data && ev.SourceMetadata.Data.Filesystem && ev.SourceMetadata.Data.Filesystem.file,
            outputs: { detector: ev.DetectorName, verified: !!ev.Verified },
          });
        } catch {
          /* skip */
        }
      }
      log.info("trufflehog:counts", { outputs: { matches: count } });
    }, { target: targetDir });
  } else {
    log.warn("skipped", { target: "trufflehog", outputs: { reason: "binary not found" } });
  }

  writeReport(reportsDir, "secrets.summary.json", {
    target: targetDir,
    findings,
    generatedAt: new Date().toISOString(),
  });
  log.info("scan:end", { target: targetDir, outputs: { findings: findings.length } });
  if (findings.some((f) => isHighOrCritical(f.severity))) process.exitCode = 1;
}

main().catch((err) => {
  console.error("scan-secrets failed:", err);
  process.exit(1);
});
