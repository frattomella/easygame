import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import HomeStackNavigator from "@/navigation/HomeStackNavigator";
import TrainingsStackNavigator from "@/navigation/TrainingsStackNavigator";
import MatchesStackNavigator from "@/navigation/MatchesStackNavigator";
import AthletesStackNavigator from "@/navigation/AthletesStackNavigator";
import ProfileStackNavigator from "@/navigation/ProfileStackNavigator";
import { EasyGameGradientBackground } from "@/components/EasyGameGradientBackground";
import { useAuthContext } from "@/contexts/AuthContext";
import { BorderRadius, Spacing } from "@/constants/theme";

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
      screenOptions={{
        tabBarActiveTintColor: "#FFFFFF",
        tabBarInactiveTintColor: "rgba(255,255,255,0.64)",
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          height: 76,
          left: Spacing.xl + Spacing.xs,
          right: Spacing.xl + Spacing.xs,
          bottom: Spacing.lg + 2,
          borderRadius: BorderRadius.full,
          paddingTop: Spacing.xs,
          paddingBottom: Spacing.xs,
          shadowColor: "#020617",
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: 0.24,
          shadowRadius: 20,
          overflow: "hidden",
        },
        tabBarBackground: () => (
          <EasyGameGradientBackground
            radius={BorderRadius.full}
            overlayOpacity={0.08}
          />
        ),
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "700",
        },
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
