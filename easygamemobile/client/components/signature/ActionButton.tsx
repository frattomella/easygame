import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import {
  EGActionOnSky,
  EGCorner,
  EGGlass,
  EGGradients,
} from "@/constants/theme";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";

export type ActionButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "success"
  | "onDark";
type ActionButtonSize = "sm" | "md" | "lg";

interface ActionButtonProps {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
  /**
   * v3.0: the action gradient is **banned** on a blue ground. On any sky
   * (auth/account/blocking screens, or a `primary`/`secondary` button
   * placed directly on `Floodlight`'s sky zone — never on glass or mist),
   * `primary` renders white fill / navy ink and `secondary` renders a
   * white-outlined ghost instead of their usual treatment.
   */
  onSky?: boolean;
  style?: StyleProp<ViewStyle>;
}

const HEIGHTS: Record<ActionButtonSize, number> = { sm: 40, md: 52, lg: 60 };
const GRADIENT_VARIANTS: Partial<
  Record<ActionButtonVariant, keyof typeof EGGradients>
> = {
  primary: "action",
  destructive: "destructive",
  success: "success",
};

/**
 * The EasyGame Action Surface (design-source `components/core/Button.jsx`):
 * gradient fill, rim border, inner highlight, glow, optional trailing-icon
 * chip. Sibling to `client/components/Button.tsx` — existing screens keep
 * using `Button`; this is for the new visual identity. One `primary` per
 * screen/sheet, `destructive` only for irreversible actions.
 */
export function ActionButton({
  children,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  trailingIcon,
  onSky = false,
  style,
}: ActionButtonProps) {
  const [pressed, setPressed] = useState(false);
  const inert = disabled || loading;
  const height = HEIGHTS[size];
  const small = size === "sm";
  // The action gradient never appears on the sky — see `onSky` above.
  const gradient = !disabled && !onSky ? GRADIENT_VARIANTS[variant] : undefined;

  const look = (() => {
    if (disabled) {
      return {
        bg: "rgba(11,26,58,0.06)",
        fg: "rgba(11,26,58,0.42)",
        border: EGGlass.hairline,
      };
    }
    if (onSky) {
      if (variant === "primary") {
        return {
          bg: EGActionOnSky.bg,
          fg: EGActionOnSky.ink,
          border: "transparent",
        };
      }
      if (variant === "secondary" || variant === "outline") {
        return {
          bg: EGActionOnSky.ghostBg,
          fg: "#FFFFFF",
          border: EGActionOnSky.ghostBorder,
        };
      }
      // destructive/success/ghost/onDark keep their usual on-sky-safe look
      // (already white-on-transparent or white-on-tint); only the two
      // gradient-bearing action variants needed a surface-aware swap.
    }
    switch (variant) {
      case "secondary":
        return { bg: EGGlass.bgStrong, fg: "#0B1A3A", border: EGGlass.border };
      case "outline":
        return {
          bg: "rgba(255,255,255,0.35)",
          fg: "#2563EB",
          border: "rgba(37,99,235,0.45)",
        };
      case "ghost":
        return { bg: "transparent", fg: "#2563EB", border: "transparent" };
      case "onDark":
        return {
          bg: "rgba(255,255,255,0.12)",
          fg: "#FFFFFF",
          border: "rgba(255,255,255,0.22)",
        };
      default:
        return {
          bg: "transparent",
          fg: "#FFFFFF",
          border: "rgba(255,255,255,0.28)",
        };
    }
  })();

  const handlePress = () => {
    if (inert || !onPress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      disabled={inert}
      onPress={handlePress}
      onPressIn={() => !inert && setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        {
          height,
          ...(small ? EGCorner.chip : EGCorner.control),
          paddingHorizontal: small ? 14 : 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          borderWidth: variant === "outline" ? 1.5 : 1,
          borderColor: look.border,
          backgroundColor: gradient ? undefined : look.bg,
          overflow: "hidden",
          width: fullWidth ? "100%" : undefined,
          transform: [
            { scale: pressed ? 0.97 : 1 },
            { translateY: pressed ? 1 : 0 },
          ],
        },
        style,
      ]}
    >
      {gradient ? (
        <GradientFill
          gradient={gradient}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}
      {icon ? (
        <Ionicons name={icon} size={small ? 16 : 18} color={look.fg} />
      ) : null}
      {loading ? (
        <ActivityIndicator color={look.fg} size="small" />
      ) : (
        <SignatureText
          style={{
            color: look.fg,
            fontSize: small ? 13 : 15,
            fontWeight: "700",
            letterSpacing: 0.15,
            flex: fullWidth && !trailingIcon ? 1 : undefined,
            textAlign: fullWidth && trailingIcon ? "left" : "center",
          }}
        >
          {children}
        </SignatureText>
      )}
      {trailingIcon ? (
        <View
          style={{
            width: small ? 24 : 30,
            height: small ? 24 : 30,
            borderRadius: EGCorner.chip.borderTopLeftRadius,
            backgroundColor:
              variant === "primary" ||
              variant === "destructive" ||
              variant === "success"
                ? "rgba(255,255,255,0.18)"
                : "rgba(37,99,235,0.1)",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: fullWidth ? "auto" : undefined,
          }}
        >
          <Ionicons
            name={trailingIcon}
            size={small ? 14 : 16}
            color={look.fg}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
