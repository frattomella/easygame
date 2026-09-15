# 03 · Core Components

**EGDS v3.0.0 · CURRENT.** Platform-independent contracts. Mobile-only compositions live in `04-mobile.md`.

**Precedence:** this document and `04-mobile.md` are authoritative. The archived v2.3 spec (`guidelines/archive/v2.3/component-specs.md`) remains a valid reference for fine geometry and accessibility detail where v3 is silent; **where they conflict, v3 wins.** Every conflict is listed in `migration-v3.md`.

Legend — **●** changed in v3 · **＋** new in v3 · **○** unchanged.

---

## 3.1 Surfaces

### ○ GlassSurface / GlassCard (`Card`)
The generic content panel. White 74% (88% strong) · `blur(18px) saturate(1.4)` · 1px white-78% hairline · inner top highlight · `--eg-shadow-glass` · corner `22 22 8 22` · 16px padding. Dark variant (`rgba(18,38,90,.66)`, white-20% hairline, `--eg-highlight-top-dark`) for panels sitting in the sky.
States — resting · pressed `0.985` + 1px drop · selected: hairline takes the state hue at 40% and the fill goes strong · disabled: no shadow, ink 42%.
Rules — glass always sits over the ground or another surface, never over flat white. A pressable card is one focusable element with a composed label. A card that is only a container has no role.

### ● SectionHero
The screen opener: eyebrow + 26–32px/800 display line, **in the sky, with no box**. v3: the brand line (mark + wordmark left, club chip right) sits above it on primary screens; the eyebrow carries role and context.
Rule — the first glass panel below a SectionHero starts ~40px before the sky ends so it visibly straddles the horizon. That overlap is a signature cue.

### ● HighlightCard
The module block: glass panel, 3px module stripe inset 22px on the top edge, Icon Chip, eyebrow + title, meta rows, one action row. v3: pills inside are the solid ramp, not tints.

### ○ StatCard
The counter tile. Two per row, 12px gap, big tabular number over a caps label. **A StatCard is a fact, never an action** — if it needs a button it is a HighlightCard.

---

## 3.2 Identity and marking

### ○ NumberTile
44px, navy gradient, 18px/800 tabular numeral, optional 3-letter role. **● v3: the tile stays navy in every state.** It no longer takes a success or action gradient when an athlete is marked — the mark is a separate ring (§04.5). Disabled: muted fill, numeral ink 42%.

### ○ Avatar
Circles are for **clubs and people who are not athletes** (the coach, a parent, a child in the switcher). Athletes get a NumberTile.

### ○ IconChip
A tinted tile carrying one icon: colour at 12%, border at 25%, inner highlight, cut corner `10 10 4 10` (40px chips use `14 14 5 14`). Any non-metadata icon above 16px sits in one. Dark-glass variant in the sky.

### ● StatusPill (`Badge`)
Ring-dot + tracked caps label, 22px tall. **Rebuilt in v3 as the four-tier system** — see `02-foundations.md` §2.5 for tiers, hues, geometry and the on-sky inversion. Tint-on-glass fills are removed. The pill is not a separate accessibility element; it is composed into the row's spoken label.

### ● MetaRow
15–16px outline icon at ink 62% + 12–13px/500 metadata, `·` between fragments. v3: a meta row never ends in a boxed control — see §3.5.

---

## 3.3 Actions and input

### ● ActionButton (`Button`)
The Action Surface. **On light grounds:** gradient fill (`--eg-grad-action`), 1px white-28% rim, inner highlight, `--eg-glow-primary`, corner `14 14 5 14`, 52px (`md`) / 44px (`sm`, padded not shrunk), label 700/15px, optional trailing arrow chip. Secondary = frosted glass with ink label. Destructive = red gradient. Disabled = flat ink 6%, ink 42% label, no glow.

**● On the sky the gradient is banned.** Primary inverts to a **white fill with a navy `#12265A` label** (14.5:1) and its trailing chip becomes navy-on-white-10%. Secondary becomes a **ghost: white 8% fill, 1.5px white-45% border, white label** (6.6:1). The v2 ink-coloured ghost is deprecated on dark surfaces.

Rules — labels are verbs naming the object (`Salva 14/18 presenze`, `Carica documento`). 44px minimum target at every size. Loading and disabled expose their state to assistive tech. One primary action per surface.

### ○ SignatureInput (`Input`)
The only text-entry surface: glass field, corner `14 14 5 14`, 52px, eyebrow label above (programmatically associated, not merely adjacent), optional leading/trailing icon, 44px minimum. Error = red hairline + one line of red 13px copy below, never a tooltip. On the sky, fields sit inside an elevated glass card rather than directly on the ramp.

### ＋ SignatureInput · code entry
Six glass cells for OTP, **one logical field**: one label, one error, one paste target, one focus sequence. Never six inputs to a screen reader.

### ○ SignatureInput · signature capture (`SignatureInput` — drawing)
Unchanged from v2.3.

