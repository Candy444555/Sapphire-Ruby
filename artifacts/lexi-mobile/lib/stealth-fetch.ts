// Stealth fetch — on-device orchestrator.
//
// Replaces the old "route through api-server's Tor proxy" model with a fully
// on-device stack:
//
//   1. budget.ts decides if the request is allowed and rewrites it for
//      log-noise avoidance (#12, default ON).
//   2. backends.ts picks the right backend (Direct / Tor / Tor+rotate /
//      residential / mobile / WireGuard) for this target.
//   3. pacer.ts paces inter-request delays and may fire a warm-session GET
//      before the real request.
//   4. The active engine (Cronet by default; curl-impersonate as a swappable
//      alternate) executes the request through the chosen backend's SOCKS /
//      HTTP proxy.
//
// When stealth is ON and the native engine isn't bundled, requests THROW a
// clear error rather than silently leaking through the JS network stack.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBase } from "@/lib/lexi-api";
import { cronetAvailable, cronetFetch } from "@/lib/native/cronet";
import { curlImpersonateAvailable, curlImpersonateFetch } from "@/lib/native/curl-impersonate";
import { getActiveProfile, pickRandomFamilyMember } from "@/lib/stealth/profiles";
import { paceBeforeRequest, noteRetryAfter } from "@/lib/stealth/pacer";
import { decide as budgetDecide, consumeBurn } from "@/lib/stealth/budget";
import { getActiveBackend, pickBackendFor, withSocksOrProxy, loadBackendConfig, type BackendKey } from "@/lib/stealth/backends";
import { pushOpsEvent } from "@/lib/stealth/operator-eyes";

const STEALTH_KEY = "@lexi/stealth_enabled";
const ENGINE_KEY = "@lexi/stealth_engine";

let _stealthEnabled = true;
let _loaded = false;
let _engine: "cronet" | "curl-impersonate" | "auto" = "auto";

export async function loadStealth(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(STEALTH_KEY);
    _stealthEnabled = v === null ? true : v === "1";
    const e = await AsyncStorage.getItem(ENGINE_KEY);
    if (e === "cronet" || e === "curl-impersonate" || e === "auto") _engine = e;
    await loadBackendConfig();
  } catch { _stealthEnabled = true; }
  _loaded = true;
  return _stealthEnabled;
}

export async function setStealth(on: boolean): Promise<void> {
  _stealthEnabled = on;
  _loaded = true;
  try { await AsyncStorage.setItem(STEALTH_KEY, on ? "1" : "0"); } catch {}
}

export function isStealth(): boolean { return _stealthEnabled; }

export async function setEngine(e: "cronet" | "curl-impersonate" | "auto"): Promise<void> {
  _engine = e;
  try { await AsyncStorage.setItem(ENGINE_KEY, e); } catch {}
}

export function getEngine(): "cronet" | "curl-impersonate" | "auto" { return _engine; }

loadStealth().catch(() => {});

function pickEngine(needsProxy: boolean): "cronet" | "curl-impersonate" {
  // Cronet doesn't support SOCKS or per-request HTTP proxies on Android, so
  // any non-direct backend forces curl-impersonate (which uses libcurl and
  // supports both natively).
  if (needsProxy) return "curl-impersonate";
  if (_engine === "cronet") return "cronet";
  if (_engine === "curl-impersonate") return "curl-impersonate";
  if (cronetAvailable()) return "cronet";
  if (curlImpersonateAvailable()) return "curl-impersonate";
  return "cronet"; // will throw a clear error in the wrapper
}

