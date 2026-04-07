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
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { storage } from "@/services/storage";
import { Match } from "@/services/api";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

type TabType = "upcoming" | "results";

export default function MatchesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [matches, setMatches] = useState<Match[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("upcoming");
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const m = await storage.getMatches();
      setMatches(m);
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

  const upcomingMatches = matches.filter((m) => !m.result);
  const resultsMatches = matches.filter((m) => m.result);

  const displayedMatches = activeTab === "upcoming" ? upcomingMatches : resultsMatches;

  const handleTabChange = (tab: TabType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const renderUpcomingMatch = ({ item, index }: { item: Match; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 100).duration(400)}>
      <Card style={styles.matchCard} noPadding>
        <View style={[styles.matchHeader, { backgroundColor: theme.primary }]}>
          <ThemedText type="small" style={styles.matchDate}>
            {format(parseISO(item.date), "EEEE d MMMM", { locale: it })}
          </ThemedText>
          <ThemedText type="body" style={styles.matchTime}>
            {item.time}
          </ThemedText>
        </View>

        <View style={styles.matchBody}>
          <View style={styles.teamsContainer}>
            <View style={styles.teamRow}>
              <View style={styles.teamName}>
                <ThemedText
                  type="body"
                  style={[
                    styles.teamText,
                    item.isHome ? styles.homeTeam : null,
                  ]}
                >
                  {item.homeTeam}
                </ThemedText>
                {item.isHome ? (
                  <View
                    style={[styles.homeBadge, { backgroundColor: theme.primary }]}
                  >
                    <ThemedText style={styles.homeBadgeText}>CASA</ThemedText>
                  </View>
                ) : null}
              </View>
            </View>
            <ThemedText
              type="h4"
              style={[styles.vsText, { color: theme.textSecondary }]}
            >
              VS
            </ThemedText>
            <View style={styles.teamRow}>
              <View style={styles.teamName}>
                <ThemedText
                  type="body"
                  style={[
                    styles.teamText,
                    !item.isHome ? styles.homeTeam : null,
                  ]}
                >
                  {item.awayTeam}
                </ThemedText>
                {!item.isHome ? (
                  <View
                    style={[styles.homeBadge, { backgroundColor: theme.textSecondary }]}
                  >
                    <ThemedText style={styles.homeBadgeText}>TRASF</ThemedText>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.matchInfo}>
            <View style={styles.infoRow}>
              <Ionicons
                name="location-outline"
                size={16}
                color={theme.textSecondary}
              />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {item.location}
              </ThemedText>
            </View>
            {item.kit ? (
              <View style={styles.infoRow}>
                <Ionicons
                  name="shirt-outline"
                  size={16}
                  color={theme.textSecondary}
                />
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                  {item.kit}
                </ThemedText>
              </View>
            ) : null}
          </View>

          <Button
            variant="primary"
            fullWidth
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          >
            Gestisci Convocazioni
          </Button>
        </View>
      </Card>
    </Animated.View>
  );

  const renderResultMatch = ({ item, index }: { item: Match; index: number }) => {
    const isWin =
      (item.isHome && item.result!.homeScore > item.result!.awayScore) ||
      (!item.isHome && item.result!.awayScore > item.result!.homeScore);
    const isDraw = item.result!.homeScore === item.result!.awayScore;

    return (
      <Animated.View entering={FadeInDown.delay(index * 100).duration(400)}>
        <Card style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {format(parseISO(item.date), "d MMMM yyyy", { locale: it })}
            </ThemedText>
            <View
              style={[
                styles.resultBadge,
                {
                  backgroundColor: isWin
                    ? Colors.light.success
                    : isDraw
                      ? Colors.light.warning
                      : Colors.light.destructive,
                },
              ]}
            >
              <ThemedText style={styles.resultBadgeText}>
                {isWin ? "V" : isDraw ? "P" : "S"}
              </ThemedText>
            </View>
          </View>

          <View style={styles.resultTeams}>
            <ThemedText type="body" style={styles.resultTeamName}>
              {item.isHome ? "vs " : ""}{item.isHome ? item.awayTeam : item.homeTeam}
            </ThemedText>
            <View style={[styles.scoreBox, { backgroundColor: theme.backgroundSecondary }]}>
              <ThemedText type="h3" style={styles.scoreText}>
                {item.result!.homeScore} - {item.result!.awayScore}
              </ThemedText>
            </View>
          </View>
        </Card>
      </Animated.View>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.tabContainer, { marginTop: headerHeight }]}>
        <Pressable
          onPress={() => handleTabChange("upcoming")}
          style={[
            styles.tab,
            {
              backgroundColor:
                activeTab === "upcoming" ? theme.primary : "transparent",
              borderColor: theme.primary,
            },
          ]}
        >
          <ThemedText
            type="body"
            style={{
              color: activeTab === "upcoming" ? "#FFFFFF" : theme.primary,
              fontWeight: "600",
            }}
          >
            In Arrivo
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => handleTabChange("results")}
          style={[
            styles.tab,
            {
              backgroundColor:
                activeTab === "results" ? theme.primary : "transparent",
              borderColor: theme.primary,
            },
          ]}
        >
          <ThemedText
            type="body"
            style={{
              color: activeTab === "results" ? "#FFFFFF" : theme.primary,
              fontWeight: "600",
            }}
          >
            Risultati
          </ThemedText>
        </Pressable>
      </View>

      <FlatList
        data={displayedMatches}
        keyExtractor={(item) => item.id}
        renderItem={activeTab === "upcoming" ? renderUpcomingMatch : renderResultMatch}
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
            illustration={require("../../assets/images/illustrations/empty_matches_illustration.png")}
            title={activeTab === "upcoming" ? "Nessuna gara in arrivo" : "Nessun risultato"}
            message={
              activeTab === "upcoming"
                ? "Non ci sono partite programmate"
                : "Non ci sono risultati disponibili"
            }
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
  tabContainer: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
  },
  matchCard: {
    marginBottom: Spacing.lg,
    overflow: "hidden",
  },
  matchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.lg,
  },
  matchDate: {
    color: "#FFFFFF",
    textTransform: "capitalize",
  },
  matchTime: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  matchBody: {
    padding: Spacing.lg,
  },
  teamsContainer: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  teamRow: {
    width: "100%",
    alignItems: "center",
  },
  teamName: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  teamText: {
    fontSize: 16,
  },
  homeTeam: {
    fontWeight: "700",
  },
  homeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.xs,
  },
  homeBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  vsText: {
    marginVertical: Spacing.sm,
  },
  matchInfo: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  resultCard: {
    marginBottom: Spacing.md,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  resultBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  resultBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  resultTeams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultTeamName: {
    flex: 1,
    fontWeight: "500",
  },
  scoreBox: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  scoreText: {
    fontWeight: "700",
  },
  emptyState: {
    marginTop: Spacing["5xl"],
  },
});
