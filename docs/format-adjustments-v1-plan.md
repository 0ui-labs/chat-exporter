# Format Adjustments V1

## Goal

Build a format-scoped adjustment workflow that lets users fix a visible issue
by selecting it in the active output tab and describing the desired change in
plain language. The system should turn that interaction into a previewable rule
for the active format.

This is not a generic global prompt box. The UX is always:

1. open a specific format tab
2. enter adjust mode
3. select a visible target
4. explain the problem in a mini chat
5. preview the result
6. apply or discard the rule

## Product Principles

- The active tab defines the editing context.
- The user should never need to learn Markdown, HTML, CSS, or internal rule
  syntax.
- Selection comes first. The user points at a concrete place and talks about
  that place.
- The AI must explain format limits instead of silently making the wrong kind
  of change.
- A preview is required before any rule becomes active.
- The canonical conversation stays intact. Adjustments produce derived output
  rules or structure transforms.

## Mental Model

The product should behave like a small "format workspace" for each output:

- `Reader` for in-app reading quality
- `Markdown` for portable text output
- `HTML` for browser or embed output
- `Rich text` for copy/paste targets
- `JSON` for structure inspection and machine consumers

Every workspace uses the same interaction model, but each format exposes
different capabilities.

## V1 Scope

V1 should ship the shared adjustment framework plus the first two format
workspaces:

- `Reader`
- `Markdown`

This keeps the UX real without forcing the team to solve every export format at
once. The shared data model and API should still be designed for more targets.

## Current Status

As of March 8, 2026, the `codex/format-adjustments-v1` branch has completed the
full V1 vertical slice for `Reader` and `Markdown`.

Implemented:

- extracted format workspace shell from the route page
- adjust mode and stable selection anchors for `Reader` and `Markdown`
- persisted adjustment sessions and mini chat history
- clarification turns and preview generation
- rule apply, disable, discard, undo, and "why this exists" flows
- `Reader` and `Markdown` rule application with before or after previews
- instrumentation for session, preview, apply, disable, and discard events
- server tests plus a smoke-test script for the end-to-end workflow
- AI-backed preview rule compilation with deterministic fallback

Still outside V1:

- `HTML`, `Rich text`, and `JSON` adjustment workspaces
- reusable `format_profile` or global rules
- inline rich text AST migration
- richer manual browser QA beyond the automated smoke flow

## Non-Goals For V1

- Global rules that affect every import by default
- Automatic rule suggestions without explicit user feedback
- Multi-user collaboration
- Free-form JSON styling
- Cross-format rule propagation from a single prompt
- Full inline rich text AST migration

## Format Capability Matrix

| Format | V1 support | Allowed rule kinds | Notes |
| --- | --- | --- | --- |
| Reader | yes | `render`, `inline_semantics`, limited `structure` | Best place for spacing and visual emphasis |
| Markdown | yes | `structure`, `inline_semantics`, `export_profile` | No direct font size or CSS-like spacing |
| HTML | later | `render`, `inline_semantics`, `export_profile` | Good for visual fidelity |
| Rich text | later | `render`, `inline_semantics`, `clipboard` | Good for copy/paste workflows |
| JSON | later | `export_profile` only | Should stay strict and inspectable |

## Rule Taxonomy

Each rule must declare both a target format and a kind.

- `structure`
  Changes semantic block structure. Example: convert a paragraph into a
  heading or split a fake list into real list items.
- `inline_semantics`
  Changes inline meaning without changing the outer block. Example: turn
  `Important:` into bold label text in Markdown or Reader output.
- `render`
  Purely visual. Example: add more space below headings in the Reader.
- `export_profile`
  Output-specific cleanup. Example: normalize spacing around tables in Markdown
  output.
- `clipboard`
  Rich copy/paste output for later formats such as HTML or RTF.

## Scope Model

Rules need a clear scope from day one:

- `import_local`
  Only affects the current import and current format.
- `format_profile`
  Reusable per format, but not part of V1 activation flow.
- `workspace_global`
  Global account or installation level scope, also post-V1.

V1 should only activate `import_local` rules. This keeps previews safe and
limits bad generalization.

## Selection Model

