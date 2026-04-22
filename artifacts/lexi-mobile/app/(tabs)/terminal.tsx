import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useRootMode } from "@/lib/rootMode";
import { exec, isAvailable, isRootAvailable } from "../../modules/shell-runner";

interface Line {
  id: string;
  cmd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  root: boolean;
}

const QUICK_CMDS = [
  { label: "whoami", cmd: "whoami" },
  { label: "id", cmd: "id" },
  { label: "uname -a", cmd: "uname -a" },
  { label: "getprop ro.build.version.release", cmd: "getprop ro.build.version.release" },
  { label: "ls /sdcard", cmd: "ls -la /sdcard" },
  { label: "ls /data", cmd: "ls /data" },
  { label: "ps -A | head -20", cmd: "ps -A | head -20" },
  { label: "ip addr", cmd: "ip addr" },
];

let counter = 0;
const genId = () => `${Date.now()}-${++counter}`;

export default function TerminalScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { enabled } = useRootMode();
  const [cmd, setCmd] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [useRoot, setUseRoot] = useState(true);
  const [rootAvailable, setRootAvailable] = useState<boolean | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!isAvailable) {
      setRootAvailable(false);
      return;
    }
    isRootAvailable().then(setRootAvailable);
  }, []);

  async function run(c: string) {
    if (!c.trim() || running) return;
    setCmd("");
    setRunning(true);
    const id = genId();
    setLines((p) => [...p, { id, cmd: c, exitCode: -99, stdout: "", stderr: "running...", root: useRoot }]);
    try {
      const r = await exec(c, { useRoot, timeoutMs: 20000 });
      setLines((p) => p.map((l) => (l.id === id ? { ...l, ...r } : l)));
    } catch (e: any) {
      setLines((p) =>
        p.map((l) =>
          l.id === id ? { ...l, exitCode: -1, stdout: "", stderr: e.message ?? "Failed" } : l,
        ),
      );
    } finally {
      setRunning(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  if (!enabled) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={20} color="#F5F9FC" />
          </Pressable>
          <Text style={styles.title}>terminal</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.gateBox}>
          <Feather name="lock" size={32} color="#F26207" />
          <Text style={styles.gateTitle}>Root Mode is OFF</Text>
          <Text style={styles.gateSub}>Enable Root Mode in Account to use the terminal.</Text>
          <Pressable style={styles.gateBtn} onPress={() => router.push("/(tabs)/profile")}>
            <Text style={styles.gateBtnText}>Open Account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color="#F5F9FC" />
        </Pressable>
        <View>
          <Text style={styles.title}>terminal</Text>
          <Text style={styles.titleSub}>
            {rootAvailable === null
              ? "checking root..."
              : rootAvailable
                ? "su available"
                : isAvailable
                  ? "no root (will use sh)"
                  : "native module unavailable — EAS build required"}
          </Text>
        </View>
        <Pressable onPress={() => setLines([])} style={styles.backBtn}>
          <Feather name="trash-2" size={18} color="#C2C8CC" />
        </Pressable>
      </View>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Use su (root)</Text>
        <Switch
          value={useRoot}
          onValueChange={setUseRoot}
          trackColor={{ true: "#F26207", false: "#2B3245" }}
          thumbColor="#F5F9FC"
        />
      </View>

      <ScrollView style={styles.console} ref={scrollRef} contentContainerStyle={{ padding: 12 }}>
        {lines.length === 0 ? (
          <Text style={styles.hint}>
            $ Type a command below and tap run.{"\n"}Output is captured here.
          </Text>
        ) : null}
        {lines.map((l) => (
          <View key={l.id} style={styles.lineBlock}>
            <Text style={styles.prompt}>
              {l.root ? "#" : "$"} <Text style={styles.cmdText}>{l.cmd}</Text>
            </Text>
            {l.stdout ? <Text style={styles.stdout}>{l.stdout}</Text> : null}
            {l.stderr ? <Text style={styles.stderr}>{l.stderr}</Text> : null}
            <Text style={styles.exit}>exit {l.exitCode}</Text>
          </View>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickBar}>
        {QUICK_CMDS.map((q) => (
          <Pressable key={q.label} style={styles.quickChip} onPress={() => run(q.cmd)}>
            <Text style={styles.quickText}>{q.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.inputBar, { marginBottom: insets.bottom + 8 }]}>
          <Text style={styles.inputPrompt}>{useRoot ? "#" : "$"}</Text>
          <TextInput
            style={styles.input}
            value={cmd}
            onChangeText={setCmd}
            placeholder="ls -la /data"
            placeholderTextColor="#6C7079"
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            onSubmitEditing={() => run(cmd)}
          />
          <Pressable
            style={[styles.runBtn, (!cmd.trim() || running) && styles.runOff]}
            onPress={() => run(cmd)}
            disabled={!cmd.trim() || running}
          >
            {running ? (
              <ActivityIndicator size="small" color="#0E1525" />
            ) : (
              <Feather name="play" size={16} color="#0E1525" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0E1525" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: "#2B3245",
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: "#1C2333", borderWidth: 1, borderColor: "#2B3245",
    alignItems: "center", justifyContent: "center",
  },
  title: { color: "#F5F9FC", fontSize: 14, fontFamily: "JetBrainsMono_500Medium", textAlign: "center" },
  titleSub: { color: "#6C7079", fontSize: 10, fontFamily: "JetBrainsMono_400Regular", textAlign: "center", marginTop: 2 },

  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#2B3245",
  },
  toggleLabel: { color: "#F5F9FC", fontSize: 13, fontFamily: "JetBrainsMono_400Regular" },

  console: { flex: 1, backgroundColor: "#0E1525" },
  hint: { color: "#6C7079", fontFamily: "JetBrainsMono_400Regular", fontSize: 12, lineHeight: 18 },
  lineBlock: { marginBottom: 14 },
  prompt: { color: "#F26207", fontFamily: "JetBrainsMono_500Medium", fontSize: 12, marginBottom: 4 },
  cmdText: { color: "#F5F9FC" },
  stdout: { color: "#F5F9FC", fontFamily: "JetBrainsMono_400Regular", fontSize: 12, lineHeight: 18 },
  stderr: { color: "#F73E3E", fontFamily: "JetBrainsMono_400Regular", fontSize: 12, lineHeight: 18 },
  exit: { color: "#6C7079", fontFamily: "JetBrainsMono_400Regular", fontSize: 10, marginTop: 4 },

  quickBar: { maxHeight: 44, paddingHorizontal: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "#2B3245" },
  quickChip: {
    backgroundColor: "#1C2333", borderWidth: 1, borderColor: "#2B3245",
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, marginHorizontal: 4,
  },
  quickText: { color: "#C2C8CC", fontSize: 11, fontFamily: "JetBrainsMono_400Regular" },

  inputBar: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 12, marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: "#1C2333", borderRadius: 10,
    borderWidth: 1, borderColor: "#2B3245", gap: 8,
  },
  inputPrompt: { color: "#F26207", fontFamily: "JetBrainsMono_500Medium", fontSize: 14 },
  input: {
    flex: 1, color: "#F5F9FC", fontFamily: "JetBrainsMono_400Regular",
    fontSize: 13, paddingVertical: 4,
  },
  runBtn: {
    width: 32, height: 32, borderRadius: 6, backgroundColor: "#F26207",
    alignItems: "center", justifyContent: "center",
  },
  runOff: { backgroundColor: "#2B3245" },

  gateBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  gateTitle: { color: "#F5F9FC", fontSize: 18, fontFamily: "IBMPlexSans_600SemiBold" },
  gateSub: { color: "#9DA2A6", fontSize: 13, textAlign: "center", maxWidth: 280 },
  gateBtn: {
    backgroundColor: "#F26207", paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, marginTop: 8,
  },
  gateBtnText: { color: "#0E1525", fontFamily: "IBMPlexSans_600SemiBold", fontSize: 13 },
});
