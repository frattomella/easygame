# 08 · Web — forms, inline editing, confirmations

**EGDS v3.1.0 · CURRENT.** Every field in the product is one of the primitives below, at one of two heights: **46px on a page**, **42px in a drawer**. Nothing else.

## 8.1 Field anatomy

Label 600/12 ink 62%, 8px gap, then the control, then (when present) a 7px gap and one line of helper or error text at 500/11.5.

- **Rest**: `--egw-page-100` fill, 1px `--egw-field-border`, `--egw-r-field` (`--egw-r-control` at 42px), `inset 0 1px 2px rgba(11,26,58,.05)`, placeholder 400/13.5 ink 42%.
- **Filled**: white fill, 1px `rgba(11,26,58,.14)`, value 400/13.5 ink 100%.
- **Hover**: border to `--egw-control-border`.
- **Focus**: white fill, 1.5px `--egw-focus-border`, `--egw-focus-ring`.
- **Error**: 1.5px `--egw-red`, message `--egw-red` 500/11.5, `aria-invalid`, `aria-describedby`.
- **Warning**: 1.5px `--egw-amber`, message `#8A4708`. A warning does not block saving.
- **Success**: used only after an async check (VAT, codice fiscale, email uniqueness): 1.5px `--egw-green` + a 15px `checkmark-circle` inside the right edge. It fades to Filled after 3s.
- **Read-only**: `--egw-page-100` fill, **no border**, value ink 72%, no focus ring, still tab-reachable, still selectable. This is the default rendering for a field the role may see but not change, with a tooltip saying why.
- **Disabled**: `rgba(11,26,58,.06)`, label and value ink 42%, not tab-reachable. Only for temporarily unavailable ("select a category first").
- **Required**: the label carries a 700 `*` in `--egw-red` after it. Optional fields are not marked. If most of a form is required, mark the optional ones instead with `(facoltativo)` in 400/11.5 ink 55% and say so once at the top.

Field width follows content, not the container: codice fiscale 16ch, CAP 6ch, amount 12ch, date 12ch, jersey number 6ch, name 24ch+, email/address full width. A 3-character field never spans a column.

## 8.2 Primitives

| Primitive | Spec |
| --- | --- |
| **Text** | The base above |
| **Numeric** | Tabular figures, right-aligned inside the field, no spinners. Step buttons only for small bounded counts (durata, numero maglia) as two 20px stacked chevrons inside the right edge |
| **Currency** | Tabular, right-aligned, `€` suffix in ink 55% inside the right edge, Italian decimals (`1.250,00`). Never a bare number for money, never `EUR` |
| **Percentage** | Tabular, `%` suffix, 0–100 clamped |
| **Email** | `mail-outline` leading glyph ink 42%, `inputmode="email"`, validated on blur |
| **Phone** | `+39` prefix segment inside the left edge on a `--egw-page-100` ground, then the number tabular |
| **Textarea** | Min 84px, max 240 then scrolls, resizable vertically only, same radii as the field. Character counter 400/11 ink 42%, bottom-right, appearing past 80% of the limit |
| **Select** | Field + 12px `chevron-down` ink 42%. Popover list (`--egw-r-menu`, plane 2, max 320 tall): 38px rows, 500/13, selected row `--egw-page-100` + `#1D4ED8` label + trailing `checkmark`. Placeholder is always `Seleziona` |
| **Searchable select** | Same, plus a 38px search field pinned at the top of the popover. **Mandatory above 8 options** |
| **Autocomplete** | Free text that suggests as you type: 44px rows with the match in 700, secondary line for disambiguation (`Marco Ferretti · Under 15 · 2011`). `Nessun risultato` + a `Crea "…"` row where creating inline is allowed |
| **Multi-select** | Selected values render as 10/4 data chips inside the field, each with its own 12px `close-circle`; the field grows to two rows then scrolls. Popover is a checkbox list with a search field and a live `3 selezionate` count |
| **Checkbox** | 18px, `--egw-r-check`, 1.5px `rgba(11,26,58,.3)`; checked = action-gradient fill + white `checkmark`. Label 400/13 to the right, clickable, 8px gap |
| **Radio** | 18px circle (the one place a circle is allowed), 1.5px border; checked = 2px blue ring + 8px blue dot. Vertical stack, 10px gap. Two or three options that are really a toggle become a segmented control instead |
| **Toggle** | 40×22 track, full radius, `rgba(11,26,58,.18)` off / action gradient on, 18px white knob, 110ms. The label states the *on* meaning (`Iscrizione attiva`) and the current state is never left to the knob alone — the label's helper line reads `Attiva` / `Non attiva` |
| **Segmented control** | 34px, `#EEF3FE` track, `rgba(11,26,58,.1)` border, 2px padding; selected segment is a white pill with `0 1px 2px` and a 700/12 `#12265A` label. 2–4 segments, short labels only |
| **Date** | 46px field, tabular `gg/mm/aaaa` placeholder, trailing 15px `calendar-outline` opening the picker popover (280 wide: month header with `‹ ›`, weekday eyebrows, 32px day cells with `--egw-r-check`, today outlined blue, selected solid gradient, out-of-month ink 42%, `Oggi` shortcut at the foot). Typing is always allowed |
| **Date range** | Two date fields joined by an `→` in ink 42%, sharing one popover with range highlighting, plus preset chips: `Oggi` · `Questa settimana` · `Questo mese` · `Stagione` · `Personalizzato` |
| **Time** | Tabular `hh:mm`, 15-minute step popover |
| **File upload** | 42px field-shaped control: `Scegli il file` 600/12.5 on a `--egw-page-100` segment, then the filename or `Nessun file scelto` in ink 42%. Uploaded → a 48px plane-0 row: 34px file icon chip by type, name 600/12.5, `PDF · 1,2 MB` meta, then `Visualizza` and `Sostituisci` as **icon + word** |
| **Drag & drop upload** | Plane-0 block, 1px dashed `rgba(11,26,58,.22)`, `--egw-r-field`, min 120px: 44px icon chip, `Trascina qui il file` 700/13, `oppure sfoglia` as a text action, then accepted formats and max size in 400/11.5 ink 55%. Drag-over: border solid `--egw-blue`, fill `rgba(37,99,235,.06)`. Uploading: determinate gradient bar + `2,1 di 4,8 MB`. Rejected: red border + one line naming the reason |
| **Document upload** | The drag-drop block plus the two fields the domain always needs — `Tipo documento` (select) and `Scadenza` (date) — and, where the family is involved, `Note per il parent` (textarea). Icon-only document actions are forbidden (`deprecated.md`) |

