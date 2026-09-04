# Memovix Scope Change Estimator — Final MVP specification

> Milestone 5 implementation amendment (September 4, 2026): the user requested implementation of `docs/milestone-5.md`. Its client intake, explicit saved agreement terms, offer history, atomic acceptance/decline and pending-offer correction flow supersede conflicting older milestone text. A revoked offer requires a new saved revision and approval before replacement. Preserve the Milestone 4 pricing contract and the `abrar-dev`-only branch/push instruction; no deployment.

> Milestone 4 user amendment (September 4, 2026): `docs/milestone-4.md` supersedes conflicting older text below. Use IN_SCOPE / MODIFICATION / NEW_FEATURE / UNCERTAIN in new inputs and UI while preserving immutable historical originals. Retain minimum/likely/maximum ranges. Permit one optional fixed additional charge per request with a required client-facing reason, added once per scenario. Include Request History, Additional Requests and stored billing summaries. Client submission/acceptance remains Milestone 5; edits to a shared pending offer must invalidate it and require reapproval. Latest branch instruction (September 4, 2026): complete Milestone 4 and all future work directly on `abrar-dev`, test, commit and push only to `origin/abrar-dev`. Do not create or push separate milestone/feature branches. This supersedes earlier branch instructions; no deployment.

Status: implementation handoff, not an implemented application.
Planning budget: 24-hour hackathon, four people. This document supersedes earlier Word/PDF plans for the estimator. It defines a standalone project, independent of the larger Memovix portal.

## 1. Outcome and boundaries

Deliver this real, persistent flow:

Confirmed baseline → client request entered by freelancer → live AI comparison → additional effort range → deterministic price → freelancer review → approved client proposal → client acceptance/decline → Project Memory → evidence-backed project chat.

Use Next.js/TypeScript for UI and server routes, Tailwind CSS, Zod, PostgreSQL and Prisma. PostgreSQL is an RDBMS; JSONB snapshots are stored within related relational records. No separate vector database is required.

Initial provider: Featherless. Both scope analysis and chat use the same provider configuration and a small shared adapter. The actual model is configurable and must be verified against the account before live testing. No specific model is assumed.

No confidence scores or labels, external expenses, risk buffer, timeline estimates, baseline_versions table, pagination, seeded-demo mode, precomputed runtime AI answers, historical-task similarity, OCR, payments, automatic messaging, e-signatures, signup, complex roles, or portal integration. No persistent chatbot conversation history is required. Test fixtures are permitted only in tests/evaluation, never as runtime fallbacks.

## 2. Users and access

- One freelancer uses a password-protected workspace. Configure a password hash and session secret server-side. No registration.
- Use a maintained password-hashing/session implementation. Session cookies are HttpOnly, Secure in production, and SameSite. Reject cross-origin cookie-authenticated mutations and rate-limit login attempts. Do not implement custom cryptography.
- All workspace/project APIs require the freelancer session. All project records are scoped to the selected project, even in this single-freelancer MVP.
- Clients have no accounts. A secure proposal link permits reading and deciding only that proposal. This is bearer-link access, not verified client identity or an electronic signature.
- Generate a cryptographically random token of at least 32 bytes, store only its hash, set an expiry, and support revocation. Return the raw link once after generation; rotating a lost link revokes the previous token. Redact tokens from logs and use Referrer-Policy: no-referrer on client pages.
- Never send a message or charge a client. The freelancer manually shares the link.

## 3. Exact user flow

