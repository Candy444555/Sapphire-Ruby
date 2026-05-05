import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Markdown } from "@/components/Markdown";
import { useColors } from "@/hooks/useColors";
import { streamLexi, type ChatMsg } from "@/lib/lexi-api";
import { log } from "@/lib/logger";
import {
  buildExplainPrompt, FIX_SYSTEM_PROMPT, REPRO_SYSTEM_PROMPT,
  type NormalizedFinding,
} from "@/lib/findings/contract";
import {
  listScanners, subscribeRegistry, type ScannerSpec,
} from "@/lib/scanners/registry";
import { runScan, type RunHandle, type ScanSource, type ToolEvent, GITHUB_URL_RE } from "@/lib/scanners/runner";
import { captureScreenAndOcr } from "@/lib/screen-capture";
import {
  approvePending, deleteInstalled, listInstalled, listPending,
  rejectPending, rehydrateInstalledIntoRegistry, subscribeForge,
  updatePending, updateInstalled, exportSpec,
  type ForgedToolSpec,
} from "@/lib/tool-forge/approval-queue";
import { forgeFromRequest } from "@/lib/tool-forge/chat-to-scanner";
import { startAnalyzer, loadAutosuggest } from "@/lib/tool-forge/analyzer";
import { loadScanSettings, getScanSettings, subscribeScanSettings } from "@/lib/scan-settings";
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";

type ToolStatus = { state: "idle" | "running" | "ok" | "issues" | "error" | "skipped"; durationMs?: number; findingCount?: number; reason?: string; error?: string; startedAt?: number };

