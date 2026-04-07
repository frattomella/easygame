import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { ThemedText } from "@/components/ThemedText";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";

export default function TrainerProfileDashboardScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
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
      Alert.alert("Profilo aggiornato", "Le tue informazioni sono state salvate.");
    } catch (error) {
      Alert.alert(
        "Errore",
        error instanceof Error ? error.message : "Impossibile salvare il profilo.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingTop: Spacing.lg,
        paddingHorizontal: Spacing.lg,
        paddingBottom: tabBarHeight + insets.bottom + Spacing["4xl"],
      }}
    >
      <View style={styles.content}>
        <Card style={[styles.heroCard, { backgroundColor: Colors.light.primary }]}>
          <Avatar name={user?.name || "Coach"} size={74} />
          <View style={{ flex: 1 }}>
            <ThemedText type="h4" style={styles.heroName}>
              {user?.name || "Allenatore"}
            </ThemedText>
            <ThemedText type="small" style={styles.heroSubtitle}>
              Profilo account EasyGame
            </ThemedText>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <Input label="Nome e cognome" value={fullName} onChangeText={setFullName} />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Input
            label="Telefono"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Input label="Citta" value={city} onChangeText={setCity} />
          <Button fullWidth onPress={() => void handleSaveProfile()} loading={saving}>
            Salva modifiche
          </Button>
        </Card>

        <Card style={styles.sectionCard}>
          <ThemedText type="body" style={styles.sectionLabel}>
            Categorie assegnate
          </ThemedText>
          <View style={styles.badgeWrap}>
            {assignedCategories.length > 0 ? (
              assignedCategories.map((category) => (
                <Badge key={category.id} label={category.name} small />
              ))
            ) : (
              <Badge label="Nessuna categoria" variant="warning" small />
            )}
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <ThemedText type="body" style={styles.sectionLabel}>
            Permessi attivi
          </ThemedText>
          {permissionItems.map((item) => (
            <View key={item.label} style={styles.permissionRow}>
              <View style={styles.permissionInfo}>
                <Ionicons
                  name={item.enabled ? "checkmark-circle" : "close-circle"}
                  size={18}
                  color={
                    item.enabled ? Colors.light.success : Colors.light.destructive
                  }
                />
                <ThemedText type="small">{item.label}</ThemedText>
              </View>
              <Badge
                label={item.enabled ? "Visibile" : "Nascosto"}
                variant={item.enabled ? "success" : "destructive"}
                small
              />
            </View>
          ))}
        </Card>

        <Card style={styles.sectionCard}>
          <ThemedText type="body" style={styles.sectionLabel}>
            Supporto e assistenza
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Per supporto operativo puoi contattare il team EasyGame indicando
            club, ruolo e schermata coinvolta.
          </ThemedText>
          <Badge label="support@easygame.it" small />
        </Card>

        <View style={styles.actionStack}>
          <Button variant="outline" fullWidth onPress={clearContext}>
            Torna allo Spazio Account
          </Button>
          <Button variant="destructive" fullWidth onPress={logout}>
            Esci
          </Button>
        </View>
      </View>
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
  heroName: { color: "#FFFFFF", marginBottom: 4 },
  heroSubtitle: { color: "rgba(255,255,255,0.84)" },
  sectionCard: { gap: Spacing.sm },
  sectionLabel: { fontWeight: "700" },
  badgeWrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
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
  actionStack: { gap: Spacing.sm, marginTop: Spacing.md },
});
