import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing } from "@/constants/theme";

interface HeaderNotificationButtonProps {
  onPress: () => void;
}

export function HeaderNotificationButton({
  onPress,
}: HeaderNotificationButtonProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: "rgba(255,255,255,0.16)",
          borderColor: "rgba(255,255,255,0.18)",
        },
      ]}
      hitSlop={12}
    >
      <Ionicons name="notifications-outline" size={18} color="#FFFFFF" />
      <View style={[styles.dot, { backgroundColor: theme.primary }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.xs,
    borderWidth: 1,
  },
  dot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
  },
});
