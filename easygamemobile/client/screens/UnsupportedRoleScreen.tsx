import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuthContext } from "@/contexts/AuthContext";
import { Spacing } from "@/constants/theme";

/**
 * Il gate per i ruoli non ancora supportati dalla V1 mobile (solo Trainer e
 * Parent). Owner, Club Manager, Collaborator, Staff non-Trainer, Athlete e
 * ruoli di club personalizzati diversi da Trainer arrivano tutti qui,
 * intercettati centralmente da `RootStackNavigator` — non da questa
 * schermata, che si limita a mostrare l'avviso e le due uscite possibili.
 */
export default function UnsupportedRoleScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { clearContext, logout } = useAuthContext();

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + Spacing["4xl"],
            paddingBottom: insets.bottom + Spacing["2xl"],
          },
        ]}
      >
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: theme.backgroundSecondary },
          ]}
        >
          <Ionicons name="construct-outline" size={40} color={theme.primary} />
        </View>

        <ThemedText type="h2" style={styles.centeredText}>
          EasyGame Mobile è in aggiornamento
        </ThemedText>
        <ThemedText
          type="body"
          style={[
            styles.centeredText,
            styles.message,
            { color: theme.textSecondary },
          ]}
        >
          {
            "Questa area non è ancora disponibile nell'app mobile. Stiamo lavorando per renderla disponibile presto."
          }
        </ThemedText>

        <View style={styles.actions}>
          <Button onPress={() => void clearContext()} fullWidth>
            Torna alla selezione
          </Button>
          <Button variant="ghost" onPress={() => void logout()} fullWidth>
            Esci
          </Button>
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing["3xl"],
    gap: Spacing.md,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  centeredText: { textAlign: "center" },
  message: { marginBottom: Spacing["2xl"] },
  actions: { width: "100%", gap: Spacing.sm },
});
