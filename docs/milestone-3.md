# Milestone 3 - Live AI scope analysis

## Acceptance checks recorded before implementation

1. A saved request can be analyzed through the live configured provider; validated tasks, evidence, provenance and original inputs persist.
2. Strict schemas and semantic evidence checks reject invalid hours, invented/foreign sources and forbidden fields. At most one repair call is permitted within a bounded deadline.
3. Originals/revisions are immutable; repeated/concurrent calls cannot create duplicate successful estimates. Scope changes during analysis prevent saving.
4. Missing configuration, timeouts, provider errors, context limits and per-session rate limits show honest errors without runtime fixtures.
5. Writes are atomic and project-scoped; session/origin protections, refresh and restart persistence hold.
6. Desktop/mobile results, keyboard actions, citation links and error/retry states are inspected and tested. Lint, types, build and existing regressions pass.
7. At least 25 labelled evaluation cases are supplied. Live outcomes are reported separately from injected automated tests, without prescribed effort values.
8. Commit this milestone's changes on `abrar-dev` and push to `origin/abrar-dev` after verification (updated by the user's latest branch instruction). Preserve the completed Milestone 2 prerequisite commit. Do not deploy.

Scope follows the agreed eight-milestone split: analysis and initial revision now; review editing, deterministic prices and approval in Milestone 4. Uncalculated money is absent, not zero. Minimal accepted-amendment retrieval supports analysis; full Memory/decision workflows remain later milestones.

## Prerequisite observations

On September 4, 2026, the ignored/untracked local environment contained the required settings. Database connection succeeded. A synthetic Featherless completion returned HTTP 200, model Qwen/Qwen3.8-27B and the requested JSON. The individual public model lookup returned 404; it was not used to infer context/schema capabilities. Native schema mode remains false. No credential values were printed. No plan purchase or account change was made.

## Results

Verified September 4, 2026 against the production build and isolated `scopefree_test` PostgreSQL database:

| Check | Observed result |
| --- | --- |
| Production build | Passed; analysis API and result page are included. |
| Type check and lint | Passed. |
| Offline unit tests | 57 passed, including the post-save readback regression; the 25 live cases are intentionally skipped by this command. |
| Browser/API regression suite | 25 passed, including 10 analysis checks and all Milestone 1/2 regressions. All 10 analysis checks also passed after the prompt correction. |
| Runtime checks | All 6 passed, including an actual app restart preserving originals, pinned sources, revisions and provenance. |
| Migrations | All 3 applied in development and test databases; no pending migrations. |
| Screen inspection | Desktop 1440 px and mobile 390 px analysis results and provider error/retry screenshots inspected. No horizontal overflow in tested layouts; source links and refresh verified. |
| Credential boundary | `.env` and `.env.test` ignored/untracked; only `.env.example` tracked. The original 38 milestone files and the subsequent 13 completion files were scanned when staged; all 19 final browser files were also scanned against local AI/auth/database credentials with no matches. No generated/private files were staged. No runtime imports of test fixtures/provider found. |
| Production dependency audit | Unverified: npm's advisory endpoint timed out, including a bounded retry. No dependency versions or lockfile changed in this milestone. |
| Full live evaluation | `scope-v2`: 23/25 passed. Page-count classification failed; the mixed request timed out at 60 seconds. All 24 returned structured responses passed source/quote validation. |
| Final full live evaluation | `scope-v4` with temperature 0: **25/25 passed**, with valid classifications and evidence, no repairs and no timeouts in this run. |
| Initial live correction checks | `scope-v3`: 5/5 selected cases passed, including both earlier failures, covered work, superseded-scope handling and ambiguous baseline. This was the initial targeted handoff; the completion run below subsequently checked all 25. |
| Live UI | Passed on the final `scope-v4` production build with temperature 0: one real Featherless browser flow created and saved three tasks with covered/modifies-existing/out-of-scope categories. Reload, authenticated API readback, desktop/mobile layout and source navigation passed; both screenshots were inspected. The earlier `scope-v3` result is preserved in the evaluation record. |

