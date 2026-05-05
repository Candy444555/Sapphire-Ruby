import { Platform } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import * as Clipboard from "expo-clipboard";

// =================== USB-C Host Role Switch ===================
// Modern USB-C phones don't need an OTG dongle — every USB-C port is
// dual-role (DRD). When you plug a plain USB-C cable into another device
// the phone negotiates host-or-peripheral via the CC pins. If it lands
// on the wrong role, you flip it from USB Preferences (no root) or via
// shell (root / Termux / adb).

export async function openUsbSettings(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  // Ladder of fall-backs — one of these opens on every Android 10+.
  const ACTIONS = [
    "android.settings.USB_SETTINGS",            // direct (Android 11+ "USB Preferences")
    "android.settings.MEMORY_CARD_SETTINGS",    // some OEMs hide USB here
    "android.settings.HARD_KEYBOARD_SETTINGS",  // Connected-devices on Pixel
    "android.settings.SETTINGS",                // last-resort root settings
  ];
  for (const a of ACTIONS) {
    try {
      await IntentLauncher.startActivityAsync(a);
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

export interface UsbRoleCommand {
  id: string;
  label: string;
  description: string;
  needs: "root" | "shell" | "termux";
  commands: string[];
}

export const USB_ROLE_COMMANDS: UsbRoleCommand[] = [
  {
    id: "typec_data_role",
    label: "Force data role = host (Pixel / Snapdragon)",
    description: "Writes 'host' to the Type-C port's data_role sysfs node — instant, no reboot.",
    needs: "root",
    commands: [
      "su -c 'echo host > /sys/class/typec/port0/data_role'",
      "su -c 'cat /sys/class/typec/port0/data_role'",
    ],
  },
  {
    id: "usb_role_switch",
    label: "Force USB role = host (newer kernels)",
    description: "Newer Linux kernel UAPI: /sys/class/usb_role/<port>/role.",
    needs: "root",
    commands: [
      "su -c 'for p in /sys/class/usb_role/*/role; do echo host > \"$p\"; done'",
      "su -c 'cat /sys/class/usb_role/*/role'",
    ],
  },
  {
    id: "svc_usb_host",
    label: "svc usb setFunctions (Android-side)",
    description: "Tells the framework to expose host functions; works on most ROMs without root via ADB.",
    needs: "shell",
    commands: [
      "svc usb setFunctions none",
      "svc usb setFunctions host",
    ],
  },
  {
    id: "svc_usb_off",
    label: "Reset USB stack",
    description: "Clears any stuck role; force-renegotiate by toggling the radio off/on.",
    needs: "shell",
    commands: [
      "svc usb setFunctions none",
      "sleep 1",
      "svc usb setFunctions mtp",
    ],
  },
  {
    id: "samsung_dex",
    label: "Samsung Dex / OneUI USB host",
    description: "On Samsung you can also run this from Termux to enable host even if Dex is disabled.",
    needs: "termux",
    commands: [
      "settings put global usb_host_mode 1",
      "settings get global usb_host_mode",
    ],
  },
  {
    id: "xiaomi_otg",
    label: "Xiaomi / MIUI OTG enable",
    description: "MIUI auto-disables OTG after 10 minutes of idle — this re-arms it.",
    needs: "shell",
    commands: [
      "settings put global otg_enabled 1",
      "settings put global usb_default_function host",
    ],
  },
];

export async function copyRoleScript(cmd: UsbRoleCommand): Promise<void> {
  const header = `# ${cmd.label}\n# ${cmd.description}\n# Run from: ${cmd.needs === "root" ? "rooted shell (Magisk / KernelSU)" : cmd.needs === "shell" ? "ADB shell or Termux" : "Termux"}\n`;
  await Clipboard.setStringAsync(header + cmd.commands.join("\n"));
}


export interface UsbDeviceInfo {
  deviceId: number;
  vendorId: number;
  productId: number;
  deviceClass?: number;
  deviceSubclass?: number;
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
  interfaceCount?: number;
  driver?: string;
}

export interface UsbConnection {
  send(data: string | Uint8Array): Promise<void>;
  close(): Promise<void>;
  onReceive(cb: (data: string) => void): () => void;
}

let mod: any = null;
let loadError: string | null = null;
try {
  if (Platform.OS === "android") {
    mod = require("react-native-usb-serialport-for-android");
  }
} catch (e) {
  loadError = e instanceof Error ? e.message : String(e);
  mod = null;
}

export const usbAvailable = !!mod && Platform.OS === "android";
export const usbLoadError = loadError;

const VID_VENDOR_GUESS: Record<number, string> = {
  0x18d1: "Google / Nexus / Pixel",
  0x04e8: "Samsung",
  0x12d1: "Huawei",
  0x2717: "Xiaomi",
  0x22b8: "Motorola",
  0x0bb4: "HTC / OnePlus",
  0x0fce: "Sony",
  0x05c6: "Qualcomm (Diag/EDL)",
  0x1f3a: "Allwinner FEL",
  0x1782: "Spreadtrum",
  0x067b: "Prolific (PL2303 serial)",
  0x10c4: "Silicon Labs (CP210x serial)",
  0x0403: "FTDI",
  0x1a86: "WCH (CH340/CH341)",
  0x239a: "Adafruit",
  0x2341: "Arduino",
  0x16c0: "Teensy",
  0x05ac: "Apple",
  0x046d: "Logitech",
  0x045e: "Microsoft",
  0x0951: "Kingston",
  0x0781: "SanDisk",
  0x0930: "Toshiba",
  0x152d: "JMicron (USB-SATA)",
};
const CLASS_NAMES: Record<number, string> = {
  0x00: "Per-Interface",
  0x01: "Audio",
  0x02: "CDC Comm",
  0x03: "HID (Keyboard/Mouse)",
  0x05: "Physical",
  0x06: "Image (PTP/MTP camera)",
  0x07: "Printer",
  0x08: "Mass Storage (USB Drive)",
  0x09: "Hub",
  0x0a: "CDC Data (Serial)",
  0x0b: "Smartcard",
  0x0d: "Content Security",
  0x0e: "Video (UVC Webcam)",
  0x0f: "Personal Healthcare",
  0xdc: "Diagnostic",
  0xe0: "Wireless (Bluetooth/USB-WiFi)",
  0xef: "Misc (ADB/RNDIS)",
  0xfe: "Application Specific",
  0xff: "Vendor Specific",
};

export function describeVendor(vid: number): string {
  return VID_VENDOR_GUESS[vid] ?? `0x${vid.toString(16).padStart(4, "0")}`;
}
export function describeClass(cls?: number): string {
  if (cls === undefined) return "?";
  return CLASS_NAMES[cls] ?? `0x${cls.toString(16).padStart(2, "0")}`;
}

export async function listDevices(): Promise<UsbDeviceInfo[]> {
  if (!usbAvailable) return [];
  try {
    const list = await mod.UsbSerialManager.list();
    return (list ?? []).map((d: any) => ({
      deviceId: d.deviceId,
      vendorId: d.vendorId,
      productId: d.productId,
      deviceClass: d.deviceClass,
      deviceSubclass: d.deviceSubclass,
      manufacturerName: d.manufacturerName,
      productName: d.productName,
      serialNumber: d.serialNumber,
      interfaceCount: d.interfaceCount,
      driver: d.driver ?? null,
    }));
  } catch (e) {
    console.warn("[usb] list failed", e);
    return [];
  }
}

export async function requestPermission(deviceId: number): Promise<boolean> {
  if (!usbAvailable) return false;
  try {
    const ok = await mod.UsbSerialManager.tryRequestPermission(deviceId);
    return ok === true || ok === 1;
  } catch (e) {
    console.warn("[usb] permission request failed", e);
    return false;
  }
}

export async function openSerial(
  deviceId: number,
  opts: { baudRate?: number; dataBits?: number; stopBits?: number; parity?: number } = {},
): Promise<UsbConnection> {
  if (!usbAvailable) throw new Error("USB host module not available — needs an EAS native build (not Expo Go).");
  const port = await mod.UsbSerialManager.open(deviceId, {
    baudRate: opts.baudRate ?? 115200,
    dataBits: opts.dataBits ?? 8,
    stopBits: opts.stopBits ?? 1,
    parity: opts.parity ?? 0,
  });
  return {
    async send(data) {
      const hex = typeof data === "string"
        ? Array.from(new TextEncoder().encode(data)).map((b) => b.toString(16).padStart(2, "0")).join("")
        : Array.from(data).map((b) => b.toString(16).padStart(2, "0")).join("");
      await port.send(hex);
    },
    async close() {
      try { await port.close(); } catch { /* ignore */ }
    },
    onReceive(cb) {
      const sub = port.onReceived((event: any) => {
        try {
          const hex = String(event?.data ?? "");
          const bytes = new Uint8Array(hex.length / 2);
          for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
          cb(new TextDecoder().decode(bytes));
        } catch (e) {
          console.warn("[usb] decode failed", e);
        }
      });
      return () => { try { sub?.remove?.(); } catch { /* ignore */ } };
    },
  };
}

// Hint table: given a USB device, what can Lexi probably do with it?
export function classifyDevice(d: UsbDeviceInfo): { kind: string; advice: string[] } {
  const cls = d.deviceClass ?? 0xff;
  const vid = d.vendorId;
  if ([0x0403, 0x10c4, 0x067b, 0x1a86, 0x239a, 0x2341, 0x16c0].includes(vid) || cls === 0x02 || cls === 0x0a) {
    return {
      kind: "Serial / UART (Microcontroller, Modem, GPS, OBD-II)",
      advice: [
        "Open at 9600 / 115200 / 921600 baud",
        "Modem? Try AT, AT+CGSN (IMEI), AT+CIMI (IMSI), AT+COPS=?",
        "OBD-II ELM327? Try ATZ, ATSP0, 0100, 010C (RPM)",
        "Microcontroller? Use as REPL (MicroPython >>>)",
      ],
    };
  }
  if (cls === 0x08) {
    return {
      kind: "Mass Storage (USB drive / phone in MTP)",
      advice: [
        "Mount via SAF: Files app exposes the device automatically",
        "Lexi can read/write any file the user picks",
        "Forensic dump: dd-equivalent via SAF stream",
      ],
    };
  }
  if (cls === 0x06) {
    return {
      kind: "PTP / MTP Camera",
      advice: [
        "Use Storage Access Framework to browse DCIM",
        "Pull RAW / JPEG straight off the camera",
      ],
    };
  }
  if (cls === 0x03) {
    return {
      kind: "HID (Keyboard / Mouse / Game pad / Yubikey)",
      advice: [
        "Android consumes HID natively — already typing/clicking",
        "For Yubikey: use FIDO2/CTAP via WebAuthn flow",
      ],
    };
  }
  if (cls === 0x0e || cls === 0x01) {
    return {
      kind: cls === 0x0e ? "UVC Webcam" : "USB Audio (mic / DAC)",
      advice: cls === 0x0e
        ? ["Open via Camera2 with USB external camera id", "Stream into chat as live frames"]
        : ["Selectable as audio input/output in system settings"],
    };
  }
  if (vid === 0x18d1 || vid === 0x05c6 || vid === 0x04e8 || vid === 0x12d1 || vid === 0x2717) {
    return {
      kind: "Connected Android phone (ADB / Fastboot / EDL)",
      advice: [
        "Phone-to-phone ADB: enable ADB-over-USB on the target, accept fingerprint prompt",
        "Fastboot mode (vol-down + power on target): unlock, flash, boot custom recovery",
        "Qualcomm EDL (VID 0x05c6): firehose loader for bricked-phone recovery",
        "Open the Terminal tab and Lexi can stream commands through the API server's adb",
      ],
    };
  }
  if (vid === 0x05ac) {
    return {
      kind: "Apple device (iPhone / iPad / Lightning accessory)",
      advice: [
        "Use libimobiledevice on a host to pair / mount / backup",
        "DFU mode (VID 0x05ac PID 0x1227): for restore via futurerestore",
        "Recovery mode (PID 0x1281): idevicerestore -e to wipe-and-restore",
      ],
    };
  }
  return {
    kind: `Unknown / Vendor-Specific (class ${describeClass(cls)})`,
    advice: [
      "Try opening as serial at 9600/115200 to probe",
      "Check vendor ID against linux-usb.org/usb.ids for hints",
      "Lexi can suggest a command sequence — just ask",
    ],
  };
}
