import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  GlassRow,
  InfoNote,
  SecondaryScreenLayout,
  SectionLabel,
  SignatureText,
  StateMessage,
  StatusPill,
  SummaryCard,
} from "@/components/signature";
import type { StatusPillTier, StatusPillTone } from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { formatParentCurrency } from "@/lib/parent-payments";
import { formatItalianDate } from "@/lib/mobile-ui";
import type { ParentServicesStackParamList } from "@/navigation/ParentServicesStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentServicesStackParamList,
  "ParentEnrollment"
>;

/** Quattro livelli del design (§5c) per lo stato di una pratica. */
const REQUEST_LOOK: Record<
  string,
  { tier: StatusPillTier; tone: StatusPillTone; color: string }
> = {
  sent: { tier: "outline", tone: "info", color: "#2563EB" },
  in_review: { tier: "outline", tone: "info", color: "#2563EB" },
  approved: { tier: "quiet", tone: "success", color: "#10B981" },
  rejected: { tier: "solid", tone: "danger", color: "#EF4444" },
};

/**
 * Iscrizione (WP8) — `data.enrollment` per lo stato d'insieme,
 * `GET /api/v1/family/enrollment-requests` per le pratiche. Il rinnovo
 * vero e proprio e un motore di form dinamici — costruire un renderer
 * generico e fuori perimetro (ADR-0164): questa schermata mostra stato,
 * pratiche e documenti in sospeso, tutto reale.
 *
 * Composizione: design `IA e Home` §3d ("Iscrizione") — scheda scura
 * "Stato · Da completare / Attiva" nel cielo, poi le righe: domanda di
 * iscrizione (pratica), documenti richiesti, quota associativa — ognuna
 * con la pill a quattro livelli. Le righe che aprono un'altra sezione
 * (documenti, pagamenti) portano il chevron.
 */
export default function ParentEnrollmentScreen() {
  const navigation = useNavigation<Navigation>();
  const { selectedChildId, selectedChild } = useParentContext();

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
  // `selectedPlan` e un identificativo ("plan_…"): il nome leggibile del piano e in `income.planName`.
  const planName = String(enrollment?.income?.planName || "").trim();
  const requests = requestsQuery.data || [];
  const pendingDocuments = requests.flatMap(
    (request) => request.pendingDocuments,
  );
  const residual = enrollment?.income.residual || 0;
  const enrolled = enrollment?.status === "enrolled";
  const complete = enrolled && pendingDocuments.length === 0 && residual <= 0;

  const openPayments = () =>
    navigation.getParent()?.navigate("ParentPaymentsTab" as never);

  return (
    <SecondaryScreenLayout
      title="Iscrizione"
      eyebrow={`Segreteria · ${selectedChild?.name || "Atleta"}`}
      skyHeight={300}
      contentGap={10}
      club={
        selectedChild
          ? {
              name: selectedChild.clubName,
              avatarUrl: selectedChild.clubLogoUrl,
            }
          : undefined
      }
    >
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
          <SummaryCard
            icon="clipboard-outline"
            eyebrow="Stato"
            title={
              !enrolled
                ? "Non ancora iscritto"
                : complete
                  ? "Iscrizione completa"
                  : "Da completare"
            }
            value={!enrolled || !complete ? "!" : "✓"}
            valueMuted={Boolean(enrolled && complete)}
          >
            <SignatureText
              style={{
                color: "rgba(255,255,255,0.78)",
                fontSize: 13,
                lineHeight: 18,
                fontWeight: "500",
              }}
            >
              {enrolled
                ? `${planName ? `${planName} · ` : ""}${enrollment.enrollmentDate ? `iscritto il ${formatItalianDate(enrollment.enrollmentDate)}` : "iscrizione attiva"}`
                : "L'iscrizione si avvia tramite il modulo pubblico del club."}
            </SignatureText>
          </SummaryCard>

          <SectionLabel
            label="Pratiche e requisiti"
            style={{ paddingTop: 4 }}
          />

          {requestsQuery.isError ? (
            <InfoNote tone="warning">
              Le pratiche non si sono caricate.{" "}
              <SignatureText
                style={{ color: "#1D4ED8", fontWeight: "700" }}
                onPress={() => void requestsQuery.refetch()}
              >
                Riprova
              </SignatureText>
            </InfoNote>
          ) : null}

          {requests.map((request) => {
            const look = REQUEST_LOOK[request.state] || REQUEST_LOOK.sent;
            return (
              <GlassRow
                key={request.id}
                icon="document-text-outline"
                iconColor={look.color}
                title={request.templateTitle}
                meta={[
                  request.seasonLabel,
                  request.submittedAt
                    ? `inviata il ${formatItalianDate(request.submittedAt)}`
                    : "",
                  request.reviewNote || "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  <StatusPill
                    label={request.stateLabel}
                    tier={look.tier}
                    tone={look.tone}
                    small
                  />
                }
              />
            );
          })}

          {pendingDocuments.length > 0 ? (
            <GlassRow
              icon="medkit-outline"
              iconColor="#F59E0B"
              title={
                pendingDocuments.length === 1
                  ? pendingDocuments[0].title
                  : `${pendingDocuments.length} documenti da caricare`
              }
              meta={pendingDocuments
                .slice(0, 3)
                .map((doc) => doc.title)
                .join(", ")}
              trailing={
                <StatusPill
                  label="Richiesto"
                  tier="solid"
                  tone="warning"
                  small
                />
              }
              onPress={() => navigation.navigate("ParentDocuments")}
            />
          ) : null}

          {residual > 0 ? (
            <GlassRow
              icon="cash-outline"
              iconColor="#F59E0B"
              title="Quota associativa"
              meta={`Restano da versare ${formatParentCurrency(residual)}`}
              trailing={
                <StatusPill label="Da saldare" tier="solid" tone="info" small />
              }
              onPress={openPayments}
            />
          ) : enrolled ? (
            <GlassRow
              icon="cash-outline"
              iconColor="#10B981"
              title="Quota associativa"
              meta={
                enrollment.income.expectedTotal
                  ? `${formatParentCurrency(enrollment.income.recordedPaid)} versati su ${formatParentCurrency(enrollment.income.expectedTotal)}`
                  : "Nessun importo dovuto"
              }
              trailing={
                <StatusPill label="Saldata" tier="quiet" tone="success" small />
              }
              onPress={openPayments}
            />
          ) : null}

          {!requestsQuery.isError &&
          requests.length === 0 &&
          pendingDocuments.length === 0 &&
          residual <= 0 &&
          !enrolled ? (
            <StateMessage
              kind="empty"
              title="Nessuna pratica"
              message="Quando il club apre le iscrizioni, la pratica compare qui."
            />
          ) : null}
        </>
      ) : null}
    </SecondaryScreenLayout>
  );
}
