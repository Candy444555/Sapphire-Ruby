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
import { useLoggedAction } from "@/hooks/useLoggedAction";
import { log } from "@/lib/logger";
import {
  validateIMEI,
  lookupTAC,
  generateCodes,
  MOTO_BOOST_MODELS,
  type Carrier,
  type UnlockResult,
  type MotoBoostModel,
} from "@/lib/imei-unlock";

const CARRIERS: { id: Carrier; label: string }[] = [
  { id: "boost",        label: "Boost Mobile" },
  { id: "att",          label: "AT&T" },
  { id: "tmobile",      label: "T-Mobile" },
  { id: "verizon",      label: "Verizon" },
  { id: "sprint",       label: "Sprint" },
  { id: "metropcs",     label: "MetroPCS" },
  { id: "cricket",      label: "Cricket" },
  { id: "straighttalk", label: "Straight Talk" },
  { id: "other",        label: "Other" },
];

export default function ToolsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [imei, setImei] = useState("");
  const [carrier, setCarrier] = useState<Carrier>("boost");
  const [results, setResults] = useState<UnlockResult[] | null>(null);
  const [imeiValid, setImeiValid] = useState<boolean | null>(null);
  const [tacEntry, setTacEntry] = useState<ReturnType<typeof lookupTAC>>(null);
  const [motoModelId, setMotoModelId] = useState<string | undefined>(undefined);

  const isMoto = tacEntry?.brand === "Motorola" || tacEntry?.brand === "Motorola";
  const isBoostMoto = isMoto && carrier === "boost";

  const handleImeiChange = (text: string) => {
    const clean = text.replace(/\D/g, "").slice(0, 15);
    setImei(clean);
    setResults(null);
    setMotoModelId(undefined);
    if (clean.length === 15) {
      const valid = validateIMEI(clean);
      setImeiValid(valid);
      const entry = lookupTAC(clean);
      setTacEntry(entry);
      // Auto-select carrier if detected
      if (entry?.carrier === "Boost") setCarrier("boost");
      // Auto-select Moto model if TAC matches
      const motoMatch = MOTO_BOOST_MODELS.find((m) => clean.startsWith(m.tacPrefix));
      if (motoMatch) setMotoModelId(motoMatch.id);
    } else {
      setImeiValid(null);
      setTacEntry(null);
    }
  };

  const runGenerate = useLoggedAction("imei:generate", { category: "tools" });
  const generate = () => {
    if (imei.length !== 15) { Alert.alert("Invalid IMEI", "Enter a 15-digit IMEI number."); return; }
    if (imeiValid === false) { Alert.alert("Checksum Failed", "IMEI failed Luhn check. Verify the number."); return; }
    void runGenerate(() => {
      const codes = generateCodes(imei, carrier, tacEntry?.brand ?? "Unknown", motoModelId);
      setResults(codes);
      return codes.length;
    }, { inputs: { carrier, brand: tacEntry?.brand, motoModelId, tac: imei.slice(0, 8) } });
  };

  const copy = async (code: string, label: string) => {
    await Clipboard.setStringAsync(code);
    log.info("tools", "imei:copy", { actor: "user", target: label });
    Alert.alert("Copied", `${label}: ${code}`);
  };

  const imeiColor =
    imeiValid === null ? colors.foreground
    : imeiValid ? "#3fb950"
    : colors.destructive;

  const tac = imei.length >= 8 ? imei.slice(0, 8) : null;
  const brand = tacEntry?.brand ?? "";
  const modelLabel = tacEntry?.model ?? brand;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Feather name="unlock" size={18} color={colors.primary} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>IMEI UNLOCK</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}
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
            style={[styles.imeiInput, {
              color: imeiColor,
              borderColor: imeiValid === null ? colors.border : imeiColor,
              backgroundColor: colors.background,
            }]}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11 }}>
              {imei.length}/15{tac ? ` · TAC: ${tac}` : ""}
            </Text>
            {imeiValid !== null && (
              <Text style={{ color: imeiColor, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>
                {imeiValid ? "✓ VALID (Luhn)" : "✗ CHECKSUM FAIL"}
              </Text>
            )}
          </View>

          {modelLabel ? (
            <View style={[styles.deviceBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Feather name="smartphone" size={12} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 12 }}>
                  {modelLabel}
                </Text>
                {tacEntry?.carrier && (
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11 }}>
                    Locked to {tacEntry.carrier} Mobile · auto-detected
                  </Text>
                )}
              </View>
            </View>
          ) : null}

          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 8 }}>
            Dial *#06# to get your IMEI.
          </Text>
        </View>

        {/* Carrier */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>LOCKED CARRIER</Text>
          <View style={styles.chipGrid}>
            {CARRIERS.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => { setCarrier(c.id); setResults(null); }}
                style={[styles.chip, {
                  borderColor: carrier === c.id ? colors.primary : colors.border,
                  backgroundColor: carrier === c.id ? colors.muted : "transparent",
                }]}
              >
                <Text style={{
                  color: carrier === c.id ? colors.primary : colors.foreground,
                  fontFamily: "Inter_600SemiBold", fontSize: 11,
                }}>
                  {c.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Boost Motorola Model Picker */}
        {(brand === "Motorola" || carrier === "boost") && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary + "44" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Feather name="zap" size={13} color={colors.primary} />
              <Text style={[styles.sectionLabel, { color: colors.primary, marginBottom: 0 }]}>
                BOOST MOTOROLA MODEL
              </Text>
            </View>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 10 }}>
              Select your model for the most accurate codes. Auto-selected if IMEI matched.
            </Text>
            <View style={styles.chipGrid}>
              {MOTO_BOOST_MODELS.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => { setMotoModelId(m.id); setResults(null); }}
                  style={[styles.chip, {
                    borderColor: motoModelId === m.id ? colors.primary : colors.border,
                    backgroundColor: motoModelId === m.id ? colors.muted : "transparent",
                  }]}
                >
                  <View>
                    <Text style={{
                      color: motoModelId === m.id ? colors.primary : colors.foreground,
                      fontFamily: "Inter_600SemiBold", fontSize: 11,
                    }}>
                      {m.name}
                    </Text>
                    <Text style={{
                      color: colors.mutedForeground,
                      fontFamily: "Inter_400Regular", fontSize: 10,
                    }}>
                      {m.modelNum}
                    </Text>
                  </View>
                </Pressable>
              ))}
              <Pressable
                onPress={() => { setMotoModelId(undefined); setResults(null); }}
                style={[styles.chip, {
                  borderColor: motoModelId === undefined ? colors.primary : colors.border,
                  backgroundColor: motoModelId === undefined ? colors.muted : "transparent",
                }]}
              >
                <Text style={{
                  color: motoModelId === undefined ? colors.primary : colors.mutedForeground,
                  fontFamily: "Inter_600SemiBold", fontSize: 11,
                }}>
                  Auto / Other
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Generate */}
        <Pressable onPress={generate} style={[styles.generateBtn, { backgroundColor: colors.primary }]}>
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
              Insert a non-carrier SIM, power on, enter code when prompted. Try in order.
            </Text>
            {results.map((r, i) => (
              <View key={r.label} style={[
                styles.resultRow,
                { borderColor: colors.border },
                i === results.length - 1 && { borderBottomWidth: 0 },
              ]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 0.8 }}>
                    {r.label.toUpperCase()}
                  </Text>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 24, letterSpacing: 4, marginTop: 2 }}>
                    {r.code}
                  </Text>
                  {r.note && (
                    <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 }}>
                      {r.note}
                    </Text>
                  )}
                </View>
                <Pressable onPress={() => copy(r.code, r.label)} style={[styles.copyBtn, { borderColor: colors.border }]} hitSlop={8}>
                  <Feather name="copy" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Instructions */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>HOW TO USE</Text>
          {[
            ["1", "Power off your phone and insert a SIM from a different carrier."],
            ["2", "Power on — the phone will prompt \"Enter Network Unlock Code\" or \"SIM network unlock PIN\"."],
            ["3", "Enter the NCK code first. If rejected, try NSCK, then SPCK, then fallback."],
            ["4", "Each failed attempt counts — you typically get 10 tries before a hard lock."],
            ["5", "If all codes fail, the device needs a carrier database lookup (contact carrier or paid service)."],
          ].map(([step, text]) => (
            <View key={step} style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
              <View style={[styles.stepBadge, { backgroundColor: colors.muted }]}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 11 }}>{step}</Text>
              </View>
              <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 }}>{text}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: "rgba(248,81,73,0.06)", borderColor: "rgba(248,81,73,0.25)" }]}>
          <Text style={{ color: colors.destructive, fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, marginBottom: 6 }}>NOTICE</Text>
          <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 }}>
            Algorithmic codes work best on Motorola, Nokia, LG, ZTE, and Sony devices. iPhones and modern Samsung flagships use encrypted carrier databases — these codes will not work on those. You can also ask Lexi in chat to generate codes by sharing your IMEI there.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: 1.5 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  imeiInput: {
    fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: 3,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, textAlign: "center",
  },
  deviceBadge: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
  },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  generateBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 14, borderRadius: 12,
  },
  resultRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, gap: 10 },
  copyBtn: { padding: 10, borderRadius: 8, borderWidth: 1 },
  stepBadge: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 1 },
});
