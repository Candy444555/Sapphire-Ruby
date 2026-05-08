// Live verifier — what the Stealth card v2 polls to render real IP, exit IP,
// fingerprint hash and circuit info. All values are MEASURED, never synthetic.
import { cronetAvailable, cronetFingerprintProbe } from "@/lib/native/cronet";
import { getActiveProfile } from "@/lib/stealth/profiles";
import { getCircuitInfo, getTorStatus, torAvailable } from "@/lib/native/tor";

export type VerifierSnapshot = {
  realIp: string | null;
  exitIp: string | null;
  isTor: boolean;
  bootstrapped: number;
  circuit: Array<{ fingerprint: string; nickname: string; country: string | null }>;
  ja3: string | null;
  ja4: string | null;
  h2: string | null;
  negotiated: string | null;
  ua: string | null;
  profileKey: string;
  errors: string[];
};

export async function snapshot(): Promise<VerifierSnapshot> {
  const errors: string[] = [];
  const profile = getActiveProfile();
  let realIp: string | null = null;
  let exitIp: string | null = null;
  let isTor = false;
  let bootstrapped = 0;
  let circuit: VerifierSnapshot["circuit"] = [];
  let ja3: string | null = null;
  let ja4: string | null = null;
  let h2: string | null = null;
  let negotiated: string | null = null;
  let ua: string | null = null;

  if (torAvailable()) {
    try {
      const [ci, st] = await Promise.all([getCircuitInfo(), getTorStatus()]);
      circuit = ci.nodes;
      exitIp = ci.exitIp;
      isTor = ci.isReady;
      bootstrapped = st.bootstrapped;
    } catch (e) { errors.push(`tor: ${err(e)}`); }
  }

  // Real IP via direct (un-proxied) call — informational, never goes through
  // the stealth path.
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    if (r.ok) realIp = ((await r.json()) as { ip?: string }).ip ?? null;
  } catch (e) { errors.push(`real-ip: ${err(e)}`); }

  if (cronetAvailable()) {
    try {
      const fp = await cronetFingerprintProbe(profile);
      ja3 = fp.ja3; ja4 = fp.ja4; h2 = fp.h2; negotiated = fp.negotiated; ua = fp.ua;
    } catch (e) { errors.push(`fingerprint: ${err(e)}`); }
  }

  return { realIp, exitIp, isTor, bootstrapped, circuit, ja3, ja4, h2, negotiated, ua, profileKey: profile.key, errors };
}

function err(e: unknown): string { return e instanceof Error ? e.message : String(e); }
