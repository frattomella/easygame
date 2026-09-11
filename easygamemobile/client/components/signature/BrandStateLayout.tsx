import React from "react";
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Line } from "react-native-svg";

import { EGPage, Spacing } from "@/constants/theme";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";

interface BrandStateLayoutProps {
  children: React.ReactNode;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * The service block (name · version · status URL · support number) —
   * `migration-v3.md` passo 7: allowed **only** on maintenance, offline,
   * error, support and service-status screens. Every other screen omits
   * this prop and gets no footer.
   */
  footer?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * v3.0 new component (`design-source/CHANGELOG.md` v3.0.0, "Components
 * new"; `migration-v3.md` passo 7). The full-page blue ground for auth,
 * account and blocking system screens: `--eg-grad-page` runs edge to edge —
 * **no horizon, no mist band** (that split is `Floodlight`'s job, for
 * screens with content below the sky; this component never has content
 * below it). Carries the court-arc motif, a baseline rule + tick, and a
 * single un-boxed "e" watermark bleeding off the bottom-right corner —
 * never a boxed gradient tile (CLAUDE.md brand rule).
 *
 * The "e" mark is approximated with the brand wordmark's own initial
 * letter at low opacity rather than a vector asset (none is vendored in
 * this repo) — same glyph, same placement and opacity as the spec, drawn
 * with `SignatureText` instead of an SVG path.
 */
export function BrandStateLayout({
  children,
  scrollable = true,
  contentContainerStyle,
  footer,
  style,
}: BrandStateLayoutProps) {
  const insets = useSafeAreaInsets();
  const Content = scrollable ? ScrollView : View;

  return (
    <View style={[styles.root, style]}>
      <GradientFill
        gradient="page"
        angle={180}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <CourtMotif />
        <SignatureText
          numberOfLines={1}
          style={[styles.watermark, { opacity: EGPage.watermarkOpacity }]}
        >
          e
        </SignatureText>
      </View>
      <Content
        style={styles.content}
        contentContainerStyle={[
          scrollable
            ? {
                flexGrow: 1,
                paddingTop: insets.top + Spacing["2xl"],
                paddingBottom: insets.bottom + Spacing["2xl"],
                paddingHorizontal: Spacing["2xl"],
              }
            : {
                flex: 1,
                paddingTop: insets.top + Spacing["2xl"],
                paddingBottom: insets.bottom + Spacing["2xl"],
                paddingHorizontal: Spacing["2xl"],
              },
          contentContainerStyle,
        ]}
      >
        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Content>
    </View>
  );
}

/** Faint concentric court circles + a baseline rule with a left-inset tick — the spec's `--eg-court-arc`/`--eg-baseline-*` tokens. */
function CourtMotif() {
  return (
    <Svg
      width="100%"
      height="100%"
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
    >
      <Circle
        cx="50%"
        cy="18%"
        r={140}
        stroke={EGPage.courtArc}
        strokeWidth={1}
        fill="none"
      />
      <Circle
        cx="50%"
        cy="18%"
        r={220}
        stroke={EGPage.courtArc}
        strokeWidth={1}
        fill="none"
      />
      <Line
        x1="0"
        y1="62%"
        x2="100%"
        y2="62%"
        stroke={EGPage.baselineRule}
        strokeWidth={1}
      />
      <Line
        x1={Spacing.xl}
        y1="60%"
        x2={Spacing.xl}
        y2="64%"
        stroke={EGPage.baselineTick}
        strokeWidth={2}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  watermark: {
    position: "absolute",
    right: -110,
    bottom: -190,
    fontSize: 460,
    lineHeight: 460,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  footer: {
    marginTop: "auto",
    paddingTop: Spacing["2xl"],
    alignItems: "center",
    gap: 2,
  },
});
