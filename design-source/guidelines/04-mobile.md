# 04 · Mobile

**EGDS v3.0.0 · CURRENT.** Everything here is mobile-specific. Core rules it builds on: `01-brand.md`, `02-foundations.md`, `03-core-components.md`.

---

## 4.1 Navigation

**Fixed rules, all roles:**
- Max **5 dock slots**. `Profilo` always last. Home always first.
- **Notifications live on the AppBar bell, never as a tab.**
- **Club/role switching** lives in the club chip (AppBar) and in `Profilo → Accessi e club`.
- **Child switching** (Parent) is a dark-glass pill in the sky under the AppBar, on every Parent primary screen.
- Permission-off means a destination is **absent**, never greyed.
- **Home is a dashboard and a navigation hub**: the next actionable thing first, then a NavTile shortcut grid covering every section the role's club has enabled, with badge counts.
- Secondary screens carry the `‹ Indietro` pill and **never** the dock.

### The approved docks

| Role | Slots |
| --- | --- |
| **Trainer** | Home · Allenamenti · Gare · Atleti · Profilo |
| **Parent** | Home · Calendario · **Pagamenti** · Servizi · Profilo |

- **Trainer** keeps Allenamenti and Gare as separate slots: attendance and call-ups are the two daily jobs and neither may be a filter deep. The trainer's secondary sections (Squadre · Bacheca · Documenti · Appuntamenti · Compensi) are reached from the Home grid and from `Profilo`.
- **Parent** gives money its own plain-Italian slot — `Pagamenti` is the one thing a parent opens with intent — and puts everything occasional behind `Servizi` (Documenti · Consensi · Iscrizione · Appuntamenti · Strutture · Contatti · Bacheca).
- **This supersedes the v2.3 Parent "Segreteria" dock** (Home · Calendario · Segreteria · Bacheca · Profilo). Consequences to accept: Bacheca becomes a Servizi row with its badge on the AppBar bell, and the payment↔document adjacency is carried by cross-links (a blocked payment links to the missing document, and back) instead of by a shared tab.

### Levels
1. **Dock** — 5 primary destinations.
2. **Home grid / Servizi hub** — every enabled section, one tap from Home.
3. **Secondary screen** — `SecondaryScreenLayout`, back pill, no dock.
4. **BottomSheet** — a question that returns you where you were.

---

## 4.2 AppBar on mobile

Three lines (§3.4). Concretely, a Trainer primary screen reads:

```
[e] EasyGame                      [FS] Fortitudo Scauri
────────────────────────────────────────────────────────
ALLENATORE · MER 18 MAR
Dashboard                                          [bell]
```

- Product left, club right, on the brand line. The club chip is tappable (it is the club/role switch).
- Parent screens stack three scopes without repeating a word: product (wordmark) · club (chip, derived from the selected child) · child (switcher pill below). The role eyebrow reads `Genitore`, so a person who is both parent and coach always knows which hat the app is wearing.
- **Back is a labelled pill on the left, above the title.** Never adjacent to the bell.
- ≥20px between the title block and any trailing action.

---

## 4.3 Background and content transition

**A screen either has a horizon or it has none. There is no third case** — that rule is what makes an accidental white band impossible.

**Operational screens (with horizon).** Sky ramp 300px, floodlights, pitch lines, soft ~120px transition into the mist ground. The first glass panel starts inside the sky and scrolls onto the mist.

**Detail screens.** Never split in half at the horizon. The screen's own leading surface covers the transition:
- an athlete detail leads with a **dark-glass header card that straddles the horizon**;
- a payment detail leads with an **amount card that starts inside the sky**.
A detail page must feel visually continuous top to bottom.

**Auth, account and blocking screens (no horizon).** The blue ramp runs the full height, edge to edge. No mist band, no horizon, **no footer chrome strip**. The only structure at the bottom is the content's own last element. Identity comes from the court arcs, the baseline + tick and the watermark mark.

---

## 4.4 BottomSheet — official behaviour

**Open** — 220ms slide-up on `cubic-bezier(.2,.9,.25,1)`, scrim fading in over the same curve. No bounce. **Close** — 180ms.

**Dismissal — three ways, always all three:**
1. tap the scrim,
2. drag the handle (or the sheet) downwards,
3. the platform back gesture / button.

- A **discreet grabber** is always visible at the top.
- **The scrim swallows the tap.** Underlying content never activates while a sheet is open, and the content behind is removed from the accessibility tree.
- **No redundant `Annulla` button** where natural dismissal is enough.

