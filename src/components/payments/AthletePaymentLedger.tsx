"use client";

import React from "react";
import { Wallet } from "lucide-react";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { useToast } from "@/components/ui/toast-notification";
import {
  buildInstallmentLedgers,
  summarizeLedgers,
  type InstallmentLedger,
  type LedgerTotals,
  type NormalizedPaymentTransaction,
} from "@/lib/payments/installment-ledger";
import { InstallmentLedgerList } from "./InstallmentLedgerList";
import {
  RegisterPaymentDialog,
  type RegisterPaymentSubmission,
} from "./RegisterPaymentDialog";

/**
 * Rate e incassi di un atleta: **un solo flusso**, montato sia nella scheda
 * atleta sia nell'area Movimenti.
 *
 * Prima ce n'erano due, con due finestre di dialogo, due modi di scrivere il
 * metodo di pagamento e due idee di cosa fosse «pagato». Una seconda
 * implementazione quasi uguale e il modo in cui i due percorsi ricominciano a
 * divergere: qui il componente e uno, e cio che cambia fra le due superfici e
 * solo il contorno.
 *
 * **Gli aggiornamenti sono immediati.** La risposta del server porta la rata
 * riscritta e i suoi incassi; il componente aggiorna il proprio stato e
 * chiama `onLedgerChanged`, cosi rata, riepilogo, totale pagato e residuo si
 * spostano nello stesso istante senza che nessuno prema «aggiorna».
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

export type AthletePaymentLedgerProps = {
  athleteId: string;
  athleteName?: string | null;
  /** Le righe di `payments` dell'atleta: le rate. */
  charges: any[];
  /** I metodi di incasso configurati dal club. Mai testo libero. */
  methodChoices?: string[];
  /**
   * Se omesso si ricava dal ruolo attivo. Resta un'affordance
   * dell'interfaccia: l'autorizzazione vera la fa il server, che risponde 403
   * a chi non puo registrare un incasso.
   */
  canManage?: boolean;
  showTotals?: boolean;
  /**
   * Chiamato dopo ogni operazione con la rata riscritta dal server, cosi la
   * pagina ospite aggiorna i propri riepiloghi senza rileggere tutto.
   */
  onLedgerChanged?: (updatedCharge: any | null, totals: LedgerTotals) => void;
};

export function AthletePaymentLedger({
  athleteId,
  athleteName,
  charges,
  methodChoices = [],
  canManage,
  showTotals = true,
  onLedgerChanged,
}: AthletePaymentLedgerProps) {
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

  const loadTransactions = React.useCallback(async () => {
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
    void loadTransactions();
  }, [loadTransactions]);

  const ledgers = React.useMemo(
    () =>
      buildInstallmentLedgers({
        charges: Array.isArray(charges) ? charges : [],
        transactions,
      }),
    [charges, transactions],
  );

  const totals = React.useMemo(() => summarizeLedgers(ledgers), [ledgers]);

  /*
    Il registro tornato dal server ha la precedenza sullo stato locale: e la
    stessa transazione che ha scritto la rata, quindi non puo essere in
    disaccordo con essa.
  */
  const applyResult = (result: any) => {
    const updated = Array.isArray(result?.transactions)
      ? (result.transactions as NormalizedPaymentTransaction[])
      : null;

    if (updated) {
      const chargeId = String(result?.charge?.id || "");
      setTransactions((current) => [
        ...current.filter(
          (transaction) => String(transaction.installmentId || "") !== chargeId,
        ),
        ...updated,
      ]);
    } else {
      void loadTransactions();
    }

    onLedgerChanged?.(result?.charge ?? null, totals);
  };

  const handleRegisterPayment = async (
    submission: RegisterPaymentSubmission,
  ) => {
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
      `Incasso di ${formatCurrency(submission.amount)} registrato`,
    );
  };

  const handleReverse = async (transaction: NormalizedPaymentTransaction) => {
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
  };

  const handleGenerateReceipt = async (
    transaction: NormalizedPaymentTransaction,
  ) => {
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

    showToast(
      "success",
      `Ricevuta ${data?.receipt_number || ""} emessa`.trim(),
    );
  };

  return (
    <div className="space-y-4">
      {showTotals ? (
        <div className="space-y-2">
          {/*
            L'etichetta dice di chi e il denaro. I contributi degli enti
            vivono in un riquadro separato e **non** entrano in questi totali:
            un contributo maturato e un credito, non cassa (ADR-0037).
          */}
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pagamenti della famiglia
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40">
              <p className="text-xs font-medium text-muted-foreground">
                Totale rate
              </p>
              <p className="mt-1 text-xl font-bold">
                {formatCurrency(totals.dueAmount)}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-900/20">
              <p className="text-xs font-medium text-muted-foreground">
                Incassato
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(totals.paidAmount)}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
              <p className="text-xs font-medium text-muted-foreground">
                Residuo
              </p>
              <p className="mt-1 text-xl font-bold text-amber-700 dark:text-amber-300">
                {formatCurrency(totals.residualAmount)}
              </p>
              {totals.overdueCount > 0 ? (
                <p className="mt-1 text-xs text-red-600">
                  {totals.overdueCount} rate scadute per{" "}
                  {formatCurrency(totals.overdueAmount)}
                </p>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Voucher e contributi degli enti sono contati a parte: un contributo
            maturato e un credito, non denaro incassato.
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-blue-600" />
        <h4 className="font-semibold text-slate-950 dark:text-slate-50">
          Rate e incassi
        </h4>
      </div>

      {isLoading && transactions.length === 0 ? (
        <p className="text-sm text-slate-500">Lettura degli incassi...</p>
      ) : (
        <InstallmentLedgerList
          ledgers={ledgers}
          canManage={allowManagement}
          busyTransactionId={busyTransactionId}
          onRegisterPayment={setSelectedLedger}
          onReverseTransaction={(transaction) =>
            void handleReverse(transaction)
          }
          onGenerateReceipt={(transaction) =>
            void handleGenerateReceipt(transaction)
          }
        />
      )}

      <RegisterPaymentDialog
        open={Boolean(selectedLedger)}
        onOpenChange={(open) => {
          if (!open) setSelectedLedger(null);
        }}
        ledger={selectedLedger}
        athleteName={athleteName}
        methodChoices={methodChoices}
        isSaving={isSaving}
        onSubmit={handleRegisterPayment}
      />
    </div>
  );
}
