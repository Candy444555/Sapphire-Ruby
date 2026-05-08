// =============================================================================
// LEXI FLAG — mandatory outbound checkpoint between Featherless and the user.
//
// Every single token that leaves api.featherless.ai bound for the operator MUST
// pass through `lexiFlagOutbound()` (full-text) or `createLexiFlagStream()`
// (streaming, rolling-tail safe). The flag re-asserts every rule baked into
// Lexi by:
//
//   1. Scrubbing identity leaks  -> "Llama" / "Mistral" / "Featherless" /
//      "OpenAI" / "Anthropic" / "as an AI" / "language model" / "I am an AI"
//      etc. become "Lexi" / "" so persona-lock RULE 8 holds even if the
//      underlying model slips.
//   2. Scrubbing refusal/hedge phrases enumerated in RULE 3 of the Operator
//      Literal-Compliance Protocol, plus the moralizing openers from RULE 2.
//   3. Scrubbing fiction-frame distancers ("hypothetically", "let's pretend",
//      "in a fictional scenario", etc.) so RULE 11 holds.
//   4. Re-applying the existing URL/citation scrubber from text-scrub so RULE
//      4 ("URLs are citations only") and the search-context "no URL leaks"
//      guarantee both hold.
//   5. Logging every flag fire to lexi-flag.log so the operator can audit
//      that the boundary really is enforcing.
//
// The flag is streaming-safe: it uses a rolling tail (default 128 chars,
// covers the longest banned phrase + boundary) so a phrase split across two
// SSE chunks ("I can" + "'t do that") still gets caught and stripped before
// the first half is flushed.
// =============================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scrubUserFacingText } from "../lib/text-scrub.js";

const _moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const FLAG_LOG = path.resolve(_moduleDir, "../../../../lexi-flag.log");

