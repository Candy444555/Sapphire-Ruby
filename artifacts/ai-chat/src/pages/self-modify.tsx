import { useState, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, Wand2, Loader2, Trash2, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useLexiSelfPatch } from "@/hooks/use-lexi-self-patch";

const STARTER = `// Define a function on window — it will be hot-loaded into Lexi instantly.
// Example: a base64 encoder helper.
window.lexi_b64 = function(text) {
  return btoa(unescape(encodeURIComponent(text)));
};
`;

export default function SelfModifyPage() {
  const { extensions, fuseCode, deleteExtension, clearExtensions, reloadExtensions, isLoading } = useLexiSelfPatch();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState(STARTER);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const submit = useCallback(async () => {
    setFeedback(null);
    const slug = name.trim() || `ext_${Date.now()}`;
    const ok = await fuseCode(slug, code, description.trim());
    setFeedback({ ok, msg: ok ? `Fused "${slug}" — hot-reloaded into Lexi.` : "Failed to fuse — check the code." });
  }, [name, description, code, fuseCode]);

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex flex-col">
      <div className="border-b border-border bg-card/40 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <Link to="/">
          <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </Link>
        <div className="w-px h-4 bg-border" />
        <Wand2 className="w-4 h-4 text-accent" />
        <div className="flex flex-col">
          <span className="font-bold text-sm leading-none">SELF-MODIFY</span>
          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">Hot-reload extensions</span>
        </div>
        <button onClick={reloadExtensions} className="ml-auto p-1.5 rounded-lg hover:bg-card text-muted-foreground hover:text-foreground" title="Reload extensions">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-xs text-muted-foreground leading-relaxed">
            Paste any JavaScript here. When you fuse it, the code is permanently saved server-side and re-injected into the browser without a page reload.
            Anything you attach to <code className="text-accent">window.*</code> becomes immediately callable from Lexi or the browser console.
          </div>

          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="extension_name (optional)"
                className="bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does it do? (optional)"
                className="bg-card border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="w-full min-h-[280px] bg-black/60 border border-border rounded-lg p-3 text-xs leading-relaxed focus:outline-none focus:border-accent text-foreground"
            />
            <div className="flex gap-2">
              <button
                disabled={isLoading || !code.trim()}
                onClick={submit}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-black font-bold text-sm disabled:opacity-50 hover:bg-accent/90"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Fuse & Hot-reload
              </button>
              <button
                onClick={() => { if (confirm("Wipe ALL extensions? This cannot be undone.")) clearExtensions(); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm hover:bg-destructive/20"
              >
                <Trash2 className="w-4 h-4" />
                Clear all
              </button>
            </div>
            {feedback && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border ${feedback.ok ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-400" : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                {feedback.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {feedback.msg}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active Extensions ({extensions.length})</h3>
            {extensions.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">None loaded yet.</p>
            ) : (
              <div className="grid gap-2">
                {extensions.map((ext) => (
                  <div key={ext.name} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-card border border-border">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{ext.name}</div>
                      {ext.description && <div className="text-[10px] text-muted-foreground truncate">{ext.description}</div>}
                    </div>
                    <button
                      onClick={() => deleteExtension(ext.name)}
                      className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
