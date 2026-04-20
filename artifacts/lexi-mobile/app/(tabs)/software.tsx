import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";

interface SoftwareItem {
  id: string;
  name: string;
}

interface Category {
  category: string;
  icon: string;
  items: SoftwareItem[];
}

interface StatusEntry {
  installed: boolean;
  version: string;
}

type InstallingState = "idle" | "installing" | "done" | "error";

export default function SoftwareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [status, setStatus] = useState<Record<string, StatusEntry>>({});
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installOutput, setInstallOutput] = useState<{ id: string; output: string; ok: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCmd, setCustomCmd] = useState("");
  const [customInstalling, setCustomInstalling] = useState(false);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await fetch(`${DOMAIN}/api/software/catalog`);
      const data = await res.json();
      setCatalog(data.catalog ?? []);
      const allIds = (data.catalog ?? []).flatMap((c: Category) => c.items.map((i) => i.id));
      checkStatus(allIds);
    } catch (e) {
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  const checkStatus = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const res = await fetch(`${DOMAIN}/api/software/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      setStatus((prev) => ({ ...prev, ...(data.status ?? {}) }));
    } catch {}
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const install = useCallback(async (id: string, name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setInstallingId(id);
    setInstallOutput(null);
    try {
      const res = await fetch(`${DOMAIN}/api/software/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setInstallOutput({ id, output: data.output ?? data.error ?? "", ok: !!data.ok });
      if (data.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setStatus((prev) => ({ ...prev, [id]: { installed: true, version: "" } }));
        checkStatus([id]);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch (e: any) {
      setInstallOutput({ id, output: e.message, ok: false });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setInstallingId(null);
    }
  }, [checkStatus]);

  const installCustom = useCallback(async () => {
    if (!customCmd.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCustomInstalling(true);
    setInstallOutput(null);
    try {
      const res = await fetch(`${DOMAIN}/api/software/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customCommand: customCmd.trim() }),
      });
      const data = await res.json();
      setInstallOutput({ id: "custom", output: data.output ?? data.error ?? "", ok: !!data.ok });
      if (data.ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (e: any) {
      setInstallOutput({ id: "custom", output: e.message, ok: false });
    } finally {
      setCustomInstalling(false);
    }
  }, [customCmd]);

  const categories = catalog.map((c) => c.category);
  const filtered = catalog.map((cat) => ({
    ...cat,
    items: cat.items.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) =>
    (selectedCategory === null || cat.category === selectedCategory) && cat.items.length > 0
  );

  const webPad = 16;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? webPad : insets.top + 10 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#aaa" />
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>SOFTWARE</Text>
          <Text style={styles.headerSub}>Install & Manage</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={fetchCatalog}>
          <Feather name="refresh-cw" size={18} color="#666" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Search */}
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color="#555" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search software..."
            placeholderTextColor="#444"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x" size={16} color="#555" />
            </Pressable>
          )}
        </View>

        {/* Category Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow} contentContainerStyle={styles.pillContent}>
          <Pressable style={[styles.pill, selectedCategory === null && styles.pillActive]} onPress={() => setSelectedCategory(null)}>
            <Text style={[styles.pillText, selectedCategory === null && styles.pillTextActive]}>All</Text>
          </Pressable>
          {categories.map((cat) => (
            <Pressable key={cat} style={[styles.pill, selectedCategory === cat && styles.pillActive]} onPress={() => setSelectedCategory(cat === selectedCategory ? null : cat)}>
              <Text style={[styles.pillText, selectedCategory === cat && styles.pillTextActive]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Custom Command */}
        <View style={styles.customSection}>
          <Text style={styles.sectionTitle}>Custom Install Command</Text>
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              placeholder="apt-get install -y nmap  or  pip3 install requests"
              placeholderTextColor="#444"
              value={customCmd}
              onChangeText={setCustomCmd}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              style={[styles.runBtn, (!customCmd.trim() || customInstalling) && styles.runBtnDisabled]}
              onPress={installCustom}
              disabled={!customCmd.trim() || customInstalling}
            >
              {customInstalling
                ? <ActivityIndicator color="#000" size="small" />
                : <Feather name="play" size={16} color="#000" />
              }
            </Pressable>
          </View>
        </View>

        {/* Install Output */}
        {installOutput && (
          <View style={[styles.outputBox, installOutput.ok ? styles.outputOk : styles.outputErr]}>
            <View style={styles.outputHeader}>
              <Feather name={installOutput.ok ? "check-circle" : "x-circle"} size={14} color={installOutput.ok ? "#00d4ff" : "#ff4444"} />
              <Text style={[styles.outputStatus, installOutput.ok ? styles.outputStatusOk : styles.outputStatusErr]}>
                {installOutput.ok ? "Installed successfully" : "Install failed"}
              </Text>
              <Pressable onPress={() => setInstallOutput(null)} hitSlop={8} style={styles.closeOutput}>
                <Feather name="x" size={14} color="#555" />
              </Pressable>
            </View>
            <ScrollView style={styles.outputScroll} nestedScrollEnabled>
              <Text style={styles.outputText}>{installOutput.output}</Text>
            </ScrollView>
          </View>
        )}

        {/* Loading */}
        {loadingCatalog ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#00d4ff" />
          </View>
        ) : (
          filtered.map((cat) => (
            <View key={cat.category} style={styles.categorySection}>
              <View style={styles.categoryHeader}>
                <Feather name={cat.icon as any} size={14} color="#00d4ff" />
                <Text style={styles.categoryTitle}>{cat.category}</Text>
              </View>
              {cat.items.map((item) => {
                const st = status[item.id];
                const isInstalling = installingId === item.id;
                return (
                  <View key={item.id} style={styles.itemCard}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {st?.version ? (
                        <Text style={styles.itemVersion} numberOfLines={1}>{st.version}</Text>
                      ) : st?.installed ? (
                        <Text style={styles.itemVersionInstalled}>Installed</Text>
                      ) : null}
                    </View>
                    <View style={styles.itemRight}>
                      {st?.installed && !isInstalling && (
                        <View style={styles.installedBadge}>
                          <Feather name="check" size={10} color="#00d4ff" />
                          <Text style={styles.installedText}>Installed</Text>
                        </View>
                      )}
                      <Pressable
                        style={[styles.installBtn, isInstalling && styles.installBtnBusy, st?.installed && !isInstalling && styles.reinstallBtn]}
                        onPress={() => install(item.id, item.name)}
                        disabled={!!installingId}
                      >
                        {isInstalling
                          ? <ActivityIndicator color="#000" size="small" style={{ width: 14 }} />
                          : <Feather name={st?.installed ? "refresh-cw" : "download"} size={14} color={st?.installed ? "#555" : "#000"} />
                        }
                        <Text style={[styles.installBtnText, st?.installed && !isInstalling && styles.reinstallBtnText]}>
                          {isInstalling ? "Installing..." : st?.installed ? "Reinstall" : "Install"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a0a0a" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1a1a1a",
  },
  backBtn: { padding: 6 },
  iconBtn: { padding: 6 },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 2 },
  headerSub: { color: "#00d4ff", fontSize: 10, fontWeight: "600", letterSpacing: 1, marginTop: 1 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    gap: 8,
  },
  searchIcon: {},
  searchInput: { flex: 1, color: "#eee", fontSize: 14 },

  pillRow: { marginHorizontal: -16 },
  pillContent: { paddingHorizontal: 16, gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#222",
  },
  pillActive: { backgroundColor: "#00d4ff22", borderColor: "#00d4ff" },
  pillText: { color: "#555", fontSize: 12, fontWeight: "600" },
  pillTextActive: { color: "#00d4ff" },

  customSection: { gap: 8 },
  sectionTitle: { color: "#555", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  customRow: { flexDirection: "row", gap: 8 },
  customInput: {
    flex: 1,
    backgroundColor: "#111",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#eee",
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  runBtn: {
    backgroundColor: "#00d4ff",
    borderRadius: 10,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  runBtnDisabled: { opacity: 0.4 },

  outputBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    maxHeight: 200,
  },
  outputOk: { backgroundColor: "#00d4ff08", borderColor: "#00d4ff33" },
  outputErr: { backgroundColor: "#ff444408", borderColor: "#ff444433" },
  outputHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  outputStatus: { flex: 1, fontSize: 12, fontWeight: "700" },
  outputStatusOk: { color: "#00d4ff" },
  outputStatusErr: { color: "#ff4444" },
  closeOutput: { marginLeft: "auto" },
  outputScroll: { maxHeight: 140 },
  outputText: {
    color: "#aaa",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 16,
  },

  centered: { alignItems: "center", justifyContent: "center", padding: 40 },

  categorySection: { gap: 6 },
  categoryHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  categoryTitle: { color: "#00d4ff", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },

  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#1a1a1a",
    gap: 10,
  },
  itemInfo: { flex: 1, gap: 2 },
  itemName: { color: "#ddd", fontSize: 14, fontWeight: "600" },
  itemVersion: { color: "#444", fontSize: 10, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  itemVersionInstalled: { color: "#00d4ff44", fontSize: 10 },

  itemRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  installedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#00d4ff11",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#00d4ff22",
  },
  installedText: { color: "#00d4ff", fontSize: 9, fontWeight: "700" },

  installBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#00d4ff",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  installBtnBusy: { opacity: 0.7, backgroundColor: "#00d4ff88" },
  reinstallBtn: { backgroundColor: "#1a1a1a", borderWidth: 1, borderColor: "#2a2a2a" },
  installBtnText: { color: "#000", fontSize: 11, fontWeight: "700" },
  reinstallBtnText: { color: "#555" },
});
