# EasyGame Design System

**Revision: EGDS v3.1.0 · 2026-09-15 · "EasyGame blue · web" — CURRENT** — see `CHANGELOG.md`.

The system covers **two platforms**, both fully defined: mobile (§04) and web/desktop (§05–§10).

| | Document | Scope |
| --- | --- | --- |
| **01** | `guidelines/01-brand.md` | Product name, marks, EasyGame + club hierarchy, identity without the logotype, voice |
| **02** | `guidelines/02-foundations.md` | Colour, contrast, typography, iconography, status system, motion, structural signature, spacing |
| **03** | `guidelines/03-core-components.md` | Platform-independent component contracts |
| **04** | `guidelines/04-mobile.md` | Navigation, AppBar, background transitions, BottomSheet, presenze, convocazioni, documenti, pagamenti, auth/system states, Parent components |
| **05** | `guidelines/05-web-desktop.md` | **Web foundations** — three environments, colour, type, surfaces, grid, interaction states, motion, responsive, accessibility |
| **06** | `guidelines/06-web-shell.md` | **Web shell** — sidebar (expanded + collapsed), topbars, account menu, Azioni rapide, overlay decision table |
| **07** | `guidelines/07-web-datagrid.md` | **The DataGrid** — one grid for every list: views, filters, columns, selection, guided mass actions, states, keyboard, export/import |
| **08** | `guidelines/08-web-forms.md` | **Web forms** — 24 primitives, layouts, long-form containers, inline editing, confirmations by risk |
| **09** | `guidelines/09-web-patterns.md` | **Web patterns** — ten page patterns, page header, cards, status system, feedback, actionable alerts, dashboard, detail pages |
| **10** | `guidelines/10-handoff.md` | **Implementation handoff** — the contract for Claude Code: authority, tokens, component inventory, review checklist, naming, definition of done |

Also: `guidelines/deprecated.md` (what must not be used, and its replacement) and `guidelines/migration-v3.md` (implementation notes for the existing mobile app). The v2.3 specs are archived under `guidelines/archive/v2.3/` — still a valid reference for fine geometry where v3 is silent; **where they conflict, v3 wins.**

Design system for the **EasyGame mobile app** — the coach-facing app of EasyGame, a sports club management platform for clubs, coaches, staff, athletes and families.

The MVP in scope is for **trainers/coaches**, in Italian, and does two jobs well:

1. **Training attendance** (presenze) — one tap per athlete.
2. **Match call-ups** (convocazioni) — pick the squad for a match.

Everything else in the app (dashboard, roster, profile) exists to get a coach into those two flows fast, on a pitch or in a gym, one-handed.

**Scope note:** §01–§03 are platform-independent. §04 is the mobile app. §05–§10 are the web/desktop management app — a different product with a different UX: three environments, dense grids, persistent filters, drawers instead of sheets, hover states, and no glass. Mobile patterns do not port to web and web patterns do not port to mobile.

## Sources

Everything in this system was lifted from material the user supplied. No values were invented or rounded.

