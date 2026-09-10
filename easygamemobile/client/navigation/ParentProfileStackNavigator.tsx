import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentProfileScreen from "@/screens/ParentProfileScreen";
import ParentChildrenScreen from "@/screens/ParentChildrenScreen";
import ParentMoreScreen from "@/screens/ParentMoreScreen";
import ParentComingSoonScreen from "@/screens/ParentComingSoonScreen";
import ParentAppointmentsScreen from "@/screens/ParentAppointmentsScreen";
import ParentStructuresScreen from "@/screens/ParentStructuresScreen";
import ParentContactsScreen from "@/screens/ParentContactsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentProfileStackParamList = {
  ParentProfile: undefined;
  ParentChildren: undefined;
  ParentMore: undefined;
  ParentComingSoon: { title: string; message?: string };
  ParentAppointments: undefined;
  ParentStructures: undefined;
  ParentContacts: undefined;
};

const Stack = createNativeStackNavigator<ParentProfileStackParamList>();

/**
 * L'hub Profilo (`ParentMore`, "Altre sezioni") e il segnaposto condiviso
 * `ParentComingSoon` (WP6) per le sezioni ancora fuori perimetro.
 * Appuntamenti/Prenotazioni strutture/Contatti club sono reali dal WP8.
 */
export default function ParentProfileStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentProfile" component={ParentProfileScreen} />
      <Stack.Screen name="ParentChildren" component={ParentChildrenScreen} />
      <Stack.Screen name="ParentMore" component={ParentMoreScreen} />
      <Stack.Screen
        name="ParentComingSoon"
        component={ParentComingSoonScreen}
      />
      <Stack.Screen
        name="ParentAppointments"
        component={ParentAppointmentsScreen}
      />
      <Stack.Screen
        name="ParentStructures"
        component={ParentStructuresScreen}
      />
      <Stack.Screen name="ParentContacts" component={ParentContactsScreen} />
    </Stack.Navigator>
  );
}
