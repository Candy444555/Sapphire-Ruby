import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  classifyDevice,
  describeClass,
  describeVendor,
  listDevices,
  openSerial,
  requestPermission,
  usbAvailable,
  usbLoadError,
  type UsbConnection,
  type UsbDeviceInfo,
} from "@/lib/usb-host";

const BAUD_RATES = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];

export default function UsbScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [devices, setDevices] = useState<UsbDeviceInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<UsbDeviceInfo | null>(null);
  const [connection, setConnection] = useState<UsbConnection | null>(null);
  const [baud, setBaud] = useState(115200);
  const [output, setOutput] = useState<string>("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  const refresh = useCallback(async () => {
    setScanning(true);
    try {
      const list = await listDevices();
      setDevices(list);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    return () => { connection?.close().catch(() => {}); };
  }, [connection]);

  const connect = async (d: UsbDeviceInfo) => {
    setBusy(true);
    try {
      const granted = await requestPermission(d.deviceId);
      if (!granted) { Alert.alert("Permission denied", "Tap Allow when Android asks for USB permission."); return; }
      const conn = await openSerial(d.deviceId, { baudRate: baud });
      setConnection(conn);
      setSelected(d);
      setOutput("");
      conn.onReceive((chunk) => {
        setOutput((prev) => (prev + chunk).slice(-20000));
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
      });
      Alert.alert("Connected", `${d.productName ?? "device"} @ ${baud} baud.`);
    } catch (e) {
      Alert.alert("Open failed", e instanceof Error ? e.message : "Unknown");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    await connection?.close();
    setConnection(null);
    setSelected(null);
  };

  const sendLine = async (line: string, appendNewline = true) => {
    if (!connection) return;
    const payload = appendNewline ? line + "\r\n" : line;
    setOutput((p) => p + `> ${line}\n`);
    try { await connection.send(payload); }
    catch (e) { setOutput((p) => p + `[send error: ${e instanceof Error ? e.message : "?"}]\n`); }
  };

  const askLexiAbout = (d: UsbDeviceInfo) => {
    const info = classifyDevice(d);
    const summary = [
      `USB device just plugged in:`,
      `- VID:PID ${d.vendorId.toString(16).padStart(4, "0")}:${d.productId.toString(16).padStart(4, "0")}`,
      `- Vendor guess: ${describeVendor(d.vendorId)}`,
      `- Class: ${describeClass(d.deviceClass)}`,
      `- Manufacturer: ${d.manufacturerName ?? "?"}`,
      `- Product: ${d.productName ?? "?"}`,
      `- Serial: ${d.serialNumber ?? "?"}`,
      `- Probable kind: ${info.kind}`,
      ``,
      `What can you do with it? Walk me through interacting with it from this Android phone (the phone is host). Give me exact commands or AT strings I can paste into the USB tab.`,
    ].join("\n");
    router.push({ pathname: "/", params: { prefill: summary } });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Feather name="link-2" size={18} color={colors.primary} />
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 16, marginLeft: 8 }}>USB / OTG Devices</Text>
        <View style={{ flex: 1 }} />
        {scanning && <ActivityIndicator size="small" color={colors.primary} />}
        <Pressable onPress={refresh} style={{ marginLeft: 8, padding: 6 }}>
          <Feather name="refresh-cw" size={16} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, gap: 12 }}>
        {!usbAvailable && (
          <View style={[styles.warnBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
            <Feather name="alert-circle" size={14} color={colors.mutedForeground} />
            <Text style={{ flex: 1, color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17 }}>
              USB host module not loaded — this works in EAS native builds (preview/personal APK). In Expo Go the lists will be empty.
              {usbLoadError ? `\n\n${usbLoadError}` : ""}
            </Text>
          </View>
        )}

        {/* Baud rate strip */}
        <View>
          <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1, marginBottom: 6 }}>BAUD RATE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {BAUD_RATES.map((b) => (
              <Pressable key={b} onPress={() => setBaud(b)} style={[styles.chip, { borderColor: baud === b ? colors.primary : colors.border, backgroundColor: baud === b ? colors.primary + "22" : "transparent" }]}>
                <Text style={{ color: baud === b ? colors.primary : colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>{b}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Device list */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1 }}>
            CONNECTED DEVICES ({devices.length})
          </Text>
          {devices.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="search" size={20} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 13, marginTop: 8, textAlign: "center" }}>
                No USB devices found.{"\n"}Plug a cable into the phone (USB-C OTG) and they will appear here automatically.
              </Text>
            </View>
          ) : (
            devices.map((d) => {
              const info = classifyDevice(d);
              const isOpen = connection && selected?.deviceId === d.deviceId;
              return (
                <View key={d.deviceId} style={[styles.card, { borderColor: isOpen ? "#3fb950" : colors.border, backgroundColor: colors.card }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="cpu" size={14} color={isOpen ? "#3fb950" : colors.primary} />
                    <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 13 }}>
                      {d.productName ?? d.manufacturerName ?? `Device ${d.deviceId}`}
                    </Text>
                    {isOpen && (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "#3fb95022" }}>
                        <Text style={{ color: "#3fb950", fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1 }}>OPEN</Text>
                      </View>
                    )}
                  </View>
                  <Text selectable style={{ color: colors.mutedForeground, fontFamily: "Courier", fontSize: 11, marginTop: 4 }}>
                    VID:PID {d.vendorId.toString(16).padStart(4, "0")}:{d.productId.toString(16).padStart(4, "0")} · {describeVendor(d.vendorId)}
                    {"\n"}Class {describeClass(d.deviceClass)}{d.serialNumber ? ` · S/N ${d.serialNumber}` : ""}
                  </Text>
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 6 }}>{info.kind}</Text>
                  <View style={{ marginTop: 4 }}>
                    {info.advice.map((a, i) => (
                      <Text key={i} style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 }}>• {a}</Text>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    {!isOpen ? (
                      <Pressable onPress={() => connect(d)} disabled={busy} style={[styles.btn, { backgroundColor: colors.primary, flex: 1 }]}>
                        {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="zap" size={13} color={colors.primaryForeground} />}
                        <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>OPEN @ {baud}</Text>
                      </Pressable>
                    ) : (
                      <Pressable onPress={disconnect} style={[styles.btn, { backgroundColor: colors.destructive, flex: 1 }]}>
                        <Feather name="x" size={13} color="#fff" />
                        <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>CLOSE</Text>
                      </Pressable>
                    )}
                    <Pressable onPress={() => askLexiAbout(d)} style={[styles.btn, { borderColor: colors.border, borderWidth: 1, flex: 1 }]}>
                      <Feather name="message-circle" size={13} color={colors.foreground} />
                      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>ASK LEXI</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Terminal — only when connected */}
        {connection && selected && (
          <View style={[styles.card, { borderColor: "#3fb950", backgroundColor: colors.card }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Feather name="terminal" size={14} color="#3fb950" />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 13 }}>
                {selected.productName ?? "device"} @ {baud}
              </Text>
            </View>
            <ScrollView ref={scrollRef} style={{ maxHeight: 240, borderColor: colors.border, borderWidth: 1, borderRadius: 6, padding: 8, backgroundColor: colors.background }}>
              <Text selectable style={{ color: colors.foreground, fontFamily: "Courier", fontSize: 11, lineHeight: 15 }}>
                {output || "(no data yet — send a command below)"}
              </Text>
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Send command (e.g. AT, ATI, 0100)"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
                style={{ flex: 1, color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, fontFamily: "Courier", fontSize: 12, paddingVertical: 8 }}
                onSubmitEditing={() => { if (input) { sendLine(input); setInput(""); } }}
              />
              <Pressable onPress={() => { if (input) { sendLine(input); setInput(""); } }} style={[styles.btn, { backgroundColor: colors.primary, paddingHorizontal: 14 }]}>
                <Feather name="send" size={13} color={colors.primaryForeground} />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
              {["AT", "ATI", "AT+CGSN", "AT+CIMI", "AT+COPS=?", "ATZ", "0100", "010C"].map((cmd) => (
                <Pressable key={cmd} onPress={() => sendLine(cmd)} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={{ color: colors.foreground, fontFamily: "Courier", fontSize: 11 }}>{cmd}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setOutput("")} style={[styles.chip, { borderColor: colors.destructive }]}>
                <Text style={{ color: colors.destructive, fontFamily: "Inter_600SemiBold", fontSize: 11 }}>CLEAR</Text>
              </Pressable>
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1 },
  card: { borderWidth: 1, borderRadius: 8, padding: 12 },
  warnBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 10, borderRadius: 6, borderWidth: 1 },
  emptyBox: { alignItems: "center", borderWidth: 1, borderStyle: "dashed", borderRadius: 8, padding: 24 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 6 },
});
