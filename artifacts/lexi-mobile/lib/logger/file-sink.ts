import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

import { getSettings } from "./settings";

const DIR_NAME = "lexi-logs";

export function logsDir(): string | null {
  const base = (FileSystem as { documentDirectory?: string | null }).documentDirectory ?? null;
  if (!base) return null;
  return base.endsWith("/") ? `${base}${DIR_NAME}` : `${base}/${DIR_NAME}`;
}

function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dailyFilePath(d = new Date()): string | null {
  const dir = logsDir();
  if (!dir) return null;
  return `${dir}/lexi-${dayKey(d)}.ndjson`;
}

let dirReady: Promise<boolean> | null = null;

async function ensureDir(): Promise<boolean> {
  if (dirReady) return dirReady;
  dirReady = (async () => {
    const dir = logsDir();
    if (!dir) return false;
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }
      return true;
    } catch {
      return false;
    }
  })();
  return dirReady;
}

let pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_BATCH = 64;
// Cap each on-disk chunk so flush stays O(chunk) instead of O(file).
// New entries spill into sibling files `lexi-YYYY-MM-DD.<seq>.ndjson`,
// which `listLogFiles()` still picks up via its `lexi-…ndjson` glob.
const CHUNK_MAX_BYTES = 256 * 1024;
let activeChunkPath: string | null = null;
let activeChunkSize = 0;

export function enqueueLine(line: string) {
  if (Platform.OS === "web") return;
  pending.push(line);
  if (pending.length >= FLUSH_BATCH) {
    void flushNow();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushNow();
    }, FLUSH_INTERVAL_MS);
  }
}

async function pickActiveChunk(): Promise<{ path: string; size: number } | null> {
  // Reuse the cached chunk path within a single session as long as its
  // size stays under CHUNK_MAX_BYTES. Otherwise roll to a fresh sibling.
  const dayBase = dailyFilePath();
  if (!dayBase) return null;
  if (activeChunkPath) {
    if (activeChunkSize < CHUNK_MAX_BYTES) return { path: activeChunkPath, size: activeChunkSize };
  } else {
    // First flush this session — adopt the daily file if it exists and is
    // still under cap, otherwise start a brand new sequenced chunk.
    try {
      const info = await FileSystem.getInfoAsync(dayBase);
      const size = info.exists ? Number((info as { size?: number }).size ?? 0) : 0;
      if (!info.exists || size < CHUNK_MAX_BYTES) {
        activeChunkPath = dayBase;
        activeChunkSize = size;
        return { path: dayBase, size };
      }
    } catch { /* fall through to roll */ }
  }
  // Roll: lexi-YYYY-MM-DD.<ms>.ndjson — `listLogFiles()` regex still
  // matches because the prefix and `.ndjson` suffix are preserved.
  const rolled = dayBase.replace(/\.ndjson$/, `.${Date.now()}.ndjson`);
  activeChunkPath = rolled;
  activeChunkSize = 0;
  return { path: rolled, size: 0 };
}

export async function flushNow(): Promise<void> {
  if (flushing) return;
  if (pending.length === 0) return;
  flushing = true;
  try {
    const ok = await ensureDir();
    if (!ok) {
      pending = [];
      return;
    }
    const target = await pickActiveChunk();
    if (!target) {
      pending = [];
      return;
    }
    const batch = pending.splice(0, pending.length);
    const chunk = batch.join("");
    try {
      if (target.size === 0) {
        // Fresh file — single write, no read-back.
        await FileSystem.writeAsStringAsync(target.path, chunk);
      } else {
        // Existing partial chunk: read once (bounded by CHUNK_MAX_BYTES)
        // and rewrite. This is O(chunk_size), not O(total_log_size).
        const existing = await FileSystem.readAsStringAsync(target.path);
        await FileSystem.writeAsStringAsync(target.path, existing + chunk);
      }
      activeChunkSize += chunk.length;
    } catch {
      /* swallow — we cannot afford to crash inside the logger */
    }
  } finally {
    flushing = false;
  }
}

export async function listLogFiles(): Promise<string[]> {
  const dir = logsDir();
  if (!dir) return [];
  try {
    const ok = await ensureDir();
    if (!ok) return [];
    const entries = await FileSystem.readDirectoryAsync(dir);
    return entries
      .filter((n) => n.startsWith("lexi-") && n.endsWith(".ndjson"))
      .sort() // lexicographic sort keeps date prefix grouped + chunks ordered
      .map((n) => `${dir}/${n}`);
  } catch {
    return [];
  }
}

export async function readLogFile(path: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return "";
    return await FileSystem.readAsStringAsync(path);
  } catch {
    return "";
  }
}

export async function deleteAllLogs(): Promise<void> {
  const files = await listLogFiles();
  for (const f of files) {
    try {
      await FileSystem.deleteAsync(f, { idempotent: true });
    } catch {
      /* ignore */
    }
  }
  // Reset cached chunk state so the next flush starts a fresh file
  // instead of trying to append to the now-deleted path with stale size.
  activeChunkPath = null;
  activeChunkSize = 0;
}

export async function rotateRetention(): Promise<void> {
  const { retentionDays } = getSettings();
  const dir = logsDir();
  if (!dir) return;
  try {
    const entries = await FileSystem.readDirectoryAsync(dir);
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    for (const name of entries) {
      // Match both the canonical daily file and rolled sequenced chunks
      // (`lexi-YYYY-MM-DD.<seq>.ndjson`).
      const m = /^lexi-(\d{4})-(\d{2})-(\d{2})(?:\.\d+)?\.ndjson$/.exec(name);
      if (!m) continue;
      const t = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getTime();
      if (Number.isFinite(t) && t < cutoff) {
        try {
          await FileSystem.deleteAsync(`${dir}/${name}`, { idempotent: true });
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

// Public path inside the app's document dir where users (or `adb push`) can
// drop scanner NDJSON files. The Logs tab "Import scans" action reads here
// and ingests every line into the unified in-app log timeline so scanner
// runs and runtime events appear interleaved by timestamp.
export function scanInboxDir(): string | null {
  const base = (FileSystem as { documentDirectory?: string | null }).documentDirectory ?? null;
  if (!base) return null;
  return base.endsWith("/") ? `${base}scan-reports` : `${base}/scan-reports`;
}

export async function ensureScanInboxDir(): Promise<string | null> {
  const dir = scanInboxDir();
  if (!dir) return null;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    return dir;
  } catch {
    return null;
  }
}

export async function listScanInboxFiles(): Promise<string[]> {
  const dir = await ensureScanInboxDir();
  if (!dir) return [];
  try {
    const entries = await FileSystem.readDirectoryAsync(dir);
    return entries
      .filter((n) => n.endsWith(".ndjson"))
      .sort()
      .map((n) => `${dir}/${n}`);
  } catch {
    return [];
  }
}

export async function writeExternalNdjson(name: string, content: string): Promise<string | null> {
  const dir = logsDir();
  if (!dir) return null;
  const ok = await ensureDir();
  if (!ok) return null;
  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const path = `${dir}/${safe}`;
  try {
    await FileSystem.writeAsStringAsync(path, content);
    return path;
  } catch {
    return null;
  }
}
