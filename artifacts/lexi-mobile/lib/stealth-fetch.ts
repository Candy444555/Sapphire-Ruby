// Stealth fetch — routes every outbound HTTPS request through the api-server's
// Tor-backed proxy. The server strips fingerprinting headers, randomizes the
// User-Agent, blocks private/internal hosts, and pipes the response back. When
// "Stealth Mode" is ON in Profile, all direct-internet calls in the app must
// use this; if Tor or the server is unreachable, the call FAILS rather than
// silently leaks the phone's real IP.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase, getApiUrl } from "@/lib/lexi-api";

const STEALTH_KEY = "@lexi/stealth_enabled";
let _stealthEnabled = true;
let _loaded = false;

export async function loadStealth(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STEALTH_KEY);
    _stealthEnabled = v === null ? true : v === "1";
  } catch {
    _stealthEnabled = true;
  }
  _loaded = true;
  return _stealthEnabled;
}

export async function setStealth(on: boolean): Promise<void> {
  _stealthEnabled = on;
  _loaded = true;
  try { await AsyncStorage.setItem(STEALTH_KEY, on ? "1" : "0"); } catch {}
}

export function isStealth(): boolean {
  return _stealthEnabled;
}

loadStealth().catch(() => {});

function headersToObject(h: HeadersInit | undefined): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) {
    const o: Record<string, string> = {};
    h.forEach((v, k) => { o[k] = v; });
    return o;
  }
  if (Array.isArray(h)) {
    const o: Record<string, string> = {};
    for (const [k, v] of h) o[k] = v;
    return o;
  }
  return { ...(h as Record<string, string>) };
}

export async function stealthFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!_loaded) await loadStealth();

  // Internal calls to our own api-server stay direct (the server itself is the
  // stealth proxy; you can't proxy yourself through yourself).
  const apiBase = getApiBase();
  if (apiBase && input.startsWith(apiBase)) {
    return fetch(input, init);
  }

  if (!_stealthEnabled) {
    return fetch(input, init);
  }

  if (!apiBase) {
    throw new Error("Stealth mode is ON but no Server URL is set. Add it in Profile, or turn Stealth off (not recommended — your real IP will be exposed).");
  }

  const proxyUrl = getApiUrl("/api/stealth-fetch");
  const method = (init.method ?? "GET").toUpperCase();
  const reqHeaders = headersToObject(init.headers);

  let bodyStr: string | null = null;
  if (init.body != null && method !== "GET" && method !== "HEAD") {
    if (typeof init.body === "string") bodyStr = init.body;
    else if (init.body instanceof ArrayBuffer) bodyStr = new TextDecoder().decode(init.body);
    else bodyStr = String(init.body);
  }

  return fetch(proxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: input, method, headers: reqHeaders, body: bodyStr }),
    signal: init.signal,
  });
}
