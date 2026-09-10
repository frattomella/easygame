import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import {
  ParentPrimaryScreenLayout,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentBoardStackParamList = {
  ParentBoard: undefined;
};

const Stack = createNativeStackNavigator<ParentBoardStackParamList>();

/**
 * WP4: segnaposto onesto. Bacheca e notifiche arrivano nel WP6 — questo
 * file viene sostituito, non esteso, quando quel WP porta
 * `ParentBoardScreen` reale.
 */
function ParentBoardPlaceholder() {
  const { children, selectedChildId, switching, selectChild } =
    useParentContext();

  return (
    <ParentPrimaryScreenLayout
      title="Bacheca"
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
          title="Bacheca in arrivo"
          message="Gli avvisi del club e le notifiche arriveranno in un prossimo aggiornamento."
        />
      }
    />
  );
}

export default function ParentBoardStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentBoard" component={ParentBoardPlaceholder} />
    </Stack.Navigator>
  );
}
