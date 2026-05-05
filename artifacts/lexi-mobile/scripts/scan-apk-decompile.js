#!/usr/bin/env node
// apktool + jadx — decompile an APK and run secrets + static rescans on
// the decoded sources. Skipped gracefully when binaries are missing.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const {
  makeNdjsonLogger, which, runCmd, writeReport,
} = require("./scan-shared");

function findApkArg(argv) {
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apk") return argv[i + 1];
    if (a.startsWith("--apk=")) return a.slice("--apk=".length);
  }
  return null;
}
function findReportsArg(argv) {
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--reports") return argv[i + 1];
    if (a.startsWith("--reports=")) return a.slice("--reports=".length);
  }
  return null;
}

async function main() {
  const apk = findApkArg(process.argv);
  const reportsArg = findReportsArg(process.argv);
  const reportsDir = path.resolve(reportsArg ?? path.join(process.cwd(), "security-reports"));
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const log = makeNdjsonLogger("apktool", reportsDir);
  if (!apk || !fs.existsSync(apk)) {
    log.warn("skipped", { target: "apktool", outputs: { reason: "no apk file" } });
    writeReport(reportsDir, "apktool.summary.json", JSON.stringify({ skipped: true, reason: "no apk" }, null, 2));
    return;
  }
  const haveApktool = !!which("apktool");
  const haveJadx = !!which("jadx");
  if (!haveApktool && !haveJadx) {
    log.warn("skipped", { target: "apktool", outputs: { reason: "neither apktool nor jadx installed" } });
    writeReport(reportsDir, "apktool.summary.json", JSON.stringify({ skipped: true, reason: "binaries missing" }, null, 2));
    return;
  }
  log.info("scan:start", { target: apk });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "lexi-decompile-"));
  try {
    if (haveApktool) {
      await log.span("apktool:decode", async () => {
        runCmd("apktool", ["d", "-f", "-o", path.join(work, "apktool"), apk]);
      }, { target: apk });
    }
    if (haveJadx) {
      await log.span("jadx:decompile", async () => {
        runCmd("jadx", ["-d", path.join(work, "jadx"), apk]);
      }, { target: apk });
    }
    // Re-run secrets + static against the decoded source. Best-effort:
    // we shell-out to the sibling scanners with the temp dir as target.
    const sharedReports = reportsDir;
    for (const sub of ["scan-secrets.js", "scan-static.js"]) {
      const r = spawnSync(process.execPath, [
        path.join(__dirname, sub),
        "--path", work,
        "--reports", sharedReports,
      ], { stdio: ["ignore", "inherit", "inherit"], timeout: 10 * 60_000 });
      log.info("subscan:end", { target: sub, outputs: { code: r.status } });
    }
    writeReport(reportsDir, "apktool.summary.json", JSON.stringify({
      ok: true, decoded: fs.readdirSync(work),
    }, null, 2));
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
