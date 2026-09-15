"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox, SegmentedControl } from "@/components/web/primitives/Controls";
import { DataChip } from "@/components/web/primitives/StatusPill";
import {
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
import { AlertBlock } from "@/components/web/page/Alerts";
import {
  EMPTY_EVENT_RSVP,
  EventRsvpFields,
  fromEventRsvpPayload,
  toEventRsvpPayload,
  type EventRsvpValue,
} from "@/components/events/event-rsvp-fields";
import { getAssociatedTrainerIds } from "@/lib/trainer-utils";
import {
  categoryIdsFromGroups,
  groupIdsForCategories,
  TrainingGroupSelector,
  type TrainingGroupOption,
} from "@/components/training/TrainingGroupSelector";
import { resolveRecommendedStructures } from "@/lib/club-sites";
import {
  DURATA_GARA_SUGGERITA_MINUTI,
  sommaMinuti,
  suggerisciIntervalloGara,
} from "@/lib/matches/match-time-suggestion";
import { formatLocalDateOnly } from "@/lib/date-only";
import { parseDateInput } from "@/lib/web/format";
import { matchTimesOf } from "@/components/matches/v2/match-page-model";

/**
 * Il modulo della gara nel Web V2 — crea, modifica, duplica — in un cassetto
 * da 720 (guideline 08: 9–20 campi). E la forma V2 di `AddMatchForm`, con
 * **tutti** i suoi campi e le sue regole (audit §1.3): titolo facoltativo,
 * data, ora di inizio e **ora di fine sempre esplicita** (fix `ac8312a`:
 * lasciare il campo con il solo inizio propone la fine a +90 minuti, e il
 * dato che parte non e mai un solo orario), i gruppi (ADR-0055, dai quali si
 * derivano le categorie), l'avversario, in casa/trasferta con struttura e
 * campo (le strutture della sede del gruppo consigliate e in cima, mai
 * filtrate) o il luogo libero della trasferta, il numero di gara, gli
 * allenatori proposti dalle categorie, la conferma alle famiglie (RSVP,
 * capienza) e le note.
 *
 * Il contratto con la pagina e quello di `AddMatchForm`: `onSubmit(payload)`
 * torna `false` per ogni esito che non e un salvataggio riuscito — il cassetto
 * resta aperto e compilato. La validazione e in linea, non un `alert`.
 */
export type MatchLocationOption = {
  id: string;
  name: string;
  structureId?: string;
  structureName?: string;
  fieldId?: string;
  fieldName?: string;
  label?: string;
  siteId?: string | null;
};

export type MatchFormInitialData = {
  title: string;
  date: Date;
  time: string;
  categoryIds: string[];
  groupIds?: string[];
  opponent: string;
  location: string;
  venueMode?: "home" | "away";
  structureId?: string;
  fieldId?: string;
  manualLocation?: string;
  trainerIds: string[];
  notes: string;
  matchNumber: string;
  rsvpRequired?: boolean;
  rsvpDeadline?: string | null;
  capacity?: number | null;
};

export type MatchFormPayload = {
  title: string;
  date: Date;
  time: string;
  categoryIds: string[];
  groupIds: string[];
  opponent: string;
  location: string;
  venueMode: "home" | "away";
  structureId: string;
  fieldId: string;
  manualLocation: string;
  trainerIds: string[];
  notes: string;
  matchNumber: string;
  isHome: boolean;
  rsvpRequired: boolean;
  rsvpDeadline: string | null;
  capacity: number | null;
};

type FormState = {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  categoryIds: string[];
  groupIds: string[];
  opponent: string;
  location: string;
  venueMode: "home" | "away";
  structureId: string;
  fieldId: string;
  manualLocation: string;
  trainerIds: string[];
  notes: string;
  matchNumber: string;
};

type FormError = { id: string; label: string; field: string };

const splitTime = (time: string) => {
  const [start = "", end = ""] = matchTimesOf(time);
  return { startTime: start, endTime: end };
};

const emptyState = (selectedDate?: Date, firstStructureId = ""): FormState => ({
  title: "",
  date: formatLocalDateOnly(selectedDate || new Date()),
  startTime: "",
  endTime: "",
  categoryIds: [],
  groupIds: [],
  opponent: "",
  location: "",
  venueMode: "home",
  structureId: firstStructureId,
  fieldId: "",
  manualLocation: "",
  trainerIds: [],
  notes: "",
  matchNumber: "",
});

const stateFrom = (initial: MatchFormInitialData, groupOptions: TrainingGroupOption[]): FormState => ({
  title: initial.title || "",
  date: formatLocalDateOnly(initial.date),
  ...splitTime(initial.time || ""),
  categoryIds: initial.categoryIds || [],
  /*
    Una gara creata prima dei gruppi non ne dichiara nessuno: le spunte partono
    da tutte le squadre delle sue categorie, e chi modifica puo restringerle.
  */
  groupIds: initial.groupIds?.length ? initial.groupIds : groupIdsForCategories(groupOptions, initial.categoryIds || []),
  opponent: initial.opponent || "",
  location: initial.location || "",
  venueMode: initial.venueMode || "home",
  structureId: initial.structureId || "",
  fieldId: initial.fieldId || "",
  manualLocation: initial.manualLocation || "",
  trainerIds: initial.trainerIds || [],
  notes: initial.notes || "",
  matchNumber: initial.matchNumber || "",
});

export function MatchFormDrawer({
  open,
  onOpenChange,
  onSubmit,
  categories,
  groups = [],
  trainers,
  selectedDate,
  mode = "create",
  homeFields = [],
  initialData,
  saving = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: MatchFormPayload) => void | boolean | Promise<void | boolean>;
  categories: Array<{ id?: string; name?: string }>;
  groups?: TrainingGroupOption[];
  trainers: Array<{ id: string; name: string; categories?: any[] }>;
  selectedDate?: Date;
  mode?: "create" | "edit" | "duplicate";
  homeFields?: MatchLocationOption[];
  initialData?: MatchFormInitialData;
  saving?: boolean;
}) {
  const editMode = mode === "edit";
  const idPrefix = "match-form";
  const previousAutoTrainerIdsRef = React.useRef<string[]>([]);

  const categoryOptions = React.useMemo(
    () =>
      (Array.isArray(categories) ? categories : [])
        .map((category) => ({
          id: String(category?.id || "").trim(),
          name: String(category?.name || category?.id || "").trim(),
        }))
        .filter((category) => category.id && category.name),
    [categories],
  );

  /** I gruppi selezionabili (ADR-0055): senza gruppi configurati, uno per categoria. */
  const groupOptions: TrainingGroupOption[] = React.useMemo(() => {
    if (groups.length) return groups;
    return categoryOptions.map((category) => ({
      id: `group:${category.id}`,
      name: category.name,
      categoryId: category.id,
      categoryName: category.name,
      siteId: "",
      siteName: "",
    }));
  }, [groups, categoryOptions]);

  const structureOptions = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; siteId: string | null }>();
    homeFields.forEach((field) => {
      if (field.structureId && field.structureName) {
        map.set(field.structureId, { id: field.structureId, name: field.structureName, siteId: field.siteId ?? null });
      }
    });
    return Array.from(map.values());
  }, [homeFields]);

  const [formData, setFormData] = React.useState<FormState>(() =>
    initialData ? stateFrom(initialData, groupOptions) : emptyState(selectedDate, structureOptions[0]?.id || ""),
  );
  const [rsvp, setRsvp] = React.useState<EventRsvpValue>(
    initialData ? fromEventRsvpPayload(initialData) : EMPTY_EVENT_RSVP,
  );
  const [dirty, setDirty] = React.useState(false);
  const [errors, setErrors] = React.useState<FormError[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  /* A ogni apertura il modulo riparte da cio che gli e stato dato. */
  React.useEffect(() => {
    if (!open) return;
    previousAutoTrainerIdsRef.current = [];
    setFormData(initialData ? stateFrom(initialData, groupOptions) : emptyState(selectedDate, structureOptions[0]?.id || ""));
    setRsvp(initialData ? fromEventRsvpPayload(initialData) : EMPTY_EVENT_RSVP);
    setDirty(false);
    setErrors([]);
    // Il riavvio dipende dall'apertura e dal record: non dai cataloghi, che
    // cambiano riferimento a ogni caricamento senza cambiare significato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData]);

  const update = (patch: Partial<FormState> | ((current: FormState) => FormState)) => {
    setFormData((current) => (typeof patch === "function" ? patch(current) : { ...current, ...patch }));
    setDirty(true);
  };

  /* La sede del gruppo scelto, se e una sola: le sue strutture sono «consigliate». */
  const selectedGroupSiteId = React.useMemo(() => {
    const selected = groupOptions.filter((group) => formData.groupIds.includes(group.id));
    const siteIds = Array.from(new Set(selected.map((group) => group.siteId).filter(Boolean)));
    return siteIds.length === 1 ? siteIds[0]! : "";
  }, [groupOptions, formData.groupIds]);

  const structureRecommendations = React.useMemo(
    () => resolveRecommendedStructures(structureOptions, selectedGroupSiteId),
    [structureOptions, selectedGroupSiteId],
  );

  const fieldOptions = React.useMemo(
    () => homeFields.filter((field) => !formData.structureId || field.structureId === formData.structureId),
    [formData.structureId, homeFields],
  );

  const autoTrainerIds = React.useMemo(
    () => getAssociatedTrainerIds(trainers, formData.categoryIds, categoryOptions),
    [trainers, formData.categoryIds, categoryOptions],
  );

  /* Gli allenatori proposti seguono le categorie; le scelte manuali restano. */
  React.useEffect(() => {
    setFormData((prev) => {
      const previousAutoIds = previousAutoTrainerIdsRef.current;
      const manual = prev.trainerIds.filter((id) => !previousAutoIds.includes(id));
      const next = Array.from(new Set([...autoTrainerIds, ...manual]));
      previousAutoTrainerIdsRef.current = autoTrainerIds;
      if (next.length === prev.trainerIds.length && next.every((id, index) => id === prev.trainerIds[index])) {
        return prev;
      }
      return { ...prev, trainerIds: next };
    });
  }, [autoTrainerIds]);

  /* In casa: struttura e campo si propongono da soli (prima consigliata, primo campo). */
  React.useEffect(() => {
    if (formData.venueMode !== "home") return;
    const nextStructureId =
      formData.structureId || structureRecommendations[0]?.structure.id || structureOptions[0]?.id || "";
    const nextFields = homeFields.filter((field) => field.structureId === nextStructureId);
    const nextFieldId = formData.fieldId || nextFields[0]?.fieldId || nextFields[0]?.id || "";
    const selectedField = nextFields.find((field) => (field.fieldId || field.id) === nextFieldId);
    const nextLocation = selectedField?.label || selectedField?.name || "";
    if (
      nextStructureId !== formData.structureId ||
      nextFieldId !== formData.fieldId ||
      nextLocation !== formData.location
    ) {
      setFormData((prev) => ({ ...prev, structureId: nextStructureId, fieldId: nextFieldId, location: nextLocation }));
    }
  }, [
    formData.fieldId,
    formData.location,
    formData.structureId,
    formData.venueMode,
    homeFields,
    structureOptions,
    structureRecommendations,
  ]);

  const setStructure = (value: string) => {
    const nextFields = homeFields.filter((field) => field.structureId === value);
    const first = nextFields[0];
    update({ structureId: value, fieldId: first?.fieldId || first?.id || "", location: first?.label || first?.name || "" });
  };

  const setField = (value: string) => {
    const selectedField = fieldOptions.find((field) => (field.fieldId || field.id) === value);
    update({ fieldId: value, location: selectedField?.label || selectedField?.name || "" });
  };

  const toggleTrainer = (trainerId: string, checked: boolean) =>
    update((prev) => ({
      ...prev,
      trainerIds: checked
        ? Array.from(new Set([...prev.trainerIds, trainerId]))
        : prev.trainerIds.filter((id) => id !== trainerId),
    }));

  /* Le categorie si derivano dai gruppi: non sono una seconda spunta. */
  const toggleGroup = (group: TrainingGroupOption, checked: boolean) =>
    update((prev) => {
      const groupIds = checked ? Array.from(new Set([...prev.groupIds, group.id])) : prev.groupIds.filter((id) => id !== group.id);
      return { ...prev, groupIds, categoryIds: categoryIdsFromGroups(groupOptions, groupIds) };
    });

  /*
    La fine proposta quando si lascia l'inizio senza averla scritta: +90
    minuti, modificabile. Con la fine gia scritta non si tocca niente.
  */
  const proposeEnd = () =>
    setFormData((prev) => {
      if (prev.endTime || !prev.startTime) return prev;
      const suggested = suggerisciIntervalloGara(prev.startTime);
      const [, end = ""] = matchTimesOf(suggested);
      return end ? { ...prev, endTime: end } : prev;
    });

  const composeTime = (state: FormState) => {
    if (state.startTime && state.endTime) return `${state.startTime} - ${state.endTime}`;
    /* Ripiego per chi salva senza mai lasciare il campo: mai un solo orario. */
    return suggerisciIntervalloGara(state.startTime);
  };

  const validate = (state: FormState): FormError[] => {
    const found: FormError[] = [];
    if (categoryOptions.length === 0) {
      found.push({ id: `${idPrefix}-groups`, field: "groups", label: "Nessuna categoria registrata. Crea prima una categoria." });
    } else if (state.categoryIds.length === 0) {
      found.push({ id: `${idPrefix}-groups`, field: "groups", label: "Seleziona almeno una categoria" });
    }
    if (!state.opponent.trim()) found.push({ id: `${idPrefix}-opponent`, field: "opponent", label: "Indica l'avversario" });
    if (!state.date || !parseDateInput(state.date)) found.push({ id: `${idPrefix}-date`, field: "date", label: "Indica la data" });
    if (!state.startTime) found.push({ id: `${idPrefix}-start`, field: "startTime", label: "Indica l'orario di inizio" });
    if (state.venueMode === "home" && (!state.structureId || !state.fieldId)) {
      found.push({ id: `${idPrefix}-structure`, field: "structure", label: "Seleziona struttura e campo per la gara in casa" });
    }
    if (state.venueMode === "away" && !state.manualLocation.trim()) {
      found.push({ id: `${idPrefix}-manual-location`, field: "manualLocation", label: "Indica il campo o il luogo della trasferta" });
    }
    return found;
  };

  const errorFor = (field: string) => errors.find((error) => error.field === field)?.label;

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const found = validate(formData);
    setErrors(found);
    if (found.length) return;

    const time = composeTime(formData);
    const resolvedLocation = formData.venueMode === "home" ? formData.location : formData.manualLocation;
    const date = parseDateInput(formData.date) || new Date();

    setSubmitting(true);
    try {
      const esito = await onSubmit({
        title: formData.title,
        date,
        time,
        categoryIds: formData.categoryIds,
        groupIds: formData.groupIds,
        opponent: formData.opponent,
        location: resolvedLocation,
        venueMode: formData.venueMode,
        structureId: formData.structureId,
        fieldId: formData.fieldId,
        manualLocation: formData.manualLocation,
        trainerIds: formData.trainerIds,
        notes: formData.notes,
        matchNumber: formData.matchNumber,
        isHome: formData.venueMode === "home",
        ...toEventRsvpPayload(rsvp),
      });
      /* Un `false` esplicito: il cassetto resta aperto e compilato. */
      if (esito === false) return;
      setDirty(false);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = saving || submitting;
  const title = editMode ? "Modifica gara" : mode === "duplicate" ? "Duplica gara" : "Nuova gara";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Gara"
      title={title}
      description={editMode ? "Titolo, orario, luogo, allenatori e conferme della gara." : "Una gara per ogni categoria selezionata, con le squadre che la giocano."}
      dirty={dirty}
      locked={busy}
      data-test="match-form-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void handleSubmit()} loading={busy} disabled={categoryOptions.length === 0}>
            {editMode ? "Salva modifiche" : "Aggiungi gara"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
          <ValidationSummary errors={errors} />

          <DrawerSection eyebrow="Quando">
            <FormGrid>
              <Field label="Titolo" htmlFor={`${idPrefix}-title`} optional helper="Vuoto: «Partita {categoria} vs {avversario}».">
                <TextInput
                  id={`${idPrefix}-title`}
                  value={formData.title}
                  onChange={(event) => update({ title: event.target.value })}
                  placeholder="Es. Partita Under 14 vs Juventus"
                />
              </Field>
              <Field label="Data" htmlFor={`${idPrefix}-date`} required error={errorFor("date")}>
                <DateInput id={`${idPrefix}-date`} value={formData.date} onChange={(event) => update({ date: event.target.value })} />
              </Field>
              <Field
                label="Ora inizio"
                htmlFor={`${idPrefix}-start`}
                required
                error={errorFor("startTime")}
                helper={`Scrivi solo l'inizio: la fine viene proposta a +${DURATA_GARA_SUGGERITA_MINUTI} minuti, e resta modificabile.`}
              >
                <TimeInput
                  id={`${idPrefix}-start`}
                  value={formData.startTime}
                  onChange={(event) => update({ startTime: event.target.value })}
                  onBlur={proposeEnd}
                />
              </Field>
              <Field label="Ora fine" htmlFor={`${idPrefix}-end`} required>
                <TimeInput
                  id={`${idPrefix}-end`}
                  value={formData.endTime}
                  onChange={(event) => update({ endTime: event.target.value })}
                  placeholder={formData.startTime ? sommaMinuti(formData.startTime, DURATA_GARA_SUGGERITA_MINUTI) : undefined}
                />
              </Field>
            </FormGrid>
          </DrawerSection>

          <DrawerSection eyebrow="Chi gioca">
            {categoryOptions.length > 0 ? (
              <div id={`${idPrefix}-groups`} tabIndex={-1}>
                <TrainingGroupSelector
                  groups={groupOptions}
                  selectedGroupIds={formData.groupIds}
                  onToggle={toggleGroup}
                  idPrefix={`${idPrefix}-group`}
                  error={errorFor("groups")}
                />
              </div>
            ) : (
              <AlertBlock severity="warning" title="Nessuna categoria registrata">
                Crea prima una categoria: una gara si assegna alle squadre che la giocano.
              </AlertBlock>
            )}
            <Field label="Avversario" htmlFor={`${idPrefix}-opponent`} required error={errorFor("opponent")} className="mt-5">
              <TextInput
                id={`${idPrefix}-opponent`}
                value={formData.opponent}
                onChange={(event) => update({ opponent: event.target.value })}
                placeholder="Es. Juventus Academy"
              />
            </Field>
          </DrawerSection>

          <DrawerSection eyebrow="Dove">
            <Field label="Sede gara">
              <SegmentedControl<"home" | "away">
                aria-label="Sede gara"
                size="sm"
                value={formData.venueMode}
                onChange={(venueMode) =>
                  update((prev) => ({
                    ...prev,
                    venueMode,
                    location: venueMode === "away" ? prev.manualLocation : prev.location,
                  }))
                }
                options={[
                  { value: "home", label: "In casa" },
                  { value: "away", label: "Trasferta" },
                ]}
              />
            </Field>
            {formData.venueMode === "home" ? (
              <FormGrid className="mt-5">
                <Field label="Struttura" htmlFor={`${idPrefix}-structure`} required error={errorFor("structure")}>
                  <Select
                    id={`${idPrefix}-structure`}
                    value={formData.structureId}
                    onValueChange={setStructure}
                    placeholder={structureOptions.length ? "Seleziona struttura" : "Nessuna struttura disponibile"}
                    disabled={!structureOptions.length}
                    options={structureRecommendations.map(({ structure, recommended }) => ({
                      value: structure.id,
                      label: `${structure.name}${recommended ? " · Consigliata (stessa sede)" : ""}`,
                    }))}
                  />
                </Field>
                <Field label="Campo" htmlFor={`${idPrefix}-field`} required>
                  <Select
                    id={`${idPrefix}-field`}
                    value={formData.fieldId}
                    onValueChange={setField}
                    placeholder={fieldOptions.length ? "Seleziona campo" : "Nessun campo disponibile"}
                    disabled={!fieldOptions.length}
                    options={fieldOptions.map((field) => ({
                      value: field.fieldId || field.id,
                      label: field.fieldName || field.name,
                    }))}
                  />
                </Field>
              </FormGrid>
            ) : (
              <Field label="Campo / luogo trasferta" htmlFor={`${idPrefix}-manual-location`} required error={errorFor("manualLocation")} className="mt-5">
                <TextInput
                  id={`${idPrefix}-manual-location`}
                  value={formData.manualLocation}
                  onChange={(event) => update({ manualLocation: event.target.value, location: event.target.value })}
                  placeholder="Es. Campo Avversario, Via Roma 123"
                />
              </Field>
            )}
            <Field label="Numero di gara" htmlFor={`${idPrefix}-number`} optional className="mt-5" width="20ch">
              <TextInput
                id={`${idPrefix}-number`}
                value={formData.matchNumber}
                onChange={(event) => update({ matchNumber: event.target.value })}
                placeholder="Es. 12345"
              />
            </Field>
          </DrawerSection>

          <DrawerSection eyebrow="Allenatori">
            <div className="max-h-52 overflow-y-auto rounded-egw-field border border-egw-hairline bg-egw-page-100 p-2" role="group" aria-label="Allenatori">
              {trainers.length > 0 ? (
                trainers.map((trainer) => {
                  const auto = autoTrainerIds.includes(trainer.id);
                  const checkboxId = `${idPrefix}-trainer-${trainer.id}`;
                  return (
                    <label key={trainer.id} htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2.5 rounded-egw-chip px-2 py-1.5 hover:bg-white">
                      <Checkbox
                        id={checkboxId}
                        checked={formData.trainerIds.includes(trainer.id)}
                        onChange={(event) => toggleTrainer(trainer.id, event.target.checked)}
                      />
                      <span className="egw-ellipsis min-w-0 flex-1 font-brand text-[13px] text-egw-ink">{trainer.name}</span>
                      {auto ? (
                        <DataChip tone="blue" size="sm">
                          Associato
                        </DataChip>
                      ) : null}
                    </label>
                  );
                })
              ) : (
                <p className="px-2 py-1.5 font-brand text-[12.5px] text-egw-ink-62">Nessun allenatore disponibile.</p>
              )}
            </div>
            <p className="mt-2 font-brand text-[11.5px] text-[rgba(11,26,58,.55)]">
              Gli allenatori collegati alle categorie selezionate vengono proposti automaticamente. Puoi modificarli manualmente.
            </p>
          </DrawerSection>

          <DrawerSection eyebrow="Conferme delle famiglie">
            <EventRsvpFields
              value={rsvp}
              onChange={(next) => {
                setRsvp(next);
                setDirty(true);
              }}
              idPrefix={idPrefix}
            />
          </DrawerSection>

          <DrawerSection eyebrow="Note">
            <Field label="Note" htmlFor={`${idPrefix}-notes`} optional>
              <Textarea
                id={`${idPrefix}-notes`}
                value={formData.notes}
                onChange={(event) => update({ notes: event.target.value })}
                placeholder="Es. Portare divisa da trasferta"
                rows={3}
              />
            </Field>
          </DrawerSection>
        </form>
      </FieldSizeProvider>
    </Drawer>
  );
}
