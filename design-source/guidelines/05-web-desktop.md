# 05 · Web / Desktop — foundations

**EGDS v3.1.0 · CURRENT · authoritative for the EasyGame Web redesign.** Supersedes the v3.0.0 placeholder, which designed nothing. Read this before 06–09; read `10-handoff.md` last.

Web/desktop is **five documents**: `05` foundations · `06` shell · `07` DataGrid · `08` forms · `09` page & feedback patterns. `10-handoff.md` is the implementation contract.

## 5.0 Source, authority and conflicts resolved

Everything here is lifted from the approved web package: the **Iterazione 4** direction board (corrected shell, quick actions, unified data grid) and the extracted `EGShell` / `EGRecord` / `EGAthlete` frames, plus the `v0.1 bozza` web system document and the four screen overviews. Where they disagreed, the later artifact won unless it broke a platform-independent rule in `02-foundations.md`.

| # | Conflict in the package | Resolution | Why |
| --- | --- | --- | --- |
| C1 | Status pill full-radius (bozza) vs 10/4 cut chip with ring dot (Iterazione 4 grid) | **Status pill is full-radius**, ring dot + tracked caps, exactly as mobile. The 10/4 cut chip is re-designated a **data chip** (category, sede, tag, counter) and must never carry a status word | Status must read identically on both platforms; the cut corner is for surfaces, and a status pill is a word |
| C2 | Row 48/44 (bozza) vs 46/40 (Iterazione 4) | **Three densities: comoda 48 · media 44 (default) · compatta 40.** Header row 40 in all three | One scale, and the default lands where an all-day operator wants it |
| C3 | Light white sidebar (screen overview 2a) vs full blue gradient sidebar (Iterazione 4) | **Blue gradient sidebar** | It is the only place the brand ramp appears on a working page; a white sidebar left the product unrecognisable |
| C4 | Sky band on operational pages (early direction) vs mist only (Iterazione 4) | **Sky band on the club Dashboard only** | Blue behind forty table rows costs legibility and buys nothing |
| C5 | Bell badge as dot vs numeral | **Dot** in the topbar (amber, 7px, 2px rim in the surface colour); the count lives inside the notifications panel | Same rule as the mobile dock |
| C6 | Neutral-strong button (`#12265A`) vs action gradient for the page primary | **Action gradient is the page primary.** `#12265A` solid navy is the *neutral-strong* button: used for a primary that must not compete with a gradient already on screen (e.g. inside a panel that owns the page's single gradient) | One gradient per screen survives |

Anything in the package **not** listed in this section or in 06–09 is a one-off mockup decision and carries no authority.

## 5.1 Three environments — pick one per page, never mix

| # | Environment | Where | Ground |
| --- | --- | --- | --- |
| **1** | **Gestionale** | Every working page: lists, records, cassa, segreteria, settings, reports | `--egw-page` #EEF3FE flat. White opaque panels. **No blue background, no glass, no blur.** |
| **2** | **Dashboard** | The club Dashboard, and only it | `--egw-sky` band 340px behind the top of the content column, fading to mist across `--egw-horizon` (starts 216px, 132px tall). Page title and the KPI bar sit in the sky; content panels scroll down onto the mist |
| **3** | **Fuori dal club** | Accesso, registrazione, recupero password, invito, account-level pages, maintenance / offline / 403 / 404 / service status | `--egw-sky-full`, no horizon. 5% white watermark of the mark. White or dark-glass panel centred, max 440px |

**Glass stays on mobile.** On the web, surfaces are opaque. The two exceptions, both over the sky: the account dropdown (`rgba(255,255,255,.94)` + 18px blur) and the topbar's own controls (white 14% fill, white 26% border).

## 5.2 Colour

Full ramps live in `02-foundations.md`; the web layer adds nothing new and removes nothing. What matters on web:

- **Primary** `#2563EB`. **Indigo** `#3533CD` closes every gradient. **Navy** `#12265A` / `#0B1A3A` is depth and neutral-strong, never the identity.
- **Ink in three levels only**: `#0B1A3A` 100% · 72% body · 62% secondary · 42% floor (eyebrows, placeholders, disabled labels). Nothing between, nothing below 42%, never pure black, never mid-grey.
- **Semantic solids** — the label on them is always white: green `#15803D` valido/incassato/presente/completato · amber `#B45309` in attesa/in scadenza/da sistemare · red `#B91C1C` scaduto/mancante/errore · orange `#9A3412` gara e convocazioni · blue-700 `#1D4ED8` informativo/allenamento. Amber text on white uses `#8A4708`.
- **Tints** are fill 8–12% with a 26–32% border, and they are for *containers* (alert blocks, tinted chips, icon chips). A tint is never a status pill fill on web.
- **Three gradients exist**: action, gara (3px module stripe only), navy (resting identity tiles). The current dashboard's purple/pink/green/orange module cards are gone — see `deprecated.md`.

Contrast: body text ≥4.5:1, headline-scale ≥3:1. On the sky, text is white or white 80%; nothing fainter. Solid pills are 700-level fills with white labels, which clears 4.5:1 at 10px.

## 5.3 Typography

Poppins 400/500/600/700/800, same family as mobile, tighter ramp.

| Role | Spec |
| --- | --- |
| Page title | 800 · 32/34 · −0.02em |
| Section title | 800 · 20/24 · −0.02em |
| Panel title | 700 · 15/20 |
| Block eyebrow | 700 · 10–11 · +0.12em · UPPERCASE · ink 42% |
| Column head | 700 · 9.5 · +0.10em · UPPERCASE · ink 52% |
| Label / name in a row | 600 · 12.5–13.5 |
| Body / cell | 400 · 13–13.5 |
| Meta, caption | 400 · 10–12 · ink 55–62% |
| Button | 600 · 12–13; the Azioni-rapide button is 700 · 12 · +0.06em caps |
| Status pill | 700 · 9.5–10 · +0.08em · UPPERCASE |

**Numbers.** Every number is `font-variant-numeric: tabular-nums`, 700 or 800, tracked −0.03em, and larger than the text beside it. Amounts right-align in their column; dates and times left-align in theirs. Missing value is `—`, never blank, never "N/D". Italian short month (`24 set 2026`), Italian decimals (`305,00 €`).

## 5.4 Surfaces, the cut corner, elevation

Three soft corners and one cut bottom-right, on every rectangular surface. **The status pill and the avatar are the only full-round shapes in the product.**

| Token | Value | Applies to |
| --- | --- | --- |
| `--egw-r-panel` | 22 22 8 22 | content panel, card, modal |
| `--egw-r-panel-sm` | 18 18 6 18 | grid panel, drawer sub-block |
| `--egw-r-field` | 14 14 5 14 | field (46px), tall button, inset block |
| `--egw-r-control` | 12 12 4 12 | button, nav item, 42px input, toolbar control |
| `--egw-r-chip` | 10 10 4 10 | chip, tag, counter, icon chip |
| `--egw-r-micro` | 8 8 3 8 | 22–26px glyph tiles |
| `--egw-r-check` | 5 5 2 5 | row checkbox |
| `--egw-r-menu` | 16 16 5 16 | dropdown, popover |

**Three planes, never a fourth.** Plane 0 — rows, fields, chips, inset blocks: no shadow, a hairline instead. Plane 1 — content panels: `--egw-plane-1` (soft shadow + 1px inner top highlight). Plane 2 — drawer, modal, menu: `--egw-plane-2` / `--egw-plane-menu`. Nesting a plane-1 panel inside a plane-1 panel is forbidden; the inner block drops to plane 0 on `--egw-page-100`.

## 5.5 Spacing, grid, page width

Base 4. Page gutter 32 (24 at ≤1280, 20 at ≤1152). Between panels 18. Inside a panel 24 padding, 14 gap. Between a section eyebrow and its content 16.

- **Content column** maxes at `--egw-page-max` 1560px and centres; a DataGrid panel may run to the full gutter width when the column would waste space.
- **Working grid**: 12 columns, 18px gutter, inside the content column. Common splits: `1fr` full · `1.4fr / 1fr` record + inspector · `2fr / 1fr` list + rail · `repeat(3, 1fr)` KPI/summary · `repeat(4, 1fr)` compressed KPI bar.
- **Sticky**: sidebar and topbar are fixed. A page header becomes sticky (condensed to 52px, title 20px, actions kept) after 120px of scroll on list and record pages. The DataGrid header row is always sticky inside its panel. Form action bars stick to the bottom of their drawer or page.
- Vertical rhythm inside a panel: eyebrow → 16 → content → 24 → next block, separated by a 1px `--egw-hairline` when the blocks are peers.

## 5.6 Interaction states — every interactive element defines all six

| State | Rule |
| --- | --- |
| **Rest** | as specified |
| **Hover** | one step of ground: transparent → `--egw-page-100`; `--egw-page-100` → `#fff` + border to `--egw-control-border`; white panel button → border `rgba(37,99,235,.32)`; gradient surfaces `filter: brightness(1.06)`. 90ms. **Never** a colour change, never a size change |
| **Focus-visible** | 1.5px `--egw-focus-border` + `--egw-focus-ring`. On the sky and on gradient fills: `--egw-focus-ring-dark`. Destructive: `--egw-focus-ring-danger`. The ring is never clipped — panels that scroll get 3px of inner padding for it |
| **Active / pressed** | `translateY(1px)` + `brightness(1.08)` on gradient, `--egw-page-050` on flat. 110ms. No scale on web (that is a touch affordance), no bounce |
| **Selected** | row: `--egw-row-selected` veil + filled check + 3px inset blue bar on the leading edge. Chip/tab: solid navy `#12265A` fill with white label. Never a border-only selected state |
| **Disabled** | fill `rgba(11,26,58,.06)`, label ink 42%, no border, no shadow, `cursor:not-allowed`. Disabled is only for *temporarily* unavailable. **Permission-denied is not disabled** — the control is absent, and if its absence is confusing, a tooltip on a read-only chip explains it |

Loading on a control: label stays, a 14px indeterminate ring replaces the leading icon, width does not change.

## 5.7 Motion

Hover 90ms, press 110ms, panel/menu 160ms, drawer in 220ms / out 180ms, all `cubic-bezier(.2,.9,.25,1)`. Drawers slide from the right and the scrim fades with them. Modals fade + rise 8px. Toasts slide 12px from the bottom-right. Skeletons pulse opacity .6↔1 at 1.4s. Nothing else animates: no bouncing, no sliding table rows, no animated blur, no count-up numbers, no page transitions. `prefers-reduced-motion: reduce` collapses every duration to 0 and keeps only opacity.

## 5.8 Responsive — desktop-first, four stops

Web/desktop is designed at **1440×900** and must hold from 1152 to 1920+. It is not a mobile layout; the phone app is a different product.

| Stop | Behaviour |
| --- | --- |
| **≥1600** | Content column capped at 1560 and centred. Record pages may show a persistent 320px inspector rail |
| **1440 (reference)** | Sidebar expanded 256. Gutter 32. Two-column forms. Inspector opens as an overlay drawer |
| **1280** | Gutter 24. Sidebar stays expanded but the topbar search collapses to an icon. KPI bars go 4→2 columns |
| **1152 (laptop floor)** | Sidebar auto-collapses to the 72px icon rail (the user can still expand it; their choice wins and persists). Gutter 20. Two-column forms become single-column. Grids keep horizontal scroll with the identity column pinned |
| **<1152** | Not supported for the management app. Show a single line — `EasyGame Web richiede una finestra di almeno 1152 px.` — and nothing else. Do not attempt a phone layout |

**Long Italian labels are the default case, not the edge case.** "Certificati medici in scadenza", "Riepilogo gestionale completo", "Composizione della quota" must fit. Rules: sidebar labels never truncate — the rail is 256px because of them; column headers wrap to two lines rather than ellipsing; cell text ellipses with the full value in a `title` tooltip; buttons never ellipse — if a label does not fit, the button is the wrong size or the label is the wrong label. Reserve ~30% over the English length when sizing anything.

## 5.9 Accessibility

- **Focus is visible on everything**, including rows, chips, tabs and menu items. Tab order follows the DOM: skip-link → sidebar → topbar → page header → filters → grid → panels.
- **Skip links**: "Vai al contenuto" and "Vai all'elenco" as the first two focusables.
- **Icon-only controls** (bell, collapse, row overflow, inline icon actions) always carry an `aria-label` in Italian and a 500ms-delay tooltip with the same words. Their hit box is ≥32×32 even when the glyph is 13px.
- **Status never relies on colour**: every coloured element carries its Italian word, and the pill's ring dot gives a second non-colour cue. A red row is forbidden.
- **Numbers announced in context**: `aria-label="7 certificati da sistemare"`, not "7".
- **Grid keyboard model** is in `07-web-datagrid.md` §7.9.
- **Destructive affordances**: red is the outline/label, never a solid fill on a button that sits next to a routine one; the strongest confirmation is typed (`08-web-forms.md` §8.9).
- Landmarks: `<nav>` sidebar, `<header>` topbar, `<main>` content, `<aside>` inspector. Live regions: toasts `polite`, bulk-operation progress `polite`, validation summary `assertive`.
- Zoom to 200% must not clip content: panels reflow, the grid scrolls.
