import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentCalendarScreen from "@/screens/ParentCalendarScreen";
import ParentEventDetailScreen from "@/screens/ParentEventDetailScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import type { ParentCalendarKind } from "@/lib/parent-calendar";

export type ParentCalendarStackParamList = {
  ParentCalendar: undefined;
  ParentEventDetail: { eventId: string; kind: ParentCalendarKind };
};

const Stack = createNativeStackNavigator<ParentCalendarStackParamList>();

/**
 * WP5: calendario unificato (allenamenti + gare) piu il dettaglio con RSVP
 * — sostituisce per intero il segnaposto di WP4.
 */
export default function ParentCalendarStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentCalendar" component={ParentCalendarScreen} />
      <Stack.Screen
        name="ParentEventDetail"
        component={ParentEventDetailScreen}
      />
    </Stack.Navigator>
  );
}
