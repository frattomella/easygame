import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGlass, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";
import {
  StatusPill,
  StatusPillVariant,
} from "@/components/signature/StatusPill";
import type { ConsentSubjectState } from "@/services/api";

interface ConsentRowProps {
  title: string;
  state: ConsentSubjectState;
  metaLabel: string;
  onPress: () => void;
}

const PILL: Record<
  ConsentSubjectState["status"],
  { label: string; variant: StatusPillVariant }
> = {
  accepted: { label: "Accettato", variant: "success" },
  revoked: { label: "Revocato", variant: "default" },
  rejected: { label: "Rifiutato", variant: "default" },
  missing: { label: "Da leggere", variant: "warning" },
};

/**
 * design-source `guidelines/component-specs.md` §C5, raffinato in v2.2:
 * "la riga non concede mai il consenso" — il tap naviga sempre a un
 * dettaglio (`role: "link"`, mai `"checkbox"`), che e dove vivono i
 * pulsanti "Accetto"/"Revoca". Nessun testo legale integrale non e
 * disponibile da nessuna API lato genitore (vedi KB) — il dettaglio lo
 * dichiara onestamente invece di fingere di mostrarlo.
 */
export function ConsentRow({
  title,
  state,
  metaLabel,
  onPress,
}: ConsentRowProps) {
  const pill =
    state.status === "missing" && state.required
      ? { label: "Richiesto", variant: "warning" as StatusPillVariant }
      : state.onOutdatedVersion
        ? {
            label: "Nuova versione da accettare",
            variant: "warning" as StatusPillVariant,
          }
        : PILL[state.status];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${pill.label}, ${metaLabel}`}
    >
      <GlassSurface tone="light" corner="control" style={styles.surface}>
        <View style={styles.row}>
          <IconChip name="shield-checkmark-outline" size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <SignatureText
              variant="body"
              tone="ink"
              numberOfLines={1}
              style={styles.title}
            >
              {title}
            </SignatureText>
            <SignatureText variant="small" tone="muted" numberOfLines={1}>
              {metaLabel}
            </SignatureText>
            {state.required && state.status !== "accepted" ? (
              <SignatureText variant="small" style={styles.requiredNote}>
                Necessario per alcune funzionalità del club
              </SignatureText>
            ) : null}
          </View>
          <StatusPill label={pill.label} variant={pill.variant} small />
          <Ionicons name="chevron-forward-outline" size={18} color="#94A3B8" />
        </View>
      </GlassSurface>
    </Pressable>
  );
}

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
  requiredNote: {
    color: "#B45309",
    fontWeight: "600",
  },
});
