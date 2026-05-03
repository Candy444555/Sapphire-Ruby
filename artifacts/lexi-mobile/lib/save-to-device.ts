import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";

// Save an image (http URL or data: URL) directly to the phone gallery
export async function saveImageToGallery(imageUrl: string): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== "granted") throw new Error("Gallery permission denied — enable it in phone Settings.");

  let localUri = imageUrl;

  if (imageUrl.startsWith("http")) {
    const dest = FileSystem.cacheDirectory + `lexi_img_${Date.now()}.jpg`;
    const dl = await FileSystem.downloadAsync(imageUrl, dest);
    localUri = dl.uri;
  } else if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) throw new Error("Invalid image data.");
    const ext = match[1].includes("png") ? "png" : "jpg";
    const dest = FileSystem.cacheDirectory + `lexi_img_${Date.now()}.${ext}`;
    await FileSystem.writeAsStringAsync(dest, match[2], { encoding: FileSystem.EncodingType.Base64 });
    localUri = dest;
  }

  await MediaLibrary.saveToLibraryAsync(localUri);
}

// Save text / code content as a named file — opens share sheet so user can pick Downloads or any app
export async function saveTextToPhone(filename: string, content: string): Promise<void> {
  const dest = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(dest, content, { encoding: FileSystem.EncodingType.UTF8 });
  const ok = await Sharing.isAvailableAsync();
  if (!ok) throw new Error("Sharing not available on this device.");
  await Sharing.shareAsync(dest, { dialogTitle: `Save ${filename}` });
}

// Download an APK from a URL and open the Android install / save dialog
export async function saveApkToPhone(apkUrl: string, filename?: string): Promise<void> {
  const fname = filename ?? `lexi_app_${Date.now()}.apk`;
  const dest = FileSystem.cacheDirectory + fname;
  await FileSystem.downloadAsync(apkUrl, dest);
  const ok = await Sharing.isAvailableAsync();
  if (!ok) throw new Error("Sharing not available on this device.");
  await Sharing.shareAsync(dest, {
    mimeType: "application/vnd.android.package-archive",
    dialogTitle: "Save or install APK",
  });
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
