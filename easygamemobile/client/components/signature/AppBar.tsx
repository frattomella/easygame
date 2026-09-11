import React from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GradientFill } from "@/components/signature/GradientFill";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";

interface AppBarProps {
  title: string;
  eyebrow?: string;
  notificationCount?: number;
  onNotifications?: () => void;
  /**
   * v3.0: back moves out of the trailing slot (where it used to sit next to
   * the bell) into a labelled `‹ Indietro` pill on its own line, above the
   * eyebrow/title. The trailing slot then holds only the bell and `right`.
   */
  onBack?: () => void;
  backLabel?: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The screen header living in the navy sky (design-source
 * `components/brand/AppBar.jsx` + prototipo v3 `showBack`): a labelled
 * back pill (left, own line, when `onBack` is given — 36px, white 12% fill,
 * white 28% rim, `chevron-back` + "Indietro"), eyebrow + display title, the
 * bell alone on the right with ≥20px between title block and trailing
 * actions. Transparent — `Floodlight`/`BrandLine` behind provide the
 * surface. Include `useSafeAreaInsets().top` in the parent's padding.
 */
export function AppBar({
  title,
  eyebrow,
  notificationCount = 0,
  onNotifications,
  onBack,
  backLabel = "Indietro",
  right,
  style,
}: AppBarProps) {
  return (
    <View style={style}>
      {onBack ? (
        <View style={styles.backRow}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={8}
            style={styles.backPill}
          >
            <Ionicons name="chevron-back-outline" size={16} color="#FFFFFF" />
            <SignatureText style={styles.backLabel}>{backLabel}</SignatureText>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.titleRow, { paddingTop: onBack ? 6 : 10 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? (
            <SignatureText
              variant="eyebrow"
              tone="onDarkMuted"
              numberOfLines={1}
              style={{ marginBottom: 4 }}
            >
              {eyebrow}
            </SignatureText>
          ) : null}
          <SignatureText variant="display" tone="onDark" numberOfLines={1}>
            {title}
          </SignatureText>
        </View>
        {right || onNotifications ? (
          <View style={styles.trailing}>
            {right}
            {onNotifications ? (
              <Pressable
                onPress={onNotifications}
                accessibilityRole="button"
                accessibilityLabel={
                  notificationCount > 0
                    ? `Notifiche, ${notificationCount} non lette`
                    : "Notifiche"
                }
                style={{ position: "relative" }}
              >
                <IconChip name="notifications-outline" tone="dark" size={40} />
                {notificationCount > 0 ? (
                  <View style={styles.badge}>
                    <GradientFill
                      gradient="match"
                      style={StyleSheet.absoluteFillObject}
                    />
                    <SignatureText style={styles.badgeLabel}>
                      {notificationCount > 99 ? "99+" : notificationCount}
                    </SignatureText>
                  </View>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  backPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  backLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 20,
    paddingHorizontal: 20,
    minHeight: 54,
  },
  trailing: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    flexShrink: 0,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  badgeLabel: {
    color: "#FFFFFF",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
  },
});
