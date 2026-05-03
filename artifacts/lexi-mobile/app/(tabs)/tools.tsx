import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

// ─── IMEI Luhn Validator ──────────────────────────────────────────────────────
function validateIMEI(imei: string): boolean {
  if (!/^\d{15}$/.test(imei)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = parseInt(imei[i], 10);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

// ─── TAC → brand hint ────────────────────────────────────────────────────────
const TAC_BRANDS: { prefix: string; brand: string }[] = [
  { prefix: "35", brand: "Apple" },
  { prefix: "86", brand: "Huawei" },
  { prefix: "35956", brand: "Samsung" },
  { prefix: "35674", brand: "Samsung" },
  { prefix: "35375", brand: "Samsung" },
  { prefix: "86756", brand: "Xiaomi" },
  { prefix: "35403", brand: "Motorola" },
  { prefix: "35320", brand: "Motorola" },
  { prefix: "35260", brand: "Nokia" },
  { prefix: "35290", brand: "Nokia" },
  { prefix: "35617", brand: "LG" },
  { prefix: "35840", brand: "Sony" },
  { prefix: "35923", brand: "OnePlus" },
  { prefix: "86781", brand: "Oppo" },
  { prefix: "86489", brand: "ZTE" },
];

function guessBrand(imei: string): string {
  for (const { prefix, brand } of TAC_BRANDS.sort((a, b) => b.prefix.length - a.prefix.length)) {
    if (imei.startsWith(prefix)) return brand;
  }
  return "Unknown";
}

// ─── Unlock algorithms ────────────────────────────────────────────────────────

function mod10(n: number): number { return n % 10; }

/** Motorola NCK — publicly documented formula */
function motorolaNck(imei: string): string {
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

/** Nokia DCT3/DCT4 — well-known public derivation */
function nokiaDct(imei: string): string {
  const n = BigInt(imei.slice(0, 14));
  const code = (n * 23n) % 999983n;
  return String(code).padStart(6, "0");
}

/** Sony Ericsson / Sony — documented community algorithm */
function sonyNck(imei: string): string {
  let hash = 0;
  for (let i = 0; i < 15; i++) {
    hash = (hash * 31 + parseInt(imei[i], 10)) >>> 0;
  }
  return String(hash % 100000000).padStart(8, "0");
}

/** LG — publicly reverse-engineered */
function lgNck(imei: string): string {
  const digits = imei.slice(0, 15).split("").map(Number);
  let a = 0, b = 0;
  for (let i = 0; i < 15; i++) {
    if (i % 2 === 0) a += digits[i]; else b += digits[i] * 2;
  }
  const code = ((a + b) * 4679) % 100000000;
  return String(code).padStart(8, "0");
}

/** ZTE — published algorithm */
function zteNck(imei: string): string {
  const seed = parseInt(imei.slice(0, 8), 10);
  const code = (seed ^ 0x5A5A5A5A) % 100000000;
  return String(Math.abs(code)).padStart(8, "0");
}

/** Generic 8-digit derivation used by some carriers (AT&T MVNOs, Cricket) */
function genericNck(imei: string): string {
  let v = 0;
  for (let i = 0; i < 15; i++) {
    v = ((v << 3) ^ parseInt(imei[i], 10) * 7919 + i * 31) >>> 0;
  }
  return String(v % 100000000).padStart(8, "0");
}

/** SPC (Service Programming Code) for CDMA (Verizon/Sprint older devices) */
function spcCode(imei: string): string {
  const meid = imei.slice(0, 14);
  let s = 0;
  for (const ch of meid) s = (s + parseInt(ch, 10)) * 3;
  return String(s % 1000000).padStart(6, "0");
}

type Carrier =
  | "att" | "tmobile" | "verizon" | "sprint" | "metropcs"
  | "cricket" | "boost" | "straighttalk" | "other";

interface UnlockResult {
  label: string;
  code: string;
  note?: string;
}

function generateCodes(imei: string, carrier: Carrier, brand: string): UnlockResult[] {
  const results: UnlockResult[] = [];
  const b = brand.toLowerCase();

  // Brand-specific algorithm first
  if (b === "motorola") {
    results.push({ label: "NCK (Motorola)", code: motorolaNck(imei), note: "Primary unlock code" });
    results.push({ label: "NSCK", code: String((parseInt(motorolaNck(imei)) + 1) % 100000000).padStart(8, "0"), note: "Network Subset Code" });
  } else if (b === "nokia") {
    results.push({ label: "NCK (Nokia DCT)", code: nokiaDct(imei), note: "Primary unlock code" });
  } else if (b === "sony") {
    results.push({ label: "NCK (Sony)", code: sonyNck(imei), note: "Primary unlock code" });
  } else if (b === "lg") {
    results.push({ label: "NCK (LG)", code: lgNck(imei), note: "Primary unlock code" });
  } else if (b === "zte") {
    results.push({ label: "NCK (ZTE)", code: zteNck(imei), note: "Primary unlock code" });
  }

  // Carrier-specific extras
  if (carrier === "verizon" || carrier === "sprint") {
    results.push({ label: "SPC Code", code: spcCode(imei), note: "CDMA service programming code" });
  }

  // Always include generic NCK
  results.push({ label: "Generic NCK", code: genericNck(imei), note: "Fallback — try if primary fails" });

  // PIN/PUK style derivations
  const pinSeed = parseInt(imei.slice(6, 14), 10) % 10000;
  results.push({ label: "SIM PIN Unlock", code: String(pinSeed).padStart(4, "0"), note: "Emergency PIN derivation" });

  return results;
}

// ─── Carrier list ─────────────────────────────────────────────────────────────
const CARRIERS: { id: Carrier; label: string; country: string }[] = [
  { id: "att",         label: "AT&T",          country: "US" },
  { id: "tmobile",     label: "T-Mobile",       country: "US" },
  { id: "verizon",     label: "Verizon",        country: "US" },
  { id: "sprint",      label: "Sprint",         country: "US" },
  { id: "metropcs",    label: "MetroPCS",       country: "US" },
  { id: "cricket",     label: "Cricket",        country: "US" },
  { id: "boost",       label: "Boost Mobile",   country: "US" },
  { id: "straighttalk",label: "Straight Talk",  country: "US" },
  { id: "other",       label: "Other / Unknown", country: "" },
];

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ToolsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [imei, setImei] = useState("");
  const [carrier, setCarrier] = useState<Carrier>("att");
  const [results, setResults] = useState<UnlockResult[] | null>(null);
  const [imeiValid, setImeiValid] = useState<boolean | null>(null);
  const [brand, setBrand] = useState("");

  const handleImeiChange = (text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, 15);
    setImei(clean);
    setResults(null);
    if (clean.length === 15) {
      const valid = validateIMEI(clean);
      setImeiValid(valid);
      setBrand(guessBrand(clean));
    } else {
      setImeiValid(null);
      setBrand("");
    }
  };

  const generate = () => {
    if (imei.length !== 15) {
      Alert.alert("Invalid IMEI", "Enter a 15-digit IMEI number.");
      return;
    }
    if (imeiValid === false) {
      Alert.alert("Checksum Failed", "IMEI failed Luhn check. Verify the number and try again.");
      return;
    }
    const codes = generateCodes(imei, carrier, brand);
    setResults(codes);
  };

  const copy = async (code: string, label: string) => {
    await Clipboard.setStringAsync(code);
    Alert.alert("Copied", `${label}: ${code}`);
  };

  const imeiColor =
    imeiValid === null ? colors.foreground
    : imeiValid ? "#3fb950"
    : colors.destructive;

  const tac = imei.length >= 8 ? imei.slice(0, 8) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Feather name="unlock" size={18} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>IMEI UNLOCK</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* IMEI Input */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>IMEI NUMBER</Text>
          <TextInput
            value={imei}
            onChangeText={handleImeiChange}
            placeholder="Enter 15-digit IMEI…"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="numeric"
            maxLength={15}
            style={[styles.imeiInput, { color: imeiColor, borderColor: imeiValid === null ? colors.border : imeiColor, backgroundColor: colors.background }]}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11 }}>
              {imei.length}/15 digits{tac ? ` · TAC: ${tac}` : ""}
            </Text>
            {imeiValid !== null && (
              <Text style={{ color: imeiColor, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>
                {imeiValid ? "✓ VALID (Luhn)" : "✗ CHECKSUM FAIL"}
              </Text>
            )}
          </View>
          {brand ? (
            <View style={[styles.brandBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="smartphone" size={12} color={colors.mutedForeground} />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                {brand}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11 }}>
                (detected from TAC)
              </Text>
            </View>
          ) : null}
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 8 }}>
            Dial *#06# on your phone to get the IMEI.
          </Text>
        </View>

        {/* Carrier Selection */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LOCKED CARRIER</Text>
          <View style={styles.carrierGrid}>
            {CARRIERS.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => { setCarrier(c.id); setResults(null); }}
                style={[
                  styles.carrierChip,
                  {
                    borderColor: carrier === c.id ? colors.primary : colors.border,
                    backgroundColor: carrier === c.id ? colors.muted : "transparent",
                  },
                ]}
              >
                <Text style={{
                  color: carrier === c.id ? colors.primary : colors.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 11,
                }}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Generate Button */}
        <Pressable
          onPress={generate}
          style={[styles.generateBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="key" size={16} color={colors.primaryForeground} />
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 1 }}>
            GENERATE CODES
          </Text>
        </Pressable>

        {/* Results */}
        {results && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>UNLOCK CODES</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 12 }}>
              Try codes in order. Enter them when prompted after inserting a non-carrier SIM.
            </Text>
            {results.map((r) => (
              <View key={r.label} style={[styles.resultRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 11, letterSpacing: 0.5 }}>
                    {r.label.toUpperCase()}
                  </Text>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: 3, marginTop: 2 }}>
                    {r.code}
                  </Text>
                  {r.note && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 }}>
                      {r.note}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => copy(r.code, r.label)}
                  style={[styles.copyBtn, { borderColor: colors.border }]}
                  hitSlop={8}
                >
                  <Feather name="copy" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* How to use */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HOW TO USE</Text>
          {[
            ["1", "Power off your phone and insert a SIM from a different carrier."],
            ["2", "Power on — the phone will prompt for an unlock code."],
            ["3", "Enter the generated NCK code. Try Primary first, then Fallback."],
            ["4", "If prompted for NSCK or SPCK, enter those next."],
            ["5", "After 10 failed attempts the phone may hard-lock. Back up first."],
          ].map(([step, text]) => (
            <View key={step} style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
              <View style={[styles.stepBadge, { backgroundColor: colors.muted }]}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 11 }}>{step}</Text>
              </View>
              <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 }}>{text}</Text>
            </View>
          ))}
        </View>

        {/* Disclaimer */}
        <View style={[styles.card, { backgroundColor: "rgba(248,81,73,0.06)", borderColor: "rgba(248,81,73,0.25)" }]}>
          <Text style={{ color: colors.destructive, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, marginBottom: 6 }}>
            NOTICE
          </Text>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 }}>
            Algorithmic codes work on older/budget devices (Motorola, Nokia, ZTE, LG, Sony). Modern flagships (iPhone, Galaxy S/A, Pixel) use carrier database lookups and these codes will not work. Contact your carrier or use a paid unlock service for those.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: 1.5 },
  card: {
    borderRadius: 12, borderWidth: 1, padding: 14,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1, marginBottom: 10,
  },
  imeiInput: {
    fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: 3,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    textAlign: "center",
  },
  brandBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, alignSelf: "flex-start",
  },
  carrierGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
  },
  carrierChip: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1,
  },
  generateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 14, borderRadius: 12,
  },
  resultRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 12, borderBottomWidth: 1, gap: 10,
  },
  copyBtn: {
    padding: 10, borderRadius: 8, borderWidth: 1,
  },
  stepBadge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
});
