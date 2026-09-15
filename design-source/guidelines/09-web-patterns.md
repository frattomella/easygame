# 09 · Web — page patterns, cards, status and feedback

**EGDS v3.1.0 · CURRENT.** Ten page patterns, one card vocabulary, one status system, one alert pattern. A new module picks a pattern; it does not invent a layout.

## 9.1 The ten page patterns

| # | Pattern | Skeleton | Used by |
| --- | --- | --- | --- |
| 1 | **Operational list** | page header → DataGrid panel (full width) | Atleti, Allenatori, Staff, Soci, Certificati medici, Iscrizioni, Documenti, Procure, Compensi, Strutture, Utenti |
| 2 | **Detail / profile** | record header → area tabs → sectioned panels, inspector on demand | Scheda atleta, allenatore, staff, categoria, gara, allenamento |
| 3 | **Dashboard** | sky band → greeting + KPI bar → work queue ⟂ today rail → alerts | Dashboard club |
| 4 | **Analytics / report** | page header + period & scope filters → KPI row → one or more table/chart panels | Report, Analitiche |
| 5 | **Settings** | page header → left section nav (220px, sticky) → sectioned forms with per-section save | Impostazioni club, Stagioni, Ruoli |
| 6 | **Full-page form** | page header → sectioned panels → sticky action bar | Nuova categoria, piano quote |
| 7 | **Multi-section form / stepper** | stepper header → one step per screen → sticky footer | Iscrizione, onboarding club |
| 8 | **Empty module** | page header → one plane-1 panel with the empty state and the module's first action | Any module before first use |
| 9 | **Onboarding** | environment 3 sky → centred 560 panel → stepper | First club setup, invitation acceptance |
| 10 | **Dense administration** | page header → filter band → two stacked grids, or grid + 320 rail | Prima nota, Quote e rate, Contributi |

**Prima nota** is pattern 10 and is the reference for a money page: a `SITUAZIONE FINANZIARIA` block (cassa, real movements) and a visually separated `SITUAZIONE ECONOMICA` block (crediti/debiti, accrual) — the second sits in a plane-0 dashed-border container so it can never be read as cash — then the filter band, then the movements grid. The disclaimer line stays: internal summary, not a filed statement.

## 9.2 Page header anatomy

Fixed order, always. Nothing else goes in it.

1. **Breadcrumb** — in the topbar, not here (`06-web-shell.md` §6.3).
2. **Title** 800/32 ink 100%, or white on the sky. A record page uses the record's name.
3. **Description** — one line, 400/13.5 ink 62%, max 88ch, saying what the page is *for*, not what it contains: `Gestisci gli atleti tesserati del tuo club.` Optional, but if a page has one it never becomes two.
4. **Context controls** — right of the title, not in the filter bar: sede, stagione, ruolo, categoria scope. They change what the page *means*. 34px, white, `--egw-r-control`, 600/12.5 + a 12px chevron.
5. **Actions** — right-aligned, at most three: one primary (action gradient, 40px, with the trailing arrow chip only on a page primary) + up to two secondaries, then a `···` overflow. A page has **exactly one** primary; if two actions feel primary, one of them belongs in the overflow or in the grid toolbar.
6. **Contextual status / alert** — a full-width alert block (§9.6) directly under the header when the page itself is in a state worth announcing (`Stagione chiusa: i dati sono in sola lettura.`).

Sticky behaviour: after 120px the header condenses to 52px — title 20/800, actions kept, description and context controls dropped — on `rgba(255,255,255,.92)` with a 12px backdrop blur and the 3px gradient hairline underneath.

## 9.3 Cards and panels

One vocabulary. All are plane 1 with `--egw-r-panel` unless stated. **A card inside a card is forbidden** — the inner block drops to plane 0 on `--egw-page-100`.

