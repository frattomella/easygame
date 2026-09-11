import React from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGShadow } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";

interface SummaryCardProps {
  icon?: keyof typeof Ionicons.glyphMap;
  eyebrow: string;
  title: string;
  /** Il numero grande a destra (22/800 tabulare) — "3", "1", "!", "→". */
  value?: string;
  valueMuted?: boolean;
  /** Corpo sotto la testata (Home Parent: la frase; Pagamenti: "da versare su…"). */
  children?: React.ReactNode;
  /** Sostituisce il numero a destra (es. l'anello di avanzamento di Pagamenti). */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * La scheda di vetro scuro in testa alle schermate secondarie (design `IA e
 * Home` §3c/3d) e alla Home Parent (§2b): navy 66% con bordo bianco 20%,
 * `IconChip` scuro 40, eyebrow bianco 75% + titolo 18/700 bianco, numero
 * grande a destra. Parte dentro il cielo e lo copre: "the surface covers
 * the transition, as on Home" (turno 6, §11).
 */
export function SummaryCard({
  icon,
  eyebrow,
  title,
  value,
  valueMuted = false,
  children,
  trailing,
  style,
}: SummaryCardProps) {
  return (
    <GlassSurface
      tone="dark"
      corner="card"
      style={[styles.surface, EGShadow.glass, style]}
    >
      <View style={styles.inner}>
        <View style={styles.head}>
          {icon ? <IconChip name={icon} tone="dark" size={40} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <SignatureText style={styles.eyebrow} numberOfLines={1}>
              {eyebrow}
            </SignatureText>
            <SignatureText style={styles.title} numberOfLines={2}>
              {title}
            </SignatureText>
          </View>
          {trailing ??
            (value ? (
              <SignatureText
                style={[styles.value, valueMuted ? { opacity: 0.5 } : null]}
              >
                {value}
              </SignatureText>
            ) : null)}
        </View>
        {children ? <View style={styles.body}>{children}</View> : null}
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderColor: "rgba(255,255,255,0.2)",
  },
  inner: {
    padding: 16,
    gap: 8,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  eyebrow: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 1.32,
    textTransform: "uppercase",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  value: {
    color: "#FFFFFF",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.66,
    fontVariant: ["tabular-nums"],
  },
  body: {
    gap: 8,
  },
});