type SourcePick =
  | { kind: "github"; url: string }
  | { kind: "upload"; files: { name: string; text?: string; contentBase64?: string }[] }
  | { kind: "zip"; name: string; contentBase64: string }
  | { kind: "workspace" }
  | { kind: "apk"; name: string; contentBase64: string }
  | { kind: "screen"; ocrText: string };

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [scanners, setScanners] = useState<ScannerSpec[]>(listScanners());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pick, setPick] = useState<SourcePick | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [statuses, setStatuses] = useState<Record<string, ToolStatus>>({});
  const [findings, setFindings] = useState<NormalizedFinding[]>([]);
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<ForgedToolSpec[]>([]);
  const [installed, setInstalled] = useState<ForgedToolSpec[]>([]);
  const [forgeOpen, setForgeOpen] = useState(false);
  const [forgeEditing, setForgeEditing] = useState<{ spec: ForgedToolSpec; bucket: "pending" | "installed" } | null>(null);
  const [screenCapEnabled, setScreenCapEnabled] = useState(true);
  const [defaultTimeoutMs, setDefaultTimeoutMs] = useState(600_000);
  const handleRef = useRef<RunHandle | null>(null);

  useEffect(() => {
    const u = subscribeRegistry(() => setScanners(listScanners()));
    void rehydrateInstalledIntoRegistry().then(() => setScanners(listScanners()));
    void loadAutosuggest().then(() => startAnalyzer());
    return u;
  }, []);
  useEffect(() => {
    const refresh = () => {
      void listPending().then(setPending);
      void listInstalled().then(setInstalled);
    };
    refresh();
    return subscribeForge(refresh);
  }, []);
  useEffect(() => {
    void loadScanSettings().then((s) => { setScreenCapEnabled(s.screenCaptureEnabled); setDefaultTimeoutMs(s.defaultTimeoutMs); });
    return subscribeScanSettings((s) => { setScreenCapEnabled(s.screenCaptureEnabled); setDefaultTimeoutMs(s.defaultTimeoutMs); });
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      log.info("scan", "tool:toggle", { actor: "user", target: id, outputs: { selected: !p.has(id) } });
      return n;
    });
  }, []);

  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (r.canceled) return;
    const files = await Promise.all(r.assets.map(async (a) => {
      const text = await FileSystem.readAsStringAsync(a.uri).catch(() => "");
      return { name: a.name, text };
    }));
    setPick({ kind: "upload", files });
    log.info("scan", "source:upload", { actor: "user", outputs: { count: files.length } });
  };
  const pickApk = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: "application/vnd.android.package-archive", copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const contentBase64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
    setPick({ kind: "apk", name: a.name, contentBase64 });
    log.info("scan", "source:apk", { actor: "user", target: a.name, outputs: { bytes: contentBase64.length } });
  };
  const pickGithub = () => {
    const url = githubUrl.trim();
    if (!url) { Alert.alert("Paste a GitHub URL"); return; }
    if (!GITHUB_URL_RE.test(url)) {
      Alert.alert("Invalid URL", "Use https://github.com/<owner>/<repo>");
      return;
    }
    setPick({ kind: "github", url });
    log.info("scan", "source:github", { actor: "user", target: url });
  };
  const pickZip = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    if (!/\.(zip)$/i.test(a.name)) { Alert.alert("Pick a .zip file"); return; }
    const contentBase64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
    setPick({ kind: "zip", name: a.name, contentBase64 });
    log.info("scan", "source:zip", { actor: "user", target: a.name, outputs: { bytes: contentBase64.length } });
  };
  const pickWorkspace = () => {
    setPick({ kind: "workspace" });
    log.info("scan", "source:workspace", { actor: "user" });
  };
  const pickScreen = async () => {
    try {
      const r = await captureScreenAndOcr();
      if (!r) return;
      setPick({ kind: "screen", ocrText: r.ocrText });
    } catch (err) {
      Alert.alert("Capture failed", err instanceof Error ? err.message : String(err));
    }
  };

  const start = () => {
    if (!pick) { Alert.alert("Pick a source first"); return; }
    if (selected.size === 0) { Alert.alert("Select at least one scanner"); return; }
    setRunning(true);
    setFindings([]);
    const initial: Record<string, ToolStatus> = {};
    for (const id of selected) initial[id] = { state: "idle" };
    setStatuses(initial);
    const source: ScanSource = pickToSource(pick);
    handleRef.current = runScan({
      tools: [...selected],
      source,
      timeoutMs: defaultTimeoutMs,
      onEvent: (e: ToolEvent) => {
        if (e.kind === "tool") {
          setStatuses((p) => ({
            ...p,
            [e.tool]: {
              state: e.status === "start" ? "running" : (e.status as ToolStatus["state"]),
              durationMs: e.durationMs ?? p[e.tool]?.durationMs,
              findingCount: e.findingCount ?? p[e.tool]?.findingCount,
              reason: e.reason, error: e.error,
              startedAt: e.status === "start" ? Date.now() : p[e.tool]?.startedAt,
            },
          }));
        } else if (e.kind === "finding") {
          setFindings((p) => [...p, e.finding]);
          setStatuses((p) => ({ ...p, [e.finding.tool]: { ...(p[e.finding.tool] ?? { state: "running" }), findingCount: ((p[e.finding.tool]?.findingCount ?? 0) + 1) } }));
        } else if (e.kind === "done") {
          setRunning(false);
        } else if (e.kind === "error") {
          Alert.alert("Scan error", e.message);
          setRunning(false);
        }
      },
    });
  };
  const cancel = () => { handleRef.current?.cancel(); setRunning(false); };

  const sourceLabel = useMemo(() => describeSource(pick), [pick]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, gap: 14 }}
    >
      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 20 }}>Scan</Text>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
        Pick a source. Toggle scanners. Tap Scan. Lexi never accepts pasted code — every source is a file, URL, or capture.
      </Text>

      {/* SOURCE PICKER */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.accent }]}>SOURCE</Text>
        <View style={styles.sourceGrid}>
          <SourceTile icon="file" label="Code file" onPress={pickFile} colors={colors} />
          <SourceTile icon="package" label="APK" onPress={pickApk} colors={colors} />
          <SourceTile icon="folder" label="ZIP/Folder" onPress={pickZip} colors={colors} />
          <SourceTile icon="cpu" label="Lexi's Replit" onPress={pickWorkspace} colors={colors} />
          {screenCapEnabled ? (
            <SourceTile icon="monitor" label="Screen capture" onPress={pickScreen} colors={colors} />
          ) : null}
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <TextInput
            value={githubUrl}
            onChangeText={setGithubUrl}
            placeholder="https://github.com/owner/repo"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.foreground, fontSize: 12 }}
          />
          <Pressable onPress={pickGithub} style={[styles.btn, { borderColor: colors.border }]}>
            <Feather name="github" size={14} color={colors.foreground} />
            <Text style={{ color: colors.foreground, fontSize: 12 }}>Use URL</Text>
          </Pressable>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Picked: {sourceLabel}</Text>
      </View>

      {/* SCANNER PICKER */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[styles.cardLabel, { color: colors.accent, flex: 1 }]}>SCANNERS ({selected.size}/{scanners.length})</Text>
          <Pressable onPress={() => setSelected(new Set(scanners.map((s) => s.id)))}>
            <Text style={{ color: colors.primary, fontSize: 11 }}>Select all</Text>
          </Pressable>
          <Text style={{ color: colors.mutedForeground }}> · </Text>
          <Pressable onPress={() => setSelected(new Set())}>
            <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Clear</Text>
          </Pressable>
        </View>
        <View style={styles.toolGrid}>
          {scanners.map((s) => {
            const on = selected.has(s.id);
            const st = statuses[s.id];
            return (
              <Pressable
                key={s.id}
                onPress={() => toggle(s.id)}
                style={[
                  styles.toolTile,
                  { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "22" : colors.background },
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name={iconFor(s)} size={12} color={on ? colors.primary : colors.mutedForeground} />
                  <Text style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{s.label}</Text>
                  {st && st.state !== "idle" ? (
                    <Text style={{ color: stateColor(st.state, colors), fontSize: 10 }}>{stateLabel(st)}</Text>
                  ) : null}
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 10 }} numberOfLines={2}>{s.description}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 9 }}>
                  {s.runsOn === "phone" ? "on-phone" : s.runsOn === "server" ? "server" : "phone/server"}{s.forged ? " · forged" : ""}
                </Text>
                {st?.state === "running" ? <ActivityIndicator size="small" color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* RUN BUTTON */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          disabled={running}
          onPress={start}
          style={[styles.runBtn, { backgroundColor: running ? colors.muted : colors.primary, opacity: running ? 0.6 : 1 }]}
        >
          {running ? <ActivityIndicator color={colors.background} /> : <Feather name="play" size={14} color={colors.background} />}
          <Text style={{ color: colors.background, fontFamily: "Inter_700Bold" }}>{running ? "Scanning…" : "Scan"}</Text>
        </Pressable>
        {running ? (
          <Pressable onPress={cancel} style={[styles.btn, { borderColor: colors.destructive }]}>
            <Feather name="x" size={14} color={colors.destructive} />
            <Text style={{ color: colors.destructive }}>Cancel all</Text>
          </Pressable>
        ) : null}
      </View>

      {/* FINDINGS */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardLabel, { color: colors.accent }]}>FINDINGS ({findings.length})</Text>
        {findings.length === 0 ? (
          <Text style={{ color: colors.mutedForeground, fontStyle: "italic", fontSize: 12 }}>No findings yet — pick a source, select tools, tap Scan.</Text>
        ) : findings.map((f) => <FindingCard key={f.uid} finding={f} colors={colors} />)}
      </View>

      {/* TOOL-FORGE */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={[styles.cardLabel, { color: colors.accent, flex: 1 }]}>TOOL-FORGE</Text>
          <Pressable onPress={() => setForgeOpen(true)} style={[styles.btn, { borderColor: colors.primary }]}>
            <Feather name="zap" size={12} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 11 }}>Forge Tool</Text>
          </Pressable>
        </View>
        <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
          Pending: {pending.length} · Installed (Forged Tools): {installed.length}
        </Text>
        {pending.map((p) => (
          <View key={p.slug} style={[styles.pendingRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{p.label}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{p.origin} · {p.language} · {p.targetFileTypes.join(",") || "*"}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10 }} numberOfLines={4}>{p.source.slice(0, 320)}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <Pressable onPress={() => approvePending(p.slug)} style={[styles.btn, { borderColor: "#238636" }]}>
                  <Text style={{ color: "#238636", fontSize: 11 }}>Approve</Text>
                </Pressable>
                <Pressable onPress={() => setForgeEditing({ spec: p, bucket: "pending" })} style={[styles.btn, { borderColor: colors.border }]}>
                  <Feather name="edit-2" size={11} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontSize: 11 }}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => exportForgedTool(p)} style={[styles.btn, { borderColor: colors.border }]}>
                  <Feather name="share" size={11} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontSize: 11 }}>Export</Text>
                </Pressable>
                <Pressable onPress={() => rejectPending(p.slug)} style={[styles.btn, { borderColor: colors.destructive }]}>
                  <Text style={{ color: colors.destructive, fontSize: 11 }}>Reject</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
        {installed.map((i) => (
          <View key={i.slug} style={[styles.pendingRow, { borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>{i.label}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{i.language} · {i.targetFileTypes.join(",") || "*"}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                <Pressable onPress={() => setForgeEditing({ spec: i, bucket: "installed" })} style={[styles.btn, { borderColor: colors.border }]}>
                  <Feather name="edit-2" size={11} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontSize: 11 }}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => exportForgedTool(i)} style={[styles.btn, { borderColor: colors.border }]}>
                  <Feather name="share" size={11} color={colors.foreground} />
                  <Text style={{ color: colors.foreground, fontSize: 11 }}>Export</Text>
                </Pressable>
                <Pressable onPress={() => deleteInstalled(i.slug)} style={[styles.btn, { borderColor: colors.destructive }]}>
                  <Feather name="trash-2" size={12} color={colors.destructive} />
                  <Text style={{ color: colors.destructive, fontSize: 11 }}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}
      </View>

      <ForgeModal open={forgeOpen} onClose={() => setForgeOpen(false)} colors={colors} />
      <ForgeModal
        open={!!forgeEditing}
        onClose={() => setForgeEditing(null)}
        colors={colors}
        editing={forgeEditing ?? undefined}
      />
    </ScrollView>
  );
}

