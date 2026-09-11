import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { EGGradients, EGMoney, EGShadow, Spacing } from "@/constants/theme";
import { GlassSurface } from "@/components/signature/GlassSurface";
import { GradientFill } from "@/components/signature/GradientFill";
import { SignatureText } from "@/components/signature/SignatureText";
import { StatusPill } from "@/components/signature/StatusPill";
import type {
  StatusPillTier,
  StatusPillTone,
} from "@/components/signature/StatusPill";
import { ActionBarButton } from "@/components/signature/ActionBarButton";
import {
  formatParentCurrency,
  resolvePaymentCardState,
} from "@/lib/parent-payments";
import {
  describeDueDate,
  resolvePaymentPlanIdentity,
  resolveRemainingAmount,
} from "@/lib/parent-payment-plan";
import type { ParentPayment } from "@/services/api";

interface PaymentCardProps {
  payment: ParentPayment;
  onPayNow?: () => void;
  payNowDisabled?: boolean;
  payNowLoading?: boolean;
  /** "Ricevuta" / "Fattura" compaiono solo quando il documento esiste (payload `payments.receipts`/`.invoices`). */
  onReceipt?: () => void;
  onInvoice?: () => void;
  documentLoading?: boolean;
  onDetail?: () => void;
}

const STRIPE: Record<string, keyof typeof EGGradients> = {
  due: "action",
  partially_paid: "warning",
  paid: "success",
  overdue: "destructive",
  cancelled: "neutral",
};

/** Quattro livelli del design (§5c): quiet per il saldato, solid per il dovuto, urgent per lo scaduto. */
const PILL: Record<
  string,
  { label: string; tier: StatusPillTier; tone: StatusPillTone }
> = {
  due: { label: "Da saldare", tier: "solid", tone: "info" },
  partially_paid: { label: "Parziale", tier: "solid", tone: "warning" },
  paid: { label: "Saldato", tier: "quiet", tone: "success" },
  overdue: { label: "Scaduto", tier: "urgent", tone: "danger" },
  cancelled: { label: "Annullato", tier: "quiet", tone: "neutral" },
};

/**
 * La scheda pagamento del prototipo v3 (`payments`): striscia modulo,
 * eyebrow del piano, titolo, importo 24/800 a destra (rosso se scaduto,
 * verde se saldato), pill + riga di scadenza, poi la barra azioni
 * etichettata — "Paga ora" su cio che e dovuto, "Ricevuta" e "Fattura" su
 * cio che e saldato, "Dettaglio" dove c'e altro da leggere. Lo stato e
 * l'etichetta li scrive il server (`resolvePaymentCardState`): questa
 * scheda non confronta mai una data col proprio orologio per decidere.
 */
export function PaymentCard({
  payment,
  onPayNow,
  payNowDisabled = false,
  payNowLoading = false,
  onReceipt,
  onInvoice,
  documentLoading = false,
  onDetail,
}: PaymentCardProps) {
  const state = resolvePaymentCardState(payment);
  const pill = PILL[state];
  const remaining = resolveRemainingAmount(payment);
  const due = describeDueDate(payment);
  const plan = resolvePaymentPlanIdentity(payment);
  const showPay =
    (state === "due" || state === "partially_paid" || state === "overdue") &&
    Boolean(onPayNow);
  const amountColor =
    state === "overdue"
      ? EGMoney.due
      : state === "paid"
        ? EGMoney.paid
        : "#0B1A3A";

  const inner = (
    <GlassSurface
      corner="card"
      style={[
        styles.surface,
        EGShadow.glass,
        state === "overdue" ? styles.overdueBorder : null,
      ]}
    >
      <View style={styles.stripeWrap}>
        <GradientFill gradient={STRIPE[state]} style={styles.stripe} />
      </View>
      <View style={styles.content}>
        <View style={styles.headRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <SignatureText style={styles.plan} numberOfLines={1}>
              {plan.name}
            </SignatureText>
            <SignatureText style={styles.title} numberOfLines={2}>
              {plan.instalmentLabel}
            </SignatureText>
          </View>
          <SignatureText style={[styles.amount, { color: amountColor }]}>
            {formatParentCurrency(payment.amount)}
          </SignatureText>
        </View>

        {state === "partially_paid" ? (
          <SignatureText style={styles.partial}>
            {`già versato ${formatParentCurrency(payment.paidAmount)} · restano ${formatParentCurrency(remaining)}`}
          </SignatureText>
        ) : null}

        <View style={styles.stateRow}>
          <StatusPill
            label={pill.label}
            tier={pill.tier}
            tone={pill.tone}
            small
          />
          <SignatureText
            style={[styles.due, due.urgent ? { color: EGMoney.due } : null]}
            numberOfLines={1}
          >
            {due.label}
          </SignatureText>
        </View>

        {showPay || onReceipt || onInvoice || onDetail ? (
          <View style={styles.actions}>
            {showPay ? (
              <ActionBarButton
                label={`Paga ora ${formatParentCurrency(remaining)}`}
                icon="card-outline"
                variant="primary"
                loading={payNowLoading}
                disabled={payNowDisabled}
                onPress={onPayNow}
              />
            ) : null}
            {onReceipt ? (
              <ActionBarButton
                label="Ricevuta"
                icon="receipt-outline"
                loading={documentLoading}
                onPress={onReceipt}
              />
            ) : null}
            {onInvoice ? (
              <ActionBarButton
                label="Fattura"
                icon="document-text-outline"
                loading={documentLoading}
                onPress={onInvoice}
              />
            ) : null}
            {onDetail ? (
              <ActionBarButton
                label="Dettaglio"
                icon="chevron-forward-outline"
                onPress={onDetail}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </GlassSurface>
  );

  if (!onDetail) return inner;
  return (
    <Pressable onPress={onDetail} accessibilityRole="button">
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {},
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
  },
  headRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  plan: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 1.32,
    textTransform: "uppercase",
  },
  title: {
    color: "#0B1A3A",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  amount: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.72,
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
  },
  partial: {
    marginTop: 6,
    color: "rgba(11,26,58,0.62)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  due: {
    flex: 1,
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
});
