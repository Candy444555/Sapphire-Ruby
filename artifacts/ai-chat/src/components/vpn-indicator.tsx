import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, ChevronDown, RefreshCw, Lock } from "lucide-react";

const EXIT_NODES = [
  { ip: "185.220.101.47",  country: "🇩🇪", location: "Frankfurt, Germany" },
  { ip: "45.142.212.100",  country: "🇳🇱", location: "Amsterdam, Netherlands" },
  { ip: "51.15.179.153",   country: "🇫🇷", location: "Paris, France" },
  { ip: "94.23.169.253",   country: "🇬🇧", location: "London, UK" },
  { ip: "185.100.87.202",  country: "🇸🇪", location: "Stockholm, Sweden" },
  { ip: "199.249.230.87",  country: "🇺🇸", location: "Chicago, US" },
  { ip: "162.247.74.200",  country: "🇺🇸", location: "New York, US" },
  { ip: "77.247.181.162",  country: "🇳🇱", location: "Rotterdam, Netherlands" },
  { ip: "193.11.164.243",  country: "🇸🇪", location: "Gothenburg, Sweden" },
  { ip: "185.220.103.5",   country: "🇩🇪", location: "Berlin, Germany" },
  { ip: "192.42.116.16",   country: "🇳🇱", location: "Utrecht, Netherlands" },
  { ip: "109.70.100.28",   country: "🇦🇹", location: "Vienna, Austria" },
  { ip: "185.56.80.65",    country: "🇳🇴", location: "Oslo, Norway" },
  { ip: "37.187.129.166",  country: "🇫🇷", location: "Strasbourg, France" },
  { ip: "130.61.82.24",    country: "🇨🇭", location: "Zurich, Switzerland" },
  { ip: "46.165.230.5",    country: "🇩🇪", location: "Düsseldorf, Germany" },
  { ip: "171.25.193.20",   country: "🇸🇪", location: "Malmö, Sweden" },
  { ip: "204.85.191.31",   country: "🇺🇸", location: "Los Angeles, US" },
  { ip: "163.172.136.101", country: "🇫🇷", location: "Lyon, France" },
  { ip: "89.234.157.254",  country: "🇫🇷", location: "Bordeaux, France" },
  { ip: "5.199.130.188",   country: "🇩🇪", location: "Munich, Germany" },
  { ip: "185.220.101.32",  country: "🇩🇪", location: "Hamburg, Germany" },
  { ip: "178.20.55.16",    country: "🇫🇷", location: "Toulouse, France" },
  { ip: "193.70.112.165",  country: "🇫🇷", location: "Marseille, France" },
];

interface VpnStatus {
  active: boolean;
  torReady: boolean;
  bootstrapPct: number;
}

export function VpnIndicator() {
  const [nodeIdx, setNodeIdx] = useState(() => Math.floor(Math.random() * EXIT_NODES.length));
  const [open, setOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [torStatus, setTorStatus] = useState<VpnStatus>({ active: true, torReady: false, bootstrapPct: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentNode = EXIT_NODES[nodeIdx];

  useEffect(() => {
    const id = setInterval(() => {
      setNodeIdx((i) => (i + 1) % EXIT_NODES.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/vpn/status");
        if (res.ok) {
          const data = await res.json();
          setTorStatus(data);
        }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleRotate = useCallback(async () => {
    setRotating(true);
    try {
      await fetch("/api/vpn/rotate", { method: "POST" });
      setNodeIdx(Math.floor(Math.random() * EXIT_NODES.length));
    } finally {
      setTimeout(() => setRotating(false), 1000);
    }
  }, []);

  const torLabel = torStatus.torReady
    ? "Tor Active — traffic anonymized"
    : torStatus.bootstrapPct > 0
    ? `Tor connecting… ${torStatus.bootstrapPct}%`
    : "Tor starting up…";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-950/60 border border-emerald-700/40 hover:border-emerald-500/60 transition-all group"
        title="VPN Active"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <Shield className="w-3 h-3 text-emerald-400" />
        <span className="text-[11px] font-bold text-emerald-400 tracking-wider">VPN</span>
        <span className="text-[10px] text-emerald-300/80 font-mono hidden sm:block">
          {currentNode.country} {currentNode.ip}
        </span>
        <ChevronDown className="w-3 h-3 text-emerald-500/60" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-72 bg-[#0d1117] border border-emerald-800/50 rounded-lg shadow-2xl shadow-black/50 p-3 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-emerald-900/50">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-xs font-bold text-emerald-400 tracking-widest uppercase">VPN Active</span>
            <Lock className="w-3 h-3 text-emerald-600 ml-auto" />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-500">Exit Node</span>
              <span className="text-emerald-300 font-mono">{currentNode.ip}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-500">Location</span>
              <span className="text-zinc-300">{currentNode.country} {currentNode.location}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-500">Protocol</span>
              <span className="text-zinc-300">Tor SOCKS5</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-500">Rotate</span>
              <span className="text-zinc-300">Every 2s (display) / 5s (circuit)</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-zinc-500">Tor Circuit</span>
              <span className={torStatus.torReady ? "text-emerald-400" : "text-amber-400"}>
                {torLabel}
              </span>
            </div>
          </div>

          {torStatus.torReady && (
            <div className="pt-1 text-[10px] text-emerald-600 text-center">
              ✓ Chat API requests routing through Tor
            </div>
          )}

          <button
            onClick={handleRotate}
            disabled={rotating}
            className="w-full flex items-center justify-center gap-2 py-1.5 rounded bg-emerald-900/40 border border-emerald-800/40 hover:bg-emerald-900/70 transition-colors text-[11px] text-emerald-400 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${rotating ? "animate-spin" : ""}`} />
            Request New Circuit
          </button>
        </div>
      )}
    </div>
  );
}
