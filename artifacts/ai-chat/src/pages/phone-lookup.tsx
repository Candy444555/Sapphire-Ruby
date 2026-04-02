import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Search, Phone, Globe, Shield, User, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Loader2, ArrowLeft, Info, MapPin, Signal, Hash } from "lucide-react";

interface PhoneInfo {
  original: string;
  formatted: string;
  national: string;
  internationalFormat: string;
  countryCode: string;
  callingCode: string;
  nationalNumber: string;
  numberType: string;
  uri: string | null;
  valid: boolean;
  areaCode: string;
  prefix: string;
  lineNumber: string;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface LookupResult {
  phoneInfo: PhoneInfo;
  searches: {
    general: SearchResult[];
    owner: SearchResult[];
    reports: SearchResult[];
    scam: SearchResult[];
  };
  sources: {
    whoCalled: Array<{ rating: string; comment: string; date: string }>;
    spyDialer: { name?: string; type?: string; city?: string; state?: string } | null;
    shouldIAnswer: { dangerLevel?: string; reports?: number; description?: string } | null;
  };
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function typeLabel(t: string) {
  const map: Record<string, string> = {
    MOBILE: "Mobile / Cell",
    FIXED_LINE: "Landline",
    FIXED_LINE_OR_MOBILE: "Landline or Mobile",
    TOLL_FREE: "Toll-Free",
    PREMIUM_RATE: "Premium Rate",
    SHARED_COST: "Shared Cost",
    VOIP: "VoIP",
    PERSONAL_NUMBER: "Personal Number",
    PAGER: "Pager",
    UAN: "UAN",
    VOICEMAIL: "Voicemail",
    UNKNOWN: "Unknown",
  };
  return map[t] ?? t;
}

function typeIcon(t: string) {
  if (t === "MOBILE") return "📱";
  if (t === "FIXED_LINE") return "☎️";
  if (t === "VOIP") return "🌐";
  if (t === "TOLL_FREE") return "🆓";
  if (t === "PREMIUM_RATE") return "💰";
  return "📞";
}

function DangerBadge({ level }: { level?: string }) {
  if (!level) return null;
  const l = level.toLowerCase();
  let color = "text-[#8b949e] bg-[#21262d]";
  let emoji = "⚪";
  if (l.includes("danger") || l.includes("unsafe") || l.includes("high") || l.includes("spam") || l.includes("scam")) {
    color = "text-[#f85149] bg-[#3d1a1a]"; emoji = "🔴";
  } else if (l.includes("neutral") || l.includes("medium") || l.includes("caution")) {
    color = "text-[#d29922] bg-[#2d2206]"; emoji = "🟡";
  } else if (l.includes("safe") || l.includes("ok") || l.includes("low")) {
    color = "text-[#3fb950] bg-[#0d2d1a]"; emoji = "🟢";
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      {emoji} {level}
    </span>
  );
}

function Collapsible({ title, icon, count, children }: { title: string; icon: React.ReactNode; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-[#30363d] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#161b22] hover:bg-[#1c2128] transition-colors"
      >
        <div className="flex items-center gap-2 text-[#e6edf3] font-semibold text-sm">
          {icon}
          {title}
          {count !== undefined && (
            <span className="px-1.5 py-0.5 bg-[#30363d] text-[#8b949e] text-xs rounded-full">{count}</span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-[#8b949e]" /> : <ChevronDown className="w-4 h-4 text-[#8b949e]" />}
      </button>
      {open && <div className="p-4 bg-[#0d1117]">{children}</div>}
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  return (
    <div className="border border-[#30363d] rounded-lg p-3 hover:border-[#58a6ff]/40 transition-colors bg-[#161b22]/50">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-[#58a6ff] text-sm font-medium leading-tight line-clamp-2">{result.title}</p>
        {result.url && (
          <a
            href={result.url.startsWith("http") ? result.url : `https://${result.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[#8b949e] hover:text-[#58a6ff] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
      {result.url && (
        <p className="text-[#3fb950] text-xs mb-1 truncate">{result.url}</p>
      )}
      <p className="text-[#8b949e] text-xs leading-relaxed">{result.snippet}</p>
    </div>
  );
}

export default function PhoneLookupPage() {
  const [, navigate] = useLocation();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const doLookup = async (num: string) => {
    const val = num.trim();
    if (!val) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch(`${BASE}/api/phone/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: val }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Lookup failed");
      }
      const data = await res.json() as LookupResult;
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const totalResults =
    (result?.searches.general.length ?? 0) +
    (result?.searches.owner.length ?? 0) +
    (result?.searches.reports.length ?? 0) +
    (result?.searches.scam.length ?? 0) +
    (result?.sources.whoCalled.length ?? 0) +
    (result?.sources.spyDialer ? 1 : 0) +
    (result?.sources.shouldIAnswer ? 1 : 0);

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
        <Phone className="w-4 h-4 text-[#58a6ff]" />
        <span className="text-[#e6edf3] font-bold text-sm">Reverse Phone Lookup</span>
        <span className="text-[#8b949e] text-xs ml-auto">OSINT · Internet-Wide Search</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

          {/* Hero search box */}
          <div className="text-center space-y-2 mb-6">
            <div className="text-[#58a6ff] text-2xl font-bold tracking-tight">📞 Phone OSINT</div>
            <p className="text-[#8b949e] text-sm">Enter any phone number to search the internet for owner info, reports, spam alerts, and more.</p>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8b949e]" />
              <input
                ref={inputRef}
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doLookup(phone)}
                placeholder="+1 (555) 867-5309 or 5558675309"
                className="w-full bg-[#161b22] border border-[#30363d] rounded-lg pl-10 pr-4 py-3 text-[#e6edf3] placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff] transition-colors text-sm"
              />
            </div>
            <button
              onClick={() => doLookup(phone)}
              disabled={loading || !phone.trim()}
              className="flex items-center gap-2 px-5 py-3 bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#8b949e] text-white rounded-lg font-semibold text-sm transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {loading ? "Searching..." : "Lookup"}
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-[#3d1a1a] border border-[#f85149]/40 rounded-lg text-[#f85149] text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {loading && (
            <div className="space-y-3">
              {["Parsing phone number...", "Searching general web...", "Hunting owner info...", "Checking spam reports...", "Querying OSINT databases..."].map((msg, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 bg-[#161b22] border border-[#30363d] rounded-lg text-sm text-[#8b949e]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#58a6ff]" />
                  {msg}
                </div>
              ))}
            </div>
          )}

          {result && (
            <div className="space-y-4">

              {/* Summary banner */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#0d2d1a] border border-[#3fb950]/30 rounded-lg">
                <div className="flex items-center gap-2 text-[#3fb950] text-sm font-semibold">
                  <Shield className="w-4 h-4" />
                  Scan complete — {totalResults} data points found
                </div>
                <span className={`text-xs px-2 py-0.5 rounded font-bold ${result.phoneInfo.valid ? "bg-[#3fb950]/20 text-[#3fb950]" : "bg-[#d29922]/20 text-[#d29922]"}`}>
                  {result.phoneInfo.valid ? "✓ Valid Number" : "⚠ Unverified"}
                </span>
              </div>

              {/* Phone Info Card */}
              <Collapsible title="Phone Number Details" icon={<Info className="w-4 h-4 text-[#58a6ff]" />}>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: "International", value: result.phoneInfo.formatted, icon: "🌐" },
                    { label: "National Format", value: result.phoneInfo.national, icon: "📞" },
                    { label: "Country", value: result.phoneInfo.countryCode, icon: "🗺️" },
                    { label: "Calling Code", value: result.phoneInfo.callingCode, icon: "#️⃣" },
                    { label: "Area Code", value: result.phoneInfo.areaCode, icon: "📍" },
                    { label: "Line Type", value: `${typeIcon(result.phoneInfo.numberType)} ${typeLabel(result.phoneInfo.numberType)}`, icon: "" },
                    { label: "Prefix", value: result.phoneInfo.prefix, icon: "🔢" },
                    { label: "Line Number", value: result.phoneInfo.lineNumber, icon: "🔢" },
                    { label: "Valid", value: result.phoneInfo.valid ? "✅ Yes" : "❌ No", icon: "" },
                  ].map(({ label, value, icon }) => (
                    <div key={label} className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
                      <div className="text-[#8b949e] text-xs mb-1">{label}</div>
                      <div className="text-[#e6edf3] text-sm font-semibold">{icon && `${icon} `}{value || "—"}</div>
                    </div>
                  ))}
                </div>
              </Collapsible>

              {/* SpyDialer */}
              {result.sources.spyDialer && (result.sources.spyDialer.name || result.sources.spyDialer.city) && (
                <Collapsible title="Owner / Caller Info" icon={<User className="w-4 h-4 text-[#d29922]" />}>
                  <div className="grid grid-cols-2 gap-3">
                    {result.sources.spyDialer.name && (
                      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
                        <div className="text-[#8b949e] text-xs mb-1">Name</div>
                        <div className="text-[#e6edf3] font-semibold text-sm">👤 {result.sources.spyDialer.name}</div>
                      </div>
                    )}
                    {result.sources.spyDialer.type && (
                      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
                        <div className="text-[#8b949e] text-xs mb-1">Line Type</div>
                        <div className="text-[#e6edf3] font-semibold text-sm">{result.sources.spyDialer.type}</div>
                      </div>
                    )}
                    {(result.sources.spyDialer.city || result.sources.spyDialer.state) && (
                      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
                        <div className="text-[#8b949e] text-xs mb-1">Location</div>
                        <div className="text-[#e6edf3] font-semibold text-sm">
                          📍 {[result.sources.spyDialer.city, result.sources.spyDialer.state].filter(Boolean).join(", ")}
                        </div>
                      </div>
                    )}
                  </div>
                </Collapsible>
              )}

              {/* Should I Answer */}
              {result.sources.shouldIAnswer && (
                <Collapsible title="Spam / Danger Rating" icon={<AlertTriangle className="w-4 h-4 text-[#f85149]" />}>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      {result.sources.shouldIAnswer.dangerLevel && (
                        <div className="flex items-center gap-2">
                          <span className="text-[#8b949e] text-xs">Danger Level:</span>
                          <DangerBadge level={result.sources.shouldIAnswer.dangerLevel} />
                        </div>
                      )}
                      {result.sources.shouldIAnswer.reports !== undefined && (
                        <div className="flex items-center gap-2">
                          <span className="text-[#8b949e] text-xs">Reports:</span>
                          <span className="text-[#f85149] font-bold text-sm">{result.sources.shouldIAnswer.reports}</span>
                        </div>
                      )}
                    </div>
                    {result.sources.shouldIAnswer.description && (
                      <p className="text-[#8b949e] text-sm leading-relaxed border-l-2 border-[#30363d] pl-3">
                        {result.sources.shouldIAnswer.description}
                      </p>
                    )}
                  </div>
                </Collapsible>
              )}

              {/* Who Called Comments */}
              {result.sources.whoCalled.length > 0 && (
                <Collapsible title="Community Reports" icon={<AlertTriangle className="w-4 h-4 text-[#d29922]" />} count={result.sources.whoCalled.length}>
                  <div className="space-y-3">
                    {result.sources.whoCalled.map((r, i) => (
                      <div key={i} className="bg-[#161b22] border border-[#30363d] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[#d29922] text-xs font-semibold">{r.rating}</span>
                          {r.date && <span className="text-[#8b949e] text-xs">{r.date}</span>}
                        </div>
                        <p className="text-[#8b949e] text-sm">{r.comment}</p>
                      </div>
                    ))}
                  </div>
                </Collapsible>
              )}

              {/* Owner search results */}
              {result.searches.owner.length > 0 && (
                <Collapsible title="Owner / Identity Results" icon={<User className="w-4 h-4 text-[#58a6ff]" />} count={result.searches.owner.length}>
                  <div className="space-y-2">
                    {result.searches.owner.map((r, i) => <SearchResultCard key={i} result={r} />)}
                  </div>
                </Collapsible>
              )}

              {/* Scam/report results */}
              {result.searches.scam.length > 0 && (
                <Collapsible title="Who Called Me / Scam Reports" icon={<AlertTriangle className="w-4 h-4 text-[#f85149]" />} count={result.searches.scam.length}>
                  <div className="space-y-2">
                    {result.searches.scam.map((r, i) => <SearchResultCard key={i} result={r} />)}
                  </div>
                </Collapsible>
              )}

              {/* Complaint/report results */}
              {result.searches.reports.length > 0 && (
                <Collapsible title="Complaints & Reports" icon={<Shield className="w-4 h-4 text-[#d29922]" />} count={result.searches.reports.length}>
                  <div className="space-y-2">
                    {result.searches.reports.map((r, i) => <SearchResultCard key={i} result={r} />)}
                  </div>
                </Collapsible>
              )}

              {/* General search results */}
              {result.searches.general.length > 0 && (
                <Collapsible title="General Internet Search" icon={<Globe className="w-4 h-4 text-[#8b949e]" />} count={result.searches.general.length}>
                  <div className="space-y-2">
                    {result.searches.general.map((r, i) => <SearchResultCard key={i} result={r} />)}
                  </div>
                </Collapsible>
              )}

              {totalResults === 0 && (
                <div className="text-center py-10 text-[#8b949e] text-sm space-y-2">
                  <div className="text-3xl">🔍</div>
                  <p>No public information found for this number.</p>
                  <p className="text-xs">This number may be new, unlisted, or not yet reported online.</p>
                </div>
              )}

              {/* Search links */}
              <div className="border border-[#30363d] rounded-lg p-4 bg-[#161b22]/50">
                <div className="text-[#8b949e] text-xs mb-3 font-semibold uppercase tracking-wide">Search Manually</div>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Google", url: `https://www.google.com/search?q="${encodeURIComponent(result.phoneInfo.national)}"` },
                    { label: "SpyDialer", url: `https://www.spydialer.com/default.aspx?p=${result.phoneInfo.nationalNumber}` },
                    { label: "WhoCalledUs", url: `https://whocalledus.com/calls/${result.phoneInfo.areaCode}-${result.phoneInfo.prefix}-${result.phoneInfo.lineNumber}/` },
                    { label: "800Notes", url: `https://800notes.com/Phone.aspx/${result.phoneInfo.national}` },
                    { label: "ShouldIAnswer", url: `https://www.shouldianswer.com/phone-number/${result.phoneInfo.areaCode}-${result.phoneInfo.prefix}-${result.phoneInfo.lineNumber}` },
                    { label: "TrueCaller", url: `https://www.truecaller.com/search/us/${result.phoneInfo.nationalNumber}` },
                    { label: "FTC Lookup", url: `https://www.donotcall.gov/` },
                  ].map(({ label, url }) => (
                    <a
                      key={label}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] border border-[#30363d] rounded text-[#8b949e] hover:text-[#e6edf3] text-xs transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {label}
                    </a>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
