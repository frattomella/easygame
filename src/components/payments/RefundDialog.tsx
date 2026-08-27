"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  REFUND_REASONS,
  previewInstallmentAfterRefund,
  previewRefund,
  validateRefundAmount,
  type RefundAvailability,
} from "@/lib/payments/refunds";
import {
  toPaymentAmount,
  type InstallmentLedger,
  type NormalizedPaymentTransaction,
} from "@/lib/payments/installment-ledger";

/**
 * «Rimborsa»: **l'unica** finestra da cui EasyGame restituisce denaro a una
 * famiglia.
 *
 * **Cosa c'era prima, e perche non bastava.** Nulla, dentro EasyGame. Il
 * gateway sapeva rimborsare dal Blocco D e il registro sapeva registrare il
 * rimborso quando l'evento tornava indietro, ma per avviarlo il club doveva
 * entrare nel cruscotto Stripe. Funzionava, e chiedeva a una segreteria
 * sportiva di saper riconoscere un `pi_…` in un elenco di pagamenti per fare
 * una cosa che EasyGame le mostra gia in scheda — con il rischio, ogni volta,
 * di rimborsare il pagamento sbagliato.
 *
 * **Simmetrica a «Paga online», di proposito.** Stesso importo precompilato con
 * il massimo consentito, stesso riepilogo «prima / questo movimento / dopo»,
 * stessa riga che dice cosa succedera alla rata. Sono due direzioni dello
 * stesso denaro, e presentarle in due modi diversi costringerebbe a impararle
 * due volte.
 *
 * **Le due asimmetrie, ed entrambe sono volute.**
 *
 * 1. **Il motivo e un catalogo, non un campo libero.** Perche viaggia fino a
 *    Stripe, che ne accetta tre: un campo libero avrebbe prodotto un rifiuto
 *    del provider al posto di un errore di compilazione. Le note interne, che
 *    invece sono libere, restano in EasyGame e non partono.
 * 2. **Dopo la conferma non si dice «rimborsato».** Si dice «in elaborazione»
 *    finche l'evento firmato non arriva. La risposta HTTP di Stripe non e il
 *    registro: un rimborso puo nascere `pending` e restarci, e raccontare alla
 *    famiglia che i soldi sono tornati mentre sono ancora in viaggio e la cosa
 *    che poi si deve disdire.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const fromCents = (cents: number) => Number((cents / 100).toFixed(2));

export type RefundSubmission = {
  /** In **centesimi**: il denaro non viaggia in virgola mobile. */
  amountCents: number;
  reason: string;
  notes: string;
};

export type RefundDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** L'incasso da rimborsare. Uno, non una rata. */
  transaction: NormalizedPaymentTransaction | null;
  /** La rata a cui appartiene: serve a dire come restera dopo. */
  ledger?: InstallmentLedger | null;
  availability: RefundAvailability | null;
  athleteName?: string | null;
  isSubmitting?: boolean;
  onConfirm: (submission: RefundSubmission) => void | Promise<void>;
};

