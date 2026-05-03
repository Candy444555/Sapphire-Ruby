import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { saveImageToGallery, saveTextToPhone, guessFilename } from "@/lib/save-to-device";
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
  const [savingImg, setSavingImg] = useState(false);
  const [savingTxt, setSavingTxt] = useState(false);
  const [imgSaved, setImgSaved] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const saveImage = async () => {
    if (!msg.image || savingImg) return;
    setSavingImg(true);
    try {
      await saveImageToGallery(msg.image);
      setImgSaved(true);
      setTimeout(() => setImgSaved(false), 2500);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not save image.");
    } finally {
      setSavingImg(false);
    }
  };

  const saveContent = async () => {
    if (!msg.content || savingTxt) return;
    setSavingTxt(true);
    try {
      const filename = guessFilename(msg.content);
      await saveTextToPhone(filename, msg.content);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not save file.");
    } finally {
      setSavingTxt(false);
    }
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
      {msg.image && (
        <View>
          <Image source={{ uri: msg.image }} style={styles.img} />
          <Pressable onPress={saveImage} disabled={savingImg} style={[styles.saveImgBtn, { backgroundColor: imgSaved ? "#238636" : "rgba(0,0,0,0.55)" }]} hitSlop={6}>
            <Feather name={imgSaved ? "check" : "download"} size={13} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_600SemiBold" }}>
              {imgSaved ? "Saved!" : savingImg ? "Saving…" : "Save to phone"}
            </Text>
          </Pressable>
        </View>
      )}
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
        <View style={styles.actions}>
          <Pressable onPress={copy} style={styles.actionBtn} hitSlop={6}>
            <Feather name={copied ? "check" : "copy"} size={12} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>
              {copied ? "Copied" : "Copy"}
            </Text>
          </Pressable>
          <Pressable onPress={saveContent} disabled={savingTxt} style={styles.actionBtn} hitSlop={6}>
            <Feather name="save" size={12} color={colors.mutedForeground} />
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>
              {savingTxt ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "92%", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  img: { width: 220, height: 220, borderRadius: 10, marginBottom: 4 },
  saveImgBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginBottom: 8, alignSelf: "flex-start" },
  actions: { flexDirection: "row", gap: 14, marginTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
});
