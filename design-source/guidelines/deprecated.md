# Deprecated patterns

**EGDS v3.1.0 · CURRENT.** Anything listed here must not appear in new work and should be removed on contact in existing screens. Each entry names its replacement.

## Deprecated in v3.0

| Pattern | Why | Replacement |
| --- | --- | --- |
| **Near-black sky** (`#07122B → #0B1A3A → #12265A`) | Read as a generic dark theme; the identity colour was only visible in the floodlight pools | The blue ramp `#12265A → #1B3576 → #2549A8 → #2B57C9` |
| **Neutral-grey mist** `#F3F5FC` | Grey ground under a blue sky reads as a temperature break | `#EEF3FE`, blue-cast |
| **Tint-on-glass status pills** (11–13% fill, coloured label) | Disappeared over the lighter ground; below 4.5:1 in several combinations | The solid four-tier pill ramp (`02-foundations.md` §2.5) |
| **The action gradient on the sky** | Blue action on a blue ground — the contrast defect at its source | White fill + navy label (primary), white-outlined ghost (secondary) |
| **The ghost button variant on dark surfaces** | Ink-coloured label on blue, near-invisible | The white-outlined ghost |
| **Boxed "e" mark** — the mark inside a gradient tile | Made the brand mark look like an app-store icon pasted into the UI | Plain mark, or the 5% watermark |
| **"EasyGame Mobile" as a product line** (base band caps rule) | Not a product name | `EasyGame`, or nothing |
| **Permanent bottom brand/version footer strip** on normal screens | Chrome pretending to be content; it ate the bottom of auth screens | No footer. The service block survives on maintenance / offline / error / support / service-status screens only (`04-mobile.md` §4.10) |
| **Rounded box inside a rounded row** (a stretched mini-container as a row control) | Read as a broken nested card | Plain `chevron-forward` if the row navigates; a labelled action bar underneath if it acts |
| **Icon-only actions** on documents and payments | Ambiguous — `attach` vs `upload` vs `document` is not guessable | Icon + word: `Carica documento`, `Visualizza`, `Scarica`, `Sostituisci`, `Ricevuta`, `Fattura` |
| **Green wash on marked attendance rows** (success gradient tile + filled row) | Presence is operational bookkeeping, not an achievement; a fully-marked list looked celebratory | Navy tile in every state + a 30px ring at 12% tint + the state word. Success emphasis lives on the save button alone |
| **Two-state attendance** (marked present / not marked) | Absence was inferred, never recorded | Three states cycled by one tap: `da segnare → presente → assente` |
| **Back control in the AppBar trailing slot**, beside the bell | Two unrelated controls in one cluster; back was hard to hit and easy to confuse | Labelled `‹ Indietro` pill, left, on its own line above the title |
| **Detail screens that split at the horizon** | A hard band across the middle of the page | The leading surface (athlete header, amount card) straddles or starts inside the sky |
| **Dock count pills** | No room for numerals at 56px, and the count is already on the Home tile | An 8px dot with a navy rim |
| **68px dock** | Competed with content | 56px, 46px puck, 20px glyphs, tap targets still ≥44px |
| **Parent "Segreteria" dock** (Home · Calendario · Segreteria · Bacheca · Profilo) | Club jargon; money was two steps deep | Home · Calendario · Pagamenti · Servizi · Profilo |
| **Redundant `Annulla` on option sheets** | Three natural dismissals already exist | No action bar on option sheets at all |
| **Generic blocking-state screens** (a centred icon chip and nothing else) | A dead end that offered no way forward | State the fact, list what the person *can* do, give two exits |

## Deprecated in v3.1 — Web / desktop

| Pattern | Why | Replacement |
| --- | --- | --- |
| **The six coloured gradient module cards** on the dashboard (orange Gare, purple Appuntamenti, green Promemoria, and the rest) | Six decorative gradients competing with each other and with the one gradient that means "act here"; they showed `0` with no action | Alert cards and the day rail (`09-web-patterns.md` §9.7). Three gradients exist: action, gara, navy |
| **Purple / violet page and record titles** (`Dashboard`, `Izzo Aldo` in a blue→violet gradient) | A hue outside the palette, applied to text, at the one place hierarchy must be unambiguous | Page title 800/32 in ink 100%, or white on the sky |
| **The nine-tab record strip** (Generale · Contatti · Dati Sanitari · Iscrizione · Abbigliamento · Documenti · Analitiche · Lavoro e compensi …) | Nine peers means no hierarchy; the user hunts | Three to five **areas** with progressive disclosure inside them (`09-web-patterns.md` §9.8) |
| **Solid red `Elimina` button in a record header** | The most destructive action given the most prominent slot, beside routine ones | Destructive actions live in the header's `···` overflow, or in a `ZONA PERICOLOSA` block at the foot of the form; red is an outline, never a fill |
| **Glass, blur and translucency on working pages** | On a forty-row table the blur is noise, and text over a live ground loses contrast | Opaque white panels on `--egw-page`. The single exception is the account menu over the sky |
| **The light white sidebar** (screen overview 2a) | Left the product unrecognisable; the brand ramp appeared nowhere on a working page | The blue gradient sidebar (`06-web-shell.md` §6.1) |
| **Full blue page backgrounds outside the Dashboard** | Blue behind dense data costs legibility and buys nothing | Environment 1 mist. The sky band is the Dashboard's alone; full sky is for auth and system pages |
| **In-app `powered by …` footer strip** | Chrome pretending to be content, on every page, forever | No application footer. The credit belongs on the login page |
| **Long scrolling centred modals for creation and editing** | The list behind is lost, the filters are lost, and the form has nowhere to grow | 480 drawer (≤8 fields), 720 drawer (9–20), full page (>20), stepper when sequential. Modals confirm only |
| **Status shown by colour alone** (a coloured dot, a coloured amount, a tinted row) | Unreadable for anyone who does not see the hue, and ambiguous for everyone else | The status pill with its Italian word and ring dot (`09-web-patterns.md` §9.4) |
| **Icon-only row actions without an accessible name** | `···` and a pencil are not a contract | `aria-label` in Italian + a tooltip with the same words, hit box ≥32px |
| **Web direction boards v1 and v2**, and the `v0.1 bozza` geometry (999px-only pills aside, 48px-only rows, light sidebar) | Superseded iterations kept alongside the approved one | The **Iterazione 4** direction and `05`–`10`. Earlier boards are history, not reference |
| **`EmptyState` illustrations on web** | Same reason as mobile: English text baked in, and a decorative answer to an operational question | The empty-state card: icon chip, fact, one line, one action |

## Deprecated earlier, still deprecated

| Pattern | Since | Replacement |
| --- | --- | --- |
| `EmptyState` component and `assets/illustrations/*` | v2.1 | `StateMessage`. The illustrations (which also carry English text) are brand archive and must not appear in product UI |
| `BrandGradient` as a page background | v2.1 | `Floodlight` |
| `Card tone="solid"` for content lists | v2.1 | Glass `Card` |
| `Input` (the v1 flat field) | v2.1 | `SignatureInput` |
| `Avatar` for athletes | v2.1 | `NumberTile` |
| Flat module colour slabs | v2.0 | `HighlightCard` with a 3px module stripe |
| EnrollmentStatusCard step rail (`Domanda / Documenti / Pagamento / Attiva`) | v2.3 | Status + plan + balance from the API; per-phase progress belongs on a detail screen as rows |
