# 02 · Foundations — Core

**EGDS v3.0.0 · CURRENT.** Platform-independent. Token source: `styles.css` → `tokens/*.css`, signature layer in `tokens/signature.css`.

## 2.1 Colour — blue is the identity

EasyGame blue `#2563EB` is the primary and the thing a person should see first. **Navy is depth, not identity.** v2.x ran the ground from near-black `#07122B`; at arm's length that read as a generic dark theme. v3 moves the ground onto the brand blue ramp.

**The sky ramp** (`--eg-grad-sky`): `#12265A → #1B3576 38% → #2549A8 76% → #2B57C9 100%`. It ends one step from the logo's own blue, so wherever the sky meets content it meets it in brand blue.

| Role | Token | Value |
| --- | --- | --- |
| Primary / action | `--eg-blue-600` (brand) | `#2563EB` |
| Gradient end, brand indigo | — | `#3533CD` |
| Sky ramp | `--eg-navy-800` → `--eg-blue-600` | `#12265A · #1B3576 · #2549A8 · #2B57C9` |
| Deep navy (shadow, dark glass base) | `--eg-navy-950/900` | `#07122B · #0B1A3A` |
| Ground | `--eg-mist-50/100` | `#EEF3FE · #E4ECFB` (blue-cast, not grey) |
| Ink | `--eg-ink` / `-muted` / `-faint` | navy-900 at 100 / 62 / 42% |

Rules:

- **Never a black or neutral-grey background.** Dark surfaces are navy-blue, and only as the deep end of a ramp or as dark glass.
- **No accidental hard cuts.** Every background transition is either a designed horizon (mist meeting sky across a soft ~120px band, with a glass surface straddling it) or no transition at all (a full-height ramp). There is no third case — see §04.3.
- **One action gradient** (`--eg-grad-action`, `135deg #3B82F6 → #2563EB 48% → #3533CD`) means "act here / this is active", and nothing else does. Module gradients: match orange, success green, warning amber, navy for resting tiles. No other gradients exist.
- The old slate palette survives as compatibility tokens only. It is not the look.

## 2.2 Contrast — mandatory

- **No blue ink on a blue ground. Anywhere.** This is the single most-repeated defect and it is banned at the token level.
- **On the sky**, the action gradient is banned for buttons: the primary action is a **white fill with navy label** (`--eg-action-on-sky-*`, 14.5:1) and the secondary is a **white-outlined ghost with a white label** (6.6:1). The v2 ink-coloured ghost is banned on dark surfaces.
- Supporting copy on the sky never drops below **white 78%**. Captions in a service base band sit at white 64% and may carry no meaning that is not repeated elsewhere.
- Body text ≥ 4.5:1; headline-scale type ≥ 3:1. Ink is never set below 42% alpha.
- Status colour is never the only signal: every coloured state carries its Italian word.
- Focus is always visible: `--eg-focus-ring` on light, `--eg-focus-ring-on-dark` on the sky.

## 2.3 Typography

Poppins 400/500/600/700/800. One family, five weights, six roles:

| Role | Spec | Use |
| --- | --- | --- |
| **Display** | 800 · 26–32px/1.14 · −0.02em | Screen title, sheet title, statement lines |
| **Heading** | 700 · 16–18px/22 | Card titles, row titles |
| **Body** | 500 · 14–15px/21–23 | Supporting copy, descriptions |
| **Label / action** | 700 · 13–15px/1 | Buttons, chips, tabs |
| **Eyebrow** | 700 · 10–11px/14–16 · +0.12em (+0.16em on caps step labels) · uppercase | Section openers, context lines, pill labels |
| **Metadata** | 500 · 12–13px/16–18 · ink 62% | Dates, counts, secondary facts |

- **Every block opens with an eyebrow over a display line.** That two-line opener is the type signature.
- **Numbers** — times, jersey numbers, amounts, counts — are tabular, 800, −0.03em, and larger than the text beside them.
- Uppercase is for eyebrows and pill labels only. Nothing else is set in caps.

## 2.4 Iconography

**Ionicons.** Simple, standard, immediately understandable. No decorative or ambiguous glyphs, no custom set, no emoji, no unicode symbols as icons (`·` as a text separator is the one exception).

Outline = metadata, form and secondary action. Filled = navigation and live state.

**Canonical meanings — these are normative. Do not substitute.**

| Meaning | Glyph | Meaning | Glyph |
| --- | --- | --- | --- |
| Back | `chevron-back` | Notification | `notifications-outline` |
| Navigate / next | `chevron-forward` | Success | `checkmark-circle` |
| More | `ellipsis-horizontal` | Warning | `alert-circle-outline` |
| Download | `download-outline` | Error | `close-circle-outline` |
| Upload / replace | `cloud-upload-outline` / `swap-horizontal-outline` | Camera | `camera-outline` |
| Attach | `attach-outline` | Gallery | `images-outline` |
| Document | `document-text-outline` | Files | `folder-outline` |
| Invoice (fattura) | `document-text-outline` | View | `eye-outline` |
| Receipt (ricevuta) | `receipt-outline` | Retry | `refresh-outline` |

