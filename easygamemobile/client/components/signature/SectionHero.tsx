import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Spacing } from "@/constants/theme";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";

export interface SectionHeroChip {
  label: string;
  value: string;
}

interface SectionHeroProps {
  icon?: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** At most three — the spec's hard limit. */
  chips?: SectionHeroChip[];
}

/**
 * design-source `guidelines/component-specs.md` §B4. Lives in the navy sky,
 * never gets a fill of its own — "that was the old flat-blue-rectangle
 * pattern and is banned". The screen below it should visually straddle the
 * horizon (~40px overlap); the layout that hosts this (`ParentPrimaryScreenLayout`)
 * already places content just under the sky's fixed height, close enough
 * to that cue without a bespoke offset per screen.
 */
export function SectionHero({
  icon,
  eyebrow,
  title,
  subtitle,
  chips = [],
}: SectionHeroProps) {
  return (
    <View style={styles.wrap}>
      {icon ? (
        <IconChip name={icon} tone="dark" size={44} style={styles.icon} />
      ) : null}
      <SignatureText
        variant="eyebrow"
        tone="onDarkMuted"
        style={styles.eyebrow}
      >
        {eyebrow}
      </SignatureText>
      <SignatureText variant="display" tone="onDark">
        {title}
      </SignatureText>
      {subtitle ? (
        <SignatureText
          variant="small"
          tone="onDarkMuted"
          style={styles.subtitle}
        >
          {subtitle}
        </SignatureText>
      ) : null}
      {chips.length > 0 ? (
        <View style={styles.chipRow}>
          {chips.slice(0, 3).map((chip) => (
            <View key={chip.label} style={styles.chip}>
              <SignatureText style={styles.chipValue}>
                {chip.value}
              </SignatureText>
              <SignatureText style={styles.chipLabel}>
                {chip.label}
              </SignatureText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: 8,
  },
  icon: {
    marginBottom: 14,
  },
  eyebrow: {
    marginBottom: 4,
  },
  subtitle: {
    marginTop: 6,
    maxWidth: 300,
  },
  chipRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: 14,
  },
  chip: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipValue: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: "#FFFFFF",
  },
  chipLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.66,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.72)",
    marginTop: 2,
  },
});
