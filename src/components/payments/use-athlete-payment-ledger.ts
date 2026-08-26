"use client";

import React from "react";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { useToast } from "@/components/ui/toast-notification";
import { openExternalUrl } from "@/lib/navigation/external-link";
import {
  buildInstallmentLedgers,
  findNextInstallment,
  resolveEnrollmentPaymentState,
  summarizeLedgers,
  type EnrollmentPaymentState,
  type InstallmentLedger,
  type LedgerTotals,
  type NormalizedPaymentTransaction,
} from "@/lib/payments/installment-ledger";
import type { RegisterPaymentSubmission } from "./RegisterPaymentDialog";

/**
 * Rate e incassi di un atleta: **lo stato, non la sua rappresentazione**.
 *
 * **Perche un hook e non un secondo componente.** La scheda «Iscrizione» deve
 * mostrare gli stessi numeri in tre punti — il riepilogo in cima, la prossima
 * rata, l'elenco delle rate — e l'area Movimenti ne mostra un quarto. Se ogni
 * superficie leggesse gli incassi per conto suo avremmo quattro idee di
 * «quanto ha pagato», e un incasso registrato ne aggiornerebbe una sola.
 *
 * Qui la lettura, il calcolo e le scritture stanno in un posto solo; chi
 * consuma decide **cosa** mostrare, mai **quanto vale**.
 *
 * Lo stato di una rata resta derivato: non c'e nessuna funzione che lo scriva
 * (ADR-0036).
 */

export type AthletePaymentLedgerState = {
  ledgers: InstallmentLedger[];
  totals: LedgerTotals;
  /** La rata su cui si agisce adesso, o `null` se non c'e niente da incassare. */
  nextInstallment: InstallmentLedger | null;
  /** Lo stato economico dell'iscrizione, ricavato dalle rate. */
  paymentState: EnrollmentPaymentState;
  transactions: NormalizedPaymentTransaction[];
  isLoading: boolean;
  isSaving: boolean;
  busyTransactionId: string | null;
  allowManagement: boolean;
  /** Vero solo se il server dichiara che l'incasso online e davvero possibile. */
  canPayOnline: boolean;
  pendingOnlineInstallmentId: string | null;
  selectedLedger: InstallmentLedger | null;
  selectLedger: (ledger: InstallmentLedger | null) => void;
  reload: () => Promise<void>;
  registerPayment: (submission: RegisterPaymentSubmission) => Promise<void>;
  reverseTransaction: (
    transaction: NormalizedPaymentTransaction,
  ) => Promise<void>;
  generateReceipt: (
    transaction: NormalizedPaymentTransaction,
  ) => Promise<void>;
  generateInvoice: (
    transaction: NormalizedPaymentTransaction,
  ) => Promise<void>;
  payOnline: (ledger: InstallmentLedger) => Promise<void>;
};