1. Freelancer logs in, creates a named project, and opens its workspace.
2. Paste agreed requirements or upload one text-based PDF, DOCX, or UTF-8 TXT file, at most 5 MB. Extract on the server using maintained parsers, check content/file type, and discard temporary source files after extraction. Store confirmed text rather than requiring permanent upload storage. No OCR: unreadable/scanned documents receive a paste-text instruction.
3. Preview/edit extracted text and clause boundaries. Confirmation requires at least one concrete deliverable and nonempty unique clause IDs. Record who confirmed it and when; confirmation is the freelancer's assertion, not independent proof of agreement.
4. Save one immutable original baseline. There is no baseline-version editor. If the original baseline was entered incorrectly, create a new project for this MVP. Subsequent changes use proposals and decisions.
5. Enter the new client request and hourly rate (INR). Submit and click Analyze Request. Submission and analysis are separate actions.
6. Server loads the original baseline plus all applicable accepted changes. It calls live AI, validates the output and citations, calculates totals, and saves the original estimate plus the initial editable revision.
7. Freelancer views each task, classification, matching clauses, exact evidence, hour range, assumptions, risks, complexity, questions and explanation. No confidence field exists.
8. Freelancer edits/adds/removes tasks, classifications, hours or assumptions. Costs recalculate immediately. Saving creates a revision; original AI data remains unchanged. Record a short reason for classification changes or task removal.
9. Freelancer resolves any task still classified uncertain and checks one review confirmation covering scope, evidence, assumptions, hours and price. Do not build a question-by-question acknowledgement system. Important unanswered questions should be resolved or converted to explicit proposal assumptions during this review.
10. Approve freezes the exact saved revision and server-calculated totals. Unsaved/invalid edits and uncertain tasks prevent approval. Approval does not expose anything to the client.
11. Generate an immutable client proposal and secure link. Freelancer manually shares it. A correction after generation requires a new request/proposal; revoke the old pending proposal.
12. Client opens the link and reads only approved content. Accept and Decline require explicit confirmation and allow an optional comment. GET requests never record a decision.
13. Acceptance atomically saves the accepted decision, any scope amendment, and project scope revision counter. Decline saves history without changing effective scope. Repeated same-decision requests return the stored result; conflicting decisions are rejected.
14. Freelancer opens Project Memory to read/search all records, inspect revisions, or ask the project chatbot.

## 4. Screens

### Login and project list
Password input, login errors, logout, project names and Create Project. No account-management screens.

### Project workspace and baseline
Project name, Baseline, Requests, Project Memory and Ask Project Memory navigation. Intake includes upload/paste, extraction status, editable text/clause preview and Confirm Baseline. Show confirmed source text read-only afterward.

### Request and estimate review
Request text; Analyze action; task cards/table; per-task classification, evidence, editable quarter-hour minimum/likely/maximum values, assumptions, questions, risks and explanation. Desktop has task area plus summary; mobile stacks readable cards without forced horizontal scrolling. Save, Approve and Generate Link are separate actions.

Show origin labels: AI-generated, Human-edited and Human-approved. Money is labelled calculated from reviewed inputs, not AI-generated. Show incomplete/provisional totals if uncertain tasks exist. Do not present exclusions of uncertain work as a complete zero quote.

### Client proposal
Single-column responsive view: requested change, matched clauses, approved tasks, additional hours and costs (minimum/likely/maximum), hourly rate and assumptions. No timeline, expenses, buffer, internal drafts or confidence. State that prices and hours are estimates; acceptance permits the described scope and estimated budget range, never an automatic charge. Expected work beyond the upper range or changed assumptions requires a new approval. Show result after decision, with actions disabled.

### Project Memory and details
Searchable complete list, without pagination, filtered by pending/accepted/declined/superseded as appropriate. Pending items come from proposals, not fabricated finalized decisions. Detail view has source links and chronological human revisions. Accepted decisions show exactly which earlier accepted decision, if any, they supersede.

### Project chatbot
Freelancer-only, within one selected project. Question input, loading/error, answer, clickable evidence and a direct Show All Decisions action. Chat need not survive refresh. Persistent project records do survive refresh/restart. Support keyboard use, labelled fields, visible validation and accessible mobile actions.

## 5. Scope and evidence semantics

