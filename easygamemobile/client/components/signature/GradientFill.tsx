import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { EGGradients } from "@/constants/theme";

let gradientFillCounter = 0;

interface GradientFillProps {
  /** A key into `EGGradients` (design-source `tokens/signature.css`). */
  gradient: keyof typeof EGGradients;
  /** Degrees, CSS-style (135 = design source's default diagonal). */
  angle?: number;
  style?: StyleProp<ViewStyle>;
}

const pointsForAngle = (angle: number) => {
  const radians = ((angle - 90) * Math.PI) / 180;
  const x = Math.cos(radians) / 2;
  const y = Math.sin(radians) / 2;
  return {
    x1: `${(0.5 - x) * 100}%`,
    y1: `${(0.5 - y) * 100}%`,
    x2: `${(0.5 + x) * 100}%`,
    y2: `${(0.5 + y) * 100}%`,
  };
};

/**
 * Fills its box with one of the controlled gradients from `EGGradients`.
 * `react-native-svg` is already a project dependency — this generalises the
 * pattern `EasyGameGradientBackground.tsx` already used for the brand
 * gradient into something every signature component can share.
 */
export function GradientFill({
  gradient,
  angle = 135,
  style,
}: GradientFillProps) {
  const stops = EGGradients[gradient];
  const id = React.useMemo(
    () => `eg-gradient-${gradient}-${(gradientFillCounter += 1)}`,
    [gradient],
  );
  const { x1, y1, x2, y2 } = pointsForAngle(angle);

  return (
    <View style={[{ overflow: "hidden" }, style]}>
      <Svg
        width="100%"
        height="100%"
        style={{ position: "absolute", top: 0, left: 0, bottom: 0, right: 0 }}
      >
        <Defs>
          <LinearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
            {stops.map((stop) => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={stop.color}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
