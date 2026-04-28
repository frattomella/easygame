import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { addDays, format } from "date-fns";

import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { ThemedText } from "@/components/ThemedText";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { formatItalianDate } from "@/lib/mobile-ui";
import { formatMobileMatchLocationLabel } from "@/lib/trainer-dashboard-utils";
import { Match } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { BorderRadius, Spacing } from "@/constants/theme";

type ConvocationDraftEntry = {
  athleteId: string;
  name: string;
  number: number;
  selected: boolean;
};

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getTodayKey = () => format(new Date(), "yyyy-MM-dd");
const getWeekEndKey = () => format(addDays(new Date(), 6), "yyyy-MM-dd");

export default function TrainerMatchesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { trainerPermissions } = useAuthContext();
  const [matches, setMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [convocationDraft, setConvocationDraft] = useState<ConvocationDraftEntry[]>(
    [],
  );
  const [convocationSaving, setConvocationSaving] = useState(false);

  const loadData = useCallback(async () => {
    const nextMatches = await mobileBackendStorage.getMatches();
    setMatches(nextMatches);
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

  const today = getTodayKey();
  const weekEnd = getWeekEndKey();
  const todayMatches = useMemo(
    () => matches.filter((match) => match.date === today),
    [matches, today],
  );
  const weekMatches = useMemo(
    () =>
      matches.filter((match) => match.date > today && match.date <= weekEnd),
    [matches, today, weekEnd],
  );

  const canManageConvocations =
    trainerPermissions?.actions.manageConvocations !== false;

  const openConvocationsSheet = async (match: Match) => {
    const athletes = await mobileBackendStorage.getAthletes();
    const relevantAthletes = athletes.filter((athlete) => {
      if (match.categoryId && athlete.categoryId) {
        return normalizeText(match.categoryId) === normalizeText(athlete.categoryId);
      }

      return normalizeText(match.category || "") === normalizeText(athlete.category);
    });

    const selectedIds = new Set(match.convocatedAthletes || []);
    setConvocationDraft(
      relevantAthletes.map((athlete) => ({
        athleteId: athlete.id,
        name: athlete.name,
        number: athlete.number,
        selected: selectedIds.has(athlete.id),
      })),
    );
    setSelectedMatch(match);
  };

  const toggleConvocation = (athleteId: string) => {
    setConvocationDraft((current) =>
      current.map((entry) =>
        entry.athleteId === athleteId
          ? { ...entry, selected: !entry.selected }
          : entry,
      ),
    );
  };

  const handleSaveConvocations = async () => {
    if (!selectedMatch) {
      return;
    }

    setConvocationSaving(true);
    try {
      await mobileBackendStorage.saveMatchConvocations(
        selectedMatch.id,
        convocationDraft
          .filter((entry) => entry.selected)
          .map((entry) => entry.athleteId),
      );
      await loadData();
      setSelectedMatch(null);
      setConvocationDraft([]);
    } finally {
      setConvocationSaving(false);
    }
  };

  const renderMatchCard = (match: Match) => (
    <Card key={match.id} style={styles.matchCard}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="body" style={styles.cardTitle}>
            vs {match.isHome ? match.awayTeam : match.homeTeam}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {formatItalianDate(match.date)} · {match.time}
          </ThemedText>
        </View>
        <Badge label={match.category || "Categoria"} small />
      </View>
      <View style={styles.metaRow}>
        <Ionicons
          name="location-outline"
          size={16}
          color={theme.textSecondary}
        />
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {formatMobileMatchLocationLabel(match)}
        </ThemedText>
      </View>
      <View style={styles.metaRow}>
        <Ionicons
          name="people-outline"
          size={16}
          color={theme.textSecondary}
        />
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {match.convokedCount ?? 0} convocati
        </ThemedText>
      </View>
      {canManageConvocations ? (
        <Button
          size="sm"
          style={styles.actionButton}
          onPress={() => void openConvocationsSheet(match)}
        >
          Convocazioni
        </Button>
      ) : null}
    </Card>
  );

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
        contentContainerStyle={{
          paddingTop: headerHeight + Spacing.lg,
          paddingBottom: tabBarHeight + insets.bottom + Spacing["4xl"],
          paddingHorizontal: Spacing.lg,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={[styles.todayHero, { backgroundColor: "#F97316" }]}>
          <ThemedText type="small" style={styles.heroEyebrow}>
            Gare in evidenza
          </ThemedText>
          <ThemedText type="h4" style={styles.heroTitle}>
            {todayMatches.length > 0
              ? `${todayMatches.length} gare in programma oggi`
              : "Nessuna gara prevista oggi"}
          </ThemedText>
          <ThemedText type="small" style={styles.heroSubtitle}>
            In alto la giornata corrente, sotto la programmazione settimanale
            in ordine cronologico.
          </ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Gare di oggi
          </ThemedText>
          {todayMatches.length > 0 ? (
            todayMatches.map(renderMatchCard)
          ) : (
            <Card>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Nessuna gara registrata per oggi.
              </ThemedText>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Gare della settimana
          </ThemedText>
          {weekMatches.length > 0 ? (
            weekMatches.map(renderMatchCard)
          ) : (
            <Card>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Nessuna gara ulteriore in settimana.
              </ThemedText>
            </Card>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedMatch)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMatch(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedMatch(null)}
        >
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.modalScrollWrap}
          >
            <Pressable
              style={[
                styles.modalCard,
                { backgroundColor: theme.backgroundDefault },
              ]}
              onPress={(event) => event.stopPropagation()}
            >
              <ThemedText type="h4" style={styles.modalTitle}>
                Convocazioni gara
              </ThemedText>
              <ThemedText
                type="small"
                style={{ color: theme.textSecondary, marginBottom: Spacing.md }}
              >
                {selectedMatch
                  ? `vs ${selectedMatch.isHome ? selectedMatch.awayTeam : selectedMatch.homeTeam}`
                  : ""}
              </ThemedText>
              <View style={styles.convocationList}>
                {convocationDraft.map((entry) => (
                  <Pressable
                    key={entry.athleteId}
                    style={[
                      styles.convocationRow,
                      {
                        borderColor: entry.selected
                          ? theme.primary
                          : theme.border,
                      },
                    ]}
                    onPress={() => toggleConvocation(entry.athleteId)}
                  >
                    <View style={styles.convocationInfo}>
                      <Avatar
                        name={entry.name}
                        size={42}
                        showNumber
                        number={entry.number}
                      />
                      <View style={{ marginLeft: Spacing.md, flex: 1 }}>
                        <ThemedText type="body" style={styles.cardTitle}>
                          {entry.name}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          style={{ color: theme.textSecondary }}
                        >
                          {entry.selected ? "Convocato" : "Non convocato"}
                        </ThemedText>
                      </View>
                    </View>
                    <Ionicons
                      name={
                        entry.selected
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={24}
                      color={entry.selected ? theme.primary : theme.textSecondary}
                    />
                  </Pressable>
                ))}
              </View>
              <View style={styles.modalButtons}>
                <Button variant="ghost" onPress={() => setSelectedMatch(null)}>
                  Annulla
                </Button>
                <Button
                  onPress={() => void handleSaveConvocations()}
                  loading={convocationSaving}
                >
                  Salva convocazioni
                </Button>
              </View>
            </Pressable>
          </KeyboardAwareScrollViewCompat>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  todayHero: {
    borderRadius: BorderRadius["2xl"],
    padding: Spacing["2xl"],
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
    marginBottom: 4,
  },
  heroTitle: { color: "#FFFFFF" },
  heroSubtitle: { color: "rgba(255,255,255,0.82)", marginTop: Spacing.sm },
  section: { marginTop: Spacing["2xl"] },
  sectionTitle: { marginBottom: Spacing.md },
  matchCard: { marginBottom: Spacing.md },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.md,
  },
  cardTitle: { fontWeight: "700", marginBottom: 2 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionButton: {
    marginTop: Spacing.lg,
    alignSelf: "flex-start",
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  modalScrollWrap: {
    flexGrow: 1,
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    borderRadius: BorderRadius["2xl"],
    padding: Spacing["2xl"],
    maxHeight: "82%",
  },
  modalTitle: { marginBottom: Spacing.xs },
  convocationList: { gap: Spacing.sm, marginTop: Spacing.sm },
  convocationRow: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  convocationInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
});
