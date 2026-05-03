import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { getApiBase, softwareCatalog, softwareInstall, softwareStatus } from "@/lib/lexi-api";

interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  category?: string;
}
interface StatusResult { installed: boolean; version: string }

export default function SoftwareScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [status, setStatus] = useState<Record<string, StatusResult>>({});
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");
  const hasServer = !!getApiBase();

  const load = useCallback(async () => {
    if (!hasServer) { setLoading(false); return; }
    setLoading(true);
    try {
      const raw = await softwareCatalog();
      const nested: { category: string; items: { id: string; name: string }[] }[] = raw.catalog ?? [];
      const flat: CatalogItem[] = nested.flatMap((cat) =>
        (cat.items ?? []).map((item) => ({ ...item, category: cat.category }))
      );
      setCatalog(flat);

      if (flat.length > 0) {
        const ids = flat.map((i) => i.id);
        const s = await softwareStatus(ids);
        setStatus(s.status ?? {});
      }
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not load");
    } finally { setLoading(false); }
  }, [hasServer]);

  useEffect(() => { load(); }, [load]);

  const install = useCallback(async (id: string) => {
    setInstalling(id); setOutput("");
    try {
      const r = await softwareInstall(id);
      setOutput(r.output ?? r.log ?? JSON.stringify(r, null, 2));
      await load();
    } catch (e) {
      setOutput(`Error: ${e instanceof Error ? e.message : "unknown"}`);
    } finally { setInstalling(null); }
  }, [load]);

  const grouped = catalog.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    const cat = item.category ?? "Other";
    (acc[cat] ??= []).push(item);
    return acc;
  }, {});

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>SOFTWARE</Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 11 }}>
            {catalog.length} packages · {Object.values(status).filter((s) => s.installed).length} installed
          </Text>
        </View>
        <Pressable onPress={load} hitSlop={8}>
          <Feather name="refresh-cw" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {!hasServer ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
          <Feather name="server" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 14, textAlign: "center" }}>
            Software install requires an API server.{"\n"}Set your server URL in Profile settings.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 32, gap: 16 }}>
          {loading && <ActivityIndicator color={colors.primary} />}
          {Object.entries(grouped).map(([cat, items]) => (
            <View key={cat} style={{ gap: 8 }}>
              <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 }}>{cat.toUpperCase()}</Text>
              {items.map((it) => {
                const s = status[it.id];
                const isInstalled = s?.installed ?? false;
                const version = s?.version ?? "";
                const isBusy = installing === it.id;
                return (
                  <View key={it.id} style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>{it.name}</Text>
                      {version ? (
                        <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 2 }}>{version}</Text>
                      ) : it.description ? (
                        <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>{it.description}</Text>
                      ) : null}
                    </View>
                    <Pressable
                      onPress={() => install(it.id)}
                      disabled={isBusy}
                      style={[styles.installBtn, { backgroundColor: isInstalled ? colors.muted : colors.primary, borderColor: isInstalled ? colors.border : colors.primary }]}
                    >
                      {isBusy ? <ActivityIndicator color={colors.foreground} size="small" /> : (
                        <Feather name={isInstalled ? "refresh-cw" : "download"} size={14} color={isInstalled ? colors.foreground : colors.primaryForeground} />
                      )}
                      <Text style={{ color: isInstalled ? colors.foreground : colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1 }}>
                        {isInstalled ? "UPDATE" : "INSTALL"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
          {output ? (
            <View style={[styles.outBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={{ color: colors.accent, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5, marginBottom: 6 }}>INSTALL OUTPUT</Text>
              <ScrollView horizontal>
                <Text selectable style={{ color: colors.foreground, fontFamily: "Courier", fontSize: 11 }}>{output}</Text>
              </ScrollView>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 10 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: 1 },
  card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 12, borderWidth: 1 },
  installBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  outBox: { borderRadius: 10, borderWidth: 1, padding: 10, maxHeight: 240 },
});
