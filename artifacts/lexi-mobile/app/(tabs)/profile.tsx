import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { defaultBakedDomain, getApiBase, getApiUrl, loadApiDomain, pingServer, pushEasUpdate, setApiDomain, getOpenRouterKey, setOpenRouterKey, loadOpenRouterKey } from "@/lib/lexi-api";
import { useOtaUpdate } from "@/hooks/useOtaUpdate";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useLexiConfig } from "@/hooks/useLexiConfig";
import { useLexiPythonScripts } from "@/hooks/useLexiPythonScripts";
import { useLexiSelfPatch } from "@/hooks/useLexiSelfPatch";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useRootMode } from "@/lib/root-mode";

type PermName = "camera" | "photos" | "location" | "contacts";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { enabled: rootMode, setEnabled: setRootMode } = useRootMode();
  const { profile, resetProfile } = useUserProfile();
  const { config, removeInstruction, clearInstructions } = useLexiConfig();
  const { extensions, deleteExtension, clearExtensions } = useLexiSelfPatch();
  const { scripts, deleteScript, clearScripts } = useLexiPythonScripts();

  const [granted, setGranted] = useState<Record<PermName, boolean>>({
    camera: false, photos: false, location: false, contacts: false,
  });

  // Server URL settings (lets the APK connect to any server post-install)
  const [serverInput, setServerInput] = useState("");
  const [currentBase, setCurrentBase] = useState("");
  const [pingState, setPingState] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [pingMsg, setPingMsg] = useState<string>("");

  const [orKey, setOrKey] = useState("");
  const [orKeySaved, setOrKeySaved] = useState(false);

  const [pushing, setPushing] = useState(false);
  const [pushLog, setPushLog] = useState("");
  const [pushMsg, setPushMsg] = useState("OTA update");

  const ota = useOtaUpdate();

  // Latest APK build (fetched from server which calls Expo via EXPO_TOKEN)
  type BuildInfo = {
    found: boolean;
    project?: string;
    build?: {
      id: string; profile: string; channel: string; appVersion: string;
      versionCode: string; completedAt: string; apkUrl: string; pageUrl: string;
    };
  };
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string>("");

  const loadBuild = async () => {
    setBuildLoading(true);
    setBuildError("");
    try {
      const r = await fetch(getApiUrl("/api/eas/latest-apk"));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setBuild(j);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBuildLoading(false);
    }
  };

  useEffect(() => { loadBuild(); }, []);

  useEffect(() => {
    (async () => {
      await loadApiDomain();
      const base = getApiBase();
      setCurrentBase(base);
      setServerInput(base.replace(/^https?:\/\//, ""));
      const key = await loadOpenRouterKey();
      setOrKey(key);
    })();
  }, []);

  const saveOrKey = async () => {
    await setOpenRouterKey(orKey);
    setOrKeySaved(true);
    setTimeout(() => setOrKeySaved(false), 2000);
  };

  const saveServer = async () => {
    await setApiDomain(serverInput);
    setCurrentBase(getApiBase());
    setPingState("idle");
    Alert.alert("Saved", "Server URL updated. Tap Test to verify.");
  };

  const resetServer = async () => {
    await setApiDomain("");
    const fallback = defaultBakedDomain();
    setServerInput(fallback);
    setCurrentBase(getApiBase());
    setPingState("idle");
  };

  const testServer = async () => {
    setPingState("checking");
    setPingMsg("");
    const r = await pingServer();
    if (r.ok) { setPingState("ok"); setPingMsg(`Connected (HTTP ${r.status ?? 200})`); }
    else { setPingState("fail"); setPingMsg(r.error ?? `HTTP ${r.status ?? "??"}`); }
  };

  const ask = async (name: PermName) => {
    try {
      let ok = false;
      if (name === "camera") ok = (await ImagePicker.requestCameraPermissionsAsync()).status === "granted";
      else if (name === "photos") ok = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status === "granted";
      else if (name === "location") ok = (await Location.requestForegroundPermissionsAsync()).status === "granted";
      else if (name === "contacts") ok = (await Contacts.requestPermissionsAsync()).status === "granted";
      setGranted((p) => ({ ...p, [name]: ok }));
      if (!ok) Alert.alert("Permission denied", "Enable in Settings to use this feature.");
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed");
    }
  };

  const PermRow = ({ name, label, icon }: { name: PermName; label: string; icon: keyof typeof Feather.glyphMap }) => (
    <Pressable onPress={() => ask(name)} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Feather name={icon} size={20} color={colors.primary} />
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={{ color: granted[name] ? colors.tint : colors.mutedForeground, fontFamily: "Inter_500Medium" }}>
        {granted[name] ? "Connected" : "Tap to connect"}
      </Text>
    </Pressable>
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, gap: 14 }}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.avatar}>
          <Feather name="user" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>Lexi User</Text>
        <Text style={[styles.tag, { color: colors.mutedForeground }]}>Operator</Text>
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 14 }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name="shield" size={18} color={colors.accent} />
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>Root Mode</Text>
          </View>
          <Switch value={rootMode} onValueChange={setRootMode} trackColor={{ true: colors.primary, false: colors.border }} />
        </View>
        <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 }}>
          Unlocks elevated actions and unrestricted output. You assume responsibility for everything generated.
        </Text>
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
        <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>USER DNA</Text>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Style: {profile.communicationStyle}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Messages analyzed: {profile.messageCount}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Avg length: {profile.avgMessageLength} chars</Text>
        {profile.topicsDetected.length > 0 && (
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Interests: {profile.topicsDetected.join(", ")}</Text>
        )}
        <Pressable onPress={() => Alert.alert("Reset DNA?", "Lexi will forget your communication style.", [{ text: "Cancel" }, { text: "Reset", style: "destructive", onPress: resetProfile }])}>
          <Text style={{ color: colors.destructive, fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 6 }}>Reset DNA</Text>
        </Pressable>
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>FUSED EXTENSIONS ({extensions.length})</Text>
          {extensions.length > 0 && (
            <Pressable onPress={() => Alert.alert("Clear all extensions?", "", [{ text: "Cancel" }, { text: "Clear", style: "destructive", onPress: clearExtensions }])}>
              <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
            </Pressable>
          )}
        </View>
        {extensions.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontStyle: "italic", fontSize: 12 }}>None</Text>
        ) : extensions.map((e) => (
          <View key={e.name} style={styles.itemRow}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>• {e.name} — {e.description}</Text>
            <Pressable onPress={() => deleteExtension(e.name)} hitSlop={6}>
              <Feather name="x" size={14} color={colors.destructive} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>FUSED PYTHON SCRIPTS ({scripts.length})</Text>
          {scripts.length > 0 && (
            <Pressable onPress={() => Alert.alert("Clear all scripts?", "", [{ text: "Cancel" }, { text: "Clear", style: "destructive", onPress: clearScripts }])}>
              <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
            </Pressable>
          )}
        </View>
        {scripts.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontStyle: "italic", fontSize: 12 }}>None</Text>
        ) : scripts.map((s) => (
          <View key={s.slug} style={styles.itemRow}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>• {s.filePath} — {s.description}</Text>
            <Pressable onPress={() => deleteScript(s.slug)} hitSlop={6}>
              <Feather name="x" size={14} color={colors.destructive} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>SELF-MODIFICATIONS ({config.customAdditions.length})</Text>
          {config.customAdditions.length > 0 && (
            <Pressable onPress={() => Alert.alert("Clear all self-mods?", "", [{ text: "Cancel" }, { text: "Clear", style: "destructive", onPress: clearInstructions }])}>
              <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>Clear</Text>
            </Pressable>
          )}
        </View>
        {config.customAdditions.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontStyle: "italic", fontSize: 12 }}>None</Text>
        ) : config.customAdditions.map((a, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 12 }}>{i + 1}. {a}</Text>
            <Pressable onPress={() => removeInstruction(i)} hitSlop={6}>
              <Feather name="x" size={14} color={colors.destructive} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="zap" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>OPENROUTER API KEY</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
          Paste your OpenRouter key to chat directly from your phone without a server. Get one free at openrouter.ai.
        </Text>
        <TextInput
          value={orKey}
          onChangeText={setOrKey}
          placeholder="sk-or-v1-..."
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{
            borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
            color: colors.foreground, backgroundColor: colors.background, fontFamily: "Inter_500Medium", fontSize: 13,
          }}
        />
        <Pressable onPress={saveOrKey} style={{ padding: 10, borderRadius: 10, backgroundColor: orKeySaved ? "#238636" : colors.primary, alignItems: "center" }}>
          <Text style={{ color: "#000", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
            {orKeySaved ? "Saved!" : "Save Key"}
          </Text>
        </Pressable>
        {!getApiBase() && !orKey && (
          <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_500Medium" }}>
            No server or API key set — chat won't work until you add one.
          </Text>
        )}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="upload-cloud" size={16} color={colors.accent} />
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>PUSH UPDATE TO PHONE</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
          Publish a new JS bundle to all installed copies of Lexi. Your data, conversations and settings are always preserved — only the app code updates.
        </Text>
        {/* Auto-detected server pill */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.muted, borderWidth: 1, borderColor: getApiBase() ? "#3fb95044" : colors.border }}>
          <Feather name="server" size={11} color={getApiBase() ? "#3fb950" : colors.mutedForeground} />
          <Text style={{ flex: 1, color: getApiBase() ? "#3fb950" : colors.mutedForeground, fontSize: 10, fontFamily: "Inter_500Medium" }} numberOfLines={1}>
            {getApiBase() ? `AUTO · ${getApiBase().replace("https://", "")}` : "No server — set URL below"}
          </Text>
        </View>

        {!getApiBase() ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }}>
            <Feather name="alert-circle" size={14} color={colors.destructive} />
            <Text style={{ flex: 1, color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>
              Set your server URL in the section below, then come back here to push.
            </Text>
          </View>
        ) : (
          <>
            <TextInput
              value={pushMsg}
              onChangeText={setPushMsg}
              placeholder="Update message…"
              placeholderTextColor={colors.mutedForeground}
              style={{
                borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
                color: colors.foreground, backgroundColor: colors.background, fontFamily: "Inter_500Medium", fontSize: 13,
              }}
            />
            <Pressable
              disabled={pushing}
              onPress={async () => {
                setPushing(true);
                setPushLog("");
                try {
                  const res = await pushEasUpdate("personal", pushMsg || "OTA update");
                  const text = await res.text();
                  const succeeded = text.includes("exited with code 0") || text.includes("Published");
                  setPushLog(text);
                  if (succeeded) {
                    setPushLog((prev) => prev + "\n\n⟳ Checking your phone for the new bundle…");
                    await ota.checkAndApply();
                  }
                } catch (e) {
                  setPushLog(`Error: ${e instanceof Error ? e.message : "unknown"}`);
                } finally {
                  setPushing(false);
                }
              }}
              style={{ padding: 10, borderRadius: 10, backgroundColor: pushing ? colors.muted : colors.primary, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              {pushing
                ? <ActivityIndicator size="small" color={colors.foreground} />
                : <Feather name="upload-cloud" size={14} color="#000" />}
              <Text style={{ color: pushing ? colors.foreground : "#000", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                {pushing ? "Pushing update to Expo CDN…" : "Push OTA Update"}
              </Text>
            </Pressable>
            {!!pushLog && (
              <ScrollView style={{ maxHeight: 200, borderRadius: 8, backgroundColor: "#0d1117", borderWidth: 1, borderColor: colors.border, padding: 10 }}>
                <Text selectable style={{ color: "#e6edf3", fontFamily: "Courier", fontSize: 10, lineHeight: 16 }}>{pushLog}</Text>
              </ScrollView>
            )}
          </>
        )}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="refresh-cw" size={16} color={colors.accent} />
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>OVER-THE-AIR UPDATE</Text>
          <Pressable onPress={ota.checkForUpdate} hitSlop={8} disabled={ota.state.status === "checking"}>
            {ota.state.status === "checking"
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />}
          </Pressable>
        </View>
        {ota.state.status === "idle" && (
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Checking on startup…</Text>
        )}
        {ota.state.status === "upToDate" && (
          <Text style={{ color: "#238636", fontSize: 11, fontFamily: "Inter_500Medium" }}>App is up to date</Text>
        )}
        {ota.state.status === "available" && (
          <>
            <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Update available!</Text>
            <Pressable onPress={ota.downloadAndApply} style={{ padding: 10, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" }}>
              <Text style={{ color: "#000", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Download & Install</Text>
            </Pressable>
          </>
        )}
        {ota.state.status === "downloading" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Downloading update…</Text>
          </View>
        )}
        {ota.state.status === "ready" && (
          <>
            <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: "Inter_500Medium" }}>Update downloaded! Restart to apply.</Text>
            <Pressable onPress={ota.applyNow} style={{ padding: 10, borderRadius: 10, backgroundColor: "#238636", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Restart Now</Text>
            </Pressable>
          </>
        )}
        {ota.state.status === "error" && (
          <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_500Medium" }}>✗ {ota.state.message}</Text>
        )}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="globe" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>SERVER URL</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
          Where Lexi connects. Enter the host of your API server (no https://). Leave blank to use the build-time default.
        </Text>
        <TextInput
          value={serverInput}
          onChangeText={setServerInput}
          placeholder="e.g. abc123.replit.dev"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
            color: colors.foreground, backgroundColor: colors.background, fontFamily: "Inter_500Medium", fontSize: 13,
          }}
        />
        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
          Active: {currentBase || "(none — set one to enable network)"}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={saveServer} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center" }}>
            <Text style={{ color: "#000", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Save</Text>
          </Pressable>
          <Pressable onPress={testServer} style={{ flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}>
            {pingState === "checking" ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Test</Text>
          </Pressable>
          <Pressable onPress={resetServer} style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Reset</Text>
          </Pressable>
        </View>
        {pingState !== "idle" && pingState !== "checking" && (
          <Text style={{ color: pingState === "ok" ? colors.tint : colors.destructive, fontSize: 11, fontFamily: "Inter_500Medium" }}>
            {pingState === "ok" ? "✓ " : "✗ "}{pingMsg}
          </Text>
        )}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="download-cloud" size={16} color={colors.accent} />
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>LATEST APK</Text>
          <Pressable onPress={loadBuild} hitSlop={6} disabled={buildLoading}>
            {buildLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />}
          </Pressable>
        </View>
        {buildError ? (
          <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_500Medium" }}>✗ {buildError}</Text>
        ) : build === null ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontStyle: "italic" }}>Loading…</Text>
        ) : !build.found ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>No successful builds yet for {build.project ?? "project"}.</Text>
        ) : build.build ? (
          <>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
              v{build.build.appVersion} ({build.build.versionCode}) · {build.build.profile}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
              Built {new Date(build.build.completedAt).toLocaleString()}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }} numberOfLines={1}>
              {build.project}
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
              <Pressable
                onPress={() => Linking.openURL(build.build!.apkUrl)}
                style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
              >
                <Feather name="download" size={14} color="#000" />
                <Text style={{ color: "#000", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Download APK</Text>
              </Pressable>
              <Pressable
                onPress={() => Linking.openURL(build.build!.pageUrl)}
                style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}
              >
                <Feather name="external-link" size={14} color={colors.foreground} />
              </Pressable>
            </View>
          </>
        ) : null}
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
  cardLeft: { borderRadius: 14, borderWidth: 1, padding: 14 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#1c232c", alignItems: "center", justifyContent: "center", marginBottom: 8 },
  name: { fontFamily: "Inter_700Bold", fontSize: 18 },
  tag: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 4, letterSpacing: 1.5 },
  section: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 2, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  rowLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  footer: { textAlign: "center", marginTop: 24, fontFamily: "Inter_400Regular", fontSize: 11 },
});
