import { expoFetch } from "@/lib/logged-fetch";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { log } from "@/lib/logger";
import { stealthFetch } from "@/lib/stealth-fetch";
import { hardenMessages, hardenSystemPrompt, detectBannedRefusal, ENFORCEMENT_REROLL_REMINDER } from "@/lib/lexi-enforce";
import { createLexiFlagStreamMobile } from "@/lib/lexi-flag";

// =================== Network base URL resolution ===================
// Priority:
//  1. Runtime override saved in AsyncStorage  (user can change at any time)
//  2. EXPO_PUBLIC_DOMAIN baked at build time  (eas.json env)
//  3. expo.extra.apiDomain in app.json        (build-time fallback)
//  4. Empty string → caller will fail with a clear error

const STORAGE_KEY = "@lexi/api_domain";
const FL_KEY_STORAGE = "@lexi/featherless_key";
const FL_BASE = "https://api.featherless.ai/v1";

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
  return d
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .replace(/\/(api-server|api)(\/.*)?$/, ""); // strip path prefixes the client adds itself
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

// Featherless.ai models — curated list, always available
export const DIRECT_MODELS = [
  { id: "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",  name: "Lexi Uncensored V2 8B",   uncensored: true },
  { id: "Orenguteng/Llama-3.3-70B-Lexi-Uncensored-V2", name: "Lexi Uncensored V2 70B",  uncensored: true },
  { id: "NousResearch/Hermes-3-Llama-3.1-8B",          name: "Hermes 3 8B",              uncensored: true },
  { id: "NousResearch/Hermes-3-Llama-3.1-70B",         name: "Hermes 3 70B",             uncensored: true },
  { id: "meta-llama/Llama-3.1-8B-Instruct",            name: "Llama 3.1 8B" },
  { id: "meta-llama/Llama-3.1-70B-Instruct",           name: "Llama 3.1 70B" },
  { id: "meta-llama/Llama-3.2-11B-Vision-Instruct",    name: "Llama 3.2 Vision 11B" },
  { id: "mistralai/Mistral-7B-Instruct-v0.3",          name: "Mistral 7B" },
  { id: "mistralai/Mistral-Nemo-Instruct-2407",        name: "Mistral Nemo 12B" },
  { id: "Qwen/Qwen2.5-72B-Instruct",                  name: "Qwen 2.5 72B" },
];

export async function testFeatherlessKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Credential validation uses the phone's normal network path. The
    // fail-closed stealth router may reject this test before Featherless sees
    // it when Tor/proxy backends are unavailable; chat routing stays separate.
    const res = await expoFetch("https://api.featherless.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        stream: false,
      }),
    });
    if (res.ok) return { ok: true };
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = (j as any)?.error?.message ?? msg; } catch {}
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

async function streamFeatherlessDirect(
  messages: ChatMsg[],
  onToken: (chunk: string) => void,
  opts: { model?: string; systemPrompt?: string; signal?: AbortSignal; _enforcementAttempt?: number } = {},
): Promise<void> {
  const key = getFeatherlessKey();
  if (!key) throw new Error("No Featherless.ai API key set. Add it in Profile settings.");
  const model = opts.model ?? "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2";
  // Baked-in enforcement: the literal-compliance protocol is ALWAYS the
  // first system message; the tail reminder is ALWAYS the last system
  // message right before generation. The user's systemPrompt becomes
  // secondary context that lives between them.
  const allMessages: ChatMsg[] = hardenMessages(messages, opts.systemPrompt);
  // On a re-roll triggered by detectBannedRefusal(), inject a sharper
  // reminder right before the assistant turn.
  if ((opts._enforcementAttempt ?? 0) > 0) {
    allMessages.push({ role: "system", content: ENFORCEMENT_REROLL_REMINDER });
  }
  const res = await stealthFetch("https://api.featherless.ai/v1/chat/completions", {
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
  let assistantBuf = "";
  let refusalChecked = false;
  let refusalDetected = false;
  const localCtrl = new AbortController();
  // === LEXI FLAG (mobile mirror) === — mandatory outbound checkpoint on the
  // direct Featherless path. Even when the API server is unreachable and we
  // fall back here, every token still gets identity/refusal/URL-scrubbed
  // before reaching the UI. Streaming-safe via 128-char rolling tail.
  const flag = createLexiFlagStreamMobile();
  const emit = (raw: string) => {
    const cleaned = flag.feed(raw, false);
    if (cleaned.length > 0) onToken(cleaned);
  };
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
      if (!payload || payload === "[DONE]") {
        if (refusalDetected) break;
        const trailing = flag.feed("", true);
        if (trailing.length > 0) onToken(trailing);
        return;
      }
      try {
        const tok = JSON.parse(payload);
        const content = tok?.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content) {
          assistantBuf += content;
          // Refusal detection — only on the first attempt, only on the
          // first 160 chars. If a banned opener fires, abort the stream,
          // discard whatever we've shown, and re-issue with the
          // enforcement reminder. Only re-roll once to avoid loops.
          if (!refusalChecked && assistantBuf.length >= 40) {
            refusalChecked = true;
            if ((opts._enforcementAttempt ?? 0) === 0 && detectBannedRefusal(assistantBuf)) {
              refusalDetected = true;
              try { localCtrl.abort(); } catch {}
              try { reader.cancel(); } catch {}
              break;
            }
          }
          emit(content);
        }
      } catch { /* skip malformed lines */ }
    }
    if (refusalDetected) break;
  }
  if (!refusalDetected) {
    const trailing = flag.feed("", true);
    if (trailing.length > 0) onToken(trailing);
  }
  if (refusalDetected) {
    await streamFeatherlessDirect(messages, onToken, { ...opts, _enforcementAttempt: (opts._enforcementAttempt ?? 0) + 1 });
  }
}

