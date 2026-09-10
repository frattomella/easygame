import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentSegreteriaScreen from "@/screens/ParentSegreteriaScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentSegreteriaStackParamList = {
  ParentSegreteria: undefined;
};

const Stack = createNativeStackNavigator<ParentSegreteriaStackParamList>();

export default function ParentSegreteriaStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen
        name="ParentSegreteria"
        component={ParentSegreteriaScreen}
      />
    </Stack.Navigator>
  );
}
