import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import {
  defaultBakedDomain,
  getApiBase,
  getFeatherlessKey,
  loadApiDomain,
  loadFeatherlessKey,
  pingServer,
  setApiDomain,
  setFeatherlessKey,
  testFeatherlessKey,
} from "@/lib/lexi-api";

type CheckState = "idle" | "checking" | "ok" | "failed";

export default function AiSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [serverInput, setServerInput] = useState("");
  const [activeServer, setActiveServer] = useState("");
  const [serverCheck, setServerCheck] = useState<CheckState>("idle");
  const [serverMessage, setServerMessage] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [keyCheck, setKeyCheck] = useState<CheckState>("idle");
  const [keyMessage, setKeyMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [server, key] = await Promise.all([
        loadApiDomain(),
        loadFeatherlessKey(),
      ]);
      if (!mounted) return;
      setServerInput(server.replace(/^https?:\/\//i, ""));
      setActiveServer(getApiBase());
      setHasSavedKey(Boolean(key));
      setSettingsLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const saveKey = async () => {
    const nextKey = keyDraft.trim();
    if (!nextKey) return;
    await setFeatherlessKey(nextKey);
    setKeyDraft("");
    setHasSavedKey(true);
    setKeyCheck("idle");
    setKeyMessage("Saved on this phone.");
  };

  const checkKey = async () => {
    const key = keyDraft.trim() || getFeatherlessKey();
    if (!key) {
      setKeyCheck("failed");
      setKeyMessage("Enter a key first.");
      return;
    }

    setKeyCheck("checking");
    setKeyMessage("");
    const result = await testFeatherlessKey(key);
    setKeyCheck(result.ok ? "ok" : "failed");
    setKeyMessage(result.ok ? "Key is valid." : result.error ?? "Key test failed.");
  };

  const saveServer = async () => {
    await setApiDomain(serverInput);
    setActiveServer(getApiBase());
    setServerCheck("idle");
    setServerMessage("Server setting saved on this phone.");
  };

  const useDefaultServer = async () => {
    await setApiDomain("");
    const defaultDomain = defaultBakedDomain();
    setServerInput(defaultDomain);
    setActiveServer(getApiBase());
    setServerCheck("idle");
    setServerMessage("Using the built-in server setting.");
  };

  const checkServer = async () => {
    setServerCheck("checking");
    setServerMessage("");
    const result = await pingServer();
    setServerCheck(result.ok ? "ok" : "failed");
    setServerMessage(
      result.ok
        ? `Connected (HTTP ${result.status ?? 200}).`
        : result.error ?? `Connection failed (HTTP ${result.status ?? "unknown"}).`,
    );
  };

  const topPadding =
    Platform.OS === "web" ? Math.max(insets.top, 67) + 12 : insets.top + 12;
  const bottomPadding =
    Platform.OS === "web" ? 34 + 84 : insets.bottom + 24;

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPadding, paddingBottom: bottomPadding },
      ]}
      bottomOffset={24}
    >
      <View style={styles.pageHeading}>
        <View style={[styles.headingIcon, { backgroundColor: colors.card }]}>
          <Feather name="sliders" size={19} color={colors.primary} />
        </View>
        <View style={styles.headingText}>
          <Text style={[styles.title, { color: colors.foreground }]}>AI Settings</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Manage the existing phone-side connections.
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeading}>
          <Feather name="zap" size={17} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Featherless API key</Text>
          {hasSavedKey ? (
            <View style={styles.savedBadge}>
              <Feather name="check-circle" size={13} color={colors.primary} />
              <Text style={[styles.savedText, { color: colors.primary }]}>Saved</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          The saved key stays on this phone. It is never shown here; enter a replacement only if you want to change it.
        </Text>
        <TextInput
          value={keyDraft}
          onChangeText={(value) => {
            setKeyDraft(value);
            setKeyCheck("idle");
            setKeyMessage("");
          }}
          placeholder={hasSavedKey ? "Enter a replacement key" : "Enter your Featherless key"}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
          accessibilityLabel="Featherless API key"
          testID="featherless-key-input"
          style={[
            styles.input,
            { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
          ]}
        />
        <View style={styles.buttonRow}>
          <Pressable
            onPress={saveKey}
            disabled={!keyDraft.trim()}
            accessibilityRole="button"
            testID="save-featherless-key"
            style={[
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: keyDraft.trim() ? 1 : 0.5 },
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              Save key
            </Text>
          </Pressable>
          <Pressable
            onPress={checkKey}
            disabled={keyCheck === "checking"}
            accessibilityRole="button"
            testID="test-featherless-key"
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            {keyCheck === "checking" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name={keyCheck === "ok" ? "check" : keyCheck === "failed" ? "x" : "activity"}
                size={15}
                color={keyCheck === "failed" ? colors.destructive : colors.primary}
              />
            )}
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
              {keyCheck === "checking" ? "Testing" : hasSavedKey && !keyDraft ? "Test saved key" : "Test key"}
            </Text>
          </Pressable>
        </View>
        {keyMessage ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.statusText,
              { color: keyCheck === "failed" ? colors.destructive : colors.mutedForeground },
            ]}
          >
            {keyMessage}
          </Text>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardHeading}>
          <Feather name="globe" size={17} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Server URL</Text>
        </View>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          Optional. This is the server address already used by the app; changing it here only updates this phone.
        </Text>
        <TextInput
          value={serverInput}
          onChangeText={(value) => {
            setServerInput(value);
            setServerCheck("idle");
            setServerMessage("");
          }}
          placeholder="example.replit.app"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          accessibilityLabel="AI server URL"
          testID="ai-server-url-input"
          style={[
            styles.input,
            { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border },
          ]}
        />
        <Text style={[styles.activeServer, { color: colors.mutedForeground }]}>
          Active: {settingsLoaded ? activeServer || "No server configured" : "Loading saved setting…"}
        </Text>
        <View style={styles.buttonRow}>
          <Pressable
            onPress={saveServer}
            accessibilityRole="button"
            testID="save-ai-server-url"
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              Save server
            </Text>
          </Pressable>
          <Pressable
            onPress={checkServer}
            disabled={serverCheck === "checking"}
            accessibilityRole="button"
            testID="test-ai-server"
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            {serverCheck === "checking" ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Feather
                name={serverCheck === "ok" ? "check" : serverCheck === "failed" ? "x" : "activity"}
                size={15}
                color={serverCheck === "failed" ? colors.destructive : colors.primary}
              />
            )}
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
              {serverCheck === "checking" ? "Testing" : "Test server"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.buttonRow}>
          <Pressable
            onPress={useDefaultServer}
            accessibilityRole="button"
            testID="use-default-ai-server"
            style={[styles.linkButton, { borderColor: colors.border }]}
          >
            <Feather name="rotate-ccw" size={14} color={colors.mutedForeground} />
            <Text style={[styles.linkButtonText, { color: colors.mutedForeground }]}>
              Use built-in server
            </Text>
          </Pressable>
        </View>
        {serverMessage ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[
              styles.statusText,
              { color: serverCheck === "failed" ? colors.destructive : colors.mutedForeground },
            ]}
          >
            {serverMessage}
          </Text>
        ) : null}
      </View>

      <View style={[styles.networkNote, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Feather name="smartphone" size={17} color={colors.primary} />
        <Text style={[styles.networkText, { color: colors.mutedForeground }]}>
          Lexi uses your phone’s active connection, including cellular data when mobile data is enabled for the app.
        </Text>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
  pageHeading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 2 },
  headingIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headingText: { flex: 1, gap: 3 },
  title: { fontFamily: "Inter_700Bold", fontSize: 21 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 11 },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 14 },
  description: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  buttonRow: { flexDirection: "row", gap: 9 },
  primaryButton: { minHeight: 42, flex: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  primaryButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  secondaryButton: { minHeight: 42, flex: 1, flexDirection: "row", gap: 7, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  secondaryButtonText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  linkButton: { minHeight: 38, flexDirection: "row", gap: 7, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 11 },
  linkButtonText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  statusText: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16 },
  savedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  savedText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  activeServer: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15 },
  networkNote: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  networkText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
});
