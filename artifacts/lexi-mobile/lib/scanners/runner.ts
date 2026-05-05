// Scanner runner: orchestrates a multi-tool scan against a chosen source.
// Phone-only tools run in-process; server tools stream over SSE.
//
// Contract for every finding:
//   1. Pushed through lib/findings/contract::logFinding so it lands in the Logs tab.
//   2. Returned to the caller via the onFinding callback so the UI updates live.

import { getApiUrl } from "@/lib/lexi-api";
import { log } from "@/lib/logger";
import { logFinding } from "@/lib/findings/contract";
import { BUILTIN_TOOLS, type NormalizedFinding, type SourceKind } from "./registry";
import "@/lib/scanners/on-phone";  // attach phone runners on import
import "@/lib/tool-forge";          // ensure registered (caller still needs to hydrate)

export type RunSource =
  | { kind: "workspace" }
  | { kind: "github"; repo: string }
  | { kind: "file"; filename: string; content: string }
  | { kind: "screen"; filename: string; content: string }
  | { kind: "apk-path"; apkPath: string };

export type ToolEvent =
  | { type: "tool-start"; tool: string }
  | { type: "tool-end"; tool: string; status: "ok" | "error"; durationMs: number; findingCount: number; message?: string }
  | { type: "finding"; finding: NormalizedFinding }
  | { type: "status"; phase: string; message?: string }
  | { type: "done"; totalFindings: number; durationMs: number }
  | { type: "error"; message: string };

export type RunOptions = {
  toolIds: string[];
  source: RunSource;
  signal?: AbortSignal;
  onEvent: (ev: ToolEvent) => void;
};

function srcKindForRegistry(s: RunSource): SourceKind {
  switch (s.kind) {
    case "workspace": return "workspace";
    case "github":    return "github";
    case "file":      return "file";
    case "screen":    return "screen";
    case "apk-path":  return "apk";
  }
}

function toolAcceptsSource(toolId: string, src: RunSource): boolean {
  const t = BUILTIN_TOOLS.find((x) => x.id === toolId);
  if (!t) return false;
  return t.acceptsSources.includes(srcKindForRegistry(src));
}

