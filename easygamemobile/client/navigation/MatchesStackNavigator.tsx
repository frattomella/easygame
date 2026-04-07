import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerMatchesDashboardScreen from "@/screens/TrainerMatchesDashboardScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { HeaderNotificationButton } from "@/components/HeaderNotificationButton";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type MatchesStackParamList = {
  Matches: { focusMatchId?: string } | undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<MatchesStackParamList>();

export default function MatchesStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Matches"
        component={TrainerMatchesDashboardScreen}
        options={({ navigation }) => ({
          headerTitle: () => <HeaderTitle title="Gare" />,
          headerRight: () => (
            <HeaderNotificationButton
              onPress={() => navigation.navigate("Notifications")}
            />
          ),
        })}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Notifiche" />,
        }}
      />
    </Stack.Navigator>
  );
}