---

## 3.4 Chrome

### ● AppBar
**Structure, v3 (three lines, four facts, no bar):**
1. **Brand line** — EasyGame mark + wordmark (left) · club chip (right). Primary screens only.
2. **Context line** — eyebrow: role · date / team / selected child.
3. **Title line** — 26px/800 display title (left) · trailing slot with up to two 40px dark Icon Chips.

- **● The back control is a labelled `‹ Indietro` pill on the left, on its own line above the title.** It is never a bare chip in the trailing slot beside the notification bell. `chevron-back` + word.
- **The bell sits alone on the right.** Minimum 20px between the title block and any trailing action.
- The bell's count is a pill on light chrome, an 8px dot with a navy rim where space is tight. The count is never the only signal — the label carries it (`Notifiche, 3 non lette`).
- The title is the screen heading, announced on arrival.

### ● Dock (`TabBar`)
Compact in v3: **56px** dark-glass pill (was 68), **46px** puck (was 52), **20px** glyphs (was 22), 5px inner padding, 2px between slots, floating 20px from the sides and 18px from the bottom. Tap targets stay ≥44px.
- Max 5 slots. The active slot expands into an action-gradient puck showing icon **and** label; inactive slots are outline glyphs at **white 62%** (raised from 50% because the ground is lighter).
- **● A slot badge is an 8px dot with a navy rim, not a count pill** — at 56px there is no room for numerals, and the count is already on the Home tile.
- `tablist`/`tab` semantics; every slot keeps its label for assistive tech even when visually hidden.
- Permission-off means the slot is **absent**, never greyed.

### ＋ NavTile
The Home shortcut tile: glass, cut corner, 40px Icon Chip in the module colour, 12px/700 label, optional badge dot in the top-right. Laid out 4-up in a grid. Every section the role's club has enabled appears once. A NavTile navigates and does nothing else.

### ＋ HubList
The grouped secondary-section list on a hub screen: glass rows, Icon Chip → title + one-line description → chevron, grouped under caps eyebrows. Permission-gated: absent, never disabled.

---

## 3.5 Rows

### ● Row action grammar — normative
**A row either navigates or it acts.**
- **Navigates** → the row is the target and it ends in a **plain `chevron-forward` glyph** at ink 42%. No box, no chip, no tinted container.
- **Acts** → the row carries a **labelled action bar underneath** (icon + word buttons, 36px, `10 10 4 10`). Primary action is a solid `#1D4ED8` fill with a white label; secondary is ink-5% fill with a `#1E40AF` label and an ink-14% hairline.

**Deprecated:** the rounded-box-inside-a-rounded-row pattern — a mini rounded container stretched inside a rounded row. It read as a broken nested card. No stretched mini-containers anywhere.

### ○ SelectableAthleteRow
NumberTile → name / role / state word → mark ring. Full v3 behaviour in `04-mobile.md` §4.5.

### ● NotificationRow
8px unread dot in the leading 20px gutter → 40px Icon Chip → title (700 unread / 500 read) + one-line body clamped to two lines → relative time. Marking as read is a side effect of opening. v3: ends in a plain chevron.

### ● DocumentRow / ConsentRow / paperwork rows
Follow §3.5's grammar. Detail per type in `04-mobile.md` §4.7–4.8.

---

## 3.6 Feedback and shells

### ○ StateMessage
The single surface for **loading · empty · forbidden · error**. Icon Chip + eyebrow + one-line title + at most one sentence + at most one action. Exactly one visible per region. A section inside a populated screen with nothing in it uses a glass panel with one muted line instead.
A fetch failure is always a StateMessage — never a domain state, never an empty list.

### ● BottomSheet
The one modal shell for every question-and-return interaction. Glass strong · corner `28 28 0 0` · grabber · scrim `rgba(7,18,43,.55)` + `blur(6px)` · content capped at 75% viewport. Full behaviour in `04-mobile.md` §4.4.

### ○ SecondaryScreenLayout
The shell for every non-tab screen: Floodlight + AppBar with the `‹ Indietro` pill + content. **No dock on a secondary screen.** Never a dock and a back control at the same time.

### ● ParentPrimaryScreenLayout
Floodlight + AppBar (brand line + club chip + role eyebrow) + **ChildSwitcher** + 112px dock clearance (was 124 — the dock lost 12px).

### ＋ BrandStateLayout
The shell for auth, account and blocking system screens: **full-height blue ramp, no horizon, no mist**, court arcs, baseline + tick, watermark mark, brand line at the top, content centred, actions in white-on-navy / ghost. See `04-mobile.md` §4.3 and §4.9.

---

## 3.7 Deprecated in this layer

`EmptyState` + illustrations · `BrandGradient` as a page background · `Card tone="solid"` for content lists · the ghost button variant on dark surfaces · tint-on-glass status pills · boxed icon marks · the rounded-box-inside-a-row control · count pills on dock slots. Full list with replacements in `deprecated.md`.
