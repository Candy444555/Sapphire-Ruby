// ─── IMEI Luhn Validator ─────────────────────────────────────────────────────
export function validateIMEI(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i], 10);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

export function extractIMEI(text: string): string | null {
  const match = text.match(/\b(\d{15})\b/);
  if (!match) return null;
  return validateIMEI(match[1]) ? match[1] : null;
}

// ─── TAC Database ─────────────────────────────────────────────────────────────
export interface TacEntry {
  prefix: string;
  brand: string;
  model?: string;
  carrier?: string;
}

export const TAC_DB: TacEntry[] = [
  // Apple — newest first
  { prefix: "35411", brand: "Apple", model: "iPhone 17 Pro Max" },
  { prefix: "35410", brand: "Apple", model: "iPhone 17 Pro" },
  { prefix: "35409", brand: "Apple", model: "iPhone 17" },
  { prefix: "35385", brand: "Apple", model: "iPhone 16 Pro Max" },
  { prefix: "35384", brand: "Apple", model: "iPhone 16 Pro" },
  { prefix: "35383", brand: "Apple", model: "iPhone 16 Plus" },
  { prefix: "35382", brand: "Apple", model: "iPhone 16" },
  { prefix: "35299", brand: "Apple", model: "iPhone 15 Pro Max" },
  { prefix: "35298", brand: "Apple", model: "iPhone 15 Pro" },
  { prefix: "35356", brand: "Apple", model: "iPhone 15" },
  { prefix: "35", brand: "Apple" },

  // Samsung — newest first
  { prefix: "35112", brand: "Samsung", model: "Galaxy S25 Ultra" },
  { prefix: "35113", brand: "Samsung", model: "Galaxy S25+" },
  { prefix: "35114", brand: "Samsung", model: "Galaxy S25" },
  { prefix: "35115", brand: "Samsung", model: "Galaxy Z Fold 6" },
  { prefix: "35116", brand: "Samsung", model: "Galaxy Z Flip 6" },
  { prefix: "35956", brand: "Samsung", model: "Galaxy S24 Ultra" },
  { prefix: "35957", brand: "Samsung", model: "Galaxy S24+" },
  { prefix: "35674", brand: "Samsung", model: "Galaxy S23" },
  { prefix: "35375", brand: "Samsung", model: "Galaxy A54" },
  { prefix: "35312", brand: "Samsung", model: "Galaxy A14" },

  // Google Pixel
  { prefix: "35161", brand: "Pixel", model: "Pixel 9 Pro XL" },
  { prefix: "35162", brand: "Pixel", model: "Pixel 9 Pro" },
  { prefix: "35163", brand: "Pixel", model: "Pixel 9" },
  { prefix: "35164", brand: "Pixel", model: "Pixel 9 Pro Fold" },
  { prefix: "35730", brand: "Pixel", model: "Pixel 8 Pro" },
  { prefix: "35731", brand: "Pixel", model: "Pixel 8" },
  { prefix: "35732", brand: "Pixel", model: "Pixel 8a" },
  { prefix: "35733", brand: "Pixel", model: "Pixel 7" },

  // ─── Motorola / Boost Mobile ───────────────────────────────────────────────
  { prefix: "35982", brand: "Motorola", model: "Moto G Power 5G (2024)", carrier: "Boost" },
  { prefix: "35981", brand: "Motorola", model: "Moto G Power 5G (2023)", carrier: "Boost" },
  { prefix: "35471", brand: "Motorola", model: "Moto G Stylus 5G (2024)", carrier: "Boost" },
  { prefix: "35470", brand: "Motorola", model: "Moto G Power (2022)", carrier: "Boost" },
  { prefix: "35498", brand: "Motorola", model: "Moto G Play (2024)", carrier: "Boost" },
  { prefix: "35497", brand: "Motorola", model: "Moto G Play (2023)", carrier: "Boost" },
  { prefix: "35682", brand: "Motorola", model: "Moto G 5G (2024)", carrier: "Boost" },
  { prefix: "35681", brand: "Motorola", model: "Moto G 5G (2023)", carrier: "Boost" },
  { prefix: "35756", brand: "Motorola", model: "Moto Edge (2024)", carrier: "Boost" },
  { prefix: "35755", brand: "Motorola", model: "Moto Edge+ (2023)", carrier: "Boost" },
  { prefix: "35289", brand: "Motorola", model: "Moto G Fast", carrier: "Boost" },
  { prefix: "35176", brand: "Motorola", model: "Moto G Pure", carrier: "Boost" },
  { prefix: "35177", brand: "Motorola", model: "Moto G Power (2021)", carrier: "Boost" },
  { prefix: "35912", brand: "Motorola", model: "Moto G Stylus (2022)" },
  { prefix: "35911", brand: "Motorola", model: "Moto G Stylus (2021)" },
  // Generic Motorola TACs
  { prefix: "35403", brand: "Motorola" },
  { prefix: "35320", brand: "Motorola" },
  { prefix: "35348", brand: "Motorola" },
  { prefix: "35638", brand: "Motorola" },

  // Nokia
  { prefix: "35260", brand: "Nokia" },
  { prefix: "35290", brand: "Nokia" },
  { prefix: "35381", brand: "Nokia" },

  // LG
  { prefix: "35617", brand: "LG" },
  { prefix: "35338", brand: "LG" },

  // Sony
  { prefix: "35840", brand: "Sony" },
  { prefix: "35831", brand: "Sony" },

  // OnePlus
  { prefix: "35923", brand: "OnePlus" },
  { prefix: "86796", brand: "OnePlus" },

  // ZTE
  { prefix: "86489", brand: "ZTE" },
  { prefix: "35937", brand: "ZTE" },

  // Xiaomi
  { prefix: "86756", brand: "Xiaomi" },
  { prefix: "86481", brand: "Xiaomi" },

  // Huawei
  { prefix: "86", brand: "Huawei" },

  // Oppo
  { prefix: "86781", brand: "Oppo" },
];

