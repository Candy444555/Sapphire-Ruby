#!/usr/bin/env node
// apktool + jadx APK decompile pipeline. Output goes into <reportsDir>/apktool-out
// and <reportsDir>/jadx-out so downstream scanners (semgrep, secrets, ai-review)
// can run against the extracted sources. Pass --apk <file>.
const fs = require("fs");
const path = require("path");
const {
  parseArgs, makeNdjsonLogger, which, runCmd, writeReport,
} = require("./scan-shared");

function findApkArg(argv) {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--apk") return argv[i + 1];
    if (argv[i].startsWith("--apk=")) return argv[i].slice("--apk=".length);
  }
  return null;
}

async function main() {
  const { reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("decompile", reportsDir);
  const apk = findApkArg(process.argv);
  if (!apk || !fs.existsSync(apk)) {
    log.warn("skipped", { target: "decompile", outputs: { reason: "no --apk" } });
    writeReport(reportsDir, "decompile.summary.json", { findings: [], skipped: true, reason: "no APK supplied", generatedAt: new Date().toISOString() });
    return;
  }
  log.info("scan:start", { target: apk });
  const findings = [];
  if (which("apktool")) {
    const out = path.join(reportsDir, "apktool-out");
    runCmd("apktool", ["d", "-f", "-o", out, apk], { log, logAction: "apktool", timeoutMs: 10 * 60 * 1000 });
    if (fs.existsSync(out)) findings.push({ id: "apk-decompiled", severity: "info", title: "apktool extracted smali + resources", module: out });
  } else log.warn("skipped", { target: "apktool", outputs: { reason: "binary not found" } });
  if (which("jadx")) {
    const out = path.join(reportsDir, "jadx-out");
    runCmd("jadx", ["-d", out, "--no-res", apk], { log, logAction: "jadx", timeoutMs: 15 * 60 * 1000 });
    if (fs.existsSync(out)) findings.push({ id: "apk-jadx", severity: "info", title: "jadx extracted Java sources", module: out });
  } else log.warn("skipped", { target: "jadx", outputs: { reason: "binary not found" } });
  for (const f of findings) log.info("finding", { target: f.module, outputs: f });
  writeReport(reportsDir, "decompile.summary.json", { target: apk, findings, generatedAt: new Date().toISOString() });
  log.info("scan:end", { target: apk, outputs: { count: findings.length } });
}
main().catch((e) => { console.error(e); process.exit(1); });
