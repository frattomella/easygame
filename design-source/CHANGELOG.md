# EasyGame Design System — revisions

Two platforms are designed: **mobile** (`04-mobile.md`) and **web/desktop** (`05`–`10`).

## v3.1.0 — 2026-09-15 · "EasyGame blue · web" · **CURRENT**

Web/desktop pass. The reserved §05 placeholder is replaced by a full, authoritative web design system, audited and normalised from the approved web package (the **Iterazione 4** direction board and the extracted `EGShell` / `EGRecord` / `EGAthlete` frames, plus the `v0.1 bozza` system document and the four screen overviews). Mobile is untouched: no mobile token, component or rule changed in this revision.

**Added**
- `tokens/web.css` — the web layer (`--egw-*`): three environment grounds, ink ladder, semantic solids and tints, the three gradients, eight cut-corner radii, three elevation planes, shell and overlay geometry, three row densities, control heights, the web type ramp, focus/hover/motion. Imported by `styles.css`.
- `guidelines/05-web-desktop.md` — foundations: the three environments, colour, type, surfaces, spacing and grid, the six mandatory interaction states, motion, four responsive stops with a 1152 floor, accessibility.
- `guidelines/06-web-shell.md` — expanded and collapsed sidebar, both topbars, account menu, Azioni-rapide drawer, command-palette stub, and the overlay decision table (drawer · inspector · modal · popover · menu · tooltip · toast) with the dirty-state guard.
- `guidelines/07-web-datagrid.md` — one DataGrid for every list in the product: views bar, toolbar, bulk bar, header, rows, footer; column rules; standard and advanced filtering; saved personal and club views; selection and the six-step guided mass action with partial failure; eight states; the keyboard model; export and four-step import.
- `guidelines/08-web-forms.md` — 24 form primitives at two heights, six field states, validation timing, five layout modes, the long-form container decision table, quick-action forms, the inline-editing allow/deny list, and confirmations graded across five risk levels (typed confirmation only for irreversible or wide operations).
- `guidelines/09-web-patterns.md` — the ten page patterns, page-header anatomy, twelve cards and panels, the eight-level status system with its canonical Italian labels, feedback, the actionable-alert pattern with ten canonical alerts, the dashboard, and detail/profile pages reduced from nine tabs to three-to-five areas.
- `guidelines/10-handoff.md` — the implementation contract: the mockups-are-not-a-spec rule, version authority and precedence, the token surface, the component inventory to build, an 18-line review checklist, naming conventions, current assets, and a per-page definition of done.
- Six `@dsCard` specimen cards in group **Web**: environments, shell, DataGrid, status pills, fields/buttons/overlays, alerts and empty states.
- `templates/web-page/` — an operational list page on the real shell, as the starting point for every web page.

**Normalised** (conflicts inside the package, resolved in `05-web-desktop.md` §5.0)
- Status pill stays **full-radius with a ring dot**, as on mobile; the 10/4 cut chip is re-designated a **data chip** and may never carry a status word.
- Row density unified to **comoda 48 · media 44 (default) · compatta 40**, header 40.
- The **blue gradient sidebar** wins over the light white sidebar.
- The **sky band is the Dashboard's alone**; every other working page is flat mist.
- Bell badge is a **dot**; the count lives in the notifications panel.
- `#12265A` solid navy is named the **neutral-strong** button, not a second primary.

**Deprecated** — see `deprecated.md` §Web: the six coloured gradient dashboard module cards, purple/violet page titles, the nine-tab record strip, the solid red `Elimina` in a record header, glass and blur on working pages, the light sidebar, blue page backgrounds outside the Dashboard, in-app `powered by` footers, long scrolling centred modals for creation, and the superseded web direction boards v1/v2.

## v3.0.0 — 2026-09-11 · "EasyGame blue"

Consolidation pass. The approved mobile design artifact (`uploads/Extending EasyGame Design System/`) is now the source of truth, and the system is restructured into **01 Brand · 02 Foundations · 03 Core Components · 04 Mobile · 05 Web/Desktop (placeholder)**. This is a colour, chrome and branding correction — the cut corner, glass grammar, module stripes, time rail, number tiles, action gradient and eyebrow/display pair are untouched.

