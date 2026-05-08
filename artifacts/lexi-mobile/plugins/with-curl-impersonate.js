const { withDangerousMod, withAppBuildGradle } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Wires the curl-impersonate JNI bridge into the generated Android project.
 *
 * What this plugin does on every prebuild:
 *   1. Copies the prebuilt arm64-v8a libcurl-impersonate.so from
 *      `<artifact>/native-android/jniLibs/<abi>/` (preferred) or the legacy
 *      `<artifact>/native/curl-impersonate/jniLibs/<abi>/` location into
 *      android/app/src/main/jniLibs/<abi>/.
 *   2. Copies the JNI bridge sources (curl_impersonate_jni.c, cJSON.c/h) and
 *      the curl headers from `<artifact>/native-android/jni/` and
 *      `<artifact>/native-android/jniLibs/include/` into the gradle CMake
 *      source tree under android/app/src/main/jni/.
 *   3. Patches android/app/build.gradle to add an `externalNativeBuild { cmake { ... } }`
 *      block so gradle's NDK build compiles libcurl-impersonate-jni.so for
 *      arm64-v8a and links it against the prebuilt libcurl-impersonate.so.
 *
 * If no prebuilt .so is present, the plugin skips both the JNI source copy
 * AND the gradle CMake patch — gradle's externalNativeBuild can't build the
 * bridge without the prebuilt to link against, so injecting the block would
 * just turn into a noisy build failure. Skipping silently lets a "Cronet +
 * Tor only" build still succeed; the TS wrapper (`lib/native/curl-impersonate.ts`)
 * then throws a loud "engine not bundled" error at runtime so stealth traffic
 * never silently leaks through a different transport.
 */

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function findArtifactJniLibs(artifactRoot) {
  // Preferred location (matches with-stealth-native-sources.js)
  const newRoot = path.join(artifactRoot, "native-android", "jniLibs");
  if (fs.existsSync(newRoot)) return newRoot;
  // Legacy location (kept so older operator setups still work)
  const oldRoot = path.join(artifactRoot, "native", "curl-impersonate", "jniLibs");
  if (fs.existsSync(oldRoot)) return oldRoot;
  return null;
}

function withCurlImpersonateFiles(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const artifactRoot = cfg.modRequest.projectRoot;
      const platformRoot = cfg.modRequest.platformProjectRoot;

      const srcJniLibs = findArtifactJniLibs(artifactRoot);
      const srcJni = path.join(artifactRoot, "native-android", "jni");
      const dstAppMain = path.join(platformRoot, "app", "src", "main");

      if (srcJniLibs) {
        // Copy <abi>/*.so → app/src/main/jniLibs/<abi>/
        const dstJniLibs = path.join(dstAppMain, "jniLibs");
        for (const abi of fs.readdirSync(srcJniLibs)) {
          if (!/^(arm64-v8a|armeabi-v7a|x86|x86_64)$/.test(abi)) continue;
          const srcAbi = path.join(srcJniLibs, abi);
          if (!fs.statSync(srcAbi).isDirectory()) continue;
          const dstAbi = path.join(dstJniLibs, abi);
          fs.mkdirSync(dstAbi, { recursive: true });
          for (const f of fs.readdirSync(srcAbi)) {
            if (!f.endsWith(".so")) continue;
            fs.copyFileSync(path.join(srcAbi, f), path.join(dstAbi, f));
          }
        }
      }

      // JNI source + headers — copy whether or not the .so is present, so
      // operators can drop the .so in later without re-running prebuild.
      if (fs.existsSync(srcJni)) {
        copyDirRecursive(srcJni, path.join(dstAppMain, "jni"));
      }
      if (srcJniLibs && fs.existsSync(path.join(srcJniLibs, "include"))) {
        copyDirRecursive(path.join(srcJniLibs, "include"), path.join(dstAppMain, "jniLibs", "include"));
      }

      return cfg;
    },
  ]);
}

const CMAKE_BLOCK_MARKER = "// LEXI_CURL_IMPERSONATE_CMAKE";
const CMAKE_BLOCK = `
${CMAKE_BLOCK_MARKER}
android {
    externalNativeBuild {
        cmake {
            path "src/main/jni/CMakeLists.txt"
            version "3.22.1"
        }
    }
    defaultConfig {
        externalNativeBuild {
            cmake {
                arguments "-DANDROID_STL=c++_shared"
                abiFilters "arm64-v8a"
            }
        }
        ndk {
            abiFilters "arm64-v8a"
        }
    }
    packagingOptions {
        // Don't double-package the prebuilt + the bridge in app bundles.
        pickFirst "**/libc++_shared.so"
    }
}
`;

function withCurlImpersonateGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(CMAKE_BLOCK_MARKER)) return cfg;
    cfg.modResults.contents = cfg.modResults.contents + "\n" + CMAKE_BLOCK + "\n";
    return cfg;
  });
}

function curlImpersonatePrebuiltPresent(artifactRoot) {
  const root = findArtifactJniLibs(artifactRoot);
  if (!root) return false;
  // Require at least the arm64 prebuilt — that's what we ship for.
  return fs.existsSync(path.join(root, "arm64-v8a", "libcurl-impersonate.so"));
}

module.exports = function withCurlImpersonate(config) {
  // Skip the entire pipeline when no prebuilt .so is staged — gradle would
  // otherwise try to link against a missing IMPORTED target and fail noisily.
  // The TS wrapper still throws CURL_IMPERSONATE_NOT_BUNDLED at runtime, so
  // stealth never silently degrades to a different transport.
  // (We use process.cwd() here because withDangerousMod's projectRoot is only
  // available inside the mod callback; for the gradle patch we still need
  // the same gate at config-parse time.)
  const artifactRoot = config._internal?.projectRoot || process.cwd();
  if (!curlImpersonatePrebuiltPresent(artifactRoot)) return config;
  config = withCurlImpersonateFiles(config);
  config = withCurlImpersonateGradle(config);
  return config;
};
