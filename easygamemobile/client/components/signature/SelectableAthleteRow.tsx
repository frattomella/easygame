import React, { useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGlass, EGInk, EGShadow, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { NumberTile } from "@/components/signature/NumberTile";
import { SignatureText } from "@/components/signature/SignatureText";

export type SelectableAthleteRowAccent = "success" | "primary";

interface SelectableAthleteRowProps {
  /** The athlete's jersey number, rendered on a 44px `NumberTile` — never a face or initials. */
  number: number;
  name: string;
  /** e.g. "Under 15 · Centrocampista" — omitted rows still show the state word. */
  role?: string;
  selected: boolean;
  /** `success` (#22C55E) for attendance, `primary` (#2563EB) for call-ups — spec B3. */
  accent: SelectableAthleteRowAccent;
  selectedLabel: string;
  unselectedLabel: string;
  /** A disabled row must always say why (`Infortunato`, `Squalificato`) — it never just goes grey. */
  disabled?: boolean;
  disabledReason?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

const ACCENT_HEX: Record<SelectableAthleteRowAccent, string> = {
  success: "#22C55E",
  primary: "#2563EB",
};
const ACCENT_TILE_TONE: Record<
  SelectableAthleteRowAccent,
  "success" | "action"
> = {
  success: "success",
  primary: "action",
};
const ACCENT_GLOW: Record<SelectableAthleteRowAccent, keyof typeof EGShadow> = {
  success: "glowSuccess",
  primary: "glowPrimary",
};

/**
 * design-source `guidelines/component-specs.md` §B3. Not yet ported into
 * `client/components/signature/` ahead of this migration (no file, no
 * usage anywhere in the app) — built here as the minimum coherent
 * extension the spec already describes in full, not a new direction. The
 * core interaction of the Trainer MVP: attendance and call-ups, one tap per
 * athlete, the whole row as the target (no nested control).
 *
 * Selection is shown redundantly on the four axes the spec makes
 * mandatory — tile tone, ring fill + halo, border tint, and the Italian
 * state word — so a colour-blind or greyscale reading of the row still
 * carries the information. One documented simplification: the surface
 * itself stays regular glass rather than "glass strong" on selection (that
 * distinction is not part of the mandatory four, and `GlassSurface` has no
 * per-instance alpha hook today) — see the WP10 design-sync report.
 */
export function SelectableAthleteRow({
  number,
  name,
  role,
  selected,
  accent,
  selectedLabel,
  unselectedLabel,
  disabled = false,
  disabledReason,
  onPress,
  style,
}: SelectableAthleteRowProps) {
  const [pressed, setPressed] = useState(false);
  const accentHex = ACCENT_HEX[accent];
  const active = !disabled && selected;
  const stateWord = disabled
    ? disabledReason || unselectedLabel
    : selected
      ? selectedLabel
      : unselectedLabel;
  const interactive = !disabled && Boolean(onPress);

  const inner = (
    <GlassSurface
      tone="light"
      corner="control"
      style={[
        styles.surface,
        { borderColor: active ? `${accentHex}66` : EGGlass.border },
        active ? EGShadow[ACCENT_GLOW[accent]] : EGShadow.row,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.row}>
        <NumberTile
          number={number}
          size={44}
          tone={disabled ? "muted" : active ? ACCENT_TILE_TONE[accent] : "navy"}
        />
        <View style={styles.info}>
          <SignatureText
            variant="body"
            tone="ink"
            style={styles.name}
            numberOfLines={1}
          >
            {name}
          </SignatureText>
          {role ? (
            <SignatureText variant="caption" tone="faint" numberOfLines={1}>
              {role}
            </SignatureText>
          ) : null}
          <SignatureText
            style={[
              styles.stateWord,
              { color: active ? accentHex : EGInk.onLightMuted },
            ]}
          >
            {stateWord}
          </SignatureText>
        </View>
        <View
          style={[
            styles.ringHalo,
            active ? { backgroundColor: `${accentHex}42` } : null,
          ]}
        >
          <View
            style={[
              styles.ring,
              active
                ? { backgroundColor: accentHex, borderColor: accentHex }
                : styles.ringRest,
            ]}
          >
            {active ? (
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            ) : null}
          </View>
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
      accessibilityState={{ selected, disabled }}
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
    padding: Spacing.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: "700",
    letterSpacing: -0.15,
  },
  stateWord: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  ringHalo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  ringRest: {
    borderColor: "rgba(11,26,58,0.22)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
});
