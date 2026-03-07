# Architecture

## Product Stance

This project should not be framed as a generic "scrape every competitor" tool.
The durable product is a **conversation portability layer**:

- import a closed chat representation
- normalize it into a portable internal format
- render it for humans
- export it for other bots and archive systems

## Phase 1 Scope

First source:

- public ChatGPT share links only

First outputs:

- reader view
- markdown transcript
- bot handover transcript
- structured JSON

Explicitly out of scope for the first slice:

- all providers at once
- perfect original styling recreation
- billing
- BYOK
- team or org features
- persistent background jobs outside the app process

## Performance Rules

- frontend is a `Vite` SPA, not a full-stack SSR framework
- API and browser automation stay off the client
- imports run as async jobs, never inline in the form submit response
- result views are split by route and should keep heavy transforms out of initial render
- only install the `shadcn/ui` pieces actually used
- large transcript rendering should move to virtualization once real imports land
- expensive exports should be cached per import result

## Repo Layout

```text
apps/
  web/        Vite React frontend
  server/     Hono API and import orchestration
packages/
  shared/     zod schemas and shared types
docs/
  architecture.md
```

## Conversation IR

The internal representation is the product core.

```text
conversation
  source
  messages[]
    role
    blocks[]
      paragraph | heading | list | code | quote | table
```

This gives the system one durable target independent of provider HTML quirks.

## Import Pipeline

1. `validate`
   Accept and classify input source.
2. `fetch`
   Use `Playwright` for pages that are client-rendered.
3. `extract`
   Remove UI noise and isolate message candidates.
4. `normalize`
   Convert weird DOM into compact semantic fragments.
5. `structure`
   Use an LLM to map fragments into schema-valid IR.
6. `render`
   Derive reader, markdown, handover and JSON artifacts.

## Data Model

Jobs and derived artifacts are now persisted in SQLite.
The current schema stores:

- `imports`
- `import_snapshots`

The next storage expansion should add finer-grained normalized fragments and provider-specific debug metadata once the AI structuring pass lands.

## Why `Vite + React + Hono`

- `Vite` keeps the frontend lean and fast to iterate on
- `React` is sufficient for a dense, componentized transcript UI
- `Hono` gives a small server surface for import jobs and export endpoints
- separation keeps `Playwright` and future AI work isolated from client performance
