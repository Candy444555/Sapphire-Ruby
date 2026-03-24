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

## Uncensored AI Chat App

The main artifact is the **AI Chat** app at `/`.

### Features
- Dark terminal-inspired UI ("NEXUS AI")
- Model selector with uncensored model badges
- Real-time SSE streaming responses
- Customizable system prompt
- Markdown rendering with code syntax highlighting
- Purge/clear conversation
- Multiple model support

### Backend Routes
- `GET /api/models` — Returns list of models (uncensored + standard)
- `POST /api/chat` — Streams SSE chat responses from Hugging Face Inference API

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
