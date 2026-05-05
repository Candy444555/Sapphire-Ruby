import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const FL_BASE = "https://api.featherless.ai/v1";
const DEFAULT_MODEL = "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2";

const SYSTEM = [
  "You are an expert code reviewer. Read the supplied code/diff and emit a strict JSON array",
  "of structured findings. Each finding MUST have keys: id (kebab-case rule slug), severity",
  "(one of: critical, high, medium, low, info), file (string), line (number), summary (one",
  "sentence), why (short paragraph). Output ONLY the JSON array, no prose, no fences.",
].join(" ");

router.post("/scan/ai-review", async (req: Request, res: Response) => {
  const body = (req.body || {}) as { code?: string; diff?: string; filename?: string; apiKey?: string; model?: string };
  const content = (body.diff || body.code || "").slice(0, 60_000);
  if (!content.trim()) { res.status(400).json({ error: "code or diff required" }); return; }
  const apiKey = body.apiKey || process.env.FEATHERLESS_API_KEY || "";
  if (!apiKey) { res.status(400).json({ error: "Featherless API key missing (Profile → set key)" }); return; }
  try {
    const r = await fetch(`${FL_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: body.model || DEFAULT_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Filename: ${body.filename || "(unknown)"}\n\n${content}` },
        ],
        temperature: 0.2,
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      res.status(r.status).json({ error: `featherless ${r.status}`, detail: err.slice(0, 500) });
      return;
    }
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = j.choices?.[0]?.message?.content || "[]";
    let findings: Array<Record<string, unknown>> = [];
    try {
      const start = raw.indexOf("[");
      const end = raw.lastIndexOf("]");
      const sliced = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
      const parsed = JSON.parse(sliced);
      if (Array.isArray(parsed)) findings = parsed;
    } catch { /* return empty */ }
    res.json({ tool: "ai-review", findings });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
