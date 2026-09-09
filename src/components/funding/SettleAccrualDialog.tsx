"use client";

import * as React from "react";
import { Banknote } from "lucide-react";
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
import { useContiIncasso } from "@/components/payments/use-conti-incasso";
import {
  describeSettlementEligibility,
  pendingSettlementOfAccrual,
} from "@/lib/funding/funding-model";

/**
 * **Registrare il bonifico con cui un ente liquida un periodo** (N15).
 *
 * ---
 *
 * ## Perche «Registra liquidazione» e non «Liquida periodo»
 *
 * Perche il club non liquida niente: **riceve**. L'atto e la registrazione di
 * un accredito gia avvenuto, e il verbo lo deve dire — «liquida» suggerisce
 * un'azione verso l'esterno, e su una schermata di cassa quella confusione
 * costa una telefonata all'ente.
 *
 * ## I tre numeri in cima, e perche sono tre
 *
 * Maturato, gia liquidato, da ricevere. Chi apre questa finestra deve sapere
 * **quanto puo ancora entrare** senza aprire un'altra scheda: l'importo si
 * propone da solo, ma la cifra che lo giustifica va vista accanto, altrimenti
 * la proposta e un numero da accettare al buio.
 *
 * ## Perche il conto e obbligatorio qui
 *
 * Perche il movimento bancario e cio per cui questa finestra esiste. Una
 * liquidazione senza conto chiude il credito verso l'ente e **non entra in
 * nessun saldo**: e il difetto che lo schema documenta per esteso, e questo
 * percorso non lo puo riprodurre. Sulle liquidazioni registrate prima il campo
 * resta tollerato, perche riscrivere il passato non e compito di una finestra.
 *
 * ## La chiave del gesto
 *
 * Nasce quando si preme e vive finche quel tentativo non riesce: un rinvio dopo
 * un errore di rete resta idempotente, due gesti distinti restano due accrediti.
 * E la stessa forma di `CoverageDialog`, e per la stessa ragione — la chiave
 * composta dagli importi faceva leggere come duplicato il secondo di due
 * accrediti uguali.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

const oggi = () => {
  const data = new Date();
  const mese = String(data.getMonth() + 1).padStart(2, "0");
  const giorno = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${mese}-${giorno}`;
};

export type SettlementSubmission = {
  amount: number;
  settledAt: string;
  financialAccountId: string;
  reference: string;
  notes: string;
  idempotencyKey: string;
};

const Riga = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dashed border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <span className="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
      {value}
    </span>
  </div>
);

export function SettleAccrualDialog({
  open,
  onOpenChange,
  accrual,
  athleteName,
  programName,
  funderName,
  canChooseAccount = true,
  isSaving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Il periodo da liquidare, con `accrued_amount` e `settled_amount`. */
  accrual: Record<string, any> | null;
  athleteName?: string | null;
  programName?: string | null;
  funderName?: string | null;
  /**
   * Se il ruolo attivo puo **vedere e scegliere** i conti del club
   * (`accounting.accounts_read`). Senza, la finestra non offre un elenco che
   * chi guarda non ha il diritto di conoscere, e lo dice.
   */
  canChooseAccount?: boolean;
  isSaving: boolean;
  onSubmit: (submission: SettlementSubmission) => void | Promise<void>;
}) {
  const conti = useContiIncasso();

  const [amount, setAmount] = React.useState("");
  const [settledAt, setSettledAt] = React.useState(oggi());
  const [accountId, setAccountId] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const chiaveTentativo = React.useRef<string | null>(null);

  const maturato = Number(accrual?.accrued_amount || 0);
  const liquidato = Number(accrual?.settled_amount || 0);
  const daRicevere = accrual ? pendingSettlementOfAccrual(accrual) : 0;

  /*
    **La stessa funzione che accende il pulsante.** Se la finestra si aprisse
    su un periodo che il servizio poi rifiuta, il rifiuto arriverebbe dopo che
    la segreteria ha digitato un riferimento bancario.
  */
  const vaglio = accrual
    ? describeSettlementEligibility(accrual)
    : ({ kind: "blocked", reason: "Nessun periodo selezionato" } as const);

  React.useEffect(() => {
    if (!open) return;
    setAmount(daRicevere > 0 ? daRicevere.toFixed(2) : "");
    setSettledAt(oggi());
    setReference("");
    setNotes("");
    chiaveTentativo.current = null;
    /* Un conto solo e la quasi totalita dei casi: si preseleziona. */
    setAccountId((corrente) => corrente || conti[0]?.id || "");
  }, [open, daRicevere, conti]);

  const importo = Number(String(amount).replace(",", "."));

  const errore = (() => {
    if (vaglio.kind === "blocked") return vaglio.reason;
    if (!amount.trim()) return null;
    if (!Number.isFinite(importo) || importo <= 0) {
      return "L'importo dell'accredito deve essere maggiore di zero";
    }
    if (Math.round(importo * 100) > Math.round(daRicevere * 100)) {
      return `Non si puo liquidare piu di quanto e maturato: restano ${daRicevere.toFixed(2)} EUR su questo periodo`;
    }
    if (!settledAt) return "Indica la data dell'accredito";
    if (!accountId) {
      return canChooseAccount
        ? "Indica su quale conto e arrivato il bonifico: senza, il denaro non entra in nessun saldo"
        : "Serve il permesso sui conti del club per registrare l'accredito";
    }
    return null;
  })();

  const puoSalvare = Boolean(amount.trim()) && !errore && !isSaving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registra liquidazione</DialogTitle>
          <DialogDescription>
            L&apos;accredito con cui l&apos;ente versa al club un periodo gia
            maturato.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
            <Riga label="Atleta" value={athleteName || "—"} />
            <Riga label="Ente erogatore" value={funderName || "—"} />
            <Riga label="Programma" value={programName || "—"} />
            <Riga
              label="Periodo"
              value={
                <span className="capitalize">
                  {String(accrual?.period_label || "—")}
                </span>
              }
            />
            <Riga label="Maturato" value={formatCurrency(maturato)} />
            <Riga label="Gia liquidato" value={formatCurrency(liquidato)} />
            <Riga
              label="Da ricevere"
              value={
                <span className="font-bold">{formatCurrency(daRicevere)}</span>
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement-amount">Importo liquidato</Label>
            <Input
              id="settlement-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-muted-foreground">
              Si propone il residuo. Un accredito parziale e normale: il periodo
              resta aperto per la differenza.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement-date">Data accredito</Label>
            <Input
              id="settlement-date"
              type="date"
              value={settledAt}
              onChange={(event) => setSettledAt(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement-account">Conto del club</Label>
            {canChooseAccount ? (
              <select
                id="settlement-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Scegli il conto</option>
                {conti.map((conto) => (
                  <option key={conto.id} value={conto.id}>
                    {conto.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                I conti del club li vede chi ne ha il permesso: chiedi a chi
                amministra la contabilita di registrare questo accredito.
              </p>
            )}
            {canChooseAccount && conti.length === 0 ? (
              <p className="text-xs text-amber-700">
                Nessun conto configurato: aprine uno in «Movimenti» prima di
                registrare l&apos;accredito.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement-reference">
              Riferimento bancario (TRN, CRO)
            </Label>
            <Input
              id="settlement-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Facoltativo"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settlement-notes">Note</Label>
            <Textarea
              id="settlement-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {errore ? <p className="text-xs text-red-600">{errore}</p> : null}

          {/*
            La frase che tiene separate le due contabilita. Non e decorativa: e
            cio che impedisce di leggere questo accredito come un pagamento
            della famiglia, che e il modo in cui la stessa quota finirebbe
            contata due volte.
          */}
          <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40">
            Questo <strong>non e un pagamento della famiglia</strong>: e denaro
            che arriva dall&apos;ente. Entra nei movimenti del club sul conto
            scelto e non tocca il piano di pagamento dell&apos;atleta.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            disabled={!puoSalvare}
            onClick={() => {
              if (!chiaveTentativo.current) {
                chiaveTentativo.current =
                  typeof crypto !== "undefined" && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `settlement-${Date.now()}-${Math.random().toString(36).slice(2)}`;
              }

              void onSubmit({
                amount: importo,
                settledAt,
                financialAccountId: accountId,
                reference,
                notes,
                idempotencyKey: chiaveTentativo.current,
              });
            }}
          >
            <Banknote className="mr-2 h-4 w-4" />
            {isSaving ? "Registrazione..." : "Registra liquidazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
