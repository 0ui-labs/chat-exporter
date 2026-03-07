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

The current importer already uses `Playwright` against public ChatGPT share links, extracts a deterministic conversation structure and persists jobs plus raw snapshots in SQLite.
The AI normalization step is still pending.

## Run

```bash
pnpm install
pnpm dev
```

Web runs on `http://localhost:5173`.
API runs on `http://localhost:8787`.
SQLite is stored at `data/chat-exporter.db` by default.

## Build

```bash
pnpm build
pnpm typecheck
```

## Next Implementation Steps

1. Improve deterministic extraction for edge cases like nested lists, tables and provider-specific code blocks.
2. Add the AI structuring step behind a schema-validated interface.
3. Add debug routes or UI for persisted raw snapshots and normalized payloads.
4. Add additional ingestion modes such as pasted HTML or direct share-sheet payloads.
