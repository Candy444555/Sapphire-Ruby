#!/usr/bin/env node
// retire.js — JS-specific dependency vulnerability scanner. Catches
// browser-bundled libs that npm audit/OSV miss (jQuery, lodash, etc.).
// Runs via `npx --yes retire`.

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
  const log = makeNdjsonLogger("retire", reportsDir);
  log.info("scan:start", { target: targetDir });

  const findings = [];
  const hasRetire = !!which("retire");
  const hasNpx = !!which("npx");
  if (!hasRetire && !hasNpx) {
    log.warn("skipped", { target: "retire", outputs: { reason: "neither npx nor retire on PATH" } });
    writeReport(reportsDir, "retire.summary.json", {
      target: targetDir, findings: [], counts: zero(), skipped: true,
      reason: "neither npx nor retire on PATH", generatedAt: new Date().toISOString(),
    });
    return;
  }

  await log.span("retire", async () => {
    const outFile = path.join(reportsDir, "retire.json");
    const cmd = hasRetire ? "retire" : "npx";
    const args = hasRetire
      ? ["--path", targetDir, "--outputformat", "json", "--outputpath", outFile, "--exitwith", "0"]
      : ["--yes", "retire", "--path", targetDir, "--outputformat", "json", "--outputpath", outFile, "--exitwith", "0"];
    const r = runCmd(cmd, args, { cwd: targetDir, log, logAction: "retire", timeoutMs: 10 * 60 * 1000 });

    if (!fs.existsSync(outFile)) {
      writeReport(reportsDir, "retire.json", r.stdout || r.stderr || "{}");
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(outFile, "utf8"));
      const data = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : [];
      for (const entry of data) {
        for (const res of entry.results || []) {
          for (const v of res.vulnerabilities || []) {
            const sev = (v.severity || "moderate").toLowerCase();
            findings.push({
              tool: "retire", severity: sev,
              id: (v.identifiers && (v.identifiers.CVE?.[0] || v.identifiers.summary)) || res.component,
              module: `${res.component}@${res.version}`,
              title: (v.identifiers && v.identifiers.summary) || (v.info && v.info[0]),
              url: v.info && v.info[0],
            });
            log.warn("finding", { target: res.component, outputs: { severity: sev, version: res.version, id: v.identifiers?.CVE?.[0] } });
          }
        }
      }
    } catch (err) {
      log.warn("parse-failed", { target: "retire", outputs: { exit: r.code, error: err && err.message } });
    }
  }, { target: targetDir });

  writeReport(reportsDir, "retire.summary.json", {
    target: targetDir, findings, counts: countSeverities(findings),
    generatedAt: new Date().toISOString(),
  });
  log.info("scan:end", { target: targetDir, outputs: { findings: findings.length, counts: countSeverities(findings) } });
  if (findings.some((f) => isHighOrCritical(f.severity))) process.exitCode = 1;
}

function zero() { return { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }; }
function countSeverities(findings) {
  const c = zero();
  for (const f of findings) {
    const s = (f.severity || "").toLowerCase();
    const k = s === "medium" ? "moderate" : s;
    if (c[k] != null) c[k]++;
  }
  return c;
}

main().catch((err) => { console.error("scan-retire failed:", err); process.exit(1); });
