# Milestone 1 — Foundation and access

Scope: the user's eight-milestone sequence takes precedence over the six phases in the supplied TASKS.md. This milestone establishes the standalone application, shared contracts/data model, password access, project list/create/detail, provider boundary and reproducible local setup. Baseline/request intake begins in Milestone 2. No push or deployment is authorized.

## Acceptance checks recorded before implementation

1. Install, lint, typecheck, production build and application startup succeed.
2. PostgreSQL connects, initial Prisma migration applies, and project records survive application restart.
3. Password login/logout, session tampering and expiry protection, login throttling and cross-origin mutation protection work.
4. Unauthenticated workspace/API access is rejected; project create/list/detail and validation work.
5. Login, project list and project workspace are inspected on desktop/mobile; fields are labelled and errors visible.
6. Shared contracts and a configurable, server-only AI boundary exist; missing credentials cause a real error without prepared answers.
7. Reproducible setup documentation and placeholder environment configuration exist; secrets/generated files are ignored.
8. Only this milestone's changes are committed locally.

## Verification record

Observed on 2026-09-04, Windows, Node 24.13.0, PostgreSQL 18, Next.js 16.3.4 and Prisma 7.10.0:

| Check | Observed result |
| --- | --- |
| Dependency installation | `npm install` completed; dependency lockfile and generated Prisma client created. |
| Lint and type checks | `npm run lint` and `npm run typecheck` passed without errors or warnings after fixes. |
| Unit checks | `npm test`: **15 passed** across strict contracts, password/session configuration and injected provider transport tests. No live AI was called. |
| Production compilation | `npm run build` passed; all nine listed routes generated/compiled. |
| Migrations | Initial migration applied to development and isolated test databases; reapplication reports no pending migration; `npm run db:status` reports up to date. |
| Database constraints | Actual PostgreSQL tests rejected a duplicate original baseline (unique constraint) and an orphan baseline (foreign key); test transaction rolled back. |
| Browser/API checks | `npm run test:e2e -- --reporter=line`: **7 passed** against the actual production server, including database constraints, unauthenticated access, cookie flags, tampering, server expiry, logout replay revocation, origin protection, concurrent throttling, input validation, persistence/audit and responsive project flows. |
| Runtime checks | `npm run test:runtime`: **3 passed**: project + valid session survived stopping/restarting the production app; missing password configuration returned `AUTH_NOT_CONFIGURED`/503; inaccessible database returned `DATABASE_ERROR`/503. |
| Screens | Visually inspected login, project list and project overview at 1440×1000 and 390×844 using actual browser screenshots. Creation, refresh, navigation, keyboard Enter submission, visible invalid-password feedback and logout exercised. Mobile overflow checks passed. |
| Clean workspace | Separately logged into the actual local development database, confirmed it contains zero projects, inspected desktop/mobile empty states, checked mobile overflow and logged out. Automated project fixtures remain only in the isolated test database. |
| Password helper | Executed the interactive hash helper with a disposable verification password; input was masked and the helper produced the env-safe encoded hash. |
| Credential boundary | Scanned all **15 production client assets**: none contained the actual configured database URL, password hash, session secret or test password. Git ignore checks confirmed `.env`, `.env.test`, `.local`, dependencies, generated client/builds and test results are excluded. |

Failures fixed before the passing run:

- An invalid test header type blocked type checking; a reused consumed mock response broke the provider-switch test. Corrected the tests.
- Next.js expanded dollar signs in raw Argon2 hashes. The hash helper now emits an env-safe base64-encoded Argon2id hash; configuration decodes it before maintained Argon2 verification.
- The PostgreSQL adapter assumed UTC while the local database used Asia/Calcutta. Explicit UTC session options now preserve actual eight-hour sessions, expiry checks and 15-minute throttle windows; the database tests verify these durations.
- A browser selector also matched Next.js's route-announcement alert. Narrowed it to the actual login error.

## Local verification steps

1. Follow README setup or use the already configured ignored `.env` in this checkout. A separately generated local workspace password is saved in `.local/workspace-password.txt`; it is not committed. Use the password helper to replace it with your own password when desired, then restart the app.
2. Open `http://localhost:3000` while `npm start` (after building) or `npm run dev` is running. The isolated PostgreSQL cluster must be running; use the Windows helper if needed.
3. Try a wrong password, then log in with the configured password.
4. Create a named project, refresh its overview, and return to All projects. Your project remains listed.
5. Log out, then navigate to `/projects`; login is required again.
6. Repeat at a narrow viewport. Restart the application and confirm the saved project remains after login.

## Limitations and deferred checks

- Milestones 2–8 are intentionally not implemented. The full imported TASKS.md checklist is not marked complete.
- No live Featherless credentials/model/account permission were supplied. Live AI, native JSON-schema capability, analysis, pricing, proposals/tokens/decisions, effective scope and chatbot behavior have not been verified. The current adapter has no runtime-facing AI action and never substitutes fixtures.
- Docker Compose setup is provided but was not tested because Docker did not start. Verification used the installed PostgreSQL server in an isolated project-local cluster.
- Chromium with desktop/mobile viewport sizes was tested. Physical mobile devices, Firefox, Safari and a comprehensive accessibility audit were not tested.
- A fresh checkout on another machine, deployed HTTPS behavior and full release verification are deferred to Milestone 8. Production Secure cookie flags were verified locally.
- The single-freelancer login limit is global; repeated successful logins also consume the ten-attempt/15-minute budget. This is documented in README.
- No push or deployment was performed. The milestone is checkpointed on `milestone-1-foundation`; obtain its commit with `git log -1 --oneline`.
