# Milestone 7 — Email proposal delivery and the Project AI Chatbot

Date: September 5, 2026. Branch: `abrar-dev`. No deployment.

This milestone adds two things on top of Milestones 1–6: (1) an amendment that emails approved
proposals to a validated client address, replacing the manual copy-link flow; and (2) the read-only,
evidence-backed **Project AI Chatbot**. Milestones 1–6 behavior is preserved. The account-free client
proposal portal, token hashing/expiry/revocation and atomic acceptance are unchanged.

## 1. Email proposal delivery (supersedes manual link sharing)

### Flow

1. The freelancer approves an exact saved estimate revision (unchanged).
2. The approved-offer section requires a **Client email address**. It is validated and normalized
   (trimmed, lowercased) on both the client and the server (`clientEmailSchema`).
3. `POST /api/estimates/:estimateId/proposal` generates the existing frozen proposal snapshot and a
   secure expiring token, then emails the secure link to that address.
4. The UI shows delivery status: **Sending → Sent** (on provider confirmation) or **Failed** with a
   safe message and a **Resend / Retry** action. The manual copy-link control is removed.
5. The client opens the emailed link into the existing account-free portal and explicitly accepts or
   declines. Acceptance, scope-amendment and idempotency behavior are unchanged.

### Email configuration

Set these in `.env` (placeholders are in `.env.example`; never commit real secrets):

| Variable | Meaning |
|---|---|
| `EMAIL_PROVIDER` | `http-json` (the only adapter registered today). |
| `EMAIL_API_URL` | A transactional HTTP JSON endpoint that accepts `{ from, to, subject, html, text }` with a bearer key (e.g. `https://api.resend.com/emails`). HTTPS only (HTTP allowed only for localhost). |
| `EMAIL_API_KEY` | The provider API key. Server-only; never prefixed with `NEXT_PUBLIC_`. |
| `EMAIL_FROM` | The verified sender address. Your provider must have verified this sender/domain, or it will reject the send. |
| `EMAIL_REQUEST_TIMEOUT_MS` | Optional per-send deadline, 1000–90000 ms (default 15000). |
| `APP_ORIGIN` | The public application origin used to build the emailed link (existing variable). |

The adapter is provider-neutral and server-only (`src/server/email/provider.ts`), mirroring the AI
provider boundary: business logic and UI never import a provider SDK. A different provider needs only
a new adapter class and a registry entry.

### Reliability, retry and resend

- Delivery happens **outside** any database transaction. The immutable proposal and the delivery
  attempt are persisted first; delivery is marked **SENT only after** the provider confirms
  submission.
- On failure the approved proposal is preserved and marked **FAILED** with a safe failure
  category/message; the UI exposes **Resend**. Missing configuration returns `EMAIL_NOT_CONFIGURED`
  (503) before any proposal is created; provider outages/timeouts return a safe retryable
  `EMAIL_SEND_FAILED` (502). There is **no fake success and no runtime fixture fallback**.
- Send and resend are **idempotent**: a repeated click with the same idempotency key returns the
  saved result and does not create a second proposal or a second email.
- A **resend** rotates to a currently valid secure token (the previous raw token is unrecoverable),
  revoking the previous one via the existing rotation logic. A correction to a pending offer still
  revokes it and requires a new saved revision, a new approval and a newly emailed offer.
- The raw bearer token is **never stored** (only its SHA-256 hash) and credentials, tokens and full
  proposal URLs are **never logged**. The client email is immutable after creation (DB trigger).

### Email content and security

- Professional transactional template with one **Review proposal** CTA, the project name, a short
  explanation, link-expiration information and an explicit statement that opening the link does not
  accept the proposal. All project/user text is HTML-escaped. Full proposal detail and pricing stay
  behind the secure portal.
- Portal security is unchanged: client-safe allowlist only; `Referrer-Policy: no-referrer`; GET never
  records a decision; acceptance/decline require explicit confirmation; expired/revoked/superseded/
  already-decided links are handled clearly.

### Data model

Forward-only migration `202609050001_proposal_email_delivery` adds to `Proposal`: `clientEmail`
(normalized, nullable), `deliveryStatus` (`NONE|SENDING|SENT|FAILED`, default `NONE`),
`deliverySentAt`, `deliveryFailedAt`, `deliveryAttempts`, `deliveryFailureCategory`,
`deliveryFailureMessage`, `deliveryProviderMessageId`. Existing proposals remain readable (NULL email,
`NONE`). The `protect_offer` trigger is extended so the emailed destination cannot change after
creation while the delivery-status columns stay writable for a still-pending offer. Old immutable
snapshots, approved-revision references, scope checks, decisions and token hashes are untouched.

## 2. Project AI Chatbot (read-only, evidence-backed)

### Route and page

- Nav: the **Project AI Chatbot** rail entry is enabled; the page reuses the dual-sidebar workspace
  layout. No global or cross-project chat.
