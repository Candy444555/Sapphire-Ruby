# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server (with Replit Auth)
│   ├── lexi-mobile/        # Lexi AI mobile app (Expo React Native, with Replit Auth)
│   └── ai-chat/            # Uncensored AI Chat React app (main app at /)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Lexi upgrades (2026-04)

- **Deploy fix**: `artifacts/mockup-sandbox/vite.config.ts` no longer throws on missing `PORT`/`BASE_PATH` at config-load time — defaults to port 5173 and `/` so `vite build` works during the deploy build phase.
- **Android permissions** (`artifacts/lexi-mobile/app.json`): expanded to the full personal-APK set (storage, install/uninstall, alert window, SMS, calls, body sensors, biometric, foreground services, boot-completed, exact alarms, BT scan/advertise, nearby Wi-Fi, background location). iOS `infoPlist` mirrors with usage strings and `UIBackgroundModes`.
- **JS skill registry**: new directory `artifacts/api-server/src/skills/` with `manifest.json`. Agent can emit `[SELF_PATCH_JS_SKILL name="x" description="…"] module.exports = { name, description, run } [/SELF_PATCH_JS_SKILL]`. Skills are written as real CJS modules and hot-loaded via `loadAllJsSkills()` (called on server start and on every fuse). Old Python path stays for backward compatibility. Routes: `GET/POST/DELETE /api/js-skills`, `POST /api/js-skills/:slug/call`.
- **Self-heal layer**: `artifacts/api-server/src/middlewares/selfHeal.ts` registered as the final Express error handler. Fingerprints errors by `method+path+stack-head`, caps retries at 3 per fingerprint, persists every attempt to `lexi-self-heal.log`, exposes snapshot via `GET /api/self-heal/status`. Kill-switch: `LEXI_SELF_HEAL=off`.
- **Internet-augmented synthesis with no URLs in user-facing text**: `artifacts/api-server/src/services/web-search.ts` rewrites `formatSearchContext` to strip URLs from the model's context (titles + snippets only) and adds `rankByDomainAgreement`. New `scrubUserFacingText` strips URLs/bare domains and "according to / sources say / I searched" phrasing from outgoing replies. Applied in `agent.ts` (post-clean) and in `chat.ts` (rolling-tail buffer over the SSE stream so URLs split across chunks are still caught). Sources are written to `lexi-search-debug.log` for review only.
- **APK builder source-hash + About screen + version bump**: `artifacts/lexi-mobile/scripts/build.js` now hashes the live source tree (`app/`, `assets/`, `components/`, `hooks/`, `lib/`, `app.json`, `package.json`), bumps `android.versionCode`, and writes `artifacts/lexi-mobile/lib/build-info.ts` containing `{ sourceHash, versionCode, timestamp, builtAt }`. `app/(tabs)/profile.tsx` shows an "About this build" card with the hash, code, and ISO timestamp.
- **Self-test**: `scripts/lexi-self-test.mjs` probes all of the above and writes `lexi-self-test-report.txt` (PASS/FAIL per check + overall). Run with `node scripts/lexi-self-test.mjs`. Latest run: 13/13 PASS.
- **Lexi Mobile scanner suite**: `pnpm --filter @workspace/lexi-mobile run scan` runs deps/secrets/static/expo (and `scan:apk` on demand) against `artifacts/lexi-mobile` (or any directory via `--path`). Output JSON/SARIF/NDJSON in `artifacts/lexi-mobile/security-reports/` (gitignored). See `artifacts/lexi-mobile/SECURITY.md`. Optional manually-triggered CI: `.github/workflows/security-scan.yml`.
- **Lexi Mobile in-app logger**: `artifacts/lexi-mobile/lib/logger/` is the only sanctioned log path. Streams to console + a daily NDJSON file under `<documentDir>/lexi-logs/`, plus a new **Logs** tab (`app/(tabs)/logs.tsx`) with filter/search/share/clear/external-NDJSON-import. Wraps global `fetch` and `expo/fetch`, hooks `expo-router` navigation, the `ErrorBoundary`, and the global error handlers. Verbosity / retention / redaction live in Profile → LOGGING. Schema + how-to in `artifacts/lexi-mobile/LOGGING.md`.

## NEXUS — Uncensored AI Chat App

The main artifact is the **AI Chat** app at `/`. Primary AI is **Lexi** (Llama 3.1 8B Lexi Uncensored V2).

