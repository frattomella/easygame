import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
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
import { ThemedText } from "@/components/ThemedText";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import {
  getMobileMedicalCertificateAvailability,
  getMobileMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import { formatItalianDate, formatTimeRange } from "@/lib/mobile-ui";
import { canManageMobileTrainingAttendance } from "@/lib/trainer-dashboard-utils";
import { Athlete, Training } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";
import { TrainingsStackParamList } from "@/navigation/TrainingsStackNavigator";

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
  ["cancelled", "annullato"].includes(String(training.status || "").toLowerCase());

export default function TrainerTrainingsDashboardScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const route = useRoute<RouteProp<TrainingsStackParamList, "Trainings">>();
  const { theme } = useTheme();
  const { trainerPermissions } = useAuthContext();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<AttendanceDraftEntry[]>([]);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

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

  const updateAttendanceNotes = (athleteId: string, notes: string) => {
    setAttendanceDraft((current) =>
      current.map((entry) =>
        entry.athleteId === athleteId ? { ...entry, notes } : entry,
      ),
    );
  };

  const openAttendanceSheet = (training: Training) => {
    const relevantAthletes = athletes.filter((athlete) => {
      if (training.categoryId && athlete.categoryId) {
        return normalizeText(training.categoryId) === normalizeText(athlete.categoryId);
      }

      return normalizeText(training.category) === normalizeText(athlete.category);
    });

    const existingAttendance = new Map(
      (training.attendance || []).map((entry) => [
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
    const nextStatus = isCancelledTraining(training) ? "scheduled" : "cancelled";

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

  const renderTrainingCard = (training: Training) => {
    const isFocused = focusedTrainingId === training.id;
    const canTakeAttendance =
      canManageAttendance &&
      canManageMobileTrainingAttendance(training) &&
      !isCancelledTraining(training);

    return (
      <Card
        key={training.id}
        style={[styles.trainingCard, isFocused ? styles.focusedCard : null]}
      >
        <View style={styles.trainingTopRow}>
          <View style={{ flex: 1 }}>
            <ThemedText type="body" style={styles.trainingTitle}>
              {training.title}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {formatItalianDate(training.date)} ·{" "}
              {formatTimeRange(training.time, training.endTime)}
            </ThemedText>
          </View>
          <Badge label={training.category} small />
        </View>

        <View style={styles.metaRow}>
          <Ionicons
            name="location-outline"
            size={16}
            color={theme.textSecondary}
          />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {training.location}
          </ThemedText>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="people-outline" size={16} color={theme.textSecondary} />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {training.presentCount ?? 0}/{training.totalCount ?? 0} presenti
          </ThemedText>
        </View>
        <View style={styles.metaRow}>
          <Ionicons
            name={
              isCancelledTraining(training)
                ? "close-circle-outline"
                : "play-circle-outline"
            }
            size={16}
            color={
              isCancelledTraining(training)
                ? Colors.light.destructive
                : Colors.light.success
            }
          />
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            {isCancelledTraining(training)
              ? "Allenamento annullato"
              : training.date === today
                ? "Allenamento del giorno"
                : "Allenamento programmato"}
          </ThemedText>
        </View>

        {!canTakeAttendance && canManageAttendance ? (
          <ThemedText type="small" style={styles.infoHint}>
            Le presenze sono disponibili solo per allenamenti di oggi o
            passati.
          </ThemedText>
        ) : null}

        <View style={styles.actionRow}>
          {canTakeAttendance ? (
            <Button size="sm" onPress={() => openAttendanceSheet(training)}>
              Presenze
            </Button>
          ) : null}
          {canManageStatus ? (
            <Button
              size="sm"
              variant="outline"
              onPress={() => handleToggleStatus(training)}
              loading={statusSavingId === training.id}
            >
              {isCancelledTraining(training) ? "Ripristina" : "Annulla"}
            </Button>
          ) : null}
        </View>
      </Card>
    );
  };

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
          <ThemedText type="h4" style={styles.sectionTitle}>
            Allenamenti di oggi
          </ThemedText>
          {todayTrainings.length > 0 ? (
            todayTrainings.map(renderTrainingCard)
          ) : (
            <Card>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Nessun allenamento nella giornata corrente.
              </ThemedText>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Questa settimana
          </ThemedText>
          {weekTrainings.length > 0 ? (
            weekTrainings.map(renderTrainingCard)
          ) : (
            <Card>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Nessun altro allenamento entro fine settimana.
              </ThemedText>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="h4" style={styles.sectionTitle}>
            Calendario successivo
          </ThemedText>
          {futureTrainings.length > 0 ? (
            futureTrainings.map(renderTrainingCard)
          ) : (
            <Card>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                Nessun allenamento nelle settimane successive.
              </ThemedText>
            </Card>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={Boolean(selectedTraining)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedTraining(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedTraining(null)}
        >
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.backgroundDefault }]}
            onPress={(event) => event.stopPropagation()}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              Presenze allenamento
            </ThemedText>
            <ThemedText
              type="small"
              style={{ color: theme.textSecondary, marginBottom: Spacing.md }}
            >
              {selectedTraining?.title} ·{" "}
              {selectedTraining
                ? formatTimeRange(selectedTraining.time, selectedTraining.endTime)
                : ""}
            </ThemedText>

            <ScrollView
              style={styles.modalList}
              contentContainerStyle={styles.attendanceList}
              showsVerticalScrollIndicator
            >
              {attendanceDraft.length > 0 ? (
                attendanceDraft.map((entry) => (
                  <Pressable
                    key={entry.athleteId}
                    style={[
                      styles.attendanceRow,
                      {
                        borderColor: entry.present
                          ? Colors.light.success
                          : theme.border,
                      },
                    ]}
                    onPress={() => toggleAttendance(entry.athleteId)}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={styles.attendanceRowTop}>
                        <View style={styles.attendanceInfo}>
                          <Avatar
                            name={entry.name}
                            size={42}
                            showNumber
                            number={entry.number}
                          />
                          <View style={{ marginLeft: Spacing.md, flex: 1 }}>
                            <View style={styles.nameWithWarning}>
                              <ThemedText type="body" style={styles.attendanceName}>
                                {entry.name}
                              </ThemedText>
                              {getMobileMedicalCertificateAvailability(
                                entry.medicalCertExpiry,
                              ) !== "valid" ? (
                                <Ionicons
                                  name="warning-outline"
                                  size={18}
                                  color={Colors.light.warning}
                                />
                              ) : null}
                            </View>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                              {entry.present ? "Presente" : "Assente"}
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
                          name={entry.present ? "checkmark-circle" : "ellipse-outline"}
                          size={24}
                          color={
                            entry.present ? Colors.light.success : theme.textSecondary
                          }
                        />
                      </View>
                      <TextInput
                        value={entry.notes}
                        onChangeText={(value) =>
                          updateAttendanceNotes(entry.athleteId, value)
                        }
                        placeholder="Nota presenza (opzionale)"
                        placeholderTextColor={theme.textSecondary}
                        style={[
                          styles.notesInput,
                          {
                            borderColor: theme.border,
                            color: theme.text,
                            backgroundColor: theme.backgroundDefault,
                          },
                        ]}
                      />
                    </View>
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
              <Button variant="ghost" onPress={() => setSelectedTraining(null)}>
                Annulla
              </Button>
              <Button
                onPress={() => void handleSaveAttendance()}
                loading={attendanceSaving}
                disabled={attendanceDraft.length === 0}
              >
                Salva presenze
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
  section: { marginTop: Spacing["2xl"] },
  sectionTitle: { marginBottom: Spacing.md },
  trainingCard: { marginBottom: Spacing.md },
  focusedCard: {
    borderWidth: 1.5,
    borderColor: "#2563EB",
  },
  trainingTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.md,
  },
  trainingTitle: { fontWeight: "700", marginBottom: 2 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  infoHint: {
    color: Colors.light.warning,
    marginTop: Spacing.md,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
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
  attendanceList: { gap: Spacing.sm, marginTop: Spacing.sm },
  attendanceRow: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  attendanceRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attendanceInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  nameWithWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  attendanceName: { fontWeight: "700" },
  medicalHint: {
    color: Colors.light.warning,
    marginTop: 2,
  },
  notesInput: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
});
