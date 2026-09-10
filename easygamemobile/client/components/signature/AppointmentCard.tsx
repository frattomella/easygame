import React from "react";
import { StyleSheet, View } from "react-native";

import { Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";
import { ActionButton } from "@/components/signature/ActionButton";
import {
  APPOINTMENT_STATUS_STRIPE,
  APPOINTMENT_STATUS_VARIANT,
} from "@/lib/parent-appointments";
import { formatEventDateRail } from "@/lib/parent-calendar";
import type { ParentAppointment } from "@/services/api";

interface AppointmentCardProps {
  appointment: ParentAppointment;
  onReschedule?: () => void;
  onCancel?: () => void;
  busy?: boolean;
}

/**
 * design-source `guidelines/component-specs.md` §C7, raffinato in v2.2 —
 * adattato al contratto reale della faccia famiglia
 * (`toFamilyAppointment`): non porta un elenco di transizioni come la
 * faccia club, solo due mosse booleane (`can_reschedule`/`can_cancel`).
 * Zero azioni e un caso valido e comune (un appuntamento concluso non ha
 * riga azioni) — la card non lascia spazio vuoto in quel caso.
 */
export function AppointmentCard({
  appointment,
  onReschedule,
  onCancel,
  busy = false,
}: AppointmentCardProps) {
  const rail = formatEventDateRail(appointment.date);
  const cancelled =
    appointment.status === "cancelled_by_family" ||
    appointment.status === "cancelled_by_club";

  return (
    <GlassSurface
      elevated
      style={cancelled ? [styles.surface, styles.cancelled] : styles.surface}
    >
      <View style={styles.row}>
        <View style={styles.rail}>
          {rail ? (
            <>
              <SignatureText variant="eyebrow" tone="faint">
                {rail.dayName.toUpperCase()}
              </SignatureText>
              <SignatureText style={styles.dayNumber}>
                {rail.dayNumber}
              </SignatureText>
              <SignatureText variant="small" tone="faint">
                {rail.monthLabel}
              </SignatureText>
            </>
          ) : (
            <SignatureText variant="small" tone="faint">
              Da definire
            </SignatureText>
          )}
        </View>
        <View style={styles.divider} />
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <SignatureText
              variant="h4"
              tone="ink"
              style={{ flex: 1 }}
              numberOfLines={2}
            >
              {appointment.title || "Colloquio segreteria"}
            </SignatureText>
            <StatusPill
              label={appointment.status_label}
              variant={APPOINTMENT_STATUS_VARIANT[appointment.status]}
              small
            />
          </View>
          {appointment.time ? (
            <SignatureText variant="small" tone="muted">
              Ore {appointment.time}
            </SignatureText>
          ) : null}
          {appointment.decision_note ? (
            <SignatureText variant="small" tone="muted" style={styles.note}>
              {appointment.status === "cancelled_by_club"
                ? "Annullato dal club"
                : "Motivo"}
              : {appointment.decision_note}
            </SignatureText>
          ) : null}
          {appointment.notes ? (
            <SignatureText variant="small" tone="muted">
              {appointment.notes}
            </SignatureText>
          ) : null}

          {appointment.can_reschedule || appointment.can_cancel ? (
            <View style={styles.actions}>
              {appointment.can_reschedule && onReschedule ? (
                <ActionButton
                  variant="secondary"
                  size="sm"
                  loading={busy}
                  onPress={onReschedule}
                >
                  Riprogramma
                </ActionButton>
              ) : null}
              {appointment.can_cancel && onCancel ? (
                <ActionButton
                  variant="destructive"
                  size="sm"
                  loading={busy}
                  onPress={onCancel}
                >
                  Disdici
                </ActionButton>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.stripeWrap}>
        <GradientFill
          gradient={APPOINTMENT_STATUS_STRIPE[appointment.status]}
          style={styles.stripe}
        />
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    marginBottom: Spacing.md,
    overflow: "hidden",
  },
  cancelled: {
    borderStyle: "dashed",
    opacity: 0.82,
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
  row: {
    flexDirection: "row",
    paddingTop: 6,
  },
  rail: {
    width: 76,
    paddingLeft: Spacing.md,
    paddingVertical: Spacing.md,
    justifyContent: "center",
  },
  dayNumber: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.66,
    color: "#0B1A3A",
  },
  divider: {
    width: 1,
    backgroundColor: "rgba(11,26,58,0.08)",
    marginVertical: Spacing.md,
  },
  content: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  note: {
    fontStyle: "italic",
  },
  actions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
