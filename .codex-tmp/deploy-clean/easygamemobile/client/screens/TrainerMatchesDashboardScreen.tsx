import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import {
  RouteProp,
  useFocusEffect,
  useRoute,
} from "@react-navigation/native";
import { addDays, format } from "date-fns";

import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { ThemedText } from "@/components/ThemedText";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import {
  getMobileMedicalCertificateAvailability,
  getMobileMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import { formatItalianDate } from "@/lib/mobile-ui";
import { formatMobileMatchLocationLabel } from "@/lib/trainer-dashboard-utils";
import { Athlete, Match } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { BorderRadius, Spacing } from "@/constants/theme";
import { MatchesStackParamList } from "@/navigation/MatchesStackNavigator";

type ConvocationDraftEntry = {
  athleteId: string;
  name: string;
  number: number;
  selected: boolean;
  medicalCertExpiry?: string;
};

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getTodayKey = () => format(new Date(), "yyyy-MM-dd");
const getWeekEndKey = () => format(addDays(new Date(), 6), "yyyy-MM-dd");

export default function TrainerMatchesDashboardScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const route = useRoute<RouteProp<MatchesStackParamList, "Matches">>();
  const { theme } = useTheme();
  const { trainerPermissions } = useAuthContext();
  const [matches, setMatches] = useState<Match[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [convocationDraft, setConvocationDraft] = useState<ConvocationDraftEntry[]>(
    [],
  );
  const [convocationSaving, setConvocationSaving] = useState(false);

  const focusedMatchId = route.params?.focusMatchId || null;
  const canManageConvocations =
    trainerPermissions?.actions.manageConvocations !== false;

  const loadData = useCallback(async () => {
    const [nextMatches, nextAthletes] = await Promise.all([
      mobileBackendStorage.getMatches(),
      mobileBackendStorage.getAthletes(),
    ]);
    setMatches(nextMatches);
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

  const today = getTodayKey();
  const weekEnd = getWeekEndKey();
  const filteredMatches = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return matches;
    }

    return matches.filter((match) =>
      [
        match.opponent,
        match.homeTeam,
        match.awayTeam,
        match.category,
        match.id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [matches, searchQuery]);
  const todayMatches = useMemo(
    () => filteredMatches.filter((match) => match.date === today),
    [filteredMatches, today],
  );
  const weekMatches = useMemo(
    () =>
      filteredMatches.filter(
        (match) => match.date > today && match.date <= weekEnd,
      ),
    [filteredMatches, today, weekEnd],
  );
  const futureMatches = useMemo(
    () => filteredMatches.filter((match) => match.date > weekEnd),
    [filteredMatches, weekEnd],
  );

  const openConvocationsSheet = (match: Match) => {
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
        medicalCertExpiry: athlete.medicalCertExpiry,
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
      const selectedAthletes = convocationDraft.filter((entry) => entry.selected);
      await mobileBackendStorage.saveMatchConvocations(
        selectedMatch.id,
        selectedAthletes.map((entry) => entry.athleteId),
      );
      await loadData();
      setSelectedMatch(null);
      setConvocationDraft([]);
      const flaggedAthletes = selectedAthletes
        .map((entry) => ({
          name: entry.name,
          availability: getMobileMedicalCertificateAvailability(
            entry.medicalCertExpiry,
          ),
        }))
        .filter((entry) => entry.availability === "missing" || entry.availability === "expired");

      if (flaggedAthletes.length > 0) {
        Alert.alert(
          "Convocazioni salvate con avviso",
          flaggedAthletes
            .map(
              (entry) =>
                `${entry.name}: ${getMobileMedicalCertificateAvailabilityLabel(entry.availability)}`,
            )
            .join("\n"),
        );
      }
    } finally {
      setConvocationSaving(false);
    }
  };

  const getMatchTitle = (match: Match) =>
    match.opponent || (match.isHome ? match.awayTeam : match.homeTeam);

  const renderMatchCard = (match: Match) => (
    <Card
      key={match.id}
      style={[styles.matchCard, focusedMatchId === match.id ? styles.focusedCard : null]}
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <ThemedText type="body" style={styles.cardTitle}>
            vs {getMatchTitle(match)}
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
        <Ionicons name="people-outline" size={16} color={theme.textSecondary} />
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {match.convokedCount ?? 0} convocati
        </ThemedText>
      </View>

      {canManageConvocations ? (
        <Button
          size="sm"
          style={styles.actionButton}
          onPress={() => openConvocationsSheet(match)}
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
          paddingTop: Spacing.lg,
          paddingBottom: tabBarHeight + insets.bottom + Spacing["4xl"],
          paddingHorizontal: Spacing.lg,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.sectionFirst}>
          <Input
            placeholder="Cerca gara per avversario o numero gara..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon="search-outline"
            rightIcon={searchQuery ? "close-circle" : undefined}
            onRightIconPress={() => setSearchQuery("")}
          />
        </View>

        <View style={styles.sectionCompact}>
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

        <View style={styles.section}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Gare successive
          </ThemedText>
          {futureMatches.length > 0 ? (
            futureMatches.map(renderMatchCard)
          ) : (
            <Card>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Nessuna gara nelle settimane successive.
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
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.backgroundDefault }]}
            onPress={(event) => event.stopPropagation()}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              Convocazioni gara
            </ThemedText>
            <ThemedText
              type="small"
              style={{ color: theme.textSecondary, marginBottom: Spacing.md }}
            >
              {selectedMatch ? `vs ${getMatchTitle(selectedMatch)}` : ""}
            </ThemedText>

            <ScrollView
              style={styles.modalList}
              contentContainerStyle={styles.convocationList}
              showsVerticalScrollIndicator
            >
              {convocationDraft.length > 0 ? (
                convocationDraft.map((entry) => (
                  <Pressable
                    key={entry.athleteId}
                    style={[
                      styles.convocationRow,
                      {
                        borderColor: entry.selected ? theme.primary : theme.border,
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
                        <View style={styles.nameWithWarning}>
                          <ThemedText type="body" style={styles.cardTitle}>
                            {entry.name}
                          </ThemedText>
                          {getMobileMedicalCertificateAvailability(
                            entry.medicalCertExpiry,
                          ) !== "valid" ? (
                            <Ionicons
                              name="warning-outline"
                              size={18}
                              color="#F59E0B"
                            />
                          ) : null}
                        </View>
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                          {entry.selected ? "Convocato" : "Non convocato"}
                        </ThemedText>
                        {getMobileMedicalCertificateAvailability(
                          entry.medicalCertExpiry,
                        ) !== "valid" ? (
                          <ThemedText type="small" style={styles.medicalHint}>
                            {getMobileMedicalCertificateAvailabilityLabel(
                              getMobileMedicalCertificateAvailability(
                                entry.medicalCertExpiry,
                              ),
                            )}
                          </ThemedText>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons
                      name={entry.selected ? "checkmark-circle" : "ellipse-outline"}
                      size={24}
                      color={entry.selected ? theme.primary : theme.textSecondary}
                    />
                  </Pressable>
                ))
              ) : (
                <Card>
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    Nessun atleta collegato a questa categoria.
                  </ThemedText>
                </Card>
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <Button variant="ghost" onPress={() => setSelectedMatch(null)}>
                Annulla
              </Button>
              <Button
                onPress={() => void handleSaveConvocations()}
                loading={convocationSaving}
                disabled={convocationDraft.length === 0}
              >
                Salva convocazioni
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sectionFirst: { marginTop: Spacing.md },
  sectionCompact: { marginTop: Spacing.lg },
  section: { marginTop: Spacing["2xl"] },
  sectionTitle: { marginBottom: Spacing.md },
  matchCard: { marginBottom: Spacing.md },
  focusedCard: {
    borderWidth: 1.5,
    borderColor: "#2563EB",
  },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    borderRadius: BorderRadius["2xl"],
    padding: Spacing["2xl"],
    maxHeight: "84%",
  },
  modalTitle: { marginBottom: Spacing.xs },
  modalList: { maxHeight: 360 },
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
  nameWithWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  medicalHint: {
    color: "#D97706",
    marginTop: 2,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
});
