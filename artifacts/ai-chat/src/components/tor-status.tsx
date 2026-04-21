import { useEffect, useState } from "react";
import { Shield, ShieldOff, Loader2 } from "lucide-react";

interface VpnStatus {
  active: boolean;
  torReady: boolean;
  bootstrapPct: number;
  socksPort: number;
}

export function TorStatus() {
  const [status, setStatus] = useState<VpnStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/vpn/status");
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data: VpnStatus = await res.json();
        if (!cancelled) {
          setStatus(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  let label: string;
  let dotClass: string;
  let Icon = Shield;
  let containerClass = "border-border bg-card";

  if (error || !status) {
    label = "Tor Offline";
    dotClass = "bg-destructive";
    Icon = ShieldOff;
    containerClass = "border-destructive/30 bg-destructive/5";
  } else if (status.torReady) {
    label = "Tor Connected";
    dotClass = "bg-emerald-500";
    Icon = Shield;
    containerClass = "border-emerald-500/30 bg-emerald-500/5";
  } else {
    label = `Bootstrapping ${status.bootstrapPct}%`;
    dotClass = "bg-amber-500";
    Icon = Loader2;
    containerClass = "border-amber-500/30 bg-amber-500/5";
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${containerClass}`}>
      <Icon className={`w-3.5 h-3.5 ${error || !status ? "text-destructive" : status.torReady ? "text-emerald-500" : "text-amber-500 animate-spin"}`} />
      <span className="font-mono text-xs text-foreground flex-1">{label}</span>
      <span className={`w-2 h-2 rounded-full ${dotClass} ${status?.torReady ? "shadow-[0_0_8px] shadow-emerald-500/60" : ""}`} />
    </div>
  );
}
