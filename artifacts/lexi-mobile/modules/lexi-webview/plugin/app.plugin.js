// Config plugin for lexi-webview.
//
// The headless WebView itself only needs INTERNET, which Expo already grants.
// We add it explicitly so the merged AndroidManifest is unambiguous in
// release builds where some plugins strip implicit permissions.
const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

const PERMS = ["android.permission.INTERNET"];

function withLexiWebView(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = AndroidConfig.Permissions.ensurePermissions(cfg.modResults, PERMS);
    return cfg;
  });
}

module.exports = withLexiWebView;