// ── Phone tool runner ────────────────────────────────────────────────
async function runPhoneTool(
  toolId: string,
  src: RunSource,
  onEvent: (ev: ToolEvent) => void,
): Promise<number> {
  const tool = BUILTIN_TOOLS.find((t) => t.id === toolId);
  if (!tool || !tool.phoneRunner) {
    onEvent({ type: "tool-end", tool: toolId, status: "error", durationMs: 0, findingCount: 0,
      message: "no phone runner" });
    return 0;
  }
  if (src.kind !== "file" && src.kind !== "screen") {
    onEvent({ type: "tool-end", tool: toolId, status: "error", durationMs: 0, findingCount: 0,
      message: `phone tool needs file/screen source, got ${src.kind}` });
    return 0;
  }
  onEvent({ type: "tool-start", tool: toolId });
  const start = Date.now();
  try {
    const findings = await tool.phoneRunner({
      kind: "text", filename: src.filename, content: src.content,
    });
    for (const f of findings) {
      logFinding(f);
      onEvent({ type: "finding", finding: f });
    }
    onEvent({ type: "tool-end", tool: toolId, status: "ok", durationMs: Date.now() - start, findingCount: findings.length });
    return findings.length;
  } catch (err) {
    onEvent({ type: "tool-end", tool: toolId, status: "error", durationMs: Date.now() - start,
      findingCount: 0, message: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

// ── Server tool runner via SSE ───────────────────────────────────────
async function runServerTools(
  toolIds: string[],
  src: RunSource,
  signal: AbortSignal | undefined,
  onEvent: (ev: ToolEvent) => void,
): Promise<number> {
  const url = getApiUrl("/api/scan/run");
  const sourcePayload =
    src.kind === "github"  ? { kind: "github", repo: src.repo } :
    src.kind === "file"    ? { kind: "upload-text", filename: src.filename, text: src.content } :
    src.kind === "screen"  ? { kind: "upload-text", filename: src.filename, text: src.content } :
    src.kind === "apk-path"? { kind: "apk-path", apkPath: src.apkPath } :
                              { kind: "workspace" };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ tools: toolIds, source: sourcePayload }),
      signal,
    });
  } catch (err) {
    onEvent({ type: "error", message: `Cannot reach server: ${err instanceof Error ? err.message : String(err)}` });
    return 0;
  }
  if (!res.ok || !res.body) {
    onEvent({ type: "error", message: `Server HTTP ${res.status}` });
    return 0;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let totalFindings = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(data); } catch { continue; }
      if (event === "finding") {
        const finding: NormalizedFinding = {
          tool: String(payload.tool ?? "unknown"),
          severity: ((["low","medium","high","critical"].includes(String(payload.severity)))
            ? payload.severity : "medium") as NormalizedFinding["severity"],
          file: payload.file as string | undefined,
          line: payload.line as number | undefined,
          rule: payload.rule as string | undefined,
          summary: String(payload.summary ?? "Finding"),
          raw: payload.raw,
        };
        logFinding(finding);
        onEvent({ type: "finding", finding });
        totalFindings++;
      } else if (event === "status") {
        onEvent({ type: "status", phase: String(payload.phase ?? ""), message: payload.message as string | undefined });
        if (payload.phase === "tool-start" && payload.tool) {
          onEvent({ type: "tool-start", tool: String(payload.tool) });
        }
      } else if (event === "tool-end") {
        onEvent({
          type: "tool-end",
          tool: String(payload.tool),
          status: payload.status === "ok" ? "ok" : "error",
          durationMs: Number(payload.durationMs ?? 0),
          findingCount: Number(payload.findingCount ?? 0),
          message: payload.message as string | undefined,
        });
      } else if (event === "done") {
        onEvent({ type: "done", totalFindings: Number(payload.totalFindings ?? 0), durationMs: Number(payload.durationMs ?? 0) });
      } else if (event === "error") {
        onEvent({ type: "error", message: String(payload.message ?? "server error") });
      }
    }
  }
  return totalFindings;
}

// ── Public entry ─────────────────────────────────────────────────────
export async function runScan(opts: RunOptions): Promise<{ totalFindings: number }> {
  const { toolIds, source, signal, onEvent } = opts;
  const start = Date.now();
  log.info("scan", "run:start", { actor: "app", inputs: { tools: toolIds, source: source.kind } });

  const accepted = toolIds.filter((id) => toolAcceptsSource(id, source));
  const rejected = toolIds.filter((id) => !accepted.includes(id));
  for (const id of rejected) {
    onEvent({ type: "tool-end", tool: id, status: "error", durationMs: 0, findingCount: 0,
      message: `tool does not accept ${source.kind} source` });
  }

  const phoneIds: string[] = [];
  const serverIds: string[] = [];
  for (const id of accepted) {
    const t = BUILTIN_TOOLS.find((x) => x.id === id);
    if (!t) continue;
    if (t.runsOn === "phone") phoneIds.push(id);
    else if (t.runsOn === "server") serverIds.push(id);
    else {
      // "either" — prefer phone for file/screen sources (offline-friendly).
      if (source.kind === "file" || source.kind === "screen") phoneIds.push(id);
      else serverIds.push(id);
    }
  }

  let totalFindings = 0;
  const tasks: Promise<number>[] = [];
  for (const id of phoneIds) tasks.push(runPhoneTool(id, source, onEvent));
  if (serverIds.length > 0) tasks.push(runServerTools(serverIds, source, signal, onEvent));

  const counts = await Promise.all(tasks);
  totalFindings = counts.reduce((s, n) => s + n, 0);

  const durationMs = Date.now() - start;
  onEvent({ type: "done", totalFindings, durationMs });
  log.info("scan", "run:end", { actor: "app", outputs: { totalFindings, durationMs } });
  return { totalFindings };
}
