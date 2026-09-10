import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentHomeScreen from "@/screens/ParentHomeScreen";
import ParentAthleteProfileScreen from "@/screens/ParentAthleteProfileScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentHomeStackParamList = {
  ParentHome: undefined;
  ParentAthleteProfile: undefined;
};

const Stack = createNativeStackNavigator<ParentHomeStackParamList>();

/** WP9 aggiunge la scheda atleta (`ParentAthleteProfileScreen`), reale sin dal primo commit — l'unica sezione Web senza equivalente mobile fino a questo WP. */
export default function ParentHomeStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentHome" component={ParentHomeScreen} />
      <Stack.Screen
        name="ParentAthleteProfile"
        component={ParentAthleteProfileScreen}
      />
    </Stack.Navigator>
  );
}
