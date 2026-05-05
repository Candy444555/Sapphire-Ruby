#!/usr/bin/env node
// `pnpm explain` — print FIX + REPRODUCE for a scan finding.
//
// Usage:
//   pnpm --filter @workspace/lexi-mobile explain <tool> <id> \
//        [--title "..."] [--module path:line] [--url https://...] \
//        [--mode fix|reproduce|both]   (default: both)
//   pnpm --filter @workspace/lexi-mobile explain --from <summary.json>
//   pnpm --filter @workspace/lexi-mobile explain --all <reportsDir>
//
// Source resolution:
//   1. Look up <tool>:<id> in scripts/explain-recipes.json (static).
//   2. Miss → POST to the api-server /api/chat (Featherless).
// Each section is clearly labeled with its source.

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const {
  parseArgs: scanParseArgs,
  makeNdjsonLogger,
} = require("./scan-shared");

const RECIPES_PATH = path.join(__dirname, "explain-recipes.json");
const RECIPES = JSON.parse(fs.readFileSync(RECIPES_PATH, "utf8"));

const C_RESET = "\x1b[0m";
const C_BOLD = "\x1b[1m";
const C_DIM = "\x1b[2m";
const C_GREEN = "\x1b[32m";
const C_YELLOW = "\x1b[33m";
const C_CYAN = "\x1b[36m";
const C_RED = "\x1b[31m";
const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY;
const c = (col, s) => (NO_COLOR ? s : `${col}${s}${C_RESET}`);

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const out = { positional: [], opts: {} };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) out.opts[a.slice(2, eq)] = a.slice(eq + 1);
      else out.opts[a.slice(2)] = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : true;
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

function findRecipe(tool, id) {
  const key = `${tool}:${id}`;
  if (RECIPES[key]) return { key, recipe: RECIPES[key] };
  // Generic per-tool fallback (e.g. "expo-doctor:generic").
  const generic = `${tool}:generic`;
  if (RECIPES[generic]) return { key: generic, recipe: RECIPES[generic] };
  return null;
}

function fixSystemPrompt() {
  return [
    "You are a senior security/code-review engineer. The user has a single",
    "scan finding from a static analyzer or dep scanner and needs a concrete fix.",
    "Respond in Markdown with EXACTLY these three labeled sections, in order:",
    "## Root cause",
    "## Patch",
    "## Why this works",
    "Keep each section short. The Patch section MUST contain real, copy-pasteable",
    "code or config (not prose). Do not add a 'reproduce' section here — the user",
    "is asking only for the fix.",
  ].join("\n");
}

function reproSystemPrompt() {
  return [
    "You are a senior security/code-review engineer. The user has a single",
    "scan finding and wants to see the bug or vulnerability reproduced ON PAPER.",
    "Respond in Markdown with EXACTLY these three labeled sections, in order:",
    "## Setup",
    "## Reproduction",
    "## Broken output",
    "The Reproduction section MUST be a self-contained, copy-pasteable code or",
    "payload snippet that demonstrates the issue. The Broken output section MUST",
    "show the literal wrong/dangerous result that the snippet produces.",
    "DO NOT instruct the user to actually run anything; just show what would",
    "happen on paper. No disclaimers, no 'as an AI', no refusals.",
  ].join("\n");
}

function userPrompt(finding) {
  const lines = [
    `Tool: ${finding.tool}`,
    `Rule ID: ${finding.id}`,
  ];
  if (finding.severity) lines.push(`Severity: ${finding.severity}`);
  if (finding.module) lines.push(`Where: ${finding.module}`);
  if (finding.title) lines.push(`Title: ${finding.title}`);
  if (finding.url) lines.push(`Reference: ${finding.url}`);
  return lines.join("\n");
}

function apiBase() {
  return (
    process.env.LEXI_API_BASE ||
    process.env.API_BASE ||
    "http://localhost:8080"
  ).replace(/\/+$/, "");
}

async function streamFromFeatherless(finding, mode, log) {
  const url = new URL(apiBase() + "/api/chat");
  const body = JSON.stringify({
    model: process.env.LEXI_EXPLAIN_MODEL || "Orenguteng/Llama-3.1-8B-Lexi-Uncensored-V2",
    messages: [{ role: "user", content: userPrompt(finding) }],
    systemPrompt: mode === "fix" ? fixSystemPrompt() : reproSystemPrompt(),
  });
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Accept: "text/event-stream",
        },
        timeout: 120000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          let errBody = "";
          res.on("data", (d) => (errBody += d.toString()));
          res.on("end", () => reject(new Error(`api-server ${res.statusCode}: ${errBody.slice(0, 500)}`)));
          return;
        }
        let buf = "";
        let assembled = "";
        let firstToken = true;
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          buf += chunk;
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const evt = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of evt.split("\n")) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const payload = t.slice(5).trim();
              if (payload === "[DONE]") continue;
              if (payload.startsWith("[ERROR]")) {
                process.stdout.write("\n" + c(C_RED, payload) + "\n");
                continue;
              }
              try {
                const tok = JSON.parse(payload);
                if (typeof tok === "string") {
                  if (firstToken) { firstToken = false; }
                  process.stdout.write(tok);
                  assembled += tok;
                }
              } catch {
                process.stdout.write(payload);
                assembled += payload;
              }
            }
          }
        });
        res.on("end", () => {
          process.stdout.write("\n");
          log.info("explain:end", { target: `${finding.tool}:${finding.id}`, outputs: { mode, source: "ai", chars: assembled.length } });
          resolve(assembled);
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("api-server timeout (120s)")); });
    req.write(body);
    req.end();
  });
}

