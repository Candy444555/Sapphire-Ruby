#!/usr/bin/env node
/**
 * Local APK build path — no EAS, no cloud, arm64-v8a only.
 *
 * Steps:
 *   0. Pre-flight: verify the curl-impersonate prebuilt .so + JNI bridge
 *      sources + curl headers are all in place. Fails loudly if not.
 *   1. expo prebuild --platform android --clean
 *      → generates android/ with our config plugins (cronet, tor,
 *        curl-impersonate, stealth-boot, stealth-native-sources) applied.
 *   2. cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
 *      → produces app/build/outputs/apk/release/app-arm64-v8a-release.apk
 *      → gradle's externalNativeBuild compiles libcurl-impersonate-jni.so via
 *        CMake on the build host (requires Android NDK + CMake on PATH).
 *
 * Signs with the debug keystore by default; export LEXI_RELEASE_KEYSTORE +
 * LEXI_KEYSTORE_PASSWORD + LEXI_KEY_ALIAS + LEXI_KEY_PASSWORD to use a real
 * release keystore.
 *
 * Toolchain required on the build host:
 *   - Node + pnpm (you've got these — that's how you're running this script)
 *   - JDK 17 (Temurin or Zulu recommended)
 *   - Android SDK platform-tools, build-tools 34.x, platform android-34
 *   - Android NDK r26 or later (for the CMake bridge build)
 *   - CMake 3.22.1 (gradle pins this; sdkmanager will install it)
 *   - ANDROID_HOME / ANDROID_SDK_ROOT exported
 *
 * If you're missing any of those, expo prebuild will surface it.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");

function step(label) {
  console.log(`\n\x1b[1;36m[lexi-build] ${label}\x1b[0m`);
}
function die(msg) {
  console.error(`\n\x1b[1;31m[lexi-build] FATAL: ${msg}\x1b[0m`);
  process.exit(2);
}
function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// --- Pre-flight ------------------------------------------------------------
step("Pre-flight: verifying native stealth deps");

const requireCurl = process.env.LEXI_REQUIRE_CURL_IMPERSONATE === "1";
const checks = [
  { kind: "so",      path: "native-android/jniLibs/arm64-v8a/libcurl-impersonate.so", req: requireCurl, hint: "Drop the lexiforest prebuilt: curl -fsSL https://github.com/lexiforest/curl-impersonate/releases/download/v1.5.6/libcurl-impersonate-v1.5.6.aarch64-linux-android.tar.gz | tar xz -C native-android/jniLibs/arm64-v8a/" },
  { kind: "jni-src", path: "native-android/jni/curl_impersonate_jni.c",                 req: requireCurl, hint: "Missing JNI bridge source — check repo state." },
  { kind: "cmake",   path: "native-android/jni/CMakeLists.txt",                         req: requireCurl, hint: "Missing CMakeLists.txt — check repo state." },
  { kind: "cjson",   path: "native-android/jni/cJSON.c",                                req: requireCurl, hint: "Missing cJSON.c — check repo state." },
  { kind: "headers", path: "native-android/jniLibs/include/curl/curl.h",                req: requireCurl, hint: "Missing curl headers — check repo state." },
  { kind: "imp-h",   path: "native-android/jniLibs/include/curl/curl-impersonate.h",    req: requireCurl, hint: "Missing curl-impersonate.h — check repo state." },
  { kind: "kotlin",  path: "native-android/com/lexi/stealth/LexiStealthPackage.kt",     req: true,        hint: "Native module sources missing — repo broken." },
];

let warnings = 0;
for (const c of checks) {
  const p = path.join(root, c.path);
  const ok = fs.existsSync(p);
  console.log(`  ${ok ? "✅" : (c.req ? "❌" : "⚠️ ")} ${c.path}${ok ? "" : `  — ${c.hint}`}`);
  if (!ok) {
    if (c.req) die(`required file missing: ${c.path}`);
    warnings++;
  }
}
if (warnings) console.log(`  (${warnings} optional dep(s) missing — set LEXI_REQUIRE_CURL_IMPERSONATE=1 to enforce)`);

// --- expo prebuild ---------------------------------------------------------
step("expo prebuild --platform android --clean");
run("npx", ["expo", "prebuild", "--platform", "android", "--clean", "--non-interactive"]);

// --- gradle ----------------------------------------------------------------
step("./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a");
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

// --- Post-flight: verify the .so made it into the APK ---------------------
step("Post-flight: locating APK + verifying jniLibs payload");
const out = path.join(androidDir, "app", "build", "outputs", "apk", "release");
if (!fs.existsSync(out)) {
  console.warn(`gradle finished but no APKs found at ${out}`);
  process.exit(1);
}
const apks = fs.readdirSync(out).filter((f) => f.endsWith(".apk"));
console.log(`\n✅ APK(s) built:\n${apks.map((a) => `  ${path.join(out, a)}`).join("\n")}`);

// Best-effort check: unzip -l on the APK to confirm libcurl-impersonate-jni.so is present.
if (requireCurl && apks.length) {
  const apkPath = path.join(out, apks[0]);
  const u = spawnSync("unzip", ["-l", apkPath], { encoding: "utf8" });
  if (u.status === 0) {
    const haveCurl = u.stdout.includes("libcurl-impersonate.so");
    const haveJni  = u.stdout.includes("libcurl-impersonate-jni.so");
    console.log(`  libcurl-impersonate.so      → ${haveCurl ? "✅ present" : "❌ MISSING"}`);
    console.log(`  libcurl-impersonate-jni.so  → ${haveJni  ? "✅ present" : "❌ MISSING"}`);
    if (!haveCurl || !haveJni) {
      die("APK is missing one or more curl-impersonate libs — gradle's externalNativeBuild likely failed silently. Check android/app/build/intermediates/cmake/ for build logs.");
    }
  } else {
    console.log("  (unzip not on PATH — skipping APK payload verification)");
  }
}

console.log("\nNext steps:");
console.log("  adb install -r " + path.join(out, apks[0] || "app-arm64-v8a-release.apk"));
console.log("  Open Lexi → Profile → Stealth Center, hit \"Verify\" — should show JA3/JA4 matching real Chrome.");
