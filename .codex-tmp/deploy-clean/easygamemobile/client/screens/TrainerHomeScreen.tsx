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

export default function TrainerHomeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const { currentClub, currentRole, trainerPermissions, assignedCategories } =
    useAuthContext();

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
  const permissions = trainerPermissions;

  const openTab = (tabName: string) => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate(tabName as never);
    }
  };

  const openTraining = (trainingId: string) => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate(
        "TrainingsTab" as never,
        {
          screen: "Trainings",
          params: { focusTrainingId: trainingId },
        } as never,
      );
    }
  };

  const openMatch = (matchId: string) => {
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate(
        "MatchesTab" as never,
        {
          screen: "Matches",
          params: { focusMatchId: matchId },
        } as never,
      );
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

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
    {
      label: "Allenamenti Oggi",
      value: todayTrainings.length,
      color: "#F97316",
      icon: "fitness-outline" as const,
    },
    {
      label: "Gare Oggi",
      value: todayMatches.length,
      color: "#EF4444",
      icon: "trophy-outline" as const,
    },
  ];

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
            {currentClub?.name || "Club"} · {getRoleLabel(currentRole)}
          </ThemedText>
        </View>
        <Avatar name={user?.name || "Coach"} size={46} />
      </View>

      <ThemedText
        type="small"
        style={{ color: theme.textSecondary, marginBottom: Spacing.lg }}
      >
        Vedi soltanto gli spazi e le azioni abilitate dal club per il tuo ruolo.
      </ThemedText>

      {permissions?.widgets.summary !== false ? (
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

      <View style={styles.highlightStack}>
        {permissions?.widgets.todayTrainings !== false ? (
          <View style={[styles.highlightCard, { backgroundColor: "#7C3AED" }]}>
            <View style={styles.highlightHeader}>
              <ThemedText type="body" style={styles.highlightTitle}>
                Allenamenti di Oggi
              </ThemedText>
              <Badge
                label={`${todayTrainings.length}`}
                variant="default"
                small
              />
            </View>
            {todayTrainings.length > 0 ? (
              todayTrainings.slice(0, 2).map((training) => (
                <View key={training.id} style={styles.highlightItem}>
                  <ThemedText type="body" style={styles.highlightItemTitle}>
                    {training.title}
                  </ThemedText>
                  <ThemedText type="small" style={styles.highlightMeta}>
                    {formatTimeRange(training.time, training.endTime)} ·{" "}
                    {training.location}
                  </ThemedText>
                </View>
              ))
            ) : (
              <ThemedText type="small" style={styles.highlightMeta}>
                Nessun allenamento programmato per oggi.
              </ThemedText>
            )}
            <Button
              variant="secondary"
              size="sm"
              style={styles.lightButton}
              onPress={() => openTab("TrainingsTab")}
            >
              Vai agli Allenamenti
            </Button>
          </View>
        ) : null}

        {permissions?.widgets.todayMatches !== false ? (
          <View style={[styles.highlightCard, { backgroundColor: "#F97316" }]}>
            <View style={styles.highlightHeader}>
              <ThemedText type="body" style={styles.highlightTitle}>
                Gare di Oggi
              </ThemedText>
              <Badge label={`${todayMatches.length}`} variant="default" small />
            </View>
            {todayMatches.length > 0 ? (
              todayMatches.slice(0, 2).map((match) => (
                <View key={match.id} style={styles.highlightItem}>
                  <ThemedText type="body" style={styles.highlightItemTitle}>
                    vs {match.isHome ? match.awayTeam : match.homeTeam}
                  </ThemedText>
                  <ThemedText type="small" style={styles.highlightMeta}>
                    {match.time} · {match.location}
                  </ThemedText>
                </View>
              ))
            ) : (
              <ThemedText type="small" style={styles.highlightMeta}>
                Nessuna gara oggi.
              </ThemedText>
            )}
            <Button
              variant="secondary"
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
            variant="secondary"
            size="sm"
            style={styles.lightButton}
            onPress={() => openTab("ProfileTab")}
          >
            Apri Profilo
          </Button>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <ThemedText type="h4">Prossimi Allenamenti</ThemedText>
          <Button
            variant="ghost"
            size="sm"
            onPress={() => openTab("TrainingsTab")}
          >
            Tutti
          </Button>
        </View>
        {nextTrainings.map((training) => (
          <Card key={training.id} style={styles.listCard}>
            <View style={styles.listCardRow}>
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={styles.cardTitle}>
                  {training.title}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {formatItalianDate(training.date)} ·{" "}
                  {formatTimeRange(training.time, training.endTime)}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {training.location}
                </ThemedText>
              </View>
              <Badge label={training.category} variant="default" small />
            </View>
          </Card>
        ))}
      </View>

      {permissions?.widgets.assignedAthletes !== false ? (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText type="h4">Lista Giocatori</ThemedText>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => openTab("AthletesTab")}
            >
              Apri
            </Button>
          </View>
          {highlightedAthletes.map((athlete) => (
            <Card key={athlete.id} style={styles.listCard}>
              <View style={styles.playerRow}>
                <Avatar
                  name={athlete.name}
                  size={42}
                  showNumber
                  number={athlete.number}
                />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <ThemedText type="body" style={styles.cardTitle}>
                    {athlete.name}
                  </ThemedText>
                  <ThemedText
                    type="small"
                    style={{ color: theme.textSecondary }}
                  >
                    {athlete.category}
                  </ThemedText>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.textSecondary}
                />
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
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
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
  highlightStack: { gap: Spacing.md, marginTop: Spacing["2xl"] },
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
  section: { marginTop: Spacing["2xl"] },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  listCard: { marginBottom: Spacing.md },
  listCardRow: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  playerRow: { flexDirection: "row", alignItems: "center" },
  cardTitle: { fontWeight: "700" },
});
