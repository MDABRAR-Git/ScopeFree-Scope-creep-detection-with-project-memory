# ScopeFree

A standalone workspace for keeping project agreements and scope changes connected. Foundation, access, baseline/request intake, live analysis, review/pricing/history and Milestone 5 client requests/offers/decisions are implemented. See the milestone verification records for actual live results and limitations. The source documents describe the full intended application; they are not claims that all features are built.

Available now: password login/logout, private projects, original-agreement paste/upload and clause confirmation, saved client requests with INR hourly rates, live scope analysis with validated citations, immutable original estimates/initial revisions and PostgreSQL persistence. Editable reviews, deterministic price ranges, internal approval, Request History, Additional Requests and billing summaries are included. Client submission links, approved offers, acceptance/decline and accepted scope amendments are included. Project Memory browsing and chatbot remain later milestones and inactive. There is no runtime demo or seeded project content.

The current application, including Milestone 5, is on `abrar-dev`. Clone that branch explicitly:

```sh
git clone --branch abrar-dev https://github.com/MDABRAR-Git/ScopeFree-Scope-creep-detection-with-project-memory.git
```

Per the user's September 4, 2026 correction, all future work is completed, tested and committed directly on `abrar-dev`, then pushed only to `origin/abrar-dev`. Do not create or push separate milestone/feature branches. Milestone 4's original commit is included in `abrar-dev` with its history preserved. Existing other branches remain historical checkpoints; they are not future development or push targets.

## Prerequisites

- Node.js 22.13+ or 24 LTS and npm.
- PostgreSQL 18, locally installed or through Docker.
- A workspace password and a randomly generated session secret. No signup or accounts.

## Local setup

