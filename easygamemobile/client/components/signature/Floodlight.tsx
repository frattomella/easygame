import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import Svg, {
  Defs,
  Line,
  LinearGradient,
  Mask,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

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
 * v3 parity pass: the faint vertical "pitch lines" texture (CSS
 * `repeating-linear-gradient(90deg, white 7% 0 1px, transparent 1px 28px)`,
 * faded towards the horizon) is now reproduced with an SVG `Pattern` plus a
 * vertical `Mask` — the same three layers as `Floodlight.jsx`: sky ramp,
 * two floodlight pools, pitch lines.
 */
let floodlightCounter = 0;

export function Floodlight({
  skyHeight = 300,
  children,
  style,
}: FloodlightProps) {
  // Su web gli id SVG sono globali al documento e lo stack di navigazione
  // tiene montate le schermate sotto: un `url(#eg-floodlight-fade)` uguale
  // in due Floodlight risolveva sul primo — nascosto — e l'orizzonte della
  // schermata in cima spariva (taglio netto). Un suffisso per istanza.
  const uid = React.useMemo(() => `${(floodlightCounter += 1)}`, []);
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
            {/* v3.0: blue-400 55% (was blue-500 65%) — a lighter, cooler glow. */}
            <RadialGradient
              id={`eg-floodlight-a-${uid}`}
              cx="12%"
              cy="-10%"
              r="75%"
            >
              <Stop offset="0%" stopColor="#60A5FA" stopOpacity={0.55} />
              <Stop offset="70%" stopColor="#60A5FA" stopOpacity={0} />
            </RadialGradient>
            {/* v3.0: indigo-500 50% (was indigo-600 60%). */}
            <RadialGradient
              id={`eg-floodlight-b-${uid}`}
              cx="95%"
              cy="10%"
              r="60%"
            >
              <Stop offset="0%" stopColor="#5350E5" stopOpacity={0.5} />
              <Stop offset="70%" stopColor="#5350E5" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#eg-floodlight-a-${uid})`}
          />
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#eg-floodlight-b-${uid})`}
          />
        </Svg>
        <PitchLines uid={uid} />
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
        {/* v3 horizon (`signature-foundations`): the sky's own lower-edge
            blue (`--eg-blue-600`) fading to transparent over ~120px — a soft
            band, not the v2 navy-at-35% veil that left a visible cut. */}
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient
              id={`eg-floodlight-fade-${uid}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop
                offset="0%"
                stopColor={EGColors.skyRampBlue600}
                stopOpacity={1}
              />
              <Stop
                offset="100%"
                stopColor={EGColors.skyRampBlue600}
                stopOpacity={0}
              />
            </LinearGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#eg-floodlight-fade-${uid})`}
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

/**
 * `--eg-pitch-lines` (v3: white 7%, one 1px line every 28px), masked so the
 * lines fade out over the lower part of the sky exactly like the CSS
 * `mask-image: linear-gradient(180deg, rgba(0,0,0,.9), transparent)`.
 */
function PitchLines({ uid }: { uid: string }) {
  return (
    <Svg
      width="100%"
      height="100%"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <Defs>
        <Pattern
          id={`eg-pitch-lines-${uid}`}
          patternUnits="userSpaceOnUse"
          width={28}
          height={28}
        >
          <Line
            x1={0.5}
            y1={0}
            x2={0.5}
            y2={28}
            stroke="#FFFFFF"
            strokeOpacity={0.07}
            strokeWidth={1}
          />
        </Pattern>
        <LinearGradient id={`eg-pitch-fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
        <Mask id={`eg-pitch-mask-${uid}`}>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#eg-pitch-fade-${uid})`}
          />
        </Mask>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#eg-pitch-lines-${uid})`}
        mask={`url(#eg-pitch-mask-${uid})`}
      />
    </Svg>
  );
}
