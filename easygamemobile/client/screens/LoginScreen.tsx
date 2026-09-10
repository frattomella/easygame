import React, { useEffect, useState } from "react";
import { View, StyleSheet, Image, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuthContext } from "@/contexts/AuthContext";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EASYGAME_APP_NAME, EASYGAME_LOGO } from "@/constants/branding";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";

type Navigation = NativeStackNavigationProp<RootStackParamList, "Login">;

/**
 * Solo login: stesso backend, stesso account, stessa sessione della Web App
 * (`POST /api/v1/auth/login`). Registrazione, verifica OTP e recupero
 * password vivono in schermate dedicate — vedi `RegisterScreen`,
 * `VerifyOtpScreen`, `ForgotPasswordScreen`.
 */
export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
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
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + Spacing["4xl"],
          paddingBottom: insets.bottom + Spacing["2xl"],
        },
      ]}
    >
      <Animated.View
        entering={FadeInDown.delay(100).duration(600)}
        style={styles.logoContainer}
      >
        <Pressable
          style={[
            styles.logoWrapper,
            { backgroundColor: Colors.light.primary },
          ]}
          onLongPress={toggleServerConfig}
        >
          <Image
            source={{ uri: EASYGAME_LOGO }}
            style={styles.logo}
            resizeMode="contain"
          />
        </Pressable>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(200).duration(600)}
        style={styles.titleContainer}
      >
        <ThemedText type="h1" style={styles.title}>
          {EASYGAME_APP_NAME}
        </ThemedText>
        <ThemedText
          type="body"
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          Accesso account e dashboard EasyGame
        </ThemedText>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(300).duration(600)}
        style={styles.formContainer}
      >
        <Input
          label="Email"
          placeholder="coach@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          leftIcon="mail-outline"
        />

        <Input
          label="Password"
          placeholder="La tua password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          leftIcon="lock-closed-outline"
          rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
          onRightIconPress={() => setShowPassword(!showPassword)}
        />

        <ThemedText
          type="link"
          onPress={() => navigation.navigate("ForgotPassword")}
          style={styles.forgotLink}
        >
          Password dimenticata?
        </ThemedText>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons
              name="alert-circle"
              size={16}
              color={Colors.light.destructive}
            />
            <ThemedText
              type="small"
              style={[styles.errorText, { color: Colors.light.destructive }]}
            >
              {error}
            </ThemedText>
          </View>
        ) : null}

        <Button
          onPress={handleSubmit}
          loading={loading}
          fullWidth
          style={styles.loginButton}
        >
          Accedi
        </Button>

        <View style={styles.footer}>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Non hai un account?
          </ThemedText>
          <ThemedText
            type="link"
            onPress={() => navigation.navigate("Register")}
            style={styles.footerLink}
          >
            Crea account
          </ThemedText>
        </View>

        <Animated.View style={animatedConfigStyle}>
          <ThemedText
            type="small"
            style={[styles.devLabel, { color: theme.textSecondary }]}
          >
            Configurazione tecnica backend
          </ThemedText>
          <Input
            placeholder="https://api.example.com"
            value={serverUrl}
            onChangeText={setServerUrl}
            keyboardType="url"
            autoCapitalize="none"
            leftIcon="globe-outline"
          />
        </Animated.View>
      </Animated.View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing["2xl"],
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: Spacing["3xl"],
  },
  logoWrapper: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius["2xl"],
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 70,
    height: 70,
  },
  titleContainer: {
    alignItems: "center",
    marginBottom: Spacing["4xl"],
  },
  title: {
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  formContainer: {
    flex: 1,
  },
  forgotLink: {
    textAlign: "right",
    marginBottom: Spacing.lg,
  },
  loginButton: {
    marginTop: Spacing.sm,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  errorText: {
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xs,
    marginTop: Spacing.xl,
  },
  footerLink: {
    fontWeight: "700",
  },
  devLabel: {
    textAlign: "center",
    marginTop: Spacing["3xl"],
    marginBottom: Spacing.sm,
  },
});
