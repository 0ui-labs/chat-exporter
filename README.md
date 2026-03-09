# Chat Exporter

Performance-first scaffold for a personal or paid AI conversation portability tool.

## Stack

- `apps/web`: `Vite + React + React Router + Tailwind + shadcn/ui-style components`
- `apps/server`: `Hono` API for import jobs, export endpoints and SQLite-backed persistence
- `packages/shared`: shared schemas for the conversation IR and import jobs

## Current Status

This repository is scaffolded for the first product slice:

- multi-provider public share page import form
- async import job model
- shared `Conversation IR`
- reader, markdown, handover and JSON result views
- persisted debug snapshot view with raw-vs-normalized compare, normalized payload and raw HTML preview

The current importer uses `Playwright` against public share pages, keeps the ChatGPT-specific path for high-fidelity extraction and falls back to a generic provider-aware DOM heuristic for other platforms such as Claude, Gemini, Grok and DeepSeek.
Imported jobs plus raw snapshots are persisted in SQLite.
An optional AI repair pass can now re-structure low-confidence assistant messages behind a schema-validated interface using OpenAI or Cerebras.

## Run

```bash
pnpm install
pnpm dev
```

Web runs on `http://localhost:5173`.
API runs on `http://localhost:8787`.
SQLite is stored at `data/chat-exporter.db` by default.

The server now loads env values from root `.env` and `.env.local`, plus optional `apps/server/.env` variants for local-only secrets.

Optional AI structuring env vars:

- `STRUCTURING_PROVIDER`: `auto`, `openai`, `cerebras` or `deterministic`
- `OPENAI_API_KEY`: enables the OpenAI repair pass
- `OPENAI_STRUCTURING_MODEL`: defaults to `gpt-5-mini`
- `CEREBRAS_API_KEY`: enables the Cerebras repair pass
- `CEREBRAS_STRUCTURING_MODEL`: defaults to `gpt-oss-120b`
- `CEREBRAS_STRUCTURING_REASONING_EFFORT`: `low`, `medium` or `high`, defaults to `low`
- `CEREBRAS_STRUCTURING_MAX_COMPLETION_TOKENS`: defaults to `4096`
- `STRUCTURING_MAX_MESSAGES`: caps assistant repair attempts per import
- `STRUCTURING_MAX_MESSAGE_CHARS`: skips oversized assistant messages before repair
- `STRUCTURING_TIMEOUT_MS`: request timeout per repair call, defaults to `60000`
- `STRUCTURING_ENABLED=false`: forces deterministic-only imports

## Build

```bash
pnpm build
pnpm typecheck
```

## Next Implementation Steps

1. Harden provider-specific extraction paths for Claude, Gemini, Grok and DeepSeek so fewer pages rely on the generic fallback.
2. Improve deterministic extraction for edge cases like nested lists, tables and provider-specific code blocks.
3. Add richer AI repair/debug telemetry such as raw model responses and selective retry controls.
4. Add additional ingestion modes such as pasted HTML or direct share-sheet payloads.
