# ScopeFree

A standalone workspace for keeping project agreements and scope changes connected. **Milestone 1: foundation and access** is implemented. The source documents describe the full intended application; they are not claims that all features are built.

Available now: password login/logout, a private project list, project creation, saved project overview, PostgreSQL persistence, shared Zod contracts and a server-only configurable AI transport. Baselines, requests, live analysis, review/pricing, client proposals, Project Memory and chatbot arrive in Milestones 2–8. Their navigation labels are inactive. There is no runtime demo or seeded project content.

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
- Initial migrations establish all specified relational models and additional session/throttling tables. Later milestone services will enforce immutable snapshots, source membership, cross-record project consistency, approvals and transactional decisions. These workflows are not implemented or verified yet. JSON contracts are schema-versioned; timestamps use timestamp-with-time-zone columns, and application database connections explicitly use UTC independent of the database host's timezone.
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

See [the Milestone 1 verification record](docs/milestone-1.md) for the observed results and limitations. The imported [SPEC.md](SPEC.md), [AGENTS.md](AGENTS.md) and [TASKS.md](TASKS.md) preserve the handoff; their full-project checkboxes intentionally remain unchecked.
