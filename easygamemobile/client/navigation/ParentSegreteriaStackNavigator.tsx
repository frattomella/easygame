import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentSegreteriaScreen from "@/screens/ParentSegreteriaScreen";
import ParentPaymentsScreen from "@/screens/ParentPaymentsScreen";
import ParentDocumentsScreen from "@/screens/ParentDocumentsScreen";
import ParentConsentsScreen from "@/screens/ParentConsentsScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentSegreteriaStackParamList = {
  ParentSegreteria: undefined;
  ParentPayments: undefined;
  ParentDocuments: undefined;
  ParentConsents: undefined;
};

const Stack = createNativeStackNavigator<ParentSegreteriaStackParamList>();

/**
 * WP7: la tab Segreteria smette di essere un segnaposto — quattro sezioni
 * come da `guidelines/navigation.md` ("Payments, documents, consents and
 * enrollment... one tab, four sections"), tre reali qui (Iscrizione arriva
 * nel WP8).
 */
export default function ParentSegreteriaStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen
        name="ParentSegreteria"
        component={ParentSegreteriaScreen}
      />
      <Stack.Screen name="ParentPayments" component={ParentPaymentsScreen} />
      <Stack.Screen name="ParentDocuments" component={ParentDocumentsScreen} />
      <Stack.Screen name="ParentConsents" component={ParentConsentsScreen} />
    </Stack.Navigator>
  );
}
