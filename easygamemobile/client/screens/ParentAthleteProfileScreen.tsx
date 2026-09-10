import React from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import {
  GlassCard,
  MetaRow,
  NumberTile,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
  StatCard,
  StatusPill,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  calculateAge,
  resolveMedicalVisitDate,
  resolveMedicalVisitLabel,
} from "@/lib/parent-athlete-profile";
import { formatItalianDate } from "@/lib/mobile-ui";
import { Spacing } from "@/constants/theme";
import type { StatusPillVariant } from "@/components/signature/StatusPill";

const HEALTH_VARIANT: Record<string, StatusPillVariant> = {
  valid: "success",
  expiring: "warning",
  expired: "destructive",
  missing: "default",
  undated: "default",
};

/**
 * Profilo atleta (WP9) — l'unica sezione della dashboard Parent web senza
 * equivalente mobile (verificato: `ParentAthletePage` legge esclusivamente
 * `data.athlete`/`data.health`/`data.attendance`/`data.enrollment`, gia
 * nel cruscotto aggregato — nessun endpoint aggiuntivo, nessuna chiamata
 * in piu). Whitelist dichiarata lato server (`serializeAthleteCard`): non
 * si espone nulla oltre a cio che `services/api.ts` gia tipizza.
 */
export default function ParentAthleteProfileScreen() {
  const { selectedChildId } = useParentContext();

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(dashboardQuery);

  const athlete = dashboardQuery.data?.athlete;
  const health = dashboardQuery.data?.health;
  const attendance = dashboardQuery.data?.attendance;
  const age = calculateAge(athlete?.birth_date);
  const medicalVisits = athlete?.data?.medicalVisits || [];

  return (
    <SecondaryScreenLayout title="Scheda atleta" eyebrow="Il tuo account">
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico la scheda…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso a questa scheda."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : athlete ? (
        <>
          <GlassCard style={{ gap: Spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.md,
              }}
            >
              <NumberTile
                number={athlete.jersey_number || 0}
                size={56}
                tone="navy"
              />
              <View style={{ flex: 1 }}>
                <SignatureText variant="h3" tone="ink">
                  {athlete.name}
                </SignatureText>
                <SignatureText variant="small" tone="muted">
                  {[athlete.category_name, age !== null ? `${age} anni` : null]
                    .filter(Boolean)
                    .join(" · ") || "Categoria non assegnata"}
                </SignatureText>
              </View>
            </View>
            {athlete.birth_place || athlete.city ? (
              <MetaRow icon="location-outline">
                {[athlete.birth_place, athlete.city]
                  .filter(Boolean)
                  .join(" · ")}
              </MetaRow>
            ) : null}
            {athlete.email ? (
              <MetaRow icon="mail-outline">{athlete.email}</MetaRow>
            ) : null}
            {athlete.phone ? (
              <MetaRow icon="call-outline">{athlete.phone}</MetaRow>
            ) : null}
          </GlassCard>

          {attendance ? (
            <View
              style={{
                flexDirection: "row",
                gap: Spacing.md,
                marginTop: Spacing.md,
              }}
            >
              <StatCard
                icon="checkmark-circle-outline"
                iconColor="#22C55E"
                value={`${attendance.rate}%`}
                label="Presenze"
              />
              <StatCard
                icon="fitness-outline"
                iconColor="#2563EB"
                value={String(attendance.total)}
                label="Allenamenti totali"
              />
            </View>
          ) : null}

          {health ? (
            <GlassCard
              eyebrow="Salute"
              title={health.familyLabel || health.statusLabel}
              style={{ marginTop: Spacing.md, gap: Spacing.sm }}
            >
              <StatusPill
                label={health.familyLabel || health.statusLabel}
                variant={
                  HEALTH_VARIANT[health.familyState] ||
                  HEALTH_VARIANT[health.status] ||
                  "default"
                }
                small
              />
              {health.familyDetail ? (
                <SignatureText variant="small" tone="muted">
                  {health.familyDetail}
                </SignatureText>
              ) : null}
              {health.allergies.length > 0 ? (
                <MetaRow icon="alert-circle-outline">
                  Allergie: {health.allergies.join(", ")}
                </MetaRow>
              ) : null}
              {health.notes ? (
                <SignatureText variant="small" tone="muted">
                  {health.notes}
                </SignatureText>
              ) : null}
            </GlassCard>
          ) : null}

          {medicalVisits.length > 0 ? (
            <GlassCard
              eyebrow="Visite mediche"
              title="Storico"
              style={{ marginTop: Spacing.md, gap: 6 }}
            >
              {medicalVisits.map((visit, index) => (
                <MetaRow icon="medkit-outline" key={index}>
                  {resolveMedicalVisitLabel(visit)}
                  {resolveMedicalVisitDate(visit)
                    ? ` · ${formatItalianDate(resolveMedicalVisitDate(visit))}`
                    : ""}
                </MetaRow>
              ))}
            </GlassCard>
          ) : null}

          {athlete.guardians.length > 0 ? (
            <GlassCard
              eyebrow="Famiglia"
              title="Tutori"
              style={{ marginTop: Spacing.md, gap: Spacing.sm }}
            >
              {athlete.guardians.map((guardian) => (
                <View key={guardian.id} style={{ gap: 2 }}>
                  <SignatureText variant="body" tone="ink">
                    {[guardian.name, guardian.surname]
                      .filter(Boolean)
                      .join(" ")}
                  </SignatureText>
                  <SignatureText variant="small" tone="muted">
                    {[guardian.relationship, guardian.email, guardian.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </SignatureText>
                </View>
              ))}
            </GlassCard>
          ) : null}
        </>
      ) : null}
      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
