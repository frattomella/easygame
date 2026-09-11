import { Platform } from "react-native";

export const Colors = {
  light: {
    primary: "#2563EB",
    text: "#0F172A",
    textSecondary: "#64748B",
    buttonText: "#FFFFFF",
    tabIconDefault: "#64748B",
    tabIconSelected: "#2563EB",
    link: "#2563EB",
    backgroundRoot: "#F8FAFC",
    backgroundDefault: "#FFFFFF",
    backgroundSecondary: "#F1F5F9",
    backgroundTertiary: "#E2E8F0",
    border: "#E2E8F0",
    success: "#22C55E",
    warning: "#F59E0B",
    destructive: "#EF4444",
    cardShadow: "rgba(0, 0, 0, 0.08)",
  },
  dark: {
    primary: "#3B82F6",
    text: "#F8FAFC",
    textSecondary: "#94A3B8",
    buttonText: "#FFFFFF",
    tabIconDefault: "#64748B",
    tabIconSelected: "#3B82F6",
    link: "#3B82F6",
    backgroundRoot: "#0F172A",
    backgroundDefault: "#1E293B",
    backgroundSecondary: "#334155",
    backgroundTertiary: "#475569",
    border: "#334155",
    success: "#22C55E",
    warning: "#F59E0B",
    destructive: "#EF4444",
    cardShadow: "rgba(0, 0, 0, 0.3)",
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  "4xl": 40,
  "5xl": 48,
  inputHeight: 48,
  buttonHeight: 52,
};

export const BorderRadius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  full: 9999,
};

export const Typography = {
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
  },
  h3: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h4: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
};

export const Shadows = Platform.select({
  ios: {
    card: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
    },
    cardLarge: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
    },
  },
  android: {
    card: {
      elevation: 3,
    },
    cardLarge: {
      elevation: 5,
    },
  },
  web: {
    card: {
      boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
    },
    cardLarge: {
      boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.12)",
    },
  },
  default: {
    card: {},
    cardLarge: {},
  },
});

export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/**
 * ═══════════════════════════════════════════════════════════════════════
 * EG — EasyGame signature tokens (design system source: Claude Design,
 * namespace `EasyGameDesignSystem_845326`. Tokens below are current through
 * **EGDS v3.0.0 "EasyGame blue", 2026-09-11** — see `design-source/` at the
 * repo root, `design-source/CHANGELOG.md`,
 * `design-source/guidelines/migration-v3.md`, and
 * `docs/knowledge-base/05-mobile-architecture.md`).
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Values below are ported verbatim from `design-source/tokens/*.css`. They
 * are **additive**: nothing above this line changes, so every screen that
 * already uses `Colors`/`Spacing`/`BorderRadius`/`Typography` keeps working
 * unmodified. `EG*` is the vocabulary for screens built against the new
 * visual identity (glass surfaces, the floodlit ground, the cut "signature
 * corner", controlled gradients) — see `client/components/signature/`.
 *
 * CSS → React Native, and what did **not** port 1:1:
 * - `border-radius: 22px 22px 8px 22px` → four separate corner properties
 *   (`EGCorner.card`), which is how React Native expresses a per-corner
 *   radius; there is no shorthand.
 * - `backdrop-filter: blur(18px) saturate(1.4)` → `expo-blur`'s `BlurView`
 *   (already a project dependency) behind a tinted overlay of `EGGlass.bg`;
 *   RN has no CSS-style backdrop filter. Saturation boost is not
 *   reproduced (no RN equivalent without a custom shader).
 *   the SVG gradients used for `EGGradients` and by `Floodlight`.
 * - The CSS `repeating-linear-gradient` pitch-line texture on the sky is
 *   **not** ported: a tiled 1px-every-28px stripe pattern would need a
 *   custom `Svg` pattern fill for a detail with very little visual weight
 *   at phone size. `Floodlight` reproduces the navy gradient and the two
 *   floodlight glows, not the stripes. Documented gap, not an oversight.
 * - `em`-based letter-spacing is resolved to points at each token's own
 *   font size (RN `letterSpacing` is always absolute).
 */

/**
 * Navy depth ramp + mist ground — the "floodlit pitch" backdrop.
 *
 * `skyRampBlue700`/`skyRampBlue600` are v3.0's two new sky-ramp stops
 * (`--eg-blue-700`/`--eg-blue-600` in `tokens/signature.css`) — **not** the
 * same colours as `blue600`/`blue700` below, which are the unrelated
 * action/pill blues (`#2563EB`/`#1D4ED8`) already in use across buttons and
 * pills. Two different CSS namespaces collide on the number only; kept
 * distinct here so existing call sites of `blue600`/`blue700` don't shift.
 */
export const EGColors = {
  navy950: "#07122B",
  navy900: "#0B1A3A",
  navy800: "#12265A",
  navy700: "#1B3576",
  skyRampBlue700: "#2549A8",
  skyRampBlue600: "#2B57C9",
  mist50: "#EEF3FE",
  mist100: "#E4ECFB",
  blue500: "#3B82F6",
  blue600: "#2563EB",
  blue700: "#1D4ED8",
  blue900: "#1E3A8A",
  indigo600: "#3533CD",
  green500: "#22C55E",
  amber500: "#F59E0B",
  red500: "#EF4444",
  orange500: "#F97316",
};