The automated browser/runtime provider is injected only from test files. Those results do not establish live model quality. Checks cover authentication/origins, forbidden body fields, source ownership, invented quotes, invalid hours, bounded repair, lease recovery/concurrency, per-session limits, stale-scope rejection, database immutability, transaction rollback and retry without fabricated results. Missing/invalid baselines are also rejected in offline loader tests before inference.

### Live evaluation observations

The full run used Featherless, `Qwen/Qwen3.8-27B`, prompt `scope-v2`, `AI_THINKING=false`, `AI_REASONING_EFFORT=low`, a 2048-token output budget, a 60000 ms per-call timeout and native schema mode off. It ran all 25 cases in approximately 770 seconds. Earlier `scope-v1` attempts also encountered repeated timeouts; shortening the prompt improved observed completion rates without dropping sources or relaxing validation. An earlier isolated `scope-v2` mixed request passed in 55.1 seconds, but the full run still timed out on that case; this variability is not hidden from the report.

The page-count failure split a single quantity increase into a limit-update task and three separately labelled out-of-scope pages. Prompt `scope-v3` clarifies that implementation of additional items with unchanged behavior belongs to the existing quantity change and must not be double-counted. The local per-call budget was raised to 90000 ms; the entire analysis including repair remains capped at 120000 ms. Neither correction inserts prepared answers or fixed effort values. The 2048-token local budget is suitable only when the whole response fits; larger analyses may need an increased configured output allowance within the model's limits, and truncated responses fail explicitly.

Per-case metadata, including failures, is preserved in [milestone-3-evaluation.json](milestone-3-evaluation.json). It contains no credentials, confidential prompts or hidden reasoning. Raw structured outputs for the synthetic test cases remain in ignored `.local/evaluation`.

The initial targeted run used the same model/thinking/reasoning/output settings, prompt `scope-v3` and a 90000 ms per-call budget. All five cases passed classification and evidence expectations: covered contact form (24.5 s), additional named pages (28.9 s), mixed request (59.8 s), superseded scope (26.4 s) and ambiguous baseline (26.9 s). No repairs were needed in those five runs. This was a targeted correction check, not a claim of 25/25 or universal model accuracy. The real browser flow also passed with three correctly separated tasks and persisted output.

## Implemented

- Separate Analyze Request action and a saved, read-only analysis screen with per-task classifications, additional effort, exact source quotes, assumptions, questions, technical risks and provenance.
- Provider-neutral server transport with configurable model/endpoint, bounded context/output/deadlines, explicit cancellation and at most one structured-output repair.
- Project-scoped baseline/applicable-amendment retrieval, complete pinned input snapshots, strict schema/evidence validation, immutable AI originals and initial revisions, atomic audit records and one successful result per request.
- Honest configuration/provider/validation errors, retry action, analysis throttling and recovery from an abandoned job.
- A labelled 25-case synthetic live evaluation suite and a separate actual-provider browser verification command. No prepared answers are used by the runtime.

## Manual verification

1. Open `http://localhost:3000`, log in and open a project with a confirmed baseline. The local preview has been restarted on this milestone's production build.
2. Open Requests. Save a request and an hourly rate, then choose **Analyze Request**. Existing unanalyzed requests with valid saved rates can also be used.
3. For a baseline agreeing five pages and a contact form while excluding accounts, try: “Increase the website from five to eight pages. Add customer login and password reset. Keep the agreed contact form unchanged.” Expect the three respective scope categories; the model's effort values are not prescribed.
4. Inspect every task and its evidence link, assumptions and questions. Covered work must show zero additional hours. Uncertain tasks make the displayed total provisional.
5. Refresh the result, return to Requests and use **View analysis**. The same original result should remain. Check at mobile width too.
6. If the provider times out or rejects a response, the request remains saved and **Retry analysis** is available. There is no substitute result. Six attempted analyses per session per ten minutes is the application limit.