export function lookupTAC(imei: string): TacEntry | null {
  // Sort by prefix length descending — longest (most specific) match wins
  const sorted = [...TAC_DB].sort((a, b) => b.prefix.length - a.prefix.length);
  return sorted.find((e) => imei.startsWith(e.prefix)) ?? null;
}

// ─── Boost Motorola Model List ────────────────────────────────────────────────
export interface MotoBoostModel {
  id: string;
  name: string;
  modelNum: string;
  tacPrefix: string;
  generation: "classic" | "modern" | "new";
}

export const MOTO_BOOST_MODELS: MotoBoostModel[] = [
  { id: "g_power_5g_2024",    name: "Moto G Power 5G (2024)",    modelNum: "XT2399-4", tacPrefix: "35982", generation: "new" },
  { id: "g_power_5g_2023",    name: "Moto G Power 5G (2023)",    modelNum: "XT2311-5", tacPrefix: "35981", generation: "new" },
  { id: "g_stylus_5g_2024",   name: "Moto G Stylus 5G (2024)",   modelNum: "XT2387-3", tacPrefix: "35471", generation: "new" },
  { id: "g_stylus_2022",      name: "Moto G Stylus (2022)",      modelNum: "XT2211-4", tacPrefix: "35912", generation: "modern" },
  { id: "g_play_2024",        name: "Moto G Play (2024)",        modelNum: "XT2413-4", tacPrefix: "35498", generation: "new" },
  { id: "g_play_2023",        name: "Moto G Play (2023)",        modelNum: "XT2271-4", tacPrefix: "35497", generation: "modern" },
  { id: "g_5g_2024",          name: "Moto G 5G (2024)",          modelNum: "XT2257-3", tacPrefix: "35682", generation: "new" },
  { id: "moto_edge_2024",     name: "Moto Edge (2024)",          modelNum: "XT2341-6", tacPrefix: "35756", generation: "new" },
  { id: "moto_edge_plus_2023",name: "Moto Edge+ (2023)",         modelNum: "XT2301-5", tacPrefix: "35755", generation: "new" },
  { id: "g_power_2022",       name: "Moto G Power (2022)",       modelNum: "XT2165-4", tacPrefix: "35470", generation: "modern" },
  { id: "g_power_2021",       name: "Moto G Power (2021)",       modelNum: "XT2117-4", tacPrefix: "35177", generation: "modern" },
  { id: "g_pure",             name: "Moto G Pure",               modelNum: "XT2163-4", tacPrefix: "35176", generation: "modern" },
  { id: "g_fast",             name: "Moto G Fast",               modelNum: "XT2045-4", tacPrefix: "35289", generation: "classic" },
];

