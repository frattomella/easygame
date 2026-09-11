import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
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
 * v3.0 (`migration-v3.md` passo 7): tutti e quattro gli stati su
 * `BrandStateLayout`, stesso registro delle altre schermate auth.
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

  if (!linkIsPresent) {
    return (
      <BrandStateLayout scrollable={false}>
        <View style={styles.centeredContent}>
          <View style={styles.iconWrap}>
            <Ionicons name="alert-circle-outline" size={36} color="#FCA5A5" />
          </View>
          <SignatureText
            variant="display"
            tone="onDark"
            style={styles.centeredText}
          >
            Link non valido
          </SignatureText>
          <SignatureText
            variant="body"
            tone="onDarkMuted"
            style={[styles.centeredText, styles.subtitle]}
          >
            Il link di reset è incompleto o è stato modificato.
          </SignatureText>
          <ActionButton
            variant="primary"
            onSky
            fullWidth
            style={styles.actionSpacing}
            onPress={() =>
              navigation.reset({ index: 0, routes: [{ name: "Login" }] })
            }
          >
            Torna al login
          </ActionButton>
        </View>
      </BrandStateLayout>
    );
  }

  if (state === "success") {
    return (
      <BrandStateLayout scrollable={false}>
        <View style={styles.centeredContent}>
          <Animated.View
            entering={FadeInDown.duration(300)}
            style={styles.iconWrap}
          >
            <Ionicons name="checkmark-circle" size={36} color="#86EFAC" />
          </Animated.View>
          <SignatureText
            variant="display"
            tone="onDark"
            style={styles.centeredText}
          >
            Password aggiornata
          </SignatureText>
          <SignatureText
            variant="body"
            tone="onDarkMuted"
            style={[styles.centeredText, styles.subtitle]}
          >
            {message} Accedi con la nuova password.
          </SignatureText>
          <ActionButton
            variant="primary"
            onSky
            fullWidth
            style={styles.actionSpacing}
            onPress={() =>
              navigation.reset({ index: 0, routes: [{ name: "Login" }] })
            }
          >
            Vai al login
          </ActionButton>
        </View>
      </BrandStateLayout>
    );
  }

  if (state === "token_invalid") {
    return (
      <BrandStateLayout scrollable={false}>
        <View style={styles.centeredContent}>
          <View style={styles.iconWrap}>
            <Ionicons name="time-outline" size={36} color="#FCD34D" />
          </View>
          <SignatureText
            variant="display"
            tone="onDark"
            style={styles.centeredText}
          >
            Link non più valido
          </SignatureText>
          <SignatureText
            variant="body"
            tone="onDarkMuted"
            style={[styles.centeredText, styles.subtitle]}
          >
            {message} Puoi richiederne uno nuovo.
          </SignatureText>
          <View style={styles.actionSpacing}>
            <ActionButton
              variant="primary"
              onSky
              fullWidth
              onPress={() =>
                navigation.reset({
                  index: 0,
                  routes: [{ name: "ForgotPassword" }],
                })
              }
            >
              Richiedi un nuovo link
            </ActionButton>
            <ActionButton
              variant="secondary"
              onSky
              fullWidth
              style={styles.secondActionSpacing}
              onPress={() =>
                navigation.reset({ index: 0, routes: [{ name: "Login" }] })
              }
            >
              Torna al login
            </ActionButton>
          </View>
        </View>
      </BrandStateLayout>
    );
  }

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
          Scegli una nuova password
        </SignatureText>
        <SignatureText
          variant="body"
          tone="onDarkMuted"
          style={[styles.centeredText, styles.subtitle]}
        >
          Il link è valido una sola volta.
        </SignatureText>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(220).duration(600)}
        style={styles.formContainer}
      >
        {state === "rate_limited" ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color="#FCA5A5" />
            <SignatureText
              variant="small"
              style={[styles.errorText, { flex: 1 }]}
            >
              {message}
            </SignatureText>
          </View>
        ) : null}

        <SignatureInput
          label="Nuova password"
          placeholder="Almeno 12 caratteri"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setFieldError("");
          }}
          secureTextEntry={!showPassword}
          leftIcon="lock-closed-outline"
          rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
          rightIconLabel={
            showPassword ? "Nascondi password" : "Mostra password"
          }
          onRightIconPress={() => setShowPassword(!showPassword)}
          style={styles.field}
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
          leftIcon="shield-checkmark-outline"
          style={styles.field}
        />

        {fieldError ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color="#FCA5A5" />
            <SignatureText
              variant="small"
              style={[styles.errorText, { flex: 1 }]}
            >
              {fieldError}
            </SignatureText>
          </View>
        ) : null}

        <ActionButton
          variant="primary"
          onSky
          onPress={() => void handleSubmit()}
          loading={state === "loading"}
          fullWidth
          style={styles.submitButton}
        >
          Imposta la nuova password
        </ActionButton>
      </Animated.View>
    </BrandStateLayout>
  );
}

const styles = StyleSheet.create({
  centeredContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.md,
  },
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
  actionSpacing: {
    marginTop: Spacing["2xl"],
    width: "100%",
  },
  secondActionSpacing: {
    marginTop: Spacing.sm,
  },
  formContainer: {
    gap: Spacing.md,
    marginTop: Spacing["2xl"],
  },
  field: {
    marginBottom: 0,
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
