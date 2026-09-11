import React, { useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGlass, EGInk, EGMark, EGShadow, Spacing } from "@/constants/theme";
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

/**
 * design-source `guidelines/component-specs.md` §B3, ported in WP10.
 * Selection is shown redundantly on the four axes the spec makes
 * mandatory — ring fill + halo, border tint, and the Italian state word,
 * plus (v2) the tile tone — so a colour-blind or greyscale reading of the
 * row still carries the information. One documented simplification: the
 * surface itself stays regular glass rather than "glass strong" on
 * selection (that distinction is not part of the mandatory four, and
 * `GlassSurface` has no per-instance alpha hook today) — see the WP10
 * design-sync report.
 *
 * v3.0 (`migration-v3.md` passo 5, WP13/ADR-0168): the tile stays **navy in
 * every state** — the WP10 tint-on-select tile tone and the marked-row
 * success glow are both removed (row keeps glass with only a hairline
 * border shift on selection); the mark shrinks to `EGMark`'s 30px ring at
 * 12% tint. This is the visual half of the spec's tri-state attendance
 * change — the boolean `selected` model itself is unchanged (ADR-0168
 * point 3: the third "not marked" state would need the mobile app to call
 * a different attendance endpoint, a domain change out of scope here).
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
        EGShadow.row,
        disabled ? styles.disabled : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.row}>
        <NumberTile
          number={number}
          size={44}
          tone={disabled ? "muted" : "navy"}
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
            styles.ring,
            active
              ? {
                  backgroundColor: `${accentHex}1F` /* ~12% tint, EGMark.tintAlpha */,
                  borderColor: accentHex,
                }
              : styles.ringRest,
          ]}
        >
          {active ? (
            <Ionicons name="checkmark" size={15} color={accentHex} />
          ) : null}
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
  ring: {
    width: EGMark.size,
    height: EGMark.size,
    borderRadius: EGMark.size / 2,
    borderWidth: EGMark.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ringRest: {
    borderColor: "rgba(11,26,58,0.22)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
});
