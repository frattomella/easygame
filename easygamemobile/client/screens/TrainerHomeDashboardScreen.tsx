import React, { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import {
  ActionButton,
  EventCard,
  GlassSurface,
  GradientFill,
  NavTileGrid,
  SecondaryScreenLayout,
  SectionHero,
  SectionLabel,
  SignatureText,
  StatusPill,
} from "@/components/signature";
import type { NavTileItem } from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import { formatItalianDate, getRoleLabel } from "@/lib/mobile-ui";
import {
  canManageMobileTrainingAttendance,
  formatMobileMatchLocationLabel,
} from "@/lib/trainer-dashboard-utils";
import { Match, Task, Training } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EGGlass, EGShadow } from "@/constants/theme";
import type { HomeStackParamList } from "@/navigation/HomeStackNavigator";
import type { TrainerNavigationPermissionKey } from "@/lib/trainer-permissions";

type Navigation = NativeStackNavigationProp<HomeStackParamList, "Home">;

const isCancelled = (status?: string | null) =>
  ["cancelled", "annullato"].includes(String(status || "").toLowerCase());

/**
 * La Home Trainer del design v3 (`IA e Home` §1a/§2a, prototipo `isTHome`):
 * "Now → sections → this week". Nel cielo l'`AppBar` (Dashboard ·
 * Allenatore · data) e il `SectionHero` (Oggi · Buongiorno · tre contatori);
 * poi, in ordine, **la prossima cosa da fare** — l'`EventCard` del prossimo
 * allenamento con "Registra presenze" sulla scheda — la riga compatta
 * della prossima gara con la pill "Convocazioni", e la griglia 4×2 delle
 * sezioni ("Le tue sezioni") con i contatori vivi. Stessi dati di prima
 * (`mobileBackendStorage`), stesse chiavi di permesso
 * (`trainerPermissions.navigation.*` / `widgets.*`): un permesso spento
 * toglie la tile, mai la ingrigisce.
 */
