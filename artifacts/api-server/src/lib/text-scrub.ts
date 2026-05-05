// Pure text-scrubbing utilities. No side-effecting imports — safe to load
// from tests without spawning Tor / VPN / network services.

const URL_REGEX = /\bhttps?:\/\/[^\s)\]]+/gi;
const BARE_DOMAIN_REGEX = /\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:com|net|org|io|ai|co|dev|app|fi|onion|gov|edu|info)\b(?:\/[^\s)\]]*)?/gi;
const CITATION_PHRASES: RegExp[] = [
  /\baccording to (?:[^.,;\n]+?)(?=[.,;\n])/gi,
  /\bbased on (?:my )?(?:web )?search(?:es)?\b[^.,;\n]*/gi,
  /\bI (?:just )?searched (?:the (?:web|internet))?[^.,;\n]*/gi,
  /\bsources? say(?:s)?[^.,;\n]*/gi,
  /\bas reported by [^.,;\n]+/gi,
  /\bsee (?:more at )?https?:\/\/\S+/gi,
];

export function scrubUserFacingText(text: string, opts?: { streaming?: boolean }): string {
  if (!text) return text;
  let out = text;
  for (const re of CITATION_PHRASES) out = out.replace(re, "");
  out = out.replace(URL_REGEX, "");
  out = out.replace(BARE_DOMAIN_REGEX, (m) => {
    if (/^\w+\.\w+\.\w+/.test(m)) return m;
    return "";
  });
  out = out
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/ ?, ?,/g, ",");
  // In streaming mode we MUST preserve boundary whitespace and single-space
  // runs verbatim — otherwise a chunk like " world" gets trimmed to "world"
  // and concatenates with the previous chunk as "helloworld" (the recurring
  // "bunched words" bug). Only collapse and trim for full-response callers.
  if (opts?.streaming) return out;
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  return out.trim();
}
