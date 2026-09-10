import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GlassCard } from "@/components/signature/GlassCard";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  value: string;
  label: string;
  statusColor?: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * design-source `guidelines/component-specs.md` §B5. A fact, never an
 * action — no `onPress`. Two per row, 12px gap, left to the caller
 * (a `flexDirection: row` wrapper in the consuming screen).
 */
export function StatCard({
  icon,
  iconColor = "#2563EB",
  value,
  label,
  statusColor,
  loading = false,
  style,
}: StatCardProps) {
  return (
    <GlassCard noPadding style={[styles.card, style]}>
      <View style={styles.topRow}>
        <IconChip name={icon} color={iconColor} size={34} />
        {statusColor ? (
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
        ) : null}
      </View>
      {loading ? (
        <View style={styles.placeholder} />
      ) : (
        <SignatureText style={styles.value}>{value}</SignatureText>
      )}
      <SignatureText style={styles.label}>{label}</SignatureText>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  value: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.84,
    fontVariant: ["tabular-nums"],
    color: "#0B1A3A",
  },
  placeholder: {
    width: 20,
    height: 28,
    borderRadius: 4,
    backgroundColor: "rgba(11,26,58,0.08)",
  },
  label: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: "rgba(11,26,58,0.42)",
  },
});