Selections must be stored as semantic anchors instead of fragile DOM paths.

Required anchor fields:

- `importId`
- `targetFormat`
- `messageId`
- `blockIndex`
- `blockType`
- `selectedText`
- `textQuote`

Optional anchor fields by format:

- `selectionStart`
- `selectionEnd`
- `lineStart`
- `lineEnd`

Selections should also include local context:

- previous block snapshot
- current block snapshot
- next block snapshot
- visible rendered excerpt
- source excerpt if available

## Session Model

The mini chat should be stored as an explicit adjustment session.

### `adjustment_sessions`

- `id`
- `import_id`
- `target_format`
- `status` (`open`, `preview_ready`, `applied`, `discarded`, `failed`)
- `selection_json`
- `preview_artifact_json`
- `created_at`
- `updated_at`

### `adjustment_messages`

- `id`
- `session_id`
- `role` (`system`, `user`, `assistant`, `tool`)
- `content`
- `created_at`

### `format_rules`

- `id`
- `import_id`
- `target_format`
- `kind`
- `scope`
- `status` (`draft`, `active`, `disabled`, `rejected`)
- `selector_json`
- `instruction`
- `compiled_rule_json`
- `source_session_id`
- `created_at`
- `updated_at`

## Preview Pipeline

The output stack should become:

`canonical conversation -> format adapter -> active rules -> preview renderer`

### Canonical conversation

The shared conversation schema remains the durable source of truth.

### Format adapter

Creates a format-specific editable representation:

- Reader block model for `Reader`
- text plus source mapping for `Markdown`

### Active rules

Rules are filtered by:

- active import
- active format
- active status

### Preview renderer

Produces the exact output for the selected tab plus enough metadata to render a
preview diff.

## Mini Chat Behavior

The adjustment panel should be a contextual mini chat, not a plain textarea.

The AI context must always include:

- active format
- allowed rule kinds for that format
- selected anchor and excerpt
- nearby blocks
- current rendered output for that region
- current active rules for the format

The assistant should be able to:

- propose a rule directly
- ask one clarifying follow-up question
- explain a format limitation
- suggest switching formats when the requested effect is impossible in the
  current one

Examples:

- In `Reader`: "make this larger" can become a render rule.
- In `Markdown`: "make this larger" should trigger an explanation that Markdown
  has no portable font size, with options such as converting the line into a
  heading.

## Frontend Plan

The current tab rendering and Reader blocks live inside
`apps/web/src/routes/home-page.tsx`. V1 should extract that into dedicated
components.

### New components

- `FormatWorkspace`
  Owns the current tab, active rules, and adjust mode state.
- `ReaderView`
  Renders block-level selection targets and applies Reader preview rules.
- `MarkdownView`
  Renders editable preview text with line and block mapping.
- `AdjustModeToolbar`
  Shows the gear button, mode status, and active rule chips.
- `AdjustmentPanel`
  Hosts the mini chat, rule explanation, preview actions, and clarifications.
- `SelectionOverlay`
  Handles hover states and click-to-select affordances.

### Home page refactor

`home-page.tsx` should keep import orchestration and route state, but move
format-specific rendering into reusable workspace components.

## Backend Plan

### Database

Add the three new tables described above to the SQLite bootstrap in
`apps/server/src/lib/database.ts`.

### Repository layer

Add a repository module for:

- creating sessions
- appending session messages
- saving preview payloads
- creating rules
- toggling rule status
- listing active rules by import and format

### API endpoints

Suggested endpoints:

- `POST /api/imports/:id/adjustment-sessions`
- `GET /api/imports/:id/format-rules?format=reader`
- `POST /api/adjustment-sessions/:id/messages`
- `POST /api/adjustment-sessions/:id/preview`
- `POST /api/adjustment-sessions/:id/apply`
- `POST /api/format-rules/:id/disable`

### Rule compiler service

Create a server-side compiler that turns the mini chat result into a strict
rule payload. The compiler should never emit raw executable code.

For V1, prefer JSON-serializable rules such as:

```json
{
  "selector": {
    "blockType": "heading",
    "textPattern": ".+:$"
  },
  "effect": {
    "kind": "bold_prefix_before_colon"
  }
}
```

