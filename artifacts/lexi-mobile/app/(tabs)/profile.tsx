import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useLexiConfig } from "@/hooks/useLexiConfig";
import { useLexiPythonScripts } from "@/hooks/useLexiPythonScripts";
import { useLexiSelfPatch } from "@/hooks/useLexiSelfPatch";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useRootMode } from "@/lib/root-mode";

type PermName = "camera" | "photos" | "location" | "contacts";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { enabled: rootMode, setEnabled: setRootMode } = useRootMode();
  const { profile, resetProfile } = useUserProfile();
  const { config, removeInstruction, clearInstructions } = useLexiConfig();
  const { extensions, deleteExtension, clearExtensions } = useLexiSelfPatch();
  const { scripts, deleteScript, clearScripts } = useLexiPythonScripts();

  const [granted, setGranted] = useState<Record<PermName, boolean>>({
    camera: false, photos: false, location: false, contacts: false,
  });

  const ask = async (name: PermName) => {
    try {
      let ok = false;
      if (name === "camera") ok = (await ImagePicker.requestCameraPermissionsAsync()).status === "granted";
      else if (name === "photos") ok = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status === "granted";
      else if (name === "location") ok = (await Location.requestForegroundPermissionsAsync()).status === "granted";
      else if (name === "contacts") ok = (await Contacts.requestPermissionsAsync()).status === "granted";
      setGranted((p) => ({ ...p, [name]: ok }));
      if (!ok) Alert.alert("Permission denied", "Enable in Settings to use this feature.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    }
  };

  const PermRow = ({ name, label, icon }: { name: PermName; label: string; icon: keyof typeof Feather.glyphMap }) => (
    <Pressable onPress={() => ask(name)} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={20} color={colors.primary} />
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={{ color: granted[name] ? colors.tint : colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
        {granted[name] ? "Connected" : "Tap to connect"}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, gap: 14 }}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.avatar}>
          <Feather name="user" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>Lexi User</Text>
        <Text style={[styles.tag, { color: colors.mutedForeground }]}>Operator</Text>
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 14 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="shield" size={18} color={colors.accent} />
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Root Mode</Text>
          </View>
          <Switch value={rootMode} onValueChange={setRootMode} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 }}>
          Unlocks elevated actions and unrestricted output. You assume responsibility for everything generated.
        </Text>
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
        <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>USER DNA</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Style: {profile.communicationStyle}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Messages analyzed: {profile.messageCount}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Avg length: {profile.avgMessageLength} chars</Text>
        {profile.topicsDetected.length > 0 && (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Interests: {profile.topicsDetected.join(", ")}</Text>
        )}
        <Pressable onPress={() => Alert.alert("Reset DNA?", "Lexi will forget your communication style.", [{ text: "Cancel" }, { text: "Reset", style: "destructive", onPress: resetProfile }])}>
          <Text style={{ color: colors.destructive, fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 6 }}>Reset DNA</Text>
        </Pressable>
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>FUSED EXTENSIONS ({extensions.length})</Text>
          {extensions.length > 0 && (
            <Pressable onPress={() => Alert.alert("Clear all extensions?", "", [{ text: "Cancel" }, { text: "Clear", style: "destructive", onPress: clearExtensions }])}>
              <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
            </Pressable>
          )}
        </View>
        {extensions.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontStyle: "italic", fontSize: 12 }}>None</Text>
        ) : extensions.map((e) => (
          <View key={e.name} style={styles.itemRow}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>• {e.name} — {e.description}</Text>
            <Pressable onPress={() => deleteExtension(e.name)} hitSlop={6}>
              <Feather name="x" size={14} color={colors.destructive} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>FUSED PYTHON SCRIPTS ({scripts.length})</Text>
          {scripts.length > 0 && (
            <Pressable onPress={() => Alert.alert("Clear all scripts?", "", [{ text: "Cancel" }, { text: "Clear", style: "destructive", onPress: clearScripts }])}>
              <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
            </Pressable>
          )}
        </View>
        {scripts.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontStyle: "italic", fontSize: 12 }}>None</Text>
        ) : scripts.map((s) => (
          <View key={s.slug} style={styles.itemRow}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>• {s.filePath} — {s.description}</Text>
            <Pressable onPress={() => deleteScript(s.slug)} hitSlop={6}>
              <Feather name="x" size={14} color={colors.destructive} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>SELF-MODIFICATIONS ({config.customAdditions.length})</Text>
          {config.customAdditions.length > 0 && (
            <Pressable onPress={() => Alert.alert("Clear all self-mods?", "", [{ text: "Cancel" }, { text: "Clear", style: "destructive", onPress: clearInstructions }])}>
              <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
            </Pressable>
          )}
        </View>
        {config.customAdditions.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontStyle: "italic", fontSize: 12 }}>None</Text>
        ) : config.customAdditions.map((a, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 12 }}>{i + 1}. {a}</Text>
            <Pressable onPress={() => removeInstruction(i)} hitSlop={6}>
              <Feather name="x" size={14} color={colors.destructive} />
            </Pressable>
          </View>
        ))}
      </View>

      <Text style={[styles.section, { color: colors.mutedForeground }]}>NATIVE ACCESS</Text>
      <PermRow name="camera" label="Camera" icon="camera" />
      <PermRow name="photos" label="Photos" icon="image" />
      <PermRow name="location" label="Location" icon="map-pin" />
      <PermRow name="contacts" label="Contacts" icon="users" />

      <Text style={[styles.footer, { color: colors.mutedForeground }]}>Lexi Mobile v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 18, alignItems: "center" },
  cardLeft: { borderRadius: 14, borderWidth: 1, padding: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#1c232c", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  name: { fontFamily: "Inter_700Bold", fontSize: 18 },
  tag: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 4, letterSpacing: 1.5 },
  section: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 2, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  rowLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  footer: { textAlign: "center", marginTop: 24, fontFamily: "Inter_400Regular", fontSize: 11 },
});
