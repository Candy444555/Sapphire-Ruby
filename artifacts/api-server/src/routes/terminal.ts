import { Router, type IRouter, type Request, type Response } from "express";
import { sessions, createSession, execInSession } from "../services/shell-session";

const router: IRouter = Router();

router.post("/terminal/session", (_req: Request, res: Response) => {
  const { id, cwd } = createSession();
  res.json({ sessionId: id, cwd });
});

router.post("/terminal/exec", async (req: Request, res: Response) => {
  const { sessionId, command } = req.body as {
    sessionId?: string;
    command?: string;
  };

  if (!sessionId || command === undefined) {
    res.status(400).json({ error: "sessionId and command are required" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired. Please refresh to start a new session." });
    return;
  }

  if (session.pending) {
    res.status(429).json({ error: "A command is already running in this session." });
    return;
  }

  try {
    const result = await execInSession(session, command);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/terminal/session/:id", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ cwd: session.cwd, busy: session.pending !== null });
});

router.delete("/terminal/session/:id", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (session) {
    try { session.proc.kill(); } catch { /* ignore */ }
    sessions.delete(req.params.id);
  }
  res.json({ ok: true });
});

export default router;