/**
 * v2.1.0 ("Parent-ready", 2026-09-10) additions — money and per-child
 * identity colours the Trainer MVP never needed. `moneyDue` reads deeper
 * than the destructive action red on purpose (`tokens/signature.css`
 * `--eg-money-due`/`--eg-money-paid`).
 */
export const EGMoney = {
  due: "#B91C1C",
  paid: "#15803D",
};

/**
 * Stable per-child accents (`--eg-child-1…4`), assigned in link order by
 * `ChildSwitcher`. An aid, never the only identifier — the child's name is
 * always shown alongside it.
 */
export const EGChildAccents = ["#2563EB", "#7C3AED", "#0D9488", "#DB2777"];

/** Ink on the two grounds: never pure black, never mid-grey. */
export const EGInk = {
  onLight: EGColors.navy900,
  onLightMuted: "rgba(11,26,58,0.62)",
  onLightFaint: "rgba(11,26,58,0.42)",
  onDark: "#FFFFFF",
  onDarkMuted: "rgba(255,255,255,0.72)",
  onDarkFaint: "rgba(255,255,255,0.5)",
};

/** Frosted-glass surface values, consumed by `GlassSurface`/`GlassCard`. */
export const EGGlass = {
  bg: "rgba(255,255,255,0.74)",
  bgStrong: "rgba(255,255,255,0.88)",
  border: "rgba(255,255,255,0.78)",
  darkBg: "rgba(18,38,90,0.66)",
  darkBorder: "rgba(255,255,255,0.2)",
  /** `expo-blur` `intensity` (0–100) approximating the source's 18px blur. */
  blurIntensity: 55,
  hairline: "rgba(11,26,58,0.08)",
  hairlineStrong: "rgba(11,26,58,0.14)",
  highlightTop: "rgba(255,255,255,0.85)",
  highlightTopDark: "rgba(255,255,255,0.18)",
};

/**
 * The signature corner: three soft corners, one cut bottom-right — echoes
 * the bar of the "e" mark. Applied to every rectangular surface in the new
 * visual language so the silhouette alone identifies the product.
 */
export const EGCorner = {
  card: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 8,
    borderBottomLeftRadius: 22,
  },
  control: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 14,
  },
  chip: {
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 10,
  },
  pill: { borderRadius: 999 },
  /** Level-4 nav surface (`BottomSheet`): flat top, the same cut only at rest on the bottom. */
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 0,
  },
} as const;

/**
 * Controlled gradients, as colour-stop arrays for `react-native-svg`'s
 * `LinearGradient`/`RadialGradient` (already a project dependency — see
 * `EasyGameGradientBackground.tsx` for the existing pattern this follows).
 * `action` is the only thing that means "act here / this is active"; no
 * other gradients exist outside this list.
 */
export const EGGradients: Record<
  | "action"
  | "success"
  | "destructive"
  | "navy"
  | "match"
  | "warning"
  | "neutral"
  | "sky"
  | "page",
  { offset: string; color: string }[]
> = {
  action: [
    { offset: "0%", color: "#3B82F6" },
    { offset: "48%", color: "#2563EB" },
    { offset: "100%", color: "#3533CD" },
  ],
  success: [
    { offset: "0%", color: "#34D399" },
    { offset: "50%", color: "#22C55E" },
    { offset: "100%", color: "#15803D" },
  ],
  destructive: [
    { offset: "0%", color: "#F87171" },
    { offset: "55%", color: "#EF4444" },
    { offset: "100%", color: "#B91C1C" },
  ],
  navy: [
    { offset: "0%", color: "#1B3576" },
    { offset: "100%", color: "#0B1A3A" },
  ],
  match: [
    { offset: "0%", color: "#FB923C" },
    { offset: "55%", color: "#F97316" },
    { offset: "100%", color: "#C2410C" },
  ],
  warning: [
    { offset: "0%", color: "#FBBF24" },
    { offset: "55%", color: "#F59E0B" },
    { offset: "100%", color: "#B45309" },
  ],
  neutral: [
    { offset: "0%", color: "rgba(11,26,58,0.14)" },
    { offset: "100%", color: "rgba(11,26,58,0.08)" },
  ],
  /**
   * v3.0: the sky ramp lifts off near-black onto the brand blue ramp — navy
   * is depth, not identity. Four stops, `EGColors.navy800` through
   * `skyRampBlue600` (`tokens/signature.css` `--eg-grad-sky`).
   */
  sky: [
    { offset: "0%", color: "#12265A" },
    { offset: "38%", color: "#1B3576" },
    { offset: "76%", color: "#2549A8" },
    { offset: "100%", color: "#2B57C9" },
  ],
  /**
   * v3.0 addition: the full-page ground for auth/account/blocking system
   * screens (`BrandStateLayout`) — no horizon, no mist, the ramp runs edge
   * to edge (`--eg-grad-page`). Nearly identical to `sky`; stop 3 sits 2
   * points later (`--eg-grad-sky` reaches its horizon blue at 76%, `--eg-
   * grad-page` at 74%) because a full-height ramp needs slightly more room
   * for the last stop before the bottom edge.
   */
  page: [
    { offset: "0%", color: "#12265A" },
    { offset: "38%", color: "#1B3576" },
    { offset: "74%", color: "#2549A8" },
    { offset: "100%", color: "#2B57C9" },
  ],
};

