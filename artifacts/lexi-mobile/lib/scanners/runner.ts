// Parallel runner. Orchestrates phone-first / server-fallback policy, fans
// out concurrent tool runs, and streams events into the Logs tab and the
// Scan tab UI.
import { getApiBase, getApiUrl } from "@/lib/lexi-api";
import { log, newCorrelationId } from "@/lib/logger";
import { normalizeFinding, type NormalizedFinding, type RawFinding } from "@/lib/findings/contract";
import { getScanner } from "./registry";
import { runAiReview } from "./ai-review";
import { regexSecretsScan, type FileBlob } from "./phone-scanners";
import { runForgedTool } from "@/lib/tool-forge/runner";
import { getScanSettings } from "@/lib/scan-settings";

export type ScanSource =
  | { kind: "github"; payload: { url: string } }
  | { kind: "upload"; payload: { files: { name: string; text?: string; contentBase64?: string }[] } }
  | { kind: "zip"; payload: { name: string; contentBase64: string } }
  | { kind: "workspace" }
  | { kind: "apk"; payload: { name: string; contentBase64: string } }
  | { kind: "screen"; payload: { ocrText: string } };

// Strict GitHub URL — mirrors server-side check so we fail fast in the UI.
export const GITHUB_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/;

export type ToolEvent =
  | { kind: "tool"; tool: string; status: "start" | "ok" | "issues" | "skipped" | "error"; durationMs?: number; reason?: string; error?: string; findingCount?: number }
  | { kind: "finding"; finding: NormalizedFinding }
  | { kind: "done" }
  | { kind: "error"; message: string };

export type RunHandle = { cancel: () => void; correlationId: string };

export function runScan(opts: {
  tools: string[];
  source: ScanSource;
  onEvent: (e: ToolEvent) => void;
  /** Per-tool timeout (ms). Defaults to the operator's saved scan setting. */
  timeoutMs?: number;
}): RunHandle {
  const correlationId = newCorrelationId();
  const aborter = new AbortController();
  const perToolTimeoutMs = opts.timeoutMs ?? getScanSettings().defaultTimeoutMs;
  log.info("scan", "run:start", {
    correlationId, target: opts.source.kind,
    outputs: { tools: opts.tools, timeoutMs: perToolTimeoutMs },
  });

  void (async () => {
    try {
      const phoneTools = opts.tools.filter((t) => canRunOnPhone(t, opts.source));
      const serverTools = opts.tools.filter((t) => !phoneTools.includes(t));

      const phonePromise = Promise.all(phoneTools.map((t) =>
        runOnPhone(t, opts.source, opts.onEvent, correlationId, aborter.signal, perToolTimeoutMs)));

      const serverPromise = serverTools.length === 0
        ? Promise.resolve()
        : runOnServer(serverTools, opts.source, opts.onEvent, correlationId, aborter.signal, perToolTimeoutMs);

      await Promise.all([phonePromise, serverPromise]);
      opts.onEvent({ kind: "done" });
      log.info("scan", "run:end", { correlationId, status: "ok" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.onEvent({ kind: "error", message });
      log.error("scan", "run:end", { correlationId, status: "error", error: err });
    }
  })();

  return { cancel: () => aborter.abort(), correlationId };
}

function withTimeout<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${Math.round(ms / 1000)}s`)), ms);
    const onAbort = () => { clearTimeout(t); reject(new Error("cancelled")); };
    if (signal.aborted) { clearTimeout(t); reject(new Error("cancelled")); return; }
    signal.addEventListener("abort", onAbort, { once: true });
    p.then((v) => { clearTimeout(t); signal.removeEventListener("abort", onAbort); resolve(v); },
           (e) => { clearTimeout(t); signal.removeEventListener("abort", onAbort); reject(e); });
  });
}

// Built-in tools with a real on-phone implementation. Anything not in this
// set (and not a forged JS tool) MUST go to the server, even if its registry
// `runsOn` is "phone" or "either" — otherwise we'd silently skip it.
const PHONE_IMPLEMENTED = new Set<string>(["regex-secrets", "ai-review"]);

function canRunOnPhone(toolId: string, source: ScanSource): boolean {
  const spec = getScanner(toolId);
  if (!spec) return false;
  // Forged JS tools and built-in phone tools both need files we already have
  // in memory. For github/workspace/apk/zip the server does the
  // materialization, so we always fall through to the server fallback there.
  const localSource = source.kind === "upload" || source.kind === "screen";
  if (spec.source === "forged") {
    if (spec.runsOn === "server" || spec.needsServer) return false;
    return localSource;
  }
  if (!PHONE_IMPLEMENTED.has(toolId)) return false;
  return localSource;
}

async function runOnPhone(
  toolId: string,
  source: ScanSource,
  onEvent: (e: ToolEvent) => void,
  correlationId: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  onEvent({ kind: "tool", tool: toolId, status: "start" });
  try {
    const files = collectFiles(source);
    if (signal.aborted) throw new Error("cancelled");

    const work = (async (): Promise<NormalizedFinding[]> => {
      if (toolId === "regex-secrets") return regexSecretsScan(files, correlationId);
      if (toolId === "ai-review") {
        const blob = files.map((f) => `// ${f.name}\n${f.text}`).join("\n\n").slice(0, 60_000);
        return runAiReview({ filename: files[0]?.name, code: blob }, correlationId);
      }
      const spec = getScanner(toolId);
      if (spec?.forged) return runForgedTool(toolId, files, correlationId);
      // Defensive: PHONE_IMPLEMENTED gating in canRunOnPhone() should make
      // this branch unreachable for built-ins. Treat as server-only fallback.
      onEvent({ kind: "tool", tool: toolId, status: "skipped", reason: "no on-phone implementation" });
      return [];
    })();

    const findings = await withTimeout(work, timeoutMs, signal);
    for (const f of findings) onEvent({ kind: "finding", finding: f });
    onEvent({ kind: "tool", tool: toolId, status: findings.length ? "issues" : "ok", durationMs: Date.now() - start, findingCount: findings.length });
  } catch (err) {
    onEvent({ kind: "tool", tool: toolId, status: "error", durationMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) });
  }
}

