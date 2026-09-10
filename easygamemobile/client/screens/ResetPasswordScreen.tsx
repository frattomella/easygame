import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
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
 */
export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
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
      <KeyboardAwareScrollViewCompat
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing["3xl"] },
        ]}
      >
        <View style={styles.icon}>
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={Colors.light.destructive}
          />
        </View>
        <ThemedText type="h3" style={styles.centeredText}>
          Link non valido
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.centeredText, { color: theme.textSecondary }]}
        >
          Il link di reset è incompleto o è stato modificato.
        </ThemedText>
        <Button
          onPress={() =>
            navigation.reset({ index: 0, routes: [{ name: "Login" }] })
          }
          fullWidth
        >
          Torna al login
        </Button>
      </KeyboardAwareScrollViewCompat>
    );
  }

  if (state === "success") {
    return (
      <KeyboardAwareScrollViewCompat
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing["3xl"] },
        ]}
      >
        <Animated.View entering={FadeInDown.duration(300)} style={styles.icon}>
          <Ionicons
            name="checkmark-circle"
            size={40}
            color={Colors.light.success}
          />
        </Animated.View>
        <ThemedText type="h3" style={styles.centeredText}>
          Password aggiornata
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.centeredText, { color: theme.textSecondary }]}
        >
          {message} Accedi con la nuova password.
        </ThemedText>
        <Button
          onPress={() =>
            navigation.reset({ index: 0, routes: [{ name: "Login" }] })
          }
          fullWidth
        >
          Vai al login
        </Button>
      </KeyboardAwareScrollViewCompat>
    );
  }

  if (state === "token_invalid") {
    return (
      <KeyboardAwareScrollViewCompat
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing["3xl"] },
        ]}
      >
        <View style={styles.icon}>
          <Ionicons
            name="time-outline"
            size={40}
            color={Colors.light.warning}
          />
        </View>
        <ThemedText type="h3" style={styles.centeredText}>
          Link non più valido
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.centeredText, { color: theme.textSecondary }]}
        >
          {message} Puoi richiederne uno nuovo.
        </ThemedText>
        <Button
          onPress={() =>
            navigation.reset({ index: 0, routes: [{ name: "ForgotPassword" }] })
          }
          fullWidth
        >
          Richiedi un nuovo link
        </Button>
        <Button
          variant="ghost"
          onPress={() =>
            navigation.reset({ index: 0, routes: [{ name: "Login" }] })
          }
          fullWidth
        >
          Torna al login
        </Button>
      </KeyboardAwareScrollViewCompat>
    );
  }

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
        Scegli una nuova password
      </ThemedText>
      <ThemedText
        type="body"
        style={[
          styles.centeredText,
          styles.subtitle,
          { color: theme.textSecondary },
        ]}
      >
        Il link è valido una sola volta.
      </ThemedText>

      {state === "rate_limited" ? (
        <ThemedText
          type="small"
          style={[styles.centeredText, { color: Colors.light.destructive }]}
        >
          {message}
        </ThemedText>
      ) : null}

      <Input
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
        onRightIconPress={() => setShowPassword(!showPassword)}
      />
      <Input
        label="Conferma password"
        placeholder="Ripeti la password"
        value={confirmPassword}
        onChangeText={(value) => {
          setConfirmPassword(value);
          setFieldError("");
        }}
        secureTextEntry={!showPassword}
        leftIcon="shield-checkmark-outline"
        error={fieldError || undefined}
      />

      <Button onPress={handleSubmit} loading={state === "loading"} fullWidth>
        Imposta la nuova password
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
});