function pickToSource(pick: SourcePick): ScanSource {
  if (pick.kind === "github") return { kind: "github", payload: { url: pick.url } };
  if (pick.kind === "upload") return { kind: "upload", payload: { files: pick.files } };
  if (pick.kind === "zip") return { kind: "zip", payload: { name: pick.name, contentBase64: pick.contentBase64 } };
  if (pick.kind === "workspace") return { kind: "workspace" };
  if (pick.kind === "apk") return { kind: "apk", payload: { name: pick.name, contentBase64: pick.contentBase64 } };
  return { kind: "screen", payload: { ocrText: pick.ocrText } };
}

function describeSource(pick: SourcePick | null): string {
  if (!pick) return "(none)";
  if (pick.kind === "github") return `GitHub: ${pick.url}`;
  if (pick.kind === "upload") return `${pick.files.length} file(s)`;
  if (pick.kind === "zip") return `ZIP: ${pick.name}`;
  if (pick.kind === "workspace") return "Lexi's Replit project";
  if (pick.kind === "apk") return `APK: ${pick.name}`;
  return `Screen capture (${pick.ocrText.length} chars)`;
}

function iconFor(s: ScannerSpec): React.ComponentProps<typeof Feather>["name"] {
  if (s.id === "ai-review") return "cpu";
  if (s.id === "regex-secrets") return "key";
  if (s.id.includes("apk") || s.id === "jadx") return "package";
  if (s.forged) return "zap";
  return "shield";
}

