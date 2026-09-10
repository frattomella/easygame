import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import {
  HighlightCard,
  SecondaryScreenLayout,
  SectionHero,
  StatCard,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  formatItalianDate,
  formatTimeRange,
  getRoleLabel,
} from "@/lib/mobile-ui";
import { Athlete, Match, Task, Training } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Spacing } from "@/constants/theme";
import type { HomeStackParamList } from "@/navigation/HomeStackNavigator";

type Navigation = NativeStackNavigationProp<HomeStackParamList, "Home">;

/**
 * design-source `guidelines/trainer-migration.md` step 5 (WP10) — l'ultima
 * schermata migrata, perche dipende dai colori/forme di modulo fissati
 * dalle tre precedenti. Stessi dati (`mobileBackendStorage`), stesse
 * chiavi di permesso (`trainerPermissions.widgets.*`): i tre blocchi
 * violetto/arancio/smeraldo diventano `HighlightCard`, i contatori
 * diventano `StatCard`. Nessuna metrica finta.
 */
export default function TrainerHomeDashboardScreen() {
  const navigation = useNavigation<Navigation>();
  const { currentClub, currentRole, trainerPermissions, user } =
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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const today = format(new Date(), "yyyy-MM-dd");
  const todayTrainings = useMemo(
    () => trainings.filter((training) => training.date === today),
    [today, trainings],
  );
  const todayMatches = useMemo(
    () => matches.filter((match) => match.date === today),
    [matches, today],
  );

  const openTab = (tabName: string) => {
    const parent = navigation.getParent() as
      | { navigate: (...args: unknown[]) => void }
      | undefined;
    parent?.navigate(tabName);
  };

  const openTraining = (trainingId: string) => {
    const parent = navigation.getParent() as
      | { navigate: (...args: unknown[]) => void }
      | undefined;
    parent?.navigate("TrainingsTab", {
      screen: "Trainings",
      params: { focusTrainingId: trainingId },
    });
  };

  const openMatch = (matchId: string) => {
    const parent = navigation.getParent() as
      | { navigate: (...args: unknown[]) => void }
      | undefined;
    parent?.navigate("MatchesTab", {
      screen: "Matches",
      params: { focusMatchId: matchId },
    });
  };

  const todayLabel = format(new Date(), "EEEE d MMMM", { locale: it });
  const firstName =
    String(user?.name || "")
      .trim()
      .split(/\s+/)[0] || "";

  return (
    <SecondaryScreenLayout
      title="Dashboard"
      onBack={false}
      skyHeight={330}
      onNotifications={() => navigation.navigate("Notifications")}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <SectionHero
        icon="calendar"
        eyebrow={todayLabel.charAt(0).toUpperCase() + todayLabel.slice(1)}
        title={firstName ? `Buongiorno, ${firstName}` : "Buongiorno"}
        subtitle={`${currentClub?.name || "Club attivo"} · ${getRoleLabel(currentRole)}`}
        chips={[
          { label: "allenamenti", value: String(todayTrainings.length) },
          { label: "gara", value: String(todayMatches.length) },
          { label: "promemoria", value: String(tasks.length) },
        ]}
      />

      <View style={[styles.stack, styles.stackFirst]}>
        {trainerPermissions?.widgets.todayTrainings !== false ? (
          <HighlightCard
            icon="fitness-outline"
            moduleColor="#2563EB"
            stripe="action"
            eyebrow="Oggi"
            title="Allenamenti"
            count={todayTrainings.length}
            emptyLabel="Nessun allenamento programmato per oggi."
            previewRows={todayTrainings.map((training) => ({
              id: training.id,
              time: training.time,
              title: training.title,
              meta: `${formatTimeRange(training.time, training.endTime)} · ${training.location}`,
            }))}
            actionLabel="Vai agli allenamenti"
            onAction={() => openTab("TrainingsTab")}
            onPressRow={openTraining}
          />
        ) : null}

        {trainerPermissions?.widgets.todayMatches !== false ? (
          <HighlightCard
            icon="football-outline"
            moduleColor="#F97316"
            stripe="match"
            eyebrow="Oggi"
            title="Gare"
            count={todayMatches.length}
            emptyLabel="Nessuna gara oggi."
            previewRows={todayMatches.map((match) => ({
              id: match.id,
              time: match.time,
              title: `vs ${match.opponent || (match.isHome ? match.awayTeam : match.homeTeam)}`,
              meta: match.location,
            }))}
            actionLabel="Vai alle gare"
            onAction={() => openTab("MatchesTab")}
            onPressRow={openMatch}
          />
        ) : null}

        <HighlightCard
          icon="notifications-outline"
          moduleColor="#10B981"
          stripe="success"
          eyebrow="Attivi"
          title="Promemoria"
          count={tasks.length}
          emptyLabel="Nessun promemoria in sospeso."
          previewRows={tasks.map((task) => ({
            id: task.id,
            time: task.dueDate ? formatItalianDate(task.dueDate, "d MMM") : "-",
            title: task.title,
            meta: task.dueDate
              ? `Scade ${formatItalianDate(task.dueDate)}`
              : "Senza scadenza",
          }))}
          actionLabel="Apri profilo"
          onAction={() => openTab("ProfileTab")}
        />
      </View>

      {trainerPermissions?.widgets.summary !== false ? (
        <View style={styles.summarySection}>
          <View style={styles.summaryHeader}>
            <StatCard
              icon="people-outline"
              iconColor="#2563EB"
              value={String(athletes.length)}
              label="Atleti seguiti"
            />
            <StatCard
              icon="barbell-outline"
              iconColor="#10B981"
              value={String(trainings.length)}
              label="Allenamenti"
            />
          </View>
        </View>
      ) : null}
    </SecondaryScreenLayout>
  );
}

const styles = StyleSheet.create({
  stack: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  stackFirst: {
    marginTop: -32,
  },
  summarySection: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  summaryHeader: {
    flexDirection: "row",
    gap: Spacing.md,
  },
});
