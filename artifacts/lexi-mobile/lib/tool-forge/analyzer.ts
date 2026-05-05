// Background analyzer: tails the in-app log buffer, clusters similar findings,
// and emits a draft rule when a cluster exceeds the threshold. Operator must
// approve before anything is installed or runs.
import { getRecentEntries, subscribeLogs, log } from "@/lib/logger";
import { enqueuePending, listPending, listInstalled, type ForgedToolSpec } from "./approval-queue";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ENABLED_KEY = "@lexi/forge_autosuggest";
const THRESHOLD = 3; // N similar findings before suggesting

let _enabled = true;
let installed = false;
let unsubscribe: (() => void) | null = null;

export async function loadAutosuggest(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ENABLED_KEY);
    if (v != null) _enabled = v === "1";
  } catch { /* ignore */ }
  return _enabled;
}
export async function setAutosuggest(on: boolean): Promise<void> {
  _enabled = on;
  try { await AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0"); } catch { /* ignore */ }
}
export function getAutosuggest(): boolean { return _enabled; }

function clusterKey(entry: ReturnType<typeof getRecentEntries>[number]): string | null {
  if (entry.category !== "scan" || entry.action !== "finding") return null;
  const o = (entry.outputs ?? {}) as Record<string, unknown>;
  const tool = entry.actor.startsWith("scanner:") ? entry.actor.slice("scanner:".length) : "unknown";
  const id = String(o.id ?? "");
  if (!id) return null;
  return `${tool}::${id}`;
}

async function maybeSuggest(key: string, count: number, sample: { tool: string; id: string; title: string }) {
  const pending = await listPending();
  const installedTools = await listInstalled();
  const slug = `auto-${sample.tool}-${sample.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 48);
  if (pending.find((p) => p.slug === slug) || installedTools.find((p) => p.slug === slug)) return;
  const spec: ForgedToolSpec = {
    slug,
    label: `Auto: ${sample.title || sample.id}`,
    description: `Auto-suggested rule from ${count} similar findings of ${sample.tool}:${sample.id}`,
    language: "javascript",
    targetFileTypes: ["*"],
    source: `// Draft rule generated from clustered findings (key=${key})\n` +
      `function scan(file) {\n  const out = [];\n  // TODO: tighten this regex; placeholder fires when ${JSON.stringify(sample.id)} appears.\n` +
      `  const re = new RegExp(${JSON.stringify(sample.id.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"))}, "g");\n` +
      `  let m;\n  while ((m = re.exec(file.text)) !== null) {\n    const line = file.text.slice(0, m.index).split("\\n").length;\n` +
      `    out.push({ id: ${JSON.stringify(slug)}, severity: "low", title: ${JSON.stringify("Auto-clustered: " + sample.id)}, file: file.name, line });\n` +
      `  }\n  return out;\n}\n`,
    origin: "auto-suggest",
    createdAt: Date.now(),
  };
  await enqueuePending(spec);
  log.info("scan", "forge:autosuggest", { actor: "system", target: slug, outputs: { count } });
}

const counts = new Map<string, { n: number; sample: { tool: string; id: string; title: string } }>();

export function startAnalyzer() {
  if (installed) return;
  installed = true;
  // Seed counts from recent entries first.
  for (const e of getRecentEntries()) {
    const k = clusterKey(e); if (!k) continue;
    const o = (e.outputs ?? {}) as Record<string, unknown>;
    const tool = e.actor.startsWith("scanner:") ? e.actor.slice("scanner:".length) : "unknown";
    const cur = counts.get(k) ?? { n: 0, sample: { tool, id: String(o.id ?? ""), title: String(o.title ?? o.message ?? "") } };
    cur.n++;
    counts.set(k, cur);
  }
  unsubscribe = subscribeLogs((e) => {
    if (!_enabled) return;
    const k = clusterKey(e); if (!k) return;
    const o = (e.outputs ?? {}) as Record<string, unknown>;
    const tool = e.actor.startsWith("scanner:") ? e.actor.slice("scanner:".length) : "unknown";
    const cur = counts.get(k) ?? { n: 0, sample: { tool, id: String(o.id ?? ""), title: String(o.title ?? o.message ?? "") } };
    cur.n++;
    counts.set(k, cur);
    if (cur.n === THRESHOLD) void maybeSuggest(k, cur.n, cur.sample);
  });
  log.info("scan", "forge:analyzer-start", { actor: "system" });
}

export function stopAnalyzer() {
  unsubscribe?.(); unsubscribe = null; installed = false;
}