| Source | What was taken |
| --- | --- |
| `easygame/easygamemobile/` (attached local codebase, read-only) | The whole visual system: `client/constants/theme.ts` (colours, spacing, radii, type ramp, shadows), `client/components/*.tsx` (Button, Badge, Card, Avatar, Input, EmptyState, ThemedText, Spacer, EasyGameGradientBackground, HeaderTitle), `client/screens/Trainer*.tsx` (screen layouts, Italian copy), `client/navigation/MainTabNavigator.tsx` (floating tab bar), `client/hooks/useScreenOptions.ts` (gradient app bar), `design_guidelines.md` |
| `easygame/easygamemobile/assets/images/` | App icon, splash icon, favicon, default athlete/club avatars, four empty-state illustrations |
| `uploads/palette-font.png` | Brand font (Poppins) and brand colours `#2563EB`, `#3533CD` |
| `uploads/logotipo-b/w.png`, `icon-b/w.png`, `favicon.png`, `social.png` | Logo wordmark and mark, in blue and white |
| `uploads/Extending EasyGame Design System/` | **The approved mobile design artifact (v3 source of truth).** The IA/Home design board and the clickable prototype: dock models, corrected chrome, the four-tier status hierarchy, full-page blue auth screens, the tri-state attendance row, document and payment states, sheet behaviour. Where it conflicted with the v2.3 written spec, it won. |
| https://github.com/frattomella/easygame | Repo the attached codebase corresponds to (web app + `easygamemobile/`). Browse it for backend/domain context — event, attendance and convocation models live in `prisma/schema.prisma` and `src/`. |
| `uploads/EasyGame Web redesign project/` | **The approved web design package (v3.1 source of truth).** The Iterazione 4 direction board (corrected shell, quick actions, unified data grid), the extracted `EGShell` / `EGRecord` / `EGAthlete` frames, the `v0.1 bozza` web system document, four screen overviews, and screenshots of the production web app. Conflicts inside the package are resolved in `05-web-desktop.md` §5.0 |
| https://github.com/frattomella/easygame-mobile | Second, mobile-only repo listed on the account. **Not read** in this pass — worth exploring if it diverges from `easygamemobile/`. |

Anyone extending this system should read those repositories directly: the screen code carries details (permission gating, empty-state copy, date formatting in Italian) that a design file cannot.

## Content fundamentals

- **Language: Italian, always.** Every label, empty state and error in the product is Italian. Do not mix in English words — not "Dashboard" as a body label (the one exception is the screen title `Dashboard`, which the product uses as-is), not "Coach" in copy.
- **Casing: sentence case for sentences, title case for module names.** Screen and section titles use the product's own casing: `Allenamenti di oggi`, `Gare della settimana`, `Rosa Squadra`, `Promemoria Attivi`, `Calendario successivo`. Follow the source string exactly rather than normalising it.
- **Address the coach as "tu", implicitly.** Copy is mostly nouns and short verb phrases: `Presenze`, `Convocazioni`, `Salva presenze`, `Registra Presenze`, `Vai agli Allenamenti`, `Esci`. Possessives appear where they help: `I tuoi atleti`, `I Miei Accessi`.
- **Greeting is warm, once per session.** `Buongiorno, [Nome]` on Home. Nothing else in the product is chatty.
- **Empty states state the fact, then nothing more.** `Nessun allenamento nella giornata corrente.` · `Nessuna gara oggi.` · `Nessun promemoria in sospeso.` · `Nessun atleta trovato` + `Prova a cambiare ricerca.` Full stop included on sentences, omitted on titles.
- **Errors are short and blame nothing.** `Credenziali non valide` · `Le password non coincidono` · `Inserisci email e password` · `Errore di connessione`.
- **Status is a word, not a colour alone.** `Attivo`, `Infortunato`, `Squalificato`, `Presente`, `Assente`, `Convocato`, `Non convocato`, `Allenamento attivo`, `Allenamento annullato`. Every coloured state has its Italian label next to it.
- **Numbers are always in context:** `14/18 presenti`, `11 convocati`, `18:00 - 19:30`, `18 mar 2026` (Italian short-month, via `date-fns` `it` locale). Missing data gets an explicit fallback: `Orario da definire`, `Data non disponibile`, `Ruolo da definire`.
- **No emoji. Anywhere.** The product has none, and the coach-on-the-field tone does not want them. Unicode `·` is the standard separator between metadata fragments.
- **Vibe:** a competent assistant coach. Efficient, respectful, never playful, never shouting. No exclamation marks, no marketing language, no gamification.

## Visual signature

EasyGame must be recognisable with the logo hidden. The recognition comes from six things that appear on every screen and are never used one without the others:

