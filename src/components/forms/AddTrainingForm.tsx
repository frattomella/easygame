"use client";

import { defaultTrainingTitle } from "@/lib/events/training-presenter";
import React, { useState } from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox } from "@/components/web/primitives/Controls";
import {
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  Select,
  TextInput,
  TimeInput,
  ValidationSummary,
} from "@/components/web/forms/Field";
import {
  findTrainingLocationOption,
  getStructureFieldOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";
import { getAssociatedTrainerIdsForGroups } from "@/lib/trainer-utils";
import { resolveRecommendedStructures } from "@/lib/club-sites";
import {
  TrainingGroupSelector,
  categoryIdsFromGroups,
  type TrainingGroupOption,
} from "@/components/training/TrainingGroupSelector";
import { isValidTimeRange } from "@/lib/training-utils";
import { formatLocalDateOnly } from "@/lib/date-only";
import {
  EMPTY_EVENT_RSVP,
  EventRsvpFields,
  toEventRsvpPayload,
  type EventRsvpValue,
} from "@/components/events/event-rsvp-fields";

/**
 * Il modulo «Nuovo allenamento» nel Web V2: un cassetto da 720 a sezioni
 * (guideline 08 §8.5, undici campi in quattro gruppi). Stessi campi, stesse
 * regole e stesso payload della V1: titolo, data, ora inizio/fine, le
 * risposte delle famiglie, i **gruppi** (le squadre vere, ADR-0055), gli
 * allenatori proposti dai gruppi, la struttura con quelle della stessa sede
 * consigliate e in cima, il campo della struttura. La validazione e in linea,
 * con il riepilogo in testa: un errore che l'utente ha causato non e un
 * toast (guideline 09 §9.5).
 *
 * Il ramo «appuntamento» della V1 non aveva nessun chiamante su questa rotta
 * ed e stato tolto: gli appuntamenti hanno il loro dominio (`/appuntamenti`).
 */
interface AddTrainingFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Torna `false` se non ha salvato (conferma rifiutata, errore): il modulo resta aperto. */
  onSubmit: (data: any) => void | boolean | Promise<void | boolean>;
  categories: { id: string; name: string }[];
  /**
   * I gruppi operativi del club. Un allenamento si assegna a **questi**, non
   * alla categoria: la categoria dice in che fascia si gioca, il gruppo dice
   * con chi ci si allena e dove (ADR-0055).
   */
  groups?: TrainingGroupOption[];
  trainers?: { id: string; name: string; categories?: any[] }[];
  locations?: TrainingLocationOption[];
  selectedDate?: Date;
  /** Vero mentre la pagina sta salvando: il piede lo mostra e il velo non chiude. */
  saving?: boolean;
}

type FormErrors = Partial<Record<"title" | "date" | "time" | "endTime" | "groupIds" | "trainerIds" | "structureId" | "locationId", string>>;

const FIELD_LABELS: Record<keyof FormErrors, string> = {
  title: "Titolo",
  date: "Data",
  time: "Ora inizio",
  endTime: "Ora fine",
  groupIds: "Gruppi",
  trainerIds: "Allenatori",
  structureId: "Struttura",
  locationId: "Campo della struttura",
};

