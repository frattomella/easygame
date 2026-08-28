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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { CONFIGURED_RULE_YEARS } from "@/lib/sport-work/rules";
import { formatCurrency, formatDate, todayInput } from "./sport-work-format";

/**
 * Il dialogo dell'**autocertificazione dei compensi esterni**.
 *
 * Non e il caricamento di un allegato: e la registrazione di un dato che entra
 * nel calcolo. Il file, se c'e, lo accompagna.
 *
 * **La schermata dice a cosa serve.** Il valore principale di questa
 * dichiarazione non e la precisione del netto: e provare cosa il club sapeva e
 * quando. Se un giorno arrivano contributi omessi e sanzioni, questa riga —
 * con la sua data — e il documento che dice come sono andate le cose.
 *
 * Registrarne una nuova **sostituisce** quella dell'anno, che resta marcata. La
 * schermata mostra lo storico proprio per quello: quello che il club sapeva a
 * marzo resta quello che sapeva a marzo.
 */

export type DeclarationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  defaultYear?: number;
  onDone?: () => void;
};

export function DeclarationDialog({
  open,
  onOpenChange,
  personId,
  defaultYear,
  onDone,
}: DeclarationDialogProps) {
  const { showToast } = useToast();
  const [year, setYear] = React.useState(
    defaultYear || CONFIGURED_RULE_YEARS[0],
  );
  const [amount, setAmount] = React.useState("");
  const [declarationDate, setDeclarationDate] = React.useState(todayInput);
  const [hasOtherCoverage, setHasOtherCoverage] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [history, setHistory] = React.useState<any[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setYear(defaultYear || CONFIGURED_RULE_YEARS[0]);
    setAmount("");
    setDeclarationDate(todayInput());
    setHasOtherCoverage(false);
    setNotes("");
  }, [open, defaultYear]);

  React.useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await apiRequest<any[]>(
        `/api/v1/sport-work/declarations?person_id=${encodeURIComponent(personId)}`,
      );
      setHistory(Array.isArray(data) ? data : []);
    })();
  }, [open, personId]);

  const handleSave = async () => {
    if (amount.trim() === "") {
      showToast(
        "error",
        "Indica l'importo dichiarato: zero e una dichiarazione, il campo vuoto no",
      );
      return;
    }

    setSaving(true);
    const { error } = await apiRequest("/api/v1/sport-work/declarations", {
      method: "POST",
      body: {
        personId,
        fiscalYear: year,
        externalAmount: amount,
        declarationDate,
        hasOtherCoverage,
        notes,
      },
    });
    setSaving(false);

    if (error) {
      showToast("error", error.message || "Registrazione non riuscita");
      return;
    }

    showToast("success", "Autocertificazione registrata");
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Autocertificazione compensi esterni</DialogTitle>
          <DialogDescription>
            Quanto il lavoratore dichiara di aver percepito da altri committenti
            nell&apos;anno. Entra nel calcolo dei contributi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Anno</Label>
              <Select
                value={String(year)}
                onValueChange={(value) => setYear(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONFIGURED_RULE_YEARS.map((configured) => (
                    <SelectItem key={configured} value={String(configured)}>
                      {configured}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="decl-date">Data della dichiarazione</Label>
              <Input
                id="decl-date"
                type="date"
                value={declarationDate}
                onChange={(event) => setDeclarationDate(event.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="decl-amount">Compensi percepiti altrove</Label>
              <Input
                id="decl-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={hasOtherCoverage}
              onCheckedChange={(value) => setHasOtherCoverage(value === true)}
              className="mt-0.5"
            />
            <span>
              Il lavoratore dichiara di avere altra copertura previdenziale.
            </span>
          </label>

          <div className="space-y-2">
            <Label htmlFor="decl-notes">Note</Label>
            <Textarea
              id="decl-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <p className="rounded-md bg-slate-50 p-3 text-xs text-muted-foreground dark:bg-gray-800">
            Questa dichiarazione non serve solo a calcolare meglio: serve a
            provare cosa la societa sapeva e quando. Se la dichiarazione e falsa
            o tardiva la responsabilita e del lavoratore, ma il danno operativo
            — contributi non versati, sanzioni — e del club.
          </p>

          {history.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Dichiarazioni gia acquisite</p>
              <ul className="divide-y divide-slate-100 text-sm dark:divide-gray-700">
                {history.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <span className="text-muted-foreground">
                      {row.fiscal_year} · {formatDate(row.declaration_date)}
                      {row.status !== "ACTIVE" ? " · sostituita" : ""}
                    </span>
                    <span className="tabular-nums">
                      {formatCurrency(row.external_amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Annulla
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {saving ? "Registrazione…" : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
