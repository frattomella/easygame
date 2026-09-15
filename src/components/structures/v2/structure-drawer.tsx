"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import {
  CurrencyInput,
  DateInput,
  Field,
  FieldGroup,
  FieldSizeProvider,
  FormGrid,
  Select,
  Textarea,
  TextInput,
  TimeInput,
  ValidationSummary,
} from "@/components/web/forms/Field";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Toggle } from "@/components/web/primitives/Controls";
import { InsetBlock, Hairline } from "@/components/web/primitives/Surface";
import { InfoCard } from "@/components/web/page/Cards";
import { getActiveClubSites, type ClubSite } from "@/lib/club-sites";
import { normalizeStructure, WEEK_DAYS, uid, type ClubStructure, type StructureField } from "@/lib/structures-utils";
import { ALL_SITES_VALUE } from "@/components/sites/site-filter";
import {
  FIELD_OWNERSHIP_OPTIONS,
  clampDuration,
  newField,
  newSlot,
  pluralize,
} from "@/components/structures/v2/structure-model";

/**
 * Il cassetto della struttura (guideline 08 §8.5): crea e modifica con gli
 * **stessi campi** del dialog di creazione V1 e delle tab Informazioni, Campi,
 * Tariffe e Pagamenti / Fitti della scheda V1, in tre sezioni richiamabili
 * anche singolarmente dalla scheda:
 *
 * - `info`: identita, sede, contatti, i quattro interruttori, note interne;
 * - `fields`: campi con proprieta, interruttori, fasce per giorno e tariffe;
 * - `rent`: il contratto d'affitto (canone, frequenza, scadenze, note).
 *
 * `all` (creazione) le monta tutte. Il cassetto restituisce la struttura
 * intera gia normalizzata: chi salva la mette nell'array e riscrive la
 * colonna con `saveClubStructures`, come la V1.
 *
 * Gli importi si tengono come **testo** finche il cassetto e aperto (virgola
 * ammessa) e si convertono al salvataggio: un `Number` in un campo di testo
 * riscriverebbe la virgola in punto sotto le dita.
 */
export type StructureEditSection = "all" | "info" | "fields" | "rent";

type MoneyText = Record<string, string>;

const moneyToText = (value: number | undefined | null) =>
  value === undefined || value === null || !Number.isFinite(Number(value)) || Number(value) === 0 ? "" : String(value).replace(".", ",");

