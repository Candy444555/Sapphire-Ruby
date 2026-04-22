import { Feather } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useSsh } from "@/hooks/useSsh";
import { useTerminal, type HistoryEntry } from "@/hooks/useTerminal";

type Mode = "local" | "ssh";

interface SshHistory { command: string; output: string; exitCode: number; cwd: string; timestamp: number }

export default function TerminalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const local = useTerminal();
  const ssh = useSsh();

  const [mode, setMode] = useState<Mode>("local");
  const [cmd, setCmd] = useState("");
  const [sshHistory, setSshHistory] = useState<SshHistory[]>([]);
  const [busy, setBusy] = useState(false);
  const [showSshModal, setShowSshModal] = useState(false);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("root");
  const [password, setPassword] = useState("");

  const listRef = useRef<FlatList<any>>(null);

  const isReady = mode === "local" ? !!local.sessionId : ssh.state.connected;
  const cwd = mode === "local" ? local.cwd : ssh.state.host ? `${ssh.state.username}@${ssh.state.host}` : "";
  const history = mode === "local" ? local.history : sshHistory;

  const run = useCallback(async () => {
    const c = cmd.trim();
    if (!c || busy) return;
    setCmd("");
    setBusy(true);
    try {
      if (mode === "local") {
        await local.exec(c);
      } else {
        const r = await ssh.exec(c);
        setSshHistory((p) => [...p, { command: c, output: r.output, exitCode: r.exitCode, cwd: r.cwd, timestamp: Date.now() }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (mode === "ssh") setSshHistory((p) => [...p, { command: c, output: msg, exitCode: 1, cwd: "", timestamp: Date.now() }]);
      else Alert.alert("Error", msg);
    } finally {
      setBusy(false);
    }
  }, [cmd, busy, mode, local, ssh]);

  const connectSsh = useCallback(async () => {
    if (!host || !username) { Alert.alert("Required", "Host and username are required."); return; }
    try {
      await ssh.connect({ host, port: parseInt(port, 10) || 22, username, password: password || undefined });
      setShowSshModal(false);
      setMode("ssh");
    } catch (e) {
      Alert.alert("SSH failed", e instanceof Error ? e.message : "Unknown");
    }
  }, [host, port, username, password, ssh]);

  const renderItem = ({ item }: { item: HistoryEntry | SshHistory }) => (
    <View style={[styles.entry, { borderColor: colors.border }]}>
      <View style={styles.cmdLine}>
        <Text style={{ color: "#3fb950", fontFamily: "Courier", fontSize: 12 }}>$ </Text>
        <Text selectable style={{ color: colors.foreground, fontFamily: "Courier", fontSize: 12, flex: 1 }}>{item.command}</Text>
      </View>
      {!!item.output && (
        <ScrollView horizontal>
          <Text selectable style={{ color: item.exitCode === 0 ? colors.foreground : colors.destructive, fontFamily: "Courier", fontSize: 12, lineHeight: 16, paddingTop: 4 }}>
            {item.output}
          </Text>
        </ScrollView>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>TERMINAL</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Courier", fontSize: 11 }} numberOfLines={1}>
            {isReady ? cwd : (mode === "local" ? "Connecting…" : "Disconnected")}
          </Text>
        </View>
        <View style={styles.modeRow}>
          <Pressable onPress={() => setMode("local")} style={[styles.modePill, mode === "local" && { backgroundColor: colors.primary }]}>
            <Text style={{ color: mode === "local" ? colors.primaryForeground : colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1 }}>LOCAL</Text>
          </Pressable>
          <Pressable onPress={() => setMode("ssh")} style={[styles.modePill, mode === "ssh" && { backgroundColor: colors.accent }]}>
            <Text style={{ color: mode === "ssh" ? colors.foreground : colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 1 }}>SSH</Text>
          </Pressable>
        </View>
      </View>

      {mode === "local" && local.connectError && (
        <View style={[styles.errBox, { backgroundColor: "rgba(248,81,73,0.1)", borderColor: colors.destructive }]}>
          <Text style={{ color: colors.destructive, fontFamily: "Inter_500Medium", fontSize: 12 }}>{local.connectError}</Text>
          <Pressable onPress={local.reconnect} style={{ marginTop: 6 }}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Reconnect</Text>
          </Pressable>
        </View>
      )}

      {mode === "ssh" && !ssh.state.connected && (
        <View style={{ padding: 14 }}>
          <Pressable onPress={() => setShowSshModal(true)} style={[styles.connectBtn, { borderColor: colors.accent, backgroundColor: colors.muted }]}>
            <Feather name="terminal" size={18} color={colors.accent} />
            <Text style={{ color: colors.accent, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Connect to VPS</Text>
          </Pressable>
        </View>
      )}

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <FlatList
          ref={listRef}
          data={history}
          renderItem={renderItem}
          keyExtractor={(_, i) => `h-${i}`}
          contentContainerStyle={{ padding: 12, gap: 10 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ alignItems: "center", marginTop: 80, gap: 10 }}>
              {mode === "local" && local.isConnecting && <ActivityIndicator color={colors.primary} />}
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
                {mode === "local" ? (local.isConnecting ? "Connecting to shell…" : "Type a command below") : (ssh.state.connected ? "Connected. Run a command." : "Connect to a VPS to start.")}
              </Text>
            </View>
          }
        />

        <View
          style={[
            styles.inputBar,
            { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + (Platform.OS === "web" ? 16 : 8) },
          ]}
        >
          <Text style={{ color: "#3fb950", fontFamily: "Courier", fontSize: 14, paddingHorizontal: 8 }}>$</Text>
          <TextInput
            value={cmd}
            onChangeText={setCmd}
            placeholder={isReady ? "command…" : "not connected"}
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            onSubmitEditing={run}
            editable={isReady && !busy}
            style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          />
          <Pressable onPress={run} disabled={!isReady || busy} style={styles.iconBtn} hitSlop={10}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <Feather name="corner-down-left" size={20} color={colors.primary} />}
          </Pressable>
          {history.length > 0 && (
            <Pressable onPress={() => mode === "local" ? local.clearHistory() : setSshHistory([])} style={styles.iconBtn} hitSlop={10}>
              <Feather name="trash-2" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showSshModal} animationType="slide" transparent onRequestClose={() => setShowSshModal(false)}>
        <View style={[styles.modalBg, { justifyContent: "flex-end" }]}>
          <View style={[styles.sshModal, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", padding: 14 }}>
              <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }}>SSH Connect</Text>
              <Pressable onPress={() => setShowSshModal(false)} hitSlop={8}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
            </View>
            <View style={{ paddingHorizontal: 14, gap: 10 }}>
              <TextInput placeholder="host (e.g. 1.2.3.4)" placeholderTextColor={colors.mutedForeground} value={host} onChangeText={setHost} autoCapitalize="none" style={[styles.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
              <TextInput placeholder="port" placeholderTextColor={colors.mutedForeground} value={port} onChangeText={setPort} keyboardType="number-pad" style={[styles.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
              <TextInput placeholder="username" placeholderTextColor={colors.mutedForeground} value={username} onChangeText={setUsername} autoCapitalize="none" style={[styles.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
              <TextInput placeholder="password (optional)" placeholderTextColor={colors.mutedForeground} value={password} onChangeText={setPassword} secureTextEntry style={[styles.field, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
              <Pressable onPress={connectSsh} disabled={ssh.state.connecting} style={[styles.connectBtn, { backgroundColor: colors.accent, borderColor: colors.accent }]}>
                {ssh.state.connecting ? <ActivityIndicator color={colors.foreground} /> : <Feather name="terminal" size={18} color={colors.foreground} />}
                <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 13 }}>Connect</Text>
              </Pressable>
              {ssh.state.connected && (
                <Pressable onPress={() => { ssh.disconnect(); setMode("local"); }} style={[styles.connectBtn, { borderColor: colors.destructive, backgroundColor: "transparent" }]}>
                  <Feather name="x-circle" size={18} color={colors.destructive} />
                  <Text style={{ color: colors.destructive, fontFamily: "Inter_700Bold", fontSize: 13 }}>Disconnect</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: 1 },
  modeRow: { flexDirection: "row", gap: 6 },
  modePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  errBox: { margin: 12, padding: 10, borderRadius: 10, borderWidth: 1 },
  connectBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1 },
  entry: { padding: 10, borderRadius: 8, borderWidth: 1 },
  cmdLine: { flexDirection: "row" },
  inputBar: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, paddingHorizontal: 6, paddingTop: 8, gap: 4 },
  iconBtn: { padding: 8 },
  input: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, fontFamily: "Courier", fontSize: 14 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sshModal: { borderTopWidth: 1, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  field: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontFamily: "Inter_500Medium", fontSize: 14 },
});