1. **The layered ground — "floodlit pitch".** Every operational screen stands on a fixed background: the **brand blue ramp** (`#12265A → #1B3576 → #2549A8 → #2B57C9`, 300px tall on a phone) lit by two floodlight pools (blue 400 at 55% top-left, indigo at 50% top-right), striped with faint vertical pitch lines (1px white at 7%, every 28px), meeting a blue-cast mist ground (`#EEF3FE`) across a soft 120px horizon. The header and the screen's headline live in the sky; content glass starts inside the sky and scrolls down onto the ground. Auth and blocking screens use the same ramp at full height, with no horizon at all. Never an opaque white block in the sky; never a flat page background; never near-black.
2. **Frosted glass, not white cards.** Content surfaces are white at 74% with an 18px blur and 1.4 saturation, a 1px translucent border (white 70%), a 1px **inner top highlight** (white 85%) and a layered navy shadow (`0 12px 32px -10px rgba(11,26,58,.28)` + `0 2px 6px 6%`). Dark glass (navy 72%) is used for the dock and for panels in the sky. The floodlights are visible through the glass — that depth is the point.
3. **The signature corner.** Three soft corners and one cut: `22px 22px 8px 22px` on panels, `14 14 5 14` on controls and tiles, `10 10 4 10` on chips. The cut bottom-right corner echoes the horizontal bar of the "e" mark. It is applied to every rectangular surface — cards, buttons, inputs, number tiles, icon chips — so the silhouette alone identifies the product.
4. **One controlled gradient for action.** `linear-gradient(135deg, #3B82F6, #2563EB 48%, #3533CD)` — blue into the brand indigo — is the only thing that means "act here / this is active": the primary button on light grounds, the dock's active puck, the trainings stripe. It always carries a 1px white-28% rim border, an inner highlight and a blue glow. Matches use the orange gradient, the navy gradient is for resting tiles. No other gradients exist. **On the blue sky the gradient is banned for buttons** — the primary inverts to white-on-navy.
5. **The module stripe + time rail.** Schedule content is an Event Card: a 3px module stripe along the top edge (inset 22px), and a left time rail with a big 22px/800 tabular time. The eye reads "when" before "what" — a coach's reading order.
6. **Tracked eyebrow over tight display.** Every block opens with an 11px/700 uppercase eyebrow at +0.12em tracking, then a 24–26px/800 display line at −0.02em. Body copy is calm 400/500. This two-line opener is on the sky (white / white 72%) and inside panels (ink 42% / ink).

Supporting rules:

- **Colour.** Royal blue `#2563EB` is the primary and the identity; the sky ramp ends one step from it. Brand indigo `#3533CD` closes the action gradient; navy `#07122B / #0B1A3A` is depth only, never the identity. Ink is navy-900 at 100 / 62 / 42% — never pure black or mid-grey. Three status hues (green, amber, red) and the orange match accent, each as a 10–13% tint with a 28–32% border. The old slate palette remains as tokens for compatibility but is no longer the look.
- **Type.** Poppins 400/500/600/700/800. Numbers — times, jersey numbers, counts — are always tabular, 800, tracked −0.03em, and larger than the text beside them. Eyebrows are uppercase; nothing else is.
- **Icons.** Ionicons, but never bare above 16px: any icon that is not inline metadata sits in an **Icon Chip** — a tinted tile (colour at 12%, border at 25%, inner highlight, cut corner). Metadata icons are 15px outline at ink 42%. The dock uses filled glyphs when active and outline glyphs when not.
- **Identity glyph = jersey number.** Athletes are shown as a **Number Tile** (44px, navy gradient, 18px/800 numeral, optional 3-letter role) rather than initials or a face. Circular avatars are only for clubs and the coach.
- **Spacing and rhythm.** 4px base; 16px gutter; 12px between panels; 8px between rows; stripes inset 22px; the dock floats 20px from the sides and 18px from the bottom. Screens are single-column.
- **Motion.** Press = scale (0.97 controls, 0.985 panels) + 1px drop + brightness 1.08 on gradient surfaces, 120ms, no colour swap, no bounce. Sheets 220ms in / 180ms out on `cubic-bezier(.2,.9,.25,1)`. Blur is static — never animated.
- **Transparency and blur.** Glass at 74/88%, dark glass at 72%, scrim navy-950 at 55% with a 6px blur behind sheets. Text is never set at alpha below 42% ink.
- **Sheets.** Attendance and call-ups open as a bottom sheet: strong glass, 28px top corners, grabber, eyebrow + h3, list, then a full-width primary Action Surface whose label carries the count ("Salva 14/18", "Convoca 11"). Option sheets have no action bar at all — three natural dismissals are enough.
- **Imagery.** Still none beyond the four blue empty-state illustrations; the layered ground does the atmospheric work.

