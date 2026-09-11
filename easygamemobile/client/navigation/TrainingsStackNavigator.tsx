import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerTrainingsDashboardScreen from "@/screens/TrainerTrainingsDashboardScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type TrainingsStackParamList = {
  /** `openAttendance`: la Home ("Registra presenze") apre direttamente il foglio presenze dell'allenamento messo a fuoco. */
  Trainings: { focusTrainingId?: string; openAttendance?: boolean } | undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<TrainingsStackParamList>();

/**
 * `Trainings` e `Notifications` disegnano il proprio guscio con
 * `SecondaryScreenLayout` (Floodlight + AppBar del design system, WP10):
 * `headerShown: false` qui evita un secondo header sopra il loro.
 */
export default function TrainingsStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Trainings"
        component={TrainerTrainingsDashboardScreen}
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
