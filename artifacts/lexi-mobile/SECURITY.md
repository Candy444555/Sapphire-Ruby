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