export function RefundDialog({
  open,
  onOpenChange,
  transaction,
  ledger = null,
  availability,
  athleteName,
  isSubmitting = false,
  onConfirm,
}: RefundDialogProps) {
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState<string>(
    REFUND_REASONS[0]?.value || "",
  );
  const [notes, setNotes] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  /*
    I campi si ricompongono a ogni apertura sull'incasso scelto. Senza,
    riaprire la finestra su un movimento diverso mostrerebbe l'importo di
    quello precedente — e sarebbe l'importo su cui si preme «Conferma».
  */
  const targetTransactionId = transaction?.id || "";
  const refundableCents = availability?.refundableCents ?? 0;

  /*
    **Le dipendenze sono valori, non oggetti, e non e un dettaglio di stile.**
    `availability` lo ricalcola chi monta questa finestra a **ogni** proprio
    render, e ne esce un oggetto nuovo ogni volta: elencarlo qui voleva dire
    rieseguire questo effetto a ogni render del genitore, cioe **riscrivere
    l'importo che qualcuno aveva appena digitato**. Una segreteria scriveva 30,
    il genitore si aggiornava per una ragione qualsiasi — il registro riletto,
    un avviso comparso — e il campo tornava a 130: l'intero incasso, sul
    pulsante che poi si preme. Osservato a runtime nel collaudo E-13.

    `refundableCents` cambia solo quando cambia davvero quanto si puo
    restituire, e allora ricomporre e giusto: il massimo consentito si e
    spostato sotto le mani di chi sta scrivendo.
  */
  React.useEffect(() => {
    if (!open) return;

    setTouched(false);
    setReason(REFUND_REASONS[0]?.value || "");
    setNotes("");
    setAmount(
      refundableCents > 0 ? fromCents(refundableCents).toFixed(2) : "",
    );
  }, [open, targetTransactionId, refundableCents]);

  const parsedAmount = toPaymentAmount(amount);
  const amountCents = Math.round(parsedAmount * 100);
  const validationError = validateRefundAmount({ amount, availability });

  const preview = transaction
    ? previewRefund({ transaction, amountCents })
    : null;

  const installmentAfter = previewInstallmentAfterRefund({
    ledger,
    amountCents,
  });

  const handleConfirm = async () => {
    if (validationError) {
      setTouched(true);
      return;
    }

    await onConfirm({ amountCents, reason, notes });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rimborsa</DialogTitle>
          <DialogDescription>
            {ledger ? ledger.label : "Incasso"}
            {athleteName ? ` — ${athleteName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/*
            I tre numeri di partenza, prima del campo: chi apre questa finestra
            sta decidendo *quanto*, e la decisione si prende leggendo questi.
          */}
          {availability ? (
            <dl className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Pagamento originale</dt>
                <dd className="font-medium">
                  {formatCurrency(fromCents(availability.originalCents))}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Gia rimborsato</dt>
                <dd className="font-medium">
                  {formatCurrency(fromCents(availability.refundedCents))}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-1 dark:border-slate-800">
                <dt className="font-medium">Rimborsabile</dt>
                <dd className="font-semibold">
                  {formatCurrency(fromCents(availability.refundableCents))}
                </dd>
              </div>
            </dl>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="rimborso-importo">
              Importo da rimborsare (EUR) *
            </Label>
            <Input
              id="rimborso-importo"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              max={
                availability ? fromCents(availability.refundableCents) : undefined
              }
              value={amount}
              onChange={(event) => {
                setTouched(true);
                setAmount(event.target.value);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Precompilato con tutto il rimborsabile. Puoi restituire una parte;
              non puoi restituire piu di quanto e stato incassato su questo
              movimento.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rimborso-motivo">Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="rimborso-motivo">
                <SelectValue placeholder="Seleziona un motivo" />
              </SelectTrigger>
              <SelectContent>
                {REFUND_REASONS.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Il motivo viaggia fino al provider: sono i tre che riconosce.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rimborso-note">Note interne</Label>
            <Textarea
              id="rimborso-note"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Restano in EasyGame: al provider non vengono inviate."
            />
          </div>

          {/* ------------------------------------------ cosa succede dopo */}

          {preview ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Dopo il rimborso
              </p>
              <dl className="space-y-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    Netto incassato su questo movimento
                  </dt>
                  <dd className="font-medium">
                    {formatCurrency(fromCents(preview.netCollectedCents))}
                  </dd>
                </div>

                {installmentAfter ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Residuo della rata</dt>
                      <dd className="font-medium">
                        {formatCurrency(installmentAfter.residualAmount)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Stato della rata</dt>
                      <dd className="font-medium">
                        {installmentAfter.statusLabels.join(" · ")}
                      </dd>
                    </div>
                  </>
                ) : null}

                {/*
                  La quota di piattaforma restituita si mostra perche e denaro
                  del club: senza `refund_application_fee` resterebbe a
                  EasyGame, e a rimetterla sarebbe la societa che ha
                  rimborsato. Dirlo qui e il modo per accorgersene se un giorno
                  smettesse di succedere.
                */}
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-1 dark:border-slate-800">
                  <dt className="text-muted-foreground">
                    Commissione EasyGame restituita
                  </dt>
                  <dd className="font-medium">
                    {preview.settlement
                      ? formatCurrency(
                          fromCents(preview.platformFeeRefundedCents),
                        )
                      : "—"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Il rimborso viene chiesto al provider e resta «in elaborazione»
            finche la sua conferma firmata non arriva: con carta e questione di
            secondi, con bonifico o addebito SEPA puo richiedere giorni.
            L&apos;incasso originale non viene cancellato — il rimborso e un
            movimento a parte, e restano visibili entrambi.
          </p>

          {touched && validationError ? (
            <p className="text-sm font-medium text-red-600">{validationError}</p>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Annulla
          </Button>
          <Button
            className="w-full gap-1 sm:w-auto"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || Boolean(validationError)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {isSubmitting
              ? "Invio al provider..."
              : `Conferma rimborso ${formatCurrency(parsedAmount)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
