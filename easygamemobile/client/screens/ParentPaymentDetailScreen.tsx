import React, { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  ActionBarButton,
  ActionButton,
  GlassCard,
  GlassSurface,
  GradientFill,
  InfoNote,
  MetaRow,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import type { StatusPillTier, StatusPillTone } from "@/components/signature";
import { PaymentSheet } from "@/components/parent/PaymentSheet";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { useParentPaymentActions } from "@/hooks/useParentPaymentActions";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  findFirstPayableParentPayment,
  formatParentCurrency,
  isPayableParentPayment,
  resolveCheckoutAvailability,
  resolvePaymentCardState,
} from "@/lib/parent-payments";
import {
  describeDueDate,
  findFiscalDocumentsForPayment,
  resolvePaymentPlanIdentity,
  resolvePaymentPlanInstalments,
  resolveRemainingAmount,
} from "@/lib/parent-payment-plan";
import { formatItalianDate } from "@/lib/mobile-ui";
import { EGGlass, EGGradients, EGMoney, EGShadow } from "@/constants/theme";
import type { ParentPayment } from "@/services/api";
import type { ParentPaymentsStackParamList } from "@/navigation/ParentPaymentsStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentPaymentsStackParamList,
  "ParentPaymentDetail"
>;
type Route = RouteProp<ParentPaymentsStackParamList, "ParentPaymentDetail">;

const STRIPE: Record<string, keyof typeof EGGradients> = {
  due: "action",
  partially_paid: "warning",
  paid: "success",
  overdue: "destructive",
  cancelled: "neutral",
};
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
 * Il dettaglio di una rata (prototipo `isPPayDetail`, design turno 6 §11):
 * la scheda dell'importo **parte dentro il cielo** e lo copre — striscia
 * modulo, eyebrow del piano, titolo, importo 34/800, pill + "Scaduta da N
 * giorni", filo, `MetaRow` (scadenza · atleta e categoria · riferimento);
 * poi "Piano rate" con le altre rate dello stesso piano e, se dovuto, "Paga
 * ora X" che apre il foglio di pagamento. Nessuna fetch dedicata: la rata
 * vive nella lista gia caricata.
 */
/** Un riferimento si mostra solo se e un numero leggibile ("FS-2027-0312"), non la chiave di generazione del piano ("enrollment_plan:<id>:…"). */
const isReadableReference = (reference: unknown): reference is string =>
  typeof reference === "string" &&
  reference.trim().length > 0 &&
  !reference.includes(":") &&
  reference.trim().length <= 40;