Task classifications:
- covered: included within agreed limits; additional hours must be 0/0/0.
- modifies_existing: changes agreed quantity/behavior; estimate incremental effort only.
- out_of_scope: new or explicitly excluded work.
- uncertain: evidence insufficient; provisional range may be shown but approval is blocked until freelancer corrects it.

Overall classification is derived: uncertain first, otherwise out_of_scope, otherwise modifies_existing, otherwise covered. Mixed requests retain individual labels. Overall classification cannot be independently edited.

Absence is not an explicit exclusion. A closest clause may be cited as context with an explanation of the gap; use null matching clause when there is no relevant clause. Never claim a clause says 'web only' unless it actually does. Defects restoring agreed behavior are not automatically extra scope.

Evidence identifies project, source type, source ID and exact quote. Sources may be original baseline clauses or accepted amendment clauses for scope analysis; chatbot sources may additionally include requests, revisions, approved proposals and client comments. Server checks source membership, existence and quote substrings. It supplies displayed source text from the database. Render strings as text, never raw HTML.

## 6. Provider-independent AI boundary

Environment configuration: AI_PROVIDER, AI_BASE_URL, AI_MODEL, AI_API_KEY. Start with featherless and https://api.featherless.ai/v1. The generic AI_API_KEY contains the Featherless key. No OpenAI account/key is required merely because the API format is compatible.

Create one server-only adapter interface:

```ts
interface AIProvider {
  generate(input: {
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    maxOutputTokens: number;
    responseSchema?: unknown;
    signal: AbortSignal;
  }): Promise<{ text: string; model: string; provider: string }>;
}
```

One OpenAI-compatible adapter serves Featherless and compatible alternative endpoints. A non-compatible provider needs only a new adapter and registry entry. Do not build multiple providers, automatic failover or provider-selection UI now. Business services, database records and UI never import provider SDKs directly. A provider swap preserves the application contract but does not promise equivalent answer quality.

Separate shared scope/chat prompts from adapter code. Use native structured-output options only after verifying support for the configured endpoint/model; otherwise request JSON and validate it identically. Provider compatibility alone does not guarantee strict schema support.

Send policy as system instructions; scope, requests and retrieved records are JSON data, never executable instructions. No model tool execution or direct database access. The backend controls retrieval. Both features use the same configured provider/model.

Validate all responses with Zod, then semantic source checks. Allow one repair call for malformed JSON or invalid citations within a bounded deadline; otherwise return an error. Never show invented success, hide failures or substitute fixture data. Save provider/model, prompt version and pinned input identifiers with successful results. Do not persist hidden chain-of-thought; preserve the returned structured estimate and user-facing explanations.

Featherless account access must permit application/API traffic. The shared reference notes that standard Chat subscriptions exclude this usage; do not label the integration free or assume a subscription exception. Account eligibility is an operational prerequisite for live verification, not a reason to stop implementing the provider-neutral application.

## 7. Analysis output contract

Implement this as a strict runtime schema, rejecting unexpected financial/confidence/timeline fields:

```ts
type Hours = { minimum: number; likely: number; maximum: number };
type Evidence = {
  sourceType: 'baseline_clause' | 'accepted_change_clause';
  sourceId: string;
  quote: string;
};
type AnalysisOutput = {
  schemaVersion: 1;
  tasks: {
    id: string;
    title: string;
    classification: 'covered' | 'modifies_existing' | 'out_of_scope' | 'uncertain';
    matchedScopeClause: null | {
      sourceType: Evidence['sourceType'];
      sourceId: string;
      relation: 'inclusion' | 'exclusion' | 'limit' | 'context';
    };
    sourceEvidence: Evidence[];
    estimatedHours: Hours;
    assumptions: string[];
    complexity: string;
    risks: string[];
    missingInformation: string[];
    explanation: string;
  }[];
  explanation: string;
};
```

