import React from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import {
  GlassCard,
  GlassSurface,
  MetaRow,
  NumberTile,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
  StatCard,
  StatusPill,
} from "@/components/signature";
import type { StatusPillTone } from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  calculateAge,
  resolveMedicalVisitDate,
  resolveMedicalVisitLabel,
} from "@/lib/parent-athlete-profile";
import { formatItalianDate } from "@/lib/mobile-ui";
import { EGShadow, Spacing } from "@/constants/theme";

const HEALTH_TONE: Record<string, StatusPillTone> = {
  valid: "success",
  expiring: "warning",
  expired: "danger",
  missing: "warning",
  undated: "neutral",
};

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * Profilo atleta (WP9) — legge esclusivamente `data.athlete`/`data.health`/
 * `data.attendance` dal cruscotto aggregato: nessun endpoint aggiuntivo.
 * Composizione: la stessa scheda atleta del Trainer (prototipo
 * `isTAthlete`) — testata di vetro scuro che attraversa l'orizzonte
 * (`NumberTile` o iniziali, nome 22/800, categoria · età, pill bianca
 * dello stato sanitario), due `StatCard`, poi "Scheda", "Salute", visite e
 * tutori come schede con `MetaRow`.
 */
export default function ParentAthleteProfileScreen() {
  const { selectedChildId, selectedChild } = useParentContext();

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
  const healthTone =
    (health &&
      (HEALTH_TONE[health.familyState] || HEALTH_TONE[health.status])) ||
    "neutral";

  return (
    <SecondaryScreenLayout
      title="Atleta"
      eyebrow={`${athlete?.category_name || selectedChild?.categoryName || "Rosa"} · Scheda`}
      skyHeight={300}
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
        <StateMessage kind="loading" tone="dark" title="Carico la scheda…" />
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
      ) : athlete ? (
        <>
          <GlassSurface
            tone="dark"
            corner="card"
            elevated
            style={[styles.hero, EGShadow.glassRaised]}
          >
            <View style={styles.heroRow}>
              {athlete.jersey_number ? (
                <NumberTile number={athlete.jersey_number} size={56} />
              ) : (
                <View style={styles.initials}>
                  <SignatureText style={styles.initialsLabel}>
                    {initialsOf(athlete.name)}
                  </SignatureText>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <SignatureText style={styles.heroName} numberOfLines={2}>
                  {athlete.name}
                </SignatureText>
                <SignatureText style={styles.heroMeta} numberOfLines={1}>
                  {[athlete.category_name, age !== null ? `${age} anni` : null]
                    .filter(Boolean)
                    .join(" · ") || "Categoria non assegnata"}
                </SignatureText>
                {health ? (
                  <StatusPill
                    label={health.statusLabel || "Certificato"}
                    onSky
                    tone={healthTone}
                    small
                    style={{ marginTop: 8 }}
                  />
                ) : null}
              </View>
            </View>
          </GlassSurface>

          {attendance ? (
            <View style={styles.statsRow}>
              <StatCard
                icon="barbell-outline"
                iconColor="#10B981"
                value={`${Math.round(attendance.rate || 0)}%`}
                label="Presenze"
                style={{ flex: 1 }}
              />
              <StatCard
                icon="fitness-outline"
                iconColor="#2563EB"
                value={String(attendance.total)}
                label="Allenamenti"
                style={{ flex: 1 }}
              />
            </View>
          ) : null}

          <GlassCard eyebrow="Scheda">
            <MetaRow icon="calendar-outline">
              {athlete.birth_date
                ? `Nato il ${formatItalianDate(athlete.birth_date)}`
                : "Data di nascita non disponibile"}
            </MetaRow>
            {athlete.guardians[0] ? (
              <MetaRow icon="people-outline">
                {`${athlete.guardians[0].relationship || "Tutore"} · ${[athlete.guardians[0].name, athlete.guardians[0].surname].filter(Boolean).join(" ")}`}
              </MetaRow>
            ) : null}
            {health ? (
              <MetaRow icon="medkit-outline">
                {health.expiryDate && health.status === "valid"
                  ? `Certificato medico valido al ${formatItalianDate(health.expiryDate)}`
                  : `Certificato medico: ${(health.familyLabel || health.statusLabel || "non disponibile").toLowerCase()}`}
              </MetaRow>
            ) : null}
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

          {health &&
          (health.familyDetail ||
            health.allergies.length > 0 ||
            health.notes) ? (
            <GlassCard eyebrow="Salute">
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
                <MetaRow icon="document-text-outline">{health.notes}</MetaRow>
              ) : null}
            </GlassCard>
          ) : null}

          {medicalVisits.length > 0 ? (
            <GlassCard eyebrow="Visite mediche">
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
            <GlassCard eyebrow="Tutori">
              {athlete.guardians.map((guardian) => (
                <View key={guardian.id} style={styles.guardian}>
                  <SignatureText
                    variant="body"
                    tone="ink"
                    style={{ fontWeight: "700" }}
                  >
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
    </SecondaryScreenLayout>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderColor: "rgba(255,255,255,0.2)",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: Spacing.lg,
  },
  initials: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  initialsLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
  },
  heroName: {
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.44,
  },
  heroMeta: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  guardian: {
    gap: 2,
    marginTop: Spacing.sm,
  },
});
