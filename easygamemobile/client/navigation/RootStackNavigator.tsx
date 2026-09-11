import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import MainTabNavigator from "@/navigation/MainTabNavigator";
import ParentTabNavigator from "@/navigation/ParentTabNavigator";
import LoginScreen from "@/screens/LoginScreen";
import RegisterScreen from "@/screens/RegisterScreen";
import VerifyOtpScreen from "@/screens/VerifyOtpScreen";
import ForgotPasswordScreen from "@/screens/ForgotPasswordScreen";
import ResetPasswordScreen from "@/screens/ResetPasswordScreen";
import AccountHubScreen from "@/screens/AccountHubScreen";
import UnsupportedRoleScreen from "@/screens/UnsupportedRoleScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useAuthContext } from "@/contexts/AuthContext";
import { resolveMobileRoleGate } from "@/lib/mobile-role-gate";
import { VerificationChannel, VerificationInfo } from "@/lib/auth-flow";
import { useDeepLinkRouter } from "@/hooks/useDeepLinkRouter";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { BrandStateLayout } from "@/components/signature";

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
  /** Raggiunta da un deep link (WP11) — vedi `client/lib/deep-linking.ts`. Non richiede sessione: il reset stesso ne serve a chi non ce l'ha. */
  ResetPassword: { userId: string; token: string };
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

  const roleGate = hasContext ? resolveMobileRoleGate(currentRole) : null;
  const deepLinkRoleGate =
    roleGate === "trainer" || roleGate === "parent" ? roleGate : null;
  const isReadyToNavigate = !isLoading && isLoggedIn && hasContext;

  /*
    Il risolutore di deep link e il ciclo di vita del token push (WP11)
    vanno chiamati a ogni render, prima di qualunque `return` anticipato:
    sono hook, e le regole di React non permettono di saltarli mentre il
    bootstrap e ancora in corso. Durante il caricamento `isReadyToNavigate` e
    `false` e un eventuale link resta in sospeso — lo riprende da solo non
    appena bootstrap, sessione e contesto sono risolti (stessa sequenza che
    decide cosa mostrare qui sotto).
  */
  useDeepLinkRouter({
    isReadyToNavigate,
    roleGate: deepLinkRoleGate,
  });
  usePushNotifications({
    isLoggedIn,
    isReadyToNavigate,
    roleGate: deepLinkRoleGate,
  });

  if (isLoading) {
    // v3.0 (`migration-v3.md` passo 7): stato di bootstrap sulla stessa
    // veste delle altre schermate auth/sistema — mai piu il grigio fisso
    // del tema chiaro prima che l'app sappia quale schermata mostrare.
    return (
      <BrandStateLayout scrollable={false}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </BrandStateLayout>
    );
  }

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
        <Stack.Screen name="ParentMain" component={ParentTabNavigator} />
      ) : (
        <Stack.Screen name="Unsupported" component={UnsupportedRoleScreen} />
      )}
      {/*
        Sempre presente, a prescindere dallo stato sopra: il reset password
        (WP11) non ha bisogno di sessione ne di contesto, ed e l'unica
        schermata che un deep link deve poter raggiungere anche prima che
        tutto il resto sia risolto.
      */}
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
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
