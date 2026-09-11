import React from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Wordmark } from "@/components/signature/BrandMark";
import { SignatureText } from "@/components/signature/SignatureText";

export interface BrandLineClub {
  name: string;
  avatarUrl?: string | null;
}

interface BrandLineProps {
  /** Il club attivo: crest (immagine o sigla) + nome nel chip a destra. Senza club il chip non compare. */
  club?: BrandLineClub | null;
  /**
   * Il chip del club "riporta sempre ad Accessi e club" (prototipo v3,
   * pannello "Contesto"): chi lo passa apre l'Account Hub. Senza handler
   * il chip e solo informativo (nessun chevron).
   */
  onPressClub?: () => void;
}

const crestOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * La riga di marchio in testa a ogni schermata operativa (design v3,
 * correzione 2 di `EasyGame Mobile - IA e Home` §2a/2b e prototipo):
 * "Product brand left, club brand right — *EasyGame per Fortitudo
 * Scauri*". La scritta EasyGame a sinistra (15px), il chip del club a
 * destra (crest 24px su bianco, nome 12/700, chevron), un filo bianco al
 * 12% sotto. Tre righe portano quattro fatti senza una barra: prodotto,
 * club, poi `AppBar` con ruolo/contesto e titolo.
 */
export function BrandLine({ club, onPressClub }: BrandLineProps) {
  const chip = club ? (
    <View style={styles.chip}>
      <View style={styles.crest}>
        {club.avatarUrl ? (
          <Image
            source={{ uri: club.avatarUrl }}
            style={styles.crestImage}
            accessibilityLabel=""
          />
        ) : (
          <SignatureText style={styles.crestLabel}>
            {crestOf(club.name)}
          </SignatureText>
        )}
      </View>
      <SignatureText style={styles.clubName} numberOfLines={1}>
        {club.name}
      </SignatureText>
      {onPressClub ? (
        <Ionicons
          name="chevron-down-outline"
          size={14}
          color="rgba(255,255,255,0.7)"
        />
      ) : null}
    </View>
  ) : null;

  return (
    <View>
      <View style={styles.row}>
        <Wordmark height={15} />
        <View style={{ flex: 1 }} />
        {chip && onPressClub ? (
          <Pressable
            onPress={onPressClub}
            accessibilityRole="button"
            accessibilityLabel={`Club attivo: ${club?.name}. Cambia accesso`}
            hitSlop={6}
          >
            {chip}
          </Pressable>
        ) : (
          chip
        )}
      </View>
      <View style={styles.hairline} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 32,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    maxWidth: 220,
  },
  crest: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  crestImage: {
    width: "100%",
    height: "100%",
  },
  crestLabel: {
    color: "#1D4ED8",
    fontSize: 9.5,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  clubName: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    flexShrink: 1,
  },
  hairline: {
    height: 1,
    marginHorizontal: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});
