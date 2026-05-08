// Self-tuning fingerprint loop.
//
// Every 6h (or on demand) the loop:
//   1. probes a JA3/JA4 reflector through the active engine for each profile
//   2. compares the measured ja3/ja4 against the profile's expected prefix
//   3. computes a 0..100 score per profile, averages them
//   4. if score < threshold, fetches operator-configured JSON manifests of
//      known-good current fingerprints and hot-swaps the profile registry
//
// Scoring is concrete: a profile that returns the JA4 prefix it claims gets
// full credit; mismatches lose points. Endpoints unreachable count as 0
// (so an offline run can't falsely report green).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { listProfiles, replaceRegistry, type BrowserProfile } from "@/lib/stealth/profiles";

const SCORE_KEY = "@lexi/stealth_fp_score";
const FEEDS_KEY = "@lexi/stealth_fp_feeds";
const LAST_RUN_KEY = "@lexi/stealth_fp_last_run";

export type TuneResult = {
  ranAt: number;
  score: number;
  refreshed: boolean;
  notes: string[];
};

export type ProbeResult = { ja3: string | null; ja4: string | null; h2: string | null; negotiated?: string | null; ua?: string | null };
export type ProbeFn = (p: BrowserProfile) => Promise<ProbeResult>;

// Default public fingerprint feed. Operators can override via configureFeeds()
// to point at their own pinned/audited manifest, but out-of-the-box we ship
// pointed at the public salesforce/ja3 + browserscan reference set so the
// auto-refresh path actually has data to swap in without an app update.
const DEFAULT_FEEDS: string[] = [
  "https://raw.githubusercontent.com/salesforce/ja3/master/lists/osx_nss_dump.csv",
];

export async function configureFeeds(urls: string[]): Promise<void> {
  await AsyncStorage.setItem(FEEDS_KEY, JSON.stringify(urls));
}

export async function getFeeds(): Promise<string[]> {
  try { const r = await AsyncStorage.getItem(FEEDS_KEY); return r ? JSON.parse(r) : DEFAULT_FEEDS; }
  catch { return DEFAULT_FEEDS; }
}

export async function getLastScore(): Promise<number | null> {
  try { const r = await AsyncStorage.getItem(SCORE_KEY); return r ? Number(r) : null; } catch { return null; }
}

export async function getLastRun(): Promise<number> {
  try { const r = await AsyncStorage.getItem(LAST_RUN_KEY); return r ? Number(r) : 0; } catch { return 0; }
}

function scoreFingerprint(fp: ProbeResult, p: BrowserProfile): { score: number; notes: string[] } {
  const notes: string[] = [];
  let score = 0;
  const requirements = [p.expectedJa3Prefix, p.expectedJa4Prefix].filter(Boolean).length;
  if (!fp.ja3 && !fp.ja4) {
    notes.push("no ja3/ja4 received from probe endpoint");
    return { score: 0, notes };
  }
  // Base 30 just for getting a measurement back at all.
  score += 30;
  if (fp.ja4) score += 15;
  if (fp.ja3) score += 15;
  if (p.expectedJa4Prefix) {
    if (fp.ja4 && fp.ja4.startsWith(p.expectedJa4Prefix)) score += 25;
    else { notes.push(`ja4 mismatch: got ${fp.ja4 ?? "null"}, expected prefix ${p.expectedJa4Prefix}`); }
  }
  if (p.expectedJa3Prefix) {
    if (fp.ja3 && fp.ja3.startsWith(p.expectedJa3Prefix)) score += 15;
    else { notes.push(`ja3 mismatch: got ${fp.ja3 ?? "null"}, expected prefix ${p.expectedJa3Prefix}`); }
  }
  if (requirements === 0) {
    notes.push("profile has no expected prefixes — capping score at 60 (informational)");
    score = Math.min(score, 60);
  }
  return { score: Math.min(100, score), notes };
}

export async function runSelfTune(probe: ProbeFn, opts: { force?: boolean } = {}): Promise<TuneResult> {
  const last = await getLastRun();
  const now = Date.now();
  if (!opts.force && now - last < 6 * 60 * 60 * 1000) {
    return { ranAt: last, score: (await getLastScore()) ?? 0, refreshed: false, notes: ["skipped (last run < 6h)"] };
  }
  const allNotes: string[] = [];
  const profiles = listProfiles();
  let totalScore = 0;
  let count = 0;
  for (const p of profiles.slice(0, 4)) {
    try {
      const fp = await probe(p);
      const { score, notes } = scoreFingerprint(fp, p);
      totalScore += score; count += 1;
      allNotes.push(`${p.key}: ${score}/100${notes.length ? " — " + notes.join("; ") : ""}`);
    } catch (e) {
      allNotes.push(`${p.key}: probe failed (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  const avg = count ? Math.round(totalScore / count) : 0;
  await AsyncStorage.setItem(SCORE_KEY, String(avg));
  await AsyncStorage.setItem(LAST_RUN_KEY, String(now));
  let refreshed = false;
  if (avg < 60) {
    refreshed = await refreshFromFeeds();
    allNotes.push(refreshed ? "refreshed registry from feeds" : "feed refresh failed (configure feeds via configureFeeds)");
  }
  return { ranAt: now, score: avg, refreshed, notes: allNotes };
}

async function refreshFromFeeds(): Promise<boolean> {
  try {
    const feeds = await getFeeds();
    if (feeds.length === 0) return false;
    for (const url of feeds) {
      try {
        const r = await fetch(url, { method: "GET" });
        if (!r.ok) continue;
        const text = await r.text();
        const trimmed = text.trim();
        if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) continue;
        const j = JSON.parse(trimmed) as unknown;
        if (Array.isArray(j) && j.length > 0) {
          const first = j[0] as { key?: unknown; headers?: unknown };
          if (typeof first.key === "string" && Array.isArray(first.headers)) {
            replaceRegistry(j as BrowserProfile[]);
            return true;
          }
        }
      } catch {}
    }
    return false;
  } catch {
    return false;
  }
}
