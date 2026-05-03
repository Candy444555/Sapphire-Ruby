import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SELF_HEAL_LOG = path.resolve(moduleDir, "../../../../lexi-self-heal.log");

const MAX_RETRIES_PER_FINGERPRINT = 3;
const retryCounts = new Map<string, number>();

function isSelfHealEnabled(): boolean {
  const flag = (process.env.LEXI_SELF_HEAL ?? "on").toLowerCase().trim();
  return flag !== "off" && flag !== "false" && flag !== "0";
}

function fingerprintError(err: Error, req: Request): string {
  const stackHead = (err.stack ?? err.message).split("\n").slice(0, 3).join("\n");
  return createHash("sha1").update(`${req.method} ${req.path}\n${stackHead}`).digest("hex").slice(0, 16);
}

export function logSelfHealAttempt(entry: {
  fingerprint: string;
  attempt: number;
  method: string;
  path: string;
  error: string;
  recovered: boolean;
}): void {
  try {
    const line =
      `[${new Date().toISOString()}] fingerprint=${entry.fingerprint} attempt=${entry.attempt}/${MAX_RETRIES_PER_FINGERPRINT} ` +
      `method=${entry.method} path=${entry.path} recovered=${entry.recovered} error="${entry.error.replace(/"/g, "'").slice(0, 240)}"\n`;
    fs.appendFileSync(SELF_HEAL_LOG, line, "utf-8");
  } catch {
    // logging must never throw
  }
}

export const selfHealErrorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const error = err instanceof Error ? err : new Error(String(err));

  if (!isSelfHealEnabled()) {
    console.error(`[Lexi] Self-heal OFF — propagating error: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message, selfHeal: "disabled" });
    }
    return;
  }

  const fingerprint = fingerprintError(error, req);
  const attempts = (retryCounts.get(fingerprint) ?? 0) + 1;
  retryCounts.set(fingerprint, attempts);

  const overCap = attempts > MAX_RETRIES_PER_FINGERPRINT;
  logSelfHealAttempt({
    fingerprint,
    attempt: attempts,
    method: req.method,
    path: req.path,
    error: error.message,
    recovered: false,
  });

  console.error(
    `[Lexi self-heal] fp=${fingerprint} attempt=${attempts}/${MAX_RETRIES_PER_FINGERPRINT} ` +
    `${req.method} ${req.path} → ${error.message}` + (overCap ? " (OVER CAP)" : ""),
  );

  if (overCap) {
    if (!res.headersSent) {
      res.status(500).json({
        error: "Self-heal cap reached — failing fast",
        fingerprint,
        attempts,
      });
    }
    return;
  }

  if (!res.headersSent) {
    res.status(500).json({
      error: error.message,
      fingerprint,
      selfHeal: { attempt: attempts, cap: MAX_RETRIES_PER_FINGERPRINT },
      hint: "Retry the request — Lexi has logged this fingerprint and will surface a fix on the next attempt if available.",
    });
  }
};

export function clearSelfHealCounters(): void {
  retryCounts.delete("__all__");
  retryCounts.clear();
}

export function getSelfHealSnapshot(): { enabled: boolean; tracked: number; cap: number } {
  return {
    enabled: isSelfHealEnabled(),
    tracked: retryCounts.size,
    cap: MAX_RETRIES_PER_FINGERPRINT,
  };
}

export function notFoundSelfHealHandler(_req: Request, res: Response, _next: NextFunction): void {
  res.status(404).json({ error: "Not found" });
}