## The five signature patterns

Each has a spec card in the Design System tab (group "Signature") with visual structure, surface, border, shadow, icon treatment, typography, active, pressed and disabled states.

| # | Pattern | Component | Tell |
| --- | --- | --- | --- |
| 1 | **Event Card** | `EventCard` | Glass panel, 3px module stripe on top, left time rail with 22px tabular time, pill, meta rows, action row. Cancelled = dashed border + struck time. |
| 2 | **Athlete Row** | `SelectableAthleteRow` + `NumberTile` | Number tile (navy always) → name/role/state → 30px ring mark. State shown by the ring tint, the hairline and the word — never a coloured row. |
| 3 | **Status Pill** | `Badge` | Ring-dot + 10px tracked caps label. Four tiers by weight: quiet · outline · solid · urgent. Solid fills, white labels, ≥4.5:1 everywhere. |
| 4 | **Floating Dock** | `TabBar` | 56px dark-glass pill; active tab is an action-gradient puck with the only visible label; inactive tabs are outline glyphs at white 62%. |
| 5 | **Action Surface** | `Button` | Gradient fill, rim border, inner highlight, glow, trailing arrow chip on the main CTA. Secondary = frosted glass. Disabled = flat ink 6%. |

Rebrand test: swapping the logo and the primary hue would still leave the floodlit ground, the cut corner, the time rail, the number tiles, the ring pills and the dock puck — the interface stays EasyGame.

## Iconography

- **The icon set is Ionicons** (`@expo/vector-icons` → `Ionicons` in the app). There is no custom icon font and no bespoke SVG set in the codebase, so nothing needed copying — this is the same library, not a substitute. The 28 glyphs the product actually uses are vendored as SVGs in `assets/icons/` (from `ionic-team/ionicons`, MIT). Use the `Icon` component — it masks the SVG so the glyph takes any colour — and set `window.EG_ICON_BASE` to that folder's relative path on each page; without it the component falls back to the Ionicons CDN. Do not use the `ion-icon` web component: its lazy loader does not hydrate in sandboxed preview frames.
- **Outline vs filled is meaningful.** Metadata and form icons are `*-outline` at 16–20px in `--eg-text-secondary`. Navigation and state icons are filled at 24px: `home`, `fitness`, `football`, `people`, `person` in the tab bar; `checkmark-circle` / `ellipse-outline` for selection; `close-circle-outline` / `play-circle-outline` for training status.
- **Glyphs actually in use:** `location-outline`, `people-outline`, `barbell-outline`, `search-outline`, `close-circle`, `notifications-outline`, `mail-outline`, `lock-closed-outline`, `eye-outline`, `server-outline`, `chevron-forward-outline`, `help-circle-outline`.
- **No emoji, ever.** No unicode symbols as icons either — the one exception is `·` as a text separator.
- **Brand marks** live in `assets/`: `logo-blue.png` / `logo-white.png` (wordmark), `icon-blue.png` / `icon-white.png` (the "e" mark), `app-icon.png`, `splash-icon.png`, `favicon.png`, `social.png`. The mark on a blue surface is always the white version. Nothing here was drawn or reconstructed — all files came from the user.

## Index

Foundations and tokens