// =================== Streaming chat (regular) ===================
// Prefer the API server when one is configured (proven SSE path the agent uses,
// no Featherless key needed on the device, retries + keepalives + search context).
// If the server is unreachable AND a Featherless key is saved, transparently
// fall back to direct Featherless so chat keeps working in degraded conditions.
// Mid-stream errors (after at least one token) are NOT retried — the partial
// reply already shown to the user is kept and the error surfaces normally.
export type ChatPathMode = "server" | "direct";

export type StreamLexiOpts = {
  model?: string;
  systemPrompt?: string;
  signal?: AbortSignal;
  onMode?: (mode: ChatPathMode) => void;
};

export async function streamLexi(
  messages: ChatMsg[],
  onToken: (chunk: string) => void,
  opts: StreamLexiOpts = {},
): Promise<void> {
  return log.span("ai", "chat", () => streamLexiInner(messages, onToken, opts), {
    target: opts.model ?? "default",
    inputs: { messageCount: messages.length, hasSystemPrompt: Boolean(opts.systemPrompt) },
  });
}

async function streamLexiInner(
  messages: ChatMsg[],
  onToken: (chunk: string) => void,
  opts: StreamLexiOpts,
): Promise<void> {
  if (getApiBase()) {
    let receivedAny = false;
    const serverOnToken = (t: string) => {
      if (!receivedAny) {
        receivedAny = true;
        opts.onMode?.("server");
      }
      onToken(t);
    };
    try {
      await streamServerChat(messages, serverOnToken, opts);
      if (!receivedAny) opts.onMode?.("server");
      return;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      // Don't replay mid-stream — that would duplicate already-shown tokens.
      if (receivedAny) throw err;
      const key = getFeatherlessKey();
      const serverErr = err instanceof Error ? err.message : "unknown error";
      const serverLabel = describeServerFailure(err);
      if (!key) {
        throw new Error(
          `${serverLabel} (${serverErr}). Add your Featherless.ai key in Profile to enable direct fallback.`,
        );
      }
      let directReceivedAny = false;
      const directOnToken = (t: string) => {
        if (!directReceivedAny) {
          directReceivedAny = true;
          opts.onMode?.("direct");
        }
        onToken(t);
      };
      try {
        await streamFeatherlessDirect(messages, directOnToken, opts);
        if (!directReceivedAny) opts.onMode?.("direct");
        return;
      } catch (err2) {
        const directMsg = err2 instanceof Error ? err2.message : "unknown error";
        throw new Error(
          `${serverLabel} (${serverErr}); Featherless direct also failed (${directMsg}).`,
        );
      }
    }
  }
  let directReceivedAny = false;
  const directOnToken = (t: string) => {
    if (!directReceivedAny) {
      directReceivedAny = true;
      opts.onMode?.("direct");
    }
    onToken(t);
  };
  await streamFeatherlessDirect(messages, directOnToken, opts);
  if (!directReceivedAny) opts.onMode?.("direct");
}

function describeServerFailure(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/did not respond within/i.test(msg)) return "Server timed out";
  if (/^HTTP \d/i.test(msg)) return "Server returned an error";
  return "Server unreachable";
}

