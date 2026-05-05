import { Platform } from "react-native";

import { redact, redactHeaders, redactQueryString } from "./redact";
import {
  compareLevel,
  getSettings,
  loadSettings,
  subscribeSettings,
  updateSettings,
  type LoggerSettings,
  type Verbosity,
} from "./settings";
import {
  enqueueLine,
  flushNow,
  rotateRetention,
  listLogFiles,
  readLogFile,
  deleteAllLogs,
  dailyFilePath,
  logsDir,
  writeExternalNdjson,
  scanInboxDir,
  ensureScanInboxDir,
  listScanInboxFiles,
} from "./file-sink";

export type LogLevel = Verbosity;
export type Actor = "user" | "app" | `scanner:${string}` | "system";

export type LogEntry = {
  ts: number;
  level: LogLevel;
  category: string;
  actor: Actor;
  action: string;
  target?: string;
  inputs?: unknown;
  outputs?: unknown;
  status?: string;
  durationMs?: number;
  caller?: string;
  sessionId: string;
  correlationId?: string;
  error?: { message: string; stack?: string };
};

export type LogPayload = {
  actor?: Actor;
  target?: string;
  inputs?: unknown;
  outputs?: unknown;
  status?: string;
  durationMs?: number;
  correlationId?: string;
  error?: unknown;
};

const SESSION_ID = makeId(8);
const recent: LogEntry[] = [];
const RECENT_MAX = 2000;
const listeners = new Set<(e: LogEntry) => void>();

