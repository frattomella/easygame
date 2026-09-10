import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGInk, Spacing } from "@/constants/theme";
import { SignatureText } from "@/components/signature/SignatureText";

interface MetaRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** A metadata line: 15px outline icon + small muted text (design-source `components/patterns/MetaRow.jsx`). */
export function MetaRow({
  icon,
  color = EGInk.onLightFaint,
  children,
  style,
}: MetaRowProps) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.sm,
          marginTop: Spacing.sm,
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={15} color={color} />
      <SignatureText variant="small" tone="muted">
        {children}
      </SignatureText>
    </View>
  );
}
