import React, { ReactNode } from "react";
import { StyleSheet, Pressable, ViewStyle, StyleProp, ActivityIndicator } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Colors } from "@/constants/theme";

type ButtonVariant = "primary" | "secondary" | "outline" | "destructive" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
  energyThreshold: 0.001,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  onPress,
  children,
  style,
  disabled = false,
  loading = false,
  variant = "primary",
  size = "md",
  fullWidth = false,
}: ButtonProps) {
  const { theme, isDark } = useTheme();
  const scale = useSharedValue(1);

  const getBackgroundColor = () => {
    if (disabled) return theme.backgroundSecondary;
    switch (variant) {
      case "primary":
        return theme.primary;
      case "secondary":
        return theme.backgroundSecondary;
      case "outline":
        return "transparent";
      case "destructive":
        return Colors.light.destructive;
      case "ghost":
        return "transparent";
      default:
        return theme.primary;
    }
  };

  const getTextColor = () => {
    if (disabled) return theme.textSecondary;
    switch (variant) {
      case "primary":
        return "#FFFFFF";
      case "secondary":
        return theme.text;
      case "outline":
        return theme.primary;
      case "destructive":
        return "#FFFFFF";
      case "ghost":
        return theme.primary;
      default:
        return "#FFFFFF";
    }
  };

  const getBorderColor = () => {
    if (variant === "outline") return theme.primary;
    return "transparent";
  };

  const getHeight = () => {
    switch (size) {
      case "sm":
        return 36;
      case "md":
        return 48;
      case "lg":
        return 56;
      default:
        return 48;
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(0.97, springConfig);
    }
  };

  const handlePressOut = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(1, springConfig);
    }
  };

  const handlePress = () => {
    if (!disabled && !loading && onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          height: getHeight(),
          borderWidth: variant === "outline" ? 1.5 : 0,
        },
        fullWidth ? styles.fullWidth : null,
        style,
        animatedStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <ThemedText
          type={size === "sm" ? "small" : "body"}
          style={[styles.buttonText, { color: getTextColor() }]}
        >
          {children}
        </ThemedText>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["2xl"],
  },
  fullWidth: {
    width: "100%",
  },
  buttonText: {
    fontWeight: "600",
  },
});
