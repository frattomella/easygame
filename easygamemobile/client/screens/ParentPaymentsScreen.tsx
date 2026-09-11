import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";

import {
  GlassCard,
  ParentPrimaryScreenLayout,
  PaymentCard,
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
 *
 * v3.0 (`migration-v3.md` passo 8): promosso da sezione dentro "Segreteria"
 * a tab proprio del Dock — `SecondaryScreenLayout` (back chevron, niente
 * ChildSwitcher/campanello) diventa `ParentPrimaryScreenLayout`, lo stesso
 * guscio delle altre quattro schermate primarie. Il rimando ai documenti
 * richiesti (`data.documents.required`, la stessa query gia in campo) e un
 * collegamento **di sezione**, non "questo pagamento e bloccato da quel
 * documento": quel legame causale specifico non esiste nel modello dati
 * (nessun pagamento porta un riferimento a un documento) — inventarlo
 * sarebbe mostrare un nesso che il backend non conferma.
 */
export default function ParentPaymentsScreen() {
  const navigation = useNavigation();
  const { children, selectedChildId, switching, selectChild } =
    useParentContext();
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
  const requiredDocuments = dashboardQuery.data?.documents.required.length || 0;
  const notificationsUnread = dashboardQuery.data?.notificationsUnread || 0;

  const openNotifications = () =>
    (
      navigation.getParent() as
        | { navigate: (...args: unknown[]) => void }
        | undefined
    )?.navigate("ParentServicesTab", {
      screen: "ParentBoard",
      params: { initialSection: "notifications" },
    });
  const openDocuments = () =>
    (
      navigation.getParent() as
        | { navigate: (...args: unknown[]) => void }
        | undefined
    )?.navigate("ParentServicesTab", { screen: "ParentDocuments" });

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
    <ParentPrimaryScreenLayout
      title="Pagamenti"
      eyebrow="Famiglia"
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      onNotifications={openNotifications}
      notificationCount={notificationsUnread}
      content={
        status === "loading" ? (
          <StateMessage
            kind="loading"
            tone="dark"
            title="Carico i pagamenti…"
          />
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
            title="Nessuna quota"
            message="Non ci sono quote registrate per questo figlio."
          />
        ) : (
          <>
            {requiredDocuments > 0 ? (
              <Pressable
                onPress={openDocuments}
                style={{ marginBottom: Spacing.sm }}
              >
                <GlassCard
                  eyebrow="Servizi"
                  title={`${requiredDocuments} document${requiredDocuments === 1 ? "o" : "i"} da caricare`}
                  description="Alcune pratiche potrebbero dipendere anche dai documenti in sospeso."
                />
              </Pressable>
            ) : null}
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
        )
      }
    />
  );
}
