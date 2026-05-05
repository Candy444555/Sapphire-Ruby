#!/usr/bin/env node
// nuclei — template-based scanner. Filesystem mode where supported; else
// skipped gracefully.
const fs = require("fs");
const path = require("path");
const {
  parseArgs, makeNdjsonLogger, which, runCmd, writeReport,
} = require("./scan-shared");

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("nuclei", reportsDir);
  log.info("scan:start", { target: targetDir });
  if (!which("nuclei")) {
    log.warn("skipped", { target: "nuclei", outputs: { reason: "binary not found" } });
    writeReport(reportsDir, "nuclei.summary.json", JSON.stringify({ skipped: true }, null, 2));
    return;
  }
  await log.span("nuclei", async () => {
    const out = path.join(reportsDir, "nuclei.jsonl");
    const r = runCmd("nuclei", [
      "-target", targetDir,
      "-jsonl", "-o", out,
      "-silent", "-disable-update-check",
    ]);
    if (!fs.existsSync(out)) {
      log.warn("no-output", { target: "nuclei", outputs: { code: r.code } });
      return;
    }
    let count = 0;
    for (const line of fs.readFileSync(out, "utf8").split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const ev = JSON.parse(t);
        const sev = String(ev.info?.severity || "info").toLowerCase();
        log.warn("finding", {
          target: ev["matched-at"] || ev.host || targetDir,
          outputs: {
            severity: sev === "info" ? "low" : sev,
            rule: ev["template-id"] || ev.templateID,
            summary: ev.info?.name || ev["template-id"],
          },
        });
        count++;
      } catch {}
    }
    writeReport(reportsDir, "nuclei.summary.json", JSON.stringify({ count }, null, 2));
  }, { target: targetDir });
}

main().catch((err) => { console.error(err); process.exit(1); });
