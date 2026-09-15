"use client";

import { useEffect, useMemo, useState } from "react";
import { Undo2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Modal } from "@/components/web/overlays/Modal";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import {
  CurrencyInput,
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  Select,
  TextInput,
  Textarea,
} from "@/components/web/forms/Field";
import { getActiveClubSites, isMultiSiteClub, type ClubSite } from "@/lib/club-sites";
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
 * Le finestre che **scrivono** in prima nota (Web V2).
 *
 * Sono quattro, e ognuna corrisponde a una rotta sola: registrare, girocontare,
 * stornare, riconciliare. Nessuna di esse cancella: il denaro non si cancella.
 *
 * **Cassetti e modali** (guideline 06 §6.7, 08 §8.9). I cassetti creano e
 * modificano: registrare un movimento, un giroconto e la riconciliazione
 * stanno in un cassetto da 480. I modali **solo** confermano: lo storno e una
 * conferma distruttiva con il motivo obbligatorio, e sta in un modale che non
 * si chiude sul velo. Ogni cassetto porta la guardia sulle modifiche non
 * salvate (`dirty`).
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

/*
  `Select` non accetta la stringa vuota come valore di una voce: la sede
  «tutte» ha quindi una sentinella, tradotta in stringa vuota prima di uscire
  dal componente, come fa `SiteSelect` con `ALL_SITES_VALUE`.
*/
const NESSUNA_SEDE = "__all_sites__";

const siteOptions = (sites: ClubSite[]) => [
  { value: NESSUNA_SEDE, label: "Tutte le sedi" },
  ...getActiveClubSites(sites).map((site) => ({ value: site.id, label: site.name })),
];

const accountOptions = (accounts: readonly FinancialAccountView[]) =>
  accounts.map((account) => ({ value: account.id, label: `${account.name} · ${account.kindLabel}` }));

/**
 * Da euro digitati a numero. Accetta la virgola perche in Italia si scrive
 * cosi («1.234,56»); un punto senza virgola resta il decimale («12.5»), come
 * accettava il campo numerico della V1.
 */
const parseImporto = (amount: string) => {
  const testo = String(amount).trim();
  if (!testo) return Number.NaN;
  return testo.includes(",")
    ? Number(testo.replace(/\./g, "").replace(",", "."))
    : Number(testo);
};

