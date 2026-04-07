import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

interface EasyGameGradientBackgroundProps {
  radius?: number;
  style?: StyleProp<ViewStyle>;
  overlayOpacity?: number;
}

export function EasyGameGradientBackground({
  radius = 0,
  style,
  overlayOpacity = 0.08,
}: EasyGameGradientBackgroundProps) {
  return (
    <View
      pointerEvents="none"
      style={[styles.container, { borderRadius: radius }, style]}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="easygame-surface-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#2563EB" />
            <Stop offset="55%" stopColor="#1D4ED8" />
            <Stop offset="100%" stopColor="#1E3A8A" />
          </LinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          rx={radius}
          ry={radius}
          fill="url(#easygame-surface-gradient)"
        />
      </Svg>
      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: `rgba(15,23,42,${overlayOpacity})`,
            borderRadius: radius,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
});
