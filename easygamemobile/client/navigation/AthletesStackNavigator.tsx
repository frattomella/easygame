import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerAthletesScreen from "@/screens/TrainerAthletesScreen";
import TrainerAthleteProfileScreen from "@/screens/TrainerAthleteProfileScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type AthletesStackParamList = {
  Athletes: undefined;
  AthleteProfile: { athleteId: string };
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<AthletesStackParamList>();

/**
 * Tutte e tre le schermate disegnano il proprio guscio con
 * `SecondaryScreenLayout` (Floodlight + AppBar del design system, WP10):
 * `headerShown: false` qui evita un secondo header sopra il loro.
 */
export default function AthletesStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Athletes"
        component={TrainerAthletesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AthleteProfile"
        component={TrainerAthleteProfileScreen}
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
