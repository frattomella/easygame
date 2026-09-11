import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  ActionButton,
  GlassCard,
  SecondaryScreenLayout,
  SignatureInput,
  SignatureText,
  StatusPill,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import { Spacing } from "@/constants/theme";

/**
 * "Dati personali" — la riga omonima del Profilo (prototipo `profileRows`)
 * apre qui il modulo che prima viveva dentro la schermata Profilo: stessi
 * campi, stesso `updateUserProfile`, stesse chiavi di permesso. Sotto il
 * modulo restano le categorie assegnate e i permessi attivi, che sono dati
 * del proprio accesso, non del club.
 */
export default function TrainerPersonalDataScreen() {
  const { user, assignedCategories, trainerPermissions, updateUserProfile } =
    useAuthContext();

  const [fullName, setFullName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [city, setCity] = useState(user?.city || "");
  const [saving, setSaving] = useState(false);

  const permissionItems = [
    {
      label: "Presenze",
      enabled: trainerPermissions?.actions.manageAttendance !== false,
    },
    {
      label: "Convocazioni",
      enabled: trainerPermissions?.actions.manageConvocations !== false,
    },
    {
      label: "Scheda tecnica",
      enabled: trainerPermissions?.actions.viewAthleteTechnicalSheet !== false,
    },
    {
      label: "Pagamenti/Iscrizione",
      enabled: trainerPermissions?.actions.viewEnrollmentAndPayments !== false,
    },
  ];

  useEffect(() => {
    setFullName(user?.name || "");
    setEmail(user?.email || "");
    setPhone(user?.phone || "");
    setCity(user?.city || "");
  }, [user?.city, user?.email, user?.name, user?.phone]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await updateUserProfile({
        name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        city: city.trim(),
      });
      Alert.alert(
        "Profilo aggiornato",
        "Le tue informazioni sono state salvate.",
      );
    } catch (error) {
      Alert.alert(
        "Errore",
        error instanceof Error
          ? error.message
          : "Impossibile salvare il profilo.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SecondaryScreenLayout
      title="Dati personali"
      eyebrow="Account EasyGame · Allenatore"
    >
      <GlassCard
        eyebrow="Il tuo account"
        title="Nome, contatti e citta"
        style={styles.formCard}
      >
        <SignatureInput
          label="Nome e cognome"
          value={fullName}
          onChangeText={setFullName}
          leftIcon="person-outline"
        />
        <SignatureInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          leftIcon="mail-outline"
        />
        <SignatureInput
          label="Telefono"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          leftIcon="call-outline"
        />
        <SignatureInput
          label="Citta"
          value={city}
          onChangeText={setCity}
          leftIcon="location-outline"
        />
        <ActionButton
          fullWidth
          trailingIcon="arrow-forward"
          onPress={() => void handleSaveProfile()}
          loading={saving}
        >
          Salva modifiche
        </ActionButton>
      </GlassCard>

      <GlassCard eyebrow="Categorie assegnate">
        <View style={styles.badgeWrap}>
          {assignedCategories.length > 0 ? (
            assignedCategories.map((category) => (
              <StatusPill
                key={category.id}
                label={category.name}
                tier="quiet"
                tone="info"
                small
              />
            ))
          ) : (
            <StatusPill
              label="Nessuna categoria"
              tier="outline"
              tone="warning"
              small
            />
          )}
        </View>
      </GlassCard>

      <GlassCard eyebrow="Permessi attivi">
        <View style={styles.permissionList}>
          {permissionItems.map((item) => (
            <View key={item.label} style={styles.permissionRow}>
              <View style={styles.permissionInfo}>
                <Ionicons
                  name={item.enabled ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={item.enabled ? "#15803D" : "#B91C1C"}
                />
                <SignatureText variant="small" tone="ink">
                  {item.label}
                </SignatureText>
              </View>
              <StatusPill
                label={item.enabled ? "Attivo" : "Non attivo"}
                tier="quiet"
                tone={item.enabled ? "success" : "neutral"}
                small
              />
            </View>
          ))}
        </View>
      </GlassCard>
    </SecondaryScreenLayout>
  );
}

const styles = StyleSheet.create({
  formCard: { gap: Spacing.sm },
  badgeWrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  permissionList: { gap: Spacing.sm },
  permissionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  permissionInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
});
