import React, { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import {
  GlassSurface,
  NumberTile,
  SecondaryScreenLayout,
  SectionHero,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  getAthletePositionCaption,
  getAthleteStatusLabel,
  getAthleteStatusVariant,
} from "@/lib/mobile-ui";
import { Athlete } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { EGInk, Spacing } from "@/constants/theme";
import { AthletesStackParamList } from "@/navigation/AthletesStackNavigator";

const STATUS_TILE_TONE: Record<string, "navy" | "success" | "match" | "muted"> =
  {
    attivo: "navy",
    infortunato: "muted",
    squalificato: "muted",
  };

/**
 * design-source `guidelines/trainer-migration.md` step 4 (WP10). Stessa
 * ricerca e stessi dati di prima; la riga usa la `NumberTile` 48px al posto
 * dell'`Avatar` a iniziali e la sigla di ruolo (`getAthletePositionCaption`)
 * invece del testo "Apri scheda atleta", che la freccia ora dice da sola.
 */
export default function TrainerAthletesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AthletesStackParamList>>();
  const { assignedCategories } = useAuthContext();
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const deferredQuery = useDeferredValue(searchQuery);

  const loadData = useCallback(async () => {
    const nextAthletes = await mobileBackendStorage.getAthletes();
    setAthletes(nextAthletes);
  }, []);

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

  const filteredAthletes = useMemo(() => {
    if (!deferredQuery.trim()) {
      return athletes;
    }

    const normalized = deferredQuery.trim().toLowerCase();
    return athletes.filter((athlete) =>
      [athlete.name, athlete.category, athlete.position, athlete.number]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [athletes, deferredQuery]);

  const availableCount = useMemo(
    () => athletes.filter((athlete) => athlete.status === "attivo").length,
    [athletes],
  );

  return (
    <SecondaryScreenLayout
      title="Atleti"
      onBack={false}
      skyHeight={360}
      onNotifications={() => navigation.navigate("Notifications")}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <SectionHero
        icon="people"
        eyebrow="ROSA SQUADRA"
        title="I tuoi atleti"
        subtitle={
          assignedCategories.length > 0
            ? assignedCategories.map((category) => category.name).join(" · ")
            : "Nessuna categoria assegnata"
        }
        chips={[
          { label: "in rosa", value: String(athletes.length) },
          { label: "disponibili", value: String(availableCount) },
        ]}
      />

      <View style={[styles.searchWrap, styles.sectionFirst]}>
        <GlassSurface tone="light" corner="control" style={styles.searchField}>
          <View style={styles.searchRow}>
            <Ionicons
              name="search-outline"
              size={18}
              color={EGInk.onLightFaint}
            />
            <TextInput
              placeholder="Cerca atleta, categoria o numero..."
              placeholderTextColor={EGInk.onLightFaint}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={styles.searchInput}
            />
            {searchQuery ? (
              <Pressable
                onPress={() => setSearchQuery("")}
                accessibilityRole="button"
                accessibilityLabel="Cancella ricerca"
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={EGInk.onLightFaint}
                />
              </Pressable>
            ) : null}
          </View>
        </GlassSurface>
      </View>

      <View style={styles.list}>
        {filteredAthletes.length > 0 ? (
          filteredAthletes.map((athlete) => (
            <Pressable
              key={athlete.id}
              onPress={() =>
                navigation.navigate("AthleteProfile", {
                  athleteId: athlete.id,
                })
              }
            >
              <GlassSurface
                tone="light"
                corner="control"
                style={styles.athleteSurface}
              >
                <View style={styles.athleteRow}>
                  <NumberTile
                    number={athlete.number}
                    size={48}
                    caption={getAthletePositionCaption(athlete.position)}
                    tone={
                      athlete.status === "attivo"
                        ? STATUS_TILE_TONE.attivo
                        : "muted"
                    }
                  />
                  <View style={styles.athleteInfo}>
                    <SignatureText
                      variant="body"
                      tone="ink"
                      style={styles.athleteName}
                      numberOfLines={1}
                    >
                      {athlete.name}
                    </SignatureText>
                    <SignatureText
                      variant="small"
                      tone="muted"
                      numberOfLines={1}
                    >
                      {athlete.category} ·{" "}
                      {athlete.position || "Ruolo da definire"}
                    </SignatureText>
                  </View>
                  <StatusPill
                    label={getAthleteStatusLabel(athlete.status)}
                    variant={getAthleteStatusVariant(athlete.status)}
                    small
                  />
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={EGInk.onLightFaint}
                  />
                </View>
              </GlassSurface>
            </Pressable>
          ))
        ) : (
          <StateMessage
            kind="empty"
            title="Nessun atleta trovato"
            message="Prova a cambiare ricerca."
          />
        )}
      </View>
    </SecondaryScreenLayout>
  );
}

const styles = StyleSheet.create({
  sectionFirst: {
    marginTop: -32,
  },
  searchWrap: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  searchField: {
    minHeight: 52,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: EGInk.onLight,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  athleteSurface: {
    minHeight: 64,
  },
  athleteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  athleteInfo: {
    flex: 1,
    gap: 2,
  },
  athleteName: {
    fontWeight: "700",
  },
});