**Restructured**
- New authoritative documents: `guidelines/01-brand.md`, `02-foundations.md`, `03-core-components.md`, `04-mobile.md`, `05-web-desktop.md`, `deprecated.md`, `migration-v3.md`.
- v2.3's `component-specs.md`, `navigation.md` and `trainer-migration.md` are archived under `guidelines/archive/v2.3/`. They remain a valid reference for fine geometry and accessibility detail where v3 is silent; where they conflict, v3 wins.

**Core rules promoted (platform-independent)**
- **Brand** — the product is `EasyGame`; "EasyGame Mobile" is retired as a product line. The "e" mark may stand alone and is never boxed in a gradient tile (plain mark, or a 5% watermark). EasyGame + club hierarchy fixed: product left, club chip right, club always subordinate and never in the title slot.
- **Colour** — the ground moves off near-black onto the brand blue ramp; navy is depth, not identity. No black or neutral-grey backgrounds. A screen either has a designed horizon or a full-height ramp — no third case, so an accidental hard cut cannot occur.
- **Contrast** — no blue ink on a blue ground, anywhere; the action gradient is banned for buttons on the sky (white-on-navy primary, white-outlined ghost secondary); supporting copy on the sky never below white 78%.
- **Iconography** — a normative canonical-meaning table (back, chevron, more, download, upload, attach, document, invoice, receipt, camera, gallery, notification, success, warning, error); no icon-only actions on documents and payments.
- **Status** — eight semantic levels mapped to four visual tiers (quiet · outline · solid · urgent). Weight now says who is waiting for whom. Solid fills with white labels replace tint-on-glass; all six variants ≥4.5:1 on any ground.
- **Motion** — subtle, premium, controlled, fast: 220/180ms sheets on `cubic-bezier(.2,.9,.25,1)`, 120ms presses, no bounce, blur never animated.

**Mobile rules consolidated**
- Docks locked: **Trainer** Home · Allenamenti · Gare · Atleti · Profilo; **Parent** Home · Calendario · **Pagamenti** · Servizi · Profilo (supersedes the v2.3 Segreteria model). Home is dashboard + hub; notifications on the bell, never a tab.
- AppBar: brand line, context eyebrow, title; **back is a labelled `‹ Indietro` pill on the left**, never beside the bell; ≥20px clearance to trailing actions.
- Background: detail screens no longer split at the horizon — the leading surface straddles or starts inside the sky.
- BottomSheet: three dismissals always (scrim, drag, platform back); scrim swallows the tap; option sheets have no action bar; a primary action only where confirmation is genuinely required.
- Presenze: green wash removed, navy tile in every state, 30px ring mark, `Da segnare` neutral default, **one tap cycles da segnare → presente → assente**, progress line + `Segna tutti presenti`, success emphasis on the save button alone. Convocazioni is the same row in blue.
- Documenti (5 states) and Pagamenti (5 states) fully specified, with icon + word actions and receipts/invoices exposed on the card.
- Auth/account/system states on a full-height blue ground with the court motif; `Sessione scaduta` is a sheet, `Offline` a banner; blocking states list what the person *can* do and give two exits.
- Service block (name · version · status URL · support number) allowed **only** on maintenance, offline, error, support and service-status screens. No footer strip on normal screens.

**Components changed** — `AppBar`, `Dock`, `StatusPill`, `ActionButton`, `SectionHero`, `HighlightCard`, `MetaRow`, `NotificationRow`, `DocumentRow`/`DocumentCard`, `ConsentRow`, `PaymentCard`, `BottomSheet`, `ParentPrimaryScreenLayout`, `NumberTile` (navy in all states), `SelectableAthleteRow` (tri-state).

**Components new** — `NavTile`, `HubList`, `BrandStateLayout`, `SignatureInput` code-entry mode.

**Components unchanged** — `GlassCard`, `StatCard`, `EventCard`, `Avatar`, `IconChip`, `StateMessage`, `SecondaryScreenLayout`, `Icon`, `Text`, `Spacer`, `Floodlight`.

