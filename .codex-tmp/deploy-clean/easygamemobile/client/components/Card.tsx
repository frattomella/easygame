import React from "react";
import {
  StyleProp,
  StyleSheet,
  Pressable,
  ViewStyle,
  View,
  Platform,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius, Shadows } from "@/constants/theme";

interface CardProps {
  elevation?: number;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  leftBorderColor?: string;
  noPadding?: boolean;
}

const springConfig: WithSpringConfig = {
  damping: 15,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
  energyThreshold: 0.001,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({
  elevation = 1,
  title,
  description,
  children,
  onPress,
  style,
  leftBorderColor,
  noPadding,
}: CardProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (onPress) {
      scale.value = withSpring(0.98, springConfig);
    }
  };

  const handlePressOut = () => {
    if (onPress) {
      scale.value = withSpring(1, springConfig);
    }
  };

  const content = (
    <>
      {title ? (
        <ThemedText type="h4" style={styles.cardTitle}>
          {title}
        </ThemedText>
      ) : null}
      {description ? (
        <ThemedText
          type="small"
          style={[styles.cardDescription, { color: theme.textSecondary }]}
        >
          {description}
        </ThemedText>
      ) : null}
      {children}
    </>
  );

  const shadowStyle = Shadows?.card || {};

  const cardStyles = [
    styles.card,
    {
      backgroundColor: theme.backgroundDefault,
      borderLeftWidth: leftBorderColor ? 4 : 0,
      borderLeftColor: leftBorderColor,
    },
    noPadding ? styles.noPadding : null,
    shadowStyle,
    animatedStyle,
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={cardStyles}
      >
        {content}
      </AnimatedPressable>
    );
  }

  return <Animated.View style={cardStyles}>{content}</Animated.View>;
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  noPadding: {
    padding: 0,
  },
  cardTitle: {
    marginBottom: Spacing.xs,
  },
  cardDescription: {
    marginBottom: Spacing.sm,
  },
});
