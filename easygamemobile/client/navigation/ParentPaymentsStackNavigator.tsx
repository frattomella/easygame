import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentPaymentsScreen from "@/screens/ParentPaymentsScreen";
import ParentPaymentDetailScreen from "@/screens/ParentPaymentDetailScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentPaymentsStackParamList = {
  ParentPayments: undefined;
  /** Il dettaglio di una rata (prototipo `pPayDetail`): la rata vive nella lista gia caricata, qui passa solo l'id. */
  ParentPaymentDetail: { paymentId: string };
};

const Stack = createNativeStackNavigator<ParentPaymentsStackParamList>();

/**
 * Il tab Pagamenti (v3.0, `migration-v3.md` passo 8): elenco + dettaglio.
 * Ogni schermata disegna il proprio guscio (`ParentPrimaryScreenLayout` /
 * `SecondaryScreenLayout`): `headerShown: false` evita un secondo header.
 */
export default function ParentPaymentsStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentPayments" component={ParentPaymentsScreen} />
      <Stack.Screen
        name="ParentPaymentDetail"
        component={ParentPaymentDetailScreen}
      />
    </Stack.Navigator>
  );
}
