import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const ALLOWED_KEYS = [
  "DEFAULT_OBJECT_STORAGE_BUCKET_ID",
  "PUBLIC_OBJECT_SEARCH_PATHS",
  "PRIVATE_OBJECT_DIR",
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
  "FEATHERLESS_API_TOKEN",
  "GITHUB_TOKEN",
  "EXPO_TOKEN",
  "SESSION_SECRET",
  "DATABASE_URL",
  "REPL_ID",
  "REPLIT_DEV_DOMAIN",
  "REPLIT_DOMAINS",
] as const;

router.get("/secrets", (_req: Request, res: Response) => {
  const out: { key: string; value: string | null; present: boolean }[] = [];
  for (const key of ALLOWED_KEYS) {
    const value = process.env[key] ?? null;
    out.push({ key, value, present: value !== null && value !== "" });
  }
  res.json({ secrets: out });
});

export default router;
