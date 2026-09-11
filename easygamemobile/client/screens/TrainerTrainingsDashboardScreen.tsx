import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
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
import { formatItalianDate, formatTimeRange } from "@/lib/mobile-ui";
import { canManageMobileTrainingAttendance } from "@/lib/trainer-dashboard-utils";
import { Athlete, Training } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EGInk, Spacing } from "@/constants/theme";
import { TrainingsStackParamList } from "@/navigation/TrainingsStackNavigator";

type Navigation = NativeStackNavigationProp<
  TrainingsStackParamList,
  "Trainings"
>;

type AttendanceDraftEntry = {
  athleteId: string;
  name: string;
  number: number;
  present: boolean;
  notes: string;
  medicalCertExpiry?: string;
};

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getTodayKey = () => format(new Date(), "yyyy-MM-dd");
const getWeekEndKey = () => format(addDays(new Date(), 6), "yyyy-MM-dd");
const isCancelledTraining = (training: Training) =>
  ["cancelled", "annullato"].includes(
    String(training.status || "").toLowerCase(),
  );

/**
 * design-source `guidelines/trainer-migration.md` step 2 (WP10). Stessi
 * dati, stessa logica di `mobileBackendStorage` e `trainerPermissions` di
 * prima — solo la veste cambia: `EventCard` al posto della `Card` piatta,
 * `BottomSheet` + `SelectableAthleteRow` al posto della `Modal` nativa per
 * le presenze.
 */
