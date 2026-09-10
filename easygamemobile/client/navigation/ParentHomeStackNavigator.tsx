import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentHomeScreen from "@/screens/ParentHomeScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentHomeStackParamList = {
  ParentHome: undefined;
};

const Stack = createNativeStackNavigator<ParentHomeStackParamList>();

export default function ParentHomeStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentHome" component={ParentHomeScreen} />
    </Stack.Navigator>
  );
}
