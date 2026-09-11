import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

import { EGGlass, EGShadow, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Formalised in EGDS v2.2 §A4: "an `accessibilityLabel` equal to its title." The caller's own eyebrow+title stay visual; this is the spoken equivalent. */
  accessibilityLabel?: string;
}

/**
 * design-source `guidelines/component-specs.md` §A4 — formalised in EGDS
 * v2.2.0 "Sheet & shell" from this same component, built as an extension in
 * WP4 (`docs/knowledge-base/05-mobile-architecture.md`). Level 4 of the
 * navigation language: "Anything that answers a single question and
 * returns." No screen writes its own modal.
 *
 * Dismissal: scrim tap, the platform back gesture (`onRequestClose`), or an
 * explicit control inside `children` — never on an outcome. v3.0
 * (`migration-v3.md` passo 6) adds the third: drag-to-dismiss on the
 * grabber/header strip, built on React Native's own `PanResponder` (no new
 * gesture-library dependency, unlike the WP4 declared gap this replaces) —
 * a downward drag past 120px or a fast downward flick closes the sheet,
 * anything less snaps back to open.
 */
export function BottomSheet({
  visible,
  onClose,
  children,
  accessibilityLabel,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(
    new Animated.Value(Dimensions.get("window").height),
  ).current;
  const scrimOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(scrimOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, scrimOpacity]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: Dimensions.get("window").height,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(scrimOpacity, {
        toValue: 0,
        duration: 180,
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
              duration: 180,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          translateY.flattenOffset();
          Animated.timing(translateY, {
            toValue: 0,
            duration: 180,
            useNativeDriver: true,
          }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
        <BlurView intensity={30} style={StyleSheet.absoluteFill} />
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
          { transform: [{ translateY }], paddingBottom: insets.bottom },
        ]}
        pointerEvents={visible ? "auto" : "none"}
        accessibilityLabel={accessibilityLabel}
      >
        <GlassSurface tone="light" corner="sheet" elevated style={styles.sheet}>
          <View style={styles.dragHandle} {...dragResponder.panHandlers}>
            <View style={styles.grabber} accessibilityElementsHidden />
          </View>
          <View style={styles.content}>{children}</View>
        </GlassSurface>
      </Animated.View>
    </Modal>
  );
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
    backgroundColor: EGGlass.bgStrong,
  },
  dragHandle: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    /** Generous hit area for the drag gesture — the visible grabber stays thin. */
    minHeight: 28,
    justifyContent: "center",
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(11,26,58,0.18)",
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    maxHeight: Dimensions.get("window").height * 0.75,
  },
});
