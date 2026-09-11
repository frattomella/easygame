import React, { useMemo } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import {
  ActionButton,
  NavTileGrid,
  ParentPrimaryScreenLayout,
  SectionLabel,
  SignatureText,
  StateMessage,
  StatusPill,
  SummaryCard,
} from "@/components/signature";
import type { NavTileItem } from "@/components/signature";
import { ParentEventCard } from "@/components/parent/ParentEventCard";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentRsvp } from "@/hooks/useParentRsvp";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { buildParentCalendarItems } from "@/lib/parent-calendar";
import {
  findFirstPayableParentPayment,
  formatParentCurrency,
} from "@/lib/parent-payments";
import { describeSportSeason, formatItalianDate } from "@/lib/mobile-ui";
import type { ParentHomeStackParamList } from "@/navigation/ParentHomeStackNavigator";

type Navigation = NativeStackNavigationProp<ParentHomeStackParamList>;

/**
 * La Home Parent del design v3 (`IA e Home` §2b, prototipo `isPHome`): nel
 * cielo la barra del figlio, poi la scheda scura con **la cosa da fare**
 * (documenti richiesti, altrimenti una rata da saldare, altrimenti "tutto
 * in regola"), la griglia 4×2 delle scorciatoie con i contatori vivi e
 * "Prossimi impegni" con la risposta della famiglia sulla scheda. Legge lo
 * stesso `GET /api/parent-dashboard/[athleteId]` di Calendario e Pagamenti
 * (stessa query key): nessuna card e nessun numero che il payload non
 * porti.
 */
