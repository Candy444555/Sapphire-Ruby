import { Router, type IRouter, type Request, type Response } from "express";
import { spawn, type ChildProcess } from "child_process";
import net from "net";
import fs from "fs";
import path from "path";

const router: IRouter = Router();

const TOR_SOCKS_PORT = 9050;
const TOR_CONTROL_PORT = 9051;
const TOR_DATA_DIR = "/tmp/tor-vpn-data";
const TOR_COOKIE_PATH = path.join(TOR_DATA_DIR, "control_auth_cookie");

let torProcess: ChildProcess | null = null;
let torReady = false;
let torBootstrapPct = 0;

export function isTorReady(): boolean {
  return torReady;
}

export function getTorSocksUrl(): string {
  return `socks5h://127.0.0.1:${TOR_SOCKS_PORT}`;
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
  ], { stdio: ["ignore", "pipe", "pipe"] });

  torProcess.stdout?.on("data", (data: Buffer) => {
    const msg = data.toString();
    const match = msg.match(/Bootstrapped (\d+)%/);
    if (match) {
      torBootstrapPct = parseInt(match[1], 10);
      if (torBootstrapPct === 100) {
        torReady = true;
        console.log("[VPN] Tor bootstrap complete — ready");
      }
    }
  });

  torProcess.on("exit", (code) => {
    console.log(`[VPN] Tor exited with code ${code}`);
    torProcess = null;
    torReady = false;
    torBootstrapPct = 0;
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

let lastRotate = 0;
const ROTATE_COOLDOWN_MS = 5_000;

router.get("/vpn/status", (_req: Request, res: Response) => {
  res.json({
    active: true,
    torReady,
    bootstrapPct: torBootstrapPct,
    socksPort: TOR_SOCKS_PORT,
  });
});

router.post("/vpn/rotate", async (_req: Request, res: Response) => {
  const now = Date.now();
  if (now - lastRotate < ROTATE_COOLDOWN_MS) {
    res.json({ ok: false, reason: "Cooldown — please wait a few seconds" });
    return;
  }
  if (!torReady) {
    res.json({ ok: false, reason: `Tor still bootstrapping (${torBootstrapPct}%)` });
    return;
  }
  try {
    await sendControlCommand("SIGNAL NEWNYM");
    lastRotate = now;
    res.json({ ok: true, message: "New Tor circuit requested" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.json({ ok: false, reason: msg });
  }
});

startTor();

export default router;
