import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Haptics from "expo-haptics";

import { useAuthContext } from "@/contexts/AuthContext";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { VerificationChannel, VerificationInfo } from "@/lib/auth-flow";
import { EGCorner, EGGlass } from "@/constants/theme";
import { ActionButton, AuthFrame, SignatureText } from "@/components/signature";
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
 * Composizione: prototipo `isOtp` / design §3a — sei celle 48×56 su vetro
 * forte (la cella attiva con anello blu, tutte rosse su codice non valido),
 * CTA "Verifica" a gradiente, sotto "Riprova tra 0:42" o "Richiedi un nuovo
 * codice". L'input reale e uno solo, nascosto dietro le celle: il sistema
 * puo compilarlo dall'SMS (`oneTimeCode`). Stesso backend, stesso flusso.
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
  const inputRef = useRef<TextInput>(null);

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

  const cells = Array.from({ length: 6 }, (_, index) => code[index] || "");
  const activeCell = Math.min(code.length, 5);
  const invalid = Boolean(error) && !info;

  return (
    <AuthFrame
      step="2 di 3"
      eyebrow="Verifica"
      title="Inserisci il codice"
      body={
        maskedTarget
          ? `Abbiamo inviato sei cifre a ${maskedTarget}`
          : `Abbiamo inviato sei cifre al tuo ${channelLabel(channel)}.`
      }
      note={info || undefined}
      error={error || undefined}
      card={
        <>
          <Pressable
            onPress={() => inputRef.current?.focus()}
            accessibilityRole="button"
            accessibilityLabel="Inserisci il codice di verifica"
            style={styles.cells}
          >
            {cells.map((value, index) => {
              const active = index === activeCell && !invalid;
              return (
                <View
                  key={index}
                  style={[
                    styles.cell,
                    active ? styles.cellActive : null,
                    invalid ? styles.cellInvalid : null,
                  ]}
                >
                  <SignatureText style={styles.cellValue}>
                    {value}
                  </SignatureText>
                </View>
              );
            })}
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={(value) => {
                setCode(value.replace(/[^0-9]/g, "").slice(0, 6));
                setError("");
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              caretHidden
              style={styles.hiddenInput}
              accessibilityLabel="Codice di verifica"
            />
          </Pressable>
          {failedAttempts >= 3 ? (
            <SignatureText style={styles.hint}>
              Se il problema persiste, richiedi un nuovo codice.
            </SignatureText>
          ) : null}
          <ActionButton
            variant="primary"
            fullWidth
            trailingIcon="arrow-forward"
            onPress={() => void handleVerify()}
            loading={loading}
            disabled={code.length < 6}
          >
            Verifica
          </ActionButton>
          <Pressable
            onPress={
              countdown > 0 || resending ? undefined : () => void handleResend()
            }
            disabled={countdown > 0 || resending}
            hitSlop={8}
            accessibilityRole="button"
            style={styles.resend}
          >
            <SignatureText
              style={[
                styles.resendText,
                countdown > 0 ? null : styles.resendTextActive,
              ]}
            >
              {resending
                ? "Invio in corso…"
                : countdown > 0
                  ? `Riprova tra ${formatCountdown(countdown)}`
                  : "Richiedi un nuovo codice"}
            </SignatureText>
          </Pressable>
        </>
      }
      secondary={{
        label: "Torna indietro",
        onPress: () => navigation.goBack(),
      }}
    />
  );
}

const formatCountdown = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const styles = StyleSheet.create({
  cells: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  cell: {
    flex: 1,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: EGGlass.bgStrong,
    borderWidth: 1,
    borderColor: EGGlass.hairlineStrong,
    ...EGCorner.control,
  },
  cellActive: {
    borderColor: "#2563EB",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
  },
  cellInvalid: {
    borderColor: "#EF4444",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 2,
  },
  cellValue: {
    color: "#0B1A3A",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  hiddenInput: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
  },
  hint: {
    color: "rgba(11,26,58,0.62)",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "500",
    textAlign: "center",
  },
  resend: {
    alignSelf: "center",
    paddingVertical: 2,
  },
  resendText: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  resendTextActive: {
    color: "#1D4ED8",
    fontWeight: "700",
  },
});
