// Thin TS wrapper around the embedded Cronet engine.
//
// Cronet is the HTTP/2 + QUIC + Brotli engine that gives us byte-identical-
// to-Chrome client-hello fingerprinting. It does NOT support SOCKS proxies
// (a known chromium limitation) and HTTP-proxy plumbing on Android requires
// experimental options that aren't reliable across cronet-embedded versions.
// So this wrapper REFUSES to run when a proxy is requested — the
// `stealthFetch` orchestrator switches to curl-impersonate (which uses
// libcurl and supports both SOCKS5 and HTTP proxies natively) whenever a
// backend other than `direct` is selected.
//
// In a properly prebuilt APK, the Expo config plugin `with-cronet.js` pulls
// `org.chromium.net:cronet-embedded` into the Android build, and
// `LexiCronetModule.kt` exposes `request(...)`, `fingerprintProbe(...)`, and
// `isAvailable()`. If the native module is missing, calls THROW so stealth
// traffic can never accidentally leak through OkHttp.
import type { NativeModule } from "react-native";
import { getNativeModule } from "@/lib/native/_modules";
import type { BrowserProfile } from "@/lib/stealth/profiles";

type HeaderPair = [string, string];

type CronetNative = NativeModule & {
  request(opts: {
    url: string;
    method: string;
    headers: HeaderPair[];
    body?: string | null;
    profileKey: string;
    quic: boolean;
    h2: boolean;
  }): Promise<{
    status: number;
    headers: HeaderPair[];
    bodyBase64: string;
    negotiatedProtocol?: string;
  }>;
  fingerprintProbe(profileKey: string, endpoint: string): Promise<{
    status: number;
    headers: HeaderPair[];
    bodyBase64: string;
    negotiatedProtocol?: string;
  }>;
  isAvailable(): boolean;
};

const Native: CronetNative | null = getNativeModule<CronetNative>("LexiCronet");

export function cronetAvailable(): boolean {
  return !!Native && Native.isAvailable?.();
}

export type CronetFetchOpts = {
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  profile: BrowserProfile;
  socksProxy?: string | null;
  httpProxy?: string | null;
};

export type CronetMeta = { negotiated?: string };
const cronetMeta = new WeakMap<Response, CronetMeta>();
export function getCronetMeta(r: Response): CronetMeta | undefined { return cronetMeta.get(r); }

function flattenHeaders(profileHeaders: HeaderPair[], extra?: HeadersInit): HeaderPair[] {
  const out: HeaderPair[] = [];
  for (const [k, v] of profileHeaders) out.push([k, v]);
  if (!extra) return out;
  if (extra instanceof Headers) { extra.forEach((v, k) => out.push([k, v])); return out; }
  if (Array.isArray(extra)) { for (const [k, v] of extra) out.push([k, v]); return out; }
  for (const [k, v] of Object.entries(extra as Record<string, string>)) out.push([k, v]);
  return out;
}

export async function cronetFetch(url: string, opts: CronetFetchOpts): Promise<Response> {
  if (!Native) {
    throw new Error("CRONET_NOT_BUNDLED: Cronet engine isn't in this build. Run `pnpm --filter @workspace/lexi-mobile build:apk` and install the resulting APK.");
  }
  if (opts.socksProxy || opts.httpProxy) {
    throw new Error("CRONET_PROXY_UNSUPPORTED: Cronet does not support SOCKS/HTTP proxies — route this request through curl-impersonate instead. (stealthFetch already does this when any backend other than `direct` is selected.)");
  }
  const headerPairs = flattenHeaders(opts.profile.headers, opts.headers);
  const method = (opts.method ?? "GET").toUpperCase();
  let body: string | null = null;
  if (opts.body != null && method !== "GET" && method !== "HEAD") {
    if (typeof opts.body === "string") body = opts.body;
    else if (opts.body instanceof ArrayBuffer) body = new TextDecoder().decode(opts.body);
    else body = String(opts.body);
  }
  const res = await Native.request({
    url, method, headers: headerPairs, body,
    profileKey: opts.profile.key,
    quic: opts.profile.quic ?? false,
    h2: opts.profile.h2 ?? true,
  });
  const bytes = base64ToBytes(res.bodyBase64);
  const r = new Response(bytes as unknown as BlobPart, { status: res.status });
  for (const [k, v] of res.headers) try { r.headers.set(k, v); } catch {}
  cronetMeta.set(r, { negotiated: res.negotiatedProtocol });
  return r;
}

/**
 * Real fingerprint measurement: hits a JA3/JA4 reflector (default
 * tls.peet.ws/api/all) through Cronet and parses the JSON response.
 * Returns the actual hashes the server saw, not synthetic ones.
 */
export async function cronetFingerprintProbe(profile: BrowserProfile, endpoint = "https://tls.peet.ws/api/all"): Promise<{ ja3: string | null; ja4: string | null; h2: string | null; negotiated: string | null; ua: string | null }> {
  if (!Native) throw new Error("CRONET_NOT_BUNDLED");
  const r = await Native.fingerprintProbe(profile.key, endpoint);
  const text = base64ToText(r.bodyBase64);
  let ja3: string | null = null, ja4: string | null = null, h2: string | null = null, ua: string | null = null;
  try {
    const j = JSON.parse(text) as { tls?: { ja3_hash?: string; ja4?: string; ja3?: string }; http2?: { sent_frames?: unknown[] }; user_agent?: string };
    ja3 = j.tls?.ja3_hash ?? j.tls?.ja3 ?? null;
    ja4 = j.tls?.ja4 ?? null;
    if (j.http2?.sent_frames) h2 = `frames:${j.http2.sent_frames.length}`;
    ua = j.user_agent ?? null;
  } catch {
    // Endpoint returned non-JSON or was unreachable; surface what we have.
  }
  return { ja3, ja4, h2, negotiated: r.negotiatedProtocol ?? null, ua };
}

function base64ToBytes(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const len = b64.length;
  let bufferLength = (len * 3) >> 2;
  if (b64[len - 1] === "=") bufferLength--;
  if (b64[len - 2] === "=") bufferLength--;
  const out = new Uint8Array(bufferLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[b64.charCodeAt(i)];
    const b = lookup[b64.charCodeAt(i + 1)];
    const c = lookup[b64.charCodeAt(i + 2)];
    const d = lookup[b64.charCodeAt(i + 3)];
    out[p++] = (a << 2) | (b >> 4);
    if (p < bufferLength) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < bufferLength) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
}
function base64ToText(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}
