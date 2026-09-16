"use client";

import React from "react";
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  HandCoins,
  Pencil,
  Receipt,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  isSettledTransaction,
  type InstallmentLedger,
  type NormalizedPaymentTransaction,
} from "@/lib/payments/installment-ledger";
import {
  isRefundTransaction,
  type RefundAvailability,
} from "@/lib/payments/refunds";
import { withFamilyShare } from "@/lib/payments/coverage-ledger";

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
  "IN ATTESA": "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink",
  "PARZIALMENTE PAGATA": "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800",
  PAGATA: "border-egw-tint-green-bd bg-egw-tint-green text-egw-green",
  SCADUTA: "border-egw-tint-red-bd bg-egw-tint-red text-egw-red",
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
  onRefund,
  refundAvailabilityFor,
  onGenerateReceipt,
  onGenerateInvoice,
  canManage,
  busyTransactionId,
}: {
  transactions: NormalizedPaymentTransaction[];
  onReverse?: (transaction: NormalizedPaymentTransaction) => void;
  onRefund?: (transaction: NormalizedPaymentTransaction) => void;
  refundAvailabilityFor?: (
    transaction: NormalizedPaymentTransaction,
  ) => RefundAvailability;
  onGenerateReceipt?: (transaction: NormalizedPaymentTransaction) => void;
  onGenerateInvoice?: (transaction: NormalizedPaymentTransaction) => void;
  canManage: boolean;
  busyTransactionId?: string | null;
}) => {
  if (transactions.length === 0) {
    return (
      <p className="px-3 py-2 text-sm text-egw-ink-62">
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
            const isRefund = isRefundTransaction(transaction);

            /*
              Il rimborsabile si chiede una volta per riga a chi lo sa
              calcolare. Quando nessuno lo sa — la lista e montata senza il
              rimborso — il pulsante non compare, che e meglio di un pulsante
              che si accende e poi spiega di non funzionare.
            */
            const refund =
              onRefund && refundAvailabilityFor
                ? refundAvailabilityFor(transaction)
                : null;

            return (
              <tr
                key={transaction.id}
                className={`border-b ${settled ? "" : "text-egw-ink-42 line-through"}`}
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
                  ) : isRefund ? (
                    /*
                      Un rimborso si distingue da uno storno anche a occhio:
                      sono entrambi movimenti negativi, ma raccontano due fatti
                      opposti — «non e mai successo» contro «e successo, e poi
                      il denaro e tornato indietro».
                    */
                    <span className="text-xs">
                      Rimborso — {transaction.notes || "confermato dal provider"}
                    </span>
                  ) : transaction.reversedAt ? (
                    <span className="text-xs">
                      Stornato il {formatDate(transaction.reversedAt)}
                      {transaction.reversalReason
                        ? ` — ${transaction.reversalReason}`
                        : ""}
                    </span>
                  ) : (
                    <>
                      {transaction.notes || "-"}
                      {refund && refund.refundedCents > 0 ? (
                        <span className="ml-2 text-xs text-egw-ink-62">
                          Rimborsato{" "}
                          {formatCurrency(refund.refundedCents / 100)}
                        </span>
                      ) : null}
                      {/*
                        «In elaborazione» e uno stato vero, non l'assenza di uno
                        stato: e quello fra la richiesta al provider e la sua
                        conferma firmata. Dire «rimborsato» nel frattempo
                        sarebbe una bugia che si scopre in contabilita — lo
                        stesso ragionamento di «pagamento in verifica».
                      */}
                      {refund?.pending.length ? (
                        <Badge
                          variant="outline"
                          className="ml-2 border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800"
                        >
                          Rimborso in elaborazione
                        </Badge>
                      ) : null}
                    </>
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
                        {/*
                          «Rimborsa» compare **solo** quando c'e davvero
                          qualcosa da restituire: incasso online, non stornato,
                          con un residuo rimborsabile e nessuna richiesta gia in
                          volo. Un incasso manuale non lo mostra affatto — quel
                          denaro dal provider non e mai passato, e si storna.
                        */}
                        {onRefund && refund?.refundable ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyTransactionId === transaction.id}
                            onClick={() => onRefund(transaction)}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            Rimborsa
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
  /**
   * La copertura da voucher, per identificativo di rata (N7 / ADR-0158).
   *
   * Facoltativa: una rata assente dalla mappa non e coperta, e la riga si
   * disegna esattamente come prima. Le schermate che non la passano non
   * cambiano di una virgola.
   */
  coverageByInstallment?: Record<string, any>;
  /** Apre la gestione della copertura di una rata. */
  onManageCoverage?: (ledger: InstallmentLedger) => void;
  /** Solo chi gestisce il club puo registrare o stornare un incasso. */
  canManage?: boolean;
  onRegisterPayment?: (ledger: InstallmentLedger) => void;
  onReverseTransaction?: (
    transaction: NormalizedPaymentTransaction,
    ledger: InstallmentLedger,
  ) => void;
  /**
   * Il rimborso di un incasso online.
   *
   * **Assente quando i rimborsi non sono disponibili**, come «Paga online»: le
   * due cose vanno insieme, e un pulsante che compare per poi rifiutarsi e
   * peggio di un pulsante che non c'e.
   */
  onRefundTransaction?: (
    transaction: NormalizedPaymentTransaction,
    ledger: InstallmentLedger,
  ) => void;
  /** Quanto di questo incasso e ancora rimborsabile, e se lo e. */
  refundAvailabilityFor?: (
    transaction: NormalizedPaymentTransaction,
  ) => RefundAvailability;
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
  /**
   * Il pagamento online della rata.
   *
   * **Convive con «Registra pagamento», non lo sostituisce.** Sono due canali
   * per lo stesso debito: la famiglia paga dal link, la segreteria registra
   * il contante allo sportello. Entrambi producono un movimento nello stesso
   * registro — non esiste una «rata Stripe» separata (ADR-0036).
   *
   * Assente quando gli incassi online non sono disponibili: un pulsante che
   * si accende e poi spiega di non funzionare e peggio di un pulsante che non
   * c'e.
   */
  onPayOnline?: (ledger: InstallmentLedger) => void;
  /** La rata il cui pagamento online e in attesa della conferma del provider. */
  pendingOnlineInstallmentId?: string | null;
  /**
   * L'anagrafica della rata: descrizione, importo, scadenza, note.
   *
   * **Non e lo stato**, che resta derivato dagli incassi (ADR-0036). Vive nel
   * dettaglio della rata perche e li che si guarda una rata specifica: prima
   * stava in una tabella a parte con gli stessi incassi ripetuti accanto, che
   * e il duplicato che ADR-0056 ha tolto.
   */
  onEditInstallment?: (ledger: InstallmentLedger) => void;
  onDeleteInstallment?: (ledger: InstallmentLedger) => void;
};

export function InstallmentLedgerList({
  ledgers,
  coverageByInstallment = {},
  onManageCoverage,
  canManage = false,
  onRegisterPayment,
  onReverseTransaction,
  onRefundTransaction,
  refundAvailabilityFor,
  onGenerateReceipt,
  onGenerateInvoice,
  busyTransactionId = null,
  emptyMessage = "Nessuna rata generata per questo atleta.",
  onPayOnline,
  pendingOnlineInstallmentId = null,
  onEditInstallment,
  onDeleteInstallment,
}: InstallmentLedgerListProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  if (ledgers.length === 0) {
    return <p className="text-sm text-egw-ink-62">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {ledgers.map((lordo) => {
        const key = String(lordo.installmentId || lordo.label);
        const isOpen = Boolean(expanded[key]);
        const coverage =
          coverageByInstallment[String(lordo.installmentId || "")] || null;

        /*
          **La riga si disegna con gli occhi della famiglia** (N14).

          Prima si sostituivano i soli importi, e stato, etichette e barra
          restavano quelli lordi: una rata da 200 coperta per 150 e saldata per
          i suoi 50 diceva «Residuo 0,00» accanto a «PARZIALMENTE PAGATA ·
          SCADUTA». Due affermazioni contraddittorie sulla stessa riga, e la
          seconda faceva partire la telefonata.

          `withFamilyShare` e la stessa funzione che alimenta «prossima rata» e
          la finestra di incasso, e su una rata senza copertura restituisce
          l'oggetto identico: le schermate che non passano la mappa non
          cambiano di una virgola.
        */
        const ledger = withFamilyShare(lordo, coverage);
        const residuoFamiglia = ledger.residualAmount;

        return (
          <div
            key={key}
            className="rounded-egw-control border border-egw-hairline bg-white p-3 dark:border-slate-800 dark:bg-slate-950/40"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-egw-ink dark:text-slate-100">
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

                <p className="mt-1 text-xs text-egw-ink-62">
                  {ledger.dueDate
                    ? `Scadenza ${formatDate(ledger.dueDate)}`
                    : "Scadenza non definita"}
                </p>

                <div className="mt-2 space-y-1">
                  <Progress
                    value={Math.round(ledger.progress * 100)}
                    className="h-2"
                  />
                  {/*
                    **Il residuo mostrato e quello della famiglia** (revisione
                    ostile, H2).

                    Su una rata da 600 coperta per 500 la riga diceva «Residuo
                    600,00» e, due righe piu sotto, «a carico della famiglia
                    100,00»: due numeri contraddittori sulla stessa riga, e il
                    piu grande era quello su cui si apriva il checkout.
                  */}
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <span className="font-medium">
                      {formatCurrency(ledger.paidAmount)} /{" "}
                      {formatCurrency(ledger.dueAmount)} pagati
                    </span>
                    <span
                      className={
                        residuoFamiglia > 0
                          ? "text-egw-amber-ink dark:text-amber-300"
                          : "text-egw-green dark:text-emerald-300"
                      }
                    >
                      Residuo {formatCurrency(residuoFamiglia)}
                    </span>
                    {coverage ? (
                      <span className="text-xs text-egw-ink-62">
                        su {formatCurrency(lordo.dueAmount)} di quota
                      </span>
                    ) : null}
                  </div>

                  {/*
                    **La copertura, quando c'e** (N7 / ADR-0158).

                    Le quattro grandezze dell'ente stanno in un riquadro
                    **separato** da quelle della famiglia, e la riga lo dice a
                    parole: le due contabilita non si sommano, e affiancarle
                    senza dirlo sarebbe il modo piu rapido per far leggere alla
                    segreteria un totale che non esiste.
                  */}
                  {coverage ? (
                    <div className="mt-2 rounded-egw-control border border-egw-tint-blue-bd bg-egw-tint-blue/60 p-2 text-xs dark:border-sky-900 dark:bg-sky-950/30">
                      <p className="font-medium text-sky-900 dark:text-sky-200">
                        Coperta da voucher per{" "}
                        {formatCurrency(coverage.plannedCoverage)} · a carico
                        della famiglia {formatCurrency(coverage.familyDueAmount)}
                      </p>
                      <p className="mt-1 text-egw-blue-800/80 dark:text-sky-300/80">
                        Maturato {formatCurrency(coverage.accruedCoverage)} ·
                        liquidato dall&apos;ente{" "}
                        {formatCurrency(coverage.settledCoverage)}
                      </p>
                      <p className="mt-1 text-[0.95em] text-egw-ink-62">
                        La copertura non e un incasso: entra in cassa solo
                        quando l&apos;ente versa.
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                {/*
                  L'ordine non e casuale: «Paga online» sta sopra perche e
                  l'azione che si vuole incoraggiare, e perche la registrazione
                  manuale la compie chi conosce gia questa schermata.
                */}
                {/*
                  L'etichetta non porta piu l'importo: il pulsante **apre una
                  finestra** in cui l'importo si sceglie, e prometterne uno
                  prima renderebbe l'acconto una sorpresa invece di un'opzione.
                */}
                {onManageCoverage && canManage ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1 sm:w-auto"
                    onClick={() => onManageCoverage(ledger)}
                  >
                    <HandCoins className="h-3.5 w-3.5" />
                    {coverage ? "Copertura" : "Copri con un voucher"}
                  </Button>
                ) : null}
                {onPayOnline && residuoFamiglia > 0 ? (
                  <Button
                    size="sm"
                    className="w-full gap-1 sm:w-auto"
                    onClick={() => onPayOnline(ledger)}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Paga online
                  </Button>
                ) : null}

                {/*
                  «In verifica» e uno stato vero, non l'assenza di uno stato: e
                  quello in cui una famiglia si trova fra il pagamento e la
                  conferma firmata del provider. Con SEPA o bonifico puo durare
                  giorni, e dire «pagato» nel frattempo sarebbe una bugia che si
                  scopre in contabilita.
                */}
                {pendingOnlineInstallmentId &&
                pendingOnlineInstallmentId === String(ledger.installmentId) ? (
                  <Badge variant="outline" className="border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800">
                    Pagamento in verifica
                  </Badge>
                ) : null}

                {canManage && ledger.residualAmount > 0 && onRegisterPayment ? (
                  <Button
                    size="sm"
                    variant={onPayOnline ? "outline" : "default"}
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
              <div className="mt-3 rounded-egw-control border border-egw-rule dark:border-slate-800">
                <TransactionRows
                  transactions={ledger.transactions}
                  canManage={canManage}
                  busyTransactionId={busyTransactionId}
                  onReverse={
                    onReverseTransaction
                      ? (transaction) => onReverseTransaction(transaction, ledger)
                      : undefined
                  }
                  onRefund={
                    onRefundTransaction
                      ? (transaction) => onRefundTransaction(transaction, ledger)
                      : undefined
                  }
                  refundAvailabilityFor={refundAvailabilityFor}
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

                {canManage && (onEditInstallment || onDeleteInstallment) ? (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-egw-rule p-2 dark:border-slate-800">
                    {onEditInstallment && ledger.paidAmount === 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onEditInstallment(ledger)}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Modifica rata
                      </Button>
                    ) : null}
                    {/*
                      Una rata su cui e gia entrato denaro non si elimina: si
                      **annulla**, e resta nello storico. L'etichetta lo dice
                      prima del clic, invece di farlo scoprire da un messaggio
                      di rifiuto.
                    */}
                    {onDeleteInstallment ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-egw-tint-red-bd text-egw-red hover:bg-egw-tint-red"
                        onClick={() => onDeleteInstallment(ledger)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        {ledger.paidAmount > 0 ? "Annulla rata" : "Elimina rata"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
