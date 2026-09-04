# UX Contract

## Product context

- Audience: independent professionals and small studios managing private client projects.
- Primary jobs: establish an original scope, record client requests, review and price changes, share offers, record decisions, and retrieve immutable project memory.
- Target market: current implementation uses English and INR pricing.
- Active locales: English UI with `en-IN` currency conventions and explicit UTC timestamps for immutable records.
- Language/content register: concise operational English; product copy is reviewed with the implementation.
- Timezone/calendar policy: stored absolute timestamps are rendered with an explicit UTC label where the record is audit-relevant.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Permission model | `AGENTS.md`, `SPEC.md`, server authorization checks | Product policy / implementation contract | 2026-09-05 |
| Data lifecycle | `SPEC.md`, `docs/milestone-4.md`, `docs/milestone-5.md`, `docs/milestone-6.md` | Domain specification | 2026-09-05 |
| Deletion / retention | `SPEC.md` immutable baseline, revision, offer, and decision rules | Domain specification | 2026-09-05 |
| Billing / payment | `docs/milestone-4.md`, pricing contracts in `src/lib/pricing.ts` | Billing specification / code contract | 2026-09-05 |
| Legal / regulatory copy | No maintained legal-copy source; product states that estimates do not automatically charge | Product limitation | 2026-09-05 |
| Market / content conventions | `README.md`, implemented INR and English UI | Product evidence | 2026-09-05 |

## Visual contract

- Project `DESIGN.md`: normative visual identity and token values.
- Token ownership model: `DESIGN.md` is normative; runtime CSS variables implement it.
- Runtime design-system/token source: `src/app/globals.css`.
- Mapping/export/adapters: domain styles consume global variables from `globals.css`; no generated token layer exists.
- Token drift gate: design lint, premium strict audit, changed-code raw-color review, and browser screenshots.
- Supported themes: light plus forced-colors compatibility.
- Design-context owner/review policy: update `DESIGN.md`, runtime tokens, and browser evidence together for durable system changes.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native HTML select for small fixed review choices | `DESIGN.md`, this contract | native | keyboard + browser popup |
| Form | Existing feature forms with Zod/server validation and shared global field styles | Server schemas, `src/app/globals.css` | create / edit | validation E2E |
| Scrollbar | Global application stylesheet | `DESIGN.md`, `src/app/globals.css` | geometry exceptions | computed style + browser |
| CRUD | Existing Next.js routes, client components, and server services | `SPEC.md`, milestone reports, API tests | return / stay | full-flow E2E |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | Stable 44px control | intent tint | 3px ring | darker intent | legible muted state | spinner/text in stable box | adjacent scoped alert |
| Icon button | visible label when meaning is not universal | tonal fill | 3px ring | pressed tone | muted | reserved geometry | adjacent alert |
| Input | white surface and shared border | stronger border | focus ring | n/a | muted surface | form remains stable | border plus associated text |
| Secret input | masked with password-manager autocomplete | stronger border | focus ring | n/a | muted surface | preserved width | generic credential alert |
| Search | explicit submit and clear link for non-empty query | stronger border/action | focus ring | URL-backed query | n/a | route loading | page error boundary |
| Textarea | resize none and task-appropriate minimum height | stronger border | focus ring | n/a | muted surface | preserved input | border plus associated text |
| Table/list | ledger rows with status and metadata | row/action emphasis | linked action ring | selected/current where applicable | n/a | shell loading | safe empty/no-results/error state |

## Dataset navigation

- Project, request, and memory lists render all records required by their current server contracts.
- Project Memory search and status filters are URL state and survive refresh/Back.
- Empty, no-results, loading, and route errors use existing app-owned states with a direct recovery action.
- Essential project, request, price, and status values wrap and remain fully available without hover.
- No row selection or bulk action exists.

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Create project | Create project | stable busy button | new project overview | destination heading | inline form error, name preserved | destination heading/browser route | `src/components/access-forms.tsx` |
| Confirm baseline | Confirm baseline | disabled inputs + spinner | confirmed baseline view | persistent saved notice | inline error/conflict recovery | saved view | `src/components/baseline-editor.tsx` |
| Save request | Save request | stable busy button | same Requests page | inline saved status | inline error, request preserved | same form/status | `src/components/request-intake.tsx` |
| Analyze request | Analyze request | spinner + explanatory status | estimate detail | destination view | inline retry error | destination heading | `src/components/analyze-button.tsx` |
| Edit estimate | Save review | disabled editor during request | same estimate detail | persistent status text | summary + inline error, draft preserved | status/error region | `src/components/estimate-review.tsx` |
| Search memory | Search | route loading | same URL-backed list | displayed/total count | route error boundary | search/list context | `docs/milestone-6.md` |
| Upload/background job | Choose agreement file | extracting status, picker disabled | same baseline draft | extracted filename/help | inline paste fallback | source text region | `src/components/baseline-editor.tsx` |
| Cancel/back | Back/context link | none | owning list/project | none | n/a | destination route | route hierarchy |

