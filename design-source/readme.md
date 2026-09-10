# EasyGame Design System

**Revision: EGDS v2.3.0 · 2026-09-10 · "Real data" — CURRENT** — see `CHANGELOG.md`. Normative component specs live in `guidelines/component-specs.md`; navigation rules in `guidelines/navigation.md`; the Trainer reskin plan in `guidelines/trainer-migration.md`.

Design system for the **EasyGame mobile app** — the coach-facing app of EasyGame, a sports club management platform for clubs, coaches, staff, athletes and families.

The MVP in scope is for **trainers/coaches**, in Italian, and does two jobs well:

1. **Training attendance** (presenze) — one tap per athlete.
2. **Match call-ups** (convocazioni) — pick the squad for a match.

Everything else in the app (dashboard, roster, profile) exists to get a coach into those two flows fast, on a pitch or in a gym, one-handed.

**Scope note:** this system covers the mobile app only. The EasyGame web dashboard keeps its current UI and is deliberately out of scope for this phase — nothing here was derived from it, and no web UI is defined.

## Sources

Everything in this system was lifted from material the user supplied. No values were invented or rounded.

| Source | What was taken |
| --- | --- |
| `easygame/easygamemobile/` (attached local codebase, read-only) | The whole visual system: `client/constants/theme.ts` (colours, spacing, radii, type ramp, shadows), `client/components/*.tsx` (Button, Badge, Card, Avatar, Input, EmptyState, ThemedText, Spacer, EasyGameGradientBackground, HeaderTitle), `client/screens/Trainer*.tsx` (screen layouts, Italian copy), `client/navigation/MainTabNavigator.tsx` (floating tab bar), `client/hooks/useScreenOptions.ts` (gradient app bar), `design_guidelines.md` |
| `easygame/easygamemobile/assets/images/` | App icon, splash icon, favicon, default athlete/club avatars, four empty-state illustrations |
| `uploads/palette-font.png` | Brand font (Poppins) and brand colours `#2563EB`, `#3533CD` |
| `uploads/logotipo-b/w.png`, `icon-b/w.png`, `favicon.png`, `social.png` | Logo wordmark and mark, in blue and white |
| https://github.com/frattomella/easygame | Repo the attached codebase corresponds to (web app + `easygamemobile/`). Browse it for backend/domain context — event, attendance and convocation models live in `prisma/schema.prisma` and `src/`. |
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

1. **The layered ground — "floodlit pitch".** Every screen stands on a fixed background: a navy night sky (`#07122B → #0B1A3A → #12265A`, 300px tall on a phone) lit by two floodlight pools (blue 500 at 65% top-left, indigo 600 at 60% top-right), striped with faint vertical pitch lines (1px white at 5%, every 28px, fading downwards), meeting a pale mist ground (`#F3F5FC`) across a soft 120px horizon. The header and the screen's headline live in the sky; content glass starts inside the sky and scrolls down onto the ground. Never an opaque white block in the sky; never a plain flat page background.
2. **Frosted glass, not white cards.** Content surfaces are white at 74% with an 18px blur and 1.4 saturation, a 1px translucent border (white 70%), a 1px **inner top highlight** (white 85%) and a layered navy shadow (`0 12px 32px -10px rgba(11,26,58,.28)` + `0 2px 6px 6%`). Dark glass (navy 72%) is used for the dock and for panels in the sky. The floodlights are visible through the glass — that depth is the point.
3. **The signature corner.** Three soft corners and one cut: `22px 22px 8px 22px` on panels, `14 14 5 14` on controls and tiles, `10 10 4 10` on chips. The cut bottom-right corner echoes the horizontal bar of the "e" mark. It is applied to every rectangular surface — cards, buttons, inputs, number tiles, icon chips — so the silhouette alone identifies the product.
4. **One controlled gradient for action.** `linear-gradient(135deg, #3B82F6, #2563EB 48%, #3533CD)` — blue into the brand indigo — is the only thing that means "act here / this is active": the primary button, the dock's active puck, a called-up athlete's tile, the trainings stripe. It always carries a 1px white-28% rim border, an inner highlight and a blue glow (`0 10px 26px -8px rgba(37,99,235,.65)`). Matches use the orange gradient, presence the green one; the navy gradient is for resting tiles. No other gradients exist.
5. **The module stripe + time rail.** Schedule content is an Event Card: a 3px module stripe along the top edge (inset 22px), and a left time rail with a big 22px/800 tabular time. The eye reads "when" before "what" — a coach's reading order.
6. **Tracked eyebrow over tight display.** Every block opens with an 11px/700 uppercase eyebrow at +0.12em tracking, then a 24–26px/800 display line at −0.02em. Body copy is calm 400/500. This two-line opener is on the sky (white / white 72%) and inside panels (ink 42% / ink).

Supporting rules:

