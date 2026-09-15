"use client";

import * as React from "react";
import { Euro, Mail, MapPin, Pencil, Phone, Plus, StickyNote, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, SearchableSelect, Select, Textarea } from "@/components/web/forms/Field";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { IdentityTile } from "@/components/web/primitives/Identity";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { Eyebrow, InsetBlock } from "@/components/web/primitives/Surface";
import { useToast } from "@/components/ui/toast-notification";
import { todayLocalDateOnly } from "@/lib/date-only";
import { MISSING, formatDateShort, formatMoney } from "@/lib/web/format";
import {
  PAYMENT_TYPE_OPTIONS,
  PERSON_TYPE_OPTIONS,
  amountInputValue,
  associationField,
  associationsOf,
  athletesOf,
  contactDisplayName,
  contactsOf,
  formatAddressLines,
  formatAssociationCost,
  parseAmountInput,
  paymentsOf,
  resolvePersonName,
  trainersOf,
  type PaymentType,
  type PersonRef,
  type PersonType,
  type Procura,
  type ProcuraAssociation,
  type ProcuraPayment,
} from "@/components/procura/v2/procura-model";

/**
 * L'ispettore di una procura (guideline 09 §9.3 «Inspector summary block»,
 * 06 §6.7): un cassetto da 480 che riproduce il pannello di dettaglio della
 * V1 con le sue tre schede — Informazioni · Pagamenti · Associazioni.
 *
 * Un cassetto non apre un secondo cassetto: «Nuovo pagamento», «Aggiungi
 * associazione» e le note sostituiscono il corpo dell'ispettore con il loro
 * modulo compatto e una freccia «indietro» (lo stesso gesto delle Azioni
 * rapide, 06 §6.5). L'unico modale ammesso e la conferma dell'eliminazione di
 * un'associazione. Le scritture restano quelle della V1: ogni modifica
 * riscrive l'intera procura via `updateClubDataItem`, e la forma dei campi
 * salvati non cambia perche `club-financial-summary.ts` la legge.
 */
export type InspectorSection = "info" | "payments" | "associations";

type Mode =
  | { kind: "view" }
  | { kind: "payment" }
  | { kind: "association"; type: PersonType; editing: ProcuraAssociation | null }
  | { kind: "notes"; type: PersonType; association: ProcuraAssociation };

export type People = { athletes: PersonRef[]; trainers: PersonRef[] };

type PaymentForm = {
  personId: string;
  personType: PersonType;
  date: string;
  amount: string;
  type: PaymentType;
  description: string;
};

const emptyPayment = (): PaymentForm => ({
  personId: "",
  personType: "athlete",
  date: todayLocalDateOnly(),
  amount: "",
  type: "entrata",
  description: "",
});

type AssociationForm = { personId: string; personType: PersonType; cost: string };

const emptyAssociation = (type: PersonType = "athlete"): AssociationForm => ({ personId: "", personType: type, cost: "" });

const SECTIONS: ReadonlyArray<{ value: InspectorSection; label: string }> = [
  { value: "info", label: "Informazioni" },
  { value: "payments", label: "Pagamenti" },
  { value: "associations", label: "Associazioni" },
];

