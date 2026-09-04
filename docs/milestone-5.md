# Milestone 5 plan — Client requests, offers and decisions

Status: proposed implementation plan, not implemented or verified. Prepared against `abrar-dev` at `bf2848e`. This document does not supersede approved requirements until the proposed choices are accepted. Implementation, tests, commits and pushes stay on `abrar-dev` / `origin/abrar-dev`. No deployment.

## Outcome and scope

Complete this flow: freelancer shares a project request link → client submits a request → freelancer sets the rate, analyzes, reviews and approves → freelancer generates and manually shares an offer → client explicitly accepts or declines → the decision, applicable scope changes and billing history persist.

Also support the existing freelancer-entered requests. Retain IN_SCOPE / MODIFICATION / NEW_FEATURE / UNCERTAIN, minimum/likely/maximum ranges, and one optional fixed request charge with its required client-facing reason. Internal approval and client acceptance remain separate states. One submitted request remains one numbered record even when it contains multiple tasks or several offer revisions.

Project Memory browsing/search and the chatbot remain later milestones. No accounts, automatic messages, payments, invoices, timeline estimates, confidence scores, extra pricing categories or runtime fixtures.

## Proposed product choices

- Interpret the approved “client intake” scope as direct, text-only client request submission through a dedicated project link. The link permits submission and a receipt, not browsing project requests, the baseline, drafts or finances. Existing freelancer intake stays available.
- Use separate credentials for request submission and each offer. Proposed configurable expiry defaults: 30 days for an intake link and 7 days for an offer link. Both support explicit revocation/rotation. Repeated submissions are allowed until intake access expires or is revoked; retries with the same idempotency key do not create another request.
- Clients submit request text only (10–4,000 trimmed characters). They cannot set rates, effort, classification or money. Store client-originated requests with no rate and show “Needs hourly rate”; the freelancer sets a valid rate before analysis. Do not substitute a zero rate or invoke AI automatically.
- Correct a pending offer on the same request: revoke its access and clear internal approval atomically before unlocking edits. Preserve the old offer, then save a new revision, reapprove it and generate a new offer/link. Accepted and declined offers are final; new negotiated work uses a new request.
- A request or offer made stale by a scope change requires a new current-scope request/analysis, consistent with the existing stale-scope rule. Retain the old record and show the reason; do not rewrite pinned inputs or silently rebase historical work.

## Implementation order

### 1. Establish contracts and migration

The existing schema has `Estimate.proposal` as a single optional record and `Proposal.estimateId` as unique. Replace this with preserved proposal history and an explicitly selected current offer. Add a database constraint allowing at most one PENDING offer per estimate. Retain approved-revision ownership checks and enforce consistent project, estimate, revision and decision relationships.

Add hashed, expiring project intake credentials; request origin metadata; scoped idempotency records for intake, generation and decisions; explicit offer replacement links; and database protection for frozen proposal content and finalized decisions. Preserve existing request numbers, originals, revisions and historical snapshots during migration. Store final-decision supersession only for an accepted replacement: a declined replacement must not reserve the existing unique supersession relationship.

Define a new priced proposal snapshot contract. The current placeholder uses an older revision schema without the Milestone 4 fixed charge. Include the exact approved revision, request number/text, client-visible tasks/evidence/assumptions, rate, three effort/price scenarios, fixed charge/reason, agreed amendment terms and any explicit whole-decision replacement. Keep compatibility readers for historical data. Update all consumers of the current singular proposal relation, including review guards and request/billing history.

### 2. Implement client request intake

Add authenticated create/rotate/revoke intake-link actions and a minimal public request form. A submitted request gets its project and current scope counter from the server, an immutable original description, the next project request number and a submission audit event in one transaction. Scope idempotency keys to the authorized intake grant; reject reuse with a different body. Rate-limit public writes without introducing a total project request limit.

Add an authenticated rate-setting action for unanalyzed client requests. Serialize it with analysis claims and reject changes after analysis starts or a saved estimate exists; later rate changes use immutable review revisions. Return a specific missing-rate error before AI is called. Preserve input on validation, expiry and network failures.

### 3. Finalize the exact terms before approval

An effort task such as “add three pages” is insufficient to invent a new agreed total. Extend the saved review with explicit client-facing amendment terms and validated `amendsSourceIds`, linked to the relevant tasks. The freelancer reviews the resulting deliverables/limits before approving. Do not derive authoritative agreement text from AI explanations or assume that the nearest contextual citation is being replaced.

IN_SCOPE-only approval requires no scope amendment. MODIFICATION/NEW_FEATURE work must have the necessary agreed terms. Store all terms and replacement selection in the same immutable revision that approval pins; changing any of them requires another save/approval. Existing Milestone 4 revisions remain readable; if they lack the required terms, guide the freelancer through reopen/save/reapproval before generating an offer.

Support the specified optional whole-decision supersession: select one applicable accepted decision in the same project, explicitly identify it to the client, and restate any terms that remain applicable. Validate the target again at approval, generation and acceptance. Never infer supersession from timestamps or similar wording.

### 4. Generate and manage offers

Generate only from the exact saved, approved revision against current project scope. Recalculate with the existing shared integer-paise calculator and verify saved totals; reject unresolved tasks, stale scope/revision and client-supplied money. Save the immutable offer, token hash, expiry, current-offer pointer and audit atomically.

