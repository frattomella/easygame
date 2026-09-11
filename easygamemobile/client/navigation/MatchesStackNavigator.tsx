import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerMatchesDashboardScreen from "@/screens/TrainerMatchesDashboardScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type MatchesStackParamList = {
  /** `openConvocations`: la Home ("Gestisci convocazioni") apre direttamente il foglio convocazioni della gara messa a fuoco. */
  Matches: { focusMatchId?: string; openConvocations?: boolean } | undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<MatchesStackParamList>();

/**
 * `Matches` e `Notifications` disegnano il proprio guscio con
 * `SecondaryScreenLayout` (Floodlight + AppBar del design system, WP10):
 * `headerShown: false` qui evita un secondo header sopra il loro.
 */
export default function MatchesStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Matches"
        component={TrainerMatchesDashboardScreen}
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
