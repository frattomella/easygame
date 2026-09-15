# 07 · Web — the DataGrid

**EGDS v3.1.0 · CURRENT.** One grid serves every list in the product: Atleti, Allenatori, Staff, Soci, Categorie, Certificati medici, Procure, Iscrizioni, Documenti, Prima nota, Quote e rate, Compensi, Contributi, Report, Strutture, Utenti — and every module added later. **There is no second table component.** A module that needs a list configures this one; it does not draw its own.

## 7.1 Anatomy — the order is fixed

A DataGrid is one plane-1 panel, `--egw-r-panel-sm`, `overflow:hidden`, containing up to seven bands top to bottom. Bands 3–5 appear only when they apply; the rest are always present.

1. **Views bar** — saved views (§7.6) + in-grid search
2. **Toolbar** — filter entry, active filter chips, clear-all, column control, density toggle, export
3. **Bulk bar** — only while rows are selected (§7.7)
4. **Header row** — 40px, sticky
5. **Body** — rows
6. **Footer** — range, total, page size, pagination
7. *(optional)* **Group headers** when the list is grouped by category

Above the panel sits the **page header** (`09-web-patterns.md` §9.2): title, one-line description, and the page's single primary action (`+ Nuovo atleta`). Grid-scoped actions never climb into the page header, and the page's primary action never sits inside the grid.

## 7.2 Views bar

Height 52, padding `11px 16px`, 1px `--egw-hairline` below. `VISTE` eyebrow, then view chips, then `+ Salva vista`, then the in-grid search pushed right.

- **View chip**: 30px, padding `0 11px`, gap 6, `--egw-r-chip` (11/11/4/11), label 500/12 + a tabular count. Rest `--egw-page-100` with a `rgba(11,26,58,.1)` border. **Active: solid `#12265A`**, white label, count white 70%. A view whose meaning is a problem carries its semantic tint instead (`Certificato scaduto` → red 7% fill, red 26% border, red label) and stays tinted when active, with the fill going solid red.
- The first chip is always `Tutti` with the unfiltered total. It cannot be renamed or deleted.
- `+ Salva vista`: 30px, 1px dashed `rgba(11,26,58,.22)`, 600/11.5 ink 55%. Appears only when the current filter set differs from the active view.
- **In-grid search**: 32px, min 180, `#F7F9FE`, `rgba(11,26,58,.12)` border, 14px glyph, the typed term 500/12 ink 100%, a 1px divider, then `3 risultati` 400/11 ink 50%, then a 13px clear glyph. It searches the loaded list and is **not** a filter chip — it does not persist into a saved view.

## 7.3 Toolbar

Height 50, padding `10px 16px`, ground `--egw-page-025`, hairline below.

- **`Filtri` button** 30px, white, `--egw-control-border`, 600/12, with a navy count pill when filters are active. Opens the filter popover (§7.5).
- **1px 22px divider**, then one **filter chip per active filter**: 28px, `rgba(37,99,235,.08)` fill, `rgba(37,99,235,.28)` border, `--egw-r-chip`, label 500/11.5 `#1D4ED8` written as **`Campo:` in 700 then the value(s)** — `Categoria: Under 15, Under 17`. Three or more values collapse to `Categoria: 3 selezionate` with the list in a tooltip. Each chip has its own 12px `close-circle`.
- **`Azzera tutto`** 600/11.5 ink 50%, text only, appears with the second chip.
- Right cluster: **`Colonne`** (30px, white, 14px `eye-outline`, label + `7/11` in 500/11 ink 50%) · **density toggle** (30px segmented, `#EEF3FE` track, `rgba(11,26,58,.1)` border, 2px padding; the selected segment is a white 24px pill with `0 1px 2px` and a 700/11 `#12265A` label — three segments `Compatta · Media · Comoda`) · **`Esporta`** (30px, white, opens a menu: `Esporta CSV`, `Esporta PDF`, `Esporta selezione`, and `Importa…` when the module supports it).
- Everything in the toolbar that changes what the user sees persists per user per module: filters, density, column set, page size, sort, active view.

## 7.4 Header, rows, columns