| Card | Anatomy |
| --- | --- |
| **KPI card** | Eyebrow (label) → value 800/30 tabular −0.03em → one line of 400/11.5 ink 62% qualifying it (`su 6 categorie, 2 sedi`). Optional 32px icon chip top-right. A delta reads `+9` in 700/12 green or red **beside** the value, never as an arrow alone. Padding 20/22 |
| **Compressed KPI bar** | 3–5 KPI cards in one `repeat(n,1fr)` row, 14px gap, used at the top of a dashboard or report. On the sky the cards stay white and opaque |
| **Summary card** | Eyebrow + title, then 2–6 label/value rows (label 400/12 ink 62% left, value 700/13 tabular right) separated by 1px dashed `--egw-hairline`, and one emphasised total row (label 600/13, value 800/15) |
| **Actionable card** | Summary card + a footer action row (hairline above, 14px padding): one primary text/secondary action and at most one more. The whole card is not a click target — the action is |
| **Alert card** | §9.6 |
| **Info card** | Plane 0 on `--egw-page-100`, 1px `--egw-hairline`, `--egw-r-field`: eyebrow + one paragraph 400/12.5 ink 62%. For explanations that are not warnings (how vouchers work, what a giroconto is). No icon, no colour |
| **Finance summary** | Summary card with tabular right-aligned amounts in semantic ink; the totals row carries `--egw-page-100` as a fill. Cash and accrual are never mixed inside one card |
| **Timeline card** | Eyebrow + title, then rows on a left time rail: 22px/800 tabular time in a 56px rail, 1px vertical rule, then title 600/13 + meta 400/11.5. In-progress row gets a 3px action-gradient stripe on its top edge (the module stripe) |
| **Detail card** | The record page's section panel: eyebrow + title + a 24px edit icon button top-right, then a 3-column `label / value` grid (label 400/12 ink 55%, value 400/13.5) with 18px row gaps. Missing value is `—` |
| **Empty-state card** | Plane 1, centred content, min 200px: 44px tinted icon chip → title 700/15 → one line 400/12.5 ink 62% → one action |
| **Inspector summary block** | Inside the 392 drawer: identity tile + name + status pill, then a `--egw-page-100` plane-0 block of label/value rows, then the record's two most-used actions and an `Apri scheda` link |

**When not to use a card.** A list of peers on a page ground does not need one each — one panel holding rows is right. A single number does not need a card if it is already in a KPI bar. If a page has more than eight panels, it is two pages or a set of tabs.

## 9.4 Status system

Eight levels, four weights — the same system as mobile (`02-foundations.md` §2.5), rendered as a **full-radius pill** with a ring dot and a tracked caps label.

**Geometry**: padding `4px 10px`, `--egw-r-pill`, label 700/9.5–10 +0.08em uppercase, 5px ring dot before the label in the label's colour, `width: fit-content`. A pill is never wider than its words and never on a coloured row.

| Weight | Look | Means | Examples |
| --- | --- | --- | --- |
| **Quiet** | `rgba(11,26,58,.07)` fill, `rgba(11,26,58,.16)` border, ink-100% label, ink-42% dot | Nothing is being asked of you | `BOZZA` · `NON REGISTRATO` · `ARCHIVIATO` · `DISATTIVATO` |
| **Outline** | white fill, 1.5px semantic border, semantic label (`#8A4708` for amber) | Something will be asked of you soon | `IN SCADENZA` · `24 SET` (a dated warning) · `IN PRESTITO` |
| **Solid** | semantic 700 fill, white label, white dot | This is the state of fact | `ATTIVO` · `VALIDO` · `INCASSATO` · `COMPLETATO` · `CONVOCATO` · `IN ATTESA` · `GARA` |
| **Urgent** | red `#B91C1C` fill, white label | This blocks work | `SCADUTO` · `MANCANTE` · `ERRORE` · `SOSPESO` |

**The canonical labels** — use these words, in these weights, everywhere:

| Domain | Labels |
| --- | --- |
| Person | `ATTIVO` (solid green) · `SOSPESO` (urgent) · `IN PRESTITO` (outline blue) · `DISATTIVATO` (quiet) |
| Certificate / document | `VALIDO` (solid green) · `IN SCADENZA` (outline amber, with the date) · `SCADUTO` (urgent) · `MANCANTE` (urgent) · `DA APPROVARE` (solid amber) |
| Money | `INCASSATO` (solid green) · `PARZIALE` (solid amber) · `IN ATTESA` (solid amber) · `SCADUTO` (urgent) · `ANNULLATO` (quiet) · `RIMBORSATO` (quiet) |
| Activity | `COMPLETATO` (solid green) · `IN CORSO` (solid blue) · `PROGRAMMATO` (quiet) · `ANNULLATO` (quiet, and the time is struck through) · `NON REGISTRATO` (quiet) |
| Enrolment | `ATTIVA` (solid green) · `INCOMPLETA` (solid amber) · `DA SISTEMARE` (solid amber) · `RIFIUTATA` (urgent) |
| Call-up | `CONVOCATO` (solid blue) · `NON CONVOCATO` (quiet) · `SENZA RISPOSTA` (outline amber) |

