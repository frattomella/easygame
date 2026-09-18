"use client";

import { defaultTrainingTitle, isDateDerivedTitle, isGenericTrainingTitle, trainingDisplayNote, trainingDisplayTitle } from "@/lib/events/training-presenter";
import React, { useState, useEffect } from "react";
import {
  TrainingGroupSelector,
  categoryIdsFromGroups,
  groupIdsForCategories,
  type TrainingGroupOption,
} from "@/components/training/TrainingGroupSelector";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox } from "@/components/web/primitives/Controls";
import { AlertBlock } from "@/components/web/page/Alerts";
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
import { isValidTimeRange } from "@/lib/training-utils";

interface Trainer {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

/**
 * Un allenamento in modifica.
 *
 * `trainerIds` e `categories` sono **elenchi**, come nel form di creazione
 * (Blocco 7, punto 4). Prima erano `trainerId` singolo e una `category`
 * testuale di sola lettura: un allenamento creato con tre allenatori e due
 * categorie, riaperto in modifica e salvato, usciva con **un** allenatore. La
 * modifica non correggeva l'allenamento, lo mutilava.
 */
interface Training {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime?: string;
  location: string;
  trainerIds: string[];
  categories: string[];
  /** I gruppi operativi a cui l'allenamento si riferisce (ADR-0055). */
  groupIds?: string[];
}

interface EditTrainingFormProps {
  isOpen: boolean;
  onClose: () => void;
  /** Torna `false` se non ha salvato (conferma rifiutata, errore): il cassetto resta aperto. */
  onSubmit: (
    trainingData: Training,
    originalTraining: Training,
  ) => void | boolean | Promise<void | boolean>;
  training: Training | null;
  trainers: Trainer[];
  categories?: Category[];
  /** I gruppi operativi del club: e a questi che un allenamento si assegna. */
  groups?: TrainingGroupOption[];
  locations: string[];
  /**
   * **Cosa non si puo piu cambiare, e perche** (PP-01 §B).
   *
   * Un allenamento concluso resta modificabile — titolo e note si scrivono
   * proprio dopo — ma se ha gia convocazioni, presenze o risposte delle
   * famiglie, istante, luogo, categorie, gruppi e capienza sono congelati: sono
   * i campi che cambiano **il significato delle righe gia scritte**.
   *
   * La regola la applica il server (`campiCongelatiToccati`). Qui si dichiara
   * e si mostra: giorno, ora e campo diventano di sola lettura, perche una
   * regola che si scopre solo quando il salvataggio fallisce e una regola che
   * non e stata dichiarata.
   */
  consolidato?: boolean;
  saving?: boolean;
}

type FormErrors = Partial<Record<"title" | "date" | "time" | "endTime" | "location" | "trainerIds", string>>;

const FIELD_LABELS: Record<keyof FormErrors, string> = {
  title: "Titolo",
  date: "Data",
  time: "Orario inizio",
  endTime: "Orario fine",
  location: "Campo",
  trainerIds: "Allenatori",
};

/**
 * Il modulo «Modifica allenamento» nel Web V2: un cassetto da 720 a sezioni
 * (guideline 08 §8.5). Stessi campi e stesso contratto della V1 — titolo,
 * data, orari, campo (per **nome**, come la V1 lo passa), allenatori a
 * spunta, gruppi — con l'avviso sulle modifiche rilevate e la spunta delle
 * notifiche. La validazione e in linea con il riepilogo in testa.
 */
export function EditTrainingForm({
  isOpen,
  onClose,
  onSubmit,
  training,
  trainers,
  categories = [],
  groups = [],
  locations = ["Campo Principale", "Campo Secondario", "Palestra"],
  consolidato = false,
  saving = false,
}: EditTrainingFormProps) {
  const [formData, setFormData] = useState<Training>({
    id: "",
    title: "",
    date: "",
    time: "",
    endTime: "19:30",
    location: "",
    trainerIds: [],
    categories: [],
    groupIds: [],
  });

  /** Aggiunge o toglie un elemento da un elenco di id. */
  const toggleId = (field: "trainerIds", id: string) => {
    setDirty(true);
    setFormData((previous) => {
      const current = new Set(previous[field]);
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...previous, [field]: Array.from(current) };
    });
  };

