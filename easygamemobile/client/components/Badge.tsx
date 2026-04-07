import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Colors } from "@/constants/theme";

type BadgeVariant = "default" | "primary" | "success" | "warning" | "destructive";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  small?: boolean;
}

export function Badge({ label, variant = "default", style, small }: BadgeProps) {
  const { theme, isDark } = useTheme();

  const getColors = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: isDark ? "rgba(59, 130, 246, 0.2)" : "rgba(37, 99, 235, 0.1)",
          textColor: theme.primary,
        };
      case "success":
        return {
          backgroundColor: isDark ? "rgba(34, 197, 94, 0.2)" : "rgba(34, 197, 94, 0.1)",
          textColor: Colors.light.success,
        };
      case "warning":
        return {
          backgroundColor: isDark ? "rgba(245, 158, 11, 0.2)" : "rgba(245, 158, 11, 0.1)",
          textColor: Colors.light.warning,
        };
      case "destructive":
        return {
          backgroundColor: isDark ? "rgba(239, 68, 68, 0.2)" : "rgba(239, 68, 68, 0.1)",
          textColor: Colors.light.destructive,
        };
      default:
        return {
          backgroundColor: theme.backgroundSecondary,
          textColor: theme.textSecondary,
        };
    }
  };

  const colors = getColors();

  return (
    <View
      style={[
        styles.badge,
        small ? styles.small : null,
        { backgroundColor: colors.backgroundColor },
        style,
      ]}
    >
      <ThemedText
        type={small ? "caption" : "small"}
        style={[styles.label, { color: colors.textColor }]}
      >
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    alignSelf: "flex-start",
  },
  small: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  label: {
    fontWeight: "500",
  },
});