Rules: **the word is always present** — a dot, a colour or an icon alone is never a status. One pill per lifecycle per row. `IN SCADENZA` carries its date or its day count (`4 GIORNI`), because "soon" is not information. A status the API does not send renders as `NON REGISTRATO`, never as an empty cell.

## 9.5 Feedback

| Kind | Spec |
| --- | --- |
| **Success toast** | 360 wide, bottom-right, 24px from both edges, white, `--egw-r-field`, plane 2, 4px left bar in green: 17px `checkmark-circle` green, message 600/12.5 (`Presenze salvate · 14/16`), optional `Annulla` text action, 15px close. 4s, 10s when it carries an undo. Stacks upward, max three, older ones collapse to `+2 notifiche` |
| **Error toast** | Same, red bar and glyph, 8s, with `Riprova` where a retry is possible. **Only for actions that failed in the background** — an error the user caused is inline, at the field or in the form summary |
| **Warning message** | Inline amber-tint alert block. Never a toast: a warning the user must weigh cannot disappear on a timer |
| **Info message** | Info card (§9.3) or a 15px `help-circle-outline` with a tooltip. Not a blue toast |
| **Inline validation** | `08-web-forms.md` §8.3 |
| **Loading** | Skeleton in the shape of what is coming (grid, KPI bar, panel). Determinate progress whenever a total is known: 6px track `rgba(11,26,58,.08)`, action-gradient fill, `--egw-r-pill`, with `18 di 37` in tabular figures beneath. Indeterminate 2px bar only where no total exists. A button loading keeps its label. **No full-page spinners, no blocking overlays** |
| **Retry** | Always a labelled verb next to the failure, never a bare icon. Three failures in a row switch the copy to `Il problema persiste` + `Segnala il problema` |

## 9.6 Actionable alerts — the operational core

Every recurring club problem is one pattern: a **count**, a **severity**, a **plain explanation**, and **the verb that resolves it**. An alert that cannot be acted on is not an alert; it is a KPI.

**Alert block (in page)** — full width, padding 14/16, tint fill + 30% border, `--egw-r-field`, 17px severity glyph at 1px top offset, then title 600/13 ink 100% and one line of 400/12.5 ink 72%, then the actions right-aligned (or on a second row when the text wraps): one primary verb + at most one secondary. Severity: red `close-circle-outline` blocks · amber `help-circle-outline` will block · green `checkmark-circle` resolved (which is a toast, not a block) · blue `notifications-outline` informational.

**Alert card (on the dashboard)** — plane 1, `--egw-r-panel`: eyebrow `DA SISTEMARE`, title with the count in 800/20 tabular before the noun (`7 certificati medici`), one line of consequence in 400/12.5 ink 62% (`Questi atleti non possono essere convocati.`), then up to three named rows (identity tile + name + the offending value) with a `Vedi tutti (7)` link, then the resolving action.

**The canonical alerts** — same anatomy, same verbs, everywhere they appear:

| Alert | Severity | Primary verb | Secondary | Bulk |
| --- | --- | --- | --- | --- |
| Certificati scaduti / mancanti | red | `Registra certificato` | `Invia promemoria` | yes — remind all |
| Certificati in scadenza (≤30 giorni) | amber | `Invia promemoria` | `Vedi elenco` | yes |
| Quote scadute | red | `Registra pagamento` | `Invia sollecito` | yes — bulk reminder |
| Rate in scadenza | amber | `Vedi rate` | — | yes |
| Iscrizioni incomplete | amber | `Completa iscrizione` | `Invia promemoria` | yes |
| Documenti mancanti | amber | `Richiedi al parent` | `Carica documento` | yes |
| Presenze non registrate | amber | `Registra presenze` | — | no (per session) |
| Convocazioni senza risposta | amber | `Sollecita risposta` | `Vedi convocazione` | yes |
| Atleti senza categoria | amber | `Assegna categoria` | — | yes |
| Nessun conto finanziario configurato | amber | `Configura conto` | — | no |

