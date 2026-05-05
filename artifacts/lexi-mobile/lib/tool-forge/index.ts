// Tool-Forge: lets the operator (or Lexi via chat) author new scanner
// tools at runtime. Forged tools are stored in AsyncStorage, run in a
// sandboxed Function() body, and registered alongside built-in tools.
//
// The forge has THREE entry modes (#22 / #23 / #24):
//   1. Auto-suggest from history  (suggestForgeTool)
//   2. Chat-to-scanner            (parseChatForgeRequest, used by chat slash)
//   3. Forge button               (mobile UI invokes forgeTool)
//
// Server-side execution of forged tools is task #24 — deferred. Phone-side
// execution works today.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl } from "@/lib/lexi-api";
import { log } from "@/lib/logger";
import { BUILTIN_TOOLS, type NormalizedFinding, type ToolDef } from "@/lib/scanners/registry";

const STORAGE_KEY = "@lexi/forged-tools/v1";
const APPROVAL_KEY = "@lexi/forged-tools/pending/v1";

export type ForgedToolMeta = {
  slug: string;
  name: string;
  description: string;
  language?: string;
  fileTypes?: string[];
  detectionLogic: string;
  createdAt: number;
  approvedAt?: number;
  source: "auto-suggest" | "chat" | "button";
};

export type ForgedTool = ForgedToolMeta & { code: string };

let _installed: ForgedTool[] = [];
let _pending: ForgedTool[] = [];
let _hydrated = false;

export async function hydrateForge(): Promise<void> {
  if (_hydrated) return;
  try {
    const i = await AsyncStorage.getItem(STORAGE_KEY);
    if (i) _installed = JSON.parse(i) as ForgedTool[];
  } catch {}
  try {
    const p = await AsyncStorage.getItem(APPROVAL_KEY);
    if (p) _pending = JSON.parse(p) as ForgedTool[];
  } catch {}
  _hydrated = true;
  // Register installed tools into the runtime registry.
  for (const t of _installed) registerForgedToolInRegistry(t);
}

async function persistInstalled() {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(_installed)); } catch {}
}
async function persistPending() {
  try { await AsyncStorage.setItem(APPROVAL_KEY, JSON.stringify(_pending)); } catch {}
}

function buildPhoneRunner(tool: ForgedTool): ToolDef["phoneRunner"] {
  return async (target) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
      const fn = new Function("target", `${tool.code}\nreturn (typeof scan === 'function') ? scan(target) : (typeof module !== 'undefined' && module.exports && module.exports.default) ? module.exports.default(target) : [];`);
      const result = await Promise.resolve(fn(target));
      const arr: NormalizedFinding[] = [];
      for (const x of Array.isArray(result) ? result : []) {
        if (!x || typeof x !== "object") continue;
        const f = x as Record<string, unknown>;
        const sev = String(f.severity ?? "medium");
        arr.push({
          tool: tool.slug,
          severity: (["low","medium","high","critical"].includes(sev) ? sev : "medium") as NormalizedFinding["severity"],
          file: target.filename,
          line: typeof f.line === "number" ? f.line : undefined,
          rule: String(f.rule ?? tool.slug),
          summary: String(f.summary ?? "Forged-tool finding"),
          raw: f,
        });
      }
      return arr;
    } catch (err) {
      log.error("scan", "forged-tool:exception", {
        actor: `scanner:${tool.slug}` as const,
        error: { message: err instanceof Error ? err.message : String(err) },
      });
      return [{
        tool: tool.slug, severity: "low", file: target.filename, rule: "forge-exception",
        summary: `Forged tool crashed: ${err instanceof Error ? err.message : String(err)}`,
      }];
    }
  };
}

function registerForgedToolInRegistry(tool: ForgedTool): void {
  if (BUILTIN_TOOLS.find((t) => t.id === tool.slug)) return; // do not override
  BUILTIN_TOOLS.push({
    id: tool.slug,
    label: `${tool.name} (forged)`,
    description: tool.description || "User-forged scanner",
    category: "forged",
    runsOn: "phone",
    needsServer: false,
    acceptsSources: ["file", "screen"],
    phoneRunner: buildPhoneRunner(tool),
  });
}

export function getInstalledForgedTools(): ForgedTool[] {
  return [..._installed];
}
export function getPendingForgedTools(): ForgedTool[] {
  return [..._pending];
}

