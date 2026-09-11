import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import TrainerHomeDashboardScreen from "@/screens/TrainerHomeDashboardScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import TrainerMoreScreen from "@/screens/TrainerMoreScreen";
import TrainerBoardScreen from "@/screens/TrainerBoardScreen";
import TrainerDocumentsScreen from "@/screens/TrainerDocumentsScreen";
import TrainerAppointmentsScreen from "@/screens/TrainerAppointmentsScreen";
import TrainerCompensationScreen from "@/screens/TrainerCompensationScreen";
import TrainerCategoriesScreen from "@/screens/TrainerCategoriesScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type HomeStackParamList = {
  Home: undefined;
  Notifications: undefined;
  More: undefined;
  Board: undefined;
  Documents: undefined;
  Appointments: undefined;
  Compensation: undefined;
  Categories: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

/**
 * Ogni schermata disegna il proprio guscio con `SecondaryScreenLayout`
 * (Floodlight + AppBar del design system): `headerShown: false` qui evita
 * un secondo header sopra il loro.
 *
 * Le sezioni secondarie (Bacheca, Documenti, Appuntamenti, Compensi,
 * Squadre, hub Servizi) sono registrate **anche** qui, oltre che nello
 * stack Profilo: il design v3 (`IA e Home` §1a, "Home as hub") le apre
 * dalle scorciatoie della Home con "‹ Indietro" che torna alla Home —
 * "Secondary pages are one tap from Home and two from anywhere else". Sono
 * gli stessi componenti, nessuna copia.
 */
export default function HomeStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="Home" component={TrainerHomeDashboardScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="More" component={TrainerMoreScreen} />
      <Stack.Screen name="Board" component={TrainerBoardScreen} />
      <Stack.Screen name="Documents" component={TrainerDocumentsScreen} />
      <Stack.Screen name="Appointments" component={TrainerAppointmentsScreen} />
      <Stack.Screen name="Compensation" component={TrainerCompensationScreen} />
      <Stack.Screen name="Categories" component={TrainerCategoriesScreen} />
    </Stack.Navigator>
  );
}
