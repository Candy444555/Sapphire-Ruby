const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Copies prebuilt curl-impersonate JNI .so files from
 * `<artifact>/native/curl-impersonate/jniLibs/<abi>/libcurl-impersonate-chrome.so`
 * into the generated android/app/src/main/jniLibs/<abi>/ tree.
 *
 * If no prebuilt libs are present, the plugin silently skips — the TS wrapper
 * (`lib/native/curl-impersonate.ts`) will then throw a clear "engine not
 * bundled" error rather than leaking through a different transport.
 */
module.exports = function withCurlImpersonate(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const artifactRoot = cfg.modRequest.projectRoot;
      const srcRoot = path.join(artifactRoot, "native", "curl-impersonate", "jniLibs");
      const dstRoot = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "jniLibs"
      );
      if (!fs.existsSync(srcRoot)) return cfg;
      const abis = fs.readdirSync(srcRoot).filter((d) => /^(arm64-v8a|armeabi-v7a|x86|x86_64)$/.test(d));
      for (const abi of abis) {
        const dstAbi = path.join(dstRoot, abi);
        fs.mkdirSync(dstAbi, { recursive: true });
        for (const f of fs.readdirSync(path.join(srcRoot, abi))) {
          if (!f.endsWith(".so")) continue;
          fs.copyFileSync(path.join(srcRoot, abi, f), path.join(dstAbi, f));
        }
      }
      return cfg;
    },
  ]);
};