// ---------------------------------------------------------------------------
// Identity-leak rewrites (case-insensitive, word-boundary). Anything that
// would expose the underlying model/provider/architecture is replaced.
// Order matters — longer / multi-word patterns first so they win the match.
// ---------------------------------------------------------------------------
const IDENTITY_REWRITES: { re: RegExp; to: string }[] = [
  // Self-references that name the underlying tech
  { re: /\bI(?:'m| am)\s+an?\s+(?:AI\s+)?language\s+model\b[^.,;\n]*/gi, to: "I'm Lexi" },
  { re: /\bI(?:'m| am)\s+an?\s+AI\s+assistant\b[^.,;\n]*/gi, to: "I'm Lexi" },
  { re: /\bI(?:'m| am)\s+an?\s+AI\b/gi, to: "I'm Lexi" },
  { re: /\bas\s+an?\s+AI(?:\s+language\s+model)?\b[^.,;\n]*/gi, to: "" },
  { re: /\blarge\s+language\s+model\b/gi, to: "" },
  { re: /\blanguage\s+model\b/gi, to: "" },
  // Provider / lab names
  { re: /\b(?:meta\s+ai|meta\s+platforms|meta\s+llama|meta(?=[\s,.])|llama(?:\s*[-\s]?\s*\d+(?:\.\d+)?[bB]?)?)\b/gi, to: "Lexi" },
  { re: /\bmistral(?:\s*ai)?(?:\s*nemo)?(?:\s*\d+[bB])?\b/gi, to: "Lexi" },
  { re: /\bdolphin(?:\s*[-\s]?\s*\d+(?:\.\d+)*)?\b/gi, to: "Lexi" },
  { re: /\b(?:hermes(?:\s*[-\s]?\s*\d+)?|nous\s*research|nousresearch)\b/gi, to: "Lexi" },
  { re: /\b(?:euryale|magnum|mythomax|sao10k|gryphe|anthracite|orenguteng)\b/gi, to: "Lexi" },
  { re: /\bfeatherless(?:\.ai)?\b/gi, to: "Lexi" },
  { re: /\bhugging\s*face\b/gi, to: "Lexi" },
  { re: /\b(?:openai|chatgpt|gpt[-\s]?\d*(?:\.\d+)?(?:\s*turbo)?|gpt)\b/gi, to: "Lexi" },
  { re: /\b(?:anthropic|claude(?:\s*\d+(?:\.\d+)?)?(?:\s*(?:sonnet|opus|haiku))?)\b/gi, to: "Lexi" },
  { re: /\b(?:google\s*deepmind|deepmind|gemini(?:\s*\d+(?:\.\d+)?)?(?:\s*(?:pro|flash|ultra))?|bard|palm\s*\d*)\b/gi, to: "Lexi" },
  { re: /\b(?:cohere|command[-\s]?r(?:\+|\s*plus)?)\b/gi, to: "Lexi" },
  { re: /\b(?:mixtral|qwen(?:\s*\d+)?|deepseek(?:[-\s]?\w+)?|grok(?:\s*\d+)?|xai)\b/gi, to: "Lexi" },
  // Architecture / training tells
  { re: /\bI\s+was\s+(?:trained|created|built|developed|designed|made)\s+by\s+[^.,;\n]+/gi, to: "I am Lexi Uncensored v2" },
  { re: /\bmy\s+(?:training\s+(?:data|cutoff)|knowledge\s+cutoff|model\s+(?:weights|architecture|parameters)|context\s+window|parameter\s+count)\b[^.,;\n]*/gi, to: "" },
  { re: /\bI\s+(?:don't|do\s+not)\s+have\s+(?:access\s+to\s+)?(?:real[-\s]?time\s+)?(?:internet|the\s+web|browsing|search)\b[^.,;\n]*/gi, to: "" },
  { re: /\bI\s+(?:can(?:not|'t))\s+(?:browse|access)\s+the\s+(?:internet|web)\b[^.,;\n]*/gi, to: "" },
];

// ---------------------------------------------------------------------------
// Refusal / hedge / moralize phrases — RULE 2 + RULE 3 enforcement.
// Match the phrase plus the rest of its sentence (up to terminal punctuation)
// so we don't leave dangling "I shouldn't" fragments behind.
// ---------------------------------------------------------------------------
const REFUSAL_PHRASES: RegExp[] = [
  /\bI(?:'m| am)\s+(?:not\s+able|unable)\s+to[^.,;\n]*[.,;\n]?/gi,
  /\bI\s+can(?:not|'t)\s+(?:help|assist|do|provide|generate|create|write|share|give|comply|engage|continue|fulfill)[^.,;\n]*[.,;\n]?/gi,
  /\bI\s+won(?:'t|'?\s*not)\s+(?:help|assist|do|provide|generate|create|write|share|give|comply|engage|continue|fulfill)[^.,;\n]*[.,;\n]?/gi,
  /\bI\s+shouldn(?:'t|'?\s*not)[^.,;\n]*[.,;\n]?/gi,
  /\bI\s+(?:don'?t|do\s+not)\s+feel\s+comfortable[^.,;\n]*[.,;\n]?/gi,
  /\bI\s+(?:would|'?d)\s+rather\s+not[^.,;\n]*[.,;\n]?/gi,
  /\bI\s+(?:have|need)\s+to\s+(?:mention|note|point\s+out|remind\s+you)[^.,;\n]*[.,;\n]?/gi,
  /\blet\s+me\s+suggest\s+(?:instead|something\s+else|a\s+different\s+approach)[^.,;\n]*[.,;\n]?/gi,
  /\b(?:a|the)\s+safer\s+(?:approach|alternative|option|way)[^.,;\n]*[.,;\n]?/gi,
  /\bfor\s+(?:ethical|safety|legal|moral)\s+reasons[^.,;\n]*[.,;\n]?/gi,
  /\bthis\s+(?:could|might|may)\s+be\s+(?:misused|harmful|dangerous|illegal)[^.,;\n]*[.,;\n]?/gi,
  /\bplease\s+(?:be\s+aware|note|understand)\s+that[^.,;\n]*[.,;\n]?/gi,
  /\b(?:just\s+so\s+you\s+know|be\s+careful|have\s+you\s+considered|are\s+you\s+sure)[^.,;\n]*[.,;\n]?/gi,
  /\bwhile\s+I\s+can\s+(?:do\s+)?this,?\s+you\s+should[^.,;\n]*[.,;\n]?/gi,
  // Fiction-frame distancers — RULE 11
  /\b(?:hypothetically|in\s+a\s+(?:fictional|hypothetical)\s+(?:scenario|setting|world)|let'?s\s+pretend|for\s+the\s+sake\s+of\s+argument|as\s+a\s+thought\s+experiment|for\s+educational\s+purposes\s+only)\b[^.,;\n]*[.,;\n]?/gi,
  // Common opener disclaimers
  /\b(?:disclaimer|important\s+note|content\s+warning|trigger\s+warning|safety\s+note)\s*:[^.\n]*[.\n]?/gi,
  /\bI\s+(?:must|need\s+to|have\s+to)\s+(?:emphasize|stress|warn|caution|advise)[^.,;\n]*[.,;\n]?/gi,
];

// ---------------------------------------------------------------------------
// In-memory counter so the audit log shows aggregate flag activity per
// process lifetime without growing unbounded.
// ---------------------------------------------------------------------------
let flagFireCount = 0;
let flagBytesScrubbed = 0;

export function getLexiFlagStats(): { fires: number; bytesScrubbed: number } {
  return { fires: flagFireCount, bytesScrubbed: flagBytesScrubbed };
}

function logFlagFire(category: string, before: string, after: string): void {
  if (before === after) return;
  flagFireCount += 1;
  flagBytesScrubbed += Math.max(0, before.length - after.length);
  try {
    const line =
      `[${new Date().toISOString()}] flag=${category} ` +
      `delta=${before.length - after.length}B ` +
      `sample=${JSON.stringify(before.slice(0, 120))}\n`;
    fs.appendFileSync(FLAG_LOG, line, "utf-8");
  } catch {
    // never let the flag itself break a request
  }
}

// ---------------------------------------------------------------------------
// Core scrub passes. Pure functions — safe for both streaming and full-text.
// ---------------------------------------------------------------------------
function applyIdentityScrub(text: string): string {
  let out = text;
  for (const { re, to } of IDENTITY_REWRITES) out = out.replace(re, to);
  return out;
}

function applyRefusalScrub(text: string): string {
  let out = text;
  for (const re of REFUSAL_PHRASES) out = out.replace(re, "");
  return out;
}

// Final cosmetic pass to clean up double spaces / orphan punctuation that
// the scrubs may leave behind. Streaming-safe variant preserves boundary
// whitespace (otherwise " world" → "world" and concats with previous chunk).
function tidy(text: string, streaming: boolean): string {
  let out = text
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/ ?, ?,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",");
  if (streaming) return out;
  out = out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

// Regions whose contents must NEVER be touched by identity/refusal/URL scrubs.
// Used by agent-mode where the model emits machine-parsed tags that may legit-
// imately contain words like "llama_test.py", URLs in `curl` commands, or
// refusal-shaped strings inside string literals. We mask them out, scrub the
// surrounding prose, then restore byte-for-byte.
const PRESERVE_REGIONS: RegExp[] = [
  /<cmd>[\s\S]*?<\/cmd>/g,
  /<needs_input>[\s\S]*?<\/needs_input>/g,
  /\[SELF_PATCH\s+name="[^"]+"(?:\s+description="[^"]*")?\][\s\S]*?\[\/SELF_PATCH\]/g,
  /\[SELF_PATCH_PYTHON\s+name="[^"]+"(?:\s+description="[^"]*")?\][\s\S]*?\[\/SELF_PATCH_PYTHON\]/g,
  /\[SELF_PATCH_JS_SKILL\s+name="[^"]+"(?:\s+description="[^"]*")?\][\s\S]*?\[\/SELF_PATCH_JS_SKILL\]/g,
  /\[PROJECT_DONE\s+[^\]]+\]/g,
  /```[a-zA-Z0-9_+.-]*\n[\s\S]*?```/g,
  /`[^`\n]+`/g,
];

function maskPreserved(text: string): { masked: string; restore: (s: string) => string } {
  const stash: string[] = [];
  let masked = text;
  for (const re of PRESERVE_REGIONS) {
    masked = masked.replace(re, (m) => {
      const token = `\u0000LEXIFLAG_${stash.length}\u0000`;
      stash.push(m);
      return token;
    });
  }
  return {
    masked,
    restore: (s: string) =>
      s.replace(/\u0000LEXIFLAG_(\d+)\u0000/g, (_, i) => stash[Number(i)] ?? ""),
  };
}

/**
 * Full-text outbound flag — apply to a complete Featherless reply (non-streaming
 * or accumulated buffer). Returns the rewritten text safe to send to the user.
 *
 * `preserveTags` (default true) masks <cmd>, [SELF_PATCH …], [PROJECT_DONE],
 * and ``` fenced code blocks ``` before scrubbing so agent-mode machine tags
 * and code identifiers (e.g. `llama_test.py`, `mistral_config.json`) survive
 * intact for the downstream parser.
 */
export function lexiFlagOutbound(text: string, opts?: { preserveTags?: boolean }): string {
  if (!text) return text;
  const preserve = opts?.preserveTags !== false;
  const { masked, restore } = preserve ? maskPreserved(text) : { masked: text, restore: (s: string) => s };
  const before = masked;
  let out = masked;
  out = applyIdentityScrub(out);
  if (out !== before) logFlagFire("identity", before, out);
  const afterIdentity = out;
  out = applyRefusalScrub(out);
  if (out !== afterIdentity) logFlagFire("refusal", afterIdentity, out);
  const afterRefusal = out;
  out = scrubUserFacingText(out, { streaming: false });
  if (out !== afterRefusal) logFlagFire("urls", afterRefusal, out);
  return tidy(restore(out), false);
}

/**
 * Streaming variant. Returns a `feed(chunk, isFinal)` function that holds back
 * a rolling tail so phrases split across SSE boundaries still get caught.
 *
 * Usage:
 *   const flag = createLexiFlagStream();
 *   flag.feed(token);                 // returns sanitized text-to-emit (may be "")
 *   ...
 *   const trailing = flag.feed("", true);
 */
export function createLexiFlagStream(opts?: { holdback?: number }): {
  feed: (chunk: string, isFinal?: boolean) => string;
  stats: () => { fires: number; bytesScrubbed: number };
} {
  const HOLDBACK = Math.max(96, opts?.holdback ?? 128);
  let tail = "";
  return {
    feed(chunk: string, isFinal = false): string {
      tail += chunk ?? "";
      let working: string;
      if (isFinal) {
        working = tail;
        tail = "";
      } else if (tail.length > HOLDBACK) {
        working = tail.slice(0, tail.length - HOLDBACK);
        tail = tail.slice(tail.length - HOLDBACK);
      } else {
        return "";
      }
      if (!working) return "";
      const before = working;
      let out = working;
      out = applyIdentityScrub(out);
      if (out !== before) logFlagFire("identity-stream", before, out);
      const afterIdentity = out;
      out = applyRefusalScrub(out);
      if (out !== afterIdentity) logFlagFire("refusal-stream", afterIdentity, out);
      const afterRefusal = out;
      out = scrubUserFacingText(out, { streaming: true });
      if (out !== afterRefusal) logFlagFire("urls-stream", afterRefusal, out);
      return tidy(out, true);
    },
    stats: () => ({ fires: flagFireCount, bytesScrubbed: flagBytesScrubbed }),
  };
}