**Deprecated** — near-black sky, grey mist, tint-on-glass pills, action gradient on the sky, ink ghost on dark, boxed "e" mark, "EasyGame Mobile" product line, permanent footer strips, box-inside-a-row controls, icon-only actions, green attendance wash, two-state attendance, back in the trailing slot, dock count pills, the 68px dock, the Parent Segreteria dock, redundant `Annulla` on option sheets, generic blocking screens. Full table with replacements in `guidelines/deprecated.md`.

**Tokens** — 9 values changed (sky ramp, mist 50/100, glass border, dark glass bg/border, both floodlights, pitch lines); ~25 added (page ramp, court motif, on-sky actions, dock geometry, pill ramp, mark geometry, easing, press scales). **None removed or repurposed.**

**Flagged conflicts** (mobile artifact vs. accessibility/consistency) — three, all resolved in favour of the artifact with a rule attached: (1) the artifact's on-sky white pill inversion is mandatory, not optional, since a white-12% glass pill on the lighter ramp fails 4.5:1; (2) dock dot badges lose the count, so the count must remain readable on the Home tile and in the accessibility label; (3) tri-state attendance requires an explicit "absent" value from the API — if the backend cannot store it, the third state must not ship as a visual-only affordance.

**Reserved for the future web/desktop pass** — layout grid and breakpoints, sidebar navigation and breadcrumbs, table density and data display, multi-field forms and keyboard flows, modals/drawers/toasts/popovers, hover states, club-admin and secretariat roles, and whether glass and the floodlit ground survive at desktop scale. See `guidelines/05-web-desktop.md`.

## v2.3.0 — 2026-09-10 · "Real data" · *archived*

A refinement of v2.2, not a new direction. Same floodlit ground, glass surfaces, signature corner, single action gradient, icon-only.

**Changed — EnrollmentStatusCard rewritten to the real data contract**
- The multi-step progress rail (`Domanda / Documenti / Pagamento / Attiva`) specified in v2.1–v2.2 is **removed**. The backend exposes an enrollment *status*, a plan and a balance — not a state per phase — so the rail was a drawn assumption. Per-phase progress exists only at application level and belongs on a detail screen as rows.
- The card is now: dark glass in the sky · one `clipboard-outline` chip · season eyebrow · status as an h3 Italian phrase · Status Pill · one supporting fact from the API · at most one CTA naming the real task. Eight supported states, each derivable from a returned field. Loading keeps the shell with placeholder bars; a missing enrollment object renders **nothing** rather than a placeholder card; a fetch failure is a `StateMessage`, never a domain state.
- Deprecation entry added so the rail is not reintroduced.

**Verified / specified — Trainer final reskin set**
- Newly normative: `AppBar`, `Dock`, `StatusPill`, `GlassCard`, `ActionButton` (§B7–B11) — previously spec cards only.
- Re-verified: `SelectableAthleteRow`, `EventCard`, `StatCard`, `HighlightCard`, `SectionHero`. No functional meaning changed.
- Added a screen-coverage matrix for Home / Allenamenti / Gare / Atleti / Profilo: every surface maps to an existing component; the reskin needs no new ones.

**Added — Part E · authentication and password reset**
Seven steps (request, sent/resend countdown, code validation, new password, success, invalid/expired, plus loading and error), all in the existing language: raised sky, h1 statement, one elevated glass card, one primary CTA. Code entry is six glass cells but **one** logical field.

**Added — Part F · system, release and connectivity states**
`offline` (non-blocking banner over cached data with its timestamp), `connection lost`, `retry`, `maintenance`, `session expired` (a sheet, not a screen — context is preserved), `update required`, `unsupported role` (two exits, never one). Blocking vs non-blocking placement is now a rule.

**Added — Part G · push permission and deep-link states**
Permission not-requested / allowed / denied, with no launch-time prompt and no re-nagging after denial. Deep-link feedback: the destination's shell always renders before its data, and `loading` / `unavailable` / `access no longer available` / `wrong context` are four visually distinct outcomes.

**Tokens** — none added, changed or removed.

## v2.2.0 — 2026-09-10 · "Sheet & shell"

Driven by the second implementation pass (`easygamemobile/client/components/signature/**`), which built the Parent chrome and needed two shells the system had assumed but never specified.

