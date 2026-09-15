# EasyGame Mobile — component specifications

**Revision:** EGDS v2.3.0 · 2026-09-10 · **CURRENT**
**Scope:** mobile only (Trainer + Parent). No web UI is defined or implied by this document.

This file is the normative visual specification for every component the design system defines. It is written to be implemented against, not admired: each entry states structure, surface, border, shadow, typography, icon treatment, spacing and every state. Where a value is given, it is the value — do not round it to a 4/8px grid.

Shared vocabulary used throughout (all defined in `tokens/signature.css`):

| Term | Value |
| --- | --- |
| **Glass** | `rgba(255,255,255,0.74)` + `blur(18px) saturate(1.4)` |
| **Glass strong** | `rgba(255,255,255,0.88)` + same blur — selected / input / sheet |
| **Dark glass** | `rgba(11,26,58,0.72)` + same blur — dock, sky panels |
| **Hairline** | `rgba(11,26,58,0.08)`; **strong** `rgba(11,26,58,0.14)` |
| **Glass border** | `1px solid rgba(255,255,255,0.7)` |
| **Inner highlight** | `inset 0 1px 0 rgba(255,255,255,0.85)` (dark: `0.18`) |
| **Panel shadow** | `0 12px 32px -10px rgba(11,26,58,0.28), 0 2px 6px rgba(11,26,58,0.06)` |
| **Row shadow** | `0 2px 8px rgba(11,26,58,0.06)` |
| **Signature corner** | panels `22 22 8 22` · controls/tiles `14 14 5 14` · chips `10 10 4 10` · sheets `28 28 0 0` |
| **Action gradient** | `135deg, #3B82F6 → #2563EB 48% → #3533CD` + `1px rgba(255,255,255,0.28)` rim + blue glow |
| **Eyebrow** | 11px/16 · 700 · uppercase · +0.12em · ink 42% (on sky: white 72%) |
| **Display** | 24–26px/28–30 · 800 · −0.02em |
| **Numeral** | 800 · tabular · −0.03em · always larger than the text beside it |
| **Ink** | navy-900 at 100% / 62% / 42% — never pure black, never mid-grey |
| **Press** | controls `scale(0.97) translateY(1px)`, panels/rows `scale(0.985)`, gradient surfaces also `brightness(1.08)`; 120ms `cubic-bezier(.2,.9,.25,1)`; never a colour swap |

Two absolute rules, valid for every component below:

1. **No illustrations.** Icon-based only. The four legacy empty-state illustrations in `assets/illustrations/` are deprecated as of v2.1 and must not be used in the app (they are retained only as brand-archive material). Empty, error, forbidden and loading are drawn with `StateMessage`.
2. **State is never carried by colour alone.** Every state shows at minimum a word plus one of: ring fill, icon, stripe, or border tint. Contrast floor 4.5:1 for text.

---

# Part A — Components formalised from the implementation pass

Built during implementation as same-language extensions, now official. A1–A3 were formalised in v2.1; A4–A5 in v2.2.

## A1 · StateMessage

The single surface for loading, real-empty, forbidden and error. It exists because a 403 or a 500 folded into an empty list is indistinguishable from "nothing scheduled" — the defect this component prevents.

**Structure** (vertical, centre-aligned): 52px icon chip → h4 title → body message (max-width 280) → at most one action. Loading is a variant, not a spinner bolted on: 32px activity indicator → small muted caption, no chip, no action.

| Kind | Icon (Ionicons) | Chip colour | Default Italian title | Action |
| --- | --- | --- | --- | --- |
| `loading` | — (activity indicator) | — | `Caricamento…` | none |
| `empty` | `file-tray-outline` | ink 42% (`#64748B` legacy) | `Nessun elemento` | optional |
| `forbidden` | `lock-closed-outline` | `#EF4444` | `Accesso non consentito` | optional, secondary |
| `error` | `cloud-offline-outline` | `#EF4444` | `Errore di connessione` | `Riprova`, primary |

- **Surface:** none. It sits on whatever is behind it — glass panel, or directly on the Floodlight ground. It never draws its own card.
- **Border / shadow:** none.
- **Tone:** `light` on the mist ground, `dark` in the navy sky (title white, message white 72%, chip `tone="dark"`).
- **Typography:** title h4 20/28 · 600, centred; message body 16/24 · 400 ink 62%; loading caption small 14/20 ink 62%.
- **Icon treatment:** always an Icon Chip at 52px (not a bare glyph) — the chip is what makes it read as EasyGame rather than a generic zero-state.
- **Spacing:** 32px vertical / 24px horizontal padding; 8px gap between elements, 8px extra above the chip and below the message.
- **States:** the four kinds *are* the states. There is no hover, no press (the action button owns press), no disabled.
- **Rules:** exactly one `StateMessage` visible per region. A section inside a populated screen with nothing in it uses a glass panel with one muted line instead ("Nessun allenamento nella giornata corrente."), not a full `StateMessage`.

## A2 · SecondaryScreenLayout

The shell for every non-tab screen: secondary sections, detail views, hub destinations. It is what makes a screen reached from a hub feel like the same product as a tab.

**Structure:** `Floodlight` (sky 300px) → safe-area top inset + 8px → `AppBar` with the back affordance in the trailing chip slot → scrollable content, 16px gutter, 16px top padding, 12px gap between panels, bottom padding = safe-area inset + 40px.

- **Surface:** the Floodlight ground, unchanged. The layout adds no surface of its own.
- **Back affordance:** `arrow-back-outline` in a 40px dark Icon Chip. It sits in the AppBar's **right** slot, not the left — the title keeps the leading edge so the eyebrow/display pair stays the anchor on every screen. Pass `onBack={false}` for a root-of-stack screen that should not offer back.
- **Typography:** AppBar eyebrow + display title (see AppBar). Content sets its own.
- **Spacing:** 16px horizontal, 16px top, 12px between children, 40px + inset bottom. No dock is present on a secondary screen — that clearance is deliberately smaller than a tab screen's 124px.
- **States:** `scrollable` (default) vs fixed content. When the screen's body is a single `StateMessage`, use fixed so the message centres in the viewport rather than sitting at the top of a scroll view.
- **Rule:** no tab bar on a secondary screen. Going back is the only way out. Never show the dock and a back arrow at the same time.

## A3 · SignatureInput

The glass field. This is the only text-entry surface in the app.

**Structure:** eyebrow label → field row (optional 20px leading icon, 14px from the edge, 10px to the text) → error line.

- **Surface:** glass strong. **Border:** `1px` hairline-strong at rest → `1px #2563EB` on focus with a `0 0 0 2px rgba(37,99,235,0.35)` ring plus the blue glow → `1px #EF4444` with a `0 0 0 2px rgba(239,68,68,0.35)` ring on error.
- **Shadow:** inner highlight always; the focus/error ring is the only added shadow.
- **Radius:** control corner `14 14 5 14`.
- **Height:** 52px single-line; 90px minimum for `multiline` with 12px vertical padding and text aligned to the top.
- **Typography:** label eyebrow ink 42%; value 16px · 500 ink 100%; placeholder 16px · 500 ink 42%; error 14px · 600 `#B91C1C`, 6px below.
- **Icon treatment:** leading glyph 20px, ink 42% at rest → `#2563EB` on focus. Trailing icon is a 44px-tall tap target (clear, reveal password) with a 20px glyph, ink 42%, no chip.
- **Spacing:** 6px label→field, 6px field→error, 16px between stacked fields.
- **States:** rest · focus · filled (identical to rest; value weight 500 is the tell) · error · disabled (`rgba(11,26,58,0.06)` fill, hairline border, ink 42% value, no ring) · read-only (glass at 0.5, no border colour change on tap).
- **Rules:** labels are tracked uppercase Italian nouns (`EMAIL`, `NOME E COGNOME`, `MOTIVO DEL RIFIUTO`). Placeholders describe the action. Errors are short and blame nothing (`Credenziali non valide`, `Le password non coincidono`).
- **Deprecation:** the legacy `Input` from the pre-signature system is superseded. New screens use `SignatureInput` only.
- **Accessibility:** the eyebrow label must be programmatically associated with the field (`accessibilityLabel` carrying the label text, not just visual proximity) — a tracked 11px caps label is small, so it can never be the only way to know what a field is. Error text is announced when it appears (`accessibilityLiveRegion="polite"`) and referenced by the field. The leading glyph is decorative (`accessibilityElementsHidden`); the trailing control is a real button with its own label (`Mostra password`, `Cancella ricerca`) and a 44px minimum target. Focus draws `--eg-focus-ring`. Never signal an error with the border colour alone — the red line is mandatory.

## A4 · BottomSheet

Level 4 of the navigation language, formalised. Every modal question in the app uses this shell — attendance, call-ups, child switching, reschedule, upload choice, consent text, payment confirmation. No screen writes its own modal.

