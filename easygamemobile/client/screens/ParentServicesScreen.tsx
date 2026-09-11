import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import {
  GlassRow,
  ParentPrimaryScreenLayout,
  SectionLabel,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { formatItalianDate } from "@/lib/mobile-ui";
import type { ParentServicesStackParamList } from "@/navigation/ParentServicesStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentServicesStackParamList,
  "ParentServices"
>;

/**
 * Servizi — il quarto tab del Dock (prototipo `isPServices`, "Servizi del
 * club"): un contenitore di navigazione per sette sezioni gia esistenti
 * (ADR-0168 §4c2), una riga di vetro con chevron ciascuna. La riga di
 * contesto dice cio che il payload sa davvero (documenti richiesti, consensi
 * da decidere, richieste in attesa, avvisi non letti, recapito della
 * segreteria) — mai un numero inventato. Pagamenti **non** e qui: e un tab
 * proprio.
 */
export default function ParentServicesScreen() {
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

  const { status, errorMessage } = useParentSectionStatus(dashboardQuery);
  const data = dashboardQuery.data;

  const requiredDocuments = data?.documents.required.length || 0;
  // Il badge Consensi e solo un'anteprima: se la query fallisce si nasconde
  // invece di mostrare "0" come se non ci fosse nulla in sospeso.
  const pendingConsents = consentsQuery.isSuccess
    ? consentsQuery.data.filter(
        (consent) => consent.status === "missing" || consent.onOutdatedVersion,
      ).length
    : undefined;
  const notificationsUnread = data?.notificationsUnread || 0;
  const openAppointments = (data?.appointments.items || []).filter((item) =>
    ["requested", "confirmed", "rescheduled"].includes(String(item.status)),
  ).length;
  const openBookings = (data?.structures.bookings || []).length;
  const enrollmentLabel =
    data?.enrollment.status === "enrolled"
      ? `Stagione attiva${data.enrollment.enrollmentDate ? ` dal ${formatItalianDate(data.enrollment.enrollmentDate)}` : ""}`
      : "Non ancora iscritto";
  const clubPhone =
    data?.club.contact_phone || data?.club.contact_email || null;

  const openNotifications = () =>
    navigation.navigate("ParentBoard", { initialSection: "notifications" });

  const rows: {
    key: keyof ParentServicesStackParamList;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    title: string;
    meta: string;
    count?: number;
  }[] = [
    {
      key: "ParentDocuments",
      icon: "document-text-outline",
      color: "#2563EB",
      title: "Documenti",
      meta:
        requiredDocuments > 0
          ? `${requiredDocuments} ${requiredDocuments === 1 ? "documento richiesto" : "documenti richiesti"}`
          : "Certificati e moduli in regola",
      count: requiredDocuments,
    },
    {
      key: "ParentConsents",
      icon: "shield-checkmark-outline",
      color: "#10B981",
      title: "Consensi",
      meta:
        pendingConsents && pendingConsents > 0
          ? `${pendingConsents} da decidere`
          : "Autorizzazioni e privacy",
      count: pendingConsents,
    },
    {
      key: "ParentAppointments",
      icon: "calendar-outline",
      color: "#3533CD",
      title: "Appuntamenti",
      meta:
        openAppointments > 0
          ? `${openAppointments} ${openAppointments === 1 ? "richiesta aperta" : "richieste aperte"}`
          : "Colloqui con la segreteria",
    },
    {
      key: "ParentStructures",
      icon: "business-outline",
      color: "#2563EB",
      title: "Prenotazioni strutture",
      meta:
        openBookings > 0
          ? `${openBookings} ${openBookings === 1 ? "prenotazione" : "prenotazioni"}`
          : "Campi e sale del club",
    },
    {
      key: "ParentEnrollment",
      icon: "clipboard-outline",
      color: "#F59E0B",
      title: "Iscrizione",
      meta: enrollmentLabel,
    },
    {
      key: "ParentBoard",
      icon: "megaphone-outline",
      color: "#3533CD",
      title: "Bacheca",
      meta:
        notificationsUnread > 0
          ? `${notificationsUnread} ${notificationsUnread === 1 ? "avviso non letto" : "avvisi non letti"}`
          : "Comunicazioni del club",
      count: notificationsUnread,
    },
    {
      key: "ParentContacts",
      icon: "call-outline",
      color: "#2563EB",
      title: "Contatti club",
      meta: clubPhone ? `Segreteria · ${clubPhone}` : "Segreteria e recapiti",
    },
  ];

  return (
    <ParentPrimaryScreenLayout
      title="Servizi"
      eyebrow={`Genitore · ${selectedChild?.clubName || "Club"}`}
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      onNotifications={openNotifications}
      notificationCount={notificationsUnread}
      skyHeight={230}
      contentGap={8}
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
        ) : (
          <>
            <SectionLabel
              label="Servizi del club"
              trailing={String(rows.length)}
            />
            {rows.map((row) => (
              <GlassRow
                key={row.key}
                icon={row.icon}
                iconColor={row.color}
                title={row.title}
                meta={row.meta}
                trailing={
                  typeof row.count === "number" && row.count > 0 ? (
                    <StatusPill
                      label={String(row.count)}
                      tier="solid"
                      tone="warning"
                      small
                      dot={false}
                    />
                  ) : undefined
                }
                onPress={() => navigation.navigate(row.key as never)}
              />
            ))}
          </>
        )
      }
    />
  );
}
