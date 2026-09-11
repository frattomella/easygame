import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { RouteProp, useFocusEffect, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import {
  GlassCard,
  GlassSurface,
  MetaRow,
  NumberTile,
  SecondaryScreenLayout,
  SignatureText,
  StatCard,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  getMobileMedicalCertificateAvailability,
  getMobileMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import { formatItalianDate, getAthleteStatusLabel } from "@/lib/mobile-ui";
import { Athlete, Match, Training } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EGGlass, EGInk, EGShadow, Spacing } from "@/constants/theme";
import { AthletesStackParamList } from "@/navigation/AthletesStackNavigator";

const renderValue = (value?: string | null, fallback = "Non disponibile") =>
  String(value || "").trim() || fallback;

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const RECENT_TRAININGS_LIMIT = 12;

const isAthleteTraining = (training: Training, athlete: Athlete) =>
  (training.categoryId &&
    athlete.categoryId &&
    normalizeText(training.categoryId) === normalizeText(athlete.categoryId)) ||
  normalizeText(training.category) === normalizeText(athlete.category);

/**
 * D-MOB-12: la lista (`GET /api/v1/events`) porta solo i conteggi
 * dell'appello, non le righe. "Presenze %" e "Ultime presenze" del
 * prototipo (`isTAthlete`) vogliono l'appello dell'atleta: si chiede il
 * dettaglio (`GET /api/v1/events/:id`, la stessa rotta del foglio
 * Presenze) per gli ultimi allenamenti della sua categoria in cui un
 * appello e stato registrato — pochi, gia filtrati sul perimetro dal
 * server. Un dettaglio che fallisce lascia l'allenamento senza appello,
 * non blocca la scheda.
 */
const withAthleteAttendance = async (
  items: Training[],
  athlete: Athlete | null,
): Promise<Training[]> => {
  if (!athlete) return items;
  const today = new Date().toISOString().slice(0, 10);
  const recorded = items
    .filter(
      (training) =>
        training.date <= today &&
        (training.totalCount ?? 0) > 0 &&
        isAthleteTraining(training, athlete),
    )
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    .slice(0, RECENT_TRAININGS_LIMIT);
  const rosters = await Promise.all(
    recorded.map((training) =>
      mobileBackendStorage
        .getTrainingAttendance(training.id)
        .catch(() => undefined),
    ),
  );
  const byId = new Map(
    recorded.map((training, index) => [training.id, rosters[index]]),
  );
  return items.map((training) =>
    byId.has(training.id) && byId.get(training.id)
      ? { ...training, attendance: byId.get(training.id) }
      : training,
  );
};

const MEDICAL_TONE: Record<
  string,
  {
    tier: "quiet" | "outline" | "solid" | "urgent";
    tone: "success" | "warning" | "danger";
  }
> = {
  valid: { tier: "quiet", tone: "success" },
  expiring: { tier: "solid", tone: "warning" },
  expired: { tier: "urgent", tone: "danger" },
  missing: { tier: "outline", tone: "warning" },
};

/**
 * La scheda atleta del prototipo v3 (`isTAthlete`, design turno 6 §11):
 * la testata e una scheda di vetro scuro che **attraversa l'orizzonte**
 * (`NumberTile` 56 navy, nome 22/800, "categoria · ruolo", pill bianca
 * di stato), poi due `StatCard` (Presenze %, Convocazioni), la "Scheda"
 * con le `MetaRow` (nascita, tutore, certificato) e "Ultime presenze" a
 * righe (data · titolo · pill). Le sezioni ulteriori (anagrafica completa,
 * scheda tecnica, contatti, area medica) seguono con le stesse porte di
 * permesso di prima (`viewAthleteTechnicalSheet`, `viewAthleteContacts`,
 * `viewMedicalStatus`); `canSeeEnrollment` resta `false` come nel codice
 * preesistente (vedi debito tecnico).
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
    setTrainings(await withAthleteAttendance(nextTrainings, nextAthlete));
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
        isAthleteTraining(training, athlete),
    );
  }, [athlete, trainings]);
  const attendanceEntries = useMemo(
    () =>
      athleteTrainings.flatMap((training) =>
        (training.attendance || [])
          .filter(
            (entry) =>
              entry.athleteId === athlete?.id && entry.present !== null,
          )
          .map((entry) => ({ ...entry, training })),
      ),
    [athlete?.id, athleteTrainings],
  );
  const presentCount = attendanceEntries.filter(
    (entry) => entry.present,
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

  const firstGuardian = athlete?.guardians?.[0];
  const recentAttendance = [...attendanceEntries]
    .sort((a, b) =>
      `${b.training.date} ${b.training.time}`.localeCompare(
        `${a.training.date} ${a.training.time}`,
      ),
    )
    .slice(0, 5);

  return (
    <SecondaryScreenLayout
      title="Atleta"
      eyebrow={`${athlete?.category || "Rosa"} · Scheda`}
      skyHeight={300}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {athlete ? (
        <>
          <GlassSurface
            tone="dark"
            corner="card"
            elevated
            style={[styles.hero, EGShadow.glassRaised]}
          >
            <View style={styles.heroRow}>
              <NumberTile number={athlete.number} size={56} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <SignatureText style={styles.heroName} numberOfLines={2}>
                  {athlete.name}
                </SignatureText>
                <SignatureText style={styles.heroMeta} numberOfLines={1}>
                  {`${athlete.category || "Categoria"} · ${athlete.position || "Ruolo da definire"}`}
                </SignatureText>
                <StatusPill
                  label={getAthleteStatusLabel(athlete.status)}
                  onSky
                  tone={athlete.status === "attivo" ? "success" : "warning"}
                  small
                  style={{ marginTop: 8 }}
                />
              </View>
            </View>
          </GlassSurface>

          <View style={styles.statsRow}>
            <StatCard
              icon="barbell-outline"
              iconColor="#10B981"
              value={attendanceEntries.length ? `${attendanceRate}%` : "–"}
              label="Presenze"
              style={{ flex: 1 }}
            />
            <StatCard
              icon="football-outline"
              iconColor="#F97316"
              value={String(
                athleteMatches.filter((match) =>
                  match.convocatedAthletes?.includes(athlete.id),
                ).length,
              )}
              label="Convocazioni"
              style={{ flex: 1 }}
            />
          </View>

          <GlassCard eyebrow="Scheda">
            <MetaRow icon="calendar-outline">
              {athlete.birthDate
                ? `Nato il ${formatItalianDate(athlete.birthDate)}`
                : "Data di nascita non disponibile"}
            </MetaRow>
            {canSeeContacts ? (
              <MetaRow icon="people-outline">
                {firstGuardian
                  ? `${firstGuardian.relationship || "Tutore"} · ${[firstGuardian.name, firstGuardian.surname].filter(Boolean).join(" ")}`
                  : "Nessun tutore registrato"}
              </MetaRow>
            ) : null}
            {canSeeMedical ? (
              <MetaRow icon="medkit-outline">
                {medicalAvailability === "valid" && athlete.medicalCertExpiry
                  ? `Certificato medico valido al ${formatItalianDate(athlete.medicalCertExpiry)}`
                  : `Certificato medico: ${getMobileMedicalCertificateAvailabilityLabel(medicalAvailability).toLowerCase()}`}
              </MetaRow>
            ) : null}
            <MetaRow icon="shirt-outline">
              {`Numero ${athlete.number || "–"} · ${renderValue(athlete.city, "Citta non disponibile")}`}
            </MetaRow>
          </GlassCard>

          <GlassCard eyebrow="Ultime presenze">
            {recentAttendance.length > 0 ? (
              <View style={styles.logList}>
                {recentAttendance.map((entry) => (
                  <View
                    key={`${entry.training.id}-${entry.athleteId}`}
                    style={styles.logRow}
                  >
                    <SignatureText style={styles.logDate}>
                      {formatItalianDate(entry.training.date, "d MMM")}
                    </SignatureText>
                    <SignatureText style={styles.logTitle} numberOfLines={1}>
                      {entry.training.title}
                    </SignatureText>
                    <StatusPill
                      label={entry.present ? "Presente" : "Assente"}
                      tier={entry.present ? "solid" : "quiet"}
                      tone={entry.present ? "success" : "neutral"}
                      small
                    />
                  </View>
                ))}
              </View>
            ) : (
              <SignatureText variant="small" tone="faint">
                Nessuna presenza registrata.
              </SignatureText>
            )}
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

          <GlassCard eyebrow="Anagrafica">
            <MetaRow icon="person-outline">
              {[athlete.firstName || athlete.name, athlete.lastName]
                .filter(Boolean)
                .join(" ")}
            </MetaRow>
            <MetaRow icon="ribbon-outline">
              Categoria: {renderValue(athlete.category)}
            </MetaRow>
            <MetaRow icon="location-outline">
              Citta: {renderValue(athlete.city)}
            </MetaRow>
          </GlassCard>

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
              <View style={styles.medicalRow}>
                <SignatureText variant="small" tone="muted" style={{ flex: 1 }}>
                  {`Scadenza: ${formatItalianDate(athlete.medicalCertExpiry)}`}
                </SignatureText>
                <StatusPill
                  label={getMobileMedicalCertificateAvailabilityLabel(
                    medicalAvailability,
                  )}
                  tier={MEDICAL_TONE[medicalAvailability]?.tier || "quiet"}
                  tone={MEDICAL_TONE[medicalAvailability]?.tone || "success"}
                  small
                />
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

          {canSeeEnrollment ? (
            <GlassCard eyebrow="Tesseramenti e iscrizione">
              {athlete.registrations?.length ? (
                athlete.registrations.map((registration) => (
                  <MetaRow icon="ribbon-outline" key={registration.id}>
                    {registration.federation} · {registration.number}
                  </MetaRow>
                ))
              ) : (
                <SignatureText variant="small" tone="faint">
                  Nessun tesseramento disponibile.
                </SignatureText>
              )}
            </GlassCard>
          ) : null}
        </>
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
  hero: {
    borderColor: "rgba(255,255,255,0.2)",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: Spacing.lg,
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
  logList: {
    gap: 8,
  },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(11,26,58,0.04)",
    borderWidth: 1,
    borderColor: EGGlass.hairline,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  logDate: {
    minWidth: 52,
    color: "rgba(11,26,58,0.42)",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  logTitle: {
    flex: 1,
    color: "#0B1A3A",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  medicalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
});
