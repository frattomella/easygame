# Trainer screens — migration to the current design language

**Revision:** EGDS v2.2.0 · 2026-09-10 · CURRENT

Home, Allenamenti, Gare and Atleti still use the pre-signature style (flat background, opaque `Card`/`Button`/`Badge`). The Dock around them is already current, which is why the seam is visible. This document says exactly how to migrate them **without changing any functionality** — no new data, no new endpoints, no changed permissions, no changed copy except where a state was previously unlabelled.

## Migration order

Do them in this order; each step is independently shippable and each one removes more of the seam than the last.

1. **Shell first, on all four screens** (one pass, low risk, biggest visual gain).
2. **Allenamenti** — the screen with the most product value and the clearest pattern (EventCard + attendance sheet).
3. **Gare** — identical structure to Allenamenti with the match module colour; nearly free once step 2 is done.
4. **Atleti** — roster rows and search.
5. **Home** — last, because it depends on the module colours and card shapes settled in steps 2–4.

## Step 1 — Shell (all four screens)

| Replace | With |
| --- | --- |
| Flat screen background | `Floodlight`, sky 300px (330–360px where the screen has a hero) |
| Gradient app bar with left-aligned wordmark | `AppBar` — tracked eyebrow (club · date) + 26px/800 display title, notification bell as a dark Icon Chip |
| Screen title as an `h3` inside the content | Nothing — the title moves into the AppBar. Never two titles. |
| Content directly on the background | 16px gutter, 12px between panels, **124px bottom padding** for the dock |

Also, on every screen: section headings become tracked uppercase eyebrows with an optional count on the right, and any heading that lands **in the navy sky** must use the on-dark tone. Hide the scroll indicator.

## Step 2 — Allenamenti

- **Hero:** add `SectionHero` in the sky — eyebrow `PROGRAMMA DI OGGI`, display title stating the count (`2 allenamenti` / `Nessun allenamento`), the existing supporting sentence, and two glass stat chips (`oggi`, `settimana`). Icon chip `fitness`. Sky 340px, and the first card must straddle the horizon.
- **Training card → `EventCard`:** the existing card content maps one-to-one.

| Today's card | EventCard slot |
| --- | --- |
| Title | `title` |
| Date + time string | split: start time → `time`, end time → `endTime`, short date → `dateLabel` (omitted inside the "today" group) |
| Category badge | `pill`, `default` variant |
| Location line | `meta[0]` with `location-outline` |
| `14/18 presenti` | `meta[1]` with `people-outline` |
| Status line | `status` + the glowing dot; `cancelled` flag for the annulled case |
| `Presenze` / `Annulla` buttons | `actions`, primary + secondary |

- **Stripe:** action gradient. **Group order unchanged:** today → this week → later, same empty sentences.
- **Attendance modal → sheet:** the existing modal becomes a `BottomSheet` (§A4 — grabber, eyebrow = session + time, title `Presenze`). Rows become `SelectableAthleteRow` with the green accent. The confirm button carries the live count (`Salva 14/18`) and a trailing arrow chip; `Annulla` is a secondary button beside it. Athletes who are injured or suspended render `disabled` with the reason as their state word — this is the one place the migration *adds* information, and it is worth it.
- **Empty groups:** keep the one-line glass panel. A wholly empty screen uses `StateMessage kind="empty"`, tone dark.

## Step 3 — Gare

Same as step 2 with three differences: the stripe and hero icon use the match gradient / `football`, the category pill uses the `match` variant, and the call-up sheet uses `SelectableAthleteRow` with `accent="primary"` and `Convocato` / `Non convocato`. The confirm button reads `Convoca 11`. Matches have no end time, so the time rail shows only the start.

## Step 4 — Atleti

- **Hero:** `SectionHero` in the sky — eyebrow `ROSA SQUADRA`, title `I tuoi atleti`, stat chips (`in rosa`, `disponibili`), and the search field in the hero's slot (`SignatureInput`, `search-outline`, clear affordance). Sky 360px.
- **Category filter pills:** move directly under the hero and use the `onDark` badge variant while they sit in the sky.
- **Athlete row:** glass row, control corner, 8px apart. Replace the circular initials avatar with a **48px `NumberTile`** carrying the jersey number and the 3-letter role caption (`POR`, `DIF`, `CEN`, `ATT`). Name 15/700, `category · position` as 12/500 ink 42%, status `Badge` (`Attivo` success / `Infortunato` warning / `Squalificato` destructive), trailing chevron. Athletes not available use the `muted` tile tone.
- **Remove** the "Apri scheda atleta" helper line — the chevron says it.
- **No results:** `StateMessage kind="empty"` with the existing copy (`Nessun atleta trovato` / `Prova a cambiare ricerca.`).

## Step 5 — Home

- **Hero:** `SectionHero` in the sky — eyebrow = the date in Italian, title = the greeting (`Buongiorno, Andrea`), supporting line = club · role, three stat chips (`allenamenti`, `gara`, `promemoria`). Sky 330px.
- **Three module blocks → `HighlightCard`,** replacing the solid violet/orange/emerald slabs. The colour survives as the stripe, the icon-chip tint and the count numeral; the surface becomes glass. Preview rows gain a leading tabular time. Module colours: trainings `#2563EB`, matches `#F97316`, reminders `#10B981`. Each keeps its existing action, now a secondary button with a trailing arrow chip.
- **Counters → `StatCard`,** two per row, 12px gap, glass with an icon chip and a 28px tabular numeral. Add the tracked caps label.
- **Section heading** above the counters becomes an eyebrow (`RIEPILOGO STAGIONE`).
- **Permission-hidden widgets stay absent,** as today. Do not grey them.

## What must not change

- Data, endpoints, caching, retry behaviour.
- Permission gating and the visibility rules that depend on it.
- Grouping, sort order and the "today first" reading order.
- All existing Italian copy, except: previously unlabelled states gain their word (disabled athlete rows, cancelled sessions), and confirm buttons gain their count.
- Navigation structure — five tabs, same stacks, same hub.

## Acceptance checks per screen

1. No opaque white panel anywhere; every content surface is glass or dark glass.
2. Every rectangle uses the signature corner. No symmetric radii.
3. Exactly one AppBar eyebrow + display pair. No duplicate title in the body.
4. Everything sitting in the navy sky uses the on-dark text tone (4.5:1 minimum).
5. The first panel straddles the horizon.
6. 124px bottom clearance; nothing hides under the dock.
7. Only one gradient means "act": the primary button, the active dock puck, a selected tile, the module stripe.
8. Every state shows a word, not just a colour.
9. Tap targets ≥ 44px; selection rows ≥ 64px.
10. Loading, empty, forbidden and error each render a distinct `StateMessage` — a 403 must not look like an empty list.
