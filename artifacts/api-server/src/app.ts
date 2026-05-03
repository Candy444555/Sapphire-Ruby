import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authMiddleware } from "./middlewares/authMiddleware";
import { selfHealErrorHandler, getSelfHealSnapshot } from "./middlewares/selfHeal";
import router from "./routes";

const app: Express = express();

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));
app.use(authMiddleware);

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.removeHeader("X-Powered-By");
  next();
});

// Lightweight self-heal snapshot endpoint — useful for the self-test script
// and for the mobile About screen.
app.get("/api/self-heal/status", (_req: Request, res: Response) => {
  res.json(getSelfHealSnapshot());
});

app.use("/api", router);
app.use("/", router);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Self-heal error middleware MUST be registered last so it sees thrown errors
// and rejected promises from any upstream route.
app.use(selfHealErrorHandler);

export default app;
