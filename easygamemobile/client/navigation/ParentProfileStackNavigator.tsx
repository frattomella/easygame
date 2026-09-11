import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentProfileScreen from "@/screens/ParentProfileScreen";
import ParentChildrenScreen from "@/screens/ParentChildrenScreen";
import ParentComingSoonScreen from "@/screens/ParentComingSoonScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentProfileStackParamList = {
  ParentProfile: undefined;
  ParentChildren: undefined;
  ParentComingSoon: { title: string; message?: string };
};

const Stack = createNativeStackNavigator<ParentProfileStackParamList>();

/**
 * v3.0 (`migration-v3.md` passo 8): `ParentMoreScreen` ("Altre sezioni") e
 * rimosso — Appuntamenti/Prenotazioni strutture/Contatti club, che ospitava,
 * sono confluiti nel tab Servizi (`ParentServicesStackNavigator`) insieme a
 * Documenti/Consensi/Iscrizione/Bacheca. Qui resta solo cio che riguarda
 * l'account: identita, multi-figlio, e il segnaposto condiviso
 * `ParentComingSoon` (WP6) per "Impostazioni", l'unica voce del vecchio hub
 * senza una sezione reale dietro.
 */
export default function ParentProfileStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentProfile" component={ParentProfileScreen} />
      <Stack.Screen name="ParentChildren" component={ParentChildrenScreen} />
      <Stack.Screen
        name="ParentComingSoon"
        component={ParentComingSoonScreen}
      />
    </Stack.Navigator>
  );
}
