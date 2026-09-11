import React, { useState } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGlass, EGShadow, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";

interface GlassRowProps {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  /** Sostituisce l'`IconChip` di testa (es. un `NumberTile`). */
  leading?: React.ReactNode;
  title: string;
  meta?: string;
  /** Un pill di stato, un contatore, un importo — a destra del testo. */
  trailing?: React.ReactNode;
  /**
   * Regola v3 (`migration-v3.md` passo 4): una riga **o naviga** (chevron
   * semplice a destra) **o agisce** (barra azioni etichettata sotto) — mai
   * un mini-contenitore riquadrato. `onPress` senza `actions` mostra il
   * chevron; `chevron={false}` lo toglie (riga informativa toccabile).
   */
  onPress?: () => void;
  chevron?: boolean;
  /** La barra azioni etichettata sotto la riga (36px, icona + parola). */
  actions?: React.ReactNode;
  /** `strong`: vetro 88% (riga non letta, riga scelta). `quiet`: bianco 55% (voci in regola). */
  emphasis?: "default" | "strong" | "quiet";
  borderColor?: string;
  dimmed?: boolean;
  /** Raggio "card" (22/8) invece di "control" (14/5): le schede documento/pagamento del prototipo. */
  corner?: "control" | "card";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * La riga di vetro del prototipo (`GLASS_ROW`): vetro 74%, bordo bianco
 * 78%, ombra riga, angolo firmato 14/5, padding 12, altezza minima 64;
 * `IconChip` 40 a sinistra, titolo 15/700 e meta 12/500, poi ciò che
 * segue. È il mattone di hub, profilo, consensi, notifiche, contatti,
 * documenti e liste secondarie — una forma sola, non sei.
 */
export function GlassRow({
  icon,
  iconColor = "#2563EB",
  leading,
  title,
  meta,
  trailing,
  onPress,
  chevron,
  actions,
  emphasis = "default",
  borderColor,
  dimmed = false,
  corner = "control",
  style,
  accessibilityLabel,
}: GlassRowProps) {
  const [pressed, setPressed] = useState(false);
  const showChevron = chevron ?? (Boolean(onPress) && !actions);

  const inner = (
    <GlassSurface
      tone={emphasis === "default" ? "light" : emphasis}
      corner={corner}
      style={[
        styles.surface,
        EGShadow.row,
        emphasis === "quiet" ? styles.quiet : null,
        borderColor ? { borderColor } : null,
        dimmed ? styles.dimmed : null,
        pressed ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.row}>
        {leading ??
          (icon ? <IconChip name={icon} color={iconColor} size={40} /> : null)}
        <View style={styles.text}>
          <SignatureText numberOfLines={2} style={styles.title}>
            {title}
          </SignatureText>
          {meta ? (
            <SignatureText numberOfLines={2} style={styles.meta}>
              {meta}
            </SignatureText>
          ) : null}
        </View>
        {trailing}
        {showChevron ? (
          <Ionicons
            name="chevron-forward-outline"
            size={16}
            color="rgba(11,26,58,0.42)"
          />
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </GlassSurface>
  );

  if (!onPress) {
    return inner;
  }

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
    >
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    minHeight: 64,
    borderColor: EGGlass.border,
  },
  quiet: {
    borderColor: "rgba(255,255,255,0.6)",
  },
  dimmed: {
    opacity: 0.6,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#0B1A3A",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  meta: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    marginTop: -2,
  },
});
