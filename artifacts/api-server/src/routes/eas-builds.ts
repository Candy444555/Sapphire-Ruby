import { Router, type IRouter } from "express";

const router: IRouter = Router();

const EXPO_API = "https://api.expo.dev/graphql";
const PROJECTS: Record<string, string> = {
  "my-new-project": "7ccd35ca-bf3d-460e-a3a1-b4ad337478a6",
  "lexi-mobile": "368fdfe8-8176-4d7f-9255-acf2b782686f",
  "runner": "b9983137-6711-44b3-add0-dca8f9955871",
};
const DEFAULT_PROJECT = "my-new-project";
const DEFAULT_OWNER = "rubywilliam444";

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

const QUERY = `
query($appId: String!, $limit: Int!) {
  app {
    byId(appId: $appId) {
      id
      fullName
      builds(limit: $limit, offset: 0) {
        id status platform appVersion appBuildVersion
        buildProfile channel createdAt completedAt
        artifacts { applicationArchiveUrl }
        error { errorCode message }
      }
    }
  }
}`;

async function fetchBuilds(appId: string, limit = 15) {
  const token = process.env.EXPO_TOKEN;
  if (!token) throw new Error("EXPO_TOKEN secret not configured on the server");
  const r = await fetch(EXPO_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { appId, limit } }),
  });
  if (!r.ok) throw new Error(`Expo API ${r.status}`);
  const j = (await r.json()) as {
    errors?: Array<{ message: string }>;
    data?: { app?: { byId?: { id: string; fullName: string; builds: any[] } } };
  };
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join("; "));
  const app = j.data?.app?.byId;
  if (!app) throw new Error("project not found");
  return app;
}

router.get("/eas/projects", (_req, res) => {
  res.json({ projects: Object.keys(PROJECTS), default: DEFAULT_PROJECT });
});

router.get("/eas/latest-apk", async (req, res) => {
  try {
    const projectName = String(req.query.project || DEFAULT_PROJECT);
    const platform = String(req.query.platform || "ANDROID").toUpperCase();
    const appId = PROJECTS[projectName];
    if (!appId) {
      res.status(400).json({ error: `unknown project '${projectName}'`, known: Object.keys(PROJECTS) });
      return;
    }
    const cacheKey = `${projectName}:${platform}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      res.json(hit.data);
      return;
    }
    const app = await fetchBuilds(appId, 20);
    const finished = app.builds.find(
      (b) => b.status === "FINISHED" && b.platform === platform && b.artifacts?.applicationArchiveUrl,
    );
    if (!finished) {
      const data = { project: app.fullName, found: false, recent: app.builds.slice(0, 5) };
      cache.set(cacheKey, { at: Date.now(), data });
      res.json(data);
      return;
    }
    const data = {
      project: app.fullName,
      found: true,
      build: {
        id: finished.id,
        platform: finished.platform,
        profile: finished.buildProfile,
        channel: finished.channel,
        appVersion: finished.appVersion,
        versionCode: finished.appBuildVersion,
        completedAt: finished.completedAt,
        apkUrl: finished.artifacts.applicationArchiveUrl,
        pageUrl: `https://expo.dev/accounts/${DEFAULT_OWNER}/projects/${projectName}/builds/${finished.id}`,
      },
    };
    cache.set(cacheKey, { at: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.get("/eas/builds", async (req, res) => {
  try {
    const projectName = String(req.query.project || DEFAULT_PROJECT);
    const appId = PROJECTS[projectName];
    if (!appId) {
      res.status(400).json({ error: `unknown project '${projectName}'` });
      return;
    }
    const app = await fetchBuilds(appId, 15);
    res.json({
      project: app.fullName,
      builds: app.builds.map((b) => ({
        id: b.id,
        status: b.status,
        platform: b.platform,
        profile: b.buildProfile,
        channel: b.channel,
        appVersion: b.appVersion,
        versionCode: b.appBuildVersion,
        completedAt: b.completedAt,
        hasApk: !!b.artifacts?.applicationArchiveUrl,
        apkUrl: b.artifacts?.applicationArchiveUrl ?? null,
        errorCode: b.error?.errorCode ?? null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

export default router;
