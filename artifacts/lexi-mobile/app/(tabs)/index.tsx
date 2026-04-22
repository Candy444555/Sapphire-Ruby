import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { analyzeImages, streamLexi, type ChatMsg } from "@/lib/lexi-api";

type DisplayMsg = ChatMsg & { id: string; image?: string };

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<DisplayMsg[]>([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList<DisplayMsg>>(null);

  const newId = () =>
    Date.now().toString() + Math.random().toString(36).substring(2, 9);

  const pickImage = useCallback(async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.8,
    });
    if (!r.canceled && r.assets[0]?.base64) {
      const a = r.assets[0];
      setPendingImage(`data:${a.mimeType ?? "image/jpeg"};base64,${a.base64}`);
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text && !pendingImage) return;
    if (busy) return;
    setBusy(true);

    const userMsg: DisplayMsg = {
      id: newId(),
      role: "user",
      content: text || "(image)",
      image: pendingImage ?? undefined,
    };
    const assistantId = newId();
    const assistantMsg: DisplayMsg = { id: assistantId, role: "assistant", content: "" };

    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setInput("");
    const sentImage = pendingImage;
    setPendingImage(null);

    try {
      let userContent = text;
      if (sentImage) {
        const analysis = await analyzeImages(text || "Describe this image in detail.", [sentImage]);
        userContent = `${text}\n\n[Vision analysis of attached image: ${analysis}]`.trim();
      }

      const apiHistory: ChatMsg[] = nextMessages
        .slice(0, -1)
        .map((m) => ({
          role: m.role,
          content: m.id === userMsg.id ? userContent : m.content,
        }));

      let acc = "";
      await streamLexi(apiHistory, (tok) => {
        acc += tok;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
        );
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: `⚠ ${msg}` } : m)),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, input, messages, pendingImage]);

  const renderItem = ({ item }: { item: DisplayMsg }) => {
    const isUser = item.role === "user";
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
        {item.image && (
          <Image source={{ uri: item.image }} style={styles.attachedImage} />
        )}
        <Text
          style={{
            color: isUser ? colors.primaryForeground : colors.foreground,
            fontFamily: "Inter_400Regular",
            fontSize: 15,
            lineHeight: 22,
          }}
        >
          {item.content || "…"}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>LEXI</Text>
        <Text style={[styles.subtitle, { color: colors.primary }]}>UNCENSORED_AI</Text>
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 10 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 80, gap: 12 }}>
              <Feather name="terminal" size={40} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
                Ask Lexi anything.
              </Text>
            </View>
          }
        />

        {pendingImage && (
          <View style={[styles.previewBar, { borderTopColor: colors.border, backgroundColor: colors.card }]}>
            <Image source={{ uri: pendingImage }} style={styles.previewThumb} />
            <Text style={{ color: colors.foreground, flex: 1, fontFamily: "Inter_500Medium" }}>
              Attached image
            </Text>
            <Pressable onPress={() => setPendingImage(null)} hitSlop={10}>
              <Feather name="x" size={20} color={colors.foreground} />
            </Pressable>
          </View>
        )}

        <View
          style={[
            styles.inputBar,
            {
              borderTopColor: colors.border,
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + (Platform.OS === "web" ? 16 : 8),
            },
          ]}
        >
          <Pressable onPress={pickImage} style={styles.iconBtn} hitSlop={10}>
            <Feather name="image" size={22} color={colors.primary} />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message Lexi…"
            placeholderTextColor={colors.mutedForeground}
            multiline
            style={[
              styles.input,
              {
                color: colors.foreground,
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            editable={!busy}
          />
          <Pressable onPress={send} disabled={busy} style={styles.iconBtn} hitSlop={10}>
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Feather name="send" size={22} color={colors.primary} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, letterSpacing: 1 },
  subtitle: { fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 2, marginTop: 2 },
  bubble: {
    maxWidth: "84%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  attachedImage: { width: 200, height: 200, borderRadius: 10, marginBottom: 8 },
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderTopWidth: 1,
  },
  previewThumb: { width: 44, height: 44, borderRadius: 8 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  iconBtn: { padding: 8 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
});
