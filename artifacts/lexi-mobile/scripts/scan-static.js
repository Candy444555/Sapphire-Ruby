#!/usr/bin/env node
// Static analysis: ESLint (with eslint-plugin-security) + Semgrep.
// Outputs SARIF + NDJSON.

const fs = require("fs");
const path = require("path");
const {
  parseArgs,
  makeNdjsonLogger,
  runCmd,
  writeReport,
  which,
  isHighOrCritical,
} = require("./scan-shared");

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("static", reportsDir);
  log.info("scan:start", { target: targetDir });

  const findings = [];

  await log.span("eslint", async () => {
    // ESLint v9 uses flat config by default; --no-eslintrc and --ext were
    // removed. We point at our standalone flat config and let it determine
    // file patterns from the `files` glob inside the config.
    const cfg = path.resolve(__dirname, "../eslint.security.config.cjs");
    const out = path.join(reportsDir, "static.eslint.json");
    const r = runCmd(
      "npx",
      [
        "--yes",
        "--package", "eslint@^9",
        "--package", "eslint-plugin-security@^3",
        "--",
        "eslint",
        "--config", cfg,
        "--format", "json",
        "--output-file", out,
        targetDir,
      ],
      { cwd: targetDir, timeoutMs: 10 * 60 * 1000, env: { ...process.env, ESLINT_USE_FLAT_CONFIG: "true" } },
    );
    if (!fs.existsSync(out)) writeReport(reportsDir, "static.eslint.json", r.stdout || "[]");
    try {
      const parsed = JSON.parse(fs.readFileSync(out, "utf8"));
      for (const file of parsed || []) {
        for (const m of file.messages || []) {
          findings.push({
            tool: "eslint",
            severity: m.severity === 2 ? "high" : "moderate",
            file: file.filePath,
            line: m.line,
            rule: m.ruleId,
            message: m.message,
          });
          log.warn("finding", {
            target: file.filePath,
            outputs: { rule: m.ruleId, line: m.line, severity: m.severity },
          });
        }
      }
    } catch {
      log.warn("parse-failed", { target: "eslint", outputs: { exit: r.code } });
    }
  }, { target: targetDir });

  const semgrepBin = which("semgrep");
  if (semgrepBin || which("npx")) {
    await log.span("semgrep", async () => {
      const sarifOut = path.join(reportsDir, "static.semgrep.sarif");
      const jsonOut = path.join(reportsDir, "static.semgrep.json");
      // Semgrep accepts only one output format per invocation reliably across
      // versions, so run twice: once for SARIF (CI / GitHub code scanning),
      // once for JSON (parsed below into findings).
      const baseConfigs = [
        "--config", "p/javascript",
        "--config", "p/react",
        "--config", "p/typescript",
        "--config", "p/secrets",
        "--config", "p/owasp-top-ten",
        "--metrics", "off",
        "--error", // exit non-zero if blocking findings
        targetDir,
      ];
      const exec = (extra) =>
        semgrepBin
          ? runCmd("semgrep", [...extra, ...baseConfigs], { timeoutMs: 15 * 60 * 1000 })
          : runCmd("npx", ["--yes", "semgrep", ...extra, ...baseConfigs], { timeoutMs: 15 * 60 * 1000 });
      const sarifR = exec(["--sarif", "--output", sarifOut]);
      if (!fs.existsSync(sarifOut)) writeReport(reportsDir, "static.semgrep.sarif", sarifR.stdout || "{}");
      const jsonR = exec(["--json", "--output", jsonOut]);
      if (!fs.existsSync(jsonOut)) writeReport(reportsDir, "static.semgrep.json", jsonR.stdout || "{}");
      const r = jsonR;
      try {
        if (fs.existsSync(jsonOut)) {
          const parsed = JSON.parse(fs.readFileSync(jsonOut, "utf8"));
          for (const f of parsed.results || []) {
            const sev = (f.extra && f.extra.severity) || "moderate";
            findings.push({
              tool: "semgrep",
              severity: sev.toLowerCase() === "error" ? "high" : sev.toLowerCase(),
              file: f.path,
              line: f.start && f.start.line,
              rule: f.check_id,
              message: (f.extra && f.extra.message) || f.check_id,
            });
            log.warn("finding", {
              target: f.path,
              outputs: { rule: f.check_id, line: f.start && f.start.line, severity: sev },
            });
          }
        }
      } catch {
        log.warn("parse-failed", { target: "semgrep", outputs: { exit: r.code } });
      }
    }, { target: targetDir });
  } else {
    log.warn("skipped", { target: "semgrep", outputs: { reason: "binary not found" } });
  }

  writeReport(reportsDir, "static.summary.json", {
    target: targetDir,
    findings,
    generatedAt: new Date().toISOString(),
  });
  log.info("scan:end", { target: targetDir, outputs: { findings: findings.length } });
  if (findings.some((f) => isHighOrCritical(f.severity))) process.exitCode = 1;
}

main().catch((err) => {
  console.error("scan-static failed:", err);
  process.exit(1);
});
