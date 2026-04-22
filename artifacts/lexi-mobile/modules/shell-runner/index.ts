export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

type NativeShape = {
  exec(cmd: string, useRoot: boolean, timeoutMs: number): Promise<ShellResult>;
  isRootAvailable(): Promise<boolean>;
};

let Native: NativeShape | null = null;
try {
  // expo-modules-core is bundled with expo; require lazily so type-check stays happy
  // and Expo Go doesn't blow up when the native module is missing.
  const core = require("expo-modules-core");
  if (core?.requireOptionalNativeModule) {
    Native = core.requireOptionalNativeModule("ShellRunner") as NativeShape | null;
  } else if (core?.NativeModulesProxy?.ShellRunner) {
    Native = core.NativeModulesProxy.ShellRunner as NativeShape;
  }
} catch {
  Native = null;
}

export const isAvailable = Native != null;

export async function exec(
  cmd: string,
  options: { useRoot?: boolean; timeoutMs?: number } = {}
): Promise<ShellResult> {
  if (!Native) {
    throw new Error(
      "ShellRunner native module not available. This requires an EAS build (not Expo Go) on Android."
    );
  }
  return Native.exec(cmd, !!options.useRoot, options.timeoutMs ?? 15000);
}

export async function isRootAvailable(): Promise<boolean> {
  if (!Native) return false;
  try {
    return await Native.isRootAvailable();
  } catch {
    return false;
  }
}
