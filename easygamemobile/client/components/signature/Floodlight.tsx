import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { EGColors } from "@/constants/theme";
import { GradientFill } from "@/components/signature/GradientFill";

interface FloodlightProps {
  skyHeight?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The EasyGame layered ground (design-source `components/brand/Floodlight.jsx`):
 * a navy night sky lit by two floodlight pools, meeting a pale mist ground.
 * This is the fixed background behind every screen built against the new
 * visual identity.
 *
 * Simplification from the CSS source: the faint vertical "pitch lines"
 * texture (a `repeating-linear-gradient`) is not reproduced — it needs a
 * tiled SVG pattern for a detail with very little visual weight at phone
 * size. The navy gradient and the two floodlight glows, which carry the
 * actual visual signature, are reproduced. Documented gap, not an oversight
 * (see the note in `client/constants/theme.ts`).
 */
export function Floodlight({
  skyHeight = 300,
  children,
  style,
}: FloodlightProps) {
  return (
    <View style={[{ flex: 1, backgroundColor: EGColors.mist100 }, style]}>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: skyHeight,
        }}
      >
        <SkyGradientFill />
        <Svg
          width="100%"
          height="100%"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Defs>
            <RadialGradient id="eg-floodlight-a" cx="12%" cy="-10%" r="75%">
              <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.65} />
              <Stop offset="70%" stopColor="#3B82F6" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="eg-floodlight-b" cx="95%" cy="10%" r="60%">
              <Stop offset="0%" stopColor="#3533CD" stopOpacity={0.6} />
              <Stop offset="70%" stopColor="#3533CD" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#eg-floodlight-a)"
          />
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#eg-floodlight-b)"
          />
        </Svg>
      </View>
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: skyHeight - 1,
          height: 120,
        }}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="eg-floodlight-fade" cx="50%" cy="0%" r="70%">
              <Stop
                offset="0%"
                stopColor={EGColors.navy800}
                stopOpacity={0.35}
              />
              <Stop
                offset="100%"
                stopColor={EGColors.navy800}
                stopOpacity={0}
              />
            </RadialGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#eg-floodlight-fade)"
          />
        </Svg>
      </View>
      <View style={{ position: "relative", flex: 1 }}>{children}</View>
    </View>
  );
}

/** The `sky` gradient (`EGGradients.sky`) filling the top zone. */
function SkyGradientFill() {
  return (
    <GradientFill
      gradient="sky"
      angle={180}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    />
  );
}