export function AddTrainingForm({
  isOpen,
  onClose,
  onSubmit,
  categories = [],
  groups = [],
  trainers = [],
  locations = [],
  selectedDate,
  saving = false,
}: AddTrainingFormProps) {
  const [formData, setFormData] = useState({
    title: "",
    /*
      **Il giorno civile scelto, non l'istante UTC** (bug UAT "date-only
      timezone shift"): `selectedDate`/`new Date()` sono istanti a
      mezzanotte locale, e `.toISOString().split("T")[0]` li riconvertiva
      in UTC — a Roma la data proposta finiva un giorno prima.
    */
    date: formatLocalDateOnly(selectedDate || new Date()),
    time: "18:00",
    endTime: "19:30",
    categories: [] as string[],
    groupIds: [] as string[],
    trainerIds: [] as string[],
    structureId: "",
    locationId: "",
    location: "",
  });
  /*
    L'RSVP esisteva da due Wave e **nessun evento lo richiedeva mai**, perche
    non compariva in nessun form (W5-05).
  */
  const [rsvp, setRsvp] = React.useState<EventRsvpValue>(EMPTY_EVENT_RSVP);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const previousAutoTrainerIdsRef = React.useRef<string[]>([]);

  const structureOptions = React.useMemo(() => {
    const structureMap = new Map<
      string,
      { id: string; name: string; siteId: string | null }
    >();

    locations.forEach((location) => {
      if (!structureMap.has(location.structureId)) {
        structureMap.set(location.structureId, {
          id: location.structureId,
          name: location.structureName,
          siteId: location.siteId,
        });
      }
    });

    return Array.from(structureMap.values());
  }, [locations]);

  const availableFields = React.useMemo(
    () => getStructureFieldOptions(locations, formData.structureId),
    [locations, formData.structureId],
  );

  /**
   * I gruppi selezionabili.
   *
   * Senza gruppi configurati si ricade sulle categorie, una per una: e il
   * comportamento di un club mono-sede, e di un club che non ha ancora
   * dichiarato le sue sedi.
   */
  const groupOptions: TrainingGroupOption[] = React.useMemo(() => {
    if (groups.length) return groups;

    return categories.map((category) => ({
      id: `group:${category.id}`,
      name: category.name,
      categoryId: category.id,
      categoryName: category.name,
      siteId: "",
      siteName: "",
    }));
  }, [groups, categories]);

  /*
    **La sede del gruppo scelto, se e una sola.** Con gruppi di sedi diverse
    selezionati insieme, o senza gruppi con sede (club mono-sede, categoria
    non ancora collocata), non c'e un riferimento unico con cui confrontare
    la struttura: nessuna e "consigliata", comportamento attuale invariato.
  */
  const selectedGroupSiteId = React.useMemo(() => {
    const selected = groupOptions.filter((group) =>
      formData.groupIds.includes(group.id),
    );
    const siteIds = Array.from(
      new Set(selected.map((group) => group.siteId).filter(Boolean)),
    );
    return siteIds.length === 1 ? siteIds[0]! : "";
  }, [groupOptions, formData.groupIds]);

  /**
   * Le strutture con quelle della sede del gruppo scelto **consigliate e in
   * cima** — non filtrate: una struttura di un'altra sede resta
   * selezionabile, con un avviso alla conferma (gestito dal chiamante, vedi
   * `src/app/training/page.tsx`).
   */
  const structureRecommendations = React.useMemo(
    () => resolveRecommendedStructures(structureOptions, selectedGroupSiteId),
    [structureOptions, selectedGroupSiteId],
  );

  /*
    Gli allenatori proposti seguono i **gruppi** scelti, non le categorie: con
    due squadre di Pulcini in due sedi, proporre chi lavora nell'altra sede e
    un invito a sbagliare (ADR-0055).
  */
  const autoTrainerIds = React.useMemo(
    () =>
      getAssociatedTrainerIdsForGroups(
        trainers,
        groupOptions.filter((group) => formData.groupIds.includes(group.id)),
        categories,
      ),
    [trainers, groupOptions, formData.groupIds, categories],
  );

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (!structureOptions.length) {
      return;
    }

    const matchedLocation = findTrainingLocationOption(locations, {
      structureId: formData.structureId,
      fieldId: formData.locationId,
      location: formData.location,
    });

    /*
      **Il ripiego preferisce la struttura consigliata** (stessa sede del
      gruppo scelto), non semplicemente "la prima strutturale dell'elenco":
      `structureRecommendations` porta gia le strutture della sede in cima.
    */
    const nextStructureId =
      matchedLocation?.structureId ||
      formData.structureId ||
      structureRecommendations[0]?.structure.id ||
      structureOptions[0].id;
    const nextFields = getStructureFieldOptions(locations, nextStructureId);
    const nextFieldId =
      matchedLocation?.fieldId ||
      (nextFields.some((field) => field.id === formData.locationId)
        ? formData.locationId
        : nextFields[0]?.id || "");
    const nextLocation = findTrainingLocationOption(locations, {
      structureId: nextStructureId,
      fieldId: nextFieldId,
    });

    if (
      nextStructureId !== formData.structureId ||
      nextFieldId !== formData.locationId ||
      (nextLocation?.name || "") !== formData.location
    ) {
      setFormData((prev) => ({
        ...prev,
        structureId: nextStructureId,
        locationId: nextFieldId,
        location: nextLocation?.name || "",
      }));
    }
  }, [
    isOpen,
    locations,
    structureOptions,
    structureRecommendations,
    formData.structureId,
    formData.locationId,
    formData.location,
  ]);

  React.useEffect(() => {
    setFormData((prev) => {
      const previousAutoIds = previousAutoTrainerIdsRef.current;
      const manualTrainerIds = prev.trainerIds.filter(
        (trainerId) => !previousAutoIds.includes(trainerId),
      );
      const nextTrainerIds = Array.from(
        new Set([...autoTrainerIds, ...manualTrainerIds]),
      );

      if (
        nextTrainerIds.length === prev.trainerIds.length &&
        nextTrainerIds.every((trainerId, index) => trainerId === prev.trainerIds[index])
      ) {
        previousAutoTrainerIdsRef.current = autoTrainerIds;
        return prev;
      }

      previousAutoTrainerIdsRef.current = autoTrainerIds;
      return {
        ...prev,
        trainerIds: nextTrainerIds,
      };
    });
  }, [autoTrainerIds]);

  const setValue = (name: string, value: string) => {
    setDirty(true);
    if (name === "structureId") {
      const nextFields = getStructureFieldOptions(locations, value);
      const nextFieldId = nextFields[0]?.id || "";
      const nextLocation = findTrainingLocationOption(locations, {
        structureId: value,
        fieldId: nextFieldId,
      });
      setFormData((prev) => ({
        ...prev,
        structureId: value,
        locationId: nextFieldId,
        location: nextLocation?.name || "",
      }));
      return;
    }

    if (name === "locationId") {
      const nextLocation = findTrainingLocationOption(locations, {
        structureId: formData.structureId,
        fieldId: value,
      });
      setFormData((prev) => ({
        ...prev,
        locationId: value,
        location: nextLocation?.name || "",
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /*
    Le categorie restano nel dato — colori, titoli e compatibilita ci ragionano
    ancora — ma si **derivano** dai gruppi invece di essere una seconda
    selezione da tenere allineata a mano.
  */
  const handleGroupToggle = (
    group: TrainingGroupOption,
    checked: boolean,
  ) => {
    setDirty(true);
    setFormData((prev) => {
      const groupIds = checked
        ? Array.from(new Set([...prev.groupIds, group.id]))
        : prev.groupIds.filter((id) => id !== group.id);

      return {
        ...prev,
        groupIds,
        categories: categoryIdsFromGroups(groupOptions, groupIds),
      };
    });
  };

  const handleTrainerToggle = (trainerId: string, checked: boolean) => {
    setDirty(true);
    setFormData((prev) => {
      const trainerIds = new Set(prev.trainerIds);
      if (checked) {
        trainerIds.add(trainerId);
      } else {
        trainerIds.delete(trainerId);
      }

      return {
        ...prev,
        trainerIds: Array.from(trainerIds),
      };
    });
  };

  /** Le stesse regole della V1, campo per campo invece che in un toast solo. */
  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!formData.date) next.date = "La data è obbligatoria";
    if (!formData.time) next.time = "L'ora di inizio è obbligatoria";
    if (formData.groupIds.length === 0) next.groupIds = "Seleziona almeno un gruppo";
    if (!formData.structureId) next.structureId = "Seleziona una struttura";
    if (!formData.locationId) next.locationId = "Seleziona un campo";
    if (formData.trainerIds.length === 0) next.trainerIds = "Seleziona almeno un allenatore";
    if (formData.time && !isValidTimeRange(formData.time, formData.endTime)) {
      next.endTime = "L'orario di fine deve essere successivo all'orario di inizio";
    }
    return next;
  };

  React.useEffect(() => {
    if (submitted) setErrors(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, submitted]);

  const resetForm = () => {
    setFormData({
      title: "",
      date: formatLocalDateOnly(selectedDate || new Date()),
      time: "18:00",
      endTime: "19:30",
      categories: [],
      groupIds: [],
      trainerIds: [],
      structureId: structureOptions[0]?.id || "",
      locationId: "",
      location: "",
    });
    setRsvp(EMPTY_EVENT_RSVP);
    setErrors({});
    setSubmitted(false);
    setDirty(false);
    previousAutoTrainerIdsRef.current = [];
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      document.getElementById(`add-training-${first}`)?.focus();
      return;
    }

    /*
      Il chiamante decide se salvare (sovrapposizione, sede diversa): il modulo
      resta aperto finche non ha finito, e si chiude solo se ha salvato.
    */
    const saved = await onSubmit({
      ...formData,
      title: formData.title.trim() || defaultTrainingTitle(),
      ...toEventRsvpPayload(rsvp),
      trainers: formData.trainerIds,
      status: "upcoming",
      attendees: 0,
    });
    if (saved === false) return;
    resetForm();
  };

  const summaryErrors = Object.entries(errors).map(([key, label]) => ({
    id: `add-training-${key}`,
    label: `${FIELD_LABELS[key as keyof FormErrors]}: ${label}`,
  }));

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetForm();
          onClose();
        }
      }}
      width="wide"
      eyebrow="Allenamenti"
      title="Nuovo allenamento"
      description="Inserisci i dettagli del nuovo allenamento."
      dirty={dirty}
      locked={saving}
      data-test="add-training-drawer"
      footer={
        <>
          <Button variant="primary" type="submit" form="add-training-form" loading={saving}>
            Salva
          </Button>
          <Button variant="secondary" onClick={() => { resetForm(); onClose(); }} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <form id="add-training-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <ValidationSummary errors={summaryErrors} className="mb-5" />

          <DrawerSection eyebrow="Seduta">
            {/* Il titolo a schermo e il tipo, «Allenamento», con la categoria nel badge (ADR-0198 §3): qui si scrive solo una nota. */}
            <Field label="Nota (facoltativa)" htmlFor="add-training-title" error={errors.title} helper="Compare sotto «Allenamento». La data e l'ora restano campi a parte.">
              <TextInput
                id="add-training-title"
                name="title"
                value={formData.title}
                onChange={(event) => setValue("title", event.target.value)}
                placeholder="Es. Tecnica portieri"
              />
            </Field>
            <FormGrid className="mt-5">
              <Field label="Data" htmlFor="add-training-date" required error={errors.date}>
                <DateInput
                  id="add-training-date"
                  name="date"
                  value={formData.date}
                  onChange={(event) => setValue("date", event.target.value)}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Ora inizio" htmlFor="add-training-time" required error={errors.time}>
                  <TimeInput
                    id="add-training-time"
                    name="time"
                    value={formData.time}
                    onChange={(event) => setValue("time", event.target.value)}
                  />
                </Field>
                <Field label="Ora fine" htmlFor="add-training-endTime" required error={errors.endTime}>
                  <TimeInput
                    id="add-training-endTime"
                    name="endTime"
                    value={formData.endTime}
                    onChange={(event) => setValue("endTime", event.target.value)}
                  />
                </Field>
              </div>
            </FormGrid>
          </DrawerSection>

          <DrawerSection eyebrow="Famiglie">
            <EventRsvpFields
              value={rsvp}
              onChange={(next) => {
                setDirty(true);
                setRsvp(next);
              }}
              idPrefix="add-training"
            />
          </DrawerSection>

          <DrawerSection eyebrow="Squadre e allenatori">
            <div id="add-training-groupIds" tabIndex={-1} className="rounded-egw-chip focus-visible:outline-none focus-visible:shadow-egw-focus">
              <TrainingGroupSelector
                groups={groupOptions}
                selectedGroupIds={formData.groupIds}
                onToggle={handleGroupToggle}
                idPrefix="add-training-group"
                error={errors.groupIds ?? null}
              />
            </div>

            <div className="mt-5">
              <Field
                label="Allenatori"
                required
                error={errors.trainerIds}
                helper="Gli allenatori collegati alle categorie selezionate vengono proposti automaticamente. Puoi aggiungerne altri manualmente."
              >
                <div id="add-training-trainerIds" tabIndex={-1} className="rounded-egw-field border border-egw-hairline bg-egw-page-100 p-2 focus-visible:outline-none focus-visible:shadow-egw-focus">
                  {trainers.length > 0 ? (
                    <div className="grid gap-1 sm:grid-cols-2">
                      {trainers.map((trainer) => {
                        const isAutoAssigned = autoTrainerIds.includes(trainer.id);
                        return (
                          <label
                            key={trainer.id}
                            className="flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-egw-chip px-2 font-brand text-[13px] text-egw-ink hover:bg-white"
                          >
                            <Checkbox
                              size={16}
                              checked={formData.trainerIds.includes(trainer.id)}
                              onChange={(event) =>
                                handleTrainerToggle(trainer.id, event.target.checked)
                              }
                            />
                            <span className="egw-ellipsis flex-1">{trainer.name}</span>
                            {isAutoAssigned ? (
                              <span className="font-brand text-[10.5px] font-semibold text-egw-blue-700">
                                Associato
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="px-2 py-1.5 font-brand text-[12.5px] text-egw-ink-62">
                      Nessun allenatore disponibile
                    </p>
                  )}
                </div>
              </Field>
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Luogo">
            <FormGrid>
              <Field label="Struttura" htmlFor="add-training-structureId" required error={errors.structureId}>
                <Select
                  id="add-training-structureId"
                  value={formData.structureId}
                  onValueChange={(value) => setValue("structureId", value)}
                  placeholder={structureRecommendations.length ? "Seleziona una struttura" : "Nessuna struttura disponibile"}
                  disabled={!structureRecommendations.length}
                  options={structureRecommendations.map(({ structure, recommended }) => ({
                    value: structure.id,
                    label: `${structure.name}${recommended ? " · Consigliata (stessa sede)" : ""}`,
                  }))}
                />
              </Field>
              <Field label="Campo della struttura" htmlFor="add-training-locationId" required error={errors.locationId}>
                <Select
                  id="add-training-locationId"
                  value={formData.locationId}
                  onValueChange={(value) => setValue("locationId", value)}
                  placeholder={availableFields.length ? "Seleziona un campo" : "Nessun campo disponibile"}
                  disabled={!availableFields.length}
                  options={availableFields.map((field) => ({ value: field.id, label: field.name }))}
                />
              </Field>
            </FormGrid>
          </DrawerSection>
        </form>
      </FieldSizeProvider>
    </Drawer>
  );
}
