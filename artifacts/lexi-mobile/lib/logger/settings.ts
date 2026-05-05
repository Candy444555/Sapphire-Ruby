import AsyncStorage from "@react-native-async-storage/async-storage";

export type Verbosity = "error" | "warn" | "info" | "debug" | "trace";

const ORDER: Record<Verbosity, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

export function compareLevel(level: Verbosity, threshold: Verbosity): boolean {
  return ORDER[level] <= ORDER[threshold];
}

export type LoggerSettings = {
  verbosity: Verbosity;
  retentionDays: number;
  redact: boolean;
};

const DEFAULTS: LoggerSettings = {
  verbosity: "debug",
  retentionDays: 14,
  redact: true,
};

const KEY = "@lexi/logger_settings";

let cached: LoggerSettings = { ...DEFAULTS };
const listeners = new Set<(s: LoggerSettings) => void>();

export function getSettings(): LoggerSettings {
  return cached;
}

export function subscribeSettings(fn: (s: LoggerSettings) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function notify() {
  for (const fn of listeners) {
    try {
      fn(cached);
    } catch {
      /* ignore */
    }
  }
}

export async function loadSettings(): Promise<LoggerSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LoggerSettings>;
      cached = {
        verbosity: (parsed.verbosity as Verbosity) ?? DEFAULTS.verbosity,
        retentionDays:
          typeof parsed.retentionDays === "number" && parsed.retentionDays > 0
            ? Math.min(365, Math.floor(parsed.retentionDays))
            : DEFAULTS.retentionDays,
        redact: typeof parsed.redact === "boolean" ? parsed.redact : DEFAULTS.redact,
      };
      notify();
    }
  } catch {
    /* ignore */
  }
  return cached;
}

export async function updateSettings(patch: Partial<LoggerSettings>): Promise<LoggerSettings> {
  cached = { ...cached, ...patch };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    /* ignore */
  }
  notify();
  return cached;
}

loadSettings().catch(() => {});
