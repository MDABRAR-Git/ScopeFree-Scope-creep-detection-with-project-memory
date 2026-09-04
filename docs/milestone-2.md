# Milestone 2 — Baseline and request intake

Scope: baseline paste/upload, editable text/clause preview, one immutable original baseline, request text/rate intake and complete project request lists. Live AI analysis starts in Milestone 3. No deployment.

## Acceptance checks recorded before implementation

1. Paste intake and server-side extraction of text-based PDF, DOCX and UTF-8 TXT work within the 5 MB upload limit.
2. Unsupported, corrupt, scanned/unreadable, type-mismatched and oversized files return clear errors with a paste-text alternative and do not save a baseline.
3. Preview editing preserves complete text. Confirmation enforces 12,000 characters, 1–40 clauses, nonempty unique clause IDs and at least one deliverable identified by the freelancer. The confirmation is an assertion, not independent verification of agreement.
4. Confirmation atomically saves the original baseline, schema-versioned clauses, hash, UTC timestamp, confirmer and audit record. Duplicate/concurrent confirmations cannot overwrite it.
5. Requests of 10–4,000 trimmed characters and INR rates above zero through 100,000/hour (maximum two decimals) persist under the selected project and scope revision. Invalid or authoritative extra fields are rejected; saving never calls AI.
6. Baselines/requests survive refresh and application restart. Session/origin protections and project-scoped reads/writes hold.
7. Desktop/mobile screens, keyboard actions, visible errors, existing regression checks, lint, types and production build pass.
8. Setup/verification documentation is updated; secrets and test data are excluded from Git; the verified milestone is committed and pushed to `milestone-2`.

## Results

Verified locally on September 4, 2026, with Node 24.13, PostgreSQL 18.2 and Chromium. The acceptance checks above were recorded before implementation; the results below describe actual executions.

| Check | Observed result |
|---|---|
| Lint, standalone type check and production build | Passed. The final build also completed TypeScript checking. |
| Unit/parser tests | 43 passed across six files. Includes real PDF/DOCX/TXT extraction, strict contracts, exact decimal-to-paise conversion, size/type/encoding failures, bounded multipart input and extraction worker timeout/cancellation/capacity lifecycle. Lifecycle tests use injected workers only in tests. |
| Production browser/API tests | 15 passed: seven foundation regressions and eight intake tests. The final run took 44.5 seconds. |
| Persistence and operational errors | Four runtime checks passed: project/session restart persistence; baseline/metadata/request/rate restart persistence; missing password configuration; database outage with safe retryable 503. |
| Migrations | Both migrations applied to development and isolated test databases. Reapplying test migrations reported no pending migration; development migration status reported up to date. |
| Security boundaries | Unauthorized access/origin rejection, project isolation, authoritative-field rejection, three concurrent confirmations with exactly one success, direct baseline UPDATE/DELETE rejection, and audit-failure transaction rollback all passed in the production API tests. |
| Real uploads | PDF, DOCX and TXT produced editable previews through the production route without saving a baseline. Corrupt, scanned/mixed-page, empty, mismatched and oversized inputs returned explicit errors. |
| UI inspection | Visually inspected paste/upload, clause review, confirmed baseline and saved request screens at 1440×1000 and 390×844 viewports (eight full-page screenshots). No horizontal overflow in the tested flows. Keyboard login and skip-to-content activation, validation errors, duplicate clause IDs, source retention after failed upload, merging and refresh persistence passed. |
| Dependencies and browser secrets | npm audit reported zero vulnerabilities. Production client-asset scan found none of the configured secret values in 19 assets. |

### Implemented

Baseline and Requests navigation now opens working project-scoped screens. A complete agreement can be pasted or extracted, edited into clauses, checked for a deliverable and confirmed once. The server saves the reviewed text, clause snapshot, hash, identity and timestamp with an atomic audit event; a database trigger prevents baseline updates/deletions. Requests save text, exact INR hourly rate and the server's current scope revision with an audit record. Project cards and overview show current intake state and request counts.

Document parsing runs in bounded, disposable server workers and does not retain uploaded files. New parser dependencies remain external to the Next.js server bundle. A nullable rate column supports older request records, while every new request requires a valid rate. README documents reproducible setup, validation limits and the verification commands.

### Failures found and fixed

- The cold PDF parser exceeded the test framework's default five-second deadline. That parser test now allows twenty seconds; the application's fifteen-second extraction deadline remains enforced and tested.
- PDF extraction initially failed only in the production bundle because PDF.js could not locate its companion worker. Externalizing the Node parser packages fixed it; the real three-format production upload test and full suite then passed.
- Full-page screen inspection showed an unfocused skip link over page content. Explicit clipping while unfocused removed it; keyboard focus/activation and fresh screenshots verified the correction.
- Dependency audit advisories in Prisma development tooling were resolved with scoped patched-version overrides. Prisma generation, migrations, build and tests passed afterward; the final audit reported zero vulnerabilities.

### Verify manually

1. Open http://localhost:3000 and log in using the configured workspace password. The existing local password is in ignored `.local/workspace-password.txt`; it is not committed.
2. Create a new project and open Baseline. Paste a short agreement with a concrete deliverable, or upload your own text-based PDF, DOCX or UTF-8 TXT under 5 MB.
3. Choose Review clauses. Check the complete text, edit/merge/add clauses if needed, keep IDs unique, mark a concrete deliverable and confirm your review. Save the baseline.
4. Refresh: the baseline remains read-only with its confirmation details. Open Requests, enter a change of at least ten characters and a rate such as `1234.56`, then save.
5. Refresh: the request remains listed with `₹1,234.56 / hour` and no estimate. Try a rate with three decimal places to inspect validation. In a separate new project, try an unreadable file and confirm the paste alternative appears without saving a baseline.
6. Repeat at narrow width. Stop and restart ScopeFree using the README instructions; log in and reopen the project to inspect persistence.

### Limits and deferred verification

No known Milestone 2 implementation blocker remains. Live AI analysis is Milestone 3 and was not run; saving intake never calls AI and no prepared-answer fallback exists. Estimate review/pricing, proposals, decisions, Memory and chat remain future milestones. The original baseline cannot be corrected in place; create a new project if it is wrong.

No OCR. PDFs with any unreadable or blank page are rejected conservatively; DOCX expansion/page/worker limits are documented in README. Extraction can lose formatting, so the freelancer must review all terms before confirming. Deliverable identification is a user assertion with a basic text-usability check, not semantic proof of agreement.

Browser verification used Chromium at desktop/mobile viewport sizes, not physical mobile devices, Firefox, Safari or a screen reader. No deployment, cloud database, live provider access, full deployment packaging, load testing or fresh-machine installation was verified here. Final integration/release verification remains Milestone 8.

The checkpoint targets branch `milestone-2`; commit/push confirmation is reported in the delivery message after Git verification. Test screenshots, local database data, credentials and generated build files remain ignored.
