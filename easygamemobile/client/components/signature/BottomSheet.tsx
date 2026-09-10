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

import { EGGlass, EGShadow, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Level 4 of the navigation language (`design-source/guidelines/navigation.md`):
 * "Bottom sheet, `28 28 0 0`, glass strong, grabber. Anything that answers a
 * single question and returns." Not itself in `component-specs.md` — the
 * spec assumes the sheet shell exists and describes what goes inside it
 * (`ChildSwitcher`'s expanded state, reschedule forms, …). This is that
 * shell, documented here as the implementation of the navigation doc's
 * Level 4 rather than a duplicate ad-hoc modal per screen.
 *
 * Dismissal: scrim tap or an explicit control inside `children` (the sheet
 * never auto-dismisses on an outcome). Drag-to-dismiss on the grabber is not
 * implemented — no gesture-handler-driven sheet library is a project
 * dependency, and adding one is a bigger decision than one component;
 * documented gap, the grabber is a visual affordance only.
 */
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
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
    >
      <Animated.View
        style={[styles.scrim, { opacity: scrimOpacity }]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheetWrap,
          { transform: [{ translateY }], paddingBottom: insets.bottom },
        ]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <GlassSurface tone="light" corner="sheet" elevated style={styles.sheet}>
          <View style={styles.grabber} />
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
