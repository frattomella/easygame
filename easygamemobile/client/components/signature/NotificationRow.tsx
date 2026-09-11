import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GlassRow } from "@/components/signature/GlassRow";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";

export type NotificationCategory =
  | "operational"
  | "payment"
  | "document"
  | "priority"
  | "match";

const CATEGORY: Record<
  NotificationCategory,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  operational: { icon: "megaphone-outline", color: "#2563EB" },
  payment: { icon: "card-outline", color: "#EF4444" },
  document: { icon: "document-text-outline", color: "#10B981" },
  priority: { icon: "alert-circle-outline", color: "#F59E0B" },
  match: { icon: "football-outline", color: "#F97316" },
};

interface NotificationRowProps {
  title: string;
  body: string;
  timestampLabel: string;
  read: boolean;
  category?: NotificationCategory;
  onPress?: () => void;
}

/**
 * La riga di notifica del prototipo (`notifications`): pallino blu 8px in
 * testa (trasparente da letta), `IconChip` per categoria, titolo 15 (700
 * da non letta, 500 da letta), testo 13/500, "quando" 11/700 a destra.
 * Non letta = vetro forte; letta = bianco 55%. Nessun chevron: la riga
 * informa, e al piu segna come letta al tocco.
 */
export function NotificationRow({
  title,
  body,
  timestampLabel,
  read,
  category = "operational",
  onPress,
}: NotificationRowProps) {
  const tone = CATEGORY[category];

  return (
    <GlassRow
      leading={
        <View style={styles.leading}>
          <View style={[styles.dot, read ? styles.dotRead : null]} />
          <IconChip name={tone.icon} color={tone.color} size={40} />
        </View>
      }
      title={title}
      meta={body}
      emphasis={read ? "quiet" : "strong"}
      trailing={
        timestampLabel ? (
          <SignatureText style={styles.time}>{timestampLabel}</SignatureText>
        ) : undefined
      }
      onPress={onPress}
      chevron={false}
      accessibilityLabel={`${read ? "" : "Non letta. "}${title}. ${body}`}
    />
  );
}

const styles = StyleSheet.create({
  leading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#1D4ED8",
  },
  dotRead: {
    backgroundColor: "transparent",
  },
  time: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    flexShrink: 0,
  },
});