- **Structure, top to bottom:** scrim → sheet surface pinned to the bottom edge → 36×4 grabber, centred → content region → the caller's action row as the last child.
- **Content pattern inside the sheet** (the caller supplies it, but the order is fixed): eyebrow (context — what this sheet is about) → h3 title (the question) → body/list → action row: a secondary `Annulla` beside a full-width primary Action Surface whose label states the outcome and, where a count exists, carries it (`Salva 14/18`, `Convoca 11`).
- **Surface:** glass strong (`rgba(255,255,255,0.88)`) with the standard 18px blur. Never opaque, never dark — the sheet is the one place the ground below stays faintly visible through the content, which is what stops it reading as a generic modal card.
- **Scrim:** `--eg-scrim-sheet` (`rgba(7,18,43,0.55)`) plus a 6px blur. It fades with the sheet, not before it.
- **Border:** `1px` glass border on the top and side edges only — no bottom border, the sheet meets the device edge.
- **Shadow:** raised panel shadow (`0 22px 48px -14px rgba(11,26,58,0.38), 0 4px 10px rgba(11,26,58,0.08)`) cast upward, plus the standard inner top highlight.
- **Radius:** `--eg-corner-sheet` = `28px 28px 0 0`. This is the one component that does **not** use the signature cut corner: it has no bottom corners to cut, and the wider 28px top radius is what distinguishes "this arrived over the screen" from "this is part of the screen".
- **Geometry:** full width. Height is content-driven up to `75%` of the viewport, then the content region scrolls while the grabber and the action row stay fixed. Bottom padding = safe-area inset. Horizontal padding 16px; 8px above the grabber, 4px below it; 16px content bottom padding.
- **Typography:** eyebrow ink 42% · title h3 24/32 · 600 −0.02em · body as the content requires. The title is a question or a noun phrase, never a sentence with a full stop.
- **Icon treatment:** no icon in the sheet header — the eyebrow carries the context. Icons appear only inside the content (rows, chips) and as the primary action's trailing arrow chip.
- **Motion:** in 220ms, out 180ms, translate-Y plus scrim opacity, `--eg-ease-spring`. No bounce, no blur animation.
- **Interaction states:** hidden · entering · at rest · scrolled (content region only; the header and action row do not move) · dismissing.
- **Dismissal:** scrim tap, the platform back gesture/button, or `Annulla`. The grabber is a **visual affordance only** until a gesture library is adopted — documented gap, not a missing spec.
- **Usage rules:**
  1. One sheet at a time. A sheet never opens another sheet; it replaces its own content or closes first.
  2. A sheet that mutates data commits only on its primary button. Dismissing is always a cancel, never a save.
  3. Never optimistic: the sheet stays open and inert while a write is in flight, and closes on the server's confirmation. On failure it stays open and renders `StateMessage kind="error"` above the action row.
  4. No nested scroll areas beyond the single content region.
  5. If the answer needs a whole screen — more than one question, or content the parent must read at length — use a secondary screen instead.
- **Accessibility:** the sheet is a modal (`accessibilityViewIsModal`), so everything behind it is removed from the accessibility tree; focus moves to the title on open and returns to the invoking control on close. It has an `accessibilityLabel` equal to its title. The scrim is a labelled dismiss control (`Chiudi`) — never an unlabelled tappable region. The grabber is hidden from assistive tech (it does nothing). Because the platform back action must always dismiss, `onRequestClose` is mandatory. Content is capped at 75% height so the scrim stays visible and the sheet never reads as a full screen with no way out. Respect reduce-motion by skipping the translate and fading only.

## A5 · ParentPrimaryScreenLayout

The shell for the five Parent primary screens. It exists so the child-switcher placement rule lives in exactly one place instead of being repeated per tab.