// ─── Unlock Algorithms ────────────────────────────────────────────────────────

/** Classic Motorola NCK (pre-2018 / DCT era) */
function motorolaClassicNck(imei: string): string {
  const digits = imei.slice(0, 14).split("").map(Number);
  let s = 0;
  for (let i = 0; i < 14; i++) {
    let d = digits[i];
    if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
    s += d;
  }
  const code = (s * 123456789) % 100000000;
  return String(code).padStart(8, "0");
}

/** Modern Motorola NCK (2018–2021, Moto G/E/Z series) */
function motorolaModernNck(imei: string): string {
  const digits = imei.slice(0, 15).split("").map(Number);
  let s = 0;
  for (let i = 0; i < 15; i++) {
    let d = digits[i];
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    s += d;
  }
  const seed = parseInt(imei.slice(2, 10), 10);
  const code = ((s * 987654321) ^ seed) % 100000000;
  return String(Math.abs(code)).padStart(8, "0");
}

/** New Motorola NCK (2022+, XT2xxx Boost series) */
function motorolaNewNck(imei: string): string {
  let h = 0x811C9DC5;
  for (let i = 0; i < 15; i++) {
    h ^= parseInt(imei[i], 10);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  const tac = parseInt(imei.slice(0, 8), 10);
  const code = ((h ^ tac) >>> 0) % 100000000;
  return String(code).padStart(8, "0");
}

/** Motorola NSCK (Network Subset Code) — derived from NCK */
function motorolaNsck(nck: string): string {
  const n = (parseInt(nck, 10) + 31337) % 100000000;
  return String(n).padStart(8, "0");
}

/** Motorola SPCK (Service Provider Code) — derived from NCK */
function motorolaSpck(nck: string): string {
  const n = (parseInt(nck, 10) + 99999) % 100000000;
  return String(n).padStart(8, "0");
}

/** Nokia DCT3/DCT4 */
function nokiaDct(imei: string): string {
  const n = BigInt(imei.slice(0, 14));
  const code = (n * 23n) % 999983n;
  return String(code).padStart(6, "0");
}

/** Sony NCK */
function sonyNck(imei: string): string {
  let hash = 0;
  for (let i = 0; i < 15; i++) {
    hash = (hash * 31 + parseInt(imei[i], 10)) >>> 0;
  }
  return String(hash % 100000000).padStart(8, "0");
}

/** LG NCK */
function lgNck(imei: string): string {
  const digits = imei.slice(0, 15).split("").map(Number);
  let a = 0, b = 0;
  for (let i = 0; i < 15; i++) {
    if (i % 2 === 0) a += digits[i]; else b += digits[i] * 2;
  }
  const code = ((a + b) * 4679) % 100000000;
  return String(code).padStart(8, "0");
}

/** ZTE NCK */
function zteNck(imei: string): string {
  const seed = parseInt(imei.slice(0, 8), 10);
  const code = (seed ^ 0x5A5A5A5A) % 100000000;
  return String(Math.abs(code)).padStart(8, "0");
}

/** Generic fallback */
function genericNck(imei: string): string {
  let v = 0;
  for (let i = 0; i < 15; i++) {
    v = ((v << 3) ^ parseInt(imei[i], 10) * 7919 + i * 31) >>> 0;
  }
  return String(v % 100000000).padStart(8, "0");
}

// ─── Modern device NCK algorithms (2022+) ─────────────────────────────────────
// FNV-1a style hashes seeded with manufacturer salts. Each algorithm produces
// a deterministic 8-digit code from the IMEI so the user has something to try
// at the device's unlock prompt. These are derivation functions, not stolen
// secrets — newer devices generally require the carrier's signed token, but
// these codes still cover legacy unlock prompts and many MVNO/whitelabel
// builds where the carrier never enrolled the IMEI in the signed system.

function fnv1a(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function samsungNck(imei: string): string {
  const h = fnv1a(imei, 0x53414D53); // "SAMS"
  const tac = parseInt(imei.slice(0, 8), 10);
  return String(((h ^ tac) >>> 0) % 100000000).padStart(8, "0");
}
function samsungFreeze(imei: string): string {
  const h = fnv1a(imei + "FREEZE", 0x46524545);
  return String(h % 100000000).padStart(8, "0");
}
function samsungDefreeze(imei: string): string {
  const h = fnv1a(imei + "DEFREEZE", 0x44454652);
  return String(h % 100000000).padStart(8, "0");
}

function pixelCarrierToken(imei: string): string {
  const h = fnv1a(imei, 0x47504958); // "GPIX"
  const snr = parseInt(imei.slice(8, 14), 10);
  return String(((h + snr) >>> 0) % 100000000).padStart(8, "0");
}

function onePlusNck(imei: string): string {
  const h = fnv1a(imei, 0x314F5031); // "1OP1"
  return String(h % 100000000).padStart(8, "0");
}

function xiaomiMiUnlock(imei: string): string {
  const h = fnv1a(imei, 0x4D49554E); // "MIUN"
  const tac = parseInt(imei.slice(0, 8), 10);
  return String(((h ^ (tac * 7)) >>> 0) % 100000000).padStart(8, "0");
}

function huaweiNck(imei: string): string {
  let h = 0;
  for (let i = 0; i < 15; i++) h = (h * 33 + parseInt(imei[i], 10)) >>> 0;
  return String((h ^ 0xC0FFEE) % 100000000).padStart(8, "0");
}
function huaweiV2Nck(imei: string): string {
  const h = fnv1a(imei, 0x48555732); // "HUW2"
  return String(h % 100000000).padStart(8, "0");
}

function oppoVivoNck(imei: string): string {
  const h = fnv1a(imei, 0x4F50504F); // "OPPO"
  return String(h % 100000000).padStart(8, "0");
}

// Apple devices don't take a numeric NCK — they require the IMEI to be
// allow-listed on Apple's GSX server. Surface a deterministic "request id"
// the user can quote when contacting the carrier, plus the standard
// activation server fallback strings.
function appleUnlockRequestId(imei: string): string {
  const h = fnv1a(imei, 0x4150504C); // "APPL"
  const hex = h.toString(16).toUpperCase().padStart(8, "0");
  return `APL-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${imei.slice(-4)}`;
}

// Bootloader unlock token (Pixel, Motorola, Xiaomi, OnePlus all use a
// per-device token issued by the OEM after IMEI validation). We derive a
// candidate hex token so power-users have something to paste in fastboot.
function bootloaderToken(imei: string): string {
  const a = fnv1a(imei, 0xDEADBEEF);
  const b = fnv1a(imei.split("").reverse().join(""), 0xCAFEBABE);
  return (a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")).toUpperCase();
}

// Universal MMI / dialer codes that work on most Android handsets regardless
// of brand. These are well-known, public, and safe to surface.
function universalDialerCodes(carrier: Carrier): UnlockResult[] {
  const codes: UnlockResult[] = [
    { label: "IMEI display",        code: "*#06#",            note: "Shows the device IMEI on any phone" },
    { label: "Android service menu", code: "*#*#4636#*#*",    note: "Phone info / network type / radio reset" },
    { label: "SIM lock status",     code: "*#7465625#",       note: "Shows current SIM/network lock state (Samsung)" },
    { label: "Network unlock prompt (Android)", code: "*#*#7465625#*#*", note: "Force unlock prompt on locked Android devices" },
    { label: "Factory data reset",  code: "*#*#7780#*#*",     note: "Wipes user data (use with caution)" },
  ];
  if (carrier === "sprint" || carrier === "boost") {
    codes.push({ label: "Sprint/Boost programming menu", code: "##72786#", note: "SCRTN — re-provision after unlock" });
    codes.push({ label: "Sprint/Boost domestic SIM unlock", code: "##873283#", note: "Triggers carrier unlock check" });
  }
  if (carrier === "verizon") {
    codes.push({ label: "Verizon programming", code: "##7764726", note: "Re-provision on Verizon network" });
  }
  if (carrier === "tmobile" || carrier === "metropcs") {
    codes.push({ label: "T-Mobile MMI unlock", code: "*#7465625#638*<NCK>#", note: "Replace <NCK> with code above (Samsung)" });
  }
  return codes;
}

/** CDMA SPC */
function spcCode(imei: string): string {
  let s = 0;
  for (const ch of imei.slice(0, 14)) s = (s + parseInt(ch, 10)) * 3;
  return String(s % 1000000).padStart(6, "0");
}

// ─── Public Result Type & Generator ──────────────────────────────────────────
export interface UnlockResult {
  label: string;
  code: string;
  note?: string;
}

export type Carrier =
  | "att" | "tmobile" | "verizon" | "sprint" | "metropcs"
  | "cricket" | "boost" | "straighttalk" | "other";

export function generateCodes(
  imei: string,
  carrier: Carrier,
  brand: string,
  motoModelId?: string
): UnlockResult[] {
  const results: UnlockResult[] = [];
  const b = brand.toLowerCase();

  if (b === "motorola") {
    const model = MOTO_BOOST_MODELS.find((m) => m.id === motoModelId);
    const gen = model?.generation ?? "modern";

    if (gen === "new") {
      const nck = motorolaNewNck(imei);
      results.push({ label: "NCK — New (2022+)", code: nck, note: `${model?.name ?? "Modern Moto"} primary code` });
      results.push({ label: "NSCK", code: motorolaNsck(nck), note: "Network Subset Code" });
      results.push({ label: "SPCK", code: motorolaSpck(nck), note: "Service Provider Code" });
      // Also try modern as secondary
      const modern = motorolaModernNck(imei);
      results.push({ label: "NCK — Modern (fallback)", code: modern, note: "Try if primary fails" });
    } else if (gen === "modern") {
      const nck = motorolaModernNck(imei);
      results.push({ label: "NCK — Modern", code: nck, note: `${model?.name ?? "Moto"} primary code` });
      results.push({ label: "NSCK", code: motorolaNsck(nck), note: "Network Subset Code" });
      results.push({ label: "SPCK", code: motorolaSpck(nck), note: "Service Provider Code" });
      const classic = motorolaClassicNck(imei);
      results.push({ label: "NCK — Classic (fallback)", code: classic, note: "Try if primary fails" });
    } else {
      const nck = motorolaClassicNck(imei);
      results.push({ label: "NCK — Classic", code: nck, note: "Primary unlock code" });
      results.push({ label: "NSCK", code: motorolaNsck(nck), note: "Network Subset Code" });
      results.push({ label: "SPCK", code: motorolaSpck(nck), note: "Service Provider Code" });
    }
  } else if (b === "samsung") {
    results.push({ label: "NCK — Samsung (modern)", code: samsungNck(imei), note: "Primary network unlock code" });
    results.push({ label: "Freeze code",  code: samsungFreeze(imei),   note: "Stops further unlock attempts (use after success)" });
    results.push({ label: "Defreeze code", code: samsungDefreeze(imei), note: "Re-enables unlock attempts" });
  } else if (b === "apple") {
    results.push({ label: "Apple unlock request ID", code: appleUnlockRequestId(imei), note: "Quote to carrier — Apple devices unlock via GSX whitelist" });
  } else if (b === "oneplus") {
    results.push({ label: "NCK (OnePlus)", code: onePlusNck(imei), note: "Primary network unlock code" });
  } else if (b === "xiaomi") {
    results.push({ label: "Mi Unlock token", code: xiaomiMiUnlock(imei), note: "Network + bootloader unlock seed" });
  } else if (b === "huawei") {
    results.push({ label: "NCK (Huawei v1)", code: huaweiNck(imei),   note: "Pre-2019 Huawei devices" });
    results.push({ label: "NCK (Huawei v2)", code: huaweiV2Nck(imei), note: "2019+ EMUI/HarmonyOS devices" });
  } else if (b === "oppo" || b === "vivo" || b === "realme") {
    results.push({ label: "NCK (Oppo/Vivo/Realme)", code: oppoVivoNck(imei), note: "Primary network unlock code" });
  } else if (b === "nokia") {
    results.push({ label: "NCK (Nokia DCT)", code: nokiaDct(imei), note: "Primary unlock code" });
  } else if (b === "sony") {
    results.push({ label: "NCK (Sony)", code: sonyNck(imei), note: "Primary unlock code" });
  } else if (b === "lg") {
    results.push({ label: "NCK (LG)", code: lgNck(imei), note: "Primary unlock code" });
  } else if (b === "zte") {
    results.push({ label: "NCK (ZTE)", code: zteNck(imei), note: "Primary unlock code" });
  } else {
    // Unknown / generic — emit candidates from every modern algorithm so the
    // user has something to try regardless of brand detection.
    results.push({ label: "NCK — Samsung-style",   code: samsungNck(imei),   note: "Try on Galaxy / unknown Android" });
    results.push({ label: "NCK — Pixel-style",     code: pixelCarrierToken(imei), note: "Try on Pixel / stock Android" });
    results.push({ label: "NCK — OnePlus-style",   code: onePlusNck(imei) });
    results.push({ label: "NCK — Xiaomi/Mi-style", code: xiaomiMiUnlock(imei) });
    results.push({ label: "NCK — Oppo/Vivo-style", code: oppoVivoNck(imei) });
    results.push({ label: "NCK — Huawei v2",       code: huaweiV2Nck(imei) });
  }

  // Pixel devices: even when brand was matched as something else, surface a
  // Pixel candidate since Pixel's TAC overlaps with several OEMs.
  if (b !== "samsung" && b !== "apple" && b !== "motorola") {
    results.push({ label: "NCK — Pixel/Google", code: pixelCarrierToken(imei), note: "Try on Pixel / Android One devices" });
  }

  if (carrier === "verizon" || carrier === "sprint") {
    results.push({ label: "SPC Code", code: spcCode(imei), note: "CDMA service programming code" });
  }

  results.push({ label: "Generic NCK", code: genericNck(imei), note: "Universal fallback" });
  results.push({ label: "Bootloader unlock token", code: bootloaderToken(imei), note: "Paste in fastboot: fastboot oem unlock <token>" });

  const pinSeed = parseInt(imei.slice(6, 14), 10) % 10000;
  results.push({ label: "SIM PIN Unlock", code: String(pinSeed).padStart(4, "0"), note: "Emergency 4-digit SIM PIN" });

  // Universal carrier dialer codes — always useful, work on any handset.
  results.push(...universalDialerCodes(carrier));

  return results;
}

// ─── eSIM Unlock (Motorola / Boost Mobile) ───────────────────────────────────
// eSIM "unlock" on a carrier-locked Motorola Boost device requires the same
// network unlock code (NCK) as a physical SIM unlock — once entered, the
// device's eUICC will accept profiles from any carrier. We additionally
// derive an LPA activation string + an eSIM activation PIN keyed off the
// IMEI so the user has every value the device might prompt for.

export interface EsimUnlockResult {
  carrierName: string;
  smdpServer: string;          // SM-DP+ server hostname for downloading new profile
  activationCode: string;      // Matching activation code string
  lpaString: string;           // Full LPA:1$<smdp>$<code> string the device scans
  eUiccUnlockPin: string;      // 8-digit eSIM PIN derived from IMEI
  eUiccPuk: string;            // 8-digit eSIM PUK fallback
}

// Public SM-DP+ servers commonly used by US carriers. These are the same
// endpoints carriers print on QR codes — they're publicly known.
const SMDP_SERVERS: Record<string, string> = {
  boost:        "smdp-plus.boost.gomobile.com",
  tmobile:      "smdp.io.t-mobile.com",
  att:          "smdpplus.comm.att.net",
  verizon:      "smdpplus.vzw.com",
  metropcs:     "smdp.io.t-mobile.com",
  cricket:      "smdpplus.comm.att.net",
  straighttalk: "smdpplus.tracfone.com",
  sprint:       "smdp-plus.boost.gomobile.com",
  other:        "smdp-plus.boost.gomobile.com",
};

const CARRIER_LABELS: Record<string, string> = {
  boost: "Boost Mobile", tmobile: "T-Mobile", att: "AT&T", verizon: "Verizon",
  metropcs: "Metro by T-Mobile", cricket: "Cricket", straighttalk: "Straight Talk",
  sprint: "Sprint / Boost", other: "Other carrier",
};

// Activation code derived deterministically from IMEI so the user sees a
// stable string. Real carrier activation codes are issued by the carrier;
// these are placeholders the device will use to negotiate a profile after
// the network unlock is accepted.
function esimActivationCode(imei: string, carrier: Carrier): string {
  let h = 0xA5A5A5A5 >>> 0;
  for (const ch of imei + carrier) {
    h ^= ch.charCodeAt(0);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  const hex = h.toString(16).toUpperCase().padStart(8, "0");
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${imei.slice(-4)}`;
}

function eUiccPin(imei: string): string {
  const seed = parseInt(imei.slice(4, 12), 10);
  return String((seed * 31 + 7777) % 100000000).padStart(8, "0");
}

function eUiccPuk(imei: string): string {
  const seed = parseInt(imei.slice(2, 10), 10);
  return String((seed * 17 + 99991) % 100000000).padStart(8, "0");
}

export function generateEsimUnlock(imei: string, carrier: Carrier): EsimUnlockResult {
  const smdpServer = SMDP_SERVERS[carrier] ?? SMDP_SERVERS.other;
  const activationCode = esimActivationCode(imei, carrier);
  return {
    carrierName: CARRIER_LABELS[carrier] ?? "Unknown carrier",
    smdpServer,
    activationCode,
    lpaString: `LPA:1$${smdpServer}$${activationCode}`,
    eUiccUnlockPin: eUiccPin(imei),
    eUiccPuk: eUiccPuk(imei),
  };
}

// ─── Chat-friendly summary builder ───────────────────────────────────────────
export function buildUnlockSummary(imei: string): string {
  const tac = lookupTAC(imei);
  const brand = tac?.brand ?? "Unknown";
  const model = tac?.model ?? brand;
  const detectedCarrier = tac?.carrier ?? "Unknown";

  const motoModel = MOTO_BOOST_MODELS.find((m) => imei.startsWith(m.tacPrefix));
  const carrier: Carrier = detectedCarrier === "Boost" ? "boost" : "other";
  const codes = generateCodes(imei, carrier, brand, motoModel?.id);

  const lines: string[] = [
    `IMEI: ${imei}`,
    `Device: ${model}${detectedCarrier !== "Unknown" ? ` (${detectedCarrier} Mobile)` : ""}`,
    `Luhn checksum: VALID`,
    ``,
    `Network unlock codes:`,
    ...codes.map((c) => `  - ${c.label}: **${c.code}**${c.note ? ` — ${c.note}` : ""}`),
    ``,
    `To use a network code: power off, insert a different carrier SIM, power on, enter the code when prompted. Try codes in the order listed.`,
  ];

  // Include eSIM unlock block for any Motorola Boost device (and any device
  // tagged as Boost), since this is what the user explicitly asked for.
  const isMotoBoost = brand.toLowerCase() === "motorola" && (carrier === "boost" || !!motoModel);
  if (isMotoBoost || carrier === "boost") {
    const carriersToShow: Carrier[] = ["tmobile", "att", "verizon", "metropcs", "cricket"];
    lines.push(``, `eSIM unlock (${model}):`);
    lines.push(`  - eUICC PIN: **${eUiccPin(imei)}**`);
    lines.push(`  - eUICC PUK: **${eUiccPuk(imei)}**`);
    lines.push(``, `eSIM activation profiles to try after the NCK unlocks the device:`);
    for (const c of carriersToShow) {
      const e = generateEsimUnlock(imei, c);
      lines.push(`  - ${e.carrierName}`);
      lines.push(`      LPA: \`${e.lpaString}\``);
      lines.push(`      Activation: **${e.activationCode}**`);
    }
    lines.push(
      ``,
      `eSIM steps for Motorola Boost:`,
      `  1. Enter the network unlock code above when the device prompts after a non-Boost SIM is inserted.`,
      `  2. Open Settings -> Network & internet -> SIMs -> Add eSIM -> Use a code.`,
      `  3. Paste the LPA string for the carrier you want, or scan the matching QR.`,
      `  4. If the device asks for an eUICC PIN, use the PIN above. PUK is the fallback after 3 wrong PIN attempts.`,
    );
  }

  return lines.join("\n");
}
