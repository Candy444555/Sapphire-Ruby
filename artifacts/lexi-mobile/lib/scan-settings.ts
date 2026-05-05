// Persisted Scan-tab settings: screen-capture toggle + default per-tool timeout.
// Auto-suggest lives in lib/tool-forge/analyzer.ts (kept for backward-compat).
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ScanSettings = {
  screenCaptureEnabled: boolean;
  defaultTimeoutMs: number;
};

const KEY = "@lexi/scan_settings_v1";
const DEFAULTS: ScanSettings = { screenCaptureEnabled: true, defaultTimeoutMs: 600_000 };

let _settings: ScanSettings = { ...DEFAULTS };
let _loaded = false;
const listeners = new Set<(s: ScanSettings) => void>();

export function getScanSettings(): ScanSettings { return _settings; }
export function subscribeScanSettings(fn: (s: ScanSettings) => void): () => void {
  listeners.add(fn); return () => { listeners.delete(fn); };
}
function notify() { for (const fn of listeners) try { fn(_settings); } catch { /* ignore */ } }

export async function loadScanSettings(): Promise<ScanSettings> {
  if (_loaded) return _settings;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) _settings = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ScanSettings>) };
  } catch { /* ignore */ }
  _loaded = true;
  notify();
  return _settings;
}

export async function updateScanSettings(patch: Partial<ScanSettings>): Promise<ScanSettings> {
  _settings = { ..._settings, ...patch };
  try { await AsyncStorage.setItem(KEY, JSON.stringify(_settings)); } catch { /* ignore */ }
  notify();
  return _settings;
}
