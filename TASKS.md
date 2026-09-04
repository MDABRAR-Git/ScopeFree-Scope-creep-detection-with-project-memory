# Implementation checklist — 24 hours, four members

> Milestone 6 implementation amendment (September 5, 2026): the read-only Project Memory list, complete search/status filters, immutable decision detail, offer history, supersession links, source navigation and revision comparisons are implemented per `docs/milestone-6.md`. The Project Memory chatbot remains Milestone 7.

> User-account amendment (September 4, 2026): before Milestone 6, implement email/password registration and login with user-owned, account-isolated projects. The first registered account claims preserved pre-account projects. This supersedes older shared-password/no-signup checklist text. Keep roles, sharing, email verification and password reset out of scope.

> Milestone 5 implementation amendment (September 4, 2026): the user requested implementation of `docs/milestone-5.md`. Its client intake, explicit saved agreement terms, offer history, atomic acceptance/decline and pending-offer correction flow supersede conflicting older milestone text. A revoked offer requires a new saved revision and approval before replacement. Preserve the Milestone 4 pricing contract and the `abrar-dev`-only branch/push instruction; no deployment.

> Milestone 4 user amendment (September 4, 2026): `docs/milestone-4.md` supersedes conflicting older text below. Use IN_SCOPE / MODIFICATION / NEW_FEATURE / UNCERTAIN in new inputs and UI while preserving immutable historical originals. Retain minimum/likely/maximum ranges. Permit one optional fixed additional charge per request with a required client-facing reason, added once per scenario. Include Request History, Additional Requests and stored billing summaries. Client submission/acceptance remains Milestone 5; edits to a shared pending offer must invalidate it and require reapproval. Latest branch instruction (September 4, 2026): complete Milestone 4 and all future work directly on `abrar-dev`, test, commit and push only to `origin/abrar-dev`. Do not create or push separate milestone/feature branches. This supersedes earlier branch instructions; no deployment.

SPEC.md is authoritative. Check boxes only after verifying the exit condition. This is an implementation plan, not evidence of completed work.

## Ownership and parallel work

| Owner | Primary responsibility | Coordinate with |
|---|---|---|
| Member 1 | Freelancer setup/intake/review UI, live calculator display | Member 2 for contracts; Member 3 for analysis states |
| Member 2 | Database, auth, APIs, calculator, revisions, transactional decisions | All members; owns migrations/shared server contracts |
| Member 3 | Provider adapter, analysis prompts/validation, chat retrieval/answer service, evals | Member 2 for source queries; Member 4 for chat UI |
| Member 4 | Client proposal UI, Memory/chat UI, integration/deployment coordination, README | Member 2 for decisions; Member 3 for citations |

One standalone repository. All work is coordinated directly on `abrar-dev` and pushed only to `origin/abrar-dev`; do not create or push separate milestone/feature branches. Review small coherent commits regularly and coordinate shared-file changes. Use fixed test fixtures against agreed schemas during development; the runtime must never offer seeded analysis. Another member reviews the integration coordinator's own changes.

## Phase 1 — Foundation and shared contracts (hours 0–2)
- [ ] Create the standalone repository/application, ignoring environment secrets and generated files.
- [ ] Read the specification; define shared task/evidence/revision/proposal/chat schemas and error codes.
- [ ] Establish PostgreSQL and initial Prisma migration with foreign keys and uniqueness constraints.
- [ ] Implement or scaffold server session boundary and provider factory; document configuration.
- [ ] Establish a minimal deployment target if available, without delaying local development.
- [ ] Verify available API model/access using authorized credentials; if unavailable, record the blocker and continue offline work.

Exit: application starts, database connects, migrations work, every member uses the same contracts. No unapproved feature assumptions.

## Phase 2 — Independent feature implementation (hours 2–7)
- [ ] Member 1: project list, baseline upload/paste/preview/confirmation and request intake.
- [ ] Member 2: password/session checks, project/baseline/request endpoints and data persistence.
- [ ] Member 2: pure price calculator plus rounding/range/covered-work tests.
- [ ] Member 3: Featherless/OpenAI-compatible transport with configurable model, timeout, errors and server-only key.
- [ ] Member 3: scope prompt, strict schema, source validation and one bounded repair attempt.
- [ ] Member 4: client proposal/decision screens and Memory/chat UI components against shared test contracts.