/** Layered navy shadows + coloured glows, as RN shadow props (iOS) with an Android `elevation` fallback. */
export const EGShadow = Platform.select({
  ios: {
    glass: {
      shadowColor: "#0B1A3A",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.28,
      shadowRadius: 16,
    },
    glassRaised: {
      shadowColor: "#0B1A3A",
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.34,
      shadowRadius: 24,
    },
    dock: {
      shadowColor: "#07122B",
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.5,
      shadowRadius: 24,
    },
    glowPrimary: {
      shadowColor: "#2563EB",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
    },
    glowSuccess: {
      shadowColor: "#22C55E",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
    },
    glowDestructive: {
      shadowColor: "#EF4444",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
    },
    glowWarning: {
      shadowColor: "#F59E0B",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.55,
      shadowRadius: 18,
    },
    /** Row shadow (`--eg-shadow-row`) — lighter than `glass`, for list rows (DocumentRow, NotificationRow, …). */
    row: {
      shadowColor: "#0B1A3A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
  },
  default: {
    glass: { elevation: 6 },
    glassRaised: { elevation: 10 },
    dock: { elevation: 12 },
    glowPrimary: { elevation: 6 },
    glowSuccess: { elevation: 6 },
    glowDestructive: { elevation: 6 },
    glowWarning: { elevation: 6 },
    row: { elevation: 2 },
  },
})!;

/**
 * Eyebrow + display type — the "tracked eyebrow over tight display" opener
 * every signature block uses. `letterSpacing` is resolved from the source's
 * `em` values at each token's own font size (11px eyebrow, 26px display).
 */
export const EGTypography = {
  eyebrow: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700" as const,
    letterSpacing: 1.32, // 0.12em @ 11px
    textTransform: "uppercase" as const,
  },
  display: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800" as const,
    letterSpacing: -0.52, // -0.02em @ 26px
  },
};

/**
 * ─────────────────────────────────────────────────────────────────────────
 * v3.0 "EasyGame blue" additions (`design-source/guidelines/migration-v3.md`)
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Full-page ground decoration for `BrandStateLayout` (auth, account and
 * blocking system screens) — no horizon, no mist band.
 */
export const EGPage = {
  watermarkOpacity: 0.05,
  courtArc: "rgba(255,255,255,0.1)",
  baselineRule: "rgba(255,255,255,0.12)",
  baselineTick: "rgba(255,255,255,0.18)",
};

/**
 * Buttons on a blue ground (`ActionButton`'s `onSky` prop). The action
 * gradient is **banned** on the sky: primary inverts to white fill / navy
 * ink, secondary becomes a white-outlined ghost.
 */
export const EGActionOnSky = {
  bg: "#FFFFFF",
  ink: EGColors.navy800,
  ghostBg: "rgba(255,255,255,0.08)",
  ghostBorder: "rgba(255,255,255,0.45)",
};

/** Compact dock geometry (`--eg-dock-*`; v3: 68px → 56px). */
export const EGDock = {
  height: 56,
  puck: 46,
  glyph: 20,
  inactive: "rgba(255,255,255,0.62)",
};

/**
 * Status pill ramp — four visual tiers (quiet · outline · solid · urgent)
 * over six semantic tones, solid fills with white labels replacing the v2
 * tint-on-glass pills. `≥4.5:1` on any ground. See `StatusPill`.
 */
export const EGPill = {
  inkOnFill: "#FFFFFF",
  successBg: "#15803D",
  infoBg: "#1D4ED8",
  warningBg: "#B45309",
  dangerBg: "#B91C1C",
  matchBg: "#9A3412",
  neutralBg: "rgba(11,26,58,0.09)",
  neutralBorder: "rgba(11,26,58,0.18)",
  neutralInk: "#0B1A3A",
  outlineBg: "#FFFFFF",
  outlineBorderWidth: 1.5,
  outlineInkWarning: "#8A4708",
  outlineInkInfo: "#1E40AF",
};

/** Attendance/call-up mark — a ring, never a filled row. */
export const EGMark = {
  size: 30,
  border: 1.5,
  tintAlpha: 0.12,
};

/** Motion: subtle, premium, controlled, fast. Never animate the blur. */
export const EGMotion = {
  easeSheet: [0.2, 0.9, 0.25, 1] as const,
  durationSheetIn: 220,
  durationSheetOut: 180,
  pressScaleControl: 0.97,
  pressScaleSurface: 0.985,
};
