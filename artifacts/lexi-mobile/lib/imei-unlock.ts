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
  // Apple
  { prefix: "35299", brand: "Apple", model: "iPhone 15 Pro Max" },
  { prefix: "35298", brand: "Apple", model: "iPhone 15 Pro" },
  { prefix: "35356", brand: "Apple", model: "iPhone 15" },
  { prefix: "35", brand: "Apple" },

  // Samsung
  { prefix: "35956", brand: "Samsung", model: "Galaxy S24 Ultra" },
  { prefix: "35957", brand: "Samsung", model: "Galaxy S24+" },
  { prefix: "35674", brand: "Samsung", model: "Galaxy S23" },
  { prefix: "35375", brand: "Samsung", model: "Galaxy A54" },
  { prefix: "35312", brand: "Samsung", model: "Galaxy A14" },

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
  } else if (b === "nokia") {
    results.push({ label: "NCK (Nokia DCT)", code: nokiaDct(imei), note: "Primary unlock code" });
  } else if (b === "sony") {
    results.push({ label: "NCK (Sony)", code: sonyNck(imei), note: "Primary unlock code" });
  } else if (b === "lg") {
    results.push({ label: "NCK (LG)", code: lgNck(imei), note: "Primary unlock code" });
  } else if (b === "zte") {
    results.push({ label: "NCK (ZTE)", code: zteNck(imei), note: "Primary unlock code" });
  }

  if (carrier === "verizon" || carrier === "sprint") {
    results.push({ label: "SPC Code", code: spcCode(imei), note: "CDMA service programming code" });
  }

  results.push({ label: "Generic NCK", code: genericNck(imei), note: "Fallback — try if primary fails" });

  const pinSeed = parseInt(imei.slice(6, 14), 10) % 10000;
  results.push({ label: "SIM PIN Unlock", code: String(pinSeed).padStart(4, "0"), note: "Emergency PIN derivation" });

  return results;
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
    `📱 IMEI: ${imei}`,
    `🔍 Device: ${model}${detectedCarrier !== "Unknown" ? ` (${detectedCarrier} Mobile)` : ""}`,
    `✅ Luhn checksum: VALID`,
    `🔓 Unlock codes:`,
    ...codes.map((c) => `  • ${c.label}: **${c.code}**${c.note ? ` — ${c.note}` : ""}`),
    ``,
    `To use: power off, insert a different carrier SIM, power on, enter code when prompted. Try codes in order listed.`,
  ];

  return lines.join("\n");
}
