import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} model=${req.body?.model ?? "n/a"}`);
  next();
});

app.use("/api", router);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: `Route not found: ${_req.method} ${_req.originalUrl}` });
});

export default app;
