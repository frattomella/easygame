"use client";

import React from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent, todayInput } from "./sport-work-format";

/**
 * Il dialogo che eroga un compenso.
 *
 * **E la schermata piu importante del modulo, e non perche muove denaro.** E
 * perche e l'unico posto in cui un numero calcolato da EasyGame diventa una
 * decisione di una persona: quanto trattenere, quanto versare, quanto costa al
 * club. Un numero senza le sue ipotesi non si puo contestare, e quindi non si
 * puo correggere.
 *
 * Da qui tre scelte.
 *
 * 1. **Prima si propone, poi si registra.** L'apertura chiama `prepare`, che
 *    non scrive niente e restituisce la motivazione riga per riga. Chi guarda
 *    vede il conto **prima** di confermarlo.
 * 2. **Gli avvisi duri chiedono una spunta.** Autocertificazione mancante o
 *    soglia fiscale superata non bloccano — bloccare costringerebbe a pagare
 *    fuori dal gestionale, che e peggio — ma richiedono che qualcuno dichiari
 *    di aver capito. Quella spunta finisce nell'audit con il suo nome.
 * 3. **La chiave del gesto nasce all'apertura, non all'invio.** Due clic sul
 *    pulsante di conferma portano la stessa chiave, e il secondo non fa uscire
 *    il denaro una seconda volta. Generarla all'invio avrebbe reso il doppio
 *    clic due gesti diversi, cioe non avrebbe protetto da niente.
 */

export type PayoutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installmentId?: string | null;
  relationshipId?: string | null;
  onDone?: () => void;
};

type Proposal = {
  installmentId: string | null;
  relationshipId: string;
  personName: string;
  installmentLabel: string | null;
  suggestedAmount: number;
  paidAt: string;
  netLabel: string;
  requiresAcknowledgement: boolean;
  acknowledgementReasons: string[];
  computation: {
    grossAmount: number;
    netSocial: number;
    netDefinitive: number | null;
    clubCost: number;
    definitive: boolean;
    fiscalTreatment: string;
    rulesVersion: string;
    explanation: Array<{
      key: string;
      label: string;
      amount: number | null;
      kind: "amount" | "rate" | "note";
      note?: string;
      emphasis?: boolean;
    }>;
    warnings: Array<{
      code: string;
      severity: "info" | "warning" | "hard";
      message: string;
      detail?: string;
    }>;
  };
};

const newIdempotencyKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `payout-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function PayoutDialog({
  open,
  onOpenChange,
  installmentId,
  relationshipId,
  onDone,
}: PayoutDialogProps) {
  const { showToast } = useToast();
  const [amount, setAmount] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(todayInput);
  const [paymentMethod, setPaymentMethod] = React.useState("Bonifico");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [allowOverpayment, setAllowOverpayment] = React.useState(false);
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const idempotencyKey = React.useRef<string>("");

  React.useEffect(() => {
    if (!open) return;
    idempotencyKey.current = newIdempotencyKey();
    setAcknowledged(false);
    setAllowOverpayment(false);
    setAmount("");
    setPaidAt(todayInput());
    setReference("");
    setNotes("");
    setProposal(null);
    setError(null);
  }, [open, installmentId, relationshipId]);

  const loadProposal = React.useCallback(async () => {
    if (!open) return;
    if (!installmentId && !relationshipId) return;

    setLoading(true);
    setError(null);

    const { data, error: apiError } = await apiRequest<Proposal>(
      "/api/v1/sport-work/payouts/prepare",
      {
        method: "POST",
        body: {
          installmentId: installmentId || undefined,
          relationshipId: relationshipId || undefined,
          amount: amount || undefined,
          paidAt,
        },
      },
    );

    setLoading(false);

    if (apiError || !data) {
      setProposal(null);
      setError(apiError?.message || "Calcolo della proposta non riuscito");
      return;
    }

    setProposal(data);
    if (!amount) {
      setAmount(String(data.suggestedAmount));
    }
  }, [open, installmentId, relationshipId, amount, paidAt]);

  React.useEffect(() => {
    void loadProposal();
    // Ricalcolare a ogni battitura dell'importo renderebbe la schermata
    // inutilizzabile: il ricalcolo scatta quando cambia la data o si apre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, installmentId, relationshipId, paidAt]);

  const hardWarnings = (proposal?.computation.warnings || []).filter(
    (warning) => warning.severity === "hard",
  );
  const softWarnings = (proposal?.computation.warnings || []).filter(
    (warning) => warning.severity !== "hard",
  );

  const blocked = hardWarnings.length > 0 && !acknowledged;

  const handleConfirm = async () => {
    if (!proposal) return;

    setSaving(true);
    const { data, error: apiError } = await apiRequest<any>(
      "/api/v1/sport-work/payouts",
      {
        method: "POST",
        body: {
          installmentId: installmentId || undefined,
          relationshipId: relationshipId || undefined,
          amount,
          paidAt,
          paymentMethod,
          reference,
          notes,
          allowOverpayment,
          acknowledgeWarnings: hardWarnings.length > 0 ? acknowledged : true,
          idempotencyKey: idempotencyKey.current,
        },
      },
    );
    setSaving(false);

    if (apiError) {
      showToast("error", apiError.message || "Erogazione non registrata");
      return;
    }

    showToast(
      "success",
      data?.duplicate
        ? "Questa erogazione era gia stata registrata: nessun doppio pagamento"
        : "Erogazione registrata",
    );
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Eroga compenso</DialogTitle>
          <DialogDescription>
            {proposal
              ? `${proposal.personName}${
                  proposal.installmentLabel ? ` — ${proposal.installmentLabel}` : ""
                }`
              : "Calcolo della proposta in corso"}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="payout-amount">Importo lordo</Label>
            <Input
              id="payout-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              onBlur={() => void loadProposal()}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payout-date">Data di pagamento</Label>
            <Input
              id="payout-date"
              type="date"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              L&apos;anno di questa data decide le regole applicate, non la
              stagione.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payout-method">Metodo</Label>
            <Input
              id="payout-method"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payout-reference">Riferimento</Label>
            <Input
              id="payout-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="CRO, numero distinta…"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Calcolo in corso…</p>
        ) : null}

        {proposal ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-gray-700">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-gray-700">
                <p className="text-sm font-semibold">Come nasce questo numero</p>
                <Badge variant="outline" className="text-xs">
                  Regole {proposal.computation.rulesVersion}
                </Badge>
              </div>
              <dl className="divide-y divide-slate-100 dark:divide-gray-700">
                {proposal.computation.explanation.map((line) => (
                  <div
                    key={line.key}
                    className={cn(
                      "flex flex-col gap-1 px-4 py-2 sm:flex-row sm:items-baseline sm:justify-between",
                      line.emphasis && "bg-slate-50 dark:bg-gray-800",
                    )}
                  >
                    <dt
                      className={cn(
                        "text-sm",
                        line.emphasis
                          ? "font-semibold text-slate-900 dark:text-slate-100"
                          : "text-slate-600 dark:text-slate-300",
                      )}
                    >
                      {line.label}
                      {line.note ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {line.note}
                        </span>
                      ) : null}
                    </dt>
                    <dd
                      className={cn(
                        "shrink-0 text-sm tabular-nums",
                        line.emphasis && "font-semibold",
                      )}
                    >
                      {line.kind === "note"
                        ? "—"
                        : line.kind === "rate"
                          ? formatPercent(line.amount)
                          : formatCurrency(line.amount)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3 dark:border-gray-700">
                <p className="text-xs text-muted-foreground">
                  {proposal.netLabel}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(proposal.computation.netSocial)}
                </p>
                {proposal.computation.netDefinitive === null ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Trattamento fiscale da verificare: la ritenuta non e
                    compresa in questo importo.
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border border-slate-200 p-3 dark:border-gray-700">
                <p className="text-xs text-muted-foreground">Costo per il club</p>
                <p className="text-xl font-bold">
                  {formatCurrency(proposal.computation.clubCost)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lordo piu la quota contributiva a carico della societa.
                </p>
              </div>
            </div>

            {softWarnings.map((warning) => (
              <div
                key={warning.code}
                className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">{warning.message}</p>
                  {warning.detail ? (
                    <p className="mt-1 text-xs">{warning.detail}</p>
                  ) : null}
                </div>
              </div>
            ))}

            {hardWarnings.length > 0 ? (
              <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3">
                {hardWarnings.map((warning) => (
                  <div key={warning.code} className="flex gap-2 text-sm text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">{warning.message}</p>
                      {warning.detail ? (
                        <p className="mt-1 text-xs">{warning.detail}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
                <label className="flex items-start gap-2 text-sm text-amber-900">
                  <Checkbox
                    checked={acknowledged}
                    onCheckedChange={(value) => setAcknowledged(value === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Ho letto gli avvisi e procedo comunque. Questa scelta viene
                    registrata con il mio nome e la data.
                  </span>
                </label>
              </div>
            ) : null}

            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={allowOverpayment}
                onCheckedChange={(value) => setAllowOverpayment(value === true)}
                className="mt-0.5"
              />
              <span>
                Consenti di erogare piu del residuo della scadenza.
              </span>
            </label>

            <div className="space-y-2">
              <Label htmlFor="payout-notes">Note</Label>
              <Textarea
                id="payout-notes"
                rows={2}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Annulla
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!proposal || saving || blocked}
            className="w-full sm:w-auto"
          >
            {saving ? "Registrazione…" : "Registra erogazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