function makeId(bytes = 8): string {
  let out = "";
  for (let i = 0; i < bytes; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  return out;
}

export function newCorrelationId(): string {
  return makeId(6);
}

export function getSessionId(): string {
  return SESSION_ID;
}

function callerFrame(skip = 4): string | undefined {
  try {
    const stack = new Error().stack;
    if (!stack) return undefined;
    const lines = stack.split("\n").slice(skip);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (line.includes("logger/index") || line.includes("logger/file-sink") || line.includes("logger/redact")) continue;
      const m = /\(?([^()\s]+:\d+:\d+)\)?$/.exec(line);
      if (m) return m[1];
      return line.replace(/^at\s+/, "");
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function applyRedaction(value: unknown): unknown {
  if (!getSettings().redact) return value;
  return redact(value);
}

function emit(entry: LogEntry) {
  recent.push(entry);
  if (recent.length > RECENT_MAX) recent.shift();
  for (const fn of listeners) {
    try { fn(entry); } catch { /* ignore */ }
  }

  const fn = entry.level === "error" ? "error"
    : entry.level === "warn" ? "warn"
    : entry.level === "info" ? "info"
    : "log";
  if (typeof console !== "undefined" && (console as unknown as Record<string, unknown>)[fn]) {
    try {
      (console as unknown as Record<string, (...a: unknown[]) => void>)[fn](
        `[${entry.level}] ${entry.category}/${entry.action}`,
        entry.target ?? "",
        entry.status ?? "",
        entry.durationMs != null ? `${entry.durationMs}ms` : "",
      );
    } catch { /* ignore */ }
  }

  try {
    enqueueLine(JSON.stringify(entry) + "\n");
  } catch { /* ignore */ }
}

function makeEntry(
  level: LogLevel,
  category: string,
  action: string,
  payload: LogPayload | undefined,
): LogEntry {
  const p = payload ?? {};
  let errorObj: { message: string; stack?: string } | undefined;
  if (p.error) {
    if (p.error instanceof Error) errorObj = { message: p.error.message, stack: p.error.stack };
    else errorObj = { message: String(p.error) };
  }
  return {
    ts: Date.now(),
    level,
    category,
    actor: p.actor ?? "app",
    action,
    target: p.target,
    inputs: p.inputs !== undefined ? applyRedaction(p.inputs) : undefined,
    outputs: p.outputs !== undefined ? applyRedaction(p.outputs) : undefined,
    status: p.status,
    durationMs: p.durationMs,
    caller: callerFrame(),
    sessionId: SESSION_ID,
    correlationId: p.correlationId,
    error: errorObj,
  };
}

function shouldLog(level: LogLevel): boolean {
  return compareLevel(level, getSettings().verbosity);
}

function write(level: LogLevel, category: string, action: string, payload?: LogPayload) {
  if (!shouldLog(level)) return;
  emit(makeEntry(level, category, action, payload));
}

export const log = {
  trace(category: string, action: string, payload?: LogPayload) { write("trace", category, action, payload); },
  debug(category: string, action: string, payload?: LogPayload) { write("debug", category, action, payload); },
  info(category: string, action: string, payload?: LogPayload) { write("info", category, action, payload); },
  warn(category: string, action: string, payload?: LogPayload) { write("warn", category, action, payload); },
  error(category: string, action: string, payload?: LogPayload) { write("error", category, action, payload); },
  async span<T>(category: string, action: string, fn: () => Promise<T> | T, payload?: LogPayload): Promise<T> {
    const cid = payload?.correlationId ?? newCorrelationId();
    const start = Date.now();
    write("debug", category, `${action}:start`, { ...payload, correlationId: cid });
    try {
      const out = await fn();
      write("info", category, `${action}:end`, {
        ...payload,
        correlationId: cid,
        durationMs: Date.now() - start,
        status: "ok",
      });
      return out;
    } catch (err) {
      write("error", category, `${action}:end`, {
        ...payload,
        correlationId: cid,
        durationMs: Date.now() - start,
        status: "error",
        error: err,
      });
      throw err;
    }
  },
};

export function getRecentEntries(): LogEntry[] {
  return recent.slice();
}

export function clearRecentEntries(): void {
  recent.length = 0;
  for (const fn of listeners) {
    try { fn({
      ts: Date.now(),
      level: "info",
      category: "logs",
      actor: "system",
      action: "clear-recent",
      sessionId: SESSION_ID,
    }); } catch { /* ignore */ }
  }
}

export function subscribeLogs(fn: (e: LogEntry) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export {
  loadSettings,
  subscribeSettings,
  updateSettings,
  getSettings,
  flushNow,
  rotateRetention,
  listLogFiles,
  readLogFile,
  deleteAllLogs,
  dailyFilePath,
  logsDir,
  writeExternalNdjson,
  scanInboxDir,
  ensureScanInboxDir,
  listScanInboxFiles,
};

// Import every NDJSON file in the scan inbox into the in-app log buffer so
// scanner runs and runtime events share a single timeline. Returns the total
// number of entries ingested (and the per-file breakdown for UI display).
export async function ingestScanReports(): Promise<{ total: number; files: { path: string; count: number }[] }> {
  const FileSystem = (await import("expo-file-system/legacy")) as typeof import("expo-file-system/legacy");
  const dir = await ensureScanInboxDir();
  if (!dir) return { total: 0, files: [] };
  let total = 0;
  const out: { path: string; count: number }[] = [];
  const files = await listScanInboxFiles();
  for (const f of files) {
    try {
      const content = await FileSystem.readAsStringAsync(f);
      const n = ingestRawLines(content, f.split("/").pop() ?? f);
      out.push({ path: f, count: n });
      total += n;
    } catch (err) {
      log.warn("logs", "ingest-scan:failed", { target: f, error: err });
    }
  }
  log.info("logs", "ingest-scan:end", { actor: "system", target: dir, outputs: { files: out.length, total } });
  return { total, files: out };
}
export type { LoggerSettings, Verbosity };

export function ingestRawLines(text: string, source: string): number {
  let count = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as Partial<LogEntry>;
      if (typeof obj === "object" && obj && obj.action) {
        const entry: LogEntry = {
          ts: typeof obj.ts === "number" ? obj.ts : Date.now(),
          level: (obj.level as LogLevel) ?? "info",
          category: obj.category ?? "external",
          actor: (obj.actor as Actor) ?? "system",
          action: obj.action ?? "log",
          target: obj.target,
          inputs: obj.inputs,
          outputs: obj.outputs,
          status: obj.status,
          durationMs: obj.durationMs,
          caller: obj.caller ?? source,
          sessionId: obj.sessionId ?? `external:${source}`,
          correlationId: obj.correlationId,
          error: obj.error,
        };
        recent.push(entry);
        if (recent.length > RECENT_MAX) recent.shift();
        for (const fn of listeners) {
          try { fn(entry); } catch { /* ignore */ }
        }
        count++;
      }
    } catch {
      /* skip malformed line */
    }
  }
  return count;
}

let netInstalled = false;
export function installNetworkInstrumentation() {
  if (netInstalled) return;
  netInstalled = true;
  try {
    const g = globalThis as unknown as { fetch?: unknown };
    const orig = g.fetch;
    if (typeof orig === "function") {
      g.fetch = wrappedFetch((orig as Function).bind(globalThis) as (...a: unknown[]) => Promise<Response>, "global") as unknown;
    }
  } catch { /* ignore */ }
  try {
    // Best-effort: monkey-patch expo/fetch's exported function so streaming
    // calls are also logged. Metro's CJS interop makes this work in practice.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("expo/fetch") as { fetch?: (...a: unknown[]) => Promise<Response> };
    if (mod && typeof mod.fetch === "function") {
      const origExpo = mod.fetch;
      (mod as { fetch: unknown }).fetch = wrappedFetch(origExpo, "expo");
    }
  } catch { /* ignore */ }
}

function wrappedFetch(
  orig: (...a: unknown[]) => Promise<Response>,
  label: string,
): (...a: unknown[]) => Promise<Response> {
  return async (...args: unknown[]) => {
    const reqInit = (args[1] ?? {}) as RequestInit;
    const method = (reqInit.method ?? "GET").toUpperCase();
    const rawUrl = typeof args[0] === "string" ? args[0] : (args[0] as { url?: string })?.url ?? "";
    const url = redactQueryString(rawUrl);
    const cid = newCorrelationId();
    const start = Date.now();
    log.debug("net", "fetch:start", {
      target: url,
      correlationId: cid,
      inputs: { method, headers: redactHeaders(reqInit.headers as Record<string, unknown> | undefined) },
    });
    try {
      const res = await orig(...args);
      const len = Number(res.headers?.get?.("content-length") ?? 0) || undefined;
      log.info("net", "fetch:end", {
        target: url,
        correlationId: cid,
        durationMs: Date.now() - start,
        status: `${res.status}`,
        outputs: { ok: res.ok, status: res.status, bytes: len, transport: label },
      });
      return res;
    } catch (err) {
      log.error("net", "fetch:end", {
        target: url,
        correlationId: cid,
        durationMs: Date.now() - start,
        status: "error",
        error: err,
      });
      throw err;
    }
  };
}

if (Platform.OS !== "web") {
  setInterval(() => {
    void flushNow();
  }, 2000);
}
