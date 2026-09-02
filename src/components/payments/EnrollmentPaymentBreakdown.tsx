"use client";

import { AlertCircle, CheckCircle2, CreditCard, FileText } from "lucide-react";
import { isPayableAthletePayment } from "@/lib/athlete-payment-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  resolveInstallmentPaymentStatus,
  type InstallmentPaymentState,
} from "@/lib/payments/payment-status-utils";
import { describeProrationResult } from "@/lib/payment-plan-utils";

const INSTALLMENT_BADGE_CLASS: Record<InstallmentPaymentState, string> = {
  paid: "border-green-200 bg-green-50 text-green-700 hover:bg-green-50",
  partial: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50",
  pending: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
  unbilled: "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100",
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
    month: "short",
    year: "numeric",
  });
};

const getServiceTypeLabel = (type: unknown) => {
  switch (String(type || "").toLowerCase()) {
    case "iscrizione":
      return "Iscrizione";
    case "allenamenti":
      return "Allenamenti";
    case "assicurazione":
      return "Assicurazione";
    case "kit":
      return "Kit";
    case "gare":
      return "Torneo/Gare";
    default:
      return "Altro";
  }
};

const normalizePaymentDate = (payment: Record<string, any>) =>
  payment.paidAt ||
  payment.paid_at ||
  payment.dueDate ||
  payment.due_date ||
  payment.date ||
  payment.created_at;

const isCancelledPayment = (payment: Record<string, any>) => {
  const status = String(payment.statusKey || payment.status || "")
    .trim()
    .toLowerCase();
  return (
    status === "cancelled" ||
    status === "voided" ||
    status === "deleted" ||
    status === "annullato" ||
    payment.data?.excludedFromTotals === true
  );
};

