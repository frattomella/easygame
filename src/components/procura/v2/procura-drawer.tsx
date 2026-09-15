"use client";

import * as React from "react";
import { Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldGroup, FieldSizeProvider, FormGrid, TextInput } from "@/components/web/forms/Field";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { useToast } from "@/components/ui/toast-notification";
import {
  contactDisplayName,
  emptyProcuraDraft,
  procuraDraftFrom,
  type Procura,
  type ProcuraContact,
  type ProcuraDraft,
} from "@/components/procura/v2/procura-model";

/**
 * «Nuova procura» / «Modifica procura» in un cassetto da 720 (guideline 08
 * §8.5: piu gruppi, un concetto). Tre sezioni: identita, indirizzo della
 * sede (gruppo di campi), contatti procuratori.
 *
 * La V1 apriva un **secondo** dialog per ogni contatto; un cassetto non apre
 * un secondo cassetto (06 §6.7), quindi il contatto si compila in una riga
 * editabile dentro la stessa sezione. Le regole restano quelle della V1:
 * nome e cognome obbligatori (stesso toast), telefono ed email facoltativi,
 * id `contact_<orologio>`, e il contatto vive solo nella bozza finche non si
 * salva la procura.
 */
type ContactDraft = Omit<ProcuraContact, "id">;

const emptyContact = (): ContactDraft => ({ firstName: "", lastName: "", phone: "", email: "" });

const isSameDraft = (a: ProcuraDraft, b: ProcuraDraft) => JSON.stringify(a) === JSON.stringify(b);

