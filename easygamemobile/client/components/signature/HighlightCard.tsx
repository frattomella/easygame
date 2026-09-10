import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGradients, Spacing } from "@/constants/theme";
import { GlassCard } from "@/components/signature/GlassCard";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";
import { ActionButton } from "@/components/signature/ActionButton";

export interface HighlightCardPreviewRow {
  id: string;
  time: string;
  title: string;
  meta: string;
}

interface HighlightCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  /** Also the module colour for count/preview time (fixed product-wide: trainings blue, matches orange). */
  moduleColor: string;
  stripe: keyof typeof EGGradients;
  eyebrow: string;
  title: string;
  count: number;
  previewRows: HighlightCardPreviewRow[];
  emptyLabel: string;
  actionLabel: string;
  onAction: () => void;
  onPressRow?: (id: string) => void;
}

/**
 * design-source `guidelines/component-specs.md` §B6. At most two preview
 * rows, always — the action opens the full list, the card never scrolls
 * internally.
 */
export function HighlightCard({
  icon,
  moduleColor,
  stripe,
  eyebrow,
  title,
  count,
  previewRows,
  emptyLabel,
  actionLabel,
  onAction,
  onPressRow,
}: HighlightCardProps) {
  return (
    <GlassCard stripe={stripe}>
      <View style={styles.header}>
        <IconChip name={icon} color={moduleColor} size={36} />
        <View style={{ flex: 1 }}>
          <SignatureText variant="eyebrow" tone="faint">
            {eyebrow}
          </SignatureText>
          <SignatureText variant="h4" tone="ink">
            {title}
          </SignatureText>
        </View>
        <SignatureText style={[styles.count, { color: moduleColor }]}>
          {count}
        </SignatureText>
      </View>

      <View style={styles.body}>
        {previewRows.length === 0 ? (
          <SignatureText variant="small" tone="muted">
            {emptyLabel}
          </SignatureText>
        ) : (
          previewRows.slice(0, 2).map((row) => {
            const RowWrapper = onPressRow ? Pressable : View;
            return (
              <RowWrapper
                key={row.id}
                style={styles.previewRow}
                {...(onPressRow ? { onPress: () => onPressRow(row.id) } : null)}
              >
                <SignatureText
                  style={[styles.previewTime, { color: moduleColor }]}
                >
                  {row.time}
                </SignatureText>
                <View style={{ flex: 1 }}>
                  <SignatureText variant="small" style={styles.previewTitle}>
                    {row.title}
                  </SignatureText>
                  <SignatureText variant="caption" tone="muted">
                    {row.meta}
                  </SignatureText>
                </View>
              </RowWrapper>
            );
          })
        )}
      </View>

      <ActionButton
        variant="secondary"
        size="sm"
        fullWidth
        trailingIcon="arrow-forward"
        onPress={onAction}
        style={styles.action}
      >
        {actionLabel}
      </ActionButton>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  count: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  body: {
    marginTop: Spacing.md,
    gap: 6,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(11,26,58,0.04)",
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.08)",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  previewTime: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    minWidth: 44,
  },
  previewTitle: {
    fontWeight: "600",
  },
  action: {
    marginTop: Spacing.md,
  },
});
