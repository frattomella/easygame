import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
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
 * explicit control inside `children` — never on an outcome. Drag-to-dismiss
 * on the grabber is not implemented (declared gap, §A4: "no gesture library
 * adopted"); the grabber is a visual affordance only.
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
          <View style={styles.grabber} accessibilityElementsHidden />
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
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(11,26,58,0.18)",
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    maxHeight: Dimensions.get("window").height * 0.75,
  },
});