export function ProcuraDrawer({
  open,
  onOpenChange,
  procura,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La procura da modificare; assente = creazione. */
  procura: Procura | null;
  onSave: (draft: ProcuraDraft) => Promise<boolean>;
}) {
  const { showToast } = useToast();
  const [initial, setInitial] = React.useState<ProcuraDraft>(emptyProcuraDraft);
  const [draft, setDraft] = React.useState<ProcuraDraft>(emptyProcuraDraft);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [contactEditor, setContactEditor] = React.useState<{ id: string | null; values: ContactDraft } | null>(null);
  const [contactError, setContactError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const next = procura ? procuraDraftFrom(procura) : emptyProcuraDraft();
    setInitial(next);
    setDraft(next);
    setNameError(null);
    setContactEditor(null);
    setContactError(null);
  }, [open, procura]);

  const editing = Boolean(procura);
  const dirty = !isSameDraft(draft, initial) || Boolean(contactEditor);

  const setAddress = (key: keyof ProcuraDraft["address"], value: string) =>
    setDraft((current) => ({ ...current, address: { ...current.address, [key]: value } }));

  const openContactEditor = (contact?: ProcuraContact) => {
    setContactError(null);
    setContactEditor(
      contact
        ? { id: contact.id, values: { firstName: contact.firstName, lastName: contact.lastName, phone: contact.phone, email: contact.email } }
        : { id: null, values: emptyContact() },
    );
  };

  const commitContact = () => {
    if (!contactEditor) return;
    if (!contactEditor.values.firstName || !contactEditor.values.lastName) {
      setContactError("Inserisci nome e cognome del contatto");
      showToast("error", "Inserisci nome e cognome del contatto");
      return;
    }
    const contact: ProcuraContact = { ...contactEditor.values, id: contactEditor.id || `contact_${Date.now()}` };
    setDraft((current) => ({
      ...current,
      contacts: contactEditor.id
        ? current.contacts.map((c) => (c.id === contactEditor.id ? contact : c))
        : [...current.contacts, contact],
    }));
    setContactEditor(null);
    setContactError(null);
  };

  const removeContact = (contactId: string) => {
    setDraft((current) => ({ ...current, contacts: current.contacts.filter((c) => c.id !== contactId) }));
    if (contactEditor?.id === contactId) setContactEditor(null);
  };

  const submit = async () => {
    if (!draft.name) {
      setNameError("Inserisci il nome della procura");
      showToast("error", "Inserisci il nome della procura");
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave(draft);
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Procure"
      title={editing ? "Modifica procura" : "Nuova procura"}
      description="Nome, indirizzo della sede e i procuratori da contattare."
      dirty={dirty}
      locked={saving}
      data-test="procura-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            {editing ? "Aggiorna" : "Salva"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Identità">
          <Field label="Nome procura" htmlFor="procura-name" required error={nameError}>
            <TextInput
              id="procura-name"
              value={draft.name}
              onChange={(event) => {
                setDraft({ ...draft, name: event.target.value });
                if (nameError) setNameError(null);
              }}
              placeholder="Es. Studio Legale Rossi"
              autoComplete="organization"
            />
          </Field>
        </DrawerSection>

        <DrawerSection eyebrow="Indirizzo sede">
          <FieldGroup eyebrow="Indirizzo sede procura" columns={2}>
            <Field label="Via/Piazza" htmlFor="procura-street" className="md:col-span-2">
              <TextInput id="procura-street" value={draft.address.street} onChange={(e) => setAddress("street", e.target.value)} placeholder="Via/Piazza" autoComplete="street-address" />
            </Field>
            <Field label="Città" htmlFor="procura-city">
              <TextInput id="procura-city" value={draft.address.city} onChange={(e) => setAddress("city", e.target.value)} placeholder="Città" autoComplete="address-level2" />
            </Field>
            <Field label="Provincia" htmlFor="procura-province">
              <TextInput id="procura-province" value={draft.address.province} onChange={(e) => setAddress("province", e.target.value)} placeholder="Provincia" autoComplete="address-level1" />
            </Field>
            <Field label="CAP" htmlFor="procura-postal-code">
              <TextInput id="procura-postal-code" value={draft.address.postalCode} onChange={(e) => setAddress("postalCode", e.target.value)} placeholder="CAP" inputMode="numeric" autoComplete="postal-code" />
            </Field>
            <Field label="Paese" htmlFor="procura-country">
              <TextInput id="procura-country" value={draft.address.country} onChange={(e) => setAddress("country", e.target.value)} placeholder="Paese" autoComplete="country-name" />
            </Field>
          </FieldGroup>
        </DrawerSection>

        <DrawerSection eyebrow="Contatti procuratori">
          <div className="flex flex-col gap-2">
            {draft.contacts.length === 0 && !contactEditor ? (
              <p className="font-brand text-[12.5px] text-egw-ink-62">Nessun contatto aggiunto</p>
            ) : null}
            {draft.contacts.map((contact) =>
              contactEditor?.id === contact.id ? (
                <ContactEditor
                  key={contact.id}
                  values={contactEditor.values}
                  error={contactError}
                  editing
                  onChange={(values) => {
                    setContactEditor({ id: contact.id, values });
                    if (contactError) setContactError(null);
                  }}
                  onCommit={commitContact}
                  onCancel={() => setContactEditor(null)}
                />
              ) : (
                <InsetBlock key={contact.id} className="flex items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-brand text-[13px] font-semibold text-egw-ink">{contactDisplayName(contact)}</p>
                    {contact.phone ? (
                      <p className="mt-1 flex items-center gap-1.5 font-brand text-[12px] text-egw-ink-62">
                        <Phone className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="egw-num">{contact.phone}</span>
                      </p>
                    ) : null}
                    {contact.email ? (
                      <p className="mt-0.5 flex items-center gap-1.5 font-brand text-[12px] text-egw-ink-62">
                        <Mail className="h-3 w-3 shrink-0" aria-hidden />
                        <span className="egw-ellipsis">{contact.email}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <IconButton aria-label={`Modifica ${contactDisplayName(contact)}`} size="xs" variant="row" onClick={() => openContactEditor(contact)}>
                      <Pencil />
                    </IconButton>
                    <IconButton
                      aria-label={`Elimina ${contactDisplayName(contact)}`}
                      size="xs"
                      variant="row"
                      className="text-egw-red hover:text-egw-red"
                      onClick={() => removeContact(contact.id)}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </InsetBlock>
              ),
            )}
            {contactEditor && contactEditor.id === null ? (
              <ContactEditor
                values={contactEditor.values}
                error={contactError}
                onChange={(values) => {
                  setContactEditor({ id: null, values });
                  if (contactError) setContactError(null);
                }}
                onCommit={commitContact}
                onCancel={() => setContactEditor(null)}
              />
            ) : (
              <div>
                <Button variant="secondary" size="sm" icon={<Plus />} onClick={() => openContactEditor()} disabled={Boolean(contactEditor)}>
                  Aggiungi contatto
                </Button>
              </div>
            )}
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}

/** La riga editabile di un contatto: Nome*, Cognome*, Telefono, Email. */
function ContactEditor({
  values,
  error,
  editing = false,
  onChange,
  onCommit,
  onCancel,
}: {
  values: ContactDraft;
  error: string | null;
  editing?: boolean;
  onChange: (values: ContactDraft) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const id = React.useId();
  return (
    <InsetBlock className="flex flex-col gap-4" data-test="procura-contact-editor">
      <FormGrid columns={2}>
        <Field label="Nome" htmlFor={`${id}-first`} required error={error && !values.firstName ? error : null}>
          <TextInput id={`${id}-first`} value={values.firstName} onChange={(e) => onChange({ ...values, firstName: e.target.value })} placeholder="Nome" autoComplete="given-name" autoFocus />
        </Field>
        <Field label="Cognome" htmlFor={`${id}-last`} required error={error && !values.lastName ? error : null}>
          <TextInput id={`${id}-last`} value={values.lastName} onChange={(e) => onChange({ ...values, lastName: e.target.value })} placeholder="Cognome" autoComplete="family-name" />
        </Field>
        <Field label="Telefono" htmlFor={`${id}-phone`}>
          <TextInput id={`${id}-phone`} value={values.phone} onChange={(e) => onChange({ ...values, phone: e.target.value })} placeholder="+39 123 456 7890" type="tel" autoComplete="tel" />
        </Field>
        <Field label="Email" htmlFor={`${id}-email`}>
          <TextInput id={`${id}-email`} value={values.email} onChange={(e) => onChange({ ...values, email: e.target.value })} placeholder="email@example.com" type="email" autoComplete="email" />
        </Field>
      </FormGrid>
      <div className="flex flex-wrap gap-2">
        <Button variant="neutral" size="sm" onClick={onCommit}>
          {editing ? "Aggiorna" : "Aggiungi"}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </InsetBlock>
  );
}