export default function ParentHomeScreen() {
  const navigation = useNavigation<Navigation>();
  const { children, selectedChildId, selectedChild, switching, selectChild } =
    useParentContext();

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const consentsQuery = useQuery({
    queryKey: ["parent-consents", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentConsents(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const rsvp = useParentRsvp(selectedChildId);
  const { status, errorMessage } = useParentSectionStatus(dashboardQuery);
  const data = dashboardQuery.data;

  const upcoming = useMemo(() => {
    if (!data) return [];
    const today = format(new Date(), "yyyy-MM-dd");
    return buildParentCalendarItems(
      data.trainings.upcoming,
      data.matches.upcoming,
    )
      .filter((item) => !item.date || item.date >= today)
      .slice(0, 3);
  }, [data]);

  const tabs = navigation.getParent() as
    | { navigate: (...args: unknown[]) => void }
    | undefined;
  // Nello stack della Home (le sezioni sono registrate anche qui): "‹
  // Indietro" torna alla Home come nel prototipo e il Dock sparisce.
  const openService = (
    screen: Exclude<keyof ParentHomeStackParamList, "ParentBoard">,
  ) => navigation.navigate(screen);
  const openNotifications = () =>
    navigation.navigate("ParentBoard", { initialSection: "notifications" });

  const requiredDocuments = data?.documents.required || [];
  const pendingPayments = data?.payments.pending || 0;
  const firstPayable = data
    ? findFirstPayableParentPayment(data.payments.items)
    : null;
  const pendingConsents = consentsQuery.isSuccess
    ? consentsQuery.data.filter(
        (consent) => consent.status === "missing" || consent.onOutdatedVersion,
      ).length
    : 0;
  const unreadNotifications = data?.notificationsUnread || 0;
  // Occhiello della scheda di riepilogo (prototipo: "Stagione 2026/27").
  // `enrollment.selectedPlan` e un identificativo di piano, non un nome:
  // la stagione sportiva si legge dal calendario (da luglio: anno/anno+1).
  const seasonLabel = describeSportSeason(new Date());
  // `familyState` distingue il certificato consegnato senza data ("undated",
  // in regola) da quello mancante — `status` da solo non lo sa (PP-02 §F).
  const healthAttention =
    data !== undefined &&
    ["expiring", "expired", "missing"].includes(data.health.familyState);

  const tiles: NavTileItem[] = [
    {
      key: "payments",
      label: "Pagamenti",
      icon: "card-outline",
      color: "#F59E0B",
      badge: pendingPayments,
      badgeColor: "#B91C1C",
      onPress: () => tabs?.navigate("ParentPaymentsTab"),
    },
    {
      key: "documents",
      label: "Documenti",
      icon: "document-text-outline",
      color: "#2563EB",
      badge: requiredDocuments.length,
      badgeColor: "#B45309",
      onPress: () => openService("ParentDocuments"),
    },
    {
      key: "consents",
      label: "Consensi",
      icon: "shield-checkmark-outline",
      color: "#10B981",
      badge: pendingConsents,
      badgeColor: "#B45309",
      onPress: () => openService("ParentConsents"),
    },
    {
      key: "appointments",
      label: "Appuntam.",
      icon: "calendar-outline",
      color: "#3533CD",
      onPress: () => openService("ParentAppointments"),
    },
    {
      key: "board",
      label: "Bacheca",
      icon: "megaphone-outline",
      color: "#3533CD",
      badge: unreadNotifications,
      badgeColor: "#1D4ED8",
      onPress: () =>
        navigation.navigate("ParentBoard", { initialSection: "board" }),
    },
    {
      key: "structures",
      label: "Strutture",
      icon: "business-outline",
      color: "#2563EB",
      onPress: () => openService("ParentStructures"),
    },
    {
      key: "enrollment",
      label: "Iscrizione",
      icon: "clipboard-outline",
      color: "#F59E0B",
      onPress: () => openService("ParentEnrollment"),
    },
    {
      key: "contacts",
      label: "Contatti",
      icon: "call-outline",
      color: "#10B981",
      onPress: () => openService("ParentContacts"),
    },
  ];

  const todayLabel = format(new Date(), "EEE d MMM", { locale: it });

  return (
    <ParentPrimaryScreenLayout
      title="Home"
      eyebrow={`Genitore · ${todayLabel.charAt(0).toUpperCase()}${todayLabel.slice(1)}`}
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      onNotifications={openNotifications}
      notificationCount={unreadNotifications}
      scrollable={status === "ready"}
      skyHeight={430}
      refreshControl={
        <RefreshControl
          refreshing={dashboardQuery.isRefetching}
          onRefresh={() => void dashboardQuery.refetch()}
        />
      }
      content={
        status === "loading" ? (
          <StateMessage kind="loading" tone="dark" />
        ) : status === "forbidden" ? (
          <StateMessage kind="forbidden" tone="dark" message={errorMessage} />
        ) : status === "network" || status === "error" ? (
          <StateMessage
            kind="error"
            tone="dark"
            message={errorMessage}
            actionLabel="Riprova"
            onAction={() => void dashboardQuery.refetch()}
          />
        ) : data && selectedChild ? (
          <>
            {requiredDocuments.length > 0 ? (
              <SummaryCard
                icon="clipboard-outline"
                eyebrow={seasonLabel}
                title="Documenti da caricare"
              >
                <StatusPill
                  label={`${requiredDocuments.length} ${requiredDocuments.length === 1 ? "documento richiesto" : "documenti richiesti"}`}
                  onSky
                  tone="warning"
                />
                <SignatureText style={styles.ctaBody} numberOfLines={2}>
                  {requiredDocuments
                    .map((item) => item.title)
                    .slice(0, 3)
                    .join(", ")}
                  .
                </SignatureText>
                <View style={styles.ctaButton}>
                  <ActionButton
                    variant="onDark"
                    size="sm"
                    trailingIcon="arrow-forward"
                    onPress={() => openService("ParentDocuments")}
                  >
                    Carica i documenti
                  </ActionButton>
                </View>
              </SummaryCard>
            ) : firstPayable ? (
              <SummaryCard
                icon="card-outline"
                eyebrow={seasonLabel}
                title="Una quota da saldare"
              >
                <StatusPill label={firstPayable.status} onSky tone="danger" />
                <SignatureText style={styles.ctaBody} numberOfLines={2}>
                  {`${firstPayable.description || "Quota"} · ${formatParentCurrency(firstPayable.amount - firstPayable.paidAmount)}${firstPayable.dueDate ? ` · scadenza ${formatItalianDate(firstPayable.dueDate)}` : ""}`}
                </SignatureText>
                <View style={styles.ctaButton}>
                  <ActionButton
                    variant="onDark"
                    size="sm"
                    trailingIcon="arrow-forward"
                    onPress={() => tabs?.navigate("ParentPaymentsTab")}
                  >
                    Vai ai pagamenti
                  </ActionButton>
                </View>
              </SummaryCard>
            ) : healthAttention ? (
              // Certificato mancante/scaduto/in scadenza senza una richiesta
              // documentale aperta: non e "tutto in regola", e la scheda dice
              // la cosa da fare (stessa forma di "Documenti da caricare").
              <SummaryCard
                icon="medkit-outline"
                eyebrow={seasonLabel}
                title={
                  data.health.familyState === "expiring"
                    ? "Certificato in scadenza"
                    : "Certificato da consegnare"
                }
              >
                <StatusPill
                  label={data.health.familyLabel || data.health.statusLabel}
                  onSky
                  tone={
                    data.health.familyState === "expiring"
                      ? "warning"
                      : "danger"
                  }
                />
                <SignatureText style={styles.ctaBody} numberOfLines={2}>
                  {data.health.familyState === "expiring"
                    ? "Rinnova il certificato prima della scadenza."
                    : "Senza certificato valido l'atleta non puo allenarsi."}
                </SignatureText>
                <View style={styles.ctaButton}>
                  <ActionButton
                    variant="onDark"
                    size="sm"
                    trailingIcon="arrow-forward"
                    onPress={() => openService("ParentDocuments")}
                  >
                    Vai ai documenti
                  </ActionButton>
                </View>
              </SummaryCard>
            ) : (
              <SummaryCard
                icon="shield-checkmark-outline"
                eyebrow={seasonLabel}
                title="Tutto in regola"
              >
                <StatusPill
                  label={data.health.familyLabel || data.health.statusLabel}
                  onSky
                  tone="success"
                />
                <SignatureText style={styles.ctaBody} numberOfLines={2}>
                  Nessun documento richiesto e nessuna quota in sospeso.
                </SignatureText>
              </SummaryCard>
            )}

            <SectionLabel label="Scorciatoie" style={{ paddingTop: 4 }} />
            <NavTileGrid items={tiles} />

            <SectionLabel
              label="Prossimi impegni"
              trailing={String(upcoming.length)}
              style={{ paddingTop: 6 }}
            />
            {upcoming.length === 0 ? (
              <StateMessage
                kind="empty"
                title="Nessun impegno in programma"
                message="Quando il club pubblica allenamenti o gare li vedi qui."
              />
            ) : (
              upcoming.map((item) => (
                <ParentEventCard
                  key={`${item.kind}-${item.id}`}
                  item={item}
                  invitations={rsvp.invitations}
                  invitationsLoadFailed={rsvp.loadFailed}
                  onAnswer={(eventId, answer) =>
                    void rsvp.answer(eventId, answer)
                  }
                  updatingId={rsvp.updatingId}
                  errorMessage={rsvp.errorFor(item.id)}
                  onRetry={rsvp.refetch}
                  onPress={() =>
                    tabs?.navigate("ParentCalendarTab", {
                      screen: "ParentEventDetail",
                      params: { eventId: item.id, kind: item.kind },
                    })
                  }
                />
              ))
            )}
          </>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  ctaBody: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  ctaButton: {
    alignSelf: "flex-start",
    marginTop: 4,
  },
});
