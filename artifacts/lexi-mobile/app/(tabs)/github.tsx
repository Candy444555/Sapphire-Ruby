import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "";
const API = `https://${DOMAIN}/api`;

type GitHubUser = {
  login: string;
  name: string;
  avatar_url: string;
  public_repos: number;
  followers: number;
  following: number;
  bio: string;
};

type Repo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  stargazers_count: number;
  language: string | null;
  default_branch: string;
  updated_at: string;
  html_url: string;
};

type TreeItem = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

type Issue = {
  number: number;
  title: string;
  state: string;
  html_url: string;
  created_at: string;
};

type Branch = {
  name: string;
};

type Screen = "repos" | "repo_detail" | "tree" | "file" | "issues" | "push" | "new_repo";

async function apiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function langColor(lang: string | null): string {
  const map: Record<string, string> = {
    JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5",
    Go: "#00ADD8", Rust: "#dea584", Java: "#b07219", C: "#555555",
    "C++": "#f34b7d", Ruby: "#701516", Swift: "#F05138",
    Kotlin: "#A97BFF", HTML: "#e34c26", CSS: "#563d7c",
    Shell: "#89e051", PHP: "#4F5D95",
  };
  return map[lang ?? ""] ?? "#444";
}

export default function GitHubScreen() {
  const insets = useSafeAreaInsets();
  const webPad = Platform.OS === "web" ? 67 : 0;
  const topPad = Platform.OS === "web" ? webPad : insets.top + 10;

  const [user, setUser] = useState<GitHubUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState("");

  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposRefreshing, setReposRefreshing] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");

  const [screen, setScreen] = useState<Screen>("repos");
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);

  const [tree, setTree] = useState<TreeItem[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [branches, setBranches] = useState<Branch[]>([]);

  const [fileContent, setFileContent] = useState("");
  const [filePath, setFilePath] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);

  const [pushPath, setPushPath] = useState("");
  const [pushContent, setPushContent] = useState("");
  const [pushMessage, setPushMessage] = useState("");
  const [pushBranch, setPushBranch] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ url: string } | null>(null);
  const [pushError, setPushError] = useState("");

  const [issueTitle, setIssueTitle] = useState("");
  const [issueBody, setIssueBody] = useState("");
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [issueResult, setIssueResult] = useState<{ url: string; number: number } | null>(null);

  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showNewIssue, setShowNewIssue] = useState(false);

  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [newRepoResult, setNewRepoResult] = useState<{ full_name: string; url: string } | null>(null);
  const [newRepoError, setNewRepoError] = useState("");

  useEffect(() => {
    loadUser();
    loadRepos();
  }, []);

  async function loadUser() {
    setUserLoading(true);
    try {
      const data = await apiFetch("/github/user");
      setUser(data);
    } catch (e: any) {
      setUserError(e.message);
    } finally {
      setUserLoading(false);
    }
  }

  async function loadRepos(refreshing = false) {
    if (refreshing) setReposRefreshing(true);
    else setReposLoading(true);
    try {
      const data: Repo[] = await apiFetch("/github/repos");
      setRepos(data);
    } catch {}
    finally {
      setReposLoading(false);
      setReposRefreshing(false);
    }
  }

  async function openRepo(repo: Repo) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRepo(repo);
    setSelectedBranch(repo.default_branch || "main");
    setPushBranch(repo.default_branch || "main");
    setScreen("repo_detail");
    loadBranches(repo);
    loadTree(repo, repo.default_branch || "main");
  }

  async function loadBranches(repo: Repo) {
    try {
      const data: Branch[] = await apiFetch(`/github/repos/${repo.owner.login}/${repo.name}/branches`);
      setBranches(data);
    } catch {}
  }

  async function loadTree(repo: Repo, branch: string) {
    setTreeLoading(true);
    setTree([]);
    try {
      const data = await apiFetch(
        `/github/repos/${repo.owner.login}/${repo.name}/tree?branch=${branch}`
      );
      setTree((data.tree ?? []).filter((t: TreeItem) => t.type === "blob"));
    } catch {}
    finally { setTreeLoading(false); }
  }

  async function openFile(item: TreeItem) {
    if (!selectedRepo) return;
    setFilePath(item.path);
    setFileContent("");
    setFileLoading(true);
    setScreen("file");
    try {
      const data = await apiFetch(
        `/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/contents?path=${encodeURIComponent(item.path)}&ref=${selectedBranch}`
      );
      setFileContent(data.decoded_content ?? "");
    } catch (e: any) {
      setFileContent(`Error loading file: ${e.message}`);
    } finally {
      setFileLoading(false);
    }
  }

  async function loadIssues() {
    if (!selectedRepo) return;
    setIssuesLoading(true);
    try {
      const data: Issue[] = await apiFetch(
        `/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/issues`
      );
      setIssues(data);
    } catch {}
    finally { setIssuesLoading(false); }
  }

  async function doPush() {
    if (!selectedRepo || !pushPath || pushContent === "" || !pushMessage) return;
    setPushing(true);
    setPushError("");
    setPushResult(null);
    try {
      // Get SHA if file exists (for update)
      let sha: string | undefined;
      try {
        const existing = await apiFetch(
          `/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/contents?path=${encodeURIComponent(pushPath)}&ref=${pushBranch}`
        );
        sha = existing.sha;
      } catch {}

      const result = await apiFetch(
        `/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/push`,
        {
          method: "POST",
          body: JSON.stringify({
            path: pushPath,
            content: pushContent,
            message: pushMessage,
            branch: pushBranch,
            sha,
          }),
        }
      );
      setPushResult({ url: result.url });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setPushError(e.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setPushing(false);
    }
  }

  async function doCreateIssue() {
    if (!selectedRepo || !issueTitle) return;
    setCreatingIssue(true);
    try {
      const result = await apiFetch(
        `/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/issues`,
        {
          method: "POST",
          body: JSON.stringify({ title: issueTitle, body: issueBody }),
        }
      );
      setIssueResult({ url: result.url, number: result.number });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowNewIssue(false);
      setIssueTitle("");
      setIssueBody("");
      loadIssues();
    } catch {}
    finally { setCreatingIssue(false); }
  }

  async function doCreateRepo() {
    if (!newRepoName) return;
    setCreatingRepo(true);
    setNewRepoError("");
    setNewRepoResult(null);
    try {
      const result = await apiFetch("/github/repos", {
        method: "POST",
        body: JSON.stringify({
          name: newRepoName,
          description: newRepoDesc,
          private: newRepoPrivate,
          auto_init: true,
        }),
      });
      setNewRepoResult({ full_name: result.full_name, url: result.url });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      loadRepos();
    } catch (e: any) {
      setNewRepoError(e.message);
    } finally {
      setCreatingRepo(false);
    }
  }

  function goBack() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (screen === "file") { setScreen("repo_detail"); return; }
    if (screen === "issues" || screen === "push") { setScreen("repo_detail"); return; }
    if (screen === "new_repo") { setScreen("repos"); return; }
    setScreen("repos");
    setSelectedRepo(null);
  }

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(repoSearch.toLowerCase())
  );

  // ── RENDER ────────────────────────────────────────────────────────────────

  function renderHeader(title: string, showBack = false, rightSlot?: React.ReactNode) {
    return (
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerLeft}>
          {showBack && (
            <Pressable style={styles.iconBtn} onPress={goBack}>
              <Feather name="arrow-left" size={18} color="#00d4ff" />
            </Pressable>
          )}
          <View style={styles.logo}>
            <Feather name="github" size={20} color="#00d4ff" />
          </View>
          <Text style={styles.headerTitle}>{title}</Text>
        </View>
        <View style={styles.headerRight}>{rightSlot}</View>
      </View>
    );
  }

  // Repos list screen
  if (screen === "repos") {
    return (
      <View style={styles.root}>
        {renderHeader(
          "GitHub",
          false,
          <Pressable style={styles.iconBtn} onPress={() => { setNewRepoResult(null); setNewRepoError(""); setNewRepoName(""); setNewRepoDesc(""); setNewRepoPrivate(false); setScreen("new_repo"); }}>
            <Feather name="plus" size={18} color="#00d4ff" />
          </Pressable>
        )}

        {/* User banner */}
        {userLoading ? (
          <View style={styles.userBanner}>
            <ActivityIndicator size="small" color="#00d4ff" />
          </View>
        ) : userError ? (
          <View style={styles.userBanner}>
            <Text style={styles.errorText}>{userError}</Text>
          </View>
        ) : user ? (
          <View style={styles.userBanner}>
            <View style={styles.userAvatar}>
              <Feather name="user" size={18} color="#00d4ff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{user.name || user.login}</Text>
              <Text style={styles.userLogin}>@{user.login} · {user.public_repos} repos · {user.followers} followers</Text>
            </View>
            <View style={styles.connectedBadge}>
              <Feather name="check-circle" size={12} color="#00d4ff" />
              <Text style={styles.connectedText}>Connected</Text>
            </View>
          </View>
        ) : null}

        {/* Search */}
        <View style={styles.searchBar}>
          <Feather name="search" size={14} color="#444" />
          <TextInput
            style={styles.searchInput}
            value={repoSearch}
            onChangeText={setRepoSearch}
            placeholder="Search repositories…"
            placeholderTextColor="#333"
          />
          {repoSearch.length > 0 && (
            <Pressable onPress={() => setRepoSearch("")}>
              <Feather name="x" size={14} color="#444" />
            </Pressable>
          )}
        </View>

        {reposLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#00d4ff" />
            <Text style={styles.loadingText}>Loading repositories…</Text>
          </View>
        ) : (
          <FlatList
            data={filteredRepos}
            keyExtractor={(r) => String(r.id)}
            refreshControl={
              <RefreshControl
                refreshing={reposRefreshing}
                onRefresh={() => loadRepos(true)}
                tintColor="#00d4ff"
              />
            }
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Feather name="inbox" size={36} color="#222" />
                <Text style={styles.emptyText}>No repositories found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.repoCard} onPress={() => openRepo(item)}>
                <View style={styles.repoCardTop}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.repoNameRow}>
                      <Feather name={item.private ? "lock" : "book"} size={13} color="#444" />
                      <Text style={styles.repoName} numberOfLines={1}>{item.full_name}</Text>
                      {item.private && (
                        <View style={styles.privateBadge}>
                          <Text style={styles.privateBadgeText}>PRIVATE</Text>
                        </View>
                      )}
                    </View>
                    {item.description ? (
                      <Text style={styles.repoDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                  </View>
                  <Feather name="chevron-right" size={16} color="#333" />
                </View>
                <View style={styles.repoMeta}>
                  {item.language && (
                    <View style={styles.langRow}>
                      <View style={[styles.langDot, { backgroundColor: langColor(item.language) }]} />
                      <Text style={styles.langText}>{item.language}</Text>
                    </View>
                  )}
                  <View style={styles.metaItem}>
                    <Feather name="star" size={11} color="#444" />
                    <Text style={styles.metaText}>{item.stargazers_count}</Text>
                  </View>
                  <Text style={styles.metaText}>{timeAgo(item.updated_at)}</Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    );
  }

  // Create repo screen
  if (screen === "new_repo") {
    return (
      <View style={styles.root}>
        {renderHeader("New Repository", true)}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.formContainer}>
            <Text style={styles.formLabel}>Repository name</Text>
            <TextInput
              style={styles.formInput}
              value={newRepoName}
              onChangeText={setNewRepoName}
              placeholder="my-awesome-project"
              placeholderTextColor="#333"
              autoCapitalize="none"
            />

            <Text style={styles.formLabel}>Description (optional)</Text>
            <TextInput
              style={styles.formInput}
              value={newRepoDesc}
              onChangeText={setNewRepoDesc}
              placeholder="What is this project?"
              placeholderTextColor="#333"
            />

            <Pressable
              style={styles.toggleRow}
              onPress={() => setNewRepoPrivate((v) => !v)}
            >
              <View>
                <Text style={styles.formLabel}>Private repository</Text>
                <Text style={styles.formSub}>Only you can see this repo</Text>
              </View>
              <View style={[styles.toggle, newRepoPrivate && styles.toggleOn]}>
                <View style={[styles.toggleThumb, newRepoPrivate && styles.toggleThumbOn]} />
              </View>
            </Pressable>

            {newRepoError ? <Text style={styles.errorText}>{newRepoError}</Text> : null}

            {newRepoResult ? (
              <View style={styles.successBox}>
                <Feather name="check-circle" size={18} color="#00d4ff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successTitle}>Created {newRepoResult.full_name}</Text>
                  <Text style={styles.successSub}>{newRepoResult.url}</Text>
                </View>
              </View>
            ) : null}

            <Pressable
              style={[styles.primaryBtn, (!newRepoName || creatingRepo) && styles.btnDisabled]}
              onPress={doCreateRepo}
              disabled={!newRepoName || creatingRepo}
            >
              {creatingRepo
                ? <ActivityIndicator size="small" color="#000" />
                : <Text style={styles.primaryBtnText}>Create Repository</Text>
              }
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // Repo detail screen
  if (screen === "repo_detail" && selectedRepo) {
    const treeFiles = tree.slice(0, 80);
    return (
      <View style={styles.root}>
        {renderHeader(selectedRepo.name, true)}

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Repo info */}
          <View style={styles.repoDetailCard}>
            <Text style={styles.repoDetailName}>{selectedRepo.full_name}</Text>
            {selectedRepo.description ? (
              <Text style={styles.repoDetailDesc}>{selectedRepo.description}</Text>
            ) : null}
            <View style={styles.repoDetailMeta}>
              {selectedRepo.language && (
                <View style={styles.langRow}>
                  <View style={[styles.langDot, { backgroundColor: langColor(selectedRepo.language) }]} />
                  <Text style={styles.langText}>{selectedRepo.language}</Text>
                </View>
              )}
              <View style={styles.metaItem}>
                <Feather name="star" size={11} color="#444" />
                <Text style={styles.metaText}>{selectedRepo.stargazers_count}</Text>
              </View>
              <View style={styles.metaItem}>
                <Feather name={selectedRepo.private ? "lock" : "globe"} size={11} color="#444" />
                <Text style={styles.metaText}>{selectedRepo.private ? "Private" : "Public"}</Text>
              </View>
            </View>
          </View>

          {/* Branch selector */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Branch</Text>
            <Pressable style={styles.branchBtn} onPress={() => setShowBranchPicker(true)}>
              <Feather name="git-branch" size={13} color="#00d4ff" />
              <Text style={styles.branchBtnText}>{selectedBranch}</Text>
              <Feather name="chevron-down" size={13} color="#00d4ff" />
            </Pressable>
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <Pressable style={styles.actionBtn} onPress={() => { setPushPath(""); setPushContent(""); setPushMessage("Add file via Lexi"); setPushResult(null); setPushError(""); setScreen("push"); }}>
              <Feather name="upload" size={15} color="#00d4ff" />
              <Text style={styles.actionBtnText}>Push Code</Text>
            </Pressable>
            <Pressable style={styles.actionBtn} onPress={() => { setIssues([]); setIssueResult(null); loadIssues(); setScreen("issues"); }}>
              <Feather name="alert-circle" size={15} color="#00d4ff" />
              <Text style={styles.actionBtnText}>Issues</Text>
            </Pressable>
          </View>

          {/* File tree */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Files</Text>
            {treeLoading && <ActivityIndicator size="small" color="#00d4ff" />}
          </View>

          {treeFiles.length === 0 && !treeLoading ? (
            <Text style={styles.emptyText}>No files found</Text>
          ) : (
            treeFiles.map((item) => (
              <Pressable
                key={item.path}
                style={styles.fileRow}
                onPress={() => openFile(item)}
              >
                <Feather name="file-text" size={13} color="#444" />
                <Text style={styles.filePath} numberOfLines={1}>{item.path}</Text>
                {item.size !== undefined && (
                  <Text style={styles.fileSize}>{item.size < 1024 ? `${item.size}B` : `${(item.size / 1024).toFixed(1)}KB`}</Text>
                )}
              </Pressable>
            ))
          )}
          {tree.length > 80 && (
            <Text style={styles.emptyText}>+{tree.length - 80} more files…</Text>
          )}
        </ScrollView>

        {/* Branch picker modal */}
        <Modal visible={showBranchPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBranchPicker(false)}>
          <View style={[styles.modalRoot, { paddingTop: topPad }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Branch</Text>
              <Pressable onPress={() => setShowBranchPicker(false)} style={styles.iconBtn}>
                <Feather name="x" size={20} color="#666" />
              </Pressable>
            </View>
            <ScrollView>
              {branches.map((b) => (
                <Pressable
                  key={b.name}
                  style={[styles.branchRow, selectedBranch === b.name && styles.branchRowActive]}
                  onPress={() => {
                    setSelectedBranch(b.name);
                    setPushBranch(b.name);
                    setShowBranchPicker(false);
                    loadTree(selectedRepo, b.name);
                  }}
                >
                  <Feather name="git-branch" size={14} color={selectedBranch === b.name ? "#00d4ff" : "#444"} />
                  <Text style={[styles.branchRowText, selectedBranch === b.name && styles.branchRowTextActive]}>{b.name}</Text>
                  {selectedBranch === b.name && <Feather name="check" size={14} color="#00d4ff" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  // File viewer
  if (screen === "file") {
    return (
      <View style={styles.root}>
        {renderHeader(filePath.split("/").pop() ?? "File", true)}
        <View style={styles.fileBreadcrumb}>
          <Text style={styles.fileBreadcrumbText} numberOfLines={1}>{selectedRepo?.name}/{filePath}</Text>
        </View>
        {fileLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#00d4ff" />
          </View>
        ) : (
          <ScrollView horizontal>
            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={styles.fileContentText}>{fileContent}</Text>
            </ScrollView>
          </ScrollView>
        )}
      </View>
    );
  }

  // Issues screen
  if (screen === "issues" && selectedRepo) {
    return (
      <View style={styles.root}>
        {renderHeader("Issues", true,
          <Pressable style={styles.iconBtn} onPress={() => { setIssueTitle(""); setIssueBody(""); setShowNewIssue(true); }}>
            <Feather name="plus" size={18} color="#00d4ff" />
          </Pressable>
        )}

        {issueResult && (
          <View style={styles.successBox}>
            <Feather name="check-circle" size={16} color="#00d4ff" />
            <Text style={styles.successTitle}>Issue #{issueResult.number} created!</Text>
          </View>
        )}

        {issuesLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#00d4ff" />
          </View>
        ) : (
          <FlatList
            data={issues}
            keyExtractor={(i) => String(i.number)}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Feather name="check-circle" size={36} color="#222" />
                <Text style={styles.emptyText}>No open issues</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.issueCard}>
                <View style={styles.issueDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.issueTitle}>{item.title}</Text>
                  <Text style={styles.issueMeta}>#{item.number} · {timeAgo(item.created_at)}</Text>
                </View>
              </View>
            )}
          />
        )}

        {/* New Issue Modal */}
        <Modal visible={showNewIssue} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNewIssue(false)}>
          <View style={[styles.modalRoot, { paddingTop: topPad }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Issue</Text>
              <Pressable onPress={() => setShowNewIssue(false)} style={styles.iconBtn}>
                <Feather name="x" size={20} color="#666" />
              </Pressable>
            </View>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <ScrollView contentContainerStyle={styles.formContainer}>
                <Text style={styles.formLabel}>Title</Text>
                <TextInput
                  style={styles.formInput}
                  value={issueTitle}
                  onChangeText={setIssueTitle}
                  placeholder="Issue title…"
                  placeholderTextColor="#333"
                />
                <Text style={styles.formLabel}>Description</Text>
                <TextInput
                  style={[styles.formInput, styles.formTextarea]}
                  value={issueBody}
                  onChangeText={setIssueBody}
                  placeholder="Describe the issue…"
                  placeholderTextColor="#333"
                  multiline
                  numberOfLines={6}
                />
                <Pressable
                  style={[styles.primaryBtn, (!issueTitle || creatingIssue) && styles.btnDisabled]}
                  onPress={doCreateIssue}
                  disabled={!issueTitle || creatingIssue}
                >
                  {creatingIssue
                    ? <ActivityIndicator size="small" color="#000" />
                    : <Text style={styles.primaryBtnText}>Create Issue</Text>
                  }
                </Pressable>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </View>
    );
  }

  // Push code screen
  if (screen === "push" && selectedRepo) {
    return (
      <View style={styles.root}>
        {renderHeader("Push Code", true)}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.formContainer}>
            <Text style={styles.formLabel}>Target repository</Text>
            <View style={styles.infoRow}>
              <Feather name="book" size={13} color="#444" />
              <Text style={styles.infoText}>{selectedRepo.full_name}</Text>
            </View>

            <Text style={styles.formLabel}>Branch</Text>
            <Pressable style={styles.formInput} onPress={() => setShowBranchPicker(true)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="git-branch" size={13} color="#444" />
                <Text style={{ color: "#ccc", fontSize: 14 }}>{pushBranch}</Text>
              </View>
            </Pressable>

            <Text style={styles.formLabel}>File path</Text>
            <TextInput
              style={styles.formInput}
              value={pushPath}
              onChangeText={setPushPath}
              placeholder="src/index.ts"
              placeholderTextColor="#333"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.formLabel}>Commit message</Text>
            <TextInput
              style={styles.formInput}
              value={pushMessage}
              onChangeText={setPushMessage}
              placeholder="feat: add file via Lexi"
              placeholderTextColor="#333"
            />

            <Text style={styles.formLabel}>File content</Text>
            <TextInput
              style={[styles.formInput, styles.formTextarea]}
              value={pushContent}
              onChangeText={setPushContent}
              placeholder="Paste code here…"
              placeholderTextColor="#333"
              multiline
              numberOfLines={10}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {pushError ? <Text style={styles.errorText}>{pushError}</Text> : null}

            {pushResult ? (
              <View style={styles.successBox}>
                <Feather name="check-circle" size={18} color="#00d4ff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.successTitle}>Pushed successfully!</Text>
                  <Text style={styles.successSub}>{pushResult.url}</Text>
                </View>
              </View>
            ) : null}

            <Pressable
              style={[styles.primaryBtn, (!pushPath || !pushContent || !pushMessage || pushing) && styles.btnDisabled]}
              onPress={doPush}
              disabled={!pushPath || !pushContent || !pushMessage || pushing}
            >
              {pushing
                ? <ActivityIndicator size="small" color="#000" />
                : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Feather name="upload" size={16} color="#000" />
                    <Text style={styles.primaryBtnText}>Push to GitHub</Text>
                  </View>
                )
              }
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Branch picker */}
        <Modal visible={showBranchPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBranchPicker(false)}>
          <View style={[styles.modalRoot, { paddingTop: topPad }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Branch</Text>
              <Pressable onPress={() => setShowBranchPicker(false)} style={styles.iconBtn}>
                <Feather name="x" size={20} color="#666" />
              </Pressable>
            </View>
            <ScrollView>
              {branches.map((b) => (
                <Pressable
                  key={b.name}
                  style={[styles.branchRow, pushBranch === b.name && styles.branchRowActive]}
                  onPress={() => { setPushBranch(b.name); setShowBranchPicker(false); }}
                >
                  <Feather name="git-branch" size={14} color={pushBranch === b.name ? "#00d4ff" : "#444"} />
                  <Text style={[styles.branchRowText, pushBranch === b.name && styles.branchRowTextActive]}>{b.name}</Text>
                  {pushBranch === b.name && <Feather name="check" size={14} color="#00d4ff" />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#111",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: "#00d4ff18", borderWidth: 1, borderColor: "#00d4ff44",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: 1 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 8,
    backgroundColor: "#0a0a0a", borderWidth: 1, borderColor: "#1a1a1a",
    alignItems: "center", justifyContent: "center",
  },

  userBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#111",
    backgroundColor: "#050505",
  },
  userAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#00d4ff18", borderWidth: 1, borderColor: "#00d4ff33",
    alignItems: "center", justifyContent: "center",
  },
  userName: { color: "#fff", fontSize: 13, fontWeight: "700" },
  userLogin: { color: "#555", fontSize: 11, marginTop: 1 },
  connectedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#00d4ff10", borderWidth: 1, borderColor: "#00d4ff33",
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
  },
  connectedText: { color: "#00d4ff", fontSize: 10, fontWeight: "700" },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#111",
    backgroundColor: "#050505",
  },
  searchInput: { flex: 1, color: "#ccc", fontSize: 14 },

  listContent: { paddingVertical: 8, paddingHorizontal: 12 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 60 },
  loadingText: { color: "#444", fontSize: 13 },
  emptyText: { color: "#333", fontSize: 13, textAlign: "center" },

  repoCard: {
    backgroundColor: "#080808", borderWidth: 1, borderColor: "#161616",
    borderRadius: 10, padding: 14, marginBottom: 8,
  },
  repoCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  repoNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" },
  repoName: { color: "#00d4ff", fontSize: 14, fontWeight: "700", flex: 1 },
  repoDesc: { color: "#555", fontSize: 12, lineHeight: 16 },
  privateBadge: {
    backgroundColor: "#ff6b6b18", borderWidth: 1, borderColor: "#ff6b6b33",
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1,
  },
  privateBadgeText: { color: "#ff6b6b", fontSize: 9, fontWeight: "800" },
  repoMeta: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" },
  langRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  langDot: { width: 10, height: 10, borderRadius: 5 },
  langText: { color: "#555", fontSize: 11 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: "#444", fontSize: 11 },

  repoDetailCard: {
    padding: 16, borderBottomWidth: 1, borderBottomColor: "#111",
    backgroundColor: "#050505",
  },
  repoDetailName: { color: "#00d4ff", fontSize: 16, fontWeight: "800", marginBottom: 4 },
  repoDetailDesc: { color: "#555", fontSize: 13, marginBottom: 8 },
  repoDetailMeta: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },

  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#0d0d0d",
  },
  sectionTitle: { color: "#555", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },

  branchBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#00d4ff10", borderWidth: 1, borderColor: "#00d4ff33",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  branchBtnText: { color: "#00d4ff", fontSize: 12, fontWeight: "600" },

  actionRow: {
    flexDirection: "row", gap: 8, padding: 12,
    borderBottomWidth: 1, borderBottomColor: "#0d0d0d",
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#00d4ff10", borderWidth: 1, borderColor: "#00d4ff33",
    borderRadius: 8, paddingVertical: 10,
  },
  actionBtnText: { color: "#00d4ff", fontSize: 13, fontWeight: "600" },

  fileRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: "#0a0a0a",
  },
  filePath: { flex: 1, color: "#888", fontSize: 13 },
  fileSize: { color: "#333", fontSize: 11 },

  fileBreadcrumb: {
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: "#050505", borderBottomWidth: 1, borderBottomColor: "#111",
  },
  fileBreadcrumbText: { color: "#444", fontSize: 12 },
  fileContentText: { color: "#aaa", fontSize: 12, fontFamily: Platform.OS === "ios" ? "Courier New" : "monospace", lineHeight: 18 },

  issueCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "#080808", borderWidth: 1, borderColor: "#161616",
    borderRadius: 8, padding: 12, marginBottom: 8,
  },
  issueDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#3fb950", marginTop: 3 },
  issueTitle: { color: "#ccc", fontSize: 13, fontWeight: "500", marginBottom: 2 },
  issueMeta: { color: "#444", fontSize: 11 },

  formContainer: { padding: 16, gap: 4 },
  formLabel: { color: "#555", fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 12, marginBottom: 6 },
  formSub: { color: "#333", fontSize: 11, marginTop: 1 },
  formInput: {
    backgroundColor: "#080808", borderWidth: 1, borderColor: "#1a1a1a",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    color: "#ccc", fontSize: 14,
  },
  formTextarea: { height: 160, textAlignVertical: "top" },

  toggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 12,
  },
  toggle: {
    width: 44, height: 24, borderRadius: 12,
    backgroundColor: "#1a1a1a", justifyContent: "center", paddingHorizontal: 2,
  },
  toggleOn: { backgroundColor: "#00d4ff44" },
  toggleThumb: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: "#333",
  },
  toggleThumbOn: { alignSelf: "flex-end", backgroundColor: "#00d4ff" },

  infoRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#080808", borderWidth: 1, borderColor: "#1a1a1a",
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  infoText: { color: "#666", fontSize: 14 },

  primaryBtn: {
    backgroundColor: "#00d4ff", borderRadius: 10,
    paddingVertical: 14, alignItems: "center", justifyContent: "center",
    marginTop: 20,
  },
  btnDisabled: { opacity: 0.3 },
  primaryBtnText: { color: "#000", fontSize: 15, fontWeight: "800" },

  successBox: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#00d4ff10", borderWidth: 1, borderColor: "#00d4ff33",
    borderRadius: 10, padding: 14, marginTop: 12,
  },
  successTitle: { color: "#00d4ff", fontSize: 13, fontWeight: "700" },
  successSub: { color: "#00d4ff88", fontSize: 11, marginTop: 2 },

  errorText: { color: "#ff6b6b", fontSize: 12, marginTop: 8 },

  modalRoot: { flex: 1, backgroundColor: "#000" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: "#111",
  },
  modalTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },

  branchRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#0d0d0d",
  },
  branchRowActive: { backgroundColor: "#00d4ff08" },
  branchRowText: { flex: 1, color: "#666", fontSize: 14 },
  branchRowTextActive: { color: "#00d4ff", fontWeight: "600" },
});
