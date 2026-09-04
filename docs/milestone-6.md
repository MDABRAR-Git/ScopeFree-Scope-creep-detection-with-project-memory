# Milestone 6 plan — Project Memory

Status: proposed implementation plan, not implemented or verified. Prepared against `abrar-dev` at `4e1b055`. This document becomes the Milestone 6 source of truth after the user approves implementation. All implementation, tests, commits and pushes stay directly on `abrar-dev` / `origin/abrar-dev`; no separate branch and no deployment.

## Outcome and boundary

Add a freelancer-only Project Memory that makes the original agreement and every client decision easy to find, inspect and trace. The primary list contains every finalized client decision plus every current undecided pending offer. A decision detail shows the exact frozen offer, its source evidence, its original AI analysis and all saved human revisions in chronological order.

Milestone 6 is read-only. It does not change the baseline, requests, revisions, prices, offers, decisions, scope counters or billing. The Ask Project Memory chatbot remains Milestone 7. Do not add embeddings, a vector database, generated SQL, AI summaries, persistent chat, pagination, tags editing, exports, payments, notifications, confidence or timeline fields.

## Product choices

- Treat a `ProjectDecision` as the authoritative finalized memory record. Derive `ACCEPTED`, `DECLINED` and `SUPERSEDED` from the saved outcome and an accepted replacement relationship; never infer authority from recency.
- Treat only the estimate's current `PENDING` proposal as a pending memory item. It remains an offer, not a fabricated decision. Expired or stale pending offers remain in the list with explicit non-actionable labels and cannot be represented as current agreement.
- Keep revoked, replaced and expired offers in the related request/decision offer history. They do not become standalone decisions or inflate the primary list. Requests that were never shared remain available in Request History and are not labelled pending in Memory.
- Show newest memory records first with a stable timestamp/UUID tie-breaker. Show original AI and saved revisions oldest first inside details.
- The status filter values are `ALL`, `PENDING`, `ACCEPTED`, `DECLINED` and `SUPERSEDED`. `SUPERSEDED` means an accepted decision explicitly replaced by another accepted decision. A declined replacement leaves the older accepted decision current.
- Search is case-insensitive plain text over the complete project-scoped memory projection: request number/text, decision title/text, task titles and explanations, client-facing agreement terms, assumptions, client comment and stored tags. Empty search returns all records. Cap a trimmed query at 200 characters and reject unknown query fields/statuses.
- Return all matching records in one response without pagination, hidden limits or silent truncation. If any required saved snapshot is malformed or has inconsistent ownership, fail the complete response with an operator-facing error instead of omitting that record.
- Display existing `tagsJson` values if valid historical tags exist, but add no tag mutation UI. New Milestone 5 decisions currently save an empty tag list.

## Implementation order

### 1. Establish read contracts and authoritative status rules

Add strict Zod contracts for the memory query, list rows, summary and decision detail. Keep storage compatibility at the read boundary by using the existing baseline, pinned-input, revision, proposal and amendment readers. Do not expose raw JSONB or token fields to the UI.

Define a pure projection that joins each final decision to its proposal, approved revision, estimate and request, and validates same-project ownership throughout. A list row contains a server-owned record/decision ID, request number and text, title, normalized status, decision/offer time, scope effect, client comment presence, approved revision, deterministic price range and replacement links. Pending rows come from the estimate's current proposal when its database status is PENDING and use the frozen client offer snapshot; availability separately says active, expired or stale.

Derive status in this order: an accepted decision with an accepted `supersededBy` is `SUPERSEDED`; other accepted decisions are `ACCEPTED`; declined decisions are `DECLINED`; current offers with database status `PENDING` and no decision are `PENDING`, with separate active/expired/stale availability. Preserve stale, revoked, expired and replaced offers in detail history with explicit offer-state labels. Never count one finalized proposal twice as both an offer and a decision.

No new persistence model is planned. The current schema already stores project/decision and project/proposal time indexes, immutable snapshots, replacement links and source records. Add a migration only if implementation proves a necessary index or database constraint; any migration must support fresh setup and preserve Milestone 5 data byte-for-byte.

### 2. Build the complete project-scoped memory query

Implement `getProjectMemory(projectId, query)` behind the freelancer session. Load all project decisions and current pending proposals with their request/estimate/revision relationships. Parameterize every database query; the AI never chooses SQL. Normalize and validate every snapshot before filtering so search cannot conceal a corrupted record.

Build a deterministic searchable text projection from validated user-visible fields, then apply the status and text filters without record-count caps. Return summary counts for current accepted, superseded, declined and pending records. Do not reuse billing totals as record counts. Accepted/superseded prices come from the frozen decision snapshot; pending prices come from the frozen current offer. Scope-effect labels come from saved agreement clauses/replacement metadata rather than price alone.

Add authenticated `GET /api/projects/:projectId/memory?q=&status=`. It must use `Cache-Control: no-store`, reject malformed IDs/filters safely, enforce project ownership and perform no writes or audit mutations.

### 3. Build immutable decision details and source resolution

Implement `getMemoryDecision(projectId, decisionId)` and authenticated `GET /api/projects/:projectId/memory/:decisionId`. A valid response includes the exact final decision and client comment; the frozen client offer and agreement terms; whether it changes scope; explicit replaced/replacement decisions; all offer attempts for the request with pending/expired/revoked/final status; the immutable original AI result and provenance; and every saved revision with edit reason, calculated price and approval/offer associations.

