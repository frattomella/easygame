import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentHomeScreen from "@/screens/ParentHomeScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentStackParamList = {
  ParentHome: undefined;
};

const Stack = createNativeStackNavigator<ParentStackParamList>();

/**
 * Struttura minima dell'area Parent: un'unica schermata placeholder. Le
 * funzionalita reali (figli, allenamenti, pagamenti, documenti) arrivano nei
 * prossimi Work Package — vedi `ParentHomeScreen`.
 */
export default function ParentStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="ParentHome"
        component={ParentHomeScreen}
        options={{
          headerTitle: () => <HeaderTitle title="EasyGame" />,
        }}
      />
    </Stack.Navigator>
  );
}
