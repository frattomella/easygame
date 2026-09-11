import React from "react";
import { StyleProp, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGInk, Spacing } from "@/constants/theme";
import { SignatureText } from "@/components/signature/SignatureText";

interface MetaRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  children: React.ReactNode;
  /** Sul vetro scuro (SummaryCard): icona bianca 72%, testo bianco 78%. */
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A metadata line: 15px outline icon + small muted text (design-source `components/patterns/MetaRow.jsx`). */
export function MetaRow({
  icon,
  color,
  children,
  onDark = false,
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
      <Ionicons
        name={icon}
        size={15}
        color={
          color || (onDark ? "rgba(255,255,255,0.72)" : EGInk.onLightFaint)
        }
      />
      <SignatureText
        variant="small"
        tone={onDark ? "onDarkMuted" : "muted"}
        style={{ flex: 1 }}
      >
        {children}
      </SignatureText>
    </View>
  );
}
