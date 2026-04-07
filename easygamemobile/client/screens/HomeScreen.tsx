import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Pressable, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { format, isToday, parseISO } from "date-fns";
import { it } from "date-fns/locale";

import { ThemedText } from "@/components/ThemedText";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { useAuthContext } from "@/contexts/AuthContext";
import { storage } from "@/services/storage";
import { Training, Match, Task } from "@/services/api";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { user, currentClub, currentRole } = useAuthContext();

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [t, m, tk] = await Promise.all([
        storage.getTrainings(),
        storage.getMatches(),
        storage.getTasks(),
      ]);
      setTrainings(t);
      setMatches(m);
      setTasks(tk.filter((task) => !task.completed));
    } catch (e) {
      console.error(e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buongiorno";
    if (hour < 18) return "Buon pomeriggio";
    return "Buonasera";
  };

  const todayTraining = trainings.find((t) => {
    try {
      return isToday(parseISO(t.date));
    } catch {
      return false;
    }
  });

  const upcomingMatch = matches.find((m) => !m.result);

  const handleToggleTask = async (taskId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await storage.toggleTask(taskId);
    setTasks(tasks.filter((t) => t.id !== taskId));
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.lg,
        paddingBottom: tabBarHeight + Spacing["2xl"],
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <View style={styles.greetingRow}>
          <View style={styles.greetingText}>
            <ThemedText type="h3">
              {getGreeting()}, {user?.name?.split(" ")[0] || "Coach"}
            </ThemedText>
          </View>
          <Avatar name={currentClub?.name || "C"} size={44} />
        </View>

        {currentClub ? (
          <View style={styles.clubBadges}>
            <Badge label={currentClub.name} variant="primary" />
            {currentClub.categories?.map((cat) => (
              <Badge key={cat} label={cat} variant="default" />
            ))}
          </View>
        ) : null}
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(200).duration(400)}
        style={styles.section}
      >
        <ThemedText type="h4" style={styles.sectionTitle}>
          Attivita e Promemoria
        </ThemedText>
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <Card key={task.id} style={styles.taskCard}>
              <View style={styles.taskContent}>
                <Pressable
                  onPress={() => handleToggleTask(task.id)}
                  style={[
                    styles.taskCheckbox,
                    { borderColor: theme.primary },
                  ]}
                >
                  {task.completed ? (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={theme.primary}
                    />
                  ) : null}
                </Pressable>
                <View style={styles.taskInfo}>
                  <ThemedText type="body" style={styles.taskTitle}>
                    {task.title}
                  </ThemedText>
                  {task.description ? (
                    <ThemedText
                      type="small"
                      style={{ color: theme.textSecondary }}
                    >
                      {task.description}
                    </ThemedText>
                  ) : null}
                </View>
                {task.type === "reminder" ? (
                  <Ionicons
                    name="notifications-outline"
                    size={18}
                    color={Colors.light.warning}
                  />
                ) : (
                  <Ionicons
                    name="document-text-outline"
                    size={18}
                    color={theme.textSecondary}
                  />
                )}
              </View>
            </Card>
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Ionicons
                name="checkmark-circle"
                size={32}
                color={Colors.light.success}
              />
              <ThemedText
                type="body"
                style={[styles.emptyText, { color: theme.textSecondary }]}
              >
                Nessuna attivita in sospeso
              </ThemedText>
            </View>
          </Card>
        )}
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(300).duration(400)}
        style={styles.section}
      >
        <ThemedText type="h4" style={styles.sectionTitle}>
          Programma di Oggi
        </ThemedText>
        {todayTraining ? (
          <Card leftBorderColor={theme.primary} style={styles.trainingCard}>
            <View style={styles.trainingHeader}>
              <View style={styles.trainingTime}>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={theme.primary}
                />
                <ThemedText
                  type="body"
                  style={[styles.timeText, { color: theme.primary }]}
                >
                  {todayTraining.time}
                </ThemedText>
              </View>
              <Badge label={todayTraining.category} variant="primary" small />
            </View>
            <ThemedText type="h4" style={styles.trainingTitle}>
              {todayTraining.title}
            </ThemedText>
            <View style={styles.trainingLocation}>
              <Ionicons
                name="location-outline"
                size={16}
                color={theme.textSecondary}
              />
              <ThemedText
                type="small"
                style={{ color: theme.textSecondary, marginLeft: Spacing.xs }}
              >
                {todayTraining.location}
              </ThemedText>
            </View>
            <Button
              variant="outline"
              size="sm"
              style={styles.presenceButton}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              Presenze
            </Button>
          </Card>
        ) : (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyContent}>
              <Ionicons
                name="calendar-outline"
                size={32}
                color={theme.textSecondary}
              />
              <ThemedText
                type="body"
                style={[styles.emptyText, { color: theme.textSecondary }]}
              >
                Nessun allenamento oggi
              </ThemedText>
            </View>
          </Card>
        )}
      </Animated.View>

      {upcomingMatch ? (
        <Animated.View
          entering={FadeInDown.delay(400).duration(400)}
          style={styles.section}
        >
          <Card
            style={styles.matchCard}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          >
            <View style={styles.matchHeader}>
              <Ionicons name="football-outline" size={20} color={theme.primary} />
              <ThemedText type="body" style={{ color: theme.primary, fontWeight: "600" }}>
                Prossima Gara
              </ThemedText>
            </View>
            <ThemedText type="h4" style={styles.matchTitle}>
              vs {upcomingMatch.isHome ? upcomingMatch.awayTeam : upcomingMatch.homeTeam}
            </ThemedText>
            <View style={styles.matchInfo}>
              <View style={styles.matchInfoItem}>
                <Ionicons
                  name="calendar-outline"
                  size={14}
                  color={theme.textSecondary}
                />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {format(parseISO(upcomingMatch.date), "d MMMM", { locale: it })}
                </ThemedText>
              </View>
              <View style={styles.matchInfoItem}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={theme.textSecondary}
                />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {upcomingMatch.time}
                </ThemedText>
              </View>
            </View>
          </Card>
        </Animated.View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  greetingText: {
    flex: 1,
  },
  clubBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  section: {
    marginTop: Spacing["2xl"],
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  taskCard: {
    marginBottom: Spacing.sm,
  },
  taskContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  taskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontWeight: "500",
  },
  emptyCard: {
    paddingVertical: Spacing["2xl"],
  },
  emptyContent: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  emptyText: {
    textAlign: "center",
  },
  trainingCard: {
    paddingTop: Spacing.lg,
  },
  trainingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  trainingTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  timeText: {
    fontWeight: "600",
  },
  trainingTitle: {
    marginBottom: Spacing.sm,
  },
  trainingLocation: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  presenceButton: {
    alignSelf: "flex-start",
  },
  matchCard: {
    borderWidth: 1,
    borderColor: "rgba(37, 99, 235, 0.2)",
  },
  matchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  matchTitle: {
    marginBottom: Spacing.sm,
  },
  matchInfo: {
    flexDirection: "row",
    gap: Spacing.lg,
  },
  matchInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
});
