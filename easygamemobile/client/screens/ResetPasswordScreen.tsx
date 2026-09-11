import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  ActionButton,
  AuthFrame,
  IconChip,
  SignatureInput,
} from "@/components/signature";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Navigation = NativeStackNavigationProp<
  RootStackParamList,
  "ResetPassword"
>;
type Route = RouteProp<RootStackParamList, "ResetPassword">;

type ScreenState =
  | "form"
  | "loading"
  | "success"
  | "token_invalid"
  | "rate_limited";

/**
 * Completamento nativo del reset password (WP11). Stesso endpoint della Web
 * App e di `ForgotPasswordScreen` (`POST /api/v1/auth/password/reset`):
 * nessuna logica di dominio duplicata, questa schermata classifica solo la
 * risposta con `interpretPasswordResetResponse`.
 *
 * Raggiunta da un deep link (`easygame://reset-password?uid=...&token=...`)
 * — vedi `client/lib/deep-linking.ts` — sempre disponibile in
 * `RootStackNavigator` a prescindere dallo stato di login: il reset non
 * richiede una sessione, e se l'account gia collegato su questo dispositivo
 * e quello che si sta reimpostando, il completamento revoca comunque tutte
 * le sue sessioni lato server (compresa questa), che al prossimo giro
 * riporta l'app al login da sola.
 *
 * **Token invalido, scaduto o gia usato sono un unico stato.** Il server
 * risponde con la stessa frase per tutti e tre di proposito (vedi
 * `interpretPasswordResetResponse`): mostrarli distinti qui ricostruirebbe
 * lato client l'oracolo che quella scelta serve a chiudere.
 *
 * Composizione: design §3a (terzo artboard, "Nuova password") — la stessa
 * `AuthFrame` delle altre schermate di accesso, con la conferma che segnala
 * inline "Le password non coincidono"; gli stati di esito (link incompleto,
 * scaduto, riuscito) restano sullo stesso telaio con un'azione sola.
 */
export default function ResetPasswordScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();

  const userId = route.params?.userId || "";
  const token = route.params?.token || "";
  const linkIsPresent = Boolean(userId && token);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<ScreenState>("form");
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState("");

  const handleSubmit = async () => {
    setFieldError("");

    if (!password) {
      setFieldError("Inserisci la nuova password.");
      return;
    }
    if (password !== confirmPassword) {
      setFieldError("Le due password non coincidono.");
      return;
    }

    setState("loading");
    try {
      const outcome = await mobileBackendStorage.resetPassword(
        userId,
        token,
        password,
      );

      switch (outcome.kind) {
        case "success":
          setMessage(outcome.message);
          setState("success");
          break;
        case "token_invalid":
          setMessage(outcome.message);
          setState("token_invalid");
          break;
        case "rate_limited":
          setMessage(outcome.message);
          setState("rate_limited");
          break;
        case "policy_error":
          setFieldError(outcome.message);
          setState("form");
          break;
        default:
          setFieldError(outcome.message);
          setState("form");
      }
    } catch (error) {
      setFieldError(
        error instanceof Error ? error.message : "Errore di connessione",
      );
      setState("form");
    }
  };

  const goToLogin = () =>
    navigation.reset({ index: 0, routes: [{ name: "Login" }] });

  if (!linkIsPresent) {
    return (
      <AuthFrame
        step="Nuova password"
        eyebrow="Link non valido"
        title="Il link di reset è incompleto"
        body="Il link è incompleto o è stato modificato. Richiedine uno nuovo dal login."
        secondary={{ label: "Torna al login", onPress: goToLogin }}
      />
    );
  }

  if (state === "success") {
    return (
      <AuthFrame
        step="Nuova password"
        eyebrow="Fatto"
        title="Password aggiornata"
        body={`${message} Accedi con la nuova password.`}
        card={
          <View style={styles.doneCard}>
            <IconChip name="checkmark-circle" color="#15803D" size={52} />
            <ActionButton
              variant="primary"
              fullWidth
              trailingIcon="arrow-forward"
              onPress={goToLogin}
            >
              Vai al login
            </ActionButton>
          </View>
        }
      />
    );
  }

  if (state === "token_invalid") {
    return (
      <AuthFrame
        step="Nuova password"
        eyebrow="Link non più valido"
        title="Richiedi un nuovo link"
        body={`${message} Puoi richiederne uno nuovo.`}
        card={
          <ActionButton
            variant="primary"
            fullWidth
            trailingIcon="arrow-forward"
            onPress={() =>
              navigation.reset({
                index: 0,
                routes: [{ name: "ForgotPassword" }],
              })
            }
          >
            Richiedi un nuovo link
          </ActionButton>
        }
        secondary={{ label: "Torna al login", onPress: goToLogin }}
      />
    );
  }

  return (
    <AuthFrame
      step="Nuova password"
      eyebrow="Nuova password"
      title="Scegli una nuova password"
      body="Il link è valido una sola volta."
      error={state === "rate_limited" ? message : fieldError || undefined}
      card={
        <>
          <SignatureInput
            label="Nuova password"
            placeholder="Almeno 12 caratteri"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setFieldError("");
            }}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
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
            onChangeText={(value) => {
              setConfirmPassword(value);
              setFieldError("");
            }}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
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
            loading={state === "loading"}
          >
            Salva password
          </ActionButton>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  doneCard: {
    alignItems: "flex-start",
    gap: 14,
  },
});
