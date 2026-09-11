import React from "react";
import { Pressable, StyleProp, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GradientFill } from "@/components/signature/GradientFill";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";
import { Spacing } from "@/constants/theme";

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
 * `components/brand/AppBar.jsx`): a labelled back pill (left, own line, when
 * `onBack` is given), eyebrow + display title, glass chips on the right.
 * Transparent — `Floodlight` behind it provides the surface. Include
 * `useSafeAreaInsets().top` in the parent's padding; this component only
 * lays out its own content, it does not add safe-area padding itself so it
 * composes with whatever scroll container hosts it.
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
    <View style={[{ paddingHorizontal: Spacing.xl }, style]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={8}
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            gap: 4,
            marginBottom: Spacing.sm,
          }}
        >
          <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
          <SignatureText
            style={{ color: "#FFFFFF", fontSize: 15, fontWeight: "600" }}
          >
            {backLabel}
          </SignatureText>
        </Pressable>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: Spacing.xl,
          minHeight: 44,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {eyebrow ? (
            <SignatureText
              variant="eyebrow"
              tone="onDarkMuted"
              style={{ marginBottom: 4 }}
            >
              {eyebrow}
            </SignatureText>
          ) : null}
          <SignatureText variant="display" tone="onDark" numberOfLines={1}>
            {title}
          </SignatureText>
        </View>
        <View
          style={{
            flexDirection: "row",
            gap: Spacing.sm,
            alignItems: "center",
          }}
        >
          {right}
          {onNotifications ? (
            <Pressable
              onPress={onNotifications}
              style={{ position: "relative" }}
            >
              <IconChip name="notifications-outline" tone="dark" size={40} />
              {notificationCount > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    minWidth: 18,
                    height: 18,
                    borderRadius: 999,
                    paddingHorizontal: 5,
                    borderWidth: 1.5,
                    borderColor: "rgba(255,255,255,0.7)",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <GradientFill
                    gradient="match"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                    }}
                  />
                  <SignatureText
                    style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}
                  >
                    {notificationCount}
                  </SignatureText>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
