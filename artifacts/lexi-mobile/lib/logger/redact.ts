const SENSITIVE_KEYS = [
  "token",
  "tokens",
  "apikey",
  "api_key",
  "authorization",
  "password",
  "secret",
  "secrets",
  "cookie",
  "set-cookie",
  "x-api-key",
  "bearer",
  "sessionid",
  "session_id",
  "client_secret",
  "refresh_token",
  "access_token",
];

const REDACTED = "[REDACTED]";
const SENSITIVE_QUERY_KEYS = new Set([
  "token",
  "apikey",
  "api_key",
  "key",
  "access_token",
  "auth",
  "authorization",
  "password",
  "secret",
  "session",
  "sig",
  "signature",
]);

export function redactQueryString(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(k.toLowerCase())) {
        u.searchParams.set(k, REDACTED);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

export function redactHeaders(h: Record<string, unknown> | undefined | null): Record<string, unknown> {
  if (!h || typeof h !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = SENSITIVE_KEYS.includes(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value == null) return value;
  const t = typeof value;
  if (t === "string") {
    return redactBearerInString(value as string);
  }
  if (t !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.includes(k.toLowerCase())) {
      out[k] = REDACTED;
    } else {
      out[k] = redact(v, depth + 1);
    }
  }
  return out;
}

const BEARER_RE = /(Bearer\s+)([A-Za-z0-9._\-+/=]{8,})/gi;
const SK_RE = /\b(sk-[A-Za-z0-9_\-]{12,})\b/g;
const HEX_KEY_RE = /\b([A-Fa-f0-9]{40,})\b/g;

function redactBearerInString(s: string): string {
  if (s.length > 4096) return s.slice(0, 4096) + "…[truncated]";
  return s
    .replace(BEARER_RE, (_m, p1) => `${p1}${REDACTED}`)
    .replace(SK_RE, REDACTED)
    .replace(HEX_KEY_RE, (m) => (m.length >= 40 ? REDACTED : m));
}
