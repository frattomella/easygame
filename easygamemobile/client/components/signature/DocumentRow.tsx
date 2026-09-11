import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGCorner, EGGlass, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";
import {
  DOCUMENT_STATE_TINT,
  DOCUMENT_STATE_VARIANT,
  resolveDocumentIcon,
} from "@/lib/parent-documents";
import type { FamilyDocumentItem } from "@/services/api";

interface DocumentRowProps {
  item: FamilyDocumentItem;
  onUpload?: () => void;
  onDownload?: () => void;
  busy?: boolean;
}

/**
 * design-source `guidelines/component-specs.md` §C4 — la densita "riga".
 * Un'azione per riga (upload XOR download), mai entrambe: se serve
 * sostituire un file mantenendo il vecchio, quella e `DocumentCard`.
 *
 * v3.0 (`migration-v3.md` passo 4): l'azione non e piu un'icona sola dentro
 * la riga (il "box-inside-a-row" bandito) ma una barra etichettata sotto,
 * icona + parola — vale la regola "nessuna azione solo icona su documenti e
 * pagamenti" di CLAUDE.md §brand.
 */
export function DocumentRow({
  item,
  onUpload,
  onDownload,
  busy = false,
}: DocumentRowProps) {
  const tint = DOCUMENT_STATE_TINT[item.state];
  const canUpload = item.action === "upload" || item.action === "replace";
  const canDownload = !canUpload && Boolean(item.fileUrl);
  const actionLabel = canUpload
    ? item.action === "replace"
      ? "Sostituisci"
      : "Carica documento"
    : "Scarica";
  const actionIcon: keyof typeof Ionicons.glyphMap = canUpload
    ? "cloud-upload-outline"
    : "download-outline";
  const onAction = canUpload ? onUpload : canDownload ? onDownload : undefined;

  return (
    <GlassSurface tone="light" corner="control" style={styles.surface}>
      <View style={styles.row}>
        <IconChip
          name={resolveDocumentIcon(item.documentKind)}
          color={tint}
          size={40}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <SignatureText
            variant="body"
            tone="ink"
            numberOfLines={1}
            style={styles.title}
          >
            {item.title}
          </SignatureText>
          <SignatureText variant="small" tone="muted" numberOfLines={1}>
            {item.dueDate
              ? `Scade il ${formatShortDate(item.dueDate)}`
              : item.submittedAt
                ? `Caricato il ${formatShortDate(item.submittedAt)}`
                : "Data non disponibile"}
          </SignatureText>
        </View>
        <StatusPill
          label={item.stateLabel}
          variant={DOCUMENT_STATE_VARIANT[item.state]}
          small
        />
      </View>
      {onAction ? (
        <View style={styles.actionBar}>
          <Pressable
            onPress={busy ? undefined : onAction}
            disabled={busy}
            style={[styles.actionButton, busy && styles.actionButtonBusy]}
            accessibilityRole="button"
            accessibilityLabel={`${actionLabel} — ${item.title}`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name={actionIcon} size={16} color="#FFFFFF" />
                <SignatureText style={styles.actionLabel}>
                  {actionLabel}
                </SignatureText>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </GlassSurface>
  );
}

const formatShortDate = (iso: string) => {
  const parsed = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const styles = StyleSheet.create({
  surface: {
    marginBottom: Spacing.sm,
    minHeight: 64,
    borderColor: EGGlass.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
  },
  title: {
    fontWeight: "700",
  },
  actionBar: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  actionButton: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#1D4ED8",
    ...EGCorner.chip,
  },
  actionButtonBusy: {
    opacity: 0.7,
  },
  actionLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
