import * as Clipboard from "expo-clipboard";

export interface AppleProcedure {
  id: string;
  name: string;
  category:
    | "Jailbreak"
    | "Activation Lock"
    | "MDM Bypass"
    | "Passcode"
    | "Carrier Unlock"
    | "Firmware"
    | "macOS"
    | "Apple Watch"
    | "AirTag"
    | "Forensics";
  device: string;
  description: string;
  prereq: string;
  commands: string[];
  warning?: string;
}

export const APPLE_PROCEDURES: AppleProcedure[] = [
  // ====== JAILBREAK ======
  {
    id: "checkra1n",
    name: "checkra1n (checkm8 BootROM)",
    category: "Jailbreak",
    device: "iPhone 5s — iPhone X (A7–A11), all iPad of that era",
    description: "Permanent hardware-level BootROM exploit (checkm8). Tethered/semi-tethered. Survives any iOS version up to iOS 14.x on supported chips.",
    prereq: "macOS or Linux box, USB-C/Lightning cable, ability to enter DFU mode (Home + Side, then release Side, hold Home).",
    warning: "Tethered: must re-jailbreak with the PC every reboot. A12+ chips are NOT vulnerable.",
    commands: [
      "# macOS / Linux:",
      "brew install --cask checkra1n        # or download checkra1n.dmg/.run from checkra.in",
      "sudo checkra1n -c                    # CLI mode",
      "# 1. Connect device via USB",
      "# 2. Click Start, follow on-screen DFU sequence",
      "# 3. Device reboots into pwned state, checkra1n loader appears on home screen",
      "# 4. Open checkra1n loader → Cydia → install Sileo or Zebra",
    ],
  },
  {
    id: "palera1n",
    name: "palera1n (checkm8 for iOS 15–17)",
    category: "Jailbreak",
    device: "iPhone X and below on iOS 15.0–17.x",
    description: "checkm8-based rootless or rootful jailbreak for modern iOS on legacy chips.",
    prereq: "macOS / Linux. Backup first — rootful wipes the device.",
    warning: "Rootful = full wipe. Rootless = no wipe but fewer tweaks compatible.",
    commands: [
      "# Linux/macOS:",
      "sudo /bin/sh -c \"$(curl -fsSL https://static.palera.in/scripts/install.sh)\"",
      "sudo palera1n -l                     # rootless (recommended)",
      "sudo palera1n -f                     # rootful (full wipe)",
      "# Enter DFU when prompted (Home + Side / Vol Down + Side per device)",
      "# After boot: open palera1n loader → Install Sileo",
    ],
  },
  {
    id: "dopamine",
    name: "Dopamine (A12–A16, iOS 15–16.6.1)",
    category: "Jailbreak",
    device: "A12+ iPhones / iPads on iOS 15.0 – 16.6.1 (and 16.7 RC)",
    description: "Rootless semi-untethered jailbreak using kfd + PPLRW. Survives reboot but needs re-launch after every restart.",
    prereq: "TrollStore-installed Dopamine.tipa OR sideloaded with AltStore/SideStore.",
    commands: [
      "# 1. Install TrollStore (see TrollStore procedure)",
      "# 2. Download Dopamine.tipa from https://github.com/opa334/Dopamine/releases",
      "# 3. Open in TrollStore → Install",
      "# 4. Launch Dopamine → Jailbreak → device userspace-reboots into JB state",
      "# 5. Sileo opens automatically — install rootless tweaks only",
    ],
  },
  {
    id: "trollstore",
    name: "TrollStore (Permanent Sideload)",
    category: "Jailbreak",
    device: "iOS 14.0 – 16.6.1 (most A12+) and 17.0 on certain builds",
    description: "Permanent unsigned-IPA installer abusing CoreTrust bug. NOT a jailbreak but installs full-entitlement apps forever.",
    prereq: "Compatible iOS version (check trollstore.app for matrix).",
    commands: [
      "# Easiest: TrollInstallerX (on-device, no PC):",
      "# 1. Safari → https://ios.cfw.guide/installing-trollstore/",
      "# 2. Tap matching installer for your iOS version",
      "# 3. Open downloaded .ipa via Files → install with the on-device installer",
      "# Alternative (PC): TrollHelperOTA",
      "# Once installed, share any .ipa to TrollStore → Install — no signing, no 7-day expiry.",
    ],
  },

  // ====== ACTIVATION LOCK / iCLOUD ======
  {
    id: "icloud_bypass_checkm8",
    name: "iCloud Activation Lock Bypass (checkm8 devices)",
    category: "Activation Lock",
    device: "iPhone 5s — iPhone X on iOS 12 – 14 (A7–A11)",
    description: "Hello-screen / Activation-Lock bypass via checkra1n + iRemoval / iBypasser / iActivate. Signal/iCloud-side disabled, but device usable.",
    prereq: "checkra1n jailbreak applied first. macOS/Linux PC.",
    warning: "Bypass is signal-less on iPhone (no SIM/calls). iPad Wi-Fi keeps full function. Not iCloud-clean — original Apple ID still owns the device server-side.",
    commands: [
      "# 1. Jailbreak with checkra1n (see checkra1n procedure)",
      "# 2. Run bypass tool:",
      "#    - iRemoval Pro (macOS): https://iremoval.pro",
      "#    - iBypasser (Win/macOS): https://www.imyfone.com/icloud-bypass/",
      "#    - F3arRa1n / iActivate (Win)",
      "# 3. Tool re-jailbreaks then deletes /private/var/containers/Shared/SystemGroup/.../setup.app and patches Setup.app",
      "# 4. Device reboots past Hello screen",
      "# 5. To make tethered bypass permanent-ish: install iCloud Bypass Tools tweak via Sileo",
    ],
  },
  {
    id: "passcode_bypass",
    name: "Passcode / Disabled iPhone Recovery (checkm8)",
    category: "Passcode",
    device: "iPhone 5s — iPhone X",
    description: "Brute-force or strip the SEP-protected passcode hash via checkm8 + GrayKey-style tooling.",
    prereq: "checkm8-vulnerable device. SEP hardening on A11+ slows brute-force dramatically.",
    warning: "On A11+ Secure Enclave the brute-force is heavily rate-limited. A7–A9 typically crack 4-digit in <30 min, 6-digit in days.",
    commands: [
      "# Open-source approach (mostly research-grade):",
      "git clone https://github.com/JonathanBar1/passcodepwn",
      "# Commercial (law-enforcement) tools that actually work:",
      "#   - Cellebrite UFED Premium",
      "#   - GrayKey by Grayshift",
      "#   - MSAB XRY",
      "# Workflow: place device in DFU, run checkm8, mount /var, dump SEP keybag, brute-force PIN against hash.",
    ],
  },

  // ====== MDM BYPASS ======
  {
    id: "mdm_bypass_supervised",
    name: "Supervised MDM Bypass (Configurator)",
    category: "MDM Bypass",
    device: "Any iPhone/iPad enrolled in Apple Business/School Manager",
    description: "Strip a Supervision profile and DEP enrollment server-side via wipe + skip-MDM at Setup.",
    prereq: "Either jailbreak + iRemovalRA, or DEP profile removed by IT, or Skip-Setup payload.",
    warning: "Apple's DEP enrollment is server-side and re-applies on every Setup unless the device is removed from ABM.",
    commands: [
      "# Jailbreak route (works on supervised non-DEP):",
      "# 1. Jailbreak (checkra1n / palera1n)",
      "# 2. Use iRemovalRA or 3uTools → 'Remove MDM Lock'",
      "# 3. /var/containers/Shared/SystemGroup/systemgroup.com.apple.configurationprofiles/Library/ConfigurationProfiles → delete .mobileconfig + cloud config",
      "# Apple Configurator Setup-Skip route:",
      "# 1. macOS + Apple Configurator 2",
      "# 2. Prepare device → 'Manual Configuration', uncheck Supervise, uncheck Enroll in MDM",
      "# 3. Restore — at Setup, MDM step is skipped if device was DEP-removed",
    ],
  },

  // ====== CARRIER UNLOCK ======
  {
    id: "iphone_carrier_unlock",
    name: "iPhone Carrier Unlock (IMEI whitelist)",
    category: "Carrier Unlock",
    device: "Any iPhone",
    description: "iPhones use a server-side IMEI whitelist — no algorithmic NCK exists. Only legitimate path is Apple/carrier-side IMEI flag flip.",
    prereq: "IMEI of device, sometimes iPhone purchase proof.",
    warning: "Anything that promises 'instant iPhone unlock code' is a scam — iPhones cannot be code-unlocked. Only IMEI-database services or carrier requests work.",
    commands: [
      "# 1. Get IMEI: Settings → General → About, or dial *#06#",
      "# 2. Carrier request (free if eligible): T-Mobile/AT&T/Verizon support → request unlock by IMEI",
      "# 3. Paid IMEI services (whitelist your IMEI in Apple's GSX DB):",
      "#    - SickUnlocker, DirectUnlocks, CellUnlocker, OfficialiPhoneUnlock",
      "# 4. After whitelist, plug device in iTunes/Finder → Restore or Backup → device unlocks on reactivation",
      "# 5. Verify: Settings → General → About → 'Carrier Lock' = 'No SIM restrictions'",
    ],
  },
  {
    id: "sim_unlock_chip",
    name: "Hardware SIM-Unlock Chip (R-SIM / Heicard)",
    category: "Carrier Unlock",
    device: "Carrier-locked iPhone",
    description: "Interposer chip that sits between SIM and iPhone, spoofs ICCID to trick the iPhone into thinking it's an authorized SIM.",
    prereq: "R-SIM 16+ / Heicard / Gevey Ultra chip. Usable iOS version.",
    warning: "Apple breaks these regularly via iOS updates. ICCID method = no longer works on iOS 14.5+ for many carriers. eSIM activation method works longer.",
    commands: [
      "# Hardware install:",
      "# 1. Pop SIM tray, stack chip + SIM into tray (chip on top of SIM contacts)",
      "# 2. Re-insert tray, power on device",
      "# 3. Apple menu prompts ICCID entry — use latest from r-sim.com or heicard.com",
      "# 4. Common working ICCIDs (rotate when broken): 8901260852279208128, 8949023003445605294",
      "# 5. eSIM method: use chip's eSIM QR → activate carrier eSIM that bypasses lock",
    ],
  },

  // ====== FIRMWARE / RESTORE ======
  {
    id: "futurerestore",
    name: "FutureRestore (Downgrade with Saved Blobs)",
    category: "Firmware",
    device: "Any iPhone/iPad with saved SHSH2 blobs",
    description: "Restore to an unsigned iOS version using saved SHSH2 blobs — only works for versions you blob-saved while signed.",
    prereq: "Saved .shsh2 file (from tsschecker / TSS Saver). macOS or Linux.",
    commands: [
      "git clone https://github.com/futurerestore/futurerestore",
      "cd futurerestore && ./autogen.sh && make",
      "# Find SEP and BBFW from a currently-signed IPSW:",
      "ipsw extract --sep --bb iOS17.0_iPhone16,2_xxxxx.ipsw",
      "futurerestore -t my.shsh2 \\",
      "  --latest-sep --latest-baseband \\",
      "  iOS_15.7.5_iPhone10,3_19H332_Restore.ipsw",
      "# Device DFU-restores to the blob's iOS version",
    ],
  },
  {
    id: "ipsw_dfu_restore",
    name: "Custom IPSW Restore via idevicerestore",
    category: "Firmware",
    device: "Any iPhone/iPad",
    description: "Open-source replacement for iTunes/Finder restore. Required for sn0wbreeze / sshrd / pwndfu restores.",
    prereq: "libimobiledevice + libirecovery installed.",
    commands: [
      "brew install libimobiledevice libirecovery idevicerestore   # macOS",
      "sudo apt install libimobiledevice-utils libirecovery-common idevicerestore   # Linux",
      "# Enter DFU (Home+Side, then release Side hold Home / Vol Down + Side on FaceID)",
      "idevicerestore -d -e iPhone10,3_15.7.5_19H332_Restore.ipsw    # erase install",
      "idevicerestore -d -y -w iPhone10,3_15.7.5_19H332_Restore.ipsw # update install",
      "# -p flag for pwned restore (jailbroken state preserved)",
    ],
  },
  {
    id: "shsh_blobs",
    name: "Save SHSH2 Blobs (Future Downgrade Insurance)",
    category: "Firmware",
    device: "Any iPhone/iPad on a currently-signed iOS version",
    description: "Save Apple's TSS signature for the iOS you're currently on — required for any future downgrade.",
    prereq: "Device ECID, ApNonce (from generator on JB device), board config.",
    commands: [
      "# Get ECID:",
      "ideviceinfo -k UniqueChipID",
      "# Or from Finder/iTunes: hover Serial Number, it switches to ECID",
      "# Save blobs with tsschecker:",
      "git clone https://github.com/1Conan/tsschecker && cd tsschecker && make",
      "tsschecker -d iPhone10,3 -B d22ap -e 0x<ECID> --apnonce 0x<APNONCE> -l -s",
      "# Or use online: tsssaver.1conan.com (no PC needed)",
      "# Result: .shsh2 file → store forever for future futurerestore",
    ],
  },

  // ====== macOS ======
  {
    id: "macos_recovery_bypass",
    name: "macOS Activation Lock / EFI Bypass",
    category: "macOS",
    device: "Apple Silicon Mac (M1/M2/M3) or T2-equipped Intel Mac",
    description: "Bypass Activation Lock or wipe an iCloud-locked Mac.",
    prereq: "Physical access. For Apple Silicon: another Mac with Apple Configurator 2.",
    warning: "Apple Silicon Activation Lock cannot be bypassed without owner Apple ID — only DFU-revive, which still re-prompts for the original Apple ID.",
    commands: [
      "# Apple Silicon DFU revive (clears storage, NOT activation):",
      "# 1. On host Mac: open Apple Configurator 2",
      "# 2. Connect locked Mac via USB-C to host's Thunderbolt port",
      "# 3. Locked Mac DFU: power off, hold Power + Right-Shift + Left-Option + Left-Control for 10s, release modifiers, keep Power 10s more",
      "# 4. Configurator shows the device → right-click → Advanced → Restore",
      "# T2 Intel Mac:",
      "# 1. Boot to Recovery (Cmd+R)",
      "# 2. Utilities → Terminal → resetpassword → 'Forgot all passwords' (Apple ID required if Lock active)",
      "# Activation Lock removal officially: appleid.apple.com → remove device, OR Apple Store with proof of purchase",
    ],
  },
  {
    id: "macos_root_passwd",
    name: "Reset Forgotten macOS Login Password",
    category: "macOS",
    device: "Any Mac without FileVault",
    description: "Reset any local user password from Recovery Mode without knowing the old one.",
    prereq: "FileVault must be OFF (or you must know the FileVault recovery key).",
    commands: [
      "# 1. Apple Silicon: hold Power until 'Loading startup options' → Options → Continue",
      "# 1. Intel: Cmd+R at boot",
      "# 2. Utilities menu → Terminal",
      "resetpassword",
      "# Pick the user, set a new password, restart.",
      "# If FileVault is ON without the key, you cannot decrypt — only erase + reinstall.",
    ],
  },

  // ====== APPLE WATCH ======
  {
    id: "watch_activation_lock",
    name: "Apple Watch Activation Lock Bypass",
    category: "Apple Watch",
    device: "Apple Watch Series 0 – Series 3",
    description: "Old Apple Watches can be reset via iBus / iBoot exploits. Series 4+ are server-locked like iPhones.",
    prereq: "S0–S3 only. Series 4+ requires the original Apple ID.",
    warning: "There is no working bypass for Series 4 and newer.",
    commands: [
      "# Series 0/1/2/3 only:",
      "# 1. Force-restart watch (hold Side + Digital Crown 10s)",
      "# 2. On long boot, immediately tap 'Erase All Content' if it appears",
      "# 3. If iCloud-locked Hello screen appears: there's no software bypass — only return to original owner OR Apple Store with proof.",
      "# Useful tools (limited): iCloudin, Apple Watch Magico Box (hardware)",
    ],
  },

  // ====== AIRTAG / FINDMY ======
  {
    id: "airtag_clone",
    name: "Clone / Modify AirTag NRF chip",
    category: "AirTag",
    device: "Apple AirTag",
    description: "Reflash AirTag's nRF52832 with custom firmware (e.g., openhaystack) to broadcast custom Find-My BLE beacons.",
    prereq: "JTAG/SWD debugger (e.g., J-Link, Black Magic Probe), micro soldering or test-pads, nRF Command Line Tools.",
    warning: "Requires APPROACH glitch or downgraded nRF firmware to bypass APPROTECT — modern AirTags ship with APPROTECT enabled.",
    commands: [
      "# 1. Open AirTag (pry plastic cover, remove battery, desolder shield)",
      "# 2. Solder to SWDIO/SWCLK test-pads on nRF52832",
      "# 3. Check APPROTECT:",
      "nrfjprog --memrd 0x10001208 --w 32 --n 4   # FFFFFFFF = unprotected",
      "# 4. If protected, glitch attack with chipwhisperer or downgrade UICR",
      "# 5. Flash openhaystack firmware:",
      "git clone https://github.com/seemoo-lab/openhaystack",
      "nrfjprog --eraseall",
      "nrfjprog --program openhaystack-firmware.hex --reset",
      "# Now broadcasts arbitrary public-key beacons usable via Apple's Find-My network",
    ],
  },

  // ====== FORENSICS ======
  {
    id: "ios_filesystem_dump",
    name: "Full iOS Filesystem Dump",
    category: "Forensics",
    device: "Jailbroken iPhone/iPad",
    description: "Pull complete /var, /private, keychain, and iCloud token store off a JB device.",
    prereq: "Jailbroken with SSH (OpenSSH from Sileo/Cydia). Default root password: alpine — change immediately.",
    commands: [
      "# Install OpenSSH on device via Sileo",
      "# On PC:",
      "iproxy 2222 22 &              # USB tunnel",
      "ssh root@localhost -p 2222    # password: alpine",
      "# Dump everything:",
      "tar -czf /tmp/full.tar.gz /private /var",
      "scp -P 2222 root@localhost:/tmp/full.tar.gz ./",
      "# Keychain dump:",
      "git clone https://github.com/ptoomey3/Keychain-Dumper",
      "scp -P 2222 keychain_dumper root@localhost:/tmp/",
      "ssh root@localhost -p 2222 'chmod +x /tmp/keychain_dumper && /tmp/keychain_dumper'",
    ],
  },
  {
    id: "icloud_backup_extract",
    name: "Extract iCloud Backup with Apple ID",
    category: "Forensics",
    device: "Any account with valid Apple ID + password (+ 2FA)",
    description: "Pull complete iCloud backup contents — photos, iMessages, app data — without needing the physical device.",
    prereq: "Apple ID + password + 2FA code (or trusted device). For 2FA-enabled accounts you need the SMS or trusted-device prompt.",
    commands: [
      "pip install icloudpd",
      "icloudpd --username you@icloud.com --password XXXX --directory ./icloud_dump",
      "# Or for full backup (not just photos):",
      "git clone https://github.com/picklepete/pyicloud",
      "# Use pyicloud's PyiCloudService → fetch_devices, find_my_iphone, services.backup",
      "# Commercial (much more complete):",
      "#   - Elcomsoft Phone Breaker — pulls backup, keychain, iCloud Drive, Health, Messages",
      "#   - Magnet AXIOM Cloud",
    ],
  },
];

export async function copyAppleCommands(commands: string[], full: boolean): Promise<void> {
  const text = full
    ? commands.join("\n")
    : commands.filter((c) => !c.startsWith("#")).join("\n");
  await Clipboard.setStringAsync(text);
}
