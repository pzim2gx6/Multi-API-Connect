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
- **AI SDKs**: openai ^6, @anthropic-ai/sdk ^0.82

## Architecture

### API Server (`artifacts/api-server`)
Express server on port 8080 serving:
- `/api` — health check and standard API routes
- `/v1` — AI proxy routes:
  - `GET /v1/models` — list available models (auth required)
  - `POST /v1/chat/completions` — OpenAI-compatible chat endpoint (auto-converts Claude models)
  - `POST /v1/messages` — Anthropic Messages API endpoint (auto-converts GPT/o-series models)

### API Portal (`artifacts/api-portal`)
React + Vite frontend at `/` showing:
- Connection details, endpoints, available models
- CherryStudio setup guide
- Quick test curl example

### AI Proxy Features
- Dual-compatible: accepts both OpenAI and Anthropic request formats
- Full tool call support with bidirectional format conversion
- Streaming (SSE) and non-streaming modes
- Anthropic non-stream internally uses `stream().finalMessage()` to avoid timeout
- Models: gpt-5.2, gpt-5-mini, gpt-5-nano, o4-mini, o3, claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5
- Auth via Bearer token (PROXY_API_KEY secret)

### Environment Variables
- `AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY` — Replit AI Integration (auto-provisioned)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` / `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Replit AI Integration (auto-provisioned)
- `PROXY_API_KEY` — User-provided Bearer token for proxy auth
- `SESSION_SECRET` — Session secret

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
