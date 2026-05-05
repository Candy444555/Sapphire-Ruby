// Per-finding contract: every scanner — built-in, server, on-phone, or
// forged — flows its findings through this normalizer. Guarantees:
//   1. Each finding is logged via lib/logger so it shows up in the Logs tab.
//   2. Each finding can be passed unchanged to the Fix and Reproduce
//      buttons, which call /api/scan/explain.
//
// The Fix and Reproduce calls themselves never execute or weaponize the
// finding; explain.js produces description-only output (#20 contract).

import { log } from "@/lib/logger";
import { getApiUrl } from "@/lib/lexi-api";
import type { NormalizedFinding } from "@/lib/scanners/registry";

export type ExplainMode = "fix" | "reproduce";

export function logFinding(f: NormalizedFinding): void {
  log.warn("scan", "finding", {
    actor: `scanner:${f.tool}` as const,
    target: f.file,
    outputs: {
      severity: f.severity,
      rule: f.rule,
      line: f.line,
      summary: f.summary,
    },
  });
}

export async function* streamExplain(
  finding: NormalizedFinding,
  mode: ExplainMode,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const url = getApiUrl("/api/scan/explain");
  log.info("scan", "explain:start", {
    actor: `scanner:${finding.tool}` as const,
    target: finding.file,
    inputs: { mode, rule: finding.rule },
  });
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ finding, mode }),
      signal,
    });
  } catch (err) {
    yield `\n[error] Could not reach server: ${err instanceof Error ? err.message : String(err)}\n`;
    yield "\n(Tip: set the Server URL in Profile so explanations can be generated.)\n";
    return;
  }
  if (!res.ok || !res.body) {
    yield `\n[error] Server returned HTTP ${res.status}\n`;
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield dec.decode(value, { stream: true });
  }
  log.info("scan", "explain:end", {
    actor: `scanner:${finding.tool}` as const,
    target: finding.file,
    inputs: { mode },
  });
}