/** L'anteprima della riga su cui si agisce (storno, riconciliazione). */
const LinePreview = ({ line, withAccount }: { line: AccountingLine; withAccount?: boolean }) => (
  <InsetBlock>
    <p className="font-brand text-[13px] font-semibold text-egw-ink">{line.description}</p>
    <p className="egw-num mt-1 font-brand text-[12px] text-egw-ink-62">
      {formatDate(line.entryDate)} · {formatCents(line.amountCents)}
      {withAccount ? ` · ${line.financialAccountName || "conto non attribuito"}` : ""}
    </p>
  </InsetBlock>
);

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
  /** Torna `true` se il server ha registrato: serve a «Salva e aggiungi un altro». */
  onSubmit: (payload: RecordEntryPayload, options: { keepOpen: boolean }) => Promise<boolean> | boolean | void;
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
  const [dirty, setDirty] = useState(false);
  const [keepOpenSaving, setKeepOpenSaving] = useState(false);

  /** I campi che «Salva e aggiungi un altro» svuota: tutto tranne il contesto (data, verso, conto, causale, sede). */
  const clearNonContext = () => {
    setAmount("");
    setDescription("");
    setNotes("");
    setPaymentMethod("");
    setCounterpartyLabel("");
  };

  useEffect(() => {
    if (!open) return;
    setEntryDate(oggi());
    setDirection("IN");
    setAccountId(accounts.length === 1 ? accounts[0].id : "");
    setOperationTypeCode("");
    setSiteId("");
    setAmount("");
    setDescription("");
    setNotes("");
    setPaymentMethod("");
    setCounterpartyLabel("");
    setDirty(false);
    setKeepOpenSaving(false);
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

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setDirty(true);
    setter(value);
  };

  const importo = parseImporto(amount);
  const importoValido = Number.isFinite(importo) && importo > 0;
  const completo =
    Boolean(entryDate) &&
    importoValido &&
    Boolean(accountId) &&
    Boolean(operationTypeCode) &&
    Boolean(description.trim());

  const payload = (): RecordEntryPayload => ({
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
  });

  const registra = async (keepOpen: boolean) => {
    setKeepOpenSaving(keepOpen);
    const esito = await onSubmit(payload(), { keepOpen });
    if (keepOpen && esito) {
      clearNonContext();
      setDirty(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Prima nota"
      title="Registra un movimento"
      description="Un fatto di cassa che nessun altro evento ha generato: l'affitto della palestra, una spesa in contanti, un rimborso spese. Gli incassi delle quote si registrano sulla scheda dell'atleta e compaiono qui da soli."
      dirty={dirty}
      locked={saving}
      data-test="accounting-record-entry-drawer"
      footer={
        <>
          <Button
            variant="primary"
            disabled={!completo || saving}
            loading={saving && !keepOpenSaving}
            onClick={() => void registra(false)}
          >
            {saving && !keepOpenSaving ? "Registrazione..." : "Registra"}
          </Button>
          <Button
            variant="secondary"
            disabled={!completo || saving}
            loading={saving && keepOpenSaving}
            onClick={() => void registra(true)}
          >
            Salva e aggiungi un altro
          </Button>
          <Button variant="text" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <p className="mb-5 font-brand text-[11.5px] text-egw-ink-62">
          Tutti i campi sono obbligatori, salvo dove indicato.
        </p>
        <div className="flex flex-col gap-5">
          <FormGrid columns={2}>
            <Field label="Data" htmlFor="movimento-data">
              <DateInput id="movimento-data" value={entryDate} onChange={(event) => touch(setEntryDate)(event.target.value)} />
            </Field>
            <Field label="Verso" htmlFor="movimento-verso">
              <Select
                id="movimento-verso"
                value={direction}
                onValueChange={touch(setDirection)}
                options={[
                  { value: "IN", label: "Entrata" },
                  { value: "OUT", label: "Uscita" },
                ]}
              />
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field
              label="Importo"
              htmlFor="movimento-importo"
              error={amount.trim() && !importoValido ? "L'importo deve essere un numero maggiore di zero." : undefined}
            >
              <CurrencyInput
                id="movimento-importo"
                value={amount}
                onChange={(event) => touch(setAmount)(event.target.value)}
              />
            </Field>
            <Field label="Conto" htmlFor="movimento-conto">
              <Select
                id="movimento-conto"
                value={accountId}
                onValueChange={touch(setAccountId)}
                options={accountOptions(accounts)}
                placeholder="Dove si e mosso il denaro"
              />
            </Field>
          </FormGrid>

          <Field
            label="Causale"
            htmlFor="movimento-causale"
            helper="Obbligatoria, e scelta da un elenco: e cio che rende il movimento leggibile in un rendiconto. Le causali si configurano nel profilo fiscale del club."
          >
            <Select
              id="movimento-causale"
              value={operationTypeCode}
              onValueChange={touch(setOperationTypeCode)}
              options={causali.map((type) => ({ value: type.code, label: type.label }))}
              placeholder="Scegli una causale"
            />
          </Field>

          <Field label="Descrizione" htmlFor="movimento-descrizione">
            <TextInput
              id="movimento-descrizione"
              placeholder="Cosa e successo"
              value={description}
              onChange={(event) => touch(setDescription)(event.target.value)}
            />
          </Field>

          <FormGrid columns={2}>
            <Field label="Controparte" htmlFor="movimento-controparte" optional>
              <TextInput
                id="movimento-controparte"
                placeholder="Chi sta dall'altra parte"
                value={counterpartyLabel}
                onChange={(event) => touch(setCounterpartyLabel)(event.target.value)}
              />
            </Field>
            <Field label="Metodo di pagamento" htmlFor="movimento-metodo" optional>
              <TextInput
                id="movimento-metodo"
                placeholder="Contanti, bonifico, POS"
                value={paymentMethod}
                onChange={(event) => touch(setPaymentMethod)(event.target.value)}
              />
            </Field>
          </FormGrid>

          {/* Si chiede solo ai club multi-sede (ADR-0038). */}
          {isMultiSiteClub(sites) ? (
            <Field label="Sede" htmlFor="movimento-sede" optional>
              <Select
                id="movimento-sede"
                value={siteId || NESSUNA_SEDE}
                onValueChange={(next) => touch(setSiteId)(next === NESSUNA_SEDE ? "" : next)}
                options={siteOptions(sites)}
              />
            </Field>
          ) : null}

          <Field label="Note" htmlFor="movimento-note" optional>
            <Textarea
              id="movimento-note"
              rows={2}
              value={notes}
              onChange={(event) => touch(setNotes)(event.target.value)}
            />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
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
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEntryDate(oggi());
    setAmount("");
    setFromAccountId("");
    setToAccountId("");
    setDescription("");
    setNotes("");
    setSiteId("");
    setDirty(false);
  }, [open]);

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setDirty(true);
    setter(value);
  };

  const importo = parseImporto(amount);
  const importoValido = Number.isFinite(importo) && importo > 0;
  const stessoConto = Boolean(fromAccountId) && fromAccountId === toAccountId;
  const completo =
    Boolean(entryDate) &&
    importoValido &&
    Boolean(fromAccountId) &&
    Boolean(toAccountId) &&
    !stessoConto;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Prima nota"
      title="Registra un giroconto"
      description="Denaro che cambia conto senza entrare ne uscire dal club: un versamento della cassa in banca, un prelievo. Non compare fra le entrate ne fra le uscite del periodo, e la liquidita totale non cambia."
      dirty={dirty}
      locked={saving}
      data-test="accounting-transfer-drawer"
      footer={
        <>
          <Button
            variant="primary"
            disabled={!completo || saving}
            loading={saving}
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
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <FormGrid columns={2}>
            <Field label="Data" htmlFor="giroconto-data" required>
              <DateInput id="giroconto-data" value={entryDate} onChange={(event) => touch(setEntryDate)(event.target.value)} />
            </Field>
            <Field
              label="Importo"
              htmlFor="giroconto-importo"
              required
              error={amount.trim() && !importoValido ? "L'importo deve essere un numero maggiore di zero." : undefined}
            >
              <CurrencyInput id="giroconto-importo" value={amount} onChange={(event) => touch(setAmount)(event.target.value)} />
            </Field>
          </FormGrid>

          <FormGrid columns={2}>
            <Field label="Dal conto" htmlFor="giroconto-da" required>
              <Select
                id="giroconto-da"
                value={fromAccountId}
                onValueChange={touch(setFromAccountId)}
                options={accountOptions(accounts)}
                placeholder="Conto di partenza"
              />
            </Field>
            <Field
              label="Al conto"
              htmlFor="giroconto-a"
              required
              error={stessoConto ? "Il conto di arrivo deve essere diverso da quello di partenza." : undefined}
            >
              <Select
                id="giroconto-a"
                value={toAccountId}
                onValueChange={touch(setToAccountId)}
                options={accountOptions(accounts.filter((account) => account.id !== fromAccountId))}
                placeholder="Conto di arrivo"
              />
            </Field>
          </FormGrid>

          <Field label="Descrizione" htmlFor="giroconto-descrizione">
            <TextInput
              id="giroconto-descrizione"
              placeholder="Versamento incassi di settembre"
              value={description}
              onChange={(event) => touch(setDescription)(event.target.value)}
            />
          </Field>

          {isMultiSiteClub(sites) ? (
            <Field label="Sede" htmlFor="giroconto-sede">
              <Select
                id="giroconto-sede"
                value={siteId || NESSUNA_SEDE}
                onValueChange={(next) => touch(setSiteId)(next === NESSUNA_SEDE ? "" : next)}
                options={siteOptions(sites)}
              />
            </Field>
          ) : null}

          <Field label="Note" htmlFor="giroconto-note">
            <Textarea id="giroconto-note" rows={2} value={notes} onChange={(event) => touch(setNotes)(event.target.value)} />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

/* ========================================================================== */
/* Storno                                                                      */
/* ========================================================================== */

/**
 * Lo storno, con il **motivo obbligatorio**: una conferma distruttiva in un
 * modale che non si chiude sul velo (guideline 08 §8.9).
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
    <Modal
      open={Boolean(line)}
      onOpenChange={saving ? () => {} : onOpenChange}
      title="Storna il movimento"
      description="Il denaro non si cancella. Lo storno lascia visibili entrambe le righe, l'originale e la sua correzione, con il motivo scritto sopra."
      tone="danger"
      icon={<Undo2 />}
      strict
      width={560}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || saving}
            loading={saving}
            onClick={() => onSubmit({ reason: reason.trim(), entry_date: entryDate })}
          >
            {saving ? "Storno..." : "Storna"}
          </Button>
        </>
      }
    >
      {line ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red px-4 py-3">
            <p className="font-brand text-[13px] font-semibold text-egw-ink">{line.description}</p>
            <p className="egw-num mt-1 font-brand text-[12px] text-egw-ink-72">
              {formatDate(line.entryDate)} · {formatCents(line.amountCents)} ·{" "}
              {line.financialAccountName || "conto non attribuito"}
            </p>
            {line.transferGroupId ? (
              <p className="mt-2 font-brand text-[12.5px] font-medium text-egw-ink">
                E la gamba di un giroconto: lo storno riguarda entrambe le gambe,
                altrimenti le due meta divergono e il denaro sparisce fra due conti.
              </p>
            ) : null}
          </div>

          <FieldSizeProvider size="sm">
            <Field label="Motivo dello storno" htmlFor="storno-motivo" required>
              <Textarea
                id="storno-motivo"
                rows={3}
                placeholder="Perche questo movimento va corretto"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <Field label="Data dello storno" htmlFor="storno-data" className="mt-4" width="20ch">
              <DateInput id="storno-data" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} />
            </Field>
          </FieldSizeProvider>
        </div>
      ) : null}
    </Modal>
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
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!line) return;
    setStatus(
      line.reconciliationStatus === "unreconciled"
        ? "reconciled"
        : line.reconciliationStatus,
    );
    setValueDate(line.valueDate ? line.valueDate.slice(0, 10) : "");
    setBankReference(line.bankReference || "");
    setDirty(false);
  }, [line]);

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setDirty(true);
    setter(value);
  };

  return (
    <Drawer
      open={Boolean(line)}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Prima nota"
      title="Spunta contro l'estratto conto"
      description="Riconciliare non cambia nessun numero: dice che l'estratto conto conferma il movimento. E cosi che «cosa non ho ancora visto arrivare in banca» diventa una domanda con una risposta."
      dirty={dirty}
      locked={saving}
      data-test="accounting-reconcile-drawer"
      footer={
        <>
          <Button
            variant="primary"
            disabled={saving}
            loading={saving}
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
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        {line ? (
          <DrawerSection eyebrow="Movimento">
            <LinePreview line={line} />
          </DrawerSection>
        ) : null}
        <DrawerSection eyebrow="Riconciliazione">
          <div className="flex flex-col gap-5">
            <Field label="Stato" htmlFor="riconcilia-stato">
              <Select
                id="riconcilia-stato"
                value={status}
                onValueChange={touch(setStatus)}
                options={RECONCILIATION_STATUSES.map((value) => ({ value, label: RECONCILIATION_STATUS_LABELS[value] }))}
              />
            </Field>
            <Field label="Data valuta" htmlFor="riconcilia-valuta" optional>
              <DateInput id="riconcilia-valuta" value={valueDate} onChange={(event) => touch(setValueDate)(event.target.value)} />
            </Field>
            <Field label="Riferimento bancario" htmlFor="riconcilia-riferimento" optional>
              <TextInput
                id="riconcilia-riferimento"
                placeholder="CRO, numero distinta"
                value={bankReference}
                onChange={(event) => touch(setBankReference)(event.target.value)}
              />
            </Field>
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