// Ask the server to author a scanner. The result lands in the pending queue.
export async function forgeTool(input: {
  name: string;
  description: string;
  detectionLogic: string;
  language?: string;
  fileTypes?: string[];
  source?: ForgedToolMeta["source"];
}): Promise<{ ok: true; tool: ForgedTool } | { ok: false; error: string }> {
  try {
    const r = await fetch(getApiUrl("/api/scan/forge"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        description: input.description,
        language: input.language,
        fileTypes: input.fileTypes,
        detectionLogic: input.detectionLogic,
      }),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j = await r.json() as { slug: string; code: string; meta: Omit<ForgedToolMeta, "slug" | "source"> };
    const tool: ForgedTool = {
      slug: j.slug,
      name: input.name,
      description: input.description,
      detectionLogic: input.detectionLogic,
      language: input.language,
      fileTypes: input.fileTypes,
      createdAt: j.meta.createdAt ?? Date.now(),
      source: input.source ?? "button",
      code: j.code,
    };
    // Avoid duplicate slugs in pending queue.
    _pending = [tool, ..._pending.filter((t) => t.slug !== tool.slug)];
    await persistPending();
    log.info("scan", "forge:proposed", {
      actor: `scanner:${tool.slug}` as const,
      inputs: { name: tool.name, source: tool.source },
    });
    return { ok: true, tool };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function approveForgedTool(slug: string): Promise<boolean> {
  const idx = _pending.findIndex((t) => t.slug === slug);
  if (idx === -1) return false;
  const tool = { ..._pending[idx], approvedAt: Date.now() };
  _pending.splice(idx, 1);
  // Remove any prior version with same slug.
  _installed = _installed.filter((t) => t.slug !== slug);
  _installed.unshift(tool);
  await persistPending();
  await persistInstalled();
  registerForgedToolInRegistry(tool);
  log.info("scan", "forge:approved", { actor: `scanner:${slug}` as const });
  return true;
}

export async function rejectForgedTool(slug: string): Promise<boolean> {
  const before = _pending.length;
  _pending = _pending.filter((t) => t.slug !== slug);
  if (_pending.length === before) return false;
  await persistPending();
  log.info("scan", "forge:rejected", { actor: `scanner:${slug}` as const });
  return true;
}

export async function uninstallForgedTool(slug: string): Promise<boolean> {
  const before = _installed.length;
  _installed = _installed.filter((t) => t.slug !== slug);
  if (_installed.length === before) return false;
  await persistInstalled();
  // Note: registry still holds it until next reload — not unloading dynamically.
  log.info("scan", "forge:uninstalled", { actor: `scanner:${slug}` as const });
  return true;
}

// Parse a chat slash-command like:
//   /forge name="Hard-coded URL" detect="Find http:// or https:// strings outside test files"
// Returns null when the message is not a forge request.
export function parseChatForgeRequest(message: string): { name: string; description: string; detectionLogic: string } | null {
  if (!/^\s*\/forge\b/i.test(message)) return null;
  const text = message.replace(/^\s*\/forge\s*/i, "");
  const grab = (k: string) => {
    const m = text.match(new RegExp(`${k}\\s*=\\s*"([^"]+)"`, "i"));
    return m ? m[1] : "";
  };
  const name = grab("name") || "Custom scanner";
  const description = grab("desc") || grab("description") || "User-forged scanner from chat";
  const detectionLogic = grab("detect") || grab("logic") || text.trim();
  if (!detectionLogic) return null;
  return { name, description, detectionLogic };
}

// Auto-suggest a forge candidate from finding history (cheap heuristic).
// If the operator keeps seeing similar findings the runner couldn't classify,
// suggest a forged scanner that targets that pattern.
export function suggestForgeTool(history: NormalizedFinding[]): ForgedToolMeta | null {
  if (history.length < 4) return null;
  const buckets = new Map<string, NormalizedFinding[]>();
  for (const f of history) {
    if (f.tool !== "ai-review") continue; // suggest only when AI flags repeat patterns
    const key = (f.rule ?? f.summary ?? "").slice(0, 60).toLowerCase();
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(f);
    buckets.set(key, arr);
  }
  for (const [key, arr] of buckets.entries()) {
    if (arr.length < 3) continue;
    return {
      slug: `auto-${key.replace(/[^a-z0-9]+/g, "-").slice(0, 30)}`,
      name: `Auto: ${key}`,
      description: `Repeating ${key} flagged by AI ${arr.length}× — codify as a deterministic check.`,
      detectionLogic: `Detect occurrences of: ${key}. Reference findings: ${arr.slice(0, 3).map((f) => f.summary).join(" | ")}`,
      source: "auto-suggest",
      createdAt: Date.now(),
    };
  }
  return null;
}
