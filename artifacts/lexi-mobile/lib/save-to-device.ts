import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";

import { log } from "@/lib/logger";

// Save an image (http URL or data: URL) directly to the phone gallery
export async function saveImageToGallery(imageUrl: string): Promise<void> {
  return log.span("file", "saveImageToGallery", async () => {
    const perm = await MediaLibrary.requestPermissionsAsync();
    log.info("permission", "media-library", { actor: "user", target: "MediaLibrary", outputs: { status: perm.status } });
    if (perm.status !== "granted") throw new Error("Gallery permission denied — enable it in phone Settings.");

    let localUri = imageUrl;

    if (imageUrl.startsWith("http")) {
      const dest = FileSystem.cacheDirectory + `lexi_img_${Date.now()}.jpg`;
      const dl = await FileSystem.downloadAsync(imageUrl, dest);
      log.info("file", "download", { target: dest, outputs: { source: imageUrl } });
      localUri = dl.uri;
    } else if (imageUrl.startsWith("data:")) {
      const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) throw new Error("Invalid image data.");
      const ext = match[1].includes("png") ? "png" : "jpg";
      const dest = FileSystem.cacheDirectory + `lexi_img_${Date.now()}.${ext}`;
      await FileSystem.writeAsStringAsync(dest, match[2], { encoding: FileSystem.EncodingType.Base64 });
      log.info("file", "write", { target: dest, outputs: { encoding: "base64" } });
      localUri = dest;
    }

    await MediaLibrary.saveToLibraryAsync(localUri);
    log.info("file", "saveToLibrary", { target: localUri });
  }, { target: imageUrl });
}

// Save text / code content as a named file — opens share sheet so user can pick Downloads or any app
export async function saveTextToPhone(filename: string, content: string): Promise<void> {
  return log.span("file", "saveTextToPhone", async () => {
    const dest = FileSystem.cacheDirectory + filename;
    await FileSystem.writeAsStringAsync(dest, content, { encoding: FileSystem.EncodingType.UTF8 });
    log.info("file", "write", { target: dest, outputs: { bytes: content.length } });
    const ok = await Sharing.isAvailableAsync();
    if (!ok) throw new Error("Sharing not available on this device.");
    await Sharing.shareAsync(dest, { dialogTitle: `Save ${filename}` });
  }, { target: filename });
}

// Download an APK from a URL and open the Android install / save dialog
export async function saveApkToPhone(apkUrl: string, filename?: string): Promise<void> {
  return log.span("file", "saveApkToPhone", async () => {
    const fname = filename ?? `lexi_app_${Date.now()}.apk`;
    const dest = FileSystem.cacheDirectory + fname;
    await FileSystem.downloadAsync(apkUrl, dest);
    log.info("file", "download", { target: dest, outputs: { source: apkUrl } });
    const ok = await Sharing.isAvailableAsync();
    if (!ok) throw new Error("Sharing not available on this device.");
    await Sharing.shareAsync(dest, {
      mimeType: "application/vnd.android.package-archive",
      dialogTitle: "Save or install APK",
    });
  }, { target: apkUrl });
}

// Detect a likely filename extension from message content
export function guessFilename(content: string): string {
  const lower = content.toLowerCase();
  if (/```python/.test(lower)) return `lexi_${Date.now()}.py`;
  if (/```javascript|```js/.test(lower)) return `lexi_${Date.now()}.js`;
  if (/```typescript|```ts/.test(lower)) return `lexi_${Date.now()}.ts`;
  if (/```html/.test(lower)) return `lexi_${Date.now()}.html`;
  if (/```css/.test(lower)) return `lexi_${Date.now()}.css`;
  if (/```bash|```sh/.test(lower)) return `lexi_${Date.now()}.sh`;
  if (/```json/.test(lower)) return `lexi_${Date.now()}.json`;
  if (/```sql/.test(lower)) return `lexi_${Date.now()}.sql`;
  if (/```c\b/.test(lower)) return `lexi_${Date.now()}.c`;
  if (/```cpp|```c\+\+/.test(lower)) return `lexi_${Date.now()}.cpp`;
  return `lexi_${Date.now()}.txt`;
}
