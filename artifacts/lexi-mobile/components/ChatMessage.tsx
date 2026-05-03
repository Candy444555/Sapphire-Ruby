import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { Markdown } from "./Markdown";

export interface DisplayMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  image?: string;
}

export function ChatMessage({ msg }: { msg: DisplayMsg }) {
  const colors = useColors();
  const isUser = msg.role === "user";
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View
      style={[
        styles.bubble,
        {
          backgroundColor: isUser ? colors.primary : colors.card,
          alignSelf: isUser ? "flex-end" : "flex-start",
          borderColor: colors.border,
        },
      ]}
    >
      {msg.image && <Image source={{ uri: msg.image }} style={styles.img} />}
      {isUser ? (
        <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22 }}>
          {msg.content || "…"}
        </Text>
      ) : msg.content ? (
        <Markdown content={msg.content} />
      ) : (
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 15 }}>…</Text>
      )}
      {!isUser && msg.content ? (
        <Pressable onPress={copy} style={styles.copy} hitSlop={6}>
          <Feather name={copied ? "check" : "copy"} size={12} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "92%", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  img: { width: 200, height: 200, borderRadius: 10, marginBottom: 8 },
  copy: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, alignSelf: "flex-start" },
});
