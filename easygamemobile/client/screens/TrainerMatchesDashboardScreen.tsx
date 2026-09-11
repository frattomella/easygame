import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { addDays, format } from "date-fns";

import {
  ActionButton,
  BottomSheet,
  EventCard,
  GlassCard,
  SecondaryScreenLayout,
  SectionHero,
  SelectableAthleteRow,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  getMobileMedicalCertificateAvailability,
  getMobileMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import { formatItalianDate } from "@/lib/mobile-ui";
import { formatMobileMatchLocationLabel } from "@/lib/trainer-dashboard-utils";
import { Athlete, Match } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EGInk, Spacing } from "@/constants/theme";
import { MatchesStackParamList } from "@/navigation/MatchesStackNavigator";

type Navigation = NativeStackNavigationProp<MatchesStackParamList, "Matches">;

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

/**
 * design-source `guidelines/trainer-migration.md` step 3 (WP10) — identica
 * struttura ad Allenamenti, tre differenze: gradiente/icona gara, pillola
 * categoria variante `match`, foglio convocazioni in blu senza orario di
 * fine (le gare non ne hanno uno).
 */
export default function TrainerMatchesDashboardScreen() {
  const route = useRoute<RouteProp<MatchesStackParamList, "Matches">>();
  const navigation = useNavigation<Navigation>();
  const { trainerPermissions } = useAuthContext();
  const [matches, setMatches] = useState<Match[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [convocationDraft, setConvocationDraft] = useState<
    ConvocationDraftEntry[]
  >([]);
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
        match.date,
        match.time,
        match.location,
        match.result ? "conclusa" : "in programma",
        formatMobileMatchLocationLabel(match),
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
  const historyMatches = useMemo(
    () =>
      filteredMatches
        .filter((match) => match.date < today)
        .sort((a, b) =>
          `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`),
        ),
    [filteredMatches, today],
  );

  const openConvocationsSheet = (match: Match) => {
    const relevantAthletes = athletes.filter((athlete) => {
      if (match.categoryId && athlete.categoryId) {
        return (
          normalizeText(match.categoryId) === normalizeText(athlete.categoryId)
        );
      }

      return (
        normalizeText(match.category || "") === normalizeText(athlete.category)
      );
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
      const selectedAthletes = convocationDraft.filter(
        (entry) => entry.selected,
      );
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
        .filter(
          (entry) =>
            entry.availability === "missing" ||
            entry.availability === "expired",
        );

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
  const convocatedCount = convocationDraft.filter(
    (entry) => entry.selected,
  ).length;

  const renderMatchCard = (match: Match) => {
    const focused = match.id === focusedMatchId;
    const card = (
      <EventCard
        kind="match"
        title={`vs ${getMatchTitle(match)}`}
        time={match.time}
        dateLabel={
          match.date === today ? undefined : formatItalianDate(match.date)
        }
        pill={{ label: match.category || "Categoria", variant: "match" }}
        meta={[
          {
            icon: "location-outline",
            label: formatMobileMatchLocationLabel(match),
          },
          {
            icon: "people-outline",
            label: `${match.convokedCount ?? 0} convocati`,
          },
        ]}
        footer={
          canManageConvocations ? (
            <ActionButton
              size="sm"
              onPress={() => openConvocationsSheet(match)}
            >
              Convocazioni
            </ActionButton>
          ) : undefined
        }
      />
    );

    return focused ? (
      <View key={match.id} style={styles.focusedWrap}>
        {card}
      </View>
    ) : (
      <View key={match.id}>{card}</View>
    );
  };

  const renderGroup = (label: string, items: Match[], emptyLabel: string) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SignatureText variant="eyebrow" tone="faint">
          {label}
        </SignatureText>
        <SignatureText variant="eyebrow" tone="faint">
          {items.length}
        </SignatureText>
      </View>
      {items.length > 0 ? (
        <View style={styles.cardStack}>{items.map(renderMatchCard)}</View>
      ) : (
        <GlassCard>
          <SignatureText variant="small" tone="muted">
            {emptyLabel}
          </SignatureText>
        </GlassCard>
      )}
    </View>
  );

  return (
    <SecondaryScreenLayout
      title="Gare"
      onBack={false}
      skyHeight={340}
      onNotifications={() => navigation.navigate("Notifications")}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <SectionHero
        icon="football"
        eyebrow="PROGRAMMA GARE"
        title={
          todayMatches.length > 0
            ? `${todayMatches.length} gar${todayMatches.length === 1 ? "a" : "e"} oggi`
            : "Nessuna gara oggi"
        }
        subtitle="Convocazioni, esito e calendario delle tue gare."
        chips={[
          { label: "oggi", value: String(todayMatches.length) },
          {
            label: "settimana",
            value: String(todayMatches.length + weekMatches.length),
          },
        ]}
      />

      <View style={[styles.section, styles.sectionFirst]}>
        <TextInput
          placeholder="Cerca gara, categoria, data o luogo..."
          placeholderTextColor={EGInk.onLightFaint}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
      </View>

      {matches.length === 0 ? (
        <View style={styles.section}>
          <StateMessage
            kind="empty"
            title="Nessuna gara"
            message="Non hai ancora gare in calendario."
          />
        </View>
      ) : (
        <>
          {renderGroup(
            "GARE DI OGGI",
            todayMatches,
            "Nessuna gara registrata per oggi.",
          )}
          {renderGroup(
            "GARE DELLA SETTIMANA",
            weekMatches,
            "Nessuna gara ulteriore in settimana.",
          )}
          {renderGroup(
            "GARE PROGRAMMATE",
            futureMatches,
            "Nessuna gara nelle settimane successive.",
          )}
          {renderGroup(
            "STORICO GARE",
            historyMatches,
            "Nessuna gara in archivio.",
          )}
        </>
      )}

      <BottomSheet
        visible={Boolean(selectedMatch)}
        onClose={() => setSelectedMatch(null)}
        accessibilityLabel="Convocazioni"
      >
        <SignatureText variant="eyebrow" tone="faint">
          {selectedMatch ? `vs ${getMatchTitle(selectedMatch)}` : ""}
        </SignatureText>
        <SignatureText variant="h3" tone="ink" style={styles.sheetTitle}>
          Convocazioni
        </SignatureText>

        {convocationDraft.length > 0 ? (
          <ScrollView
            style={styles.sheetList}
            contentContainerStyle={styles.sheetListContent}
            showsVerticalScrollIndicator
          >
            {convocationDraft.map((entry) => {
              const availability = getMobileMedicalCertificateAvailability(
                entry.medicalCertExpiry,
              );
              return (
                <SelectableAthleteRow
                  key={entry.athleteId}
                  number={entry.number}
                  name={entry.name}
                  role={
                    availability !== "valid"
                      ? getMobileMedicalCertificateAvailabilityLabel(
                          availability,
                        )
                      : undefined
                  }
                  accent="primary"
                  selected={entry.selected}
                  selectedLabel="Convocato"
                  unselectedLabel="Non convocato"
                  onPress={() => toggleConvocation(entry.athleteId)}
                />
              );
            })}
          </ScrollView>
        ) : (
          <StateMessage
            kind="empty"
            title="Nessun atleta"
            message="Nessun atleta collegato a questa categoria."
          />
        )}

        <View style={styles.sheetActions}>
          <ActionButton
            variant="secondary"
            onPress={() => setSelectedMatch(null)}
          >
            Annulla
          </ActionButton>
          <ActionButton
            onPress={() => void handleSaveConvocations()}
            loading={convocationSaving}
            disabled={convocationDraft.length === 0}
            trailingIcon="arrow-forward"
          >
            {`Convoca ${convocatedCount}`}
          </ActionButton>
        </View>
      </BottomSheet>
    </SecondaryScreenLayout>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  sectionFirst: {
    marginTop: -32,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  cardStack: { gap: Spacing.md },
  focusedWrap: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 8,
    borderBottomLeftRadius: 22,
    borderWidth: 1.5,
    borderColor: "#F97316",
  },
  searchInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.14)",
    backgroundColor: "rgba(255,255,255,0.88)",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomRightRadius: 5,
    borderBottomLeftRadius: 14,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    color: EGInk.onLight,
  },
  sheetTitle: { marginBottom: Spacing.sm },
  sheetList: { maxHeight: 360 },
  sheetListContent: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});
