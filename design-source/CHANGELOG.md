# EasyGame Mobile Design System — revisions

Mobile only. No web UI is defined in any revision.

## v2.3.0 — 2026-09-10 · "Real data" · **CURRENT**

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
