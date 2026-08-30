"use client";

import React from "react";
import { apiRequest } from "@/lib/api/client";
import { Wallet } from "lucide-react";
import { InstallmentLedgerList } from "./InstallmentLedgerList";
import { RegisterPaymentDialog } from "./RegisterPaymentDialog";
import { PayOnlineDialog } from "./PayOnlineDialog";
import { RefundDialog } from "./RefundDialog";
import { DocumentDecisionDialog } from "./DocumentDecisionDialog";
import { useAthletePaymentLedger } from "./use-athlete-payment-ledger";
import type { LedgerTotals } from "@/lib/payments/installment-ledger";

/**
 * Rate e incassi di un atleta: **un solo flusso**, montato nell'area Movimenti
 * e nella scheda «Iscrizione».
 *
 * Prima ce n'erano due, con due finestre di dialogo, due modi di scrivere il
 * metodo di pagamento e due idee di cosa fosse «pagato». Una seconda
 * implementazione quasi uguale e il modo in cui i due percorsi ricominciano a
 * divergere: qui il componente e uno, e cio che cambia fra le due superfici e
 * solo il contorno.
 *
 * **Lo stato vive in `useAthletePaymentLedger`.** Questo file e la sua vista.
 * La scheda «Iscrizione» consuma lo stesso hook per mostrare gli stessi numeri
 * in cima alla pagina: un totale calcolato due volte e un totale che prima o
 * poi differisce.
 *
 * **Gli aggiornamenti sono immediati.** La risposta del server porta la rata
 * riscritta e i suoi incassi; lo stato si aggiorna e chiama `onLedgerChanged`,
 * cosi rata, riepilogo, totale pagato e residuo si spostano nello stesso
 * istante senza che nessuno prema «aggiorna».
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
  /** Nasconde l'intestazione quando chi ospita ne ha gia una. */
  showHeading?: boolean;
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
  showHeading = true,
  onLedgerChanged,
}: AthletePaymentLedgerProps) {
  const ledger = useAthletePaymentLedger({
    athleteId,
    charges,
    canManage,
    onLedgerChanged,
  });

  /**
   * Le causali attive del club, per la finestra di incasso.
   *
   * Si leggono qui e non nella finestra perche la finestra si apre e si chiude
   * trenta volte di fila: leggerle a ogni apertura sarebbe trenta richieste per
   * un elenco che non cambia. Se la lettura fallisce — un ruolo che le causali
   * non le vede — l'elenco resta vuoto e la finestra lo dice, invece di
   * impedire di registrare l'incasso.
   */
  const [causali, setCausali] = React.useState<
    Array<{ code: string; label: string }>
  >([]);

  React.useEffect(() => {
    let vivo = true;
    void (async () => {
      const risposta = await apiRequest<{
        operationTypes?: Array<{ code: string; label: string; isActive?: boolean }>;
      }>("/api/v1/fiscal/operation-types");
      if (!vivo || risposta.error) return;
      setCausali(
        (risposta.data?.operationTypes || [])
          .filter((causale) => causale.isActive !== false)
          .map((causale) => ({ code: causale.code, label: causale.label })),
      );
    })();
    return () => {
      vivo = false;
    };
  }, []);

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
                {formatCurrency(ledger.totals.dueAmount)}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 dark:bg-emerald-900/20">
              <p className="text-xs font-medium text-muted-foreground">
                Incassato
              </p>
              <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(ledger.totals.paidAmount)}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
              <p className="text-xs font-medium text-muted-foreground">
                Residuo
              </p>
              <p className="mt-1 text-xl font-bold text-amber-700 dark:text-amber-300">
                {formatCurrency(ledger.totals.residualAmount)}
              </p>
              {ledger.totals.overdueCount > 0 ? (
                <p className="mt-1 text-xs text-red-600">
                  {ledger.totals.overdueCount} rate scadute per{" "}
                  {formatCurrency(ledger.totals.overdueAmount)}
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

      {showHeading ? (
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-blue-600" />
          <h4 className="font-semibold text-slate-950 dark:text-slate-50">
            Rate e incassi
          </h4>
        </div>
      ) : null}

      {ledger.isLoading && ledger.transactions.length === 0 ? (
        <p className="text-sm text-slate-500">Lettura degli incassi...</p>
      ) : (
        <InstallmentLedgerList
          ledgers={ledger.ledgers}
          canManage={ledger.allowManagement}
          busyTransactionId={ledger.busyTransactionId}
          onRegisterPayment={ledger.selectLedger}
          onReverseTransaction={(transaction) =>
            void ledger.reverseTransaction(transaction)
          }
          onGenerateReceipt={(transaction) =>
            void ledger.generateReceipt(transaction)
          }
          onGenerateInvoice={(transaction) =>
            void ledger.generateInvoice(transaction)
          }
          onPayOnline={
            ledger.canPayOnline ? ledger.selectOnlineLedger : undefined
          }
          /*
            Il rimborso segue la stessa condizione del pagamento online: se il
            club non puo incassare online non ha incassi online da restituire,
            e il pulsante non ha niente da fare li.
          */
          onRefundTransaction={
            ledger.canPayOnline
              ? (transaction) => ledger.selectRefundTransaction(transaction)
              : undefined
          }
          refundAvailabilityFor={ledger.refundAvailabilityFor}
          pendingOnlineInstallmentId={ledger.pendingOnlineInstallmentId}
        />
      )}

      {/*
        La proposta del motore fiscale, **prima** dell'emissione: quale
        documento, con quale numero, con quale classificazione. Prima di questa
        finestra la spiegazione arrivava solo come errore, e solo quando
        qualcosa andava storto.
      */}
      <DocumentDecisionDialog
        open={Boolean(ledger.documentDecision.kind)}
        onOpenChange={(open) => {
          if (!open) ledger.closeDocumentDecision();
        }}
        kind={ledger.documentDecision.kind}
        preview={ledger.documentDecision.preview}
        isLoading={ledger.documentDecision.isLoading}
        isSubmitting={ledger.documentDecision.isSubmitting}
        error={ledger.documentDecision.error}
        onConfirm={() => void ledger.confirmDocumentIssue()}
      />

      <RefundDialog
        open={Boolean(ledger.refundTarget)}
        onOpenChange={(open) => {
          if (!open) ledger.selectRefundTransaction(null);
        }}
        transaction={ledger.refundTarget}
        ledger={
          ledger.refundTarget
            ? ledger.ledgers.find(
                (entry) =>
                  String(entry.installmentId || "") ===
                  String(ledger.refundTarget?.installmentId || ""),
              ) || null
            : null
        }
        availability={
          ledger.refundTarget
            ? ledger.refundAvailabilityFor(ledger.refundTarget)
            : null
        }
        athleteName={athleteName}
        isSubmitting={ledger.isRefunding}
        onConfirm={(submission) =>
          ledger.refundTarget
            ? ledger.refundTransaction(ledger.refundTarget, submission)
            : undefined
        }
      />

      <PayOnlineDialog
        open={Boolean(ledger.onlineLedger)}
        onOpenChange={(open) => {
          if (!open) ledger.selectOnlineLedger(null);
        }}
        ledger={ledger.onlineLedger}
        athleteName={athleteName}
        isSubmitting={ledger.isOpeningCheckout}
        onConfirm={(amount) =>
          ledger.onlineLedger
            ? ledger.payOnline(ledger.onlineLedger, amount)
            : undefined
        }
      />

      <RegisterPaymentDialog
        open={Boolean(ledger.selectedLedger)}
        onOpenChange={(open) => {
          if (!open) ledger.selectLedger(null);
        }}
        ledger={ledger.selectedLedger}
        athleteName={athleteName}
        methodChoices={methodChoices}
        operationTypeChoices={causali}
        isSaving={ledger.isSaving}
        onSubmit={ledger.registerPayment}
      />
    </div>
  );
}
