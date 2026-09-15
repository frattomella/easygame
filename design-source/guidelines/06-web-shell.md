# 06 · Web — app shell

**EGDS v3.1.0 · CURRENT.** The shell is identical on every page of the club workspace. A page never restyles it, never hides it, never adds a second navigation.

Shell = **sidebar** (left, fixed) + **topbar** (top of the content column, fixed) + **content column** (scrolls). Nothing else is chrome. There is no application footer.

## 6.1 Expanded sidebar — 256px

- **Ground**: `--egw-grad-sidebar` `linear-gradient(168deg,#3b82f6,#2563eb 42%,#3533cd)` plus a top sheen `linear-gradient(180deg,rgba(255,255,255,.1),transparent 22%)`. Right edge: `inset -1px 0 0 rgba(255,255,255,.14)` and `6px 0 24px -12px rgba(11,26,58,.45)`. **No floodlight pools, no pitch lines** — the sidebar is a clean brand ramp; the pitch treatment belongs to the sky band.
- **Logotype**: `assets/logo-white.png`, 168px wide, centred, padding 26/20/22. Never the mark alone at this width, never retyped as text, never recoloured. Clear space ≥ the cap height of the wordmark on all sides.
- **Club switcher** directly under it: 11/12 padding, white 14% fill, white 26% border, `--egw-r-field`, inner top highlight. 32px round club avatar (navy gradient, initials 800/10 when no crest), club name 700/12.5 white (ellipsis), season 500/10 tabular white 68%, trailing 13px `chevron-down`. Clicking opens a menu listing the user's clubs + seasons; one club and one season only → the switcher becomes a static label with no chevron.
- **Groups**: eyebrow 700/9.5 +0.12em white 58%, padding `0 10px 8px`, 17px gap between groups, 3px between items. Group order is fixed:

  `PANORAMICA` Dashboard · Report — `PERSONE` Atleti · Allenatori · Staff · Soci · Categorie · Certificati medici · Procure — `ATTIVITÀ SPORTIVA` Calendario · Allenamenti · Gare · Strutture — `SEGRETERIA` Iscrizioni · Documenti · Comunicazioni — `CASSA E AMMINISTRAZIONE` Prima nota · Quote e rate · Compensi · Contributi e bandi — `IMPOSTAZIONI` Club · Utenti e ruoli · Stagioni

  **Never more than six groups and never more than eight items in a group.** A module that exists in the product but is not in this list goes in the group its noun belongs to — it does not get a group of its own.
- **Item**: height 38 rest / 40 active, padding `0 12px`, gap 11, radius `--egw-r-control`. Glyph 17px. Rest: glyph white 82%, label 500/13 white. Hover: white 10% fill, label 600. **Active: white fill**, radius 13/13/4/13, `0 10px 22px -12px rgba(7,18,43,.5)`, glyph `#1D4ED8`, label 700/13 `#12265A`. The active item is the only opaque surface in the sidebar and there is exactly one.
- **Trailing numbers** — two kinds, never both on one item: a **data count** (700/11 tabular, white 70%) means "how many there are"; a **problem badge** (white pill, 800/10 tabular, `--egw-red` label, or solid red with white label on the active white item) means "this many need you". Cap at `99+`. The badge is also the number the Dashboard alert cards use — they must agree.
- **Collapsed groups**: a group can collapse to its eyebrow with a trailing chevron; state persists per user. The group holding the active item cannot be collapsed.
- **Permissions**: an item the role cannot reach is **not rendered** — never greyed. If a whole group empties, the group header goes too. A role that can reach fewer than four destinations gets no groups at all, just a flat list.
- **Footer**: `Centro assistenza` block, margin 14, padding 12/13, white 12% fill, white 22% border, `--egw-r-field`, 15px help glyph, label 500/12 white 90%, trailing chevron. This is the only sidebar footer. No version string, no "powered by" line — that belongs on the login page.
- **Scroll**: the item list scrolls; logotype, switcher and footer are pinned. A 1px white-14% rule appears at the scroll edge.

## 6.2 Collapsed sidebar — 72px

Same gradient, same order, same active logic. Logotype becomes `assets/icon-white.png` at 30px, centred. Club switcher becomes the 32px club avatar alone, centred, with the chevron removed (click still opens the menu). Group eyebrows become a 1px white-16% rule, 12px wide, centred. Items become 44×44 glyph tiles, 17px glyph, gap 6; active is a white tile with `--egw-r-control` and a `#1D4ED8` glyph; badges shrink to a 7px dot at the tile's top-right (count moves to the tooltip). Footer becomes the help glyph alone.