**Helper text** is one line, states a rule or a unit, and never repeats the label: `Formato: gg/mm/aaaa`, `Il numero deve essere libero nella categoria`. **Error text** says what is wrong and what to do: `Data non valida` · `Il codice fiscale ha 16 caratteri` · `Questa email è già usata da un altro utente`. No "Oops", no exclamation marks, no blame.

## 8.3 Validation timing

Validate on **blur**, re-validate on change once a field has errored, never on the first keystroke. On submit, block, scroll to the first error, focus it, and put a red-tint summary at the top of the form: `Controlla 3 campi` with the field names as links. Async checks (uniqueness, fiscal code) show a 14px indeterminate ring inside the right edge and resolve to error or success. Server-side errors land on their field where the API identifies one, and in the form summary where it does not. The save button never spins alone while the form looks idle.

## 8.4 Form layout

- **Single column, 520px max** — the default. Every form with fewer than eight fields, every drawer form, everything the user fills in once.
- **Two columns** — only for a dense administration form where the fields are genuinely peers (anagrafica: nome/cognome, data/luogo, CAP/comune). Columns are 1fr/1fr with a 24px gap and **never** split one logical field pair across the gutter. Collapses to one column at ≤1152.
- **Sectioned** — sections are plane-1 panels with an eyebrow + title, stacked with an 18px gap, each holding a single- or two-column field block. This is how a record page is edited.
- **Field group** — fields that are read as one thing (indirizzo, IBAN + intestatario) sit in a plane-0 `--egw-page-100` block with the group name as an eyebrow.
- **Actions**: `Salva` (primary, gradient) then `Annulla` (secondary, white) — in that order, left-aligned in a drawer footer, right-aligned on a page. On a page the action bar is sticky to the viewport bottom (64px, white, `0 -1px 0 rgba(11,26,58,.09)`, page gutters) and shows `Modifiche non salvate` in 500/12 amber ink on the left once the form is dirty. **Destructive actions never sit in the save row** — they live at the foot of the form in a `ZONA PERICOLOSA` plane-0 block with a red-outline button and one line explaining the consequence.
- `Salva` is disabled only while submitting. A form with nothing changed leaves it enabled and, on click, closes with no request.

## 8.5 Long forms — which container

