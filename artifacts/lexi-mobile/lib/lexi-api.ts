import { fetch as expoFetch } from "expo/fetch";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

// =================== Network base URL resolution ===================
// Priority:
//  1. Runtime override saved in AsyncStorage  (user can change at any time)
//  2. EXPO_PUBLIC_DOMAIN baked at build time  (eas.json env)
//  3. expo.extra.apiDomain in app.json        (build-time fallback)
//  4. Empty string → caller will fail with a clear error

const STORAGE_KEY = "@lexi/api_domain";
const FL_KEY_STORAGE = "@lexi/featherless_key";

let _featherlessKey: string | null = null;

export async function loadFeatherlessKey(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(FL_KEY_STORAGE);
    _featherlessKey = stored ?? "";
  } catch { /* ignore */ }
  return _featherlessKey ?? "";
}

export async function setFeatherlessKey(key: string): Promise<void> {
  _featherlessKey = key.trim();
  try {
    if (_featherlessKey) await AsyncStorage.setItem(FL_KEY_STORAGE, _featherlessKey);
    else await AsyncStorage.removeItem(FL_KEY_STORAGE);
  } catch { /* ignore */ }
}

export function getFeatherlessKey(): string {
  return _featherlessKey ?? "";
}

// Keep old names as aliases so nothing else breaks
export const loadOpenRouterKey = loadFeatherlessKey;
export const setOpenRouterKey = setFeatherlessKey;
export const getOpenRouterKey = getFeatherlessKey;

loadFeatherlessKey().catch(() => {});

function clean(d: string | undefined | null): string {
  if (!d) return "";
  return d.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

let _cachedBase: string | null = null;
let _runtimeOverride: string | null = null;

export function defaultBakedDomain(): string {
  return (
    clean(process.env.EXPO_PUBLIC_DOMAIN) ||
    clean((Constants.expoConfig?.extra as { apiDomain?: string } | undefined)?.apiDomain) ||
    ""
  );
}

export async function loadApiDomain(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      _runtimeOverride = clean(stored);
    }
  } catch {
    /* ignore */
  }
  _cachedBase = _runtimeOverride || defaultBakedDomain();
  return _cachedBase;
}

export async function setApiDomain(domain: string): Promise<void> {
  const cleaned = clean(domain);
  _runtimeOverride = cleaned;
  _cachedBase = cleaned || defaultBakedDomain();
  try {
    if (cleaned) await AsyncStorage.setItem(STORAGE_KEY, cleaned);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getApiBase(): string {
  if (_cachedBase === null) _cachedBase = defaultBakedDomain();
  return _cachedBase ? `https://${_cachedBase}` : "";
}

export function getApiUrl(path: string = ""): string {
  const base = getApiBase();
  if (!base) return path;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

// Eagerly hydrate from storage on module load so all helpers see the right base ASAP.
loadApiDomain().catch(() => {});

// Backwards-compatible exports that other files import as constants.
// Kept as getters so they pick up runtime overrides on first read.
export const BASE = new Proxy({} as { toString(): string }, {
  get: () => () => getApiBase(),
});
export const API = new Proxy({} as { toString(): string }, {
  get: () => () => getApiUrl("/api"),
});

const apiUrl = (suffix: string) => getApiUrl(`/api${suffix}`);

export type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

// Featherless.ai direct uncensored models (used when no API server is set)
export const DIRECT_MODELS = [
  { id: "meta-llama/Meta-Llama-3.1-8B-Instruct", name: "Llama 3.1 8B Instruct", uncensored: false },
  { id: "NousResearch/Hermes-3-Llama-3.1-8B", name: "Hermes 3 8B (Uncensored)", uncensored: true },
  { id: "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2", name: "Lexi Uncensored 8B V2", uncensored: true },
  { id: "NousResearch/Hermes-3-Llama-3.1-70B", name: "Hermes 3 70B (Uncensored)", uncensored: true },
  { id: "meta-llama/Meta-Llama-3.1-70B-Instruct", name: "Llama 3.1 70B Instruct", uncensored: false },
  { id: "unsloth/gemma-3-12b-it", name: "Gemma 3 12B", uncensored: false },
];

async function streamFeatherlessDirect(
  messages: ChatMsg[],
  onToken: (chunk: string) => void,
  opts: { model?: string; systemPrompt?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const key = getFeatherlessKey();
  if (!key) throw new Error("No Featherless.ai API key set. Add it in Profile settings.");
  const model = opts.model ?? "NousResearch/Hermes-3-Llama-3.1-8B";
  const allMessages: ChatMsg[] = opts.systemPrompt
    ? [{ role: "system", content: opts.systemPrompt }, ...messages]
    : messages;
  const res = await expoFetch("https://api.featherless.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({ model, messages: allMessages, stream: true }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    let msg = `Featherless.ai error: HTTP ${res.status}`;
    try { const j = await res.json(); msg = (j as any)?.error?.message ?? msg; } catch {}
    throw new Error(msg);
  }
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") return;
      try {
        const tok = JSON.parse(payload);
        const content = tok?.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content) onToken(content);
      } catch { /* skip malformed lines */ }
    }
  }
}

// =================== Streaming chat (regular) ===================
export async function streamLexi(
  messages: ChatMsg[],
  onToken: (chunk: string) => void,
  opts: { model?: string; systemPrompt?: string; signal?: AbortSignal } = {},
): Promise<void> {
  // If no API server is configured, go directly to Featherless.ai
  if (!getApiBase()) {
    return streamFeatherlessDirect(messages, onToken, opts);
  }
  const model = opts.model ?? "lexi-uncensored-v2-8b";
  const res = await expoFetch(apiUrl("/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, systemPrompt: opts.systemPrompt }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`Chat failed: HTTP ${res.status}`);
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!ev.startsWith("data: ")) continue;
      const payload = ev.slice(6).trim();
      if (!payload || payload === "[DONE]") return;
      if (payload.startsWith("[ERROR]")) throw new Error(payload.slice(8));
      try {
        const tok = JSON.parse(payload);
        if (typeof tok === "string") onToken(tok);
      } catch {
        onToken(payload);
      }
    }
  }
}

