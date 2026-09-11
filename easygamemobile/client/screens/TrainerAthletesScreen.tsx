import React, { useCallback, useDeferredValue, useMemo, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  GlassRow,
  NumberTile,
  SecondaryScreenLayout,
  SectionLabel,
  SignatureInput,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useAuthContext } from "@/contexts/AuthContext";
import { getAthleteStatusLabel, getRoleLabel } from "@/lib/mobile-ui";
import { Athlete } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { AthletesStackParamList } from "@/navigation/AthletesStackNavigator";

/**
 * Atleti — composizione del prototipo v3 (`isTAthletes`): nessun hero, il
 * campo "Cerca atleta" direttamente nel cielo sotto l'AppBar, poi la rosa
 * raggruppata per categoria ("U13 Regionale · 12 atleti") con una riga di
 * vetro per atleta: `NumberTile` 44 navy, nome 15/700, ruolo 12/500 e la
 * pill di stato (quieta per "Attivo", solida ambra per infortunato /
 * squalificato — il tile resta navy in ogni stato). Stessa ricerca, stessi
 * dati di prima.
 */
export default function TrainerAthletesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AthletesStackParamList>>();
  const { assignedCategories, currentRole } = useAuthContext();
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

  /** Raggruppati per categoria, nell'ordine in cui compaiono; senza categoria in coda. */
  const groups = useMemo(() => {
    const map = new Map<string, Athlete[]>();
    filteredAthletes.forEach((athlete) => {
      const key = athlete.category || "Senza categoria";
      map.set(key, [...(map.get(key) || []), athlete]);
    });
    return Array.from(map.entries()).map(([name, items]) => ({
      name,
      items: [...items].sort((a, b) => a.number - b.number),
    }));
  }, [filteredAthletes]);

  const contextLabel =
    assignedCategories.length === 1
      ? assignedCategories[0].name
      : assignedCategories.length > 1
        ? `${assignedCategories.length} categorie`
        : "Rosa";

  return (
    <SecondaryScreenLayout
      title="Atleti"
      eyebrow={`${getRoleLabel(currentRole)} · ${contextLabel}`}
      onBack={false}
      skyHeight={230}
      contentGap={8}
      onNotifications={() => navigation.navigate("Notifications")}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      aboveContent={
        <View style={styles.searchWrap}>
          <SignatureInput
            placeholder="Cerca atleta"
            value={searchQuery}
            onChangeText={setSearchQuery}
            leftIcon="search-outline"
            rightIcon={searchQuery ? "close-circle" : undefined}
            rightIconLabel="Cancella ricerca"
            onRightIconPress={() => setSearchQuery("")}
            autoCorrect={false}
          />
        </View>
      }
    >
      {groups.length > 0 ? (
        groups.map((group) => (
          <View key={group.name} style={styles.group}>
            <SectionLabel
              label={`${group.name} · ${group.items.length} ${group.items.length === 1 ? "atleta" : "atleti"}`}
            />
            {group.items.map((athlete) => {
              const active = athlete.status === "attivo";
              return (
                <GlassRow
                  key={athlete.id}
                  leading={<NumberTile number={athlete.number} size={44} />}
                  title={athlete.name}
                  meta={athlete.position || "Ruolo da definire"}
                  trailing={
                    <StatusPill
                      label={getAthleteStatusLabel(athlete.status)}
                      tier={active ? "quiet" : "solid"}
                      tone={active ? "success" : "warning"}
                      small
                    />
                  }
                  chevron={false}
                  onPress={() =>
                    navigation.navigate("AthleteProfile", {
                      athleteId: athlete.id,
                    })
                  }
                  accessibilityLabel={`${athlete.name}, numero ${athlete.number}, ${getAthleteStatusLabel(athlete.status)}`}
                />
              );
            })}
          </View>
        ))
      ) : (
        <StateMessage
          kind="empty"
          title="Nessun atleta trovato"
          message={
            athletes.length === 0
              ? "Nessun atleta nelle tue categorie."
              : "Prova a cambiare ricerca."
          }
        />
      )}
    </SecondaryScreenLayout>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  group: {
    gap: 8,
  },
});
