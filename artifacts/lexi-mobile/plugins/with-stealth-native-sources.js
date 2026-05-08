// Copies the Kotlin sources under `native-android/com/lexi/stealth/` into the
// generated `android/app/src/main/java/com/lexi/stealth/` tree, and registers
// `LexiStealthPackage` inside MainApplication.kt so the bridge actually
// instantiates the native modules at runtime.
//
// Idempotent — safe to re-run on every prebuild.
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function findMainApplication(platformRoot) {
  const candidates = [
    "app/src/main/java/com/lexi/mobile/MainApplication.kt",
    "app/src/main/java/com/lexi/mobile/MainApplication.java",
  ];
  for (const c of candidates) {
    const p = path.join(platformRoot, c);
    if (fs.existsSync(p)) return p;
  }
  // Fallback: scan
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { const r = walk(p); if (r) return r; }
      else if (/MainApplication\.(kt|java)$/.test(e.name)) return p;
    }
    return null;
  };
  try { return walk(path.join(platformRoot, "app", "src", "main", "java")); }
  catch { return null; }
}

function patchMainApplication(file) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes("LexiStealthPackage")) return false;

  const isKotlin = file.endsWith(".kt");
  if (isKotlin) {
    src = src.replace(/(package\s+[^\n]+\n)/, (m) => `${m}\nimport com.lexi.stealth.LexiStealthPackage\n`);
    // Insert into PackageList — Expo uses `PackageList(this).packages.apply { add(MyPackage()) }`
    if (/PackageList\(this\)\.packages/.test(src)) {
      src = src.replace(/PackageList\(this\)\.packages/, (m) =>
        `${m}.apply { add(LexiStealthPackage()) }`);
    } else if (/override fun getPackages\(\):.*ReactPackage>/.test(src)) {
      src = src.replace(/(return\s+packages)/, `packages.add(LexiStealthPackage())\n            $1`);
    }
  } else {
    src = src.replace(/(package\s+[^;]+;\n)/, (m) => `${m}\nimport com.lexi.stealth.LexiStealthPackage;\n`);
    src = src.replace(/(packages\.add\([^)]+\);\s*\n\s*)?(return packages;)/, (m, _pre, ret) =>
      `packages.add(new LexiStealthPackage());\n            ${ret}`);
  }
  fs.writeFileSync(file, src);
  return true;
}

module.exports = function withStealthNativeSources(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;
      const srcRoot = path.join(projectRoot, "native-android", "com", "lexi", "stealth");
      if (!fs.existsSync(srcRoot)) return cfg;
      const dstRoot = path.join(platformRoot, "app", "src", "main", "java", "com", "lexi", "stealth");
      copyDirRecursive(srcRoot, dstRoot);

      // Build-time guard: refuse to ship an APK without the curl-impersonate
      // arm64 .so present. Without it, LexiCurlImpersonate is unavailable at
      // runtime and any backend that requires curl (residential / mobile / any
      // proxy-needing path) silently degrades. We fail the prebuild instead.
      const jniDir = path.join(projectRoot, "native-android", "jniLibs", "arm64-v8a");
      const requiredSo = path.join(jniDir, "libcurl-impersonate.so");
      if (process.env.LEXI_REQUIRE_CURL_IMPERSONATE === "1" && !fs.existsSync(requiredSo)) {
        throw new Error(`[with-stealth-native-sources] Missing ${requiredSo}. Drop a prebuilt arm64-v8a libcurl-impersonate.so there, or unset LEXI_REQUIRE_CURL_IMPERSONATE for a Cronet-only test build.`);
      }
      // If the .so directory exists, copy it into the generated android tree.
      if (fs.existsSync(jniDir)) {
        const dstJni = path.join(platformRoot, "app", "src", "main", "jniLibs", "arm64-v8a");
        copyDirRecursive(path.dirname(jniDir), path.dirname(dstJni));
      }

      const main = findMainApplication(platformRoot);
      if (main) {
        try { patchMainApplication(main); }
        catch (e) { console.warn("[with-stealth-native-sources] could not patch MainApplication:", e.message); }
      }
      return cfg;
    },
  ]);
};