// =================== Streaming agent ===================
export type AgentRawEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; content: string }
  | { type: "cmd_start"; command: string }
  | { type: "cmd_result"; command: string; output: string; exitCode: number; cwd: string }
  | { type: "needs_input"; question: string }
  | { type: "self_patch"; name: string; description: string }
  | { type: "self_patch_error"; name: string; error: string }
  | { type: "project_complete"; projectId: string; name: string; path: string; mainFile: string; projectType: string }
  | { type: "thinking" }
  | { type: "done" }
  | { type: "error"; message: string };

export async function streamAgent(
  body: { model: string; messages: ChatMsg[]; systemPrompt?: string; sessionId?: string },
  onEvent: (ev: AgentRawEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await expoFetch(apiUrl("/agent"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = (j as any)?.error ?? msg; } catch {}
    throw new Error(msg);
  }
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const ev = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!ev.startsWith("data: ")) continue;
      const payload = ev.slice(6).trim();
      if (!payload || payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload) as AgentRawEvent;
        onEvent(parsed);
      } catch {}
    }
  }
}

// =================== Vision / image gen ===================
export async function generateImage(prompt: string): Promise<string> {
  const res = await fetch(apiUrl("/media/image"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const json = await res.json();
  if (!json.dataUrl) throw new Error(json.error ?? "Image generation failed");
  return json.dataUrl as string;
}

export async function analyzeImages(prompt: string, imageDataUrls: string[]): Promise<string> {
  const res = await fetch(apiUrl("/media/vision"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, imageDataUrls }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.analysis as string;
}

// =================== Code run ===================
export async function runCode(language: string, code: string) {
  const res = await fetch(apiUrl("/code/run"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ language, code }),
  });
  return res.json() as Promise<{
    ok: boolean; exitCode: number | null; stdout: string; stderr: string; durationMs: number;
  }>;
}

// =================== Models ===================
export type ModelInfo = { id: string; name: string; provider?: string; uncensored?: boolean };
export async function listModels(): Promise<ModelInfo[]> {
  if (!getApiBase()) return DIRECT_MODELS;
  try {
    const res = await fetch(apiUrl("/models"));
    if (!res.ok) return DIRECT_MODELS;
    const json = await res.json();
    return (json.models ?? []) as ModelInfo[];
  } catch { return DIRECT_MODELS; }
}

// =================== Connectivity check ===================
export async function pingServer(): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = apiUrl("/healthz");
  if (!getApiBase()) return { ok: false, error: "No API URL configured" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return { ok: res.ok, status: res.status };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Network error" };
  }
}

// =================== Terminal session ===================
export async function termCreateSession(): Promise<{ sessionId: string; cwd: string }> {
  const res = await fetch(apiUrl("/terminal/session"), { method: "POST" });
  if (!res.ok) throw new Error(`Terminal session failed (${res.status})`);
  return res.json();
}
export async function termDestroySession(id: string) {
  try { await fetch(apiUrl(`/terminal/session/${id}`), { method: "DELETE" }); } catch {}
}
export async function termExec(sessionId: string, command: string) {
  const res = await fetch(apiUrl("/terminal/exec"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, command }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, ...data } as {
    ok: boolean; status: number; output?: string; error?: string; exitCode?: number; cwd?: string;
  };
}

