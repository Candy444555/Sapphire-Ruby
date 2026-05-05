import { Linking, Platform, Alert } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as Clipboard from "expo-clipboard";

export interface SettingsAction {
  id: string;
  label: string;
  description: string;
  action: string;
  category: "Network" | "System" | "Developer" | "Privacy" | "Apps" | "Hardware";
}

export const SETTINGS_ACTIONS: SettingsAction[] = [
  { id: "dev_options",   label: "Developer Options",     description: "USB debugging, OEM unlock, mock locations",                action: "android.settings.APPLICATION_DEVELOPMENT_SETTINGS", category: "Developer" },
  { id: "apn",           label: "APN Settings",          description: "Edit Access Point Names — change carrier data routing", action: "android.settings.APN_SETTINGS",                     category: "Network"   },
  { id: "wifi",          label: "Wi-Fi",                 description: "Network list, saved configs, DNS",                       action: "android.settings.WIFI_SETTINGS",                    category: "Network"   },
  { id: "wifi_pref",     label: "Private DNS / IP",      description: "Force private DNS over TLS, IP randomization",           action: "android.settings.WIFI_IP_SETTINGS",                 category: "Network"   },
  { id: "tether",        label: "Tethering",             description: "USB / hotspot / Bluetooth tether",                       action: "android.settings.TETHER_SETTINGS",                  category: "Network"   },
  { id: "vpn",           label: "VPN Settings",          description: "Always-on VPN, kill switch, app exclusions",             action: "android.settings.VPN_SETTINGS",                     category: "Network"   },
  { id: "data_roaming",  label: "Mobile Networks",       description: "Network operator, roaming, preferred network type",      action: "android.settings.DATA_ROAMING_SETTINGS",            category: "Network"   },
  { id: "airplane",      label: "Wireless / Airplane",   description: "Master radio toggle, Wi-Fi/Bluetooth/cellular",          action: "android.settings.AIRPLANE_MODE_SETTINGS",           category: "Network"   },
  { id: "device_info",   label: "About Phone",           description: "Build number — tap 7× to unlock dev options",            action: "android.settings.DEVICE_INFO_SETTINGS",             category: "System"    },
  { id: "date_time",     label: "Date & Time",           description: "Auto vs manual time — useful for app spoofing",          action: "android.settings.DATE_SETTINGS",                    category: "System"    },
  { id: "locale",        label: "Language & Locale",     description: "Spoof region for region-locked content",                 action: "android.settings.LOCALE_SETTINGS",                  category: "System"    },
  { id: "input",         label: "Input Methods",         description: "Keyboard install / clipboard handlers",                  action: "android.settings.INPUT_METHOD_SETTINGS",            category: "System"    },
  { id: "accessibility", label: "Accessibility",         description: "Grant a11y service — required for many tweaker apps",    action: "android.settings.ACCESSIBILITY_SETTINGS",           category: "System"    },
  { id: "default_apps",  label: "Default Apps",          description: "SMS, browser, dialer, launcher, assistant",              action: "android.settings.MANAGE_DEFAULT_APPS_SETTINGS",     category: "Apps"      },
  { id: "all_apps",      label: "All Apps",              description: "Force stop, clear data, disable system apps",            action: "android.settings.APPLICATION_SETTINGS",             category: "Apps"      },
  { id: "ignore_batt",   label: "Battery Optimization",  description: "Whitelist apps from doze — keep services alive",         action: "android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS", category: "Apps"  },
  { id: "unknown_src",   label: "Install Unknown Apps",  description: "Allow APK sideloading per-app",                          action: "android.settings.MANAGE_UNKNOWN_APP_SOURCES",       category: "Apps"      },
  { id: "usage_access",  label: "Usage Access",          description: "Grant any app full usage stats / per-app monitoring",    action: "android.settings.USAGE_ACCESS_SETTINGS",            category: "Privacy"   },
  { id: "notif_access",  label: "Notification Access",   description: "Grant any app full notification listener access",        action: "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS", category: "Privacy" },
  { id: "loc_source",    label: "Location Sources",      description: "GPS / network / passive location toggles",               action: "android.settings.LOCATION_SOURCE_SETTINGS",         category: "Privacy"   },
  { id: "security",      label: "Security",              description: "Lock screen, fingerprint, device admins",                action: "android.settings.SECURITY_SETTINGS",                category: "Privacy"   },
  { id: "bluetooth",     label: "Bluetooth",             description: "Pairing, scan mode, MAC randomization",                  action: "android.settings.BLUETOOTH_SETTINGS",               category: "Hardware"  },
  { id: "nfc",           label: "NFC / Tap & Pay",       description: "NFC radio, default payment app",                         action: "android.settings.NFC_SETTINGS",                     category: "Hardware"  },
  { id: "sound",         label: "Sound",                 description: "Volume profiles, ringtones, vibration",                  action: "android.settings.SOUND_SETTINGS",                   category: "Hardware"  },
  { id: "display",       label: "Display",               description: "Refresh rate, resolution, scaling",                      action: "android.settings.DISPLAY_SETTINGS",                 category: "Hardware"  },
];

