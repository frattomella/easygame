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
  paid: "border-egw-tint-green-bd bg-egw-tint-green text-egw-green hover:bg-egw-tint-green",
  partial: "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800 hover:bg-egw-tint-blue",
  pending: "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink hover:bg-egw-tint-amber",
  unbilled: "border-egw-hairline bg-egw-page-100 text-egw-ink-72 hover:bg-[#e9eef9]",
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
  payNowUnavailableReason = null,
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
  /**
   * **Perche il pagamento online non e disponibile adesso** (PP-02 §D).
   *
   * Il canale di incasso e una proprieta del **club**, e questo componente
   * conosce solo le rate: senza questa prop scriveva «Il pagamento si apre
   * dalla singola rata» accanto a pulsanti che rispondevano con un errore.
   * Quando c'e, vince sulla didascalia ricavata dalle rate e spegne anche i
   * pulsanti di riga.
   */
  payNowUnavailableReason?: string | null;
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
  /*
    **PP-02 §D. Il canale non lo sa questa schermata, e adesso glielo si dice.**

    I quattro casi qui sotto si ricavano dalle **rate**, che questo componente
    ha in mano. Il quinto no: se la societa non ha configurato gli incassi
    online, o se il fornitore sta ancora verificando il conto, questa
    schermata non ha modo di saperlo — e infatti scriveva «Il pagamento si apre
    dalla singola rata, qui sotto» accanto a righe i cui pulsanti rispondevano
    con un errore rosso.

    Quando il motivo arriva da fuori vince, e spegne anche i pulsanti di riga:
    lasciarli accesi accanto a una frase che dice che non si puo pagare e la
    stessa contraddizione, spostata di dieci centimetri.
  */
  const canaleSpento = String(payNowUnavailableReason || "").trim();
  const payNowHint = canaleSpento
    ? canaleSpento
    : payNowPending
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
          <h3 className="text-lg font-semibold text-egw-ink dark:text-slate-50">
            {summary?.planName || "Nessun piano selezionato"}
          </h3>
          {summary?.planDescription ? (
            <p className="mt-1 text-sm text-egw-ink-72 dark:text-egw-ink-42">
              {summary.planDescription}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-egw-ink-62">
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
              disabled={!onPayNow || payNowPending || Boolean(canaleSpento)}
              onClick={
                onPayNow && !canaleSpento ? () => onPayNow() : undefined
              }
            >
              <CreditCard className="mr-2 h-4 w-4" />
              {payNowPending ? "Apertura…" : "Paga ora"}
            </Button>
            <p className="mt-2 text-xs text-egw-ink-62">{payNowHint}</p>
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
        <div className="rounded-egw-control bg-egw-page-100 p-4 dark:bg-slate-900/40">
          <p className="text-sm font-medium text-muted-foreground">
            Totale servizi
          </p>
          <p className="mt-1 text-2xl font-bold text-egw-ink dark:text-slate-100">
            {formatCurrency(summary?.grossAmount)}
          </p>
        </div>
        <div className="rounded-egw-control bg-egw-tint-amber p-4 dark:bg-amber-900/20">
          <p className="text-sm font-medium text-muted-foreground">Sconti</p>
          <p className="mt-1 text-2xl font-bold text-egw-amber-ink dark:text-amber-300">
            -{formatCurrency(summary?.totalDiscounts)}
          </p>
        </div>
        <div className="rounded-egw-control bg-egw-tint-green p-4 dark:bg-green-900/20">
          <p className="text-sm font-medium text-muted-foreground">
            {showSettlementTotals ? "Totale dovuto" : "Quota del piano"}
          </p>
          <p className="mt-1 text-2xl font-bold text-egw-green dark:text-green-300">
            {formatCurrency(summary?.expectedTotal)}
          </p>
        </div>
        {showSettlementTotals ? (
          <div className="rounded-egw-control bg-egw-tint-blue p-4 dark:bg-egw-navy-900/20">
            <p className="text-sm font-medium text-muted-foreground">Residuo</p>
            <p className="mt-1 text-2xl font-bold text-egw-blue-700 dark:text-blue-300">
              {formatCurrency(summary?.residual)}
            </p>
            <p className="mt-1 text-xs text-egw-blue-700 dark:text-blue-300">
              Pagato {formatCurrency(summary?.recordedPaid)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-egw-control border border-egw-hairline bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-egw-blue-700" />
          <h4 className="font-semibold text-egw-ink dark:text-slate-50">
            Cosa include
          </h4>
        </div>
        {services.length > 0 ? (
          <div className="divide-y divide-egw-rule dark:divide-slate-800">
            {services.map((service: any) => (
              <div
                key={service.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-egw-ink dark:text-slate-100">
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
                    <p className="mt-1 text-sm text-egw-ink-62">
                      {service.description}
                    </p>
                  ) : null}
                </div>
                <p className="font-semibold text-egw-ink dark:text-slate-50">
                  {formatCurrency(service.price)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-egw-ink-62">
            Nessun servizio dettagliato collegato a questo piano.
          </p>
        )}
      </div>

      {discounts.length > 0 ? (
        <div className="rounded-egw-control border border-egw-tint-amber-bd bg-egw-tint-amber p-4">
          <p className="mb-2 font-semibold text-amber-950">Sconti applicati</p>
          <div className="flex flex-wrap gap-2">
            {discounts.map((discount: any) => (
              <Badge
                key={discount.id}
                variant="secondary"
                className="bg-white text-egw-amber-ink"
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
              ? "rounded-egw-control border border-egw-tint-amber-bd bg-egw-tint-amber p-4 text-sm text-egw-amber-ink"
              : "rounded-egw-control border border-egw-tint-blue-bd bg-egw-tint-blue p-4 text-sm text-egw-blue-800"
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
        <div className="rounded-egw-control border border-egw-hairline bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <p className="mb-3 font-semibold text-egw-ink dark:text-slate-50">
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
                  className="flex flex-col justify-between gap-1 rounded-egw-control bg-egw-page-100 px-3 py-2 sm:flex-row sm:items-center dark:bg-slate-900/60"
                >
                  <div>
                    <p className="font-medium">{installment.label}</p>
                    <p className="text-xs text-egw-ink-62">
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
        <div className="rounded-egw-control border border-egw-hairline bg-white p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <p className="mb-3 font-semibold text-egw-ink dark:text-slate-50">
            Storico pagamenti
          </p>
          {paymentItems.length > 0 ? (
            <div className="divide-y divide-egw-rule dark:divide-slate-800">
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
                      <p className="font-medium text-egw-ink dark:text-slate-100">
                        {payment.description || "Pagamento"}
                      </p>
                      <p className="text-sm text-egw-ink-62">
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
                            ? "border-egw-hairline bg-egw-page-100 text-egw-ink-72"
                            : isPaid
                            ? "border-egw-tint-green-bd bg-egw-tint-green text-egw-green"
                            : "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink"
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
                          disabled={payNowPending || Boolean(canaleSpento)}
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
            <p className="text-sm text-egw-ink-62">
              Nessun pagamento registrato.
            </p>
          )}
        </div>
      ) : null}

      {summary?.planNotes && mode === "club" ? (
        <p className="rounded-egw-control bg-egw-page-100 p-3 text-sm text-egw-ink-72 dark:bg-slate-900/60 dark:text-egw-ink-42">
          {summary.planNotes}
        </p>
      ) : null}
    </div>
  );
}
