import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useAuthContext } from "@/contexts/AuthContext";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { VerificationChannel, VerificationInfo } from "@/lib/auth-flow";
import { Spacing } from "@/constants/theme";
import {
  ActionButton,
  BrandStateLayout,
  SignatureInput,
  SignatureText,
} from "@/components/signature";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Navigation = NativeStackNavigationProp<RootStackParamList, "VerifyOtp">;
type Route = RouteProp<RootStackParamList, "VerifyOtp">;

/**
 * Codice di anteprima che il backend restituisce **solo** fuori produzione
 * (`AUTH_ALLOW_TEST_CODES=true`, mai in produzione). Qui serve a una cosa
 * sola: precompilare il campo per chi sviluppa, senza saltare la schermata —
 * la persona lo vede, lo puo cambiare, e deve comunque premere «Verifica».
 */
const readDevPreviewCode = (
  verification: VerificationInfo | null | undefined,
  channel: VerificationChannel,
): string | null => {
  if (!__DEV__ || !verification) return null;
  const raw = verification as unknown as {
    emailPreviewCode?: string | null;
    phonePreviewCode?: string | null;
  };
  return (
    (channel === "email" ? raw.emailPreviewCode : raw.phonePreviewCode) || null
  );
};

const channelLabel = (channel: VerificationChannel) =>
  channel === "email" ? "email" : "cellulare";

/**
 * v3.0 (`migration-v3.md` passo 7): su `BrandStateLayout`, stesso registro di
 * `LoginScreen`/`RegisterScreen` — stesso backend, stesso flusso (nessuna
 * riga di logica cambiata rispetto alla veste precedente).
 */
export default function VerifyOtpScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const { refresh } = useAuthContext();

  const [reference] = useState(route.params.reference);
  const [channel, setChannel] = useState<VerificationChannel>(
    route.params.channel,
  );
  const [verification, setVerification] = useState<VerificationInfo>(
    route.params.verification,
  );
  const [code, setCode] = useState(
    readDevPreviewCode(route.params.verification, route.params.channel) || "",
  );
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [countdown, setCountdown] = useState(0);

  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current);
    },
    [],
  );

  const startCountdown = (seconds: number) => {
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    setCountdown(seconds);
    countdownTimer.current = setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          if (countdownTimer.current) clearInterval(countdownTimer.current);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  const maskedTarget =
    channel === "email" ? verification.email : verification.phone;

  const handleVerify = async () => {
    if (!code.trim()) {
      setError("Inserisci il codice ricevuto.");
      return;
    }

    setError("");
    setInfo("");
    setLoading(true);
    try {
      const outcome =
        channel === "email"
          ? await mobileBackendStorage.confirmEmailVerification(
              reference,
              code.trim(),
            )
          : await mobileBackendStorage.confirmPhoneVerification(
              reference,
              code.trim(),
            );

      if (outcome.kind === "authenticated") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await refresh();
        return;
      }

      if (outcome.kind === "verification_required") {
        if (outcome.channel !== channel) {
          // Un canale e stato confermato, ne resta un altro (es. email fatta,
          // manca il telefono): si passa al passo successivo e si manda
          // subito il primo codice di quel canale, che questa risposta non
          // invia da sola.
          setChannel(outcome.channel);
          setVerification(outcome.verification);
          setCode(
            readDevPreviewCode(outcome.verification, outcome.channel) || "",
          );
          setFailedAttempts(0);
          setInfo(
            `Indirizzo confermato. Ora verifica il tuo ${channelLabel(
              outcome.channel,
            )}.`,
          );
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          void handleResend(outcome.channel, outcome.verification.userId);
          return;
        }

        setError("Codice non valido o scaduto.");
        setFailedAttempts((count) => count + 1);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      if (outcome.kind === "rate_limited") {
        setError(outcome.message);
        if (outcome.retryAfterSeconds)
          startCountdown(outcome.retryAfterSeconds);
      } else {
        setError(outcome.message);
        setFailedAttempts((count) => count + 1);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Errore di connessione",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (
    targetChannel: VerificationChannel = channel,
    targetReference: string = reference,
  ) => {
    setResending(true);
    setError("");
    setInfo("");
    try {
      const outcome =
        targetChannel === "email"
          ? await mobileBackendStorage.resendEmailVerification(targetReference)
          : await mobileBackendStorage.resendPhoneVerification(targetReference);

      if (outcome.kind === "sent") {
        setInfo("Codice inviato. Controlla la tua casella o il telefono.");
        startCountdown(60);
      } else if (outcome.kind === "rate_limited") {
        setError(outcome.message);
        if (outcome.retryAfterSeconds)
          startCountdown(outcome.retryAfterSeconds);
      } else {
        setError(outcome.message);
      }
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : "Errore di connessione",
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <BrandStateLayout>
      <Animated.View
        entering={FadeInDown.delay(100).duration(600)}
        style={styles.iconWrap}
      >
        <Ionicons
          name={channel === "email" ? "mail-outline" : "chatbubble-outline"}
          size={36}
          color="#FFFFFF"
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(160).duration(600)}>
        <SignatureText
          variant="display"
          tone="onDark"
          style={styles.centeredText}
        >
          Verifica il tuo {channelLabel(channel)}
        </SignatureText>
        <SignatureText
          variant="body"
          tone="onDarkMuted"
          style={[styles.centeredText, styles.subtitle]}
        >
          {maskedTarget
            ? `Abbiamo inviato un codice a ${maskedTarget}.`
            : "Abbiamo inviato un codice di verifica."}
        </SignatureText>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(220).duration(600)}
        style={styles.formContainer}
      >
        <SignatureInput
          label="Codice di verifica"
          placeholder="123456"
          value={code}
          onChangeText={(value) => {
            setCode(value.replace(/[^0-9]/g, "").slice(0, 6));
            setError("");
          }}
          keyboardType="number-pad"
          maxLength={6}
          leftIcon="keypad-outline"
          style={styles.field}
        />

        {info ? (
          <View style={styles.infoRow}>
            <Ionicons name="checkmark-circle" size={16} color="#86EFAC" />
            <SignatureText variant="small" style={styles.infoText}>
              {info}
            </SignatureText>
          </View>
        ) : null}

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

        {failedAttempts >= 3 ? (
          <SignatureText
            variant="small"
            tone="onDarkMuted"
            style={styles.centeredText}
          >
            Se il problema persiste, richiedi un nuovo codice.
          </SignatureText>
        ) : null}

        <ActionButton
          variant="primary"
          onSky
          onPress={() => void handleVerify()}
          loading={loading}
          fullWidth
          style={styles.submitButton}
        >
          Verifica
        </ActionButton>

        <ActionButton
          variant="secondary"
          onSky
          onPress={() => void handleResend()}
          loading={resending}
          disabled={countdown > 0}
          fullWidth
        >
          {countdown > 0 ? `Rinvia codice (${countdown}s)` : "Rinvia codice"}
        </ActionButton>

        <ActionButton
          variant="secondary"
          onSky
          onPress={() => navigation.goBack()}
          fullWidth
        >
          Torna indietro
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
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    justifyContent: "center",
  },
  infoText: {
    color: "#86EFAC",
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
