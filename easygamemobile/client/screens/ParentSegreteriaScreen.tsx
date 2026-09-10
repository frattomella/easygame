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
import { isPayableParentPayment } from "@/lib/parent-payments";
import { Spacing } from "@/constants/theme";
import type { ParentSegreteriaStackParamList } from "@/navigation/ParentSegreteriaStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentSegreteriaStackParamList,
  "ParentSegreteria"
>;

/**
 * Segreteria: la tab con le quattro sezioni "carta e soldi" del club
 * (`guidelines/navigation.md`: "Payments, documents, consents and
 * enrollment... one tab, four sections") — tutte e quattro reali dal WP8
 * (Pagamenti/Documenti/Consensi dal WP7, Iscrizione qui).
 */
export default function ParentSegreteriaScreen() {
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

  const payments = dashboardQuery.data?.payments;
  const pendingPayments = payments
    ? payments.items.filter(isPayableParentPayment).length
    : 0;
  const requiredDocuments = dashboardQuery.data?.documents.required.length || 0;
  /*
    Il badge Consensi e solo un'anteprima: se la query fallisce si nasconde
    (nessun conteggio) invece di mostrare "0" come se non ci fosse nulla in
    sospeso — la sezione Consensi rifa comunque la sua fetch con lo stato
    completo quando viene aperta.
  */
  const pendingConsents = consentsQuery.isSuccess
    ? consentsQuery.data.filter(
        (consent) => consent.status === "missing" || consent.onOutdatedVersion,
      ).length
    : undefined;

  return (
    <ParentPrimaryScreenLayout
      title="Segreteria"
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
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
            <SegreteriaRow
              icon="card-outline"
              title="Pagamenti"
              subtitle="Quote, scadenze e ricevute"
              count={pendingPayments}
              countTone="warning"
              onPress={() => navigation.navigate("ParentPayments")}
            />
            <SegreteriaRow
              icon="document-text-outline"
              title="Documenti"
              subtitle="Certificati e moduli richiesti"
              count={requiredDocuments}
              countTone="warning"
              onPress={() => navigation.navigate("ParentDocuments")}
            />
            <SegreteriaRow
              icon="shield-checkmark-outline"
              title="Consensi"
              subtitle="Autorizzazioni e privacy"
              count={pendingConsents}
              countTone="warning"
              onPress={() => navigation.navigate("ParentConsents")}
            />
            <SegreteriaRow
              icon="clipboard-outline"
              title="Iscrizione"
              subtitle="Stato, pratiche e rinnovo"
              onPress={() => navigation.navigate("ParentEnrollment")}
            />
          </View>
        )
      }
    />
  );
}

function SegreteriaRow({
  icon,
  title,
  subtitle,
  count,
  countTone,
  disabled = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  count?: number;
  countTone?: "warning";
  disabled?: boolean;
  onPress?: () => void;
}) {
  const row = (
    <GlassCard style={disabled ? { opacity: 0.6 } : undefined}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}
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
          <StatusPill
            label={String(count)}
            variant={countTone === "warning" ? "warning" : "default"}
            small
          />
        ) : null}
        {!disabled ? (
          <Ionicons name="chevron-forward-outline" size={20} color="#94A3B8" />
        ) : null}
      </View>
    </GlassCard>
  );

  if (disabled || !onPress) {
    return row;
  }

  return <Pressable onPress={onPress}>{row}</Pressable>;
}
