import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";

import { SignatureText } from "@/components/signature/SignatureText";

export type StatusPillVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "match"
  | "onDark";

interface Tone {
  fg: string;
  ring: string;
  bg: string;
  border: string;
}

const TONES: Record<StatusPillVariant, Tone> = {
  default: {
    fg: "rgba(11,26,58,0.62)",
    ring: "rgba(11,26,58,0.35)",
    bg: "rgba(11,26,58,0.06)",
    border: "rgba(11,26,58,0.1)",
  },
  primary: {
    fg: "#1D4ED8",
    ring: "#2563EB",
    bg: "rgba(37,99,235,0.1)",
    border: "rgba(37,99,235,0.28)",
  },
  success: {
    fg: "#15803D",
    ring: "#22C55E",
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.3)",
  },
  warning: {
    fg: "#B45309",
    ring: "#F59E0B",
    bg: "rgba(245,158,11,0.13)",
    border: "rgba(245,158,11,0.32)",
  },
  destructive: {
    fg: "#B91C1C",
    ring: "#EF4444",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.3)",
  },
  match: {
    fg: "#C2410C",
    ring: "#F97316",
    bg: "rgba(249,115,22,0.12)",
    border: "rgba(249,115,22,0.3)",
  },
  onDark: {
    fg: "#FFFFFF",
    ring: "rgba(255,255,255,0.9)",
    bg: "rgba(255,255,255,0.12)",
    border: "rgba(255,255,255,0.22)",
  },
};

interface StatusPillProps {
  label: string;
  variant?: StatusPillVariant;
  small?: boolean;
  /** Hollow ring = taxonomy (category, role); filled ring = a live status. */
  dot?: boolean;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The EasyGame Status Pill (design-source `components/core/Badge.jsx`):
 * a ring-dot plus a tracked uppercase label on a tinted hairline pill.
 * Sibling to `client/components/Badge.tsx` — existing screens keep using
 * `Badge`; this is for the new visual identity.
 */
export function StatusPill({
  label,
  variant = "default",
  small = false,
  dot = true,
  filled,
  style,
}: StatusPillProps) {
  const tone = TONES[variant];
  const isFilled = filled !== undefined ? filled : variant !== "default";

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          gap: small ? 5 : 6,
          backgroundColor: tone.bg,
          borderWidth: 1,
          borderColor: tone.border,
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
            borderColor: tone.ring,
            backgroundColor: isFilled ? tone.ring : "transparent",
          }}
        />
      ) : null}
      <SignatureText
        variant="caption"
        style={{
          color: tone.fg,
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