**Header row** 40px, `--egw-page-100`, 1px `rgba(11,26,58,.1)` below, sticky inside the panel. Column head 700/9.5 +0.10em caps ink 52%. The sorted column's head goes `#12265A` and grows an 11px chevron (up = ascending); sorting is single-column, click toggles asc → desc → asc (never back to unsorted), and the sort persists.

**Row heights** come from the density token: comoda 48 · **media 44 (default)** · compatta 40. `padding: 0 16px`, `gap: 12px`, 1px `--egw-rule` below each row. No row is ever taller than 48 — breathing room is taken between panels, not inside rows.

**Row states.** Hover `--egw-row-hover`. Selected `--egw-row-selected` + filled check + `inset 3px 0 0 var(--egw-blue)`. Active (the row whose inspector is open) `#F7F9FE` + `inset 0 0 0 1px rgba(37,99,235,.14)`. Focused (keyboard) gets the focus ring inset 2px. **A row is never tinted by its status** — status lives in its pill.

**Column layout, left to right, always:**

| Slot | Width | Content |
| --- | --- | --- |
| Selection | 38px | 16px checkbox, `--egw-r-check`. Unchecked 1.5px `rgba(11,26,58,.3)`; checked action-gradient fill + white `checkmark`; indeterminate a 8×2px bar |
| **Identity** | `2fr`, min 220, pinned on horizontal scroll | 32px identity tile (`--egw-grad-navy`, `--egw-r-chip`, jersey number 800/12.5 tabular white — or 2-letter initials for non-athletes) · name 600/12.5 · one meta line 400/10 ink 50% (`14 mar 2011 · Scauri`). The name is the row's link to its record |
| Classification | `~1fr` each | Category, role, sede, conto — 500/12 ink 75%, left |
| Status | `~1.1fr` | One status pill, `width:fit-content`, left-aligned |
| Dates | `~1.2fr` | Left, tabular. A date that is also a state (certificate expiry) shows the pill, not the raw date, with the date in its tooltip |
| Amounts | `~.95fr` | **Right**, 700/12 tabular, semantic ink (`#15803D` paid, `#B45309` partial, `#B91C1C` overdue). A settled amount may read `saldata` in green instead of a figure |
| Actions | 78px, right | One 26px icon button for the row's single most-used verb + a 26px `···` overflow. Icon buttons are white with a `rgba(11,26,58,.14)` border, `--egw-r-micro` (9/9/3/9), 13px glyph ink 60% |

**Rules.** Identity left, classification centre, states after, money right, actions last. Never more than **eight visible columns** — the ninth goes into the inspector. Never two status pills in one row; when a module genuinely has two lifecycles (athlete status *and* certificate), they are two columns with two headers, which is what Atleti does. Cells never wrap: they ellipse with the full value in `title`. Column widths are `fr`-based with `min-width`; the user may drag a divider to resize and reorder by dragging the header, and both persist.

**Chip overflow in a cell** (categories, tags, sedi): show up to two 10/4 data chips, then `+3` as a third chip whose tooltip lists the rest. Never wrap a cell to two lines, never shrink the chips.

**Custom columns.** Modules with club-defined fields expose them in the `Colonne` popover under a `PERSONALIZZATE` group. They render as plain text, number (tabular, right) or data chip — a custom field never renders as a status pill, because the system does not know its semantics.

**Grouped lists.** Atleti groups by category by default: a 36px group header on `--egw-page-100` with a 8px category dot, `Aquilotti` 700/12.5, count 700/11 tabular ink 50%, a collapse chevron on the left and a `Report` text action on the right. Group collapse state persists. Grouping is off by default in every other module.

## 7.5 Filtering

**Standard filters** are the two or three the module is used with daily; they live as chips in the toolbar and are added from the `Filtri` popover. The popover is 320 wide, `--egw-r-menu`, plane 2, and lists the module's filterable fields as rows; picking one expands its values inline (checkbox list with a search field above it past eight options). It has no Apply button — each change applies immediately and the grid reloads; `Azzera tutto` sits at its foot.

**Advanced filters** (multi-condition, and/or, date ranges, "certificato scade entro X giorni") open the 480 drawer: one condition per row — field select, operator select, value control, remove — with `+ Aggiungi condizione` beneath and `Applica` / `Azzera` in the sticky footer. The drawer is for building; the toolbar chips are the result.