Validate the decision, proposal, estimate, request, revisions, baseline and every cited accepted amendment as belonging to the selected project. Read historical evidence from the estimate's pinned source snapshot, then resolve navigation targets through server-owned IDs. Baseline evidence links to `/projects/:projectId/baseline#clause-:clauseId`; accepted-amendment evidence links to the owning decision detail and clause anchor. Never accept stored/generated URLs.

Render source quotes only when they exist verbatim in the pinned source text. Preserve superseded source links and label them historical. Reject invented, missing or foreign citations rather than silently dropping them.

Add a pure revision comparison helper keyed by stable task IDs. Report additions, removals and changes to title/classification/hours/assumptions plus deterministic rate/fixed-charge/price differences. Display the recorded edit reason; if none exists, say no reason was recorded. Do not infer intent or call AI. Keep each complete saved snapshot expandable so the comparison never replaces the source record.

### 4. Build the Project Memory interface

Enable the existing **Project Memory** tab and add `/projects/:projectId/memory`. The page shows a compact original-baseline/current-scope summary, status counts, a labelled search field, status filters and the complete result list. Each row clearly distinguishes current accepted scope, superseded history, declined decisions and pending offers. Show request number, date, title/request text, agreement effect and min/likely/max price. Link finalized rows to Memory details and pending offers to their existing estimate/offer review.

Use URL query parameters for search/filter state so refresh and browser navigation preserve the view. Submit through a keyboard-accessible GET form; include a clear-filter action, count of displayed versus total memory records, useful no-record/no-match states and visible errors. Do not implement client-side hidden pagination or an infinite-scroll limit.

Add `/projects/:projectId/memory/:decisionId` with sections for final decision, frozen offer, agreement terms, source evidence, supersession, offer history, original AI analysis and chronological saved revisions/comparisons. Reuse existing read-only task, price and offer presentation where that preserves the same labels. Render all strings as escaped text. Desktop may use a summary/detail layout; mobile must stack without forced horizontal scrolling.

### 5. Preserve boundaries and failure behavior

Require the workspace session on pages and APIs. A decision ID from another project, a pending proposal ID used as a decision ID and a syntactically valid unknown ID all return the same safe 404. Public offer tokens never authorize Memory, and Memory responses never contain token hashes, raw token links, operation receipts, session data or unrelated project content.

GET and search remain read-only. Memory does not update scope, normalize old snapshots in place, backfill tags, create audit events or call the provider. A malformed historical record returns `INVALID_ESTIMATE` with a safe message and no partial list. Database outages use the existing safe retryable error. Search input and stored text are untrusted and never rendered as HTML.

### 6. Verification and delivery

Add unit tests for status derivation, stable ordering, complete text matching, search normalization, revision diffs, price-source selection and source-link validation. Exercise accepted, declined, superseded, pending, expired, revoked, replaced, all-IN_SCOPE and fixed-charge records. Verify a declined attempted replacement does not supersede its target.

Add database/API tests proving session and project isolation, strict query validation, no GET mutations, no duplicate final/pending rows, exact frozen totals, and safe failure on malformed/foreign snapshots or citations. Create enough project records to prove all results are returned without pagination. Verify searches across request text, terms, comments and tags, and verify unmatched/project-foreign text returns nothing.

Add browser tests at desktop and 390px mobile for tab navigation, search, every status filter, keyboard use, clear/no-results, detail deep links, source anchors, revision expansion, supersession navigation, refresh and no horizontal overflow. Inspect screenshots. Extend restart verification so list/detail responses remain byte-equivalent after a production application restart.

Milestone 6 makes no AI call, so a new provider-quality evaluation is not required. Extend the existing real-provider browser workflow after Milestone 5 acceptance to open Project Memory and verify that the accepted agreement, exact frozen price and source link appear; this consumes no additional provider call. Keep all synthetic verification records in the isolated test database.

Run build, typecheck, lint, offline tests, full database/browser regressions, restart verification and the extended real workflow. Update README, AGENTS/SPEC/TASKS amendments and this report with observed results and concrete limitations. Commit in small coherent changes and push only to `origin/abrar-dev`; do not deploy.

## Acceptance checks

- Every finalized decision and current undecided pending offer appears exactly once; all matching records are returned without pagination.
- Accepted, declined, superseded and pending statuses are derived from authoritative relationships. Revoked/expired offers stay visible as offer history and never become decisions.
- Search and filters are complete, stable after refresh and constrained to one project. Unknown or malformed filters fail safely.
- A decision detail reproduces the exact frozen offer, agreement, client comment and accepted billing amounts, with no values taken from a later revision.
- Original AI output and every immutable saved revision appear chronologically. Deterministic comparisons reflect real saved differences and do not invent edit reasons.
- Baseline and accepted-amendment evidence resolves to server-generated project-local links and exact quotes. Missing/foreign evidence fails the response rather than disappearing.
- Explicit supersession links both decisions, keeps the old record visible and marks only the replaced accepted decision `SUPERSEDED`. A declined replacement does not change it.
- Pending, stale, revoked, expired and finalized offer states remain distinct. An internal approval or unshared review is never labelled a client decision.
- Freelancer session and project ownership protect all pages/APIs. Memory responses expose no client credentials, internal receipts or records from another project; GET causes no mutation.
- Desktop/mobile/keyboard flows, production restart persistence and existing Milestone 1–5 regressions pass. The accepted result from the real-provider workflow is observable in Memory without another AI-generated interpretation.

## Delivery

Implementation will stay on `abrar-dev` in this order: contracts/projection, list API/page, decision detail/source resolution, verification/documentation. No deployment is part of Milestone 6.
