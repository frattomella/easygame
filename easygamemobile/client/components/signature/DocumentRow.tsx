import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGlass, Spacing } from "@/constants/theme";
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
        {busy ? (
          <View style={styles.actionChip}>
            <ActivityIndicator size="small" color={tint} />
          </View>
        ) : canUpload && onUpload ? (
          <Pressable
            onPress={onUpload}
            style={styles.actionChip}
            accessibilityRole="button"
            accessibilityLabel={`Carica ${item.title}`}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#2563EB" />
          </Pressable>
        ) : canDownload && onDownload ? (
          <Pressable
            onPress={onDownload}
            style={styles.actionChip}
            accessibilityRole="button"
            accessibilityLabel={`Scarica ${item.title}`}
          >
            <Ionicons name="download-outline" size={18} color="#2563EB" />
          </Pressable>
        ) : null}
      </View>
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
  actionChip: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(37,99,235,0.1)",
  },
});