## Navigation and responsive behavior

- Route document title policy: root title template is `Page · ScopeFree`; page-specific titles should be added as routes evolve and must contain no secrets.
- Route error / 403 page behavior: app-owned not-found and recoverable error pages link to a safe workspace destination and expose no internals.
- Breadcrumb/tab/route-state policy: breadcrumbs represent Workspace → Project hierarchy; project sections are route-backed navigation links with `aria-current`.
- Sidebar transformation: persistent workspace rail on desktop; hidden on narrow screens where the top-bar brand links to Projects. Project navigation becomes a single horizontally scrollable row.
- Responsive data strategy: independent records stack; financial scenarios retain aligned three-column comparison until narrow mobile, then stack only where required for readability.
- Truncation/full-value access: wrap essential values; ellipsis is limited to account identity where the full address is not needed for the task.
- Focus/sticky policy: focused content must not sit beneath sticky chrome; sticky estimate summaries become static below the desktop grid breakpoint.

## Overlays and feedback

- No dialog, drawer, toast, or tooltip primitive is currently required by implemented workflows.
- Confirmation uses persistent in-context checkboxes for baseline, offer, and client-decision consequences.
- Alerts remain adjacent to the form or operation and stay visible while the condition is true.
- Unsaved estimate edits are labeled and preserved in component state after recoverable errors; navigation-loss guarding is outside the current behavior and is not altered by the visual redesign.
- Layer contract: skip link above top bar; top bar above document content; scoped logout error above the top bar.

## Async and resilience

- Mutations are pessimistic and commit visible state only after server confirmation.
- Existing working refs, disabled controls, and idempotency keys prevent duplicate submissions where server contracts support them.
- Failed request and review mutations preserve non-sensitive user input and provide retry in context.
- Session expiry follows existing protected-layout redirect behavior; the redesign does not alter authentication or callback semantics.
- Analysis and file extraction use honest indeterminate progress text; no fake percentage is shown.
- Existing expected-revision and stale-scope contracts remain authoritative for conflicts.

## Validation

- Zod/server schemas remain authoritative. Client checks provide immediate format and length guidance.
- Product forms use `noValidate` and app-owned inline feedback; native browser bubbles are not canonical.
- Errors remain next to the owning form/action and never expose raw backend details.
- Password fields retain correct autocomplete and masking behavior; passwords are never copied into UI state outside the existing form lifecycle.
- Busy states retain button geometry and duplicate submit prevention.

## Permission and clipboard

- Authenticated routes require the account session; foreign or unknown project records use the existing safe not-found behavior.
- Client links are shown only when returned and copied only after an explicit button action. Success text never repeats the secret.
- Unavailable Ask Project Memory remains visibly disabled with its existing Milestone 7 explanation.

## Migration status

- This redesign consolidates existing CSS and route treatments around the global tokens and scope-ledger language in `DESIGN.md`.
- Existing component and route behavior remains in place; touched screens migrate together to prevent a mixed visual system.
- Before/after browser captures live in ignored `test-results` during implementation.

## Verification

- Required static commands: design lint, premium strict audit, ESLint, TypeScript, unit tests, repository verifier.
- Browser matrix: Chromium desktop 1440×1000, mobile 390×844, keyboard focus, loading, empty/no-results, editable, read-only, accepted, and error-adjacent states.
- Component-state coverage: existing Playwright suites plus a temporary full-route visual audit removed before delivery.
- Canonical sibling flow: Baseline ledger, Request History, and Project Memory are compared as three views of authoritative project records.
- CRUD and failure-path evidence: `tests/e2e` and restart verification scripts.
