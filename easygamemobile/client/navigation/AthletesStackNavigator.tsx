import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import TrainerAthletesScreen from "@/screens/TrainerAthletesScreen";
import TrainerAthleteProfileScreen from "@/screens/TrainerAthleteProfileScreen";
import NotificationsScreen from "@/screens/NotificationsScreen";
import { HeaderTitle } from "@/components/HeaderTitle";
import { HeaderNotificationButton } from "@/components/HeaderNotificationButton";
import { useScreenOptions } from "@/hooks/useScreenOptions";

export type AthletesStackParamList = {
  Athletes: undefined;
  AthleteProfile: { athleteId: string };
  Notifications: undefined;
};

const Stack = createNativeStackNavigator<AthletesStackParamList>();

export default function AthletesStackNavigator() {
  const screenOptions = useScreenOptions();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Athletes"
        component={TrainerAthletesScreen}
        options={({ navigation }) => ({
          headerTitle: () => <HeaderTitle title="Atleti" />,
          headerRight: () => (
            <HeaderNotificationButton
              onPress={() => navigation.navigate("Notifications")}
            />
          ),
        })}
      />
      <Stack.Screen
        name="AthleteProfile"
        component={TrainerAthleteProfileScreen}
        options={{
          headerTitle: () => <HeaderTitle title="Atleta" />,
        }}
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
