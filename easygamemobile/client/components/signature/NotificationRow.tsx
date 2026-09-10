import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGlass, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";

export type NotificationCategory =
  | "operational"
  | "payment"
  | "document"
  | "priority";

const CATEGORY: Record<
  NotificationCategory,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> = {
  operational: { icon: "megaphone-outline", color: "#2563EB" },
  payment: { icon: "card-outline", color: "#F59E0B" },
  document: { icon: "document-text-outline", color: "#10B981" },
  priority: { icon: "alert-circle-outline", color: "#EF4444" },
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
 * design-source `guidelines/component-specs.md` §C6. Marking as read is a
 * side effect of opening (the caller's `onPress`), never a separate
 * control on the row — the unread/read difference is carried by weight and
 * surface, not by colour alone.
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
    <Pressable onPress={onPress} style={styles.wrap}>
      {!read ? (
        <View style={styles.unreadDot} />
      ) : (
        <View style={styles.dotSpacer} />
      )}
      <GlassSurface
        tone="light"
        corner="control"
        style={[
          styles.surface,
          !read ? styles.surfaceUnread : styles.surfaceRead,
        ]}
      >
        <View style={styles.row}>
          <IconChip name={tone.icon} color={tone.color} size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <SignatureText
              variant="body"
              tone="ink"
              numberOfLines={1}
              style={{ fontWeight: read ? "500" : "700" }}
            >
              {title}
            </SignatureText>
            <SignatureText variant="small" tone="muted" numberOfLines={2}>
              {body}
            </SignatureText>
          </View>
          <SignatureText variant="caption" tone="faint">
            {timestampLabel}
          </SignatureText>
        </View>
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563EB",
    marginTop: 28,
  },
  dotSpacer: {
    width: 8,
  },
  surface: {
    flex: 1,
    minHeight: 64,
    borderColor: EGGlass.border,
  },
  surfaceUnread: {
    backgroundColor: EGGlass.bgStrong,
  },
  surfaceRead: {
    opacity: 0.85,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
});
