import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentServicesScreen from "@/screens/ParentServicesScreen";
import ParentDocumentsScreen from "@/screens/ParentDocumentsScreen";
import ParentConsentsScreen from "@/screens/ParentConsentsScreen";
import ParentEnrollmentScreen from "@/screens/ParentEnrollmentScreen";
import ParentAppointmentsScreen from "@/screens/ParentAppointmentsScreen";
import ParentStructuresScreen from "@/screens/ParentStructuresScreen";
import ParentContactsScreen from "@/screens/ParentContactsScreen";
import ParentBoardScreen from "@/screens/ParentBoardScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentServicesStackParamList = {
  ParentServices: undefined;
  ParentDocuments: undefined;
  ParentConsents: undefined;
  ParentEnrollment: undefined;
  ParentAppointments: undefined;
  ParentStructures: undefined;
  ParentContacts: undefined;
  ParentBoard: { initialSection?: "board" | "notifications" } | undefined;
};

const Stack = createNativeStackNavigator<ParentServicesStackParamList>();

/**
 * v3.0 (`migration-v3.md` passo 8): il tab Servizi, che sostituisce
 * Segreteria (`ParentSegreteriaStackNavigator`, rimosso — Pagamenti e stato
 * promosso a tab proprio) e Bacheca (`ParentBoardStackNavigator`, rimosso).
 * Sette sezioni gia reali, nessuna nuova: Documenti/Consensi/Iscrizione
 * (WP7-8, prima nel tab Segreteria), Appuntamenti/Prenotazioni
 * strutture/Contatti (WP8, prima nel tab Profilo → `ParentMoreScreen`),
 * Bacheca (WP6, prima tab propria). Stesso schermo, stessa logica, stessi
 * dati per ognuna — solo il contenitore cambia (ADR-0168 §4c2).
 */
export default function ParentServicesStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentServices" component={ParentServicesScreen} />
      <Stack.Screen name="ParentDocuments" component={ParentDocumentsScreen} />
      <Stack.Screen name="ParentConsents" component={ParentConsentsScreen} />
      <Stack.Screen
        name="ParentEnrollment"
        component={ParentEnrollmentScreen}
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
      <Stack.Screen name="ParentBoard" component={ParentBoardScreen} />
    </Stack.Navigator>
  );
}