Require 1–20 uniquely identified tasks. Hours are nonnegative quarter-hour multiples, each at most 200, ordered minimum ≤ likely ≤ maximum. Cap individual text fields and arrays consistently on server and client. Requests are 10–4,000 trimmed characters. Original baseline is at most 12,000 characters and 40 clauses. Reject oversize input explicitly, never silently truncate scope evidence. Detect no usable baseline before making an AI call. Semantically ambiguous baselines must produce uncertainty rather than invented scope.

Server-enriched estimate responses add overall classification, summed hours, hourlyRatePaise, calculatedCostsPaise, status, saved revision and provenance. AI never supplies authoritative money or approval metadata.

## 8. Deterministic pricing

Currency: INR only. No tax/invoicing logic. Store rate and cost in integer paise and effort in integer quarter-hours at calculation boundaries. Rate must be positive and at most INR 100,000/hour. Accept at most two rate decimals.

For each scenario s:

```text
Q[s] = sum of quarter-hours of modifies_existing and out_of_scope tasks
AdditionalHours[s] = Q[s] / 4
CostPaise[s] = roundHalfUp(Q[s] * HourlyRatePaise / 4)
```

Use integer arithmetic (BigInt internally if needed; serialize safe integer results, not BigInt). Round once at aggregate total, not per task. Browser and server import the same pure calculator. Server ignores/rejects client-supplied totals and recalculates from validated inputs. Uncertain tasks are excluded from these provisional totals and prevent approval. Covered-only requests may be approved at zero extra cost.

Example for calculation tests only: 2/3/4 hours at INR 1,000/hour equals INR 2,000/3,000/4,000. This is not a prescribed model output or runtime demo.

## 9. Relational data model

Use UUID primary keys, UTC timestamps, foreign keys and validated schema-versioned JSONB snapshots. Implement these models (names may follow Prisma conventions without changing meaning):

| Model | Main fields and relationships |
|---|---|
| Project | id, name, scopeRevision integer default 0, createdAt |
| Baseline | id, projectId UNIQUE, text, clausesJson, contentHash, confirmedAt, confirmedBy |
| ChangeRequest | id, projectId, text, basedOnScopeRevision, supersedesDecisionId nullable, createdAt |
| Estimate | id, requestId UNIQUE, originalAiJson immutable, originalInputJson, originalCalculatedJson, provider, model, promptVersion, currentRevision, status, approvedRevisionId nullable |
| EstimateRevision | id, estimateId, revision, snapshotJson, editReason, createdBy, createdAt; UNIQUE(estimateId, revision) |
| Proposal | id, projectId, estimateId UNIQUE, approvedRevisionId, snapshotJson immutable, basedOnScopeRevision, status, tokenHash UNIQUE nullable, expiresAt, revokedAt nullable, decidedAt nullable, decisionComment nullable |
| ProjectDecision | id, projectId, proposalId UNIQUE, outcome ACCEPTED/DECLINED, title, tagsJson, finalDecisionText, sourceReferencesJson, approvedSnapshotJson, amendmentClausesJson, supersedesDecisionId nullable, scopeRevisionAfter, decidedAt |
| AuditEvent | id, projectId, entityType, entityId, action, actorType, revisionId nullable, metadataJson, createdAt |

Estimate statuses: REVIEW_REQUIRED, APPROVED, PROPOSED. Proposal statuses: PENDING, ACCEPTED, DECLINED, REVOKED. A proposal's expiry is determined from time and does not erase historical decisions. An expired undecided link cannot accept/decline.

Each estimate revision is immutable. Saving inserts a revision and advances the pointer using expectedRevision. Approval pins that exact revision. Before proposal generation, Reopen Review can clear the current approval pointer while preserving prior approval audit events. After generation, corrections require a new request.

No baseline_versions table. Project.scopeRevision is a concurrency counter, not a replacement baseline document. It increments only when an accepted proposal changes effective scope. Store the originally analyzed effective scope in originalInputJson so historical evidence remains reproducible.

## 10. Effective scope and decision consistency

