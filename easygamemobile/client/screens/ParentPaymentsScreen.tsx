import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Svg, { Circle } from "react-native-svg";

import {
  InfoNote,
  ParentPrimaryScreenLayout,
  PaymentCard,
  SectionLabel,
  SignatureText,
  StateMessage,
  SummaryCard,
} from "@/components/signature";
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
import { findFiscalDocumentsForPayment } from "@/lib/parent-payment-plan";
import { describeSportSeason } from "@/lib/mobile-ui";
import type { ParentPayment } from "@/services/api";
import type { ParentPaymentsStackParamList } from "@/navigation/ParentPaymentsStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentPaymentsStackParamList,
  "ParentPayments"
>;

/**
 * Pagamenti — il tab del prototipo v3 (`isPPayments`): la scheda scura
 * "Saldo stagione" con l'anello di avanzamento, poi una `PaymentCard` per
 * rata con la barra azioni (Paga ora · Ricevuta · Fattura · Dettaglio).
 * Stesso `GET /api/parent-dashboard/[athleteId]` di Home e Calendario; il
 * checkout e i documenti fiscali passano da `useParentPaymentActions`, la
 * stessa implementazione del dettaglio. Il rimando ai documenti richiesti e
 * un collegamento **di sezione**, non "questo pagamento e bloccato da quel
 * documento": quel legame non esiste nel modello dati.
 */
