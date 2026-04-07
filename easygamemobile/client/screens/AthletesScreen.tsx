import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useTheme } from "@/hooks/useTheme";
import { storage } from "@/services/storage";
import { Athlete } from "@/services/api";
import { Spacing, BorderRadius, Colors } from "@/constants/theme";

export default function AthletesScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();

  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAthlete, setSelectedAthlete] = useState<Athlete | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadData(searchQuery);
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const loadData = async (query?: string) => {
    try {
      const a = await storage.getAthletes(query);
      setAthletes(a);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(searchQuery);
    setRefreshing(false);
  };

  const getStatusVariant = (status: Athlete["status"]) => {
    switch (status) {
      case "attivo":
        return "success";
      case "infortunato":
        return "warning";
      case "squalificato":
        return "destructive";
      default:
        return "default";
    }
  };

  const getStatusLabel = (status: Athlete["status"]) => {
    switch (status) {
      case "attivo":
        return "Attivo";
      case "infortunato":
        return "Infortunato";
      case "squalificato":
        return "Squalificato";
      default:
        return status;
    }
  };

  const handleAthletePress = (athlete: Athlete) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedAthlete(athlete);
  };

  const handleCall = async (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = `tel:${phone}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  const handleEmail = async (email: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const url = `mailto:${email}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  const renderAthleteItem = ({ item, index }: { item: Athlete; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
      <Card
        onPress={() => handleAthletePress(item)}
        style={styles.athleteCard}
      >
        <View style={styles.athleteContent}>
          <Avatar
            name={item.name}
            size={50}
            showNumber
            number={item.number}
          />
          <View style={styles.athleteInfo}>
            <ThemedText type="body" style={styles.athleteName}>
              {item.name}
            </ThemedText>
            <View style={styles.athleteMeta}>
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {item.position}
              </ThemedText>
              <View style={styles.dot} />
              <ThemedText type="small" style={{ color: theme.textSecondary }}>
                {item.category}
              </ThemedText>
            </View>
          </View>
          <Badge
            label={getStatusLabel(item.status)}
            variant={getStatusVariant(item.status)}
            small
          />
        </View>
      </Card>
    </Animated.View>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.searchContainer, { marginTop: headerHeight }]}>
        <Input
          placeholder="Cerca atleta..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon="search-outline"
          rightIcon={searchQuery ? "close-circle" : undefined}
          onRightIconPress={() => setSearchQuery("")}
          style={styles.searchInput}
        />
      </View>

      <FlatList
        data={athletes}
        keyExtractor={(item) => item.id}
        renderItem={renderAthleteItem}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: tabBarHeight + Spacing["2xl"] },
        ]}
        scrollIndicatorInsets={{ bottom: insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <EmptyState
            illustration={require("../../assets/images/illustrations/empty_athletes_illustration.png")}
            title="Nessun atleta trovato"
            message={
              searchQuery
                ? "Prova a modificare la ricerca"
                : "La rosa e vuota"
            }
            style={styles.emptyState}
          />
        }
      />

      <Modal
        visible={!!selectedAthlete}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedAthlete(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setSelectedAthlete(null)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.backgroundDefault }]}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedAthlete ? (
              <>
                <View style={styles.modalHeader}>
                  <Avatar name={selectedAthlete.name} size={80} />
                  <ThemedText type="h3" style={styles.modalName}>
                    {selectedAthlete.name}
                  </ThemedText>
                  <Badge
                    label={getStatusLabel(selectedAthlete.status)}
                    variant={getStatusVariant(selectedAthlete.status)}
                  />
                </View>

                <View style={styles.modalDetails}>
                  <View style={styles.detailRow}>
                    <Ionicons
                      name="shirt-outline"
                      size={20}
                      color={theme.textSecondary}
                    />
                    <ThemedText type="body">
                      Numero {selectedAthlete.number}
                    </ThemedText>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons
                      name="football-outline"
                      size={20}
                      color={theme.textSecondary}
                    />
                    <ThemedText type="body">{selectedAthlete.position}</ThemedText>
                  </View>
                  <View style={styles.detailRow}>
                    <Ionicons
                      name="people-outline"
                      size={20}
                      color={theme.textSecondary}
                    />
                    <ThemedText type="body">{selectedAthlete.category}</ThemedText>
                  </View>
                </View>

                <View style={styles.contactButtons}>
                  {selectedAthlete.phone ? (
                    <Button
                      variant="outline"
                      onPress={() => handleCall(selectedAthlete.phone!)}
                      style={styles.contactButton}
                    >
                      <View style={styles.buttonContent}>
                        <Ionicons
                          name="call-outline"
                          size={18}
                          color={theme.primary}
                        />
                        <ThemedText style={{ color: theme.primary, marginLeft: Spacing.xs }}>
                          Chiama
                        </ThemedText>
                      </View>
                    </Button>
                  ) : null}
                  {selectedAthlete.email ? (
                    <Button
                      variant="outline"
                      onPress={() => handleEmail(selectedAthlete.email!)}
                      style={styles.contactButton}
                    >
                      <View style={styles.buttonContent}>
                        <Ionicons
                          name="mail-outline"
                          size={18}
                          color={theme.primary}
                        />
                        <ThemedText style={{ color: theme.primary, marginLeft: Spacing.xs }}>
                          Email
                        </ThemedText>
                      </View>
                    </Button>
                  ) : null}
                </View>

                <Button
                  variant="ghost"
                  onPress={() => setSelectedAthlete(null)}
                  fullWidth
                  style={styles.closeButton}
                >
                  Chiudi
                </Button>
              </>
            ) : null}
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
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  searchInput: {
    marginBottom: 0,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  athleteCard: {
    marginBottom: Spacing.sm,
  },
  athleteContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  athleteInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  athleteName: {
    fontWeight: "600",
    marginBottom: 2,
  },
  athleteMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#94A3B8",
    marginHorizontal: Spacing.sm,
  },
  emptyState: {
    marginTop: Spacing["5xl"],
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
  modalHeader: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  modalName: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  modalDetails: {
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  contactButtons: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  contactButton: {
    flex: 1,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  closeButton: {
    marginTop: Spacing.sm,
  },
});
