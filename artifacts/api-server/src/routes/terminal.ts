import { Router, type IRouter, type Request, type Response } from "express";
import { spawn } from "child_process";
import { randomBytes } from "crypto";

const router: IRouter = Router();

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const CMD_EXEC_TIMEOUT_MS = 30 * 1000;

interface PendingCommand {
  resolve: (result: { output: string; exitCode: number; cwd: string }) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  markerLine: string;
}

interface Session {
  proc: ReturnType<typeof spawn>;
  buffer: string;
  pending: PendingCommand | null;
  cwd: string;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

function makeId(): string {
  return randomBytes(12).toString("hex");
}

function tryResolve(session: Session): void {
  if (!session.pending) return;

  const { markerLine } = session.pending;
  const markerIdx = session.buffer.indexOf(markerLine);
  if (markerIdx === -1) return;

  const afterMarker = session.buffer.slice(markerIdx + markerLine.length);
  const metaMatch = afterMarker.match(/^:(-?\d+):([\s\S]*?)__END__\n?/);
  if (!metaMatch) return;

  const output = session.buffer.slice(0, markerIdx);
  const exitCode = parseInt(metaMatch[1], 10);
  const cwd = metaMatch[2].trim();
  session.cwd = cwd;

  const fullConsumedLen =
    markerIdx + markerLine.length + metaMatch[0].length;
  session.buffer = session.buffer.slice(fullConsumedLen);

  clearTimeout(session.pending.timeout);
  const resolve = session.pending.resolve;
  session.pending = null;

  resolve({ output, exitCode, cwd });
}

function createSession(): { id: string; cwd: string } {
  const id = makeId();

  const startCwd = process.env.HOME ?? "/root";

  const proc = spawn("/bin/bash", ["--norc", "--noprofile"], {
    env: {
      ...process.env,
      PS1: "",
      PS2: "",
      TERM: "dumb",
      HOME: startCwd,
      USER: process.env.USER ?? "root",
      HOSTNAME: "kali",
    },
    cwd: startCwd,
  });

  const session: Session = {
    proc,
    buffer: "",
    pending: null,
    cwd: startCwd,
    lastActivity: Date.now(),
  };

  proc.stdout?.on("data", (data: Buffer) => {
    session.buffer += data.toString();
    session.lastActivity = Date.now();
    tryResolve(session);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    session.buffer += data.toString();
    session.lastActivity = Date.now();
    tryResolve(session);
  });

  proc.on("exit", () => {
    if (session.pending) {
      clearTimeout(session.pending.timeout);
      session.pending.reject(new Error("Shell process exited unexpectedly"));
      session.pending = null;
    }
    sessions.delete(id);
  });

  proc.on("error", (err) => {
    if (session.pending) {
      clearTimeout(session.pending.timeout);
      session.pending.reject(err);
      session.pending = null;
    }
    sessions.delete(id);
  });

  sessions.set(id, session);
  return { id, cwd: startCwd };
}

function execInSession(
  session: Session,
  command: string
): Promise<{ output: string; exitCode: number; cwd: string }> {
  return new Promise((resolve, reject) => {
    const cmdId = makeId();
    const markerLine = `__DONE_${cmdId}__`;

    const timeout = setTimeout(() => {
      if (session.pending?.markerLine === markerLine) {
        session.pending = null;
        session.buffer = "";
      }
      reject(new Error("Command timed out after 30 seconds"));
    }, CMD_EXEC_TIMEOUT_MS);

    session.pending = { resolve, reject, timeout, markerLine };
    session.lastActivity = Date.now();

    const wrapped =
      `{ ${command}; } 2>&1\n` +
      `_ec=$?\n` +
      `printf '${markerLine}:%d:%s__END__\\n' $_ec "$(pwd)"\n`;

    session.proc.stdin?.write(wrapped);
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      try { session.proc.kill(); } catch { /* ignore */ }
      sessions.delete(id);
    }
  }
}, 60_000);

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
