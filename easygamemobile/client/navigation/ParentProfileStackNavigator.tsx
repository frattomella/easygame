import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentProfileScreen from "@/screens/ParentProfileScreen";
import ParentChildrenScreen from "@/screens/ParentChildrenScreen";
import ParentMoreScreen from "@/screens/ParentMoreScreen";
import ParentComingSoonScreen from "@/screens/ParentComingSoonScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentProfileStackParamList = {
  ParentProfile: undefined;
  ParentChildren: undefined;
  ParentMore: undefined;
  ParentComingSoon: { title: string; message?: string };
};

const Stack = createNativeStackNavigator<ParentProfileStackParamList>();

/**
 * WP6 aggiunge l'hub (`ParentMore`, "Altre sezioni") e il segnaposto
 * condiviso `ParentComingSoon` per le sezioni fuori perimetro di questo
 * batch (ADR-0163) — `ParentProfile` e `ParentChildren` restano quelli del
 * WP4.
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
    </Stack.Navigator>
  );
}