- `POST /api/projects/:projectId/chat` — authenticated, owner-scoped, CSRF-checked. Body:
  `{ question, context? }` (bounded, non-persistent). Returns the established chat contract:
  `{ answer, citations, insufficientEvidence }` plus a `subset` disclosure flag.
- `GET /api/projects/:projectId/chat` — the deterministic **Show All Decisions** list.

### Provider and retrieval

- Reuses the server-only AI provider factory/adapter; no provider SDK in frontend or business logic.
  Retrieval, prompts, response schema, citation validation and transport are separate. At most one
  bounded repair call. No runtime fixtures or fixed answers.
- Retrieval uses **application-owned PostgreSQL/Prisma queries only** over the authenticated user's
  selected project. The model never generates SQL and executes no tools; there are no embeddings and
  no vector database. Retrieved evidence: original baseline clauses, applicable accepted amendments,
  client requests, immutable saved revisions and edit reasons with deterministic price history,
  accepted/declined decisions, client comments and explicit supersession relationships. Accepted,
  declined, pending, expired, revoked and superseded distinctions are preserved; authority is never
  inferred from recency alone.

### Citation validation

- Every cited source id must exist and belong to the selected project, and every quote must be an
  **exact substring** of the saved source. Navigation URLs are generated from server-owned ids; the
  model's URLs are never trusted. Fabricated or cross-project citations are rejected and one repair is
  attempted; missing support yields an explicit insufficient-evidence answer.
- Price explanations use deterministic stored calculations and recorded edit reasons; when no reason
  was recorded, the answer says so.

### Show All Decisions and context limits

- **Show All Decisions** is a direct deterministic action that returns the complete database-backed
  decision list without AI intent detection, pagination or summarization.
- A configured total context budget (`AI_CONTEXT_TOKENS` / `AI_MAX_OUTPUT_TOKENS`) bounds prompts,
  evidence, conversation context and reserved output. When the full evidence does not fit, the least
  relevant non-authoritative records are trimmed and the answer is disclosed as a `subset`; if the
  core still overflows, chat returns `CONTEXT_TOO_LARGE` rather than silently omitting records.
- Chat **never mutates** any project record. Chat history is in-memory and need not survive refresh;
  persistent project records do.

## 3. Security boundaries (summary)

- Owner-scoped, session-authenticated, CSRF-protected mutations; token-scoped account-free portal.
- No provider SDK in UI/business logic; email and AI both go through server-only adapters.
- No raw tokens stored or logged; no credentials, tokens or full URLs in logs.
- No fabricated success; honest typed errors (`EMAIL_NOT_CONFIGURED`, `EMAIL_SEND_FAILED`,
  `AI_NOT_CONFIGURED`, `AI_UNAVAILABLE`, `AI_RATE_LIMITED`, `AI_TIMEOUT`, `AI_OUTPUT_INVALID`,
  `CONTEXT_TOO_LARGE`).
- Chat is strictly read-only and cannot change scope, offers, prices or decisions.

## 4. Tests actually run and results observed

Run locally against the isolated `_test` database with the injected test provider and injected test
email server (no real emails, no live AI):

- `npm run typecheck` — passed.
- `npm run lint` — passed (0 errors).
- `npm test` (Vitest) — passed (unit suite, including `tests/email.test.ts` and `tests/chat.test.ts`);
  25 tests remain intentionally skipped (live-only).
- `npm run build` — succeeded.
- `npm run test:e2e` (Playwright) — the email (`tests/e2e/proposal-email.spec.ts`), chat
  (`tests/e2e/chat.spec.ts`), client-workflow, memory, navigation-audit, intake, analysis, review and
  foundation suites pass. Under heavy concurrent machine load the first browser test can exceed the
  default 30 s timeout on cold start; it passes with adequate resources (verified at a 90 s cap). This
  is environmental slowness, not a code regression.
- `npm run test:runtime` — production-restart checks, now including that an approved proposal is
  emailed to the validated client address and the link is not returned to the freelancer.
- `npm run verify:repository` — repository hygiene (no secrets/generated files tracked, no conflict
  markers, clean merges).

Email delivery in automated tests uses an **injected test email adapter** (`tests/support/email-server.mjs`)
that records outbound messages so tests can read the emailed link and inject provider failures; no real
emails are sent. The chat tests use the injected AI provider.

## 5. Untested live integrations and known limitations

- **Live email delivery was not run.** No authorized email provider credentials or an approved test
  recipient were supplied, so a real send to a real inbox has not been observed. `EMAIL_FROM` must be
  a sender your provider has verified before live use. Only the injected adapter path is exercised.
- **Live AI chat was not run.** No authorized AI credentials were supplied, so live answer quality is
  not verified; only the deterministic injected-provider path is exercised. Live evaluation must use
  authorized access and report actual results.
- Chat context management uses relevance-based trimming with a subset disclosure; it does not do
  embedding-based ranking (by design). Very large projects return `CONTEXT_TOO_LARGE` and rely on
  Show All Decisions for completeness.
- No client accounts, passwords, roles or project sharing were added; the client email is a delivery
  destination, not a verified identity.
