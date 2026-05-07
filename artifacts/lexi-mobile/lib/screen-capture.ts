// Screen-capture source for the Scan tab.
//
// SAFETY RULE: every capture requires a fresh per-scan operator consent
// (Alert dialog) — there is NO persistent permission. Android also requires
// MediaProjection consent and iOS requires ReplayKit consent, both of which
// are enforced by the OS on every single call.
//
// Implementation: prefers the local `lexi-screen-capture` Expo native module
// (Android MediaProjection / iOS ReplayKit) for one-tap capture. When that
// module is unavailable (Expo Go, web, broken build), it falls back to
// expo-image-picker so the operator can hand-pick a screenshot — the
// consent + one-shot OCR flow is identical either way so callers don't change.

import { Alert, Platform } from "react-native";
import { log } from "@/lib/logger";
import { getFeatherlessKey } from "@/lib/lexi-api";
import { getScanSettings, loadScanSettings } from "@/lib/scan-settings";
import {
  captureOnce as nativeCaptureOnce,
  isNativeCaptureAvailable,
} from "../modules/lexi-screen-capture";

export type CaptureResult = { ocrText: string; imageBase64?: string };

async function consent(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Capture screen?",
      "Lexi will take ONE screenshot now and run OCR on it. Nothing is uploaded except to the OCR model. You will be asked again every time.",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Capture", style: "destructive", onPress: () => resolve(true) },
      ],
    );
  });
}

async function pickImage(): Promise<{ base64: string; uri: string } | null> {
  const ImagePicker = await import("expo-image-picker");
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== "granted") return null;
  const r = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions?.Images,
    base64: true,
    quality: 0.7,
  });
  if (r.canceled || !r.assets?.[0]?.base64) return null;
  return { base64: r.assets[0].base64, uri: r.assets[0].uri };
}

async function ocrViaFeatherless(base64: string): Promise<string> {
  const key = getFeatherlessKey();
  if (!key) throw new Error("Featherless key required for OCR. Set it in Profile.");
  // Use a vision-capable chat completion to extract text.
  const { stealthFetch } = await import("@/lib/stealth-fetch");
  const r = await stealthFetch("https://api.featherless.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "meta-llama/Llama-3.2-11B-Vision-Instruct",
      messages: [
        { role: "system", content: "You are an OCR engine. Read the image and return the verbatim visible text. No commentary." },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract every line of visible text from this image." },
            { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
          ] as unknown as string,
        },
      ],
    }),
  });
  if (!r.ok) throw new Error(`featherless OCR ${r.status}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return j.choices?.[0]?.message?.content ?? "";
}

export async function captureScreenAndOcr(): Promise<CaptureResult | null> {
  if (Platform.OS === "web") {
    Alert.alert("Not supported", "Screen capture is only available on the mobile app.");
    return null;
  }
  await loadScanSettings();
  if (!getScanSettings().screenCaptureEnabled) {
    Alert.alert("Disabled", "Enable screen-capture source in Profile → Scan first.");
    log.info("scan", "screen-capture:disabled-by-setting", {});
    return null;
  }
  if (!(await consent())) {
    log.info("scan", "screen-capture:declined", { actor: "user" });
    return null;
  }
  const useNative = isNativeCaptureAvailable();
  log.info("scan", "screen-capture:start", {
    actor: "user", target: Platform.OS, outputs: { source: useNative ? "native" : "image-picker" },
  });

  let base64: string | null = null;
  if (useNative) {
    try {
      base64 = await nativeCaptureOnce();
    } catch (err) {
      // Native capture errored. We deliberately do NOT silently fall back to
      // the image picker here: the operator already gave one-shot consent for
      // a screen capture, so swapping in a gallery picker would be a surprise
      // and could leak an unrelated image. Fail fast and surface the error.
      const error = err instanceof Error ? err.message : String(err);
      log.warn("scan", "screen-capture:native-error", { error });
      throw err;
    }
    if (!base64) {
      // User declined the OS consent, or the native call timed out.
      log.warn("scan", "screen-capture:no-image", { target: "native" });
      return null;
    }
  } else {
    const pick = await pickImage();
    if (!pick) {
      log.warn("scan", "screen-capture:no-image", { target: "image-picker" });
      return null;
    }
    base64 = pick.base64;
  }

  const ocrText = await ocrViaFeatherless(base64);
  log.info("scan", "screen-capture:end", { outputs: { chars: ocrText.length } });
  return { ocrText, imageBase64: base64 };
}
