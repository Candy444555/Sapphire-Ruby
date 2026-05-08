// Background scheduler for the self-tune loop.
//
// React Native doesn't have OS-level periodic alarms, so we ride the JS
// event loop: schedule a check every 30 minutes, but `runSelfTune` itself
// is gated to skip if the last run was < 6h ago. So actual probe-and-rescore
// runs at most ~once per 6h, but if the app gets killed the next foregrounding
// will pick it up within 30 min.
import { runSelfTune, type ProbeFn } from "@/lib/stealth/self-tune";
import { cronetAvailable, cronetFingerprintProbe } from "@/lib/native/cronet";
import { pushOpsEvent } from "@/lib/stealth/operator-eyes";

let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

const defaultProbe: ProbeFn = async (p) => {
  if (!cronetAvailable()) return { ja3: null, ja4: null, h2: null };
  return cronetFingerprintProbe(p);
};

export function startSelfTuneScheduler(probe: ProbeFn = defaultProbe): void {
  if (started) return;
  started = true;
  // Kick once on startup (gated internally to 6h cool-down) and then every 30m.
  const tick = () => {
    runSelfTune(probe).then((r) => {
      pushOpsEvent("info", `self-tune ran score=${r.score} refreshed=${r.refreshed}`, { notes: r.notes });
    }).catch((e) => {
      pushOpsEvent("error", "self-tune failed", { error: String(e) });
    });
  };
  // Defer the first tick a bit so app boot isn't competing for resources.
  setTimeout(tick, 15_000);
  timer = setInterval(tick, 30 * 60 * 1000);
}

export function stopSelfTuneScheduler(): void {
  if (timer) { clearInterval(timer); timer = null; }
  started = false;
}
