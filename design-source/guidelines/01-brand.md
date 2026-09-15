# 01 · Brand — Core

**EGDS v3.0.0 · CURRENT.** Platform-independent. Applies to mobile today, web/desktop when it is designed.

## 1.1 Product name

- The product is **EasyGame**. Everywhere: in UI copy, in headings, in state screens, in store metadata.
- **"EasyGame Mobile" is not a product name.** It was used as a tracked caps product line in v2.x base bands and is now removed. If a platform must be named — a cross-platform support screen, a release note — say "l'app EasyGame" or "EasyGame per iOS/Android"; never brand a surface with it.
- Screen titles never repeat the product name. `Dashboard`, not `EasyGame Dashboard`.

## 1.2 Marks

Three assets, in `assets/`: the **wordmark** (`logo-blue.png` / `logo-white.png`), the **"e" mark** (`icon-blue.png` / `icon-white.png`), and app/store icons. Nothing here is drawn or reconstructed — all files came from the brand owner.

- **The mark may be used alone**, independently of the wordmark. It is the primary brand device on small and dark surfaces.
- **The mark is never boxed.** No gradient tile, no rounded container, no coloured plaque behind it. Two treatments only:
  1. **Plain mark** — 20–26px, white on blue grounds, blue on light grounds, paired with the wordmark or standing alone.
  2. **Watermark** — the same mark at ~460px, white at 5% (`--eg-watermark-opacity`), bleeding off the lower-right corner, behind the court arcs. Never behind text that has to be read.
- On a blue or navy ground the mark is always the **white** file; on mist or glass, the **blue** file. Never the blue mark on blue.
- Minimum clear space around either mark: the height of the mark's own bar. Never distort, rotate, recolour, outline, or add a shadow.
- The wordmark's minimum height is 14px; below that use the mark alone.

## 1.3 EasyGame + club hierarchy

Two brands appear on screen and their relationship is fixed:

| | Meaning | Placement | Weight |
| --- | --- | --- | --- |
| **EasyGame** | Product identity — who made this and what app you are in | Sky, top-left of every primary screen: mark + wordmark | Always first, always left |
| **Club** | Operational context — whose data you are looking at | Sky, top-right: a chip carrying crest + club name | Subordinate: smaller, contained, tappable |

- Read as **"EasyGame per Fortitudo Scauri"**. Product left, club right, on one line.
- The **club chip** is 32px tall, 24px crest, white-14% fill, white-24% hairline, pill radius. It is also the club/role switch control where a person has more than one membership.
- **The club is never in the title slot** and never replaces the EasyGame mark. A club may not theme the app: no club colours on chrome, no club logo as the app background.
- Below the brand line, the **eyebrow** carries the operational scope — role, team, date, or selected child (`Allenatore · Mer 18 mar`, `Genitore · Matteo Rossi`).
- On secondary screens the brand line may be dropped; the club stays only where the screen would be ambiguous without it (documents, payments, enrollment).

## 1.4 Identity without the logotype

Four proprietary devices make a screen recognisable with the wordmark covered. Use them on brand-owned screens (auth, account, blocking states, splash):

1. **Court arc** — two concentric 1px circles at white 8–12% (`--eg-court-arc`), anchored off the bottom-right corner, echoing a centre circle in perspective.
2. **Baseline + tick** — a 1px white rule across the screen (`--eg-baseline-rule`) with a 22px vertical tick at the left inset (`--eg-baseline-tick`), the way a court line meets a sideline.
3. **Watermark mark** — as above.
4. **Tracked caps step label** — the screen's step or section as 10px/700 uppercase at 0.16em in white 66%, top-right, opposite the mark.

On operational screens the recognition comes instead from the structural signature (§02.7): cut corner, time rail, number tiles, module stripes.

## 1.5 Voice

Italian, always. Short, factual, never playful. No emoji, no exclamation marks, no marketing language. Status is a word, never a colour alone. Numbers always carry context (`14/18 presenti`, `18:00 - 19:30`). Full detail in `readme.md` → Content fundamentals; nothing there changed in v3.
