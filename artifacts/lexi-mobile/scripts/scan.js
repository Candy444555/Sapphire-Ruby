#!/usr/bin/env node
// Aggregator: runs every scanner against the same target, prints a
// consolidated summary, exits non-zero if any high/critical finding was
// reported, and copies the consolidated NDJSON timeline into the same
// daily log file the runtime logger writes to so a single timeline shows
// app activity + scan activity interleaved.

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const {
  parseArgs,
  makeNdjsonLogger,
  writeReport,
  isHighOrCritical,
} = require("./scan-shared");

const SCANNERS = [
  { name: "deps", script: "scan-deps.js", summary: "deps.summary.json" },
  { name: "secrets", script: "scan-secrets.js", summary: "secrets.summary.json" },
  { name: "static", script: "scan-static.js", summary: "static.summary.json" },
  { name: "expo", script: "scan-expo.js", summary: "expo.summary.json" },
  { name: "trivy", script: "scan-trivy.js", summary: "trivy.summary.json" },
  { name: "bearer", script: "scan-bearer.js", summary: "bearer.summary.json" },
  { name: "njsscan", script: "scan-njsscan.js", summary: "njsscan.summary.json" },
  { name: "retire", script: "scan-retire.js", summary: "retire.summary.json" },
  { name: "quality", script: "scan-quality.js", summary: "quality.summary.json" },
  { name: "shell", script: "scan-shell.js", summary: "shell.summary.json" },
];

// `scan:apk` is opt-in because it needs an APK/IPA *file* path, not the
// project source dir. Pass `--apk <file>` (or `--apk=<file>`) on the
// aggregator CLI to include it in the suite.
function findApkArg(argv) {
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apk") return argv[i + 1];
    if (a.startsWith("--apk=")) return a.slice("--apk=".length);
  }
  return null;
}

function runScanner(scriptName, targetDir, reportsDir, extraArgs = []) {
  const start = Date.now();
  const r = spawnSync(process.execPath, [
    path.join(__dirname, scriptName),
    "--path", targetDir,
    "--reports", reportsDir,
    ...extraArgs,
  ], { stdio: ["ignore", "inherit", "inherit"], timeout: 30 * 60 * 1000 });
  return { code: r.status ?? -1, durationMs: Date.now() - start };
}

function todayFile() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `lexi-${y}-${m}-${day}.ndjson`;
}

function copyToRuntimeLog(reportsDir) {
  // Best-effort: copy onto the user's home dir in a known location so
  // a developer can curl/scp it onto their device, AND drop a sibling file
  // under reports/ that the in-app Logs viewer can pick up via "Open
  // external NDJSON".
  const ndjson = path.join(reportsDir, "scan.ndjson");
  if (!fs.existsSync(ndjson)) return null;
  const dest = path.join(reportsDir, todayFile());
  try {
    if (fs.existsSync(dest)) {
      const existing = fs.readFileSync(dest, "utf8");
      fs.writeFileSync(dest, existing + fs.readFileSync(ndjson, "utf8"));
    } else {
      fs.copyFileSync(ndjson, dest);
    }
    // Also try the conventional dev-machine logs folder.
    const home = process.env.HOME || os.homedir();
    if (home) {
      const sharedDir = path.join(home, ".lexi-logs");
      if (!fs.existsSync(sharedDir)) fs.mkdirSync(sharedDir, { recursive: true });
      const sharedFile = path.join(sharedDir, todayFile());
      if (fs.existsSync(sharedFile)) {
        fs.appendFileSync(sharedFile, fs.readFileSync(ndjson, "utf8"));
      } else {
        fs.copyFileSync(ndjson, sharedFile);
      }
    }
    return dest;
  } catch {
    return null;
  }
}

async function main() {
  const { targetDir, reportsDir } = parseArgs(process.argv);
  const log = makeNdjsonLogger("aggregate", reportsDir);
  log.info("scan:start", { target: targetDir });

  const allFindings = [];
  const perTool = {};

  const apk = findApkArg(process.argv);
  const queue = apk
    ? [...SCANNERS, { name: "apk", script: "scan-apk.js", summary: "apk.summary.json", extra: ["--apk", apk] }]
    : SCANNERS;
  if (!apk) process.stdout.write("(scan:apk skipped — pass --apk <file> to include)\n");

  for (const s of queue) {
    process.stdout.write(`\n────── ${s.name} ──────\n`);
    const r = runScanner(s.script, targetDir, reportsDir, s.extra ?? []);
    perTool[s.name] = { exit: r.code, durationMs: r.durationMs };
    log.info("tool:done", { target: s.name, status: r.code === 0 ? "ok" : "issues", durationMs: r.durationMs });
    const summaryPath = path.join(reportsDir, s.summary);
    if (fs.existsSync(summaryPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
        for (const f of parsed.findings || []) allFindings.push({ tool: s.name, ...f });
      } catch {
        /* ignore */
      }
    }
  }

  const counts = countSeverities(allFindings);
  const summary = {
    target: targetDir,
    generatedAt: new Date().toISOString(),
    perTool,
    findings: allFindings,
    counts,
  };
  writeReport(reportsDir, "scan.summary.json", summary);

  process.stdout.write("\n══════ Scan summary ══════\n");
  process.stdout.write(`target:    ${targetDir}\n`);
  process.stdout.write(`reports:   ${reportsDir}\n`);
  process.stdout.write(`findings:  ${allFindings.length}\n`);
  for (const k of Object.keys(counts)) {
    process.stdout.write(`  ${k.padEnd(10)} ${counts[k]}\n`);
  }
  for (const [k, v] of Object.entries(perTool)) {
    process.stdout.write(`  ${k.padEnd(10)} exit=${v.exit} time=${v.durationMs}ms\n`);
  }

  const merged = copyToRuntimeLog(reportsDir);
  if (merged) process.stdout.write(`\nmerged into: ${merged}\n`);

  log.info("scan:end", { target: targetDir, outputs: { counts, findings: allFindings.length } });
  if (allFindings.some((f) => isHighOrCritical(f.severity))) {
    process.exit(1);
  }
}

function countSeverities(findings) {
  const c = { critical: 0, high: 0, moderate: 0, low: 0, info: 0, other: 0 };
  for (const f of findings) {
    const s = (f.severity || "").toLowerCase();
    if (c[s] != null) c[s]++;
    else c.other++;
  }
  return c;
}

main().catch((err) => {
  console.error("scan aggregator failed:", err);
  process.exit(1);
});
