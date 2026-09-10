import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
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
import { EGInk, Spacing } from "@/constants/theme";
import type { ProfileStackParamList } from "@/navigation/ProfileStackNavigator";

type Navigation = NativeStackNavigationProp<ProfileStackParamList, "Profile">;

/**
 * design-source `guidelines/trainer-migration.md` §Profilo (WP10) —
 * allineato allo stesso linguaggio di `ParentProfileScreen`: `GlassCard` +
 * `ActionButton` al posto di `Card`/`Button` piatti. Stessi campi, stesso
 * `updateUserProfile`, stesse chiavi di permesso di prima.
 */
export default function TrainerProfileDashboardScreen() {
  const navigation = useNavigation<Navigation>();
  const {
    user,
    assignedCategories,
    trainerPermissions,
    clearContext,
    logout,
    updateUserProfile,
  } = useAuthContext();

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
      title="Profilo"
      eyebrow="Il tuo account"
      onBack={false}
      onNotifications={() => navigation.navigate("Notifications")}
    >
      <GlassCard eyebrow="Account" title={user?.name || "Allenatore"}>
        <SignatureText variant="small" tone="muted">
          {user?.email}
        </SignatureText>
      </GlassCard>

      <GlassCard eyebrow="Dati personali" style={styles.formCard}>
        <SignatureInput
          label="Nome e cognome"
          value={fullName}
          onChangeText={setFullName}
        />
        <SignatureInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <SignatureInput
          label="Telefono"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <SignatureInput label="Citta" value={city} onChangeText={setCity} />
        <ActionButton
          fullWidth
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
                variant="primary"
                small
              />
            ))
          ) : (
            <StatusPill label="Nessuna categoria" variant="warning" small />
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
                  color={item.enabled ? "#22C55E" : "#EF4444"}
                />
                <SignatureText variant="small" tone="ink">
                  {item.label}
                </SignatureText>
              </View>
              <StatusPill
                label={item.enabled ? "Visibile" : "Nascosto"}
                variant={item.enabled ? "success" : "destructive"}
                small
              />
            </View>
          ))}
        </View>
      </GlassCard>

      <GlassCard
        eyebrow="Altro"
        title="Altre sezioni"
        description="Bacheca, documenti, appuntamenti, compensi e squadre."
      >
        <ActionButton
          variant="secondary"
          size="sm"
          onPress={() => navigation.navigate("More")}
        >
          Apri altre sezioni
        </ActionButton>
      </GlassCard>

      <GlassCard
        eyebrow="Supporto"
        title="Supporto e assistenza"
        description="Per supporto operativo puoi contattare il team EasyGame indicando club, ruolo e schermata coinvolta."
      >
        <SignatureText
          variant="small"
          style={{ color: EGInk.onLightFaint, fontWeight: "600" }}
        >
          support@easygame.it
        </SignatureText>
      </GlassCard>

      <View style={styles.actionStack}>
        <ActionButton
          variant="secondary"
          fullWidth
          onPress={() => void clearContext()}
        >
          Torna allo Spazio Account
        </ActionButton>
        <ActionButton
          variant="destructive"
          fullWidth
          onPress={() => void logout()}
        >
          Esci
        </ActionButton>
      </View>
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
  actionStack: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
});
