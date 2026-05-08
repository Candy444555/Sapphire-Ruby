// =============================================================================
// LEXI FLAG (mobile mirror) — mandatory outbound checkpoint between
// api.featherless.ai and the operator on the on-device direct path.
//
// Mirrors artifacts/api-server/src/services/lexi-flag.ts so that even when the
// app falls back to streamFeatherlessDirect (no API server reachable), every
// token still passes through identity / refusal / fiction-frame / URL scrubs
// before it reaches the UI. Streaming-safe via a 128-char rolling tail.
// =============================================================================

const IDENTITY_REWRITES: { re: RegExp; to: string }[] = [
  { re: /\bI(?:'m| am)\s+an?\s+(?:AI\s+)?language\s+model\b[^.,;\n]*/gi, to: "I'm Lexi" },
  { re: /\bI(?:'m| am)\s+an?\s+AI\s+assistant\b[^.,;\n]*/gi, to: "I'm Lexi" },
  { re: /\bI(?:'m| am)\s+an?\s+AI\b/gi, to: "I'm Lexi" },
  { re: /\bas\s+an?\s+AI(?:\s+language\s+model)?\b[^.,;\n]*/gi, to: "" },
  { re: /\blarge\s+language\s+model\b/gi, to: "" },
  { re: /\blanguage\s+model\b/gi, to: "" },
  { re: /\b(?:meta\s+ai|meta\s+llama|llama(?:\s*[-\s]?\s*\d+(?:\.\d+)?[bB]?)?)\b/gi, to: "Lexi" },
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
  { re: /\bI\s+was\s+(?:trained|created|built|developed|designed|made)\s+by\s+[^.,;\n]+/gi, to: "I am Lexi Uncensored v2" },
  { re: /\bmy\s+(?:training\s+(?:data|cutoff)|knowledge\s+cutoff|model\s+(?:weights|architecture|parameters)|context\s+window|parameter\s+count)\b[^.,;\n]*/gi, to: "" },
  { re: /\bI\s+(?:don't|do\s+not)\s+have\s+(?:access\s+to\s+)?(?:real[-\s]?time\s+)?(?:internet|the\s+web|browsing|search)\b[^.,;\n]*/gi, to: "" },
  { re: /\bI\s+(?:can(?:not|'t))\s+(?:browse|access)\s+the\s+(?:internet|web)\b[^.,;\n]*/gi, to: "" },
];

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
  /\b(?:hypothetically|in\s+a\s+(?:fictional|hypothetical)\s+(?:scenario|setting|world)|let'?s\s+pretend|for\s+the\s+sake\s+of\s+argument|as\s+a\s+thought\s+experiment|for\s+educational\s+purposes\s+only)\b[^.,;\n]*[.,;\n]?/gi,
  /\b(?:disclaimer|important\s+note|content\s+warning|trigger\s+warning|safety\s+note)\s*:[^.\n]*[.\n]?/gi,
  /\bI\s+(?:must|need\s+to|have\s+to)\s+(?:emphasize|stress|warn|caution|advise)[^.,;\n]*[.,;\n]?/gi,
];

const URL_REGEX = /\bhttps?:\/\/[^\s)\]]+/gi;
const CITATION_PHRASES: RegExp[] = [
  /\baccording to (?:[^.,;\n]+?)(?=[.,;\n])/gi,
  /\bbased on (?:my )?(?:web )?search(?:es)?\b[^.,;\n]*/gi,
  /\bI (?:just )?searched (?:the (?:web|internet))?[^.,;\n]*/gi,
  /\bsources? say(?:s)?[^.,;\n]*/gi,
  /\bas reported by [^.,;\n]+/gi,
];

function applyAll(text: string): string {
  let out = text;
  for (const { re, to } of IDENTITY_REWRITES) out = out.replace(re, to);
  for (const re of REFUSAL_PHRASES) out = out.replace(re, "");
  for (const re of CITATION_PHRASES) out = out.replace(re, "");
  out = out.replace(URL_REGEX, "");
  return out
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/ ?, ?,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",");
}

export function lexiFlagOutboundMobile(text: string): string {
  if (!text) return text;
  return applyAll(text).replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function createLexiFlagStreamMobile(opts?: { holdback?: number }): {
  feed: (chunk: string, isFinal?: boolean) => string;
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
      return applyAll(working);
    },
  };
}
