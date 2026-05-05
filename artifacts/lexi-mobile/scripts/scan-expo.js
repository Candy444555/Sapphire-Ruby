#!/usr/bin/env node
// Expo / React Native config + permissions linter.
// - Runs expo-doctor
// - Inspects app.json for over-broad permissions and ATS exceptions
// - Inspects package.json for known-bad postinstall scripts

const fs = require("fs");
const path = require("path");
const {
  parseArgs,
  makeNdjsonLogger,
  runCmd,
  writeReport,
  isHighOrCritical,
} = require("./scan-shared");

const HIGH_RISK_ANDROID = new Set([
  "MANAGE_EXTERNAL_STORAGE",
  "REQUEST_INSTALL_PACKAGES",
  "QUERY_ALL_PACKAGES",
  "SYSTEM_ALERT_WINDOW",
  "READ_SMS",
  "SEND_SMS",
  "BODY_SENSORS_BACKGROUND",
  "ACCESS_BACKGROUND_LOCATION",
  "READ_CALL_LOG",
  "WRITE_CALL_LOG",
]);

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("expo", reportsDir);
  log.info("scan:start", { target: targetDir });
  const findings = [];

  const appJsonPath = path.join(targetDir, "app.json");
  if (fs.existsSync(appJsonPath)) {
    await log.span("app-json", async () => {
      const raw = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
      const expo = raw.expo || {};
      const androidPerms = (expo.android && expo.android.permissions) || [];
      for (const p of androidPerms) {
        if (HIGH_RISK_ANDROID.has(p)) {
          findings.push({
            tool: "expo-config",
            severity: "moderate",
            file: appJsonPath,
            rule: "high-risk-permission",
            message: `Android permission ${p} is high-risk; review whether it is required.`,
          });
          log.warn("finding", { target: p, outputs: { rule: "high-risk-permission" } });
        }
      }
      const ats = expo.ios && expo.ios.infoPlist && expo.ios.infoPlist.NSAppTransportSecurity;
      if (ats && ats.NSAllowsArbitraryLoads) {
        findings.push({
          tool: "expo-config",
          severity: "high",
          file: appJsonPath,
          rule: "ats-disabled",
          message: "iOS NSAllowsArbitraryLoads is enabled; this disables HTTPS enforcement.",
        });
        log.warn("finding", { target: "ios.NSAllowsArbitraryLoads", outputs: { rule: "ats-disabled" } });
      }
      const cleartext =
        expo.plugins &&
        expo.plugins.find(
          (pl) => Array.isArray(pl) && pl[0] === "expo-build-properties" && pl[1] && pl[1].android && pl[1].android.usesCleartextTraffic,
        );
      if (cleartext) {
        findings.push({
          tool: "expo-config",
          severity: "moderate",
          file: appJsonPath,
          rule: "cleartext-traffic",
          message: "Android usesCleartextTraffic is enabled.",
        });
        log.warn("finding", { target: "android.usesCleartextTraffic", outputs: { rule: "cleartext-traffic" } });
      }
    }, { target: appJsonPath });
  } else {
    log.warn("skipped", { target: "app.json", outputs: { reason: "not found" } });
  }

  const pkgPath = path.join(targetDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    for (const script of ["postinstall", "preinstall", "prepare"]) {
      const v = pkg.scripts && pkg.scripts[script];
      if (typeof v === "string" && /(curl|wget|sh -c|bash -c|eval)/i.test(v)) {
        findings.push({
          tool: "expo-config",
          severity: "high",
          file: pkgPath,
          rule: "lifecycle-script",
          message: `package.json ${script} contains a network or shell-eval command: ${v}`,
        });
        log.warn("finding", { target: script, outputs: { rule: "lifecycle-script", value: v } });
      }
    }
  }

  await log.span("expo-doctor", async () => {
    const r = runCmd("npx", ["--yes", "expo-doctor"], { cwd: targetDir });
    writeReport(reportsDir, "expo.doctor.txt", r.stdout + "\n" + r.stderr);
    if (r.code !== 0) {
      findings.push({
        tool: "expo-doctor",
        severity: "moderate",
        message: "expo-doctor reported issues — see expo.doctor.txt",
      });
      log.warn("finding", { target: "expo-doctor", outputs: { exit: r.code } });
    }
  });

  writeReport(reportsDir, "expo.summary.json", {
    target: targetDir,
    findings,
    generatedAt: new Date().toISOString(),
  });
  log.info("scan:end", { target: targetDir, outputs: { findings: findings.length } });
  if (findings.some((f) => isHighOrCritical(f.severity))) process.exitCode = 1;
}

main().catch((err) => {
  console.error("scan-expo failed:", err);
  process.exit(1);
});
