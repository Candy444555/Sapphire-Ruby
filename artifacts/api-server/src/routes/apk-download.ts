import { Router, type IRouter, type Request, type Response } from "express";
import { createReadStream, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const router: IRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const APK_FILE = join(__dirname, "..", "..", "lexi-16841f13.apk");
const APK_NAME = "lexi-16841f13.apk";

router.get("/apk", (_req: Request, res: Response) => {
  try {
    const st = statSync(APK_FILE);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Length", String(st.size));
    res.setHeader("Content-Disposition", `attachment; filename="${APK_NAME}"`);
    res.setHeader("Cache-Control", "no-store");
    createReadStream(APK_FILE).pipe(res);
  } catch (err) {
    res.status(404).json({ error: "apk not staged", detail: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/apk/info", (_req: Request, res: Response) => {
  try {
    const st = statSync(APK_FILE);
    res.json({
      name: APK_NAME,
      bytes: st.size,
      mb: Math.round(st.size / (1024 * 1024)),
      buildId: "16841f13",
      runtimeVersion: "1.0.0",
      channel: "preview",
      sdk: "54.0.0",
    });
  } catch {
    res.status(404).json({ error: "apk not staged" });
  }
});

export default router;
