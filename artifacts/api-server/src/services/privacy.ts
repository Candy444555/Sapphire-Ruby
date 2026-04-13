import { SocksProxyAgent } from "socks-proxy-agent";
import { isTorReady, getTorSocksUrl } from "../routes/vpn";

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
];

export function randomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function buildPrivacyHeaders(apiKey: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": randomUserAgent(),
    "Accept": "application/json, text/event-stream",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  };
}

export function buildFetchOptions(
  apiKey: string,
  body: object
): RequestInit & { agent?: unknown } {
  const options: RequestInit & { agent?: unknown } = {
    method: "POST",
    headers: buildPrivacyHeaders(apiKey),
    body: JSON.stringify(body),
  };

  if (isTorReady()) {
    options.agent = new SocksProxyAgent(getTorSocksUrl());
  }

  return options;
}

export function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
      .replace(/hf_[A-Za-z0-9]+/gi, "[REDACTED]")
      .slice(0, 120);
  }
  return "Request failed";
}