export function ProcuraInspector({
  open,
  onOpenChange,
  procura,
  people,
  onEdit,
  onAddPayment,
  onAddAssociation,
  onUpdateProcura,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procura: Procura | null;
  people: People;
  /** «Modifica informazioni»: chiude l'ispettore e apre il cassetto di modifica. */
  onEdit: (procura: Procura) => void;
  /** V1 `addPayment`: torna `true` se la scrittura e andata a buon fine. */
  onAddPayment: (procura: Procura, payment: ProcuraPayment) => Promise<boolean>;
  /** V1 `addAssociation` (creazione). */
  onAddAssociation: (procura: Procura, association: ProcuraAssociation) => Promise<boolean>;
  /** V1 `updateSelectedProcura`: modifica/eliminazione di un'associazione, note. */
  onUpdateProcura: (procura: Procura) => Promise<boolean>;
}) {
  const { showToast } = useToast();
  const [section, setSection] = React.useState<InspectorSection>("info");
  const [mode, setMode] = React.useState<Mode>({ kind: "view" });
  const [payment, setPayment] = React.useState<PaymentForm>(emptyPayment);
  const [association, setAssociation] = React.useState<AssociationForm>(() => emptyAssociation());
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState<{ type: PersonType; association: ProcuraAssociation } | null>(null);

  const procuraId = procura?.id ?? null;
  React.useEffect(() => {
    // Un'altra procura, o una riapertura: si riparte dalla prima scheda in lettura.
    setSection("info");
    setMode({ kind: "view" });
  }, [open, procuraId]);

  const backToView = () => setMode({ kind: "view" });

  const openPaymentForm = () => {
    setPayment(emptyPayment());
    setMode({ kind: "payment" });
  };

  const openAssociationForm = (type: PersonType = "athlete", editing: ProcuraAssociation | null = null) => {
    setAssociation(
      editing
        ? { personId: editing.personId, personType: type, cost: amountInputValue(Number(editing.cost) || 0) }
        : emptyAssociation(type),
    );
    setMode({ kind: "association", type, editing });
  };

  const openNotesForm = (type: PersonType, target: ProcuraAssociation) => {
    setNotes(target.notes || "");
    setMode({ kind: "notes", type, association: target });
  };

  /* ── Scritture (stesse regole e stessi messaggi della V1) ─────────────── */
  const submitPayment = async () => {
    if (!procura) return;
    const amount = parseAmountInput(payment.amount);
    if (!payment.personId || !amount) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }
    setBusy(true);
    try {
      const ok = await onAddPayment(procura, {
        personId: payment.personId,
        personType: payment.personType,
        date: payment.date,
        amount,
        type: payment.type,
        description: payment.description,
        id: `payment_${Date.now()}`,
        createdAt: new Date().toISOString(),
      });
      if (ok) backToView();
    } finally {
      setBusy(false);
    }
  };

  const submitAssociation = async () => {
    if (!procura || mode.kind !== "association") return;
    if (!association.personId) {
      showToast("error", "Seleziona una persona da associare");
      return;
    }
    setBusy(true);
    try {
      const cost = parseAmountInput(association.cost);
      let ok: boolean;
      if (mode.editing) {
        const field = associationField(association.personType);
        const original = mode.editing.personId;
        ok = await onUpdateProcura({
          ...procura,
          [field]: associationsOf(procura, association.personType).map((row) =>
            row.personId === original ? { ...row, cost, personId: association.personId } : row,
          ),
        });
      } else {
        ok = await onAddAssociation(procura, {
          personId: association.personId,
          personType: association.personType,
          cost,
          notes: "",
          addedAt: new Date().toISOString(),
        });
      }
      if (ok) backToView();
    } finally {
      setBusy(false);
    }
  };

  const submitNotes = async () => {
    if (!procura || mode.kind !== "notes") return;
    setBusy(true);
    try {
      const field = associationField(mode.type);
      const ok = await onUpdateProcura({
        ...procura,
        [field]: associationsOf(procura, mode.type).map((row) =>
          row.personId === mode.association.personId ? { ...row, notes } : row,
        ),
      });
      if (ok) backToView();
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteAssociation = async () => {
    if (!procura || !deleting) return;
    setBusy(true);
    try {
      const field = associationField(deleting.type);
      const ok = await onUpdateProcura({
        ...procura,
        [field]: associationsOf(procura, deleting.type).filter((row) => row.personId !== deleting.association.personId),
      });
      if (ok) setDeleting(null);
    } finally {
      setBusy(false);
    }
  };

  /* ── Intestazione e piede secondo il modo ─────────────────────────────── */
  const header = (() => {
    switch (mode.kind) {
      case "payment":
        return { eyebrow: "Pagamenti", title: "Nuovo pagamento", description: procura?.name };
      case "association":
        return { eyebrow: "Associazioni", title: mode.editing ? "Modifica associazione" : "Nuova associazione", description: procura?.name };
      case "notes":
        return {
          eyebrow: "Associazioni",
          title: "Note associazione",
          description: procura ? resolvePersonName(people, mode.type, mode.association.personId) : undefined,
        };
      default:
        return { eyebrow: "Procura", title: procura?.name ?? "", description: procura ? formatAddressLines(procura.address).join(" · ") || undefined : undefined };
    }
  })();

  const paymentDirty = mode.kind === "payment" && Boolean(payment.personId || payment.amount || payment.description);
  const associationDirty =
    mode.kind === "association" &&
    (mode.editing
      ? association.personId !== mode.editing.personId || parseAmountInput(association.cost) !== (Number(mode.editing.cost) || 0)
      : Boolean(association.personId || association.cost));
  const notesDirty = mode.kind === "notes" && notes !== (mode.association.notes || "");
  const dirty = paymentDirty || associationDirty || notesDirty;

  const footer = (() => {
    if (!procura) return null;
    switch (mode.kind) {
      case "payment":
        return (
          <>
            <Button variant="primary" onClick={() => void submitPayment()} loading={busy}>
              Salva
            </Button>
            <Button variant="secondary" onClick={backToView} disabled={busy}>
              Annulla
            </Button>
          </>
        );
      case "association":
        return (
          <>
            <Button variant="primary" onClick={() => void submitAssociation()} loading={busy}>
              {mode.editing ? "Aggiorna" : "Salva"}
            </Button>
            <Button variant="secondary" onClick={backToView} disabled={busy}>
              Annulla
            </Button>
          </>
        );
      case "notes":
        return (
          <>
            <Button variant="primary" onClick={() => void submitNotes()} loading={busy}>
              Salva note
            </Button>
            <Button variant="secondary" onClick={backToView} disabled={busy}>
              Annulla
            </Button>
          </>
        );
      default:
        return (
          <Button variant="secondary" icon={<Pencil />} onClick={() => onEdit(procura)}>
            Modifica informazioni
          </Button>
        );
    }
  })();

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        width="default"
        eyebrow={header.eyebrow}
        title={header.title}
        description={header.description}
        onBack={mode.kind === "view" ? undefined : backToView}
        dirty={dirty}
        locked={busy}
        footer={footer}
        data-test="procura-inspector"
      >
        {!procura ? null : mode.kind === "view" ? (
          <FieldSizeProvider size="sm">
            <div className="mb-5 flex items-center gap-3">
              <IdentityTile name={procura.name} size={44} radius="panel-sm" />
              <div className="min-w-0 flex-1">
                <p className="egw-ellipsis font-brand text-[14px] font-bold text-egw-ink">{procura.name}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-2 font-brand text-[11.5px] text-egw-ink-62">
                  <span className="egw-num">{contactsOf(procura).length} contatti</span>
                  <span aria-hidden>·</span>
                  <span className="egw-num">{athletesOf(procura).length} atleti</span>
                  <span aria-hidden>·</span>
                  <span className="egw-num">{trainersOf(procura).length} allenatori</span>
                </p>
              </div>
            </div>
            <SegmentedControl
              aria-label="Sezioni della procura"
              size="sm"
              className="mb-5 w-full [&>button]:flex-1 [&>button]:justify-center"
              value={section}
              onChange={setSection}
              options={SECTIONS.map((s) => ({
                ...s,
                count: s.value === "payments" ? paymentsOf(procura).length : s.value === "associations" ? athletesOf(procura).length + trainersOf(procura).length : null,
              }))}
            />
            {section === "info" ? <InfoSection procura={procura} /> : null}
            {section === "payments" ? <PaymentsSection procura={procura} people={people} onNew={openPaymentForm} /> : null}
            {section === "associations" ? (
              <AssociationsSection
                procura={procura}
                people={people}
                onNew={() => openAssociationForm("athlete")}
                onEdit={(type, row) => openAssociationForm(type, row)}
                onNotes={openNotesForm}
                onDelete={(type, row) => setDeleting({ type, association: row })}
              />
            ) : null}
          </FieldSizeProvider>
        ) : mode.kind === "payment" ? (
          <PaymentForm procura={procura} people={people} values={payment} onChange={setPayment} />
        ) : mode.kind === "association" ? (
          <AssociationForm people={people} values={association} editing={Boolean(mode.editing)} onChange={setAssociation} />
        ) : (
          <FieldSizeProvider size="sm">
            <Field label="Note" htmlFor="procura-association-notes">
              <Textarea
                id="procura-association-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Inserisci note per questa associazione..."
                rows={5}
                autoFocus
              />
            </Field>
          </FieldSizeProvider>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && !busy && setDeleting(null)}
        title={`Eliminare l'associazione con ${deleting ? resolvePersonName(people, deleting.type, deleting.association.personId) : ""}?`}
        description="Sei sicuro di voler eliminare questa associazione? Il costo e le note registrate se ne vanno con lei; i pagamenti già registrati restano."
        confirmLabel="Elimina"
        tone="danger"
        loading={busy}
        onConfirm={confirmDeleteAssociation}
      />
    </>
  );
}

/* ── Informazioni ────────────────────────────────────────────────────────── */
function InfoSection({ procura }: { procura: Procura }) {
  const lines = formatAddressLines(procura.address);
  const contacts = contactsOf(procura);
  return (
    <>
      <DrawerSection eyebrow="Indirizzo sede">
        <InsetBlock className="flex items-start gap-3 p-3">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-egw-ink-42" aria-hidden />
          {lines.length ? (
            <div className="min-w-0 font-brand text-[13px] leading-[1.5] text-egw-ink">
              {lines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          ) : (
            <p className="font-brand text-[13px] text-egw-ink-42">{MISSING}</p>
          )}
        </InsetBlock>
      </DrawerSection>
      <DrawerSection eyebrow="Contatti procuratori">
        {contacts.length ? (
          <ul className="flex flex-col gap-2">
            {contacts.map((contact) => (
              <li key={contact.id}>
                <InsetBlock className="p-3">
                  <p className="font-brand text-[13px] font-semibold text-egw-ink">{contactDisplayName(contact)}</p>
                  {contact.phone ? (
                    <p className="mt-1 flex items-center gap-1.5 font-brand text-[12px] text-egw-ink-62">
                      <Phone className="h-3 w-3 shrink-0" aria-hidden />
                      <a href={`tel:${contact.phone}`} className="egw-num hover:underline">
                        {contact.phone}
                      </a>
                    </p>
                  ) : null}
                  {contact.email ? (
                    <p className="mt-0.5 flex items-center gap-1.5 font-brand text-[12px] text-egw-ink-62">
                      <Mail className="h-3 w-3 shrink-0" aria-hidden />
                      <a href={`mailto:${contact.email}`} className="egw-ellipsis hover:underline">
                        {contact.email}
                      </a>
                    </p>
                  ) : null}
                </InsetBlock>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-brand text-[12.5px] text-egw-ink-62">Nessun contatto registrato</p>
        )}
      </DrawerSection>
    </>
  );
}

/* ── Pagamenti ───────────────────────────────────────────────────────────── */
function PaymentsSection({ procura, people, onNew }: { procura: Procura; people: People; onNew: () => void }) {
  const payments = paymentsOf(procura);
  return (
    <DrawerSection>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Eyebrow>Storico pagamenti</Eyebrow>
        <Button variant="neutral" size="sm" icon={<Plus />} onClick={onNew}>
          Nuovo pagamento
        </Button>
      </div>
      {payments.length ? (
        <ul className="flex flex-col gap-2">
          {payments.map((row) => {
            const outbound = row.type === "uscita";
            return (
              <li key={row.id}>
                <InsetBlock className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="egw-ellipsis font-brand text-[13px] font-semibold text-egw-ink">
                      {resolvePersonName(people, row.personType, row.personId)}
                    </p>
                    <p className="mt-0.5 egw-num font-brand text-[11.5px] text-egw-ink-62">{formatDateShort(row.date)}</p>
                    {row.description ? <p className="mt-1 font-brand text-[12px] text-egw-ink-72">{row.description}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={cn("egw-num font-brand text-[13.5px] font-extrabold", outbound ? "text-egw-red" : "text-egw-green")}>
                      {formatMoney(outbound ? -Math.abs(Number(row.amount) || 0) : Number(row.amount) || 0)}
                    </span>
                    <DataChip size="sm" tone={outbound ? "red" : "green"}>
                      {outbound ? "Uscita" : "Entrata"}
                    </DataChip>
                  </div>
                </InsetBlock>
              </li>
            );
          })}
        </ul>
      ) : (
        <InsetBlock dashed className="flex flex-col items-center gap-2 py-6 text-center">
          <Euro className="h-5 w-5 text-egw-ink-42" aria-hidden />
          <p className="font-brand text-[12.5px] text-egw-ink-62">Nessun pagamento registrato</p>
        </InsetBlock>
      )}
    </DrawerSection>
  );
}

function PaymentForm({
  procura,
  people,
  values,
  onChange,
}: {
  procura: Procura;
  people: People;
  values: PaymentForm;
  onChange: (values: PaymentForm) => void;
}) {
  // Solo chi e gia associato a questa procura (V1).
  const personOptions = associationsOf(procura, values.personType).map((row) => ({
    value: row.personId,
    label: resolvePersonName(people, values.personType, row.personId),
  }));
  return (
    <FieldSizeProvider size="sm">
      <div className="flex flex-col gap-4">
        <Field label="Tipo persona" htmlFor="procura-payment-person-type">
          <Select
            id="procura-payment-person-type"
            value={values.personType}
            onValueChange={(value) => onChange({ ...values, personType: value as PersonType, personId: "" })}
            options={PERSON_TYPE_OPTIONS}
          />
        </Field>
        <Field
          label="Persona"
          htmlFor="procura-payment-person"
          required
          helper={personOptions.length === 0 ? "Nessuna persona di questo tipo è associata alla procura: aggiungila prima dalle associazioni." : undefined}
        >
          <SearchableSelect
            id="procura-payment-person"
            value={values.personId}
            onValueChange={(value) => onChange({ ...values, personId: value || "" })}
            options={personOptions}
            placeholder="Seleziona"
            disabled={personOptions.length === 0}
          />
        </Field>
        <Field label="Data" htmlFor="procura-payment-date">
          <DateInput id="procura-payment-date" value={values.date} onChange={(event) => onChange({ ...values, date: event.target.value })} />
        </Field>
        <Field label="Importo (€)" htmlFor="procura-payment-amount" required>
          <CurrencyInput id="procura-payment-amount" value={values.amount} onChange={(event) => onChange({ ...values, amount: event.target.value })} />
        </Field>
        <Field label="Tipo" htmlFor="procura-payment-type">
          <Select
            id="procura-payment-type"
            value={values.type}
            onValueChange={(value) => onChange({ ...values, type: value as PaymentType })}
            options={PAYMENT_TYPE_OPTIONS}
          />
        </Field>
        <Field label="Descrizione" htmlFor="procura-payment-description">
          <Textarea
            id="procura-payment-description"
            value={values.description}
            onChange={(event) => onChange({ ...values, description: event.target.value })}
            placeholder="Descrizione del pagamento"
            rows={3}
          />
        </Field>
      </div>
    </FieldSizeProvider>
  );
}

/* ── Associazioni ────────────────────────────────────────────────────────── */
function AssociationsSection({
  procura,
  people,
  onNew,
  onEdit,
  onNotes,
  onDelete,
}: {
  procura: Procura;
  people: People;
  onNew: () => void;
  onEdit: (type: PersonType, row: ProcuraAssociation) => void;
  onNotes: (type: PersonType, row: ProcuraAssociation) => void;
  onDelete: (type: PersonType, row: ProcuraAssociation) => void;
}) {
  const groups: ReadonlyArray<{ type: PersonType; title: string; empty: string; rows: ProcuraAssociation[] }> = [
    { type: "athlete", title: "Atleti", empty: "Nessun atleta associato", rows: athletesOf(procura) },
    { type: "trainer", title: "Allenatori", empty: "Nessun allenatore associato", rows: trainersOf(procura) },
  ];
  return (
    <DrawerSection>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Eyebrow>Atleti e allenatori associati</Eyebrow>
        <Button variant="neutral" size="sm" icon={<Plus />} onClick={onNew}>
          Aggiungi associazione
        </Button>
      </div>
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.type}>
            <h3 className="mb-2 font-brand text-[13px] font-bold text-egw-ink">{group.title}</h3>
            {group.rows.length ? (
              <ul className="flex flex-col gap-2">
                {group.rows.map((row) => {
                  const name = resolvePersonName(people, group.type, row.personId);
                  return (
                    <li key={`${group.type}-${row.personId}`}>
                      <InsetBlock className="flex items-start gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="egw-ellipsis font-brand text-[13px] font-semibold text-egw-ink">{name}</p>
                          <p className="mt-0.5 font-brand text-[12px] text-egw-ink-62">
                            Costo: <span className="egw-num font-semibold text-egw-ink">{formatAssociationCost(row.cost)}</span>
                          </p>
                          {row.notes ? <p className="mt-1 font-brand text-[12px] italic text-egw-ink-62">Note: {row.notes}</p> : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <IconButton
                            aria-label={`Aggiungi o modifica note di ${name}`}
                            title="Aggiungi/Modifica Note"
                            size="xs"
                            variant="row"
                            className={row.notes ? "text-egw-amber-ink hover:text-egw-amber-ink" : undefined}
                            onClick={() => onNotes(group.type, row)}
                          >
                            <StickyNote />
                          </IconButton>
                          <IconButton aria-label={`Modifica associazione di ${name}`} size="xs" variant="row" onClick={() => onEdit(group.type, row)}>
                            <Pencil />
                          </IconButton>
                          <IconButton
                            aria-label={`Elimina associazione di ${name}`}
                            size="xs"
                            variant="row"
                            className="text-egw-red hover:text-egw-red"
                            onClick={() => onDelete(group.type, row)}
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      </InsetBlock>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <InsetBlock dashed className="flex items-center gap-2 py-3">
                <Users className="h-4 w-4 shrink-0 text-egw-ink-42" aria-hidden />
                <p className="font-brand text-[12.5px] text-egw-ink-62">{group.empty}</p>
              </InsetBlock>
            )}
          </div>
        ))}
      </div>
    </DrawerSection>
  );
}

function AssociationForm({
  people,
  values,
  editing,
  onChange,
}: {
  people: People;
  values: AssociationForm;
  editing: boolean;
  onChange: (values: AssociationForm) => void;
}) {
  // Tutti gli atleti/allenatori del club (V1): la persona resta modificabile anche in modifica.
  const personOptions = (values.personType === "athlete" ? people.athletes : people.trainers).map((person) => ({
    value: person.id,
    label: person.name,
  }));
  return (
    <FieldSizeProvider size="sm">
      <div className="flex flex-col gap-4">
        <Field label="Tipo" htmlFor="procura-association-type" helper={editing ? "Il tipo non si cambia in modifica: elimina l'associazione e creane una nuova." : undefined}>
          <Select
            id="procura-association-type"
            value={values.personType}
            onValueChange={(value) => onChange({ ...values, personType: value as PersonType, personId: "" })}
            options={PERSON_TYPE_OPTIONS}
            disabled={editing}
          />
        </Field>
        <Field label="Persona" htmlFor="procura-association-person" required>
          <SearchableSelect
            id="procura-association-person"
            value={values.personId}
            onValueChange={(value) => onChange({ ...values, personId: value || "" })}
            options={personOptions}
            placeholder="Seleziona"
            searchPlaceholder="Cerca per nome"
          />
        </Field>
        <Field label="Costo (€)" htmlFor="procura-association-cost">
          <CurrencyInput id="procura-association-cost" value={values.cost} onChange={(event) => onChange({ ...values, cost: event.target.value })} />
        </Field>
      </div>
    </FieldSizeProvider>
  );
}
