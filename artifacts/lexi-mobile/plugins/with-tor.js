const {
  withAppBuildGradle,
  withProjectBuildGradle,
  withAndroidManifest,
  AndroidConfig,
} = require("expo/config-plugins");

const TOR_DEP = 'implementation "info.guardianproject:tor-android:0.4.8.10"';
const JTORCTL_DEP = 'implementation "info.guardianproject:jtorctl:0.4"';
const GUARDIAN_REPO = `maven { url "https://raw.githubusercontent.com/guardianproject/gpmaven/master" }`;

module.exports = function withTor(config) {
  config = withProjectBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes("guardianproject/gpmaven")) {
      src = src.replace(/allprojects\s*\{\s*repositories\s*\{/, (m) => `${m}\n        ${GUARDIAN_REPO}`);
      if (!src.includes("guardianproject/gpmaven")) {
        // fallback: append a top-level allprojects block if missing
        src += `\nallprojects { repositories { ${GUARDIAN_REPO} } }\n`;
      }
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    for (const dep of [TOR_DEP, JTORCTL_DEP]) {
      if (!src.includes(dep)) {
        src = src.replace(/dependencies\s*\{/, (m) => `${m}\n    ${dep}`);
      }
    }
    cfg.modResults.contents = src;
    return cfg;
  });

  // Foreground service for warm Tor + Cronet on boot.
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.service = app.service ?? [];
    const svcName = "com.lexi.stealth.StealthForegroundService";
    if (!app.service.some((s) => s.$ && s.$["android:name"] === svcName)) {
      app.service.push({
        $: {
          "android:name": svcName,
          "android:exported": "false",
          "android:foregroundServiceType": "dataSync",
        },
      });
    }
    app.receiver = app.receiver ?? [];
    const rcvName = "com.lexi.stealth.BootReceiver";
    if (!app.receiver.some((r) => r.$ && r.$["android:name"] === rcvName)) {
      app.receiver.push({
        $: { "android:name": rcvName, "android:exported": "true", "android:enabled": "true" },
        "intent-filter": [
          { action: [{ $: { "android:name": "android.intent.action.BOOT_COMPLETED" } }] },
          { action: [{ $: { "android:name": "android.intent.action.QUICKBOOT_POWERON" } }] },
        ],
      });
    }
    return cfg;
  });

  return config;
};
