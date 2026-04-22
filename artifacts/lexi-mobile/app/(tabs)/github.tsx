import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { ghGet, ghPost } from "@/lib/lexi-api";

type Repo = { name: string; full_name: string; private: boolean; default_branch?: string; html_url: string; description?: string };
type Issue = { number: number; title: string; state: string; html_url: string; created_at: string };
type TreeItem = { path: string; type: string; size?: number };

type Screen = "auth" | "repos" | "repo" | "files" | "file" | "issues" | "push";

export default function GithubScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>("auth");
  const [token, setToken] = useState("");
  const [authed, setAuthed] = useState<{ user: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [activeRepo, setActiveRepo] = useState<Repo | null>(null);
  const [branch, setBranch] = useState("main");

  const [tree, setTree] = useState<TreeItem[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);

  const [pushPath, setPushPath] = useState("");
  const [pushContent, setPushContent] = useState("");
  const [pushMessage, setPushMessage] = useState("Update from Lexi mobile");
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ url?: string } | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const data = await ghGet("/me");
      if (data?.login) { setAuthed({ user: data.login }); setScreen("repos"); }
    } catch {}
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  const auth = useCallback(async () => {
    if (!token.trim()) return;
    setAuthLoading(true); setAuthError(null);
    try {
      await ghPost("/auth", { token: token.trim() });
      const me = await ghGet("/me");
      setAuthed({ user: me.login });
      setScreen("repos");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Auth failed");
    } finally { setAuthLoading(false); }
  }, [token]);

  const loadRepos = useCallback(async () => {
    setReposLoading(true);
    try {
      const data = await ghGet("/repos");
      setRepos(data.repos ?? data ?? []);
    } catch (e) { Alert.alert("Failed", e instanceof Error ? e.message : "Could not load repos"); }
    finally { setReposLoading(false); }
  }, []);

  useEffect(() => { if (screen === "repos" && authed) loadRepos(); }, [screen, authed, loadRepos]);

  const openRepo = (r: Repo) => {
    setActiveRepo(r);
    setBranch(r.default_branch ?? "main");
    setScreen("repo");
  };

  const loadFiles = useCallback(async () => {
    if (!activeRepo) return;
    setTreeLoading(true);
    try {
      const data = await ghGet(`/repos/${encodeURIComponent(activeRepo.full_name)}/tree?branch=${encodeURIComponent(branch)}`);
      setTree(data.tree ?? data ?? []);
    } catch (e) { Alert.alert("Failed", e instanceof Error ? e.message : "Could not load files"); }
    finally { setTreeLoading(false); }
  }, [activeRepo, branch]);

  const openFile = useCallback(async (item: TreeItem) => {
    if (!activeRepo) return;
    setFilePath(item.path); setFileContent(""); setFileLoading(true); setScreen("file");
    try {
      const data = await ghGet(`/repos/${encodeURIComponent(activeRepo.full_name)}/contents?branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(item.path)}`);
      setFileContent(data.content ?? data ?? "");
    } catch (e) { setFileContent(`[Error loading file: ${e instanceof Error ? e.message : "unknown"}]`); }
    finally { setFileLoading(false); }
  }, [activeRepo, branch]);

  const loadIssues = useCallback(async () => {
    if (!activeRepo) return;
    setIssuesLoading(true);
    try {
      const data = await ghGet(`/repos/${encodeURIComponent(activeRepo.full_name)}/issues`);
      setIssues((data.issues ?? data ?? []).filter((i: any) => !i.pull_request));
    } catch (e) { Alert.alert("Failed", e instanceof Error ? e.message : "Could not load issues"); }
    finally { setIssuesLoading(false); }
  }, [activeRepo]);

  const doPush = useCallback(async () => {
    if (!activeRepo || !pushPath) return;
    setPushing(true); setPushResult(null);
    try {
      const data = await ghPost(`/repos/${encodeURIComponent(activeRepo.full_name)}/push`, {
        branch, path: pushPath, content: pushContent, message: pushMessage,
      });
      setPushResult({ url: data.url ?? data.html_url });
    } catch (e) { Alert.alert("Push failed", e instanceof Error ? e.message : "Unknown"); }
    finally { setPushing(false); }
  }, [activeRepo, branch, pushPath, pushContent, pushMessage]);

  const headerBack = (target: Screen) => (
    <Pressable onPress={() => setScreen(target)} hitSlop={8} style={{ marginRight: 10 }}>
      <Feather name="arrow-left" size={20} color={colors.foreground} />
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        {screen !== "auth" && screen !== "repos" && headerBack(screen === "repo" ? "repos" : screen === "files" || screen === "issues" || screen === "push" ? "repo" : "files")}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>GITHUB</Text>
          {authed && <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 11 }}>@{authed.user}</Text>}
        </View>
        {screen === "repos" && <Pressable onPress={loadRepos} hitSlop={8}><Feather name="refresh-cw" size={18} color={colors.primary} /></Pressable>}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 12 }}>
        {screen === "auth" && (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 }}>
              Paste a GitHub Personal Access Token (classic) with <Text style={{ color: colors.foreground }}>repo</Text> scope.
            </Text>
            <TextInput
              value={token} onChangeText={setToken} placeholder="ghp_..."
              placeholderTextColor={colors.mutedForeground} secureTextEntry autoCapitalize="none"
              style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
            />
            {authError && <Text style={{ color: colors.destructive, fontSize: 12, fontFamily: "Inter_500Medium" }}>{authError}</Text>}
            <Pressable onPress={auth} disabled={authLoading} style={[styles.cta, { backgroundColor: colors.primary }]}>
              {authLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="log-in" size={18} color={colors.primaryForeground} />}
              <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 14 }}>Authenticate</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL("https://github.com/settings/tokens/new?scopes=repo")}>
              <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center", marginTop: 8 }}>Create token →</Text>
            </Pressable>
          </View>
        )}

        {screen === "repos" && (
          <View style={{ gap: 8 }}>
            {reposLoading && <ActivityIndicator color={colors.primary} />}
            {repos.map((r) => (
              <Pressable key={r.full_name} onPress={() => openRepo(r)} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="git-branch" size={16} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>{r.name}</Text>
                  <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11 }}>{r.full_name}{r.private ? " · private" : ""}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
              </Pressable>
            ))}
            {!reposLoading && repos.length === 0 && (
              <Text style={{ color: colors.mutedForeground, fontStyle: "italic" }}>No repos found.</Text>
            )}
          </View>
        )}

        {screen === "repo" && activeRepo && (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 16 }}>{activeRepo.full_name}</Text>
            {activeRepo.description && <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{activeRepo.description}</Text>}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 11, alignSelf: "center" }}>Branch:</Text>
              <TextInput value={branch} onChangeText={setBranch} style={[styles.inputSmall, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border, flex: 1 }]} />
            </View>
            <Pressable onPress={() => { setScreen("files"); loadFiles(); }} style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="folder" size={16} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Browse Files</Text>
            </Pressable>
            <Pressable onPress={() => { setScreen("issues"); loadIssues(); }} style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="alert-circle" size={16} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Issues</Text>
            </Pressable>
            <Pressable onPress={() => setScreen("push")} style={[styles.actionBtn, { borderColor: colors.accent, backgroundColor: colors.muted }]}>
              <Feather name="upload-cloud" size={16} color={colors.accent} />
              <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>Push File</Text>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(activeRepo.html_url)} style={[styles.actionBtn, { borderColor: colors.border, backgroundColor: "transparent" }]}>
              <Feather name="external-link" size={16} color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 13 }}>Open on GitHub</Text>
            </Pressable>
          </View>
        )}

        {screen === "files" && (
          <View style={{ gap: 6 }}>
            {treeLoading && <ActivityIndicator color={colors.primary} />}
            {tree.slice(0, 200).map((it) => (
              <Pressable key={it.path} onPress={() => openFile(it)} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name={it.type === "tree" ? "folder" : "file-text"} size={14} color={colors.mutedForeground} />
                <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 }}>{it.path}</Text>
                {it.size !== undefined && (
                  <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>
                    {it.size < 1024 ? `${it.size}B` : `${(it.size / 1024).toFixed(1)}KB`}
                  </Text>
                )}
              </Pressable>
            ))}
            {tree.length > 200 && <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: "center" }}>+{tree.length - 200} more files…</Text>}
            {!treeLoading && tree.length === 0 && <Text style={{ color: colors.mutedForeground, fontStyle: "italic" }}>No files found.</Text>}
          </View>
        )}

        {screen === "file" && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 13 }}>{filePath}</Text>
            <View style={[styles.codeBox, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              {fileLoading ? <ActivityIndicator color={colors.primary} /> : (
                <ScrollView horizontal>
                  <Text selectable style={{ color: colors.foreground, fontFamily: "Courier", fontSize: 11, lineHeight: 15 }}>
                    {fileContent || "(empty)"}
                  </Text>
                </ScrollView>
              )}
            </View>
          </View>
        )}

        {screen === "issues" && (
          <View style={{ gap: 8 }}>
            {issuesLoading && <ActivityIndicator color={colors.primary} />}
            {issues.map((i) => (
              <Pressable key={i.number} onPress={() => Linking.openURL(i.html_url)} style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Feather name="alert-circle" size={14} color={i.state === "open" ? "#3fb950" : colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>{i.title}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 10 }}>#{i.number} · {i.state}</Text>
                </View>
              </Pressable>
            ))}
            {!issuesLoading && issues.length === 0 && <Text style={{ color: colors.mutedForeground, fontStyle: "italic" }}>No open issues.</Text>}
          </View>
        )}

        {screen === "push" && (
          <View style={{ gap: 10 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5 }}>FILE PATH</Text>
            <TextInput value={pushPath} onChangeText={setPushPath} placeholder="src/file.ts" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5 }}>CONTENT</Text>
            <TextInput value={pushContent} onChangeText={setPushContent} multiline style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border, minHeight: 160, textAlignVertical: "top", fontFamily: "Courier" }]} />
            <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5 }}>COMMIT MESSAGE</Text>
            <TextInput value={pushMessage} onChangeText={setPushMessage} style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
            <Pressable onPress={doPush} disabled={pushing || !pushPath} style={[styles.cta, { backgroundColor: "#3fb950", opacity: !pushPath || pushing ? 0.5 : 1 }]}>
              {pushing ? <ActivityIndicator color="#0d1117" /> : <Feather name="upload-cloud" size={18} color="#0d1117" />}
              <Text style={{ color: "#0d1117", fontFamily: "Inter_700Bold", fontSize: 14 }}>Push</Text>
            </Pressable>
            {pushResult?.url && (
              <Pressable onPress={() => Linking.openURL(pushResult.url!)}>
                <Text style={{ color: colors.primary, textAlign: "center", fontFamily: "Inter_500Medium" }}>View on GitHub →</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, gap: 8 },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, letterSpacing: 1 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_500Medium", fontSize: 14 },
  inputSmall: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontFamily: "Inter_500Medium", fontSize: 12 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1 },
  codeBox: { borderRadius: 10, borderWidth: 1, padding: 10, minHeight: 240 },
});
