import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { 
  Package, 
  ArrowLeft, 
  Search, 
  RefreshCw, 
  Play, 
  Loader2, 
  X, 
  CheckCircle, 
  XCircle,
  Download,
  Check
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SoftwareItem {
  id: string;
  name: string;
}

interface Category {
  category: string;
  icon: string;
  items: SoftwareItem[];
}

interface StatusEntry {
  installed: boolean;
  version: string;
}

export default function SoftwarePage() {
  const [, navigate] = useLocation();
  const [catalog, setCatalog] = useState<Category[]>([]);
  const [status, setStatus] = useState<Record<string, StatusEntry>>({});
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [installOutput, setInstallOutput] = useState<{ id: string; output: string; ok: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCmd, setCustomCmd] = useState("");
  const [customInstalling, setCustomInstalling] = useState(false);

  const checkStatus = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    try {
      const res = await fetch(`${BASE}/api/software/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      setStatus((prev) => ({ ...prev, ...(data.status ?? {}) }));
    } catch {}
  }, []);

  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const res = await fetch(`${BASE}/api/software/catalog`);
      const data = await res.json();
      setCatalog(data.catalog ?? []);
      const allIds = (data.catalog ?? []).flatMap((c: Category) => c.items.map((i) => i.id));
      checkStatus(allIds);
    } catch (e) {
    } finally {
      setLoadingCatalog(false);
    }
  }, [checkStatus]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const install = useCallback(async (id: string) => {
    setInstallingId(id);
    setInstallOutput(null);
    try {
      const res = await fetch(`${BASE}/api/software/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      setInstallOutput({ id, output: data.output ?? data.error ?? "", ok: !!data.ok });
      if (data.ok) {
        setStatus((prev) => ({ ...prev, [id]: { installed: true, version: "" } }));
        checkStatus([id]);
      }
    } catch (e: any) {
      setInstallOutput({ id, output: e.message, ok: false });
    } finally {
      setInstallingId(null);
    }
  }, [checkStatus]);

  const installCustom = useCallback(async () => {
    if (!customCmd.trim()) return;
    setCustomInstalling(true);
    setInstallOutput(null);
    try {
      const res = await fetch(`${BASE}/api/software/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customCommand: customCmd.trim() }),
      });
      const data = await res.json();
      setInstallOutput({ id: "custom", output: data.output ?? data.error ?? "", ok: !!data.ok });
    } catch (e: any) {
      setInstallOutput({ id: "custom", output: e.message, ok: false });
    } finally {
      setCustomInstalling(false);
    }
  }, [customCmd]);

  const categories = catalog.map((c) => c.category);
  const filtered = catalog.map((cat) => ({
    ...cat,
    items: cat.items.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter((cat) =>
    (selectedCategory === null || cat.category === selectedCategory) && cat.items.length > 0
  );

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] font-mono flex flex-col">
      {/* Header */}
      <div className="border-b border-[#30363d] bg-[#161b22] px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-[#8b949e] hover:text-[#e6edf3] transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="w-px h-4 bg-[#30363d]" />
        <Package className="w-4 h-4 text-[#d29922]" />
        <div className="flex flex-col">
          <span className="text-[#e6edf3] font-bold text-sm leading-none">SOFTWARE</span>
          <span className="text-[#8b949e] text-[10px] uppercase font-bold tracking-wider">Install & Manage</span>
        </div>
        <button onClick={fetchCatalog} className="ml-auto text-[#8b949e] hover:text-[#e6edf3] p-1">
          <RefreshCw className={`w-4 h-4 ${loadingCatalog ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search software..."
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg pl-10 pr-4 py-2.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-sm"
            />
          </div>

          {/* Category Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${selectedCategory === null ? "bg-[#d29922]/10 border-[#d29922] text-[#d29922]" : "bg-[#161b22] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"}`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${selectedCategory === cat ? "bg-[#d29922]/10 border-[#d29922] text-[#d29922]" : "bg-[#161b22] border-[#30363d] text-[#8b949e] hover:border-[#8b949e]"}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Custom Install */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-[#8b949e] uppercase tracking-wider">Custom Install Command</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={customCmd}
                onChange={e => setCustomCmd(e.target.value)}
                placeholder="nix-env -iA nixpkgs.nmap   or   pip3 install requests"
                className="flex-1 bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2.5 text-[#e6edf3] focus:outline-none focus:border-[#58a6ff] text-xs font-mono"
              />
              <button
                disabled={!customCmd.trim() || customInstalling}
                onClick={installCustom}
                className="w-11 bg-[#d29922] hover:bg-[#d29922]/90 disabled:opacity-50 text-black rounded-lg flex items-center justify-center transition-colors"
              >
                {customInstalling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
            </div>
          </div>

          {/* Install Output */}
          {installOutput && (
            <div className={`p-4 border rounded-lg space-y-3 ${installOutput.ok ? "bg-[#0d2d1a] border-[#3fb950]/30" : "bg-[#3d1a1a] border-[#f85149]/30"}`}>
              <div className="flex items-center gap-2">
                {installOutput.ok ? <CheckCircle className="w-4 h-4 text-[#3fb950]" /> : <XCircle className="w-4 h-4 text-[#f85149]" />}
                <span className={`text-sm font-bold flex-1 ${installOutput.ok ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                  {installOutput.ok ? "Installed successfully" : "Install failed"}
                </span>
                <button onClick={() => setInstallOutput(null)}><X className="w-4 h-4 text-[#8b949e]" /></button>
              </div>
              <div className="max-h-40 overflow-y-auto bg-black/40 p-3 rounded font-mono text-[10px] leading-relaxed text-[#e6edf3] whitespace-pre-wrap">
                {installOutput.output}
              </div>
            </div>
          )}

          {/* Catalog */}
          {loadingCatalog ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#d29922]" /></div>
          ) : (
            <div className="space-y-8">
              {filtered.map(cat => (
                <div key={cat.category} className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[10px] font-bold text-[#d29922] uppercase tracking-widest">{cat.category}</span>
                  </div>
                  <div className="grid gap-2">
                    {cat.items.map(item => {
                      const st = status[item.id];
                      const isInstalling = installingId === item.id;
                      return (
                        <div key={item.id} className="flex items-center justify-between p-4 bg-[#161b22] border border-[#30363d] rounded-lg">
                          <div className="flex-1">
                            <div className="font-bold text-[#e6edf3] text-sm">{item.name}</div>
                            {st?.version ? (
                              <div className="text-[10px] text-[#8b949e] font-mono mt-0.5 truncate max-w-[200px]">{st.version}</div>
                            ) : st?.installed ? (
                              <div className="text-[10px] text-[#3fb950] font-bold mt-0.5">Installed</div>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-3">
                            {st?.installed && !isInstalling && (
                              <div className="flex items-center gap-1 text-[#3fb950] text-[10px] font-bold bg-[#3fb950]/10 px-2 py-0.5 rounded border border-[#3fb950]/20">
                                <Check className="w-3 h-3" /> Installed
                              </div>
                            )}
                            <button
                              disabled={!!installingId}
                              onClick={() => install(item.id)}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded font-bold text-xs transition-colors ${st?.installed && !isInstalling ? "bg-[#21262d] text-[#8b949e] hover:bg-[#30363d] hover:text-[#e6edf3] border border-[#30363d]" : "bg-[#d29922] text-black hover:bg-[#d29922]/90 disabled:opacity-50"}`}
                            >
                              {isInstalling ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Installing...</span>
                                </>
                              ) : (
                                <>
                                  {st?.installed ? <RefreshCw className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                                  <span>{st?.installed ? "Reinstall" : "Install"}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
