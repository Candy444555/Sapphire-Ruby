// Generates a candidate scanner from a natural-language description.
// Used by the Scan tab "Forge Tool" form and by the chat slash-command.
import { getApiBase, getApiUrl, getFeatherlessKey } from "@/lib/lexi-api";
import { log } from "@/lib/logger";
import { enqueuePending, type ForgedToolSpec } from "./approval-queue";

export type ForgeRequest = {
  name: string;
  description: string;
  language: ForgedToolSpec["language"];
  targetFileTypes: string[];
  detectionPrompt: string;
  origin: ForgedToolSpec["origin"];
};

const SYSTEM_JS =
  "You write JavaScript code scanners. Output ONLY a single JS code block content (no fences). " +
  "The code MUST define `function scan(file) { /* file: {name, text} */ return findings; }` returning " +
  "an array of findings shaped like { id, severity ('high'|'medium'|'low'|'info'), title, file, line, description }.";
const SYSTEM_PY =
  "You write Python static-analysis rules. Output ONLY the Python source (no fences). " +
  "The script reads a file path from sys.argv[1] and prints a JSON array of findings " +
  "with keys: id, severity, title, file, line, description.";
const SYSTEM_SG =
  "You write Semgrep YAML rules. Output ONLY the YAML rule body (no fences), starting with `rules:`.";

function systemFor(lang: ForgedToolSpec["language"]): string {
  if (lang === "javascript") return SYSTEM_JS;
  if (lang === "python") return SYSTEM_PY;
  return SYSTEM_SG;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || `forged-${Date.now().toString(36)}`;
}

async function generateSource(req: ForgeRequest): Promise<string> {
  const userPrompt = [
    `Tool name: ${req.name}`,
    `Description: ${req.description}`,
    `Target file extensions: ${req.targetFileTypes.join(", ") || "*"}`,
    `Detection logic: ${req.detectionPrompt}`,
  ].join("\n");
  const key = getFeatherlessKey();
  if (key) {
    const { stealthFetch } = await import("@/lib/stealth-fetch");
    const r = await stealthFetch("https://api.featherless.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",
        messages: [
          { role: "system", content: systemFor(req.language) },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      }),
    });
    if (!r.ok) throw new Error(`featherless ${r.status}`);
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return stripFences(j.choices?.[0]?.message?.content ?? "");
  }
  if (!getApiBase()) throw new Error("Need either a Featherless key or a server URL.");
  const r = await fetch(getApiUrl("/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: userPrompt }],
      systemPrompt: systemFor(req.language),
    }),
  });
  if (!r.ok) throw new Error(`api-server ${r.status}`);
  const text = await r.text();
  return stripFences(text);
}

function stripFences(s: string): string {
  return s.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
}

export async function forgeFromRequest(req: ForgeRequest): Promise<ForgedToolSpec> {
  log.info("scan", "forge:generate", { actor: "user", target: req.name, outputs: { origin: req.origin, language: req.language } });
  const source = await generateSource(req);
  const slug = slugify(req.name);
  const spec: ForgedToolSpec = {
    slug,
    label: req.name,
    description: req.description,
    language: req.language,
    targetFileTypes: req.targetFileTypes,
    source,
    origin: req.origin,
    createdAt: Date.now(),
  };
  await enqueuePending(spec);
  return spec;
}
