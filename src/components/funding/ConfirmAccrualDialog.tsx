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
import { Textarea } from "@/components/ui/textarea";
import { requirementUnitLabel } from "@/lib/funding/funding-model";

/**
 * La **conferma di maturazione** di un periodo (ADR-0054).
 *
 * E il gesto che, su un programma la cui frequenza ufficiale si registra
 * altrove, trasforma una previsione in un credito. Non e un campo «importo
 * maturato» libero dentro una tabella: e un atto con una data, un autore e un
 * riferimento, perche quel numero finira in una rendicontazione e qualcuno
 * dovra poter dire da dove viene.
 *
 * L'importo arriva **precompilato con la previsione** — nella maggior parte
 * dei casi le due coincidono — ma resta modificabile: quando non coincidono e
 * la fonte ufficiale ad avere ragione.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

export type AccrualConfirmationSubmission = {
  amount: number;
  confirmedAt: string;
  externalReference: string;
  notes: string;
};

export function ConfirmAccrualDialog({
  accrual,
  residualAmount,
  isSaving = false,
  onOpenChange,
  onSubmit,
}: {
  accrual: Record<string, any> | null;
  /** Quanto resta dell'importo assegnato al club, conferma esclusa. */
  residualAmount: number;
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (submission: AccrualConfirmationSubmission) => void | Promise<void>;
}) {
  const [amount, setAmount] = React.useState("");
  const [confirmedAt, setConfirmedAt] = React.useState("");
  const [externalReference, setExternalReference] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!accrual) return;

    /*
      La previsione e il valore di partenza perche e quello giusto quasi
      sempre. Un campo vuoto costringerebbe a ricopiare a mano un numero che
      EasyGame ha gia calcolato, e a sbagliarlo ogni tanto.
    */
    setAmount(
      String(
        Number(
          accrual.confirmed_at
            ? accrual.accrued_amount
            : accrual.estimated_amount,
        ) || 0,
      ),
    );
    setConfirmedAt(new Date().toISOString().slice(0, 10));
    setExternalReference(String(accrual.external_reference || ""));
    setNotes(String(accrual.confirmation_notes || ""));
  }, [accrual]);

  const parsedAmount = Number(String(amount).replace(",", ".")) || 0;
  const alreadyConfirmed = Number(accrual?.accrued_amount || 0);
  const availableAmount = Number(
    (residualAmount + alreadyConfirmed).toFixed(2),
  );
  const overAssigned = parsedAmount > availableAmount + 0.0001;

  const error = overAssigned
    ? `Non si puo confermare piu di ${formatCurrency(availableAmount)}: e cio che resta dell'importo assegnato a questo club.`
    : parsedAmount < 0
      ? "Un importo confermato non puo essere negativo."
      : null;

  return (
    <Dialog open={Boolean(accrual)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conferma maturazione</DialogTitle>
          <DialogDescription>
            La frequenza ufficiale di questo programma non si registra in
            EasyGame. Dichiara qui cosa la fonte ufficiale ha riconosciuto per
            il periodo.
          </DialogDescription>
        </DialogHeader>

        {accrual ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900/40">
              <p className="font-medium capitalize">{accrual.period_label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Previsione EasyGame:{" "}
                <strong>{formatCurrency(accrual.estimated_amount)}</strong> ·{" "}
                {accrual.measured_value}{" "}
                {requirementUnitLabel(
                  String(accrual.requirement_unit || "hours") as any,
                )}{" "}
                su {accrual.requirement_min} richieste
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-amount">Importo riconosciuto (EUR)</Label>
              <Input
                id="confirm-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Disponibile su questa iscrizione:{" "}
                {formatCurrency(availableAmount)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-date">Data della conferma</Label>
              <Input
                id="confirm-date"
                type="date"
                value={confirmedAt}
                onChange={(event) => setConfirmedAt(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-reference">
                Riferimento esterno
              </Label>
              <Input
                id="confirm-reference"
                value={externalReference}
                onChange={(event) => setExternalReference(event.target.value)}
                placeholder="Protocollo, id pratica, nome del prospetto"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-notes">Nota</Label>
              <Textarea
                id="confirm-notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            {accrual.confirmed_at ? (
              <p className="text-xs text-amber-700">
                Questo periodo era gia confermato a{" "}
                {formatCurrency(accrual.accrued_amount)}. La correzione resta
                nello storico e il periodo torna da rendicontare.
              </p>
            ) : null}

            {error ? (
              <p className="text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}

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
            disabled={isSaving || Boolean(error)}
            onClick={() =>
              void onSubmit({
                amount: parsedAmount,
                confirmedAt,
                externalReference,
                notes,
              })
            }
          >
            {isSaving ? "Conferma..." : "Conferma maturazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
