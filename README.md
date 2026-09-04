# ScopeFree

A standalone workspace for keeping project agreements and scope changes connected. **Milestones 1–2: foundation, access, baseline and request intake** are implemented. The source documents describe the full intended application; they are not claims that all features are built.

Available now: password login/logout, private projects, original-agreement paste/upload and clause confirmation, saved client requests with INR hourly rates, PostgreSQL persistence, shared Zod contracts and a server-only configurable AI transport. Live analysis, review/pricing, client proposals, Project Memory and chatbot arrive in Milestones 3–8. Baseline and Requests navigation is active; Memory/chat remain inactive. There is no runtime demo or seeded project content.

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
- Migrations establish the relational models and session/throttling tables. Original baselines are now immutable at both service and database level. Later milestone services will enforce estimate/proposal snapshot immutability, evidence membership, approvals and transactional decisions. These later workflows are not implemented or verified yet. JSON contracts are schema-versioned; timestamps use timestamp-with-time-zone columns, and application database connections explicitly use UTC independent of the database host's timezone.
- API failures use `{error:{code,message,fields?,retryable}}` and `Cache-Control: no-store`. Raw provider/database errors, prompts, passwords, and session cookies are not included. Text is escaped by React. No public proposal/token API exists yet.

## AI configuration and replacement boundary

`src/server/ai/provider.ts` exports the shared `AIProvider.generate` contract. It is guarded by `server-only`; UI and business logic do not import a provider SDK. Both future AI features will use this factory.

Set `AI_PROVIDER=featherless`, `AI_BASE_URL=https://api.featherless.ai/v1`, `AI_MODEL` to a model your account can access and `AI_API_KEY` to the actual provider key. Do not prefix secrets with `NEXT_PUBLIC_`. Model and API access must be verified under your provider plan before live use; do not assume a chat subscription permits application/API traffic.

For another compatible endpoint, change the environment configuration and set `AI_PROVIDER=openai-compatible`. Incompatible APIs need a new implementation of the interface and a factory entry, without changes to UI/business contracts. No automatic failover or provider-selection UI exists.

Native JSON-schema output is off by default; enable `AI_NATIVE_JSON_SCHEMA=true` only after verifying the configured endpoint/model supports it. The adapter has a 30-second deadline, abort support, redirect rejection, bounded output and safe typed failures. Scope/chat prompts, source retrieval, response semantic validation and the one-repair flow are later milestones. No AI call is currently exposed in the application. Missing configuration throws `AI_NOT_CONFIGURED`; no runtime fixtures or substitutes exist. Current transport tests inject responses in tests only and do not prove live Featherless compatibility.

## Verification

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.

Browser/runtime verification uses a **separate disposable database whose name ends in `_test`**:

1. Create that database in PostgreSQL.
2. Create ignored `.env.test` with its `DATABASE_URL`, `APP_ORIGIN=http://localhost:3100`, a separate `SESSION_SECRET`, and a base64-encoded `FREELANCER_PASSWORD_HASH` from the hash helper plus matching plaintext `TEST_PASSWORD` for test login only. Do not use real credentials for automated tests.
3. Run `npx playwright install chromium`, then `npm run test:e2e`. The script applies migrations, launches the actual production build on port 3100, and checks access boundaries and desktop/mobile flows. It creates test projects and modifies session/throttle records in that test database only. Test screenshots are ignored under `test-results`.
4. Run `npm run test:runtime` for production restart persistence, absent auth configuration and database-outage checks. It uses port 3200 and the same test database. Do not run this simultaneously with browser tests.

Manual check: open the login page → enter a wrong password and inspect the error → log in → create a project → reload its overview → return to All projects → log out → open `/projects` and confirm login is required. Check at narrow/mobile width too. Stop/restart the application, log in again and confirm your project remains.

See the [Milestone 1](docs/milestone-1.md) and [Milestone 2](docs/milestone-2.md) verification records for observed results and limitations. The imported [SPEC.md](SPEC.md), [AGENTS.md](AGENTS.md) and [TASKS.md](TASKS.md) preserve the handoff; their full-project checkboxes intentionally remain unchecked.

## Baseline and request intake

Open a project → Baseline → paste the original agreement or choose one text-based PDF, DOCX or UTF-8 TXT (up to 5 MB). Extraction produces an editable preview only. Review the whole source, then choose **Review clauses**. You can edit clause text/IDs, add/remove clauses, merge adjacent clauses or return to the source editor. Paragraph splitting is deterministic and retains the entire text; it does not use AI. If there are more than 40 paragraphs, the complete source starts as one editable clause instead of dropping paragraphs.

Confirmation requires 1–40 clauses, at most 12,000 characters including separators, unique IDs, a concrete deliverable identified by you and one confirmation of the complete agreement. The basic usability check rejects empty/very short/repeated-word placeholders; it does not independently establish that the scope is meaningful or agreed. You remain responsible for reviewing the agreement. The complete confirmed text is reconstructed from the reviewed clauses, joined by blank lines, and is shown before saving. The content hash covers that text and the clause snapshot. Identity/time/hash/audit fields are supplied by the server.

The original baseline is saved once, with an audit record in the same transaction. Concurrent confirmation is serialized on the project. Further confirmations return `BASELINE_ALREADY_CONFIRMED` (409); database triggers also reject updates/deletions of the original. Corrections require a new project, as specified. Accepted-change scope amendments are a later milestone.

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
