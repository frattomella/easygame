import React from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  ActionButton,
  EnrollmentStatusCard,
  GlassCard,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { formatParentCurrency } from "@/lib/parent-payments";
import { formatItalianDate } from "@/lib/mobile-ui";
import { Spacing } from "@/constants/theme";
import type { StatusPillVariant } from "@/components/signature/StatusPill";
import type { ParentSegreteriaStackParamList } from "@/navigation/ParentSegreteriaStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentSegreteriaStackParamList,
  "ParentEnrollment"
>;

const REQUEST_STATE_VARIANT: Record<string, StatusPillVariant> = {
  sent: "default",
  in_review: "primary",
  approved: "success",
  rejected: "destructive",
};

/**
 * Iscrizione (WP8) — `data.enrollment` per lo stato d'insieme,
 * `GET /api/v1/family/enrollment-requests` per le pratiche. Il rinnovo
 * vero e proprio e un motore di form dinamici (`FormField` con
 * checkbox/file_upload/signature/testo libero) — costruire un renderer
 * generico e fuori perimetro (ADR-0164): questa schermata mostra stato,
 * pratiche e documenti in sospeso, tutto reale, non un modulo che non sa
 * ancora compilare.
 */
export default function ParentEnrollmentScreen() {
  const navigation = useNavigation<Navigation>();
  const { selectedChildId } = useParentContext();

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const requestsQuery = useQuery({
    queryKey: ["parent-enrollment-requests", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentEnrollmentRequests(
        selectedChildId as string,
      ),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(dashboardQuery);

  const enrollment = dashboardQuery.data?.enrollment;
  const requests = requestsQuery.data || [];
  const pendingDocuments = requests.flatMap(
    (request) => request.pendingDocuments,
  );

  return (
    <SecondaryScreenLayout title="Iscrizione" eyebrow="Segreteria">
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico l'iscrizione…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso a questa sezione."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : enrollment ? (
        <>
          <EnrollmentStatusCard
            eyebrow="Stagione"
            title={
              enrollment.status === "enrolled"
                ? "Iscrizione attiva"
                : "Non ancora iscritto"
            }
            pill={
              enrollment.status === "enrolled"
                ? { label: "Attiva", variant: "success" }
                : { label: "Da avviare", variant: "default" }
            }
            supportingLine={
              enrollment.status === "enrolled"
                ? enrollment.selectedPlan || undefined
                : "L'iscrizione si avvia tramite il modulo pubblico del club."
            }
          />

          {enrollment.income.residual > 0 ? (
            <Pressable onPress={() => navigation.navigate("ParentPayments")}>
              <GlassCard
                eyebrow="Saldo"
                title={`Restano da versare ${formatParentCurrency(enrollment.income.residual)}`}
                style={{ marginBottom: Spacing.md }}
              />
            </Pressable>
          ) : null}

          {pendingDocuments.length > 0 ? (
            <Pressable onPress={() => navigation.navigate("ParentDocuments")}>
              <GlassCard
                eyebrow="Il club aspetta"
                title={`${pendingDocuments.length} documento${pendingDocuments.length === 1 ? "" : "i"} da caricare`}
                description={pendingDocuments
                  .slice(0, 3)
                  .map((doc) => doc.title)
                  .join(", ")}
                style={{ marginBottom: Spacing.md }}
              >
                <ActionButton
                  variant="secondary"
                  size="sm"
                  trailingIcon="arrow-forward"
                >
                  Vai ai documenti
                </ActionButton>
              </GlassCard>
            </Pressable>
          ) : null}

          {requestsQuery.isError ? (
            <StateMessage
              kind="error"
              message="Le pratiche non si sono caricate."
              actionLabel="Riprova"
              onAction={() => void requestsQuery.refetch()}
              style={{ marginBottom: Spacing.md }}
            />
          ) : requests.length > 0 ? (
            <View style={{ gap: Spacing.sm }}>
              <SignatureText variant="eyebrow" tone="faint">
                Le tue pratiche
              </SignatureText>
              {requests.map((request) => (
                <GlassCard key={request.id} style={{ gap: 4 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: Spacing.sm,
                    }}
                  >
                    <SignatureText variant="h4" tone="ink" style={{ flex: 1 }}>
                      {request.templateTitle}
                    </SignatureText>
                    <StatusPill
                      label={request.stateLabel}
                      variant={
                        REQUEST_STATE_VARIANT[request.state] || "default"
                      }
                      small
                    />
                  </View>
                  <SignatureText variant="small" tone="muted">
                    {request.seasonLabel}
                    {request.submittedAt
                      ? ` · inviata il ${formatItalianDate(request.submittedAt)}`
                      : ""}
                  </SignatureText>
                  {request.reviewNote ? (
                    <SignatureText variant="small" tone="muted">
                      {request.reviewNote}
                    </SignatureText>
                  ) : null}
                </GlassCard>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