Use at least 32 random bytes per bearer token and store only its hash. Return a raw link once. A generation retry returns the existing offer identity/status, not a newly generated secret or duplicate offer; if the first link response was lost, the freelancer explicitly rotates access. Rotation revokes the previous credential without changing approved offer content. Rotation is allowed only for an otherwise eligible offer; stale or finalized offers cannot become actionable again.

Provide freelancer actions to generate, copy, rotate, revoke and revise an offer, alongside its exact revision, expiry and status. Copy/share is manual. Opening the revision editor performs the explicit “Revoke offer and edit” transaction first; closing that editor does not resurrect the old link.

### 5. Build the public offer and decision flow

The client page displays only a server-serialized allowlist: requested work, approved task classifications and evidence, agreed terms, assumptions, hourly rate, effort/price ranges, the fixed charge and reason, and any replacement agreement. Do not serialize internal edit reasons, AI originals, unrelated source documents, audit data, drafts or other project records.

Accept and Decline are separate explicit actions with confirmation and an optional comment of at most 500 characters. Explain that acceptance approves the described scope and estimated budget range, makes no automatic charge, and that changed assumptions or work beyond the upper range needs another approval. Successful and repeated decisions display the persisted result; GET/preview/prefetch never records a decision.

For token redaction, prefer links carrying the secret in a URL fragment, exchanged through an Authorization header to token-free API paths. Keep the token in page memory, never local storage; use no-store responses, no-referrer, no third-party analytics and no credential logging. Verify browser navigation, API errors and local server logs do not disclose the credential. Token possession is access, not proof of client identity. Validate origins on mutations in addition to token authorization.

### 6. Make decisions atomic and update scope/history

Use one consistent locking order across review, generation, rotation/revocation and decision services: project → estimate → proposal. Re-read the token validity, offer status, current-offer pointer, approved revision and project scope after locks are held.

Acceptance inserts the unique decision, persists the frozen approved snapshot and validated amendment clauses, advances the scope counter only when effective scope changes, finalizes the offer and records the audit in one transaction. All-IN_SCOPE acceptance records a zero-price decision without artificial amendments. Decline records its decision/comment without changing scope or accepted billing.

For a still-valid credential, repeated identical decisions return the existing result, including after that acceptance itself advanced scope; conflicting decisions return ALREADY_DECIDED. Reusing an idempotency key with a different decision or comment returns a conflict. A repeat of the same outcome with a new key returns the saved result and original comment without changing either. Expired/revoked credentials never authorize new mutations.

Acceptance versus correction/revocation, simultaneous decisions, and two offers racing against the same scope counter must have one consistent transaction winner. A losing correction cannot modify an accepted offer; a losing acceptance cannot accept a revoked offer. Roll back decision, amendment, scope, status and audit together on failure.

Adapt Request History and Additional Requests to proposal history without multiplying request counts. Show current offer status separately from internal approval and expose preserved old offers in freelancer-only details. Accepted totals use frozen accepted snapshots exactly once. Pending totals retain the Milestone 4 reviewed-request semantics; never count both a current draft and its offer or include obsolete offers. Retain exclusions for unresolved, declined, revoked, expired and stale work. Scope supersession does not erase historical accepted billing or imply a refund. Future analysis must actually retrieve applicable accepted amendments and omit declined/revoked/superseded scope.

## Acceptance checks

- Fresh setup and upgrade from Milestone 4 succeed; originals, existing numbered requests, saved revisions, approvals and billing snapshots remain readable and unchanged.
- A valid intake link creates one project-scoped request and receipt; retries create no duplicate; foreign/expired/revoked links, oversized input, forged financial fields and rate-limit violations fail safely.
- Rate assignment is freelancer-only, audited and blocked after an analysis claim; missing rates never reach AI. A project continues accepting requests after a client decision.
- Generation refuses unsaved, unapproved, uncertain, stale or inconsistent content. The public response contains only its approved allowlist, including the fixed charge exactly once per scenario.
- Tokens are random, hashed, expiring, rotatable and scoped to one capability/resource; old credentials fail after rotation. Logs, URLs sent to the server, error payloads and client storage do not leak secrets. Unauthorized/cross-project access fails.
- Revising a pending offer revokes it and clears approval atomically. Its link cannot accept; original content remains unchanged; replacement sharing requires a new saved revision and approval. Accepted/declined records cannot be edited.
- Acceptance/decline are atomic and idempotent. Test same/opposite concurrent decisions, correction/acceptance races, stale scope, stale revisions, revoked/expired links, and forced failure at each transaction write boundary.
- Mixed additional work, all-IN_SCOPE zero pricing, supersession, and a declined replacement preserve correct scope and historical billing. A later internal revision cannot alter an accepted total. Multiple offers never increase request counts.
- Desktop/mobile and keyboard flows cover intake, review, copy/share, client confirmation, errors, correction/reapproval and refresh. Restart preserves decisions, terms, request history and billing. Inspect screenshots and verify the client page against unintended data exposure.
- Run build, lint, typecheck, offline tests, database/browser regressions and restart checks. Exercise a real-provider request through analysis → review → share → accept → subsequent analysis using the accepted scope, with synthetic records in the isolated test database. Report live-access failures honestly; do not substitute runtime answers.

## Delivery

Implement sequentially in the order above; establish shared contracts and the migration before UI/service work. Use small coherent commits for storage/contracts, intake, offers/revision, decisions/history and verification. Update README and this document with observed results and limitations. Push completed, verified work only to `origin/abrar-dev`; do not deploy.
