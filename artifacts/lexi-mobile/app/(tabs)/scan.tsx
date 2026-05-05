import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { BUILTIN_TOOLS, type NormalizedFinding, type ToolDef } from "@/lib/scanners/registry";
import { runScan, type RunSource, type ToolEvent } from "@/lib/scanners/runner";
import { streamExplain, type ExplainMode } from "@/lib/findings/contract";
import {
  approveForgedTool, forgeTool, getPendingForgedTools, hydrateForge,
  rejectForgedTool, suggestForgeTool, type ForgedTool,
} from "@/lib/tool-forge";

type SourceMode = "workspace" | "file" | "github";

type ToolStatus = {
  state: "idle" | "running" | "ok" | "error";
  count: number;
  durationMs: number;
  message?: string;
};

const CATEGORY_ORDER: ToolDef["category"][] = ["sast", "secrets", "deps", "mobile", "ai", "quality", "forged"];
const CATEGORY_LABEL: Record<ToolDef["category"], string> = {
  sast: "Static analysis",
  secrets: "Secrets",
  deps: "Dependencies",
  mobile: "Mobile / APK",
  ai: "AI review",
  quality: "Quality",
  forged: "Forged",
};

const SEV_COLORS: Record<NormalizedFinding["severity"], string> = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#059669",
};

