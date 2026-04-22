import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  User as UserIcon, 
  ArrowLeft, 
  LogOut, 
  CheckCircle, 
  Loader2, 
  Shield, 
  ExternalLink,
  Mail
} from "lucide-react";
import { useRootMode } from "@/lib/root-mode";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export default function ProfilePage() {
  const [, navigate] = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { enabled: rootEnabled, setEnabled: setRootEnabled } = useRootMode();

  useEffect(() => {
    fetchUser();
  }, []);

  async function fetchUser() {
    try {
      const res = await fetch(`${BASE}/api/auth/user`, {
        credentials: "include"
      });
      const data = await res.json();
      if (data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

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
        <UserIcon className="w-4 h-4 text-[#58a6ff]" />
        <span className="text-[#e6edf3] font-bold text-sm">Account Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-12 space-y-8">
          
          {loading ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#58a6ff]" />
              <p className="text-[#8b949e] text-sm tracking-widest">VERIFYING SESSION...</p>
            </div>
          ) : user ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center gap-4 p-8 bg-[#161b22] border border-[#30363d] rounded-2xl shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#58a6ff]" />
                
                {user.profileImageUrl ? (
                  <img src={user.profileImageUrl} className="w-24 h-24 rounded-full border-4 border-[#30363d] shadow-2xl" alt="Avatar" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[#30363d] flex items-center justify-center border-4 border-[#30363d] shadow-2xl">
                    <UserIcon className="w-12 h-12 text-[#8b949e]" />
                  </div>
                )}
                
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-bold text-[#e6edf3]">
                    {[user.firstName, user.lastName].filter(Boolean).join(" ") || "Nexuser"}
                  </h2>
                  <div className="flex items-center justify-center gap-1.5 text-xs text-[#8b949e]">
                    <Mail className="w-3 h-3" />
                    {user.email || "No public email"}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[#3fb950] text-xs font-bold border border-[#3fb950]/30 px-4 py-2 rounded-full bg-[#3fb950]/5 mt-2">
                  <CheckCircle className="w-3.5 h-3.5" /> 
                  Replit Authenticated
                </div>

                <a
                  href={`${BASE}/api/logout`}
                  className="mt-6 flex items-center gap-2 px-6 py-2.5 bg-[#161b22] hover:bg-[#3d1a1a]/20 border border-[#30363d] hover:border-[#f85149]/40 rounded-lg text-sm font-bold text-[#8b949e] hover:text-[#f85149] transition-all group"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </a>
              </div>

              {/* Security info */}
              <div className="p-5 bg-[#161b22] border border-[#30363d] rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-[#58a6ff] text-[10px] font-bold uppercase tracking-widest">
                  <Shield className="w-3.5 h-3.5" /> Nexus Shield Security
                </div>
                <p className="text-[11px] text-[#8b949e] leading-relaxed">
                  Your session is protected by Replit OIDC. All data is encrypted and synced across your devices automatically. 
                  Terminal root access requires active authentication.
                </p>
              </div>

              {/* Root Mode (ported from Lexi mobile) */}
              <div className="p-5 bg-[#161b22] border border-[#30363d] rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#d29922]" />
                    <span className="text-[#e6edf3] text-sm font-bold">Root Mode</span>
                  </div>
                  <button
                    onClick={() => setRootEnabled(!rootEnabled)}
                    aria-label="Toggle root mode"
                    className={`relative w-11 h-6 rounded-full transition-colors ${rootEnabled ? "bg-[#d29922]" : "bg-[#30363d]"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-[#e6edf3] transition-transform ${rootEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
                <p className="text-[11px] text-[#8b949e] leading-relaxed">
                  When enabled, terminal commands run with elevated privileges and the AI assistant operates without confirmation prompts. {rootEnabled ? <span className="text-[#d29922] font-bold">ACTIVE</span> : <span className="text-[#8b949e]">Disabled</span>}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 p-10 bg-[#161b22] border border-[#30363d] rounded-2xl text-center">
              <div className="w-20 h-20 rounded-full bg-[#30363d]/50 flex items-center justify-center">
                <Shield className="w-10 h-10 text-[#8b949e] opacity-30" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-[#e6edf3]">Access Restricted</h2>
                <p className="text-sm text-[#8b949e] leading-relaxed">
                  Sign in with your Replit account to unlock GitHub integration, remote software management, and secure file uploads.
                </p>
              </div>
              <a
                href={`${BASE}/api/login`}
                className="w-full flex items-center justify-center gap-3 py-3 bg-[#58a6ff] hover:bg-[#58a6ff]/90 text-black font-bold rounded-lg transition-all"
              >
                <UserIcon className="w-5 h-5 fill-current" />
                Sign in with Replit
              </a>
            </div>
          )}

          <div className="pt-8 text-center border-t border-[#30363d]">
            <a href="https://replit.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] text-[#8b949e] hover:text-[#e6edf3] transition-colors">
              Lexi Nexus Web v1.0.0 <ExternalLink className="w-3 h-3" />
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
