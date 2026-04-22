import { fetch as expoFetch } from "expo/fetch";

export const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`;
export const API = `${BASE}/api`;

export type ChatMsg = { role: "user" | "assistant" | "system"; content: string };

// =================== Streaming chat (regular) ===================
export async function streamLexi(
  messages: ChatMsg[],
  onToken: (chunk: string) => void,
  opts: { model?: string; systemPrompt?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const model = opts.model ?? "lexi-uncensored-v2-8b";
  const res = await expoFetch(`${API}/chat`, {
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
  const res = await expoFetch(`${API}/agent`, {
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
  const res = await fetch(`${API}/media/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const json = await res.json();
  if (!json.dataUrl) throw new Error(json.error ?? "Image generation failed");
  return json.dataUrl as string;
}

export async function analyzeImages(prompt: string, imageDataUrls: string[]): Promise<string> {
  const res = await fetch(`${API}/media/vision`, {
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
  const res = await fetch(`${API}/code/run`, {
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
  try {
    const res = await fetch(`${API}/models`);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.models ?? []) as ModelInfo[];
  } catch { return []; }
}

// =================== Terminal session ===================
export async function termCreateSession(): Promise<{ sessionId: string; cwd: string }> {
  const res = await fetch(`${API}/terminal/session`, { method: "POST" });
  if (!res.ok) throw new Error(`Terminal session failed (${res.status})`);
  return res.json();
}
export async function termDestroySession(id: string) {
  try { await fetch(`${API}/terminal/session/${id}`, { method: "DELETE" }); } catch {}
}
export async function termExec(sessionId: string, command: string) {
  const res = await fetch(`${API}/terminal/exec`, {
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
  const res = await fetch(`${API}/terminal/ssh/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "SSH connect failed");
  return data as { sessionId: string; host: string; username: string };
}
export async function sshDisconnect(sessionId: string) {
  try { await fetch(`${API}/terminal/ssh/session/${sessionId}`, { method: "DELETE" }); } catch {}
}
export async function sshExec(sessionId: string, command: string) {
  const res = await fetch(`${API}/terminal/ssh/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, command }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "SSH command failed");
  return data as { output: string; exitCode: number; cwd: string };
}

// =================== Phone lookup ===================
export async function phoneLookup(phoneNumber: string) {
  const res = await fetch(`${API}/phone/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Lookup failed");
  return data;
}

// =================== GitHub ===================
export async function ghGet(path: string) {
  const res = await fetch(`${API}/github${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}
export async function ghPost(path: string, body: any) {
  const res = await fetch(`${API}/github${path}`, {
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
  const res = await fetch(`${API}/software/catalog`);
  return res.json();
}
export async function softwareStatus() {
  const res = await fetch(`${API}/software/status`);
  return res.json();
}
export async function softwareInstall(slug: string) {
  const res = await fetch(`${API}/software/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  return res.json();
}

// =================== Uploads ===================
export async function listUploads() {
  const res = await fetch(`${API}/uploads`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.uploads ?? data ?? [];
}
export async function deleteUpload(filename: string) {
  await fetch(`${API}/uploads/${encodeURIComponent(filename)}`, { method: "DELETE" });
}
export async function uploadFile(uri: string, filename: string, mime: string): Promise<any> {
  const form = new FormData();
  // @ts-ignore - RN FormData file shape
  form.append("file", { uri, name: filename, type: mime });
  const res = await fetch(`${API}/upload`, { method: "POST", body: form as any });
  return res.json();
}

// =================== VPN / Tor ===================
export async function vpnStatus() {
  try {
    const res = await fetch(`${API}/vpn/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}
export async function vpnRotate() {
  try { await fetch(`${API}/vpn/rotate`, { method: "POST" }); } catch {}
}

// =================== Self-patch (server CRUD only) ===================
export async function listSelfPatches() {
  try {
    const res = await fetch(`${API}/self-patch`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.extensions ?? [];
  } catch { return []; }
}
export async function createSelfPatch(name: string, code: string, description?: string) {
  const res = await fetch(`${API}/self-patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, code, description }),
  });
  return res.ok;
}
export async function deleteSelfPatch(slug: string) {
  const res = await fetch(`${API}/self-patch/${encodeURIComponent(slug)}`, { method: "DELETE" });
  return res.ok;
}
export async function clearSelfPatches() {
  try { await fetch(`${API}/self-patch`, { method: "DELETE" }); } catch {}
}

// =================== Python scripts ===================
export async function listPythonScripts() {
  try {
    const res = await fetch(`${API}/python-scripts`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.scripts ?? [];
  } catch { return []; }
}
export async function deletePythonScript(slug: string) {
  const res = await fetch(`${API}/python-scripts/${encodeURIComponent(slug)}`, { method: "DELETE" });
  return res.ok;
}
export async function clearPythonScripts() {
  try { await fetch(`${API}/python-scripts`, { method: "DELETE" }); } catch {}
}

// =================== Project file URLs ===================
export function projectFileUrl(projectId: string, mainFile: string, download = false) {
  const params = new URLSearchParams({ path: mainFile });
  if (download) params.set("download", "1");
  return `${API}/projects/${projectId}/file?${params.toString()}`;
}
export function projectDownloadUrl(projectId: string) {
  return `${API}/projects/${projectId}/download`;
}

// =================== EAS APK build status ===================
export async function easBuildStatus(buildId: string) {
  const res = await fetch(`${API}/build-apk/${buildId}/status`);
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