**Tooltip on every item**, right-anchored, 8px offset, 500ms delay: navy `#0B1A3A`, white label 500/12, `--egw-r-chip`, plus the count as a second line when one exists (`Certificati medici · 7 da sistemare`). The collapse toggle is a 28px chevron pinned under the logotype; its state persists per user and survives reload. Collapsing widens the workspace by 184px — grids use it, page gutters do not change.

## 6.3 Topbar

Two variants; the page's environment picks one.

**Light topbar (environment 1 — every working page).** 60px, white, `0 1px 0 rgba(11,26,58,.09)`, then a **3px `--egw-grad-hairline` strip directly below it**. That strip is the web signature and appears on every gestionale page. Contents, left to right:

1. **Breadcrumb** 500/12.5 ink 50%, `/` separators, last crumb 700 ink 100%: `Fortitudo Scauri / Persone / Atleti`. Max four levels; deeper paths elide the middle as `…`. The breadcrumb is the only back affordance — no back arrow.
2. **Global search** 36px, 280px max, `--egw-page-100` fill, `--egw-r-control`, 15px search glyph, placeholder `Cerca in tutto il club` ink 42%, trailing `⌘K` 600/10 mono ink 42%. Opens the command palette (§6.6). At ≤1280 it collapses to a 38px icon button.
3. **Right cluster**, gap 10: season chip (`STAGIONE` eyebrow + tabular year, `--egw-page-100`, `--egw-r-chip`) · **Azioni rapide** button · notification bell · account button.

**Sky topbar (environments 2 and 3).** 64px, transparent, sitting on the sky band. Search becomes white 14% fill / white 26% border with white 75% text. The Azioni-rapide button **inverts to white with a navy label and a gradient `+` tile** — the action gradient is banned as a full fill on blue. Bell and account become white 14% / white 26%. No 3px hairline (the horizon does that work).

**Azioni rapide button**: 38px, label 700/12 +0.06em caps, leading 24px tile with a `+`. On light ground: action-gradient fill, white 28% rim, `--egw-glow-action`, white label, `+` tile white 20%. On sky: white fill, `#12265A` label, `+` tile in action gradient. Shortcut `⌘J`.

**Bell**: 38px square, `--egw-r-control`. Unread → 7px amber `#F59E0B` dot at top 7 / right 8 with a 2px rim in the surface colour (white on light, `rgba(16,32,78,.9)` on sky). The count is never on the glyph — it is the first line of the panel. Clicking opens a 392px right drawer: `NOTIFICHE` eyebrow, `Segna tutte come lette`, then rows grouped `Oggi` / `Questa settimana` / `Prima`. A row is 56px: 34px tinted icon chip by severity, title 600/12.5, body 400/11.5 ink 62%, relative time 400/10.5 ink 50%, unread marked by a 6px blue dot on the leading edge. Rows are actionable — the primary verb sits inline (`Vedi`, `Sollecita`, `Registra`).

## 6.4 Account menu

Button: 38px, gap 9, padding `0 11px 0 6px`, `--egw-r-control`. 27px round avatar (navy gradient, initials 700/9.5 white), first name 700/12, 12px chevron (rotated 180° while open). Light: `--egw-page-100` fill; open: `#EEF3FE` fill + `rgba(37,99,235,.35)` border + inner top highlight. Sky: white 14% fill; open: solid white.

Menu: 262px, anchored to the button's right edge, 8px below, padding 6, `--egw-r-menu`, `--egw-plane-menu`. Over the sky it is the one glass surface: `rgba(255,255,255,.94)` + `blur(18px) saturate(1.4)` + white 70% border.

1. **Identity header** — 38px avatar, name 700/13, then `Ruolo · Club` 400/10.5 ink 55%. 1px hairline under it.
2. `Profilo` — 38px row, 16px glyph, 600/12.5. Current-page row gets `--egw-page-100` and a `#1D4ED8` glyph.
3. `Assistenza` — 500/12.5 ink 78%, ink-55% glyph.
4. 1px hairline, inset 10px.
5. `Esci` — glyph and label both `--egw-red`, 600/12.5. It is a plain item, not a button, and it needs no confirmation.

A user with more than one role in the club gets a `Ruolo` sub-row between Assistenza and the hairline, showing the active role and opening a submenu. Keyboard: `Esc` closes, arrows move, `Enter` activates, focus returns to the button.

## 6.5 Azioni rapide drawer

**392px right drawer** over a `--egw-scrim` + 5px blur scrim. It is the single global "create" surface: everything creatable from anywhere is in it, and nothing else is.

