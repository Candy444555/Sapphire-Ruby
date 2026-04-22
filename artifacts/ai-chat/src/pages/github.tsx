import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { 
  Github, 
  ArrowLeft, 
  Search, 
  Plus, 
  Star, 
  Lock, 
  Book, 
  ChevronRight, 
  GitBranch, 
  Upload, 
  AlertCircle, 
  FileText, 
  Loader2, 
  X, 
  CheckCircle, 
  ExternalLink,
  ChevronDown,
  User as UserIcon,
  Globe
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  const res = await fetch(`${BASE}/api${path}`, {
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
    Go: "#00ADD8", Rust: "#dea584", Java: "#b07219", C: "#9DA2A6",
    "C++": "#f34b7d", Ruby: "#F73E3E", Swift: "#F05138",
    Kotlin: "#F26207", HTML: "#e34c26", CSS: "#563d7c",
    Shell: "#89e051", PHP: "#4F5D95",
  };
  return map[lang ?? ""] ?? "#9DA2A6";
}

export default function GitHubPage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState("");

  const [repos, setRepos] = useState<Repo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
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

  async function loadRepos() {
    setReposLoading(true);
    try {
      const data: Repo[] = await apiFetch("/github/repos");
      setRepos(data);
    } catch {}
    finally {
      setReposLoading(false);
    }
  }

  async function openRepo(repo: Repo) {
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
    } catch (e: any) {
      setPushError(e.message);
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
      loadRepos();
    } catch (e: any) {
      setNewRepoError(e.message);
    } finally {
      setCreatingRepo(false);
    }
  }

  function goBack() {
    if (screen === "file") { setScreen("repo_detail"); return; }
    if (screen === "issues" || screen === "push") { setScreen("repo_detail"); return; }
    if (screen === "new_repo") { setScreen("repos"); return; }
    if (screen === "repo_detail") { setScreen("repos"); setSelectedRepo(null); return; }
    navigate("/");
  }

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description ?? "").toLowerCase().includes(repoSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-mono flex flex-col">
      {/* Header */}
      <div className="border-b border-[#30363d] bg-[#161b22] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-[#8b949e] hover:text-[#e6edf3] transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="w-px h-4 bg-[#30363d]" />
        <Github className="w-4 h-4 text-[#58a6ff]" />
        <span className="text-[#e6edf3] font-bold text-sm">
          {screen === "repos" ? "GitHub" : 
           screen === "new_repo" ? "New Repository" :
           selectedRepo?.name}
        </span>
        {screen === "repos" && (
          <button 
            onClick={() => { setNewRepoResult(null); setNewRepoError(""); setNewRepoName(""); setNewRepoDesc(""); setNewRepoPrivate(false); setScreen("new_repo"); }}
            className="ml-auto text-[#3fb950] hover:text-[#3fb950]/80"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {screen === "repos" && (
            <div className="space-y-6">
              {/* User Banner */}
              {userLoading ? (
                <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-[#58a6ff]" /></div>
              ) : userError ? (
                <div className="text-[#f85149] p-4 bg-[#3d1a1a] rounded-lg border border-[#f85149]/30">{userError}</div>
              ) : user ? (
                <div className="flex items-center gap-4 p-4 bg-[#161b22] border border-[#30363d] rounded-lg">
                  <img src={user.avatar_url} className="w-12 h-12 rounded-full border border-[#30363d]" alt={user.login} />
                  <div className="flex-1">
                    <div className="font-bold text-[#e6edf3]">{user.name || user.login}</div>
                    <div className="text-xs text-[#8b949e]">@{user.login} · {user.public_repos} repos · {user.followers} followers</div>
                  </div>
                  <div className="flex items-center gap-1 text-[#3fb950] text-xs font-bold border border-[#3fb950]/30 px-2 py-1 rounded bg-[#3fb950]/10">
                    <CheckCircle className="w-3 h-3" /> Connected
                  </div>
                </div>
              ) : null}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
                <input
                  type="text"
                  value={repoSearch}
                  onChange={e => setRepoSearch(e.target.value)}
                  placeholder="Search repositories..."
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-lg pl-10 pr-4 py-2 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-sm"
                />
              </div>

              {/* Repo List */}
              {reposLoading ? (
                <div className="flex flex-col items-center py-12 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#58a6ff]" />
                  <p className="text-[#8b949e] text-sm">Loading repositories...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRepos.length === 0 ? (
                    <div className="text-center py-12 text-[#8b949e]">No repositories found</div>
                  ) : (
                    filteredRepos.map(repo => (
                      <button
                        key={repo.id}
                        onClick={() => openRepo(repo)}
                        className="w-full text-left p-4 bg-[#161b22] border border-[#30363d] rounded-lg hover:border-[#58a6ff]/40 transition-colors group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {repo.private ? <Lock className="w-3.5 h-3.5 text-[#8b949e]" /> : <Book className="w-3.5 h-3.5 text-[#8b949e]" />}
                              <span className="font-bold text-[#58a6ff] truncate">{repo.full_name}</span>
                              {repo.private && <span className="text-[10px] bg-[#30363d] text-[#8b949e] px-1.5 py-0.5 rounded border border-[#30363d]">PRIVATE</span>}
                            </div>
                            {repo.description && <p className="text-xs text-[#8b949e] line-clamp-2 mb-3">{repo.description}</p>}
                            <div className="flex items-center gap-4 text-[10px] text-[#8b949e]">
                              {repo.language && (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: langColor(repo.language) }} />
                                  {repo.language}
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Star className="w-3 h-3" />
                                {repo.stargazers_count}
                              </div>
                              <div>{timeAgo(repo.updated_at)}</div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#30363d] group-hover:text-[#8b949e]" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {screen === "new_repo" && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#8b949e] mb-1.5 uppercase">Repository Name</label>
                  <input
                    type="text"
                    value={newRepoName}
                    onChange={e => setNewRepoName(e.target.value)}
                    placeholder="my-awesome-project"
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#8b949e] mb-1.5 uppercase">Description (optional)</label>
                  <input
                    type="text"
                    value={newRepoDesc}
                    onChange={e => setNewRepoDesc(e.target.value)}
                    placeholder="What is this project?"
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-sm"
                  />
                </div>
                <button 
                  onClick={() => setNewRepoPrivate(!newRepoPrivate)}
                  className="flex items-center justify-between w-full p-4 bg-[#161b22] border border-[#30363d] rounded-lg text-left"
                >
                  <div>
                    <div className="text-sm font-bold text-[#e6edf3]">Private repository</div>
                    <div className="text-xs text-[#8b949e]">Only you can see this repo</div>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${newRepoPrivate ? "bg-[#3fb950]" : "bg-[#30363d]"}`}>
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${newRepoPrivate ? "left-6" : "left-1"}`} />
                  </div>
                </button>
              </div>

              {newRepoError && <div className="text-[#f85149] text-xs p-3 bg-[#3d1a1a] rounded border border-[#f85149]/30">{newRepoError}</div>}
              {newRepoResult && (
                <div className="p-4 bg-[#0d2d1a] border border-[#3fb950]/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-[#3fb950] font-bold text-sm">
                    <CheckCircle className="w-4 h-4" /> Created {newRepoResult.full_name}
                  </div>
                  <a href={newRepoResult.url} target="_blank" rel="noreferrer" className="text-xs text-[#58a6ff] hover:underline flex items-center gap-1">
                    {newRepoResult.url} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <button
                disabled={!newRepoName || creatingRepo}
                onClick={doCreateRepo}
                className="w-full py-3 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors text-sm flex justify-center items-center gap-2"
              >
                {creatingRepo && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Repository
              </button>
            </div>
          )}

          {screen === "repo_detail" && selectedRepo && (
            <div className="space-y-6">
              <div className="p-4 bg-[#161b22] border border-[#30363d] rounded-lg space-y-3">
                <div className="text-lg font-bold text-[#e6edf3]">{selectedRepo.full_name}</div>
                {selectedRepo.description && <p className="text-sm text-[#8b949e]">{selectedRepo.description}</p>}
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#8b949e]">
                  {selectedRepo.language && (
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: langColor(selectedRepo.language) }} />
                      {selectedRepo.language}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" />
                    {selectedRepo.stargazers_count}
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedRepo.private ? <Lock className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                    {selectedRepo.private ? "Private" : "Public"}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Branch</label>
                <div className="relative">
                  <button 
                    onClick={() => setShowBranchPicker(!showBranchPicker)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-[#161b22] border border-[#30363d] rounded text-sm text-[#e6edf3] hover:border-[#58a6ff]/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-[#58a6ff]" />
                      {selectedBranch}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-[#8b949e] transition-transform ${showBranchPicker ? "rotate-180" : ""}`} />
                  </button>
                  {showBranchPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto py-1">
                      {branches.map(b => (
                        <button
                          key={b.name}
                          onClick={() => { setSelectedBranch(b.name); loadTree(selectedRepo, b.name); setShowBranchPicker(false); }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-[#1c2128] transition-colors ${selectedBranch === b.name ? "text-[#58a6ff] bg-[#1c2128]" : "text-[#e6edf3]"}`}
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { setPushPath(""); setPushContent(""); setPushMessage("Add file via Lexi"); setPushResult(null); setPushError(""); setScreen("push"); setPushBranch(selectedBranch); }}
                  className="flex items-center justify-center gap-2 py-3 bg-[#21262d] border border-[#30363d] rounded-lg text-sm font-bold text-[#58a6ff] hover:bg-[#30363d] transition-colors"
                >
                  <Upload className="w-4 h-4" /> Push Code
                </button>
                <button 
                  onClick={() => { setIssues([]); setIssueResult(null); loadIssues(); setScreen("issues"); }}
                  className="flex items-center justify-center gap-2 py-3 bg-[#21262d] border border-[#30363d] rounded-lg text-sm font-bold text-[#d29922] hover:bg-[#30363d] transition-colors"
                >
                  <AlertCircle className="w-4 h-4" /> Issues
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Files</span>
                  {treeLoading && <Loader2 className="w-3 h-3 animate-spin text-[#58a6ff]" />}
                </div>
                <div className="bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden divide-y divide-[#30363d]">
                  {tree.length === 0 && !treeLoading ? (
                    <div className="p-8 text-center text-xs text-[#8b949e]">No files found</div>
                  ) : (
                    tree.slice(0, 100).map(item => (
                      <button
                        key={item.path}
                        onClick={() => openFile(item)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#161b22] transition-colors group"
                      >
                        <FileText className="w-4 h-4 text-[#8b949e] group-hover:text-[#58a6ff]" />
                        <span className="flex-1 text-xs text-[#e6edf3] truncate">{item.path}</span>
                        {item.size !== undefined && (
                          <span className="text-[10px] text-[#8b949e]">
                            {item.size < 1024 ? `${item.size}B` : `${(item.size / 1024).toFixed(1)}KB`}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                  {tree.length > 100 && (
                    <div className="p-2 text-center text-[10px] text-[#8b949e]">+{tree.length - 100} more files…</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {screen === "file" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-[#58a6ff] truncate mr-2">{filePath}</span>
                <span className="text-[10px] text-[#8b949e] uppercase shrink-0">{selectedBranch}</span>
              </div>
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 overflow-x-auto min-h-[300px]">
                {fileLoading ? (
                  <div className="flex justify-center items-center h-full"><Loader2 className="w-6 h-6 animate-spin text-[#58a6ff]" /></div>
                ) : (
                  <pre className="text-[11px] leading-relaxed text-[#e6edf3] font-mono whitespace-pre">
                    {fileContent || <span className="text-[#8b949e] italic">File is empty</span>}
                  </pre>
                )}
              </div>
            </div>
          )}

          {screen === "push" && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#8b949e] mb-1.5 uppercase">File Path</label>
                  <input
                    type="text"
                    value={pushPath}
                    onChange={e => setPushPath(e.target.value)}
                    placeholder="src/components/button.tsx"
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#8b949e] mb-1.5 uppercase">Content</label>
                  <textarea
                    value={pushContent}
                    onChange={e => setPushContent(e.target.value)}
                    rows={8}
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-[11px] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#8b949e] mb-1.5 uppercase">Commit Message</label>
                  <input
                    type="text"
                    value={pushMessage}
                    onChange={e => setPushMessage(e.target.value)}
                    className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-sm"
                  />
                </div>
              </div>

              {pushError && <div className="text-[#f85149] text-xs p-3 bg-[#3d1a1a] rounded border border-[#f85149]/30">{pushError}</div>}
              {pushResult && (
                <div className="p-4 bg-[#0d2d1a] border border-[#3fb950]/30 rounded-lg space-y-2">
                  <div className="flex items-center gap-2 text-[#3fb950] font-bold text-sm">
                    <CheckCircle className="w-4 h-4" /> Push Successful
                  </div>
                  <a href={pushResult.url} target="_blank" rel="noreferrer" className="text-xs text-[#58a6ff] hover:underline flex items-center gap-1">
                    View on GitHub <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <button
                disabled={!pushPath || pushing}
                onClick={doPush}
                className="w-full py-3 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors text-sm flex justify-center items-center gap-2"
              >
                {pushing && <Loader2 className="w-4 h-4 animate-spin" />}
                Push to {pushBranch}
              </button>
            </div>
          )}

          {screen === "issues" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Recent Issues</span>
                <button 
                  onClick={() => setShowNewIssue(true)}
                  className="text-xs font-bold text-[#3fb950] hover:underline"
                >
                  + New Issue
                </button>
              </div>

              {issuesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#58a6ff]" /></div>
              ) : (
                <div className="space-y-3">
                  {issues.length === 0 ? (
                    <div className="text-center py-12 text-[#8b949e]">No issues found</div>
                  ) : (
                    issues.map(issue => (
                      <a
                        key={issue.number}
                        href={issue.html_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block p-4 bg-[#161b22] border border-[#30363d] rounded-lg hover:border-[#d29922]/40 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${issue.state === "open" ? "text-[#3fb950]" : "text-[#a371f7]"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-[#e6edf3] line-clamp-1 mb-1">{issue.title}</div>
                            <div className="text-[10px] text-[#8b949e]">#{issue.number} · {timeAgo(issue.created_at)}</div>
                          </div>
                        </div>
                      </a>
                    ))
                  )}
                </div>
              )}

              {showNewIssue && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                  <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
                    <div className="px-4 py-3 border-b border-[#30363d] flex items-center justify-between bg-[#0d1117]">
                      <span className="font-bold text-sm">New Issue</span>
                      <button onClick={() => setShowNewIssue(false)}><X className="w-4 h-4 text-[#8b949e]" /></button>
                    </div>
                    <div className="p-4 space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-[#8b949e] mb-1.5 uppercase">Title</label>
                        <input
                          type="text"
                          value={issueTitle}
                          onChange={e => setIssueTitle(e.target.value)}
                          placeholder="Bug: application crashes on launch"
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-[#8b949e] mb-1.5 uppercase">Body</label>
                        <textarea
                          value={issueBody}
                          onChange={e => setIssueBody(e.target.value)}
                          rows={4}
                          placeholder="Describe the problem..."
                          className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-4 py-2 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-sm"
                        />
                      </div>
                      {issueResult && (
                        <div className="p-3 bg-[#0d2d1a] border border-[#3fb950]/30 rounded text-xs text-[#3fb950] font-bold">
                          Created Issue #{issueResult.number}
                        </div>
                      )}
                      <button
                        disabled={!issueTitle || creatingIssue}
                        onClick={doCreateIssue}
                        className="w-full py-2.5 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-50 text-white font-bold rounded-lg transition-colors text-sm flex justify-center items-center gap-2"
                      >
                        {creatingIssue && <Loader2 className="w-4 h-4 animate-spin" />}
                        Submit New Issue
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
