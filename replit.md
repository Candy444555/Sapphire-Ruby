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
│   ├── api-server/         # Express API server
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