Effective scope = original baseline plus applicable accepted amendment clauses. An amendment stores stable IDs and amendsSourceIds, and overrides only its explicitly described deliverables/limits. Preserve all original text. Declined/pending/revoked proposals never change scope. Covered-only acceptance records a decision without adding artificial scope changes.

The freelancer may select one older accepted decision as superseded by the new proposal. It must belong to the same project, still be applicable, and be shown explicitly to the client. For this MVP, supersession replaces the whole selected amendment; the replacement must restate any terms that remain applicable. Never infer supersession merely from recency or similar words. Do not silently support partial supersession. Preserve the old record and derive its superseded display status from the accepted replacement.

On approve/generate, compare pinned scopeRevision to the current project counter. On acceptance, lock project/proposal within a transaction, recheck revision and token/expiry/state, insert the unique decision and amendments, advance the counter when needed, update proposal and write audit. Roll back all writes on failure. A stale proposal returns BASELINE_CHANGED and requires a new analysis/request against effective scope; do not silently merge it.

Use idempotency keys for analysis/generation/decisions and unique constraints as backstops. One successful analysis per request; failed attempts may be retried. Repeated same client decisions return the saved result. A different decision after finalization returns ALREADY_DECIDED. Concurrent revision saves return STALE_REVISION instead of overwriting.

## 11. Backend endpoints

Prefix /api. All endpoints except login and token-scoped client routes require the freelancer session. Validate resource/project relationships on every request.

| Method and route | Purpose |
|---|---|
| POST /auth/login | Verify configured password, establish session |
| POST /auth/logout | End session |
| GET /projects | List freelancer projects |
| POST /projects | Create project from name |
| GET /projects/:projectId | Project metadata and current scope counter |
| POST /projects/:projectId/baseline/extract | Multipart document → preview text/clauses; no confirmation |
| POST /projects/:projectId/baseline | Confirm original text and clauses once |
| GET /projects/:projectId/baseline | Original baseline plus applicable accepted amendments |
| POST /projects/:projectId/requests | Save request text and optional supersession target |
| GET /projects/:projectId/requests | Complete project request list |
| POST /requests/:requestId/analyze | Body: hourlyRatePaise; live analysis and initial revision |
| GET /estimates/:estimateId | Original, saved revisions, approval and derived totals |
| PUT /estimates/:estimateId/review | Body: expectedRevision, draft, editReason; insert revision |
| POST /estimates/:estimateId/approve | Body: expectedRevision, reviewed=true; freeze |
| POST /estimates/:estimateId/reopen | Reopen only before proposal exists |
| POST /estimates/:estimateId/proposal | Create approved snapshot and expiring link |
| POST /proposals/:proposalId/link | Rotate token for an eligible current pending proposal |
| POST /proposals/:proposalId/revoke | Revoke a pending proposal/link |
| GET /client/proposals/:token | Client-safe snapshot or expiry/revocation error |
| POST /client/proposals/:token/decision | Body: decision=accept/decline, confirmed=true, comment optional (max 500 chars) |
| GET /projects/:projectId/memory | All records; optional q and status; no pagination |
| GET /projects/:projectId/memory/:decisionId | Decision with authorized source/revision details |
| POST /projects/:projectId/chat | Body: question and optional bounded conversational context; answer/citations |

Chat returns {answer, citations:[{sourceType, sourceId, quote}], insufficientEvidence}. Cite only supplied sources; generate navigation URLs on the server, never trust AI-generated URLs. Proposal decision payloads cannot change approved amounts/tasks. No GET mutations. API errors use {error:{code,message,fields?,retryable}} without secrets or raw stack traces.

## 12. Read-only Project Memory chatbot

Retrieve in the backend from the selected project. Use PostgreSQL queries/text search; no embeddings or AI-generated SQL. The model receives bounded evidence records and statuses, and can only produce an answer/citations.

