// Pending tool approval queue. Operator-gated: nothing installs/runs until Approve.
//
// Storage: AsyncStorage is the canonical source of truth (works on every
// platform including web preview). On native, every approved tool is also
// mirrored to disk under <documentDirectory>/tool-forge/installed/<slug>.json
// so operators can inspect or export their forged ruleset.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { log } from "@/lib/logger";
import { registerForgedTool, unregisterForgedTool } from "@/lib/scanners/registry";

export type ForgedToolSpec = {
  slug: string;
  label: string;
  description: string;
  language: "javascript" | "python" | "semgrep";
  targetFileTypes: string[];     // e.g. ["js","ts","py"]
  source: string;                // the actual rule/script body
  origin: "auto-suggest" | "chat" | "forge-button";
  createdAt: number;
};

const PENDING_KEY = "@lexi/forge_pending";
const INSTALLED_KEY = "@lexi/forge_installed";

const listeners = new Set<() => void>();
function notify() { for (const fn of listeners) try { fn(); } catch { /* ignore */ } }

export function subscribeForge(fn: () => void): () => void {
  listeners.add(fn); return () => { listeners.delete(fn); };
}

async function readArr(key: string): Promise<ForgedToolSpec[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ForgedToolSpec[]) : [];
  } catch { return []; }
}
async function writeArr(key: string, arr: ForgedToolSpec[]): Promise<void> {
  try { await AsyncStorage.setItem(key, JSON.stringify(arr)); } catch { /* ignore */ }
}

export async function listPending(): Promise<ForgedToolSpec[]> { return readArr(PENDING_KEY); }
export async function listInstalled(): Promise<ForgedToolSpec[]> { return readArr(INSTALLED_KEY); }

export async function enqueuePending(spec: ForgedToolSpec): Promise<void> {
  const cur = await readArr(PENDING_KEY);
  if (cur.find((s) => s.slug === spec.slug)) return;
  cur.push(spec);
  await writeArr(PENDING_KEY, cur);
  log.info("scan", "forge:pending", { actor: "system", target: spec.slug, outputs: { origin: spec.origin } });
  notify();
}

export async function approvePending(slug: string): Promise<ForgedToolSpec | null> {
  const pending = await readArr(PENDING_KEY);
  const idx = pending.findIndex((s) => s.slug === slug);
  if (idx === -1) return null;
  const spec = pending[idx];
  pending.splice(idx, 1);
  await writeArr(PENDING_KEY, pending);
  const installed = await readArr(INSTALLED_KEY);
  installed.push(spec);
  await writeArr(INSTALLED_KEY, installed);
  await writeInstalledFile(spec);
  registerForgedTool({
    id: spec.slug,
    label: spec.label,
    description: spec.description,
    languages: spec.targetFileTypes,
    runsOn: spec.language === "javascript" ? "phone" : "server",
    needsServer: spec.language !== "javascript",
    acceptsSources: ["file", "workspace"],
  });
  log.info("scan", "forge:approved", { actor: "user", target: spec.slug });
  notify();
  return spec;
}

export async function updatePending(slug: string, patch: Partial<ForgedToolSpec>): Promise<void> {
  const pending = await readArr(PENDING_KEY);
  const i = pending.findIndex((s) => s.slug === slug);
  if (i === -1) return;
  pending[i] = { ...pending[i], ...patch, slug: pending[i].slug };
  await writeArr(PENDING_KEY, pending);
  log.info("scan", "forge:edit-pending", { actor: "user", target: slug });
  notify();
}

export async function updateInstalled(slug: string, patch: Partial<ForgedToolSpec>): Promise<void> {
  const installed = await readArr(INSTALLED_KEY);
  const i = installed.findIndex((s) => s.slug === slug);
  if (i === -1) return;
  installed[i] = { ...installed[i], ...patch, slug: installed[i].slug };
  await writeArr(INSTALLED_KEY, installed);
  await writeInstalledFile(installed[i]);
  // Re-register so changes to language / runsOn / targetFileTypes take effect
  // immediately without an app restart.
  unregisterForgedTool(slug);
  registerForgedTool({
    id: installed[i].slug,
    label: installed[i].label,
    description: installed[i].description,
    languages: installed[i].targetFileTypes,
    runsOn: installed[i].language === "javascript" ? "phone" : "server",
    needsServer: installed[i].language !== "javascript",
  });
  log.info("scan", "forge:edit-installed", { actor: "user", target: slug });
  notify();
}

export function exportSpec(spec: ForgedToolSpec): string {
  return JSON.stringify(spec, null, 2);
}

async function installedDir(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const FS = await import("expo-file-system/legacy");
    const base = (FS.documentDirectory ?? "") + "tool-forge/installed/";
    await FS.makeDirectoryAsync(base, { intermediates: true }).catch(() => {});
    return base;
  } catch { return null; }
}
async function writeInstalledFile(spec: ForgedToolSpec): Promise<void> {
  const dir = await installedDir(); if (!dir) return;
  try {
    const FS = await import("expo-file-system/legacy");
    await FS.writeAsStringAsync(`${dir}${spec.slug}.json`, JSON.stringify(spec, null, 2));
  } catch { /* ignore */ }
}
async function deleteInstalledFile(slug: string): Promise<void> {
  const dir = await installedDir(); if (!dir) return;
  try {
    const FS = await import("expo-file-system/legacy");
    await FS.deleteAsync(`${dir}${slug}.json`, { idempotent: true });
  } catch { /* ignore */ }
}
export async function installedDirPath(): Promise<string | null> { return installedDir(); }

export async function rejectPending(slug: string): Promise<void> {
  const pending = await readArr(PENDING_KEY);
  await writeArr(PENDING_KEY, pending.filter((s) => s.slug !== slug));
  log.info("scan", "forge:rejected", { actor: "user", target: slug });
  notify();
}

export async function deleteInstalled(slug: string): Promise<void> {
  const installed = await readArr(INSTALLED_KEY);
  await writeArr(INSTALLED_KEY, installed.filter((s) => s.slug !== slug));
  await deleteInstalledFile(slug);
  unregisterForgedTool(slug);
  log.info("scan", "forge:deleted", { actor: "user", target: slug });
  notify();
}

export async function rehydrateInstalledIntoRegistry(): Promise<void> {
  const installed = await readArr(INSTALLED_KEY);
  for (const spec of installed) {
    registerForgedTool({
      id: spec.slug,
      label: spec.label,
      description: spec.description,
      languages: spec.targetFileTypes,
      runsOn: spec.language === "javascript" ? "phone" : "server",
      needsServer: spec.language !== "javascript",
      acceptsSources: ["file", "workspace"],
    });
  }
}

export async function getInstalledBySlug(slug: string): Promise<ForgedToolSpec | null> {
  const installed = await readArr(INSTALLED_KEY);
  return installed.find((s) => s.slug === slug) ?? null;
}
