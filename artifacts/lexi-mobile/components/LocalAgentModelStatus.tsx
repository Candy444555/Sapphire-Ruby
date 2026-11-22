import { Feather } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { useLocalAgentModel } from "@/hooks/useLocalAgentModel";
import { LOCAL_AGENT_MODEL_BYTES } from "@/lib/local-agent-model";

function formatSize(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function LocalAgentModelStatus() {
  const colors = useColors();
  const { state, retry, cancel } = useLocalAgentModel();
  const progress =
    state.totalBytes > 0
      ? Math.min(1, state.downloadedBytes / state.totalBytes)
      : 0;
  const isDownloading = state.status === "downloading";
  const isProgressVisible = isDownloading || state.status === "verifying";
  const isError = state.status === "error";
  const isReady = state.status === "ready";

  const title =
    state.status === "unsupported"
      ? "Local Agent needs Android"
      : state.status === "downloading"
        ? "Downloading local model"
        : state.status === "verifying"
          ? "Checking model file"
          : state.status === "loading"
            ? "Loading local model"
            : state.status === "downloaded"
              ? "Model downloaded and checked"
            : state.status === "ready"
              ? "Local model ready"
              : state.status === "error"
                ? "Local model needs attention"
                : "Preparing local Agent";

  const detail =
    state.message ??
    (isDownloading
      ? `${formatSize(state.downloadedBytes)} of ${formatSize(state.totalBytes || LOCAL_AGENT_MODEL_BYTES)}`
      : state.status === "downloaded"
        ? "Stored in private phone storage; it loads when you use Agent."
      : isReady
        ? "Agent responses run on this phone."
        : "The model will download to private phone storage.");

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      accessibilityLiveRegion="polite"
      testID="local-agent-model-status"
    >
      <View style={[styles.icon, { backgroundColor: colors.muted }]}>
        <Feather
          name={isReady ? "check-circle" : isError ? "alert-circle" : "cpu"}
          size={17}
          color={isReady ? colors.primary : isError ? colors.destructive : colors.accent}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.detail, { color: colors.mutedForeground }]}>{detail}</Text>
        {isProgressVisible ? (
          <View
            style={[styles.track, { backgroundColor: colors.muted }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          >
            <View
              style={[
                styles.fill,
                { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` },
              ]}
            />
          </View>
        ) : null}
      </View>
      {isDownloading ? (
        <Pressable
          onPress={() => void cancel()}
          accessibilityRole="button"
          accessibilityLabel="Cancel model download"
          testID="cancel-local-model-download"
          hitSlop={8}
        >
          <Feather name="x-circle" size={21} color={colors.mutedForeground} />
        </Pressable>
      ) : isError ? (
        <Pressable
          onPress={() => void retry()}
          accessibilityRole="button"
          accessibilityLabel="Retry model download"
          testID="retry-local-model-download"
          hitSlop={8}
        >
          <Feather name="rotate-ccw" size={19} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  icon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 4 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  detail: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 15 },
  track: { height: 5, borderRadius: 4, overflow: "hidden", marginTop: 3 },
  fill: { height: "100%", borderRadius: 4 },
});
