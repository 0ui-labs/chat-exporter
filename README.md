# Chat Exporter

Performance-first scaffold for a personal or paid AI conversation portability tool.

## Stack

- `apps/web`: `Vite + React + React Router + Tailwind + shadcn/ui-style components`
- `apps/server`: `Hono` API for import jobs, export endpoints and SQLite-backed persistence
- `packages/shared`: shared schemas for the conversation IR and import jobs

## Current Status

This repository is scaffolded for the first product slice:

- ChatGPT public share link import form
- async import job model
- shared `Conversation IR`
- reader, markdown, handover and JSON result views
- persisted debug snapshot view with raw-vs-normalized compare, normalized payload and raw HTML preview

The current importer already uses `Playwright` against public ChatGPT share links, extracts a deterministic conversation structure and persists jobs plus raw snapshots in SQLite.
An optional OpenAI repair pass can now re-structure low-confidence assistant messages behind a schema-validated interface when `OPENAI_API_KEY` is configured.

## Run

```bash
pnpm install
pnpm dev
```

Web runs on `http://localhost:5173`.
API runs on `http://localhost:8787`.
SQLite is stored at `data/chat-exporter.db` by default.

Optional AI structuring env vars:

- `OPENAI_API_KEY`: enables the OpenAI repair pass
- `OPENAI_STRUCTURING_MODEL`: defaults to `gpt-5-mini`
- `OPENAI_STRUCTURING_MAX_MESSAGES`: caps assistant repair attempts per import
- `OPENAI_STRUCTURING_MAX_MESSAGE_CHARS`: skips oversized assistant messages before repair
- `OPENAI_STRUCTURING_ENABLED=false`: forces deterministic-only imports

## Build

```bash
pnpm build
pnpm typecheck
```

## Next Implementation Steps

1. Improve deterministic extraction for edge cases like nested lists, tables and provider-specific code blocks.
2. Add richer AI repair/debug telemetry such as raw model responses and selective retry controls.
3. Add additional ingestion modes such as pasted HTML or direct share-sheet payloads.
4. Add search, filtering and timeline views across the persisted import archive.
