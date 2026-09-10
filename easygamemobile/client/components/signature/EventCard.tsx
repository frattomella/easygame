import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGlass, EGInk, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";
import {
  StatusPill,
  StatusPillVariant,
} from "@/components/signature/StatusPill";

export interface EventCardMeta {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}

interface EventCardProps {
  kind: "training" | "match";
  title: string;
  dateLabel?: string;
  time: string;
  endTime?: string;
  meta?: EventCardMeta[];
  statusLabel?: string;
  statusColor?: string;
  pill?: { label: string; variant: StatusPillVariant };
  cancelled?: boolean;
  onPress?: () => void;
  footer?: React.ReactNode;
}

/**
 * design-source `guidelines/component-specs.md` §B2. The stripe carries
 * the module identity (`action` gradient for trainings, `match` gradient
 * for matches) — never omitted. Used both as a tappable list row
 * (Calendario) and, with `footer`, as the shell of the event detail screen
 * (where the footer is `RSVPControl`).
 */
export function EventCard({
  kind,
  title,
  dateLabel,
  time,
  endTime,
  meta = [],
  statusLabel,
  statusColor = "#22C55E",
  pill,
  cancelled = false,
  onPress,
  footer,
}: EventCardProps) {
  const [pressed, setPressed] = useState(false);
  const interactive = Boolean(onPress) && !footer;

  const inner = (
    <GlassSurface
      elevated
      style={[
        styles.surface,
        pressed ? styles.pressed : null,
        cancelled ? styles.cancelled : null,
      ]}
    >
      <View style={styles.stripeWrap}>
        <GradientFill
          gradient={
            cancelled ? "neutral" : kind === "match" ? "match" : "action"
          }
          style={styles.stripe}
        />
      </View>
      <View style={styles.row}>
        <View style={styles.rail}>
          {dateLabel ? (
            <SignatureText variant="eyebrow" tone="faint" numberOfLines={1}>
              {dateLabel}
            </SignatureText>
          ) : null}
          <SignatureText
            style={[styles.time, cancelled ? styles.strike : null]}
          >
            {time}
          </SignatureText>
          {endTime ? (
            <SignatureText variant="small" tone="faint">
              {endTime}
            </SignatureText>
          ) : null}
        </View>
        <View style={styles.divider} />
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <SignatureText
              variant="h4"
              tone="ink"
              style={styles.title}
              numberOfLines={2}
            >
              {title}
            </SignatureText>
            {pill ? (
              <StatusPill label={pill.label} variant={pill.variant} small />
            ) : null}
          </View>
          {meta.map((row) => (
            <View key={row.icon + row.label} style={styles.metaRow}>
              <Ionicons name={row.icon} size={15} color={EGInk.onLightFaint} />
              <SignatureText variant="small" tone="muted" style={{ flex: 1 }}>
                {row.label}
              </SignatureText>
            </View>
          ))}
          {statusLabel ? (
            <View style={styles.statusRow}>
              <View
                style={[styles.statusDot, { backgroundColor: statusColor }]}
              />
              <SignatureText
                variant="small"
                style={{ color: statusColor, fontWeight: "600" }}
              >
                {statusLabel}
              </SignatureText>
            </View>
          ) : null}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
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
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: "hidden",
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  cancelled: {
    borderStyle: "dashed",
    opacity: 0.82,
  },
  stripeWrap: {
    position: "absolute",
    top: 0,
    left: 22,
    right: 22,
    height: 3,
  },
  stripe: {
    flex: 1,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  row: {
    flexDirection: "row",
    paddingTop: 6,
  },
  rail: {
    width: 76,
    paddingLeft: Spacing.md,
    paddingVertical: Spacing.md,
    justifyContent: "center",
    gap: 2,
  },
  time: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.66,
    fontVariant: ["tabular-nums"],
    color: EGInk.onLight,
  },
  strike: {
    textDecorationLine: "line-through",
    color: EGInk.onLightFaint,
  },
  divider: {
    width: 1,
    backgroundColor: EGGlass.hairline,
    marginVertical: Spacing.md,
  },
  content: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  footer: {
    marginTop: Spacing.sm,
  },
});