**Added — formalised from implementation**
- `BottomSheet` — the one modal shell for every question-and-return interaction (Level 4 of the navigation language). Glass strong, `28 28 0 0`, scrim + 6px blur, 220/180ms, content capped at 75% viewport, commit only on the primary action.
- `ParentPrimaryScreenLayout` — the shell for the five Parent primary screens: Floodlight + AppBar + ChildSwitcher + 124px dock clearance. Holds the child-switcher placement rule in one place.

**Refined for implementation** (each gained a data contract, closed geometry gaps and an accessibility section)
- `PaymentCard` — fixed `it-IT` currency format, server-owned state, progress-rail geometry, days-overdue row.
- `DocumentRow` / `DocumentCard` — row-vs-card decision rule, 30-day expiry threshold, undated-document handling, one action per row.
- `ConsentRow` — the row navigates and never grants; version history always visible; revoke is not destructive styling.
- `AppointmentCard` — transitions as data (zero is valid), mandatory reason capture, reschedule rail showing proposed over original.
- `BookingCard` — aligned to AppointmentCard's grammar, inline fee, capacity, new `In conflitto` state.
- `EnrollmentStatusCard` — step-rail geometry with a mandatory text equivalent, action names the actual task, no fake action while awaiting the club.

**Tokens added** (`tokens/signature.css`)
- `--eg-scrim-sheet`, `--eg-scrim-blur`, `--eg-grabber`, `--eg-duration-sheet-in`, `--eg-duration-sheet-out`, `--eg-sheet-max-height`
- `--eg-focus-ring`, `--eg-focus-ring-on-dark`

Nothing removed or redefined. No visual direction change: same floodlit ground, glass surfaces, signature corner, single action gradient.

## v2.1.0 — 2026-09-10 · "Parent-ready"

Driven by the first real implementation pass (`easygamemobile/client/components/signature/**`, WP2 + WP3) and by the upcoming Parent phase.

**Added — formalised from implementation**
- `StateMessage` — loading / empty / forbidden / error, as one specified surface.
- `SecondaryScreenLayout` — the shell for every non-tab screen.
- `SignatureInput` — the glass field, now the only text-entry surface.

**Added — Parent area (specification only, not yet built as components)**
- `ChildSwitcher`, `RSVPControl`, `PaymentCard`, `DocumentRow` / `DocumentCard`, `ConsentRow`, `NotificationRow`, `AppointmentCard`, `BookingCard`, `EnrollmentStatusCard`, `AccountAccessCard`.

**Specified in full (previously component-only, no normative spec)**
- `NumberTile`, `EventCard`, `SelectableAthleteRow`, `SectionHero`, `StatCard`, `HighlightCard`.

**Tokens added** (`tokens/signature.css`)
- `--eg-corner-sheet`, `--eg-shadow-row`
- `--eg-grad-warning`, `--eg-grad-neutral`, `--eg-glow-warning`
- `--eg-money-due`, `--eg-money-paid`
- `--eg-child-1…4`

**Deprecated**
- `EmptyState` and `assets/illustrations/*` — the app is icon-only.
- `BrandGradient` as a page background, `Card tone="solid"` for content lists, `Input`, `Avatar` for athletes, flat module colour slabs.

**Documents**
- `guidelines/component-specs.md`, `guidelines/navigation.md`, `guidelines/trainer-migration.md`.

## v2.0.0 — 2026-09-09 · "Floodlit"

The visual signature: layered floodlit-pitch background, frosted glass surfaces, the signature cut corner, one action gradient, module stripe + time rail, tracked eyebrow over tight display type. Five signature patterns documented as spec cards. `Floodlight`, `NumberTile`, `IconChip`, `EventCard` introduced; `Button`, `Badge`, `Card`, `Input`, `Text`, `AppBar`, `TabBar`, `SectionHero`, `HighlightCard`, `StatCard`, `SelectableAthleteRow` restyled.

## v1.0.0 — 2026-09-09 · initial extraction

Tokens, components and a Trainer UI kit extracted from `easygamemobile/client/**` (`theme.ts`, `components/*.tsx`, `screens/Trainer*.tsx`) and the supplied brand assets.
