#!/usr/bin/env node
// Lexi self-test.
// Probes each capability the project promises to ship and writes a single
// PASS/FAIL report to lexi-self-test-report.txt at the workspace root.
//
// Usage:   node scripts/lexi-self-test.mjs
// Env:     LEXI_API=http://localhost:8080   (override default base URL)
//
// The script never throws — every probe is wrapped so the report file is
// always produced, even when a sub-system is down.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(moduleDir, "..");
const REPORT_PATH = path.join(workspaceRoot, "lexi-self-test-report.txt");
const apiBase = (process.env.LEXI_API ?? "http://localhost:8080").replace(/\/+$/, "");

const require_ = createRequire(import.meta.url);

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail: String(detail).slice(0, 280) });
  const tag = ok ? "PASS" : "FAIL";
  process.stdout.write(`[${tag}] ${name}${detail ? `  — ${detail}` : ""}\n`);
};

async function safe(label, fn) {
  try {
    const detail = await fn();
    record(label, true, detail ?? "");
  } catch (e) {
    record(label, false, e instanceof Error ? e.message : String(e));
  }
}

// ── Probes ────────────────────────────────────────────────────────────────────

await safe("workspace.pnpm-workspace.yaml exists", () => {
  const f = path.join(workspaceRoot, "pnpm-workspace.yaml");
  if (!fs.existsSync(f)) throw new Error("missing");
  return f;
});

await safe("artifacts.lexi-mobile.app.json has expanded Android permissions", () => {
  const j = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "artifacts/lexi-mobile/app.json"), "utf-8"));
  const perms = j.expo?.android?.permissions ?? [];
  const required = [
    "MANAGE_EXTERNAL_STORAGE",
    "REQUEST_INSTALL_PACKAGES",
    "SYSTEM_ALERT_WINDOW",
    "READ_SMS",
    "CALL_PHONE",
    "BODY_SENSORS",
    "ACTIVITY_RECOGNITION",
    "USE_BIOMETRIC",
    "RECEIVE_BOOT_COMPLETED",
    "FOREGROUND_SERVICE_LOCATION",
  ];
  const missing = required.filter((p) => !perms.includes(p));
  if (missing.length) throw new Error(`missing: ${missing.join(",")}`);
  return `${perms.length} permissions, all required present`;
});

await safe("artifacts.lexi-mobile.app.json has matching iOS infoPlist usage strings", () => {
  const j = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "artifacts/lexi-mobile/app.json"), "utf-8"));
  const ios = j.expo?.ios?.infoPlist ?? {};
  const required = [
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
    "NSContactsUsageDescription",
    "NSCalendarsUsageDescription",
    "NSLocationAlwaysAndWhenInUseUsageDescription",
    "NSFaceIDUsageDescription",
    "NSBluetoothAlwaysUsageDescription",
    "NSPhotoLibraryUsageDescription",
    "NSSpeechRecognitionUsageDescription",
    "UIBackgroundModes",
  ];
  const missing = required.filter((k) => !(k in ios));
  if (missing.length) throw new Error(`missing: ${missing.join(",")}`);
  return `${Object.keys(ios).length} infoPlist keys present`;
});

