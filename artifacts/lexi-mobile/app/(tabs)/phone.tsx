import { Feather } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { phoneLookup } from "@/lib/lexi-api";

type Result = {
  carrier?: { name?: string; type?: string; mobile_country_code?: string; mobile_network_code?: string };
  location?: { country?: string; region?: string; city?: string; latitude?: number; longitude?: number };
  number?: { national?: string; international?: string; e164?: string };
  validation?: { valid?: boolean; possible?: boolean; type?: string };
  privacy?: { spam_risk?: string; risk_score?: number; reported_count?: number };
  timezone?: string[];
  raw?: unknown;
} & Record<string, unknown>;

export default function PhoneScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const lookup = useCallback(async () => {
    const v = number.trim();
    if (!v) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await phoneLookup(v);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }, [number]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, gap: 14 }}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>PHONE LOOKUP</Text>
      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 }}>
        Enter any phone number with country code (e.g. +14155552671) to retrieve carrier, location, validity and risk data.
      </Text>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={number}
          onChangeText={setNumber}
          placeholder="+14155552671"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="phone-pad"
          autoCorrect={false}
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
        />
        <Pressable onPress={lookup} disabled={busy} style={[styles.btn, { backgroundColor: colors.primary }]}>
          {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="search" size={18} color={colors.primaryForeground} />}
        </Pressable>
      </View>

      {error && (
        <View style={[styles.box, { borderColor: colors.destructive, backgroundColor: "rgba(248,81,73,0.1)" }]}>
          <Text style={{ color: colors.destructive, fontFamily: "Inter_500Medium", fontSize: 12 }}>{error}</Text>
        </View>
      )}

      {result && (
        <View style={{ gap: 12 }}>
          {result.number && (
            <Section title="Number" colors={colors}>
              <Row label="E.164" value={result.number.e164} colors={colors} />
              <Row label="International" value={result.number.international} colors={colors} />
              <Row label="National" value={result.number.national} colors={colors} />
            </Section>
          )}
          {result.validation && (
            <Section title="Validation" colors={colors}>
              <Row label="Valid" value={String(result.validation.valid)} colors={colors} />
              <Row label="Possible" value={String(result.validation.possible)} colors={colors} />
              <Row label="Type" value={result.validation.type} colors={colors} />
            </Section>
          )}
          {result.carrier && (
            <Section title="Carrier" colors={colors}>
              <Row label="Name" value={result.carrier.name} colors={colors} />
              <Row label="Type" value={result.carrier.type} colors={colors} />
              <Row label="MCC" value={result.carrier.mobile_country_code} colors={colors} />
              <Row label="MNC" value={result.carrier.mobile_network_code} colors={colors} />
            </Section>
          )}
          {result.location && (
            <Section title="Location" colors={colors}>
              <Row label="Country" value={result.location.country} colors={colors} />
              <Row label="Region" value={result.location.region} colors={colors} />
              <Row label="City" value={result.location.city} colors={colors} />
              {result.location.latitude && result.location.longitude && (
                <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${result.location!.latitude},${result.location!.longitude}`)}>
                  <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 4 }}>Open in maps →</Text>
                </Pressable>
              )}
            </Section>
          )}
          {result.privacy && (
            <Section title="Privacy / Risk" colors={colors}>
              <Row label="Spam risk" value={result.privacy.spam_risk} colors={colors} />
              <Row label="Risk score" value={String(result.privacy.risk_score ?? "")} colors={colors} />
              <Row label="Reports" value={String(result.privacy.reported_count ?? "")} colors={colors} />
            </Section>
          )}
          {result.timezone && (
            <Section title="Timezone" colors={colors}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                {Array.isArray(result.timezone) ? result.timezone.join(", ") : String(result.timezone)}
              </Text>
            </Section>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5, marginBottom: 6 }}>{title}</Text>
      <View style={{ gap: 4 }}>{children}</View>
    </View>
  );
}

function Row({ label, value, colors }: { label: string; value?: string; colors: any }) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 12 }}>{label}</Text>
      <Text selectable style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12, flexShrink: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: 1.5 },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_500Medium", fontSize: 15 },
  btn: { paddingHorizontal: 16, justifyContent: "center", alignItems: "center", borderRadius: 12 },
  box: { borderRadius: 12, borderWidth: 1, padding: 12 },
});
