import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ThemedText } from "@/components/ThemedText";
import { useAuthContext } from "@/contexts/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { getRoleLabel } from "@/lib/mobile-ui";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";

export default function TrainerProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const {
    user,
    currentClub,
    currentRole,
    currentAccess,
    assignedCategories,
    trainerPermissions,
    clearContext,
    logout,
  } = useAuthContext();

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

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={{
        paddingBottom: tabBarHeight + insets.bottom + Spacing["4xl"],
      }}
    >
      <View style={styles.headerWrap}>
        <View
          style={[
            styles.header,
            {
              backgroundColor: Colors.light.primary,
              paddingTop: insets.top + Spacing["2xl"],
            },
          ]}
        >
          <Avatar name={user?.name || "Coach"} size={86} />
          <ThemedText type="h3" style={styles.headerName}>
            {user?.name || "Allenatore"}
          </ThemedText>
          <ThemedText type="small" style={styles.headerSubtitle}>
            {currentClub?.name || "Nessun club"} · {getRoleLabel(currentRole)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.content}>
        <Card style={styles.sectionCard}>
          <ThemedText type="body" style={styles.sectionLabel}>
            Contesto attivo
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Club: {currentClub?.name || "Non definito"}
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Ruolo: {getRoleLabel(currentRole)}
          </ThemedText>
          {currentAccess?.summary ? (
            <ThemedText type="small" style={{ color: theme.textSecondary }}>
              {currentAccess.summary}
            </ThemedText>
          ) : null}
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
                    item.enabled
                      ? Colors.light.success
                      : Colors.light.destructive
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
  headerWrap: {
    overflow: "hidden",
    borderBottomLeftRadius: BorderRadius["3xl"],
    borderBottomRightRadius: BorderRadius["3xl"],
  },
  header: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing["3xl"],
  },
  headerName: { color: "#FFFFFF", marginTop: Spacing.lg },
  headerSubtitle: { color: "rgba(255,255,255,0.82)", marginTop: 4 },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },
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
