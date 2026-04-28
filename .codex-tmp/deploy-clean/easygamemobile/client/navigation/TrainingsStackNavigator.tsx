import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerTrainingsDashboardScreen from "@/screens/TrainerTrainingsDashboardScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { HeaderNotificationButton } from "@/components/HeaderNotificationButton";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type TrainingsStackParamList = {
  Trainings: { focusTrainingId?: string } | undefined;
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<TrainingsStackParamList>();

export default function TrainingsStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Trainings"
        component={TrainerTrainingsDashboardScreen}
        options={({ navigation }) => ({
          headerTitle: () => <HeaderTitle title="Allenamenti" />,
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