await safe("artifacts.mockup-sandbox.vite.config.ts builds without PORT/BASE_PATH", () => {
  const v = fs.readFileSync(path.join(workspaceRoot, "artifacts/mockup-sandbox/vite.config.ts"), "utf-8");
  if (v.includes("throw new Error") && /PORT/.test(v) && !/\?\?\s*['"]?5173/.test(v) && !/process\.env\.PORT \|\| /.test(v)) {
    throw new Error("vite.config.ts still throws when PORT is unset");
  }
  return "PORT/BASE_PATH have safe defaults";
});

await safe("api-server.skills directory + manifest exists", () => {
  const dir = path.join(workspaceRoot, "artifacts/api-server/src/skills");
  if (!fs.existsSync(dir)) throw new Error("missing skills/");
  if (!fs.existsSync(path.join(dir, "manifest.json"))) throw new Error("missing manifest.json");
  return dir;
});

await safe("api-server.web-search exports scrubUserFacingText + logSearchSourcesForDebug", () => {
  const w = fs.readFileSync(path.join(workspaceRoot, "artifacts/api-server/src/services/web-search.ts"), "utf-8");
  if (!/export function scrubUserFacingText/.test(w)) throw new Error("missing scrubUserFacingText");
  if (!/export function logSearchSourcesForDebug/.test(w)) throw new Error("missing logSearchSourcesForDebug");
  return "ok";
});

await safe("api-server.agent.ts wires SELF_PATCH_JS_SKILL tag", () => {
  const a = fs.readFileSync(path.join(workspaceRoot, "artifacts/api-server/src/routes/agent.ts"), "utf-8");
  if (!/SELF_PATCH_JS_SKILL/.test(a)) throw new Error("missing tag");
  if (!/fuseJsSkill/.test(a)) throw new Error("missing fuseJsSkill import/use");
  return "ok";
});

await safe("api-server.app.ts wires self-heal middleware", () => {
  const a = fs.readFileSync(path.join(workspaceRoot, "artifacts/api-server/src/app.ts"), "utf-8");
  if (!/selfHealErrorHandler/.test(a)) throw new Error("missing selfHealErrorHandler");
  return "ok";
});

await safe("lexi-mobile.scripts/build.js bumps versionCode + writes build-info", () => {
  const b = fs.readFileSync(path.join(workspaceRoot, "artifacts/lexi-mobile/scripts/build.js"), "utf-8");
  if (!/computeSourceHash/.test(b)) throw new Error("missing computeSourceHash");
  if (!/bumpVersionCodeInAppJson/.test(b)) throw new Error("missing bumpVersionCodeInAppJson");
  if (!/writeBuildMetadata/.test(b)) throw new Error("missing writeBuildMetadata");
  return "ok";
});

await safe("lexi-mobile.profile shows source-hash on About card", () => {
  const p = fs.readFileSync(path.join(workspaceRoot, "artifacts/lexi-mobile/app/(tabs)/profile.tsx"), "utf-8");
  if (!/BUILD_INFO\.sourceHash/.test(p)) throw new Error("BUILD_INFO not displayed");
  return "ok";
});

await safe(`api.${apiBase}/api/healthz responds`, async () => {
  try {
    const r = await fetch(`${apiBase}/api/healthz`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return `HTTP ${r.status}`;
  } catch (e) {
    throw new Error(`api unreachable: ${e instanceof Error ? e.message : e}`);
  }
});

await safe(`api.${apiBase}/api/self-heal/status reports kill-switch`, async () => {
  const r = await fetch(`${apiBase}/api/self-heal/status`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return `enabled=${j.enabled} cap=${j.cap}`;
});

await safe(`api.${apiBase}/api/js-skills lists registry`, async () => {
  const r = await fetch(`${apiBase}/api/js-skills`, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return `skills=${(j.skills ?? []).length} loaded=${(j.loaded ?? []).length}`;
});

// ── Report ────────────────────────────────────────────────────────────────────

const passCount = results.filter((r) => r.ok).length;
const failCount = results.length - passCount;
const overall = failCount === 0 ? "PASS" : "FAIL";

const lines = [];
lines.push(`Lexi self-test report`);
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`API base:  ${apiBase}`);
lines.push(`Overall:   ${overall}  (${passCount}/${results.length} passed)`);
lines.push("");
for (const r of results) {
  lines.push(`[${r.ok ? "PASS" : "FAIL"}] ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
lines.push("");

fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
process.stdout.write(`\nReport written to ${REPORT_PATH}\nOverall: ${overall} (${passCount}/${results.length})\n`);
process.exit(failCount === 0 ? 0 : 1);
