import React, { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { EGGlass, EGShadow } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { SelectionRing } from "@/components/signature/SelectionRing";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";

interface AccountAccessCardProps {
  clubName: string;
  clubAvatarUrl?: string | null;
  roleLabel: string;
  detailLine?: string;
  /** `false`: ruolo non ancora su mobile — scheda al 60%, crest grigio, niente anello (design 5b, terza scheda). */
  supported?: boolean;
  /** La scheda che si sta aprendo: vetro forte, bordo blu, anello pieno con spunta (design 5b, prima scheda). */
  active?: boolean;
  onPress?: () => void;
}

const crestOf = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "?";

/**
 * La scheda di accesso dell'Account Hub (design `IA e Home` §5b,
 * prototipo `isAccounts`): crest tondo 44 (immagine o sigla bianca su
 * #1D4ED8), nome club 16/700, riga 12/500 (stagione · persona, o "1 figlio ·
 * Matteo"), pill di ruolo (solida per il ruolo in apertura, neutra per gli
 * altri), anello di scelta a destra. Il ruolo non supportato resta
 * visibile ma spento: dice perche, e non si tocca.
 */
export function AccountAccessCard({
  clubName,
  clubAvatarUrl,
  roleLabel,
  detailLine,
  supported = true,
  active = false,
  onPress,
}: AccountAccessCardProps) {
  const [pressed, setPressed] = useState(false);
  const interactive = supported && Boolean(onPress);

  const inner = (
    <GlassSurface
      tone={active ? "strong" : "light"}
      corner="card"
      style={[
        styles.card,
        active ? [styles.cardActive, EGShadow.glowPrimary] : EGShadow.row,
        !supported ? styles.unsupported : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.crest, !supported ? styles.crestOff : null]}>
          {clubAvatarUrl ? (
            <Image
              source={{ uri: clubAvatarUrl }}
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <SignatureText
              style={[
                styles.crestLabel,
                !supported ? styles.crestLabelOff : null,
              ]}
            >
              {crestOf(clubName)}
            </SignatureText>
          )}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SignatureText style={styles.club} numberOfLines={1}>
            {clubName}
          </SignatureText>
          <SignatureText style={styles.detail} numberOfLines={2}>
            {supported
              ? detailLine || "Accesso collegato al tuo account"
              : "Ruolo non ancora disponibile su mobile"}
          </SignatureText>
          <StatusPill
            label={roleLabel}
            tier={active ? "solid" : "quiet"}
            tone={active ? "info" : "neutral"}
            small
            style={{ marginTop: 8 }}
          />
        </View>
        {supported ? <SelectionRing on={active} check /> : null}
      </View>
    </GlassSurface>
  );

  if (!interactive) {
    return inner;
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={`${clubName}, ${roleLabel}`}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: EGGlass.border,
  },
  cardActive: {
    borderColor: "rgba(37,99,235,0.4)",
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  unsupported: {
    opacity: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  crest: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "#1D4ED8",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  crestOff: {
    backgroundColor: "rgba(11,26,58,0.1)",
  },
  crestLabel: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 44,
    fontWeight: "800",
  },
  crestLabelOff: {
    color: "rgba(11,26,58,0.5)",
  },
  club: {
    color: "#0B1A3A",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  detail: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    marginTop: 2,
  },
});
