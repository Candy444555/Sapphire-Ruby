# Lexi Mobile — Security Scanners

This artifact ships with a self-contained scanner suite so you can audit your
own React Native / Expo source. Every scanner is opt-in (you must run it),
operates only on a local directory you point it at, and writes results to
`security-reports/` (gitignored).

## Quick start

```bash
# Run the whole suite against the default target (this artifact)
pnpm --filter @workspace/lexi-mobile run scan

# Run a single scanner
pnpm --filter @workspace/lexi-mobile run scan:deps
pnpm --filter @workspace/lexi-mobile run scan:secrets
pnpm --filter @workspace/lexi-mobile run scan:static
pnpm --filter @workspace/lexi-mobile run scan:expo
pnpm --filter @workspace/lexi-mobile run scan:apk -- /path/to/build.apk

# Point any scanner at a different directory you own
pnpm --filter @workspace/lexi-mobile run scan -- --path ../my-other-app
```

The aggregator exits non-zero if any **high** or **critical** finding is
emitted by any scanner.

## What runs

| Script         | Tools                                                     | Output                                          |
| -------------- | --------------------------------------------------------- | ----------------------------------------------- |
| `scan:deps`    | `pnpm audit`, `osv-scanner`, `snyk` (if `SNYK_TOKEN`), `expo-doctor` | `deps.*.json`, `deps.summary.json`              |
| `scan:secrets` | `gitleaks`, `trufflehog filesystem`                       | `secrets.*.json`, `secrets.summary.json`        |
| `scan:static`  | ESLint + `eslint-plugin-security`, Semgrep (`p/javascript`, `p/react`, `p/typescript`, `p/secrets`, `p/owasp-top-ten`) | `static.eslint.json`, `static.semgrep.sarif`, `static.summary.json` |
| `scan:expo`    | `expo-doctor`, custom permission/ATS lints                | `expo.summary.json`                             |
| `scan:apk`     | MobSF in Docker                                           | `apk.mobsf.json`, `apk.summary.json`            |
| `scan`         | Aggregator                                                | `scan.summary.json`, `scan.ndjson`              |

Tools that aren't installed are reported as `skipped` in the NDJSON timeline
and the corresponding summary file. Nothing is fatal except actual high /
critical findings.

## Reading the output

* **`scan.summary.json`** — top-level human-friendly digest.
* **`<tool>.summary.json`** — per-tool normalised list of findings.
* **`scan.ndjson`** — append-only, one JSON event per line, identical schema
  to the runtime logger (see `LOGGING.md`). The aggregator copies this file
  into `lexi-YYYY-MM-DD.ndjson` next to it so the in-app **Logs** viewer can
  pick it up via the **Open external NDJSON** button.
* **SARIF** files (e.g. `static.semgrep.sarif`) can be uploaded to GitHub
  Code Scanning or any SARIF-aware viewer.

Each NDJSON event includes:

```json
{
  "ts": 1714900000000,
  "level": "warn",
  "category": "scan",
  "actor": "scanner:secrets",
  "action": "finding",
  "target": "lib/lexi-api.ts",
  "outputs": { "rule": "generic-api-key", "line": 42 },
  "correlationId": "ab12cd34",
  "sessionId": "scan:7f3e…"
}
```

So you can grep:

```bash
jq -c 'select(.actor=="scanner:secrets")' security-reports/scan.ndjson
```

## Generic targets

Every script accepts `--path <dir>` (or a positional path). The default is
`artifacts/lexi-mobile`, but you can scan any local directory you own:

```bash
node artifacts/lexi-mobile/scripts/scan.js --path /home/me/another-rn-app
```

Outputs land in `<target>/security-reports/` unless you also pass
`--reports <dir>`.

## CI

`/.github/workflows/security-scan.yml` mirrors the same suite but is
disabled by default — it only runs when you trigger `workflow_dispatch`
from the GitHub Actions UI. Enable a schedule yourself if you want it.

## Task #22 — In-app Scan tab, new tools, Tool-Forge

The Scan tab (`app/(tabs)/scan.tsx`) is now the operator-facing surface for
every scanner. Operator picks a source (file / APK / ZIP / GitHub URL /
workspace / one-shot screen capture), toggles tools in the multi-select
grid, and taps **Scan** — nothing runs until then. See `SCAN-TAB.md` for
the full operator workflow and the no-paste safety rule.

New tools wired in (in addition to the existing #14 set):

- `bandit` — Python SAST. Wrapper: `scripts/scan-bandit.js`.
- `trivy` — already shipped in #14; still wired through `scripts/scan-trivy.js`.
- `nuclei` — template-based. Wrapper: `scripts/scan-nuclei.js`.
- `apktool` + `jadx` — APK decompile pipeline. Wrapper:
  `scripts/scan-decompile.js`. The output dirs are intended to feed back
  into semgrep / secrets / `ai-review` on a follow-up scan.
- `ai-review` — Featherless model emits structured findings via
  `lib/scanners/ai-review.ts` (on-phone) or `routes/scan-ai-review.ts`
  (server fallback).
- `regex-secrets` — fast on-phone secret regex sweep.

Server-side aggregator: `POST /api/scan/run` streams per-tool NDJSON
events back via SSE. See `routes/scan.ts`.

Per-finding contract: every tool — built-in, server, on-phone, forged —
flows through `lib/findings/contract.ts → normalizeFinding()`. That writes
a `scan/finding` log entry the Logs tab already understands and returns a
normalized object the Scan tab's `FindingCard` renders with the same Fix /
Reproduce buttons that the Logs tab uses (re-using #20).

### Tool-Forge

Operator-gated authoring of new scanners. Three modes, all routed through
`lib/tool-forge/approval-queue.ts`:

1. Auto-suggest from scan history (`analyzer.ts`, threshold = 3 similar
   findings, toggle in Profile → Scan).
2. Chat-to-scanner / programmatic generator (`chat-to-scanner.ts`).
3. Forge Tool button — guided form in the Scan tab.

Approved tools register at runtime in `lib/scanners/registry.ts` and
appear as toggles in the multi-select picker. JS-language forged tools
execute on-phone via the `function scan(file)` contract in
`lib/tool-forge/runner.ts`. Forged tools ship with the same Fix /
Reproduce contract as the built-ins.
