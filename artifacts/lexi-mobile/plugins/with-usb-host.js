const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DEVICE_FILTER_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <usb-device />
</resources>
`;

module.exports = function withUsbHost(config) {
  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest["uses-feature"] = manifest["uses-feature"] ?? [];
    const hasFeat = manifest["uses-feature"].some(
      (f) => f.$ && f.$["android:name"] === "android.hardware.usb.host",
    );
    if (!hasFeat) {
      manifest["uses-feature"].push({
        $: { "android:name": "android.hardware.usb.host", "android:required": "false" },
      });
    }
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const mainActivity = app.activity?.find(
      (a) => a.$ && a.$["android:name"] === ".MainActivity",
    );
    if (mainActivity) {
      mainActivity["intent-filter"] = mainActivity["intent-filter"] ?? [];
      const has = mainActivity["intent-filter"].some((f) =>
        Array.isArray(f.action) && f.action.some((a) => a.$ && a.$["android:name"] === "android.hardware.usb.action.USB_DEVICE_ATTACHED"),
      );
      if (!has) {
        mainActivity["intent-filter"].push({
          action: [{ $: { "android:name": "android.hardware.usb.action.USB_DEVICE_ATTACHED" } }],
        });
      }
      mainActivity["meta-data"] = mainActivity["meta-data"] ?? [];
      const hasMeta = mainActivity["meta-data"].some(
        (m) => m.$ && m.$["android:name"] === "android.hardware.usb.action.USB_DEVICE_ATTACHED",
      );
      if (!hasMeta) {
        mainActivity["meta-data"].push({
          $: {
            "android:name": "android.hardware.usb.action.USB_DEVICE_ATTACHED",
            "android:resource": "@xml/device_filter",
          },
        });
      }
    }
    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const xmlDir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, "device_filter.xml"), DEVICE_FILTER_XML);
      return cfg;
    },
  ]);

  return config;
};
