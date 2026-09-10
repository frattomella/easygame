import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Spacing } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Navigation = NativeStackNavigationProp<RootStackParamList, "Register">;

/**
 * Crea l'account con lo stesso backend della Web App
 * (`POST /api/v1/auth/register`): stessa identita, stesse credenziali, stessa
 * membership. Il telefono e obbligatorio perche lo e per ogni account nuovo
 * (`isPhoneNumberRequiredAtSignup`, ADR-0132) — il formato lo valida il
 * server, qui si raccoglie e basta.
 */
export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const navigation = useNavigation<Navigation>();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      setError("Inserisci almeno nome o cognome.");
      return;
    }
    if (!phone.trim()) {
      setError("Il numero di cellulare è obbligatorio.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Inserisci email e password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Le password non coincidono.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setError("");
    setLoading(true);
    try {
      const outcome = await mobileBackendStorage.register({
        email,
        password,
        firstName,
        lastName,
        phone,
      });

      if (outcome.kind === "verification_required") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.navigate("VerifyOtp", {
          reference: outcome.verification.userId,
          channel: outcome.channel,
          purpose: "signup",
          verification: outcome.verification,
        });
        return;
      }

      if (outcome.kind === "authenticated") {
        // Non dovrebbe accadere in registrazione (la rotta non apre mai una
        // sessione qui), ma se succedesse la schermata successiva la trova
        // gia autenticata: il navigatore radice cambia stack da solo.
        return;
      }

      if (outcome.kind === "rate_limited") {
        setError(outcome.message);
      } else {
        setError(outcome.message);
      }
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
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing["2xl"],
          paddingBottom: insets.bottom + Spacing["2xl"],
        },
      ]}
    >
      <Animated.View entering={FadeInDown.duration(400)}>
        <ThemedText type="h2">Crea account</ThemedText>
        <ThemedText
          type="body"
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          Lo stesso account funziona anche sulla Web App EasyGame.
        </ThemedText>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(80).duration(400)}>
        <Input
          label="Nome"
          placeholder="Marco"
          value={firstName}
          onChangeText={setFirstName}
          leftIcon="person-outline"
        />
        <Input
          label="Cognome"
          placeholder="Rossi"
          value={lastName}
          onChangeText={setLastName}
          leftIcon="person-outline"
        />
        <Input
          label="Cellulare"
          placeholder="+39 333 0000000"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          leftIcon="call-outline"
        />
        <Input
          label="Email"
          placeholder="nome@esempio.it"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          leftIcon="mail-outline"
        />
        <Input
          label="Password"
          placeholder="Almeno 12 caratteri"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          leftIcon="lock-closed-outline"
          rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
          onRightIconPress={() => setShowPassword(!showPassword)}
        />
        <ThemedText
          type="caption"
          style={[styles.hint, { color: theme.textSecondary }]}
        >
          Maiuscola, minuscola, numero e carattere speciale.
        </ThemedText>
        <Input
          label="Conferma password"
          placeholder="Ripeti la password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          leftIcon="shield-checkmark-outline"
          error={error || undefined}
        />
      </Animated.View>

      <Button onPress={handleSubmit} loading={loading} fullWidth>
        Crea account
      </Button>

      <View style={styles.footer}>
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          Hai già un account?
        </ThemedText>
        <ThemedText
          type="link"
          onPress={() => navigation.navigate("Login")}
          style={styles.footerLink}
        >
          Accedi
        </ThemedText>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing["2xl"], gap: Spacing.lg },
  subtitle: { marginTop: Spacing.xs, marginBottom: Spacing.lg },
  hint: { marginTop: -Spacing.sm, marginBottom: Spacing.lg },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  footerLink: { fontWeight: "700" },
});
