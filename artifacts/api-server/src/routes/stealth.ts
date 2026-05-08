import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { SocksProxyAgent } from "socks-proxy-agent";
import { isTorReady, getTorSocksUrl } from "./vpn";
import { randomUserAgent, sanitizeError } from "../services/privacy";

const router: IRouter = Router();

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_BODY_BYTES = 25 * 1024 * 1024;

const STRIP_REQUEST_HEADERS = new Set([
  "host", "connection", "content-length", "transfer-encoding",
  "cookie", "referer", "origin",
  "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip",
  "x-replit-user-id", "x-replit-user-name", "x-replit-user-roles",
  "true-client-ip", "cf-connecting-ip", "fastly-client-ip",
  "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
  "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "sec-fetch-user",
  "via", "forwarded",
]);

const STRIP_RESPONSE_HEADERS = new Set([
  "set-cookie", "server", "x-powered-by", "x-served-by",
  "cf-ray", "cf-cache-status", "x-amz-cf-id", "x-amz-cf-pop",
  "x-cache", "x-cache-hits", "via",
  "report-to", "nel", "expect-ct",
]);

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::" || h === "::1") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/\.internal$/.test(h) || /\.local$/.test(h)) return true;
  if (/\.replit\.dev$/.test(h) || /\.repl\.co$/.test(h) || /\.replit\.app$/.test(h)) return true;
  return false;
}

function sanitizeRequestHeaders(input: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (input) {
    for (const [k, v] of Object.entries(input)) {
      const key = k.toLowerCase();
      if (STRIP_REQUEST_HEADERS.has(key)) continue;
      if (key.startsWith("x-replit-")) continue;
      if (typeof v === "string") out[k] = v;
    }
  }
  out["User-Agent"] = randomUserAgent();
  out["Accept-Language"] = "en-US,en;q=0.9";
  out["Accept-Encoding"] = "identity";
  out["DNT"] = "1";
  if (!out["Accept"] && !out["accept"]) out["Accept"] = "*/*";
  return out;
}

// DEPRECATED — Lexi mobile now does on-device stealth (embedded Tor +
// Cronet + curl-impersonate). This route is kept temporarily for any older
// builds still in the wild and returns 410 Gone so they fail loudly instead
// of silently routing through the server.
router.post("/api/stealth-fetch/legacy", async (req: Request, res: Response): Promise<void> => {
  try {
    const { url, method, headers, body } = req.body as {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string | null;
    };

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "url is required" });
      return;
    }
    let parsed: URL;
    try { parsed = new URL(url); } catch {
      res.status(400).json({ error: "invalid url" });
      return;
    }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      res.status(400).json({ error: "only http/https allowed" });
      return;
    }
    if (isPrivateHost(parsed.hostname)) {
      res.status(403).json({ error: "private/internal hosts blocked" });
      return;
    }
    if (!isTorReady()) {
      res.status(503).json({ error: "Tor circuit not ready — stealth refuses to leak. Try again in a moment." });
      return;
    }

    const cleanHeaders = sanitizeRequestHeaders(headers);
    const upstreamMethod = (method ?? "GET").toUpperCase();
    const hasBody = body != null && upstreamMethod !== "GET" && upstreamMethod !== "HEAD";
    const bodyBuf = hasBody ? Buffer.from(body!, "utf8") : undefined;
    if (bodyBuf && bodyBuf.length > MAX_BODY_BYTES) {
      res.status(413).json({ error: "body too large" });
      return;
    }

    const agent = new SocksProxyAgent(getTorSocksUrl());
    const ctrl = new AbortController();
    req.on("close", () => ctrl.abort());

    const upstream = await fetch(parsed.toString(), {
      method: upstreamMethod,
      headers: cleanHeaders,
      body: bodyBuf,
      signal: ctrl.signal,
      // @ts-expect-error node fetch agent
      agent,
      redirect: "follow",
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      const lk = key.toLowerCase();
      if (STRIP_RESPONSE_HEADERS.has(lk)) return;
      if (lk === "content-encoding" || lk === "content-length") return;
      res.setHeader(key, value);
    });
    res.setHeader("X-Stealth", "tor");

    if (upstream.body) {
      const nodeStream = Readable.fromWeb(upstream.body as never);
      nodeStream.pipe(res);
      nodeStream.on("error", () => { try { res.end(); } catch {} });
    } else {
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(502).json({ error: sanitizeError(err) });
    } else {
      try { res.end(); } catch {}
    }
  }
});

router.post("/api/stealth-fetch", (_req, res) => {
  res.status(410).json({
    error: "GONE",
    message: "Server-side stealth-fetch is deprecated. Lexi mobile now runs the embedded Tor + Cronet + curl-impersonate stack on-device. Update the app.",
  });
});

router.get("/api/stealth-fetch/status", (_req, res) => {
  res.json({ ok: true, torReady: isTorReady() });
});

export default router;
