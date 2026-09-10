import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { EGGradients, EGMoney, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";
import {
  StatusPill,
  StatusPillVariant,
} from "@/components/signature/StatusPill";
import { ActionButton } from "@/components/signature/ActionButton";
import {
  formatParentCurrency,
  resolvePaymentCardState,
} from "@/lib/parent-payments";
import { formatItalianDate } from "@/lib/mobile-ui";
import type { ParentPayment } from "@/services/api";

interface PaymentCardProps {
  payment: ParentPayment;
  onPayNow?: () => void;
  payNowDisabled?: boolean;
  payNowLoading?: boolean;
}

const STRIPE: Record<string, keyof typeof EGGradients> = {
  due: "action",
  partially_paid: "warning",
  paid: "success",
  overdue: "destructive",
  cancelled: "neutral",
};

const PILL: Record<string, { label: string; variant: StatusPillVariant }> = {
  due: { label: "Da saldare", variant: "primary" },
  partially_paid: { label: "Parzialmente pagato", variant: "warning" },
  paid: { label: "Saldato", variant: "success" },
  overdue: { label: "Scaduto", variant: "destructive" },
  cancelled: { label: "Annullato", variant: "default" },
};

/**
 * design-source `guidelines/component-specs.md` §C3, raffinato in v2.2.
 * Lo stato e l'etichetta li scrive il server (`payment.status`/
 * `statusKey`, via `resolvePaymentCardState`) — questo componente non
 * confronta mai una data col proprio orologio.
 */
export function PaymentCard({
  payment,
  onPayNow,
  payNowDisabled = false,
  payNowLoading = false,
}: PaymentCardProps) {
  const state = resolvePaymentCardState(payment);
  const pill = PILL[state];
  const showProgress = state === "partially_paid";
  const progressRatio = showProgress
    ? Math.min(1, Math.max(0, payment.paidAmount / payment.amount))
    : 0;
  const daysOverdue =
    state === "overdue" && payment.dueDate
      ? Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(`${payment.dueDate}T00:00:00`).getTime()) /
              86400000,
          ),
        )
      : null;

  return (
    <GlassSurface
      elevated
      style={
        state === "overdue"
          ? [styles.surface, styles.overdueBorder]
          : styles.surface
      }
    >
      <View style={styles.stripeWrap}>
        <GradientFill gradient={STRIPE[state]} style={styles.stripe} />
      </View>
      <View style={styles.content}>
        <SignatureText variant="eyebrow" tone="faint">
          {payment.type || "Quota"}
        </SignatureText>
        <SignatureText variant="h4" tone="ink" style={styles.title}>
          {payment.description || "Pagamento"}
        </SignatureText>

        <SignatureText
          style={[
            styles.amount,
            state === "paid" ? { color: EGMoney.paid } : null,
            state === "overdue" ? { color: EGMoney.due } : null,
          ]}
        >
          {formatParentCurrency(payment.amount)}
        </SignatureText>

        {showProgress ? (
          <>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.max(4, progressRatio * 100)}%` },
                ]}
              />
            </View>
            <SignatureText variant="small" tone="muted">
              già versato {formatParentCurrency(payment.paidAmount)} di{" "}
              {formatParentCurrency(payment.amount)}
            </SignatureText>
          </>
        ) : null}

        <View style={styles.metaRow}>
          <Ionicons
            name="calendar-outline"
            size={15}
            color={state === "overdue" ? EGMoney.due : "rgba(11,26,58,0.42)"}
          />
          <SignatureText
            variant="small"
            style={
              state === "overdue"
                ? { color: EGMoney.due, fontWeight: "600" }
                : { color: "rgba(11,26,58,0.62)" }
            }
          >
            {payment.dueDate
              ? `Scadenza ${formatItalianDate(payment.dueDate)}`
              : "Nessuna scadenza"}
            {daysOverdue !== null && daysOverdue > 0
              ? ` · in ritardo da ${daysOverdue} giorni`
              : ""}
          </SignatureText>
        </View>

        <View style={styles.footerRow}>
          <StatusPill label={pill.label} variant={pill.variant} small />
          {(state === "due" ||
            state === "partially_paid" ||
            state === "overdue") &&
          onPayNow ? (
            <ActionButton
              variant="primary"
              size="sm"
              loading={payNowLoading}
              disabled={payNowDisabled}
              trailingIcon="arrow-forward"
              onPress={onPayNow}
            >
              {`Paga ora ${formatParentCurrency(payment.amount - payment.paidAmount)}`}
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
  overdueBorder: {
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
    gap: 6,
  },
  title: {
    marginBottom: 6,
  },
  amount: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.84,
    fontVariant: ["tabular-nums"],
    color: "#0B1A3A",
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(11,26,58,0.08)",
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: 4,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.sm,
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
});
