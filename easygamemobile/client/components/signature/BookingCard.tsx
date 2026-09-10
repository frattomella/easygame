import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_VARIANT,
} from "@/lib/parent-structures";
import { formatParentCurrency } from "@/lib/parent-payments";
import { formatEventDateRail } from "@/lib/parent-calendar";
import type { ParentStructureBooking } from "@/services/api";

interface BookingCardProps {
  booking: ParentStructureBooking;
}

const timeOf = (iso: string) => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "--:--";
  return parsed.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * design-source `guidelines/component-specs.md` §C8, raffinato in v2.2:
 * "same grammar as AppointmentCard, on purpose". Sola lettura — non esiste
 * un annullamento lato Parent (ne il Web lo permette), quindi questa card
 * non porta una riga azioni.
 */
export function BookingCard({ booking }: BookingCardProps) {
  const rail = formatEventDateRail(booking.start.slice(0, 10));
  const cancelled = booking.status === "cancelled";

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
          ) : null}
        </View>
        <View style={styles.divider} />
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <SignatureText
              variant="h4"
              tone="ink"
              style={{ flex: 1 }}
              numberOfLines={1}
            >
              {booking.structureName}
            </SignatureText>
            <StatusPill
              label={BOOKING_STATUS_LABEL[booking.status]}
              variant={BOOKING_STATUS_VARIANT[booking.status]}
              small
            />
          </View>
          <View style={styles.metaRow}>
            <Ionicons
              name="location-outline"
              size={15}
              color="rgba(11,26,58,0.42)"
            />
            <SignatureText variant="small" tone="muted">
              {booking.fieldName}
            </SignatureText>
          </View>
          <View style={styles.metaRow}>
            <Ionicons
              name="time-outline"
              size={15}
              color="rgba(11,26,58,0.42)"
            />
            <SignatureText variant="small" tone="muted">
              {timeOf(booking.start)} – {timeOf(booking.end)}
            </SignatureText>
          </View>
          {typeof booking.amount === "number" ? (
            <SignatureText variant="small" style={styles.amount}>
              {formatParentCurrency(booking.amount)}
            </SignatureText>
          ) : null}
        </View>
      </View>
      <View style={styles.stripeWrap}>
        <GradientFill
          gradient={
            booking.status === "confirmed"
              ? "action"
              : booking.status === "cancelled"
                ? "neutral"
                : "warning"
          }
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  amount: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    color: "#0B1A3A",
    marginTop: 2,
  },
});
