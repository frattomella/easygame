import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

import { EGCorner, EGGlass, EGShadow } from "@/constants/theme";

export type GlassTone = "light" | "dark" | "solid";

interface GlassSurfaceProps {
  tone?: GlassTone;
  elevated?: boolean;
  corner?: keyof typeof EGCorner;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The base frosted-glass surface every signature panel builds on
 * (design-source `components/core/Card.jsx`). React Native has no
 * `backdrop-filter`: the blur comes from `expo-blur`'s `BlurView` behind a
 * tinted overlay, which is the closest native equivalent to
 * `background: rgba(...); backdrop-filter: blur(18px)`.
 *
 * Not a `Card` replacement — existing screens keep the flat `Card` from
 * `client/components/Card.tsx` unchanged. This is the primitive for the new
 * visual identity; `GlassCard` builds the card-shaped consumer of it.
 */
export function GlassSurface({
  tone = "light",
  elevated = false,
  corner = "card",
  children,
  style,
}: GlassSurfaceProps) {
  const cornerStyle = EGCorner[corner];
  const dark = tone === "dark";
  const solid = tone === "solid";

  return (
    <View
      style={[
        styles.container,
        cornerStyle,
        {
          borderWidth: 1,
          borderColor: dark ? EGGlass.darkBorder : EGGlass.border,
        },
        elevated ? EGShadow.glassRaised : EGShadow.glass,
        style,
      ]}
    >
      {!solid ? (
        <BlurView
          intensity={EGGlass.blurIntensity}
          tint={dark ? "dark" : "light"}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: solid
              ? "#FFFFFF"
              : dark
                ? EGGlass.darkBg
                : EGGlass.bg,
          },
        ]}
      />
      {/* Inner top highlight: a 1px hairline standing in for `inset 0 1px 0`. */}
      <View
        pointerEvents="none"
        style={[
          styles.highlight,
          {
            backgroundColor: dark
              ? EGGlass.highlightTopDark
              : EGGlass.highlightTop,
          },
        ]}
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  highlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  content: {
    position: "relative",
  },
});
