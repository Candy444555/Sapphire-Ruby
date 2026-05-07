// Config plugin for lexi-screen-capture.
//
// Adds the FOREGROUND_SERVICE_MEDIA_PROJECTION permission and registers the
// ScreenCaptureService in the merged AndroidManifest. The service itself is
// declared in the module's own AndroidManifest.xml; this plugin just adds the
// permission so it works on Android 14+ release builds.
const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

const PERMS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION",
];

function withLexiScreenCapture(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = AndroidConfig.Permissions.ensurePermissions(cfg.modResults, PERMS);
    return cfg;
  });
}

module.exports = withLexiScreenCapture;