- **Colour.** Royal blue `#2563EB` stays the primary, now paired with the brand indigo `#3533CD` (gradient end) and a navy depth ramp `#07122B / #0B1A3A / #12265A / #1B3576`. Ink is navy-900 at 100 / 62 / 42% — never pure black or mid-grey. Three status hues (green, amber, red) and the orange match accent, each as a 10–13% tint with a 28–32% border. The old slate palette remains as tokens for compatibility but is no longer the look.
- **Type.** Poppins 400/500/600/700/800. Numbers — times, jersey numbers, counts — are always tabular, 800, tracked −0.03em, and larger than the text beside them. Eyebrows are uppercase; nothing else is.
- **Icons.** Ionicons, but never bare above 16px: any icon that is not inline metadata sits in an **Icon Chip** — a tinted tile (colour at 12%, border at 25%, inner highlight, cut corner). Metadata icons are 15px outline at ink 42%. The dock uses filled glyphs when active and outline glyphs when not.
- **Identity glyph = jersey number.** Athletes are shown as a **Number Tile** (44px, navy gradient, 18px/800 numeral, optional 3-letter role) rather than initials or a face. Circular avatars are only for clubs and the coach.
- **Spacing and rhythm.** 4px base; 16px gutter; 12px between panels; 8px between rows; stripes inset 22px; the dock floats 20px from the sides and 18px from the bottom. Screens are single-column.
- **Motion.** Press = scale (0.97 controls, 0.985 panels) + 1px drop + brightness 1.08 on gradient surfaces, 120ms spring, no colour swap. The dock puck slides between tabs. Blur is static — no animated blur.
- **Transparency and blur.** Glass at 74/88%, dark glass at 72%, scrim navy-950 at 55% with a 6px blur behind sheets. Text is never set at alpha below 42% ink.
- **Sheets.** Attendance and call-ups open as a bottom sheet: strong glass, 28px top corners, grabber, eyebrow + h3, list, then a secondary "Annulla" beside a full-width primary Action Surface whose label carries the count ("Salva 14/18", "Convoca 11").
- **Imagery.** Still none beyond the four blue empty-state illustrations; the layered ground does the atmospheric work.

## The five signature patterns

Each has a spec card in the Design System tab (group "Signature") with visual structure, surface, border, shadow, icon treatment, typography, active, pressed and disabled states.

| # | Pattern | Component | Tell |
| --- | --- | --- | --- |
| 1 | **Event Card** | `EventCard` | Glass panel, 3px module stripe on top, left time rail with 22px tabular time, pill, meta rows, action row. Cancelled = dashed border + struck time. |
| 2 | **Athlete Row** | `SelectableAthleteRow` + `NumberTile` | Number tile → name/role/state → 28px ring toggle. Selection shown by tile tone, ring fill + halo, border tint and the word. |
| 3 | **Status Pill** | `Badge` | Ring-dot + 10px tracked caps label on a tinted hairline pill. Hollow ring = taxonomy, filled ring = live status. |
| 4 | **Floating Dock** | `TabBar` | 68px dark-glass pill; active tab is an action-gradient puck with the only visible label; inactive tabs are outline glyphs. |
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
- `tokens/signature.css` — the visual-signature layer (navy ramp, glass, cut corner, highlights, gradients, floodlight, eyebrow type). Plus `colors.css`, `semantic.css`, `typography.css`, `spacing.css`, `radius.css`, `elevation.css`, `motion.css`, `fonts.css`.
- `guidelines/component-specs.md` — **normative** spec for every component (structure, surface, border, shadow, type, icons, spacing, all states) plus authentication/reset screens (Part E), system and release states (Part F) and push/deep-link states (Part G). Read this before building UI.
- `guidelines/navigation.md` — the mobile navigation language: Trainer + Parent docks, hubs, secondary screens, sheets, child-switcher placement.
- `guidelines/trainer-migration.md` — how to move Home / Allenamenti / Gare / Atleti onto the current language without changing functionality.
- `guidelines/signature-*.card.html` — the six Signature cards (five patterns + layered ground / corner). `guidelines/*.card.html` — 21 foundation specimen cards (Colors, Type, Spacing, Brand).
- `assets/` — logos, marks, app icons, default avatars, empty-state illustrations.

Components (`window.EasyGameDesignSystem_845326`)

- `components/core/` — **Button**, **Badge**, **Card**, **Avatar**, **NumberTile**, **IconChip**, **Input**, **Text**, **Icon**, **Spacer**
- `components/feedback/` — **EmptyState**
- `components/brand/` — **Floodlight**, **BrandGradient**, **AppBar**, **TabBar**
- `components/patterns/` — **EventCard**, **SelectableAthleteRow**, **SectionHero**, **HighlightCard**, **StatCard**, **MetaRow**

Each directory has one `@dsCard` HTML showing states; each component has a `.d.ts` props contract and a `.prompt.md` with usage.

UI kit

- `ui_kits/mobile_app/` — click-through recreation of the coach app: Login → Dashboard → Allenamenti (attendance sheet) → Gare (call-up sheet) → Atleti → Profilo. See its `README.md`.

Parent area (specified, not yet built as components)

- `ChildSwitcher`, `RSVPControl`, `PaymentCard`, `DocumentRow`/`DocumentCard`, `ConsentRow`, `NotificationRow`, `AppointmentCard`, `BookingCard`, `EnrollmentStatusCard`, `AccountAccessCard` — full visual specifications in `guidelines/component-specs.md`, Part C.

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
