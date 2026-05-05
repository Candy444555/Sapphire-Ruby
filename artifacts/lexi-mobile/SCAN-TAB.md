# Scan Tab — Operator Workflow

The Scan tab inside the Lexi mobile app is the single place where you
orchestrate every code/security scanner Lexi has access to. The single most
important rule:

> **Lexi never accepts pasted code.** Every source is a file, a URL, a
> workspace pointer, or a one-shot screen capture you explicitly approve.

## Layout

1. **Source picker** (no textbox for code)
   - **Code file** — pick from your phone via `expo-document-picker`.
   - **APK** — pick an `.apk` from your phone; uploaded as base64.
   - **ZIP/Folder** — multi-file pick from your phone.
   - **GitHub URL** — paste *only the URL*; Lexi clones server-side.
   - **Lexi's Replit** — scans the running api-server's project tree.
   - **Screen capture** — one-shot capture, gated behind a fresh consent
     dialog **every time**. On Android, the OS also requires
     MediaProjection consent on each call. The image is OCR'd (Featherless
     vision model) into text, then routed through the selected scanners.
2. **Scanner picker** (multi-select grid)
   - Default selection is **empty** — nothing runs until you toggle tools and
     tap **Scan**.
   - Each tile shows runs-on (`on-phone` / `server` / `phone-or-server`),
     description, and (during a run) live state and finding count.
3. **Run row** — Scan / Cancel-all.
4. **Findings list** — every finding flows through
   `lib/findings/contract.ts` so the **Fix** and **Reproduce** buttons (from
   task #20) work for every tool, old or new or forged. Every finding is
   also appended to the Logs tab as a `scan/finding` entry.
5. **Tool-Forge** section — pending and installed forged tools, plus a
   **Forge Tool** button.

## Built-in scanners wired in

From task #14 (re-wired through the new aggregator without modification):
`semgrep`, `eslint-security`, `gitleaks`, `trufflehog`, `pnpm audit`,
`expo-doctor`, `retire.js`, `bearer`, `njsscan`.

New in task #22:
- `bandit` — Python SAST.
- `trivy` — filesystem + SBOM + CVE + secrets + IaC misconfig.
- `nuclei` — template-based scanner (works against code patterns too).
- `apktool` + `jadx` — APK decompile pipeline; output dirs feed back into
  semgrep / secrets / ai-review on a follow-up scan.
- `ai-review` — Featherless model emits structured findings
  (`{severity, file, line, summary, why}[]`). Runs on-phone when a key is
  set in Profile, otherwise via `/api/scan/ai-review`.
- `regex-secrets` — fast on-phone secret regex sweep (no server needed).

## On-phone vs server

`lib/scanners/runner.ts` decides per tool:
1. If a tool is `runsOn: "phone"` (or `"either"`) and the source is local
   (`upload` / `screen`), it runs on-phone.
2. Otherwise the runner POSTs to `/api/scan/run` (SSE). If no server URL is
   set in Profile, the run surfaces a clear "this tool needs the server"
   error per tool — no silent failure.

## Per-finding contract

Every finding (built-in, server, on-phone, forged) is normalized via
`lib/findings/contract.ts → normalizeFinding()`, which guarantees:

1. A `scan/finding` entry is appended to the Logs tab via the existing
   logger, in the exact shape the Logs tab's Fix / Reproduce buttons read.
2. The Scan tab's own `FindingCard` shows the same Fix / Reproduce row,
   re-using `streamLexi(...)` and the FIX/REPRO system prompts from #20.
3. The fix output is a permanent code-level patch proposal (no auto-apply).
4. The reproduce output is a *dry-described* reproduction — never an
   instruction to execute.

## Tool-Forge

Operator-gated authoring of new scanners. Three modes — all routed through
`lib/tool-forge/approval-queue.ts` so nothing installs or runs without an
explicit Approve tap.

1. **Auto-suggest from history** (`analyzer.ts`)
   - Tails the in-app log buffer; clusters `scan/finding` entries by
     `tool::id`. When a cluster reaches the threshold (3), drafts a JS
     scanner and enqueues it as Pending.
   - Toggle in Profile → Scan section.
2. **Chat-to-scanner** (`chat-to-scanner.ts`)
   - The same generator can be triggered from chat (slash-command hook in
     a future task) or from the Forge button form.
3. **Forge Tool button** (`scan.tsx → ForgeModal`)
   - Guided form: name, description, language (`javascript` / `python` /
     `semgrep`), target file extensions, detection-logic prompt.
   - Lexi generates the source via Featherless (on-phone if the key is
     set, otherwise via the api-server) and enqueues it as Pending.

Approved tools register in `lib/scanners/registry.ts` and appear as a
toggle in the multi-select picker. JS-language tools execute on-phone via
the `function scan(file)` contract in `lib/tool-forge/runner.ts`. Forged
tools ship with the same Fix / Reproduce contract as the built-ins.

## Logging

Every event (source pick, tool toggle, scan start/finish, finding, fix
generation, reproduction generation, forge approval, forge run) goes
through `lib/logger`. The Logs tab's existing filters and Fix/Reproduce
buttons work unchanged because all `scan/finding` entries are emitted via
the same `normalizeFinding()` helper.
