---
version: alpha
name: "ScopeFree"
description: "A compact scope ledger for independent professionals managing agreements, change requests, estimates, and client decisions."
colors:
  canvas: "#F3F5F2"
  surface: "#FFFFFF"
  surface_subtle: "#F8FAF7"
  ink: "#172A22"
  text: "#34463D"
  muted: "#65746C"
  primary: "#1F5A40"
  primary_hover: "#174A34"
  accent: "#DCE9DF"
  accent_strong: "#8FB59A"
  border: "#D9E1DB"
  focus: "#5C8F6A"
  danger: "#A84435"
  warning: "#9A6815"
  info: "#3E6687"
typography:
  sans:
    fontFamily: "Segoe UI Variable, Segoe UI, Inter, system-ui, sans-serif"
  display:
    fontFamily: "Segoe UI Variable Display, Segoe UI, Inter, system-ui, sans-serif"
  mono:
    fontFamily: "Cascadia Mono, SFMono-Regular, Consolas, monospace"
rounded:
  sm: "0.375rem"
  DEFAULT: "0.625rem"
  lg: "0.875rem"
  full: "9999px"
spacing:
  base: "0.25rem"
  control_height: "2.75rem"
  section_gap: "2rem"
  content_gutter: "2rem"
  page_max: "75rem"
components:
  app_canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
  content_surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
  subtle_surface:
    backgroundColor: "{colors.surface_subtle}"
    textColor: "{colors.muted}"
  button_primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "{spacing.control_height}"
  button_primary_hover:
    backgroundColor: "{colors.primary_hover}"
  project_navigation_selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.primary}"
  scope_ledger_rail:
    backgroundColor: "{colors.accent_strong}"
  divider:
    backgroundColor: "{colors.border}"
  focus_ring:
    backgroundColor: "{colors.focus}"
  status_danger:
    backgroundColor: "{colors.danger}"
  status_warning:
    backgroundColor: "{colors.warning}"
  status_info:
    backgroundColor: "{colors.info}"
---

# ScopeFree Design System

## Overview

### Creative North Star

ScopeFree should feel like a well-kept project control book: precise, calm, easy to scan, and explicit about which facts are original, proposed, accepted, or historical. The reference is a modern contract register used daily by a small professional team, translated into a contemporary SaaS product.

### Product context and register

- **Audience and primary job:** independent professionals and small studios who need to compare client requests with an agreed baseline, review pricing, and preserve a trustworthy decision record.
- **Target market and evidence:** the current product uses English, INR pricing, and `en-IN` formatting throughout the implemented workflows; see `SPEC.md` and the server contracts.
- **Locales and language policy:** English is the owned interface language. Currency uses INR; immutable event times continue to show their recorded UTC context.
- **Usage scene:** recurring desktop work with long project records, plus mobile review and navigation. Information density should support scanning without compressing controls below practical touch sizes.
- **Register:** product-first SaaS. The login route may carry more brand expression; authenticated workspaces prioritize clarity and earned familiarity.
- **Memorable signature:** a scope ledger treatment—thin status rails, numbered document rows, tabular financial figures, and lifecycle labels that make scope authority visible.
- **Restraint:** forms, navigation, errors, and read-only records stay quiet. Green indicates product identity and safe primary actions; semantic states keep their own restrained colors.
- **Anti-references:** avoid oversized editorial serif headlines, identical floating white cards for every section, decorative dashboard charts, gradients, glass effects, neon accents, and animation without state meaning.
- **Token ownership/runtime mapping:** this file is the normative visual contract. `src/app/globals.css` owns runtime CSS variables; `intake.css`, `analysis.css`, `client.css`, and `memory.css` consume those variables. `premium-ui.json` and strict UI audit guard ownership and drift.

## Colors

`canvas` is the workspace background and `surface` is reserved for controls, editable areas, and high-value records. `surface_subtle` separates dense regions without creating another card. `ink`, `text`, and `muted` establish three readable text levels. `primary` and `accent` carry the ScopeFree identity; `focus` remains visible on both canvas and surface. Danger, warning, and info colors are semantic and always paired with text or icons. The product currently supports one light theme; forced-colors mode keeps system outlines and scrollbars operable.

