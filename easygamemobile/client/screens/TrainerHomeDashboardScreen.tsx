import React, { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { format } from "date-fns";

import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ThemedText } from "@/components/ThemedText";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import {
  formatItalianDate,
  formatTimeRange,
  getRoleLabel,
} from "@/lib/mobile-ui";
import { Athlete, Match, Task, Training } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { BorderRadius, Spacing } from "@/constants/theme";

export default function TrainerHomeDashboardScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const {
    currentAccess,
    currentClub,
    currentRole,
    trainerPermissions,
    assignedCategories,
  } = useAuthContext();

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [nextTrainings, nextMatches, nextTasks, nextAthletes] =
      await Promise.all([
        mobileBackendStorage.getTrainings(),
        mobileBackendStorage.getMatches(),
        mobileBackendStorage.getTasks(),
        mobileBackendStorage.getAthletes(),
      ]);
    setTrainings(nextTrainings);
    setMatches(nextMatches);
    setTasks(nextTasks.filter((item) => !item.completed));
    setAthletes(nextAthletes);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const today = format(new Date(), "yyyy-MM-dd");
  const todayTrainings = useMemo(
    () => trainings.filter((training) => training.date === today),
    [today, trainings],
  );
  const todayMatches = useMemo(
    () => matches.filter((match) => match.date === today),
    [matches, today],
  );

  const summaryCards = [
    {
      label: "Atleti Seguiti",
      value: athletes.length,
      color: "#2563EB",
      icon: "people-outline" as const,
    },
    {
      label: "Categorie Attive",
      value:
        assignedCategories.length || currentClub?.categoryItems?.length || 0,
      color: "#10B981",
      icon: "layers-outline" as const,
    },
  ];
  const effectiveRole = currentAccess?.role || currentRole;

  const openTab = (tabName: string) => {
    const parent = navigation.getParent() as any;
    if (parent) {
      parent.navigate(tabName);
    }
  };

  const openTraining = (trainingId: string) => {
    const parent = navigation.getParent() as any;
    if (parent) {
      parent.navigate("TrainingsTab", {
        screen: "Trainings",
        params: { focusTrainingId: trainingId },
      });
    }
  };

  const openMatch = (matchId: string) => {
    const parent = navigation.getParent() as any;
    if (parent) {
      parent.navigate("MatchesTab", {
        screen: "Matches",
        params: { focusMatchId: matchId },
      });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

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
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="h3">Dashboard</ThemedText>
          <ThemedText
            type="small"
            style={{ color: theme.textSecondary, marginTop: 4 }}
          >
            {currentClub?.name || "Club attivo"} · {getRoleLabel(currentRole)}
          </ThemedText>
        </View>
      </View>

      <ThemedText
        type="small"
        style={{ color: theme.textSecondary, marginBottom: Spacing.lg }}
      >
        La tua home mostra solo gli spazi e le azioni abilitate dal club per il
        ruolo {` ${getRoleLabel(effectiveRole)}`}.
      </ThemedText>

      <View style={styles.highlightStack}>
        {trainerPermissions?.widgets.todayTrainings !== false ? (
          <View style={[styles.highlightCard, { backgroundColor: "#7C3AED" }]}>
            <View style={styles.highlightHeader}>
              <ThemedText type="body" style={styles.highlightTitle}>
                Allenamenti di Oggi
              </ThemedText>
              <Badge label={`${todayTrainings.length}`} variant="default" small />
            </View>
            {todayTrainings.length > 0 ? (
              todayTrainings.slice(0, 2).map((training) => (
                <Pressable
                  key={training.id}
                  style={styles.highlightItem}
                  onPress={() => openTraining(training.id)}
                >
                  <ThemedText type="body" style={styles.highlightItemTitle}>
                    {training.title}
                  </ThemedText>
                  <ThemedText type="small" style={styles.highlightMeta}>
                    {formatTimeRange(training.time, training.endTime)} ·{" "}
                    {training.location}
                  </ThemedText>
                </Pressable>
              ))
            ) : (
              <ThemedText type="small" style={styles.highlightMeta}>
                Nessun allenamento programmato per oggi.
              </ThemedText>
            )}
            <Button
              variant="primary"
              size="sm"
              style={styles.lightButton}
              onPress={() => openTab("TrainingsTab")}
            >
              Vai agli Allenamenti
            </Button>
          </View>
        ) : null}

        {trainerPermissions?.widgets.todayMatches !== false ? (
          <View style={[styles.highlightCard, { backgroundColor: "#F97316" }]}>
            <View style={styles.highlightHeader}>
              <ThemedText type="body" style={styles.highlightTitle}>
                Gare di Oggi
              </ThemedText>
              <Badge label={`${todayMatches.length}`} variant="default" small />
            </View>
            {todayMatches.length > 0 ? (
              todayMatches.slice(0, 2).map((match) => (
                <Pressable
                  key={match.id}
                  style={styles.highlightItem}
                  onPress={() => openMatch(match.id)}
                >
                  <ThemedText type="body" style={styles.highlightItemTitle}>
                    vs {match.opponent || (match.isHome ? match.awayTeam : match.homeTeam)}
                  </ThemedText>
                  <ThemedText type="small" style={styles.highlightMeta}>
                    {match.time} · {match.location}
                  </ThemedText>
                </Pressable>
              ))
            ) : (
              <ThemedText type="small" style={styles.highlightMeta}>
                Nessuna gara oggi.
              </ThemedText>
            )}
            <Button
              variant="primary"
              size="sm"
              style={styles.lightButton}
              onPress={() => openTab("MatchesTab")}
            >
              Vai alle Gare
            </Button>
          </View>
        ) : null}

        <View style={[styles.highlightCard, { backgroundColor: "#10B981" }]}>
          <View style={styles.highlightHeader}>
            <ThemedText type="body" style={styles.highlightTitle}>
              Promemoria Attivi
            </ThemedText>
            <Badge label={`${tasks.length}`} variant="default" small />
          </View>
          {tasks.length > 0 ? (
            tasks.slice(0, 2).map((task) => (
              <View key={task.id} style={styles.highlightItem}>
                <ThemedText type="body" style={styles.highlightItemTitle}>
                  {task.title}
                </ThemedText>
                <ThemedText type="small" style={styles.highlightMeta}>
                  {task.dueDate
                    ? `Scade ${formatItalianDate(task.dueDate)}`
                    : "Senza scadenza"}
                </ThemedText>
              </View>
            ))
          ) : (
            <ThemedText type="small" style={styles.highlightMeta}>
              Nessun promemoria in sospeso.
            </ThemedText>
          )}
          <Button
            variant="primary"
            size="sm"
            style={styles.lightButton}
            onPress={() => openTab("ProfileTab")}
          >
            Apri Profilo
          </Button>
        </View>
      </View>

      {trainerPermissions?.widgets.summary !== false ? (
        <View style={styles.summaryGrid}>
          {summaryCards.map((card) => (
            <Card key={card.label} noPadding style={styles.summaryCard}>
              <View
                style={[styles.summaryTopBar, { backgroundColor: card.color }]}
              />
              <View style={styles.summaryCardContent}>
                <View
                  style={[
                    styles.summaryIconWrap,
                    { backgroundColor: `${card.color}14` },
                  ]}
                >
                  <Ionicons name={card.icon} size={18} color={card.color} />
                </View>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {card.label}
                </ThemedText>
                <ThemedText type="h3" style={styles.summaryValue}>
                  {card.value}
                </ThemedText>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  highlightStack: { gap: Spacing.md },
  highlightCard: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  highlightHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  highlightTitle: { color: "#FFFFFF", fontWeight: "700" },
  highlightItem: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  highlightItemTitle: { color: "#FFFFFF", fontWeight: "700" },
  highlightMeta: { color: "rgba(255,255,255,0.82)" },
  lightButton: {
    backgroundColor: "rgba(255,255,255,0.18)",
    marginTop: Spacing.sm,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing["2xl"],
  },
  summaryCard: {
    width: "47.5%",
    overflow: "hidden",
  },
  summaryTopBar: { height: 4 },
  summaryCardContent: { padding: Spacing.lg, gap: Spacing.xs },
  summaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.sm,
  },
  summaryValue: { fontWeight: "800", marginTop: 2 },
});
