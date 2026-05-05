import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import {
  clearRecentEntries,
  dailyFilePath,
  deleteAllLogs,
  flushNow,
  getRecentEntries,
  ingestRawLines,
  ingestScanReports,
  listLogFiles,
  readLogFile,
  scanInboxDir,
  subscribeLogs,
  log,
  type LogEntry,
  type LogLevel,
} from "@/lib/logger";

const LEVELS: (LogLevel | "all")[] = ["all", "error", "warn", "info", "debug", "trace"];
const ACTORS = ["all", "user", "app", "system", "scanner"];

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function extractDate(filePath: string): string | null {
  const name = filePath.split("/").pop() ?? filePath;
  const m = /^lexi-(\d{4}-\d{2}-\d{2})/.exec(name);
  return m ? m[1] : null;
}

export default function LogsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<LogEntry[]>(() => getRecentEntries());
  const [tail, setTail] = useState(true);
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [actorFilter, setActorFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => ymd(new Date()));

  useEffect(() => {
    if (!tail) return;
    const unsub = subscribeLogs(() => {
      setEntries(getRecentEntries());
    });
    return unsub;
  }, [tail]);

  useEffect(() => {
    void listLogFiles().then(setFiles);
  }, []);

  // Categories are derived from the live buffer so the chip set adapts as
  // new modules emit their first events (terminal, ai, net, scanner:*, …).
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) set.add(e.category);
    return ["all", ...Array.from(set).sort()];
  }, [entries]);

  // Available log dates for the date picker, derived from on-disk file
  // names. Always includes today so the user can jump back to live tail.
  const dates = useMemo(() => {
    const set = new Set<string>([ymd(new Date())]);
    for (const f of files) {
      const d = extractDate(f);
      if (d) set.add(d);
    }
    return Array.from(set).sort().reverse();
  }, [files]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => level === "all" || e.level === level)
      .filter((e) => categoryFilter === "all" || e.category === categoryFilter)
      .filter((e) => {
        if (actorFilter === "all") return true;
        if (actorFilter === "scanner") return e.actor.startsWith("scanner");
        return e.actor === actorFilter;
      })
      .filter((e) => {
        if (!q) return true;
        return (
          e.action.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          (e.target ?? "").toLowerCase().includes(q) ||
          JSON.stringify(e.inputs ?? "").toLowerCase().includes(q) ||
          JSON.stringify(e.outputs ?? "").toLowerCase().includes(q)
        );
      })
      .slice()
      .reverse();
  }, [entries, level, categoryFilter, actorFilter, search]);

  const onPickDate = useCallback(async (date: string) => {
    setSelectedDate(date);
    const matching = files.filter((f) => extractDate(f) === date);
    if (matching.length === 0) {
      setTail(date === ymd(new Date()));
      Alert.alert("No log file", `No NDJSON file recorded for ${date} yet.`);
      return;
    }
    setTail(false);
    // Reset the in-memory buffer first so re-opening the same date doesn't
    // duplicate entries — the recent buffer is rebuilt purely from this
    // load's content plus any new live events.
    clearRecentEntries();
    let total = 0;
    for (const f of matching) {
      const text = await readLogFile(f);
      total += ingestRawLines(text, f);
    }
    setEntries(getRecentEntries());
    setLoadedFile(matching[matching.length - 1]);
    log.info("logs", "open-date", { actor: "user", target: date, outputs: { files: matching.length, entries: total } });
  }, [files]);

  const onLoadFile = useCallback(async (path: string) => {
    setTail(false);
    clearRecentEntries();
    const text = await readLogFile(path);
    const ingested = ingestRawLines(text, path);
    setEntries(getRecentEntries());
    setLoadedFile(path);
    log.info("logs", "open-file", { actor: "user", target: path, outputs: { entries: ingested } });
  }, []);

  const onShare = useCallback(async () => {
    await flushNow();
    if (Platform.OS === "web") {
      Alert.alert("Sharing not supported on web");
      return;
    }
    const path = dailyFilePath();
    if (!path) {
      Alert.alert("Logs unavailable", "Filesystem not accessible.");
      return;
    }
    try {
      const filteredText = filtered.map((e) => JSON.stringify(e)).join("\n") + "\n";
      const exportPath = path.replace(/\.ndjson$/, `-export-${Date.now()}.ndjson`);
      await FileSystem.writeAsStringAsync(exportPath, filteredText);
      const can = await Sharing.isAvailableAsync();
      if (!can) {
        Alert.alert("Saved", `Wrote ${filtered.length} entries to:\n${exportPath}`);
        return;
      }
      await Sharing.shareAsync(exportPath, { mimeType: "application/x-ndjson" });
      log.info("logs", "share", { actor: "user", target: exportPath, outputs: { entries: filtered.length } });
    } catch (err) {
      Alert.alert("Share failed", err instanceof Error ? err.message : "Unknown error");
    }
  }, [filtered]);

  const onPickExternal = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/x-ndjson", "application/json", "text/plain", "*/*"],
      });
      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      const content = await FileSystem.readAsStringAsync(asset.uri);
      const n = ingestRawLines(content, asset.name ?? asset.uri);
      setTail(false);
      setEntries(getRecentEntries());
      setLoadedFile(asset.name ?? asset.uri);
      log.info("logs", "ingest-external", { actor: "user", target: asset.uri, outputs: { entries: n } });
    } catch (err) {
      Alert.alert("Open failed", err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const onClear = useCallback(() => {
    Alert.alert(
      "Delete all logs?",
      "This permanently removes every NDJSON file in the lexi-logs folder and clears the in-memory log buffer.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: async () => {
            await deleteAllLogs();
            clearRecentEntries();
            setEntries([]);
            setFiles([]);
            log.warn("logs", "clear-all", { actor: "user" });
          },
        },
      ],
    );
  }, []);

  const styles = makeStyles(colors);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Logs</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setTail((v) => !v)} style={[styles.btn, tail && styles.btnOn]}>
            <Feather name={tail ? "pause" : "play"} size={14} color={tail ? colors.background : colors.foreground} />
            <Text style={[styles.btnText, tail && { color: colors.background }]}>Tail</Text>
          </Pressable>
          <Pressable onPress={onShare} style={styles.btn}>
            <Feather name="share-2" size={14} color={colors.foreground} />
            <Text style={styles.btnText}>Share</Text>
          </Pressable>
          <Pressable onPress={onClear} style={[styles.btn, styles.btnDanger]}>
            <Feather name="trash-2" size={14} color={colors.destructiveForeground} />
            <Text style={[styles.btnText, { color: colors.destructiveForeground }]}>Clear</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {LEVELS.map((l) => (
            <Pressable key={l} onPress={() => setLevel(l)} style={[styles.chip, level === l && styles.chipOn]}>
              <Text style={[styles.chipText, level === l && { color: colors.background }]}>{l}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {ACTORS.map((a) => (
            <Pressable key={a} onPress={() => setActorFilter(a)} style={[styles.chip, actorFilter === a && styles.chipOn]}>
              <Text style={[styles.chipText, actorFilter === a && { color: colors.background }]}>{a}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {categories.map((c) => (
            <Pressable key={c} onPress={() => setCategoryFilter(c)} style={[styles.chip, categoryFilter === c && styles.chipOn]}>
              <Text style={[styles.chipText, categoryFilter === c && { color: colors.background }]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.filterRow}>
        <Text style={[styles.stat, { marginRight: 6 }]}>date:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {dates.map((d) => (
            <Pressable key={d} onPress={() => onPickDate(d)} style={[styles.chip, selectedDate === d && styles.chipOn]}>
              <Text style={[styles.chipText, selectedDate === d && { color: colors.background }]}>{d}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="Search action / category / target / payload"
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.filesRow}>
        <Pressable onPress={onPickExternal} style={styles.fileBtn}>
          <Feather name="folder" size={12} color={colors.foreground} />
          <Text style={styles.fileBtnText}>Open external NDJSON</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            const r = await ingestScanReports();
            setEntries(getRecentEntries());
            const where = scanInboxDir() ?? "scan-reports";
            Alert.alert(
              "Imported scan reports",
              r.total === 0
                ? `No NDJSON files found in:\n${where}\n\nDrop scanner output (security-reports/scan.ndjson, etc.) into this folder, then tap again.`
                : `Ingested ${r.total} entries from ${r.files.length} file(s).`,
            );
          }}
          style={styles.fileBtn}
        >
          <Feather name="shield" size={12} color={colors.foreground} />
          <Text style={styles.fileBtnText}>Import scans</Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {files.map((f) => {
            const name = f.split("/").pop() ?? f;
            const active = loadedFile === f;
            return (
              <Pressable key={f} onPress={() => onLoadFile(f)} style={[styles.fileBtn, active && styles.fileBtnOn]}>
                <Text style={[styles.fileBtnText, active && { color: colors.background }]}>{name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.statRow}>
        <Text style={styles.stat}>showing {filtered.length} / {entries.length}</Text>
        {loadedFile ? <Text style={styles.stat}>file: {loadedFile.split("/").pop()}</Text> : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item, i) => `${item.ts}-${i}`}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        initialNumToRender={50}
        maxToRenderPerBatch={50}
        windowSize={10}
        renderItem={({ item }) => <LogRow entry={item} />}
        ListEmptyComponent={<Text style={styles.empty}>No log entries match.</Text>}
      />
    </View>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const ts = new Date(entry.ts).toISOString().slice(11, 23);
  const color = levelColor(entry.level, colors);
  const styles = rowStyles(colors);
  return (
    <Pressable onPress={() => setOpen((v) => !v)} style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={[styles.level, { color }]}>{entry.level.toUpperCase().padEnd(5, " ")}</Text>
        <Text style={styles.ts}>{ts}</Text>
        <Text style={styles.actor}>{entry.actor}</Text>
        <Text style={styles.cat} numberOfLines={1}>
          {entry.category}/{entry.action}
        </Text>
      </View>
      {entry.target ? <Text style={styles.target} numberOfLines={open ? undefined : 1}>{entry.target}</Text> : null}
      {entry.status || entry.durationMs != null ? (
        <Text style={styles.meta}>
          {entry.status ?? ""} {entry.durationMs != null ? `· ${entry.durationMs}ms` : ""}
          {entry.correlationId ? ` · cid=${entry.correlationId}` : ""}
        </Text>
      ) : null}
      {open ? (
        <View style={styles.detail}>
          {entry.inputs !== undefined ? (
            <Text selectable style={styles.json}>inputs: {safeJson(entry.inputs)}</Text>
          ) : null}
          {entry.outputs !== undefined ? (
            <Text selectable style={styles.json}>outputs: {safeJson(entry.outputs)}</Text>
          ) : null}
          {entry.error ? (
            <Text selectable style={[styles.json, { color: colors.destructive }]}>
              error: {entry.error.message}
              {entry.error.stack ? `\n${entry.error.stack}` : ""}
            </Text>
          ) : null}
          {entry.caller ? <Text style={styles.json}>caller: {entry.caller}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function safeJson(v: unknown): string {
  try {
    const s = JSON.stringify(v, null, 2);
    return s.length > 4000 ? s.slice(0, 4000) + "…" : s;
  } catch {
    return String(v);
  }
}

function levelColor(l: LogLevel, c: ReturnType<typeof useColors>): string {
  switch (l) {
    case "error": return c.destructive;
    case "warn": return "#f5a524";
    case "info": return c.primary;
    case "debug": return c.mutedForeground;
    case "trace": return c.mutedForeground;
  }
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background, paddingHorizontal: 12 },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    title: { color: c.foreground, fontWeight: "700", fontSize: 20 },
    headerActions: { flexDirection: "row", gap: 6 },
    btn: {
      flexDirection: "row", alignItems: "center", gap: 4,
      borderWidth: 1, borderColor: c.border, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    },
    btnOn: { backgroundColor: c.primary, borderColor: c.primary },
    btnDanger: { borderColor: c.destructive, backgroundColor: c.destructive },
    btnText: { color: c.foreground, fontSize: 12, fontWeight: "600" },
    filterRow: { marginBottom: 6 },
    chip: {
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
      borderWidth: 1, borderColor: c.border, marginRight: 6,
    },
    chipOn: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { color: c.foreground, fontSize: 12 },
    search: {
      backgroundColor: c.card, color: c.foreground, borderColor: c.border, borderWidth: 1,
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8,
    },
    filesRow: { flexDirection: "row", alignItems: "center", marginBottom: 6, gap: 6 },
    fileBtn: {
      flexDirection: "row", alignItems: "center", gap: 4,
      borderWidth: 1, borderColor: c.border, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 4,
    },
    fileBtnOn: { backgroundColor: c.primary, borderColor: c.primary },
    fileBtnText: { color: c.foreground, fontSize: 11 },
    statRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
    stat: { color: c.mutedForeground, fontSize: 11 },
    empty: { color: c.mutedForeground, textAlign: "center", marginTop: 24 },
  });
}

function rowStyles(c: ReturnType<typeof useColors>) {
  const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });
  return StyleSheet.create({
    row: { borderBottomWidth: 1, borderBottomColor: c.border, paddingVertical: 6 },
    rowHead: { flexDirection: "row", alignItems: "center", gap: 6 },
    level: { fontWeight: "700", fontSize: 11, fontFamily: monoFont, width: 50 },
    ts: { color: c.mutedForeground, fontSize: 11, fontFamily: monoFont, width: 96 },
    actor: { color: c.accent, fontSize: 11, fontFamily: monoFont, width: 64 },
    cat: { color: c.foreground, fontSize: 12, flex: 1 },
    target: { color: c.mutedForeground, fontSize: 11, marginTop: 2, fontFamily: monoFont },
    meta: { color: c.mutedForeground, fontSize: 10, marginTop: 2 },
    detail: { marginTop: 6, padding: 8, backgroundColor: c.card, borderRadius: 6 },
    json: { color: c.foreground, fontSize: 11, fontFamily: monoFont, marginBottom: 4 },
  });
}
