"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import {
  CurrencyInput,
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  Select,
  Textarea,
  TextInput,
  TimeInput,
  ValidationSummary,
} from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InfoCard } from "@/components/web/page/Cards";
import type { ClubStructure, StructureBooking, StructureBookingStatus } from "@/lib/structures-utils";
import { BOOKING_PAYMENT_OPTIONS, BOOKING_STATUS_OPTIONS, isFamilyBooking } from "@/components/structures/v2/structure-model";
import { buildBooking, type BookingForm, type BookingFormError } from "@/components/structures/v2/booking-model";

/**
 * Il cassetto di una prenotazione (undici campi: 720). Sostituisce il modulo
 * in linea della tab Prenotazioni V1 con gli stessi campi e le stesse
 * validazioni (`buildBooking`), e si apre anche dal calendario: un giorno
 * precompila la creazione, una prenotazione apre la modifica.
 */
export function BookingDrawer({
  open,
  structure,
  initialForm,
  editing,
  onClose,
  onSave,
}: {
  open: boolean;
  structure: ClubStructure;
  /** Il modulo di partenza (vuoto, sul giorno scelto, o della prenotazione). */
  initialForm: BookingForm;
  /** La prenotazione in modifica, per dire chi l'ha chiesta. */
  editing: StructureBooking | null;
  onClose: () => void;
  onSave: (booking: StructureBooking) => Promise<boolean>;
}) {
  const ID = "booking";
  const [form, setForm] = React.useState<BookingForm>(initialForm);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<BookingFormError[]>([]);

  const [openedFor, setOpenedFor] = React.useState<BookingForm | null>(null);
  if (open && initialForm !== openedFor) {
    setOpenedFor(initialForm);
    setForm(initialForm);
    setDirty(false);
    setErrors([]);
  }

  const patch = (next: Partial<BookingForm>) => {
    setForm((current) => ({ ...current, ...next }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  const errorFor = (id: string) => errors.find((error) => error.id === `${ID}-${id}`)?.label;

  const submit = async () => {
    const result = buildBooking(structure, form, ID);
    if (!result.booking) {
      setErrors(result.errors);
      if (result.errors[0]?.id) document.getElementById(result.errors[0].id)?.focus();
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave(result.booking);
      if (ok) setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const fieldOptions = structure.fields.map((field) => ({ value: field.id, label: field.name }));

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      width="wide"
      eyebrow="Prenotazioni"
      title={form.id ? "Modifica prenotazione" : "Nuova prenotazione"}
      dirty={dirty}
      locked={saving}
      data-test="booking-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            {form.id ? "Salva prenotazione" : "Aggiungi prenotazione"}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-6">
          <ValidationSummary errors={errors} />

          {editing && isFamilyBooking(editing) ? (
            <InfoCard eyebrow="Richiesta della famiglia">
              Chiesta da {editing.bookedByName || editing.athleteName || "una famiglia"}
              {editing.athleteName && editing.bookedByName && editing.athleteName !== editing.bookedByName ? ` per ${editing.athleteName}` : ""}. Confermarla
              o annullarla qui la aggiorna anche nell&apos;area famiglia.
            </InfoCard>
          ) : null}

          {!structure.fields.length ? (
            <InfoCard>Aggiungi un campo alla struttura prima di registrare una prenotazione.</InfoCard>
          ) : null}

          <DrawerSection eyebrow="Cosa">
            <FormGrid>
              <Field label="Campo" htmlFor={`${ID}-field`} required error={errorFor("field")}>
                <Select id={`${ID}-field`} value={form.fieldId} onValueChange={(value) => patch({ fieldId: value })} options={fieldOptions} placeholder="Seleziona campo" />
              </Field>
              <Field label="Titolo" htmlFor={`${ID}-title`} required error={errorFor("title")}>
                <TextInput id={`${ID}-title`} value={form.title} onChange={(event) => patch({ title: event.target.value })} />
              </Field>
            </FormGrid>
          </DrawerSection>

          <DrawerSection eyebrow="Quando">
            <div className="flex flex-col gap-5">
              <FormGrid>
                <Field label="Data inizio" htmlFor={`${ID}-start-date`} required error={errorFor("start-date")}>
                  <DateInput
                    id={`${ID}-start-date`}
                    value={form.startDate}
                    onChange={(event) => patch({ startDate: event.target.value, endDate: form.endDate || event.target.value })}
                  />
                </Field>
                <Field label="Ora inizio" htmlFor={`${ID}-start-time`} required error={errorFor("start-time")}>
                  <TimeInput id={`${ID}-start-time`} value={form.startTime} onChange={(event) => patch({ startTime: event.target.value })} />
                </Field>
                <Field label="Data fine" htmlFor={`${ID}-end-date`} required>
                  <DateInput id={`${ID}-end-date`} value={form.endDate} onChange={(event) => patch({ endDate: event.target.value })} />
                </Field>
                <Field label="Ora fine" htmlFor={`${ID}-end-time`} required error={errorFor("end-time")}>
                  <TimeInput id={`${ID}-end-time`} value={form.endTime} onChange={(event) => patch({ endTime: event.target.value })} />
                </Field>
              </FormGrid>
              <Field label="Stato" htmlFor={`${ID}-status`} width="24ch">
                <Select
                  id={`${ID}-status`}
                  value={form.status}
                  onValueChange={(value) => patch({ status: value as StructureBookingStatus })}
                  options={BOOKING_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                />
              </Field>
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Chi e quanto">
            <div className="flex flex-col gap-5">
              <Field label="Soggetto prenotante" htmlFor={`${ID}-who`} optional>
                <TextInput id={`${ID}-who`} value={form.bookedByName} onChange={(event) => patch({ bookedByName: event.target.value })} />
              </Field>
              <FormGrid>
                <Field label="Importo" htmlFor={`${ID}-amount`} optional error={errorFor("amount")}>
                  <CurrencyInput id={`${ID}-amount`} value={form.amount} onChange={(event) => patch({ amount: event.target.value })} />
                </Field>
                <Field label="Stato pagamento" htmlFor={`${ID}-payment`}>
                  <Select
                    id={`${ID}-payment`}
                    value={form.paymentStatus}
                    onValueChange={(value) => patch({ paymentStatus: value as BookingForm["paymentStatus"] })}
                    options={BOOKING_PAYMENT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                  />
                </Field>
              </FormGrid>
              <Field label="Note" htmlFor={`${ID}-notes`} optional>
                <Textarea id={`${ID}-notes`} rows={3} value={form.notes} onChange={(event) => patch({ notes: event.target.value })} />
              </Field>
            </div>
          </DrawerSection>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