export default function ScanScreen() {
  const colors = useColors();
  const [sourceMode, setSourceMode] = useState<SourceMode>("workspace");
  const [pickedFile, setPickedFile] = useState<{ name: string; uri: string; size?: number; mime?: string } | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["regex-secrets", "ai-review"]));
  const [running, setRunning] = useState(false);
  const [toolStatus, setToolStatus] = useState<Record<string, ToolStatus>>({});
  const [findings, setFindings] = useState<NormalizedFinding[]>([]);
  const [statusLine, setStatusLine] = useState<string>("");
  const [forgeOpen, setForgeOpen] = useState(false);
  const [pending, setPending] = useState<ForgedTool[]>([]);
  const [explainTarget, setExplainTarget] = useState<NormalizedFinding | null>(null);
  const [explainMode, setExplainMode] = useState<ExplainMode>("fix");
  const [explainText, setExplainText] = useState("");
  const [explainLoading, setExplainLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [registryVersion, setRegistryVersion] = useState(0);

  useEffect(() => {
    void hydrateForge().then(() => {
      setPending(getPendingForgedTools());
      setRegistryVersion((v) => v + 1);
    });
  }, []);

  const tools = useMemo(() => {
    const groups: Record<string, ToolDef[]> = {};
    for (const t of BUILTIN_TOOLS) {
      (groups[t.category] ??= []).push(t);
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registryVersion]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pickFile = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ["*/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (r.canceled) return;
    const a = r.assets[0];
    setPickedFile({ name: a.name, uri: a.uri, size: a.size ?? undefined, mime: a.mimeType ?? undefined });
  };

  const buildSource = async (): Promise<RunSource | { error: string }> => {
    if (sourceMode === "workspace") return { kind: "workspace" };
    if (sourceMode === "github") {
      if (!/^https?:\/\/.+\.git$|^https?:\/\/github\.com\/[^/]+\/[^/]+/.test(githubUrl.trim())) {
        return { error: "Enter a valid GitHub repository URL." };
      }
      return { kind: "github", repo: githubUrl.trim() };
    }
    if (!pickedFile) return { error: "Pick a file first." };
    // Read file text. APK / ZIP files are too large to read inline; for now,
    // text-only file uploads are sent as content; binaries should use the
    // workspace or apk-path sources (apk-path requires a server-resolvable path).
    if (/\.(apk|ipa|zip|aab)$/i.test(pickedFile.name)) {
      return { error: "APK/ZIP scanning over file upload is not supported yet — clone via GitHub URL or use 'Scan Lexi project'." };
    }
    let content = "";
    try {
      content = await FileSystem.readAsStringAsync(pickedFile.uri);
    } catch (err) {
      return { error: `Could not read file: ${err instanceof Error ? err.message : String(err)}` };
    }
    return { kind: "file", filename: pickedFile.name, content };
  };

  const onRun = async () => {
    if (selected.size === 0) {
      setStatusLine("Select at least one tool.");
      return;
    }
    const src = await buildSource();
    if ("error" in src) {
      setStatusLine(src.error);
      return;
    }
    setRunning(true);
    setFindings([]);
    setStatusLine("Starting…");
    const initial: Record<string, ToolStatus> = {};
    for (const id of selected) initial[id] = { state: "idle", count: 0, durationMs: 0 };
    setToolStatus(initial);

    const ac = new AbortController();
    abortRef.current = ac;
    try {
      await runScan({
        toolIds: Array.from(selected),
        source: src,
        signal: ac.signal,
        onEvent: (ev: ToolEvent) => {
          if (ev.type === "tool-start") {
            setToolStatus((s) => ({ ...s, [ev.tool]: { ...(s[ev.tool] ?? { count: 0, durationMs: 0 }), state: "running" } }));
          } else if (ev.type === "tool-end") {
            setToolStatus((s) => ({ ...s, [ev.tool]: {
              state: ev.status === "ok" ? "ok" : "error",
              count: ev.findingCount, durationMs: ev.durationMs, message: ev.message,
            }}));
          } else if (ev.type === "finding") {
            setFindings((f) => [...f, ev.finding]);
          } else if (ev.type === "status") {
            setStatusLine(`${ev.phase}${ev.message ? `: ${ev.message}` : ""}`);
          } else if (ev.type === "done") {
            setStatusLine(`Done — ${ev.totalFindings} finding(s) in ${(ev.durationMs / 1000).toFixed(1)}s`);
          } else if (ev.type === "error") {
            setStatusLine(`Error: ${ev.message}`);
          }
        },
      });
    } finally {
      setRunning(false);
      abortRef.current = null;
      // Auto-suggest forge candidate from accumulated findings.
      const suggestion = suggestForgeTool(findings);
      if (suggestion) {
        setStatusLine((s) => `${s}  •  Suggested forge: ${suggestion.name}`);
      }
    }
  };

  const onCancel = () => { abortRef.current?.abort(); };

  const openExplain = (f: NormalizedFinding, mode: ExplainMode) => {
    setExplainTarget(f);
    setExplainMode(mode);
    setExplainText("");
    setExplainLoading(true);
    void (async () => {
      try {
        for await (const chunk of streamExplain(f, mode)) {
          setExplainText((t) => t + chunk);
        }
      } finally {
        setExplainLoading(false);
      }
    })();
  };

  const styles = makeStyles(colors);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.h1}>Scan</Text>
          <Pressable onPress={() => setForgeOpen(true)} style={styles.forgeBtn}>
            <Feather name="zap" size={14} color="#fff" />
            <Text style={styles.forgeBtnText}>Forge tool</Text>
            {pending.length > 0 && (
              <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>{pending.length}</Text></View>
            )}
          </Pressable>
        </View>

        {/* Source picker */}
        <Text style={styles.sectionLabel}>Source</Text>
        <View style={styles.row}>
          {(["workspace", "file", "github"] as SourceMode[]).map((m) => (
            <Pressable key={m} onPress={() => setSourceMode(m)}
              style={[styles.chip, sourceMode === m && styles.chipActive]}>
              <Text style={[styles.chipText, sourceMode === m && styles.chipTextActive]}>
                {m === "workspace" ? "Lexi project" : m === "file" ? "Pick file" : "GitHub URL"}
              </Text>
            </Pressable>
          ))}
        </View>
        {sourceMode === "file" && (
          <View style={styles.sourceBox}>
            <Pressable onPress={pickFile} style={styles.smallBtn}>
              <Feather name="file" size={14} color={colors.primary} />
              <Text style={styles.smallBtnText}>Choose file</Text>
            </Pressable>
            {pickedFile && (
              <Text style={styles.muted} numberOfLines={1}>
                {pickedFile.name} {pickedFile.size ? `(${Math.round(pickedFile.size / 1024)} KB)` : ""}
              </Text>
            )}
            <Text style={styles.helpText}>
              Safety rule: no copy-paste input. APK/ZIP file scanning needs the GitHub URL or "Lexi project" source for now.
            </Text>
          </View>
        )}
        {sourceMode === "github" && (
          <View style={styles.sourceBox}>
            <TextInput
              value={githubUrl}
              onChangeText={setGithubUrl}
              placeholder="https://github.com/owner/repo"
              placeholderTextColor={colors.mutedForeground}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {/* Tool picker */}
        <Text style={styles.sectionLabel}>Tools</Text>
        {CATEGORY_ORDER.filter((c) => tools[c]?.length).map((cat) => (
          <View key={cat} style={styles.catBlock}>
            <Text style={styles.catLabel}>{CATEGORY_LABEL[cat]}</Text>
            <View style={styles.toolGrid}>
              {tools[cat].map((t) => {
                const on = selected.has(t.id);
                const st = toolStatus[t.id];
                return (
                  <Pressable key={t.id} onPress={() => toggle(t.id)}
                    style={[styles.toolCard, on && styles.toolCardActive]}>
                    <View style={styles.toolHeaderRow}>
                      <Text style={[styles.toolName, on && { color: colors.primary }]}>{t.label}</Text>
                      {st?.state === "running" && <ActivityIndicator size="small" color={colors.primary} />}
                      {st?.state === "ok" && <Text style={styles.statusOk}>{st.count}</Text>}
                      {st?.state === "error" && <Feather name="alert-triangle" size={14} color="#dc2626" />}
                    </View>
                    <Text style={styles.toolDesc} numberOfLines={2}>{t.description}</Text>
                    <Text style={styles.toolMeta}>
                      {t.runsOn === "phone" ? "on-phone" : t.runsOn === "either" ? "phone+server" : "server"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        {/* Run controls */}
        <View style={styles.runRow}>
          <Pressable onPress={running ? onCancel : onRun}
            style={[styles.runBtn, running && { backgroundColor: "#dc2626" }]}>
            <Feather name={running ? "x" : "play"} size={16} color="#fff" />
            <Text style={styles.runBtnText}>{running ? "Cancel" : `Run ${selected.size} tool(s)`}</Text>
          </Pressable>
          {!!statusLine && <Text style={styles.statusLine} numberOfLines={2}>{statusLine}</Text>}
        </View>

        {/* Findings */}
        <Text style={styles.sectionLabel}>Findings ({findings.length})</Text>
        {findings.length === 0 && (
          <Text style={styles.muted}>No findings yet. Run a scan to see results here.</Text>
        )}
        {findings.map((f, i) => (
          <View key={`${f.tool}-${i}`} style={styles.findingCard}>
            <View style={styles.findingHeader}>
              <View style={[styles.sevDot, { backgroundColor: SEV_COLORS[f.severity] }]} />
              <Text style={styles.sevText}>{f.severity.toUpperCase()}</Text>
              <Text style={styles.findingTool}>{f.tool}</Text>
            </View>
            <Text style={styles.findingSummary}>{f.summary}</Text>
            {(f.file || f.line) && (
              <Text style={styles.findingLoc} numberOfLines={1}>
                {f.file ?? "?"}{f.line ? `:${f.line}` : ""}{f.rule ? `  •  ${f.rule}` : ""}
              </Text>
            )}
            <View style={styles.actionRow}>
              <Pressable style={styles.actionBtn} onPress={() => openExplain(f, "fix")}>
                <Feather name="tool" size={12} color={colors.primary} />
                <Text style={styles.actionText}>Fix</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => openExplain(f, "reproduce")}>
                <Feather name="eye" size={12} color={colors.primary} />
                <Text style={styles.actionText}>Reproduce</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Forge modal */}
      <ForgeModal
        visible={forgeOpen}
        onClose={() => { setForgeOpen(false); setPending(getPendingForgedTools()); setRegistryVersion((v) => v + 1); }}
        pending={pending}
        onPendingChange={setPending}
        bumpRegistry={() => setRegistryVersion((v) => v + 1)}
      />

      {/* Explain modal */}
      <Modal visible={!!explainTarget} animationType="slide" onRequestClose={() => setExplainTarget(null)}>
        <SafeAreaView style={[styles.safe, { padding: 16 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.h2}>{explainMode === "fix" ? "Fix" : "Reproduce (description only)"}</Text>
            <Pressable onPress={() => setExplainTarget(null)}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
          </View>
          {explainTarget && (
            <Text style={styles.muted} numberOfLines={2}>{explainTarget.tool} • {explainTarget.summary}</Text>
          )}
          <ScrollView style={{ flex: 1, marginTop: 12 }}>
            <Text style={styles.explainText}>{explainText || (explainLoading ? "Generating…" : "")}</Text>
            {explainLoading && <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// =====================================================================

function ForgeModal(props: {
  visible: boolean;
  onClose: () => void;
  pending: ForgedTool[];
  onPendingChange: (p: ForgedTool[]) => void;
  bumpRegistry: () => void;
}) {
  const colors = useColors();
  const styles = makeStyles(colors);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [detection, setDetection] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    if (!name.trim() || !detection.trim()) {
      setMsg("Name and detection logic are required.");
      return;
    }
    setBusy(true); setMsg("");
    const r = await forgeTool({
      name: name.trim(), description: description.trim(), detectionLogic: detection.trim(), source: "button",
    });
    setBusy(false);
    if (r.ok) {
      setMsg(`Proposed "${r.tool.name}" — review below to approve.`);
      props.onPendingChange(getPendingForgedTools());
      setName(""); setDescription(""); setDetection("");
    } else {
      setMsg(`Forge failed: ${r.error}`);
    }
  };

  const approve = async (slug: string) => {
    if (await approveForgedTool(slug)) {
      props.onPendingChange(getPendingForgedTools());
      props.bumpRegistry();
      setMsg(`Approved ${slug} — now appears in tool list.`);
    }
  };
  const reject = async (slug: string) => {
    if (await rejectForgedTool(slug)) {
      props.onPendingChange(getPendingForgedTools());
      setMsg(`Rejected ${slug}.`);
    }
  };

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={[styles.safe, { padding: 16 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.h2}>Tool Forge</Text>
          <Pressable onPress={props.onClose}><Feather name="x" size={22} color={colors.foreground} /></Pressable>
        </View>
        <ScrollView>
          <Text style={styles.sectionLabel}>Author a new scanner</Text>
          <Text style={styles.helpText}>
            Lexi will write the scanner code via Featherless. Nothing runs until you approve it below.
          </Text>
          <TextInput value={name} onChangeText={setName} placeholder="Tool name (e.g. 'Hard-coded URL')"
            placeholderTextColor={colors.mutedForeground} style={styles.input} />
          <TextInput value={description} onChangeText={setDescription} placeholder="Short description"
            placeholderTextColor={colors.mutedForeground} style={styles.input} />
          <TextInput value={detection} onChangeText={setDetection}
            placeholder="Detection logic — what should this tool flag?"
            placeholderTextColor={colors.mutedForeground}
            multiline numberOfLines={4} style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]} />
          <Pressable disabled={busy} onPress={submit}
            style={[styles.runBtn, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Feather name="zap" size={14} color="#fff" />}
            <Text style={styles.runBtnText}>{busy ? "Authoring…" : "Author with Lexi"}</Text>
          </Pressable>
          {!!msg && <Text style={styles.muted}>{msg}</Text>}

          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Pending approval ({props.pending.length})</Text>
          {props.pending.length === 0 && <Text style={styles.muted}>No pending forged tools.</Text>}
          {props.pending.map((t) => <PendingForgedCard key={t.slug} tool={t} approve={approve} reject={reject} />)}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// =====================================================================

function PendingForgedCard(props: {
  tool: ForgedTool;
  approve: (slug: string) => Promise<void>;
  reject: (slug: string) => Promise<void>;
}) {
  const colors = useColors();
  const styles = makeStyles(colors);
  const { tool: t } = props;
  const [acknowledged, setAcknowledged] = useState(false);
  const codeLen = t.code.length;
  // No truncation — operator must scroll the full code before approval is enabled.
  return (
    <View style={styles.findingCard}>
      <Text style={styles.findingSummary}>{t.name}</Text>
      <Text style={styles.muted}>{t.description}</Text>
      <Text style={styles.toolMeta}>slug: {t.slug} • source: {t.source} • {codeLen} chars</Text>
      <View style={{ marginTop: 8, maxHeight: 240, borderWidth: 1, borderColor: colors.border, borderRadius: 6, padding: 8 }}>
        <ScrollView>
          <ScrollView horizontal>
            <Text style={[styles.explainText, { fontFamily: "Courier", fontSize: 11 }]}>{t.code}</Text>
          </ScrollView>
        </ScrollView>
      </View>
      <Pressable style={[styles.smallBtn, { marginTop: 8, borderColor: acknowledged ? "#10b981" : colors.primary }]}
        onPress={() => setAcknowledged((v) => !v)}>
        <Feather name={acknowledged ? "check-square" : "square"} size={14} color={acknowledged ? "#10b981" : colors.primary} />
        <Text style={[styles.smallBtnText, { color: acknowledged ? "#10b981" : colors.primary }]}>
          I have read the full code ({codeLen} chars)
        </Text>
      </Pressable>
      <View style={styles.actionRow}>
        <Pressable
          disabled={!acknowledged}
          style={[styles.actionBtn, { backgroundColor: acknowledged ? "#10b98122" : "#94a3b822", opacity: acknowledged ? 1 : 0.5 }]}
          onPress={() => props.approve(t.slug)}>
          <Feather name="check" size={12} color={acknowledged ? "#10b981" : "#94a3b8"} />
          <Text style={[styles.actionText, { color: acknowledged ? "#10b981" : "#94a3b8" }]}>Approve</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { backgroundColor: "#dc262622" }]} onPress={() => props.reject(t.slug)}>
          <Feather name="trash-2" size={12} color="#dc2626" />
          <Text style={[styles.actionText, { color: "#dc2626" }]}>Reject</Text>
        </Pressable>
      </View>
    </View>
  );
}

// =====================================================================

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    container: { padding: 16, paddingBottom: 80 },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    h1: { fontSize: 24, fontWeight: "700", color: colors.foreground },
    h2: { fontSize: 18, fontWeight: "600", color: colors.foreground },
    forgeBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    forgeBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
    pendingBadge: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 6, marginLeft: 4 },
    pendingBadgeText: { color: colors.primary, fontWeight: "700", fontSize: 11 },
    sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.mutedForeground, marginTop: 16, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.muted, borderRadius: 16 },
    chipActive: { backgroundColor: colors.primary },
    chipText: { color: colors.foreground, fontSize: 13 },
    chipTextActive: { color: "#fff", fontWeight: "600" },
    sourceBox: { marginTop: 8, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, gap: 8 },
    smallBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.primary, borderRadius: 8 },
    smallBtnText: { color: colors.primary, fontWeight: "600", fontSize: 13 },
    input: { backgroundColor: colors.muted, color: colors.foreground, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
    helpText: { color: colors.mutedForeground, fontSize: 11, fontStyle: "italic" },
    catBlock: { marginBottom: 8 },
    catLabel: { fontSize: 11, fontWeight: "600", color: colors.mutedForeground, marginTop: 8, marginBottom: 6 },
    toolGrid: { gap: 8 },
    toolCard: { padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.background },
    toolCardActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}11` },
    toolHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    toolName: { fontSize: 14, fontWeight: "600", color: colors.foreground, flex: 1 },
    toolDesc: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
    toolMeta: { fontSize: 10, color: colors.mutedForeground, marginTop: 4, fontStyle: "italic" },
    statusOk: { color: "#10b981", fontWeight: "700", fontSize: 12 },
    runRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
    runBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
    runBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    statusLine: { color: colors.mutedForeground, fontSize: 12, flex: 1 },
    muted: { color: colors.mutedForeground, fontSize: 13 },
    findingCard: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8, marginBottom: 8 },
    findingHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
    sevDot: { width: 8, height: 8, borderRadius: 4 },
    sevText: { fontSize: 10, fontWeight: "700", color: colors.foreground },
    findingTool: { fontSize: 11, color: colors.mutedForeground, marginLeft: "auto" },
    findingSummary: { fontSize: 14, color: colors.foreground, marginBottom: 4 },
    findingLoc: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Courier" },
    actionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
    actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: `${colors.primary}11` },
    actionText: { color: colors.primary, fontSize: 12, fontWeight: "600" },
    modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    explainText: { color: colors.foreground, fontSize: 13, lineHeight: 20 },
  });
}
