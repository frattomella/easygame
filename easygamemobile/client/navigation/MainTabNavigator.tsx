import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import TrainingsStackNavigator from "@/navigation/TrainingsStackNavigator";
import MatchesStackNavigator from "@/navigation/MatchesStackNavigator";
import AthletesStackNavigator from "@/navigation/AthletesStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import { Dock } from "@/components/signature/Dock";
import { useAuthContext } from "@/contexts/AuthContext";

export type MainTabParamList = {
  HomeTab: undefined;
  TrainingsTab: undefined;
  MatchesTab: undefined;
  AthletesTab: undefined;
  ProfileTab: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const { currentRole, trainerPermissions } = useAuthContext();

  const isRestrictedTrainerMode =
    currentRole === "trainer" || currentRole === "assistant";

  const canShowHome =
    !isRestrictedTrainerMode || trainerPermissions?.navigation.home !== false;
  const canShowTrainings =
    !isRestrictedTrainerMode ||
    trainerPermissions?.navigation.trainings !== false;
  const canShowMatches =
    !isRestrictedTrainerMode ||
    trainerPermissions?.navigation.matches !== false;
  const canShowAthletes =
    !isRestrictedTrainerMode ||
    trainerPermissions?.navigation.athletes !== false;

  const initialRouteName = canShowHome
    ? "HomeTab"
    : canShowTrainings
      ? "TrainingsTab"
      : canShowMatches
        ? "MatchesTab"
        : canShowAthletes
          ? "AthletesTab"
          : "ProfileTab";

  return (
    <Tab.Navigator
      initialRouteName={initialRouteName}
      /*
        **La chrome e la sola cosa che cambia qui.** `Dock` (design system,
        pattern «Floating Dock») sostituisce `tabBarStyle`/`tabBarBackground`
        con il guscio dark-glass e il puck a gradiente: nessuna delle
        `Tab.Screen` qui sotto, ne la logica di visibilita per permesso, e
        stata toccata. `Dock` legge il nome dell'icona dallo stesso
        `tabBarIcon` che ogni schermata gia dichiara — non esiste una
        seconda tabella di icone da tenere allineata a questa.
      */
      tabBar={(props) => <Dock {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      {canShowHome ? (
        <Tab.Screen
          name="HomeTab"
          component={HomeStackNavigator}
          options={{
            title: "Home",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
      ) : null}
      {canShowTrainings ? (
        <Tab.Screen
          name="TrainingsTab"
          component={TrainingsStackNavigator}
          options={{
            title: "Allenamenti",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="fitness" size={size} color={color} />
            ),
          }}
        />
      ) : null}
      {canShowMatches ? (
        <Tab.Screen
          name="MatchesTab"
          component={MatchesStackNavigator}
          options={{
            title: "Gare",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="football" size={size} color={color} />
            ),
          }}
        />
      ) : null}
      {canShowAthletes ? (
        <Tab.Screen
          name="AthletesTab"
          component={AthletesStackNavigator}
          options={{
            title: "Atleti",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people" size={size} color={color} />
            ),
          }}
        />
      ) : null}
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          title: "Profilo",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
