"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteSelect } from "@/components/sites/site-filter";
import { isMultiSiteClub, type ClubSite } from "@/lib/club-sites";
import {
  RECONCILIATION_STATUSES,
  RECONCILIATION_STATUS_LABELS,
  type AccountingLine,
} from "@/lib/accounting/model";
import {
  formatCents,
  formatDate,
  operationTypesForDirection,
  toDateInputValue,
  type FinancialAccountView,
  type OperationTypeView,
} from "./accounting-view";

/**
 * Le finestre che **scrivono** in prima nota.
 *
 * Sono quattro, e ognuna corrisponde a una rotta sola: registrare, girocontare,
 * stornare, riconciliare. Nessuna di esse cancella: il denaro non si cancella.
 *
 * **La causale non e testo libero.** Il modulo precedente precompilava il campo
 * «categoria» con la **categoria sportiva dell'atleta** — «Under 14» diventava
 * la causale contabile di un movimento di cassa — e lasciava scrivere qualunque
 * cosa. Da qui si sceglie da un elenco, ed e obbligatoria: un movimento senza
 * causale nasce gia sbagliato, e classificarlo dopo vuol dire rileggere una
 * riga che nessuno ricorda piu.
 *
 * **La validazione vera sta sul server.** Questi controlli servono a non far
 * partire una richiesta che si sa gia perduta; gli invarianti li difende
 * `assertAccountingEntryInvariants`, e il messaggio che l'utente legge quando
 * qualcosa non torna e quello del dominio, non uno riscritto qui.
 */

const oggi = () => toDateInputValue(new Date());

/* ========================================================================== */
/* Registrare un movimento                                                     */
/* ========================================================================== */

export type RecordEntryPayload = {
  entry_date: string;
  direction: string;
  amount: number;
  financial_account_id: string;
  operation_type_code: string;
  description: string;
  notes: string;
  payment_method: string;
  counterparty_label: string;
  site_id: string;
};

