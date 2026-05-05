import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  APPLE_PROCEDURES,
  copyAppleCommands,
  type AppleProcedure,
} from "@/lib/apple-mods";

export default function AppleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return APPLE_PROCEDURES.reduce<Record<string, AppleProcedure[]>>((acc, p) => {
      (acc[p.category] ??= []).push(p);
      return acc;
    }, {});
  }, []);

  const categories = Object.keys(grouped);
  const visible = filter ? { [filter]: grouped[filter] } : grouped;

  const onCopy = async (p: AppleProcedure, full: boolean) => {
    await copyAppleCommands(p.commands, full);
    Alert.alert("Copied", `${p.name} — ${full ? "with comments" : "commands only"}.`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Feather name="smartphone" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>APPLE TOOLKIT</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 11 }}>
            {APPLE_PROCEDURES.length} procedures · iPhone · iPad · Mac · Watch · AirTag
          </Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.filterBar, { borderBottomColor: colors.border }]} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Pressable onPress={() => setFilter(null)} style={[styles.filterPill, !filter && { backgroundColor: colors.primary, borderColor: colors.primary }, filter && { borderColor: colors.border }]}>
          <Text style={{ color: !filter ? colors.primaryForeground : colors.foreground, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 }}>ALL</Text>
        </Pressable>
        {categories.map((c) => {
          const active = filter === c;
          return (
            <Pressable key={c} onPress={() => setFilter(active ? null : c)} style={[styles.filterPill, active && { backgroundColor: colors.accent, borderColor: colors.accent }, !active && { borderColor: colors.border }]}>
              <Text style={{ color: active ? colors.foreground : colors.foreground, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 }}>{c.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, gap: 16 }}>
        {Object.entries(visible).map(([cat, items]) => (
          <View key={cat} style={{ gap: 8 }}>
            <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>{cat.toUpperCase()}</Text>
            {items.map((p) => {
              const open = expanded === p.id;
              return (
                <View key={p.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Pressable onPress={() => setExpanded(open ? null : p.id)} style={styles.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14 }}>{p.name}</Text>
                      <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 11, marginTop: 2 }}>{p.device}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                        {p.description}
                      </Text>
                    </View>
                    <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
                  </Pressable>
                  {open && (
                    <View style={{ gap: 10, marginTop: 10 }}>
                      <View style={{ gap: 4 }}>
                        <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 }}>PREREQUISITES</Text>
                        <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 }}>{p.prereq}</Text>
                      </View>
                      {p.warning && (
                        <View style={[styles.warnBox, { borderColor: colors.destructive, backgroundColor: "rgba(248,81,73,0.08)" }]}>
                          <Feather name="alert-triangle" size={14} color={colors.destructive} />
                          <Text style={{ flex: 1, color: colors.destructive, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{p.warning}</Text>
                        </View>
                      )}
                      <View style={[styles.codeBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        <ScrollView horizontal>
                          <Text selectable style={{ color: colors.foreground, fontFamily: "Courier", fontSize: 12, lineHeight: 18 }}>
                            {p.commands.join("\n")}
                          </Text>
                        </ScrollView>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable onPress={() => onCopy(p, false)} style={[styles.copyBtn, { backgroundColor: colors.primary, flex: 1 }]}>
                          <Feather name="copy" size={14} color={colors.primaryForeground} />
                          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>COPY CMDS</Text>
                        </Pressable>
                        <Pressable onPress={() => onCopy(p, true)} style={[styles.copyBtn, { borderColor: colors.border, borderWidth: 1, flex: 1 }]}>
                          <Feather name="file-text" size={14} color={colors.foreground} />
                          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>COPY ALL</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}
        <View style={[styles.warnBox, { borderColor: "rgba(248,81,73,0.25)", backgroundColor: "rgba(248,81,73,0.06)" }]}>
          <Feather name="zap" size={14} color={colors.destructive} />
          <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 }}>
            Need a procedure for a specific device, iOS version, or Mac model not listed? Ask Lexi in chat — she'll generate the exact checkm8 / palera1n / Configurator / GSX flow for your target.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: 1 },
  filterBar: { borderBottomWidth: 1, maxHeight: 50 },
  filterPill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, borderWidth: 1, alignSelf: "flex-start" },
  card: { padding: 12, borderRadius: 12, borderWidth: 1 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  warnBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  codeBox: { borderRadius: 8, borderWidth: 1, padding: 10, maxHeight: 280 },
  copyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
});