**Filter count** is always visible in two places: the pill on the `Filtri` button, and the footer's `7 di 184`. A filtered-empty result is its own state (§7.8) and must offer `Azzera i filtri`.

## 7.6 Saved (personal) views

A view = filters + sort + grouping + column set + density, named. Not the in-grid search term.

- **Create**: `+ Salva vista` opens a 320 popover — name field (placeholder `Es. Certificati da sistemare`), a `Rendi predefinita` toggle, and, for roles that may, a `Condividi con il club` toggle. Saving adds the chip at the end of the bar and activates it.
- **Manage**: right-click or a `···` on the chip → `Rinomina` · `Duplica` · `Imposta come predefinita` · `Condividi con il club` / `Rendi personale` · `Elimina` (red, and the only view action that confirms — a 460 modal, no typed confirmation).
- **Personal vs club**: a club view carries a 12px `people-outline` glyph before its label and can only be edited by the role that can share. A user may duplicate a club view into a personal one; they may not edit it in place.
- **Default view** loads on entering the module. Without one, `Tutti` loads. Changing filters inside a view marks it dirty: the chip gains a 5px blue dot and `+ Salva vista` becomes `Aggiorna vista` with `Salva come nuova` beside it. Navigating away and back restores the dirty state for the session; a reload restores the saved one.
- Cap: 12 personal + 8 club views per module. Beyond that, saving asks the user to delete one.
- **Views are the answer to "where do I find X again?"** Every alert in the product that counts rows (`7 certificati da sistemare`) links to a pre-filtered grid, and offers to save it as a view on arrival.

## 7.7 Selection and guided bulk operations

**Selection.** Header checkbox selects the loaded page and goes indeterminate when partial. The bulk bar then offers `seleziona tutti i 184` as an underlined text action — selecting beyond the page is always explicit and always states the number. `Annulla selezione` clears. Selection survives sorting and paging within the session and is cleared by changing filters (with the count restated in a toast: `Selezione azzerata dal cambio di filtri`).

**Bulk bar.** Only while a selection exists: 38px band, `linear-gradient(135deg,rgba(59,130,246,.12),rgba(53,51,205,.12))`, `rgba(37,99,235,.22)` border below. 19px gradient check tile · `3 selezionati` 700/12.5 `#12265A` · the select-all text action · divider · up to four 28px operation buttons (white, `rgba(37,99,235,.3)` border, 600/11.5 `#1D4ED8`; destructive ones get a red border and label) · `Annulla selezione` right. More than four operations → a `Altre azioni` overflow.

**Guided mass action** — the reusable six-step flow, always in a 480 drawer, never a modal:

1. **Operazione** — the chosen verb as the drawer title, with the count in the eyebrow (`AZIONE SU 37 ATLETI`).
2. **Record interessati** — a compact scrollable list of the affected rows (identity tile + name + the field about to change), with anything excluded shown struck through and a reason chip (`Permesso mancante`, `Certificato scaduto`). The count updates: `34 verranno aggiornati · 3 esclusi`.
3. **Opzioni** — the operation's own fields (target category, reminder text, date, whether to notify families).
4. **Conferma** — a plane-0 summary block restating what will happen in one sentence in Italian, plus the count. Destructive operations add the typed confirmation from `08-web-forms.md` §8.9.
5. **Avanzamento** — the drawer body becomes a determinate progress bar in the action gradient with `18 di 37` in tabular figures beneath, and a `Interrompi` text action. The drawer cannot be dismissed while running; closing the browser does not roll back, and the copy says so.
6. **Esito** — `34 aggiornati · 3 non riusciti`, with the failures listed by name and reason and two actions: `Riprova sui 3 non riusciti` and `Esporta esito CSV`. Where the operation is reversible, `Annulla operazione` appears here and in the success toast for 10 seconds; irreversible operations say `Operazione non reversibile` in the same slot instead of offering a dead undo.

**Partial failure is a first-class outcome**, never a generic error: the operation reports per-record, and a failure never rolls back the successes unless the domain requires it (in which case step 4 says so).

## 7.8 States