const textToMoney = (value: string | undefined, fallback = 0) => {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readMoneyText = (structure: ClubStructure): MoneyText => {
  const out: MoneyText = { rent: moneyToText(structure.rent?.amount) };
  for (const field of structure.fields) {
    for (const price of field.pricing) out[price.id] = moneyToText(price.price);
  }
  return out;
};

const emptyStructure = (): ClubStructure =>
  normalizeStructure({
    id: uid("structure"),
    name: "",
    address: "",
    siteId: "",
    isPublic: true,
    isVisibleToMembers: true,
    isBookableByMembers: true,
    isRentable: false,
    payments: [],
    fields: [],
    bookings: [],
  });

const TITLES: Record<StructureEditSection, { title: string; width: "default" | "wide" }> = {
  all: { title: "Nuova struttura", width: "wide" },
  info: { title: "Modifica struttura", width: "wide" },
  fields: { title: "Campi e disponibilità", width: "wide" },
  rent: { title: "Contratto di affitto", width: "default" },
};

/** Una riga interruttore: etichetta, spiegazione, `Toggle` a destra. */
function ToggleRow({
  id,
  label,
  helper,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  helper?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="block font-brand text-[13px] font-semibold text-egw-ink">
          {label}
        </label>
        {helper ? <p className="mt-0.5 font-brand text-[11.5px] font-medium leading-[1.4] text-[rgba(11,26,58,.55)]">{helper}</p> : null}
      </div>
      <Toggle id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

export function StructureDrawer({
  open,
  section,
  structure,
  sites,
  onClose,
  onSave,
}: {
  open: boolean;
  section: StructureEditSection;
  /** `null` = creazione. */
  structure: ClubStructure | null;
  sites: ClubSite[];
  onClose: () => void;
  onSave: (next: ClubStructure) => Promise<boolean>;
}) {
  const ID = "structure-drawer";
  const [draft, setDraft] = React.useState<ClubStructure>(() => (structure ? normalizeStructure(structure) : emptyStructure()));
  const [money, setMoney] = React.useState<MoneyText>(() => readMoneyText(draft));
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Array<{ id?: string; label: string }>>([]);

  /*
    I valori si rileggono dal record **nel render** in cui il cassetto si
    apre (stesso motivo di `StaffSectionDrawer`): un effetto dopo il primo
    render lascerebbe un fotogramma con i valori del cassetto precedente.
  */
  const [openedFor, setOpenedFor] = React.useState<string | null>(null);
  const openKey = open ? `${section}:${structure?.id ?? "new"}` : null;
  if (openKey !== openedFor) {
    setOpenedFor(openKey);
    if (openKey) {
      const next = structure ? normalizeStructure(structure) : emptyStructure();
      setDraft(next);
      setMoney(readMoneyText(next));
      setDirty(false);
      setErrors([]);
    }
  }

  const update = (patch: Partial<ClubStructure>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  const updateRent = (patch: Partial<NonNullable<ClubStructure["rent"]>>) =>
    update({ rent: { ...(draft.rent || {}), ...patch } });

  const setFields = (fields: StructureField[]) => update({ fields });

  const updateField = (fieldId: string, patch: Partial<StructureField>) =>
    setFields(draft.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)));

  const setMoneyText = (key: string, value: string) => {
    setMoney((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const errorFor = (id: string) => errors.find((error) => error.id === `${ID}-${id}`)?.label;

  const submit = async () => {
    const found: Array<{ id?: string; label: string }> = [];
    if (!draft.name.trim()) found.push({ id: `${ID}-name`, label: "Inserisci il nome della struttura" });
    setErrors(found);
    if (found.length) {
      document.getElementById(found[0].id!)?.focus();
      return;
    }

    const next: ClubStructure = normalizeStructure({
      ...draft,
      name: draft.name.trim(),
      address: draft.address.trim(),
      rent: { ...(draft.rent || {}), amount: textToMoney(money.rent) },
      fields: draft.fields.map((field) => ({
        ...field,
        pricing: field.pricing.map((price) => ({ ...price, price: textToMoney(money[price.id]) })),
      })),
    });

    setSaving(true);
    try {
      const ok = await onSave(next);
      if (ok) setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const meta = TITLES[section];
  const title = section === "all" && structure ? "Modifica struttura" : meta.title;
  const activeSites = getActiveClubSites(sites);
  const showInfo = section === "all" || section === "info";
  const showFields = section === "all" || section === "fields";
  const showRent = section === "all" || section === "rent";

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      width={meta.width}
      eyebrow="Strutture"
      title={title}
      description={section === "all" && !structure ? "Registra l'impianto, i suoi campi e le fasce in cui si possono prenotare." : undefined}
      dirty={dirty}
      locked={saving}
      data-test="structure-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            {section === "all" && !structure ? "Salva struttura" : "Salva modifiche"}
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

          {showInfo ? (
            <>
              <DrawerSection eyebrow="Identità">
                <div className="flex flex-col gap-5">
                  <Field label="Nome" htmlFor={`${ID}-name`} required error={errorFor("name")}>
                    <TextInput
                      id={`${ID}-name`}
                      value={draft.name}
                      onChange={(event) => update({ name: event.target.value })}
                      placeholder="Es: PalaSport"
                      autoComplete="off"
                    />
                  </Field>
                  <FormGrid>
                    <Field label="Tipologia" htmlFor={`${ID}-type`} optional>
                      <TextInput
                        id={`${ID}-type`}
                        value={draft.type || ""}
                        onChange={(event) => update({ type: event.target.value })}
                        placeholder="Es. Centro sportivo, palestra, campo"
                      />
                    </Field>
                    {activeSites.length ? (
                      <Field
                        label="Sede"
                        htmlFor={`${ID}-site`}
                        helper="Senza sede la struttura resta visibile con qualunque filtro."
                      >
                        <Select
                          id={`${ID}-site`}
                          value={draft.siteId || ALL_SITES_VALUE}
                          onValueChange={(value) => update({ siteId: value === ALL_SITES_VALUE ? "" : value })}
                          options={[
                            { value: ALL_SITES_VALUE, label: "Nessuna sede" },
                            ...activeSites.map((site) => ({ value: site.id, label: site.name })),
                          ]}
                        />
                      </Field>
                    ) : null}
                    <Field label="Indirizzo" htmlFor={`${ID}-address`}>
                      <TextInput
                        id={`${ID}-address`}
                        value={draft.address}
                        onChange={(event) => update({ address: event.target.value })}
                        placeholder="Via..."
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Città" htmlFor={`${ID}-city`}>
                      <TextInput id={`${ID}-city`} value={draft.city || ""} onChange={(event) => update({ city: event.target.value })} />
                    </Field>
                  </FormGrid>
                </div>
              </DrawerSection>

              <DrawerSection eyebrow="Contatti">
                <FormGrid>
                  <Field label="Referente" htmlFor={`${ID}-contact`}>
                    <TextInput id={`${ID}-contact`} value={draft.contactName || ""} onChange={(event) => update({ contactName: event.target.value })} />
                  </Field>
                  <Field label="Telefono" htmlFor={`${ID}-phone`}>
                    <TextInput
                      id={`${ID}-phone`}
                      type="tel"
                      inputMode="tel"
                      className="egw-num"
                      value={draft.contactPhone || ""}
                      onChange={(event) => update({ contactPhone: event.target.value })}
                    />
                  </Field>
                  <Field label="Email" htmlFor={`${ID}-email`} className="laptop:col-span-2">
                    <TextInput
                      id={`${ID}-email`}
                      type="email"
                      inputMode="email"
                      value={draft.contactEmail || ""}
                      onChange={(event) => update({ contactEmail: event.target.value })}
                    />
                  </Field>
                </FormGrid>
              </DrawerSection>

              <DrawerSection eyebrow="Visibilità e prenotazioni">
                <InsetBlock className="flex flex-col divide-y divide-egw-hairline py-1">
                  <ToggleRow
                    id={`${ID}-public`}
                    label="Struttura pubblica"
                    helper="Visibile nei contesti interni."
                    checked={draft.isPublic}
                    onCheckedChange={(checked) => update({ isPublic: checked })}
                  />
                  <ToggleRow
                    id={`${ID}-visible`}
                    label="Visibile ai tesserati"
                    helper="Se disattivato, la struttura non sarà visibile ad atleti e genitori."
                    checked={draft.isVisibleToMembers}
                    onCheckedChange={(checked) => update({ isVisibleToMembers: checked })}
                  />
                  {/*
                    W6-54. «Affittabile», qui sotto, e il contratto d'affitto
                    della struttura e non ha mai avuto effetto sull'area
                    famiglia: la prenotabilita ha un interruttore suo.
                  */}
                  <ToggleRow
                    id={`${ID}-bookable`}
                    label="Prenotabile dalle famiglie"
                    helper="Se disattivato, la struttura resta visibile ma l'area famiglia non mostra il modulo di prenotazione e la richiesta viene rifiutata."
                    checked={draft.isBookableByMembers}
                    onCheckedChange={(checked) => update({ isBookableByMembers: checked })}
                  />
                  <ToggleRow
                    id={`${ID}-rentable`}
                    label="Affittabile"
                    helper="Il contratto d'affitto della struttura, con importo e scadenze. Non riguarda le prenotazioni delle famiglie."
                    checked={draft.isRentable}
                    onCheckedChange={(checked) => update({ isRentable: checked, rent: { ...(draft.rent || {}), enabled: checked } })}
                  />
                </InsetBlock>
              </DrawerSection>

              <DrawerSection eyebrow="Note interne">
                <Field label="Note" htmlFor={`${ID}-notes`} optional>
                  <Textarea id={`${ID}-notes`} rows={4} value={draft.notes || ""} onChange={(event) => update({ notes: event.target.value })} />
                </Field>
              </DrawerSection>
            </>
          ) : null}

          {showFields ? (
            <DrawerSection
              eyebrow="Campi e disponibilità"
              title={draft.fields.length ? pluralize(draft.fields.length, "campo", "campi") : undefined}
            >
              <div className="flex flex-col gap-4">
                <InfoCard>
                  Le fasce orarie di un campo vincolano le prenotazioni della famiglia. Un campo <strong>senza fasce</strong> non
                  è vincolato: si può chiedere a qualunque ora. Una fascia che finisce dopo la mezzanotte (22:00–02:00) vale
                  fino al giorno dopo.
                </InfoCard>

                {draft.fields.length === 0 ? (
                  <InsetBlock dashed className="text-center font-brand text-[12.5px] text-egw-ink-62">
                    Nessun campo configurato.
                  </InsetBlock>
                ) : (
                  draft.fields.map((field, index) => (
                    <FieldEditor
                      key={field.id}
                      idPrefix={`${ID}-field-${index}`}
                      field={field}
                      money={money}
                      onMoneyChange={setMoneyText}
                      onChange={(patch) => updateField(field.id, patch)}
                      onRemove={() => setFields(draft.fields.filter((item) => item.id !== field.id))}
                    />
                  ))
                )}

                <div>
                  <Button variant="neutral" size="sm" icon={<Plus />} onClick={() => setFields([...draft.fields, newField()])}>
                    Aggiungi campo
                  </Button>
                </div>
              </div>
            </DrawerSection>
          ) : null}

          {showRent ? (
            <DrawerSection eyebrow="Contratto di affitto">
              <div className="flex flex-col gap-5">
                <InsetBlock className="py-1">
                  <ToggleRow
                    id={`${ID}-rent-enabled`}
                    label="Contratto di affitto attivo"
                    helper="Gestisci canone, frequenza e scadenze della struttura."
                    checked={Boolean(draft.rent?.enabled || draft.isRentable)}
                    onCheckedChange={(checked) => update({ isRentable: checked, rent: { ...(draft.rent || {}), enabled: checked } })}
                  />
                </InsetBlock>
                <FormGrid>
                  <Field label="Canone" htmlFor={`${ID}-rent-amount`}>
                    <CurrencyInput id={`${ID}-rent-amount`} value={money.rent || ""} onChange={(event) => setMoneyText("rent", event.target.value)} />
                  </Field>
                  <Field label="Frequenza" htmlFor={`${ID}-rent-frequency`}>
                    <TextInput
                      id={`${ID}-rent-frequency`}
                      value={draft.rent?.frequency || "mensile"}
                      onChange={(event) => updateRent({ frequency: event.target.value })}
                    />
                  </Field>
                  <Field label="Giorno scadenza" htmlFor={`${ID}-rent-due`} helper="Il giorno del mese in cui scade il canone.">
                    <TextInput
                      id={`${ID}-rent-due`}
                      numeric
                      inputMode="numeric"
                      min={1}
                      max={31}
                      value={draft.rent?.dueDay ?? 1}
                      onChange={(event) => updateRent({ dueDay: Math.min(31, Math.max(1, Number(event.target.value || 1))) })}
                    />
                  </Field>
                  <Field label="Inizio contratto" htmlFor={`${ID}-rent-start`}>
                    <DateInput id={`${ID}-rent-start`} value={draft.rent?.contractStart || ""} onChange={(event) => updateRent({ contractStart: event.target.value })} />
                  </Field>
                  <Field label="Fine contratto" htmlFor={`${ID}-rent-end`}>
                    <DateInput id={`${ID}-rent-end`} value={draft.rent?.contractEnd || ""} onChange={(event) => updateRent({ contractEnd: event.target.value })} />
                  </Field>
                </FormGrid>
                <Field label="Note contratto" htmlFor={`${ID}-rent-notes`} optional>
                  <Textarea id={`${ID}-rent-notes`} rows={3} value={draft.rent?.notes || ""} onChange={(event) => updateRent({ notes: event.target.value })} />
                </Field>
              </div>
            </DrawerSection>
          ) : null}
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

/* ── Un campo: nome, proprieta, interruttori, fasce, tariffe ─────────────── */
function FieldEditor({
  idPrefix,
  field,
  money,
  onMoneyChange,
  onChange,
  onRemove,
}: {
  idPrefix: string;
  field: StructureField;
  money: MoneyText;
  onMoneyChange: (key: string, value: string) => void;
  onChange: (patch: Partial<StructureField>) => void;
  onRemove: () => void;
}) {
  const setSlots = (dayKey: string, slots: StructureField["availability"][string]) =>
    onChange({ availability: { ...field.availability, [dayKey]: slots } });

  return (
    <InsetBlock className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <FormGrid>
            <Field label="Nome campo" htmlFor={`${idPrefix}-name`}>
              <TextInput id={`${idPrefix}-name`} value={field.name} onChange={(event) => onChange({ name: event.target.value })} />
            </Field>
            <Field label="Proprietà" htmlFor={`${idPrefix}-ownership`}>
              <Select
                id={`${idPrefix}-ownership`}
                value={field.ownership}
                onValueChange={(value) => onChange({ ownership: value as StructureField["ownership"] })}
                options={FIELD_OWNERSHIP_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              />
            </Field>
          </FormGrid>
        </div>
        <IconButton aria-label={`Elimina ${field.name || "campo"}`} size="sm" variant="row" className="mt-6 text-egw-red hover:text-egw-red" onClick={onRemove}>
          <Trash2 />
        </IconButton>
      </div>

      <div className="flex flex-col divide-y divide-egw-hairline">
        <ToggleRow id={`${idPrefix}-inrent`} label="In affitto" checked={field.inRent} onCheckedChange={(checked) => onChange({ inRent: checked })} />
        <ToggleRow
          id={`${idPrefix}-bookable`}
          label="Prenotabile"
          helper="Disponibile per le prenotazioni."
          checked={field.isBookable}
          onCheckedChange={(checked) => onChange({ isBookable: checked })}
        />
        <ToggleRow
          id={`${idPrefix}-visible`}
          label="Visibile ai tesserati"
          checked={field.isVisible}
          onCheckedChange={(checked) => onChange({ isVisible: checked })}
        />
      </div>

      <Hairline />

      <div className="flex flex-col gap-3">
        <p className="font-brand text-[13px] font-bold text-egw-ink">Disponibilità</p>
        {WEEK_DAYS.map((day) => {
          const slots = field.availability[day.key] || [];
          return (
            <FieldGroup key={day.key} eyebrow={day.label} columns={1} className="p-3">
              {slots.length === 0 ? (
                <p className="font-brand text-[12px] text-egw-ink-62">Nessuna fascia.</p>
              ) : (
                slots.map((slot, index) => (
                  <div key={`${day.key}-${index}`} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <Field label="Inizio" htmlFor={`${idPrefix}-${day.key}-${index}-start`}>
                      <TimeInput
                        id={`${idPrefix}-${day.key}-${index}-start`}
                        value={slot.start}
                        onChange={(event) => setSlots(day.key, slots.map((item, i) => (i === index ? { ...item, start: event.target.value } : item)))}
                      />
                    </Field>
                    <Field label="Fine" htmlFor={`${idPrefix}-${day.key}-${index}-end`}>
                      <TimeInput
                        id={`${idPrefix}-${day.key}-${index}-end`}
                        value={slot.end}
                        onChange={(event) => setSlots(day.key, slots.map((item, i) => (i === index ? { ...item, end: event.target.value } : item)))}
                      />
                    </Field>
                    <IconButton
                      aria-label={`Rimuovi fascia ${index + 1} di ${day.label}`}
                      size="sm"
                      variant="row"
                      className="mb-0.5 text-egw-red hover:text-egw-red"
                      onClick={() => setSlots(day.key, slots.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                ))
              )}
              <div>
                <Button variant="text" size="xs" icon={<Plus />} onClick={() => setSlots(day.key, [...slots, newSlot()])}>
                  Aggiungi fascia
                </Button>
              </div>
            </FieldGroup>
          );
        })}
      </div>

      <Hairline />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-brand text-[13px] font-bold text-egw-ink">Tariffe</p>
            <p className="font-brand text-[11.5px] text-egw-ink-62">Durata e prezzo per fascia prenotabile. Una tariffa senza importo non si mostra alla famiglia.</p>
          </div>
          <Button
            variant="text"
            size="xs"
            icon={<Plus />}
            onClick={() => {
              const id = uid("price");
              onMoneyChange(id, "");
              onChange({ pricing: [...field.pricing, { id, durationMinutes: 60, price: 0 }] });
            }}
          >
            Aggiungi tariffa
          </Button>
        </div>
        {field.pricing.length === 0 ? (
          <p className="font-brand text-[12px] text-egw-ink-62">Nessuna tariffa configurata.</p>
        ) : (
          field.pricing.map((price, index) => (
            <div key={price.id} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <Field label="Durata (minuti)" htmlFor={`${idPrefix}-price-${index}-duration`} helper="Da 15 a 240, a passi di 15.">
                <TextInput
                  id={`${idPrefix}-price-${index}-duration`}
                  numeric
                  inputMode="numeric"
                  min={15}
                  max={240}
                  step={15}
                  value={price.durationMinutes}
                  onChange={(event) =>
                    onChange({
                      pricing: field.pricing.map((item) => (item.id === price.id ? { ...item, durationMinutes: clampDuration(event.target.value) } : item)),
                    })
                  }
                />
              </Field>
              <Field label="Prezzo" htmlFor={`${idPrefix}-price-${index}-amount`}>
                <CurrencyInput id={`${idPrefix}-price-${index}-amount`} value={money[price.id] ?? ""} onChange={(event) => onMoneyChange(price.id, event.target.value)} />
              </Field>
              <IconButton
                aria-label={`Elimina tariffa ${index + 1}`}
                size="sm"
                variant="row"
                className="mb-6 text-egw-red hover:text-egw-red"
                onClick={() => onChange({ pricing: field.pricing.filter((item) => item.id !== price.id) })}
              >
                <Trash2 />
              </IconButton>
            </div>
          ))
        )}
      </div>
    </InsetBlock>
  );
}
