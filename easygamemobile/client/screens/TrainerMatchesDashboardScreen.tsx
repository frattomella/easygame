import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl, StyleSheet, View } from "react-native";
import {
  RouteProp,
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { addDays, format } from "date-fns";
import { it } from "date-fns/locale";

import {
  ActionButton,
  BottomSheet,
  EventCard,
  GlassSurface,
  SecondaryScreenLayout,
  SectionHero,
  SectionLabel,
  SelectableAthleteRow,
  SignatureInput,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  getMobileMedicalCertificateAvailability,
  getMobileMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import { formatItalianDate, getRoleLabel } from "@/lib/mobile-ui";
import { formatMobileMatchLocationLabel } from "@/lib/trainer-dashboard-utils";
import { Athlete, Match } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EGGlass, Spacing } from "@/constants/theme";
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
 * Gare — composizione del prototipo v3 (`isTMatches`): `SectionHero`
 * "Settimana · Gare della settimana" con i contatori (gare · convocati),
 * poi le `EventCard` con striscia gara, giorno nella rotaia oraria e
 * "Gestisci convocazioni" sulla scheda; le sezioni successive (programmate,
 * storico) e la ricerca restano. Il foglio convocazioni e la stessa riga
 * delle presenze, in blu: convocato / da valutare (il server sostituisce
 * l'elenco intero, quindi "non convocato" non e uno stato distinto).
 */
export default function TrainerMatchesDashboardScreen() {
  const route = useRoute<RouteProp<MatchesStackParamList, "Matches">>();
  const navigation = useNavigation<Navigation>();
  const { trainerPermissions, currentRole, currentClub } = useAuthContext();
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
  const openConvocationsRequested = Boolean(route.params?.openConvocations);
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
  // Scheda gara del prototipo: "Fortitudo Scauri vs San Nilo" nell'ordine
  // casa/trasferta (`homeTeam`/`awayTeam` del payload sono segnaposto:
  // il nome del club e quello del contesto); "vs Avversario" senza club.
  const getMatchCardTitle = (match: Match) => {
    const opponent = getMatchTitle(match);
    const club = String(currentClub?.name || "").trim();
    if (!club || !opponent) return `vs ${opponent || "Gara"}`;
    return match.isHome ? `${club} vs ${opponent}` : `${opponent} vs ${club}`;
  };
  const convocatedCount = convocationDraft.filter(
    (entry) => entry.selected,
  ).length;
  const toEvaluateCount = convocationDraft.length - convocatedCount;

  /* "Gestisci convocazioni" dalla Home: apre il foglio della gara messa a fuoco, una volta. */
  const [autoOpened, setAutoOpened] = useState<string | null>(null);
  React.useEffect(() => {
    if (!openConvocationsRequested || !focusedMatchId) return;
    if (autoOpened === focusedMatchId || selectedMatch) return;
    const match = matches.find((item) => item.id === focusedMatchId);
    if (!match || athletes.length === 0) return;
    setAutoOpened(focusedMatchId);
    openConvocationsSheet(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openConvocationsRequested, focusedMatchId, matches, athletes]);

  const renderMatchCard = (match: Match, primary = false) => {
    const focused = match.id === focusedMatchId;
    const played = Boolean(match.result) || match.date < today;
    const card = (
      <EventCard
        kind="match"
        title={getMatchCardTitle(match)}
        time={match.time || "--:--"}
        dateLabel={
          match.date === today
            ? "Oggi"
            : capitalize(formatItalianDate(match.date, "EEE d"))
        }
        meta={[
          {
            icon: "location-outline",
            label: formatMobileMatchLocationLabel(match),
          },
          {
            icon: "people-outline",
            label:
              (match.convokedCount ?? 0) > 0
                ? `${match.convokedCount} convocati`
                : canManageConvocations && !played
                  ? "Convocazioni da inviare"
                  : match.category || "Gara",
          },
        ]}
        statusLabel={match.result ? `Risultato ${match.result}` : undefined}
        statusColor="#15803D"
        footer={
          canManageConvocations && !played ? (
            <ActionButton
              size="sm"
              fullWidth
              variant={primary ? "primary" : "secondary"}
              trailingIcon="arrow-forward"
              onPress={() => openConvocationsSheet(match)}
            >
              Gestisci convocazioni
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

  const renderGroup = (
    label: string,
    items: Match[],
    emptyLabel: string,
    primaryFirst = false,
  ) => (
    <View style={styles.section}>
      <SectionLabel label={label} trailing={String(items.length)} />
      {items.length > 0 ? (
        <View style={styles.cardStack}>
          {items.map((match, index) =>
            renderMatchCard(match, primaryFirst && index === 0),
          )}
        </View>
      ) : (
        <EmptyNote>{emptyLabel}</EmptyNote>
      )}
    </View>
  );

  const weekCount = todayMatches.length + weekMatches.length;
  const weekConvoked = [...todayMatches, ...weekMatches].reduce(
    (sum, match) => sum + (match.convokedCount ?? 0),
    0,
  );

  return (
    <SecondaryScreenLayout
      title="Gare"
      eyebrow={`${getRoleLabel(currentRole)} · Settimana ${format(new Date(), "w", { locale: it })}`}
      onBack={false}
      skyHeight={360}
      onNotifications={() => navigation.navigate("Notifications")}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      hero={
        <SectionHero
          eyebrow={`Settimana ${format(new Date(), "w", { locale: it })}`}
          title={
            weekCount > 0 ? "Gare della settimana" : "Nessuna gara in settimana"
          }
          chips={[
            {
              label: weekCount === 1 ? "gara" : "gare",
              value: String(weekCount),
            },
            { label: "convocati", value: String(weekConvoked) },
          ]}
        />
      }
    >
      {matches.length === 0 ? (
        <StateMessage
          kind="empty"
          title="Nessuna gara"
          message="Non hai ancora gare in calendario."
        />
      ) : (
        <>
          <View style={styles.cardStack}>
            {[...todayMatches, ...weekMatches].map((match, index) =>
              renderMatchCard(match, index === 0),
            )}
            {weekCount === 0 ? (
              <EmptyNote>Nessuna gara entro fine settimana.</EmptyNote>
            ) : null}
          </View>

          {renderGroup(
            "Gare programmate",
            futureMatches,
            "Nessuna gara nelle settimane successive.",
          )}

          <View style={styles.section}>
            <SectionLabel
              label="Storico gare"
              trailing={String(historyMatches.length)}
            />
            <SignatureInput
              placeholder="Cerca gara, categoria, data o luogo"
              value={searchQuery}
              onChangeText={setSearchQuery}
              leftIcon="search-outline"
              style={{ marginBottom: Spacing.sm }}
            />
            {historyMatches.length > 0 ? (
              <View style={styles.cardStack}>
                {historyMatches.map((match) => renderMatchCard(match))}
              </View>
            ) : (
              <EmptyNote>Nessuna gara in archivio.</EmptyNote>
            )}
          </View>
        </>
      )}

      <BottomSheet
        visible={Boolean(selectedMatch)}
        onClose={() => setSelectedMatch(null)}
        eyebrow={
          selectedMatch
            ? `vs ${getMatchTitle(selectedMatch)} · ${capitalize(formatItalianDate(selectedMatch.date, "EEE d"))}`
            : ""
        }
        title="Scegli i convocati"
        actions={
          <>
            <ActionButton
              variant="secondary"
              onPress={() => setSelectedMatch(null)}
              style={styles.cancel}
            >
              Annulla
            </ActionButton>
            <ActionButton
              onPress={() => void handleSaveConvocations()}
              loading={convocationSaving}
              disabled={convocationDraft.length === 0}
              trailingIcon="arrow-forward"
              style={styles.confirm}
            >
              {`Convoca ${convocatedCount}`}
            </ActionButton>
          </>
        }
      >
        {convocationDraft.length > 0 ? (
          <>
            <View style={styles.progressRow}>
              <SignatureText style={styles.progressText}>
                {`${convocatedCount} convocati · ${toEvaluateCount} da valutare`}
              </SignatureText>
              <SignatureText
                style={styles.markAllLabel}
                onPress={() =>
                  setConvocationDraft((current) =>
                    current.map((entry) =>
                      getMobileMedicalCertificateAvailability(
                        entry.medicalCertExpiry,
                      ) === "expired"
                        ? entry
                        : { ...entry, selected: true },
                    ),
                  )
                }
              >
                Convoca tutti
              </SignatureText>
            </View>
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
                  mark={entry.selected ? "yes" : null}
                  labels={{
                    yes: "Convocato",
                    no: "Non convocato",
                    unmarked: "Da segnare",
                  }}
                  onPress={() => toggleConvocation(entry.athleteId)}
                />
              );
            })}
          </>
        ) : (
          <StateMessage
            kind="empty"
            title="Nessun atleta"
            message="Nessun atleta collegato a questa categoria."
          />
        )}
      </BottomSheet>
    </SecondaryScreenLayout>
  );
}

const capitalize = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

function EmptyNote({ children }: { children: string }) {
  return (
    <GlassSurface tone="light" corner="control" style={styles.emptyNote}>
      <SignatureText style={styles.emptyNoteText}>{children}</SignatureText>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  cardStack: { gap: Spacing.md },
  focusedWrap: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 8,
    borderBottomLeftRadius: 22,
    borderWidth: 1.5,
    borderColor: "#2563EB",
  },
  emptyNote: {
    borderColor: EGGlass.border,
  },
  emptyNoteText: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  progressText: {
    flex: 1,
    color: "rgba(11,26,58,0.62)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  markAllLabel: {
    color: "#1E40AF",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  cancel: { width: 100 },
  confirm: { flex: 1 },
});