| State | Treatment |
| --- | --- |
| **Loading** | Skeleton in the grid's own shape: same row height, same column widths, 34px tile block + 11px bars, `rgba(11,26,58,.07)`, pulse .6↔1 / 1.4s. Bands 1–2 render live and disabled. Past 3s add an indeterminate 2px bar under the header — never a spinner, never an apologetic sentence |
| **Empty (nothing exists yet)** | Inside the panel body: 44px tinted icon chip, title 700/15 (`Nessun atleta in archivio`), one line 400/12.5 ink 62% saying what to do, then the module's primary action as a 38px gradient button. Optional `Importa da CSV` as a secondary |
| **Filtered empty** | Same block, different copy — `Nessun risultato con questi filtri` + `Prova a togliere un filtro o allarga il periodo.` — and the actions are `Azzera i filtri` (primary) and `Modifica filtri`. **Never** show the create action here |
| **Error** | Red-tint alert block inside the panel: `Non è stato possibile caricare l'elenco.` + one line of cause if known, `Riprova` primary and `Segnala il problema` secondary. Bands 1–2 stay so the user does not lose their filters |
| **Permission-restricted** | The grid loads with the columns the role may see; hidden columns are simply absent. If the role may see no rows at all, the page shows a plane-1 panel: `Non hai accesso a questo elenco` + `Chiedi a un amministratore del club di abilitare il permesso.` and nothing else. Never an empty grid with headers |
| **Partially restricted row** | The row renders, restricted cells show `—` with a tooltip `Non visibile con il tuo ruolo`; row actions the role lacks are absent, not disabled |
| **Large dataset** | Server-side paging always. Page sizes 25 (default) · 50 · 100, in the footer. Above 2,000 rows the grid virtualises the body and the footer reads `184 di ~12.400`; sorting and filtering stay server-side. Select-all beyond one page always states the count and warns past 500: `Stai per agire su 1.240 record.` |
| **Stale** | If data was fetched more than five minutes ago and the tab regains focus, a 28px `Aggiorna` chip appears in the views bar. The grid never reloads under the user's hands |

**Footer**: 44px, `--egw-page-100`, hairline above. `Righe 1–25 di 184` with the numbers 700 tabular ink 100%; page-size select on the left of the pager; pager on the right — 32px squares, `--egw-r-control`, white with `--egw-field-border`, the current page solid `#0B1A3A` with a white numeral, `‹`/`›` disabled at the ends. Above 10 pages the pager elides (`1 2 3 … 12`) and gains a `Vai a pagina` field.

## 7.9 Keyboard model

`Tab` enters the grid at the header row; the body is a single tab stop and arrows move within it. `↑ ↓` move the focused row · `← →` move the focused cell when cells are interactive (inline editing, actions) · `Space` toggles the row's selection · `Shift+↑/↓` extends the selection · `⌘A` selects the page · `Enter` opens the focused row's record · `⌘Enter` opens the inspector · `Backspace` is never bound to delete · `/` focuses the in-grid search · `Esc` clears the selection, then the in-grid search, then blurs. Row actions are reachable with `→` then `Enter`. The header's sort chevron is a button and activates on `Enter`/`Space`. Every one of these is announced: the grid is a `role="grid"` with `aria-rowcount`, rows are `role="row"` with `aria-selected`, and the sorted header carries `aria-sort`.

## 7.10 Export and import

**Export** always lives in the toolbar's `Esporta` menu, never as a page-header button. It exports **what the user is looking at** — current filters, current column set, current sort — and says so in the menu's footer line (`Esporta le 7 righe filtrate, 7 colonne`). `Esporta selezione` appears only with a selection. PDF exports are landscape, carry the club name, season, filter summary and generation date in a header band, and drop the actions column. Large exports (>2,000 rows) switch to an asynchronous job: a toast (`Esportazione in corso · ti avvisiamo quando è pronta`) and a notification with the download when done.

**Import** is a 720 drawer, four steps, reusing the guided-operation shell: upload (drag/drop, `.csv`/`.xlsx`, a `Scarica il modello` link) → map columns (source column → EasyGame field, with auto-matches pre-filled and required fields marked) → validate (a per-row report — `182 pronte · 2 da correggere` — with the errors listed and editable inline) → import with the same progress and result steps as §7.7. Nothing is written until the final confirm.
