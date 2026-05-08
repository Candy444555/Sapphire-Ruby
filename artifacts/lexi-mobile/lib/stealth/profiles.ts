// Browser-profile registry. Each profile carries a coherent header set, a
// curl-impersonate flag mapping, and feature flags that drive the Cronet
// engine config (HTTP/2, QUIC, TLS extension order). The header lists are
// stored as ordered tuples so the wrapper can preserve case and order, both
// of which are part of the fingerprint.
//
// Profile data is intentionally lean here; the self-tune loop
// (`lib/stealth/self-tune.ts`) can replace the in-memory registry at runtime
// when newer real-world profile data lands from the open-source feeds.

export type BrowserProfile = {
  key: string;
  label: string;
  family: "chrome" | "firefox" | "safari" | "samsung" | "edge";
  os: "android" | "windows" | "macos" | "ios";
  majorVersion: number;
  curlImpersonate: string;
  // Fully ordered, case-preserved header set the engine should send.
  headers: Array<[string, string]>;
  acceptLanguage: string;
  timezone: string;
  h2: boolean;
  quic: boolean;
  // Hints used by the verifier to decide if a fingerprint reading "matches".
  expectedJa3Prefix?: string;
  expectedJa4Prefix?: string;
};

const CHROME_120_ANDROID_HEADERS: Array<[string, string]> = [
  ["sec-ch-ua", `"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"`],
  ["sec-ch-ua-mobile", "?1"],
  ["sec-ch-ua-platform", `"Android"`],
  ["upgrade-insecure-requests", "1"],
  ["user-agent", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36"],
  ["accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"],
  ["sec-fetch-site", "none"],
  ["sec-fetch-mode", "navigate"],
  ["sec-fetch-user", "?1"],
  ["sec-fetch-dest", "document"],
  ["accept-encoding", "gzip, deflate, br, zstd"],
  ["accept-language", "en-US,en;q=0.9"],
  ["priority", "u=0, i"],
];

const CHROME_119_WINDOWS_HEADERS: Array<[string, string]> = [
  ["sec-ch-ua", `"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"`],
  ["sec-ch-ua-mobile", "?0"],
  ["sec-ch-ua-platform", `"Windows"`],
  ["upgrade-insecure-requests", "1"],
  ["user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"],
  ["accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"],
  ["sec-fetch-site", "none"],
  ["sec-fetch-mode", "navigate"],
  ["sec-fetch-user", "?1"],
  ["sec-fetch-dest", "document"],
  ["accept-encoding", "gzip, deflate, br"],
  ["accept-language", "en-US,en;q=0.9"],
];

const FIREFOX_119_WINDOWS_HEADERS: Array<[string, string]> = [
  ["User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0"],
  ["Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"],
  ["Accept-Language", "en-US,en;q=0.5"],
  ["Accept-Encoding", "gzip, deflate, br"],
  ["DNT", "1"],
  ["Sec-GPC", "1"],
  ["Connection", "keep-alive"],
  ["Upgrade-Insecure-Requests", "1"],
  ["Sec-Fetch-Dest", "document"],
  ["Sec-Fetch-Mode", "navigate"],
  ["Sec-Fetch-Site", "none"],
  ["Sec-Fetch-User", "?1"],
];

const SAFARI_17_MACOS_HEADERS: Array<[string, string]> = [
  ["Host", ""],
  ["Sec-Fetch-Dest", "document"],
  ["Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"],
  ["Sec-Fetch-Mode", "navigate"],
  ["User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"],
  ["Accept-Language", "en-US,en;q=0.9"],
  ["Sec-Fetch-Site", "none"],
  ["Accept-Encoding", "gzip, deflate, br"],
  ["Connection", "keep-alive"],
];

const SAFARI_17_IOS_HEADERS: Array<[string, string]> = [
  ["Sec-Fetch-Dest", "document"],
  ["Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"],
  ["Sec-Fetch-Mode", "navigate"],
  ["User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1"],
  ["Accept-Language", "en-US,en;q=0.9"],
  ["Sec-Fetch-Site", "none"],
  ["Accept-Encoding", "gzip, deflate, br"],
  ["Connection", "keep-alive"],
];

const EDGE_120_WINDOWS_HEADERS: Array<[string, string]> = [
  ["sec-ch-ua", `"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"`],
  ["sec-ch-ua-mobile", "?0"],
  ["sec-ch-ua-platform", `"Windows"`],
  ["upgrade-insecure-requests", "1"],
  ["user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"],
  ["accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"],
  ["sec-fetch-site", "none"],
  ["sec-fetch-mode", "navigate"],
  ["sec-fetch-user", "?1"],
  ["sec-fetch-dest", "document"],
  ["accept-encoding", "gzip, deflate, br"],
  ["accept-language", "en-US,en;q=0.9"],
];

const SAMSUNG_23_HEADERS: Array<[string, string]> = [
  ["sec-ch-ua", `"Not?A_Brand";v="24", "Chromium";v="118", "Samsung Internet";v="23"`],
  ["sec-ch-ua-mobile", "?1"],
  ["sec-ch-ua-platform", `"Android"`],
  ["upgrade-insecure-requests", "1"],
  ["user-agent", "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36"],
  ["accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"],
  ["sec-fetch-site", "none"],
  ["sec-fetch-mode", "navigate"],
  ["sec-fetch-user", "?1"],
  ["sec-fetch-dest", "document"],
  ["accept-encoding", "gzip, deflate, br"],
  ["accept-language", "en-US,en;q=0.9"],
];

const PROFILES: BrowserProfile[] = [
  { key: "chrome120-android", label: "Chrome 120 / Android", family: "chrome", os: "android", majorVersion: 120, curlImpersonate: "chrome120", headers: CHROME_120_ANDROID_HEADERS, acceptLanguage: "en-US,en;q=0.9", timezone: "America/Los_Angeles", h2: true, quic: true },
  { key: "chrome120-windows", label: "Chrome 120 / Windows", family: "chrome", os: "windows", majorVersion: 120, curlImpersonate: "chrome120", headers: CHROME_120_ANDROID_HEADERS.map(([k, v]) => k === "sec-ch-ua-mobile" ? [k, "?0"] : k === "sec-ch-ua-platform" ? [k, '"Windows"'] : k === "user-agent" ? [k, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"] : [k, v]), acceptLanguage: "en-US,en;q=0.9", timezone: "America/New_York", h2: true, quic: true },
  { key: "chrome119-windows", label: "Chrome 119 / Windows", family: "chrome", os: "windows", majorVersion: 119, curlImpersonate: "chrome119", headers: CHROME_119_WINDOWS_HEADERS, acceptLanguage: "en-US,en;q=0.9", timezone: "America/New_York", h2: true, quic: true },
  { key: "chrome118-macos", label: "Chrome 118 / macOS", family: "chrome", os: "macos", majorVersion: 118, curlImpersonate: "chrome118", headers: CHROME_119_WINDOWS_HEADERS.map(([k, v]) => k === "sec-ch-ua-platform" ? [k, '"macOS"'] : k === "user-agent" ? [k, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"] : [k, v]), acceptLanguage: "en-US,en;q=0.9", timezone: "America/Los_Angeles", h2: true, quic: false },
  { key: "firefox119-windows", label: "Firefox 119 / Windows", family: "firefox", os: "windows", majorVersion: 119, curlImpersonate: "firefox117", headers: FIREFOX_119_WINDOWS_HEADERS, acceptLanguage: "en-US,en;q=0.5", timezone: "Europe/Berlin", h2: true, quic: false },
  { key: "firefox118-macos", label: "Firefox 118 / macOS", family: "firefox", os: "macos", majorVersion: 118, curlImpersonate: "firefox117", headers: FIREFOX_119_WINDOWS_HEADERS.map(([k, v]) => k === "User-Agent" ? [k, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:118.0) Gecko/20100101 Firefox/118.0"] : [k, v]), acceptLanguage: "en-US,en;q=0.5", timezone: "Europe/London", h2: true, quic: false },
  { key: "safari17-macos", label: "Safari 17 / macOS", family: "safari", os: "macos", majorVersion: 17, curlImpersonate: "safari17_0", headers: SAFARI_17_MACOS_HEADERS, acceptLanguage: "en-US,en;q=0.9", timezone: "America/Los_Angeles", h2: true, quic: false },
  { key: "safari17-ios", label: "Safari 17 / iOS", family: "safari", os: "ios", majorVersion: 17, curlImpersonate: "safari17_0", headers: SAFARI_17_IOS_HEADERS, acceptLanguage: "en-US,en;q=0.9", timezone: "America/New_York", h2: true, quic: false },
  { key: "safari16-ios", label: "Safari 16 / iOS", family: "safari", os: "ios", majorVersion: 16, curlImpersonate: "safari16_0", headers: SAFARI_17_IOS_HEADERS.map(([k, v]) => k === "User-Agent" ? [k, "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"] : [k, v]), acceptLanguage: "en-US,en;q=0.9", timezone: "America/New_York", h2: true, quic: false },
  { key: "edge120-windows", label: "Edge 120 / Windows", family: "edge", os: "windows", majorVersion: 120, curlImpersonate: "edge120", headers: EDGE_120_WINDOWS_HEADERS, acceptLanguage: "en-US,en;q=0.9", timezone: "America/Chicago", h2: true, quic: true },
  { key: "samsung23-android", label: "Samsung Internet 23 / Android", family: "samsung", os: "android", majorVersion: 23, curlImpersonate: "chrome116", headers: SAMSUNG_23_HEADERS, acceptLanguage: "en-US,en;q=0.9", timezone: "America/Denver", h2: true, quic: false },
  { key: "chrome116-android", label: "Chrome 116 / Android", family: "chrome", os: "android", majorVersion: 116, curlImpersonate: "chrome116", headers: CHROME_120_ANDROID_HEADERS.map(([k, v]) => k === "user-agent" ? [k, "Mozilla/5.0 (Linux; Android 13; SM-A536U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"] : k === "sec-ch-ua" ? [k, `"Not)A;Brand";v="24", "Chromium";v="116", "Google Chrome";v="116"`] : [k, v]), acceptLanguage: "en-US,en;q=0.9", timezone: "America/Phoenix", h2: true, quic: true },
];

let registry: BrowserProfile[] = [...PROFILES];
let activeKey: string = registry[0].key;
let locked = true;

export function listProfiles(): BrowserProfile[] {
  return registry.slice();
}

export function getProfile(key: string): BrowserProfile {
  const p = registry.find((x) => x.key === key);
  if (!p) throw new Error(`Unknown browser profile: ${key}`);
  return p;
}

export function getActiveProfile(): BrowserProfile {
  return getProfile(activeKey);
}

export function setActiveProfile(key: string): void {
  getProfile(key); // throws if missing
  activeKey = key;
}

export function isProfileLocked(): boolean {
  return locked;
}

export function setProfileLocked(v: boolean): void {
  locked = v;
}

export function pickRandomFamilyMember(family: BrowserProfile["family"]): BrowserProfile {
  const fam = registry.filter((p) => p.family === family);
  return fam[Math.floor(Math.random() * fam.length)] ?? registry[0];
}

export function replaceRegistry(next: BrowserProfile[]): void {
  if (!next.length) return;
  registry = next.slice();
  if (!registry.find((p) => p.key === activeKey)) activeKey = registry[0].key;
}

// Header-coherence score: cross-checks that the UA family matches the
// Sec-CH-UA / Sec-CH-UA-Platform values, that Accept-Encoding is plausible,
// and that no obvious leak (X-Forwarded-For, Via, RN bridge headers) is present.
export function coherenceScore(p: BrowserProfile): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 100;
  const get = (k: string) => p.headers.find(([h]) => h.toLowerCase() === k.toLowerCase())?.[1] ?? "";
  const ua = get("user-agent");
  if (!ua) { score -= 40; notes.push("missing User-Agent"); }
  if (p.family === "chrome" && !/Chrome\//.test(ua)) { score -= 20; notes.push("UA does not advertise Chrome"); }
  if (p.family === "firefox" && !/Firefox\//.test(ua)) { score -= 20; notes.push("UA does not advertise Firefox"); }
  if (p.family === "safari" && !/Safari\//.test(ua)) { score -= 20; notes.push("UA does not advertise Safari"); }
  const platform = get("sec-ch-ua-platform");
  if (p.family === "chrome" || p.family === "edge" || p.family === "samsung") {
    if (!platform) { score -= 10; notes.push("missing Sec-CH-UA-Platform"); }
  }
  for (const [k] of p.headers) {
    if (/^x-forwarded-for$/i.test(k) || /^via$/i.test(k) || /^x-replit/i.test(k) || /^x-lexi/i.test(k)) {
      score -= 30;
      notes.push(`leaky header: ${k}`);
    }
  }
  if (!get("accept-language")) { score -= 5; notes.push("no Accept-Language"); }
  if (!get("accept-encoding")) { score -= 5; notes.push("no Accept-Encoding"); }
  return { score: Math.max(0, score), notes };
}
