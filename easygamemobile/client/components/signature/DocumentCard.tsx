import React from "react";
import { StyleSheet, View } from "react-native";

import { EGGradients, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { GradientFill } from "@/components/signature/GradientFill";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";
import { ActionButton } from "@/components/signature/ActionButton";
import {
  DOCUMENT_STATE_TINT,
  DOCUMENT_STATE_VARIANT,
  resolveDocumentIcon,
} from "@/lib/parent-documents";
import type { FamilyDocumentItem } from "@/services/api";

interface DocumentCardProps {
  item: FamilyDocumentItem;
  onUpload?: () => void;
  onDownload?: () => void;
  uploading?: boolean;
}

const STRIPE: Record<FamilyDocumentItem["state"], keyof typeof EGGradients> = {
  approved: "success",
  missing: "neutral",
  overdue: "destructive",
  under_review: "action",
  expired: "destructive",
  rejected: "destructive",
};

/**
 * design-source `guidelines/component-specs.md` §C4 — la densita "scheda":
 * usata solo quando il documento porta una nota di requisito da leggere
 * (spec v2.2: "the client never recomputes an expiry it was given" — qui
 * come per `DocumentRow`, lo stato e sempre quello del server).
 */
export function DocumentCard({
  item,
  onUpload,
  onDownload,
  uploading = false,
}: DocumentCardProps) {
  const tint = DOCUMENT_STATE_TINT[item.state];
  const canUpload = item.action === "upload" || item.action === "replace";
  const canDownload = !canUpload && Boolean(item.fileUrl);

  return (
    <GlassSurface
      elevated
      style={
        item.state === "expired" || item.state === "overdue"
          ? [styles.surface, styles.expiredBorder]
          : styles.surface
      }
    >
      <View style={styles.stripeWrap}>
        <GradientFill gradient={STRIPE[item.state]} style={styles.stripe} />
      </View>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <IconChip
            name={resolveDocumentIcon(item.documentKind)}
            color={tint}
            size={40}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <SignatureText variant="h4" tone="ink" numberOfLines={1}>
              {item.title}
            </SignatureText>
            <SignatureText variant="small" tone="muted">
              {item.documentKindLabel}
            </SignatureText>
          </View>
          <StatusPill
            label={item.stateLabel}
            variant={DOCUMENT_STATE_VARIANT[item.state]}
            small
          />
        </View>

        {item.description ? (
          <View style={styles.noteBox}>
            <SignatureText variant="small" tone="muted">
              {item.description}
            </SignatureText>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {canUpload && onUpload ? (
            <ActionButton
              variant="primary"
              size="sm"
              loading={uploading}
              icon="cloud-upload-outline"
              onPress={onUpload}
            >
              {item.actionLabel || "Carica"}
            </ActionButton>
          ) : null}
          {canDownload && onDownload ? (
            <ActionButton
              variant="secondary"
              size="sm"
              icon="download-outline"
              onPress={onDownload}
            >
              Scarica
            </ActionButton>
          ) : null}
        </View>
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    marginBottom: Spacing.md,
  },
  expiredBorder: {
    borderColor: "rgba(239,68,68,0.35)",
  },
  stripeWrap: {
    position: "absolute",
    top: 0,
    left: 22,
    right: 22,
    height: 3,
  },
  stripe: {
    flex: 1,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  noteBox: {
    backgroundColor: "rgba(11,26,58,0.04)",
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.08)",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 10,
    padding: Spacing.sm,
  },
  actionsRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
});
