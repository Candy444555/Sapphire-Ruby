import { Router, type Request, type Response } from "express";

const router = Router();
const GITHUB_API = "https://api.github.com";

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");
  return token;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Lexi-App/1.0",
    "Content-Type": "application/json",
  };
}

async function githubFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: { ...githubHeaders(token), ...(options.headers as Record<string, string> ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json();
}

async function getOrCreateRepo(slug: string, projectName: string): Promise<{ owner: string; repo: string; created: boolean }> {
  const user = await githubFetch("/user");
  const owner: string = user.login;

  // Try to get existing repo
  try {
    await githubFetch(`/repos/${owner}/${slug}`);
    return { owner, repo: slug, created: false };
  } catch {}

  // Create new repo
  await githubFetch("/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: slug,
      description: `Lexi-generated project: ${projectName}`,
      private: false,
      auto_init: true,
    }),
  });

  // Wait briefly for GitHub to initialise the repo
  await new Promise((r) => setTimeout(r, 2000));
  return { owner, repo: slug, created: true };
}

async function getFileSha(owner: string, repo: string, filePath: string, branch: string): Promise<string | undefined> {
  try {
    const data = await githubFetch(`/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`);
    return data.sha;
  } catch {
    return undefined;
  }
}

async function pushFile(
  owner: string,
  repo: string,
  filePath: string,
  content: string,
  message: string,
  branch: string
): Promise<void> {
  const sha = await getFileSha(owner, repo, filePath, branch);
  const encoded = Buffer.from(content, "utf-8").toString("base64");
  const body: Record<string, string> = { message, content: encoded, branch };
  if (sha) body.sha = sha;
  await githubFetch(`/repos/${owner}/${repo}/contents/${filePath}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "lexi-app";
}

function sanitizePackage(slug: string): string {
  return slug.replace(/-/g, "").replace(/[^a-z0-9]/g, "").slice(0, 30) || "lexiapp";
}

const APK_WORKFLOW_YAML = (slug: string) => `name: Build APK

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Generate native Android code
        run: npx expo prebuild --platform android --clean --no-install

      - name: Make gradlew executable
        run: chmod +x android/gradlew

      - name: Build debug APK
        run: cd android && ./gradlew assembleDebug --no-daemon

      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${slug}-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30
`;

// POST /api/github-build-apk
router.post("/github-build-apk", async (req: Request, res: Response) => {
  const { files, projectName } = req.body as {
    files: Array<{ path: string; content: string }>;
    projectName?: string;
  };

  if (!Array.isArray(files) || files.length === 0) {
    res.status(400).json({ error: "files array is required" });
    return;
  }

  const name = projectName ?? "Lexi App";
  const slug = slugify(name);
  const pkgSlug = sanitizePackage(slug);

  try {
    const { owner, repo } = await getOrCreateRepo(slug, name);
    const branch = "main";

    // Determine default branch (auto_init might create "main" or "master")
    let defaultBranch = "main";
    try {
      const repoData = await githubFetch(`/repos/${owner}/${repo}`);
      defaultBranch = repoData.default_branch ?? "main";
    } catch {}

    // Ensure app.json has correct expo config
    const existingAppJson = files.find((f) => f.path === "app.json");
    let appJsonContent: string;
    if (existingAppJson) {
      try {
        const parsed = JSON.parse(existingAppJson.content);
        if (!parsed.expo) parsed.expo = {};
        parsed.expo.name = parsed.expo.name ?? name;
        if (!parsed.expo.slug) parsed.expo.slug = slug;
        if (!parsed.expo.android) parsed.expo.android = {};
        if (!parsed.expo.android.package) parsed.expo.android.package = `com.lexi.${pkgSlug}`;
        appJsonContent = JSON.stringify(parsed, null, 2);
      } catch {
        appJsonContent = existingAppJson.content;
      }
    } else {
      appJsonContent = JSON.stringify({
        expo: {
          name,
          slug,
          version: "1.0.0",
          android: { package: `com.lexi.${pkgSlug}` },
        },
      }, null, 2);
    }

    // Ensure package.json exists
    const existingPkgJson = files.find((f) => f.path === "package.json");
    let pkgJsonContent: string;
    if (existingPkgJson) {
      pkgJsonContent = existingPkgJson.content;
    } else {
      pkgJsonContent = JSON.stringify({
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
      }, null, 2);
    }

    // Build full file list
    const allFiles: Array<{ path: string; content: string }> = [
      ...files.filter((f) => f.path !== "app.json" && f.path !== "package.json"),
      { path: "app.json", content: appJsonContent },
      { path: "package.json", content: pkgJsonContent },
      { path: ".github/workflows/build-apk.yml", content: APK_WORKFLOW_YAML(slug) },
    ];

    // Push files sequentially
    let pushed = 0;
    for (const file of allFiles) {
      try {
        await pushFile(owner, repo, file.path, file.content, `feat: add ${file.path} via Lexi`, defaultBranch);
        pushed++;
      } catch (e: any) {
        console.warn(`[github-build-apk] Failed to push ${file.path}:`, e.message?.slice(0, 200));
      }
    }

    const repoUrl = `https://github.com/${owner}/${repo}`;
    const actionsUrl = `${repoUrl}/actions`;
    const workflowUrl = `${repoUrl}/actions/workflows/build-apk.yml`;

    res.json({
      ok: true,
      repoUrl,
      actionsUrl,
      workflowUrl,
      owner,
      repo,
      pushed,
      message: `Project pushed to GitHub. Build triggered at ${actionsUrl}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/github-build-apk/:owner/:repo/status — check latest workflow run
router.get("/github-build-apk/:owner/:repo/status", async (req: Request, res: Response) => {
  const { owner, repo } = req.params;
  try {
    const data = await githubFetch(
      `/repos/${owner}/${repo}/actions/runs?per_page=1&event=push`
    );
    const run = data.workflow_runs?.[0];
    if (!run) {
      res.json({ status: "no_runs", message: "No workflow runs found yet." });
      return;
    }
    const artifactsData = run.status === "completed"
      ? await githubFetch(`/repos/${owner}/${repo}/actions/runs/${run.id}/artifacts`)
      : null;

    res.json({
      status: run.status,
      conclusion: run.conclusion,
      runId: run.id,
      runUrl: run.html_url,
      startedAt: run.run_started_at,
      updatedAt: run.updated_at,
      artifacts: artifactsData?.artifacts?.map((a: any) => ({
        name: a.name,
        size: a.size_in_bytes,
        downloadUrl: a.archive_download_url,
        expiresAt: a.expires_at,
      })) ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
