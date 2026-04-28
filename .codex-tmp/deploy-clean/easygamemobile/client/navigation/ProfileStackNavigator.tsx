import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerProfileDashboardScreen from "@/screens/TrainerProfileDashboardScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { HeaderNotificationButton } from "@/components/HeaderNotificationButton";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type ProfileStackParamList = {
  Profile: undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<ProfileStackParamList>();

export default function ProfileStackNavigator() {
  const screenOptions = useScreenOptions({ transparent: false });

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Profile"
        component={TrainerProfileDashboardScreen}
        options={({ navigation }) => ({
          headerTitle: () => <HeaderTitle title="Profilo" />,
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
