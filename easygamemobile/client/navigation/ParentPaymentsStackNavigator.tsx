import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentPaymentsScreen from "@/screens/ParentPaymentsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentPaymentsStackParamList = {
  ParentPayments: undefined;
};

const Stack = createNativeStackNavigator<ParentPaymentsStackParamList>();

/**
 * v3.0 (`migration-v3.md` passo 8): Pagamenti promosso da sezione dentro
 * "Segreteria" a tab proprio del Dock ("Home · Calendario · Pagamenti ·
 * Servizi · Profilo") — e la sezione piu frequente delle quattro "carta e
 * soldi" di prima. Stessa schermata, stesso `GET /api/parent-dashboard`,
 * stesso checkout: cambia solo dove vive nel Dock.
 */
export default function ParentPaymentsStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentPayments" component={ParentPaymentsScreen} />
    </Stack.Navigator>
  );
}
