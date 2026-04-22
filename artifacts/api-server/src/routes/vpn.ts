import { Router, type IRouter, type Request, type Response } from "express";
import { spawn, type ChildProcess } from "child_process";
import net from "net";
import fs from "fs";
import path from "path";
import { SocksProxyAgent } from "socks-proxy-agent";

const router: IRouter = Router();

const TOR_SOCKS_PORT = 9050;
const TOR_CONTROL_PORT = 9051;
const TOR_DATA_DIR = "/tmp/tor-vpn-data";
const TOR_COOKIE_PATH = path.join(TOR_DATA_DIR, "control_auth_cookie");

let torProcess: ChildProcess | null = null;
let torReady = false;
let torBootstrapPct = 0;
let lastRotateTs = 0;
let totalRotations = 0;
let autoRotateTimer: NodeJS.Timeout | null = null;
let cachedAgent: SocksProxyAgent | null = null;

const ROTATE_INTERVAL_MS = 2_000;
const ROTATE_COOLDOWN_MS = 2_000;

export function isTorReady(): boolean {
  return torReady;
}

export function getTorSocksUrl(): string {
  return `socks5h://127.0.0.1:${TOR_SOCKS_PORT}`;
}

export function getTorAgent(): SocksProxyAgent | null {
  if (!torReady) return null;
  if (!cachedAgent) cachedAgent = new SocksProxyAgent(getTorSocksUrl());
  return cachedAgent;
}

export function startTor(): void {
  if (torProcess) return;

  fs.mkdirSync(TOR_DATA_DIR, { recursive: true });

  torProcess = spawn("tor", [
    "--SocksPort", String(TOR_SOCKS_PORT),
    "--ControlPort", String(TOR_CONTROL_PORT),
    "--CookieAuthentication", "1",
    "--CookieAuthFileGroupReadable", "1",
    "--DataDirectory", TOR_DATA_DIR,
    "--Log", "notice stdout",
    "--MaxCircuitDirtiness", "10",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  torProcess.stdout?.on("data", (data: Buffer) => {
    const msg = data.toString();
    const match = msg.match(/Bootstrapped (\d+)%/);
    if (match) {
      torBootstrapPct = parseInt(match[1], 10);
      if (torBootstrapPct === 100 && !torReady) {
        torReady = true;
        console.log("[VPN] Tor bootstrap complete — auto-rotation enabled");
        startAutoRotate();
      }
    }
  });

  torProcess.on("exit", (code) => {
    console.log(`[VPN] Tor exited with code ${code}`);
    torProcess = null;
    torReady = false;
    torBootstrapPct = 0;
    cachedAgent = null;
    stopAutoRotate();
    setTimeout(() => startTor(), 3000);
  });

  torProcess.on("error", (err) => {
    console.error("[VPN] Tor process error:", err.message);
  });

  console.log("[VPN] Tor starting...");
}

function sendControlCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let cookie: Buffer;
    try {
      cookie = fs.readFileSync(TOR_COOKIE_PATH);
    } catch {
      reject(new Error("Tor control cookie not found — is Tor running?"));
      return;
    }

    const socket = new net.Socket();
    let buf = "";
    let authenticated = false;
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Control port timeout")); }, 8000);

    socket.connect(TOR_CONTROL_PORT, "127.0.0.1", () => {
      socket.write(`AUTHENTICATE ${cookie.toString("hex")}\r\n`);
    });

    socket.on("data", (data) => {
      buf += data.toString();
      if (!authenticated) {
        if (buf.includes("250 OK\r\n")) {
          authenticated = true;
          buf = "";
          socket.write(`${cmd}\r\n`);
        } else if (buf.includes("515 ") || buf.includes("513 ")) {
          clearTimeout(timer);
          socket.destroy();
          reject(new Error("Tor control authentication failed"));
        }
      } else {
        if (buf.includes("250 OK\r\n")) {
          clearTimeout(timer);
          socket.end();
          resolve(buf);
        } else if (buf.match(/^5\d\d /m)) {
          clearTimeout(timer);
          socket.destroy();
          reject(new Error(`Tor control error: ${buf.trim()}`));
        }
      }
    });

    socket.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

async function rotateCircuit(): Promise<{ ok: boolean; reason?: string }> {
  const now = Date.now();
  if (now - lastRotateTs < ROTATE_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }
  if (!torReady) {
    return { ok: false, reason: `bootstrapping ${torBootstrapPct}%` };
  }
  try {
    await sendControlCommand("SIGNAL NEWNYM");
    lastRotateTs = now;
    totalRotations++;
    cachedAgent = new SocksProxyAgent(getTorSocksUrl());
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "unknown" };
  }
}

function startAutoRotate(): void {
  if (autoRotateTimer) return;
  autoRotateTimer = setInterval(() => {
    rotateCircuit().catch(() => {});
  }, ROTATE_INTERVAL_MS);
  console.log("[VPN] Auto-rotation started (every 2s)");
}

function stopAutoRotate(): void {
  if (autoRotateTimer) {
    clearInterval(autoRotateTimer);
    autoRotateTimer = null;
  }
}

router.get("/vpn/status", (_req: Request, res: Response) => {
  res.json({
    active: torReady,
    torReady,
    bootstrapPct: torBootstrapPct,
    socksPort: TOR_SOCKS_PORT,
    autoRotate: autoRotateTimer !== null,
    rotateIntervalMs: ROTATE_INTERVAL_MS,
    totalRotations,
  });
});

router.post("/vpn/rotate", async (_req: Request, res: Response) => {
  const result = await rotateCircuit();
  res.json(result.ok ? { ok: true, message: "New Tor circuit", totalRotations } : { ok: false, reason: result.reason });
});

startTor();

export default router;