function stateColor(state: ToolStatus["state"], colors: ReturnType<typeof useColors>): string {
  if (state === "running") return colors.primary;
  if (state === "ok") return "#238636";
  if (state === "issues") return "#f5a524";
  if (state === "error") return colors.destructive;
  if (state === "skipped") return colors.mutedForeground;
  return colors.mutedForeground;
}
function stateLabel(st: ToolStatus): string {
  if (st.state === "running") return "running";
  if (st.state === "skipped") return st.reason ? `skip: ${st.reason}` : "skip";
  if (st.state === "error") return "err";
  return `${st.state}${st.findingCount != null ? ` ${st.findingCount}` : ""}${st.durationMs != null ? ` ${Math.round(st.durationMs / 100) / 10}s` : ""}`;
}

function SourceTile({ icon, label, onPress, colors }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <Pressable onPress={onPress} style={[styles.sourceTile, { borderColor: colors.border, backgroundColor: colors.background }]}>
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 11, fontFamily: "Inter_600SemiBold" }}>{label}</Text>
    </Pressable>
  );
}

function FindingCard({ finding, colors }: { finding: NormalizedFinding; colors: ReturnType<typeof useColors> }) {
  const [mode, setMode] = useState<null | "fix" | "reproduce">(null);
  const [answer, setAnswer] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ask = (m: "fix" | "reproduce") => {
    if (streaming) return;
    setMode(m); setAnswer(""); setErr(null); setStreaming(true);
    const sys = m === "fix" ? FIX_SYSTEM_PROMPT : REPRO_SYSTEM_PROMPT;
    const messages: ChatMsg[] = [{ role: "user", content: buildExplainPrompt(finding, m) }];
    const correlationId = `${finding.tool}:${finding.id}:${finding.uid}`;
    const target = finding.module || `${finding.tool}:${finding.id}`;
    log.info("scan", `finding:${m}`, { actor: "user", target, correlationId });
    let acc = "";
    streamLexi(messages, (t) => { acc += t; setAnswer((p) => p + t); }, { systemPrompt: sys })
      .then(() => {
        setStreaming(false);
        // Persist the full answer so the operator's audit trail keeps the
        // generated patch / repro alongside the original finding.
        log.info("scan", `finding:${m}:done`, {
          actor: "app", target, correlationId,
          outputs: { mode: m, answerChars: acc.length, answer: acc },
        });
      })
      .catch((e) => {
        const error = e instanceof Error ? e.message : String(e);
        setErr(error); setStreaming(false);
        log.error("scan", `finding:${m}:error`, { target, correlationId, error });
      });
  };

  const sevColor = finding.severity === "critical" || finding.severity === "high" ? colors.destructive
    : finding.severity === "medium" || finding.severity === "moderate" || finding.severity === "warn" || finding.severity === "warning" ? "#f5a524"
    : colors.mutedForeground;

  return (
    <View style={[styles.findingCard, { borderColor: colors.border }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ color: sevColor, fontFamily: "Inter_700Bold", fontSize: 10 }}>{finding.severity.toUpperCase()}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{finding.tool}:{finding.id}</Text>
      </View>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{finding.title}</Text>
      {finding.module ? <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>{finding.module}</Text> : null}
      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
        <Pressable onPress={() => ask("fix")} disabled={streaming}
          style={[styles.btn, { borderColor: mode === "fix" ? colors.primary : colors.border }]}>
          <Feather name="tool" size={12} color={colors.foreground} />
          <Text style={{ color: colors.foreground, fontSize: 11 }}>Fix</Text>
        </Pressable>
        <Pressable onPress={() => ask("reproduce")} disabled={streaming}
          style={[styles.btn, { borderColor: mode === "reproduce" ? colors.primary : colors.border }]}>
          <Feather name="play-circle" size={12} color={colors.foreground} />
          <Text style={{ color: colors.foreground, fontSize: 11 }}>Reproduce</Text>
        </Pressable>
      </View>
      {mode ? (
        <View style={{ marginTop: 6 }}>
          {answer ? <Markdown content={answer} /> : streaming ? <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>Streaming…</Text> : null}
          {err ? <Text style={{ color: colors.destructive, fontSize: 11 }}>Error: {err}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

async function exportForgedTool(spec: ForgedToolSpec) {
  const json = exportSpec(spec);
  try {
    await Share.share({ message: json, title: `${spec.slug}.json` });
  } catch {
    try { await Clipboard.setStringAsync(json); Alert.alert("Copied", "Forged tool spec copied to clipboard."); }
    catch { Alert.alert("Export failed"); }
  }
}

function ForgeModal({
  open, onClose, colors, editing,
}: {
  open: boolean; onClose: () => void; colors: ReturnType<typeof useColors>;
  editing?: { spec: ForgedToolSpec; bucket: "pending" | "installed" };
}) {
  const editMode = !!editing;
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [lang, setLang] = useState<"javascript" | "python" | "semgrep">("javascript");
  const [exts, setExts] = useState("js,ts");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      setName(editing.spec.label);
      setDesc(editing.spec.description);
      setLang(editing.spec.language);
      setExts(editing.spec.targetFileTypes.join(","));
      setPrompt(editing.spec.source);
    } else {
      setName(""); setDesc(""); setLang("javascript"); setExts("js,ts"); setPrompt("");
    }
  }, [editing]);

  const submit = async () => {
    if (!name.trim() || !prompt.trim()) { Alert.alert("Need a name and detection prompt"); return; }
    setBusy(true);
    try {
      if (editing) {
        const patch: Partial<ForgedToolSpec> = {
          label: name.trim(),
          description: desc.trim() || name.trim(),
          language: lang,
          targetFileTypes: exts.split(",").map((s) => s.trim()).filter(Boolean),
          source: prompt,
        };
        if (editing.bucket === "pending") await updatePending(editing.spec.slug, patch);
        else await updateInstalled(editing.spec.slug, patch);
        Alert.alert("Saved", "Forged tool updated.");
      } else {
        await forgeFromRequest({
          name: name.trim(),
          description: desc.trim() || name.trim(),
          language: lang,
          targetFileTypes: exts.split(",").map((s) => s.trim()).filter(Boolean),
          detectionPrompt: prompt.trim(),
          origin: "forge-button",
        });
        Alert.alert("Drafted", "New scanner is in the Pending list. Approve it to install.");
      }
      setName(""); setDesc(""); setPrompt("");
      onClose();
    } catch (err) {
      Alert.alert("Forge failed", err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 18 }}>{editMode ? "Edit forged scanner" : "Forge a new scanner"}</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Tool name (e.g. dangerous-eval)" placeholderTextColor={colors.mutedForeground}
          style={input(colors)} />
        <TextInput value={desc} onChangeText={setDesc} placeholder="Description" placeholderTextColor={colors.mutedForeground}
          style={input(colors)} />
        <View style={{ flexDirection: "row", gap: 6 }}>
          {(["javascript","python","semgrep"] as const).map((l) => (
            <Pressable key={l} onPress={() => setLang(l)} style={[styles.btn, { borderColor: lang === l ? colors.primary : colors.border }]}>
              <Text style={{ color: lang === l ? colors.primary : colors.foreground, fontSize: 11 }}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput value={exts} onChangeText={setExts} placeholder="File extensions (comma-separated, * for any)" placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none" style={input(colors)} />
        <TextInput value={prompt} onChangeText={setPrompt} placeholder="Detection logic — describe what counts as a finding" placeholderTextColor={colors.mutedForeground}
          multiline style={[input(colors), { minHeight: 120, textAlignVertical: "top" }]} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={submit} disabled={busy} style={[styles.runBtn, { backgroundColor: colors.primary }]}>
            {busy ? <ActivityIndicator color={colors.background} /> : <Feather name="zap" size={14} color={colors.background} />}
            <Text style={{ color: colors.background, fontFamily: "Inter_700Bold" }}>{editMode ? "Save" : "Draft"}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={[styles.btn, { borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground }}>Close</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Modal>
  );
}

const input = (colors: ReturnType<typeof useColors>) => ({
  borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.foreground, backgroundColor: colors.card, fontSize: 12,
});

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  cardLabel: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 1.5 },
  sourceGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sourceTile: { borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center", flexBasis: "30%", flexGrow: 1, gap: 4 },
  toolGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  toolTile: { borderWidth: 1, borderRadius: 10, padding: 8, gap: 4, flexBasis: "47%", flexGrow: 1 },
  runBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  btn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 4 },
  findingCard: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  pendingRow: { flexDirection: "row", gap: 6, alignItems: "center", borderWidth: 1, borderRadius: 8, padding: 8 },
});
