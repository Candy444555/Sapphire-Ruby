import React, { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { formatGlobalErrors, getGlobalErrors, subscribeGlobalErrors } from "@/lib/global-error-log";

export function DebugErrorOverlay() {
  const [count, setCount] = useState(getGlobalErrors().length);
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeGlobalErrors(() => setCount(getGlobalErrors().length)), []);

  if (count === 0) return null;

  const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show captured JS errors"
        onPress={() => setOpen(true)}
        style={styles.pill}
      >
        <Text style={styles.pillText}>JS errors: {count} — tap</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.headerText}>Captured JS errors ({count})</Text>
              <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
              <Text selectable style={[styles.body, { fontFamily: monoFont }]}>
                {formatGlobalErrors()}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    top: 48,
    alignSelf: "center",
    backgroundColor: "#7f1d1d",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    zIndex: 9999,
    elevation: 12,
  },
  pillText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { height: "85%", backgroundColor: "#0d1117", borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderBottomWidth: 1, borderBottomColor: "#1f2937",
  },
  headerText: { color: "#f9fafb", fontWeight: "700", fontSize: 16 },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#1f2937", borderRadius: 8 },
  closeText: { color: "#f9fafb", fontWeight: "600" },
  body: { color: "#fca5a5", fontSize: 11, lineHeight: 16 },
});
