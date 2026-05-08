const path = require("path");

// Guarantee EXPO_ROUTER_APP_ROOT is set before babel-preset-expo evaluates,
// so the expo-router babel plugin can inline `process.env.EXPO_ROUTER_APP_ROOT`
// in `_ctx.*.js`. Required for release bundling outside the Expo CLI wrapper
// (e.g. CI builds invoking `gradlew assembleRelease` directly).
if (!process.env.EXPO_ROUTER_APP_ROOT) {
  process.env.EXPO_ROUTER_APP_ROOT = path.join(__dirname, "app");
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
  };
};
