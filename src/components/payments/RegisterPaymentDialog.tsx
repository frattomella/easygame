"use client";

import React from "react";
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
  toPaymentAmount,
  validatePaymentTransactionInput,
  type InstallmentLedger,
} from "@/lib/payments/installment-ledger";

/**
 * «Registra pagamento»: **l'unica** finestra con cui si incassa una rata.
 *
 * Sostituisce il gesto che la segreteria era costretta a fare — aprire la
 * rata e spostare uno stato da «In attesa» a «Pagata» — con quello che sta
 * davvero succedendo: e arrivato del denaro, in una certa data, con un certo
 * metodo. Lo stato lo ricava il registro (ADR-0036).
 *
 * **L'importo e precompilato con il residuo e resta modificabile.** Il caso
 * comune e il saldo, e chiedere di ridigitarlo ogni volta e attrito inutile;
 * il caso che prima non esisteva — 50 su una rata da 130 — si ottiene
 * cambiando un campo gia a fuoco.
 *
 * Lo stesso componente serve la scheda atleta e l'area Movimenti: una seconda
 * finestra «quasi uguale» e il modo in cui i due percorsi tornano a divergere.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

export type RegisterPaymentSubmission = {
  amount: number;
  paymentMethod: string;
  paidAt: string;
  notes: string;
};

export type RegisterPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La rata da incassare. `null` finche non se ne apre una. */
  ledger: InstallmentLedger | null;
  athleteName?: string | null;
  /** I metodi configurati dal club. Mai testo libero (ADR-0036). */
  methodChoices?: string[];
  isSaving?: boolean;
  onSubmit: (submission: RegisterPaymentSubmission) => void | Promise<void>;
};

export function RegisterPaymentDialog({
  open,
  onOpenChange,
  ledger,
  athleteName,
  methodChoices = [],
  isSaving = false,
  onSubmit,
}: RegisterPaymentDialogProps) {
  const [amount, setAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(todayIsoDate());
  const [notes, setNotes] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  /*
    I campi si ripopolano ogni volta che la finestra si apre su una rata:
    tenerli fra due aperture porterebbe l'importo della rata precedente su
    quella nuova, che e il tipo di errore che si scopre a fine mese.
  */
  React.useEffect(() => {
    if (!open || !ledger) return;

    setAmount(ledger.residualAmount > 0 ? ledger.residualAmount.toFixed(2) : "");
    setPaymentMethod(methodChoices[0] || "");
    setPaidAt(todayIsoDate());
    setNotes("");
    setTouched(false);
    // `methodChoices` e un array ricostruito a ogni render: dipendere dal suo
    // contenuto rimetterebbe a zero i campi mentre si scrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ledger?.installmentId]);

  const parsedAmount = toPaymentAmount(amount);
  const validationError = ledger
    ? validatePaymentTransactionInput({
        amount,
        paymentMethod,
        ledger,
      })
    : null;

  const residualAfter = ledger
    ? Math.max(0, Number((ledger.residualAmount - parsedAmount).toFixed(2)))
    : 0;

  const handleSubmit = async () => {
    setTouched(true);
    if (!ledger || validationError) return;

    await onSubmit({
      amount: parsedAmount,
      paymentMethod,
      paidAt,
      notes: notes.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registra pagamento</DialogTitle>
          <DialogDescription>
            {ledger ? ledger.label : "Rata"}
            {athleteName ? ` — ${athleteName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="registra-pagamento-importo">Importo (EUR) *</Label>
              <Input
                id="registra-pagamento-importo"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => {
                  setTouched(true);
                  setAmount(event.target.value);
                }}
              />
              {ledger && ledger.residualAmount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Precompilato con il residuo della rata. Modificalo per
                  registrare un acconto.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="registra-pagamento-data">Data incasso *</Label>
              <Input
                id="registra-pagamento-data"
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="registra-pagamento-metodo">
              Metodo di pagamento *
            </Label>
            <Select
              value={paymentMethod}
              onValueChange={(value) => {
                setTouched(true);
                setPaymentMethod(value);
              }}
            >
              <SelectTrigger id="registra-pagamento-metodo">
                <SelectValue placeholder="Seleziona un metodo" />
              </SelectTrigger>
              <SelectContent>
                {methodChoices.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {methodChoices.length === 0 ? (
              <p className="text-xs text-amber-600">
                Nessun metodo di incasso configurato: aggiungine uno nelle
                impostazioni del club prima di registrare un pagamento.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="registra-pagamento-note">Note</Label>
            <Textarea
              id="registra-pagamento-note"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Es. acconto consegnato in segreteria"
            />
          </div>

          {ledger ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/50">
              <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">
                Riepilogo
              </p>
              <dl className="space-y-1">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Importo dovuto</dt>
                  <dd className="font-medium">
                    {formatCurrency(ledger.dueAmount)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Gia incassato</dt>
                  <dd className="font-medium">
                    {formatCurrency(ledger.paidAmount)}
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

          {touched && validationError ? (
            <p className="text-sm font-medium text-red-600">{validationError}</p>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Annulla
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={() => void handleSubmit()}
            disabled={isSaving || Boolean(validationError)}
          >
            {isSaving ? "Registrazione..." : "Registra pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
