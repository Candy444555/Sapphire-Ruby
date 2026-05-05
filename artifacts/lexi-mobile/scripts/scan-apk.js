#!/usr/bin/env node
// Mobile/APK static scanner.
// Usage: node scripts/scan-apk.js <path-to-apk> [--reports <dir>]
// Runs MobSF in Docker (https://mobsf.github.io). Requires `docker` on PATH.

const fs = require("fs");
const path = require("path");
const {
  makeNdjsonLogger,
  which,
  runCmd,
  writeReport,
  isHighOrCritical,
  ARTIFACT_DIR,
  REPORTS_DIR_DEFAULT,
} = require("./scan-shared");

// scan-apk has different positional semantics from the other scanners:
// the positional argument is an APK *file*, not a target directory. Parse
// it locally so we don't accidentally treat the APK path as a target dir
// (which would resolve reports to <file.apk>/security-reports → ENOTDIR).
function parseApkArgs(argv) {
  const args = argv.slice(2);
  let apk = null;
  let reports = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--reports" || a === "-r") reports = args[++i];
    else if (a.startsWith("--reports=")) reports = a.slice("--reports=".length);
    else if (a === "--apk" || a === "--path" || a === "-p") apk = args[++i];
    else if (a.startsWith("--apk=")) apk = a.slice("--apk=".length);
    else if (a.startsWith("--path=")) apk = a.slice("--path=".length);
    else if (!apk && (/\.apk$/i.test(a) || /\.ipa$/i.test(a) || !a.startsWith("-"))) apk = a;
  }
  const reportsDir = path.resolve(reports ?? REPORTS_DIR_DEFAULT);
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  return { apk, reportsDir };
}

async function main() {
  const { apk: apkArg, reportsDir } = parseApkArgs(process.argv);
  if (!apkArg) {
    console.error("Usage: scan-apk.js <path-to-apk> [--reports <dir>]");
    process.exit(2);
  }
  const log = makeNdjsonLogger("apk", reportsDir);
  const apkPath = path.resolve(apkArg);
  if (!fs.existsSync(apkPath)) {
    log.error("missing-input", { target: apkPath });
    process.exit(2);
  }

  log.info("scan:start", { target: apkPath });

  if (!which("docker")) {
    log.warn("skipped", { target: "mobsf", outputs: { reason: "docker not installed" } });
    writeReport(reportsDir, "apk.summary.json", { target: apkPath, findings: [], skipped: "docker missing" });
    return;
  }

  const findings = [];
  const apiKey = process.env.MOBSF_API_KEY || "";
  const port = process.env.MOBSF_PORT || "8000";
  const containerName = `lexi-mobsf-${Date.now()}`;
  const apkName = path.basename(apkPath);

  await log.span("mobsf-up", async () => {
    const r = runCmd("docker", [
      "run", "-d", "--rm", "--name", containerName,
      "-p", `${port}:8000`,
      "opensecurity/mobile-security-framework-mobsf:latest",
    ]);
    if (r.code !== 0) {
      log.error("docker-failed", { outputs: { stderr: r.stderr.slice(0, 500) } });
      throw new Error("docker run failed");
    }
  });

  // Wait for MobSF to come up.
  await new Promise((res) => setTimeout(res, 25_000));

  const apiBase = `http://127.0.0.1:${port}/api/v1`;
  try {
    await log.span("mobsf-upload", async () => {
      // curl runs on the host; reference the APK's host path directly.
      const r = runCmd("curl", [
        "-sS", "-X", "POST", `${apiBase}/upload`,
        "-F", `file=@${apkPath};type=application/octet-stream;filename=${apkName}`,
        ...(apiKey ? ["-H", `Authorization: ${apiKey}`] : []),
      ]);
      if (r.code !== 0) throw new Error(`upload failed: ${r.stderr}`);
      const parsed = JSON.parse(r.stdout || "{}");
      const hash = parsed.hash;
      if (!hash) throw new Error("no hash returned");

      const scanRes = runCmd("curl", [
        "-sS", "-X", "POST", `${apiBase}/scan`,
        "-d", `scan_type=apk&file_name=${encodeURIComponent(apkName)}&hash=${hash}`,
        ...(apiKey ? ["-H", `Authorization: ${apiKey}`] : []),
      ]);
      if (scanRes.code !== 0) throw new Error(`scan failed: ${scanRes.stderr}`);

      const reportRes = runCmd("curl", [
        "-sS", "-X", "POST", `${apiBase}/report_json`,
        "-d", `hash=${hash}`,
        ...(apiKey ? ["-H", `Authorization: ${apiKey}`] : []),
      ]);
      writeReport(reportsDir, "apk.mobsf.json", reportRes.stdout || "{}");
      try {
        const report = JSON.parse(reportRes.stdout);
        for (const [k, v] of Object.entries(report.code_analysis || {})) {
          findings.push({ tool: "mobsf", severity: v.metadata && v.metadata.severity, rule: k, file: (v.files && Object.keys(v.files)[0]) || null });
        }
        for (const [k, v] of Object.entries(report.permissions || {})) {
          if (v.status === "dangerous") {
            findings.push({ tool: "mobsf", severity: "moderate", rule: "dangerous-permission", message: k });
          }
        }
        log.info("mobsf:findings", { outputs: { count: findings.length } });
      } catch {
        log.warn("parse-failed", { target: "mobsf-report" });
      }
    });
  } finally {
    runCmd("docker", ["stop", containerName]);
  }

  writeReport(reportsDir, "apk.summary.json", { target: apkPath, findings, generatedAt: new Date().toISOString() });
  log.info("scan:end", { target: apkPath, outputs: { findings: findings.length } });
  if (findings.some((f) => isHighOrCritical(f.severity))) process.exitCode = 1;
}

main().catch((err) => {
  console.error("scan-apk failed:", err);
  process.exit(1);
});
