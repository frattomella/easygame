import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Spacing } from "@/constants/theme";
import { ActionBarButton } from "@/components/signature/ActionBarButton";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { IconChip } from "@/components/signature/IconChip";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";

export type NotificationPermissionStatus =
  | "not_requested"
  | "granted"
  | "denied";

interface NotificationPermissionCardProps {
  status: NotificationPermissionStatus;
  onEnable?: () => void;
  onDismiss?: () => void;
  onOpenSettings?: () => void;
}

/**
 * design-source `guidelines/component-specs.md` §G1 (EGDS v2.3.0, Parte G —
 * "visual guidance only", portato in WP11) nella grammatica di riga del
 * prototipo v3 (turno 6 §1-3): chip icona 36, titolo su una riga con la
 * pillola a destra, corpo, barra di azioni etichettate da 36px. Tre stati,
 * mai una quarta forma: il dialogo di sistema **non parte mai da sola
 * all'avvio** — segue sempre questa card, cosi un rifiuto e informato — e
 * un rifiuto non si ririchiede mai in-app, non si assilla, non e un allarme
 * rosso: e una scelta legittima (pillola outline/warning, non urgent).
 *
 * **Semplificazione dichiarata**: lo stato "Allowed" elenca le categorie con
 * le loro Icon Chip nello spec; questa app non ha preferenze di notifica per
 * categoria (solo un token per dispositivo, nessuna granularita lato
 * server), quindi la riga e una sola frase descrittiva invece di un elenco
 * inventato.
 */
export function NotificationPermissionCard({
  status,
  onEnable,
  onDismiss,
  onOpenSettings,
}: NotificationPermissionCardProps) {
  const look = LOOK[status];
  return (
    <GlassSurface corner="card" style={styles.card}>
      <View style={styles.head}>
        <IconChip name={look.icon} color={look.color} size={36} />
        <View style={styles.text}>
          <View style={styles.titleRow}>
            <SignatureText style={styles.title} numberOfLines={1}>
              {look.title}
            </SignatureText>
            <StatusPill
              label={look.pill}
              tier={look.tier}
              tone={look.tone}
              small
            />
          </View>
          <SignatureText variant="small" tone="muted">
            {look.body}
          </SignatureText>
        </View>
      </View>
      {status === "denied" && onOpenSettings ? (
        <View style={styles.actions}>
          <ActionBarButton
            label="Apri le impostazioni"
            icon="settings-outline"
            onPress={onOpenSettings}
          />
        </View>
      ) : null}
      {status === "not_requested" ? (
        <View style={styles.actions}>
          <ActionBarButton
            label="Attiva"
            icon="notifications-outline"
            variant="primary"
            onPress={onEnable}
          />
          {onDismiss ? (
            <ActionBarButton
              label="Non ora"
              icon="time-outline"
              onPress={onDismiss}
            />
          ) : null}
        </View>
      ) : null}
    </GlassSurface>
  );
}

const LOOK: Record<
  NotificationPermissionStatus,
  {
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    title: string;
    body: string;
    pill: string;
    tier: "quiet" | "outline" | "solid";
    tone: "success" | "warning" | "info";
  }
> = {
  granted: {
    icon: "notifications",
    color: "#22C55E",
    title: "Notifiche",
    body: "Convocazioni, avvisi del club e promemoria sul dispositivo.",
    pill: "Attive",
    tier: "quiet",
    tone: "success",
  },
  denied: {
    icon: "notifications-off",
    color: "#F59E0B",
    title: "Notifiche",
    body: "Non ricevi le convocazioni e gli avvisi del club sul dispositivo. Puoi riattivarle dalle impostazioni di sistema.",
    pill: "Disattivate",
    tier: "outline",
    tone: "warning",
  },
  not_requested: {
    icon: "notifications-outline",
    color: "#2563EB",
    title: "Attiva le notifiche",
    body: "Ricevi le convocazioni e gli avvisi del club.",
    pill: "Da attivare",
    tier: "solid",
    tone: "info",
  },
};

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: 12,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: "#0B1A3A",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
});