## Typography

The authenticated product uses the Segoe UI variable system stack for a crisp B2B interface without a runtime font download. Display roles use the matching display face at restrained sizes and weights. Body copy is 14–15px with compact but readable line height; metadata is 11–12px. Financial values and counters use tabular numerals. Uppercase is limited to short structural labels. Long project and request text wraps rather than truncating essential content.

## Layout

The desktop shell uses a 64px top bar, a 208px workspace rail, an adjacent 228px project rail, and a fluid content area capped at 75rem. Both rails collapse independently to 68px and keep icon access visible. Major sections use a 28–32px rhythm; related subcontent uses 12–18px gaps. Interactive forms may use a contained surface, while read-only records use ledger rows and dividers. At 760px and below, both rails become dismissible drawers opened by labeled controls, all grids stack, and actions remain at least 44px high. The document owns vertical scrolling; sticky summaries become static before they can compete with mobile scrolling.

## Elevation & Depth

Hierarchy comes from tonal surfaces, 1px borders, and status rails. Static read-only content stays flat. One low shadow may be used for the sticky top bar or a primary interactive surface, never for every record. Nested content uses dividers and tinted bands instead of nested floating cards.

## Shapes

Controls and compact records use 6–10px radii. Large interactive regions may use 14px. Status badges use full pills only because they are compact categorical labels. Document rows retain a straighter edge and a visible left rail. Lucide icons use consistent 1.75–2px strokes and sit in simple tonal containers only when they aid scanning.

## Components

### Foundational visual states

Default, hover, active, selected, disabled, busy, read-only, success, warning, error, empty, and no-results states use stable geometry. Focus uses a 3px `focus` outline with offset. Disabled controls reduce contrast but remain legible; busy buttons reserve their label width. The loading state uses a quiet status line inside the existing shell.

### Buttons and actions

Primary buttons are solid green and appear once per decision area. Secondary actions use a white or transparent surface with a clear border. Quiet actions have no permanent container. Danger remains separated from routine actions. Labels use specific verbs and icons sit before labels except directional arrows, which follow the label.

### Navigation and data display

The workspace rail owns top-level Projects navigation. The adjacent project rail owns Overview, Baseline, Requirements, Project Memory, and the visibly unavailable Project AI Chatbot. Project sections are route-backed links with a persistent selected state. Both rails provide explicit expand and collapse controls inside the rail itself on desktop and labeled drawer controls on mobile. Breadcrumbs show hierarchy without duplicating a separate back row. Projects, requests, clauses, and memory entries use dense rows with status, primary text, metadata, and actions aligned consistently. Status never relies on color alone.

### Forms and overlays

Fields share control height, border, focus, help, error, and disabled tokens. Textareas do not resize and receive sufficient default height for their task. Native select popups are accepted for the small fixed review choices; the trigger remains visually aligned with text fields. Upload retains a visible native picker, accepted formats, size limit, busy state, and paste fallback. Scoped failures stay adjacent to their action.

### Iconography

Lucide React is the canonical icon family. Product navigation uses 17–19px icons; key actions use 16–18px; illustrative empty states may use up to 32px. Icons supplement visible labels and never replace them for primary actions.

### Motion

Motion is limited to 120–180ms color, border, and small translation feedback. No entrance choreography or decorative animation is used. Busy spinners communicate active work. `prefers-reduced-motion` removes all transitions and animation.

### Content and data visualization

Copy is direct and operational. It names scope authority explicitly: original baseline, saved review, internal approval, client decision, superseded history. Amounts keep INR formatting and minimum/likely/maximum order. ScopeFree does not add decorative charts where exact text and totals are more useful.

## Do's and Don'ts

- **Do:** reserve contained white surfaces for input, action, or high-value immutable records.
- **Do:** use scope rails, dividers, and tabular metadata to make lifecycle and authority easy to scan.
- **Don't:** repeat the same bordered card treatment for every heading, clause, summary, and history item.
- **Don't:** use oversized empty regions, serif product headings, gradients, glass effects, or decorative metrics that compete with agreement data.
