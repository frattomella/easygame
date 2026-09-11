import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";

import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  ActionButton,
  AuthFrame,
  SignatureInput,
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
 * Composizione: design `IA e Home` §5a (secondo artboard, "Nuovo
 * account") — stessa `AuthFrame` del login: scheda di vetro con i campi e
 * il CTA a gradiente, nota sui requisiti password, secondario in contorno
 * "Hai già un account? Accedi". Nome e cognome restano due campi (il
 * backend li vuole separati), affiancati sulla stessa riga.
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
    <AuthFrame
      step="Nuovo account"
      eyebrow="Registrazione"
      title="Crea il tuo profilo"
      body="Il club ti collegherà ai tuoi atleti dopo la verifica dell'email."
      error={error || undefined}
      note="Password: almeno 12 caratteri, con maiuscola, minuscola, numero e carattere speciale."
      card={
        <>
          <View style={styles.nameRow}>
            <SignatureInput
              label="Nome"
              placeholder="Marco"
              value={firstName}
              onChangeText={setFirstName}
              autoComplete="given-name"
              leftIcon="person-outline"
              style={styles.nameField}
            />
            <SignatureInput
              label="Cognome"
              placeholder="Rossi"
              value={lastName}
              onChangeText={setLastName}
              autoComplete="family-name"
              style={styles.nameField}
            />
          </View>
          <SignatureInput
            label="Cellulare"
            placeholder="+39 333 0000000"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            leftIcon="call-outline"
          />
          <SignatureInput
            label="Email"
            placeholder="nome@email.it"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            leftIcon="mail-outline"
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
          />
          <SignatureInput
            label="Conferma password"
            placeholder="Ripeti la password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            leftIcon="lock-closed-outline"
            error={
              confirmPassword && password !== confirmPassword
                ? "Le password non coincidono"
                : undefined
            }
          />
          <ActionButton
            variant="primary"
            fullWidth
            trailingIcon="arrow-forward"
            onPress={() => void handleSubmit()}
            loading={loading}
          >
            Crea account
          </ActionButton>
        </>
      }
      secondary={{
        label: "Hai già un account? Accedi",
        onPress: () => navigation.navigate("Login"),
      }}
    />
  );
}

const styles = StyleSheet.create({
  nameRow: {
    flexDirection: "row",
    gap: 10,
  },
  nameField: {
    flex: 1,
    minWidth: 0,
  },
});
