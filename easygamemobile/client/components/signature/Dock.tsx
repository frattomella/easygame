import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";

import { EGShadow, Spacing } from "@/constants/theme";
import { GradientFill } from "@/components/signature/GradientFill";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { SignatureText } from "@/components/signature/SignatureText";

/**
 * The EasyGame Floating Dock (design-source `components/brand/TabBar.jsx`):
 * a dark-glass pill; the active tab is a raised action-gradient "puck" that
 * shows icon + label, inactive tabs show an outline glyph only.
 *
 * Drop-in replacement for `@react-navigation/bottom-tabs`'s default
 * `tabBar` — pass it as `screenOptions.tabBar` (or `<Tab.Navigator tabBar={...}>`).
 * Reads `options.tabBarIcon`'s Ionicons name from each screen the same way
 * the navigator's own descriptors do, so no change is needed to how
 * `Tab.Screen` declares its icon — only the chrome around it changes.
 */
export function Dock({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.wrap,
        {
          left: Spacing.xl + Spacing.xs,
          right: Spacing.xl + Spacing.xs,
          bottom: insets.bottom + Spacing.lg,
        },
      ]}
    >
      <GlassSurface
        tone="dark"
        corner="pill"
        style={[styles.dock, EGShadow.dock]}
      >
        <View style={styles.row}>
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label =
              typeof options.title === "string" ? options.title : route.name;
            const iconName = resolveBaseIconName(options);

            const onPress = () => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={label}
                onPress={onPress}
                style={[
                  styles.tab,
                  focused ? styles.tabActive : styles.tabInactive,
                ]}
              >
                {focused ? (
                  <GradientFill
                    gradient="action"
                    style={StyleSheet.absoluteFillObject}
                  />
                ) : null}
                <Ionicons
                  name={
                    (focused
                      ? iconName
                      : `${iconName}-outline`) as keyof typeof Ionicons.glyphMap
                  }
                  size={22}
                  color={focused ? "#FFFFFF" : "rgba(255,255,255,0.6)"}
                />
                {focused ? (
                  <SignatureText style={styles.label}>{label}</SignatureText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </GlassSurface>
    </View>
  );
}

/**
 * The navigator declares `tabBarIcon` as a render function returning
 * `<Ionicons name="home" .../>`; the Dock needs the bare name (without
 * `-outline`) to build both states from one source. Rendering the icon off
 * screen and reading its `name` prop keeps the one true source in
 * `MainTabNavigator` instead of a second, parallel name table here that
 * could drift from it.
 */
const resolveBaseIconName = (options: {
  tabBarIcon?: (props: {
    color: string;
    size: number;
    focused: boolean;
  }) => React.ReactNode;
}) => {
  const rendered = options.tabBarIcon?.({
    color: "#fff",
    size: 22,
    focused: true,
  });
  const name =
    rendered && typeof rendered === "object" && "props" in rendered
      ? (rendered as React.ReactElement<{ name?: string }>).props?.name
      : undefined;
  return String(name || "ellipse").replace(/-outline$/, "");
};

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
  },
  dock: {
    height: 68,
    padding: 8,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tab: {
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    overflow: "hidden",
  },
  tabActive: {
    flex: 0,
    minWidth: 44,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  tabInactive: {
    flex: 1,
    minWidth: 44,
  },
  label: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