## Limits and deferred work

Prices, review edits, approval, client proposals/decisions, Memory screens and chatbot remain later milestones. Calculation data is SQL NULL, not an invented zero price. Creating accepted amendments and end-to-end client acceptance are not available; analysis-side amendment retrieval is verified with isolated database fixtures and synthetic live sources.

Exact-quote/source validation establishes that cited text exists in the supplied project snapshot; it cannot prove every interpretation is correct or every requested task was identified. Human review remains necessary. Context budgeting is conservative rather than model-tokenizer exact. Native JSON-schema support remains unverified/off. No alternative provider account or deployment was tested.

The local setting requests disabled thinking and low reasoning effort; successful API acceptance does not independently prove how the upstream model implements these options. Provider latency remains operationally variable. Tests emitted a Next.js compression-stream listener warning during repeated page navigation without failed checks. A close-out trace located it in Next.js's bundled compression and production page-streaming code; the focused desktop/mobile browser test passed. The warning is still unresolved, and long-duration deployment behavior is deferred to release verification.

## Completion and branch verification

The requested completion pass repeated the production build, type check, lint, all 57 offline unit tests, all 25 browser/API tests and all six runtime restart/error checks successfully. Desktop/mobile screenshots were inspected again. All three migrations are current in the development and test databases. Declared installed dependencies satisfy the package configuration; npm also reports three extraneous optional WebAssembly support packages in ignored `node_modules`, which are not committed application content. The bounded dependency-advisory retry timed out again, so advisory status remains unverified.

`npm run verify:repository` now provides a reproducible check of all fetched local/remote refs. Before the close-out commit it inspected eight refs, 129 unique branch-tip blobs and all 28 branch pairs: no corrupted/missing Git objects, unresolved index entries, conflict markers, tracked private/generated paths, configured local credential matches or merge-preview conflicts were found. This is a snapshot of current Git compatibility, not a guarantee about future changes or every possible application behavior. Local credential matching is not a general-purpose secret scanner.

The active branch and push target remain `abrar-dev`. `main`, `milestone-1-foundation` and `milestone-2` preserve their original checkpoints. The unused local `milestone-3` reference is advanced to the completed milestone through a checked fast-forward reference update; no branch checkout, history rewrite, deletion or force-push is needed. Repository checks are repeated after the final commit/push. Their exact inspected ref hashes are in ignored `.local/repository-verification.json`.

The subsequent complete `scope-v3` run finished at 23/25: both the undefined integration request and the ambiguous baseline were incorrectly labelled out of scope. All 25 responses satisfied schema/evidence validation, showing why those checks do not prove semantic correctness. These results are preserved alongside the earlier runs.

Prompt `scope-v4` explicitly requires both the requested work and relevant agreement to be defined before classifying coverage. Undefined desired behavior or vague agreed terms require uncertainty; absence alone is insufficient in those cases. A configurable `AI_TEMPERATURE` transport option was added, and the local setting now requests zero-temperature sampling. The adapter still supports omission with `default`, and no fixed classification or effort responses were added.

The complete `scope-v4` run passed **25/25** classification/evidence expectations in approximately 698 seconds. It used Featherless `Qwen/Qwen3.8-27B`, temperature 0, thinking false, low reasoning effort, 2048 output tokens and the 90000 ms per-call limit. Every response validated on its first attempt; observed case times ranged from 14.2 to 56.5 seconds. Both ambiguity cases and all earlier quantity/mixed-request regressions passed. The complete run and all earlier failed runs remain recorded in `milestone-3-evaluation.json`; a finite evaluation does not guarantee every future answer.

A separate fault-injection regression reproduced an unhandled rejection when a post-save database read failed while asynchronous lease cleanup was pending. The service now awaits readback inside its error boundary. The regression run detected the error with the original code, and the corrected full unit suite passed 57/57 without unhandled errors. Original estimate/revision/audit writes remain committed once; the readback failure remains an honest, retryable database error.
