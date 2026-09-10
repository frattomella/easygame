import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { RouteProp, useFocusEffect, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import {
  GlassCard,
  MetaRow,
  NumberTile,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  getMobileMedicalCertificateAvailability,
  getMobileMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import {
  formatItalianDate,
  getAthleteStatusLabel,
  getAthleteStatusVariant,
} from "@/lib/mobile-ui";
import { Athlete, Match, Training } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EGInk, Spacing } from "@/constants/theme";
import { AthletesStackParamList } from "@/navigation/AthletesStackNavigator";

const renderValue = (value?: string | null, fallback = "Non disponibile") =>
  String(value || "").trim() || fallback;

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const MEDICAL_TONE: Record<string, "success" | "warning" | "destructive"> = {
  valid: "success",
  expiring: "warning",
  expired: "destructive",
  missing: "destructive",
};

/**
 * design-source `guidelines/trainer-migration.md` — schermata di dettaglio
 * collegata alla migrazione di Atleti (WP10). Stessi dati, stesse porte di
 * permesso (`viewAthleteTechnicalSheet`, `viewAthleteContacts`,
 * `viewMedicalStatus`) di prima; `canSeeEnrollment` resta `false` come nel
 * codice preesistente — quel ramo non e mai stato raggiungibile e non e
 * stato toccato in questa migrazione visiva (vedi debito tecnico).
 */
export default function TrainerAthleteProfileScreen() {
  const route = useRoute<RouteProp<AthletesStackParamList, "AthleteProfile">>();
  const { trainerPermissions } = useAuthContext();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const athleteId = route.params?.athleteId;
  const medicalAvailability = getMobileMedicalCertificateAvailability(
    athlete?.medicalCertExpiry,
  );

  const loadData = useCallback(async () => {
    if (!athleteId) {
      setAthlete(null);
      setTrainings([]);
      setMatches([]);
      return;
    }

    const [nextAthlete, nextTrainings, nextMatches] = await Promise.all([
      mobileBackendStorage.getAthlete(athleteId),
      mobileBackendStorage.getTrainings(),
      mobileBackendStorage.getMatches(),
    ]);
    setAthlete(nextAthlete);
    setTrainings(nextTrainings);
    setMatches(nextMatches);
  }, [athleteId]);

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

  const canSeeTechnicalSheet =
    trainerPermissions?.actions.viewAthleteTechnicalSheet !== false;
  const canSeeContacts =
    trainerPermissions?.actions.viewAthleteContacts !== false;
  const canSeeMedical = trainerPermissions?.actions.viewMedicalStatus !== false;
  const canSeeEnrollment = false;
  const athleteTrainings = useMemo(() => {
    if (!athlete) {
      return [];
    }

    return trainings.filter(
      (training) =>
        training.attendance?.some((entry) => entry.athleteId === athlete.id) ||
        (training.categoryId &&
          athlete.categoryId &&
          normalizeText(training.categoryId) ===
            normalizeText(athlete.categoryId)) ||
        normalizeText(training.category) === normalizeText(athlete.category),
    );
  }, [athlete, trainings]);
  const attendanceEntries = useMemo(
    () =>
      athleteTrainings.flatMap((training) =>
        (training.attendance || [])
          .filter((entry) => entry.athleteId === athlete?.id)
          .map((entry) => ({ ...entry, training })),
      ),
    [athlete?.id, athleteTrainings],
  );
  const presentCount = attendanceEntries.filter(
    (entry) => entry.present,
  ).length;
  const absenceCount = attendanceEntries.filter(
    (entry) => !entry.present,
  ).length;
  const attendanceRate = attendanceEntries.length
    ? Math.round((presentCount / attendanceEntries.length) * 100)
    : 0;
  const athleteMatches = useMemo(() => {
    if (!athlete) {
      return [];
    }

    return matches.filter(
      (match) =>
        match.convocatedAthletes?.includes(athlete.id) ||
        (match.categoryId &&
          athlete.categoryId &&
          normalizeText(match.categoryId) ===
            normalizeText(athlete.categoryId)) ||
        normalizeText(match.category) === normalizeText(athlete.category),
    );
  }, [athlete, matches]);

  return (
    <SecondaryScreenLayout
      title="Atleta"
      eyebrow="Scheda"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {athlete ? (
        <View style={styles.content}>
          <GlassCard stripe="action">
            <View style={styles.heroRow}>
              <NumberTile number={athlete.number} size={56} />
              <View style={{ flex: 1, gap: 4 }}>
                <SignatureText variant="h3" tone="ink">
                  {athlete.name}
                </SignatureText>
                <SignatureText variant="small" tone="muted">
                  {athlete.category} · {athlete.position || "Ruolo da definire"}
                </SignatureText>
                <View style={styles.badgeWrap}>
                  <StatusPill
                    label={getAthleteStatusLabel(athlete.status)}
                    variant={getAthleteStatusVariant(athlete.status)}
                    small
                  />
                  {canSeeMedical ? (
                    <StatusPill
                      label={getMobileMedicalCertificateAvailabilityLabel(
                        medicalAvailability,
                      )}
                      variant={MEDICAL_TONE[medicalAvailability]}
                      small
                    />
                  ) : null}
                </View>
              </View>
            </View>
          </GlassCard>

          <GlassCard eyebrow="Anagrafica" title={undefined}>
            <MetaRow icon="person-outline">
              Nome: {renderValue(athlete.firstName || athlete.name)}
            </MetaRow>
            <MetaRow icon="person-outline">
              Cognome: {renderValue(athlete.lastName)}
            </MetaRow>
            <MetaRow icon="calendar-outline">
              Data di nascita: {formatItalianDate(athlete.birthDate)}
            </MetaRow>
            <MetaRow icon="ribbon-outline">
              Categoria: {renderValue(athlete.category)}
            </MetaRow>
            <MetaRow icon="shirt-outline">
              Numero maglia:{" "}
              {athlete.number ? String(athlete.number) : "Non disponibile"}
            </MetaRow>
            <MetaRow icon="location-outline">
              Citta: {renderValue(athlete.city)}
            </MetaRow>
          </GlassCard>

          {canSeeTechnicalSheet ? (
            <GlassCard eyebrow="Scheda tecnica">
              <MetaRow icon="football-outline">
                Ruolo: {renderValue(athlete.position)}
              </MetaRow>
              <MetaRow icon="document-text-outline">
                Note tecniche: {renderValue(athlete.technicalNotes)}
              </MetaRow>
            </GlassCard>
          ) : null}

          {canSeeContacts ? (
            <GlassCard eyebrow="Contatti e tutori">
              <MetaRow icon="call-outline">
                Telefono: {renderValue(athlete.phone)}
              </MetaRow>
              <MetaRow icon="mail-outline">
                Email: {renderValue(athlete.email)}
              </MetaRow>
              {athlete.guardians?.length ? (
                athlete.guardians.map((guardian) => (
                  <View key={guardian.id} style={styles.listItem}>
                    <Ionicons
                      name="people-outline"
                      size={16}
                      color={EGInk.onLightFaint}
                    />
                    <View style={{ flex: 1 }}>
                      <SignatureText variant="small" tone="muted">
                        {guardian.relationship || "Tutore"} · {guardian.name}
                        {guardian.surname ? ` ${guardian.surname}` : ""}
                      </SignatureText>
                      <SignatureText variant="small" tone="faint">
                        {[guardian.phone, guardian.email]
                          .filter(Boolean)
                          .join(" · ") || "Contatti non disponibili"}
                      </SignatureText>
                    </View>
                  </View>
                ))
              ) : (
                <SignatureText variant="small" tone="faint">
                  Nessun tutore registrato.
                </SignatureText>
              )}
            </GlassCard>
          ) : null}

          {canSeeMedical ? (
            <GlassCard eyebrow="Area medica">
              <View style={styles.listItem}>
                <Ionicons
                  name={
                    medicalAvailability === "valid"
                      ? "checkmark-circle"
                      : "warning-outline"
                  }
                  size={18}
                  color={
                    medicalAvailability === "valid" ? "#22C55E" : "#F59E0B"
                  }
                />
                <View style={{ flex: 1 }}>
                  <SignatureText variant="small" tone="muted">
                    {getMobileMedicalCertificateAvailabilityLabel(
                      medicalAvailability,
                    )}
                  </SignatureText>
                  <SignatureText variant="small" tone="faint">
                    Scadenza: {formatItalianDate(athlete.medicalCertExpiry)}
                  </SignatureText>
                </View>
              </View>
              {athlete.documents?.length
                ? athlete.documents.map((document) => (
                    <SignatureText
                      key={document.id}
                      variant="small"
                      tone="muted"
                    >
                      {document.name} ·{" "}
                      {renderValue(document.type, "Documento")}
                    </SignatureText>
                  ))
                : null}
            </GlassCard>
          ) : null}

          <GlassCard eyebrow="Analitiche">
            <View style={styles.analyticsGrid}>
              <View style={styles.analyticsItem}>
                <SignatureText variant="h4" tone="ink">
                  {presentCount}
                </SignatureText>
                <SignatureText variant="small" tone="faint">
                  Presenze
                </SignatureText>
              </View>
              <View style={styles.analyticsItem}>
                <SignatureText variant="h4" tone="ink">
                  {absenceCount}
                </SignatureText>
                <SignatureText variant="small" tone="faint">
                  Assenze
                </SignatureText>
              </View>
              <View style={styles.analyticsItem}>
                <SignatureText variant="h4" tone="ink">
                  {attendanceEntries.length ? `${attendanceRate}%` : "-"}
                </SignatureText>
                <SignatureText variant="small" tone="faint">
                  Frequenza
                </SignatureText>
              </View>
              <View style={styles.analyticsItem}>
                <SignatureText variant="h4" tone="ink">
                  {athleteMatches.length}
                </SignatureText>
                <SignatureText variant="small" tone="faint">
                  Gare
                </SignatureText>
              </View>
            </View>
            {attendanceEntries.length > 0 ? (
              attendanceEntries.slice(0, 4).map((entry) => (
                <View
                  key={`${entry.training.id}-${entry.athleteId}`}
                  style={styles.listItem}
                >
                  <Ionicons
                    name={
                      entry.present
                        ? "checkmark-circle-outline"
                        : "close-circle-outline"
                    }
                    size={16}
                    color={entry.present ? "#22C55E" : "#F59E0B"}
                  />
                  <View style={{ flex: 1 }}>
                    <SignatureText variant="small" tone="muted">
                      {entry.training.title}
                    </SignatureText>
                    <SignatureText variant="small" tone="faint">
                      {formatItalianDate(entry.training.date)} -{" "}
                      {entry.present ? "Presente" : "Assente"}
                    </SignatureText>
                  </View>
                </View>
              ))
            ) : (
              <SignatureText variant="small" tone="faint">
                Nessuna presenza registrata.
              </SignatureText>
            )}
          </GlassCard>

          {canSeeEnrollment ? (
            <>
              <GlassCard eyebrow="Tesseramenti e iscrizione">
                {athlete.registrations?.length ? (
                  athlete.registrations.map((registration) => (
                    <View key={registration.id} style={styles.listItem}>
                      <Ionicons
                        name="ribbon-outline"
                        size={16}
                        color={EGInk.onLightFaint}
                      />
                      <View style={{ flex: 1 }}>
                        <SignatureText variant="small" tone="muted">
                          {registration.federation} · {registration.number}
                        </SignatureText>
                        <SignatureText variant="small" tone="faint">
                          {[
                            registration.status,
                            formatItalianDate(registration.expiryDate),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </SignatureText>
                      </View>
                    </View>
                  ))
                ) : (
                  <SignatureText variant="small" tone="faint">
                    Nessun tesseramento disponibile.
                  </SignatureText>
                )}

                {athlete.enrollmentDocuments?.length ? (
                  <View style={styles.groupBlock}>
                    <SignatureText variant="small" tone="ink">
                      Documenti iscrizione
                    </SignatureText>
                    {athlete.enrollmentDocuments.map((document) => (
                      <SignatureText
                        key={document.id}
                        variant="small"
                        tone="muted"
                      >
                        {document.name}
                      </SignatureText>
                    ))}
                  </View>
                ) : null}
              </GlassCard>

              <GlassCard eyebrow="Pagamenti e documenti">
                {athlete.payments?.length ? (
                  athlete.payments.map((payment) => (
                    <View key={payment.id} style={styles.listItem}>
                      <Ionicons
                        name="card-outline"
                        size={16}
                        color={EGInk.onLightFaint}
                      />
                      <View style={{ flex: 1 }}>
                        <SignatureText variant="small" tone="muted">
                          {payment.description} · {payment.amount}
                        </SignatureText>
                        <SignatureText variant="small" tone="faint">
                          {[payment.status, formatItalianDate(payment.date)]
                            .filter(Boolean)
                            .join(" · ")}
                        </SignatureText>
                      </View>
                    </View>
                  ))
                ) : (
                  <SignatureText variant="small" tone="faint">
                    Nessun pagamento registrato.
                  </SignatureText>
                )}

                {athlete.identityDocuments?.length ? (
                  <View style={styles.groupBlock}>
                    <SignatureText variant="small" tone="ink">
                      Documenti identita
                    </SignatureText>
                    {athlete.identityDocuments.map((document) => (
                      <SignatureText
                        key={document.id}
                        variant="small"
                        tone="muted"
                      >
                        {document.name}
                      </SignatureText>
                    ))}
                  </View>
                ) : null}
              </GlassCard>
            </>
          ) : null}
        </View>
      ) : (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Atleta non disponibile"
          message="Non ho trovato la scheda atleta richiesta nel club attivo."
        />
      )}
    </SecondaryScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  badgeWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  groupBlock: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  analyticsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  analyticsItem: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.1)",
    borderRadius: 14,
    padding: Spacing.md,
  },
});
