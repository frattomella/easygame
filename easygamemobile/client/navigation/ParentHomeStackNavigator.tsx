import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentHomeScreen from "@/screens/ParentHomeScreen";
import ParentAthleteProfileScreen from "@/screens/ParentAthleteProfileScreen";
import ParentDocumentsScreen from "@/screens/ParentDocumentsScreen";
import ParentConsentsScreen from "@/screens/ParentConsentsScreen";
import ParentEnrollmentScreen from "@/screens/ParentEnrollmentScreen";
import ParentAppointmentsScreen from "@/screens/ParentAppointmentsScreen";
import ParentStructuresScreen from "@/screens/ParentStructuresScreen";
import ParentContactsScreen from "@/screens/ParentContactsScreen";
import ParentBoardScreen from "@/screens/ParentBoardScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentHomeStackParamList = {
  ParentHome: undefined;
  ParentAthleteProfile: undefined;
  ParentDocuments: undefined;
  ParentConsents: undefined;
  ParentEnrollment: undefined;
  ParentAppointments: undefined;
  ParentStructures: undefined;
  ParentContacts: undefined;
  ParentBoard: { initialSection?: "board" | "notifications" } | undefined;
};

const Stack = createNativeStackNavigator<ParentHomeStackParamList>();

/**
 * WP9 aggiunge la scheda atleta (`ParentAthleteProfileScreen`), reale sin
 * dal primo commit — l'unica sezione Web senza equivalente mobile fino a
 * quel WP.
 *
 * Le sezioni secondarie (Documenti, Consensi, Iscrizione, Appuntamenti,
 * Strutture, Contatti, Bacheca/Notifiche) sono registrate **anche** qui,
 * oltre che nello stack Servizi — come le sezioni Trainer nello stack Home:
 * il prototipo v3 le apre dalle scorciatoie della Home con "‹ Indietro" che
 * torna alla Home (`nav.back → pHome`) e senza Dock. Stessi componenti,
 * nessuna copia.
 */
export default function ParentHomeStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentHome" component={ParentHomeScreen} />
      <Stack.Screen
        name="ParentAthleteProfile"
        component={ParentAthleteProfileScreen}
      />
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