**Rules.** The count is the first thing read and is always tabular. The explanation says the *consequence*, not the fact (`non possono essere convocati`, not `il certificato è scaduto`). Dismiss is allowed only on informational alerts, and it is per user for 7 days — a blocking alert cannot be dismissed, only resolved. The same alert never appears twice on one screen. Every alert's count, the sidebar badge and the notification panel read from one source and always agree. Clicking the count opens the pre-filtered grid, which offers to be saved as a view.

## 9.7 Dashboard

The Dashboard answers two questions, in this order: **what needs me?** and **what happens today?** Everything else is a link to a module.

Layout (environment 2): sky band → **greeting block** (eyebrow `GIOVEDÌ 10 SETTEMBRE 2026 · FORTITUDO SCAURI · STAGIONE 2026/2027` in white 72%, then `Buongiorno, Francesca` 800/34 white, then one summary line in white 80% counting today's facts) → **compressed KPI bar** (4 cards, straddling the horizon) → a two-column body:

- **Left, `2fr` — the work queue.** Alert cards in severity order, red first, at most five. Then `Oggi in palestra`: a timeline card of the day's sessions, each row carrying the attendance state (`24/33 presenti` in tabular green, or `NON REGISTRATO` quiet) and a `Presenze` action — attendance is registered from the dashboard without leaving it, in a 480 drawer.
- **Right, `1fr` — the day rail.** `Prossime gare` (up to three, with the orange module stripe), `Appuntamenti`, `Promemoria`. Each is a panel with an eyebrow, up to three rows, a count, and a `Vedi tutte` link. An empty rail panel states the fact in one line (`Nessuna gara in programma`) and keeps its `Vedi tutte` link.

**Forbidden on the dashboard**: the six coloured gradient module cards of the current product (see `deprecated.md`), decorative charts, a welcome banner, anything that only restates a number already in the KPI bar. A card that shows `0` with no action earns its place only inside the KPI bar.

## 9.8 Detail / profile pages

For complex records — atleta, allenatore, staff, categoria, gara.

**Record header.** Plane 1, full width: 72px identity block (athlete → `--egw-grad-navy` number tile at `--egw-r-panel-sm`; person without a number → initials avatar; club/category → crest) · name 800/28 · beneath it the classification data chips (`Aquilotti · Primaria`) and the record's status pill · on the right, at most two actions plus an overflow, with any destructive action **in the overflow, never in the header row**. Under the name, an **alert summary strip**: one line per blocking problem, red or amber tinted, each with its resolving verb. A clean record shows nothing there — not a green "all good" badge.

**Areas, not a tab farm.** Group a record into **three to five areas**, never nine. For an athlete: `Profilo` (anagrafica, contatti, famiglia) · `Attività sportiva` (categorie, presenze, convocazioni, analitiche) · `Amministrazione` (iscrizione, quote, pagamenti, compensi) · `Documenti e sanità` (certificati, visite, documenti, attestati). The nine-tab strip in the current product collapses into these; the old tabs become sections inside them.

Area switcher: a segmented control in a `#E9EEF9` track, 32px segments, the selected one a white pill with `0 2px 5px` and a 700/12.5 `#12265A` label, right-aligned in the record header's lower row. Sub-navigation inside an area, when a section list is long, is a sticky 200px left rail of section links (500/12.5, active 700 with a 2px blue left bar) — **not** a second row of tabs.

**Progressive disclosure.** An area shows its two or three primary sections expanded and the rest as collapsed plane-1 rows (title + a one-line summary + a count, `Piano di pagamento (0)`). Sections load on expand. Expansion state persists per user per record type.

**Inspector.** From a list, a row's inspector is the 392 drawer (§9.3); on a record page at ≥1600, a persistent 320 rail can hold the record's contextual summary (next payment, certificate status, attendance rate) — read-only, each row linking into its section.

**Read-only records** (past seasons, archived athletes) render every field read-only, keep the header actions that still apply, and carry a page-level alert: `Stagione 2024/2025 chiusa: la scheda è in sola lettura.`
