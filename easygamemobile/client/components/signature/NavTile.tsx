import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGlass, EGShadow } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";

export interface NavTileItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** Contatore vivo (documenti richiesti, avvisi non letti…): un pallino numerato in alto a destra. Zero o assente = niente. */
  badge?: number;
  badgeColor?: string;
  onPress: () => void;
}

interface NavTileProps {
  item: NavTileItem;
}

/**
 * Il NavTile della Home (design `IA e Home` §1a, "Home as hub"): vetro,
 * angolo firmato 14/5, `IconChip` 34 tinto, etichetta 10.5/700, badge
 * numerato 16px in alto a destra. Otto per griglia 4×2 — "every section
 * the role's club has enabled, with live badge counts". Un permesso spento
 * = tile assente, mai grigia.
 */
export function NavTile({ item }: NavTileProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={item.onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={
        item.badge ? `${item.label}, ${item.badge} novita` : item.label
      }
      style={styles.pressable}
    >
      <GlassSurface
        tone="light"
        corner="control"
        style={[styles.tile, EGShadow.row, pressed ? styles.pressed : null]}
      >
        <View style={styles.inner}>
          <IconChip name={item.icon} color={item.color} size={34} />
          <SignatureText numberOfLines={1} style={styles.label}>
            {item.label}
          </SignatureText>
        </View>
        {item.badge ? (
          <View
            style={[
              styles.badge,
              { backgroundColor: item.badgeColor || "#1D4ED8" },
            ]}
          >
            <SignatureText style={styles.badgeLabel}>
              {item.badge > 99 ? "99+" : item.badge}
            </SignatureText>
          </View>
        ) : null}
      </GlassSurface>
    </Pressable>
  );
}

/** Griglia 4 colonne a passo 8px (prototipo `grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px`). */
export function NavTileGrid({ items }: { items: NavTileItem[] }) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <NavTile key={item.key} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pressable: {
    // 4 colonne: (larghezza - 3 gap) / 4 — espresso in percentuale al netto dei gap.
    width: "23.2%",
    flexGrow: 1,
  },
  tile: {
    borderColor: EGGlass.border,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  inner: {
    alignItems: "center",
    gap: 6,
    paddingTop: 10,
    paddingBottom: 9,
    paddingHorizontal: 6,
  },
  label: {
    color: "#0B1A3A",
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: {
    color: "#FFFFFF",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "800",
  },
});
