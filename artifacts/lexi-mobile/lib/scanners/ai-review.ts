// AI code review tool. Calls Featherless directly when an API key is set
// (on-phone), falling back to /api/scan/ai-review on the server otherwise.
import { getApiBase, getApiUrl, getFeatherlessKey } from "@/lib/lexi-api";
import { log } from "@/lib/logger";
import { normalizeFinding, type NormalizedFinding, type RawFinding } from "@/lib/findings/contract";

const SYSTEM = [
  "You are an expert code reviewer. Read the supplied code/diff and emit a strict JSON array",
  "of structured findings. Each finding MUST have keys: id (kebab-case rule slug), severity",
  "(one of: critical, high, medium, low, info), file (string), line (number), summary (one",
  "sentence), why (short paragraph). Output ONLY the JSON array, no prose, no fences.",
].join(" ");

export type AiReviewInput = { filename?: string; code?: string; diff?: string };

export async function runAiReview(input: AiReviewInput, correlationId?: string): Promise<NormalizedFinding[]> {
  const content = (input.diff || input.code || "").slice(0, 60_000);
  if (!content.trim()) return [];
  const key = getFeatherlessKey();
  let raw: string = "[]";
  if (key) {
    log.info("scan", "ai-review:phone", { correlationId, target: input.filename ?? "(inline)" });
    const r = await fetch("https://api.featherless.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Filename: ${input.filename || "(unknown)"}\n\n${content}` },
        ],
        temperature: 0.2,
      }),
    });
    if (!r.ok) throw new Error(`featherless ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    raw = j.choices?.[0]?.message?.content || "[]";
  } else {
    if (!getApiBase()) throw new Error("No Featherless key set and no server URL configured.");
    log.info("scan", "ai-review:server", { correlationId, target: input.filename ?? "(inline)" });
    const r = await fetch(getApiUrl("/api/scan/ai-review"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!r.ok) throw new Error(`api-server ${r.status}`);
    const j = (await r.json()) as { findings?: RawFinding[] };
    return (j.findings ?? []).map((f) => normalizeFinding("ai-review", f, correlationId));
  }
  let arr: RawFinding[] = [];
  try {
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    const sliced = start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(sliced);
    if (Array.isArray(parsed)) arr = parsed;
  } catch { /* return empty */ }
  return arr.map((f) => normalizeFinding("ai-review", f, correlationId));
}
