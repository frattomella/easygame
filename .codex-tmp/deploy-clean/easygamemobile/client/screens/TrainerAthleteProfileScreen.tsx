import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { RouteProp, useFocusEffect, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { ThemedText } from "@/components/ThemedText";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import {
  getMobileMedicalCertificateAvailability,
  getMobileMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import {
  formatItalianDate,
  getAthleteStatusLabel,
  getAthleteStatusVariant,
} from "@/lib/mobile-ui";
import { Athlete } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";
import { AthletesStackParamList } from "@/navigation/AthletesStackNavigator";

const renderValue = (value?: string | null, fallback = "Non disponibile") =>
  String(value || "").trim() || fallback;

const renderDocumentLine = (label: string, value?: string | null) => (
  <ThemedText type="small" style={styles.sectionText}>
    {label}: {renderValue(value)}
  </ThemedText>
);

export default function TrainerAthleteProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const route =
    useRoute<RouteProp<AthletesStackParamList, "AthleteProfile">>();
  const { theme } = useTheme();
  const { trainerPermissions } = useAuthContext();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const athleteId = route.params?.athleteId;
  const medicalAvailability = getMobileMedicalCertificateAvailability(
    athlete?.medicalCertExpiry,
  );

  const loadData = useCallback(async () => {
    if (!athleteId) {
      setAthlete(null);
      return;
    }

    const nextAthlete = await mobileBackendStorage.getAthlete(athleteId);
    setAthlete(nextAthlete);
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
  const canSeeEnrollment =
    trainerPermissions?.actions.viewEnrollmentAndPayments !== false;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: tabBarHeight + insets.bottom + Spacing["4xl"],
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {athlete ? (
        <View style={styles.content}>
          <Card style={[styles.heroCard, { backgroundColor: Colors.light.primary }]}>
            <Avatar
              name={athlete.name}
              size={76}
              showNumber
              number={athlete.number}
            />
            <View style={{ flex: 1 }}>
              <ThemedText type="h4" style={styles.heroTitle}>
                {athlete.name}
              </ThemedText>
              <ThemedText type="small" style={styles.heroSubtitle}>
                {athlete.category} · {athlete.position}
              </ThemedText>
              <View style={styles.heroBadges}>
                <Badge
                  label={getAthleteStatusLabel(athlete.status)}
                  variant={getAthleteStatusVariant(athlete.status)}
                  small
                />
                {canSeeMedical ? (
                  <Badge
                    label={getMobileMedicalCertificateAvailabilityLabel(
                      medicalAvailability,
                    )}
                    variant={
                      medicalAvailability === "valid"
                        ? "success"
                        : medicalAvailability === "expiring"
                          ? "warning"
                          : "destructive"
                    }
                    small
                  />
                ) : null}
              </View>
            </View>
          </Card>

          <Card style={styles.sectionCard}>
            <ThemedText type="body" style={styles.sectionTitle}>
              Anagrafica
            </ThemedText>
            {renderDocumentLine("Nome", athlete.firstName || athlete.name)}
            {renderDocumentLine("Cognome", athlete.lastName)}
            {renderDocumentLine("Data di nascita", formatItalianDate(athlete.birthDate))}
            {renderDocumentLine("Categoria", athlete.category)}
            {renderDocumentLine("Numero maglia", athlete.number ? String(athlete.number) : "")}
            {renderDocumentLine("Citta", athlete.city)}
          </Card>

          {canSeeTechnicalSheet ? (
            <Card style={styles.sectionCard}>
              <ThemedText type="body" style={styles.sectionTitle}>
                Scheda tecnica
              </ThemedText>
              {renderDocumentLine("Ruolo", athlete.position)}
              {renderDocumentLine("Note tecniche", athlete.technicalNotes)}
              {renderDocumentLine("Profilo abbigliamento", athlete.clothingProfile)}
              {renderDocumentLine("Taglia maglia", athlete.shirtSize)}
              {renderDocumentLine("Taglia pantalone", athlete.pantsSize)}
              {renderDocumentLine("Numero scarpa", athlete.shoeSize)}
            </Card>
          ) : null}

          {canSeeContacts ? (
            <Card style={styles.sectionCard}>
              <ThemedText type="body" style={styles.sectionTitle}>
                Contatti e tutori
              </ThemedText>
              {renderDocumentLine("Telefono", athlete.phone)}
              {renderDocumentLine("Email", athlete.email)}
              {athlete.guardians?.length ? (
                athlete.guardians.map((guardian) => (
                  <View key={guardian.id} style={styles.listItem}>
                    <Ionicons
                      name="people-outline"
                      size={16}
                      color={theme.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <ThemedText type="small" style={styles.sectionText}>
                        {guardian.relationship || "Tutore"} · {guardian.name}
                        {guardian.surname ? ` ${guardian.surname}` : ""}
                      </ThemedText>
                      <ThemedText type="small" style={styles.mutedText}>
                        {[guardian.phone, guardian.email].filter(Boolean).join(" · ") ||
                          "Contatti non disponibili"}
                      </ThemedText>
                    </View>
                  </View>
                ))
              ) : (
                <ThemedText type="small" style={styles.mutedText}>
                  Nessun tutore registrato.
                </ThemedText>
              )}
            </Card>
          ) : null}

          {canSeeMedical ? (
            <Card style={styles.sectionCard}>
              <ThemedText type="body" style={styles.sectionTitle}>
                Area medica
              </ThemedText>
              <View style={styles.listItem}>
                <Ionicons
                  name={
                    medicalAvailability === "valid"
                      ? "checkmark-circle"
                      : "warning-outline"
                  }
                  size={18}
                  color={
                    medicalAvailability === "valid"
                      ? Colors.light.success
                      : Colors.light.warning
                  }
                />
                <View style={{ flex: 1 }}>
                  <ThemedText type="small" style={styles.sectionText}>
                    {getMobileMedicalCertificateAvailabilityLabel(
                      medicalAvailability,
                    )}
                  </ThemedText>
                  <ThemedText type="small" style={styles.mutedText}>
                    Scadenza: {formatItalianDate(athlete.medicalCertExpiry)}
                  </ThemedText>
                </View>
              </View>
              {athlete.documents?.length ? (
                athlete.documents.map((document) => (
                  <ThemedText
                    key={document.id}
                    type="small"
                    style={styles.sectionText}
                  >
                    {document.name} · {renderValue(document.type, "Documento")}
                  </ThemedText>
                ))
              ) : null}
            </Card>
          ) : null}

          {canSeeEnrollment ? (
            <>
              <Card style={styles.sectionCard}>
                <ThemedText type="body" style={styles.sectionTitle}>
                  Tesseramenti e iscrizione
                </ThemedText>
                {athlete.registrations?.length ? (
                  athlete.registrations.map((registration) => (
                    <View key={registration.id} style={styles.listItem}>
                      <Ionicons
                        name="ribbon-outline"
                        size={16}
                        color={theme.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText type="small" style={styles.sectionText}>
                          {registration.federation} · {registration.number}
                        </ThemedText>
                        <ThemedText type="small" style={styles.mutedText}>
                          {[registration.status, formatItalianDate(registration.expiryDate)]
                            .filter(Boolean)
                            .join(" · ")}
                        </ThemedText>
                      </View>
                    </View>
                  ))
                ) : (
                  <ThemedText type="small" style={styles.mutedText}>
                    Nessun tesseramento disponibile.
                  </ThemedText>
                )}

                {athlete.enrollmentDocuments?.length ? (
                  <View style={styles.groupBlock}>
                    <ThemedText type="small" style={styles.groupTitle}>
                      Documenti iscrizione
                    </ThemedText>
                    {athlete.enrollmentDocuments.map((document) => (
                      <ThemedText
                        key={document.id}
                        type="small"
                        style={styles.sectionText}
                      >
                        {document.name}
                      </ThemedText>
                    ))}
                  </View>
                ) : null}
              </Card>

              <Card style={styles.sectionCard}>
                <ThemedText type="body" style={styles.sectionTitle}>
                  Pagamenti e documenti
                </ThemedText>
                {athlete.payments?.length ? (
                  athlete.payments.map((payment) => (
                    <View key={payment.id} style={styles.listItem}>
                      <Ionicons
                        name="card-outline"
                        size={16}
                        color={theme.textSecondary}
                      />
                      <View style={{ flex: 1 }}>
                        <ThemedText type="small" style={styles.sectionText}>
                          {payment.description} · {payment.amount}
                        </ThemedText>
                        <ThemedText type="small" style={styles.mutedText}>
                          {[payment.status, formatItalianDate(payment.date)]
                            .filter(Boolean)
                            .join(" · ")}
                        </ThemedText>
                      </View>
                    </View>
                  ))
                ) : (
                  <ThemedText type="small" style={styles.mutedText}>
                    Nessun pagamento registrato.
                  </ThemedText>
                )}

                {athlete.identityDocuments?.length ? (
                  <View style={styles.groupBlock}>
                    <ThemedText type="small" style={styles.groupTitle}>
                      Documenti identita
                    </ThemedText>
                    {athlete.identityDocuments.map((document) => (
                      <ThemedText
                        key={document.id}
                        type="small"
                        style={styles.sectionText}
                      >
                        {document.name}
                      </ThemedText>
                    ))}
                  </View>
                ) : null}
              </Card>
            </>
          ) : null}
        </View>
      ) : (
        <Card style={styles.sectionCard}>
          <ThemedText type="body" style={styles.sectionTitle}>
            Atleta non disponibile
          </ThemedText>
          <ThemedText type="small" style={styles.mutedText}>
            Non ho trovato la scheda atleta richiesta nel club attivo.
          </ThemedText>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { gap: Spacing.md },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    borderRadius: BorderRadius["2xl"],
  },
  heroTitle: { color: "#FFFFFF", marginBottom: 4 },
  heroSubtitle: { color: "rgba(255,255,255,0.84)" },
  heroBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  sectionCard: { gap: Spacing.sm },
  sectionTitle: { fontWeight: "700" },
  sectionText: { color: Colors.light.textSecondary },
  mutedText: { color: Colors.light.textSecondary },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  groupBlock: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  groupTitle: {
    fontWeight: "700",
    color: Colors.light.text,
  },
});