### Features
- Dark terminal-inspired UI ("NEXUS")
- Model selector with uncensored model badges
- Real-time SSE streaming responses from Hugging Face router
- System prompt presets: Default, God Mode, Aircrack-ng, Kali Linux 🐉
- Massively detailed Kali Linux system prompt with full tool coverage
- Markdown rendering with code syntax highlighting
- Purge/clear conversation
- **Real terminal emulator** at `/terminal` — persistent bash sessions per browser tab
- Lexi error reports explain what happened, why the error likely appeared, and easy fix steps instead of showing only the raw error
- Command input and Lexi answer/code areas support horizontal scrolling so pasted code keeps its original line structure
- Code sent through Lexi's command box is auto-detected, analyzed for purpose, and fused into permanent Lexi code memory extensions
- Sidebar rendering restored; Lexi's chat/settings/tools panel is visible again and its lower controls scroll when needed
- Sidebar now has a toggle: an X button hides it, and a Show Sidebar button reopens it

### Real Kali Linux Tools Installed (50+)
All tools are installed via Nix and available in the real terminal:

- **Network**: nmap, masscan, hping, tcpdump, tshark, socat, netcat, bettercap, ettercap, dsniff, mitmproxy, arp-scan, nbtscan, netdiscover
- **Wireless**: aircrack-ng, airmon-ng, airodump-ng, aireplay-ng, wifite, kismet, hcxdumptool, pixiewps
- **Password**: hydra, john, hashcat, medusa, thc-hydra
- **Web**: sqlmap, nikto, dirb, gobuster, ffuf, feroxbuster, wfuzz
- **Exploitation**: msfconsole, msfvenom, searchsploit, evil-winrm, chisel, ligolo-ng
- **OSINT**: theHarvester, sherlock, recon-ng, amass, subfinder, nuclei, dnsenum, dnsrecon, smbmap, enum4linux-ng
- **Forensics**: binwalk, foremost, sleuthkit, testdisk, exiftool, steghide
- **RE**: radare2, gdb, ltrace, strace, strings, hexedit, xxd, binutils
- **Crypto/Tunnel**: openssl, gnupg, sslscan, proxychains4, tor
- **Python**: impacket, scapy, pwntools, pycryptodome, python-nmap, paramiko, ldap3, shodan

### Backend Routes
- `GET /api/models` — Returns list of models (uncensored + standard)
- `POST /api/chat` — Streams SSE chat responses from Hugging Face Inference API
- `POST /api/terminal/session` — Create persistent bash session
- `POST /api/terminal/exec` — Execute command in session (marker-based completion)
- `DELETE /api/terminal/session/:id` — Destroy session

### GitHub Pipeline (Lexi Mobile)
Token stored as `GITHUB_TOKEN` secret.
- `GET /api/github/user` — Authenticated GitHub user info
- `GET /api/github/repos` — List user repositories
- `GET /api/github/repos/:owner/:repo` — Repo details
- `GET /api/github/repos/:owner/:repo/branches` — List branches
- `GET /api/github/repos/:owner/:repo/tree` — Recursive file tree
- `GET /api/github/repos/:owner/:repo/contents` — File contents (decoded from base64)
- `POST /api/github/repos/:owner/:repo/push` — Create or update a single file (commit)
- `POST /api/github/repos/:owner/:repo/push-multi` — Push multiple files in sequence
- `POST /api/github/repos/:owner/:repo/issues` — Create issue
- `GET /api/github/repos/:owner/:repo/issues` — List open issues
- `POST /api/github/repos` — Create new repository

#### Lexi Mobile GitHub Tab (`app/(tabs)/github.tsx`)
- GitHub icon in chat header navigates to tab
- User profile banner showing login, repo count, followers
- Searchable repo list with language, star count, visibility badge
- Repo detail: branch selector, file tree, action buttons
- Push Code screen: file path, content editor, commit message, branch picker
- Issues screen: list open issues, create new issue modal
- Create Repository screen: name, description, public/private toggle

### Uncensored Models Available
- Hermes 3 Llama 3.1 405B / 70B
- Hermes 2 Pro Llama 3 8B
- Euryale v2.1 / v2.2 / v2.3 70B (creative/roleplay)
- Magnum v4 72B
- MythoMax L2 13B
- ReMM SLERP L2 13B

### Standard Models
- Llama 3.3 70B Instruct (Meta)
- Qwen 2.5 72B / 7B Instruct (Alibaba)
- Mistral Large (Mistral AI)
- DeepSeek V3
- Gemma 2 27B (Google)
- Phi-4 14B (Microsoft)

### Environment Variables
- `HF_TOKEN` — Required. Get from https://huggingface.co/settings/tokens

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/`.

### `artifacts/ai-chat` (`@workspace/ai-chat`)

React + Vite frontend. Main app served at `/`.
- Uses SSE for streaming
- react-markdown for message rendering
- framer-motion for animations

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL.

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec and Orval codegen config.
Run codegen: `pnpm --filter @workspace/api-spec run codegen`
