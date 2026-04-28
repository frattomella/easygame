import React, { useEffect, useState } from "react";
import { View, StyleSheet, Image, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { login, refresh } = useAuthContext();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDeveloperConfig, setShowDeveloperConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

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

    if (mode === "register" && password !== confirmPassword) {
      setError("Le password non coincidono");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (mode === "register" && !firstName.trim() && !lastName.trim()) {
      setError("Inserisci almeno nome o cognome");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setError("");
    setSuccessMessage("");
    setLoading(true);

    try {
      if (serverUrl.trim()) {
        await mobileBackendStorage.setServerUrl(serverUrl.trim());
      }
      if (mode === "login") {
        const success = await login(email, password);
        if (!success) {
          setError("Credenziali non valide");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        await mobileBackendStorage.registerAccount({
          email,
          password,
          firstName,
          lastName,
          phone,
        });
        await refresh();
        setSuccessMessage(
          "Account creato correttamente. Se necessario, la verifica è stata completata in automatico per il test.",
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Errore di connessione",
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
        <View
          style={[
            styles.modeSwitcher,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Pressable
            onPress={() => setMode("login")}
            style={[
              styles.modeButton,
              mode === "login"
                ? { backgroundColor: Colors.light.primary }
                : undefined,
            ]}
          >
            <ThemedText
              type="small"
              style={mode === "login" ? styles.modeActiveText : undefined}
            >
              Accedi
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => setMode("register")}
            style={[
              styles.modeButton,
              mode === "register"
                ? { backgroundColor: Colors.light.primary }
                : undefined,
            ]}
          >
            <ThemedText
              type="small"
              style={mode === "register" ? styles.modeActiveText : undefined}
            >
              Registrati
            </ThemedText>
          </Pressable>
        </View>

        {mode === "register" ? (
          <>
            <Input
              label="Nome"
              placeholder="Marco"
              value={firstName}
              onChangeText={setFirstName}
              leftIcon="person-outline"
            />
            <Input
              label="Cognome"
              placeholder="Rossi"
              value={lastName}
              onChangeText={setLastName}
              leftIcon="person-outline"
            />
            <Input
              label="Telefono"
              placeholder="+39 333 0000000"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              leftIcon="call-outline"
            />
          </>
        ) : null}

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

        {mode === "register" ? (
          <Input
            label="Conferma password"
            placeholder="Ripeti la password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            leftIcon="shield-checkmark-outline"
          />
        ) : null}

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

        {successMessage ? (
          <View style={styles.successContainer}>
            <Ionicons
              name="checkmark-circle"
              size={16}
              color={Colors.light.success}
            />
            <ThemedText
              type="small"
              style={[styles.errorText, { color: Colors.light.success }]}
            >
              {successMessage}
            </ThemedText>
          </View>
        ) : null}

        <Button
          onPress={handleSubmit}
          loading={loading}
          fullWidth
          style={styles.loginButton}
        >
          {mode === "login" ? "Accedi" : "Crea account"}
        </Button>

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
  modeSwitcher: {
    flexDirection: "row",
    padding: 4,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.xl,
  },
  modeButton: {
    flex: 1,
    height: 42,
    borderRadius: BorderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  modeActiveText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  loginButton: {
    marginTop: Spacing.lg,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  errorText: {
    flex: 1,
  },
  successContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  devLabel: {
    textAlign: "center",
    marginTop: Spacing["3xl"],
    marginBottom: Spacing.sm,
  },
});
