import React from "react";
import { Platform } from "react-native";
import { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { isLiquidGlassAvailable } from "expo-glass-effect";

import { EasyGameGradientBackground } from "@/components/EasyGameGradientBackground";
import { useTheme } from "@/hooks/useTheme";

interface UseScreenOptionsParams {
  transparent?: boolean;
}

export function useScreenOptions({
  transparent = false,
}: UseScreenOptionsParams = {}): NativeStackNavigationOptions {
  const { theme } = useTheme();

  return {
    headerTitleAlign: "left",
    headerTransparent: false,
    headerTintColor: "#FFFFFF",
    headerShadowVisible: false,
    headerStyle: {
      backgroundColor: Platform.select({
        ios: "transparent",
        android: "transparent",
        web: "transparent",
      }),
    },
    headerBackground: () =>
      React.createElement(EasyGameGradientBackground, {
        overlayOpacity: transparent ? 0.1 : 0.04,
      }),
    gestureEnabled: true,
    gestureDirection: "horizontal",
    fullScreenGestureEnabled: isLiquidGlassAvailable() ? false : true,
    contentStyle: {
      backgroundColor: theme.backgroundRoot,
    },
  };
}
