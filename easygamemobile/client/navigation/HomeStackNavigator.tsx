import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerHomeDashboardScreen from "@/screens/TrainerHomeDashboardScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { HeaderNotificationButton } from "@/components/HeaderNotificationButton";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type HomeStackParamList = {
  Home: undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Home"
        component={TrainerHomeDashboardScreen}
        options={({ navigation }) => ({
          headerTitle: () => <HeaderTitle title="Dashboard" />,
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
