import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuthContext } from "@/contexts/AuthContext";
import { Spacing } from "@/constants/theme";

/**
 * Struttura minima dell'area Parent: il ruolo e gia riconosciuto e instradato
 * correttamente da `RootStackNavigator`, ma le funzionalita dedicate
 * (figli, allenamenti, pagamenti, documenti — vedi il report del WP)
 * arrivano nei prossimi Work Package. Questa schermata non anticipa nulla di
 * quel lavoro: mostra solo il contesto attivo e i comandi di base
 * (cambio club, uscita) che ogni area deve avere fin da subito.
 */
export default function ParentHomeScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user, currentClub, clearContext, logout } = useAuthContext();

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing["2xl"],
            paddingBottom: insets.bottom + Spacing["2xl"],
          },
        ]}
      >
        <View style={styles.header}>
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: theme.backgroundSecondary },
            ]}
          >
            <Ionicons name="people-outline" size={32} color={theme.primary} />
          </View>
          <ThemedText type="h3">Area Genitore</ThemedText>
          <ThemedText
            type="body"
            style={[styles.centeredText, { color: theme.textSecondary }]}
          >
            Le funzionalità dedicate ai genitori arriveranno presto in questa
            app.
          </ThemedText>
        </View>

        <Card style={styles.card}>
          <View style={styles.cardRow}>
            <Avatar name={user?.name} size={44} />
            <View style={styles.cardInfo}>
              <ThemedText type="body" style={styles.cardTitle}>
                {user?.name || "Il tuo account"}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {currentClub?.name || "Club collegato"}
              </ThemedText>
            </View>
          </View>
        </Card>

        <View style={styles.actions}>
          <Button
            variant="outline"
            onPress={() => void clearContext()}
            fullWidth
          >
            Cambia club o accesso
          </Button>
          <Button variant="ghost" onPress={() => void logout()} fullWidth>
            Esci
          </Button>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: Spacing["2xl"], gap: Spacing.lg },
  header: { alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.lg },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  centeredText: { textAlign: "center" },
  card: { marginBottom: Spacing.sm },
  cardRow: { flexDirection: "row", alignItems: "center" },
  cardInfo: { flex: 1, marginLeft: Spacing.md },
  cardTitle: { fontWeight: "700" },
  actions: { gap: Spacing.sm },
});
