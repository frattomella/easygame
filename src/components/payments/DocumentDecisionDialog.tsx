"use client";

import React from "react";
import { AlertTriangle, FileText, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * «Cosa sto per emettere»: la spiegazione **prima** del pulsante.
 *
 * **Cosa c'era prima, e perche non bastava.** Il motore fiscale sapeva gia dire
 * quale documento propone e perche, e cosa manca per la fattura: la funzione
 * `describeDocumentDecision` era scritta e **non aveva chiamanti**. Chi emetteva
 * premeva «Ricevuta» o «Fattura» al buio e riceveva la spiegazione sotto forma
 * di errore — «per emettere una fattura mancano: intestatario: CAP» — cioe
 * dopo, e solo quando andava male. Quando andava bene, il documento usciva
 * senza che nessuno avesse visto con quale numero e con quale classificazione.
 *
 * **Le tre cose che questa finestra dice, e che prima non si vedevano.**
 *
 * 1. **con quale numero**: letto dalla sequenza senza consumarlo, cosi chi
 *    tiene il registro puo accorgersi di un salto prima e non dopo;
 * 2. **con quale classificazione**: e qui sta il punto della Wave. Se nessuno
 *    ha classificato l'incasso, il documento risultera **NON CLASSIFICATO** e
 *    questa riga lo scrive. Prima il prodotto ripiegava in silenzio su «quota
 *    attivita» e mostrava quel valore con la faccia di una scelta;
 * 3. **cosa manca**, se manca qualcosa, e a chi tocca completarlo — l'emittente
 *    o l'intestatario, che sono due persone diverse.
 *
 * **Cosa questa finestra non fa.** Non decide. Il motore propone e spiega
 * (ADR-0073); il pulsante resta acceso anche su una proposta «da configurare»,
 * perche da «EasyGame non sa cosa sia questo incasso» non segue «non si puo
 * emettere»: chi emette sa.
 */

export type DocumentDecisionPreview = {
  decision: {
    route: string;
    allowed: Array<"receipt" | "invoice">;
    suggested: "receipt" | "invoice" | null;
    reason: string;
    blockers: string[];
    needsConfiguration: boolean;
    classification: {
      activityScope: string;
      declared: boolean;
      label: string;
      operationTypeLabel: string | null;
    };
  };
  recipient: { name?: string | null } | null;
  amounts?: {
    totalCents: number;
    taxableAmountCents: number | null;
    vatAmountCents: number | null;
    stampDuty?: { undetermined?: boolean; reason?: string } | null;
  } | null;
  nextNumbers?: Record<string, { number: string }> | null;
};

const KIND_LABELS: Record<"receipt" | "invoice", string> = {
  receipt: "Ricevuta",
  invoice: "Fattura",
};

const formatCents = (cents: number) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

export type DocumentDecisionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quale documento l'operatore ha chiesto. */
  kind: "receipt" | "invoice" | null;
  preview: DocumentDecisionPreview | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: () => void;
};

export const DocumentDecisionDialog = ({
  open,
  onOpenChange,
  kind,
  preview,
  isLoading,
  isSubmitting,
  error,
  onConfirm,
}: DocumentDecisionDialogProps) => {
  const decision = preview?.decision || null;
  const classification = decision?.classification || null;
  const nextNumber = kind ? preview?.nextNumbers?.[kind]?.number || null : null;

  /*
    I mancanti bloccano la **fattura** e non la ricevuta: una ricevuta si emette
    con i dati che ci sono, perche rifiutarsi vorrebbe dire non documentare un
    incasso che e avvenuto. Il pulsante si spegne solo dove il blocco e vero.
  */
  const blockers = kind === "invoice" ? decision?.blockers || [] : [];
  const notAllowed = Boolean(
    decision && kind && !decision.allowed.includes(kind),
  );
  const canIssue =
    Boolean(decision) && !isLoading && !blockers.length && !notAllowed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind === "invoice" ? (
              <FileText className="h-4 w-4 text-blue-600" />
            ) : (
              <Receipt className="h-4 w-4 text-blue-600" />
            )}
            {kind ? KIND_LABELS[kind] : "Documento"}: cosa stai per emettere
          </DialogTitle>
          <DialogDescription>
            Un documento emesso non si modifica: si annulla e si rettifica. Vale
            la pena leggere questa schermata prima di confermare.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lettura della proposta...
          </p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : decision ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-700 dark:text-slate-200">
              {decision.reason}
            </p>

            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40">
              <dt className="text-xs text-muted-foreground">Intestatario</dt>
              <dd className="text-xs">{preview?.recipient?.name || "—"}</dd>

              <dt className="text-xs text-muted-foreground">Numero</dt>
              <dd className="text-xs">
                {nextNumber || "—"}
                {nextNumber ? (
                  <span className="ml-1 text-muted-foreground">
                    (anteprima: lo assegna la numerazione del club)
                  </span>
                ) : null}
              </dd>

              <dt className="text-xs text-muted-foreground">Importo</dt>
              <dd className="text-xs">
                {preview?.amounts
                  ? formatCents(preview.amounts.totalCents)
                  : "—"}
              </dd>

              <dt className="text-xs text-muted-foreground">
                Imponibile e imposta
              </dt>
              <dd className="text-xs">
                {preview?.amounts?.taxableAmountCents === null ||
                preview?.amounts?.taxableAmountCents === undefined ? (
                  <span className="text-amber-700 dark:text-amber-400">
                    aliquota non dichiarata sulla causale
                  </span>
                ) : (
                  `${formatCents(preview.amounts.taxableAmountCents)} + ${formatCents(
                    preview.amounts.vatAmountCents || 0,
                  )}`
                )}
              </dd>

              <dt className="text-xs text-muted-foreground">Classificazione</dt>
              <dd className="text-xs">
                {classification?.declared ? (
                  classification.label
                ) : (
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {classification?.label || "NON CLASSIFICATO"}
                  </span>
                )}
              </dd>
            </dl>

            {classification && !classification.declared ? (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Nessuno ha classificato questo incasso. Il documento si emette
                  lo stesso, e resta contato fra i non classificati finche la
                  causale non viene scelta e configurata.
                </span>
              </p>
            ) : null}

            {preview?.amounts?.stampDuty?.undetermined ? (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                {preview.amounts.stampDuty.reason}
              </p>
            ) : null}

            {notAllowed ? (
              <p className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                Questa operazione non prevede{" "}
                {kind === "invoice" ? "una fattura" : "una ricevuta"}.
              </p>
            ) : null}

            {blockers.length ? (
              <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                <p className="font-medium">Per la fattura mancano:</p>
                <ul className="mt-1 list-disc pl-4">
                  {blockers.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!canIssue || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Emetti {kind ? KIND_LABELS[kind].toLowerCase() : "documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
