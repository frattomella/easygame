import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";

import { useAuthContext } from "@/contexts/AuthContext";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Spacing } from "@/constants/theme";
import {
  ActionButton,
  AuthFrame,
  SignatureInput,
  SignatureText,
} from "@/components/signature";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Navigation = NativeStackNavigationProp<RootStackParamList, "Login">;

/**
 * Solo login: stesso backend, stesso account, stessa sessione della Web App
 * (`POST /api/v1/auth/login`). Registrazione, verifica OTP e recupero
 * password vivono in schermate dedicate — vedi `RegisterScreen`,
 * `VerifyOtpScreen`, `ForgotPasswordScreen`.
 *
 * Composizione: design `IA e Home` §5a / prototipo `isLogin` — riga
 * marchio con passo "1 di 3", eyebrow "Accedi", titolo "Bentornato",
 * scheda di vetro con Email + Password + CTA a gradiente, secondario
 * "Password dimenticata?" in contorno bianco, poi il rimando alla
 * registrazione.
 */
export default function LoginScreen() {
  const navigation = useNavigation<Navigation>();
  const { login, signOutReason, clearSignOutReason } = useAuthContext();

  const [sessionExpiredNotice] = useState(signOutReason === "expired");

  useEffect(() => {
    // Letto una sola volta al mount (vedi `useAuth.ts`): consumato subito,
    // cosi un login riuscito o un logout volontario successivo non lo
    // ritrovano ancora impostato.
    if (signOutReason) {
      clearSignOutReason();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDeveloperConfig, setShowDeveloperConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void mobileBackendStorage.getServerUrl().then((value) => {
      if (value) {
        setServerUrl(value);
      }
    });
  }, []);

  const toggleServerConfig = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowDeveloperConfig((current) => !current);
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      setError("Inserisci email e password");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (serverUrl.trim()) {
        await mobileBackendStorage.setServerUrl(serverUrl.trim());
      }

      const outcome = await login(email, password);

      if (outcome.kind === "authenticated") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      if (outcome.kind === "verification_required") {
        navigation.navigate("VerifyOtp", {
          reference: outcome.verification.userId,
          channel: outcome.channel,
          purpose: "login",
          verification: outcome.verification,
        });
        return;
      }

      setError(outcome.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Errore di connessione",
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame
      step="1 di 3"
      eyebrow="Accedi"
      title="Bentornato"
      body="Entra con le credenziali del tuo club."
      notice={
        sessionExpiredNotice
          ? "Sessione scaduta. Accedi di nuovo per continuare."
          : undefined
      }
      error={error || undefined}
      card={
        <>
          <SignatureInput
            label="Email"
            placeholder="nome@club.it"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            leftIcon="mail-outline"
          />
          <SignatureInput
            label="Password"
            placeholder="La tua password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="password"
            leftIcon="lock-closed-outline"
            rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
            rightIconLabel={
              showPassword ? "Nascondi password" : "Mostra password"
            }
            onRightIconPress={() => setShowPassword(!showPassword)}
            onSubmitEditing={() => void handleSubmit()}
          />
          {showDeveloperConfig ? (
            <SignatureInput
              label="Backend"
              placeholder="https://api.example.com"
              value={serverUrl}
              onChangeText={setServerUrl}
              keyboardType="url"
              autoCapitalize="none"
              leftIcon="globe-outline"
            />
          ) : null}
          <ActionButton
            variant="primary"
            fullWidth
            trailingIcon="arrow-forward"
            onPress={() => void handleSubmit()}
            loading={loading}
          >
            Accedi
          </ActionButton>
        </>
      }
      secondary={{
        label: "Password dimenticata?",
        onPress: () => navigation.navigate("ForgotPassword"),
      }}
    >
      <View style={styles.registerRow}>
        <Pressable onLongPress={toggleServerConfig} delayLongPress={1200}>
          <SignatureText style={styles.registerText}>
            Non hai un account?
          </SignatureText>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("Register")}
          hitSlop={8}
          accessibilityRole="button"
        >
          <SignatureText style={styles.registerLink}>
            Crea account
          </SignatureText>
        </Pressable>
      </View>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  registerText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  registerLink: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
});
