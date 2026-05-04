import { Router, type IRouter, type Request, type Response } from "express";
import fs from "fs";
import { CHAT_DEBUG_LOG } from "../services/web-search";

const router: IRouter = Router();

type ParsedLine = {
  raw: string;
  timestamp: string | null;
  route: string | null;
  model: string | null;
  endpoint: string | null;
  searchBytes: number;
  tor: boolean;
};

const LINE_RE =
  /^\[(?<ts>[^\]]+)\]\s+route=(?<route>\S+)\s+model=(?<model>\S+)\s+endpoint=(?<endpoint>\S+)\s+searchBytes=(?<bytes>\d+)\s+tor=(?<tor>yes|no)/;

function parseLine(raw: string): ParsedLine {
  const m = raw.match(LINE_RE);
  if (!m || !m.groups) {
    return { raw, timestamp: null, route: null, model: null, endpoint: null, searchBytes: 0, tor: false };
  }
  return {
    raw,
    timestamp: m.groups.ts,
    route: m.groups.route,
    model: m.groups.model,
    endpoint: m.groups.endpoint,
    searchBytes: Number(m.groups.bytes) || 0,
    tor: m.groups.tor === "yes",
  };
}

function readTailLines(file: string, maxLines: number): string[] {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return [];
  }
  const size = stat.size;
  if (size === 0) return [];

  const fd = fs.openSync(file, "r");
  try {
    const step = Math.max(64 * 1024, maxLines * 256);
    let end = size;
    let tail = "";
    let collected: string[] = [];

    while (end > 0) {
      const start = Math.max(0, end - step);
      const len = end - start;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      tail = buf.toString("utf-8") + tail;

      const startsAtBOF = start === 0;
      const startsAtBoundary = !startsAtBOF && (buf[0] === 0x0a || buf[0] === 0x0d);

      const all = tail.split(/\r?\n/);
      let candidates = all;
      if (!startsAtBOF && !startsAtBoundary) {
        // First fragment is mid-line; defer it to the next (earlier) read.
        tail = candidates[0] ?? "";
        candidates = candidates.slice(1);
      } else {
        tail = "";
      }
      collected = candidates.filter((l) => l.trim().length > 0);

      if (collected.length >= maxLines || start === 0) break;
      end = start;
    }

    return collected.slice(-maxLines);
  } finally {
    fs.closeSync(fd);
  }
}

function summarize(parsed: ParsedLine[]) {
  const total = parsed.length;
  const perModel: Record<string, number> = {};
  const perRoute: Record<string, number> = {};
  let bytesSum = 0;
  let bytesNonZero = 0;
  let torCount = 0;
  let firstTs: string | null = null;
  let lastTs: string | null = null;

  for (const p of parsed) {
    if (p.model) perModel[p.model] = (perModel[p.model] ?? 0) + 1;
    if (p.route) perRoute[p.route] = (perRoute[p.route] ?? 0) + 1;
    bytesSum += p.searchBytes;
    if (p.searchBytes > 0) bytesNonZero += 1;
    if (p.tor) torCount += 1;
    if (p.timestamp) {
      if (!firstTs) firstTs = p.timestamp;
      lastTs = p.timestamp;
    }
  }

  const avgSearchBytes = total > 0 ? Math.round(bytesSum / total) : 0;
  const torPercent = total > 0 ? Math.round((torCount / total) * 100) : 0;
  const searchUsedPercent = total > 0 ? Math.round((bytesNonZero / total) * 100) : 0;

  const topModel = Object.entries(perModel).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const oneLine = total === 0
    ? "No chat requests logged yet."
    : `${total} chats · top model: ${topModel ?? "?"} · avg search ${avgSearchBytes}B (${searchUsedPercent}% used) · tor ${torPercent}% · last ${lastTs ?? "?"}`;

  return {
    total,
    firstTimestamp: firstTs,
    lastTimestamp: lastTs,
    perModel,
    perRoute,
    avgSearchBytes,
    searchUsedPercent,
    torPercent,
    summaryLine: oneLine,
  };
}

router.get("/admin/chat-debug", (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const limitParam = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 1000) : 50;

  const rawLines = readTailLines(CHAT_DEBUG_LOG, limit);
  const parsed = rawLines.map(parseLine);
  const summary = summarize(parsed);

  res.json({
    logPath: CHAT_DEBUG_LOG,
    limit,
    returned: parsed.length,
    summary,
    entries: parsed,
  });
});

export default router;
