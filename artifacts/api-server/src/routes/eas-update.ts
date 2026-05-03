import { Router, type Request, type Response } from "express";
import { exec, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
const routeDir = path.dirname(fileURLToPath(import.meta.url));
const LEXI_MOBILE_DIR = path.resolve(routeDir, "../../../../artifacts/lexi-mobile");
const EAS_BIN = "/home/runner/workspace/.config/npm/node_global/bin/eas";

// POST /api/eas/push-update  — triggers `eas update` and streams log lines back
router.post("/eas/push-update", (req: Request, res: Response) => {
  const token = process.env.EXPO_TOKEN;
  if (!token) {
    res.status(400).json({ error: "EXPO_TOKEN not configured on server." });
    return;
  }

  const { channel = "personal", message = "OTA update" } = req.body as {
    channel?: string;
    message?: string;
  };

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const cmd = `${EAS_BIN} update --channel ${channel} --message "${message.replace(/"/g, "")}" --non-interactive`;
  res.write(`Running: ${cmd}\n`);

  const child = exec(cmd, {
    cwd: LEXI_MOBILE_DIR,
    env: { ...process.env, EXPO_TOKEN: token, EAS_NO_VCS: "1" },
    timeout: 180_000,
  });

  child.stdout?.on("data", (d: string) => res.write(d));
  child.stderr?.on("data", (d: string) => res.write(d));

  child.on("close", (code) => {
    res.write(`\n--- exited with code ${code} ---\n`);
    res.end();
  });

  child.on("error", (err) => {
    res.write(`\nError: ${err.message}\n`);
    res.end();
  });
});

// GET /api/eas/latest-apk — returns latest finished APK build info
router.get("/eas/latest-apk", async (_req: Request, res: Response) => {
  const token = process.env.EXPO_TOKEN;
  if (!token) {
    res.status(400).json({ error: "EXPO_TOKEN not configured." });
    return;
  }

  try {
    const PROJECT_ID = "7ccd35ca-bf3d-460e-a3a1-b4ad337478a6";
    const query = `
      query GetBuilds($appId: String!, $platform: AppPlatform!, $limit: Int!) {
        app { byId(appId: $appId) {
          name
          builds(platform: $platform, limit: $limit) {
            edges { node {
              id status platform buildProfile appVersion
              artifacts { applicationArchiveUrl }
              completedAt createdAt
            }}
          }
        }}
      }`;

    const gqlRes = await fetch("https://api.expo.dev/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        query,
        variables: { appId: PROJECT_ID, platform: "ANDROID", limit: 5 },
      }),
    });

    const gql = await gqlRes.json() as any;
    const edges: any[] = gql?.data?.app?.byId?.builds?.edges ?? [];
    const finished = edges.find((e: any) => e.node?.status === "FINISHED");

    if (!finished) {
      res.json({ found: false, project: gql?.data?.app?.byId?.name });
      return;
    }

    const node = finished.node;
    res.json({
      found: true,
      project: gql?.data?.app?.byId?.name,
      build: {
        id: node.id,
        profile: node.buildProfile,
        channel: node.buildProfile,
        appVersion: node.appVersion,
        versionCode: "",
        completedAt: node.completedAt ?? node.createdAt,
        apkUrl: node.artifacts?.applicationArchiveUrl ?? "",
        pageUrl: `https://expo.dev/accounts/rubywilliam444/projects/my-new-project/builds/${node.id}`,
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Unknown error" });
  }
});

// POST /api/eas/build — spawns EAS Android build detached (fire-and-forget) and returns immediately.
// Logs are written to /tmp/eas-build-<timestamp>.log for optional inspection.
router.post("/eas/build", (req: Request, res: Response) => {
  const token = process.env.EXPO_TOKEN;
  if (!token) {
    res.status(400).json({ error: "EXPO_TOKEN not configured on server." });
    return;
  }

  const { profile: buildProfile = "preview" } = req.body as { profile?: string };

  const logFile = `/tmp/eas-build-${Date.now()}.log`;
  const logStream = fs.openSync(logFile, "w");

  const child = spawn(
    EAS_BIN,
    ["build", "--platform", "android", "--profile", buildProfile, "--non-interactive", "--no-wait"],
    {
      cwd: LEXI_MOBILE_DIR,
      env: { ...process.env, EXPO_TOKEN: token, EAS_NO_VCS: "1" },
      detached: true,
      stdio: ["ignore", logStream, logStream],
    }
  );

  child.unref(); // let it outlive this request

  res.json({
    ok: true,
    buildUrl: null,
    buildId: null,
    profile: buildProfile,
    message: `EAS build submitted (profile: ${buildProfile}). It uploads & queues in the background — check https://expo.dev/accounts/rubywilliam444/projects/my-new-project/builds for status in ~2 min.`,
    log: `Spawned PID ${child.pid}. Log: ${logFile}`,
  });
});

export default router;
