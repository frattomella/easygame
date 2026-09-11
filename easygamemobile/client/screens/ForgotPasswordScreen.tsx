import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  ActionButton,
  AuthFrame,
  IconChip,
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
 * Composizione: design §5a (terzo artboard, "Recupero") prima dell'invio;
 * §3a ("Controlla la posta": chip busta aperta, indirizzo, nota) dopo.
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

  return sent ? (
    <AuthFrame
      step="Recupero"
      eyebrow="Recupero accesso"
      title="Controlla la posta"
      body={
        message ||
        "Se l'indirizzo è registrato riceverai un link per reimpostare la password."
      }
      card={
        <View style={styles.sentCard}>
          <IconChip name="mail-open-outline" color="#2563EB" size={40} />
          <SignatureText style={styles.sentEmail}>{email.trim()}</SignatureText>
          <SignatureText style={styles.sentHint}>
            Apri il link ricevuto via email per scegliere la nuova password, poi
            torna qui per accedere. Controlla anche la cartella spam.
          </SignatureText>
        </View>
      }
      secondary={{
        label: "Torna al login",
        onPress: () => navigation.goBack(),
      }}
    />
  ) : (
    <AuthFrame
      step="Recupero"
      eyebrow="Recupero accesso"
      title="Reimposta la password"
      body="Se l'indirizzo è registrato riceverai un link valido 30 minuti."
      error={error || undefined}
      card={
        <>
          <SignatureInput
            label="Email"
            placeholder="nome@email.it"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setError("");
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            leftIcon="mail-outline"
            onSubmitEditing={() => void handleSubmit()}
          />
          <ActionButton
            variant="primary"
            fullWidth
            trailingIcon="arrow-forward"
            onPress={() => void handleSubmit()}
            loading={loading}
          >
            Invia richiesta
          </ActionButton>
        </>
      }
      secondary={{
        label: "Torna al login",
        onPress: () => navigation.goBack(),
      }}
    />
  );
}

const styles = StyleSheet.create({
  sentCard: {
    alignItems: "flex-start",
    gap: 12,
  },
  sentEmail: {
    color: "#0B1A3A",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  sentHint: {
    color: "rgba(11,26,58,0.62)",
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: "500",
  },
});
