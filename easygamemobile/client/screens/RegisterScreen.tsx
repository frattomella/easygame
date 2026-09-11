import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Spacing } from "@/constants/theme";
import {
  ActionButton,
  BrandStateLayout,
  SignatureInput,
  SignatureText,
} from "@/components/signature";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Navigation = NativeStackNavigationProp<RootStackParamList, "Register">;

/**
 * Crea l'account con lo stesso backend della Web App
 * (`POST /api/v1/auth/register`): stessa identita, stesse credenziali, stessa
 * membership. Il telefono e obbligatorio perche lo e per ogni account nuovo
 * (`isPhoneNumberRequiredAtSignup`, ADR-0132) — il formato lo valida il
 * server, qui si raccoglie e basta.
 *
 * v3.0 (`migration-v3.md` passo 7): su `BrandStateLayout`, stesso registro di
 * `LoginScreen` — cielo pieno, `SignatureInput`/`ActionButton`, mai il
 * quadrato con gradiente attorno al marchio.
 */
export default function RegisterScreen() {
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
    <BrandStateLayout>
      <Animated.View entering={FadeInDown.delay(100).duration(600)}>
        <SignatureText
          variant="eyebrow"
          tone="onDarkMuted"
          style={styles.centeredText}
        >
          Nuovo account
        </SignatureText>
        <SignatureText
          variant="display"
          tone="onDark"
          style={[styles.title, styles.centeredText]}
        >
          Crea il tuo profilo
        </SignatureText>
        <SignatureText
          variant="body"
          tone="onDarkMuted"
          style={styles.centeredText}
        >
          Lo stesso account funziona anche sulla Web App EasyGame.
        </SignatureText>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(200).duration(600)}
        style={styles.formContainer}
      >
        <SignatureInput
          label="Nome"
          placeholder="Marco"
          value={firstName}
          onChangeText={setFirstName}
          leftIcon="person-outline"
          style={styles.field}
        />
        <SignatureInput
          label="Cognome"
          placeholder="Rossi"
          value={lastName}
          onChangeText={setLastName}
          leftIcon="person-outline"
          style={styles.field}
        />
        <SignatureInput
          label="Cellulare"
          placeholder="+39 333 0000000"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          leftIcon="call-outline"
          style={styles.field}
        />
        <SignatureInput
          label="Email"
          placeholder="nome@esempio.it"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          leftIcon="mail-outline"
          style={styles.field}
        />
        <SignatureInput
          label="Password"
          placeholder="Almeno 12 caratteri"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          leftIcon="lock-closed-outline"
          rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
          rightIconLabel={
            showPassword ? "Nascondi password" : "Mostra password"
          }
          onRightIconPress={() => setShowPassword(!showPassword)}
          style={styles.field}
        />
        <SignatureText variant="small" tone="onDarkMuted" style={styles.hint}>
          Maiuscola, minuscola, numero e carattere speciale.
        </SignatureText>
        <SignatureInput
          label="Conferma password"
          placeholder="Ripeti la password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          leftIcon="shield-checkmark-outline"
          style={styles.field}
        />

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color="#FCA5A5" />
            <SignatureText
              variant="small"
              style={[styles.errorText, { flex: 1 }]}
            >
              {error}
            </SignatureText>
          </View>
        ) : null}

        <ActionButton
          variant="primary"
          onSky
          onPress={() => void handleSubmit()}
          loading={loading}
          fullWidth
          style={styles.submitButton}
        >
          Crea account
        </ActionButton>

        <View style={styles.footer}>
          <SignatureText variant="small" tone="onDarkMuted">
            Hai già un account?
          </SignatureText>
          <Pressable onPress={() => navigation.navigate("Login")}>
            <SignatureText variant="small" style={styles.footerLink}>
              Accedi
            </SignatureText>
          </Pressable>
        </View>
      </Animated.View>
    </BrandStateLayout>
  );
}

const styles = StyleSheet.create({
  title: {
    marginVertical: 2,
  },
  centeredText: {
    textAlign: "center",
  },
  formContainer: {
    gap: Spacing.md,
    marginTop: Spacing["2xl"],
  },
  field: {
    marginBottom: 0,
  },
  hint: {
    marginTop: -Spacing.xs,
  },
  submitButton: {
    marginTop: Spacing.sm,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  errorText: {
    color: "#FCA5A5",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  footerLink: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