1. Run `npm ci` in this repository.
2. Copy `.env.example` to `.env` (ignored by Git).
3. Create a PostgreSQL database/user and set `DATABASE_URL`. For Docker, add a strong `POSTGRES_PASSWORD` to `.env`, use the same password in `DATABASE_URL`, then run `docker compose up -d db`. Percent-encode special characters inside a connection URL.
4. Run `npm run password:hash` in an interactive terminal. It masks your entry and outputs a base64-encoded Argon2id hash. Put that value in `FREELANCER_PASSWORD_HASH` in `.env`, in quotes. Base64 prevents Next.js from interpreting dollar signs in an Argon2 hash as environment references; it is not encryption. Plaintext passwords are never sent to AI or stored by the application.
5. Generate a session secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` and put it in `SESSION_SECRET`. Keep both values server-side.
6. Set `APP_ORIGIN` to the exact origin you will open, for example `http://localhost:3000`, without a trailing slash. Opening a different hostname causes mutation requests to be rejected.
7. Run `npm run db:migrate`, then `npm run dev`. Open [ScopeFree locally](http://localhost:3000). Use the configured password and create a project.

For production compilation locally: `npm run build`, followed by `npm start`. Production cookies always use Secure; localhost is a browser development exception. A real deployment requires HTTPS and the corresponding `APP_ORIGIN`. This milestone does not deploy anything.

### Optional Windows database helper

With PostgreSQL 18 already installed, run `./scripts/local-postgres.ps1` in PowerShell 7. It creates an isolated cluster under ignored `.local/postgres`, uses SCRAM authentication, and listens only on `127.0.0.1:55432`. Copy the connection URL from `.local/database-url.txt` into `.env`; its password is generated locally. Run `./scripts/local-postgres.ps1 -Action stop` to stop only this cluster. Existing PostgreSQL services are not changed. Adjust `-PostgresBin` for another installation path.

## Access and storage

- Argon2id verifies the configured password; iron-session seals the cookie. The HttpOnly, SameSite=Lax cookie expires after eight hours and is Secure in production. Server session records enforce expiry and immediate logout revocation, including replayed cookies. Changing the password hash invalidates existing sessions; changing the session secret invalidates cookie seals. Restart after environment changes.
- All implemented workspace pages and project API routes enforce sessions. Mutations (including login) require an exact trusted `Origin`; cross-site fetches are rejected. No GET handler changes state.
- Login allows ten attempts per 15-minute window, persisted atomically in PostgreSQL. This single-freelancer global limit deliberately does not trust IP/proxy headers. Successful attempts also count; the window does not slide. After the limit, even a valid login must wait. An attacker can temporarily exhaust this budget; a public deployment should add an edge limiter appropriate to its trusted proxy.
- Project names are trimmed, required and limited to 120 characters. Extra client fields are rejected. JSON request bodies are size-bounded. Projects use UUIDs and record a creation audit event atomically. One freelancer owns the whole workspace; project IDs are resource identifiers, not access credentials.
- Migrations establish the relational models and session/throttling tables. Original baselines, AI estimate originals and saved revisions are protected at database level. Milestone 3 validates analysis evidence membership. Milestone 4 adds saved-revision approval with ownership checks and audit history. Milestone 5 protects frozen offers and final decisions, and serializes acceptance with review/correction and scope changes. JSON contracts are schema-versioned; timestamps use timestamp-with-time-zone columns, and application database connections explicitly use UTC independent of the database host's timezone.
- API failures use `{error:{code,message,fields?,retryable}}` and `Cache-Control: no-store`. Raw provider/database errors, prompts, passwords, and session cookies are not included. Text is escaped by React. Public client APIs require a separate resource-scoped bearer token and serialize only approved client-facing content.

## AI configuration and replacement boundary

`src/server/ai/provider.ts` exports the shared `AIProvider.generate` contract. It is guarded by `server-only`; UI and business logic do not import a provider SDK. Scope analysis uses this factory; the future chatbot will share it.

Set `AI_PROVIDER=featherless`, `AI_BASE_URL=https://api.featherless.ai/v1`, `AI_MODEL` to a model your account can access and `AI_API_KEY` to the actual provider key. Do not prefix secrets with `NEXT_PUBLIC_`. Model and API access must be verified under your provider plan before live use; do not assume a chat subscription permits application/API traffic.

For another compatible endpoint, change the environment configuration and set `AI_PROVIDER=openai-compatible`. Incompatible APIs need a new implementation of the interface and a factory entry, without changes to UI/business contracts. No automatic failover or provider-selection UI exists.

Native JSON-schema output is off by default; enable `AI_NATIVE_JSON_SCHEMA=true` only after verifying the configured endpoint/model supports it. The adapter has a configurable 1–90 second per-call deadline (30 seconds by default), explicit cancellation/deadline settlement, redirect rejection, bounded output and safe typed failures. Scope analysis now uses separate prompts, source retrieval, strict schema/evidence validation and at most one repair. The chatbot remains a later milestone. Missing configuration throws `AI_NOT_CONFIGURED`; no runtime fixtures or substitutes exist. Automated transport tests inject responses in tests only; see the milestone report for observed live results.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.

After `git fetch origin --prune`, run `npm run verify:repository` to check Git object integrity, unresolved merge entries, conflict markers, private/generated tracked paths and pairwise merge previews across all fetched local/remote branches. If local environment files exist, it also checks branch-tip content for those exact credential values without printing them. This is not a general secret-detection guarantee. Results are saved to ignored `.local/repository-verification.json`. It does not check out or merge branches; merge previews may create unreachable Git tree objects. A clean preview applies only to the inspected commits, not to future edits or functional compatibility of arbitrary changes.

Browser/runtime verification uses a **separate disposable database whose name ends in `_test`**:

1. Create that database in PostgreSQL.
2. Create ignored `.env.test` with its `DATABASE_URL`, `APP_ORIGIN=http://localhost:3100`, a separate `SESSION_SECRET`, and a base64-encoded `FREELANCER_PASSWORD_HASH` from the hash helper plus matching plaintext `TEST_PASSWORD` for test login only. Do not use real credentials for automated tests.
3. Run `npx playwright install chromium`, then `npm run test:e2e`. The script applies migrations, launches the actual production build on port 3100, and checks access boundaries and desktop/mobile flows. It creates test projects and modifies session/throttle records in that test database only. Test screenshots are ignored under `test-results`.
4. Run `npm run test:runtime` for production restart persistence, absent auth configuration and database-outage checks. It uses port 3200 and the same test database. Do not run this simultaneously with browser tests.

Manual check: open the login page → enter a wrong password and inspect the error → log in → create a project → reload its overview → return to All projects → log out → open `/projects` and confirm login is required. Check at narrow/mobile width too. Stop/restart the application, log in again and confirm your project remains.

See the [Milestone 1](docs/milestone-1.md), [Milestone 2](docs/milestone-2.md), [Milestone 3](docs/milestone-3.md), [Milestone 4](docs/milestone-4.md) and [Milestone 5](docs/milestone-5.md) verification records for observed results and limitations. The imported [SPEC.md](SPEC.md), [AGENTS.md](AGENTS.md) and [TASKS.md](TASKS.md) preserve the handoff; their full-project checkboxes intentionally remain unchecked.

## Baseline and request intake

Open a project → Baseline → paste the original agreement or choose one text-based PDF, DOCX or UTF-8 TXT (up to 5 MB). Extraction produces an editable preview only. Review the whole source, then choose **Review clauses**. You can edit clause text/IDs, add/remove clauses, merge adjacent clauses or return to the source editor. Paragraph splitting is deterministic and retains the entire text; it does not use AI. If there are more than 40 paragraphs, the complete source starts as one editable clause instead of dropping paragraphs.

Confirmation requires 1–40 clauses, at most 12,000 characters including separators, unique IDs, a concrete deliverable identified by you and one confirmation of the complete agreement. The basic usability check rejects empty/very short/repeated-word placeholders; it does not independently establish that the scope is meaningful or agreed. You remain responsible for reviewing the agreement. The complete confirmed text is reconstructed from the reviewed clauses, joined by blank lines, and is shown before saving. The content hash covers that text and the clause snapshot. Identity/time/hash/audit fields are supplied by the server.

The original baseline is saved once, with an audit record in the same transaction. Concurrent confirmation is serialized on the project. Further confirmations return `BASELINE_ALREADY_CONFIRMED` (409); database triggers also reject updates/deletions of the original. Corrections require a new project, as specified. Milestone 5 adds accepted-change amendments without modifying the original baseline.

Once a baseline is confirmed, open Requests. Enter 10–4,000 trimmed characters and an INR hourly rate above zero through ₹100,000/hour, with at most two decimals. The decimal input is converted to integer paise without floating-point monetary multiplication. Request text, entered rate and current scope revision persist together with the submission audit event. The nullable database rate field preserves compatibility with any older request rows; all new intake requires a valid rate. A saved rate is an input, not an approved price. No estimate is created and no AI call occurs. All project requests are listed without pagination.

### Document parsing boundaries

- Parsing uses maintained Mammoth, PDF.js and yauzl libraries on the server. File extension, declared type and file signatures are checked; TXT decoding is strict UTF-8. DOCX archive contents are checked before text extraction. Raw parser diagnostics and file names/content are not logged.
- Upload bodies are bounded before multipart parsing. Files are processed in memory in disposable workers; nothing is written to upload directories. The workers terminate on completion, failure, timeout or request cancellation. There are at most two active extraction workers per application process, a 15-second parse deadline and a 128 MB JavaScript heap limit per worker.
- DOCX archives are limited to 1,000 entries and 16 MB of expanded content. PDFs over 100 pages are rejected. Any PDF page without readable text causes an explicit error so a scanned page is not silently omitted. Intentionally blank pages also trigger this conservative check. There is no OCR.
- Extracted text over 12,000 characters is rejected, never silently truncated. Formatting may be lost during extraction; verify that all relevant terms are represented. Unreadable, password-protected, scanned, type-mismatched or unsupported files receive a paste-text alternative.
- PDF.js, Mammoth and yauzl stay external to the Next.js server bundle so their companion worker/module paths remain usable in production. Full deployment packaging is verified in Milestone 8, not here.

### Milestone 2 checks

Use `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e -- --reporter=line` and `npm run test:runtime` (the test database setup above still applies). The test suite generates its own real PDF/DOCX/TXT fixtures under `tests`; runtime code never imports them. Browser tests also exercise project isolation, concurrent confirmation, DB immutability and transaction rollback. The runtime script checks baseline/request/rate persistence after an actual server restart and leaves its immutable verification record in the isolated `_test` database.

Development tooling overrides pin patched `deepmerge-ts` and `mysql2` versions within Prisma's dependency tree. The application continues to use PostgreSQL; these patches address dependency audit advisories without changing the database/provider architecture.

## Live scope analysis (Milestone 3)

Save a request, then choose **Analyze Request**. The server retrieves the confirmed baseline and applicable accepted amendments, calls the configured live model and validates the result before saving. Covered work must have zero additional hours. Modified/new work contributes to the additional-hour range; uncertain tasks are excluded and make the total explicitly provisional. Each task shows evidence, assumptions, questions, risks and complexity. The result is labelled AI-generated and review required, never approved.

Citation IDs and exact quotes must exist in the selected project's saved source set; matched clauses require supporting evidence. Links are constructed by the application. Validation verifies source existence and exact text, not the truth of every model interpretation or completeness of its task breakdown. Human review remains necessary. Requests and agreements are untrusted JSON data in the prompt; they cannot execute tools or SQL.

The original result, complete input/source snapshot, first revision and audit event save atomically. PostgreSQL triggers protect original estimate fields and all saved revisions. A result is saved once per request; repeat calls return it. While a call is in progress, repeated submissions return `ANALYSIS_IN_PROGRESS`. A database lease expires after 150 seconds so crashed workers do not permanently block retries. A session can start six analyses per ten minutes. Failed provider attempts count; invalid input/missing configuration do not. Scope/request changes during inference reject the result without partial writes. No database transaction is held open while waiting for AI.

`POST /api/requests/:requestId/analyze` accepts only `{idempotencyKey: UUID}` and uses the saved request/rate. `GET /api/estimates/:estimateId` requires the freelancer session. Initial revisions retain the entered rate for future review. New analyses store immutable original calculations and a schema-3 priced revision with agreement terms. Historical Milestone 3 originals retain their SQL NULL original calculations; their prices are derived for viewing, and an explicit Save review creates a new priced revision before approval. Original AI/input snapshots and earlier revisions are never rewritten.

Analysis loads all applicable accepted amendments in the same project, excludes declined/superseded decisions and preserves the baseline. The amendment JSON contract is `{schemaVersion:1,clauses:[{id,text,amendsSourceIds:[]}]}`. Evidence source IDs are `baselineUUID:clauseId` or `decisionUUID:clauseId`. Malformed or foreign references fail explicitly. This is the analysis-side retrieval boundary; acceptance creates amendments through Milestone 5, while full Memory screens remain later work.

### Model budgets and optional controls

- `AI_CONTEXT_TOKENS` defaults to 32768; `AI_MAX_OUTPUT_TOKENS` defaults to 6000 (allowed 256–8192). Configure them within the actual endpoint/model limits. Input is budgeted conservatively by UTF-8 bytes, with 1024 reserved for message framing plus the output allowance. This is not an exact model tokenizer; it may reject text that could otherwise fit. Full sources and repair messages are never truncated to fit.
- `AI_REQUEST_TIMEOUT_MS` defaults to 30000 and cannot exceed 90000. Analysis plus its one repair is bounded by 120 seconds. Truncated model responses are rejected. Repeated invalid structured responses return `AI_OUTPUT_INVALID`, never fixture output.
- `AI_THINKING=default` sends no model-template control. `false` or `true` sends `chat_template_kwargs.enable_thinking`. Featherless documents this extension; other compatible endpoints may not support it. `AI_REASONING_EFFORT=default` omits the option; supported explicit values are low, medium, high, xhigh and max. Choose only a value supported by the selected model. Unsupported controls can be ignored or rejected upstream.
- Changing provider/model/controls requires only server environment changes and an application restart. It does not rewrite saved originals. Reasoning text returned separately by providers is discarded and never persisted or shown. Native schema mode is still opt-in and must be separately verified.
- `AI_TEMPERATURE=0` requests greedy sampling for less variation in scope classifications, as documented by [Featherless](https://featherless.ai/docs/completions). The application accepts 0–2 or `default` to omit the control for other endpoints/models. Missing configuration also omits it. Lower randomness does not establish correctness; strict validation and human review still apply. The example environment and verified local configuration use zero.

### Reproduce analysis verification

`npm test` runs offline unit tests; live evaluations are skipped by default. `npm run test:e2e` starts a test-only HTTP provider from `tests/support` and the real production app against the isolated test database. The fake endpoint/key/model are explicitly passed to this test process; the application has no test switch, fixed-answer branch or fallback. `npm run test:runtime` checks persisted analysis after actual application restarts plus missing-AI/auth configuration and database outage.

`npm run test:live` explicitly sends the 25 synthetic cases in `tests/evaluation/scope-cases.ts` to the real configured provider. It can consume provider usage. Classifications and expected evidence are labelled; no universal effort values are prescribed. Results are written incrementally to ignored `.local/evaluation/milestone-4-live.json`. For one case, use `npm run test:live -- -t 20-mixed`. `npm run test:live-browser` sends a synthetic mixed request through analysis, review, sharing and client acceptance, then analyzes another request against the accepted scope using the real provider on port 3300, retaining data only in the isolated test database. Screenshots remain ignored. Do not run database-mutating verification suites concurrently.

## Milestone 4 — review and request billing

The Milestone 4 pricing contract is in [docs/milestone-4.md](docs/milestone-4.md). New AI/API/UI classification values are exactly IN_SCOPE, MODIFICATION, NEW_FEATURE and UNCERTAIN. The storage compatibility reader translates old names without altering immutable historical data. AI remains responsible only for suggested scope/effort; it never supplies authoritative prices or fixed charges.

Open a saved analysis, choose **Edit review**, and review the task titles, classifications, evidence, minimum/likely/maximum quarter-hours, assumptions, questions, risks and explanations. Add/remove tasks within the existing 1–20 task limit. A recorded reason is required for classification changes or task removals. The existing hourly rate can be edited. A single optional fixed additional charge applies to the request, not each task, and requires a client-facing reason when nonzero.

The shared pure calculator sums integer quarter-hours for MODIFICATION and NEW_FEATURE tasks. For each scenario, labor paise = (quarterHours × hourlyRatePaise + 2) / 4 using integer division; total paise = labor paise + fixed charge. Rounding happens once per aggregate scenario. INR inputs accept at most two decimals. Rate stays above zero and at most INR 100,000/hour; task hours remain 0–200 in 0.25 increments. Charges must be nonnegative safe integers, and combined totals exceeding the safe serialization limit are rejected. IN_SCOPE tasks have zero additional hours; an all-IN_SCOPE request cannot carry a fixed charge. UNCERTAIN work is excluded from provisional totals and blocks approval.

**Save review** inserts an immutable revision. Confirm the single scope/evidence/assumptions/hours/price checkbox, then **Approve estimate** pins that exact saved revision and its server-calculated totals. Unsaved edits, invalid evidence, uncertainty, stale revision and changed project scope block approval. **Reopen Review** preserves prior approval events and unlocks internal editing while no active or finalized offer exists. Approval is internal; it does not record client acceptance or send anything.

Workspace endpoints: PUT /api/estimates/:id/review accepts {expectedRevision,draft,editReason}; POST /approve accepts {expectedRevision,reviewed:true}; POST /reopen accepts {expectedRevision}. Unknown fields including supplied totals are rejected. The review JSON body limit is 512,000 bytes. Writes and audits are atomic and serialized against project scope changes. GET /api/estimates/:id includes the current review, original analysis, chronological revisions and approval history.

The Requests page includes numbered **Request History**, a separate **Additional Requests** list and a **Billing summary**. Stable numbers are allocated under a project lock; existing requests receive chronological numbers in migration 004. Summaries come from request descriptions, not invented AI text. All requests are counted exactly once; individual tasks are never requests. There is no application request-count limit or pagination.

Additional Requests includes reviewed, resolved requests with positive billable hours or a positive fixed charge, regardless of acceptance outcome. Pending billing excludes unreviewed/uncertain, declined, revoked, expired and stale requests. Accepted billing reads the accepted snapshot; other totals read the current saved revision. Project-level aggregate paise are returned as decimal strings to preserve precision across many requests. Client status is separate from internal review status: unshared records show NOT_ACCEPTED, not a fabricated acceptance. Client decision routes are not implemented yet; accepted/declined aggregation is tested with isolated database fixtures. GET /api/projects/:id/history provides this project-scoped view.

Changing a shared pending offer invalidates it and requires a newly saved revision and freelancer reapproval before another offer can be accepted. Accepted amounts remain traceable, and acceptance never prevents new requests. No payments, invoices, taxes, discounts, timers, subscriptions, buffers or timeline pricing are included.

See [the Milestone 4 report](docs/milestone-4.md) for observed checks and limitations.

## Milestone 5 — client requests, offers and decisions

After confirming a baseline, open Requests and create a **Client request link**. Copy and share it manually. Clients submit text only (10–4,000 characters); the server assigns the project and request number. Set the missing hourly rate in Request History before analysis. The link permits submission and a receipt, not access to requests or internal records. It accepts ten new submissions per ten-minute window; identical retries do not create duplicate requests.

In **Edit review**, write explicit client-facing agreement terms for each MODIFICATION or NEW_FEATURE task and identify which existing scope a modification changes. State the resulting deliverable, such as eight pages, instead of only three additional pages. Select a whole accepted amendment for replacement only when intended, and restate any retained terms. Save, review and approve the exact revision, then **Generate client offer**. The public offer shows only approved tasks, evidence, assumptions, agreement terms and calculated price ranges, including the fixed charge once per scenario.

Clients explicitly confirm and Accept or Decline, optionally with a comment of up to 500 characters. Acceptance records the frozen agreement and budget range; it does not charge anyone. The decision, amendment, scope counter, offer status and audit commit together. Duplicate decisions return the saved outcome and original comment; conflicting decisions fail. Decline leaves scope and accepted billing unchanged. IN_SCOPE-only acceptance has zero additional price and makes no artificial scope amendment. Future analyses retrieve applicable accepted amendments.

Use **Revoke offer and edit** to correct a pending offer. Revocation clears approval immediately and preserves the old offer. Save a new revision and approve it before generating its replacement. Accepted and declined offers are final; create a new request for further negotiated work. Stale offers require a new analysis against current scope. Request History counts each request once, retains old offers and accepted billing, and excludes obsolete offers from pending totals. Replacing scope does not erase prior accepted billing.

Links contain a 32-byte random secret in the URL fragment (`#token=…`). Only its SHA-256 hash is stored. Browser API calls send the secret in Authorization headers to token-free paths; client pages use no-store and no-referrer, and do not store tokens in local/session storage. Keep the complete link private: possession grants access, not verified identity. Configure `CLIENT_INTAKE_LINK_DAYS` (default 30) and `PROPOSAL_LINK_DAYS` (default 7), each an integer from 1 to 90; restart after environment changes. Rotate or revoke access explicitly. Finalized offers cannot be rotated, and expired links cannot authorize decisions.

Raw links are returned once and are not recoverable from the database. If a response is lost, retry safely with the same idempotency key, then rotate access to obtain a fresh link if needed. Reusing a key with different inputs returns a conflict. Share links manually; there are no automatic notifications, accounts or payments.

Migration `202609040005_client_workflow` upgrades Milestone 4 in place and also applies on a fresh database. Run `npm run db:migrate` and rebuild after updating. Historical originals and revision formats remain readable; older reviews without agreement terms require an explicit new save/approval before sharing. See [the Milestone 5 report](docs/milestone-5.md) for verification and limitations.
