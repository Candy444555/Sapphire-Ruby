import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getSettings as loggerGetSettings,
  log as logger,
  logsDir as loggerLogsDir,
  subscribeSettings as loggerSubscribeSettings,
  updateSettings as loggerUpdateSettings,
} from "@/lib/logger";
import { defaultBakedDomain, getApiBase, getApiUrl, loadApiDomain, pingServer, setApiDomain, getFeatherlessKey, setFeatherlessKey, loadFeatherlessKey, testFeatherlessKey, triggerApkBuild } from "@/lib/lexi-api";
import { saveApkToPhone } from "@/lib/save-to-device";
import { BUILD_INFO } from "@/lib/build-info";
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
  const [keyTestState, setKeyTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [keyTestError, setKeyTestError] = useState("");

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
  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState("");
  const [buildSubmitted, setBuildSubmitted] = useState(false);
  const [savingApk, setSavingApk] = useState(false);

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

  const startBuild = async () => {
    if (!getApiBase()) {
      Alert.alert("No Server", "Set your server URL first so Replit can run the build.");
      return;
    }
    setBuilding(true);
    setBuildSubmitted(false);
    const resolvedUrl = getApiBase();
    setBuildLog(`POSTing to ${resolvedUrl}/api/eas/build …`);
    try {
      const result = await triggerApkBuild("preview");
      if (!result.ok) {
        setBuildLog(`Error: ${result.error}${result.detail ? `\n\n${result.detail}` : ""}`);
        return;
      }
      setBuildLog(result.message);
      setBuildSubmitted(true);
    } catch (e) {
      setBuildLog(`Error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBuilding(false);
    }
  };

  useEffect(() => { loadBuild(); }, []);

  useEffect(() => {
    (async () => {
      await loadApiDomain();
      const base = getApiBase();
      setCurrentBase(base);
      setServerInput(base.replace(/^https?:\/\//, ""));
      const key = await loadFeatherlessKey();
      setOrKey(key);
    })();
  }, []);

  const saveOrKey = async () => {
    await setFeatherlessKey(orKey);
    setOrKeySaved(true);
    setKeyTestState("idle");
    setTimeout(() => setOrKeySaved(false), 2000);
  };

  const testKey = async () => {
    const key = orKey.trim() || getFeatherlessKey();
    if (!key) {
      setKeyTestState("fail");
      setKeyTestError("No key entered — paste your key first.");
      return;
    }
    setKeyTestState("testing");
    setKeyTestError("");
    const result = await testFeatherlessKey(key);
    if (result.ok) {
      setKeyTestState("ok");
    } else {
      setKeyTestState("fail");
      setKeyTestError(result.error ?? "Unknown error");
    }
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
      logger.info("permission", "request", { actor: "user", target: name, outputs: { granted: ok } });
      setGranted((p) => ({ ...p, [name]: ok }));
      if (!ok) Alert.alert("Permission denied", "Enable in Settings to use this feature.");
    } catch (e) {
      logger.error("permission", "request", { actor: "user", target: name, error: e });
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
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>FEATHERLESS.AI API KEY</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
          Required for all AI features — chat, image analysis, and models. Works on WiFi and cellular. Get a free key at featherless.ai.
        </Text>
        <TextInput
          value={orKey}
          onChangeText={setOrKey}
          placeholder="your-featherless-api-key"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={{
            borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
            color: colors.foreground, backgroundColor: colors.background, fontFamily: "Inter_500Medium", fontSize: 13,
          }}
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={saveOrKey} style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: orKeySaved ? "#238636" : colors.primary, alignItems: "center" }}>
            <Text style={{ color: "#000", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
              {orKeySaved ? "Saved!" : "Save Key"}
            </Text>
          </Pressable>
          <Pressable
            onPress={testKey}
            disabled={keyTestState === "testing"}
            style={{
              flex: 1, padding: 10, borderRadius: 10, alignItems: "center",
              backgroundColor: keyTestState === "ok" ? "#238636" : keyTestState === "fail" ? colors.destructive : colors.card,
              borderWidth: 1, borderColor: keyTestState === "ok" ? "#238636" : keyTestState === "fail" ? colors.destructive : colors.border,
              opacity: keyTestState === "testing" ? 0.6 : 1,
            }}
          >
            <Text style={{ color: keyTestState === "ok" || keyTestState === "fail" ? "#fff" : colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
              {keyTestState === "testing" ? "Testing…" : keyTestState === "ok" ? "✓ Valid" : keyTestState === "fail" ? "✗ Failed" : "Test Key"}
            </Text>
          </Pressable>
        </View>
        {keyTestState === "fail" && keyTestError ? (
          <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_500Medium" }}>{keyTestError}</Text>
        ) : null}
        {!getFeatherlessKey() && keyTestState === "idle" && (
          <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_500Medium" }}>
            Add your Featherless.ai key above — it's needed for all AI features.
          </Text>
        )}
      </View>

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="globe" size={16} color={colors.accent} />
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>SERVER URL</Text>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
          Optional. Only needed for APK builds, terminal, and VPN features. AI chat works without this on any connection.
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
          Active: {currentBase || "(none — AI features work without this)"}
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
          <Text style={{ flex: 1, color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>APK BUILD</Text>
          <Pressable onPress={loadBuild} hitSlop={6} disabled={buildLoading || building}>
            {buildLoading ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />}
          </Pressable>
        </View>

        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>
          Build a fresh APK from Replit. Requires a server URL above. Takes 10–20 min.
        </Text>

        {/* Build trigger button */}
        <Pressable
          onPress={startBuild}
          disabled={building || !getApiBase()}
          style={{
            padding: 10, borderRadius: 10, alignItems: "center", flexDirection: "row",
            justifyContent: "center", gap: 8,
            backgroundColor: building ? colors.muted : "#238636",
            opacity: !getApiBase() ? 0.4 : 1,
          }}
        >
          {building
            ? <ActivityIndicator size="small" color={colors.foreground} />
            : <Feather name="package" size={14} color="#fff" />}
          <Text style={{ color: building ? colors.foreground : "#fff", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
            {building ? "Submitting to EAS…" : "Build New APK from Replit"}
          </Text>
        </Pressable>

        {/* Build status message */}
        {!!buildLog && (
          <View style={{ borderRadius: 8, backgroundColor: "#0d1117", borderWidth: 1, borderColor: colors.border, padding: 10, gap: 8 }}>
            <Text selectable style={{ color: "#e6edf3", fontFamily: "Courier", fontSize: 10, lineHeight: 16 }}>{buildLog}</Text>
            {buildSubmitted && (
              <Pressable
                onPress={() => Linking.openURL("https://expo.dev/accounts/rubywilliam444/projects/my-new-project/builds")}
                style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 8, backgroundColor: "#04785722", borderWidth: 1, borderColor: "#047857" }}
              >
                <Feather name="external-link" size={12} color="#10b981" />
                <Text style={{ color: "#10b981", fontFamily: "Inter_600SemiBold", fontSize: 11 }}>View Build on EAS Dashboard</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Latest build info + download */}
        {buildError ? (
          <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_500Medium" }}>✗ {buildError}</Text>
        ) : build === null ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontStyle: "italic" }}>Checking for builds…</Text>
        ) : !build.found ? (
          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>No successful builds yet — tap Build above to create one.</Text>
        ) : build.build ? (
          <>
            <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 2 }} />
            <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 0.5 }}>LAST BUILD</Text>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
              v{build.build.appVersion} · {build.build.profile}
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
              {new Date(build.build.completedAt).toLocaleString()}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={async () => {
                  if (savingApk) return;
                  setSavingApk(true);
                  try {
                    await saveApkToPhone(build.build!.apkUrl, `lexi_v${build.build!.appVersion}.apk`);
                  } catch (e) {
                    Alert.alert("Save failed", e instanceof Error ? e.message : "Could not save APK.");
                  } finally {
                    setSavingApk(false);
                  }
                }}
                disabled={savingApk}
                style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: savingApk ? colors.muted : colors.primary, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 }}
              >
                {savingApk
                  ? <ActivityIndicator size="small" color={colors.foreground} />
                  : <Feather name="download" size={14} color="#000" />}
                <Text style={{ color: savingApk ? colors.foreground : "#000", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                  {savingApk ? "Saving to phone…" : "Save APK to Phone"}
                </Text>
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

      <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Feather name="info" size={16} color={colors.accent} />
          <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>ABOUT THIS BUILD</Text>
        </View>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Lexi Mobile</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Source hash: {BUILD_INFO.sourceHash}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Bundled versionCode: {BUILD_INFO.versionCode}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Built at: {BUILD_INFO.builtAt}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16, marginTop: 4 }}>
          Use this hash to confirm your installed APK matches the source tree on disk. The hash advances on every build.
        </Text>
      </View>

      <Text style={[styles.section, { color: colors.mutedForeground }]}>LOGGING</Text>
      <LoggingSection colors={colors} />

      <Text style={[styles.footer, { color: colors.mutedForeground }]}>Lexi Mobile v1.0.0 · {BUILD_INFO.sourceHash}</Text>
    </ScrollView>
  );
}

function LoggingSection({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [settings, setSettings] = React.useState(loggerGetSettings());
  const [retentionInput, setRetentionInput] = React.useState(String(settings.retentionDays));
  const [folder, setFolder] = React.useState<string | null>(null);

  React.useEffect(() => {
    const unsub = loggerSubscribeSettings((s) => {
      setSettings(s);
      setRetentionInput(String(s.retentionDays));
    });
    setFolder(loggerLogsDir());
    return unsub;
  }, []);

  const verbosityOptions: ("error" | "warn" | "info" | "debug" | "trace")[] = [
    "error", "warn", "info", "debug", "trace",
  ];

  return (
    <View style={[styles.cardLeft, { backgroundColor: colors.card, borderColor: colors.border, gap: 10 }]}>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Verbosity</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {verbosityOptions.map((v) => {
          const on = settings.verbosity === v;
          return (
            <Pressable
              key={v}
              onPress={() => loggerUpdateSettings({ verbosity: v })}
              style={{
                paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                borderWidth: 1, borderColor: on ? colors.primary : colors.border,
                backgroundColor: on ? colors.primary : "transparent",
              }}
            >
              <Text style={{ color: on ? colors.background : colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>{v}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 8 }}>Retention (days)</Text>
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        <TextInput
          value={retentionInput}
          onChangeText={setRetentionInput}
          keyboardType="number-pad"
          style={{
            flex: 1, color: colors.foreground, borderColor: colors.border, borderWidth: 1,
            borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
          }}
          placeholderTextColor={colors.mutedForeground}
        />
        <Pressable
          onPress={() => {
            const n = parseInt(retentionInput, 10);
            if (Number.isFinite(n) && n > 0) loggerUpdateSettings({ retentionDays: n });
          }}
          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.primary }}
        >
          <Text style={{ color: colors.background, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>Save</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Redact secrets</Text>
        <Switch
          value={settings.redact}
          onValueChange={(v) => { void loggerUpdateSettings({ redact: v }); }}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>

      <Pressable
        onPress={async () => {
          if (Platform.OS === "android") {
            try {
              const IL = await import("expo-intent-launcher");
              await IL.startActivityAsync("android.intent.action.VIEW", {
                data: folder ?? undefined,
                type: "resource/folder",
              });
              return;
            } catch {
              /* fall through */
            }
          }
          Alert.alert("Logs folder", folder ?? "Unavailable");
        }}
        style={{
          paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", marginTop: 4,
        }}
      >
        <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
          Open logs folder
        </Text>
      </Pressable>
      <Text style={{ color: colors.mutedForeground, fontSize: 10 }} numberOfLines={2}>
        {folder ?? "Logs folder unavailable on this platform."}
      </Text>
    </View>
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