- **Structure:** `Floodlight` (sky 300px, or 330–360px where the screen opens with a `SectionHero`) → safe-area top inset + 8px → `AppBar` (eyebrow + display title, notification bell as a dark Icon Chip) → `ChildSwitcher` → content region.
- **Surface:** the Floodlight ground. The layout adds no surface; the switcher's dark-glass pill is the only chrome it introduces.
- **Border / shadow:** none of its own.
- **Spacing:** content 16px horizontal, 12px top, 12px gap between panels, **bottom padding = safe-area inset + 124px** (the dock's clearance). The switcher sits 12px below the AppBar and 8px above the content region.
- **Typography:** owned by AppBar and ChildSwitcher; content sets its own.
- **Icon treatment:** bell in a 40px dark chip; the switcher's chevron in a 32px dark chip. Nothing else.
- **Interaction states:** scrollable (default) · fixed (`scrollable={false}` centres a single `StateMessage` in the viewport rather than parking it at the top) · switching (the switcher shows its pending state while the content region shows its own `StateMessage kind="loading"` — the layout does not blank the whole screen) · single child (the switcher renders as a static header, no chevron, no sheet).
- **Usage rules:**
  1. Use it for **all five** Parent primary screens and nothing else. A screen without a dock uses `SecondaryScreenLayout`.
  2. Never show the dock and a back arrow together, and never put a back arrow here — a primary screen is a destination.
  3. Exactly one AppBar eyebrow + display pair per screen. Content must not repeat the title.
  4. The first glass panel should straddle the horizon (~40px overlap into the sky). If the screen opens with a `SectionHero`, raise the sky to 330–360px so the overlap still happens.
  5. Anything rendered in the sky zone uses the on-dark text tone.
  6. The switcher is never conditionally hidden on a primary screen — with one child it becomes static, it does not disappear, so the scope of the data on screen is always stated.
- **Accessibility:** the AppBar title is the screen's heading (`accessibilityRole="header"`), announced on arrival. The child switcher must precede the content in reading order — the scope has to be known before the data. When the selected child changes, the content region announces the new scope politely (`Dati di Marco`), because for a screen-reader user the pill's visual change is otherwise silent. The 124px bottom clearance guarantees the last row is reachable above the dock. Contrast in the sky zone is checked at 4.5:1 against the darkest point of the floodlight pools, not against the average.

---

# Part B — Trainer components still to be built

Already defined in this design system and specified below in full. None of them is a white SaaS card: each one is glass over the Floodlight ground with the signature corner, and each one carries its module identity in a stripe, a tile tone or a gradient.

## B1 · NumberTile

The athlete identity glyph. In EasyGame an athlete is a **jersey number**, not a face and not initials.

- **Structure:** square tile, numeral centred; optional 3-letter role caption under it at 18% of the tile size, 700, +0.1em, 75% opacity.
- **Surface:** a gradient, chosen by state — this is where the tile carries meaning. `navy` (`160deg, #1B3576 → #0B1A3A`) at rest · `action` when called up · `success` when present · `match` in a match context · `muted` (`rgba(11,26,58,0.08)`) when unavailable.
- **Border:** `1px rgba(255,255,255,0.28)` on gradient tones (reads as a rim light); `1px` hairline on `muted`.
- **Shadow:** dark inner highlight on gradient tones, plus the matching glow on `action`/`success`; light inner highlight only on `muted`.
- **Radius:** `14 14 5 14` at ≤48px; `22 22 8 22` at ≥56px.
- **Typography:** numeral at 42% of tile size, 800, −0.03em, tabular, white (ink 42% on `muted`).
- **Icon treatment:** none — the number is the glyph. Never put an icon inside a NumberTile.
- **Sizes:** 44 in rows · 48 in the roster · 56+ in a detail header.
- **States:** default `navy` · active `action`/`success` gradient + glow · pressed — the tile does not press; its parent row does · disabled `muted`, no glow, numeral ink 42%.

## B2 · EventCard

The schedule unit for trainings and matches, and the single most recognisable composition in the product.

- **Structure, left to right:** 3px module stripe along the top edge inset 22px from both sides → **time rail** (76px wide: optional tracked date label, then the start time at 22px/800 tabular, then the end time at 12px/600 ink 42%) → 1px hairline divider → content column (title + Status Pill on one line, meta rows, status line, action row).
- **Surface:** glass. **Border:** glass border. **Shadow:** inner highlight + panel shadow. **Radius:** `22 22 8 22`, content clipped.
- **Module stripe:** action gradient for trainings, match gradient for matches. This is the module's identity and is never omitted.
- **Typography:** date label eyebrow at +0.08em ink 42% · time 22px/24 800 tabular −0.03em · end time 12px/16 600 ink 42% · title 16px/22 700 −0.01em · meta 13px/18 500 ink 62% · status 12px/16 600 in the status colour.
- **Icon treatment:** meta icons 15px outline, ink 42% (or the status colour when the row *is* the status); the status line uses an 8px dot with a 3px halo of its own colour at 18%, not an icon.
- **Spacing:** rail padding `18 0 16 16`; content padding `16 16 16 14`; 10px title→meta; 6px between meta rows; 10px meta→status; 14px status→actions; 8px between action buttons. Cards stack 12px apart.
- **Default state:** as above, status dot green, `Allenamento attivo` / no status line for matches.
- **Active state (today / in progress):** the card sits in the "today" group at the top of the screen; the status dot is green with its halo. No extra fill or scale — position and the stripe carry it.
- **Pressed:** `scale(0.985)` + `brightness(1.03)` when the whole card is tappable. If the card has action buttons, the card itself is not tappable — one tap target per row of intent.
- **Disabled / cancelled:** border becomes `1px dashed` hairline-strong, shadow removed, surface drops to `rgba(255,255,255,0.5)`, opacity 0.82, the stripe turns hairline-strong grey, the time is struck through in ink 42%, the status line turns red with `Allenamento annullato`. Actions reduce to a single `Ripristina`.
- **Error/success:** an attendance save failure does not mark the card — it raises a `StateMessage` in the sheet. A successful save updates the headcount meta row (`14/18 presenti`) and nothing else; no toast, no flash.

## B3 · SelectableAthleteRow

The core interaction of the Trainer MVP: attendance and call-ups, one tap per athlete, usable with cold hands on a touchline.

- **Structure:** 44px NumberTile → name / (role · state) → 28px ring toggle on the trailing edge. The **whole row** is the tap target; there is no nested control.
- **Surface:** glass at rest → glass strong when selected.
- **Border:** glass border at rest → `1px` accent at 40% when selected (`#22C55E` attendance, `#2563EB` call-ups).
- **Shadow:** inner highlight + row shadow at rest → inner highlight + `0 8px 22px -10px` accent at 50% when selected.
- **Radius:** `14 14 5 14`. **Min height:** 64px. **Rows stack 8px apart.**
- **Typography:** name 15px/20 700 −0.01em · role 12px/16 500 ink 42% · state word 12px/16 600 in the accent colour when selected, ink 62% when not.
- **Icon treatment:** the ring — 28px circle, `2px` border ink 22% over white 60% at rest; filled with the accent, a white 16px `checkmark`, and a `0 0 0 4px` accent-26% halo when selected. No checkbox, no switch, no chevron.
- **State redundancy (mandatory):** selection is shown four ways at once — tile gradient, ring fill + halo, border tint, and the Italian word (`Presente`/`Assente`, `Convocato`/`Non convocato`).
- **Pressed:** row `scale(0.985)`, 120ms.
- **Disabled:** row opacity 0.55, tile `muted`, ring stays hollow at ink 22%, no tap. The state word states the reason (`Infortunato`, `Squalificato`) — a disabled row must always say why it is disabled.
- **Success:** on save, the sheet closes and the parent EventCard's headcount updates. The row itself shows no success state.

## B4 · SectionHero

The screen-opening block. It lives **in the navy sky**, has no box, and answers "what about today?" before any panel.

- **Structure:** optional 44px dark Icon Chip → eyebrow → 24px/800 display title → supporting line (max-width 300) → row of glass stat chips → optional slot (e.g. a search field).
- **Surface:** transparent. The Floodlight sky is the surface. Never give SectionHero a fill — that was the old flat-blue-rectangle pattern and is banned.
- **Stat chips:** `rgba(255,255,255,0.1)` fill, `1px rgba(255,255,255,0.18)` border, dark inner highlight, blur, corner `10 10 4 10`, padding `8 12`; value 18px/20 800 tabular, label 11px/14 600 uppercase +0.06em white 72%. Maximum three chips.
- **Typography:** eyebrow white 72%; title white; subtitle small 14/20 white 72%.
- **Icon treatment:** one dark Icon Chip at 44px, tinted with the module colour. No decorative icons.
- **Spacing:** padding `18 20 8`; 14px chip→text; 4px eyebrow→title; 6px title→subtitle; 14px above the stat row; 8px between chips.
- **States:** populated (`2 allenamenti`) vs zero (`Nessun allenamento` — the title states it; the stat chips still render with `0`, they do not disappear). No press, no disabled.
- **Rule:** the first glass panel below a SectionHero must start roughly 40px before the sky ends, so it visibly straddles the horizon. That overlap is a signature cue, not a coincidence.

## B5 · StatCard

The counter tile. Two per row, 12px gap.

- **Structure:** top row (34px Icon Chip on the left, 8px status dot with a 3px 26%-tint halo on the right) → 28px/30 numeral → tracked caps label.
- **Surface:** glass. **Border:** glass border. **Shadow:** inner highlight + panel shadow. **Radius:** `22 22 8 22`. **Padding:** 14px. **Internal gap:** 10px.
- **Typography:** value 28px/30 800 tabular −0.03em ink 100%; label 11px/16 700 uppercase +0.1em ink 42%. The number is always visually dominant over its label.
- **Icon treatment:** Icon Chip tinted from the module hex (12% fill, 25% border).
- **States:** default · loading (numeral replaced by a 20×28 hairline placeholder block, label unchanged — never a spinner inside the tile) · empty (`0`, not `—`) · pressed only if it navigates (`scale(0.985)`) · disabled not applicable.
- **Rule:** a StatCard is a fact, never an action. If it needs a button, it is a HighlightCard.

## B6 · HighlightCard

The dashboard module block. Replaces the solid colour slabs of v1.

- **Structure:** 3px module stripe (inset 22px) → header row (36px Icon Chip → eyebrow + title → large count numeral) → up to two preview rows on a soft inset surface → one full-width secondary action with a trailing arrow chip.
- **Surface:** glass. **Preview rows:** `rgba(11,26,58,0.04)` with a `1px` hairline border, corner `10 10 4 10`, padding `10 12`.
- **Border:** glass border. **Shadow:** inner highlight + panel shadow. **Radius:** `22 22 8 22`. **Padding:** 16px.
- **Typography:** eyebrow ink 42% · title 16px/22 700 −0.01em · count 22px/24 800 tabular in the module colour · preview time 15px/18 800 tabular in the module colour, min-width 44 · preview title 14px/18 600 · preview meta 12px/16 500 ink 42%.
- **Icon treatment:** one Icon Chip at 36px in the module tint; the action's arrow sits in its own highlight chip.
- **Spacing:** 12px header→body; 6px between preview rows; 12px body→action.
- **Module colours (fixed, product-wide):** trainings `#2563EB` / action gradient · matches `#F97316` / match gradient · reminders & payments-good `#10B981` / success gradient · documents & deadlines `#F59E0B` / warning gradient.
- **States:** populated · empty (preview rows replaced by one muted line, `Nessuna gara oggi.`; the count reads `0`; the action stays) · pressed — the card is not tappable, its action button is · disabled: the whole card is hidden by permission rather than greyed. A module the club has switched off does not appear.
- **Rule:** at most two preview rows. The action opens the full list; the card never scrolls internally.

---

# Part C — Parent-area components

New for the Parent phase. Every one of them follows Part B's surface grammar; none introduces a new surface type. Where a state machine exists on the server, the component renders the transitions it is given — it never hard-codes a fixed set of buttons.

## C1 · ChildSwitcher

For a parent with more than one linked athlete, including children at **different clubs**. This is the Parent area's most important piece of chrome: everything below it is scoped to the selected child.

- **Placement:** in the navy sky, immediately under the AppBar, on every primary Parent screen. Not in the dock, not buried in the profile.
- **Collapsed structure (the resting form):** a dark-glass pill, 56px tall, corner full — child NumberTile or 36px avatar with a `2px` child-accent ring → name 15px/20 700 white → club eyebrow 11px 700 uppercase white 72% → `chevron-down-outline` 18px white 72% in a 32px dark chip. Full width minus the 20px gutters.
- **Expanded structure:** a bottom sheet (`28 28 0 0`, glass strong, grabber, eyebrow `I TUOI FIGLI`, then one row per child): NumberTile/avatar with the child accent ring → name + club + category → a 28px ring toggle, filled when active. Children are grouped by club, each group under a club eyebrow with the club avatar at 20px.
- **Child accent:** each child is assigned a stable accent from `--eg-child-1…4` in link order. The accent appears as the ring around their tile and as a 3px stripe on their scoped cards. It is an aid, never the only identifier — the name is always present.
- **Border:** `1px rgba(255,255,255,0.22)` collapsed; glass border in the sheet.
- **Shadow:** dark inner highlight + dock shadow collapsed (it floats over the sky); panel shadow raised in the sheet.
- **Icon treatment:** chevron in a dark chip collapsed; ring toggles in the sheet — the same ring as the Athlete Row, so "this one is selected" looks the same everywhere in the product.
- **States:** single child (renders as a **static** header, no chevron, no sheet — never a one-item picker) · multi-child collapsed · expanded · switching (the pill shows the incoming child's name with the ring in a 60%-opacity pending state while data loads; screens below show their own `StateMessage kind="loading"`) · error (pill stays on the previous child, a `StateMessage kind="error"` appears in the content area — the switcher never lands on an unknown child) · disabled not applicable.
- **Cross-club rule:** switching to a child at another club changes the active club context. The pill's club eyebrow is what tells the parent this happened; that line is mandatory whenever the parent has children at more than one club.

## C2 · RSVPControl

The parent's answer to a training or match invitation. Lives inside the child's EventCard, replacing the trainer's action row.

- **Structure:** a segmented glass control, full width, 52px, corner `14 14 5 14`, two segments (`Ci sarà` / `Non ci sarà`) plus a leading state label above it (eyebrow + deadline). The chosen segment becomes a gradient Action Surface; the other stays glass.
- **Surface:** track glass strong; selected segment action gradient (`Ci sarà`) or destructive gradient (`Non ci sarà`); unselected segment transparent over the track with ink 62% text.
- **Border:** track `1px` hairline-strong; selected segment `1px rgba(255,255,255,0.28)` rim.
- **Shadow:** track inner highlight; selected segment inner highlight + matching glow.
- **Typography:** segment label 14px/20 700; the answered state also writes the answer as a Status Pill on the EventCard (`Presente confermato` / `Assenza comunicata`).
- **Icon treatment:** 18px `checkmark-circle` / `close-circle` inside the selected segment only. Unselected segments carry no icon — that asymmetry is what makes the answer readable at a glance.
- **States:**
  - **pending** — neither segment selected, track hairline, eyebrow reads `RISPOSTA RICHIESTA` in `#B45309`, deadline line beneath (`Entro giovedì 18:00`). The EventCard also shows an amber Status Pill `Da confermare`.
  - **attending** — left segment action gradient + glow + check.
  - **not attending** — right segment destructive gradient + glow + cross.
  - **updating** — the pressed segment shows a spinner in place of its icon, both segments inert, track at 0.7 opacity. Never optimistic: the answer only changes when the server confirms.
  - **disabled** — after the deadline or when the club has closed RSVP: track `rgba(11,26,58,0.06)`, labels ink 42%, no gradient, and a caption states why (`Termine scaduto`, `Risposte chiuse dal club`). The last given answer remains visible as a Status Pill.
  - **error** — the segment reverts, and an inline 13px/600 `#B91C1C` line appears under the control (`Risposta non salvata. Riprova.`) with a `Riprova` ghost action. No toast.
- **Rule:** RSVP is never a checkbox and never a switch. Two explicit, equally weighted options — "no answer" and "no" must be visually distinct, which a switch cannot do.

## C3 · PaymentCard

An instalment or fee. Money is the most sensitive surface in the Parent area: the amount and its state must be readable in one glance, without colour being the only signal.

- **Structure:** 3px module stripe (state-coloured) → header (eyebrow = plan or fee name, title = what it is for) → **amount block**: amount at 28px/30 800 tabular, and where partially paid, `già versato €120 di €300` at 13px/500 ink 62% plus a 4px progress rail → due-date meta row → Status Pill → action row.
- **Progress rail:** 4px, full-radius, `rgba(11,26,58,0.08)` track with a success-gradient fill. Shown **only** in the partially-paid state.
- **Surface:** glass. **Border:** glass border, except overdue (see states). **Shadow:** inner highlight + panel shadow. **Radius:** `22 22 8 22`. **Padding:** 16px.
- **Typography:** amount 28px/30 800 tabular −0.03em — the largest text on the card, always; currency symbol at the same size, never superscripted. Due date 13px/18 500 ink 62%, and in the overdue state 13px/600 `#B91C1C`.
- **Icon treatment:** `calendar-outline` 15px for the due date, `receipt-outline` for a receipt, `download-outline` for the invoice. The `Paga ora` button carries no leading icon — a trailing arrow chip only.
- **Spacing:** 12px header→amount; 8px amount→rail; 10px rail→meta; 12px meta→actions.
- **States:**

| State | Stripe | Amount ink | Pill | Actions |
| --- | --- | --- | --- | --- |
| **due** (`Da saldare`) | action gradient | ink 100% | `primary` · `Da saldare` | `Paga ora` primary + arrow chip |
| **partially paid** (`Parzialmente pagato`) | warning gradient | ink 100% + rail | `warning` · `Parzialmente pagato` | `Salda il resto` primary |
| **paid** (`Saldato`) | success gradient | `--eg-money-paid`, and the amount is **not** enlarged further | `success` · `Saldato` | `Ricevuta` secondary (only if the club issues one) |
| **overdue** (`Scaduto`) | destructive gradient | `--eg-money-due` | `destructive` · `Scaduto il 3 gen 2026` | `Paga ora` primary; the due-date row turns red and states the days overdue |
| **processing** | action gradient at 0.5 | ink 42% | `default` · `Pagamento in corso` | none; card inert at 0.7 opacity |
| **disabled / not payable** | hairline grey | ink 42% | `default` with the reason | none, plus a caption (`Pagamento gestito in segreteria`) |

- **Overdue border exception:** overdue is the only card in the system allowed a coloured border — `1px rgba(239,68,68,0.35)`. It is the one state where the card must be findable while scrolling.
- **Error:** a failed payment start shows an inline red line and keeps the card in `due`; it never silently becomes `processing`.
- **Rules:** never show a bare number without its currency and its state word. Never use a progress bar in any state but partially paid. Never put two primary actions on one PaymentCard.

**Refined for implementation (v2.2)**

- **Currency format is fixed:** `it-IT`, decimal comma, thousands dot, symbol trailing after a non-breaking space — `300,00 €`, `1.250,00 €`. Always two decimals, never abbreviated (`1,2k €` is forbidden), always tabular so a list of instalments aligns on the comma.
- **Data contract:** the card renders the state and label the server gives it. It must not derive "overdue" from a client clock — a family reading `Scaduto` the day they paid was a real defect in the web dashboard. If the server sends both a machine state and an Italian label, the label wins for display and the state drives only styling.
- **Progress rail geometry:** 4px tall, full radius, 8px below the amount block, track `rgba(11,26,58,0.08)`, fill success gradient, minimum visible fill 4px so a 1% payment is still visible.
- **Amount block hierarchy:** the amount is the largest text on the card in every state, including `Saldato`. The paid state changes its colour, never its size — shrinking a settled amount makes a scanned list jump.
- **Days-overdue line:** `Scaduto da 12 giorni` on its own meta row, 13px/600 `--eg-money-due`, only in the overdue state.
- **Accessibility:** the card is one accessibility element in read-only states, with a composed label in the order a person would ask — amount, purpose, state, due date (`300,00 euro, quota di iscrizione, scaduto il 3 gennaio 2026`). The progress rail is not an image: expose `accessibilityValue` (`{min:0,max:300,now:120}`) **and** keep the visible `già versato 120,00 € di 300,00 €` text — the rail alone must never be the only carrier. The overdue coloured border is decorative; the red date text and the pill word are what convey it. `Paga ora` is a separate focusable button with a label that names the amount (`Paga ora 300,00 €`), never a bare "Paga ora" out of context. While processing, the card is `accessibilityState={{disabled:true}}` and the state change is announced politely.

## C4 · DocumentRow / DocumentCard

Two densities of the same thing. **DocumentRow** for a list (medical certificates, ID, forms). **DocumentCard** when a document needs its own block with a preview line and two actions.

- **Row structure:** 40px Icon Chip (state-tinted, document-type glyph) → title 15px/20 700 + meta 12px/16 500 ink 42% (`Scade il 1 giu 2027`, `Caricato il 12 set 2026`) → Status Pill → trailing action (`download-outline` or `cloud-upload-outline` in a 40px chip, or `chevron-forward-outline` 16px if the row navigates).
- **Card structure:** Row plus a stripe, an optional requirement note in a hairline inset box, and an action row with up to two buttons.
- **Surface:** glass. **Border:** glass border; expired uses `1px rgba(239,68,68,0.35)`. **Shadow:** inner highlight + row shadow (row) or panel shadow (card). **Radius:** `14 14 5 14` (row) · `22 22 8 22` (card). **Row min height:** 64px, 8px apart.
- **Icon treatment:** the chip's glyph names the document type (`medkit-outline` medical, `card-outline` ID, `document-text-outline` form), and the chip's tint carries the state. Action glyphs sit in chips; nothing is a bare 24px icon.
- **States:**

| State | Chip tint | Pill | Trailing action |
| --- | --- | --- | --- |
| **available / valid** (`Valido`) | `#10B981` | `success` · `Valido` | download chip |
| **required** (`Richiesto`) | `#F59E0B` | `warning` · `Richiesto` | upload chip, and the row states what is needed |
| **uploaded, awaiting review** (`In verifica`) | `#2563EB` | `primary` · `In verifica` | download chip; upload disabled |
| **expiring** (`In scadenza`) | `#F59E0B` | `warning` · `Scade il …` | upload chip (replace) |
| **expired / error** (`Scaduto`) | `#EF4444` | `destructive` · `Scaduto il …` | upload chip, coloured border |
| **missing** (`Mancante`) | ink 42% | `default` · `Mancante` | upload chip |
| **uploading** | `#2563EB` at 0.5 | `default` · `Caricamento…` | spinner in the chip, row inert |
| **disabled** | ink 42% | `default` + reason | none |

- **Upload feedback:** progress is shown in the trailing chip (spinner), never as a full-width bar. Success replaces the state in place — pill flips to `In verifica`, meta gains the upload date. Failure shows an inline red line with `Riprova`; the file is not silently dropped.
- **Rule:** never render a download action for a file the app cannot actually open. Where authenticated download is not yet implemented, the row shows metadata and state with no action — an action that reliably fails is worse than none.

**Refined for implementation (v2.2)**

- **Row vs card, decided:** use **DocumentRow** whenever the document is one item in a list. Use **DocumentCard** only when the document carries a requirement note the family must read, or two actions. A list must not mix the two densities.
- **Expiry thresholds:** `In scadenza` covers the 30 days before the due date; before that the state is `Valido` with the date in the meta line. Both thresholds and labels come from the server when it supplies them; the client never recomputes an expiry it was given.
- **Undated documents:** a document that exists but declares no expiry renders `Valido` with `Data di scadenza non disponibile` in the meta line — never a blank line, and never `Scaduto` inferred from a missing date.
- **Upload constraints stated up front:** accepted formats and the size cap appear in the requirement note *before* the picker opens, not as an error afterwards.
- **One action per row:** upload and download never appear together on a row. If both are legitimate (replace an expiring file, keep the old one), that is a DocumentCard with two buttons.
- **Accessibility:** each row is one element labelled type, title, state, date (`Certificato medico, valido, scade il 1 giugno 2027`); the trailing chip is a separate button (`Scarica certificato medico`, `Carica certificato medico`). The state chip tint is decorative — the pill word carries the state, since six of the eight states differ only by hue. Upload progress is announced at start and end only, not continuously. A file input must be reachable by keyboard/switch control, and the 40px chip is padded to a 44px hit target.

## C5 · ConsentRow

A privacy or club consent the family grants or revokes. Legally meaningful, so it is the plainest component in the system.

- **Structure:** 40px Icon Chip (`shield-checkmark-outline`) → title 15px/20 700 + version/date meta 12px/16 500 ink 42% (`Accettato il 4 set 2026 · v2`) → Status Pill → trailing `chevron-forward-outline` when the full text is readable.
- **Surface / border / shadow / radius:** identical to DocumentRow. **Min height 64px, 8px apart.**
- **Action placement:** the accept/revoke action is **not** a trailing icon. It is an explicit button on its own line inside the row's expanded state, or on the consent's detail screen — a consent is never granted by a tap that could be mistaken for navigation.
- **States:**
  - **accepted** — chip `#10B981`, pill `success` · `Accettato`, meta carries the date and version, action `Revoca` (secondary, not destructive-gradient — revoking is legitimate, not dangerous).
  - **required** — chip `#F59E0B`, pill `warning` · `Richiesto`, action `Leggi e accetta` primary. If it blocks something, the row says so (`Necessario per le convocazioni`).
  - **revoked** — chip ink 42%, pill `default` · `Revocato il …`, action `Accetta di nuovo`.
  - **updating** — pill `default` · `Aggiornamento…`, row inert at 0.7, spinner in the chip.
  - **superseded** — a new version exists: pill `warning` · `Nuova versione da accettare`, and the previously accepted version stays visible in the meta line. Never overwrite the old record in the UI.
  - **disabled** — the club manages it offline: pill `default`, caption states where.
- **Rule:** no switches. A toggle implies a reversible preference; a consent is a dated legal act, so it uses labelled buttons and keeps its history in the meta line.

**Refined for implementation (v2.2)**

- **The row never grants consent.** Accepting always happens on a detail screen (`SecondaryScreenLayout`) or in a `BottomSheet` that shows the full text, with the primary action below it. The row's tap navigates; it never mutates. This is the one place in the system where a one-tap action is deliberately refused.
- **Version is part of the identity:** the meta line always carries the version and the dated act (`Accettato il 4 set 2026 · v2`). When a new version supersedes an accepted one, both facts stay visible: pill `Nuova versione da accettare`, meta `Accettato il 4 set 2026 · v1`.
- **Revoke is not destructive styling.** `Revoca` is a secondary button. The destructive gradient is reserved for deletion and logout; revoking a consent is a legitimate right, and colouring it as danger discourages a lawful choice.
- **Blocking consequences are stated, not implied:** a required consent that gates a feature says so on the row (`Necessario per le convocazioni`).
- **Accessibility:** the row is one element labelled title, state, date and version; because the whole row is a navigation target its role is `link`, not `checkbox` — an assistive-tech user must never be told this is a toggle. The consent's full text on the detail screen is selectable and scalable to 200% without truncation, and the accept button remains visible above the fold at that size or the screen scrolls to it. State changes are announced assertively (a legal act deserves interruption, unlike a notification).

## C6 · NotificationRow

- **Structure:** 8px unread dot (leading, in the 20px gutter — not a badge on the icon) → 40px Icon Chip → title 15px/20 (700 unread, 500 read) + one-line body 13px/18 ink 62%, clamped to two lines → timestamp 11px/16 600 ink 42%, top-right → optional trailing chevron.
- **Surface:** glass strong when unread, glass at 0.6 when read. **Border:** glass border; priority uses `1px rgba(239,68,68,0.3)`. **Shadow:** inner highlight + row shadow (unread) / inner highlight only (read). **Radius:** `14 14 5 14`. **Min height 64px, 8px apart.**
- **Icon treatment:** chip tint by category — operational/club `#2563EB`, payments `#F59E0B`, documents `#10B981`, priority `#EF4444`. Glyph names the category (`megaphone-outline`, `card-outline`, `document-text-outline`, `alert-circle-outline`).
- **Typography:** the unread/read difference is carried by **weight and surface**, not by colour — 700 on glass strong vs 500 on flatter glass. Timestamps are relative under 24h (`2 ore fa`), then absolute (`12 set · 18:40`), tabular.
- **States:** unread · read · priority (coloured border, pill `destructive` · `Urgente`, and it never collapses into a group) · pressed `scale(0.985)` · grouped (a day eyebrow above a run of rows: `OGGI`, `IERI`, `12 SETTEMBRE`) · disabled not applicable.
- **Rule:** marking as read is a side effect of opening, never a separate control on the row. The screen offers one `Segna tutte come lette` secondary action in the header area.

## C7 · AppointmentCard

A secretariat appointment. The state machine lives on the server; the card renders the transitions it is handed.

- **Structure:** EventCard's grammar with a **date rail** instead of a time rail (76px: day name eyebrow, day number 22px/800, month 12px/600), then title (`Colloquio segreteria`), meta rows (location or channel, who requested it, reference), Status Pill, and an action row built from the server's allowed transitions.
- **Surface / border / shadow / radius:** as EventCard. **Stripe:** state-coloured, not module-coloured — appointments are the one place the stripe carries state, because their state changes more often than their category matters.
- **Typography:** as EventCard; the reschedule proposal, when present, appears as a second, smaller time line in the rail with the original struck through.
- **Icon treatment:** meta glyphs 15px outline; no icons in the buttons except a trailing arrow chip on the single primary action.
- **States:**

| State | Stripe | Pill | Typical actions |
| --- | --- | --- | --- |
| **requested** (`Richiesto`) | warning gradient | `warning` · `Richiesto` | `Annulla richiesta` secondary |
| **confirmed** (`Confermato`) | action gradient | `primary` · `Confermato` | `Disdici` secondary |
| **rescheduled** (`Riprogrammato`) | neutral gradient | `default` · `Riprogrammato` | `Accetta nuovo orario` primary, `Rifiuta` secondary |
| **cancelled** (`Annullato`) | hairline grey | `destructive` · `Annullato dal club` / `Annullato dalla famiglia` | `Richiedi di nuovo` secondary |
| **completed** (`Concluso`) | success gradient | `success` · `Concluso` | none |
| **no-show** | hairline grey | `destructive` · `Assente` | none |
| **updating** | current stripe at 0.5 | `default` · `Aggiornamento…` | inert at 0.7 |

- **Cancelled treatment:** dashed border, struck date, 0.82 opacity — the same visual grammar as a cancelled EventCard, so "this is off" looks identical across the product.
- **Mandatory reason:** any negative transition (reject, cancel, decline) opens a sheet with a required `SignatureInput` for the reason. The reason is then shown in the card's meta line. A cancellation without a visible reason is a defect.
- **Rule:** never render three fixed buttons. The action row is exactly the transitions the server allows, in order: primary = the affirmative one, secondary = the rest.

**Refined for implementation (v2.2)**

- **Transitions are data.** The card receives the allowed transitions and renders them in order: at most one primary (the affirmative), the rest secondary, ghost for a tertiary. Zero transitions is a valid, common case — a completed or cancelled appointment has no action row at all, and the row must collapse rather than leave empty space.
- **Reason capture:** every negative transition opens a `BottomSheet` with a **required** multiline `SignatureInput` (90px minimum) and a primary button that stays disabled until the field has content. The saved reason is then shown in the card's meta line with its author (`Annullato dal club · "Palestra non disponibile"`). A cancellation with no visible reason is a defect.
- **Reschedule rail:** when a new time is proposed, the rail shows the proposed date at full weight and the original struck through beneath it at 12px/600 ink 42%. Two dates, one rail — never two cards for one appointment.
- **Cancelled-by whom is always explicit:** `Annullato dal club` vs `Annullato dalla famiglia`. Never a bare `Annullato`.
- **Free-text date entry is a declared gap.** Until a native date/time picker is a dependency, reschedule fields accept `AAAA-MM-GG` / `HH:MM` with the format shown as the placeholder *and* as a persistent hint under the field — never only in an error message.
- **Accessibility:** the date rail is composed into one spoken date (`mercoledì 18 marzo`), not read as three fragments; the proposed/original pair is spoken as `nuovo orario 15:30, precedente 10:00`. Each transition is a distinct button whose label includes the subject (`Disdici appuntamento del 18 marzo`). The struck-through original relies on `text-decoration`, which assistive tech ignores, so the word `precedente` is mandatory in the label. Status changes are announced politely.

## C8 · BookingCard

A structure/facility booking (a hall, a pitch, a slot).

- **Structure:** date rail (as AppointmentCard) → structure name as title → meta rows: `location-outline` address, `time-outline` slot window, `people-outline` who it is for → Status Pill → action row. Where the club charges for the slot, the fee appears as a 15px/800 tabular amount on the meta line, not as a PaymentCard.
- **Surface / border / shadow / radius:** as EventCard. **Stripe:** state-coloured (bookings behave like appointments, not like modules).
- **Icon treatment:** `business-outline` in a 36px chip beside the title when the structure has no other identifier.
- **States:** available (a bookable slot — `Prenota` primary + arrow chip) · requested (`Richiesta inviata`, warning) · confirmed (`Confermata`, action stripe, `Disdici` secondary) · cancelled (dashed, struck, `Annullata`) · completed (`Conclusa`, success) · full (`Nessun posto disponibile`, ink 42%, no action, and it stays visible rather than disappearing) · updating (inert 0.7) · disabled (club has bookings off: card hidden, not greyed).
- **Rule:** a slot the family cannot book still shows its state and its reason. Silently hiding unavailable slots makes the calendar look empty.

**Refined for implementation (v2.2)**

- **Same grammar as AppointmentCard, on purpose.** A booking and an appointment are the same shape with a different noun; a family should not have to learn two card types. The only differences: a 36px `business-outline` chip beside the title when the structure has no avatar, and the slot window as a mandatory `time-outline` meta row (`18:00 – 19:30`, en dash, tabular).
- **Fee inline, never a PaymentCard:** where the slot costs money, the amount sits on a meta row at 15px/800 tabular in the same `it-IT` format. A booking that generates an actual instalment links to it (`Vedi in Pagamenti`) instead of duplicating the payment surface.
- **Capacity:** where the structure exposes it, show `3 posti su 12` as a meta row; the `full` state reads `Nessun posto disponibile` and keeps the card visible with no action.
- **Conflict state added:** a slot that clashes with the child's own training or match renders `In conflitto con un allenamento` as a warning pill with the clashing event named in the meta line, and the `Prenota` action remains available — the family decides, the app informs.
- **Accessibility:** the card is one element (date, structure, slot window, state), with each transition as its own labelled button naming the structure and time. The `full` and `disabled` states carry `accessibilityState={{disabled:true}}` plus the spoken reason, so an unreachable slot is never silently unfocusable. Availability is never conveyed by colour alone — every state has its word.

## C9 · EnrollmentStatusCard

**Rewritten in v2.3 to match the real data contract.** The multi-step progress rail specified in v2.1–v2.2 is **removed**: the backend exposes an enrollment *status* (plus a plan and a balance), not a state per phase. Per-phase progress exists only at application level (`sent` / `in_review` / `approved` / `rejected`) and is shown as separate rows elsewhere. A rail built from data that does not exist would have been a drawn assumption, so it is gone. **Do not reintroduce progress steps, phase dots, percentages or "step 2 of 4" language in this card.**

The card answers one question — *where does my child's enrollment stand, and is there anything for me to do?* — using only fields the API actually returns.

- **Structure** (single column, top to bottom): header row (40px dark Icon Chip `clipboard-outline` → eyebrow = season → h3 title = the status in plain Italian) → Status Pill → supporting line → at most one CTA.
- **Surface:** **dark glass** (`rgba(11,26,58,0.72)` + 18px blur). This card belongs in the navy sky at the top of the Parent home, above the mist content — that placement is what gives it primacy without needing a rail or a coloured slab.
- **Border:** `1px rgba(255,255,255,0.14)`.
- **Shadow:** dark inner top highlight + raised panel shadow.
- **Radius:** `22 22 8 22`. **Padding:** 20px. **Internal gaps:** 12px chip→text, 8px header→pill, 8px pill→supporting line, 4px above the CTA. Card sits 12px above the content below it.
- **Status emphasis** — the hierarchy is title, then pill, in that order:
  - The **title** states the status as a short Italian phrase at h3 20–24px/700 white. It is the primary carrier: `Iscrizione attiva`, `Iscrizione da avviare`, `In verifica dal club`, `Rinnovo disponibile`, `Iscrizione sospesa`.
  - The **Status Pill** repeats the machine state as a tracked caps word with its ring-dot, giving the colour signal: `success` active/approved · `primary` submitted/in review · `warning` action needed / renewal available / documents outstanding · `destructive` blocked/rejected · `default` not enrolled or unknown.
  - The **supporting line** (small 14/20, white 72%) carries the one concrete fact the API provides — an outstanding balance, a count of missing documents, a renewal window, a rejection reason. Where the API returns nothing, the line is omitted; it is never padded with invented text.
- **Icon treatment:** exactly one 40px dark Icon Chip in the header. No dots, no rail, no per-state icon swap — the glyph is always `clipboard-outline` so the card is recognisable at a glance regardless of state. The CTA carries a trailing arrow chip.
- **Typography:** eyebrow 11/700 caps +0.12em white 72% · title h3 −0.02em white · pill 10/700 caps · supporting 14/20 500 white 72% · CTA 13/700.
- **CTA placement:** one action, last element, left-aligned, `onDark` variant (translucent white on the dark glass — a filled gradient button on dark glass over the sky is too much light in one place). It **names the real next task the API supports** — `Completa l'iscrizione`, `Carica i documenti richiesti`, `Vai ai pagamenti`, `Rinnova per la stagione 2027/28`. Never `Continua`, never `Vedi dettagli`. Where the next task lives in another section, the CTA navigates there. **Zero CTAs is a normal, common case** — active and in-review states have no action, and the card must close cleanly after the supporting line with no empty space reserved.
- **Supported states** (only these; each must be derivable from a returned field):

| State | Title | Pill | Supporting line | CTA |
| --- | --- | --- | --- | --- |
| **enrolled / active** | `Iscrizione attiva` | `success` · `Attiva` | plan name or balance if returned | none |
| **not enrolled** | `Iscrizione da avviare` | `default` · `Non iscritto` | what the club requires, if stated | `Avvia iscrizione` |
| **application sent** | `Domanda inviata` | `primary` · `Inviata` | send date if returned | none |
| **application in review** | `In verifica dal club` | `primary` · `In verifica` | `Il club ti avviserà` (or the club's stated timing) | none |
| **pending actions** | `Iscrizione da completare` | `warning` · `Azione richiesta` | what is outstanding, as returned | names the task |
| **pending documents** | `Documenti da caricare` | `warning` · `2 documenti richiesti` | the document names if returned | `Carica i documenti` |
| **renewal available** | `Rinnovo disponibile` | `warning` · `Rinnovo` | the window, only if the API returns it | `Rinnova` |
| **blocked / rejected** | `Iscrizione sospesa` / `Domanda rifiutata` | `destructive` · returned label | the reason, **mandatory** when returned | whatever unblocks it, if any |

- **Loading state:** the shell renders in place — dark glass, border, shadow, chip and eyebrow all present — with the title replaced by a 180×24 placeholder bar at white 14% (full radius) and the pill by a 90×22 placeholder pill. No spinner inside the card, no layout shift when the data lands. If the whole Parent home is loading, the screen's own `StateMessage kind="loading"` covers it and this card is not rendered at all.
- **Empty state:** if the API returns no enrollment object for the selected child, the card is **not rendered**. There is no "no enrollment" placeholder card — an absent enrollment is absence, not a state. (`not enrolled` is a returned status and is a real state; a missing object is not.)
- **Disabled state:** where the club manages enrollment offline, the card renders normally with the pill `default`, the supporting line stating where (`Gestita in segreteria`), and **no CTA**. It is never greyed out — a dimmed card in the sky reads as broken. A card the club has switched off entirely is absent, per the system-wide permission rule.
- **Warning state:** pill `warning`, and the supporting line carries the specific fact (`2 documenti richiesti`, `Rinnovo entro il 31 luglio`). No coloured border, no fill change — the pill and the title carry it.
- **Error state:** pill `destructive`, title states the outcome, supporting line carries the returned reason. This is the only state permitted a coloured border — `1px rgba(239,68,68,0.35)` — because a suspended enrollment must be findable while scrolling. If the *fetch* failed (as opposed to the enrollment being blocked), the card is not rendered and the screen shows `StateMessage kind="error"`; a data-fetch failure must never be dressed as a domain state.
- **Usage rules:** one card per child, scoped by the selected child, carrying that child's accent as a 3px stripe when the parent has more than one. It sits above all mist content on the Parent home. It appears nowhere else — a detail screen shows the enrollment's full application rows instead.
- **Accessibility:** the card is one accessibility element, spoken in the order a person would ask: season, status title, pill word, supporting fact (`Stagione 2026/27, documenti da caricare, azione richiesta, 2 documenti richiesti`). The CTA is a separate focusable button whose label names the task and the child (`Carica i documenti di Marco`). Placeholder bars in the loading state are hidden from assistive tech and the card announces `Caricamento stato iscrizione`. White text on dark glass over the sky is verified at 4.5:1 against the **brightest** floodlight point, not the average. State changes announce politely, except blocked/rejected which announce assertively.

## C10 · AccountAccessCard

Club + role selection in the account hub — the screen a person lands on when their identity carries more than one membership (parent at two clubs, parent who is also a trainer).

- **Structure:** 44px club avatar with a `1px` hairline ring → club name 16px/22 700 → role Status Pill (`Genitore`, `Allenatore`) + season eyebrow → linked-children line where relevant (`2 figli · Marco, Giulia`) → trailing 28px ring, filled when this is the active context.
- **Surface:** glass strong when active, glass otherwise. **Border:** glass border → `1px rgba(37,99,235,0.4)` when active. **Shadow:** inner highlight + row shadow → plus `0 8px 22px -10px rgba(37,99,235,0.5)` when active. **Radius:** `22 22 8 22`. **Padding:** 16px. **Cards 12px apart.**
- **Typography:** club name 16px/22 700; role pill 10px caps; season and children lines 12px/16 500 ink 42%.
- **Icon treatment:** the club's avatar, not a generic building glyph, whenever the club has one; fall back to `shield-outline` in a 44px tint chip. The trailing ring is the same ring used for selection everywhere else.
- **States:** available · active (ring filled, border and glow, pill unchanged) · activating (ring spinner, card inert at 0.7 — the context switch is a server call and must not be optimistic) · unsupported role (card at 0.55, ring hollow, caption `Ruolo non ancora disponibile su mobile`, no tap — it is shown, not hidden, so the person understands why they cannot enter) · error (card returns to available with an inline red line) · pending invitation (`Invito da accettare`, warning pill, action `Accetta invito`).
- **Rule:** never auto-select when more than one membership exists. Never hide a membership the app cannot open — say why.

---

# Part B2 — Chrome and primitives (Trainer reskin set)

Verified for the final Trainer reskin. **No functional meaning changes.** These five were specified only as spec cards until now; they are normative here.

## B7 · AppBar

- **Structure:** eyebrow (club · date, or section context) → 26px/800 display title, both left-aligned in the navy sky; trailing slot holds up to two 40px dark Icon Chips (notification bell, and on secondary screens the back arrow).
- **Surface:** none — transparent over the Floodlight sky. It is not a bar; it is type set in the sky. **Never** give it a fill, a bottom border or a shadow.
- **Border / shadow:** none. The bell's chip carries its own dark inner highlight.
- **Typography:** eyebrow 11/700 caps +0.12em white 72%; title 26px/30 800 −0.02em white, single line, ellipsised.
- **Icon treatment:** chips only, never bare glyphs. The bell's unread count is a 18px pill with the match gradient and a `1.5px rgba(255,255,255,0.7)` ring, top-right, offset −4/−4.
- **Spacing:** padding `10 20 0`, min height 64px, 4px eyebrow→title, 8px between trailing chips.
- **States:** default · with count · pressed (chip `scale(0.97)`) · long title (ellipsis, never wrap, never shrink the type).
- **Per Trainer screen:** Home eyebrow `EASYGAME` title `Dashboard` · Trainings/Matches/Athletes eyebrow = club name, titles `Allenamenti` / `Gare` / `Atleti` · Profile eyebrow `ACCOUNT EASYGAME` title `Profilo`.
- **Rule:** exactly one AppBar eyebrow + title pair per screen; the body never repeats the title.
- **Accessibility:** the title is the screen heading, announced on arrival. The bell is a labelled button including the count (`Notifiche, 3 non lette`). The count pill is not the only signal — the label carries it.

## B8 · Dock

- **Structure:** 68px dark-glass pill, 5 slots, 8px inner padding, 4px between slots. The active slot expands into a gradient puck showing icon **and** label; inactive slots are outline glyphs only.
- **Surface:** dark glass. **Border:** `1px rgba(255,255,255,0.14)`; puck `1px rgba(255,255,255,0.3)`.
- **Shadow:** `0 20px 44px -12px rgba(7,18,43,0.65)` + dark inner highlight; the puck adds the blue glow.
- **Radius:** full pill throughout. **Position:** fixed, 20px from each side, 18px above the safe-area bottom.
- **Typography:** label 12/700 +0.02em, on the active puck only.
- **Icon treatment:** 22px — filled when active (white), outline when not (white 55–60%).
- **States:** active (puck + label + glow) · inactive · pressed (puck `brightness(1.08)`) · badged (a slot may carry a 16px count pill, top-right of its glyph) · permission-hidden (the slot is **absent** and the remaining slots redistribute — never a greyed tab).
- **Motion:** the puck slides between slots; no screen transition on tab change.
- **Rule:** five slots maximum, `Profilo` always last. Screens reserve 124px bottom clearance.
- **Accessibility:** `tablist`/`tab` semantics with the selected state exposed; every slot keeps its label as `accessibilityLabel` even when visually hidden, so an inactive tab is never an unlabelled glyph. Each slot is ≥44px wide.

## B9 · StatusPill

- **Structure:** ring-dot (7–8px, 2px ring) + tracked caps label. Hollow ring = neutral taxonomy (category, role); filled ring = a live status.
- **Surface:** status colour at 10–13%. **Border:** `1px` same colour at 28–32%. **Shadow:** inner top highlight only. **Radius:** full pill.
- **Typography:** 10–11px/1 700 uppercase +0.08em, in the status colour at full opacity (never alpha-muted).
- **Padding:** `4px 8px 4px 7px` small, `6px 10px 6px 8px` regular; 5–6px dot→label.
- **Variants:** `default` · `primary` · `success` · `warning` · `destructive` · `match` · `onDark` (white 12% fill, white 22% border — for use in the sky).
- **States:** the variants are the states. Not pressable, no disabled — a pill the user can act on is a Button.
- **Rule:** maximum two pills per row. Never use a pill as a control.
- **Accessibility:** the pill is not a separate element in a row — it is composed into the row's spoken label. The ring is decorative; the word carries the meaning.

## B10 · GlassCard

The generic content panel — `Card` in this system's component set.

- **Structure:** optional eyebrow → optional title → optional description → children; optional 3px module stripe inset 22px along the top edge.
- **Surface:** glass (`0.74`) default · glass strong (`0.88`) when selected or when it is an input surface · dark glass (`0.72`) in the sky. `solid` is deprecated for content lists.
- **Border:** `1px rgba(255,255,255,0.7)` (dark: `rgba(255,255,255,0.14)`).
- **Shadow:** inner top highlight + panel shadow; `elevated` swaps in the raised shadow for sheets and floating panels.
- **Radius:** `22 22 8 22`, content clipped. **Padding:** 16px (20px for a hero-weight dark card).
- **Typography:** eyebrow 11/700 caps ink 42% · title h4 20/28 −0.01em · description 14/20 ink 62%.
- **States:** default · pressable (`scale(0.985)` + `brightness(1.03)`) · loading (placeholder bars at ink 8%, shell intact, no spinner, no layout shift) · disabled (not a card state — a disabled card is either absent by permission or its actions are disabled).
- **Rule:** stack 12px apart on the Floodlight ground; the first card on a screen straddles the horizon. Never an opaque white panel.
- **Accessibility:** a pressable card is one focusable element with a composed label, and its inner text is not separately focusable. A card that is purely a container gets no role.

## B11 · ActionButton

The Action Surface — `Button` in this system's component set.

- **Structure:** optional 18px leading icon → label → optional trailing arrow chip (30px, white 18% fill with its own inner highlight) on the primary CTA of a screen or sheet.
- **Surface:** `primary` action gradient · `success` / `destructive` their gradients · `secondary` glass strong · `outline` white 35% with a blue 45% hairline · `ghost` transparent · `onDark` white 12% (for dark glass and the sky).
- **Border:** `1px rgba(255,255,255,0.28)` rim on gradients (this rim light is what stops a gradient button reading as a flat blue rectangle); glass border on `secondary`; `1.5px` blue on `outline`.
- **Shadow:** dark inner highlight + the matching glow on gradients; inner highlight + panel shadow on `secondary`; none on `ghost`.
- **Radius:** `14 14 5 14`; `10 10 4 10` at `sm`. **Heights:** 40 / 52 / 60.
- **Typography:** 15/700 +0.01em (13/700 at `sm`).
- **States:** default · pressed (`scale(0.97) translateY(1px)` + `brightness(1.08)`, glow off) · loading (spinner replaces the label, button inert, width unchanged) · disabled (`rgba(11,26,58,0.06)` flat fill, ink 42% label, no gradient, no glow, no rim) · focus (`--eg-focus-ring`, or `--eg-focus-ring-on-dark` on dark surfaces).
- **Rule:** one `primary` per card, screen region or sheet. Only the primary CTA gets the trailing arrow chip.
- **Accessibility:** 44px minimum target at every size (`sm` is padded, not shrunk). Labels are verbs or verb phrases naming the object (`Salva 14/18 presenze`). Disabled and loading expose their state; loading also announces (`Salvataggio in corso`). Never colour-only disabled — the flat fill and the absent glow are structural.

## Trainer screen coverage

Every surface in the five Trainer screens maps to a specified component. Nothing in the reskin needs a new component.

| Screen | Chrome | Content |
| --- | --- | --- |
| **Home** | Floodlight · AppBar · Dock | SectionHero (sky) · HighlightCard ×3 · StatCard ×2 · StatusPill |
| **Allenamenti** | Floodlight · AppBar · Dock | SectionHero · EventCard (action stripe) · GlassCard (empty group line) · BottomSheet + SelectableAthleteRow (green) · ActionButton · StateMessage |
| **Gare** | Floodlight · AppBar · Dock | SectionHero · EventCard (match stripe) · BottomSheet + SelectableAthleteRow (blue) · ActionButton · StateMessage |
| **Atleti** | Floodlight · AppBar · Dock | SectionHero + SignatureInput (search) · GlassCard row + NumberTile · StatusPill · StateMessage |
| **Profilo** | Floodlight · AppBar · Dock | GlassCard ×5 · SignatureInput · Avatar · IconChip rows · StatusPill · ActionButton (destructive logout) · AccountAccessCard (accesses) |

---

# Part E — Authentication and password reset

Icon-only, same language. These screens have no dock and no child switcher; they use `SecondaryScreenLayout` semantics with `onBack={false}` where there is nowhere to go back to, and a raised sky (400–420px) because they carry no content list.

**Shared shape for every step:** eyebrow (where you are in the flow) → h1 32–36px/800 white statement in the sky → one supporting sentence at white 72% → a single `elevated` glass card holding the fields and the one primary CTA → a ghost secondary link beneath → version caption pinned at the bottom.

| Step | Eyebrow / title | Card contents | Primary CTA | Notes |
| --- | --- | --- | --- | --- |
| **Request reset** | `RECUPERO ACCESSO` / `Reimposta la password` | one `SignatureInput` (email, `mail-outline`) | `Invia richiesta` + arrow chip | Supporting line states the generic outcome up front, because the response is identical whether or not the account exists |
| **Sent / check inbox** | `RECUPERO ACCESSO` / `Controlla la posta` | no fields; a 40px `mail-open-outline` Icon Chip, the address echoed at 15/700, and the resend countdown | `Invia di nuovo` (disabled until the countdown ends) | Countdown is driven by the server's `Retry-After`, shown as `Riprova tra 0:42` in tabular figures — never a guessed client timer |
| **Code / token validation** | `VERIFICA` / `Inserisci il codice` | 6 single-character glass cells, `14 14 5 14`, 48×56, 8px apart, tabular 22/800 centred; the focused cell takes the blue ring | `Verifica` | Cells are one logical field, not six inputs (see accessibility). Wrong and expired share one message by design — the backend does not distinguish them, so neither does the UI |
| **New password** | `NUOVA PASSWORD` / `Scegli una nuova password` | two `SignatureInput` (password + confirm, `lock-closed-outline`, reveal chip) and a requirements list: one line per rule, each with a 14px `ellipse-outline` → `checkmark-circle` in success green as it is met | `Salva password` | Requirements are stated before typing, never revealed only as errors |
| **Success** | `ACCESSO RIPRISTINATO` / `Password aggiornata` | 52px `checkmark-circle` Icon Chip in success green, one line of confirmation | `Vai al login` | No auto-redirect: the person confirms. No confetti, no illustration |
| **Invalid / expired link** | `LINK NON VALIDO` / `Questo link è scaduto` | `StateMessage kind="error"` inside the card, with the reason in plain Italian | `Richiedi un nuovo link` | Never a dead end — always the way to restart |
| **Loading** | current step's title retained | fields replaced by placeholder bars at ink 8%; the CTA shows its spinner and the card is inert at 0.7 | — | The card never collapses or changes height between states |
| **Error** | current step's title retained | inline 13/600 `#B91C1C` line under the offending field; a transport failure instead renders `StateMessage kind="error"` above the CTA with `Riprova` | — | Field errors and connection errors are visually distinct |

**Rules:** one primary action per step; the flow is linear and every step states which step it is; nothing auto-advances except after a server-confirmed code entry; no illustration, no mascot, no celebratory animation. Password reveal is a labelled chip, never an unlabelled eye.

**Accessibility:** the code entry is exposed as a **single** field labelled `Codice di verifica a 6 cifre` with the cells hidden from assistive tech — six separately focusable cells make the field unusable with a screen reader. Autofill/one-time-code hints are expected. Requirement lines announce as they are met (politely). Error text is a live region tied to its field. The countdown is announced only at start and end, never per second. Every step's h1 is the screen heading.

---

# Part F — System, release and connectivity states

All seven use `StateMessage`'s grammar — 52px Icon Chip, h4 title, muted body, at most one action — with **no illustrations**. What varies is the icon, the status colour, where it appears, and whether it blocks.

| State | Icon | Colour | Surface / placement | Italian copy | Action | Blocking |
| --- | --- | --- | --- | --- | --- | --- |
| **Offline** | `cloud-offline-outline` | `#F59E0B` | A 32px-tall glass strong **banner** pinned under the AppBar, full width minus gutters, `10 10 4 10`, amber ring-dot + 12/700 label. Cached content stays visible beneath it | `Sei offline · dati aggiornati alle 18:04` | none (auto-clears) | No |
| **Connection lost** (a request failed) | `cloud-offline-outline` | `#EF4444` | `StateMessage kind="error"` in the content region, or inline in a card that failed to refresh | `Errore di connessione` / `Controlla la rete e riprova.` | `Riprova` primary | Region only |
| **Retry** | `refresh-outline` | `#2563EB` | The action inside the two states above; while retrying, the button shows its spinner and the message stays | `Riprova` → `Nuovo tentativo…` | — | No |
| **Maintenance** | `construct-outline` | `#F59E0B` | Full-screen over the Floodlight, sky raised to 420px, no dock, warning pill `MANUTENZIONE` | `EasyGame è in manutenzione` / the server's message, or `Torniamo online a breve.` | `Riprova` secondary | Yes |
| **Session expired** | `log-out-outline` | `#F59E0B` | `BottomSheet`, not a full screen — the person has context to preserve and should land back where they were after signing in | `Sessione scaduta` / `Per sicurezza ti chiediamo di accedere di nuovo.` | `Accedi di nuovo` primary | Yes (modal) |
| **Update required** | `arrow-up-circle-outline` | `#2563EB` | Full-screen, dark glass card in the sky, primary pill `AGGIORNAMENTO`; the current and required versions in the supporting line, tabular | `Aggiorna EasyGame` / `Questa versione non è più supportata.` | `Aggiorna` primary + arrow chip | Yes |
| **Unsupported role** | `shield-outline` | ink 42% | Full-screen, no dock. Two ghost exits, never one | `EasyGame Mobile è in aggiornamento` / the role is named, and what it can use today | `Cambia accesso` secondary + `Esci` ghost | Yes |

**Rules:**
1. **Blocking states are full-screen or a modal sheet; non-blocking states are a banner or a region message.** Never block the app for something that only affects one region.
2. **Never fold a system state into an empty list.** Offline, forbidden, error and empty are four different pictures — this is the defect `StateMessage` exists to prevent.
3. A blocking state always offers at least one way out; `Esci` is always available on a state the person cannot resolve.
4. Cached data stays on screen behind an offline banner, with its timestamp. Never blank a screen the person could still read.
5. Status colour is never the only signal: every state has its icon, its word and its title.
6. No illustration, no full-bleed art, no animation beyond the retry spinner.

**Accessibility:** blocking states move focus to their title and announce assertively. The offline banner announces once on appearance and once on recovery — never repeatedly. The retry button exposes its busy state. Version numbers are spoken as digits, not dates. Every state's title is the region or screen heading.

---

# Part G — Push permission and deep-link states

Visual guidance only; no technical implementation.

## G1 · Notification permission

| State | Where | Treatment |
| --- | --- | --- |
| **Not requested** | A glass card in `Profilo → Notifiche`, and — at most once — as a dismissible glass card at the bottom of the Parent/Trainer home after the first meaningful action | 36px `notifications-outline` Icon Chip in blue tint, title `Attiva le notifiche`, one line naming the concrete benefit (`Ricevi le convocazioni e gli avvisi del club`), `Attiva` primary + `Non ora` ghost. **The system dialog is never triggered on launch** — it follows this card, so a denial is an informed one |
| **Allowed** | `Profilo → Notifiche` | Success ring-dot pill `ATTIVE`, the categories listed as rows with their Icon Chips. No celebratory treatment |
| **Denied** | `Profilo → Notifiche`, and as a persistent (non-dismissible) glass row where a feature depends on it | Warning pill `DISATTIVATE`, title `Notifiche disattivate`, supporting line stating what is missed, `Apri le impostazioni` secondary. Never re-prompt in-app, never nag, never a red alarm — a denial is a legitimate choice |

## G2 · Deep-link destination feedback

A deep link lands on the **destination screen's own shell** — the correct AppBar title and eyebrow render immediately, so the person always knows where they arrived even before the data does. Never a neutral splash, never a blank screen.

| State | Treatment |
| --- | --- |
| **Content loading** | The destination's Floodlight + AppBar render at once; the content region shows `StateMessage kind="loading"` (tone dark) with the specific noun — `Apro l'allenamento…`, `Apro il pagamento…`. Card shells with placeholder bars are preferred over a bare spinner where the shape is known |
| **Content unavailable** | `StateMessage kind="empty"` — `file-tray-outline`, title `Contenuto non disponibile`, line stating the likely cause (deleted, or the season changed), action `Vai alla home` secondary. Never a raw error, never an empty list |
| **Access no longer available** | `StateMessage kind="forbidden"` — `lock-closed-outline` in red tint, title `Accesso non più disponibile`, line naming the reason (the club revoked access, the child is no longer linked, the role changed). Actions: `Cambia accesso` secondary, and `Vai alla home` ghost. This must never look like "empty" — it is the single most important distinction in this part |
| **Wrong context** | Where the link belongs to another club or child the account still has, do **not** fail: switch context, land on the destination, and state the switch as an AppBar eyebrow plus a one-time glass banner (`Passato a Marco · Virtus Nord`). A silent context switch is a defect |

**Rules:** the shell always precedes the data; the four outcomes above are visually distinct; a deep link never dead-ends without an action; a link that requires sign-in routes through login and returns to the destination afterwards, with the destination named on the login screen's eyebrow.

**Accessibility:** on arrival the destination's title is announced, then the state message when it resolves. A context switch triggered by a link announces assertively — it changes the meaning of everything on screen.

---

# Part D — Deprecations

| Deprecated | Replaced by | Note |
| --- | --- | --- |
| `EmptyState` (illustration slot) | `StateMessage` | Illustrations are out of scope for the app. Component retained for brand archive only. |
| `assets/illustrations/*` | — | Not to be used in product UI. Also carry English text while the product is Italian. |
| `BrandGradient` as a page background | `Floodlight` | BrandGradient remains valid only as a small chrome fill. |
| `Card` with `tone="solid"` for content lists | `Card` glass / `tone="dark"` in the sky | Opaque white panels are the generic-SaaS look this identity exists to avoid. |
| `Input` (pre-signature) | `SignatureInput` | |
| `Avatar` for athletes | `NumberTile` | `Avatar` stays correct for clubs, coaches and parents. |
| Flat module colour slabs (v1 `HighlightCard`, v1 `SectionHero`) | glass + module stripe / sky hero | |
| `EnrollmentStatusCard` step/progress rail (v2.1–v2.2) | status title + Status Pill + supporting line | **Removed in v2.3.** The backend exposes an enrollment status, not per-phase progress. Do not reintroduce dots, steps, percentages or "step N of M" in this card. |
