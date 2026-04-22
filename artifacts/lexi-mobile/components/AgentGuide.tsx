import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

const TIPS: { icon: keyof typeof Feather.glyphMap; title: string; body: string }[] = [
  { icon: "terminal", title: "Run shell commands", body: "Lexi can run real commands in a Linux sandbox. Try: \"List the files in /tmp\" or \"Install ffmpeg\"." },
  { icon: "cpu", title: "Multi-step tasks", body: "Ask Lexi to plan, code, test and deliver. She can iterate until it works." },
  { icon: "package", title: "Build artifacts", body: "Say \"Build me a Tic Tac Toe web app\" or \"Make me a Python OSINT script\"." },
  { icon: "zap", title: "Self-fuse capabilities", body: "Click FUSE and describe a permanent ability — Lexi will write & install it." },
];

export function AgentGuide({ onDismiss }: { onDismiss?: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.head}>
        <Feather name="info" size={14} color={colors.accent} />
        <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1.5, flex: 1 }}>
          AGENT MODE
        </Text>
        {onDismiss && (
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
      <ScrollView style={{ maxHeight: 220 }}>
        <View style={{ gap: 12 }}>
          {TIPS.map((t) => (
            <View key={t.title} style={{ flexDirection: "row", gap: 10 }}>
              <Feather name={t.icon} size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{t.title}</Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 2 }}>
                  {t.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
});
