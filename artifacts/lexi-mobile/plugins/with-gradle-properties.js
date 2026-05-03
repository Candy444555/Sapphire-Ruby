const { withGradleProperties } = require("@expo/config-plugins");

/**
 * Sets ksp.useKSP2=false in android/gradle.properties.
 * Fixes ':expo-updates:kspReleaseKotlin' failure caused by KSP2
 * being enabled by default with Kotlin 1.9+/2.x.
 */
module.exports = function withKspFix(config) {
  return withGradleProperties(config, (props) => {
    const key = "ksp.useKSP2";
    const idx = props.modResults.findIndex(
      (item) => item.type === "property" && item.key === key
    );
    if (idx === -1) {
      props.modResults.push({ type: "property", key, value: "false" });
    } else {
      props.modResults[idx].value = "false";
    }
    return props;
  });
};
