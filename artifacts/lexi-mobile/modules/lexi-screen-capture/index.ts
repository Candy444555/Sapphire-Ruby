// One-shot native screen capture (Android MediaProjection / iOS ReplayKit).
//
// SAFETY: each call triggers a fresh OS-level consent prompt — there is NO
// persistent permission. The consent UI is enforced by the OS itself
// (MediaProjectionManager.createScreenCaptureIntent on Android,
// RPScreenRecorder.startCapture on iOS) and cannot be bypassed.
//
// Returns base64-encoded PNG bytes of a single full-screen frame, or null if
// the user declined / the platform refused.
import { requireOptionalNativeModule } from "expo";

type NativeApi = {
  captureOnce(): Promise<string | null>;
  isAvailable(): boolean;
};

const native = requireOptionalNativeModule<NativeApi>("LexiScreenCapture");

export function isNativeCaptureAvailable(): boolean {
  if (!native) return false;
  try {
    return native.isAvailable();
  } catch {
    return false;
  }
}

export async function captureOnce(): Promise<string | null> {
  if (!native) return null;
  return native.captureOnce();
}
