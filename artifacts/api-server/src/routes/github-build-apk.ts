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

async function getOrCreateRepo(slug: string, projectName: string): Promise<{ owner: string; repo: string; defaultBranch: string }> {
  const user = await githubFetch("/user");
  const owner: string = user.login;

  try {
    const existing = await githubFetch(`/repos/${owner}/${slug}`);
    return { owner, repo: slug, defaultBranch: existing.default_branch ?? "main" };
  } catch {}

  await githubFetch("/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: slug,
      description: `Lexi-generated React Native project: ${projectName}`,
      private: false,
      auto_init: true,
    }),
  });

  await new Promise((r) => setTimeout(r, 2500));

  let defaultBranch = "main";
  try {
    const created = await githubFetch(`/repos/${owner}/${slug}`);
    defaultBranch = created.default_branch ?? "main";
  } catch {}

  return { owner, repo: slug, defaultBranch };
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

// Pure React Native GitHub Actions workflow — no Expo, no EAS
const APK_WORKFLOW_YAML = (appName: string, slug: string) => `name: Build APK

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout source
        uses: actions/checkout@v4

      - name: Setup Node.js 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install React Native CLI
        run: npm install -g @react-native-community/cli@15

      - name: Scaffold bare React Native project
        run: |
          npx @react-native-community/cli@15 init LeximBuild \\
            --version 0.76.9 \\
            --skip-install \\
            --directory LeximBuild
          echo "Scaffold complete"

      - name: Copy app source into project
        run: |
          for f in *.tsx *.ts *.js *.jsx; do
            [ -f "\\$f" ] && cp "\\$f" LeximBuild/ && echo "Copied \\$f" || true
          done
          for d in src components screens hooks lib assets images; do
            [ -d "\\$d" ] && cp -r "\\$d" LeximBuild/ && echo "Copied dir \\$d" || true
          done

      - name: Install dependencies
        working-directory: LeximBuild
        run: npm install --legacy-peer-deps

      - name: Make gradlew executable
        working-directory: LeximBuild/android
        run: chmod +x gradlew

      - name: Build debug APK
        working-directory: LeximBuild/android
        run: ./gradlew assembleDebug --no-daemon --stacktrace

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: ${slug}-debug-apk
          path: LeximBuild/android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30
          if-no-files-found: error
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

  try {
    const { owner, repo, defaultBranch } = await getOrCreateRepo(slug, name);

    // Pure React Native app.json (no expo config)
    const existingAppJson = files.find((f) => f.path === "app.json");
    let appJsonContent: string;
    if (existingAppJson) {
      try {
        const parsed = JSON.parse(existingAppJson.content);
        // Strip expo config if present
        delete parsed.expo;
        if (!parsed.name) parsed.name = name;
        if (!parsed.displayName) parsed.displayName = name;
        appJsonContent = JSON.stringify(parsed, null, 2);
      } catch {
        appJsonContent = existingAppJson.content;
      }
    } else {
      appJsonContent = JSON.stringify({ name: slug, displayName: name }, null, 2);
    }

    // Pure React Native package.json (no expo)
    const existingPkgJson = files.find((f) => f.path === "package.json");
    let pkgJsonContent: string;
    if (existingPkgJson) {
      try {
        const parsed = JSON.parse(existingPkgJson.content);
        // Remove expo dependencies
        if (parsed.dependencies) {
          for (const key of Object.keys(parsed.dependencies)) {
            if (key.startsWith("expo")) delete parsed.dependencies[key];
          }
          if (!parsed.dependencies["react-native"]) parsed.dependencies["react-native"] = "0.76.9";
          if (!parsed.dependencies["react"]) parsed.dependencies["react"] = "18.3.2";
        }
        // Fix scripts
        delete parsed.main;
        parsed.scripts = {
          android: "react-native run-android",
          ios: "react-native run-ios",
          start: "react-native start",
        };
        pkgJsonContent = JSON.stringify(parsed, null, 2);
      } catch {
        pkgJsonContent = existingPkgJson.content;
      }
    } else {
      pkgJsonContent = JSON.stringify({
        name: slug,
        version: "1.0.0",
        private: true,
        scripts: {
          android: "react-native run-android",
          ios: "react-native run-ios",
          start: "react-native start",
        },
        dependencies: {
          react: "18.3.2",
          "react-native": "0.76.9",
        },
        devDependencies: {
          "@babel/core": "^7.25.0",
          "@react-native/babel-preset": "^0.76.0",
          "@types/react": "^18.3.0",
          "@types/react-native": "^0.73.0",
          typescript: "^5.0.0",
        },
      }, null, 2);
    }

    // Build full file list — no expo dependencies, inject GitHub Actions workflow
    const allFiles: Array<{ path: string; content: string }> = [
      ...files.filter((f) => f.path !== "app.json" && f.path !== "package.json"),
      { path: "app.json", content: appJsonContent },
      { path: "package.json", content: pkgJsonContent },
      { path: ".github/workflows/build-apk.yml", content: APK_WORKFLOW_YAML(name, slug) },
    ];

    let pushed = 0;
    for (const file of allFiles) {
      try {
        await pushFile(owner, repo, file.path, file.content, `build: add ${file.path}`, defaultBranch);
        pushed++;
      } catch (e: any) {
        console.warn(`[github-build-apk] Skipped ${file.path}: ${e.message?.slice(0, 120)}`);
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
      message: `Pure React Native project pushed to GitHub. APK build triggered via GitHub Actions at ${actionsUrl}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/github-build-apk/:owner/:repo/status
router.get("/github-build-apk/:owner/:repo/status", async (req: Request, res: Response) => {
  const { owner, repo } = req.params;
  try {
    const data = await githubFetch(
      `/repos/${owner}/${repo}/actions/runs?per_page=1&event=push`
    );
    const run = data.workflow_runs?.[0];
    if (!run) {
      res.json({ status: "no_runs", message: "No workflow runs found yet — build may still be queuing." });
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
        sizeBytes: a.size_in_bytes,
        downloadUrl: a.archive_download_url,
        expiresAt: a.expires_at,
      })) ?? [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