export function RecordEntryDialog({
  open,
  onOpenChange,
  accounts,
  operationTypes,
  sites,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: readonly FinancialAccountView[];
  operationTypes: readonly OperationTypeView[];
  sites: ClubSite[];
  saving: boolean;
  onSubmit: (payload: RecordEntryPayload) => void;
}) {
  const [entryDate, setEntryDate] = useState(oggi);
  const [direction, setDirection] = useState("IN");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [operationTypeCode, setOperationTypeCode] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [counterpartyLabel, setCounterpartyLabel] = useState("");
  const [siteId, setSiteId] = useState("");

  useEffect(() => {
    if (!open) return;
    setEntryDate(oggi());
    setDirection("IN");
    setAmount("");
    setAccountId(accounts.length === 1 ? accounts[0].id : "");
    setOperationTypeCode("");
    setDescription("");
    setNotes("");
    setPaymentMethod("");
    setCounterpartyLabel("");
    setSiteId("");
  }, [open, accounts]);

  const causali = useMemo(
    () => operationTypesForDirection(operationTypes, direction),
    [operationTypes, direction],
  );

  /*
    Cambiare verso puo togliere dall'elenco la causale gia scelta: lasciarla
    selezionata manderebbe al server una causale che la tendina non mostra piu.
  */
  useEffect(() => {
    if (
      operationTypeCode &&
      !causali.some((type) => type.code === operationTypeCode)
    ) {
      setOperationTypeCode("");
    }
  }, [causali, operationTypeCode]);

  const importo = Number(String(amount).replace(",", "."));
  const completo =
    Boolean(entryDate) &&
    Number.isFinite(importo) &&
    importo > 0 &&
    Boolean(accountId) &&
    Boolean(operationTypeCode) &&
    Boolean(description.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registra un movimento</DialogTitle>
          <DialogDescription>
            Un fatto di cassa che nessun altro evento ha generato: l&apos;affitto
            della palestra, una spesa in contanti, un rimborso spese. Gli incassi
            delle quote si registrano sulla scheda dell&apos;atleta e compaiono
            qui da soli.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="movimento-data">Data</Label>
              <Input
                id="movimento-data"
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="movimento-verso">Verso</Label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger id="movimento-verso">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Entrata</SelectItem>
                  <SelectItem value="OUT">Uscita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="movimento-importo">Importo (EUR)</Label>
              <Input
                id="movimento-importo"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="movimento-conto">Conto</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="movimento-conto">
                  <SelectValue placeholder="Dove si e mosso il denaro" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {account.kindLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="movimento-causale">Causale</Label>
            <Select
              value={operationTypeCode}
              onValueChange={setOperationTypeCode}
            >
              <SelectTrigger id="movimento-causale">
                <SelectValue placeholder="Scegli una causale" />
              </SelectTrigger>
              <SelectContent>
                {causali.map((type) => (
                  <SelectItem key={type.code} value={type.code}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Obbligatoria, e scelta da un elenco: e cio che rende il movimento
              leggibile in un rendiconto. Le causali si configurano nel profilo
              fiscale del club.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="movimento-descrizione">Descrizione</Label>
            <Input
              id="movimento-descrizione"
              placeholder="Cosa e successo"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="movimento-controparte">
                Controparte (facoltativa)
              </Label>
              <Input
                id="movimento-controparte"
                placeholder="Chi sta dall'altra parte"
                value={counterpartyLabel}
                onChange={(event) => setCounterpartyLabel(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="movimento-metodo">
                Metodo di pagamento (facoltativo)
              </Label>
              <Input
                id="movimento-metodo"
                placeholder="Contanti, bonifico, POS"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
              />
            </div>
          </div>

          {isMultiSiteClub(sites) ? (
            <div className="space-y-2">
              <Label htmlFor="movimento-sede">Sede (facoltativa)</Label>
              <SiteSelect
                id="movimento-sede"
                sites={sites}
                value={siteId}
                onChange={setSiteId}
                emptyLabel="Tutte le sedi"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="movimento-note">Note (facoltative)</Label>
            <Textarea
              id="movimento-note"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annulla
          </Button>
          <Button
            type="button"
            disabled={!completo || saving}
            onClick={() =>
              onSubmit({
                entry_date: entryDate,
                direction,
                amount: importo,
                financial_account_id: accountId,
                operation_type_code: operationTypeCode,
                description: description.trim(),
                notes: notes.trim(),
                payment_method: paymentMethod.trim(),
                counterparty_label: counterpartyLabel.trim(),
                site_id: siteId,
              })
            }
          >
            {saving ? "Registrazione..." : "Registra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================== */
/* Giroconto                                                                   */
/* ========================================================================== */

export type TransferPayload = {
  entry_date: string;
  amount: number;
  from_account_id: string;
  to_account_id: string;
  description: string;
  notes: string;
  site_id: string;
};

/**
 * Un giroconto e **due movimenti in una transazione sola**, e quindi una
 * chiamata sola.
 *
 * Prima erano due richieste HTTP separate, e un giroconto a meta lasciava
 * denaro sparito: uscito da un conto e mai arrivato nell'altro.
 */
export function TransferDialog({
  open,
  onOpenChange,
  accounts,
  sites,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: readonly FinancialAccountView[];
  sites: ClubSite[];
  saving: boolean;
  onSubmit: (payload: TransferPayload) => void;
}) {
  const [entryDate, setEntryDate] = useState(oggi);
  const [amount, setAmount] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [siteId, setSiteId] = useState("");

  useEffect(() => {
    if (!open) return;
    setEntryDate(oggi());
    setAmount("");
    setFromAccountId("");
    setToAccountId("");
    setDescription("");
    setNotes("");
    setSiteId("");
  }, [open]);

  const importo = Number(String(amount).replace(",", "."));
  const completo =
    Boolean(entryDate) &&
    Number.isFinite(importo) &&
    importo > 0 &&
    Boolean(fromAccountId) &&
    Boolean(toAccountId) &&
    fromAccountId !== toAccountId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registra un giroconto</DialogTitle>
          <DialogDescription>
            Denaro che cambia conto senza entrare ne uscire dal club: un
            versamento della cassa in banca, un prelievo. Non compare fra le
            entrate ne fra le uscite del periodo, e la liquidita totale non
            cambia.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="giroconto-data">Data</Label>
              <Input
                id="giroconto-data"
                type="date"
                value={entryDate}
                onChange={(event) => setEntryDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="giroconto-importo">Importo (EUR)</Label>
              <Input
                id="giroconto-importo"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="giroconto-da">Dal conto</Label>
              <Select value={fromAccountId} onValueChange={setFromAccountId}>
                <SelectTrigger id="giroconto-da">
                  <SelectValue placeholder="Conto di partenza" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {account.kindLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="giroconto-a">Al conto</Label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
                <SelectTrigger id="giroconto-a">
                  <SelectValue placeholder="Conto di arrivo" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((account) => account.id !== fromAccountId)
                    .map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} · {account.kindLabel}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="giroconto-descrizione">
              Descrizione (facoltativa)
            </Label>
            <Input
              id="giroconto-descrizione"
              placeholder="Versamento incassi di settembre"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          {isMultiSiteClub(sites) ? (
            <div className="space-y-2">
              <Label htmlFor="giroconto-sede">Sede (facoltativa)</Label>
              <SiteSelect
                id="giroconto-sede"
                sites={sites}
                value={siteId}
                onChange={setSiteId}
                emptyLabel="Tutte le sedi"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="giroconto-note">Note (facoltative)</Label>
            <Textarea
              id="giroconto-note"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annulla
          </Button>
          <Button
            type="button"
            disabled={!completo || saving}
            onClick={() =>
              onSubmit({
                entry_date: entryDate,
                amount: importo,
                from_account_id: fromAccountId,
                to_account_id: toAccountId,
                description: description.trim(),
                notes: notes.trim(),
                site_id: siteId,
              })
            }
          >
            {saving ? "Registrazione..." : "Registra giroconto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================== */
/* Storno                                                                      */
/* ========================================================================== */

/**
 * Lo storno, con il **motivo obbligatorio**.
 *
 * Senza motivo la riga non spiega niente, e chi la rilegge fra sei mesi vede
 * due importi uguali e opposti senza sapere se fu un errore di battitura o un
 * pagamento annullato. Il server lo impone comunque: qui il pulsante resta
 * spento finche il motivo non c'e, che e piu onesto di un errore dopo il clic.
 */
export function ReverseEntryDialog({
  line,
  onOpenChange,
  saving,
  onSubmit,
}: {
  line: AccountingLine | null;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSubmit: (payload: { reason: string; entry_date: string }) => void;
}) {
  const [reason, setReason] = useState("");
  const [entryDate, setEntryDate] = useState(oggi);

  useEffect(() => {
    if (!line) return;
    setReason("");
    setEntryDate(oggi());
  }, [line]);

  return (
    <Dialog open={Boolean(line)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Storna il movimento</DialogTitle>
          <DialogDescription>
            Il denaro non si cancella. Lo storno lascia visibili entrambe le
            righe, l&apos;originale e la sua correzione, con il motivo scritto
            sopra.
          </DialogDescription>
        </DialogHeader>

        {line ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-900">{line.description}</p>
            <p className="mt-1 text-slate-600">
              {formatDate(line.entryDate)} · {formatCents(line.amountCents)} ·{" "}
              {line.financialAccountName || "conto non attribuito"}
            </p>
            {line.transferGroupId ? (
              <p className="mt-2 text-slate-600">
                E la gamba di un giroconto: lo storno riguarda entrambe le
                gambe, altrimenti le due meta divergono e il denaro sparisce fra
                due conti.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="storno-motivo">Motivo dello storno</Label>
            <Textarea
              id="storno-motivo"
              rows={3}
              placeholder="Perche questo movimento va corretto"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="storno-data">Data dello storno</Label>
            <Input
              id="storno-data"
              type="date"
              value={entryDate}
              onChange={(event) => setEntryDate(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annulla
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!reason.trim() || saving}
            onClick={() =>
              onSubmit({ reason: reason.trim(), entry_date: entryDate })
            }
          >
            {saving ? "Storno..." : "Storna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ========================================================================== */
/* Riconciliazione                                                             */
/* ========================================================================== */

export function ReconcileEntryDialog({
  line,
  onOpenChange,
  saving,
  onSubmit,
}: {
  line: AccountingLine | null;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSubmit: (payload: {
    status: string;
    value_date: string;
    bank_reference: string;
  }) => void;
}) {
  const [status, setStatus] = useState<string>("reconciled");
  const [valueDate, setValueDate] = useState("");
  const [bankReference, setBankReference] = useState("");

  useEffect(() => {
    if (!line) return;
    setStatus(
      line.reconciliationStatus === "unreconciled"
        ? "reconciled"
        : line.reconciliationStatus,
    );
    setValueDate(line.valueDate ? line.valueDate.slice(0, 10) : "");
    setBankReference(line.bankReference || "");
  }, [line]);

  return (
    <Dialog open={Boolean(line)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Spunta contro l&apos;estratto conto</DialogTitle>
          <DialogDescription>
            Riconciliare non cambia nessun numero: dice che l&apos;estratto
            conto conferma il movimento. E cosi che «cosa non ho ancora visto
            arrivare in banca» diventa una domanda con una risposta.
          </DialogDescription>
        </DialogHeader>

        {line ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-900">{line.description}</p>
            <p className="mt-1 text-slate-600">
              {formatDate(line.entryDate)} · {formatCents(line.amountCents)}
            </p>
          </div>
        ) : null}

        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="riconcilia-stato">Stato</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="riconcilia-stato">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECONCILIATION_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {RECONCILIATION_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="riconcilia-valuta">
              Data valuta (facoltativa)
            </Label>
            <Input
              id="riconcilia-valuta"
              type="date"
              value={valueDate}
              onChange={(event) => setValueDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="riconcilia-riferimento">
              Riferimento bancario (facoltativo)
            </Label>
            <Input
              id="riconcilia-riferimento"
              placeholder="CRO, numero distinta"
              value={bankReference}
              onChange={(event) => setBankReference(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annulla
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() =>
              onSubmit({
                status,
                value_date: valueDate,
                bank_reference: bankReference.trim(),
              })
            }
          >
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
