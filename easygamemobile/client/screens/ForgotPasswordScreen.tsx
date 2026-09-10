import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Colors, Spacing } from "@/constants/theme";
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
 */
export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
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
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing["3xl"],
          paddingBottom: insets.bottom + Spacing["2xl"],
        },
      ]}
    >
      <View style={styles.icon}>
        <Ionicons name="key-outline" size={40} color={theme.primary} />
      </View>

      <ThemedText type="h3" style={styles.centeredText}>
        Password dimenticata
      </ThemedText>
      <ThemedText
        type="body"
        style={[
          styles.centeredText,
          styles.subtitle,
          { color: theme.textSecondary },
        ]}
      >
        Inserisci la tua email: se e associata a un account EasyGame, ti
        mandiamo le istruzioni per reimpostare la password.
      </ThemedText>

      {sent ? (
        <Animated.View
          entering={FadeInDown.duration(300)}
          style={styles.confirmation}
        >
          <Ionicons
            name="checkmark-circle"
            size={28}
            color={Colors.light.success}
          />
          <ThemedText type="body" style={styles.centeredText}>
            {message}
          </ThemedText>
          <ThemedText
            type="small"
            style={[styles.centeredText, { color: theme.textSecondary }]}
          >
            Apri il link ricevuto via email per scegliere la nuova password, poi
            torna qui per accedere.
          </ThemedText>
        </Animated.View>
      ) : (
        <Input
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
          error={error || undefined}
        />
      )}

      {!sent ? (
        <Button onPress={handleSubmit} loading={loading} fullWidth>
          Invia istruzioni
        </Button>
      ) : null}

      <Button variant="ghost" onPress={() => navigation.goBack()} fullWidth>
        Torna al login
      </Button>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing["2xl"], gap: Spacing.md },
  icon: { alignItems: "center", marginBottom: Spacing.sm },
  centeredText: { textAlign: "center" },
  subtitle: { marginTop: Spacing.xs, marginBottom: Spacing.lg },
  confirmation: {
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
});