Exit: saved baseline/request can drive a real analysis when credentials are available; failures are honest. UI components work against contracts without runtime fallback answers.

## Phase 3 — Complete approval golden path (hours 7–12)
- [ ] Connect analysis to the real request and effective scope; persist original output and initial revision.
- [ ] Connect review editing, task removal reasons, live recalculation and immutable revision saves.
- [ ] Implement saved-revision approval, uncertain-task gate and reopen-before-proposal action.
- [ ] Generate immutable client-safe proposal and hashed expiring token.
- [ ] Implement confirmed accept/decline transaction and duplicate/stale request handling.
- [ ] Save accepted amendments and decisions; refresh proves persistence.

Exit: original baseline → live estimate → edited/approved snapshot → client link → accepted/declined saved decision. If live access is blocked, all other steps are tested with injected test doubles in automated tests only, and the UI shows a real configuration error.

## Phase 4 — Project Memory and chatbot (hours 12–17)
- [ ] Implement original baseline plus accepted amendments as effective scope.
- [ ] Implement optional explicit whole-decision supersession and preserved history.
- [x] Complete searchable Memory list and filters, with all results and no pagination.
- [x] Add decision details, source links, original AI and chronological human revision views.
- [ ] Implement read-only project-scoped retrieval and grounded answer generation through the same provider adapter.
- [ ] Validate citations and source quotes; generate links from server-owned identifiers.
- [ ] Add direct Show All Decisions database view; handle context limits without silent omission.
- [ ] Verify final/current decision versus pending/declined/superseded distinctions.

Exit: ask about an accepted change and obtain a cited answer; ask about a revision and see actual saved differences; ask an unsupported question and receive an evidence gap.

## Phase 5 — Verification and evaluation (hours 17–21)
- [ ] Test missing/meaningless baseline and unreadable/oversized uploads.
- [ ] Test unauthorized workspace reads, client field allowlist, token expiry/revocation and mutation protections.
- [ ] Test original preservation, revision conflicts, changed scope, repeated acceptance and rollback.
- [ ] Test no extra charge for covered work, quarter-hour rules, rounding and rate changes.
- [ ] Test malicious source instructions, invented citations and cross-project retrieval attempts.
- [ ] Test API authentication/rate-limit/timeout failures and invalid JSON without runtime substitutes.
- [ ] Create at least 25 labelled analysis evaluation examples with expected classifications/evidence and ambiguity cases.
- [ ] Run live evaluation only with permitted API access; record provider, model, prompt version and actual counts. Otherwise label it not run.
- [ ] Verify grounded chat against current, historical, declined and absent decisions.

Exit: no known incorrect totals, evidence fabrication, broken approval access or partial acceptance transactions. Unverified live behavior is explicitly identified.

## Phase 6 — Polish and handoff (hours 21–24)
- [ ] Freeze features; fix only issues affecting the agreed flow.
- [ ] Check desktop/mobile layouts, keyboard interaction and form errors.
- [ ] Complete README: setup, migration, password hash generation, environment setup, provider switch, limitations and verification.
- [ ] Verify fresh setup from committed files; secrets are supplied separately.
- [ ] Rehearse using manually entered fictional requirements and real API output; no predetermined effort/cost expectation.
- [ ] Refresh/restart and show persistent decision history and a cited chatbot response.
- [ ] State implemented, tested, blocked and deferred items accurately.

## Final acceptance checklist
- [ ] Standalone application; no dependency on the main Memovix portal.
- [ ] Featherless initially serves both scope analysis and chat through a replaceable adapter.
- [ ] No confidence, expenses, buffer, timeline, pagination, baseline_versions or demo mode.
- [ ] Hour/rate editing updates deterministic costs immediately and server totals agree.
- [ ] Human approval precedes client proposal generation.
- [ ] Account-free client decision access is token-scoped and expiring.
- [ ] Accepted changes affect future scope analysis; rejected changes do not.
- [ ] AI originals, human revisions, approved snapshots and client decisions are persisted.
- [ ] Chat answers cite real project evidence and cannot mutate records.
- [ ] Evaluation fixtures never appear as substitute live AI responses.