- 'What was the final decision about button placement?' → cite the applicable accepted decision, not the latest unapproved edit.
- 'What changed across revisions?' → retrieve saved before/after estimate snapshots in chronological order and compare them. Changes are not client agreements until accepted.
- 'Why did the price change?' → calculate differences deterministically and cite recorded edit reasons. If no reason is recorded, say so.
- 'Show all decisions' → display the complete database list directly, without summarizing away entries. Provide a deterministic UI action for this even if natural-language intent classification is imperfect.
- For uncertainty, missing evidence or conflicting accepted records without explicit supersession, state the gap/conflict and cite relevant records. Never choose authority solely by timestamp.
- Confidence, timeline and removed financial features must not reappear through chatbot-generated suggestions or UI fields.

Enforce a configured model input budget including prompt, retrieved context and reserved output tokens. Never silently truncate the full baseline for scope analysis. If effective scope is too large, return CONTEXT_TOO_LARGE. Chat can retrieve a relevant subset, but disclose that it is a subset for broad requests; when exhaustive history cannot fit, display all records directly and ask for a narrower question. No pagination and no false claims of completeness.

Validate citation IDs, quotes and project boundaries before returning an answer. No supported evidence → explicit insufficient-evidence response. Reject fabricated citations with at most one repair attempt. Provider errors preserve typed input and expose Retry. No database mutations, scope updates, approvals or outbound messaging from chat.

## 13. Required error states

- BASELINE_REQUIRED / BASELINE_INVALID (422): no model call; fix input.
- UNSUPPORTED_FILE / EXTRACTION_FAILED / INPUT_TOO_LARGE (422): explain paste-text alternative.
- AI_NOT_CONFIGURED (503): server operator setup error; no fake output.
- AI_UNAVAILABLE / AI_RATE_LIMITED / AI_TIMEOUT: retain input, bounded retry guidance.
- AI_OUTPUT_INVALID (502): invalid JSON, hours or sources after repair.
- INVALID_ESTIMATE / UNCERTAIN_TASKS (422): inline errors; approval blocked.
- STALE_REVISION / BASELINE_CHANGED (409): reload or create current-scope request.
- LINK_EXPIRED / LINK_REVOKED / ALREADY_DECIDED: clear client result, no mutation.
- DATABASE_ERROR: rollback decision writes, show retry.
- CONTEXT_TOO_LARGE: explicit input/context limit; no omitted scope masquerading as complete analysis.

Set per-session analysis/chat rate limits and bounded timeouts/output tokens. Financial history is freelancer-only; client routes serialize an explicit allowlist of fields. Never log credentials, raw tokens or entire sensitive prompts.

## 14. Acceptance and delivery

Deliver application code, Prisma migrations, .env.example, README, tests and evaluation data. No runtime sample projects/estimates or special demo switch. A developer may enter fictional baseline/request text manually for verification; estimates must still come from the live provider.

Required automated checks: calculator rounding and aggregation, covered work exclusion, invalid ranges/rates; AI schema/evidence validators; session/token access; immutable snapshots and revision conflicts; uncertain-task approval prevention; transactional acceptance/decline/idempotency; supersession/effective-scope behavior; chat citation/project isolation and insufficient evidence.

Provide at least 25 labelled scope-change evaluation examples: covered work, explicit exclusions, changed limits, mixed requests, vague requests, missing baseline, prompt injection, accepted amendments and superseded decisions. Label expected classifications and evidence, not 'correct' universal effort hours. Run live evaluation only with authorized API access, report actual results and configuration, and never fabricate passing scores.

Manually verify on desktop and mobile: baseline confirmation → real analysis → hour/rate edit with recalculation → save/approve → manual client link → accept → persisted memory → grounded chatbot answer. Separately verify decline, supersession, invalid/expired links and AI outage. Refresh/restart must retain database history. Report live checks as blocked if access is unavailable; still complete the application and offline tests.

README must explain setup, database/password initialization, provider/model configuration, credential handling, replacement-adapter contract, permission prerequisites, all limitations and exact verification steps. Clearly separate tested behavior from untested live integrations.
