import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SecretRow = { key: string; value: string | null; present: boolean };

export default function SecretsPage() {
  const [rows, setRows] = useState<SecretRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    fetch(`${BASE}/api/secrets`)
      .then((r) => r.json())
      .then((d) => setRows(d.secrets ?? []))
      .catch((e) => toast({ title: "Failed to load", description: String(e), variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const copy = async (key: string, value: string | null) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({ title: "Copied", description: key });
  };

  const copyAll = async () => {
    const text = rows
      .filter((r) => r.present)
      .map((r) => `${r.key}=${r.value}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied all secrets as .env" });
  };

  const mask = (v: string | null) => {
    if (!v) return "—";
    if (v.length <= 8) return "•".repeat(v.length);
    return v.slice(0, 4) + "•".repeat(Math.max(4, v.length - 8)) + v.slice(-4);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Secrets</h1>
          <Button onClick={copyAll} disabled={loading}>Copy all as .env</Button>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Click a row to reveal, or use the copy button. Values stay in your browser.
        </p>
        {loading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div
                key={r.key}
                className="border rounded-lg p-3 flex items-center justify-between gap-3 bg-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-semibold">{r.key}</div>
                  <button
                    type="button"
                    onClick={() => setRevealed((p) => ({ ...p, [r.key]: !p[r.key] }))}
                    className="font-mono text-xs text-muted-foreground break-all text-left w-full mt-1 hover:text-foreground"
                  >
                    {r.present ? (revealed[r.key] ? r.value : mask(r.value)) : "(not set)"}
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!r.present}
                  onClick={() => copy(r.key, r.value)}
                >
                  Copy
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
