import React from "react";
import { Text, TextProps } from "react-native";

import { EGInk, EGTypography, Typography } from "@/constants/theme";

export type SignatureTextVariant =
  | "display"
  | "eyebrow"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "body"
  | "small"
  | "caption"
  | "numeral";

export type SignatureTextTone =
  | "ink"
  | "muted"
  | "faint"
  | "onDark"
  | "onDarkMuted"
  | "onDarkFaint"
  | "link"
  | "inherit";

const VARIANT_STYLE: Record<SignatureTextVariant, object> = {
  display: EGTypography.display,
  eyebrow: EGTypography.eyebrow,
  h1: { ...Typography.h1, letterSpacing: -0.64 },
  h2: { ...Typography.h2, letterSpacing: -0.56 },
  h3: { ...Typography.h3, letterSpacing: -0.48 },
  h4: { ...Typography.h4, letterSpacing: -0.2 },
  body: Typography.body,
  small: Typography.small,
  caption: Typography.caption,
  numeral: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "800" as const,
    letterSpacing: -0.66,
  },
};

const TONE_COLOR: Record<SignatureTextTone, string | undefined> = {
  ink: EGInk.onLight,
  muted: EGInk.onLightMuted,
  faint: EGInk.onLightFaint,
  onDark: EGInk.onDark,
  onDarkMuted: EGInk.onDarkMuted,
  onDarkFaint: EGInk.onDarkFaint,
  link: "#2563EB",
  inherit: undefined,
};

interface SignatureTextProps extends TextProps {
  variant?: SignatureTextVariant;
  tone?: SignatureTextTone;
}

/**
 * Text component for the new visual identity (design-source
 * `components/core/Text.jsx`) — sibling to `ThemedText`, not a replacement:
 * existing screens keep using `ThemedText`. Adds the `eyebrow`/`display`/
 * `numeral` variants and the two-ground tone set (`ink*` on the mist ground,
 * `onDark*` in the navy sky) that `ThemedText` has no vocabulary for.
 *
 * Font family: system stack (`Typography`'s existing font), not Poppins —
 * no font binaries were supplied with the design system and none are
 * bundled in this app; loading a Google Font would add a new dependency and
 * a font-loading step in `App.tsx`, which is a decision for a dedicated
 * change, not a side effect of this one. Documented gap, matches the
 * design system's own README ("Known gaps").
 */
export function SignatureText({
  variant = "body",
  tone = "ink",
  style,
  ...rest
}: SignatureTextProps) {
  const color = TONE_COLOR[tone];
  return (
    <Text
      style={[VARIANT_STYLE[variant], color ? { color } : null, style]}
      {...rest}
    />
  );
}
