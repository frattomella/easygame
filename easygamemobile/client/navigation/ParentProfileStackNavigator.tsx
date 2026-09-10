import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ParentProfileScreen from "@/screens/ParentProfileScreen";
import ParentChildrenScreen from "@/screens/ParentChildrenScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ParentProfileStackParamList = {
  ParentProfile: undefined;
  ParentChildren: undefined;
};

const Stack = createNativeStackNavigator<ParentProfileStackParamList>();

export default function ParentProfileStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      <Stack.Screen name="ParentProfile" component={ParentProfileScreen} />
      <Stack.Screen name="ParentChildren" component={ParentChildrenScreen} />
    </Stack.Navigator>
  );
}
