"use client";

import React from "react";
import { ChevronDown, ChevronRight, FileText, Receipt, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  isSettledTransaction,
  type InstallmentLedger,
  type NormalizedPaymentTransaction,
} from "@/lib/payments/installment-ledger";

/**
 * Le rate di un atleta, con quanto ne resta scoperto.
 *
 * Ogni riga mostra **sempre** le cinque cose che servono per decidere:
 * importo dovuto, incassato, residuo, scadenza e stato — piu una barra che
 * rende leggibile a colpo d'occhio il rapporto fra i primi due. Prima ne
 * mostrava una sola, lo stato, ed era anche l'unica modificabile a mano.
 *
 * Il dettaglio si apre sulla riga e porta la cronologia degli incassi in
 * ordine **crescente**: e un estratto conto, e si legge in avanti.
 */

const STATUS_BADGE_CLASS: Record<string, string> = {
  "IN ATTESA": "border-amber-200 bg-amber-50 text-amber-700",
  "PARZIALMENTE PAGATA": "border-sky-200 bg-sky-50 text-sky-700",
  PAGATA: "border-emerald-200 bg-emerald-50 text-emerald-700",
  SCADUTA: "border-red-200 bg-red-50 text-red-700",
};

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value?: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const TransactionRows = ({
  transactions,
  onReverse,
  onGenerateReceipt,
  onGenerateInvoice,
  canManage,
  busyTransactionId,
}: {
  transactions: NormalizedPaymentTransaction[];
  onReverse?: (transaction: NormalizedPaymentTransaction) => void;
  onGenerateReceipt?: (transaction: NormalizedPaymentTransaction) => void;
  onGenerateInvoice?: (transaction: NormalizedPaymentTransaction) => void;
  canManage: boolean;
  busyTransactionId?: string | null;
}) => {
  if (transactions.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-slate-500">
        Nessun incasso registrato su questa rata.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="p-2">Data</th>
            <th className="p-2">Importo</th>
            <th className="p-2">Metodo</th>
            <th className="p-2">Note</th>
            {canManage ? <th className="p-2 text-right">Azioni</th> : null}
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => {
            const settled = isSettledTransaction(transaction);
            const isReversal = Boolean(transaction.reversesTransactionId);

            return (
              <tr
                key={transaction.id}
                className={`border-b ${settled ? "" : "text-slate-400 line-through"}`}
              >
                <td className="p-2 whitespace-nowrap">
                  {formatDate(transaction.paidAt)}
                </td>
                <td className="p-2 whitespace-nowrap font-medium">
                  {formatCurrency(transaction.amount)}
                </td>
                <td className="p-2">{transaction.paymentMethod || "-"}</td>
                <td className="p-2">
                  {isReversal ? (
                    <span className="text-xs">
                      Storno — {transaction.notes || "senza motivo indicato"}
                    </span>
                  ) : transaction.reversedAt ? (
                    <span className="text-xs">
                      Stornato il {formatDate(transaction.reversedAt)}
                      {transaction.reversalReason
                        ? ` — ${transaction.reversalReason}`
                        : ""}
                    </span>
                  ) : (
                    transaction.notes || "-"
                  )}
                </td>
                {canManage ? (
                  <td className="p-2 text-right whitespace-nowrap">
                    {settled ? (
                      <div className="flex justify-end gap-1">
                        {/*
                          Ricevuta e fattura sono due documenti diversi, e la
                          scelta e di chi emette: la maggior parte delle ASD
                          non emette fatture, e trasformare ogni incasso in
                          fattura sarebbe sbagliato per quasi tutte.
                        */}
                        {onGenerateReceipt ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyTransactionId === transaction.id}
                            onClick={() => onGenerateReceipt(transaction)}
                          >
                            <Receipt className="mr-1 h-3.5 w-3.5" />
                            Ricevuta
                          </Button>
                        ) : null}
                        {onGenerateInvoice ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyTransactionId === transaction.id}
                            onClick={() => onGenerateInvoice(transaction)}
                          >
                            <FileText className="mr-1 h-3.5 w-3.5" />
                            Fattura
                          </Button>
                        ) : null}
                        {onReverse ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyTransactionId === transaction.id}
                            onClick={() => onReverse(transaction)}
                          >
                            <Undo2 className="mr-1 h-3.5 w-3.5" />
                            Storna
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export type InstallmentLedgerListProps = {
  ledgers: InstallmentLedger[];
  /** Solo chi gestisce il club puo registrare o stornare un incasso. */
  canManage?: boolean;
  onRegisterPayment?: (ledger: InstallmentLedger) => void;
  onReverseTransaction?: (
    transaction: NormalizedPaymentTransaction,
    ledger: InstallmentLedger,
  ) => void;
  onGenerateReceipt?: (
    transaction: NormalizedPaymentTransaction,
    ledger: InstallmentLedger,
  ) => void;
  onGenerateInvoice?: (
    transaction: NormalizedPaymentTransaction,
    ledger: InstallmentLedger,
  ) => void;
  busyTransactionId?: string | null;
  emptyMessage?: string;
};

export function InstallmentLedgerList({
  ledgers,
  canManage = false,
  onRegisterPayment,
  onReverseTransaction,
  onGenerateReceipt,
  onGenerateInvoice,
  busyTransactionId = null,
  emptyMessage = "Nessuna rata generata per questo atleta.",
}: InstallmentLedgerListProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  if (ledgers.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {ledgers.map((ledger) => {
        const key = String(ledger.installmentId || ledger.label);
        const isOpen = Boolean(expanded[key]);

        return (
          <div
            key={key}
            className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {ledger.label}
                  </p>
                  {ledger.statusLabels.map((label) => (
                    <Badge
                      key={label}
                      variant="outline"
                      className={STATUS_BADGE_CLASS[label] || ""}
                    >
                      {label}
                    </Badge>
                  ))}
                </div>

                <p className="mt-1 text-xs text-slate-500">
                  {ledger.dueDate
                    ? `Scadenza ${formatDate(ledger.dueDate)}`
                    : "Scadenza non definita"}
                </p>

                <div className="mt-2 space-y-1">
                  <Progress
                    value={Math.round(ledger.progress * 100)}
                    className="h-2"
                  />
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">
                      {formatCurrency(ledger.paidAmount)} /{" "}
                      {formatCurrency(ledger.dueAmount)} pagati
                    </span>
                    <span
                      className={
                        ledger.residualAmount > 0
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-emerald-700 dark:text-emerald-300"
                      }
                    >
                      Residuo {formatCurrency(ledger.residualAmount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                {canManage && ledger.residualAmount > 0 && onRegisterPayment ? (
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => onRegisterPayment(ledger)}
                  >
                    Registra pagamento
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() =>
                    setExpanded((current) => ({
                      ...current,
                      [key]: !current[key],
                    }))
                  }
                >
                  {isOpen ? (
                    <ChevronDown className="mr-1 h-4 w-4" />
                  ) : (
                    <ChevronRight className="mr-1 h-4 w-4" />
                  )}
                  {ledger.transactions.length > 0
                    ? `Incassi (${ledger.transactions.length})`
                    : "Dettaglio"}
                </Button>
              </div>
            </div>

            {isOpen ? (
              <div className="mt-3 rounded-md border border-slate-100 dark:border-slate-800">
                <TransactionRows
                  transactions={ledger.transactions}
                  canManage={canManage}
                  busyTransactionId={busyTransactionId}
                  onReverse={
                    onReverseTransaction
                      ? (transaction) => onReverseTransaction(transaction, ledger)
                      : undefined
                  }
                  onGenerateReceipt={
                    onGenerateReceipt
                      ? (transaction) => onGenerateReceipt(transaction, ledger)
                      : undefined
                  }
                  onGenerateInvoice={
                    onGenerateInvoice
                      ? (transaction) => onGenerateInvoice(transaction, ledger)
                      : undefined
                  }
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
