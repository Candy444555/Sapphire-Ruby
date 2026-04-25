import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = Router();

const UPLOADS_DIR = "/home/runner/lexi-uploads";

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  "application/vnd.android.package-archive",
  "application/octet-stream",
  "application/zip",
  "application/x-zip-compressed",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "text/plain",
  "text/html",
  "application/json",
]);

const APK_EXTENSIONS = new Set([".apk", ".aab", ".apks"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60);
    const unique = `${base}_${Date.now()}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (APK_EXTENSIONS.has(ext) || ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, true);
    }
  },
});

router.post("/upload", (req: Request, res: Response, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      res.status(400).json({ error: message });
      return;
    }
    next();
  });
}, (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const isApk = APK_EXTENSIONS.has(ext);

  res.json({
    ok: true,
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: req.file.path,
    size: req.file.size,
    mimetype: req.file.mimetype,
    isApk,
    downloadPath: `/api/uploads/${req.file.filename}`,
  });
});

router.get("/uploads", (_req: Request, res: Response) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR).map((filename) => {
      const filePath = path.join(UPLOADS_DIR, filename);
      const stat = fs.statSync(filePath);
      const ext = path.extname(filename).toLowerCase();
      return {
        filename,
        size: stat.size,
        uploadedAt: stat.mtime.toISOString(),
        isApk: APK_EXTENSIONS.has(ext),
        downloadPath: `/api/uploads/${filename}`,
      };
    }).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

router.get("/uploads/:filename", (req: Request, res: Response) => {
  const filename = path.basename(String(req.params.filename));
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  const ext = path.extname(filename).toLowerCase();
  const mime = APK_EXTENSIONS.has(ext)
    ? "application/vnd.android.package-archive"
    : "application/octet-stream";
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", mime);
  res.sendFile(filePath);
});

router.delete("/uploads/:filename", (req: Request, res: Response) => {
  const filename = path.basename(String(req.params.filename));
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

export default router;
