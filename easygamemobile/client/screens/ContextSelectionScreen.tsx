import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Modal,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useTheme } from "@/hooks/useTheme";
import { useAuthContext } from "@/contexts/AuthContext";
import { storage } from "@/services/storage";
import { Club, Access } from "@/services/api";
import { Spacing, BorderRadius } from "@/constants/theme";

export default function ContextSelectionScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { logout, setContext } = useAuthContext();

  const [ownedClubs, setOwnedClubs] = useState<Club[]>([]);
  const [accesses, setAccesses] = useState<Access[]>([]);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const clubs = await storage.getOwnedClubs();
      const access = await storage.getAccesses();
      setOwnedClubs(clubs);
      setAccesses(access);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectClub = async (clubId: string, role: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await setContext(clubId, role);
  };

  const handleAddToken = async () => {
    if (token.length < 5 || token.length > 8) {
      setTokenError("Il codice deve essere tra 5 e 8 cifre");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const newAccess = await storage.addAccess(token);
    if (newAccess) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAccesses([...accesses, newAccess]);
      setShowTokenModal(false);
      setToken("");
      setTokenError("");
    } else {
      setTokenError("Codice non valido");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  const renderClubItem = ({
    item,
    role,
  }: {
    item: Club | Access;
    role: string;
  }) => {
    const isAccess = "clubName" in item;
    const name = isAccess ? (item as Access).clubName : (item as Club).name;
    const clubId = isAccess ? (item as Access).clubId : (item as Club).id;

    return (
      <Card
        onPress={() => handleSelectClub(clubId, role)}
        style={styles.clubCard}
      >
        <View style={styles.clubCardContent}>
          <Avatar name={name} size={50} />
          <View style={styles.clubInfo}>
            <ThemedText type="body" style={styles.clubName}>
              {name}
            </ThemedText>
            <Badge label={role} variant="primary" small />
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.textSecondary}
          />
        </View>
      </Card>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing.lg,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        <ThemedText type="h3">Seleziona Contesto</ThemedText>
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color={theme.primary} />
        </Pressable>
      </View>

      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <>
            {ownedClubs.length > 0 ? (
              <Animated.View
                entering={FadeInDown.delay(100).duration(400)}
              >
                <ThemedText
                  type="small"
                  style={[styles.sectionTitle, { color: theme.textSecondary }]}
                >
                  CLUB POSSEDUTI
                </ThemedText>
                {ownedClubs.map((club, index) => (
                  <View key={club.id}>
                    {renderClubItem({ item: club, role: "Proprietario" })}
                  </View>
                ))}
              </Animated.View>
            ) : null}

            <Animated.View
              entering={FadeInDown.delay(200).duration(400)}
            >
              <View style={styles.sectionHeader}>
                <ThemedText
                  type="small"
                  style={[styles.sectionTitle, { color: theme.textSecondary }]}
                >
                  I MIEI ACCESSI
                </ThemedText>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowTokenModal(true);
                  }}
                  style={[
                    styles.addButton,
                    { backgroundColor: theme.backgroundSecondary },
                  ]}
                >
                  <Ionicons name="add" size={18} color={theme.primary} />
                  <ThemedText
                    type="small"
                    style={{ color: theme.primary, fontWeight: "600" }}
                  >
                    Aggiungi
                  </ThemedText>
                </Pressable>
              </View>
              {accesses.map((access) => (
                <View key={access.id}>
                  {renderClubItem({ item: access, role: access.role })}
                </View>
              ))}
            </Animated.View>
          </>
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + Spacing["2xl"] },
        ]}
      />

      <Modal
        visible={showTokenModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTokenModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowTokenModal(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ThemedText type="h4" style={styles.modalTitle}>
              Aggiungi Accesso
            </ThemedText>
            <ThemedText
              type="small"
              style={[styles.modalDescription, { color: theme.textSecondary }]}
            >
              Inserisci il codice di accesso fornito dal club
            </ThemedText>
            <Input
              placeholder="Codice (5-8 cifre)"
              value={token}
              onChangeText={(text) => {
                setToken(text.replace(/[^0-9]/g, ""));
                setTokenError("");
              }}
              keyboardType="number-pad"
              maxLength={8}
              error={tokenError}
            />
            <View style={styles.modalButtons}>
              <Button
                variant="ghost"
                onPress={() => {
                  setShowTokenModal(false);
                  setToken("");
                  setTokenError("");
                }}
              >
                Annulla
              </Button>
              <Button onPress={handleAddToken}>Conferma</Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  logoutButton: {
    padding: Spacing.sm,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing["2xl"],
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontWeight: "600",
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  clubCard: {
    marginBottom: Spacing.md,
  },
  clubCardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  clubInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  clubName: {
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["2xl"],
  },
  modalContent: {
    width: "100%",
    borderRadius: BorderRadius.lg,
    padding: Spacing["2xl"],
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  modalDescription: {
    textAlign: "center",
    marginBottom: Spacing["2xl"],
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
});
