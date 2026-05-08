// Thin TS wrapper for the embedded Tor daemon (tor-android / Guardian Project).
//
// Native module name: `LexiTor`. Exposes start/stop, NEWNYM, circuit info, and
// the SOCKS port for in-process clients (Cronet, curl-impersonate).
import type { NativeModule } from "react-native";
import { NativeEventEmitter } from "react-native";
import { getNativeModule } from "@/lib/native/_modules";

type TorNative = NativeModule & {
  startTor(opts?: { bridges?: string[]; obfs4?: boolean }): Promise<{ socksPort: number }>;
  stopTor(): Promise<void>;
  newCircuit(): Promise<void>;
  getSocksPort(): Promise<number>;
  getCircuitInfo(): Promise<{
    isReady: boolean;
    exitIp: string | null;
    nodes: Array<{ fingerprint: string; nickname: string; country: string | null }>;
  }>;
  getStatus(): Promise<{ running: boolean; bootstrapped: number; lastError?: string }>;
  isAvailable(): boolean;
};

const Native: TorNative | null = getNativeModule<TorNative>("LexiTor");

const emitter = Native ? new NativeEventEmitter(Native) : null;

export function torAvailable(): boolean {
  return !!Native && Native.isAvailable?.();
}

export async function startTor(): Promise<number> {
  if (!Native) throw new Error("TOR_NOT_BUNDLED: tor-android isn't in this build. Run a native APK build.");
  const r = await Native.startTor({});
  return r.socksPort;
}

export async function stopTor(): Promise<void> {
  if (!Native) return;
  await Native.stopTor();
}

export async function newCircuit(): Promise<void> {
  if (!Native) throw new Error("TOR_NOT_BUNDLED");
  await Native.newCircuit();
}

export async function getSocksPort(): Promise<number> {
  if (!Native) throw new Error("TOR_NOT_BUNDLED");
  return Native.getSocksPort();
}

export async function getCircuitInfo() {
  if (!Native) return { isReady: false, exitIp: null, nodes: [] as Array<{ fingerprint: string; nickname: string; country: string | null }> };
  return Native.getCircuitInfo();
}

export async function getTorStatus() {
  if (!Native) return { running: false, bootstrapped: 0, lastError: "TOR_NOT_BUNDLED" };
  return Native.getStatus();
}

export type TorEvent = { type: string; payload?: unknown };
export function onTorEvent(cb: (e: TorEvent) => void) {
  if (!emitter) return () => {};
  const sub = emitter.addListener("LexiTorEvent", (e: TorEvent) => cb(e));
  return () => sub.remove();
}
