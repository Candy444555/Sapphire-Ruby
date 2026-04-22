import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

interface UploadedFile {
  filename: string;
  size: number;
  uploadedAt: string;
  isApk: boolean;
  downloadPath: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function UploadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadingName, setUploadingName] = useState("");
  const [loading, setLoading] = useState(true);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressCallback = useRef<FileSystem.UploadProgressCallback | null>(null);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch(`${DOMAIN}/api/uploads`);
      const data = await res.json();
      setFiles(data.files ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const pickAndUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileSize = asset.size ?? 0;

      if (fileSize > 200 * 1024 * 1024) {
        Alert.alert("File too large", "Maximum upload size is 200 MB.");
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setUploading(true);
      setProgress(0);
      setUploadingName(asset.name);
      progressAnim.setValue(0);

      if (Platform.OS === "web") {
        const formData = new FormData();
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append("file", blob, asset.name);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${DOMAIN}/api/upload`);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(e.loaded / e.total);
          }
        };

        await new Promise<void>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status === 200) resolve();
            else reject(new Error(`Upload failed: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("Network error"));
          xhr.send(formData);
        });
      } else {
        const uploadResult = await FileSystem.uploadAsync(
          `${DOMAIN}/api/upload`,
          asset.uri,
          {
            httpMethod: "POST",
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: "file",
            mimeType: asset.mimeType ?? "application/octet-stream",
            headers: { Accept: "application/json" },
          }
        );

        if (uploadResult.status !== 200) {
          throw new Error(`Upload failed: ${uploadResult.status}`);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await fetchFiles();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Upload failed", err.message ?? "Unknown error");
    } finally {
      setUploading(false);
      setProgress(0);
      setUploadingName("");
    }
  }, [fetchFiles, progressAnim]);

  const deleteFile = useCallback(async (filename: string) => {
    Alert.alert("Delete file", `Remove "${filename}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await fetch(`${DOMAIN}/api/uploads/${encodeURIComponent(filename)}`, {
              method: "DELETE",
            });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setFiles((prev) => prev.filter((f) => f.filename !== filename));
          } catch {
            Alert.alert("Error", "Could not delete file.");
          }
        },
      },
    ]);
  }, []);

  const webPad = 16;
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? webPad : insets.top + 10 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#F5F9FC" />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>UPLOADS</Text>
          <Text style={styles.headerSub}>APK & File Manager</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={fetchFiles}>
          <Feather name="refresh-cw" size={18} color="#C2C8CC" />
        </Pressable>
      </View>

      {/* Upload Button */}
      <View style={styles.uploadSection}>
        <Pressable
          style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
          onPress={pickAndUpload}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#0E1525" size="small" />
          ) : (
            <Feather name="upload" size={20} color="#0E1525" />
          )}
          <Text style={styles.uploadBtnText}>
            {uploading ? "Uploading..." : "Pick & Upload File"}
          </Text>
        </Pressable>
        <Text style={styles.limitNote}>APK, ZIP, PDF, images, video · max 200 MB</Text>
      </View>

      {/* Progress Bar */}
      {uploading && (
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.progressText} numberOfLines={1}>
            {uploadingName} · {Math.round(progress * 100)}%
          </Text>
        </View>
      )}

      {/* File List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#F26207" />
        </View>
      ) : files.length === 0 ? (
        <View style={styles.centered}>
          <Feather name="inbox" size={48} color="#6C7079" />
          <Text style={styles.emptyText}>No files uploaded yet</Text>
          <Text style={styles.emptySubText}>Upload an APK or any file to get started</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(f) => f.filename}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.fileCard}>
              <View style={styles.fileIcon}>
                <Feather
                  name={item.isApk ? "package" : "file"}
                  size={22}
                  color={item.isApk ? "#F26207" : "#C2C8CC"}
                />
              </View>
              <View style={styles.fileInfo}>
                <Text style={styles.fileName} numberOfLines={1}>{item.filename}</Text>
                <View style={styles.fileMeta}>
                  {item.isApk && (
                    <View style={styles.apkBadge}>
                      <Text style={styles.apkBadgeText}>APK</Text>
                    </View>
                  )}
                  <Text style={styles.fileSize}>{formatBytes(item.size)}</Text>
                  <Text style={styles.fileDot}>·</Text>
                  <Text style={styles.fileDate}>{timeAgo(item.uploadedAt)}</Text>
                </View>
              </View>
              <Pressable
                style={styles.deleteBtn}
                onPress={() => deleteFile(item.filename)}
                hitSlop={8}
              >
                <Feather name="trash-2" size={16} color="#9DA2A6" />
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1C2333" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2B3245",
  },
  backBtn: { padding: 6 },
  iconBtn: { padding: 6 },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 2 },
  headerSub: { color: "#F26207", fontSize: 10, fontWeight: "600", letterSpacing: 1, marginTop: 1 },

  uploadSection: {
    margin: 16,
    gap: 8,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#F26207",
    borderRadius: 12,
    paddingVertical: 16,
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { color: "#0E1525", fontSize: 15, fontWeight: "700" },
  limitNote: { color: "#9DA2A6", fontSize: 11, textAlign: "center" },

  progressContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
    gap: 6,
  },
  progressTrack: {
    height: 4,
    backgroundColor: "#2B3245",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#F26207",
    borderRadius: 2,
  },
  progressText: { color: "#9DA2A6", fontSize: 11 },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { color: "#9DA2A6", fontSize: 16, fontWeight: "600", marginTop: 12 },
  emptySubText: { color: "#6C7079", fontSize: 13 },

  listContent: { paddingHorizontal: 16, paddingBottom: 40 },

  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2B3245",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#2B3245",
    gap: 12,
  },
  fileIcon: {
    width: 40,
    height: 40,
    backgroundColor: "#2B3245",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: { flex: 1, gap: 4 },
  fileName: { color: "#F5F9FC", fontSize: 13, fontWeight: "600" },
  fileMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  apkBadge: {
    backgroundColor: "#F2620733",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: "#F2620766",
  },
  apkBadgeText: { color: "#F26207", fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  fileSize: { color: "#9DA2A6", fontSize: 11 },
  fileDot: { color: "#6C7079", fontSize: 11 },
  fileDate: { color: "#9DA2A6", fontSize: 11 },
  deleteBtn: { padding: 6 },
});
