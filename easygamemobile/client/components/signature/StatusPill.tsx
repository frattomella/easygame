import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { SignatureText } from "@/components/signature/SignatureText";
import { EGInk, EGPill } from "@/constants/theme";

/** The four visual weights — "who is waiting for whom". */
export type StatusPillTier = "quiet" | "outline" | "solid" | "urgent";

/** The six semantic tones a tier can carry. */
export type StatusPillTone =
  | "success"
  | "info"
  | "warning"
  | "danger"
  | "match"
  | "neutral";

/**
 * @deprecated Kept for backward compatibility — every call site written
 * before v3.0 passes `variant`. New call sites should prefer `tier` + `tone`
 * directly (`02-foundations.md` §2.5). See `VARIANT_TO_TIER_TONE` below for
 * the exact mapping and its rationale; it is a considered default per
 * variant name, **not** a per-call-site audit against the label-text table
 * in `migration-v3.md` step 2 — a screen whose label reads as a different
 * bucket than its variant name suggests should pass `tier`/`tone` directly.
 */
export type StatusPillVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "match"
  | "onDark";

const VARIANT_TO_TIER_TONE: Record<
  StatusPillVariant,
  { tier: StatusPillTier; tone: StatusPillTone; onSky?: boolean }
> = {
  // Settled/read-only facts (spec: "Valido", "Pagato", "Attivo") — hollow ring, ink label.
  default: { tier: "quiet", tone: "neutral" },
  // Previously a light blue tint; "primary" implies drawing the eye, so it
  // becomes the attention tier rather than staying decorative.
  primary: { tier: "solid", tone: "info" },
  // The two existing call sites ("ATTIVE", "Visibile") both read as settled
  // facts, matching the spec's quiet-tier examples almost exactly.
  success: { tier: "quiet", tone: "success" },
  // Existing call sites ("DISATTIVATE", "Nessuna categoria", a pending
  // child-account state) read as "needs attention, not yet urgent" — the
  // spec's outline-tier bucket ("In attesa", "In verifica").
  warning: { tier: "outline", tone: "warning" },
  // The strongest existing category maps to the strongest tier.
  destructive: { tier: "urgent", tone: "danger" },
  match: { tier: "solid", tone: "match" },
  // v3.0 fixes a flagged accessibility conflict here: the old `onDark` was a
  // translucent white-12% pill on the sky, which fails 4.5:1 on the lighter
  // v3 ramp. `onSky` now forces a true white-fill inversion instead.
  onDark: { tier: "quiet", tone: "neutral", onSky: true },
};

const SOLID_BG: Record<StatusPillTone, string> = {
  success: EGPill.successBg,
  info: EGPill.infoBg,
  warning: EGPill.warningBg,
  danger: EGPill.dangerBg,
  match: EGPill.matchBg,
  neutral: EGPill.neutralInk,
};

/** Only warning/info have a distinct outline-tier ink in the source tokens; the rest fall back to their own solid colour, already dark enough for 4.5:1 on white. */
const OUTLINE_INK: Partial<Record<StatusPillTone, string>> = {
  warning: EGPill.outlineInkWarning,
  info: EGPill.outlineInkInfo,
};

interface StatusPillProps {
  label: string;
  /** @deprecated use `tier` + `tone`. */
  variant?: StatusPillVariant;
  tier?: StatusPillTier;
  tone?: StatusPillTone;
  /** On a blue ground, invert to a true white fill (never the banned translucent pill). */
  onSky?: boolean;
  small?: boolean;
  /** Hollow ring = taxonomy (category, role); filled ring = a live status. */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The EasyGame Status Pill (design-source `components/core/Badge.jsx`):
 * four visual tiers — quiet (hollow ring, ink label, no fill), outline
 * (white fill, coloured border+label), solid (filled, white label), urgent
 * (solid danger + heavier weight) — over six semantic tones. Solid fills
 * replace the v2 tint-on-glass pills; every variant stays ≥4.5:1 on glass,
 * mist and sky. Sibling to `client/components/Badge.tsx` — existing screens
 * keep using `Badge`; this is for the new visual identity.
 */
export function StatusPill({
  label,
  variant,
  tier,
  tone,
  onSky = false,
  small = false,
  dot = true,
  style,
}: StatusPillProps) {
  const fromVariant = variant ? VARIANT_TO_TIER_TONE[variant] : undefined;
  const resolvedTier: StatusPillTier = tier ?? fromVariant?.tier ?? "quiet";
  const resolvedTone: StatusPillTone = tone ?? fromVariant?.tone ?? "neutral";
  const sky = onSky || fromVariant?.onSky || false;
  const isUrgent = resolvedTier === "urgent";
  const effectiveTone: StatusPillTone = isUrgent ? "danger" : resolvedTone;
  const solidColor = SOLID_BG[effectiveTone];

  const look = (() => {
    if (sky) {
      // On-sky inversion: white fill, coloured ring-dot, dark coloured label.
      return {
        bg: "#FFFFFF",
        border: "rgba(255,255,255,0.9)",
        ring: solidColor,
        fg: effectiveTone === "neutral" ? EGInk.onLight : solidColor,
        filledDot: true,
      };
    }
    if (resolvedTier === "solid" || isUrgent) {
      return {
        bg: solidColor,
        border: "transparent",
        ring: EGPill.inkOnFill,
        fg: EGPill.inkOnFill,
        filledDot: true,
      };
    }
    if (resolvedTier === "outline") {
      const ink = OUTLINE_INK[effectiveTone] ?? solidColor;
      return {
        bg: EGPill.outlineBg,
        border: solidColor,
        ring: solidColor,
        fg: ink,
        filledDot: true,
      };
    }
    // quiet
    if (effectiveTone === "neutral") {
      return {
        bg: EGPill.neutralBg,
        border: EGPill.neutralBorder,
        ring: EGPill.neutralInk,
        fg: EGPill.neutralInk,
        filledDot: false,
      };
    }
    return {
      bg: "transparent",
      border: solidColor,
      ring: solidColor,
      fg: EGInk.onLight,
      filledDot: false,
    };
  })();

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: small ? 5 : 6,
          backgroundColor: look.bg,
          borderWidth: resolvedTier === "outline" ? 1.5 : 1,
          borderColor: look.border,
          borderRadius: 999,
          paddingVertical: small ? 4 : 6,
          paddingLeft: small ? 7 : 8,
          paddingRight: small ? 8 : 10,
        },
        style,
      ]}
    >
      {dot ? (
        <View
          style={{
            width: small ? 7 : 8,
            height: small ? 7 : 8,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: look.ring,
            backgroundColor: look.filledDot ? look.ring : "transparent",
          }}
        />
      ) : null}
      <SignatureText
        variant="caption"
        style={{
          color: look.fg,
          fontSize: small ? 10 : 11,
          lineHeight: small ? 12 : 13,
          fontWeight: "700",
          letterSpacing: 0.9,
          textTransform: "uppercase",
        }}
      >
        {label}
      </SignatureText>
    </View>
  );
}
