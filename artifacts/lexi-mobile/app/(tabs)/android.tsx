import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  ADB_SCRIPTS,
  SETTINGS_ACTIONS,
  copyFullScript,
  copyScript,
  openAndroidSetting,
  type AdbScript,
  type SettingsAction,
} from "@/lib/android-mods";

type Tab = "settings" | "scripts";

export default function AndroidScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("settings");
  const [expanded, setExpanded] = useState<string | null>(null);

  const groupedSettings = useMemo(() => {
    return SETTINGS_ACTIONS.reduce<Record<string, SettingsAction[]>>((acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    }, {});
  }, []);

  const groupedScripts = useMemo(() => {
    return ADB_SCRIPTS.reduce<Record<string, AdbScript[]>>((acc, s) => {
      (acc[s.category] ??= []).push(s);
      return acc;
    }, {});
  }, []);

  const onOpen = async (a: SettingsAction) => {
    await openAndroidSetting(a.action);
  };

  const onCopy = async (s: AdbScript, full: boolean) => {
    if (full) await copyFullScript(s.commands);
    else await copyScript(s.commands);
    Alert.alert("Copied", `${s.name} — ${full ? "with comments" : "commands only"}.`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Feather name="cpu" size={18} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>ANDROID MODS</Text>
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => setTab("settings")} style={[styles.tabPill, tab === "settings" && { backgroundColor: colors.primary }]}>
          <Text style={{ color: tab === "settings" ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>
            SYSTEM SETTINGS
          </Text>
        </Pressable>
        <Pressable onPress={() => setTab("scripts")} style={[styles.tabPill, tab === "scripts" && { backgroundColor: colors.accent }]}>
          <Text style={{ color: tab === "scripts" ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>
            ADB / FASTBOOT
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, gap: 16 }}>
        {tab === "settings" ? (
          <>
            {Platform.OS !== "android" && (
              <View style={[styles.warnBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
                <Feather name="info" size={14} color={colors.mutedForeground} />
                <Text style={{ flex: 1, color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 12 }}>
                  Settings deep-links only fire on Android devices. On {Platform.OS}, taps will be no-ops.
                </Text>
              </View>
            )}
            {Object.entries(groupedSettings).map(([cat, items]) => (
              <View key={cat} style={{ gap: 8 }}>
                <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>{cat.toUpperCase()}</Text>
                {items.map((it) => (
                  <Pressable
                    key={it.id}
                    onPress={() => onOpen(it)}
                    style={[styles.settingRow, { borderColor: colors.border, backgroundColor: colors.card }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>{it.label}</Text>
                      <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 }}>{it.description}</Text>
                    </View>
                    <Feather name="external-link" size={16} color={colors.primary} />
                  </Pressable>
                ))}
              </View>
            ))}
          </>
        ) : (
          <>
            <View style={[styles.warnBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Feather name="terminal" size={14} color={colors.accent} />
              <Text style={{ flex: 1, color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 12 }}>
                Run these from a PC with adb+fastboot, or paste into Termux on a rooted phone. USB-debug the phone first.
              </Text>
            </View>
            {Object.entries(groupedScripts).map(([cat, items]) => (
              <View key={cat} style={{ gap: 8 }}>
                <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>{cat.toUpperCase()}</Text>
                {items.map((s) => {
                  const open = expanded === s.id;
                  return (
                    <View key={s.id} style={[styles.scriptCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                      <Pressable onPress={() => setExpanded(open ? null : s.id)} style={styles.scriptHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14 }}>{s.name}</Text>
                          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 }}>
                            {s.description}
                          </Text>
                        </View>
                        <Feather name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
                      </Pressable>
                      {open && (
                        <View style={{ gap: 10, marginTop: 10 }}>
                          <View style={{ gap: 4 }}>
                            <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 }}>PREREQUISITES</Text>
                            <Text style={{ color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 }}>{s.prereq}</Text>
                          </View>
                          {s.warning && (
                            <View style={[styles.warnBox, { borderColor: colors.destructive, backgroundColor: "rgba(248,81,73,0.08)" }]}>
                              <Feather name="alert-triangle" size={14} color={colors.destructive} />
                              <Text style={{ flex: 1, color: colors.destructive, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{s.warning}</Text>
                            </View>
                          )}
                          <View style={[styles.codeBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                            <ScrollView horizontal>
                              <Text selectable style={{ color: colors.foreground, fontFamily: "Courier", fontSize: 12, lineHeight: 18 }}>
                                {s.commands.join("\n")}
                              </Text>
                            </ScrollView>
                          </View>
                          <View style={{ flexDirection: "row", gap: 8 }}>
                            <Pressable onPress={() => onCopy(s, false)} style={[styles.copyBtn, { backgroundColor: colors.primary, flex: 1 }]}>
                              <Feather name="copy" size={14} color={colors.primaryForeground} />
                              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>COPY CMDS</Text>
                            </Pressable>
                            <Pressable onPress={() => onCopy(s, true)} style={[styles.copyBtn, { borderColor: colors.border, borderWidth: 1, flex: 1 }]}>
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
                Need a script for a flow not listed here? Ask Lexi in chat — she'll generate the exact ADB / fastboot / Magisk / TWRP procedure for your specific device, carrier, and Android version.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: 1 },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  tabPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  warnBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  settingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  scriptCard: { padding: 12, borderRadius: 12, borderWidth: 1 },
  scriptHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  codeBox: { borderRadius: 8, borderWidth: 1, padding: 10, maxHeight: 260 },
  copyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
});
