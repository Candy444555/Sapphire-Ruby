import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { generateImage, runCode } from "@/lib/lexi-api";

const LANGS = ["python", "javascript", "bash"] as const;

export default function ToolsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [imgPrompt, setImgPrompt] = useState("");
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState<string | null>(null);

  const [lang, setLang] = useState<(typeof LANGS)[number]>("python");
  const [code, setCode] = useState('print("hello from Lexi")');
  const [runResult, setRunResult] = useState<{ ok: boolean; stdout: string; stderr: string } | null>(null);
  const [runBusy, setRunBusy] = useState(false);

  const doImage = async () => {
    if (!imgPrompt.trim() || imgBusy) return;
    setImgBusy(true); setImgErr(null); setImgUrl(null);
    try {
      const url = await generateImage(imgPrompt.trim());
      setImgUrl(url);
    } catch (e) {
      setImgErr(e instanceof Error ? e.message : "Failed");
    } finally { setImgBusy(false); }
  };

  const doRun = async () => {
    if (runBusy) return;
    setRunBusy(true); setRunResult(null);
    try {
      const r = await runCode(lang, code);
      setRunResult({ ok: r.ok, stdout: r.stdout, stderr: r.stderr });
    } catch (e) {
      setRunResult({ ok: false, stdout: "", stderr: e instanceof Error ? e.message : "Failed" });
    } finally { setRunBusy(false); }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, gap: 24 }}
    >
      <View>
        <Text style={[styles.h, { color: colors.foreground }]}>
          <Feather name="image" size={18} color={colors.primary} />  Photoreal Image
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Generate a photorealistic image from a prompt.
        </Text>
        <TextInput
          value={imgPrompt}
          onChangeText={setImgPrompt}
          placeholder="A neon-lit Tokyo alleyway in the rain at night"
          placeholderTextColor={colors.mutedForeground}
          multiline
          style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
        />
        <Pressable
          onPress={doImage}
          disabled={imgBusy}
          style={[styles.btn, { backgroundColor: colors.primary }]}
        >
          {imgBusy ? <ActivityIndicator color={colors.primaryForeground} /> :
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Generate</Text>}
        </Pressable>
        {imgErr && <Text style={{ color: colors.destructive, marginTop: 8 }}>{imgErr}</Text>}
        {imgUrl && (
          <Image source={{ uri: imgUrl }} style={styles.genImage} resizeMode="cover" />
        )}
      </View>

      <View>
        <Text style={[styles.h, { color: colors.foreground }]}>
          <Feather name="terminal" size={18} color={colors.primary} />  Run Code
        </Text>
        <Text style={[styles.sub, { color: colors.mutedForeground }]}>
          Execute code in a sandbox and see the output.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginVertical: 8 }}>
          {LANGS.map((l) => (
            <Pressable
              key={l}
              onPress={() => setLang(l)}
              style={[
                styles.pill,
                {
                  backgroundColor: lang === l ? colors.primary : colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={{
                color: lang === l ? colors.primaryForeground : colors.foreground,
                fontFamily: "Inter_500Medium",
                fontSize: 12,
              }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={code}
          onChangeText={setCode}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, styles.codeInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
        />
        <Pressable
          onPress={doRun}
          disabled={runBusy}
          style={[styles.btn, { backgroundColor: colors.primary }]}
        >
          {runBusy ? <ActivityIndicator color={colors.primaryForeground} /> :
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Run</Text>}
        </Pressable>
        {runResult && (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text style={{ color: runResult.ok ? colors.tint : colors.destructive, fontFamily: "Inter_600SemiBold" }}>
              {runResult.ok ? "OK" : "Error"}
            </Text>
            {!!runResult.stdout && (
              <View style={[styles.outputBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.outputLabel, { color: colors.mutedForeground }]}>stdout</Text>
                <Text style={[styles.outputText, { color: colors.foreground }]}>{runResult.stdout}</Text>
              </View>
            )}
            {!!runResult.stderr && (
              <View style={[styles.outputBox, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
                <Text style={[styles.outputLabel, { color: colors.destructive }]}>stderr</Text>
                <Text style={[styles.outputText, { color: colors.foreground }]}>{runResult.stderr}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontFamily: "Inter_700Bold", fontSize: 18, marginBottom: 4 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 10 },
  input: {
    borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 60,
    fontFamily: "Inter_400Regular", fontSize: 14,
  },
  codeInput: { minHeight: 140, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  btn: { paddingVertical: 12, borderRadius: 12, alignItems: "center", marginTop: 10 },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  genImage: { width: "100%", aspectRatio: 1, borderRadius: 12, marginTop: 12 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  outputBox: { borderWidth: 1, borderRadius: 10, padding: 10 },
  outputLabel: { fontFamily: "Inter_500Medium", fontSize: 11, marginBottom: 4, letterSpacing: 1 },
  outputText: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12 },
});
