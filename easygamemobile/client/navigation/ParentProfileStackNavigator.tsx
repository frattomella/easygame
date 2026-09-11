import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentProfileScreen from "@/screens/ParentProfileScreen";
import ParentChildrenScreen from "@/screens/ParentChildrenScreen";
import ParentAthleteProfileScreen from "@/screens/ParentAthleteProfileScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentProfileStackParamList = {
  ParentProfile: undefined;
  ParentChildren: undefined;
  /** La scheda del figlio, raggiungibile anche da "I miei figli" (stesso componente dello stack Home). */
  ParentAthleteProfile: undefined;
};

const Stack = createNativeStackNavigator<ParentProfileStackParamList>();

/**
 * Profilo → I miei figli → scheda atleta. `ParentComingSoon` ("Impostazioni",
 * un segnaposto senza una sezione reale dietro) e stato rimosso con il
 * reskin v3: il Profilo del prototipo non lo prevede e nessuna funzione lo
 * usava.
 */
export default function ParentProfileStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentProfile" component={ParentProfileScreen} />
      <Stack.Screen name="ParentChildren" component={ParentChildrenScreen} />
      <Stack.Screen
        name="ParentAthleteProfile"
        component={ParentAthleteProfileScreen}
      />
    </Stack.Navigator>
  );
}
