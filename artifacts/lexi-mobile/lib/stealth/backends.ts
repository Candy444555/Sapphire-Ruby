// Backend selector.
//
// Five backends (Direct, Embedded Tor, Tor + per-request NEWNYM, Residential
// proxy BYO, Mobile proxy BYO, WireGuard BYO).
//
// The selector exposes:
//   - explicit pick:  setActiveBackend("tor")
//   - smart auto:     pickBackendFor(url) probes the target with a HEAD,
//                     and on Tor-block / 403 / 451 falls back through the
//                     user-configured priority order. Per-host cache so we
//                     don't re-probe.
//
// `withSocksOrProxy()` returns the SOCKS / HTTP proxy URI that the engine
// (Cronet or curl-impersonate) should route through for this request.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSocksPort, newCircuit, startTor, torAvailable } from "@/lib/native/tor";

export type BackendKey = "direct" | "tor" | "tor-rotate" | "residential" | "mobile" | "wireguard";

export type ProxyConfig = {
  residentialProxyUrl?: string;   // http://user:pass@host:port
  mobileProxyUrl?: string;        // http://user:pass@host:port
  wireguardConfig?: string;       // raw .conf, applied via system VPN (out-of-process)
};

const BACKEND_KEY = "@lexi/stealth_backend";
const PRIORITY_KEY = "@lexi/stealth_priority";
const PROXY_KEY = "@lexi/stealth_proxies";

let activeBackend: BackendKey = "tor";
let priority: BackendKey[] = ["tor", "tor-rotate", "residential", "mobile", "wireguard", "direct"];
let proxies: ProxyConfig = {};

const probeCache = new Map<string, BackendKey>();
const blockedByBackend = new Map<string, Set<BackendKey>>();

export async function loadBackendConfig(): Promise<void> {
  try {
    const a = await AsyncStorage.getItem(BACKEND_KEY); if (a) activeBackend = a as BackendKey;
    const p = await AsyncStorage.getItem(PRIORITY_KEY); if (p) priority = JSON.parse(p);
    const x = await AsyncStorage.getItem(PROXY_KEY); if (x) proxies = JSON.parse(x);
  } catch {}
}

export async function setActiveBackend(b: BackendKey): Promise<void> {
  activeBackend = b;
  try { await AsyncStorage.setItem(BACKEND_KEY, b); } catch {}
}

export function getActiveBackend(): BackendKey { return activeBackend; }

export async function setPriority(p: BackendKey[]): Promise<void> {
  priority = p;
  try { await AsyncStorage.setItem(PRIORITY_KEY, JSON.stringify(p)); } catch {}
}

export function getPriority(): BackendKey[] { return priority.slice(); }

export async function setProxies(c: ProxyConfig): Promise<void> {
  proxies = c;
  try { await AsyncStorage.setItem(PROXY_KEY, JSON.stringify(c)); } catch {}
}

export function getProxies(): ProxyConfig { return { ...proxies }; }

/**
 * Returns the proxy descriptor a transport should use for this backend.
 * For Tor, lazily starts the daemon and returns the local SOCKS5 URI.
 */
export async function withSocksOrProxy(b: BackendKey): Promise<{ socksProxy?: string; httpProxy?: string }> {
  switch (b) {
    case "direct":
      return {};
    case "tor":
    case "tor-rotate": {
      if (!torAvailable()) throw new Error("BACKEND_TOR_UNAVAILABLE: tor-android isn't bundled in this build.");
      let port: number;
      try { port = await getSocksPort(); } catch { port = await startTor(); }
      if (b === "tor-rotate") await newCircuit();
      return { socksProxy: `socks5://127.0.0.1:${port}` };
    }
    case "residential":
      if (!proxies.residentialProxyUrl) throw new Error("BACKEND_RESIDENTIAL_NOT_CONFIGURED");
      return { httpProxy: proxies.residentialProxyUrl };
    case "mobile":
      if (!proxies.mobileProxyUrl) throw new Error("BACKEND_MOBILE_NOT_CONFIGURED");
      return { httpProxy: proxies.mobileProxyUrl };
    case "wireguard":
      // WireGuard is set up at the OS level; we rely on it being active and
      // route normally (no per-request proxy). The verifier should detect a
      // tunnel IP before we trust it.
      return {};
  }
}

export type ProbeOptions = {
  // Optional caller-supplied probe function so we can avoid wiring a transport
  // dependency into this module.
  headProbe?: (url: string, backend: BackendKey) => Promise<{ status: number; headers: Record<string, string> }>;
};

/**
 * Picks the best backend for a target URL. If `headProbe` is provided, probes
 * the target with the active backend; on signs of Tor block (403/451 or
 * Cloudflare/Akamai/PerimeterX challenge headers), walks the priority list
 * trying alternate backends.
 */
export async function pickBackendFor(url: string, opts: ProbeOptions = {}): Promise<BackendKey> {
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  const cached = probeCache.get(host);
  if (cached) return cached;

  const tried: BackendKey[] = [];
  const order = [activeBackend, ...priority.filter((p) => p !== activeBackend)];
  if (!opts.headProbe) {
    probeCache.set(host, activeBackend);
    return activeBackend;
  }
  // Fail-closed: if the operator's selected backend is Tor (or Tor-rotate),
  // we must NEVER silently fall back to "direct" — that would deanonymize
  // the operator. Direct is only allowed in the fallback chain when the
  // active backend is itself non-anonymizing.
  const allowDirectFallback = activeBackend === "direct" || activeBackend === "wireguard";

  for (const candidate of order) {
    if (!allowDirectFallback && candidate === "direct") continue;
    const blocks = blockedByBackend.get(host);
    if (blocks && blocks.has(candidate)) continue;
    tried.push(candidate);
    try {
      const r = await opts.headProbe(url, candidate);
      const blockMarkers = ["cf-mitigated", "x-akamai-transformed", "server-timing"];
      const hasBlockHdr = blockMarkers.some((h) => r.headers[h] && /block|challenge/i.test(r.headers[h]));
      if (r.status === 403 || r.status === 451 || hasBlockHdr) {
        const set = blockedByBackend.get(host) ?? new Set<BackendKey>();
        set.add(candidate); blockedByBackend.set(host, set);
        continue;
      }
      probeCache.set(host, candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  // Nothing in the chain worked. Hard-fail rather than silently degrading
  // to direct — operator opted into an anonymizing backend.
  if (!allowDirectFallback) {
    throw new Error(`BACKEND_ALL_FAILED: every anonymizing backend in the priority chain failed for ${host}. Tried: ${tried.join(", ") || "(none)"}. Refusing to fall back to direct.`);
  }
  probeCache.set(host, activeBackend);
  return activeBackend;
}

export function clearBackendCache(host?: string): void {
  if (host) { probeCache.delete(host); blockedByBackend.delete(host); }
  else { probeCache.clear(); blockedByBackend.clear(); }
}