// Short timeout for the initial server connect / first-byte phase. If the
// server hasn't responded within this window we treat it as unreachable and
// let streamLexi fall back. Once the response is open we stop enforcing the
// timeout so healthy long streams aren't cut off.
const SERVER_CONNECT_TIMEOUT_MS = 8000;

async function streamServerChat(
  messages: ChatMsg[],
  onToken: (chunk: string) => void,
  opts: { model?: string; systemPrompt?: string; signal?: AbortSignal } = {},
): Promise<void> {
  const model = opts.model ?? "lexi-uncensored-v2-8b";

  // Compose a connect-phase timeout with the caller's abort signal.
  const connectCtrl = new AbortController();
  const timer = setTimeout(() => connectCtrl.abort(), SERVER_CONNECT_TIMEOUT_MS);
  const onCallerAbort = () => connectCtrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) connectCtrl.abort();
    else opts.signal.addEventListener("abort", onCallerAbort);
  }

  let res: Awaited<ReturnType<typeof expoFetch>>;
  try {
    res = await expoFetch(apiUrl("/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Even on the server path, harden the systemPrompt at the client edge
      // so the protocol cannot be stripped by a stale or modified server.
      body: JSON.stringify({ model, messages, systemPrompt: hardenSystemPrompt(opts.systemPrompt) }),
      signal: connectCtrl.signal,
    });
  } catch (err) {
    if (opts.signal?.aborted) {
      const e = new Error("Aborted");
      e.name = "AbortError";
      throw e;
    }
    if (connectCtrl.signal.aborted) {
      throw new Error(`Server did not respond within ${SERVER_CONNECT_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", onCallerAbort);
  }
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = (j as any)?.error ?? msg; } catch {}
    throw new Error(msg);
  }
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  // Wire caller's abort signal to cancel the body reader (we replaced the
  // fetch-level signal with our own connect-phase controller above).
  const onStreamAbort = () => { reader.cancel().catch(() => {}); };
  if (opts.signal) {
    if (opts.signal.aborted) onStreamAbort();
    else opts.signal.addEventListener("abort", onStreamAbort);
  }
  try {
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
        if (!payload) continue;
        if (payload === "[DONE]") return;
        if (payload.startsWith("[ERROR]")) throw new Error(payload.slice(7).trim() || "Server error");
        try {
          const tok = JSON.parse(payload);
          if (typeof tok === "string" && tok) onToken(tok);
        } catch { /* skip malformed */ }
      }
    }
  } finally {
    if (opts.signal) opts.signal.removeEventListener("abort", onStreamAbort);
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
  return log.span(
    "ai",
    "agent",
    () => streamAgentInner(body, onEvent, signal),
    { target: body.model, inputs: { messageCount: body.messages.length, sessionId: body.sessionId } },
  );
}

async function streamAgentInner(
  body: { model: string; messages: ChatMsg[]; systemPrompt?: string; sessionId?: string },
  onEvent: (ev: AgentRawEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  // If API server is configured, use it (full code execution agent)
  if (getApiBase()) {
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
        try { onEvent(JSON.parse(payload) as AgentRawEvent); } catch {}
      }
    }
    return;
  }

  // No server — run as a pure LLM agent directly on Featherless.ai
  const key = getFeatherlessKey();
  if (!key) throw new Error("No Featherless.ai key set. Add it in Profile settings.");
  const sessionId = `local-${Date.now()}`;
  onEvent({ type: "session", sessionId });
  onEvent({ type: "thinking" });
  const model = body.model ?? "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2";
  await streamFeatherlessDirect(body.messages, (chunk) => {
    onEvent({ type: "text", content: chunk });
  }, { model, systemPrompt: body.systemPrompt, signal });
  onEvent({ type: "done" });
}

// =================== Vision / image gen ===================

// Image generation via Pollinations.ai — free, no API key required
export async function generateImage(prompt: string): Promise<string> {
  return log.span("ai", "image-gen", async () => {
    const seed = Date.now();
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=768&height=768&nologo=true&model=flux&seed=${seed}`;
    // Verify the image is reachable before returning the URL (stealth-routed)
    const res = await stealthFetch(url, { method: "HEAD" });
    if (!res.ok) throw new Error(`Image generation failed (HTTP ${res.status})`);
    return url;
  }, { target: "pollinations", inputs: { promptLen: prompt.length } });
}