  const [originalTraining, setOriginalTraining] = useState<Training | null>(
    null,
  );
  const [changes, setChanges] = useState<string[]>([]);
  const [sendNotifications, setSendNotifications] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);
  /* La nota si riscrive solo se qualcuno l'ha toccata (revisione D1): un titolo storico non si perde cambiando l'orario. */
  const [titleTouched, setTitleTouched] = useState(false);

  /**
   * I gruppi selezionabili. Senza gruppi configurati si ricade sulle
   * categorie, che e il comportamento di un club mono-sede.
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

  const handleGroupToggle = (
    group: TrainingGroupOption,
    checked: boolean,
  ) => {
    setDirty(true);
    setFormData((previous) => {
      const groupIds = checked
        ? Array.from(new Set([...(previous.groupIds || []), group.id]))
        : (previous.groupIds || []).filter((id) => id !== group.id);

      return {
        ...previous,
        groupIds,
        categories: categoryIdsFromGroups(groupOptions, groupIds),
      };
    });
  };

  useEffect(() => {
    if (training) {
      /*
        Un allenamento creato prima dei gruppi non ne dichiara nessuno: le
        spunte partono da dove il dato lo colloca oggi — tutte le squadre di
        quelle categorie — e chi modifica puo restringerle (ADR-0055).
      */
      const groupIds = training.groupIds?.length
        ? training.groupIds
        : groupIdsForCategories(groupOptions, training.categories || []);

      setFormData({ ...training, groupIds });
      setOriginalTraining({ ...training, groupIds });
      setDirty(false);
      setTitleTouched(false);
      setErrors({});
      setSubmitted(false);
    }
  }, [training, groupOptions]);

  // Track changes between original and current form data
  useEffect(() => {
    if (!originalTraining) return;

    const newChanges: string[] = [];

    if (formData.date !== originalTraining.date) {
      newChanges.push("data");
    }

    if (formData.time !== originalTraining.time) {
      newChanges.push("orario");
    }

    if ((formData.endTime || "") !== (originalTraining.endTime || "")) {
      newChanges.push("fine");
    }

    if (formData.location !== originalTraining.location) {
      newChanges.push("campo");
    }

    const sameList = (left: string[], right: string[]) =>
      left.length === right.length &&
      [...left].sort().join("|") === [...right].sort().join("|");

    if (!sameList(formData.trainerIds, originalTraining.trainerIds)) {
      newChanges.push("allenatori");
    }

    if (!sameList(formData.categories, originalTraining.categories)) {
      newChanges.push("categorie");
    }

    setChanges(newChanges);
  }, [formData, originalTraining]);

  const setValue = (name: keyof Training, value: string) => {
    setDirty(true);
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!formData.date) next.date = "La data è obbligatoria";
    if (!formData.time) next.time = "L'orario di inizio è obbligatorio";
    if (!formData.location) next.location = "Seleziona un campo";
    if (!isValidTimeRange(formData.time, formData.endTime || "")) {
      next.endTime = "L'orario di fine deve essere successivo all'orario di inizio";
    }
    /* L'allenatore e facoltativo (ADR-0198 §1): un allenamento nato senza si modifica senza doverne scegliere uno. */
    return next;
  };

  useEffect(() => {
    if (submitted) setErrors(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, submitted]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) {
      const first = Object.keys(next)[0];
      document.getElementById(`edit-training-${first}`)?.focus();
      return;
    }

    if (!originalTraining) return;

    const saved = await onSubmit(
      {
        ...formData,
        title: titleTouched ? formData.title.trim() || defaultTrainingTitle() : formData.title,
      },
      originalTraining,
    );
    if (saved === false) return;
    setDirty(false);
    onClose();
  };

  const summaryErrors = Object.entries(errors).map(([key, label]) => ({
    id: `edit-training-${key}`,
    label: `${FIELD_LABELS[key as keyof FormErrors]}: ${label}`,
  }));

  const locationOptions = React.useMemo(() => {
    const names = Array.from(new Set([...locations, formData.location].filter(Boolean)));
    return names.map((name) => ({ value: name, label: name }));
  }, [locations, formData.location]);

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width="wide"
      eyebrow="Allenamenti"
      title="Modifica allenamento"
      description={training ? [trainingDisplayTitle(training), trainingDisplayNote(training)].filter(Boolean).join(" · ") : undefined}
      dirty={dirty}
      locked={saving}
      data-test="edit-training-drawer"
      footer={
        <>
          <Button variant="primary" type="submit" form="edit-training-form" loading={saving}>
            Salva modifiche
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <form id="edit-training-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <ValidationSummary errors={summaryErrors} className="mb-5" />

          {consolidato ? (
            <AlertBlock severity="warning" title="Questo allenamento ha già una storia" className="mb-5">
              Convocazioni, presenze o risposte delle famiglie sono già registrate. <strong>Titolo, note e allenatori</strong>{" "}
              restano modificabili; giorno, ora, luogo, categorie e gruppi no: cambiarli cambierebbe il significato delle
              presenze già registrate. Per spostarlo davvero, annullalo e creane uno nuovo.
            </AlertBlock>
          ) : null}

          <DrawerSection eyebrow="Seduta">
            <Field label="Nota (facoltativa)" htmlFor="edit-training-title" error={errors.title} helper="Compare sotto «Allenamento». La data e l'ora restano campi a parte.">
              <TextInput
                id="edit-training-title"
                name="title"
                value={!titleTouched && (isDateDerivedTitle(formData.title) || isGenericTrainingTitle(formData.title)) ? "" : formData.title}
                onChange={(event) => {
                  setTitleTouched(true);
                  setValue("title", event.target.value);
                }}
                placeholder="Es. Tecnica portieri"
              />
            </Field>
            <FormGrid className="mt-5">
              <Field
                label="Data"
                htmlFor="edit-training-date"
                required
                error={errors.date}
                helper={consolidato ? "Congelata: l'allenamento ha già una storia." : undefined}
              >
                <DateInput
                  id="edit-training-date"
                  name="date"
                  value={formData.date}
                  readOnly={consolidato}
                  onChange={(event) => setValue("date", event.target.value)}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Orario inizio" htmlFor="edit-training-time" required error={errors.time}>
                  <TimeInput
                    id="edit-training-time"
                    name="time"
                    value={formData.time}
                    readOnly={consolidato}
                    onChange={(event) => setValue("time", event.target.value)}
                  />
                </Field>
                <Field label="Orario fine" htmlFor="edit-training-endTime" required error={errors.endTime}>
                  <TimeInput
                    id="edit-training-endTime"
                    name="endTime"
                    value={formData.endTime || ""}
                    readOnly={consolidato}
                    onChange={(event) => setValue("endTime", event.target.value)}
                  />
                </Field>
              </div>
            </FormGrid>
            <div className="mt-5">
              <Field
                label="Campo"
                htmlFor="edit-training-location"
                required
                error={errors.location}
                helper={consolidato ? "Congelato: l'allenamento ha già una storia." : undefined}
              >
                <Select
                  id="edit-training-location"
                  value={formData.location}
                  onValueChange={(value) => setValue("location", value)}
                  placeholder="Seleziona un campo"
                  disabled={consolidato}
                  options={locationOptions}
                />
              </Field>
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Squadre e allenatori">
            {/*
              Allenatori e categorie sono selezioni multiple, come nel form di
              creazione: un allenamento ne ha spesso piu di uno, e ridurli a
              uno in modifica cancellava dati senza dirlo.
            */}
            <Field label="Allenatori" required error={errors.trainerIds}>
              <div
                id="edit-training-trainerIds"
                tabIndex={-1}
                className="max-h-56 overflow-y-auto rounded-egw-field border border-egw-hairline bg-egw-page-100 p-2 focus-visible:outline-none focus-visible:shadow-egw-focus"
              >
                {trainers.length ? (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {trainers.map((trainer) => (
                      <label
                        key={trainer.id}
                        className="flex min-h-[36px] cursor-pointer items-center gap-2.5 rounded-egw-chip px-2 font-brand text-[13px] text-egw-ink hover:bg-white"
                      >
                        <Checkbox
                          size={16}
                          checked={formData.trainerIds.includes(trainer.id)}
                          onChange={() => toggleId("trainerIds", trainer.id)}
                        />
                        <span className="egw-ellipsis">{trainer.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-1.5 font-brand text-[12.5px] text-egw-ink-62">
                    Nessun allenatore disponibile
                  </p>
                )}
              </div>
            </Field>

            <div className="mt-5">
              <TrainingGroupSelector
                groups={groupOptions}
                selectedGroupIds={formData.groupIds || []}
                onToggle={handleGroupToggle}
                idPrefix="edit-training-group"
              />
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Notifiche">
            {changes.length > 0 ? (
              <AlertBlock severity="warning" title="Modifiche rilevate" className="mb-4">
                Stai modificando: {changes.join(", ")}. Verrà inviata una notifica agli atleti, genitori e allenatori
                coinvolti.
              </AlertBlock>
            ) : null}
            <label
              htmlFor="sendNotifications"
              className="flex cursor-pointer items-center gap-2.5 font-brand text-[13px] text-egw-ink"
            >
              <Checkbox
                id="sendNotifications"
                checked={sendNotifications}
                onChange={(event) => setSendNotifications(event.target.checked)}
              />
              Invia notifiche delle modifiche ad atleti, genitori e allenatori
            </label>
          </DrawerSection>
        </form>
      </FieldSizeProvider>
    </Drawer>
  );
}
