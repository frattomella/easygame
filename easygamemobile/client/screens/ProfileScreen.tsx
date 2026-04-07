import React, { useState } from "react";
import { View, StyleSheet, ScrollView, Switch, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuthContext } from "@/contexts/AuthContext";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { user, currentClub, currentRole, logout, clearContext } = useAuthContext();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleChangeContext = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await clearContext();
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  const handleToggleNotifications = (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNotificationsEnabled(value);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerContent}>
          <Avatar name={user?.name || "U"} size={80} />
          <ThemedText type="h3" style={styles.userName}>
            {user?.name || "Utente"}
          </ThemedText>
          <ThemedText type="body" style={styles.userRole}>
            {currentRole || "Allenatore"}
          </ThemedText>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: tabBarHeight + Spacing["2xl"] },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
      >
        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
          <ThemedText
            type="small"
            style={[styles.sectionTitle, { color: theme.textSecondary }]}
          >
            CLUB
          </ThemedText>
          <Card style={styles.clubCard}>
            <View style={styles.clubContent}>
              <Avatar name={currentClub?.name || "C"} size={50} />
              <View style={styles.clubInfo}>
                <ThemedText type="body" style={styles.clubName}>
                  {currentClub?.name || "Nessun club"}
                </ThemedText>
                {currentClub?.categories ? (
                  <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    {currentClub.categories.join(", ")}
                  </ThemedText>
                ) : null}
              </View>
              <Button variant="outline" size="sm" onPress={handleChangeContext}>
                Cambia
              </Button>
            </View>
          </Card>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(200).duration(400)}
          style={styles.section}
        >
          <ThemedText
            type="small"
            style={[styles.sectionTitle, { color: theme.textSecondary }]}
          >
            IMPOSTAZIONI
          </ThemedText>
          <Card style={styles.settingsCard} noPadding>
            <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
              <View style={styles.settingLeft}>
                <View
                  style={[styles.settingIcon, { backgroundColor: Colors.light.primary }]}
                >
                  <Ionicons name="notifications" size={18} color="#FFFFFF" />
                </View>
                <ThemedText type="body">Notifiche</ThemedText>
              </View>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: theme.backgroundSecondary, true: theme.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <Pressable
              style={[styles.settingRow, { borderBottomColor: theme.border }]}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <View style={styles.settingLeft}>
                <View
                  style={[styles.settingIcon, { backgroundColor: Colors.light.success }]}
                >
                  <Ionicons name="shield-checkmark" size={18} color="#FFFFFF" />
                </View>
                <ThemedText type="body">Privacy</ThemedText>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>

            <Pressable
              style={styles.settingRow}
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            >
              <View style={styles.settingLeft}>
                <View
                  style={[styles.settingIcon, { backgroundColor: Colors.light.warning }]}
                >
                  <Ionicons name="help-circle" size={18} color="#FFFFFF" />
                </View>
                <ThemedText type="body">Aiuto</ThemedText>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>
          </Card>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(300).duration(400)}
          style={styles.section}
        >
          <Button variant="destructive" fullWidth onPress={handleLogout}>
            Esci
          </Button>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(400).duration(400)}
          style={styles.versionContainer}
        >
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            EasyGame Mobile v1.0.0
          </ThemedText>
        </Animated.View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    backgroundColor: Colors.light.primary,
    paddingBottom: Spacing["3xl"],
  },
  headerContent: {
    alignItems: "center",
    paddingTop: Spacing["2xl"],
  },
  userName: {
    color: "#FFFFFF",
    marginTop: Spacing.lg,
  },
  userRole: {
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: Spacing.xs,
  },
  scrollView: {
    flex: 1,
    marginTop: -Spacing.lg,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  section: {
    marginTop: Spacing["2xl"],
  },
  clubCard: {},
  clubContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  clubInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  clubName: {
    fontWeight: "600",
  },
  settingsCard: {
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  versionContainer: {
    alignItems: "center",
    marginTop: Spacing["3xl"],
  },
});
