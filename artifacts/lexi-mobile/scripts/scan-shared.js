// Shared helpers for the lexi-mobile scanner scripts.
// Every scanner produces:
//   1. JSON or SARIF native output under security-reports/
//   2. NDJSON events into security-reports/scan.ndjson using the same
//      schema as the in-app runtime logger.
//
// This module is plain CommonJS so the scripts can be invoked with `node`
// and parsed by `pnpm exec` without a TypeScript build step.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const SCRIPTS_DIR = __dirname;
const ARTIFACT_DIR = path.resolve(SCRIPTS_DIR, "..");
const REPORTS_DIR_DEFAULT = path.join(ARTIFACT_DIR, "security-reports");

function parseArgs(argv) {
  const args = argv.slice(2);
  let target = null;
  let reports = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--path" || a === "-p") {
      target = args[++i];
    } else if (a === "--reports" || a === "-r") {
      reports = args[++i];
    } else if (a.startsWith("--path=")) {
      target = a.slice("--path=".length);
    } else if (!target && !a.startsWith("-")) {
      target = a;
    }
  }
  const targetDir = path.resolve(target ?? ARTIFACT_DIR);
  // Reports default to <target>/security-reports so the scanner can be
  // pointed at any directory and still drop its output next to the code
  // it scanned. --reports always overrides.
  const defaultReports = target ? path.join(targetDir, "security-reports") : REPORTS_DIR_DEFAULT;
  const reportsDir = path.resolve(reports ?? defaultReports);
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  return { targetDir, reportsDir };
}

const SESSION_ID = crypto.randomBytes(8).toString("hex");

function newCorrelationId() {
  return crypto.randomBytes(6).toString("hex");
}

function writeNdjsonEvent(reportsDir, entry) {
  const line = JSON.stringify({
    sessionId: `scan:${SESSION_ID}`,
    ...entry,
    ts: entry.ts ?? Date.now(),
  }) + "\n";
  try {
    fs.appendFileSync(path.join(reportsDir, "scan.ndjson"), line);
  } catch {
    /* ignore */
  }
}

function makeNdjsonLogger(toolName, reportsDir) {
  const correlationId = newCorrelationId();
  const base = (level, action, payload = {}) =>
    writeNdjsonEvent(reportsDir, {
      level,
      category: "scan",
      actor: `scanner:${toolName}`,
      action,
      correlationId,
      ...payload,
    });
  return {
    correlationId,
    debug: (action, payload) => base("debug", action, payload),
    info: (action, payload) => base("info", action, payload),
    warn: (action, payload) => base("warn", action, payload),
    error: (action, payload) => base("error", action, payload),
    span: async (action, fn, payload = {}) => {
      const start = Date.now();
      base("debug", `${action}:start`, payload);
      try {
        const out = await fn();
        base("info", `${action}:end`, {
          ...payload,
          durationMs: Date.now() - start,
          status: "ok",
        });
        return out;
      } catch (err) {
        base("error", `${action}:end`, {
          ...payload,
          durationMs: Date.now() - start,
          status: "error",
          error: { message: err && err.message, stack: err && err.stack },
        });
        throw err;
      }
    },
  };
}

function which(bin) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
    encoding: "utf8",
  });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim().split(/\r?\n/)[0] : null;
}

function runCmd(cmd, args, opts = {}) {
  const start = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ARTIFACT_DIR,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env ?? {}) },
    maxBuffer: 1024 * 1024 * 64,
    timeout: opts.timeoutMs ?? 5 * 60 * 1000,
  });
  return {
    code: r.status ?? -1,
    signal: r.signal,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    durationMs: Date.now() - start,
    error: r.error ? r.error.message : null,
  };
}

function severityRank(s) {
  const v = (s || "").toLowerCase();
  if (v === "critical" || v === "fatal") return 4;
  if (v === "high" || v === "error") return 3;
  if (v === "moderate" || v === "medium" || v === "warning" || v === "warn") return 2;
  if (v === "low" || v === "info" || v === "note") return 1;
  return 0;
}

function isHighOrCritical(sev) {
  return severityRank(sev) >= 3;
}

function writeReport(reportsDir, name, contents) {
  const p = path.join(reportsDir, name);
  if (typeof contents === "string") fs.writeFileSync(p, contents);
  else fs.writeFileSync(p, JSON.stringify(contents, null, 2));
  return p;
}

module.exports = {
  parseArgs,
  makeNdjsonLogger,
  newCorrelationId,
  which,
  runCmd,
  severityRank,
  isHighOrCritical,
  writeReport,
  ARTIFACT_DIR,
  REPORTS_DIR_DEFAULT,
};
