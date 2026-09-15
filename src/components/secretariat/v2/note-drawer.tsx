"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { DateInput, Field, FieldSizeProvider, SearchableSelect, Select, Textarea, TimeInput, ValidationSummary } from "@/components/web/forms/Field";
import { SegmentedControl, Toggle } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { todayLocalDateOnly } from "@/lib/date-only";
import type { ReminderTargetType } from "@/lib/reminder-targeting";
import {
  NOTE_TARGET_OPTIONS,
  noteExpiryInputValue,
  noteNeedsRecipient,
  reminderTargetOptions,
  type SecretariatNote,
  type SecretariatPeople,
} from "@/components/secretariat/v2/secretariat-model";

/**
 * «Nuova nota» / «Modifica nota» (cassetto 480, sette campi): contenuto,
 * scadenza, destinazione fra le cinque della V1, destinatario quando la
 * destinazione lo vuole, notifica alla scadenza con i due tipi (giornata
 * intera alle 08:00 · orario specifico con trenta minuti di anticipo).
 *
 * La scrittura la fa la pagina (`addClubData` / `updateClubDataArray`, come
 * la V1): qui si raccolgono i valori con la stessa forma del record.
 */
export type NoteFormValues = {
  content: string;
  expiryDate: string;
  targetType: ReminderTargetType;
  targetId: string;
  notificationEnabled: boolean;
  isAllDay: boolean;
  notificationTime: string;
};

export const emptyNoteForm = (): NoteFormValues => ({
  content: "",
  expiryDate: "",
  targetType: "club_dashboard",
  targetId: "",
  notificationEnabled: false,
  isAllDay: true,
  notificationTime: "",
});

export const noteFormFrom = (note: SecretariatNote): NoteFormValues => ({
  content: note.content,
  expiryDate: noteExpiryInputValue(note.expiryDate),
  targetType: note.targetType || "club_dashboard",
  targetId: note.targetId || "",
  notificationEnabled: note.notificationEnabled || false,
  isAllDay: note.isAllDay !== false,
  notificationTime: note.notificationTime || "",
});

const sameValues = (a: NoteFormValues, b: NoteFormValues) => (Object.keys(a) as Array<keyof NoteFormValues>).every((key) => a[key] === b[key]);

export function NoteDrawer({
  open,
  onOpenChange,
  note,
  people,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = nuova nota. */
  note: SecretariatNote | null;
  people: SecretariatPeople;
  /** Torna `true` se la scrittura e andata a buon fine (il cassetto si chiude). */
  onSubmit: (values: NoteFormValues, note: SecretariatNote | null) => Promise<boolean>;
}) {
  const [values, setValues] = React.useState<NoteFormValues>(emptyNoteForm);
  const [initial, setInitial] = React.useState<NoteFormValues>(emptyNoteForm);
  const [errors, setErrors] = React.useState<Partial<Record<keyof NoteFormValues, string>>>({});
  const [busy, setBusy] = React.useState(false);

  const noteId = note?.id ?? null;
  React.useEffect(() => {
    if (!open) return;
    const start = note ? noteFormFrom(note) : emptyNoteForm();
    setValues(start);
    setInitial(start);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, noteId]);

  const set = <K extends keyof NoteFormValues>(key: K, value: NoteFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const recipients = React.useMemo(() => reminderTargetOptions(people, values.targetType), [people, values.targetType]);
  const needsRecipient = noteNeedsRecipient(values.targetType);
  const dirty = !sameValues(values, initial);

  const validate = () => {
    const next: typeof errors = {};
    if (!values.content.trim()) next.content = "Inserisci il contenuto della nota";
    if (needsRecipient && !values.targetId) next.targetId = "Seleziona il destinatario del promemoria";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const ok = await onSubmit(values, note);
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const summary = (Object.keys(errors) as Array<keyof NoteFormValues>)
    .filter((key) => errors[key])
    .map((key) => ({ id: `note-${key}`, label: errors[key] as string }));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Note e promemoria"
      title={note ? "Modifica nota" : "Nuova nota"}
      description={note ? undefined : "Un promemoria per la segreteria, per la Dashboard o per un allenatore, un membro dello staff o un socio."}
      dirty={dirty && !busy}
      locked={busy}
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            {note ? "Salva" : "Aggiungi nota"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
      data-test="note-drawer"
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-4">
          <ValidationSummary errors={summary} />
          <Field label="Nota" htmlFor="note-content" required error={errors.content}>
            <Textarea id="note-content" value={values.content} placeholder="Scrivi una nota o un promemoria..." rows={4} onChange={(event) => set("content", event.target.value)} />
          </Field>
          <Field label="Data di scadenza" htmlFor="note-expiryDate" optional width="14ch">
            <DateInput id="note-expiryDate" value={values.expiryDate} min={note ? undefined : todayLocalDateOnly()} onChange={(event) => set("expiryDate", event.target.value)} />
          </Field>
          <Field label="Destinazione promemoria" htmlFor="note-targetType">
            <Select
              id="note-targetType"
              value={values.targetType}
              onValueChange={(value) => {
                set("targetType", value as ReminderTargetType);
                set("targetId", "");
              }}
              options={NOTE_TARGET_OPTIONS}
            />
          </Field>
          {needsRecipient ? (
            <Field
              label="Destinatario"
              htmlFor="note-targetId"
              required
              error={errors.targetId}
              helper={recipients.length === 0 ? "Nessuna persona di questo tipo nel club." : undefined}
            >
              <SearchableSelect
                id="note-targetId"
                value={values.targetId}
                onValueChange={(value) => set("targetId", value || "")}
                options={recipients.map((person) => ({ value: person.id, label: person.label }))}
                placeholder="Seleziona"
                searchPlaceholder="Cerca per nome"
                disabled={recipients.length === 0}
              />
            </Field>
          ) : null}

          <InsetBlock className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="note-notificationEnabled" className="font-brand text-[12.5px] font-semibold text-egw-ink">
                Ricevi notifica alla scadenza
                <span className="block font-normal text-egw-ink-62">{values.notificationEnabled ? "Attiva" : "Non attiva"}</span>
              </label>
              <Toggle id="note-notificationEnabled" checked={values.notificationEnabled} onCheckedChange={(next) => set("notificationEnabled", next)} aria-label="Ricevi notifica alla scadenza" />
            </div>
            {values.notificationEnabled ? (
              <>
                <SegmentedControl<"all-day" | "time">
                  aria-label="Tipo di notifica"
                  size="sm"
                  className="max-w-full overflow-x-auto"
                  value={values.isAllDay ? "all-day" : "time"}
                  onChange={(value) => set("isAllDay", value === "all-day")}
                  options={[
                    { value: "all-day", label: "Intera giornata (08:00)" },
                    { value: "time", label: "Orario specifico" },
                  ]}
                />
                {values.isAllDay ? (
                  <p className="font-brand text-[11.5px] text-egw-ink-62">Promemoria per l&apos;intera giornata: la notifica arriva alle 08:00.</p>
                ) : (
                  <Field label="Orario" htmlFor="note-notificationTime" helper="La notifica arriva 30 minuti prima." width="12ch">
                    <TimeInput id="note-notificationTime" value={values.notificationTime} onChange={(event) => set("notificationTime", event.target.value)} />
                  </Field>
                )}
              </>
            ) : null}
          </InsetBlock>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
