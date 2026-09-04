# Coding-agent instructions — standalone Scope Change Estimator

> Milestone 7 + email-delivery amendment (September 5, 2026): approved proposals are emailed to a validated, normalized client address via a provider-neutral, server-only email adapter (business logic and UI never import a provider SDK). The manual copy-link flow is removed from the freelancer UI; the account-free token portal is unchanged. Persist delivery consistently outside the DB transaction, mark SENT only on provider confirmation, preserve the offer and expose Resend/Retry on failure, make send/resend idempotent, rotate to a valid token on resend, and never store the raw token or log credentials/tokens/full URLs. Missing config returns `EMAIL_NOT_CONFIGURED`; outages return a safe retryable error; never fake success or use a runtime fixture. Milestone 7 adds the read-only, project-scoped Project AI Chatbot: application-owned Prisma retrieval (no model SQL/tools/embeddings), server-validated citations (exact substrings, server-owned navigation URLs), one bounded repair, explicit insufficient-evidence and `CONTEXT_TOO_LARGE`, a deterministic complete Show All Decisions, and no chat mutations. Preserve accepted/declined/pending/expired/revoked/superseded authority; never infer authority from recency. See `docs/milestone-7.md`. Supersedes older manual-share text and "chatbot remains Milestone 7". `abrar-dev`-only; no deployment.

> Milestone 6 implementation amendment (September 5, 2026): `docs/milestone-6.md` is implemented as a read-only, account-scoped Project Memory list and immutable finalized-decision detail. Preserve authoritative accepted/declined/superseded/pending distinctions, complete search without pagination, frozen prices, revision history and server-resolved evidence links. The Ask Project Memory chatbot remains Milestone 7.

> User-account amendment (September 4, 2026): before Milestone 6, replace the shared configured password with email/password registration and login. Every project and all related records belong to the individual signed-in user. The first registered account claims preserved projects from the pre-account installation. This explicit user request supersedes the older “no signup/complex roles” and single-freelancer access text. Do not add roles, sharing, email verification or password reset unless separately requested.

> Milestone 5 implementation amendment (September 4, 2026): the user requested implementation of `docs/milestone-5.md`. Its client intake, explicit saved agreement terms, offer history, atomic acceptance/decline and pending-offer correction flow supersede conflicting older milestone text. A revoked offer requires a new saved revision and approval before replacement. Preserve the Milestone 4 pricing contract and the `abrar-dev`-only branch/push instruction; no deployment.

> Milestone 4 user amendment (September 4, 2026): `docs/milestone-4.md` supersedes conflicting older text below. Use IN_SCOPE / MODIFICATION / NEW_FEATURE / UNCERTAIN in new inputs and UI while preserving immutable historical originals. Retain minimum/likely/maximum ranges. Permit one optional fixed additional charge per request with a required client-facing reason, added once per scenario. Include Request History, Additional Requests and stored billing summaries. Client submission/acceptance remains Milestone 5; edits to a shared pending offer must invalidate it and require reapproval. Latest branch instruction (September 4, 2026): complete Milestone 4 and all future work directly on `abrar-dev`, test, commit and push only to `origin/abrar-dev`. Do not create or push separate milestone/feature branches. This supersedes earlier branch instructions; no deployment.

## Source of truth
Read SPEC.md and TASKS.md before implementing. Follow the latest explicit user instructions if they supersede these files. This handoff is for a new standalone repository. Do not import the main Memovix portal, reuse its database/session assumptions, or modify that portal to implement this MVP. If working in a handoff folder within the old repository, first move/copy this pack to the user-selected new project folder; do not silently scaffold into the old project root.

## Scope discipline
Build the complete approved workflow before polish. Do not add confidence labels/scores, expenses, risk buffers, timeline impact, pagination, full baseline versioning, demo mode, fixed AI answers, historical similarity, OCR, embeddings/vector storage, payments, automatic messages, signup or complex roles. Test fixtures stay in tests/evaluation. No runtime fixture fallback, including on missing API credentials.

## Architecture
- Next.js/TypeScript, Tailwind, Zod, PostgreSQL/Prisma.
- Featherless initially powers both AI services using one configurable server-only adapter. Compatible providers switch by environment configuration; incompatible APIs require a small new adapter only.
- UI and business logic must not import a provider SDK. Keep prompts, schemas, source retrieval, calculator and provider transport separate.
- AI_API_KEY holds the actual provider key. Never hard-code model IDs or secrets. Native JSON-schema capability must be verified, not inferred from API compatibility.
- Do not stop implementation because live credentials/plan permission are pending. Finish offline work, preserve real error behavior, and accurately report untested live calls. Never purchase plans or change account access without user authorization.

## Correctness
- AI proposes classifications and effort; the backend controls finances, scope authority, validation and authorization.
- Use shared pure quarter-hour/integer-paise pricing with aggregate rounding.
- Preserve AI originals and immutable human revisions. Approve the exact saved revision. Never silently overwrite history or mutate a generated proposal.
- Effective scope is the original baseline plus applicable accepted amendments. Preserve superseded records and explicit replacement links. A later draft is not an agreement.
- Acceptance must be atomic and idempotent, with stale scope/revision checks. Client request bodies never supply authoritative prices.
- Uncertain tasks block approval. No elaborate confidence/question acknowledgement subsystem.
- Source IDs and quotes must exist and belong to the selected project. No invented clauses, URLs, reasons, or claims that an unstated feature was explicitly excluded.
- Chat is read-only, evidence-backed and project-scoped. Use application-owned retrieval; no generated SQL or model tool actions. Do not silently omit records when asked for all decisions.

## Credentials and boundaries
- Keep secrets server-side in ignored environment files or deployment secret settings. Commit only placeholders in .env.example.
- Use a maintained password/session library, hash configured passwords, secure cookies and validate mutation origins.
- Hash expiring client tokens, redact token-bearing URLs, and never expose internal drafts through public proposal APIs.
- Treat files, requests, retrieved memory and AI text as untrusted data. Render escaped text.
- Do not log keys, raw bearer tokens, hidden chain-of-thought or entire confidential prompts.

## Collaboration and delivery
- Establish shared contracts and migrations before parallel feature work. Coordinate changes to schema, package lockfile and shared types.
- Complete all milestones and future work directly on `abrar-dev`, test, commit with a clear milestone message and push only to `origin/abrar-dev`. Do not create, switch to or push a separate milestone/feature branch. Earlier milestone branch instructions are superseded by the user's September 4, 2026 correction. Keep commits small and coherent; preserve existing history and never force-push other contributors' work. Deployment still requires a separate user request.
- Test high-risk boundaries: pricing, evidence, access, immutable revisions, transactional decisions and retrieval. Avoid redundant tests that merely mirror trivial UI implementation.
- Provide migrations and a reproducible setup README. Do not commit databases, uploads, .env files, build outputs or dependency directories.
- A task is complete only when its acceptance checks pass. Report what changed, what was tested and concrete limitations. Never claim live AI, deployment or evaluation succeeded without observing it.
