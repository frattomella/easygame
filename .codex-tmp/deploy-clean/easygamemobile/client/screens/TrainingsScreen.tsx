import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  parseISO,
} from "date-fns";
import { it } from "date-fns/locale";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { storage } from "@/services/storage";
import { Training } from "@/services/api";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven"];

export default function TrainingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = WEEKDAYS.map((_, i) => addDays(weekStart, i));

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const t = await storage.getTrainings();
      setTrainings(t);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const filteredTrainings = trainings.filter((t) => {
    try {
      return isSameDay(parseISO(t.date), selectedDate);
    } catch {
      return false;
    }
  });

  const handleDayPress = (date: Date) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate(date);
  };

  const renderTrainingItem = ({ item, index }: { item: Training; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 100).duration(400)}>
      <Card
        leftBorderColor={theme.primary}
        style={styles.trainingCard}
      >
        <View style={styles.trainingHeader}>
          <ThemedText type="h4">{item.title}</ThemedText>
          <Badge label={item.category} variant="primary" small />
        </View>

        <View style={styles.trainingDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.time}
            </ThemedText>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {format(parseISO(item.date), "d MMMM yyyy", { locale: it })}
            </ThemedText>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.location}
            </ThemedText>
          </View>
        </View>

        <View style={styles.trainingFooter}>
          <View style={styles.attendanceInfo}>
            <Ionicons name="people-outline" size={16} color={theme.textSecondary} />
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {item.presentCount ?? 0}/{item.totalCount ?? 0} presenti
            </ThemedText>
          </View>
          <Button
            variant="primary"
            size="sm"
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          >
            Registra Presenze
          </Button>
        </View>
      </Card>
    </Animated.View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.weekSelector, { marginTop: headerHeight }]}>
        {weekDays.map((day, index) => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());

          return (
            <Pressable
              key={index}
              onPress={() => handleDayPress(day)}
              style={[
                styles.dayButton,
                {
                  backgroundColor: isSelected
                    ? theme.primary
                    : "transparent",
                },
              ]}
            >
              <ThemedText
                type="small"
                style={[
                  styles.dayLabel,
                  {
                    color: isSelected
                      ? "#FFFFFF"
                      : theme.textSecondary,
                  },
                ]}
              >
                {WEEKDAYS[index]}
              </ThemedText>
              <ThemedText
                type="body"
                style={[
                  styles.dayNumber,
                  {
                    color: isSelected
                      ? "#FFFFFF"
                      : theme.text,
                    fontWeight: isToday ? "700" : "500",
                  },
                ]}
              >
                {format(day, "d")}
              </ThemedText>
              {isToday && !isSelected ? (
                <View style={[styles.todayDot, { backgroundColor: theme.primary }]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={filteredTrainings}
        keyExtractor={(item) => item.id}
        renderItem={renderTrainingItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarHeight + Spacing["2xl"] },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            illustration={require("../../assets/images/illustrations/empty_trainings_illustration.png")}
            title="Nessun allenamento"
            message="Non ci sono allenamenti programmati per questo giorno"
            style={styles.emptyState}
          />
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekSelector: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  dayButton: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    minWidth: 50,
  },
  dayLabel: {
    fontSize: 12,
    marginBottom: 2,
  },
  dayNumber: {
    fontSize: 18,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  trainingCard: {
    marginBottom: Spacing.md,
  },
  trainingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  trainingDetails: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  trainingFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attendanceInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  emptyState: {
    marginTop: Spacing["5xl"],
  },
});