function collectFiles(source: ScanSource): FileBlob[] {
  if (source.kind === "upload") {
    return (source.payload.files ?? []).map((f) => ({
      name: f.name,
      text: f.text ?? (f.contentBase64 ? safeBase64ToText(f.contentBase64) : ""),
    }));
  }
  if (source.kind === "screen") {
    return [{ name: "screen.txt", text: source.payload.ocrText }];
  }
  return [];
}

function safeBase64ToText(b64: string): string {
  try { return globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, "base64").toString("utf8"); }
  catch { return ""; }
}

async function runOnServer(
  tools: string[],
  source: ScanSource,
  onEvent: (e: ToolEvent) => void,
  correlationId: string,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<void> {
  if (!getApiBase()) {
    for (const tn of tools) onEvent({ kind: "tool", tool: tn, status: "error", error: "this tool needs the server (set Server URL in Profile)" });
    return;
  }

  // Real abort on either user-cancel OR wall-clock timeout. Sum-of-tools is
  // the budget for the whole stream; min 30s.
  const local = new AbortController();
  const onParentAbort = () => local.abort(new Error("cancelled"));
  if (signal.aborted) local.abort(new Error("cancelled"));
  else signal.addEventListener("abort", onParentAbort, { once: true });
  const totalBudgetMs = Math.max(30_000, timeoutMs * Math.max(1, tools.length));
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; local.abort(new Error("timeout")); }, totalBudgetMs);

  // Convert source to server-friendly payload (drop in-memory text in favor of base64).
  const payload = serializeSource(source);
  let r: Response;
  try {
    r = await fetch(getApiUrl("/api/scan/run"), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ tools, source: payload, correlationId }),
      signal: local.signal,
    });
  } catch (err) {
    clearTimeout(timer); signal.removeEventListener("abort", onParentAbort);
    const msg = timedOut ? `timeout after ${Math.round(totalBudgetMs / 1000)}s` : err instanceof Error ? err.message : String(err);
    for (const tn of tools) onEvent({ kind: "tool", tool: tn, status: "error", error: msg });
    return;
  }
  if (!r.ok || !r.body) {
    clearTimeout(timer); signal.removeEventListener("abort", onParentAbort);
    const text = await r.text().catch(() => "");
    for (const tn of tools) onEvent({ kind: "tool", tool: tn, status: "error", error: `server ${r.status}: ${text.slice(0, 200)}` });
    return;
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    if (local.signal.aborted) {
      clearTimeout(timer); signal.removeEventListener("abort", onParentAbort);
      reader.cancel().catch(() => {});
      if (timedOut) for (const tn of tools) onEvent({ kind: "tool", tool: tn, status: "error", error: `timeout after ${Math.round(totalBudgetMs / 1000)}s` });
      return;
    }
    const { value, done } = await reader.read();
    if (done) { clearTimeout(timer); signal.removeEventListener("abort", onParentAbort); break; }
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
      const lines = block.split("\n");
      let event = "message"; let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const obj = JSON.parse(data);
        if (event === "tool") {
          onEvent({ kind: "tool", tool: obj.tool, status: obj.status, durationMs: obj.durationMs, reason: obj.reason, error: obj.error, findingCount: obj.findingCount });
        } else if (event === "finding") {
          const norm = normalizeFinding(obj.tool, obj as RawFinding, correlationId);
          onEvent({ kind: "finding", finding: norm });
        } else if (event === "error") {
          onEvent({ kind: "error", message: obj.message });
        }
      } catch { /* ignore malformed sse line */ }
    }
  }
}

function serializeSource(source: ScanSource): { kind: string; payload: unknown } {
  if (source.kind === "upload") {
    return {
      kind: "upload",
      payload: {
        files: (source.payload.files ?? []).map((f) => ({
          name: f.name,
          contentBase64: f.contentBase64 ?? safeTextToBase64(f.text ?? ""),
        })),
      },
    };
  }
  if (source.kind === "screen") {
    return { kind: "upload", payload: { files: [{ name: "screen.txt", contentBase64: safeTextToBase64(source.payload.ocrText) }] } };
  }
  if (source.kind === "github") {
    if (!GITHUB_URL_RE.test(source.payload.url)) {
      throw new Error("github source must match https://github.com/<owner>/<repo>");
    }
  }
  return { kind: source.kind, payload: (source as { payload?: unknown }).payload ?? {} };
}

function safeTextToBase64(text: string): string {
  try { return globalThis.btoa ? globalThis.btoa(text) : Buffer.from(text, "utf8").toString("base64"); }
  catch { return ""; }
}
