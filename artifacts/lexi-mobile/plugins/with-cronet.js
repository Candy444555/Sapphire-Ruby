const { withAppBuildGradle } = require("expo/config-plugins");

const CRONET_DEPS = [
  'implementation "org.chromium.net:cronet-embedded:119.6045.31"',
  'implementation "org.chromium.net:cronet-api:119.6045.31"',
];

module.exports = function withCronet(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    for (const dep of CRONET_DEPS) {
      if (src.includes(dep)) continue;
      src = src.replace(
        /dependencies\s*\{/,
        (m) => `${m}\n    ${dep}`
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