export default function TrainerTrainingsDashboardScreen() {
  const route = useRoute<RouteProp<TrainingsStackParamList, "Trainings">>();
  const navigation = useNavigation<Navigation>();
  const { trainerPermissions } = useAuthContext();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(
    null,
  );
  const [attendanceDraft, setAttendanceDraft] = useState<
    AttendanceDraftEntry[]
  >([]);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);
  const [attendanceLoadingId, setAttendanceLoadingId] = useState<string | null>(
    null,
  );

  const focusedTrainingId = route.params?.focusTrainingId || null;
  const canManageAttendance =
    trainerPermissions?.actions.manageAttendance !== false;
  const canManageStatus =
    trainerPermissions?.actions.manageTrainingStatus !== false;

  const loadData = useCallback(async () => {
    const [nextTrainings, nextAthletes] = await Promise.all([
      mobileBackendStorage.getTrainings(),
      mobileBackendStorage.getAthletes(),
    ]);
    setTrainings(nextTrainings);
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
  const todayTrainings = useMemo(
    () => trainings.filter((training) => training.date === today),
    [today, trainings],
  );
  const weekTrainings = useMemo(
    () =>
      trainings.filter(
        (training) => training.date > today && training.date <= weekEnd,
      ),
    [today, trainings, weekEnd],
  );
  const futureTrainings = useMemo(
    () => trainings.filter((training) => training.date > weekEnd),
    [trainings, weekEnd],
  );
  const historyTrainings = useMemo(
    () =>
      trainings
        .filter((training) => training.date < today)
        .sort((a, b) =>
          `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`),
        ),
    [today, trainings],
  );
  const filteredHistoryTrainings = useMemo(() => {
    const normalizedQuery = historySearch.trim().toLowerCase();
    if (!normalizedQuery) {
      return historyTrainings;
    }

    return historyTrainings.filter((training) =>
      [
        training.title,
        training.category,
        training.date,
        training.time,
        training.location,
        training.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [historySearch, historyTrainings]);

  const updateAttendanceNotes = (athleteId: string, notes: string) => {
    setAttendanceDraft((current) =>
      current.map((entry) =>
        entry.athleteId === athleteId ? { ...entry, notes } : entry,
      ),
    );
  };

  /**
   * D-MOB-12 (WP13): l'appello non arriva piu gia incluso nella lista
   * (`GET /api/v1/events` porta solo i conteggi aggregati) — va letto
   * all'apertura del foglio, da `GET /api/v1/events/:id`. Stesso esito di
   * prima per chi lo guarda: un atleta assente dall'appello resta "non
   * ancora segnato", present:false.
   */
  const openAttendanceSheet = async (training: Training) => {
    const relevantAthletes = athletes.filter((athlete) => {
      if (training.categoryId && athlete.categoryId) {
        return (
          normalizeText(training.categoryId) ===
          normalizeText(athlete.categoryId)
        );
      }

      return (
        normalizeText(training.category) === normalizeText(athlete.category)
      );
    });

    setAttendanceLoadingId(training.id);
    try {
      const attendance = await mobileBackendStorage.getTrainingAttendance(
        training.id,
      );
      const existingAttendance = new Map(
        attendance.map((entry) => [
          entry.athleteId,
          {
            present: Boolean(entry.present),
            notes: String(entry.notes || ""),
          },
        ]),
      );

      setAttendanceDraft(
        relevantAthletes.map((athlete) => ({
          athleteId: athlete.id,
          name: athlete.name,
          number: athlete.number,
          present: existingAttendance.get(athlete.id)?.present || false,
          notes: existingAttendance.get(athlete.id)?.notes || "",
          medicalCertExpiry: athlete.medicalCertExpiry,
        })),
      );
      setSelectedTraining(training);
    } catch (error) {
      Alert.alert(
        "Presenze non disponibili",
        error instanceof Error
          ? error.message
          : "Impossibile caricare l'appello. Riprova.",
      );
    } finally {
      setAttendanceLoadingId(null);
    }
  };

  const toggleAttendance = (athleteId: string) => {
    setAttendanceDraft((current) =>
      current.map((entry) =>
        entry.athleteId === athleteId
          ? { ...entry, present: !entry.present }
          : entry,
      ),
    );
  };

  /**
   * v3.0 (`migration-v3.md` passo 5): la scorciatoia "Segna tutti
   * presenti" — salta le righe bloccate da un certificato medico scaduto,
   * che `SelectableAthleteRow` rifiuta comunque di marcare.
   */
  const markAllPresent = () => {
    setAttendanceDraft((current) =>
      current.map((entry) =>
        getMobileMedicalCertificateAvailability(entry.medicalCertExpiry) ===
        "expired"
          ? entry
          : { ...entry, present: true },
      ),
    );
  };

  const handleSaveAttendance = async () => {
    if (!selectedTraining) {
      return;
    }

    setAttendanceSaving(true);
    try {
      await mobileBackendStorage.saveTrainingAttendance(
        selectedTraining.id,
        attendanceDraft.map((entry) => ({
          athleteId: entry.athleteId,
          present: entry.present,
          notes: entry.notes,
        })),
      );
      await loadData();
      setSelectedTraining(null);
      setAttendanceDraft([]);
    } finally {
      setAttendanceSaving(false);
    }
  };

  const handleToggleStatus = (training: Training) => {
    const nextStatus = isCancelledTraining(training)
      ? "scheduled"
      : "cancelled";

    Alert.alert(
      isCancelledTraining(training)
        ? "Ripristinare allenamento?"
        : "Annullare allenamento?",
      isCancelledTraining(training)
        ? "L'allenamento tornera operativo e gestibile come di consueto."
        : "L'allenamento verra segnato come annullato per il trainer.",
      [
        { text: "No", style: "cancel" },
        {
          text: "Si",
          onPress: async () => {
            setStatusSavingId(training.id);
            try {
              await mobileBackendStorage.updateTrainingStatus(
                training.id,
                nextStatus,
              );
              await loadData();
            } finally {
              setStatusSavingId(null);
            }
          },
        },
      ],
    );
  };

  const presentCount = attendanceDraft.filter((entry) => entry.present).length;

  const renderTrainingCard = (training: Training) => {
    const cancelled = isCancelledTraining(training);
    const canTakeAttendance =
      canManageAttendance &&
      canManageMobileTrainingAttendance(training) &&
      !cancelled;
    const focused = training.id === focusedTrainingId;

    const card = (
      <EventCard
        kind="training"
        title={training.title}
        time={training.time}
        endTime={training.endTime}
        dateLabel={
          training.date === today ? undefined : formatItalianDate(training.date)
        }
        pill={{ label: training.category, variant: "default" }}
        meta={[
          { icon: "location-outline", label: training.location },
          {
            icon: "people-outline",
            label: `${training.presentCount ?? 0}/${training.totalCount ?? 0} presenti`,
          },
        ]}
        statusLabel={
          cancelled
            ? "Allenamento annullato"
            : training.date === today
              ? "Allenamento del giorno"
              : "Allenamento programmato"
        }
        statusColor={cancelled ? "#EF4444" : "#22C55E"}
        cancelled={cancelled}
        footer={
          <View style={styles.cardFooter}>
            {!canTakeAttendance && canManageAttendance && !cancelled ? (
              <SignatureText
                variant="small"
                style={{ color: "#B45309", fontWeight: "600" }}
              >
                Le presenze sono disponibili solo per allenamenti di oggi o
                passati.
              </SignatureText>
            ) : null}
            <View style={styles.actionRow}>
              {canTakeAttendance ? (
                <ActionButton
                  size="sm"
                  onPress={() => void openAttendanceSheet(training)}
                  loading={attendanceLoadingId === training.id}
                >
                  Presenze
                </ActionButton>
              ) : null}
              {canManageStatus ? (
                <ActionButton
                  size="sm"
                  variant="outline"
                  onPress={() => handleToggleStatus(training)}
                  loading={statusSavingId === training.id}
                >
                  {cancelled ? "Ripristina" : "Annulla"}
                </ActionButton>
              ) : null}
            </View>
          </View>
        }
      />
    );

    return focused ? (
      <View key={training.id} style={styles.focusedWrap}>
        {card}
      </View>
    ) : (
      <View key={training.id}>{card}</View>
    );
  };

  const renderGroup = (
    label: string,
    items: Training[],
    emptyLabel: string,
  ) => (
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
        <View style={styles.cardStack}>{items.map(renderTrainingCard)}</View>
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
      title="Allenamenti"
      onBack={false}
      skyHeight={340}
      onNotifications={() => navigation.navigate("Notifications")}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <SectionHero
        icon="fitness"
        eyebrow="PROGRAMMA DI OGGI"
        title={
          todayTrainings.length > 0
            ? `${todayTrainings.length} allenament${todayTrainings.length === 1 ? "o" : "i"}`
            : "Nessun allenamento"
        }
        subtitle="Presenze, stato e calendario dei tuoi allenamenti."
        chips={[
          { label: "oggi", value: String(todayTrainings.length) },
          {
            label: "settimana",
            value: String(todayTrainings.length + weekTrainings.length),
          },
        ]}
      />

      {trainings.length === 0 ? (
        <View style={styles.section}>
          <StateMessage
            kind="empty"
            title="Nessun allenamento"
            message="Non hai ancora allenamenti in calendario."
          />
        </View>
      ) : (
        <>
          <View style={[styles.section, styles.sectionFirst]}>
            {todayTrainings.length > 0 ? (
              <View style={styles.cardStack}>
                {todayTrainings.map(renderTrainingCard)}
              </View>
            ) : (
              <GlassCard>
                <SignatureText variant="small" tone="muted">
                  Nessun allenamento nella giornata corrente.
                </SignatureText>
              </GlassCard>
            )}
          </View>

          {renderGroup(
            "QUESTA SETTIMANA",
            weekTrainings,
            "Nessun altro allenamento entro fine settimana.",
          )}
          {renderGroup(
            "CALENDARIO SUCCESSIVO",
            futureTrainings,
            "Nessun allenamento nelle settimane successive.",
          )}

          <View style={styles.section}>
            <SignatureText variant="eyebrow" tone="faint">
              STORICO ALLENAMENTI
            </SignatureText>
            <View style={{ marginTop: Spacing.sm, marginBottom: Spacing.sm }}>
              <TextInput
                placeholder="Cerca per data, categoria, titolo o stato..."
                placeholderTextColor={EGInk.onLightFaint}
                value={historySearch}
                onChangeText={setHistorySearch}
                style={styles.searchInput}
              />
            </View>
            {filteredHistoryTrainings.length > 0 ? (
              <View style={styles.cardStack}>
                {filteredHistoryTrainings.map(renderTrainingCard)}
              </View>
            ) : (
              <GlassCard>
                <SignatureText variant="small" tone="muted">
                  Nessun allenamento in archivio.
                </SignatureText>
              </GlassCard>
            )}
          </View>
        </>
      )}

      <BottomSheet
        visible={Boolean(selectedTraining)}
        onClose={() => setSelectedTraining(null)}
        accessibilityLabel="Presenze"
      >
        <SignatureText variant="eyebrow" tone="faint">
          {selectedTraining
            ? formatTimeRange(selectedTraining.time, selectedTraining.endTime)
            : ""}
        </SignatureText>
        <SignatureText variant="h3" tone="ink" style={styles.sheetTitle}>
          Presenze
        </SignatureText>

        {attendanceDraft.length > 0 ? (
          <>
            <View style={styles.progressRow}>
              <SignatureText variant="small" tone="muted">
                {`${presentCount} presenti · ${attendanceDraft.length - presentCount} da segnare`}
              </SignatureText>
              <Pressable onPress={markAllPresent} hitSlop={8}>
                <SignatureText variant="small" style={styles.markAllLabel}>
                  Segna tutti presenti
                </SignatureText>
              </Pressable>
            </View>
            <ScrollView
              style={styles.sheetList}
              contentContainerStyle={styles.sheetListContent}
              showsVerticalScrollIndicator
            >
              {attendanceDraft.map((entry) => {
                const availability = getMobileMedicalCertificateAvailability(
                  entry.medicalCertExpiry,
                );
                const disabled = availability === "expired";
                return (
                  <View key={entry.athleteId} style={styles.rowStack}>
                    <SelectableAthleteRow
                      number={entry.number}
                      name={entry.name}
                      role={
                        availability !== "valid"
                          ? getMobileMedicalCertificateAvailabilityLabel(
                              availability,
                            )
                          : undefined
                      }
                      accent="success"
                      selected={entry.present}
                      selectedLabel="Presente"
                      unselectedLabel="Assente"
                      disabled={disabled}
                      disabledReason={
                        disabled
                          ? getMobileMedicalCertificateAvailabilityLabel(
                              availability,
                            )
                          : undefined
                      }
                      onPress={() => toggleAttendance(entry.athleteId)}
                    />
                    <TextInput
                      value={entry.notes}
                      onChangeText={(value) =>
                        updateAttendanceNotes(entry.athleteId, value)
                      }
                      placeholder="Nota presenza (opzionale)"
                      placeholderTextColor={EGInk.onLightFaint}
                      style={styles.notesInput}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </>
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
            onPress={() => setSelectedTraining(null)}
          >
            Annulla
          </ActionButton>
          <ActionButton
            onPress={() => void handleSaveAttendance()}
            loading={attendanceSaving}
            disabled={attendanceDraft.length === 0}
            trailingIcon="arrow-forward"
          >
            {`Salva ${presentCount}/${attendanceDraft.length}`}
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
  /** The first panel below `SectionHero` straddles the sky/mist horizon (acceptance check #5). */
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
  /** Ring around the training opened from a notification deep link — same cue the old flat `Card` border gave. */
  focusedWrap: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 8,
    borderBottomLeftRadius: 22,
    borderWidth: 1.5,
    borderColor: "#2563EB",
  },
  cardFooter: { gap: Spacing.sm },
  actionRow: { flexDirection: "row", gap: Spacing.sm },
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
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  markAllLabel: {
    color: "#1D4ED8",
    fontWeight: "700",
  },
  sheetList: { maxHeight: 360 },
  sheetListContent: { gap: Spacing.sm, paddingBottom: Spacing.sm },
  rowStack: { gap: 6 },
  notesInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.14)",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 13,
    color: EGInk.onLight,
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
});
