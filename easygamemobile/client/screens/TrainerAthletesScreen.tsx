import React, { useCallback, useDeferredValue, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { ThemedText } from "@/components/ThemedText";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import {
  getAthleteStatusLabel,
  getAthleteStatusVariant,
} from "@/lib/mobile-ui";
import { Athlete } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Spacing } from "@/constants/theme";
import { AthletesStackParamList } from "@/navigation/AthletesStackNavigator";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

export default function TrainerAthletesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<AthletesStackParamList>>();
  const { assignedCategories } = useAuthContext();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const deferredQuery = useDeferredValue(searchQuery);

  const loadData = useCallback(async () => {
    const nextAthletes = await mobileBackendStorage.getAthletes();
    setAthletes(nextAthletes);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filteredAthletes = useMemo(() => {
    if (!deferredQuery.trim()) {
      return athletes;
    }

    const normalized = deferredQuery.trim().toLowerCase();
    return athletes.filter((athlete) =>
      [athlete.name, athlete.category, athlete.position, athlete.number]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [athletes, deferredQuery]);

  return (
    <ScrollView
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={{
          paddingTop: Spacing.lg,
          paddingBottom: tabBarHeight + insets.bottom + Spacing["4xl"],
          paddingHorizontal: Spacing.lg,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Card style={styles.searchCard}>
          <ThemedText type="h4" style={{ marginBottom: Spacing.sm }}>
            Rosa atleta
          </ThemedText>
          <ThemedText
            type="small"
            style={{ color: theme.textSecondary, marginBottom: Spacing.md }}
          >
            Vedi solo gli atleti delle categorie assegnate e apri la scheda
            completa in una pagina dedicata.
          </ThemedText>
          <Input
            placeholder="Cerca atleta, categoria o numero..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon="search-outline"
            rightIcon={searchQuery ? "close-circle" : undefined}
            onRightIconPress={() => setSearchQuery("")}
            style={{ marginBottom: 0 }}
          />
          <View style={styles.badgeWrap}>
            {assignedCategories.length > 0 ? (
              assignedCategories.map((category) => (
                <Badge key={category.id} label={category.name} small />
              ))
            ) : (
              <Badge label="Nessuna categoria assegnata" variant="warning" small />
            )}
          </View>
        </Card>

        {filteredAthletes.length > 0 ? (
          filteredAthletes.map((athlete) => (
            <Card
              key={athlete.id}
              style={styles.athleteCard}
              onPress={() =>
                navigation.navigate("AthleteProfile", { athleteId: athlete.id })
              }
            >
              <View style={styles.athleteRow}>
                <Avatar
                  name={athlete.name}
                  size={48}
                  showNumber
                  number={athlete.number}
                />
                <View style={styles.athleteInfo}>
                  <ThemedText type="body" style={styles.athleteName}>
                    {athlete.name}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {athlete.category} · {athlete.position || "Ruolo da definire"}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Tocca per aprire la scheda atleta completa
                  </ThemedText>
                </View>
                <Badge
                  label={getAthleteStatusLabel(athlete.status)}
                  variant={getAthleteStatusVariant(athlete.status)}
                  small
                />
              </View>
            </Card>
          ))
        ) : (
          <Card>
            <ThemedText type="body" style={{ marginBottom: Spacing.xs }}>
              Nessun atleta trovato
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              Prova a cambiare ricerca oppure verifica che il trainer abbia
              categorie e atleti associati.
            </ThemedText>
          </Card>
        )}
      </ScrollView>


  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchCard: { marginBottom: Spacing.lg },
  badgeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  athleteCard: { marginBottom: Spacing.md },
  athleteRow: { flexDirection: "row", alignItems: "center" },
  athleteInfo: { flex: 1, marginLeft: Spacing.md, gap: 2 },
  athleteName: { fontWeight: "700", marginBottom: 2 },
});