- Any icon larger than 16px that is not inline metadata sits in an **Icon Chip** (tinted tile, 12% fill, 25% border, cut corner). Metadata icons are 15–16px outline at ink 62%.
- **An icon is never the only label on an action.** Document and payment actions are icon + word: `Carica documento`, `Visualizza`, `Scarica`, `Sostituisci`, `Ricevuta`, `Fattura`.
- The 28 glyphs actually in use are vendored in `assets/icons/`; use the `Icon` component and set `window.EG_ICON_BASE`.

## 2.5 Status system

Eight semantic levels, four visual tiers. **Weight communicates who is waiting for whom.**

| Level | Italian | Hue | Tier |
| --- | --- | --- | --- |
| Neutral | `Non richiesto`, `Da segnare` | ink 9% | Quiet |
| Informational | `In corso`, `Programmato` | blue `#1D4ED8` | Outline or Solid |
| Pending (waiting on someone else) | `In attesa`, `In verifica` | blue / amber | **Outline** |
| Incomplete (waiting on you) | `Da completare`, `Richiesto`, `Mancante` | amber `#B45309` | **Solid** |
| Deadline approaching | `Scade tra 3 giorni` | amber `#B45309` | Solid |
| Overdue / critical | `Scaduto`, `In ritardo` | red `#B91C1C` | **Urgent** |
| Success / completed | `Valido`, `Pagato`, `Confermato` | green `#15803D` | Quiet (settled) or Solid (just happened) |
| Disabled | `Non disponibile` | ink 6%, ink 42% label | Quiet |

**The four tiers:**

1. **Quiet** — settled, nothing to do. Hollow ring-dot, ink label, no fill, no border, no stripe. Weight near zero.
2. **Outline** — waiting on someone else. White fill, 1.5px coloured border, coloured label. **Never carries a button** — there is nothing for the person to do.
3. **Solid** — waiting on you. Filled pill, white label, and the card carries the matching 3px module stripe and one CTA.
4. **Urgent** — time-bound. Filled red pill carrying the countdown, plus a red card border and a red date line. **Only the urgent tier may carry a number, and only a countdown.**

**Pill construction** (`--eg-pill-*`): 22px tall, 0 9px 0 8px padding, pill radius, 6px ring-dot, 10px/700 caps label at +0.08em. Solid fills carry a white label; the ring-dot is white 90%. Neutral is an ink-9% fill with an ink-18% hairline and a hollow ink ring-dot.

- **Tint-on-glass pills are removed.** An 11% tint over glass disappeared over the lighter v3 ground and failed contrast. All live states are solid fills; all six variants clear 4.5:1 on any ground.
- **On the sky, the pill inverts**: white fill, coloured ring-dot, dark coloured label (e.g. amber-900 `#8A4708`, 7.0:1). Never a white-at-12% glass pill on blue.
- A screen sorts itself by tier: urgent first, then solid, then outline, then settled rows under their own `In regola` heading at the lowest legible weight.

## 2.6 Motion

Subtle, premium, controlled, fast. Motion confirms a change; it never performs.

- **Sheet in** 220ms on `--eg-ease-sheet` (`cubic-bezier(.2,.9,.25,1)`), scrim fading over the same curve. **Out** 180ms. No bounce, no overshoot, no spring past 1.0.
- **Press** — scale `0.97` on controls, `0.985` on surfaces, +1px drop, brightness 1.08 on gradient fills. 120ms. No colour swap on press.
- **Transitions** 160–220ms. Nothing in the product animates longer than 300ms.
- **Blur is never animated.** Backdrop filters are static.
- No playful easing, no confetti, no attention-seeking loops, no animated illustrations. Loading is a placeholder shell, not a spinner ballet.
- Respect `prefers-reduced-motion`: sheets cross-fade, presses lose the scale.

## 2.7 Structural signature

Recognisable with the logo hidden, unchanged from v2 and **not** modified by the v3 colour correction:

1. **The signature corner** — three soft corners, one cut: `22 22 8 22` on panels, `14 14 5 14` on controls, `10 10 4 10` on chips. The cut bottom-right echoes the bar of the "e".
2. **Frosted glass, not white cards** — white 74% (88% strong) with `blur(18px) saturate(1.4)`, a white-78% hairline, a white-85% inner top highlight and a layered navy shadow. Dark glass (`rgba(18,38,90,.66)`, white-20% hairline) in the sky.
3. **The layered ground** — sky ramp + two floodlight pools + 7% pitch lines + mist ground across a soft horizon.
4. **Module stripe + time rail** — a 3px module stripe inset 22px along a card's top edge, and a left rail with a 22px/800 tabular time. The eye reads *when* before *what*.
5. **Number tiles** — an athlete is a jersey number, not a face or initials.
6. **Eyebrow over display** — the two-line opener on every block.

## 2.8 Spacing and geometry

4px base · 16px screen gutter · 12px between panels · 8px between rows · 22px stripe inset · minimum tap target 44px (never shrink a control below it; pad instead). Single-column screens.
