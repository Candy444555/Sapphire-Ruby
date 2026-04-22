import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
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

type PermName = "camera" | "photos" | "location" | "contacts";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [rootMode, setRootMode] = useState(false);
  const [granted, setGranted] = useState<Record<PermName, boolean>>({
    camera: false, photos: false, location: false, contacts: false,
  });

  const ask = async (name: PermName) => {
    try {
      let ok = false;
      if (name === "camera") {
        const r = await ImagePicker.requestCameraPermissionsAsync();
        ok = r.status === "granted";
      } else if (name === "photos") {
        const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
        ok = r.status === "granted";
      } else if (name === "location") {
        const r = await Location.requestForegroundPermissionsAsync();
        ok = r.status === "granted";
      } else if (name === "contacts") {
        const r = await Contacts.requestPermissionsAsync();
        ok = r.status === "granted";
      }
      setGranted((p) => ({ ...p, [name]: ok }));
      if (!ok) Alert.alert("Permission denied", "Enable in Settings to use this feature.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    }
  };

  const PermRow = ({ name, label, icon }: { name: PermName; label: string; icon: keyof typeof Feather.glyphMap }) => (
    <Pressable
      onPress={() => ask(name)}
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <Feather name={icon} size={20} color={colors.primary} />
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={{
        color: granted[name] ? colors.tint : colors.mutedForeground,
        fontFamily: "Inter_500Medium",
      }}>
        {granted[name] ? "Connected" : "Tap to connect"}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, gap: 16 }}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.avatar}>
          <Feather name="user" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>Lexi User</Text>
        <Text style={[styles.tag, { color: colors.mutedForeground }]}>Operator</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 14 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="shield" size={18} color={colors.accent} />
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
              Root Mode
            </Text>
          </View>
          <Switch
            value={rootMode}
            onValueChange={setRootMode}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 }}>
          Unlocks elevated actions and unrestricted output. You assume responsibility for everything generated.
        </Text>
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
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: "#1c232c",
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  name: { fontFamily: "Inter_700Bold", fontSize: 18 },
  tag: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 4, letterSpacing: 1.5 },
  section: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 2, marginTop: 8 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  rowLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15 },
  footer: { textAlign: "center", marginTop: 24, fontFamily: "Inter_400Regular", fontSize: 11 },
});
