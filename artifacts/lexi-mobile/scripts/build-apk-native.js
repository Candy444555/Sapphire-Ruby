#!/usr/bin/env node
/**
 * Local APK build path — no EAS, no cloud, arm64-v8a only.
 *
 * Steps:
 *   1. expo prebuild --platform android --clean
 *      → generates android/ with our config plugins (cronet, tor,
 *        curl-impersonate, boot service) applied.
 *   2. cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
 *      → produces app/build/outputs/apk/release/app-arm64-v8a-release.apk
 *
 * Signs with the debug keystore by default; export LEXI_RELEASE_KEYSTORE +
 * LEXI_KEYSTORE_PASSWORD + LEXI_KEY_ALIAS + LEXI_KEY_PASSWORD to use a real
 * release keystore.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("npx", ["expo", "prebuild", "--platform", "android", "--clean", "--non-interactive"]);

const androidDir = path.join(root, "android");
const env = { ...process.env };
if (process.env.LEXI_RELEASE_KEYSTORE) {
  env.LEXI_RELEASE_STORE_FILE = process.env.LEXI_RELEASE_KEYSTORE;
  env.LEXI_RELEASE_STORE_PASSWORD = process.env.LEXI_KEYSTORE_PASSWORD ?? "";
  env.LEXI_RELEASE_KEY_ALIAS = process.env.LEXI_KEY_ALIAS ?? "";
  env.LEXI_RELEASE_KEY_PASSWORD = process.env.LEXI_KEY_PASSWORD ?? "";
}

const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
run(gradlew, ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a"], { cwd: androidDir, env });

const out = path.join(androidDir, "app", "build", "outputs", "apk", "release");
if (fs.existsSync(out)) {
  const apks = fs.readdirSync(out).filter((f) => f.endsWith(".apk"));
  console.log(`\n✅ APK(s) built:\n${apks.map((a) => `  ${path.join(out, a)}`).join("\n")}`);
} else {
  console.warn(`gradle finished but no APKs found at ${out}`);
}