export default function ParentPaymentsScreen() {
  const navigation = useNavigation<Navigation>();
  const { children, selectedChildId, selectedChild, switching, selectChild } =
    useParentContext();
  const [sheetPayment, setSheetPayment] = useState<ParentPayment | null>(null);

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
  const actions = useParentPaymentActions(selectedChildId);

  const payments = dashboardQuery.data?.payments;
  const hasPayable = Boolean(
    payments && findFirstPayableParentPayment(payments.items),
  );
  const checkoutState = payments
    ? resolveCheckoutAvailability(payments.online, hasPayable)
    : null;
  const requiredDocuments = dashboardQuery.data?.documents.required.length || 0;
  const notificationsUnread = dashboardQuery.data?.notificationsUnread || 0;
  const fiscalDocuments = payments
    ? [...payments.receipts, ...payments.invoices]
    : [];

  const tabs = navigation.getParent() as
    | { navigate: (...args: unknown[]) => void }
    | undefined;
  const openNotifications = () =>
    tabs?.navigate("ParentServicesTab", {
      screen: "ParentBoard",
      params: { initialSection: "notifications" },
      initial: false,
    });
  const openDocuments = () =>
    tabs?.navigate("ParentServicesTab", { screen: "ParentDocuments" });

  const totalDue = payments?.totalDue || 0;
  const totalPaid = payments?.totalPaid || 0;
  const remaining = payments?.remaining ?? Math.max(0, totalDue - totalPaid);
  const ratio =
    totalDue > 0 ? Math.min(1, Math.max(0, totalPaid / totalDue)) : 0;

  return (
    <ParentPrimaryScreenLayout
      title="Pagamenti"
      eyebrow={`Genitore · ${describeSportSeason()}`}
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      onNotifications={openNotifications}
      notificationCount={notificationsUnread}
      skyHeight={250}
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
            tone="dark"
            title="Nessuna quota"
            message="Non ci sono quote registrate per questo figlio."
          />
        ) : (
          <>
            <SummaryCard
              eyebrow="Saldo stagione"
              title={formatParentCurrency(remaining)}
              trailing={<ProgressRing ratio={ratio} />}
            >
              <SignatureText style={styles.summaryBody}>
                {totalDue > 0
                  ? `da versare su ${formatParentCurrency(totalDue)}`
                  : "nessuna quota dovuta"}
              </SignatureText>
            </SummaryCard>

            {actions.error ? (
              <InfoNote tone="danger">{actions.error}</InfoNote>
            ) : null}
            {checkoutState &&
            !checkoutState.available &&
            checkoutState.blocker &&
            checkoutState.blocker !== "nothing_due" ? (
              <InfoNote>{checkoutState.message}</InfoNote>
            ) : null}
            {requiredDocuments > 0 ? (
              <InfoNote>
                {`${requiredDocuments} ${requiredDocuments === 1 ? "documento da caricare" : "documenti da caricare"} in Servizi · Documenti. `}
                <SignatureText style={styles.link} onPress={openDocuments}>
                  Apri
                </SignatureText>
              </InfoNote>
            ) : null}

            <SectionLabel
              label="Quote e rate"
              trailing={String(payments?.items.length || 0)}
              style={{ paddingTop: 4 }}
            />
            {(payments?.items || []).map((payment) => {
              const docs = findFiscalDocumentsForPayment(
                payment,
                fiscalDocuments,
              );
              const settled = resolvePaymentCardState(payment) === "paid";
              return (
                <PaymentCard
                  key={payment.id}
                  payment={payment}
                  payNowLoading={actions.checkoutPaymentId === payment.id}
                  payNowDisabled={Boolean(actions.checkoutPaymentId)}
                  onPayNow={
                    isPayableParentPayment(payment)
                      ? () => setSheetPayment(payment)
                      : undefined
                  }
                  onReceipt={
                    settled && docs.receipt
                      ? () => void actions.openDocument(docs.receipt!)
                      : undefined
                  }
                  onInvoice={
                    docs.invoice
                      ? () => void actions.openDocument(docs.invoice!)
                      : undefined
                  }
                  documentLoading={
                    actions.documentId === docs.receipt?.id ||
                    actions.documentId === docs.invoice?.id
                  }
                  onDetail={() =>
                    navigation.navigate("ParentPaymentDetail", {
                      paymentId: payment.id,
                    })
                  }
                />
              );
            })}

            {fiscalDocuments.length > 0 ? (
              <>
                <SectionLabel
                  label="Ricevute e fatture"
                  trailing={String(fiscalDocuments.length)}
                  style={{ paddingTop: 6 }}
                />
                <View style={styles.fiscalList}>
                  {fiscalDocuments.map((document) => (
                    <View key={document.id} style={styles.fiscalRow}>
                      <SignatureText
                        style={styles.fiscalTitle}
                        numberOfLines={1}
                      >
                        {`${document.kind === "invoice" ? "Fattura" : "Ricevuta"} ${document.number}`}
                      </SignatureText>
                      <SignatureText
                        style={styles.fiscalMeta}
                        numberOfLines={1}
                      >
                        {`${formatParentCurrency(document.amount)} · ${document.statusLabel}`}
                      </SignatureText>
                      <SignatureText
                        style={styles.link}
                        onPress={() => void actions.openDocument(document)}
                      >
                        Apri
                      </SignatureText>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <PaymentSheet
              payment={sheetPayment}
              athleteName={selectedChild?.name || "Atleta"}
              checkout={checkoutState}
              loading={Boolean(actions.checkoutPaymentId)}
              onClose={() => setSheetPayment(null)}
              onConfirm={(payment) => {
                setSheetPayment(null);
                void actions.payNow(payment);
              }}
            />
          </>
        )
      }
    />
  );
}

/** L'anello di avanzamento del prototipo: 64px, traccia bianca 16%, arco verde (#34D399) per la quota gia versata, percentuale al centro. */
function ProgressRing({ ratio }: { ratio: number }) {
  const size = 64;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#34D399"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.ringLabelWrap}>
        <SignatureText style={styles.ringLabel}>
          {`${Math.round(ratio * 100)}%`}
        </SignatureText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summaryBody: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  ringLabelWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ringLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  link: {
    color: "#1D4ED8",
    fontWeight: "700",
  },
  fiscalList: {
    gap: 8,
    paddingHorizontal: 4,
  },
  fiscalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fiscalTitle: {
    flex: 1,
    color: "#0B1A3A",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  fiscalMeta: {
    color: "rgba(11,26,58,0.42)",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
});