export async function openAndroidSetting(action: string): Promise<void> {
  if (Platform.OS !== "android") {
    Alert.alert("Android only", "System settings deep-links only work on Android devices.");
    return;
  }
  try {
    await IntentLauncher.startActivityAsync(action);
  } catch {
    try {
      await Linking.openSettings();
    } catch {
      Alert.alert("Could not open", `Setting "${action}" is not exposed on this device.`);
    }
  }
}

export interface AdbScript {
  id: string;
  name: string;
  category: "Bootloader" | "Recovery" | "Root" | "System Tweak" | "Debloat" | "Privacy" | "Carrier";
  description: string;
  prereq: string;
  commands: string[];
  warning?: string;
}

export const ADB_SCRIPTS: AdbScript[] = [
  {
    id: "oem_unlock",
    name: "Unlock OEM Bootloader",
    category: "Bootloader",
    description: "Wipe-and-unlock the bootloader — required for custom recoveries, root, and ROM flashing.",
    prereq: "USB debugging ON, OEM unlock toggle ON in Developer Options, USB cable connected to PC with adb+fastboot installed.",
    warning: "FACTORY RESETS the device. Voids most warranties. May trip Knox / Verified Boot.",
    commands: [
      "adb reboot bootloader",
      "fastboot devices",
      "fastboot flashing unlock",
      "# (use volume keys to confirm on the phone, then power)",
      "fastboot reboot",
    ],
  },
  {
    id: "twrp_install",
    name: "Flash TWRP Custom Recovery",
    category: "Recovery",
    description: "Install Team Win Recovery Project — full backup/restore, sideload ZIPs, mount partitions.",
    prereq: "Unlocked bootloader. Download the correct twrp-X.Y.Z-codename.img for your exact model.",
    warning: "Wrong image = brick. Verify codename from Settings → About → Model. Some devices need vbmeta patched too.",
    commands: [
      "adb reboot bootloader",
      "fastboot flash recovery twrp.img",
      "fastboot boot twrp.img            # boot once without flashing, to verify",
      "fastboot reboot recovery",
    ],
  },
  {
    id: "magisk_root",
    name: "Root with Magisk (patched boot.img)",
    category: "Root",
    description: "Systemless root via patched boot image — survives OTAs better than SuperSU, hides from SafetyNet.",
    prereq: "Unlocked bootloader. Stock boot.img extracted from your firmware, copied to phone, patched in Magisk app.",
    warning: "Banking apps and Pokemon GO will trip without DenyList/Zygisk. Re-patch after every OTA.",
    commands: [
      "# 1. Copy stock boot.img to /sdcard/Download",
      "# 2. Open Magisk app → Install → Select and Patch a File → boot.img",
      "# 3. Pull the patched image to PC:",
      "adb pull /sdcard/Download/magisk_patched-XXXXX.img boot_patched.img",
      "adb reboot bootloader",
      "fastboot flash boot boot_patched.img",
      "fastboot reboot",
    ],
  },
  {
    id: "debloat",
    name: "Debloat Carrier / OEM Apps",
    category: "Debloat",
    description: "Disable preinstalled bloatware (Verizon, Samsung, AT&T) per-user without root. Survives reboot.",
    prereq: "USB debugging on. Use 'adb shell pm list packages | grep keyword' to find the package name first.",
    commands: [
      "adb shell pm list packages -d",
      "adb shell pm uninstall --user 0 com.facebook.katana",
      "adb shell pm uninstall --user 0 com.samsung.android.bixby.agent",
      "adb shell pm uninstall --user 0 com.verizon.mips.services",
      "adb shell pm uninstall --user 0 com.dti.tracfone",
      "# To restore later: adb shell cmd package install-existing <pkg>",
    ],
  },
  {
    id: "disable_safetynet",
    name: "Hide Root from SafetyNet (Magisk)",
    category: "Privacy",
    description: "Use Magisk DenyList + Zygisk + Shamiko to bypass Play Integrity / SafetyNet on rooted devices.",
    prereq: "Magisk 25+ rooted device, Zygisk enabled in Magisk Settings.",
    commands: [
      "# Magisk app → Settings → Zygisk: ON",
      "# Magisk app → Settings → Enforce DenyList: ON",
      "# Magisk app → Modules → install Shamiko zip → reboot",
      "# Magisk app → DenyList → tick: Google Play services, Banking apps, Netflix, etc.",
      "adb shell magisk --denylist add com.google.android.gms",
      "adb shell magisk --denylist add com.netflix.mediaclient",
    ],
  },
  {
    id: "build_prop",
    name: "Edit build.prop (Spoof Device)",
    category: "System Tweak",
    description: "Rewrite ro.product.model / brand / device — useful for region/device-restricted apps.",
    prereq: "ROOTED device. /system mount RW or use a Magisk module (resetprop).",
    warning: "Direct edit can boot-loop the device. Magisk resetprop is safer because it's runtime-only.",
    commands: [
      "# Safer (Magisk runtime, no /system write):",
      "adb shell su -c 'resetprop ro.product.model \"Pixel 8 Pro\"'",
      "adb shell su -c 'resetprop ro.product.brand \"google\"'",
      "adb shell su -c 'resetprop ro.product.manufacturer \"Google\"'",
      "adb shell su -c 'resetprop ro.build.fingerprint \"google/husky/husky:14/UQ1A.240105.002/11206848:user/release-keys\"'",
      "# Persistent: create a Magisk module with /common/system.prop containing the lines.",
    ],
  },
  {
    id: "carrier_unlock_check",
    name: "Check Carrier Unlock Status",
    category: "Carrier",
    description: "Query the modem for current SIM lock state without unlocking.",
    prereq: "USB debugging on. Works on most Qualcomm-based phones.",
    commands: [
      "adb shell service call iphonesubinfo 1",
      "adb shell getprop ro.boot.carrierid",
      "adb shell getprop persist.radio.lockscreen.unlock",
      "adb shell dumpsys telephony.registry | grep -i lock",
    ],
  },
  {
    id: "mac_randomize",
    name: "Randomize Wi-Fi MAC Permanently",
    category: "Privacy",
    description: "Force per-network random MAC even on saved networks — defeats Wi-Fi tracking.",
    prereq: "USB debugging.",
    commands: [
      "adb shell settings put global wifi_connected_mac_randomization_enabled 1",
      "adb shell cmd wifi set-mac-randomization-enabled true",
      "adb shell cmd wifi set-wifi-enabled disabled && adb shell cmd wifi set-wifi-enabled enabled",
    ],
  },
  {
    id: "force_dark",
    name: "Force Dark Mode in Every App",
    category: "System Tweak",
    description: "Turn on system-wide forced dark even for apps that don't support it.",
    prereq: "USB debugging.",
    commands: [
      "adb shell settings put secure ui_night_mode 2",
      "adb shell cmd uimode night yes",
    ],
  },
  {
    id: "remove_ads_id",
    name: "Reset / Disable Advertising ID",
    category: "Privacy",
    description: "Wipe the Google ad-tracking ID and disable personalization.",
    prereq: "USB debugging.",
    commands: [
      "adb shell settings put secure limit_ad_tracking 1",
      "adb shell settings put secure advertising_id 00000000-0000-0000-0000-000000000000",
      "adb shell pm clear com.google.android.gms",
    ],
  },
  {
    id: "factory_reset_prot",
    name: "Bypass FRP After Reset (Pattern)",
    category: "Bootloader",
    description: "Generic flow to neutralize Factory Reset Protection on Samsung/MTK devices via combination firmware or test point.",
    prereq: "Device in download/EDL mode. Specific firmware for your exact model.",
    warning: "Region- and model-specific. Use Odin (Samsung), MTK Client Tool, or QFIL (Qualcomm). Wrong combo bricks.",
    commands: [
      "# Samsung Odin route:",
      "# 1. Boot phone into Download Mode (Vol Down + Power + USB)",
      "# 2. Open Odin → AP slot → load CombinationXX.tar.md5",
      "# 3. Start, then boot, then ADB enable, then odin again to flash stock firmware → boot, FRP gone.",
      "# Qualcomm EDL route (test point):",
      "# 1. Short the test point on the PCB → connect USB",
      "# 2. Use QFIL with the matching .mbn loader and 0:USERDATA wipe",
    ],
  },
];

export async function copyScript(commands: string[]): Promise<void> {
  const text = commands.filter((c) => !c.startsWith("#")).join("\n");
  await Clipboard.setStringAsync(text);
}

export async function copyFullScript(commands: string[]): Promise<void> {
  await Clipboard.setStringAsync(commands.join("\n"));
}
