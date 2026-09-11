import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
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

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  "ForgotPassword"
>;

/**
 * Stesso endpoint della Web App (`POST /api/v1/auth/password/forgot`):
 * risponde sempre allo stesso modo, esista o no l'account, per non rivelare
 * quali indirizzi sono registrati.
 *
 * Il completamento (`/api/v1/auth/password/reset`) pretende un
 * identificativo e un token che **solo** il link nell'email porta — nessuna
 * rotta lo restituisce al client, di proposito. Senza deep linking
 * configurato in questa app (vedi il report del WP), quel link si apre nel
 * browser del telefono sulla stessa pagina Web che completa il reset: non e
 * un secondo sistema, e lo stesso, con l'ultimo passo fuori dall'app.
 *
 * v3.0 (`migration-v3.md` passo 7): su `BrandStateLayout`, stesso registro
 * delle altre schermate auth.
 */
export default function ForgotPasswordScreen() {
  const navigation = useNavigation<Navigation>();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError("Inserisci la tua email.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const outcome = await mobileBackendStorage.forgotPassword(email);
      if (outcome.kind === "rate_limited") {
        setError(outcome.message);
        return;
      }
      // "sent" ed "error" mostrano lo stesso messaggio generico del backend:
      // non e questa schermata a decidere se un indirizzo esiste.
      setMessage(outcome.message);
      setSent(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Errore di connessione",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <BrandStateLayout>
      <Animated.View
        entering={FadeInDown.delay(100).duration(600)}
        style={styles.iconWrap}
      >
        <Ionicons name="key-outline" size={36} color="#FFFFFF" />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(600)}>
        <SignatureText
          variant="display"
          tone="onDark"
          style={styles.centeredText}
        >
          Password dimenticata
        </SignatureText>
        <SignatureText
          variant="body"
          tone="onDarkMuted"
          style={[styles.centeredText, styles.subtitle]}
        >
          Inserisci la tua email: se e associata a un account EasyGame, ti
          mandiamo le istruzioni per reimpostare la password.
        </SignatureText>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(220).duration(600)}
        style={styles.formContainer}
      >
        {sent ? (
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={styles.confirmation}
          >
            <Ionicons name="checkmark-circle" size={28} color="#86EFAC" />
            <SignatureText
              variant="body"
              tone="onDark"
              style={styles.centeredText}
            >
              {message}
            </SignatureText>
            <SignatureText
              variant="small"
              tone="onDarkMuted"
              style={styles.centeredText}
            >
              Apri il link ricevuto via email per scegliere la nuova password,
              poi torna qui per accedere.
            </SignatureText>
          </Animated.View>
        ) : (
          <SignatureInput
            label="Email"
            placeholder="nome@esempio.it"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError("");
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
            style={styles.field}
          />
        )}

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

        {!sent ? (
          <ActionButton
            variant="primary"
            onSky
            onPress={() => void handleSubmit()}
            loading={loading}
            fullWidth
            style={styles.submitButton}
          >
            Invia istruzioni
          </ActionButton>
        ) : null}

        <ActionButton
          variant="secondary"
          onSky
          onPress={() => navigation.goBack()}
          fullWidth
        >
          Torna al login
        </ActionButton>
      </Animated.View>
    </BrandStateLayout>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  centeredText: {
    textAlign: "center",
  },
  subtitle: {
    marginTop: Spacing.xs,
  },
  formContainer: {
    gap: Spacing.md,
    marginTop: Spacing["2xl"],
  },
  field: {
    marginBottom: 0,
  },
  confirmation: {
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  errorText: {
    color: "#FCA5A5",
  },
  submitButton: {
    marginTop: Spacing.sm,
  },
});
