import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";

import { EGCorner, EGGlass } from "@/constants/theme";

type IconChipTone = "tint" | "glass" | "dark";

interface IconChipProps {
  name: keyof typeof Ionicons.glyphMap;
  color?: string;
  size?: number;
  tone?: IconChipTone;
  style?: StyleProp<ViewStyle>;
}

const withAlpha = (hex: string, alphaHex: string) => {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  return `#${clean}${alphaHex}`;
};

/**
 * Every icon that is not inline metadata sits on a tinted tile (design-source
 * `components/core/IconChip.jsx`) instead of appearing bare.
 */
export function IconChip({
  name,
  color = "#2563EB",
  size = 32,
  tone = "tint",
  style,
}: IconChipProps) {
  const dark = tone === "dark";
  const glass = tone === "glass";
  const background = dark
    ? "rgba(255,255,255,0.12)"
    : glass
      ? "rgba(255,255,255,0.55)"
      : withAlpha(color, "1f");
  const borderColor = dark
    ? "rgba(255,255,255,0.22)"
    : glass
      ? EGGlass.border
      : withAlpha(color, "40");
  const foreground = dark ? "#FFFFFF" : color;
  const corner = size >= 40 ? EGCorner.control : EGCorner.chip;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderWidth: 1,
          borderColor,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
        corner,
        style,
      ]}
    >
      {glass || dark ? (
        <BlurView
          intensity={EGGlass.blurIntensity}
          tint={dark ? "dark" : "light"}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: background,
        }}
      />
      <Ionicons name={name} size={Math.round(size * 0.55)} color={foreground} />
    </View>
  );
}
