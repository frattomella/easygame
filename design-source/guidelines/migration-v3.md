# Migration to EGDS v3.0.0 — notes for implementation

Target: `easygamemobile/client/`. **v3 is a colour, chrome and branding correction, not a new language.** The cut corner, glass grammar, module stripes, time rail, number tiles, action gradient and eyebrow/display pair are unchanged. Nothing needs restructuring; most of the work is token values plus five behavioural fixes.

Supersedes `guidelines/archive/v2.3/trainer-migration.md`.

## Step 0 · Tokens (do this first — it does most of the work)

Replace the values in the theme's signature layer (`tokens/signature.css` is the source of truth):

| Token | v2.3 | v3.0 |
| --- | --- | --- |
| `--eg-grad-sky` | `#07122B → #0B1A3A → #12265A` | `#12265A → #1B3576 38% → #2549A8 76% → #2B57C9` |
| `--eg-mist-50` / `-100` | `#F3F5FC` / `#E9EEFA` | `#EEF3FE` / `#E4ECFB` |
| `--eg-glass-border` | white 70% | white 78% |
| `--eg-glass-dark-bg` | `rgba(11,26,58,.72)` | `rgba(18,38,90,.66)` |
| `--eg-glass-dark-border` | white 14% | white 20% |
| `--eg-floodlight-a` | blue-500 65% | blue-400 55% |
| `--eg-floodlight-b` | indigo 60% @ 10% | indigo 50% @ 8% |
| `--eg-pitch-lines` | white 5% | white 7% |

New token groups (all additive): `--eg-grad-page`, `--eg-watermark-opacity`, `--eg-court-arc`, `--eg-baseline-rule/-tick`, `--eg-action-on-sky-*`, `--eg-ghost-on-sky-*`, `--eg-dock-*`, `--eg-pill-*`, `--eg-mark-*`, `--eg-ease-sheet`, `--eg-press-scale-*`.

Nothing was removed. No token was repurposed.

## Step 1 · Shell (`MainTabNavigator`, `useScreenOptions`, `AppBar`)

1. **Dock**: height 68 → 56, puck 52 → 46, glyph 22 → 20, slot gap → 2, inactive glyph white 50% → **62%**. Keep 44px hit slop. Replace slot count pills with an 8px dot + navy rim.
2. **AppBar**: add the brand line (mark + wordmark left, club chip right) above the eyebrow on primary screens. Keep the eyebrow for role/date/child.
3. **Back control**: move out of the trailing slot into a labelled `‹ Indietro` pill on the left, on its own line above the title. Trailing slot now holds the bell alone. Add ≥20px between the title block and trailing actions.
4. **Parent shell**: dock clearance 124 → 112.

## Step 2 · Status pills (`Badge`)

Rewrite as four tiers, six solid variants — see `02-foundations.md` §2.5. Every call site that passed a tint variant maps to a tier:

- settled/read-only (`Valido`, `Pagato`, `Attivo`) → **quiet** (hollow ring, ink label, no fill)
- `In attesa`, `In verifica`, `In elaborazione` → **outline** (white fill, 1.5px coloured border, coloured label, **and remove any button on that row**)
- `Richiesto`, `Da completare`, `Mancante`, `Convocazioni aperte` → **solid** (filled, white label, card gets the matching 3px stripe and one CTA)
- `Scaduto`, `In ritardo` → **urgent** (solid red + countdown + red card border + red date line)

On the sky, invert: white fill, coloured ring-dot, dark coloured label.

## Step 3 · Buttons on the sky

Add a surface-aware primary: on any blue ground, `Button variant="primary"` renders **white fill / `#12265A` label** and `variant="secondary"` renders the **white-outlined ghost** (white 8% fill, 1.5px white 45% border, white label). The action gradient stays for buttons on glass and mist. Delete the ink-coloured ghost from dark screens.

## Step 4 · Rows

Sweep every list row for the boxed mini-container. Each row becomes one of two shapes:
- **navigates** → row is the target, ends in a plain `chevron-forward` at ink 42%;
- **acts** → labelled action bar underneath (36px buttons, icon + word, `10 10 4 10`; primary `#1D4ED8` solid, secondary ink-5% with `#1E40AF` label).

Affected: `DocumentRow`, `ConsentRow`, `NotificationRow`, payment rows, appointment rows, Servizi hub rows.

## Step 5 · Attendance and call-ups

The one real behaviour change. `present` becomes tri-state (`true` / `false` / `undefined`) and one tap cycles `undefined → true → false → undefined`. Absence is now recorded data — check the API accepts an explicit absent value; if it does not, this needs a backend field before shipping.

Visually: NumberTile stays navy always; the mark is a 30px ring (12% tint, 1.5px border); the state word carries the accent; the row keeps glass with only a hairline shift. Remove the success gradient from marked rows. Add the progress line (`4 presenti · 1 assenti · 5 da segnare`) and the `Segna tutti presenti` shortcut. Keep the success emphasis on the save CTA only.

## Step 6 · Sheets

- Add drag-to-dismiss and scrim-tap dismiss everywhere; ensure the scrim swallows the tap (no pass-through activation).
- Remove `Annulla` from option sheets and remove their action bars entirely — selection commits and closes.
- Keep the action bar only on presenze, convocazioni and pagamento.
- Timing: 220ms in / 180ms out on `cubic-bezier(.2,.9,.25,1)`. Never animate the blur.

## Step 7 · Auth, account and system screens

Move onto `BrandStateLayout`: full-height `--eg-grad-page`, no horizon, no mist, **delete the base band / footer strip**. Add court arcs, baseline + tick, the 5% watermark mark, the tracked caps step label. Un-box every "e" mark. Replace `EasyGame Mobile` strings with `EasyGame`.

Blocking-state placement: `Sessione scaduta` becomes a **sheet** (keep the screen underneath mounted), `Offline` a **banner**, `Ruolo non supportato` and `Manutenzione` full screens that list what the person can do and give two exits.

The service block (name · version · status URL · support number) is allowed **only** on maintenance, offline, error, support and service-status screens.

## Step 8 · Parent navigation

Dock becomes **Home · Calendario · Pagamenti · Servizi · Profilo**. Fold Documenti, Consensi, Iscrizione, Appuntamenti, Strutture, Contatti and Bacheca into the `Servizi` hub; move the Bacheca badge to the AppBar bell. Add cross-links between a blocked payment and its missing document in both directions.

## Order of work

Shell (0–1) → pills (2) → buttons (3) → rows (4) → Allenamenti/presenze (5) → Gare/convocazioni (5) → sheets (6) → auth and system (7) → Parent nav (8) → Home and Atleti last, since they only inherit.

## Checks before calling it done

- [ ] No blue text or blue-gradient button on any blue ground.
- [ ] No screen has a horizontal band where the sky stops and nothing covers it.
- [ ] Every list row is either chevron-only or has a labelled action bar. No boxed mini-containers.
- [ ] Every document and payment action shows a word, not just an icon.
- [ ] A fully unmarked attendance list looks untouched; a fully marked one is not green.
- [ ] Every sheet dismisses three ways; option sheets have no buttons.
- [ ] No "EasyGame Mobile" string anywhere; no boxed "e" mark.
- [ ] No footer strip outside service screens.
- [ ] Dock is 56px with dot badges; back is a left-hand labelled pill.
- [ ] All six pill variants ≥4.5:1 on glass, mist and sky.
