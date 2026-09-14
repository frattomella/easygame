import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
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
import { it } from "date-fns/locale";

import {
  ActionBarButton,
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
import type { SelectableAthleteRowMark } from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  getMobileMedicalCertificateAvailability,
  getMobileMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import {
  formatItalianDate,
  formatTimeRange,
  getRoleLabel,
} from "@/lib/mobile-ui";
import { canManageMobileTrainingAttendance } from "@/lib/trainer-dashboard-utils";
import { Athlete, Training } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EGGlass, EGInk, Spacing } from "@/constants/theme";
import { TrainingsStackParamList } from "@/navigation/TrainingsStackNavigator";

type Navigation = NativeStackNavigationProp<
  TrainingsStackParamList,
  "Trainings"
>;

type AttendanceDraftEntry = {
  athleteId: string;
  name: string;
  number: number;
  /** `"yes"` presente · `"no"` assente · `null` da segnare (nessuna riga sul server finche non lo si tocca). */
  mark: SelectableAthleteRowMark;
  /** Ha gia una riga sul server: puo solo alternare presente/assente, un upsert non la cancella. */
  saved: boolean;
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
 * Allenamenti — composizione del prototipo v3 (`isTTrainings`): nel cielo
 * `SectionHero` "{data} · Allenamenti di oggi" con i contatori; poi le
 * `EventCard` di oggi con "Registra presenze" sulla scheda, la nota
 * "Nessun altro allenamento nella giornata corrente.", e sotto le sezioni
 * settimana / calendario / storico (con ricerca). Stessi dati, stessi
 * permessi di prima.
 *
 * Presenze (design turno 6 §5): la riga cicla **da segnare → presente →
 * assente → da segnare**. E il tri-state che ADR-0168 punto 3 rinviava per
 * un vincolo di endpoint ormai superato (D-MOB-12): `POST
 * /api/v1/events/:id/participants` fa un upsert per riga, quindi le righe
 * "da segnare" **non si mandano** e l'atleta resta senza riga sul server —
 * nessuno stato inventato, nessun cambio di contratto. Un'assenza e un
 * fatto registrato, non un default.
 */
export default function TrainerTrainingsDashboardScreen() {
  const route = useRoute<RouteProp<TrainingsStackParamList, "Trainings">>();
  const navigation = useNavigation<Navigation>();
  const { trainerPermissions, currentRole } = useAuthContext();
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
  const [noteOpenFor, setNoteOpenFor] = useState<string | null>(null);
  /*
    **Un errore non e uno zero** (accettazione finale Trainer, §9) — stessa
    correzione di TrainerMatchesDashboardScreen: senza questo un fallimento
    di rete/permesso restava `trainings: []` e lo schermo mostrava "Nessun
    allenamento", indistinguibile da un club davvero senza allenamenti.
  */
  const [loadError, setLoadError] = useState<string | null>(null);

  const focusedTrainingId = route.params?.focusTrainingId || null;
  const openAttendanceRequested = Boolean(route.params?.openAttendance);
  const canManageAttendance =
    trainerPermissions?.actions.manageAttendance !== false;
  const canManageStatus =
    trainerPermissions?.actions.manageTrainingStatus !== false;

  const loadData = useCallback(async () => {
    try {
      const [nextTrainings, nextAthletes] = await Promise.all([
        mobileBackendStorage.getTrainings(),
        mobileBackendStorage.getAthletes(),
      ]);
      setTrainings(nextTrainings);
      setAthletes(nextAthletes);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Errore di connessione",
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
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
   * all'apertura del foglio, da `GET /api/v1/events/:id`. Tre stati letti
   * dal server: presente, assente, "da segnare" (`pending`, o nessuna riga).
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
            mark: (entry.present === null
              ? null
              : entry.present
                ? "yes"
                : "no") as SelectableAthleteRowMark,
            notes: String(entry.notes || ""),
          },
        ]),
      );

      setAttendanceDraft(
        relevantAthletes.map((athlete) => ({
          athleteId: athlete.id,
          name: athlete.name,
          number: athlete.number,
          mark: existingAttendance.get(athlete.id)?.mark ?? null,
          saved: existingAttendance.has(athlete.id),
          notes: existingAttendance.get(athlete.id)?.notes || "",
          medicalCertExpiry: athlete.medicalCertExpiry,
        })),
      );
      setNoteOpenFor(null);
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

  /**
   * Un tocco cicla da segnare → presente → assente → da segnare, per ogni
   * riga: "da segnare" e lo stato `pending` del server, e una riga gia
   * salvata che torna li viene riscritta come tale al salvataggio.
   */
  const toggleAttendance = (athleteId: string) => {
    setAttendanceDraft((current) =>
      current.map((entry) => {
        if (entry.athleteId !== athleteId) return entry;
        const next: SelectableAthleteRowMark =
          entry.mark === null ? "yes" : entry.mark === "yes" ? "no" : null;
        return { ...entry, mark: next };
      }),
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
          : { ...entry, mark: "yes" as const },
      ),
    );
  };

  const handleSaveAttendance = async () => {
    if (!selectedTraining) {
      return;
    }

    setAttendanceSaving(true);
    try {
      // Le righe segnate si scrivono come present/absent; una riga che il
      // server aveva e che e tornata "da segnare" si riscrive come pending.
      // Chi non ha mai avuto una riga ed e ancora "da segnare" non si manda:
      // e gia quello stato (upsert per riga, vedi la nota di testa).
      await mobileBackendStorage.saveTrainingAttendance(
        selectedTraining.id,
        attendanceDraft
          .filter((entry) => entry.mark !== null || entry.saved)
          .map((entry) => ({
            athleteId: entry.athleteId,
            present: entry.mark === null ? null : entry.mark === "yes",
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

  const presentCount = attendanceDraft.filter(
    (entry) => entry.mark === "yes",
  ).length;
  const absentCount = attendanceDraft.filter(
    (entry) => entry.mark === "no",
  ).length;
  const unmarkedCount = attendanceDraft.length - presentCount - absentCount;

  /*
    "Registra presenze" dalla Home (prototipo: la CTA sulla scheda apre il
    foglio): arriva con `openAttendance` e l'allenamento messo a fuoco — si
    apre il foglio una volta sola, appena la lista e caricata.
  */
  const [autoOpened, setAutoOpened] = useState<string | null>(null);
  React.useEffect(() => {
    if (!openAttendanceRequested || !focusedTrainingId) return;
    if (autoOpened === focusedTrainingId || selectedTraining) return;
    const training = trainings.find((item) => item.id === focusedTrainingId);
    if (!training || athletes.length === 0) return;
    setAutoOpened(focusedTrainingId);
    void openAttendanceSheet(training);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAttendanceRequested, focusedTrainingId, trainings, athletes]);

  const renderTrainingCard = (training: Training, primary = false) => {
    const cancelled = isCancelledTraining(training);
    const canTakeAttendance =
      canManageAttendance &&
      canManageMobileTrainingAttendance(training) &&
      !cancelled;
    const focused = training.id === focusedTrainingId;

    const hasAttendance =
      (training.presentCount ?? 0) > 0 || (training.totalCount ?? 0) > 0;
    const hasFooter = canTakeAttendance || canManageStatus;
    const card = (
      <EventCard
        kind="training"
        title={training.title}
        time={training.time}
        endTime={training.endTime}
        dateLabel={
          training.date === today
            ? undefined
            : capitalize(formatItalianDate(training.date, "EEE d"))
        }
        meta={[
          { icon: "location-outline", label: training.location },
          {
            icon: "people-outline",
            label: hasAttendance
              ? `${training.presentCount ?? 0}/${training.totalCount ?? 0} presenti`
              : canTakeAttendance
                ? "Presenze da registrare"
                : training.category,
          },
        ]}
        statusLabel={
          cancelled
            ? "Allenamento annullato"
            : training.status === "inProgress"
              ? "Allenamento attivo"
              : undefined
        }
        statusColor={cancelled ? "#EF4444" : "#22C55E"}
        cancelled={cancelled}
        footer={
          hasFooter ? (
            <View style={styles.cardFooter}>
              {canTakeAttendance ? (
                <ActionButton
                  size="sm"
                  fullWidth
                  variant={primary ? "primary" : "secondary"}
                  trailingIcon="arrow-forward"
                  onPress={() => void openAttendanceSheet(training)}
                  loading={attendanceLoadingId === training.id}
                >
                  Registra presenze
                </ActionButton>
              ) : null}
              {canManageStatus ? (
                <View style={styles.actionRow}>
                  <ActionBarButton
                    label={cancelled ? "Ripristina" : "Annulla allenamento"}
                    icon={
                      cancelled ? "refresh-outline" : "close-circle-outline"
                    }
                    onPress={() => handleToggleStatus(training)}
                    loading={statusSavingId === training.id}
                  />
                </View>
              ) : null}
            </View>
          ) : undefined
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
      <SectionLabel label={label} trailing={String(items.length)} />
      {items.length > 0 ? (
        <View style={styles.cardStack}>
          {items.map((training) => renderTrainingCard(training))}
        </View>
      ) : (
        <EmptyNote>{emptyLabel}</EmptyNote>
      )}
    </View>
  );

  const todayLabel = capitalize(
    format(new Date(), "EEE d MMMM", { locale: it }),
  );
  const todayPresent = todayTrainings.reduce(
    (sum, training) => sum + (training.presentCount ?? 0),
    0,
  );

  return (
    <SecondaryScreenLayout
      title="Allenamenti"
      eyebrow={`${getRoleLabel(currentRole)} · ${capitalize(format(new Date(), "EEE d MMM", { locale: it }))}`}
      onBack={false}
      skyHeight={360}
      onNotifications={() => navigation.navigate("Notifications")}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      hero={
        <SectionHero
          eyebrow={todayLabel}
          title={
            todayTrainings.length > 0
              ? "Allenamenti di oggi"
              : "Nessun allenamento oggi"
          }
          chips={[
            { label: "oggi", value: String(todayTrainings.length) },
            { label: "presenti", value: String(todayPresent) },
            { label: "atleti", value: String(athletes.length) },
          ]}
        />
      }
    >
      {loadError ? (
        <StateMessage
          kind={loadError.includes("Accesso negato") ? "forbidden" : "error"}
          message={loadError}
          actionLabel="Riprova"
          onAction={() => void loadData()}
        />
      ) : trainings.length === 0 ? (
        <StateMessage
          kind="empty"
          title="Nessun allenamento"
          message="Non hai ancora allenamenti in calendario."
        />
      ) : (
        <>
          <View style={styles.cardStack}>
            {todayTrainings.map((training, index) =>
              renderTrainingCard(training, index === 0),
            )}
            <EmptyNote>
              {todayTrainings.length > 0
                ? "Nessun altro allenamento nella giornata corrente."
                : "Nessun allenamento nella giornata corrente."}
            </EmptyNote>
          </View>

          {renderGroup(
            "Questa settimana",
            weekTrainings,
            "Nessun altro allenamento entro fine settimana.",
          )}
          {renderGroup(
            "Calendario successivo",
            futureTrainings,
            "Nessun allenamento nelle settimane successive.",
          )}

          <View style={styles.section}>
            <SectionLabel
              label="Storico allenamenti"
              trailing={String(filteredHistoryTrainings.length)}
            />
            <SignatureInput
              placeholder="Cerca per data, categoria, titolo o stato"
              value={historySearch}
              onChangeText={setHistorySearch}
              leftIcon="search-outline"
              style={{ marginBottom: Spacing.sm }}
            />
            {filteredHistoryTrainings.length > 0 ? (
              <View style={styles.cardStack}>
                {filteredHistoryTrainings.map((training) =>
                  renderTrainingCard(training),
                )}
              </View>
            ) : (
              <EmptyNote>Nessun allenamento in archivio.</EmptyNote>
            )}
          </View>
        </>
      )}

      <BottomSheet
        visible={Boolean(selectedTraining)}
        onClose={() => setSelectedTraining(null)}
        eyebrow={
          selectedTraining
            ? `${selectedTraining.title} · ${formatTimeRange(selectedTraining.time, selectedTraining.endTime)}`
            : ""
        }
        title="Registra le presenze"
        actions={
          <>
            <ActionButton
              variant="secondary"
              onPress={() => setSelectedTraining(null)}
              style={styles.cancel}
            >
              Annulla
            </ActionButton>
            <ActionButton
              variant="success"
              onPress={() => void handleSaveAttendance()}
              loading={attendanceSaving}
              disabled={attendanceDraft.length === 0}
              trailingIcon="arrow-forward"
              style={styles.confirm}
            >
              {`Salva ${presentCount}/${attendanceDraft.length}`}
            </ActionButton>
          </>
        }
      >
        {attendanceDraft.length > 0 ? (
          <>
            <View style={styles.progressRow}>
              <SignatureText style={styles.progressText}>
                {`${presentCount} presenti · ${absentCount} assenti · ${unmarkedCount} da segnare`}
              </SignatureText>
              <Pressable onPress={markAllPresent} hitSlop={8}>
                <SignatureText style={styles.markAllLabel}>
                  Segna tutti presenti
                </SignatureText>
              </Pressable>
            </View>
            {attendanceDraft.map((entry) => {
              const availability = getMobileMedicalCertificateAvailability(
                entry.medicalCertExpiry,
              );
              const disabled = availability === "expired";
              const noteOpen = noteOpenFor === entry.athleteId;
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
                        : entry.notes
                          ? `Nota: ${entry.notes}`
                          : undefined
                    }
                    accent="success"
                    mark={entry.mark}
                    labels={{
                      yes: "Presente",
                      no: "Assente",
                      unmarked: "Da segnare",
                    }}
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
                  {!disabled ? (
                    <Pressable
                      onPress={() =>
                        setNoteOpenFor(noteOpen ? null : entry.athleteId)
                      }
                      hitSlop={6}
                      style={styles.noteToggle}
                    >
                      <SignatureText style={styles.noteToggleLabel}>
                        {noteOpen
                          ? "Chiudi nota"
                          : entry.notes
                            ? "Modifica nota"
                            : "Aggiungi nota"}
                      </SignatureText>
                    </Pressable>
                  ) : null}
                  {noteOpen ? (
                    <TextInput
                      value={entry.notes}
                      onChangeText={(value) =>
                        updateAttendanceNotes(entry.athleteId, value)
                      }
                      placeholder="Nota presenza (opzionale)"
                      placeholderTextColor={EGInk.onLightFaint}
                      autoFocus
                      style={styles.notesInput}
                    />
                  ) : null}
                </View>
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
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
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
  rowStack: { gap: 4 },
  noteToggle: {
    alignSelf: "flex-end",
    paddingHorizontal: 4,
  },
  noteToggleLabel: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  notesInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.14)",
    backgroundColor: "rgba(255,255,255,0.88)",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 13,
    color: EGInk.onLight,
  },
  cancel: { width: 100 },
  confirm: { flex: 1 },
});
