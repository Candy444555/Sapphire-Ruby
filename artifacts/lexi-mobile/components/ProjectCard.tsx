import { Feather } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import { easBuildStatus, projectDownloadUrl, projectFileUrl } from "@/lib/lexi-api";

interface Props {
  projectId: string;
  name: string;
  mainFile: string;
  projectType: string;
}

const TYPE_LABEL: Record<string, string> = {
  web: "Web App", image: "Image", video: "Video", document: "Document", apk: "Android APK", app: "Application",
};
const TYPE_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  web: "code", image: "image", video: "video", document: "file-text", apk: "smartphone", app: "package",
};

function extractEasBuildId(url: string): string | null {
  const m = url.match(/builds\/([a-zA-Z0-9_-]+)/);
  return m?.[1] ?? null;
}

function CloudApkCard({ name, buildUrl }: { name: string; buildUrl: string }) {
  const colors = useColors();
  const easBuildId = extractEasBuildId(buildUrl);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof easBuildStatus>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const check = useCallback(async () => {
    if (!easBuildId) return;
    setChecking(true);
    setErr(null);
    try { setStatus(await easBuildStatus(easBuildId)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Status check failed"); }
    finally { setChecking(false); }
  }, [easBuildId]);

  const s = status?.status ?? "QUEUED";
  const isFinished = s === "FINISHED";
  const isErrored = s === "ERRORED" || s === "CANCELED";
  const apkUrl = status?.apkUrl;
  const labelMap: Record<string, string> = {
    QUEUED: "Queued — waiting", IN_PROGRESS: "Building now…", FINISHED: "Build complete!", ERRORED: "Build failed", CANCELED: "Build canceled",
  };

  return (
    <View style={[styles.wrap, { borderColor: "#3fb950", backgroundColor: "rgba(63,185,80,0.08)" }]}>
      <View style={styles.head}>
        <Feather name="smartphone" size={20} color="#3fb950" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.foreground }]}>{name}</Text>
          <Text style={{ color: isFinished ? "#3fb950" : isErrored ? colors.destructive : "#d29922", fontSize: 11, fontFamily: "Inter_500Medium" }}>
            {labelMap[s] ?? "Status unknown"}
          </Text>
          {!isFinished && !isErrored && (
            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }}>
              Cloud builds typically take 10–20 minutes
            </Text>
          )}
          {err && <Text style={{ color: colors.destructive, fontSize: 11, marginTop: 2 }}>{err}</Text>}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => Linking.openURL(buildUrl)} style={[styles.btn, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
          <Feather name="external-link" size={12} color={colors.foreground} />
          <Text style={[styles.btnText, { color: colors.foreground }]}>Track</Text>
        </Pressable>
        {easBuildId && (
          <Pressable onPress={check} disabled={checking} style={[styles.btn, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
            {checking ? <ActivityIndicator size="small" color={colors.foreground} /> : <Feather name="refresh-cw" size={12} color={colors.foreground} />}
            <Text style={[styles.btnText, { color: colors.foreground }]}>Status</Text>
          </Pressable>
        )}
        {apkUrl && (
          <Pressable onPress={() => Linking.openURL(apkUrl)} style={[styles.btn, { backgroundColor: "rgba(63,185,80,0.25)" }]}>
            <Feather name="download" size={12} color="#3fb950" />
            <Text style={[styles.btnText, { color: "#3fb950" }]}>APK</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function ProjectCard({ projectId, name, mainFile, projectType }: Props) {
  const colors = useColors();
  const [imgError, setImgError] = useState(false);

  if (projectType === "apk" && mainFile.startsWith("https://")) {
    return <CloudApkCard name={name} buildUrl={mainFile} />;
  }

  const fileUrl = projectFileUrl(projectId, mainFile);
  const dlUrl = projectFileUrl(projectId, mainFile, true);
  const allUrl = projectDownloadUrl(projectId);

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.muted }]}>
      <View style={styles.head}>
        <Feather name={TYPE_ICON[projectType] ?? "folder"} size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.foreground }]}>{name}</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>
            {TYPE_LABEL[projectType] ?? "Project"} · ready
          </Text>
        </View>
      </View>

      {projectType === "image" && !imgError && (
        <Image source={{ uri: fileUrl }} style={styles.preview} resizeMode="contain" onError={() => setImgError(true)} />
      )}

      <View style={styles.actions}>
        <Pressable onPress={() => Linking.openURL(dlUrl)} style={[styles.btn, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
          <Feather name="download" size={12} color={colors.foreground} />
          <Text style={[styles.btnText, { color: colors.foreground }]}>Download</Text>
        </Pressable>
        <Pressable onPress={() => Linking.openURL(allUrl)} style={[styles.btn, { backgroundColor: "rgba(255,255,255,0.08)" }]}>
          <Feather name="package" size={12} color={colors.foreground} />
          <Text style={[styles.btnText, { color: colors.foreground }]}>All Files</Text>
        </Pressable>
        {projectType === "web" && (
          <Pressable onPress={() => Linking.openURL(fileUrl)} style={[styles.btn, { backgroundColor: "rgba(88,166,255,0.2)" }]}>
            <Feather name="external-link" size={12} color={colors.primary} />
            <Text style={[styles.btnText, { color: colors.primary }]}>Open</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 14, borderWidth: 1, padding: 12, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  preview: { width: "100%", height: 220, borderRadius: 10, backgroundColor: "#000" },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
