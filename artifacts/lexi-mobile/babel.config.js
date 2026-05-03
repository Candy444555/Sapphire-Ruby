module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    // react-native-worklets/plugin must be listed LAST. Reanimated 4.x and
    // every library that depends on it (react-native-gesture-handler,
    // react-native-keyboard-controller, react-native-screens animations,
    // etc.) require this plugin to transform worklet syntax. Without it,
    // those modules throw at JS evaluation time and the release APK is
    // stuck on the splash screen because no React code ever runs.
    plugins: ["react-native-worklets/plugin"],
  };
};
