#!/usr/bin/env node
// Dependency / supply-chain scanner.
// Runs:
//   - pnpm audit --audit-level=low
//   - npx osv-scanner against the lockfile (skipped if osv-scanner unavailable)
//   - npx snyk test (gated on SNYK_TOKEN)
// All output is normalised into JSON + NDJSON events.

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
  const log = makeNdjsonLogger("deps", reportsDir);
  log.info("scan:start", { target: targetDir });

  const findings = [];

  await log.span("pnpm-audit", async () => {
    const r = runCmd("pnpm", ["audit", "--audit-level=low", "--json"], { cwd: targetDir });
    writeReport(reportsDir, "deps.pnpm-audit.json", r.stdout || r.stderr || "{}");
    try {
      const parsed = JSON.parse(r.stdout || "{}");
      if (parsed && parsed.advisories) {
        for (const adv of Object.values(parsed.advisories)) {
          findings.push({
            tool: "pnpm-audit",
            severity: adv.severity,
            id: adv.id || adv.github_advisory_id,
            module: adv.module_name,
            title: adv.title,
            url: adv.url,
          });
          log.warn("finding", {
            target: adv.module_name,
            outputs: { severity: adv.severity, id: adv.id, title: adv.title },
          });
        }
      }
    } catch {
      log.warn("parse-failed", { target: "pnpm-audit", outputs: { exit: r.code } });
    }
  }, { target: targetDir });

  if (which("osv-scanner") || which("npx")) {
    await log.span("osv-scanner", async () => {
      const lock = path.join(targetDir, "..", "..", "pnpm-lock.yaml");
      const lockArg = fs.existsSync(lock) ? lock : path.join(targetDir, "package.json");
      const r = runCmd("npx", ["--yes", "osv-scanner", "--lockfile", lockArg, "--format", "json"], {
        cwd: targetDir,
      });
      writeReport(reportsDir, "deps.osv-scanner.json", r.stdout || r.stderr || "{}");
      try {
        const parsed = JSON.parse(r.stdout || "{}");
        for (const result of parsed.results || []) {
          for (const pkg of result.packages || []) {
            for (const v of pkg.vulnerabilities || []) {
              findings.push({
                tool: "osv-scanner",
                severity: (v.database_specific && v.database_specific.severity) || "moderate",
                id: v.id,
                module: pkg.package && pkg.package.name,
                title: v.summary,
                url: (v.references && v.references[0] && v.references[0].url) || null,
              });
              log.warn("finding", {
                target: pkg.package && pkg.package.name,
                outputs: { id: v.id, summary: v.summary },
              });
            }
          }
        }
      } catch {
        log.warn("parse-failed", { target: "osv-scanner", outputs: { exit: r.code } });
      }
    }, { target: targetDir });
  } else {
    log.warn("skipped", { target: "osv-scanner", outputs: { reason: "binary not found" } });
  }

  if (process.env.SNYK_TOKEN) {
    await log.span("snyk-test", async () => {
      const r = runCmd("npx", ["--yes", "snyk", "test", "--json", "--all-projects"], { cwd: targetDir });
      writeReport(reportsDir, "deps.snyk.json", r.stdout || r.stderr || "{}");
      try {
        const parsed = JSON.parse(r.stdout || "{}");
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const proj of arr) {
          for (const v of proj.vulnerabilities || []) {
            findings.push({
              tool: "snyk",
              severity: v.severity,
              id: v.id,
              module: v.packageName,
              title: v.title,
              url: v.url,
            });
            log.warn("finding", {
              target: v.packageName,
              outputs: { id: v.id, severity: v.severity, title: v.title },
            });
          }
        }
      } catch {
        log.warn("parse-failed", { target: "snyk", outputs: { exit: r.code } });
      }
    }, { target: targetDir });
  } else {
    log.warn("skipped", { target: "snyk", outputs: { reason: "SNYK_TOKEN not set" } });
  }

  await log.span("expo-doctor", async () => {
    const r = runCmd("npx", ["--yes", "expo-doctor"], { cwd: targetDir });
    writeReport(reportsDir, "deps.expo-doctor.txt", r.stdout + "\n" + r.stderr);
    if (r.code !== 0) {
      findings.push({
        tool: "expo-doctor",
        severity: "moderate",
        title: "expo-doctor reported issues — see deps.expo-doctor.txt",
      });
      log.warn("finding", { target: targetDir, outputs: { exit: r.code } });
    }
  }, { target: targetDir });

  writeReport(reportsDir, "deps.summary.json", {
    target: targetDir,
    findings,
    counts: countSeverities(findings),
    generatedAt: new Date().toISOString(),
  });
  log.info("scan:end", {
    target: targetDir,
    outputs: { findings: findings.length, counts: countSeverities(findings) },
  });

  if (findings.some((f) => isHighOrCritical(f.severity))) process.exitCode = 1;
}

function countSeverities(findings) {
  const c = { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
  for (const f of findings) {
    const s = (f.severity || "").toLowerCase();
    if (c[s] != null) c[s]++;
  }
  return c;
}

main().catch((err) => {
  console.error("scan-deps failed:", err);
  process.exit(1);
});
