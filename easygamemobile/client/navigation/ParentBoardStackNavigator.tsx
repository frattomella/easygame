import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentBoardScreen from "@/screens/ParentBoardScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentBoardStackParamList = {
  ParentBoard: { initialSection?: "board" | "notifications" } | undefined;
};

const Stack = createNativeStackNavigator<ParentBoardStackParamList>();

/**
 * WP6: sostituisce per intero il segnaposto di WP4 — bacheca e notifiche
 * reali, sulla stessa tab (`guidelines/navigation.md`).
 */
export default function ParentBoardStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentBoard" component={ParentBoardScreen} />
    </Stack.Navigator>
  );
}