**Actions:**
- An **option-selection sheet has no action bar at all** — picking the option *is* the action. `Allega un documento` closes on choice and the row moves to `In verifica`.
- A **primary bottom action appears only where explicit confirmation is genuinely required**: presenze, convocazioni, pagamento.
- **Unsaved form changes** may require a confirmation before dismissal — the only case where drag-to-dismiss is intercepted.

Geometry: glass strong, `28 28 0 0`, grabber `--eg-grabber`, content capped at `--eg-sheet-max-height` (75%), scrim `--eg-scrim-sheet` + `--eg-scrim-blur`. Focus moves to the title on open and returns to the invoking control on close.

---

## 4.5 Presenze (attendance)

**Operationally neutral. Green does not dominate.**

- Row: NumberTile (**navy in every state**) → name + role → state word → **mark ring**.
- The mark is a **30px ring**: state colour at 12% fill, 1.5px border at the state colour, glyph in the state colour. Unmarked: ink-5% fill, ink-16% border, `ellipse-outline` at ink 35%.
- The **state is a word in the accent colour**, not a filled row. `Da segnare` (ink 62%, neutral) is the default, so a list nobody has touched **looks** untouched.
- Row surface only shifts weight on marking: glass → glass strong, hairline picks up the state hue at 40%. No coloured wash.
- **One tap cycles `da segnare → presente → assente → da segnare`,** so absence is recorded rather than assumed.
- Present = restrained green `#15803D`, `checkmark`. Absent = restrained amber `#B45309`, `close`. Unavailable athletes (`Infortunato`, `Squalificato`) render at 55% opacity and are not tappable.
- A **progress line** above the list: `4 presenti · 1 assenti · 5 da segnare`, with a `Segna tutti presenti` shortcut.
- **Stronger success emphasis exists only on the save button** (`Salva 14/18`, success variant) and only after the save confirms. Nothing on the list turns celebratory.

## 4.6 Convocazioni (call-ups)

The same row in blue: selected = `#1D4ED8` ring and the word `Convocato`; not selected = `Non convocato` in amber; untouched = `Da segnare`. Progress line and `Convoca 11` CTA follow the attendance grammar. Restrained semantics, one tap per athlete, scannable at a glance.

---

## 4.7 Documenti

Five states, each with its pill tier and its actions:

| State | Pill | Actions |
| --- | --- | --- |
| **Richiesto** (required, not provided) | Solid amber | `Carica documento` (filled) |
| **Mancante** (missing, not blocking) | Neutral | `Carica documento` (filled) |
| **In verifica** (pending club verification) | Outline blue | `Visualizza` · `Sostituisci` |
| **Valido** | Quiet green | `Visualizza` · `Scarica` |
| **Scaduto** | Urgent red + red card border | `Carica nuova` (filled) · `Scarica vecchia` |

- **Actions are icon + word, never icon alone.** `attach-outline` for upload, `eye-outline` for view, `download-outline` for download, `swap-horizontal-outline` for replace, `refresh-outline` for retry.
- One action bar under the row (§3.5); no nested boxed controls.
- Expiry threshold: a valid document within 30 days of expiry shows the amber `Scade tra N giorni` pill (urgent tier only inside 7 days). Undated documents never invent a date — they read `Senza scadenza`.
- Upload is a BottomSheet option list: `camera-outline` Scatta una foto · `images-outline` Scegli dalla galleria · `folder-outline` Scegli un file. No action bar; picking closes the sheet and the row becomes `In verifica`.

## 4.8 Pagamenti

**Everything about an instalment is on its card**: amount (tabular, 800, largest thing on the card), purpose, due date, state pill, and its actions.

| State | Pill | Amount ink | Actions |
| --- | --- | --- | --- |
| **Da pagare** | Solid amber | `--eg-money-due` | `Paga ora` (filled) · `Dettaglio` |
| **Parziale** | Solid amber + paid/total line | due | `Paga il resto` · `Dettaglio` |
| **In ritardo** | Urgent red + red card border + red date line + countdown | `#B91C1C` | `Paga ora` · `Dettaglio` |
| **In elaborazione** | Outline blue | ink | `Dettaglio` only — never a second payment button |
| **Pagato** | Quiet green | `--eg-money-paid` | `Ricevuta` · `Fattura` (only when actually available) |

