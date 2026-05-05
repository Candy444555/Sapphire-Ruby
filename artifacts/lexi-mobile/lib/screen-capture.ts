// Screen-capture source for the Scan tab.
//
// SAFETY RULE: every capture requires a fresh per-scan operator consent
// (Alert dialog) — there is NO persistent permission. Android also requires
// MediaProjection consent, which is enforced by the OS each call.
//
// Implementation note: the Expo SDK exposes no first-party screen-capture
// API yet (expo-screen-capture only blocks/allows screenshots). Until a
// native module ships, this helper falls back to expo-image-picker so the
// operator can hand-pick a screenshot — the *consent* and *one-shot OCR*
// flow stays identical so callers don't change.

import { Alert, Platform } from "react-native";
import { log } from "@/lib/logger";
import { getFeatherlessKey } from "@/lib/lexi-api";
import { getScanSettings, loadScanSettings } from "@/lib/scan-settings";

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
  const r = await fetch("https://api.featherless.ai/v1/chat/completions", {
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
  log.info("scan", "screen-capture:start", { actor: "user", target: Platform.OS });
  const pick = await pickImage();
  if (!pick) {
    log.warn("scan", "screen-capture:no-image", {});
    return null;
  }
  const ocrText = await ocrViaFeatherless(pick.base64);
  log.info("scan", "screen-capture:end", { outputs: { chars: ocrText.length } });
  return { ocrText, imageBase64: pick.base64 };
}
