const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

/**
 * Ensures BOOT_COMPLETED + foreground service permissions/intent-filters are
 * set even if `with-tor.js` isn't active (defensive). Idempotent.
 */
module.exports = function withStealthBoot(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];
    const ensure = (name) => {
      if (!manifest["uses-permission"].some((p) => p.$ && p.$["android:name"] === name)) {
        manifest["uses-permission"].push({ $: { "android:name": name } });
      }
    };
    ensure("android.permission.RECEIVE_BOOT_COMPLETED");
    ensure("android.permission.FOREGROUND_SERVICE");
    ensure("android.permission.FOREGROUND_SERVICE_DATA_SYNC");
    ensure("android.permission.POST_NOTIFICATIONS");
    return cfg;
  });
};
