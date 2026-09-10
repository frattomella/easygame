import React from "react";
import { StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";
import {
  StatusPill,
  StatusPillVariant,
} from "@/components/signature/StatusPill";
import { ActionButton } from "@/components/signature/ActionButton";

interface EnrollmentStatusCardProps {
  eyebrow: string;
  title: string;
  supportingLine?: string;
  pill: { label: string; variant: StatusPillVariant };
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * design-source `guidelines/component-specs.md` §C9, semplificato
 * rispetto allo spec: il rail a passi (Domanda/Documenti/Pagamento/Attiva)
 * presuppone un flusso granulare che `data.enrollment` non porta — il
 * contratto reale espone solo `status: "enrolled"|"not_enrolled"` piu un
 * piano e un saldo, non uno stato per fase. Il progresso per-fase esiste
 * solo a livello di **pratica** (`GET /api/v1/family/enrollment-requests`,
 * stato `sent|in_review|approved|rejected`), mostrato altrove come righe
 * separate — mai un rail costruito su dati che non ci sono (CLAUDE.md §11.8:
 * "la forma piu comune [di funzione incompleta] non e il codice mancante,
 * e il codice irraggiungibile").
 */
export function EnrollmentStatusCard({
  eyebrow,
  title,
  supportingLine,
  pill,
  actionLabel,
  onAction,
}: EnrollmentStatusCardProps) {
  return (
    <GlassSurface tone="dark" elevated style={styles.surface}>
      <View style={styles.header}>
        <IconChip name="clipboard-outline" tone="dark" size={40} />
        <View style={{ flex: 1 }}>
          <SignatureText variant="eyebrow" tone="onDarkMuted">
            {eyebrow}
          </SignatureText>
          <SignatureText variant="h3" tone="onDark">
            {title}
          </SignatureText>
        </View>
      </View>
      <StatusPill
        label={pill.label}
        variant={pill.variant}
        style={styles.pill}
      />
      {supportingLine ? (
        <SignatureText
          variant="small"
          tone="onDarkMuted"
          style={styles.supporting}
        >
          {supportingLine}
        </SignatureText>
      ) : null}
      {actionLabel && onAction ? (
        <ActionButton
          variant="onDark"
          size="sm"
          trailingIcon="arrow-forward"
          onPress={onAction}
          style={styles.action}
        >
          {actionLabel}
        </ActionButton>
      ) : null}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    padding: 20,
    marginBottom: Spacing.md,
    borderColor: "rgba(255,255,255,0.14)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  pill: {
    marginBottom: Spacing.sm,
  },
  supporting: {
    marginBottom: Spacing.sm,
  },
  action: {
    marginTop: Spacing.xs,
  },
});
