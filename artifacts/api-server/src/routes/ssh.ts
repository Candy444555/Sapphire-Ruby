import { Router, type IRouter, type Request, type Response } from "express";
import { Client, type ConnectConfig } from "ssh2";
import { randomBytes } from "crypto";

const router: IRouter = Router();

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const CMD_TIMEOUT_MS = 60 * 1000;

interface SshSession {
  client: Client;
  host: string;
  username: string;
  lastActivity: number;
  ready: boolean;
}

const sessions = new Map<string, SshSession>();

function makeId(): string {
  return randomBytes(12).toString("hex");
}

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
      try { session.client.end(); } catch { /* ignore */ }
      sessions.delete(id);
    }
  }
}, 60_000);

router.post("/terminal/ssh/connect", (req: Request, res: Response) => {
  const { host, port, username, password, privateKey } = req.body as {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKey?: string;
  };

  if (!host || !username) {
    res.status(400).json({ error: "host and username are required" });
    return;
  }

  if (!password && !privateKey) {
    res.status(400).json({ error: "password or privateKey is required" });
    return;
  }

  const id = makeId();
  const client = new Client();

  const session: SshSession = {
    client,
    host,
    username,
    lastActivity: Date.now(),
    ready: false,
  };

  const connectConfig: ConnectConfig = {
    host,
    port: port ?? 22,
    username,
    readyTimeout: 20_000,
    ...(privateKey ? { privateKey } : { password }),
  };

  client.on("ready", () => {
    session.ready = true;
    session.lastActivity = Date.now();
    sessions.set(id, session);
    res.json({ sessionId: id, host, username });
  });

  client.on("error", (err) => {
    if (!session.ready) {
      res.status(400).json({ error: `SSH connection failed: ${err.message}` });
    }
    sessions.delete(id);
  });

  client.on("close", () => {
    sessions.delete(id);
  });

  try {
    client.connect(connectConfig);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    res.status(500).json({ error: msg });
  }
});

router.post("/terminal/ssh/exec", (req: Request, res: Response) => {
  const { sessionId, command } = req.body as {
    sessionId?: string;
    command?: string;
  };

  if (!sessionId || command === undefined) {
    res.status(400).json({ error: "sessionId and command are required" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session || !session.ready) {
    res.status(404).json({ error: "SSH session not found or disconnected. Please reconnect." });
    return;
  }

  session.lastActivity = Date.now();

  let settled = false;

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      res.status(500).json({ error: "Command timed out after 60 seconds" });
    }
  }, CMD_TIMEOUT_MS);

  session.client.exec(command, { pty: false }, (err, stream) => {
    if (err) {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        res.status(500).json({ error: err.message });
      }
      return;
    }

    let stdout = "";
    let stderr = "";
    let exitCode = 0;

    stream.on("data", (data: Buffer) => { stdout += data.toString(); });
    stream.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    stream.on("exit", (code: number | null) => {
      exitCode = code ?? 0;
    });

    stream.on("close", () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        const output = (stdout + stderr).trimEnd();
        res.json({ output, exitCode, cwd: "~" });
      }
    });
  });
});

router.get("/terminal/ssh/session/:id", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (!session || !session.ready) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ host: session.host, username: session.username, connected: true });
});

router.delete("/terminal/ssh/session/:id", (req: Request, res: Response) => {
  const session = sessions.get(req.params.id);
  if (session) {
    try { session.client.end(); } catch { /* ignore */ }
    sessions.delete(req.params.id);
  }
  res.json({ ok: true });
});

export default router;