or

```json
{
  "selector": {
    "blockType": "table"
  },
  "effect": {
    "kind": "reader_spacing_after_block",
    "value": "lg"
  }
}
```

## Markdown Constraints

Markdown needs explicit product handling because it cannot express many visual
requests directly.

V1 rules for Markdown should focus on:

- heading promotion and demotion
- list normalization
- bold label conversion
- paragraph splitting and joining
- table normalization
- fence cleanup for code blocks

V1 should reject or redirect these requests in Markdown:

- "make this bigger"
- "use more white space below this"
- exact pixel spacing
- font families or colors

## Reader Constraints

Reader is the easiest V1 target because it is already a block renderer. Initial
Reader rules should focus on:

- spacing before or after block types
- block emphasis styles
- label bolding before a colon
- local heading treatment

V1 Reader rules should not mutate the canonical conversation.

## Concrete Backlog Status

### [x] 1. Extract format workspace shell

- Move tabbed output rendering out of `home-page.tsx`.
- Introduce `FormatWorkspace` with shared state for the active format.
- Keep current output parity before adding adjust mode.

### [x] 2. Add adjustment mode UI scaffolding

- Add gear button for supported tabs.
- Add adjust mode state and selection affordances.
- Add a temporary side panel for the future mini chat.

### [x] 3. Introduce stable selection anchors

- Reader: attach block metadata to rendered blocks.
- Markdown: produce line and block source mapping.
- Normalize selection payload shape across both formats.

### [x] 4. Add adjustment session persistence

- Create SQLite tables and repository functions.
- Add API endpoints to create sessions and append messages.
- Return session state to the client after each mutation.

### [x] 5. Implement mini chat orchestration

- Send selection context plus user prompt to the server.
- Persist assistant replies in the session.
- Support clarification turns before rule compilation.

### [x] 6. Build rule compiler and preview path

- Compile assistant output into strict JSON rules.
- Run preview rendering for the selected format.
- Return preview metadata for accept or reject actions.

### [x] 7. Apply Reader rules

- Add a Reader rule engine over the existing block renderer.
- Support the first safe effect set.
- Show before or after preview inside the Reader tab.

### [x] 8. Apply Markdown rules

- Add Markdown adapter and preview renderer.
- Show text diff or section diff before apply.
- Support the first Markdown-safe rule set.

### [x] 9. Add rule chips and lifecycle actions

- Show active rules per format tab.
- Support disable, discard, and simple undo flows.
- Expose a short "why this exists" explanation.

### [x] 10. Add instrumentation and guardrails

- Log rejected rule compilations and preview failures.
- Keep counts for clarifications, applies, and discards.
- Add test coverage for rule compilation and selection anchors.

## Next Steps After V1

- Run a manual browser pass against representative imports and capture UX gaps
  that the smoke test does not catch.
- Decide whether the next format target should be `HTML` or `Rich text`.
- Decide whether post-V1 should prioritize better rule quality, reusable format
  profiles, or new format workspaces first.

## Suggested Commit Sequence

To keep commits atomic, the work should roughly land in this order:

1. extract workspace shell
2. add adjust mode scaffold
3. add persistence schema and repository
4. add session API
5. add mini chat flow
6. add Reader rule engine
7. add Markdown rule engine
8. add rule chips and polish

## Key Risks

- The current shared conversation model has no inline text AST, which limits
  some fine-grained transformations.
- Markdown preview needs reliable source mapping or selection anchors will
  drift.
- A too-powerful rule language will become hard to validate and debug.
- If apply happens without preview, trust will drop quickly.

## Open Questions

- Should Markdown adjustments operate on the canonical block model or on a
  rendered Markdown intermediate representation with source maps?
- Do we want to let some `structure` rules optionally promote into the canonical
  conversation after review in a later phase?
- Which clipboard formats matter first after V1: `text/html`, `rtf`, or both?

## Recommended Next Step

Start with the shared shell and Reader-first selection flow, but keep all
session and rule APIs format-aware from the first commit. That gives the team a
working vertical slice without painting the system into a Reader-only corner.