export default function TrainerHomeDashboardScreen() {
  const navigation = useNavigation<Navigation>();
  const { currentRole, trainerPermissions, user } = useAuthContext();

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const [nextTrainings, nextMatches, nextTasks] = await Promise.all([
      mobileBackendStorage.getTrainings(),
      mobileBackendStorage.getMatches(),
      mobileBackendStorage.getTasks(),
    ]);
    setTrainings(nextTrainings);
    setMatches(nextMatches);
    setTasks(nextTasks.filter((item) => !item.completed));
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

  const today = format(new Date(), "yyyy-MM-dd");
  const todayTrainings = useMemo(
    () => trainings.filter((training) => training.date === today),
    [today, trainings],
  );
  const todayMatches = useMemo(
    () => matches.filter((match) => match.date === today),
    [matches, today],
  );
  /** La prossima cosa da fare: l'allenamento di oggi ancora aperto, altrimenti il primo futuro. */
  const nextTraining = useMemo(() => {
    const open = trainings.filter(
      (training) => training.date >= today && !isCancelled(training.status),
    );
    return open[0] || null;
  }, [today, trainings]);
  const nextMatch = useMemo(() => {
    const open = matches.filter((match) => match.date >= today);
    return open[0] || null;
  }, [matches, today]);

  const tabs = navigation.getParent() as
    | { navigate: (...args: unknown[]) => void }
    | undefined;
  const openTraining = (trainingId: string, openAttendance = false) =>
    tabs?.navigate("TrainingsTab", {
      screen: "Trainings",
      params: { focusTrainingId: trainingId, openAttendance },
    });
  const openMatch = (matchId: string, openConvocations = false) =>
    tabs?.navigate("MatchesTab", {
      screen: "Matches",
      params: { focusMatchId: matchId, openConvocations },
    });

  const nav = trainerPermissions?.navigation;
  const allowed = (key: TrainerNavigationPermissionKey) => nav?.[key] !== false;

  const tiles = (
    [
      allowed("trainings")
        ? {
            key: "trainings",
            label: "Allenamenti",
            icon: "fitness",
            color: "#2563EB",
            badge: todayTrainings.length,
            badgeColor: "#1D4ED8",
            onPress: () => tabs?.navigate("TrainingsTab"),
          }
        : null,
      allowed("matches")
        ? {
            key: "matches",
            label: "Gare",
            icon: "football",
            color: "#F97316",
            badge: todayMatches.length,
            badgeColor: "#C2410C",
            onPress: () => tabs?.navigate("MatchesTab"),
          }
        : null,
      allowed("athletes")
        ? {
            key: "athletes",
            label: "Atleti",
            icon: "people",
            color: "#2563EB",
            onPress: () => tabs?.navigate("AthletesTab"),
          }
        : null,
      allowed("categories")
        ? {
            key: "categories",
            label: "Squadre",
            icon: "shield-outline",
            color: "#3533CD",
            onPress: () => navigation.navigate("Categories"),
          }
        : null,
      allowed("board")
        ? {
            key: "board",
            label: "Bacheca",
            icon: "megaphone-outline",
            color: "#3533CD",
            onPress: () => navigation.navigate("Board"),
          }
        : null,
      allowed("documents")
        ? {
            key: "documents",
            label: "Documenti",
            icon: "document-text-outline",
            color: "#F59E0B",
            onPress: () => navigation.navigate("Documents"),
          }
        : null,
      allowed("appointments")
        ? {
            key: "appointments",
            label: "Appuntam.",
            icon: "calendar-outline",
            color: "#2563EB",
            onPress: () => navigation.navigate("Appointments"),
          }
        : null,
      allowed("compensation")
        ? {
            key: "compensation",
            label: "Compensi",
            icon: "cash-outline",
            color: "#10B981",
            onPress: () => navigation.navigate("Compensation"),
          }
        : null,
    ] as (NavTileItem | null)[]
  ).filter((tile): tile is NavTileItem => tile !== null);

  const todayLabel = format(new Date(), "EEE d MMM", { locale: it });
  const firstName =
    String(user?.name || "")
      .trim()
      .split(/\s+/)[0] || "";
  const canTakeAttendance =
    trainerPermissions?.actions.manageAttendance !== false;
  const canManageConvocations =
    trainerPermissions?.actions.manageConvocations !== false;
  const showTrainingCard =
    nextTraining && trainerPermissions?.widgets.todayTrainings !== false;
  const showMatchRow =
    nextMatch && trainerPermissions?.widgets.todayMatches !== false;

  return (
    <SecondaryScreenLayout
      title="Dashboard"
      eyebrow={`${getRoleLabel(currentRole)} · ${capitalize(todayLabel)}`}
      onBack={false}
      skyHeight={360}
      onNotifications={() => navigation.navigate("Notifications")}
      notificationCount={tasks.length}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      hero={
        <SectionHero
          eyebrow="Oggi"
          title={firstName ? `Buongiorno, ${firstName}` : "Buongiorno"}
          // Il widget "riepilogo" del vecchio cruscotto vive nei chip dell'hero
          // (il prototipo chiude la Home con le tile, senza riga "Stagione").
          chips={
            trainerPermissions?.widgets.summary === false
              ? []
              : [
                  {
                    label:
                      todayTrainings.length === 1
                        ? "allenamento"
                        : "allenamenti",
                    value: String(todayTrainings.length),
                  },
                  {
                    label: todayMatches.length === 1 ? "gara" : "gare",
                    value: String(todayMatches.length),
                  },
                  { label: "promemoria", value: String(tasks.length) },
                ]
          }
        />
      }
    >
      {showTrainingCard ? (
        <EventCard
          kind="training"
          title={nextTraining.title}
          time={nextTraining.time}
          endTime={nextTraining.endTime}
          dateLabel={
            nextTraining.date === today
              ? undefined
              : formatItalianDate(nextTraining.date, "EEE d")
          }
          meta={[
            { icon: "location-outline", label: nextTraining.location },
            {
              icon: "people-outline",
              label:
                nextTraining.totalCount &&
                nextTraining.presentCount !== undefined
                  ? `${nextTraining.presentCount ?? 0}/${nextTraining.totalCount} presenti`
                  : "Presenze da registrare",
            },
          ]}
          statusLabel={
            nextTraining.date === today ? "Allenamento di oggi" : undefined
          }
          onPress={() => openTraining(nextTraining.id)}
          footer={
            canTakeAttendance &&
            canManageMobileTrainingAttendance(nextTraining) ? (
              <ActionButton
                size="sm"
                fullWidth
                trailingIcon="arrow-forward"
                onPress={() => openTraining(nextTraining.id, true)}
              >
                Registra presenze
              </ActionButton>
            ) : (
              <ActionButton
                size="sm"
                variant="secondary"
                fullWidth
                trailingIcon="arrow-forward"
                onPress={() => openTraining(nextTraining.id)}
              >
                Apri allenamento
              </ActionButton>
            )
          }
        />
      ) : trainerPermissions?.widgets.todayTrainings !== false ? (
        <EmptyNote>Nessun allenamento in programma.</EmptyNote>
      ) : null}

      {showMatchRow ? (
        <Pressable
          onPress={() => openMatch(nextMatch.id, canManageConvocations)}
          accessibilityRole="button"
          accessibilityLabel={`Prossima gara: vs ${matchTitle(nextMatch)}`}
        >
          <GlassSurface
            tone="light"
            corner="control"
            style={[styles.matchRow, EGShadow.row]}
          >
            <View style={styles.matchStripeWrap}>
              <GradientFill gradient="match" style={styles.matchStripe} />
            </View>
            <View style={styles.matchInner}>
              <SignatureText style={styles.matchTime}>
                {nextMatch.time || "--:--"}
              </SignatureText>
              <View style={{ flex: 1, minWidth: 0 }}>
                <SignatureText style={styles.matchTitle} numberOfLines={1}>
                  {`vs ${matchTitle(nextMatch)}`}
                </SignatureText>
                <SignatureText style={styles.matchMeta} numberOfLines={1}>
                  {`${capitalize(formatItalianDate(nextMatch.date, "EEE d MMM"))} · ${formatMobileMatchLocationLabel(nextMatch)}`}
                </SignatureText>
              </View>
              {canManageConvocations ? (
                <StatusPill
                  label="Convocazioni"
                  tier="solid"
                  tone="warning"
                  small
                />
              ) : (
                <StatusPill
                  label={`${nextMatch.convokedCount ?? 0} convocati`}
                  tier="quiet"
                  tone="neutral"
                  small
                />
              )}
            </View>
          </GlassSurface>
        </Pressable>
      ) : null}

      {tiles.length > 0 ? (
        <>
          <SectionLabel
            label="Le tue sezioni"
            trailing={String(tiles.length)}
            style={{ paddingTop: 8 }}
          />
          <NavTileGrid items={tiles} />
        </>
      ) : null}
    </SecondaryScreenLayout>
  );
}

const matchTitle = (match: Match) =>
  match.opponent || (match.isHome ? match.awayTeam : match.homeTeam) || "Gara";

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
  matchRow: {
    borderColor: EGGlass.border,
  },
  matchStripeWrap: {
    position: "absolute",
    top: 0,
    left: 22,
    right: 22,
    height: 3,
  },
  matchStripe: {
    flex: 1,
  },
  matchInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  matchTime: {
    color: "#C2410C",
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    minWidth: 42,
  },
  matchTitle: {
    color: "#0B1A3A",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  matchMeta: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
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
});
