# EasyGame Mobile — component specifications

**Revision:** EGDS v2.1.0 · 2026-09-10
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

These three were built during implementation as same-language extensions. They are now official.

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

## C8 · BookingCard

A structure/facility booking (a hall, a pitch, a slot).

- **Structure:** date rail (as AppointmentCard) → structure name as title → meta rows: `location-outline` address, `time-outline` slot window, `people-outline` who it is for → Status Pill → action row. Where the club charges for the slot, the fee appears as a 15px/800 tabular amount on the meta line, not as a PaymentCard.
- **Surface / border / shadow / radius:** as EventCard. **Stripe:** state-coloured (bookings behave like appointments, not like modules).
- **Icon treatment:** `business-outline` in a 36px chip beside the title when the structure has no other identifier.
- **States:** available (a bookable slot — `Prenota` primary + arrow chip) · requested (`Richiesta inviata`, warning) · confirmed (`Confermata`, action stripe, `Disdici` secondary) · cancelled (dashed, struck, `Annullata`) · completed (`Conclusa`, success) · full (`Nessun posto disponibile`, ink 42%, no action, and it stays visible rather than disappearing) · updating (inert 0.7) · disabled (club has bookings off: card hidden, not greyed).
- **Rule:** a slot the family cannot book still shows its state and its reason. Silently hiding unavailable slots makes the calendar look empty.

## C9 · EnrollmentStatusCard

Enrollment or season renewal — usually one per child, at the top of the Parent home.

- **Structure:** a **dark-glass** panel (it belongs in the sky, above the mist content): eyebrow (`STAGIONE 2026/27`) → status title 20px/28 700 white → a compact **step rail**: three or four labelled steps (`Domanda`, `Documenti`, `Pagamento`, `Attiva`) as 8px dots joined by a 2px hairline in white 18%, completed dots filled white, current dot filled with the action gradient and given a 4px white-26% halo → supporting line white 72% → one primary action.
- **Surface:** dark glass. **Border:** `1px rgba(255,255,255,0.14)`. **Shadow:** dark inner highlight + panel shadow. **Radius:** `22 22 8 22`. **Padding:** 20px.
- **Typography:** eyebrow white 72%; title 20px/28 700 white; step labels 10px/14 700 uppercase +0.08em, white for done/current and white 50% for pending; supporting line 14px/20 white 72%.
- **Icon treatment:** no icons in the rail — dots only. A single 40px dark Icon Chip may sit beside the title for the module (`clipboard-outline`).
- **States:** not started (`Iscrizione da avviare`, action `Avvia iscrizione`) · in progress (current step highlighted, action names the next concrete task — `Carica il certificato medico`, never a vague `Continua`) · awaiting club (`In verifica dal club`, no action, supporting line gives the expected timing if the club provides it) · complete (`Iscrizione attiva`, all dots filled, success pill, no action) · expiring (`Rinnovo entro il 31 luglio`, warning pill, action `Rinnova`) · rejected/blocked (`Iscrizione sospesa`, destructive pill, reason mandatory, action = whatever unblocks it) · updating (rail at 0.5, inert).
- **Rule:** the action always names the next real task. One action per card.

## C10 · AccountAccessCard

Club + role selection in the account hub — the screen a person lands on when their identity carries more than one membership (parent at two clubs, parent who is also a trainer).

- **Structure:** 44px club avatar with a `1px` hairline ring → club name 16px/22 700 → role Status Pill (`Genitore`, `Allenatore`) + season eyebrow → linked-children line where relevant (`2 figli · Marco, Giulia`) → trailing 28px ring, filled when this is the active context.
- **Surface:** glass strong when active, glass otherwise. **Border:** glass border → `1px rgba(37,99,235,0.4)` when active. **Shadow:** inner highlight + row shadow → plus `0 8px 22px -10px rgba(37,99,235,0.5)` when active. **Radius:** `22 22 8 22`. **Padding:** 16px. **Cards 12px apart.**
- **Typography:** club name 16px/22 700; role pill 10px caps; season and children lines 12px/16 500 ink 42%.
- **Icon treatment:** the club's avatar, not a generic building glyph, whenever the club has one; fall back to `shield-outline` in a 44px tint chip. The trailing ring is the same ring used for selection everywhere else.
- **States:** available · active (ring filled, border and glow, pill unchanged) · activating (ring spinner, card inert at 0.7 — the context switch is a server call and must not be optimistic) · unsupported role (card at 0.55, ring hollow, caption `Ruolo non ancora disponibile su mobile`, no tap — it is shown, not hidden, so the person understands why they cannot enter) · error (card returns to available with an inline red line) · pending invitation (`Invito da accettare`, warning pill, action `Accetta invito`).
- **Rule:** never auto-select when more than one membership exists. Never hide a membership the app cannot open — say why.

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