export function EnrollmentPaymentBreakdown({
  summary,
  payments = [],
  mode = "club",
  showPayNow = false,
  onPayNow,
  onPayInstalment,
  payNowPending = false,
  showPaymentHistory = true,
  showSettlementTotals = true,
}: {
  summary?: Record<string, any> | null;
  payments?: Array<Record<string, any>>;
  mode?: "club" | "parent";
  showPayNow?: boolean;
  /** Quando manca, il pulsante resta disabilitato: non c'e una rata da pagare. */
  onPayNow?: () => void;
  /**
   * Paga **questa** rata.
   *
   * W6-08. `onPayNow` apre la prima rata aperta, ed e cio che una famiglia
   * intende premendo il pulsante in cima. Ma con un piano a piu rate «la
   * prima» non e sempre quella che si vuole saldare, e la riga sa gia di
   * quale rata parla: chiederlo altrove sarebbe una domanda con la risposta
   * gia sotto gli occhi.
   *
   * Chi non la passa — la scheda del club — non vede nessun pulsante in riga.
   */
  onPayInstalment?: (payment: Record<string, any>) => void;
  payNowPending?: boolean;
  showPaymentHistory?: boolean;
  /**
   * «Totale dovuto», «Residuo» e «Pagato».
   *
   * **Vanno spenti dove il riepilogo dell'iscrizione li mostra gia**
   * (ADR-0056). Non e solo una ripetizione: i due numeri vengono da due
   * calcoli diversi — questo dal piano configurato, quello dalle rate reali —
   * e su un atleta con voci fuori piano si contraddicono a schermo. La
   * composizione spiega **come nasce** il totale; quanto e stato incassato lo
   * dice il registro, e lo dice una volta sola.
   */
  showSettlementTotals?: boolean;
}) {
  const services = Array.isArray(summary?.services) ? summary?.services : [];
  const discounts = Array.isArray(summary?.appliedDiscounts)
    ? summary?.appliedDiscounts
    : [];
  const installments = Array.isArray(summary?.installments)
    ? summary?.installments
    : [];
  const paymentItems = Array.isArray(payments) ? payments : [];
  /*
    **La didascalia sotto «Paga ora» diceva il falso.**

    Diceva «Pagamento online presto disponibile» ogni volta che `onPayNow`
    mancava — cioe ogni volta che **non c'e una rata aperta**, che e la
    condizione di una famiglia in regola. Il checkout esiste, e cablato, e la
    stessa schermata lo apre riga per riga con `onPayInstalment`: informare chi
    ha pagato tutto che la funzione non c'e ancora e una bugia con il segno
    invertito.

    I casi veri sono quattro, e si distinguono qui perche qui ci sono i dati
    per farlo: le righe di pagamento, che dicono se ne esistono e se ne resta
    qualcuna da saldare.
  */
  const rateAttive = paymentItems.filter(
    (payment) => !isCancelledPayment(payment),
  );
  const payNowHint = payNowPending
    ? "Ti stiamo portando al pagamento sicuro del club."
    : onPayNow
      ? "Si apre il pagamento sicuro del club"
      : rateAttive.length === 0
        ? "Il club non ha ancora emesso rate: non c'e niente da pagare."
        : rateAttive.some(isPayableAthletePayment)
          ? onPayInstalment
            ? "Il pagamento si apre dalla singola rata, qui sotto."
            : "Il pagamento online non e attivo su questa schermata."
          : "Nessuna rata da pagare: risulta tutto saldato.";
  const proration = summary?.prorationResult
    ? describeProrationResult(summary.prorationResult as any)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Piano / abbonamento
          </p>
          <h3 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
            {summary?.planName || "Nessun piano selezionato"}
          </h3>
          {summary?.planDescription ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {summary.planDescription}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            {summary?.enrollmentDate ? (
              <Badge variant="outline">
                Data iscrizione {formatDate(summary.enrollmentDate)}
              </Badge>
            ) : null}
            {summary?.enrollmentStartDate || summary?.subscriptionStartDate ? (
              <Badge variant="outline">
                Inizio abbonamento{" "}
                {formatDate(
                  summary.subscriptionStartDate || summary.enrollmentStartDate,
                )}
              </Badge>
            ) : null}
          </div>
        </div>
        {showPayNow ? (
          <div className="md:text-right">
            {/*
              **Il pulsante era disabilitato con «presto disponibile».**

              Il checkout esisteva gia per intero — dominio, entitlement, token
              opaco, ritorno, webhook — e l'unico modo per pagare online era il
              link che la segreteria doveva emettere e mandare a mano. Cio che
              mancava era una porta con l'**identita della sessione**, ed e
              `onPayNow` a fornirla: se chi usa questo componente non la
              passa, il pulsante resta com'era, perche in quel contesto non c'e
              nessuna rata da pagare.
            */}
            <Button
              className="w-full md:w-auto"
              disabled={!onPayNow || payNowPending}
              onClick={onPayNow ? () => onPayNow() : undefined}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {payNowPending ? "Apertura…" : "Paga ora"}
            </Button>
            <p className="mt-2 text-xs text-slate-500">{payNowHint}</p>
          </div>
        ) : null}
      </div>

      <div
        className={
          showSettlementTotals
            ? "grid grid-cols-1 gap-3 md:grid-cols-4"
            : "grid grid-cols-1 gap-3 md:grid-cols-3"
        }
      >
        <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900/40">
          <p className="text-sm font-medium text-muted-foreground">
            Totale servizi
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {formatCurrency(summary?.grossAmount)}
          </p>
        </div>
        <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-muted-foreground">Sconti</p>
          <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-300">
            -{formatCurrency(summary?.totalDiscounts)}
          </p>
        </div>
        <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
          <p className="text-sm font-medium text-muted-foreground">
            {showSettlementTotals ? "Totale dovuto" : "Quota del piano"}
          </p>
          <p className="mt-1 text-2xl font-bold text-green-700 dark:text-green-300">
            {formatCurrency(summary?.expectedTotal)}
          </p>
        </div>
        {showSettlementTotals ? (
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <p className="text-sm font-medium text-muted-foreground">Residuo</p>
            <p className="mt-1 text-2xl font-bold text-blue-700 dark:text-blue-300">
              {formatCurrency(summary?.residual)}
            </p>
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
              Pagato {formatCurrency(summary?.recordedPaid)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600" />
          <h4 className="font-semibold text-slate-950 dark:text-slate-50">
            Cosa include
          </h4>
        </div>
        {services.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {services.map((service: any) => (
              <div
                key={service.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {service.name}
                    </p>
                    <Badge variant="secondary">
                      {getServiceTypeLabel(service.type)}
                    </Badge>
                    {service.optional ? (
                      <Badge variant="outline">Opzionale</Badge>
                    ) : (
                      <Badge variant="outline">Obbligatorio</Badge>
                    )}
                  </div>
                  {service.description ? (
                    <p className="mt-1 text-sm text-slate-500">
                      {service.description}
                    </p>
                  ) : null}
                </div>
                <p className="font-semibold text-slate-950 dark:text-slate-50">
                  {formatCurrency(service.price)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Nessun servizio dettagliato collegato a questo piano.
          </p>
        )}
      </div>

      {discounts.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 font-semibold text-amber-950">Sconti applicati</p>
          <div className="flex flex-wrap gap-2">
            {discounts.map((discount: any) => (
              <Badge
                key={discount.id}
                variant="secondary"
                className="bg-white text-amber-900"
              >
                {discount.label}: -{formatCurrency(discount.amount)}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {proration && proration.tone !== "neutral" ? (
        /*
          Il riquadro compare quando c'e qualcosa da dire: il pro-rata e stato
          applicato, oppure e acceso e non si riesce a calcolarlo. Un piano che
          il pro-rata non lo prevede non merita un riquadro che dica
          «non applicato»: e la sua condizione normale.
        */
        <div
          className={
            proration.tone === "warning"
              ? "rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
              : "rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"
          }
        >
          <p className="font-semibold">{proration.label}</p>
          {proration.detail ? <p className="mt-1">{proration.detail}</p> : null}
          {summary?.prorationResult?.adjusted ? (
            <p className="mt-1">
              Totale originario{" "}
              {formatCurrency(summary.prorationResult.originalTotal)}, ricalcolato
              a {formatCurrency(summary.prorationResult.total)}.
            </p>
          ) : null}
        </div>
      ) : null}

      {installments.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <p className="mb-3 font-semibold text-slate-950 dark:text-slate-50">
            Piano pagamento / rate
          </p>
          <div className="space-y-2">
            {installments.map((installment: any) => {
              const installmentStatus = resolveInstallmentPaymentStatus(
                installment,
                paymentItems,
              );

              return (
                <div
                  key={installment.id}
                  className="flex flex-col justify-between gap-1 rounded-lg bg-slate-50 px-3 py-2 sm:flex-row sm:items-center dark:bg-slate-900/60"
                >
                  <div>
                    <p className="font-medium">{installment.label}</p>
                    <p className="text-xs text-slate-500">
                      {installment.dueDate
                        ? `Scadenza ${formatDate(installment.dueDate)}`
                        : "Scadenza non definita"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">
                      {formatCurrency(installment.amount)}
                    </p>
                    <Badge
                      className={INSTALLMENT_BADGE_CLASS[installmentStatus.state]}
                    >
                      {installmentStatus.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {showPaymentHistory ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <p className="mb-3 font-semibold text-slate-950 dark:text-slate-50">
            Storico pagamenti
          </p>
          {paymentItems.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {paymentItems.map((payment) => {
                const isCancelled = isCancelledPayment(payment);
                const isPaid =
                  !isCancelled &&
                  (payment.statusKey === "paid" ||
                    payment.status === "Pagato" ||
                    Boolean(payment.paidAt || payment.paid_at));

                return (
                  <div
                    key={payment.id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {payment.description || "Pagamento"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDate(normalizePaymentDate(payment))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">
                        {formatCurrency(payment.amount)}
                      </span>
                      <Badge
                        variant="outline"
                        className={
                          isCancelled
                            ? "border-slate-200 bg-slate-100 text-slate-600"
                            : isPaid
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }
                      >
                        {isCancelled ? (
                          <AlertCircle className="mr-1 h-3 w-3" />
                        ) : isPaid ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : (
                          <AlertCircle className="mr-1 h-3 w-3" />
                        )}
                        {isCancelled
                          ? "Annullato"
                          : isPaid
                            ? "Saldato"
                            : "Da incassare"}
                      </Badge>
                      {/*
                        W6-08. Il pulsante compare solo dove qualcuno puo
                        davvero pagare — cioe quando `onPayInstalment` e
                        stato passato — e solo sulle righe che il dominio
                        dichiara pagabili. Non e la schermata a decidere
                        cosa e aperto: quel giudizio, ricostruito qui, e
                        esattamente il difetto che questa riga chiude.
                      */}
                      {onPayInstalment &&
                      isPayableAthletePayment(payment) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={payNowPending}
                          onClick={() => onPayInstalment(payment)}
                        >
                          Paga
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Nessun pagamento registrato.
            </p>
          )}
        </div>
      ) : null}

      {summary?.planNotes && mode === "club" ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
          {summary.planNotes}
        </p>
      ) : null}
    </div>
  );
}