export function useAthletePaymentLedger({
  athleteId,
  charges,
  canManage,
  onLedgerChanged,
}: {
  athleteId: string;
  /** Le righe di `payments` dell'atleta: le rate. */
  charges: any[];
  /**
   * Se omesso si ricava dal ruolo attivo. Resta un'affordance
   * dell'interfaccia: l'autorizzazione vera la fa il server.
   */
  canManage?: boolean;
  onLedgerChanged?: (updatedCharge: any | null, totals: LedgerTotals) => void;
}): AthletePaymentLedgerState {
  const { showToast } = useToast();
  const [derivedCanManage, setDerivedCanManage] = React.useState(false);

  React.useEffect(() => {
    if (canManage !== undefined) return;
    setDerivedCanManage(
      canManageClubConfiguration(readStoredActiveClub()?.role),
    );
  }, [canManage]);

  const allowManagement = canManage ?? derivedCanManage;

  const [transactions, setTransactions] = React.useState<
    NormalizedPaymentTransaction[]
  >([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [busyTransactionId, setBusyTransactionId] = React.useState<
    string | null
  >(null);
  const [selectedLedger, setSelectedLedger] =
    React.useState<InstallmentLedger | null>(null);

  /*
    Se gli incassi online sono davvero disponibili lo dice il server, e lo si
    chiede una volta sola: un pulsante che si accende e poi spiega di non
    funzionare e peggio di un pulsante che non c'e.
  */
  const [canPayOnline, setCanPayOnline] = React.useState(false);
  const [pendingOnlineInstallmentId, setPendingOnlineInstallmentId] =
    React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void apiRequest<{ readiness?: { canCheckout?: boolean } }>(
      "/api/v1/payments/account",
    ).then((response) => {
      if (cancelled) return;
      setCanPayOnline(Boolean(response.data?.readiness?.canCheckout));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const reload = React.useCallback(async () => {
    if (!athleteId) return;

    setIsLoading(true);
    const { data, error } = await apiRequest<NormalizedPaymentTransaction[]>(
      `/api/v1/payment-transactions?athlete_id=${encodeURIComponent(athleteId)}`,
    );
    setIsLoading(false);

    if (error) {
      showToast("error", error.message || "Errore nella lettura degli incassi");
      return;
    }

    setTransactions(Array.isArray(data) ? data : []);
  }, [athleteId, showToast]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const ledgers = React.useMemo(
    () =>
      buildInstallmentLedgers({
        charges: Array.isArray(charges) ? charges : [],
        transactions,
      }),
    [charges, transactions],
  );

  const totals = React.useMemo(() => summarizeLedgers(ledgers), [ledgers]);
  const nextInstallment = React.useMemo(
    () => findNextInstallment(ledgers),
    [ledgers],
  );
  const paymentState = React.useMemo(
    () => resolveEnrollmentPaymentState(ledgers, totals),
    [ledgers, totals],
  );

  /*
    Il registro tornato dal server ha la precedenza sullo stato locale: e la
    stessa transazione che ha scritto la rata, quindi non puo essere in
    disaccordo con essa.
  */
  const applyResult = React.useCallback(
    (result: any) => {
      const updated = Array.isArray(result?.transactions)
        ? (result.transactions as NormalizedPaymentTransaction[])
        : null;

      if (updated) {
        const chargeId = String(result?.charge?.id || "");
        setTransactions((current) => [
          ...current.filter(
            (transaction) =>
              String(transaction.installmentId || "") !== chargeId,
          ),
          ...updated,
        ]);
      } else {
        void reload();
      }

      onLedgerChanged?.(result?.charge ?? null, totals);
    },
    [onLedgerChanged, reload, totals],
  );

  const registerPayment = React.useCallback(
    async (submission: RegisterPaymentSubmission) => {
      if (!selectedLedger?.installmentId) return;

      setIsSaving(true);
      const { data, error } = await apiRequest("/api/v1/payment-transactions", {
        method: "POST",
        body: {
          athlete_id: athleteId,
          payment_id: selectedLedger.installmentId,
          amount: submission.amount,
          paid_at: submission.paidAt,
          payment_method: submission.paymentMethod,
          notes: submission.notes,
          source: "MANUAL",
        },
      });
      setIsSaving(false);

      if (error) {
        showToast("error", error.message || "Registrazione non riuscita");
        return;
      }

      applyResult(data);
      setSelectedLedger(null);
      showToast(
        "success",
        `Incasso di ${new Intl.NumberFormat("it-IT", {
          style: "currency",
          currency: "EUR",
          minimumFractionDigits: 2,
        }).format(Number(submission.amount || 0))} registrato`,
      );
    },
    [applyResult, athleteId, selectedLedger, showToast],
  );

  const reverseTransaction = React.useCallback(
    async (transaction: NormalizedPaymentTransaction) => {
      const reason = window.prompt(
        "Motivo dello storno (resta nello storico):",
        "Incasso registrato per errore",
      );
      if (reason === null) return;

      setBusyTransactionId(transaction.id);
      const { data, error } = await apiRequest(
        `/api/v1/payment-transactions/${encodeURIComponent(transaction.id)}`,
        { method: "POST", body: { action: "reverse", reason } },
      );
      setBusyTransactionId(null);

      if (error) {
        showToast("error", error.message || "Storno non riuscito");
        return;
      }

      applyResult(data);
      showToast("success", "Incasso stornato: resta visibile nello storico");
    },
    [applyResult, showToast],
  );

  /*
    Il documento si apre appena emesso, in una scheda nuova. Non e una
    comodita: chi emette una ricevuta la emette **per darla a qualcuno**, e
    costringerlo a ritrovarla in un elenco e il modo piu rapido perche non la
    stampi affatto.
  */
  const openDocument = (kind: "receipt" | "invoice", id?: string) => {
    if (!id || typeof window === "undefined") return;
    window.open(
      `/api/v1/documents/${kind}/${encodeURIComponent(id)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const generateReceipt = React.useCallback(
    async (transaction: NormalizedPaymentTransaction) => {
      setBusyTransactionId(transaction.id);
      const { data, error } = await apiRequest(
        `/api/v1/payment-transactions/${encodeURIComponent(transaction.id)}`,
        { method: "POST", body: { action: "issue-receipt" } },
      );
      setBusyTransactionId(null);

      if (error) {
        showToast("error", error.message || "Emissione ricevuta non riuscita");
        return;
      }

      showToast("success", `Ricevuta ${data?.receipt_number || ""} emessa`.trim());
      openDocument("receipt", data?.id);
    },
    [showToast],
  );

  /*
    Ricevuta e fattura sono due documenti diversi e la scelta e di chi emette.
    La maggior parte delle ASD non emette fatture: trasformare ogni incasso in
    fattura sarebbe sbagliato per quasi tutte, e per le altre non basterebbe
    comunque — una fattura ha un intestatario, che quasi mai e l'atleta.
  */
  const generateInvoice = React.useCallback(
    async (transaction: NormalizedPaymentTransaction) => {
      setBusyTransactionId(transaction.id);
      const { data, error } = await apiRequest(
        `/api/v1/payment-transactions/${encodeURIComponent(transaction.id)}`,
        { method: "POST", body: { action: "issue-invoice" } },
      );
      setBusyTransactionId(null);

      if (error) {
        showToast("error", error.message || "Emissione fattura non riuscita");
        return;
      }

      showToast("success", `Fattura ${data?.invoice_number || ""} emessa`.trim());
      openDocument("invoice", data?.id);
    },
    [showToast],
  );

  /**
   * Apre il checkout per il residuo di una rata.
   *
   * **Cosa succede al ritorno, e cosa no.** Non succede niente: la rata resta
   * marcata «in verifica» finche il webhook firmato non registra l'incasso. Il
   * browser puo non tornare affatto, e con SEPA il denaro arriva giorni dopo.
   */
  const payOnline = React.useCallback(
    async (ledger: InstallmentLedger) => {
      const installmentId = String(ledger.installmentId || "");
      if (!installmentId) return;

      const origin = window.location.origin;
      const { data, error } = await apiRequest<{ checkoutUrl: string }>(
        "/api/payments/create-checkout-session",
        {
          method: "POST",
          body: {
            paymentId: installmentId,
            athleteId,
            amountCents: Math.round(ledger.residualAmount * 100),
            description: ledger.label,
            successUrl: `${origin}/athletes/${athleteId}?pagamento=verifica`,
            cancelUrl: `${origin}/athletes/${athleteId}?pagamento=annullato`,
          },
        },
      );

      if (error || !data?.checkoutUrl) {
        showToast("error", error?.message || "Pagamento online non disponibile");
        return;
      }

      setPendingOnlineInstallmentId(installmentId);

      try {
        openExternalUrl(data.checkoutUrl);
      } catch {
        showToast("error", "Il collegamento al pagamento non e valido");
      }
    },
    [athleteId, showToast],
  );

  return {
    ledgers,
    totals,
    nextInstallment,
    paymentState,
    transactions,
    isLoading,
    isSaving,
    busyTransactionId,
    allowManagement,
    canPayOnline,
    pendingOnlineInstallmentId,
    selectedLedger,
    selectLedger: setSelectedLedger,
    reload,
    registerPayment,
    reverseTransaction,
    generateReceipt,
    generateInvoice,
    payOnline,
  };
}