- `styles.css` — the one file consumers link; `@import`s everything below.
- `tokens/web.css` — the web/desktop layer (`--egw-*`): environments, geometry, densities, planes, web type ramp. Web only; mobile never reads it.
- `tokens/signature.css` — the visual-signature layer (navy ramp, glass, cut corner, highlights, gradients, floodlight, eyebrow type). Plus `colors.css`, `semantic.css`, `typography.css`, `spacing.css`, `radius.css`, `elevation.css`, `motion.css`, `fonts.css`.
- `guidelines/01-brand.md` … `10-handoff.md` — the ten documents. **Read 01–04 before building mobile UI, 01–03 + 05–10 before building web UI.**
- `guidelines/deprecated.md` — what must not be used, with replacements. `guidelines/migration-v3.md` — how to move the existing app onto v3.
- `guidelines/archive/v2.3/` — the previous CURRENT revision's specs, kept as a detail reference.
- `guidelines/signature-*.card.html` — the six Signature cards. `guidelines/web-*.card.html` — six Web cards (environments, shell, DataGrid, status, fields & overlays, alerts). `guidelines/*.card.html` — 21 foundation specimen cards (Colors, Type, Spacing, Brand).
- `assets/` — logos, marks, app icons, default avatars, empty-state illustrations.

Components (`window.EasyGameDesignSystem_845326`)

- `components/core/` — **Button**, **Badge**, **Card**, **Avatar**, **NumberTile**, **IconChip**, **Input**, **Text**, **Icon**, **Spacer**
- `components/feedback/` — **EmptyState**
- `components/brand/` — **Floodlight**, **BrandGradient**, **AppBar**, **TabBar**
- `components/patterns/` — **EventCard**, **SelectableAthleteRow**, **SectionHero**, **HighlightCard**, **StatCard**, **MetaRow**

Each directory has one `@dsCard` HTML showing states; each component has a `.d.ts` props contract and a `.prompt.md` with usage.

UI kit

- `templates/web-page/` — an operational list page on the real web shell: the starting point for every web page a consuming project builds.
- `ui_kits/mobile_app/` — click-through recreation of the coach app: Login → Dashboard → Allenamenti (attendance sheet) → Gare (call-up sheet) → Atleti → Profilo. See its `README.md`.

Parent area (specified, not yet built as components)

- `ChildSwitcher`, `RSVPControl`, `PaymentCard`, `DocumentRow`/`DocumentCard`, `ConsentRow`, `NotificationRow`, `AppointmentCard`, `BookingCard`, `EnrollmentStatusCard`, `AccountAccessCard` — v3 rules in `guidelines/04-mobile.md` §4.11, fine detail in `guidelines/archive/v2.3/component-specs.md` Part C.

New in v3, specified not yet built: `NavTile`, `HubList`, `BrandStateLayout`.

Other

- `CHANGELOG.md` — revision history and the current version identifier.
- `SKILL.md` — Agent Skills entry point.
- `github.md` — source-repo association for upstream sync.

### Intentional additions

The component inventory is the app's own (`client/components/`), plus:

- **Icon** — a wrapper for Ionicons, so mocks use the real glyph set with system sizes/colours instead of hand-drawn SVG.
- **Floodlight**, **NumberTile**, **IconChip**, **EventCard** — the signature-language additions introduced in the identity pass; they replace, respectively, the flat root background, initials avatars for athletes, bare icons, and the ad-hoc training/match cards in the screens.
- **Text** — the app's `ThemedText` renamed for a web audience.
- **BrandGradient** — the app's `EasyGameGradientBackground`, renamed.
- **AppBar**, **TabBar**, **SectionHero**, **HighlightCard**, **StatCard**, **MetaRow**, **SelectableAthleteRow** — these exist in the source as inline `StyleSheet` blocks inside `MainTabNavigator`, `useScreenOptions` and the `Trainer*Screen` files rather than as exported components. They are extracted verbatim (same paddings, radii, colours) because every screen repeats them.

### Known gaps and substitutions

- **No font binaries were supplied.** Poppins is loaded from Google Fonts. If EasyGame licenses a specific cut, drop the files in and replace `tokens/fonts.css`.
- **Illustrations are deprecated as of v2.1.** The app is icon-only; the four empty-state images (which also carry English text) are retained as brand archive and must not appear in product UI. `StateMessage` replaces them.
- The app's `HeaderNotificationButton`, `ErrorBoundary`/`ErrorFallback` and `KeyboardAwareScrollViewCompat` are platform plumbing with no visual design of their own; the bell is folded into `AppBar`, the rest are not modelled.
- No dark-theme specimen cards yet — the tokens exist (`.eg-dark`), the screens are not drawn in dark.
