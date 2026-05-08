// Behavioral pacer.
//
// - Token-bucket per host so bursts are smoothed
// - Log-normal jitter on inter-request delay (median configurable)
// - Warm-session simulator: first contact with a host fires a favicon GET
//   before the real request, so the server-side timeline reads "user opened
//   page, then made API call" instead of "API call out of nowhere"
// - Idle-gap injector: every N requests, sleep 4–6 minutes to mimic a human
//   reading
// - Honors Retry-After when the caller surfaces it via `noteRetryAfter`

export type PacerPreset = "balanced" | "stealth-max" | "burn-after-read";

type HostState = {
  bucket: number;
  lastRefill: number;
  warmedAt: number;
  inFlight: number;
  retryAfterUntil: number;
  consecutive: number;
};

type Cfg = {
  reqPerSec: number;
  jitterMedianMs: number;
  jitterSigma: number;
  idleEveryN: number;
  idleMinMs: number;
  idleMaxMs: number;
  warmFirstContact: boolean;
};

const PRESETS: Record<PacerPreset, Cfg> = {
  "balanced": { reqPerSec: 1, jitterMedianMs: 500, jitterSigma: 0.6, idleEveryN: 25, idleMinMs: 4 * 60_000, idleMaxMs: 6 * 60_000, warmFirstContact: true },
  "stealth-max": { reqPerSec: 0.3, jitterMedianMs: 1500, jitterSigma: 0.7, idleEveryN: 12, idleMinMs: 4 * 60_000, idleMaxMs: 6 * 60_000, warmFirstContact: true },
  "burn-after-read": { reqPerSec: 0.5, jitterMedianMs: 800, jitterSigma: 0.5, idleEveryN: 8, idleMinMs: 3 * 60_000, idleMaxMs: 5 * 60_000, warmFirstContact: false },
};

let cfg: Cfg = { ...PRESETS.balanced };
let activePreset: PacerPreset = "balanced";
const hosts = new Map<string, HostState>();
const telemetry: Array<{ host: string; waitMs: number; ts: number }> = [];

export function setPacerPreset(p: PacerPreset): void {
  activePreset = p;
  cfg = { ...PRESETS[p] };
}

export function getPacerPreset(): PacerPreset {
  return activePreset;
}

export function getPacerTelemetry() {
  return telemetry.slice(-200);
}

function logNormal(): number {
  // Box-Muller → normal(0,1), then exp(mu + sigma*z) — mu derived from median
  let u = 0; let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const mu = Math.log(cfg.jitterMedianMs);
  return Math.exp(mu + cfg.jitterSigma * z);
}

function getHost(url: string): string {
  try { return new URL(url).hostname; } catch { return "unknown"; }
}

export function noteRetryAfter(url: string, seconds: number): void {
  const host = getHost(url);
  const s = hosts.get(host) ?? blankHost();
  s.retryAfterUntil = Date.now() + Math.min(120_000, Math.max(0, seconds * 1000));
  hosts.set(host, s);
}

function blankHost(): HostState {
  return { bucket: 1, lastRefill: Date.now(), warmedAt: 0, inFlight: 0, retryAfterUntil: 0, consecutive: 0 };
}

export async function paceBeforeRequest(url: string, opts?: { skipIdle?: boolean }): Promise<{ shouldWarm: boolean }> {
  const host = getHost(url);
  let s = hosts.get(host);
  if (!s) { s = blankHost(); hosts.set(host, s); }
  const now = Date.now();
  if (s.retryAfterUntil > now) await sleep(s.retryAfterUntil - now);

  // refill bucket
  const elapsed = (now - s.lastRefill) / 1000;
  s.bucket = Math.min(1, s.bucket + elapsed * cfg.reqPerSec);
  s.lastRefill = now;
  if (s.bucket < 1) {
    const need = (1 - s.bucket) / cfg.reqPerSec;
    await sleep(need * 1000);
    s.bucket = 0;
    s.lastRefill = Date.now();
  } else {
    s.bucket -= 1;
  }
  // jitter
  const jitter = Math.min(15_000, Math.max(50, logNormal()));
  await sleep(jitter);
  telemetry.push({ host, waitMs: jitter, ts: Date.now() });
  if (telemetry.length > 500) telemetry.splice(0, telemetry.length - 500);

  s.consecutive += 1;
  if (!opts?.skipIdle && cfg.idleEveryN > 0 && s.consecutive >= cfg.idleEveryN) {
    s.consecutive = 0;
    const idle = cfg.idleMinMs + Math.random() * (cfg.idleMaxMs - cfg.idleMinMs);
    await sleep(idle);
  }

  const shouldWarm = cfg.warmFirstContact && (now - s.warmedAt > 30 * 60_000);
  if (shouldWarm) s.warmedAt = Date.now();
  return { shouldWarm };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}