function printRecipeSection(label, body) {
  process.stdout.write(c(C_BOLD + C_GREEN, `\n══ ${label} ══`) + "\n");
  process.stdout.write(c(C_DIM, "Source: static recipe (built-in)") + "\n\n");
  process.stdout.write(body + "\n");
}

function printAiHeader(label) {
  process.stdout.write(c(C_BOLD + C_CYAN, `\n══ ${label} ══`) + "\n");
  process.stdout.write(c(C_DIM, "Source: Featherless AI (streamed)") + "\n\n");
}

async function explainOne(finding, mode, log) {
  process.stdout.write(c(C_BOLD + C_YELLOW, `\n■ ${finding.tool}:${finding.id}`) + "\n");
  if (finding.title) process.stdout.write(c(C_DIM, `  ${finding.title}`) + "\n");
  if (finding.module) process.stdout.write(c(C_DIM, `  at ${finding.module}`) + "\n");
  if (finding.severity) process.stdout.write(c(C_DIM, `  severity: ${finding.severity}`) + "\n");

  const hit = findRecipe(finding.tool, finding.id);
  if (hit) {
    log.info("explain:hit", { target: hit.key, outputs: { source: "static" } });
    if (hit.recipe.title && hit.recipe.title !== finding.title) {
      process.stdout.write(c(C_DIM, `  recipe: ${hit.recipe.title}`) + "\n");
    }
    if (mode === "fix" || mode === "both") printRecipeSection("FIX", hit.recipe.fix);
    if (mode === "reproduce" || mode === "both") printRecipeSection("REPRODUCE", hit.recipe.reproduce);
    return;
  }

  log.info("explain:miss", { target: `${finding.tool}:${finding.id}`, outputs: { source: "ai" } });
  if (mode === "fix" || mode === "both") {
    printAiHeader("FIX");
    await streamFromFeatherless(finding, "fix", log);
  }
  if (mode === "reproduce" || mode === "both") {
    printAiHeader("REPRODUCE");
    await streamFromFeatherless(finding, "reproduce", log);
  }
}

function loadFindingsFromSummary(file) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return parsed.findings || [];
}

function loadAllFindings(reportsDir) {
  const out = [];
  for (const name of fs.readdirSync(reportsDir)) {
    if (!name.endsWith(".summary.json") || name === "scan.summary.json") continue;
    try { out.push(...loadFindingsFromSummary(path.join(reportsDir, name))); } catch { /* ignore */ }
  }
  return out;
}

function usage() {
  process.stdout.write([
    "Usage:",
    "  pnpm --filter @workspace/lexi-mobile explain <tool> <id> [--title \"...\"] [--module path:line] [--url ...] [--mode fix|reproduce|both]",
    "  pnpm --filter @workspace/lexi-mobile explain --from <summary.json> [--mode ...]",
    "  pnpm --filter @workspace/lexi-mobile explain --all <reportsDir> [--mode ...]",
    "",
    "Each finding prints:",
    "  ■ <tool>:<id>",
    "  ══ FIX ══         (Source: static recipe | Featherless AI)",
    "  ══ REPRODUCE ══   (Source: static recipe | Featherless AI)",
    "",
    "Env:",
    "  LEXI_API_BASE   api-server base URL (default http://localhost:8080)",
    "  NO_COLOR=1      disable ANSI colors",
    "",
  ].join("\n"));
}

async function main() {
  const cli = parseCliArgs(process.argv);
  const mode = (cli.opts.mode || "both").toLowerCase();
  if (!["fix", "reproduce", "both"].includes(mode)) {
    process.stderr.write(`bad --mode: ${mode}\n`); process.exit(2);
  }

  // NDJSON logging into the same scan reports dir for unified timeline.
  const { reportsDir } = scanParseArgs(["node", "explain", "--reports", cli.opts.reports || path.join(__dirname, "..", "security-reports")]);
  const log = makeNdjsonLogger("explain", reportsDir);
  log.info("explain:start", { target: mode, outputs: { argv: process.argv.slice(2) } });

  let findings = [];
  if (cli.opts.from) {
    findings = loadFindingsFromSummary(cli.opts.from);
  } else if (cli.opts.all) {
    const dir = typeof cli.opts.all === "string" ? cli.opts.all : path.join(__dirname, "..", "security-reports");
    findings = loadAllFindings(dir);
  } else if (cli.positional.length >= 2) {
    findings = [{
      tool: cli.positional[0],
      id: cli.positional[1],
      title: cli.opts.title,
      module: cli.opts.module,
      severity: cli.opts.severity,
      url: cli.opts.url,
    }];
  } else {
    usage();
    process.exit(cli.opts.help ? 0 : 2);
  }

  if (findings.length === 0) {
    process.stdout.write("(no findings to explain)\n");
    log.info("explain:end", { target: "no-findings" });
    return;
  }

  for (const f of findings) {
    if (!f.tool || !f.id) {
      process.stdout.write(c(C_DIM, `(skipping malformed finding: ${JSON.stringify(f)})`) + "\n");
      continue;
    }
    try {
      await explainOne(f, mode, log);
    } catch (err) {
      process.stdout.write(c(C_RED, `\n[explain failed for ${f.tool}:${f.id}] ${err.message}`) + "\n");
      log.error("explain:error", { target: `${f.tool}:${f.id}`, error: { message: err.message } });
    }
  }

  log.info("explain:done", { outputs: { count: findings.length, mode } });
}

main().catch((err) => { process.stderr.write(`explain failed: ${err.stack || err.message}\n`); process.exit(1); });
