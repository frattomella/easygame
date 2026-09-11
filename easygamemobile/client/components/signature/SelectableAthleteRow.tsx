import React, { useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGlass, EGMark, EGShadow, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { NumberTile } from "@/components/signature/NumberTile";
import { SignatureText } from "@/components/signature/SignatureText";

export type SelectableAthleteRowAccent = "success" | "primary";

/** `yes` = presente/convocato · `no` = assente (solo presenze) · `null` = ancora da segnare. */
export type SelectableAthleteRowMark = "yes" | "no" | null;

interface SelectableAthleteRowProps {
  /** The athlete's jersey number, rendered on a 44px navy `NumberTile` — never a face or initials. */
  number: number;
  name: string;
  /** e.g. "Ala" — under the name; a disabled row shows the reason here instead. */
  role?: string;
  mark: SelectableAthleteRowMark;
  /** `success` (#15803D) for attendance, `primary` (#1D4ED8) for call-ups — prototipo `TONE`. */
  accent: SelectableAthleteRowAccent;
  labels: { yes: string; no: string; unmarked: string };
  /** A disabled row must always say why (`Infortunato`, `Certificato scaduto`) — it never just goes grey. */
  disabled?: boolean;
  disabledReason?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const ACCENT_HEX: Record<SelectableAthleteRowAccent, string> = {
  success: "#15803D",
  primary: "#1D4ED8",
};
const NO_HEX = "#B45309";

/**
 * The attendance / call-up row (prototipo v3 `sheetAthletes`, design turno
 * 6 §5-6): number tile **navy in every state**; name 15/700 + role 12/500;
 * the state as a *word* in the accent colour on the right (`Presente`,
 * `Assente`, `Da segnare`); a 30px ring mark at 12% tint with a 1.5px
 * border and a `checkmark` / `close` / `ellipse-outline` glyph. The row
 * keeps regular glass with only a hairline shift — "a list nobody has
 * touched looks untouched", success emphasis lives on the save CTA alone.
 */
export function SelectableAthleteRow({
  number,
  name,
  role,
  mark,
  accent,
  labels,
  disabled = false,
  disabledReason,
  onPress,
  style,
}: SelectableAthleteRowProps) {
  const [pressed, setPressed] = useState(false);
  const effective: SelectableAthleteRowMark = disabled ? null : mark;
  const accentHex =
    effective === "yes"
      ? ACCENT_HEX[accent]
      : effective === "no"
        ? NO_HEX
        : null;
  const stateWord = disabled
    ? disabledReason || labels.unmarked
    : effective === "yes"
      ? labels.yes
      : effective === "no"
        ? labels.no
        : labels.unmarked;
  const interactive = !disabled && Boolean(onPress);

  const inner = (
    <GlassSurface
      tone={accentHex ? "strong" : "light"}
      corner="control"
      style={[
        styles.surface,
        EGShadow.row,
        { borderColor: accentHex ? `${accentHex}40` : EGGlass.border },
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.row}>
        <NumberTile number={number} size={44} tone="navy" />
        <View style={styles.info}>
          <SignatureText style={styles.name} numberOfLines={1}>
            {name}
          </SignatureText>
          <SignatureText style={styles.role} numberOfLines={1}>
            {disabled ? disabledReason || role || "" : role || ""}
          </SignatureText>
        </View>
        <SignatureText
          style={[
            styles.stateWord,
            { color: accentHex || "rgba(11,26,58,0.62)" },
          ]}
        >
          {stateWord}
        </SignatureText>
        <View
          style={[
            styles.ring,
            accentHex
              ? {
                  backgroundColor: `${accentHex}1F` /* 12% tint, EGMark.tintAlpha */,
                  borderColor: `${accentHex}66`,
                }
              : styles.ringRest,
          ]}
        >
          <Ionicons
            name={
              effective === "yes"
                ? "checkmark"
                : effective === "no"
                  ? "close"
                  : "ellipse-outline"
            }
            size={16}
            color={accentHex || "rgba(11,26,58,0.35)"}
          />
        </View>
      </View>
    </GlassSurface>
  );

  if (!interactive) {
    return inner;
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityState={{ selected: effective === "yes", disabled }}
      accessibilityLabel={`${name}, ${stateWord}`}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    minHeight: 64,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: "#0B1A3A",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  role: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  stateWord: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.44,
    flexShrink: 0,
  },
  ring: {
    width: EGMark.size,
    height: EGMark.size,
    borderRadius: EGMark.size / 2,
    borderWidth: EGMark.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  ringRest: {
    borderColor: "rgba(11,26,58,0.16)",
    backgroundColor: "rgba(11,26,58,0.05)",
  },
});
