# Milestone 4 — Review, pricing and request history

## Agreed changes and acceptance checks (before implementation)

The latest user decisions supersede conflicting SPEC.md rules: use IN_SCOPE, MODIFICATION, NEW_FEATURE and UNCERTAIN; retain reviewed minimum/likely/maximum ranges; add one optional fixed charge per request with a client-facing reason. One client request remains one record regardless of task count. Client intake/acceptance/shared offers remain Milestone 5. Editing a shared pending offer in that milestone must invalidate the previous offer and require freelancer reapproval. Accepted snapshots remain immutable; projects never lock against new requests.

1. The shared browser/server calculator uses integer quarter-hours and paise, aggregate half-up rounding, and the existing INR rate. The fixed request charge is added once to each scenario. Invalid/unsafe amounts fail explicitly.
2. IN_SCOPE work has zero additional hours/charges. UNCERTAIN excludes unresolved work from provisional totals and blocks approval. All-IN_SCOPE requests can be approved at zero.
3. Review supports adding/editing/removing tasks, evidence, assumptions and hour/rate changes. Classification changes and removals require recorded reasons. Saved revisions and original AI/input snapshots stay immutable.
4. Save checks expectedRevision. Approval pins the exact saved revision and computed totals with one review confirmation; dirty/invalid/uncertain/stale-scope work cannot be approved. Reopen preserves audit history and is forbidden after a proposal exists.
5. Stable project request numbers, summaries, all-request history, separate additional-request counts, status and billing summaries derive from persisted records. No tasks counted as requests and no internal approval labelled client acceptance. Accepted amounts use accepted snapshots; declined amounts do not enter pending/accepted sums.
6. Access/origin/evidence boundaries, competing saves, transactional rollback and refresh/restart persistence pass tests. Production build, lint/types, regressions and desktop/mobile/keyboard/error screens are checked.
7. Existing Milestone 3 records are readable through a compatibility reader without rewriting AI originals. Live new-schema analysis is verified separately from test doubles. Credentials stay ignored and server-only.
8. Commit/push milestone-4 only after verification. No deployment or Milestone 5 implementation.

## Results

Verified on September 4, 2026 on `milestone-4`:

- `npm test`: 65 offline tests passed; the 25 opt-in live cases are skipped by this command.
- `npm run build`, `npm run typecheck` and `npm run lint`: passed.
- Browser/API suite: 35 checks passed on the full run. The remaining desktop/mobile review check initially failed because its alert selector also matched Next.js's route announcer. After narrowing the test selector, that check passed on both viewport sizes. All 36 checks now pass; no application change was needed for that selector correction.
- Pricing checks cover quarter-hour aggregation, aggregate half-up rounding, one fixed charge per scenario, reason validation, IN_SCOPE zero pricing, provisional UNCERTAIN totals, invalid ranges/rates and safe-integer overflow.
- Database/API checks cover immutable AI/input/calculation/revision records, required edit reasons, concurrent saves, exact revision approval, idempotent approval, stale scope, reopen audit, proposal locks, foreign evidence and project ownership, session/origin protection, and rollback on audit failure. Legacy classification records remain unchanged and can gain a new priced revision through explicit Save review.
- Billing checks cover concurrent request numbering, counting requests rather than tasks, unreviewed/uncertain/declined/expired/revoked/stale exclusions, and accepted totals drawn from an accepted snapshot even when a different later internal revision exists. New requests remain possible after acceptance. Acceptance fixtures exist only in the isolated tests; client decision routes are deferred.
- `npm run test:runtime`: all seven checks passed. An actual production-server restart preserved baseline, session, request numbers, original analysis, reviewed prices, exact approval, audit history, request history and billing summaries. Missing AI/password configuration and database outage returned explicit errors.
- Desktop (1440px) and mobile (390px) screenshots were inspected for review editing, saved approval and request history. Browser checks covered no horizontal overflow, inline validation, keyboard confirmation/approval, focus on errors, keeping draft edits after a failed save, retry, reopening and refresh.
- All four migrations are applied in both the local development and isolated test databases. The development database still has its two baseline records and no estimates/revisions, matching the pre-implementation record counts; synthetic integration/live-browser records stay in the test database.

### Live AI evidence

The earlier full Milestone 4 live run is preserved in [milestone-4-evaluation.json](milestone-4-evaluation.json). Its saved results contain **25/25** passing classification/evidence expectations, no repaired responses, and observed call times of 13.7–76.4 seconds (815.5 seconds total). It completed at 2026-09-04 13:24 UTC using Featherless, `Qwen/Qwen3.8-27B`, prompt `scope-v5`, temperature 0, thinking false, low reasoning effort, 2048 maximum output tokens and a 90000 ms request timeout. The new names appear in the actual provider results; runtime fixtures were not substituted. The full evaluation was inspected during this completion pass rather than rerun.

The separate `npm run test:live-browser` completion check passed in 1.2 minutes using a fresh synthetic project in the isolated test database. The real provider returned three tasks classified MODIFICATION, NEW_FEATURE and IN_SCOPE with validated evidence. The browser changed the hourly rate to INR 1,500 and added one INR 500 charge with a reason, saved revision 2, checked totals against the shared calculator, approved that revision and verified persistence after reload at desktop/mobile sizes. The first attempt stopped before any AI call because the workspace was still rendering at the five-second assertion limit; the live-browser configuration now permits 15 seconds for UI assertions.

### Delivery and limits

Delivery branch/target: `milestone-4` → `origin/milestone-4`, with verification before commit/push. No deployment.

A pre-commit scan of all 117 non-ignored repository files found no configured credential matches, private/generated paths or conflict markers. Actual credentials, databases, build outputs and screenshots remain ignored.

Client submission, offer sharing, client acceptance/decline and pending-offer invalidation remain Milestone 5. Current review APIs refuse edits/reopen once a proposal exists; the later shared-offer editing workflow must revoke the pending offer and require freelancer reapproval. Accepted snapshots must remain immutable. Project Memory/chat screens remain later work.

The previously documented Next.js compression-stream listener warning still appears during repeated browser navigation; checks pass, but long-duration production behavior remains unverified. Native JSON-schema support remains unverified/off. Live semantic evaluations are finite examples, not guarantees of future classifications or effort accuracy. Alternate providers and deployment were not verified.
