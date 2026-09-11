import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerProfileDashboardScreen from "@/screens/TrainerProfileDashboardScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import TrainerMoreScreen from "@/screens/TrainerMoreScreen";
import TrainerBoardScreen from "@/screens/TrainerBoardScreen";
import TrainerDocumentsScreen from "@/screens/TrainerDocumentsScreen";
import TrainerAppointmentsScreen from "@/screens/TrainerAppointmentsScreen";
import TrainerCompensationScreen from "@/screens/TrainerCompensationScreen";
import TrainerCategoriesScreen from "@/screens/TrainerCategoriesScreen";
import TrainerPersonalDataScreen from "@/screens/TrainerPersonalDataScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ProfileStackParamList = {
  Profile: undefined;
  Notifications: undefined;
  More: undefined;
  Board: undefined;
  Documents: undefined;
  Appointments: undefined;
  Compensation: undefined;
  Categories: undefined;
  PersonalData: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

/**
 * Ogni schermata di questo stack disegna il proprio guscio con
 * `SecondaryScreenLayout` (Floodlight + AppBar del design system, esteso a
 * `Profile`/`Notifications` in WP10): `headerShown: false` qui evita un
 * secondo header sopra il loro.
 */
export default function ProfileStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Profile"
        component={TrainerProfileDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="More"
        component={TrainerMoreScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Board"
        component={TrainerBoardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Documents"
        component={TrainerDocumentsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Appointments"
        component={TrainerAppointmentsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Compensation"
        component={TrainerCompensationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Categories"
        component={TrainerCategoriesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PersonalData"
        component={TrainerPersonalDataScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
