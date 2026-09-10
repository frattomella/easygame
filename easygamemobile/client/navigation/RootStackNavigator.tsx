import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import ParentStackNavigator from "@/navigation/ParentStackNavigator";
import LoginScreen from "@/screens/LoginScreen";
import RegisterScreen from "@/screens/RegisterScreen";
import VerifyOtpScreen from "@/screens/VerifyOtpScreen";
import ForgotPasswordScreen from "@/screens/ForgotPasswordScreen";
import AccountHubScreen from "@/screens/AccountHubScreen";
import UnsupportedRoleScreen from "@/screens/UnsupportedRoleScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { resolveMobileRoleGate } from "@/lib/mobile-role-gate";
import { VerificationChannel, VerificationInfo } from "@/lib/auth-flow";

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  VerifyOtp: {
    reference: string;
    channel: VerificationChannel;
    purpose: "signup" | "login";
    verification: VerificationInfo;
  };
  ForgotPassword: undefined;
  ContextSelection: undefined;
  Main: undefined;
  ParentMain: undefined;
  Unsupported: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Il punto unico in cui l'app decide quale guscio mostrare, in ordine:
 * autenticato? contesto (club + ruolo) scelto? quale area apre quel ruolo?
 *
 * L'ultima domanda la risponde `resolveMobileRoleGate` — e **solo qui**: V1
 * mobile supporta Trainer e Parent, ogni altro ruolo (Owner, Club Manager,
 * Collaborator, Staff non-Trainer, Athlete, ruoli di club personalizzati non
 * basati su Trainer) arriva a `UnsupportedRoleScreen`. Nessuna schermata a
 * valle deve rifare questo controllo: se un ruolo non supportato arrivasse a
 * `MainTabNavigator`, il difetto sarebbe qui, non li.
 */
export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { isLoading, isLoggedIn, hasContext, currentRole } = useAuthContext();
  const { theme } = useTheme();

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.backgroundRoot }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const roleGate = hasContext ? resolveMobileRoleGate(currentRole) : null;

  return (
    <Stack.Navigator screenOptions={{ ...screenOptions, headerShown: false }}>
      {!isLoggedIn ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
        </>
      ) : !hasContext ? (
        <Stack.Screen name="ContextSelection" component={AccountHubScreen} />
      ) : roleGate === "trainer" ? (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      ) : roleGate === "parent" ? (
        <Stack.Screen name="ParentMain" component={ParentStackNavigator} />
      ) : (
        <Stack.Screen name="Unsupported" component={UnsupportedRoleScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
