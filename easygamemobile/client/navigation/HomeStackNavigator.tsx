import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerHomeDashboardScreen from "@/screens/TrainerHomeDashboardScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type HomeStackParamList = {
  Home: undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

/**
 * `Home` e `Notifications` disegnano il proprio guscio con
 * `SecondaryScreenLayout` (Floodlight + AppBar del design system, WP10):
 * `headerShown: false` qui evita un secondo header sopra il loro.
 */
export default function HomeStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Home"
        component={TrainerHomeDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
