import React from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import {
  GlassCard,
  IconChip,
  ParentPrimaryScreenLayout,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Spacing } from "@/constants/theme";
import type { ParentServicesStackParamList } from "@/navigation/ParentServicesStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentServicesStackParamList,
  "ParentServices"
>;

/**
 * Servizi — v3.0 (`migration-v3.md` passo 8): il quarto tab del Dock
 * sostituisce Segreteria e Bacheca. "Dove il design v3 introduce un
 * raggruppamento nuovo... e un **contenitore di navigazione** per
 * schermate gia esistenti" (ADR-0168 §4c2): nessuna di queste sette
 * sezioni perde la propria schermata, cambia solo come vi si arriva.
 * Pagamenti **non** e qui — e stato promosso a tab proprio (passo 8: "Home
 * · Calendario · Pagamenti · Servizi · Profilo").
 */
export default function ParentServicesScreen() {
  const navigation = useNavigation<Navigation>();
  const { children, selectedChildId, switching, selectChild } =
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

  const requiredDocuments = dashboardQuery.data?.documents.required.length || 0;
  // Il badge Consensi e solo un'anteprima (stesso principio della vecchia
  // ParentSegreteriaScreen): se la query fallisce si nasconde invece di
  // mostrare "0" come se non ci fosse nulla in sospeso.
  const pendingConsents = consentsQuery.isSuccess
    ? consentsQuery.data.filter(
        (consent) => consent.status === "missing" || consent.onOutdatedVersion,
      ).length
    : undefined;
  const notificationsUnread = dashboardQuery.data?.notificationsUnread || 0;

  const openNotifications = () =>
    navigation.navigate("ParentBoard", { initialSection: "notifications" });

  return (
    <ParentPrimaryScreenLayout
      title="Servizi"
      eyebrow="Famiglia"
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      onNotifications={openNotifications}
      notificationCount={notificationsUnread}
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
          <View style={{ gap: Spacing.sm }}>
            <ServiceRow
              icon="document-text-outline"
              title="Documenti"
              subtitle="Certificati e moduli richiesti"
              count={requiredDocuments}
              onPress={() => navigation.navigate("ParentDocuments")}
            />
            <ServiceRow
              icon="shield-checkmark-outline"
              title="Consensi"
              subtitle="Autorizzazioni e privacy"
              count={pendingConsents}
              onPress={() => navigation.navigate("ParentConsents")}
            />
            <ServiceRow
              icon="clipboard-outline"
              title="Iscrizione"
              subtitle="Stato, pratiche e rinnovo"
              onPress={() => navigation.navigate("ParentEnrollment")}
            />
            <ServiceRow
              icon="calendar-outline"
              title="Appuntamenti"
              subtitle="Colloqui con la segreteria"
              onPress={() => navigation.navigate("ParentAppointments")}
            />
            <ServiceRow
              icon="business-outline"
              title="Prenotazioni strutture"
              subtitle="Campi e sale del club"
              onPress={() => navigation.navigate("ParentStructures")}
            />
            <ServiceRow
              icon="call-outline"
              title="Contatti club"
              subtitle="Segreteria e recapiti"
              onPress={() => navigation.navigate("ParentContacts")}
            />
            <ServiceRow
              icon="megaphone-outline"
              title="Bacheca"
              subtitle="Comunicazioni del club"
              onPress={() => navigation.navigate("ParentBoard")}
            />
          </View>
        )
      }
    />
  );
}

function ServiceRow({
  icon,
  title,
  subtitle,
  count,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <GlassCard>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.md,
          }}
        >
          <IconChip name={icon} size={40} />
          <View style={{ flex: 1 }}>
            <SignatureText variant="h4" tone="ink">
              {title}
            </SignatureText>
            <SignatureText variant="small" tone="muted">
              {subtitle}
            </SignatureText>
          </View>
          {typeof count === "number" && count > 0 ? (
            <StatusPill label={String(count)} variant="warning" small />
          ) : null}
          <Ionicons name="chevron-forward-outline" size={20} color="#94A3B8" />
        </View>
      </GlassCard>
    </Pressable>
  );
}
