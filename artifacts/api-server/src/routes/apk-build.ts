import { Router, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const router = Router();

const routeDir = path.dirname(fileURLToPath(import.meta.url));
export const BUILDS_DIR = path.resolve(routeDir, "../../../../lexi-apk-builds");
const EAS_BIN = "/home/runner/workspace/.config/npm/node_global/bin/eas";

function ensureBuildsDir() {
  if (!fs.existsSync(BUILDS_DIR)) fs.mkdirSync(BUILDS_DIR, { recursive: true });
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "lexi-app";
}

function sanitizePackage(slug: string): string {
  return slug.replace(/-/g, "").replace(/[^a-z0-9]/g, "").slice(0, 30) || "lexiapp";
}

// POST /api/build-apk
router.post("/build-apk", async (req: Request, res: Response) => {
  const { files, projectName } = req.body as {
    files: { path: string; content: string }[];
    projectName?: string;
  };

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "No project files provided." });
    return;
  }

  const token = process.env.EXPO_TOKEN;
  if (!token) {
    res.status(400).json({
      error: "EXPO_TOKEN not set. Add your Expo account token to enable APK building.",
      setupUrl: "https://expo.dev/settings/access-tokens",
    });
    return;
  }

  ensureBuildsDir();
  const slug = slugify(projectName ?? "lexi-app");
  const localBuildId = `${slug}-${Date.now()}`;
  const projectDir = path.join(BUILDS_DIR, localBuildId);
  fs.mkdirSync(projectDir, { recursive: true });

  for (const f of files) {
    try {
      const dest = path.join(projectDir, f.path);
      if (!dest.startsWith(projectDir)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, f.content, "utf-8");
    } catch {}
  }

  const appJsonPath = path.join(projectDir, "app.json");
  const pkgSlug = sanitizePackage(slug);
  if (fs.existsSync(appJsonPath)) {
    try {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
      if (!appJson.expo) appJson.expo = {};
      if (!appJson.expo.slug) appJson.expo.slug = slug;
      appJson.expo.name = appJson.expo.name ?? (projectName ?? "Lexi App");
      if (!appJson.expo.android) appJson.expo.android = {};
      if (!appJson.expo.android.package) appJson.expo.android.package = `com.lexi.${pkgSlug}`;
      fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2), "utf-8");
    } catch {}
  } else {
    fs.writeFileSync(appJsonPath, JSON.stringify({
      expo: {
        name: projectName ?? "Lexi App",
        slug,
        version: "1.0.0",
        android: { package: `com.lexi.${pkgSlug}` },
      },
    }, null, 2), "utf-8");
  }

  fs.writeFileSync(path.join(projectDir, "eas.json"), JSON.stringify({
    cli: { version: ">= 10.0.0", appVersionSource: "local" },
    build: {
      preview: {
        android: { buildType: "apk" },
        distribution: "internal",
      },
    },
  }, null, 2), "utf-8");

  const pkgJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    fs.writeFileSync(pkgJsonPath, JSON.stringify({
      name: slug,
      version: "1.0.0",
      main: "node_modules/expo/AppEntry.js",
      scripts: { start: "expo start", android: "expo run:android" },
      dependencies: {
        expo: "~53.0.0",
        "expo-status-bar": "~2.0.0",
        react: "18.3.2",
        "react-native": "0.76.9",
      },
    }, null, 2), "utf-8");
  }

  const easEnv = {
    ...process.env,
    EXPO_TOKEN: token,
    PATH: `/home/runner/workspace/.config/npm/node_global/bin:${process.env.PATH}`,
  };

  // Step 1: install deps
  try {
    execSync("npm install --legacy-peer-deps --prefer-offline", {
      cwd: projectDir,
      stdio: "pipe",
      timeout: 180000,
    });
  } catch {}

  // Step 2: register the project under the authenticated Expo account
  // This is required before EAS can queue a build — without it the build
  // hangs in "queued" forever and the build page shows "no app here".
  try {
    execSync(`${EAS_BIN} init --non-interactive --force`, {
      cwd: projectDir,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60000,
      env: easEnv,
    });
  } catch (initErr: any) {
    const detail = (initErr.stdout?.toString?.() ?? "") + (initErr.stderr?.toString?.() ?? "");
    res.status(500).json({ error: "Failed to register project with Expo.", details: detail.slice(0, 1000) });
    return;
  }

  // Step 3: submit the build
  let easBuildId = "";
  let buildUrl = "";
  try {
    const output = execSync(
      `${EAS_BIN} build --platform android --profile preview --non-interactive --json --no-wait`,
      {
        cwd: projectDir,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 120000,
        env: easEnv,
      }
    ).toString().trim();

    const parsed = JSON.parse(output);
    const buildEntry = Array.isArray(parsed) ? parsed[0] : parsed;
    easBuildId = buildEntry?.id ?? "";
    buildUrl = buildEntry?.buildDetailsPageUrl ?? `https://expo.dev/accounts/${process.env.EXPO_USERNAME ?? ""}/builds/${easBuildId}`;
  } catch (err: any) {
    const detail = (err.stdout?.toString?.() ?? "") + (err.stderr?.toString?.() ?? "") + (err.message ?? "");
    res.status(500).json({ error: "Failed to start EAS build.", details: detail.slice(0, 2000) });
    return;
  }

  fs.writeFileSync(path.join(projectDir, "_build_meta.json"), JSON.stringify({
    easBuildId,
    buildUrl,
    projectName,
    localBuildId,
    startedAt: new Date().toISOString(),
  }, null, 2), "utf-8");

  res.json({ localBuildId, easBuildId, buildUrl, status: "queued" });
});

// GET /api/build-apk/:easBuildId/status
router.get("/build-apk/:easBuildId/status", async (req: Request, res: Response) => {
  const { easBuildId } = req.params;
  if (!easBuildId || !/^[a-zA-Z0-9_-]+$/.test(easBuildId)) {
    res.status(400).json({ error: "Invalid build ID" });
    return;
  }

  const token = process.env.EXPO_TOKEN;
  if (!token) {
    res.status(400).json({ error: "EXPO_TOKEN not set." });
    return;
  }

  try {
    const output = execSync(
      `${EAS_BIN} build:view ${easBuildId} --json`,
      {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30000,
        env: { ...process.env, EXPO_TOKEN: token, PATH: `/home/runner/workspace/.config/npm/node_global/bin:${process.env.PATH}` },
      }
    ).toString().trim();

    const build = JSON.parse(output);
    const apkUrl = build?.artifacts?.buildUrl ?? null;
    const status: string = build?.status ?? "unknown";

    res.json({
      status,
      apkUrl,
      buildUrl: build?.buildDetailsPageUrl ?? null,
      completedAt: build?.completedAt ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch build status.", details: err.message?.slice(0, 500) });
  }
});

export default router;