export default function ParentPaymentDetailScreen() {
  const navigation = useNavigation<Navigation>();
  const route = useRoute<Route>();
  const { paymentId } = route.params;
  const { selectedChildId, selectedChild } = useParentContext();
  const [sheetOpen, setSheetOpen] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(dashboardQuery);
  const actions = useParentPaymentActions(selectedChildId);

  const payments = dashboardQuery.data?.payments;
  const payment = useMemo(
    () => payments?.items.find((item) => item.id === paymentId) || null,
    [payments, paymentId],
  );
  const plan = useMemo(
    () =>
      payment && payments
        ? resolvePaymentPlanInstalments(payments.items, payment)
        : [],
    [payment, payments],
  );
  const checkoutState = payments
    ? resolveCheckoutAvailability(
        payments.online,
        Boolean(findFirstPayableParentPayment(payments.items)),
      )
    : null;
  const fiscalDocuments = payments
    ? [...payments.receipts, ...payments.invoices]
    : [];

  const state = payment ? resolvePaymentCardState(payment) : "due";
  const pill = PILL[state];
  const remaining = payment ? resolveRemainingAmount(payment) : 0;
  const due = payment ? describeDueDate(payment) : null;
  const planIdentity = payment ? resolvePaymentPlanIdentity(payment) : null;
  const docs = payment
    ? findFiscalDocumentsForPayment(payment, fiscalDocuments)
    : { receipt: null, invoice: null };
  const payable = payment ? isPayableParentPayment(payment) : false;

  return (
    <SecondaryScreenLayout
      title={planIdentity?.instalmentLabel || "Rata"}
      eyebrow={`Pagamenti · ${selectedChild?.name || "Atleta"}`}
      onBack={() => navigation.goBack()}
      skyHeight={250}
      club={
        selectedChild
          ? {
              name: selectedChild.clubName,
              avatarUrl: selectedChild.clubLogoUrl,
            }
          : undefined
      }
    >
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" />
      ) : status === "forbidden" ? (
        <StateMessage kind="forbidden" tone="dark" message={errorMessage} />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : !payment ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Rata non trovata"
          message="Questa rata non e piu disponibile."
        />
      ) : (
        <>
          <GlassSurface
            tone="strong"
            corner="card"
            style={[
              styles.amountCard,
              EGShadow.glass,
              state === "overdue" ? styles.amountCardOverdue : null,
            ]}
          >
            <View style={styles.stripeWrap}>
              <GradientFill gradient={STRIPE[state]} style={styles.stripe} />
            </View>
            <View style={styles.amountInner}>
              <SignatureText style={styles.plan} numberOfLines={1}>
                {planIdentity?.name}
              </SignatureText>
              <SignatureText style={styles.title}>
                {planIdentity?.instalmentLabel}
              </SignatureText>
              <SignatureText
                style={[
                  styles.amount,
                  state === "overdue" ? { color: EGMoney.due } : null,
                  state === "paid" ? { color: EGMoney.paid } : null,
                ]}
              >
                {formatParentCurrency(payable ? remaining : payment.amount)}
              </SignatureText>
              <View style={styles.stateRow}>
                <StatusPill
                  label={pill.label}
                  tier={pill.tier}
                  tone={pill.tone}
                  small
                />
                {due ? (
                  <SignatureText
                    style={[
                      styles.due,
                      due.urgent ? { color: EGMoney.due } : null,
                    ]}
                  >
                    {due.label}
                  </SignatureText>
                ) : null}
              </View>
              <View style={styles.divider} />
              <MetaRow icon="calendar-outline" style={{ marginTop: 0 }}>
                {payment.dueDate
                  ? `Scadenza ${formatItalianDate(payment.dueDate)}`
                  : "Nessuna scadenza"}
              </MetaRow>
              <MetaRow icon="people-outline">
                {[selectedChild?.name, selectedChild?.categoryName]
                  .filter(Boolean)
                  .join(" · ") || "Atleta"}
              </MetaRow>
              {isReadableReference(payment.reference) ? (
                <MetaRow icon="server-outline">{`Rif. ${payment.reference}`}</MetaRow>
              ) : null}
              {payment.method ? (
                <MetaRow icon="card-outline">{`Metodo: ${payment.method}`}</MetaRow>
              ) : null}
              {payment.notes ? (
                <MetaRow icon="chatbubble-outline">{payment.notes}</MetaRow>
              ) : null}
              {docs.receipt || docs.invoice ? (
                <View style={styles.docActions}>
                  {docs.receipt ? (
                    <ActionBarButton
                      label="Ricevuta"
                      icon="receipt-outline"
                      loading={actions.documentId === docs.receipt.id}
                      onPress={() => void actions.openDocument(docs.receipt!)}
                    />
                  ) : null}
                  {docs.invoice ? (
                    <ActionBarButton
                      label="Fattura"
                      icon="document-text-outline"
                      loading={actions.documentId === docs.invoice.id}
                      onPress={() => void actions.openDocument(docs.invoice!)}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          </GlassSurface>

          {actions.error ? (
            <InfoNote tone="danger">{actions.error}</InfoNote>
          ) : null}

          {plan.length > 1 ? (
            <GlassCard eyebrow="Piano rate">
              <View style={styles.planList}>
                {plan.map((instalment) => (
                  <InstalmentRow
                    key={instalment.id}
                    payment={instalment}
                    current={instalment.id === payment.id}
                  />
                ))}
              </View>
            </GlassCard>
          ) : null}

          {payable ? (
            <ActionButton
              fullWidth
              trailingIcon="arrow-forward"
              loading={actions.checkoutPaymentId === payment.id}
              onPress={() => setSheetOpen(true)}
            >
              {`Paga ora ${formatParentCurrency(remaining)}`}
            </ActionButton>
          ) : null}

          <PaymentSheet
            payment={sheetOpen ? payment : null}
            athleteName={selectedChild?.name || "Atleta"}
            checkout={checkoutState}
            loading={Boolean(actions.checkoutPaymentId)}
            onClose={() => setSheetOpen(false)}
            onConfirm={(target) => {
              setSheetOpen(false);
              void actions.payNow(target);
            }}
          />
        </>
      )}
    </SecondaryScreenLayout>
  );
}

function InstalmentRow({
  payment,
  current,
}: {
  payment: ParentPayment;
  current: boolean;
}) {
  const state = resolvePaymentCardState(payment);
  const pill = PILL[state];
  return (
    <View style={[styles.planRow, current ? styles.planRowCurrent : null]}>
      <SignatureText style={styles.planTitle} numberOfLines={1}>
        {resolvePaymentPlanIdentity(payment).instalmentLabel}
      </SignatureText>
      <SignatureText
        style={[
          styles.planAmount,
          state === "paid" ? { color: EGMoney.paid } : null,
          state === "overdue" ? { color: EGMoney.due } : null,
        ]}
      >
        {formatParentCurrency(payment.amount)}
      </SignatureText>
      <StatusPill label={pill.label} tier={pill.tier} tone={pill.tone} small />
    </View>
  );
}

const styles = StyleSheet.create({
  amountCard: {
    borderColor: EGGlass.border,
  },
  amountCardOverdue: {
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
  amountInner: {
    padding: 18,
    gap: 6,
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
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  amount: {
    color: "#0B1A3A",
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "800",
    letterSpacing: -1.02,
    fontVariant: ["tabular-nums"],
  },
  stateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  due: {
    flex: 1,
    color: "rgba(11,26,58,0.62)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: EGGlass.hairline,
    marginVertical: 4,
  },
  docActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  planList: {
    gap: 8,
  },
  planRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(11,26,58,0.04)",
    borderWidth: 1,
    borderColor: EGGlass.hairline,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  planRowCurrent: {
    borderColor: "rgba(37,99,235,0.35)",
  },
  planTitle: {
    flex: 1,
    color: "#0B1A3A",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  planAmount: {
    color: "#0B1A3A",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
});
