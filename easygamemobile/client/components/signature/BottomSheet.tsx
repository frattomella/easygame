import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

import { EGGlass, EGMotion, EGShadow } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { SignatureText } from "@/components/signature/SignatureText";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Formalised in EGDS v2.2 §A4: "an `accessibilityLabel` equal to its title." Default: `title`. */
  accessibilityLabel?: string;
  /** Intestazione del prototipo: eyebrow 11/700 tracciato + titolo 22/600. */
  eyebrow?: string;
  title?: string;
  /**
   * La barra azioni (prototipo `sheetHasActions`): compare **solo** dove
   * serve una conferma vera (presenze, convocazioni, pagamento, moduli).
   * Un foglio di sola scelta non la passa: scegliere e gia l'azione.
   */
  actions?: React.ReactNode;
  /** Nota centrata sotto il contenuto (prototipo `sheetHint`), es. "Tocca fuori o trascina verso il basso per chiudere". */
  hint?: string;
  /** `true` (default): il corpo scorre dentro il foglio, che non supera il 75% dello schermo. */
  scrollable?: boolean;
}

/**
 * design-source `guidelines/component-specs.md` §A4 + prototipo v3
 * (`sheetOpen`): level 4 of the navigation language — "anything that
 * answers a single question and returns". Strong glass, 28px top corners,
 * 36×4 grabber, eyebrow + 22px title, scrolling body, optional action row
 * (secondary "Annulla" 100px beside a full-width primary) and hint line.
 * No screen writes its own modal.
 *
 * Dismissal — three ways, always: scrim tap (the scrim swallows the tap,
 * nothing underneath activates), drag the grabber/header down (>120px or a
 * fast flick), platform back (`onRequestClose`). Motion: 220ms in / 180ms
 * out on `cubic-bezier(.2,.9,.25,1)`, scrim fades on the same curve; the
 * blur is never animated.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  accessibilityLabel,
  eyebrow,
  title,
  actions,
  hint,
  scrollable = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  // Letta dall'hook, non da `Dimensions.get` a caricamento del modulo: su web
  // quel valore puo essere 0 (o quello di prima di un ridimensionamento) e
  // il foglio si ritrovava con `maxHeight: 0` — scrim visibile, pannello no.
  const windowHeight = useWindowDimensions().height;
  const sheetMaxHeight = Math.round(windowHeight * 0.75);
  const translateY = useRef(new Animated.Value(windowHeight || 1000)).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: EGMotion.durationSheetIn,
          easing: sheetEasing,
          useNativeDriver: true,
        }),
        Animated.timing(scrimOpacity, {
          toValue: 1,
          duration: EGMotion.durationSheetIn,
          easing: sheetEasing,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, scrimOpacity]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: windowHeight,
        duration: EGMotion.durationSheetOut,
        easing: sheetEasing,
        useNativeDriver: true,
      }),
      Animated.timing(scrimOpacity, {
        toValue: 0,
        duration: EGMotion.durationSheetOut,
        easing: sheetEasing,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > Math.abs(gesture.dx) && gesture.dy > 4,
        onPanResponderGrant: () => {
          translateY.stopAnimation();
          translateY.extractOffset();
        },
        onPanResponderMove: Animated.event([null, { dy: translateY }], {
          useNativeDriver: true,
        }),
        onPanResponderRelease: (_, gesture) => {
          translateY.flattenOffset();
          const shouldDismiss = gesture.dy > 120 || gesture.vy > 1.2;
          if (shouldDismiss) {
            handleClose();
          } else {
            Animated.timing(translateY, {
              toValue: 0,
              duration: EGMotion.durationSheetOut,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          translateY.flattenOffset();
          Animated.timing(translateY, {
            toValue: 0,
            duration: EGMotion.durationSheetOut,
            useNativeDriver: true,
          }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const header =
    eyebrow || title ? (
      <View style={styles.header} {...dragResponder.panHandlers}>
        {eyebrow ? (
          <SignatureText variant="eyebrow" tone="faint" numberOfLines={1}>
            {eyebrow}
          </SignatureText>
        ) : null}
        {title ? (
          <SignatureText style={styles.title} numberOfLines={2}>
            {title}
          </SignatureText>
        ) : null}
      </View>
    ) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <Animated.View
        style={[styles.scrim, { opacity: scrimOpacity }]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <BlurView intensity={20} style={StyleSheet.absoluteFill} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Chiudi"
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheetWrap,
          { transform: [{ translateY }], maxHeight: sheetMaxHeight },
        ]}
        pointerEvents={visible ? "auto" : "none"}
        accessibilityLabel={accessibilityLabel || title}
      >
        <GlassSurface
          tone="light"
          corner="sheet"
          elevated
          style={[styles.sheet, { maxHeight: sheetMaxHeight }]}
        >
          <View style={[styles.inner, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.dragHandle} {...dragResponder.panHandlers}>
              <View style={styles.grabber} accessibilityElementsHidden />
            </View>
            {header}
            {scrollable ? (
              <ScrollView
                style={styles.body}
                contentContainerStyle={styles.bodyContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.body, styles.bodyContent]}>{children}</View>
            )}
            {actions ? <View style={styles.actions}>{actions}</View> : null}
            {hint ? (
              <SignatureText style={styles.hint}>{hint}</SignatureText>
            ) : null}
          </View>
        </GlassSurface>
      </Animated.View>
    </Modal>
  );
}

const sheetEasing = (t: number) => cubicBezier(0.2, 0.9, 0.25, 1, t);

/** `cubic-bezier(.2,.9,.25,1)` — `--eg-ease-sheet`, evaluated by Newton iteration on the x axis. */
function cubicBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
) {
  const sampleX = (u: number) =>
    3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
  const sampleY = (u: number) =>
    3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  let u = t;
  for (let i = 0; i < 6; i += 1) {
    const x = sampleX(u) - t;
    const dx =
      3 * (1 - u) * (1 - u) * x1 +
      6 * (1 - u) * u * (x2 - x1) +
      3 * u * u * (1 - x2);
    if (Math.abs(x) < 0.0005 || dx === 0) break;
    u -= x / dx;
  }
  return sampleY(Math.min(1, Math.max(0, u)));
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(7,18,43,0.55)",
  },
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    ...EGShadow.glassRaised,
  },
  sheet: {
    borderColor: EGGlass.border,
    borderBottomWidth: 0,
    backgroundColor: EGGlass.bgStrong,
  },
  inner: {
    paddingTop: 8,
    paddingHorizontal: 16,
    flexShrink: 1,
  },
  dragHandle: {
    alignItems: "center",
    justifyContent: "center",
    height: 16,
    marginBottom: 8,
    alignSelf: "center",
    width: 56,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(11,26,58,0.18)",
  },
  header: {
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.44,
    color: "#0B1A3A",
    marginTop: 2,
  },
  body: {
    flexShrink: 1,
  },
  bodyContent: {
    paddingHorizontal: 2,
    gap: 8,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  hint: {
    marginTop: 14,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: "rgba(11,26,58,0.42)",
  },
});

/** Larghezza fissa del secondario "Annulla" nella barra azioni (prototipo: 100px accanto al primario a tutta larghezza). */
export const SHEET_CANCEL_WIDTH = 100;
