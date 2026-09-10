import React from "react";
import { View } from "react-native";

import { Spacing } from "@/constants/theme";
import { ActionButton } from "@/components/signature/ActionButton";
import { GlassCard } from "@/components/signature/GlassCard";
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
 * "visual guidance only", portato in WP11). Tre stati, mai una quarta forma:
 * il dialogo di sistema **non parte mai da sola all'avvio** — segue sempre
 * questa card, cosi un rifiuto e informato — e un rifiuto non si ririchiede
 * mai in-app, non si assilla, non e un allarme rosso: e una scelta legittima.
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
  if (status === "granted") {
    return (
      <GlassCard>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.md,
          }}
        >
          <IconChip name="notifications" color="#22C55E" size={36} />
          <View style={{ flex: 1, gap: 4 }}>
            <SignatureText variant="h4" tone="ink">
              Notifiche
            </SignatureText>
            <SignatureText variant="small" tone="muted">
              Convocazioni, avvisi del club e promemoria sul dispositivo.
            </SignatureText>
          </View>
          <StatusPill label="ATTIVE" variant="success" small />
        </View>
      </GlassCard>
    );
  }

  if (status === "denied") {
    return (
      <GlassCard>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: Spacing.md,
          }}
        >
          <IconChip name="notifications-off" color="#F59E0B" size={36} />
          <View style={{ flex: 1, gap: 4 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: Spacing.sm,
              }}
            >
              <SignatureText variant="h4" tone="ink">
                Notifiche disattivate
              </SignatureText>
              <StatusPill label="DISATTIVATE" variant="warning" small />
            </View>
            <SignatureText variant="small" tone="muted">
              Non ricevi le convocazioni e gli avvisi del club sul dispositivo.
              Puoi riattivarle dalle impostazioni di sistema.
            </SignatureText>
            {onOpenSettings ? (
              <View style={{ marginTop: Spacing.xs }}>
                <ActionButton
                  variant="secondary"
                  size="sm"
                  onPress={onOpenSettings}
                >
                  Apri le impostazioni
                </ActionButton>
              </View>
            ) : null}
          </View>
        </View>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: Spacing.md,
        }}
      >
        <IconChip name="notifications-outline" color="#2563EB" size={36} />
        <View style={{ flex: 1, gap: 4 }}>
          <SignatureText variant="h4" tone="ink">
            Attiva le notifiche
          </SignatureText>
          <SignatureText variant="small" tone="muted">
            Ricevi le convocazioni e gli avvisi del club.
          </SignatureText>
          <View
            style={{
              flexDirection: "row",
              gap: Spacing.sm,
              marginTop: Spacing.xs,
            }}
          >
            <ActionButton size="sm" onPress={onEnable}>
              Attiva
            </ActionButton>
            {onDismiss ? (
              <ActionButton variant="ghost" size="sm" onPress={onDismiss}>
                Non ora
              </ActionButton>
            ) : null}
          </View>
        </View>
      </View>
    </GlassCard>
  );
}