export async function stealthFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!_loaded) await loadStealth();
  const apiBase = getApiBase();
  if (apiBase && input.startsWith(apiBase)) {
    // Talking to our own server — never goes through the stealth path.
    return fetch(input, init);
  }
  if (!_stealthEnabled) {
    return fetch(input, init);
  }

  const method = (init.method ?? "GET").toUpperCase();
  const headers: Array<[string, string]> = [];
  if (init.headers) {
    if (init.headers instanceof Headers) init.headers.forEach((v, k) => headers.push([k, v]));
    else if (Array.isArray(init.headers)) headers.push(...init.headers as Array<[string, string]>);
    else for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers.push([k, v]);
  }

  // 1. Budget / log-noise avoidance.
  const decision = budgetDecide(input, method, headers);
  if (!decision.allow) {
    pushOpsEvent("guardrail", `budget refused ${input}`, { reason: decision.reason });
    throw new Error(`stealth budget refused: ${decision.reason}`);
  }
  const finalUrl = decision.rewriteUrl ?? input;
  const finalHeaders = decision.rewriteHeaders ?? headers;
  if (decision.note) pushOpsEvent("info", decision.note, { url: finalUrl });

  // 2. Backend selection. We give the auto-router a real HEAD probe so it
  // can detect Tor blocks / CDN challenges and walk the priority list.
  const burn = consumeBurn();
  const backendChoice: BackendKey = burn
    ? "tor-rotate"
    : await pickBackendFor(finalUrl, {
        headProbe: async (url, candidate) => {
          const cProxy = await withSocksOrProxy(candidate);
          const eng = pickEngine(!!(cProxy.socksProxy || cProxy.httpProxy));
          const probeProfile = getActiveProfile();
          // Pass an empty extra-headers list — the engine wrapper already
          // applies probeProfile.headers. Duplicating them here would corrupt
          // the client-hello/header coherence that the probe is measuring.
          const r = await runOnce({
            url,
            method: "HEAD",
            headers: [],
            body: null,
            engine: eng,
            profile: probeProfile,
            proxy: cProxy,
          });
          const hdrs: Record<string, string> = {};
          r.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
          return { status: r.status, headers: hdrs };
        },
      });
  const proxy = await withSocksOrProxy(backendChoice);

  // 3. Profile (locked or burn-rotated within family).
  const baseProfile = getActiveProfile();
  const profile = burn ? pickRandomFamilyMember(baseProfile.family) : baseProfile;

  // 4. Pace + optional warm-session GET.
  const { shouldWarm } = await paceBeforeRequest(finalUrl);
  const engine = pickEngine(!!(proxy.socksProxy || proxy.httpProxy));
  pushOpsEvent("request", `${method} ${finalUrl}`, { backend: backendChoice, engine, profile: profile.key, burn });

  if (shouldWarm) {
    try {
      const u = new URL(finalUrl);
      const favUrl = `${u.origin}/favicon.ico`;
      // Empty extras — the engine wrapper applies the profile headers.
      await runOnce({ url: favUrl, method: "GET", headers: [], body: null, engine, profile, proxy });
    } catch (e) { pushOpsEvent("info", "warm-session favicon failed", { error: String(e) }); }
  }

  let r: Response;
  try {
    r = await runOnce({ url: finalUrl, method, headers: finalHeaders, body: init.body, engine, profile, proxy });
    // Detection-based fallback: if Cronet picked up a Cloudflare/Akamai/PerimeterX
    // challenge or a 403/429 with bot-mitigation headers, retry once via
    // curl-impersonate (which has a different ClientHello footprint and often
    // walks past CDN-side Cronet detection).
    if (engine === "cronet" && curlImpersonateAvailable() && looksLikeBotMitigation(r)) {
      pushOpsEvent("info", "Cronet hit bot-mitigation; retrying via curl-impersonate", { url: finalUrl, status: r.status });
      try {
        r = await runOnce({ url: finalUrl, method, headers: finalHeaders, body: init.body, engine: "curl-impersonate", profile, proxy });
      } catch (e2) { pushOpsEvent("error", "curl-impersonate fallback failed", { error: String(e2) }); }
    }
  } catch (e) {
    pushOpsEvent("error", `stealth request failed`, { url: finalUrl, error: String(e) });
    throw e;
  }
  const ra = r.headers.get("retry-after");
  if (ra) noteRetryAfter(finalUrl, Number(ra) || 0);
  pushOpsEvent("response", `${r.status} ${finalUrl}`, { status: r.status, backend: backendChoice });
  return r;
}

function looksLikeBotMitigation(r: Response): boolean {
  if (r.status === 403 || r.status === 429 || r.status === 503) return true;
  const cf = r.headers.get("cf-mitigated") ?? r.headers.get("cf-ray");
  if (cf && /challenge|managed/i.test(cf)) return true;
  const server = r.headers.get("server") ?? "";
  if (/cloudflare/i.test(server) && r.status >= 400) return true;
  if (r.headers.get("x-akamai-transformed")) return true;
  if (r.headers.get("x-px-block")) return true;
  return false;
}

async function runOnce(opts: {
  url: string;
  method: string;
  headers: Array<[string, string]>;
  body: BodyInit | null | undefined;
  engine: "cronet" | "curl-impersonate";
  profile: ReturnType<typeof getActiveProfile>;
  proxy: { socksProxy?: string; httpProxy?: string };
}): Promise<Response> {
  if (opts.engine === "cronet") {
    return cronetFetch(opts.url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body ?? undefined,
      profile: opts.profile,
      socksProxy: opts.proxy.socksProxy ?? null,
      httpProxy: opts.proxy.httpProxy ?? null,
    });
  }
  return curlImpersonateFetch(opts.url, {
    method: opts.method,
    headers: opts.headers,
    body: opts.body ?? undefined,
    profile: opts.profile,
    socksProxy: opts.proxy.socksProxy ?? null,
    httpProxy: opts.proxy.httpProxy ?? null,
  });
}
