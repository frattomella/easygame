import React, { useEffect, useState } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeInDown,
} from "react-native-reanimated";

import { useAuthContext } from "@/contexts/AuthContext";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EASYGAME_APP_NAME } from "@/constants/branding";
import { Spacing } from "@/constants/theme";
import {
  ActionButton,
  BrandStateLayout,
  SignatureInput,
  SignatureText,
} from "@/components/signature";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Navigation = NativeStackNavigationProp<RootStackParamList, "Login">;

/**
 * Solo login: stesso backend, stesso account, stessa sessione della Web App
 * (`POST /api/v1/auth/login`). Registrazione, verifica OTP e recupero
 * password vivono in schermate dedicate — vedi `RegisterScreen`,
 * `VerifyOtpScreen`, `ForgotPasswordScreen`.
 *
 * v3.0 (`migration-v3.md` passo 7): su `BrandStateLayout` — cielo pieno,
 * mai il quadrato con gradiente attorno al marchio (regola di brand
 * CLAUDE.md, "no unnecessary gradient tile around the icon"): il marchio
 * vive solo nel watermark del fondo, il titolo resta testo puro.
 */
export default function LoginScreen() {
  const navigation = useNavigation<Navigation>();
  const { login } = useAuthContext();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDeveloperConfig, setShowDeveloperConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const configHeight = useSharedValue(0);

  const animatedConfigStyle = useAnimatedStyle(() => ({
    height: configHeight.value,
    overflow: "hidden",
  }));

  useEffect(() => {
    void mobileBackendStorage.getServerUrl().then((value) => {
      if (value) {
        setServerUrl(value);
      }
    });
  }, []);

  const toggleServerConfig = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowDeveloperConfig(!showDeveloperConfig);
    configHeight.value = withSpring(showDeveloperConfig ? 0 : 100, {
      damping: 15,
      stiffness: 100,
    });
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      setError("Inserisci email e password");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (serverUrl.trim()) {
        await mobileBackendStorage.setServerUrl(serverUrl.trim());
      }

      const outcome = await login(email, password);

      if (outcome.kind === "authenticated") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      if (outcome.kind === "verification_required") {
        navigation.navigate("VerifyOtp", {
          reference: outcome.verification.userId,
          channel: outcome.channel,
          purpose: "login",
          verification: outcome.verification,
        });
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
      <Animated.View
        entering={FadeInDown.delay(100).duration(600)}
        style={styles.titleContainer}
      >
        <Pressable onLongPress={toggleServerConfig}>
          <SignatureText
            variant="eyebrow"
            tone="onDarkMuted"
            style={styles.centeredText}
          >
            Benvenuto su
          </SignatureText>
        </Pressable>
        <SignatureText
          variant="display"
          tone="onDark"
          style={[styles.title, styles.centeredText]}
        >
          {EASYGAME_APP_NAME}
        </SignatureText>
        <SignatureText
          variant="body"
          tone="onDarkMuted"
          style={styles.centeredText}
        >
          Accesso account e dashboard EasyGame
        </SignatureText>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(200).duration(600)}
        style={styles.formContainer}
      >
        <SignatureInput
          label="Email"
          placeholder="coach@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          leftIcon="mail-outline"
          style={styles.field}
        />

        <SignatureInput
          label="Password"
          placeholder="La tua password"
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

        <Pressable
          onPress={() => navigation.navigate("ForgotPassword")}
          style={styles.forgotLink}
        >
          <SignatureText variant="small" style={styles.forgotLinkText}>
            Password dimenticata?
          </SignatureText>
        </Pressable>

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
          style={styles.loginButton}
        >
          Accedi
        </ActionButton>

        <View style={styles.footer}>
          <SignatureText variant="small" tone="onDarkMuted">
            Non hai un account?
          </SignatureText>
          <Pressable onPress={() => navigation.navigate("Register")}>
            <SignatureText variant="small" style={styles.footerLink}>
              Crea account
            </SignatureText>
          </Pressable>
        </View>

        <Animated.View style={animatedConfigStyle}>
          <SignatureText variant="small" style={styles.devLabel}>
            Configurazione tecnica backend
          </SignatureText>
          <SignatureInput
            placeholder="https://api.example.com"
            value={serverUrl}
            onChangeText={setServerUrl}
            keyboardType="url"
            autoCapitalize="none"
            leftIcon="globe-outline"
          />
        </Animated.View>
      </Animated.View>
    </BrandStateLayout>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    alignItems: "center",
    marginTop: Spacing["2xl"],
    marginBottom: Spacing["4xl"],
    gap: 4,
  },
  title: {
    marginVertical: 2,
  },
  centeredText: {
    textAlign: "center",
  },
  formContainer: {
    gap: Spacing.md,
  },
  field: {
    marginBottom: 0,
  },
  forgotLink: {
    alignSelf: "flex-end",
  },
  forgotLinkText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  loginButton: {
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
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  footerLink: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  devLabel: {
    textAlign: "center",
    marginTop: Spacing["3xl"],
    marginBottom: Spacing.sm,
    color: "rgba(255,255,255,0.72)",
  },
});
