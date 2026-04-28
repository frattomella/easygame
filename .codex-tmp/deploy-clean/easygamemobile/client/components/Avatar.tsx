import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { Image } from "expo-image";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius } from "@/constants/theme";

interface AvatarProps {
  source?: string | null;
  name?: string;
  size?: number;
  style?: ViewStyle;
  showNumber?: boolean;
  number?: number;
}

export function Avatar({
  source,
  name,
  size = 48,
  style,
  showNumber,
  number,
}: AvatarProps) {
  const { theme } = useTheme();

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  if (source) {
    return (
      <View style={[styles.container, containerStyle, style]}>
        <Image
          source={{ uri: source }}
          style={[styles.image, containerStyle]}
          contentFit="cover"
        />
        {showNumber && number !== undefined ? (
          <View
            style={[
              styles.numberBadge,
              { backgroundColor: theme.primary, right: -4, bottom: -4 },
            ]}
          >
            <ThemedText
              style={[styles.numberText, { color: "#FFFFFF", fontSize: 10 }]}
            >
              {number}
            </ThemedText>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        styles.fallback,
        containerStyle,
        { backgroundColor: theme.primary },
        style,
      ]}
    >
      <ThemedText
        style={[
          styles.initials,
          { color: "#FFFFFF", fontSize: size * 0.35 },
        ]}
      >
        {name ? getInitials(name) : showNumber && number !== undefined ? number.toString() : "?"}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    fontWeight: "600",
  },
  numberBadge: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: {
    fontWeight: "700",
  },
});
