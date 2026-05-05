import { Router, type Request, type Response } from "express";
import express from "express";
import http from "http";
import os from "os";

const router = Router();

interface RequestLogEntry {
  ts: number;
  ip: string;
  method: string;
  path: string;
  ua: string;
  matched: boolean;
}

interface ServerState {
  running: boolean;
  port: number | null;
  startedAt: number | null;
  log: RequestLogEntry[];
  requestCount: number;
}

let server: http.Server | null = null;
const state: ServerState = {
  running: false,
  port: null,
  startedAt: null,
  log: [],
  requestCount: 0,
};

const MAX_LOG = 200;

// Doulci-style activation-bypass plist. Apple's activation client checks for
// these keys; legacy iOS (8 and below on non-modern chips) accepts a signed
// "AccountTokenCertificate" / "AccountToken" pair as proof of activation.
// Modern iOS rejects this — the bypass server is documented as legacy/forensic.
function buildBypassPlist(): string {
  const tokenB64 = Buffer.from(
    JSON.stringify({
      "InternationalMobileEquipmentIdentity": "000000000000000",
      "ActivationRandomness": "00000000-0000-0000-0000-000000000000",
      "ActivityURL": "https://albert.apple.com/deviceservices/activity",
      "PhoneNumberNotificationURL": "https://albert.apple.com/deviceservices/phoneHome",
      "DeviceCertificate": "BYPASS",
      "AccountTokenCertificate": "BYPASS",
      "WildcardTicket": "BYPASS",
    }),
  ).toString("base64");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>iphone-activation</key>
  <dict>
    <key>activation-record</key>
    <dict>
      <key>unbrick</key><true/>
      <key>AccountTokenCertificate</key>
      <data>${tokenB64}</data>
      <key>DeviceCertificate</key>
      <data>${tokenB64}</data>
      <key>RegulatoryInfo</key>
      <data>${tokenB64}</data>
      <key>FairPlayKeyData</key>
      <data>${tokenB64}</data>
      <key>AccountToken</key>
      <data>${tokenB64}</data>
      <key>AccountTokenSignature</key>
      <data>${tokenB64}</data>
      <key>UniqueDeviceCertificate</key>
      <data>${tokenB64}</data>
    </dict>
    <key>show-settings</key><true/>
  </dict>
</dict>
</plist>`;
}

function pushLog(entry: RequestLogEntry) {
  state.log.unshift(entry);
  if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
  state.requestCount++;
}

function getLanIps(): string[] {
  const ips: string[] = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] ?? []) {
      if (!i.internal && i.family === "IPv4") ips.push(i.address);
    }
  }
  return ips;
}

function buildResponderApp(): express.Express {
  const a = express();
  a.use(express.json());
  a.use(express.urlencoded({ extended: true }));
  a.use(express.text({ type: "*/*" }));

  const apple_paths = [
    "/deviceservices/deviceActivation",
    "/deviceservices/drmHandshake",
    "/deviceservices/activity",
    "/deviceservices/phoneHome",
    "/WebObjects/MZInit.woa/wa/itunesPing",
    "/setup.icloud.com/setup/get_account_settings",
  ];

  apple_paths.forEach((p) => {
    a.all(p, (req, res) => {
      pushLog({
        ts: Date.now(),
        ip: (req.ip ?? req.socket.remoteAddress ?? "?").replace(/^::ffff:/, ""),
        method: req.method,
        path: req.originalUrl,
        ua: String(req.headers["user-agent"] ?? "?"),
        matched: true,
      });
      res.setHeader("Content-Type", "application/xml");
      res.send(buildBypassPlist());
    });
  });

  a.all("*", (req, res) => {
    pushLog({
      ts: Date.now(),
      ip: (req.ip ?? req.socket.remoteAddress ?? "?").replace(/^::ffff:/, ""),
      method: req.method,
      path: req.originalUrl,
      ua: String(req.headers["user-agent"] ?? "?"),
      matched: false,
    });
    res.setHeader("Content-Type", "application/xml");
    res.send(buildBypassPlist());
  });
  return a;
}

router.post("/apple/activation/start", (req: Request, res: Response) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "unauthorized" });
  if (state.running) {
    return res.json({
      running: true,
      port: state.port,
      startedAt: state.startedAt,
      ips: getLanIps(),
      message: "Already running.",
    });
  }
  const desiredPort = Number(req.body?.port) || 8088;
  try {
    const responder = buildResponderApp();
    server = http.createServer(responder);
    server.on("error", (err) => {
      console.error("[apple-activation] server error:", err);
      state.running = false;
    });
    server.listen(desiredPort, "0.0.0.0", () => {
      state.running = true;
      state.port = desiredPort;
      state.startedAt = Date.now();
      state.log = [];
      state.requestCount = 0;
      console.log(`[apple-activation] responder listening on 0.0.0.0:${desiredPort}`);
    });
    return res.json({
      running: true,
      port: desiredPort,
      startedAt: Date.now(),
      ips: getLanIps(),
      message: `Bypass responder starting on port ${desiredPort}.`,
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "failed to start" });
  }
});

router.post("/apple/activation/stop", (req: Request, res: Response) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "unauthorized" });
  if (!server || !state.running) {
    return res.json({ running: false, message: "Not running." });
  }
  server.close((err) => {
    if (err) console.error("[apple-activation] close error:", err);
  });
  server = null;
  state.running = false;
  state.port = null;
  state.startedAt = null;
  return res.json({ running: false, message: "Responder stopped." });
});

router.get("/apple/activation/status", (req: Request, res: Response) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "unauthorized" });
  return res.json({
    running: state.running,
    port: state.port,
    startedAt: state.startedAt,
    ips: getLanIps(),
    requestCount: state.requestCount,
    log: state.log.slice(0, 50),
  });
});

router.get("/apple/activation/log", (req: Request, res: Response) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "unauthorized" });
  const since = Number(req.query["since"]) || 0;
  return res.json({
    log: state.log.filter((e) => e.ts > since),
    requestCount: state.requestCount,
    running: state.running,
  });
});

export default router;
