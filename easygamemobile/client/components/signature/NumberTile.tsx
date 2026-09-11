import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { EGCorner, EGGlass, EGShadow } from "@/constants/theme";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";

export type NumberTileTone = "navy" | "action" | "success" | "match" | "muted";

interface NumberTileProps {
  /**
   * The athlete's jersey number — the identity glyph, never a face or
   * initials (spec B1). `0`/missing means "not assigned yet" in this data
   * model and renders as an en dash, not as a fake "0".
   */
  number: number | null | undefined;
  tone?: NumberTileTone;
  size?: number;
  /** 3-letter role caption under the numeral, e.g. "POR". */
  caption?: string;
  style?: StyleProp<ViewStyle>;
}

const GLOW: Partial<Record<NumberTileTone, keyof typeof EGShadow>> = {
  action: "glowPrimary",
  success: "glowSuccess",
};

/**
 * design-source `guidelines/component-specs.md` §B1. Promoted from "Trainer
 * component still to be built" to implemented ahead of the rest of Part B
 * because `ChildSwitcher` (Part C) needs it immediately for the Parent
 * batch — see `docs/knowledge-base/05-mobile-architecture.md`.
 */
export function NumberTile({
  number,
  tone = "navy",
  size = 44,
  caption,
  style,
}: NumberTileProps) {
  const muted = tone === "muted";
  const corner = size >= 56 ? EGCorner.card : EGCorner.control;
  const glowKey = GLOW[tone];
  const shadow = glowKey ? EGShadow[glowKey] : undefined;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderWidth: 1,
          borderColor: muted ? EGGlass.hairline : "rgba(255,255,255,0.28)",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
        corner,
        shadow,
        style,
      ]}
    >
      {muted ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(11,26,58,0.08)",
          }}
        />
      ) : (
        <GradientFill
          gradient={tone}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      )}
      <SignatureText
        style={{
          fontSize: Math.round(size * 0.42),
          fontWeight: "800",
          letterSpacing: -0.03 * size,
          color: muted ? "rgba(11,26,58,0.42)" : "#FFFFFF",
          fontVariant: ["tabular-nums"],
        }}
      >
        {number ? number : "–"}
      </SignatureText>
      {caption ? (
        <SignatureText
          style={{
            position: "absolute",
            bottom: Math.round(size * 0.08),
            fontSize: Math.round(size * 0.18),
            fontWeight: "700",
            letterSpacing: 0.6,
            opacity: 0.75,
            color: muted ? "rgba(11,26,58,0.42)" : "#FFFFFF",
          }}
        >
          {caption}
        </SignatureText>
      ) : null}
    </View>
  );
}