- **Header**: `--egw-grad-drawer` with a top sheen, padding 22/22/20. `AZIONI RAPIDE` eyebrow white 72%, then `Cosa devi registrare?` 800/21 white, then one line of 400/11.5 white 80% explaining that the shortcut opens a compact form **inside the drawer** without leaving the page. Close: 30px white-16% tile, white 30% border, `--egw-r-chip`, 15px `close-circle-outline`.
- **Shortcut rows**: gap 8, padding 12/13, `--egw-r-field` (15/15/5/15), white fill, `rgba(11,26,58,.1)` border. **First row is promoted**: `#F7F9FE` fill + `rgba(37,99,235,.22)` border + inner white highlight. Each row = 34px tinted icon chip (semantic tint + 26% border + inner highlight, 17px glyph) · title 700/13 · one line of 400/10.5 ink 58% naming the fields it will ask for · trailing 13px chevron (blue on the promoted row, ink 35% otherwise) **or** a count chip when the row exists because something is waiting (`7` in a red tint chip on `Registra certificato medico`).
- **Canonical order** — need first, routine second: Nuovo atleta · Registra certificato medico · Nuovo allenamento · Nuova gara · Registra pagamento · Registra movimento · Nuova comunicazione · Nuova iscrizione. Rows the role cannot perform are **absent**.
- **Usate di recente**: eyebrow, then up to three 28px chips of the user's last shortcuts, 500/11.5 ink 72%, `--egw-page-100`, `--egw-r-chip`.
- **Footer**: `Scorciatoia ⌘J` 400/11 ink 55% + a `Personalizza` 34px secondary button on the right, which lets the user reorder/hide rows.
- **Picking a row replaces the drawer body** with that shortcut's compact form (§`08-web-forms.md` §8.6), keeping the blue header and gaining a back chevron. It never navigates away and never opens a second layer. On save: the drawer closes, a success toast appears with a `Vedi` action.
- **Empty / permission-limited**: if the role can create nothing, the drawer does not exist and the button is not rendered. If it can create only one thing, the button performs that action directly and the drawer is skipped.

## 6.6 Command palette — specified, ship later

`⌘K` from the topbar search. Centred, 640×max 480, `--egw-r-panel`, plane 2, over the standard scrim. One field at the top (46px, no border, 15px placeholder `Cerca atleti, gare, movimenti`), then grouped results: `ATLETI`, `PAGINE`, `AZIONI`. Rows 44px, arrow-navigated, `Enter` opens, `⌘Enter` opens in a new tab. Recent searches when the field is empty. Until it ships, `⌘K` focuses the topbar field and nothing more — **do not build a second search UI.**

## 6.7 Overlays and layers — which one to use

| Layer | Width / size | Use it for | Never for |
| --- | --- | --- | --- |
| **Right drawer** | 480 (create/edit) · 392 (quick actions, inspector, notifications) · 720 (multi-section form) | Creating and editing a record, inspecting a row, a guided operation, notifications | A confirmation |
| **Inspector** | 392 drawer, or a persistent 320 rail at ≥1600 | Reading one row's detail while the list stays visible. Read-mostly, with a `Apri scheda` link to the full record | Editing more than two fields |
| **Modal** | 460 (confirm) · 560 (a genuinely modal decision) | Confirmations, destructive actions, a choice that must be made before anything else | Forms, long content, anything scrollable |
| **Popover** | 240–320 | A filter's value list, a date picker, a column-visibility list, a small explanation anchored to its trigger | Anything with its own primary action |
| **Dropdown menu** | 200–262 | Row overflow (`···`), account, "Altre azioni" | More than nine items — that is a drawer |
| **Tooltip** | max 260 | Naming an icon-only control, showing a truncated value, explaining a disabled or read-only state | Anything the user must read to proceed |
| **Toast** | 360, bottom-right | Confirming something that already happened, with `Annulla` where undo exists | Errors that block work — those are inline |

Rules that do not bend: **one layer at a time.** A drawer may not open a modal except for a destructive confirmation. A modal may never open a drawer. Nothing opens a third layer. Every layer closes on `Esc`, on scrim click (except a destructive modal and a dirty form, which ask first), and traps focus while open, returning it to the trigger on close. Scrim is always `--egw-scrim`; only the quick-actions and notification drawers add the 5px blur.

**Dirty-state guard**: closing a drawer or modal with unsaved edits opens a 460 modal — `Modifiche non salvate` / `Se chiudi ora perdi le modifiche a questa scheda.` / `Continua a modificare` (secondary) · `Chiudi senza salvare` (red outline). Never discard silently, never auto-save a partial record.
