"use client";

import React from "react";
import { CreditCard } from "lucide-react";
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
  toPaymentAmount,
  validateOnlinePaymentAmount,
  type InstallmentLedger,
} from "@/lib/payments/installment-ledger";

/**
 * «Paga online»: **l'unica** finestra da cui parte un incasso verso il PSP.
 *
 * **Perche esiste, e cosa c'era prima.** Prima il pulsante apriva il checkout
 * per il **residuo intero**, senza chiedere niente. Il registro incassi sa
 * gestire una rata pagata in piu volte da sempre (ADR-0036) e il server
 * accettava gia un importo parziale: l'unico punto in cui l'acconto era
 * impossibile era il canale online — cioe proprio quello che una famiglia usa
 * da sola, di sera, senza poter chiamare la segreteria. Il canale manuale era
 * piu flessibile di quello automatico, che e il verso sbagliato.
 *
 * **Perche e una finestra e non un campo nella riga.** Perche il gesto porta
 * fuori dall'applicazione: dopo la conferma si finisce sulla pagina di Stripe.
 * Un campo che al primo `Invio` fa cambiare dominio e una trappola; una
 * finestra dice cosa sta per succedere prima che succeda.
 *
 * **Simmetrica a «Registra pagamento», di proposito.** Stesso importo
 * precompilato con il residuo, stesso riepilogo «dovuto / questo pagamento /
 * residuo dopo», stessa frase quando la rata restera parziale. Sono due
 * canali per lo stesso fatto, e presentarli in due modi diversi
 * costringerebbe a impararli due volte.
 *
 * **L'unica asimmetria, ed e voluta: qui non si puo eccedere il residuo.** Il
 * canale manuale accetta un incasso superiore, perche puo essere gia successo.
 * Online il pagamento non e ancora avvenuto: farlo partire per piu del dovuto
 * **creerebbe** il credito invece di registrarlo.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

export type PayOnlineDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledger: InstallmentLedger | null;
  athleteName?: string | null;
  isSubmitting?: boolean;
  /** L'importo arriva in **euro**: la conversione in centesimi sta nel chiamante. */
  onConfirm: (amount: number) => void | Promise<void>;
};

export function PayOnlineDialog({
  open,
  onOpenChange,
  ledger,
  athleteName,
  isSubmitting = false,
  onConfirm,
}: PayOnlineDialogProps) {
  const [amount, setAmount] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  /*
    Il campo si ricompone a ogni apertura sulla rata scelta. Senza, riaprire la
    finestra su una rata diversa mostrerebbe l'importo di quella precedente —
    e sarebbe l'importo su cui si preme «Paga».
  */
  React.useEffect(() => {
    if (!open || !ledger) return;

    setTouched(false);
    setAmount(
      ledger.residualAmount > 0 ? ledger.residualAmount.toFixed(2) : "",
    );
  }, [open, ledger]);

  const parsedAmount = toPaymentAmount(amount);
  const validationError = validateOnlinePaymentAmount({ amount, ledger });

  const residualAfter = ledger
    ? Math.max(0, Number((ledger.residualAmount - parsedAmount).toFixed(2)))
    : 0;

  const handleConfirm = async () => {
    if (validationError) {
      setTouched(true);
      return;
    }

    await onConfirm(parsedAmount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paga online</DialogTitle>
          <DialogDescription>
            {ledger ? ledger.label : "Rata"}
            {athleteName ? ` — ${athleteName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="paga-online-importo">Importo da pagare (EUR) *</Label>
            <Input
              id="paga-online-importo"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              max={ledger ? ledger.residualAmount : undefined}
              value={amount}
              onChange={(event) => {
                setTouched(true);
                setAmount(event.target.value);
              }}
            />
            {ledger && ledger.residualAmount > 0 ? (
              <p className="text-xs text-muted-foreground">
                Precompilato con il residuo della rata. Puoi versare un acconto
                inferiore; non puoi pagare piu del residuo.
              </p>
            ) : null}
          </div>

          {ledger ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40">
              <dl className="space-y-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Residuo della rata</dt>
                  <dd className="font-medium">
                    {formatCurrency(ledger.residualAmount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Questo pagamento</dt>
                  <dd className="font-medium">{formatCurrency(parsedAmount)}</dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-1 dark:border-slate-800">
                  <dt className="font-medium">Residuo dopo</dt>
                  <dd className="font-semibold">
                    {formatCurrency(residualAfter)}
                  </dd>
                </div>
              </dl>
              {residualAfter > 0 && parsedAmount > 0 ? (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  La rata restera parzialmente pagata.
                </p>
              ) : null}
            </div>
          ) : null}

          {/*
            Cosa succede dopo il clic, detto prima del clic: si cambia sito, e
            al ritorno la rata non risultera pagata subito. E la sequenza vera,
            e scoprirla dopo genera la telefonata che questa riga evita.
          */}
          <p className="text-xs text-muted-foreground">
            Il pagamento si conclude sulla pagina sicura di Stripe. Al ritorno
            la rata resta «in verifica» finche la conferma del provider non
            arriva: con carta e questione di secondi, con bonifico o addebito
            SEPA puo richiedere giorni.
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
            <CreditCard className="h-3.5 w-3.5" />
            {isSubmitting
              ? "Apertura..."
              : `Paga ${formatCurrency(parsedAmount)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
