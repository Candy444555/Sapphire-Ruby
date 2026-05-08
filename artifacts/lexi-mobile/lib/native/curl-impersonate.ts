// Thin TS wrapper for curl-impersonate as a JNI lib bundled in jniLibs/.
// Native module: `LexiCurlImpersonate`. Same fetch-shape as Cronet so the
// router can swap them.
import type { NativeModule } from "react-native";
import { getNativeModule } from "@/lib/native/_modules";
import type { BrowserProfile } from "@/lib/stealth/profiles";

type CurlNative = NativeModule & {
  request(opts: {
    url: string;
    method: string;
    headers: Array<[string, string]>;
    body?: string | null;
    socksProxy?: string | null;
    httpProxy?: string | null;
    impersonate: string; // e.g. "chrome120", "chrome116", "safari17_0", "firefox117"
  }): Promise<{
    status: number;
    headers: Array<[string, string]>;
    bodyBase64: string;
    ja3?: string;
    ja4?: string;
  }>;
  isAvailable(): boolean;
  listImpersonations(): string[];
};

const Native: CurlNative | null = getNativeModule<CurlNative>("LexiCurlImpersonate");

export function curlImpersonateAvailable(): boolean {
  return !!Native && Native.isAvailable?.();
}

export function listCurlImpersonations(): string[] {
  return Native ? Native.listImpersonations() : [];
}

export async function curlImpersonateFetch(url: string, opts: {
  profile: BrowserProfile;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  socksProxy?: string | null;
  httpProxy?: string | null;
}): Promise<Response> {
  if (!Native) throw new Error("CURL_IMPERSONATE_NOT_BUNDLED: curl-impersonate JNI lib isn't in this build. Drop a prebuilt arm64 .so under artifacts/lexi-mobile/native-android/jniLibs/arm64-v8a/libcurl-impersonate.so (the lexiforest fork's aarch64-linux-android tarball works) and re-run `pnpm --filter @workspace/lexi-mobile build:apk:native`.");
  const headerPairs: Array<[string, string]> = [];
  for (const [k, v] of opts.profile.headers) headerPairs.push([k, v]);
  if (opts.headers) {
    if (opts.headers instanceof Headers) opts.headers.forEach((v, k) => headerPairs.push([k, v]));
    else if (Array.isArray(opts.headers)) for (const [k, v] of opts.headers) headerPairs.push([k, v]);
    else for (const [k, v] of Object.entries(opts.headers as Record<string, string>)) headerPairs.push([k, v]);
  }
  const method = (opts.method ?? "GET").toUpperCase();
  let body: string | null = null;
  if (opts.body != null && method !== "GET" && method !== "HEAD") {
    body = typeof opts.body === "string" ? opts.body : String(opts.body);
  }
  const res = await Native.request({
    url, method, headers: headerPairs, body,
    socksProxy: opts.socksProxy ?? null,
    httpProxy: opts.httpProxy ?? null,
    impersonate: opts.profile.curlImpersonate,
  });
  const bytes = decodeBase64(res.bodyBase64);
  const r = new Response(bytes as unknown as BlobPart, { status: res.status });
  for (const [k, v] of res.headers) try { r.headers.set(k, v); } catch {}
  curlMeta.set(r, { ja3: res.ja3 ?? null, ja4: res.ja4 ?? null });
  return r;
}

export type CurlMeta = { ja3: string | null; ja4: string | null };
const curlMeta = new WeakMap<Response, CurlMeta>();
export function getCurlMeta(r: Response): CurlMeta | undefined { return curlMeta.get(r); }

function decodeBase64(b64: string): Uint8Array {
  if (!b64) return new Uint8Array();
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const len = b64.length;
  let n = (len * 3) >> 2;
  if (b64[len - 1] === "=") n--;
  if (b64[len - 2] === "=") n--;
  const out = new Uint8Array(n);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[b64.charCodeAt(i)];
    const b = lookup[b64.charCodeAt(i + 1)];
    const c = lookup[b64.charCodeAt(i + 2)];
    const d = lookup[b64.charCodeAt(i + 3)];
    out[p++] = (a << 2) | (b >> 4);
    if (p < n) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < n) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
}
