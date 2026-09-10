import React, { useState } from "react";
import { View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";

import {
  PaymentCard,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  findFirstPayableParentPayment,
  formatParentCurrency,
  isPayableParentPayment,
  resolveCheckoutAvailability,
} from "@/lib/parent-payments";
import { formatItalianDate } from "@/lib/mobile-ui";
import { classifyFetchError, fetchErrorMessage } from "@/lib/fetch-error";
import { Spacing } from "@/constants/theme";
import type { ParentPayment } from "@/services/api";

/**
 * Pagamenti (WP7) — stessa lista e stesso "Paga ora" del Web, sullo stesso
 * `GET /api/parent-dashboard/[athleteId]` gia condiviso con Home/Calendario
 * (nessuna fetch in piu). Il checkout apre `/pay/<token>` (una pagina
 * EasyGame pubblica, non gia una sessione Stripe) nel browser di sistema —
 * la mobile app non contiene logica di pagamento autorevole, solo la
 * chiama e aspetta.
 */
export default function ParentPaymentsScreen() {
  const { selectedChildId } = useParentContext();
  const queryClient = useQueryClient();
  const [checkoutPaymentId, setCheckoutPaymentId] = useState<string | null>(
    null,
  );
  const [checkoutError, setCheckoutError] = useState("");

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(
    dashboardQuery,
    (data) => data.payments.items.length === 0,
  );

  const payments = dashboardQuery.data?.payments;
  const hasPayable = Boolean(
    payments && findFirstPayableParentPayment(payments.items),
  );
  const checkoutState = payments
    ? resolveCheckoutAvailability(payments.online, hasPayable)
    : null;

  const handlePayNow = async (payment: ParentPayment) => {
    if (!selectedChildId) return;
    setCheckoutPaymentId(payment.id);
    setCheckoutError("");
    try {
      const { url } = await mobileBackendStorage.checkoutParentPayment(
        selectedChildId,
        payment.id,
      );
      await WebBrowser.openBrowserAsync(url);
      // Il pagamento e' avvenuto (o no) fuori dall'app: non c'e modo di
      // saperlo senza ricaricare — mai un aggiornamento ottimistico.
      await queryClient.invalidateQueries({
        queryKey: ["parent-dashboard", selectedChildId],
      });
    } catch (error) {
      const kind = classifyFetchError(error);
      setCheckoutError(
        fetchErrorMessage(
          error,
          kind === "forbidden"
            ? "Accesso non consentito."
            : "Impossibile avviare il pagamento. Riprova.",
        ),
      );
    } finally {
      setCheckoutPaymentId(null);
    }
  };

  return (
    <SecondaryScreenLayout title="Pagamenti" eyebrow="Segreteria">
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico i pagamenti…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso ai pagamenti."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : status === "empty" ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Nessuna quota"
          message="Non ci sono quote registrate per questo figlio."
        />
      ) : (
        <>
          {checkoutError ? (
            <View style={{ marginBottom: Spacing.sm }}>
              <SignatureText
                variant="small"
                style={{ color: "#B91C1C", fontWeight: "600" }}
              >
                {checkoutError}
              </SignatureText>
            </View>
          ) : null}
          {checkoutState &&
          !checkoutState.available &&
          checkoutState.blocker ? (
            <View style={{ marginBottom: Spacing.sm }}>
              <SignatureText variant="small" tone="muted">
                {checkoutState.message}
              </SignatureText>
            </View>
          ) : null}
          {(payments?.items || []).map((payment) => (
            <PaymentCard
              key={payment.id}
              payment={payment}
              payNowLoading={checkoutPaymentId === payment.id}
              payNowDisabled={
                !checkoutState?.available || Boolean(checkoutPaymentId)
              }
              onPayNow={
                isPayableParentPayment(payment)
                  ? () => void handlePayNow(payment)
                  : undefined
              }
            />
          ))}

          {payments &&
          (payments.receipts.length > 0 || payments.invoices.length > 0) ? (
            <View style={{ marginTop: Spacing.lg, gap: Spacing.sm }}>
              <SignatureText variant="eyebrow" tone="faint">
                Ricevute e fatture
              </SignatureText>
              {[...payments.receipts, ...payments.invoices].map((doc) => (
                <View key={doc.id} style={{ marginBottom: Spacing.xs }}>
                  <SignatureText variant="small" tone="ink">
                    {doc.number} · {formatParentCurrency(doc.amount)}
                  </SignatureText>
                  <SignatureText variant="small" tone="muted">
                    {doc.issueDate
                      ? formatItalianDate(doc.issueDate)
                      : "Data non disponibile"}
                    {" · "}
                    {doc.statusLabel}
                  </SignatureText>
                </View>
              ))}
              <SignatureText variant="small" tone="faint">
                L&apos;apertura di ricevute e fatture non è ancora disponibile
                da mobile — richiedile in segreteria se ti servono in questo
                momento.
              </SignatureText>
            </View>
          ) : null}
        </>
      )}
      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
