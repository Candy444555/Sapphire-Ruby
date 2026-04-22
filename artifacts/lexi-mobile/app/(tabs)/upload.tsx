import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { API, deleteUpload, listUploads, uploadFile } from "@/lib/lexi-api";

interface UploadItem { filename: string; size?: number; mtime?: string; url?: string }

export default function UploadScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUploads();
      setItems(Array.isArray(data) ? data : (data.uploads ?? []));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pickAndUpload = useCallback(async (mode: "image" | "document") => {
    setUploading(true);
    try {
      let uri = "", name = "", mime = "application/octet-stream";
      if (mode === "image") {
        const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, quality: 1 });
        if (r.canceled || !r.assets[0]) return;
        const a = r.assets[0];
        uri = a.uri; name = a.fileName ?? `upload-${Date.now()}.jpg`; mime = a.mimeType ?? "image/jpeg";
      } else {
        const r = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true });
        if (r.canceled || !r.assets?.[0]) return;
        const a = r.assets[0];
        uri = a.uri; name = a.name ?? `file-${Date.now()}`; mime = a.mimeType ?? "application/octet-stream";
      }
      const result = await uploadFile(uri, name, mime);
      if (result?.error) throw new Error(result.error);
      await load();
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Unknown");
    } finally { setUploading(false); }
  }, [load]);

  const remove = useCallback((filename: string) => {
    Alert.alert("Delete?", filename, [
      { text: "Cancel" },
      { text: "Delete", style: "destructive", onPress: async () => { await deleteUpload(filename); load(); } },
    ]);
  }, [load]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>UPLOADS</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 11 }}>{items.length} files on server</Text>
        </View>
        <Pressable onPress={load} hitSlop={8}>
          <Feather name="refresh-cw" size={18} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", padding: 14, gap: 10 }}>
        <Pressable onPress={() => pickAndUpload("image")} disabled={uploading} style={[styles.upBtn, { backgroundColor: colors.primary }]}>
          {uploading ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="image" size={18} color={colors.primaryForeground} />}
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1 }}>IMAGE/VIDEO</Text>
        </Pressable>
        <Pressable onPress={() => pickAndUpload("document")} disabled={uploading} style={[styles.upBtn, { backgroundColor: colors.accent }]}>
          {uploading ? <ActivityIndicator color={colors.foreground} /> : <Feather name="file" size={18} color={colors.foreground} />}
          <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 12, letterSpacing: 1 }}>DOCUMENT</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, gap: 8 }}>
        {loading && <ActivityIndicator color={colors.primary} />}
        {items.map((it) => {
          const url = it.url ?? `${API}/uploads/${encodeURIComponent(it.filename)}`;
          return (
            <View key={it.filename} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="file" size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{it.filename}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>
                  {it.size != null ? (it.size < 1024 ? `${it.size}B` : it.size < 1024 * 1024 ? `${(it.size / 1024).toFixed(1)}KB` : `${(it.size / 1048576).toFixed(2)}MB`) : ""}
                  {it.mtime ? ` · ${new Date(it.mtime).toLocaleDateString()}` : ""}
                </Text>
              </View>
              <Pressable onPress={() => Linking.openURL(url)} hitSlop={6}>
                <Feather name="external-link" size={16} color={colors.mutedForeground} />
              </Pressable>
              <Pressable onPress={() => remove(it.filename)} hitSlop={6}>
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </Pressable>
            </View>
          );
        })}
        {!loading && items.length === 0 && (
          <Text style={{ color: colors.mutedForeground, fontStyle: "italic", textAlign: "center", marginTop: 40 }}>
            No uploads yet.
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: 1 },
  upBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
});
