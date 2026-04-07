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
import { formatItalianDate, formatTimeRange } from "@/lib/mobile-ui";
import { canManageMobileTrainingAttendance } from "@/lib/trainer-dashboard-utils";
import { Training } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";

type AttendanceDraftEntry = {
  athleteId: string;
  name: string;
  number: number;
  present: boolean;
  notes: string;
};

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getTodayKey = () => format(new Date(), "yyyy-MM-dd");
const getWeekEndKey = () => format(addDays(new Date(), 6), "yyyy-MM-dd");

export default function TrainerTrainingsScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { trainerPermissions } = useAuthContext();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTraining, setSelectedTraining] = useState<Training | null>(null);
  const [attendanceDraft, setAttendanceDraft] = useState<AttendanceDraftEntry[]>(
    [],
  );
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const nextTrainings = await mobileBackendStorage.getTrainings();
    setTrainings(nextTrainings);
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

  const canManageAttendance =
    trainerPermissions?.actions.manageAttendance !== false;
  const canManageStatus =
    trainerPermissions?.actions.manageTrainingStatus !== false;

  const openAttendanceSheet = async (training: Training) => {
    const athletes = await mobileBackendStorage.getAthletes();
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

  const handleToggleStatus = async (training: Training) => {
    setStatusSavingId(training.id);
    try {
      await mobileBackendStorage.updateTrainingStatus(
        training.id,
        training.status === "cancelled" ? "scheduled" : "cancelled",
      );
      await loadData();
    } finally {
      setStatusSavingId(null);
    }
  };

  const renderTrainingCard = (training: Training) => (
    <Card key={training.id} style={styles.trainingCard}>
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
            training.status === "cancelled"
              ? "close-circle-outline"
              : "play-circle-outline"
          }
          size={16}
          color={
            training.status === "cancelled"
              ? Colors.light.destructive
              : Colors.light.success
          }
        />
        <ThemedText type="small" style={{ color: theme.textSecondary }}>
          {training.status === "cancelled"
            ? "Allenamento annullato"
            : "Allenamento attivo"}
        </ThemedText>
      </View>
      <View style={styles.actionRow}>
        {canManageAttendance && canManageMobileTrainingAttendance(training) ? (
          <Button size="sm" onPress={() => void openAttendanceSheet(training)}>
            Presenze
          </Button>
        ) : null}
        {canManageStatus ? (
          <Button
            size="sm"
            variant="outline"
            onPress={() => void handleToggleStatus(training)}
            loading={statusSavingId === training.id}
          >
            {training.status === "cancelled" ? "Ripristina" : "Annulla"}
          </Button>
        ) : null}
      </View>
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
        <View style={[styles.todayHero, { backgroundColor: "#2563EB" }]}>
          <ThemedText type="small" style={styles.heroEyebrow}>
            Programma di oggi
          </ThemedText>
          <ThemedText type="h4" style={styles.heroTitle}>
            {todayTrainings.length > 0
              ? `${todayTrainings.length} allenamenti in evidenza`
              : "Nessun allenamento previsto oggi"}
          </ThemedText>
          <ThemedText type="small" style={styles.heroSubtitle}>
            Allenamenti del giorno in alto, poi la settimana corrente e il
            calendario successivo.
          </ThemedText>
        </View>

        <View style={styles.section}>
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
              <View style={styles.attendanceList}>
                {attendanceDraft.map((entry) => (
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
                    <View style={styles.attendanceInfo}>
                      <Avatar
                        name={entry.name}
                        size={42}
                        showNumber
                        number={entry.number}
                      />
                      <View style={{ marginLeft: Spacing.md, flex: 1 }}>
                        <ThemedText type="body" style={styles.attendanceName}>
                          {entry.name}
                        </ThemedText>
                        <ThemedText
                          type="small"
                          style={{ color: theme.textSecondary }}
                        >
                          {entry.present ? "Presente" : "Assente"}
                        </ThemedText>
                      </View>
                    </View>
                    <Ionicons
                      name={
                        entry.present
                          ? "checkmark-circle"
                          : "ellipse-outline"
                      }
                      size={24}
                      color={
                        entry.present
                          ? Colors.light.success
                          : theme.textSecondary
                      }
                    />
                  </Pressable>
                ))}
              </View>
              <View style={styles.modalButtons}>
                <Button
                  variant="ghost"
                  onPress={() => setSelectedTraining(null)}
                >
                  Annulla
                </Button>
                <Button
                  onPress={() => void handleSaveAttendance()}
                  loading={attendanceSaving}
                >
                  Salva presenze
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
  trainingCard: { marginBottom: Spacing.md },
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
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
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
  attendanceList: { gap: Spacing.sm, marginTop: Spacing.sm },
  attendanceRow: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attendanceInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  attendanceName: { fontWeight: "700" },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
});
