import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import {
  ParentPrimaryScreenLayout,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentCalendarStackParamList = {
  ParentCalendar: undefined;
};

const Stack = createNativeStackNavigator<ParentCalendarStackParamList>();

/**
 * WP4: segnaposto onesto. Il calendario unificato (allenamenti + gare +
 * RSVP) arriva nel WP5 — questo file viene sostituito, non esteso, quando
 * quel WP porta `ParentCalendarScreen` reale.
 */
function ParentCalendarPlaceholder() {
  const { children, selectedChildId, switching, selectChild } =
    useParentContext();

  return (
    <ParentPrimaryScreenLayout
      title="Calendario"
      eyebrow="In arrivo"
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      scrollable={false}
      content={
        <StateMessage
          kind="empty"
          tone="dark"
          title="Calendario in arrivo"
          message="Allenamenti, gare e conferme di partecipazione arriveranno in un prossimo aggiornamento."
        />
      }
    />
  );
}

export default function ParentCalendarStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen
        name="ParentCalendar"
        component={ParentCalendarPlaceholder}
      />
    </Stack.Navigator>
  );
}