| Situation | Container |
| --- | --- |
| ≤8 fields, one concept (movimento, certificato, promemoria, comunicazione) | **480 drawer**, single column, sticky footer |
| 9–20 fields, one concept, several groups (nuovo atleta, nuovo staff, nuova categoria) | **720 drawer**, sectioned, sticky footer, sections collapsible past four |
| >20 fields, or the user will come back to it (scheda atleta, impostazioni club, piano quote) | **Full page**, sectioned panels, sticky action bar, autosave *per section* with a `Salvato` timestamp in the section header |
| Genuinely sequential with dependencies (iscrizione, importazione, operazione di massa, onboarding club) | **Stepper** — 3–5 steps only. Inside a 720 drawer for operations; a full page for onboarding |
| Anything else | Not a modal. **Never a long scrolling centred modal** |

**Stepper**: a 56px header band with numbered 26px step tiles (`--egw-r-chip`) joined by 1px rules — done = gradient fill + white `checkmark`, current = gradient fill + white numeral, future = `--egw-page-100` + ink 42% numeral — each with its Italian label under it. Footer: `Indietro` (secondary, hidden on step 1), the step count `Passo 2 di 4` centred in 500/12 ink 55%, and `Continua` / `Conferma` (primary). A step validates before it advances. Steps already done are clickable; future ones are not.

## 8.6 Quick-action forms

The compact form a shortcut opens inside the Azioni-rapide drawer (`06-web-shell.md` §6.5): **five fields maximum**, single column, 42px, only the fields required to create a valid record. Everything optional is left for the record page, and the success toast's `Vedi` action takes the user there. If a create genuinely needs more than five fields, the shortcut opens the 720 drawer instead — it does not squeeze.

## 8.7 Inline editing

Allowed **only** for a field that is simple, low-risk and changed often:

- status (attivo / sospeso / in prestito / disattivato)
- category or group assignment
- department / role label
- simple tags
- jersey number
- a single date with no dependencies (a reminder's due date)

**Never** for personal data, health data, certificates, payments, amounts, IBAN, permissions, anything with cross-field validation, and anything destructive. Those open the drawer or the record.

**Interaction.** The cell shows its value normally; hover reveals a 13px pencil at the cell's right edge; click or `Enter` on the focused cell turns it into a 32px control fitted to the cell with the popover open. `Enter` commits, `Esc` cancels, `Tab` commits and moves to the next editable cell. Commit is optimistic: the cell shows the new value immediately with a 2px blue left bar for 400ms; failure reverts it, flashes a red 1.5px border, and shows a toast with `Riprova`. A cell the role cannot edit has no pencil and no affordance at all.

## 8.8 Feedback on save

Drawer → close + success toast. Page section → the section header shows `Salvato · 14:32` in 500/11.5 green for 4s, no toast. Bulk → the result step (`07-web-datagrid.md` §7.7). A create that the user will want to repeat (movimento, presenza) offers `Salva e aggiungi un altro` as a secondary in the footer, which keeps the drawer open and clears the fields except the context ones (date, category, conto).

## 8.9 Confirmations, by risk

Match the friction to the stakes. Using the strongest form for a routine action trains people to click through it.

| Risk | Pattern |
| --- | --- |
| **Routine, reversible** (archive a reminder, remove a filter, unassign a category) | No confirmation. Do it, then a toast with `Annulla` for 10s |
| **Notable, reversible** (suspend an athlete, cancel a training, delete a saved view, void a movement) | **460 modal**: title naming the action (`Sospendere Marco Ferretti?`), one line of consequence, `Annulla` (secondary) + the verb as the primary. No typing |
| **Destructive, single record** (delete athlete, coach, staff member, category, document) | **460 modal, red**: 40px red-tint icon chip, title `Eliminare Marco Ferretti?`, a red-tint block listing **what goes with it** (`3 anni di presenze · 2 certificati · 4 pagamenti registrati`), the line `Questa operazione non è reversibile.` in 600/12.5 red, then `Annulla` (secondary) + `Elimina` (red outline, not a red fill). Focus opens on `Annulla` |
| **Destructive, irreversible or wide** (bulk deletion, delete a category with athletes in it, close a season, delete a club user's access, reset a payment plan) | The above plus a **typed confirmation**: a 46px field and the line `Scrivi <strong>ELIMINA</strong> per confermare` — or the record's own name where one record is at stake. The primary stays disabled until the text matches exactly, case-sensitive. Above 20 affected records the count is repeated in the button label (`Elimina 37 atleti`) |
| **Blocked** (the domain forbids it) | Not a confirmation — an explanation. Modal or inline block: `Non puoi eliminare questa categoria` + `Ci sono 34 atleti assegnati. Spostali in un'altra categoria per procedere.` + `Vedi gli atleti` as the primary. The destructive button is absent, not disabled |

Destructive modals never allow scrim-dismiss, never auto-focus the destructive button, and never use a solid red fill on a button that sits beside a routine one. The word in the button is the verb, never `OK`, never `Sì`.
