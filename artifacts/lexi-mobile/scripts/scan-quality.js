#!/usr/bin/env node
// Code-quality / latent-bug scanner. Bundles three sub-tools:
//   - knip            : unused files, exports, dependencies, types
//   - madge --circular: circular import cycles (real runtime bugs)
//   - lockfile-lint   : lockfile integrity / supply-chain
// All invoked via npx; each sub-tool gets its own NDJSON span and report.

const fs = require("fs");
const path = require("path");
const {
  parseArgs,
  makeNdjsonLogger,
  which,
  runCmd,
  writeReport,
} = require("./scan-shared");

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("quality", reportsDir);
  log.info("scan:start", { target: targetDir });

  const findings = [];

  if (!which("npx")) {
    log.warn("skipped", { target: "quality", outputs: { reason: "npx not on PATH" } });
    writeReport(reportsDir, "quality.summary.json", {
      target: targetDir, findings: [], counts: zero(), skipped: true,
      reason: "npx missing", generatedAt: new Date().toISOString(),
    });
    return;
  }

  await log.span("knip", async () => {
    const r = runCmd("npx", ["--yes", "knip", "--reporter", "json", "--no-exit-code"], {
      cwd: targetDir, log, logAction: "knip", timeoutMs: 5 * 60 * 1000,
    });
    writeReport(reportsDir, "quality.knip.json", r.stdout || r.stderr || "{}");
    try {
      const parsed = JSON.parse(r.stdout || "{}");
      for (const issue of parsed.issues || []) {
        for (const kind of ["files", "dependencies", "devDependencies", "exports", "types", "duplicates"]) {
          for (const item of issue[kind] || []) {
            const name = typeof item === "string" ? item : item.name || JSON.stringify(item);
            findings.push({ tool: "knip", severity: "low", id: kind, module: issue.file || name, title: `unused ${kind}: ${name}` });
            log.info("finding", { target: issue.file || name, outputs: { kind, name } });
          }
        }
      }
    } catch {
      log.warn("parse-failed", { target: "knip", outputs: { exit: r.code } });
    }
  }, { target: targetDir });

  await log.span("madge-circular", async () => {
    const r = runCmd("npx", [
      "--yes", "madge", targetDir,
      "--circular", "--json",
      "--extensions", "ts,tsx,js,jsx,mjs,cjs",
      "--exclude", "node_modules|dist|build|\\.expo|android|ios",
    ], { cwd: targetDir, log, logAction: "madge-circular", timeoutMs: 5 * 60 * 1000 });
    writeReport(reportsDir, "quality.madge.circular.json", r.stdout || r.stderr || "[]");
    try {
      const cycles = JSON.parse(r.stdout || "[]");
      for (const cycle of cycles) {
        findings.push({
          tool: "madge", severity: "moderate", id: "circular-dependency",
          module: cycle[0], title: `circular import: ${cycle.join(" → ")}`,
        });
        log.warn("finding", { target: cycle[0], outputs: { cycle } });
      }
    } catch {
      log.warn("parse-failed", { target: "madge", outputs: { exit: r.code } });
    }
  }, { target: targetDir });

  await log.span("lockfile-lint", async () => {
    const repoRoot = path.resolve(targetDir, "..", "..");
    const lock = path.join(repoRoot, "pnpm-lock.yaml");
    if (!fs.existsSync(lock)) {
      log.warn("skipped", { target: "lockfile-lint", outputs: { reason: "pnpm-lock.yaml not found" } });
      return;
    }
    const r = runCmd("npx", [
      "--yes", "lockfile-lint",
      "--path", lock,
      "--type", "pnpm",
      "--validate-https",
      "--allowed-hosts", "npm",
      "--allowed-hosts", "yarn",
      "--format", "json",
    ], { cwd: targetDir, log, logAction: "lockfile-lint", timeoutMs: 2 * 60 * 1000 });
    writeReport(reportsDir, "quality.lockfile-lint.json", r.stdout || r.stderr || "{}");
    if (r.code !== 0) {
      findings.push({
        tool: "lockfile-lint", severity: "high",
        id: "lockfile-integrity", module: lock,
        title: "Lockfile integrity check failed — see quality.lockfile-lint.json",
      });
      log.warn("finding", { target: lock, outputs: { exit: r.code } });
    }
  }, { target: targetDir });

  writeReport(reportsDir, "quality.summary.json", {
    target: targetDir, findings, counts: countSeverities(findings),
    generatedAt: new Date().toISOString(),
  });
  log.info("scan:end", { target: targetDir, outputs: { findings: findings.length, counts: countSeverities(findings) } });
}

function zero() { return { critical: 0, high: 0, moderate: 0, low: 0, info: 0 }; }
function countSeverities(findings) {
  const c = zero();
  for (const f of findings) { const s = (f.severity || "").toLowerCase(); if (c[s] != null) c[s]++; }
  return c;
}

main().catch((err) => { console.error("scan-quality failed:", err); process.exit(1); });
