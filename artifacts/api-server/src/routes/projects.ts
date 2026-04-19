import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const router = Router();

const routeDir = path.dirname(fileURLToPath(import.meta.url));
export const PROJECTS_DIR = path.resolve(routeDir, "../../../../lexi-projects");

const MIME_MAP: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "application/typescript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  py: "text/x-python",
  sh: "text/x-sh",
  apk: "application/vnd.android.package-archive",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xml: "application/xml",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
};

function getMime(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

function ensureProjectsDir() {
  if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_lexi_")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(full, baseDir));
    } else {
      files.push(path.relative(baseDir, full));
    }
  }
  return files;
}

export function saveProjectMeta(projectId: string, meta: Record<string, string>) {
  ensureProjectsDir();
  const projectDir = path.join(PROJECTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(path.join(projectDir, "_lexi_meta.json"), JSON.stringify(meta, null, 2), "utf-8");
}

export function readProjectMeta(projectId: string): Record<string, string> {
  const metaPath = path.join(PROJECTS_DIR, projectId, "_lexi_meta.json");
  if (!fs.existsSync(metaPath)) return {};
  try { return JSON.parse(fs.readFileSync(metaPath, "utf-8")); } catch { return {}; }
}

// GET /api/projects — list all created projects
router.get("/projects", (_req: Request, res: Response) => {
  ensureProjectsDir();
  const entries = fs.existsSync(PROJECTS_DIR)
    ? fs.readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory())
    : [];

  const projects = entries.map((d) => {
    const meta = readProjectMeta(d.name);
    const files = getAllFiles(path.join(PROJECTS_DIR, d.name));
    const projectDir = path.join(PROJECTS_DIR, d.name);
    const stat = fs.statSync(projectDir);
    return {
      id: d.name,
      name: meta.name ?? d.name,
      type: meta.type ?? "app",
      mainFile: meta.mainFile ?? files[0] ?? "",
      files,
      createdAt: stat.birthtime.toISOString(),
      ...meta,
    };
  });

  res.json({ projects });
});

// GET /api/projects/:projectId/file — serve a file (for preview or download)
// filePath passed as query param ?path=subdir/file.html
router.get("/projects/:projectId/file", (req: Request, res: Response) => {
  const { projectId } = req.params;
  const filePath = (req.query.path as string) ?? "";

  if (!projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const projectDir = path.resolve(PROJECTS_DIR, projectId);
  const absPath = filePath ? path.resolve(projectDir, filePath) : projectDir;

  if (!absPath.startsWith(projectDir)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const isDownload = req.query.download === "1";
  const mime = getMime(absPath);

  res.setHeader("Content-Type", mime);
  if (isDownload) {
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(absPath)}"`);
  } else {
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
  }
  res.sendFile(absPath);
});

// GET /api/projects/:projectId/download — download entire project as zip
router.get("/projects/:projectId/download", (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const projectDir = path.resolve(PROJECTS_DIR, projectId);
  if (!fs.existsSync(projectDir)) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const meta = readProjectMeta(projectId);
  const files = getAllFiles(projectDir);

  // If only one file, download it directly
  if (files.length === 1) {
    const absPath = path.join(projectDir, files[0]);
    const mime = getMime(absPath);
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(absPath)}"`);
    res.sendFile(absPath);
    return;
  }

  // Multiple files — zip them
  const zipPath = `/tmp/lexi-project-${projectId}.zip`;
  try {
    execSync(`cd "${projectDir}" && zip -r "${zipPath}" . --exclude "_lexi_*"`, { stdio: "pipe" });
  } catch {
    res.status(500).json({ error: "Failed to create zip archive" });
    return;
  }

  const projectName = meta.name ?? projectId;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${projectName}.zip"`);
  res.sendFile(zipPath);
});

// DELETE /api/projects/:projectId — remove a project
router.delete("/projects/:projectId", (req: Request, res: Response) => {
  const { projectId } = req.params;

  if (!projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const projectDir = path.resolve(PROJECTS_DIR, projectId);
  if (!projectDir.startsWith(PROJECTS_DIR)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!fs.existsSync(projectDir)) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  fs.rmSync(projectDir, { recursive: true, force: true });
  res.json({ ok: true });
});

export default router;
