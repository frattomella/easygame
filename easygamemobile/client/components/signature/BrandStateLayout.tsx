import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Mask,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { EGPage, Spacing } from "@/constants/theme";
import { GradientFill } from "@/components/signature/GradientFill";
import { BrandMark, Wordmark } from "@/components/signature/BrandMark";
import { SignatureText } from "@/components/signature/SignatureText";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

interface BrandStateLayoutProps {
  children: React.ReactNode;
  scrollable?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * Il passo della schermata, in maiuscoletto tracciato a destra della
   * scritta (design 5a: "1 di 3", "Nuovo account", "Recupero", "Accessi").
   */
  step?: string;
  /** `false` nasconde la riga marchio+scritta (stato di bootstrap). */
  brandRow?: boolean;
  /** Centra verticalmente il contenuto quando entra nello schermo (auth, stati bloccanti). */
  centered?: boolean;
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
 * The full-page blue ground for auth, account and blocking system screens
 * (design `IA e Home` §5a/5b, prototipo `auth`): `--eg-grad-page` edge to
 * edge — **no horizon, no mist band** — with the two floodlight pools, the
 * pitch lines, one court arc off the lower-right corner, a baseline rule +
 * tick, and the "e" mark as a 5% watermark bleeding off the corner (the
 * real asset, never boxed). A brand row on top: mark 24 + wordmark 16 on
 * the left, the screen step on the right.
 */
export function BrandStateLayout({
  children,
  scrollable = true,
  contentContainerStyle,
  step,
  brandRow = true,
  centered = true,
  footer,
  style,
}: BrandStateLayoutProps) {
  const insets = useSafeAreaInsets();

  const body = (
    <>
      {brandRow ? (
        <View style={styles.brandRow}>
          <BrandMark size={24} />
          <Wordmark height={16} opacity={0.95} />
          <View style={{ flex: 1 }} />
          {step ? (
            <SignatureText style={styles.step} numberOfLines={1}>
              {step}
            </SignatureText>
          ) : null}
        </View>
      ) : null}
      <View
        style={[
          styles.contentBlock,
          centered ? styles.contentCentered : null,
          contentContainerStyle,
        ]}
      >
        {children}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  return (
    <View style={[styles.root, style]}>
      <GradientFill
        gradient="page"
        angle={180}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <GroundMotif />
        <BrandMark
          size={430}
          opacity={EGPage.watermarkOpacity}
          style={styles.watermark}
        />
      </View>
      {scrollable ? (
        <KeyboardAwareScrollViewCompat
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom + Spacing.xl,
          }}
        >
          {body}
        </KeyboardAwareScrollViewCompat>
      ) : (
        <View
          style={[
            styles.content,
            {
              paddingTop: insets.top + 14,
              paddingBottom: insets.bottom + Spacing.xl,
            },
          ]}
        >
          {body}
        </View>
      )}
    </View>
  );
}

/**
 * Floodlight pools, pitch lines, one court arc (470px, off the lower-right
 * corner) and the baseline rule with its 22px tick at the left inset — the
 * `--eg-court-arc` / `--eg-baseline-*` tokens of design §5.
 */
let groundMotifCounter = 0;

function GroundMotif() {
  // Id SVG unici per istanza: su web sono globali e le schermate di accesso
  // impilate (Login → Registrazione) si rubavano a vicenda i gradienti.
  const uid = React.useMemo(() => `${(groundMotifCounter += 1)}`, []);
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFillObject}>
      <Defs>
        <RadialGradient
          id={`eg-page-flood-a-${uid}`}
          cx="12%"
          cy="-10%"
          r="75%"
        >
          <Stop offset="0%" stopColor="#60A5FA" stopOpacity={0.5} />
          <Stop offset="70%" stopColor="#60A5FA" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`eg-page-flood-b-${uid}`} cx="95%" cy="8%" r="55%">
          <Stop offset="0%" stopColor="#5350E5" stopOpacity={0.45} />
          <Stop offset="70%" stopColor="#5350E5" stopOpacity={0} />
        </RadialGradient>
        <Pattern
          id={`eg-page-lines-${uid}`}
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
            strokeOpacity={0.06}
            strokeWidth={1}
          />
        </Pattern>
        <LinearGradient id={`eg-page-fade-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.15} />
        </LinearGradient>
        <Mask id={`eg-page-mask-${uid}`}>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#eg-page-fade-${uid})`}
          />
        </Mask>
      </Defs>
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#eg-page-flood-a-${uid})`}
      />
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#eg-page-flood-b-${uid})`}
      />
      <Rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill={`url(#eg-page-lines-${uid})`}
        mask={`url(#eg-page-mask-${uid})`}
      />
      {/* Court arc: 470px circle, centre 75px right of the right edge and 265px above the bottom. */}
      <Circle
        cx="100%"
        cy="100%"
        r={235}
        transform="translate(75, -265)"
        stroke={EGPage.courtArc}
        strokeWidth={1}
        fill="none"
      />
      <Line
        x1="0"
        y1="66%"
        x2="100%"
        y2="66%"
        stroke={EGPage.baselineRule}
        strokeWidth={1}
      />
      <Rect
        x={23.5}
        y="66%"
        width={1}
        height={22}
        transform="translate(0, -22)"
        fill={EGPage.baselineTick}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  content: {
    flex: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
    paddingHorizontal: 24,
  },
  step: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  contentBlock: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 12,
    gap: 12,
  },
  contentCentered: {
    justifyContent: "center",
  },
  watermark: {
    position: "absolute",
    right: -110,
    bottom: -70,
  },
  footer: {
    paddingTop: Spacing.xl,
    paddingHorizontal: 24,
    gap: 3,
  },
});
