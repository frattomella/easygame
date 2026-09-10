# EasyGame Mobile Design System — revisions

Mobile only. No web UI is defined in any revision.

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