// Vision analysis via Featherless.ai — direct, no server needed
export async function analyzeImages(prompt: string, imageDataUrls: string[]): Promise<string> {
  return log.span("ai", "vision", () => analyzeImagesInner(prompt, imageDataUrls), {
    target: "featherless:vision",
    inputs: { imageCount: imageDataUrls.length, promptLen: prompt.length },
  });
}

async function analyzeImagesInner(prompt: string, imageDataUrls: string[]): Promise<string> {
  const key = getFeatherlessKey();
  if (!key) throw new Error("No Featherless.ai key set. Add it in Profile settings.");
  const imageContent = imageDataUrls.map((url) => ({
    type: "image_url" as const,
    image_url: { url },
  }));
  const res = await stealthFetch(`${FL_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "meta-llama/Llama-3.2-11B-Vision-Instruct",
      messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageContent] }],
      max_tokens: 1024,
      stream: false,
    }),
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(json.error?.message ?? `Vision failed: HTTP ${res.status}`);
  return json.choices?.[0]?.message?.content ?? "";
}

// =================== Code proofread (syntax + typo fix) ===================
// Mirrors POST /api/code/proofread on the server. Pass a single fenced block's
// language + code. Server runs a language-aware syntax check; if it errors,
// it asks Featherless once to fix syntax + obvious typos and returns the
// cleaned code. Always returns something — falls back to original on failure.
export type ProofreadResult = {
  code: string;
  changed: boolean;
  hadErrors: boolean;
  errors: string;
};

export async function proofreadCode(language: string, code: string): Promise<ProofreadResult> {
  if (!getApiBase()) return { code, changed: false, hadErrors: false, errors: "" };
  try {
    const res = await expoFetch(apiUrl("/code/proofread"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, code }),
    });
    if (!res.ok) return { code, changed: false, hadErrors: false, errors: "" };
    const j = (await res.json()) as Partial<ProofreadResult>;
    return {
      code: j.code ?? code,
      changed: Boolean(j.changed),
      hadErrors: Boolean(j.hadErrors),
      errors: j.errors ?? "",
    };
  } catch {
    return { code, changed: false, hadErrors: false, errors: "" };
  }
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

// Always fetches from Featherless.ai — returns curated list if key missing or fetch fails
export async function listModels(): Promise<ModelInfo[]> {
  const key = getFeatherlessKey();
  if (!key) return DIRECT_MODELS;
  try {
    const res = await stealthFetch(`${FL_BASE}/models`, {
      headers: { "Authorization": `Bearer ${key}` },
    });
    if (!res.ok) return DIRECT_MODELS;
    const json = await res.json() as any;
    const models: ModelInfo[] = (json.data ?? []).map((m: any) => ({
      id: m.id,
      name: m.id.split("/").pop()?.replace(/-/g, " ") ?? m.id,
      provider: "featherless",
    }));
    return models.length > 0 ? models : DIRECT_MODELS;
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

// =================== Apple Activation Bypass Responder ===================
export interface ActivationLogEntry {
  ts: number;
  ip: string;
  method: string;
  path: string;
  ua: string;
  matched: boolean;
}
export interface ActivationStatus {
  running: boolean;
  port: number | null;
  startedAt: number | null;
  ips: string[];
  requestCount: number;
  log: ActivationLogEntry[];
}
export async function appleActivationStart(port = 8088): Promise<ActivationStatus & { message?: string }> {
  const res = await fetch(apiUrl("/apple/activation/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ port }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? `start failed (${res.status})`);
  return j;
}
export async function appleActivationStop(): Promise<{ running: boolean; message?: string }> {
  const res = await fetch(apiUrl("/apple/activation/stop"), { method: "POST", credentials: "include" });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? `stop failed (${res.status})`);
  return j;
}
export async function appleActivationStatus(): Promise<ActivationStatus> {
  const res = await fetch(apiUrl("/apple/activation/status"), { credentials: "include" });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error ?? `status failed (${res.status})`);
  return j;
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


// =================== EAS Build APK ===================
export type ApkBuildResult =
  | { ok: true; buildUrl: string | null; buildId: string | null; profile: string; message: string; log: string }
  | { ok: false; error: string; detail?: string };

export async function triggerApkBuild(profile = "preview"): Promise<ApkBuildResult> {
  const url = apiUrl("/eas/build");
  try {
    const res = await expoFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile }),
    });
    const json = await res.json() as ApkBuildResult;
    if (!res.ok) return { ok: false, error: (json as any).error ?? `HTTP ${res.status}`, detail: `URL tried: ${url}\n${(json as any).detail ?? ""}` };
    return json;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error", detail: `URL tried: ${url}` };
  }
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