- Currency is `it-IT`: `120,00 €`. Dates are Italian short-month: `18 mar 2027`.
- **Documents are exposed in the open**, not behind a menu: `receipt-outline` Ricevuta, `document-text-outline` Fattura. If the club has not issued one, the button is absent — never disabled and never a promise.
- Payment detail: the amount card starts inside the sky (§4.3), then method choice, then the confirmation sheet (`Paga 120,00 €`), then a success sheet stating what was recorded and where the receipt now lives.
- State is server-owned. The card never optimistically flips to `Pagato`.

---

## 4.9 Auth, account and system states

All on the **full-height blue ramp**, no horizon, no footer strip (§4.3), primary action white-on-navy, secondary a white-outlined ghost (§2.2).

**Auth flow** — Login · Registrazione · Verifica OTP · Password dimenticata · Reset password · Conferma. Each step: brand line + tracked caps step label, eyebrow, 32px/800 statement, one line of supporting copy, one elevated glass card holding the fields and the primary CTA, one ghost secondary below. No dock, and no back arrow where there is nowhere to return.

**Account Hub / club-role selection** — `Scegli come entrare`: one glass row per membership (crest, club, meta, role pill, selection ring), `Esci` as the ghost at the bottom. Same full-page blue.

| State | Placement | Treatment |
| --- | --- | --- |
| **Ruolo non supportato** | Replaces the shell | Never a dead end: state the fact, then **list the accesses the person does have** as concrete rows, and give **two exits** — `Cambia accesso` (white primary) and `Esci` (ghost). |
| **Manutenzione** | Replaces the shell | Pill + statement + a facts card (last data update, expected return) + `Riprova` and `Vedi i dati offline`. Reassure about work already saved. |
| **Sessione scaduta** | **A sheet, not a screen** — the screen underneath survives, so context is not lost | One line, one `Accedi di nuovo` primary. |
| **Offline** | **A banner**, non-blocking; navigation stays intact | States that data is cached and when it was cached. Never a full-screen block. |
| **Connessione persa / errore** | `StateMessage` in the affected region | One `Riprova` (`refresh-outline`). Never a domain state. |
| **Aggiornamento richiesto** | Replaces the shell | Version, what changed, one store action. |

**Blocking vs non-blocking is the rule:** if the person can still do something useful, it is a banner or a `StateMessage`; only a genuinely unusable app replaces the shell.

## 4.10 Service and state screens — the footer exception

- **Normal app screens carry no permanent bottom brand/version footer.** Nothing at the bottom of Home, a list, a detail or an auth step but the content's own last element.
- **Only service and system screens may carry a service block**, because there the information is content: the **EasyGame** name, the version, the service-status URL and the support number. Applies to maintenance, offline, error, support and service-status screens only.
- Format: a hairline, then `EASYGAME · 3.0.0` as a tracked caps line in white 72%, then `Stato servizi · status.easygame.it · Assistenza 0771 000000` in white 66%. Never on login, registration, recovery or the account hub.

---

## 4.11 Parent components

Full v2.3 specs remain valid in `guidelines/archive/v2.3/component-specs.md` Part C, **with these v3 overrides applied to all of them**: solid four-tier pills, plain-chevron or action-bar rows, no boxed icon marks, icon + word actions, and the on-sky button inversion.

- **ChildSwitcher** — dark-glass pill in the sky under the AppBar on all five Parent primary screens. Always carries the **club name**: switching child can switch club and that must never be silent. One child renders it static, never a one-item picker. A two-child family sees the sibling's avatar next to the chevron and switches in one tap.
- **RSVPControl** — two explicit, equally weighted options inside the child's EventCard. Never a switch, never a checkbox: "no answer" and "no" must be visually distinct.
- **PaymentCard** — §4.8.
- **DocumentRow / DocumentCard** — §4.7. Row for a list, card when a document needs a preview line and two actions.
- **ConsentRow** — the plainest component in the system. The row **navigates** and never grants; version and date always visible; revoke is not styled as destructive. Role is `link`, not `checkbox`.
- **NotificationRow** — §3.5.
- **AppointmentCard / BookingCard** — transitions are data (zero transitions is valid); reason capture is mandatory on cancellation; a reschedule rail shows proposed over original; `In conflitto` on a booking.
- **EnrollmentStatusCard** — dark glass in the sky, one `clipboard-outline` chip, season eyebrow, status as an Italian phrase, status pill, one supporting fact from the API, at most one CTA naming the real task. **No step rail** — the backend exposes a status, not a phase per step. A missing enrollment renders nothing; a fetch failure is a `StateMessage`.
- **AccountAccessCard** — §4.9.