// =================== SSH ===================
export async function sshConnect(cfg: { host: string; port: number; username: string; password?: string; privateKey?: string }) {
  const res = await fetch(apiUrl("/terminal/ssh/connect"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "SSH connect failed");
  return data as { sessionId: string; host: string; username: string };
}
export async function sshDisconnect(sessionId: string) {
  try { await fetch(apiUrl(`/terminal/ssh/session/${sessionId}`), { method: "DELETE" }); } catch {}
}
export async function sshExec(sessionId: string, command: string) {
  const res = await fetch(apiUrl("/terminal/ssh/exec"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, command }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "SSH command failed");
  return data as { output: string; exitCode: number; cwd: string };
}

// =================== GitHub ===================
export async function ghGet(path: string) {
  const res = await fetch(apiUrl(`/github${path}`));
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}
export async function ghPost(path: string, body: any) {
  const res = await fetch(apiUrl(`/github${path}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

// =================== Software ===================
export async function softwareCatalog() {
  const res = await fetch(apiUrl("/software/catalog"));
  return res.json();
}
export async function softwareStatus(ids: string[]) {
  const res = await fetch(apiUrl("/software/status"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return res.json();
}
export async function softwareInstall(id: string) {
  const res = await fetch(apiUrl("/software/install"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return res.json();
}

// =================== Uploads ===================
export async function listUploads() {
  const res = await fetch(apiUrl("/uploads"));
  if (!res.ok) return [];
  const data = await res.json();
  return data.uploads ?? data ?? [];
}
export async function deleteUpload(filename: string) {
  await fetch(apiUrl(`/uploads/${encodeURIComponent(filename)}`), { method: "DELETE" });
}
export async function uploadFile(uri: string, filename: string, mime: string): Promise<any> {
  const form = new FormData();
  // @ts-ignore - RN FormData file shape
  form.append("file", { uri, name: filename, type: mime });
  const res = await fetch(apiUrl("/upload"), { method: "POST", body: form as any });
  return res.json();
}

// =================== EAS Push Update ===================
export async function pushEasUpdate(channel = "personal", message = "OTA update"): Promise<Response> {
  return fetch(apiUrl("/eas/push-update"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel, message }),
  });
}

// =================== VPN / Tor ===================
export async function vpnStatus() {
  try {
    const res = await fetch(apiUrl("/vpn/status"));
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
export async function vpnRotate() {
  try { await fetch(apiUrl("/vpn/rotate"), { method: "POST" }); } catch {}
}

// =================== Self-patch (server CRUD only) ===================
export async function listSelfPatches() {
  try {
    const res = await fetch(apiUrl("/self-patch"));
    if (!res.ok) return [];
    const data = await res.json();
    return data.extensions ?? [];
  } catch { return []; }
}
export async function createSelfPatch(name: string, code: string, description?: string) {
  const res = await fetch(apiUrl("/self-patch"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, code, description }),
  });
  return res.ok;
}
export async function deleteSelfPatch(slug: string) {
  const res = await fetch(apiUrl(`/self-patch/${encodeURIComponent(slug)}`), { method: "DELETE" });
  return res.ok;
}
export async function clearSelfPatches() {
  try { await fetch(apiUrl("/self-patch"), { method: "DELETE" }); } catch {}
}

// =================== Python scripts ===================
export async function listPythonScripts() {
  try {
    const res = await fetch(apiUrl("/python-scripts"));
    if (!res.ok) return [];
    const data = await res.json();
    return data.scripts ?? [];
  } catch { return []; }
}
export async function deletePythonScript(slug: string) {
  const res = await fetch(apiUrl(`/python-scripts/${encodeURIComponent(slug)}`), { method: "DELETE" });
  return res.ok;
}
export async function clearPythonScripts() {
  try { await fetch(apiUrl("/python-scripts"), { method: "DELETE" }); } catch {}
}

// =================== Project file URLs ===================
export function projectFileUrl(projectId: string, mainFile: string, download = false) {
  const params = new URLSearchParams({ path: mainFile });
  if (download) params.set("download", "1");
  return apiUrl(`/projects/${projectId}/file?${params.toString()}`);
}
export function projectDownloadUrl(projectId: string) {
  return apiUrl(`/projects/${projectId}/download`);
}

// =================== EAS APK build status ===================
export async function easBuildStatus(buildId: string) {
  const res = await fetch(apiUrl(`/build-apk/${buildId}/status`));
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Status check failed (${res.status})`);
  }
  return res.json() as Promise<{
    status: "QUEUED" | "IN_PROGRESS" | "FINISHED" | "ERRORED" | "CANCELED" | "unknown";
    apkUrl: string | null;
    buildUrl: string | null;
    completedAt: string | null;
  }>;
}
