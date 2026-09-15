"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Checkbox } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
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
  categoryIdsFromGroups,
  TrainingGroupSelector,
  type TrainingGroupOption,
} from "@/components/training/TrainingGroupSelector";
import { DURATA_GARA_SUGGERITA_MINUTI, sommaMinuti, suggerisciIntervalloGara } from "@/lib/matches/match-time-suggestion";
import { formatLocalDateOnly } from "@/lib/date-only";
import { parseDateInput } from "@/lib/web/format";
import { matchTimesOf } from "@/components/matches/v2/match-page-model";
import type { MatchFormPayload, MatchLocationOption } from "@/components/matches/v2/MatchFormDrawer";

/**
 * Piu gare in una volta (la forma V2 di `MultipleAddMatchForm`, «Aggiungi
 * Multiple Gare»): squadre, allenatori e note comuni, poi una riga per
 * partita — data, ora di inizio e fine, avversario, luogo (un campo di casa o
 * un luogo libero), numero di gara. Ogni riga diventa una gara come dal
 * modulo singolo, con le stesse regole della pagina (una riga per categoria,
 * conferma cross-site, conflitti).
 *
 * Rispetto alla V1 le squadre sono i gruppi operativi (ADR-0055) e non le
 * categorie nude, cosi le gare create qui hanno gli stessi `groupIds` di
 * quelle create dal modulo singolo — e l'orario passa dallo stesso
 * suggerimento della fine (+90 minuti), che la V1 qui non applicava.
 */
type Entry = {
  key: string;
  date: string;
  startTime: string;
  endTime: string;
  opponent: string;
  /** L'id del campo di casa scelto, o `""` per il luogo libero. */
  fieldId: string;
  manualLocation: string;
  matchNumber: string;
};

const newEntry = (selectedDate?: Date): Entry => ({
  key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  date: formatLocalDateOnly(selectedDate || new Date()),
  startTime: "",
  endTime: "",
  opponent: "",
  fieldId: "",
  manualLocation: "",
  matchNumber: "",
});

const FREE_LOCATION = "__free__";

export function MultipleMatchesDrawer({
  open,
  onOpenChange,
  onSubmit,
  categories,
  groups = [],
  trainers,
  selectedDate,
  homeFields = [],
  saving = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Torna `false` se nessuna gara e stata salvata: il cassetto resta aperto. */
  onSubmit: (data: MatchFormPayload[]) => void | boolean | Promise<void | boolean>;
  categories: Array<{ id?: string; name?: string }>;
  groups?: TrainingGroupOption[];
  trainers: Array<{ id: string; name: string }>;
  selectedDate?: Date;
  homeFields?: MatchLocationOption[];
  saving?: boolean;
}) {
  const idPrefix = "multi-match";
  const categoryOptions = React.useMemo(
    () =>
      (Array.isArray(categories) ? categories : [])
        .map((category) => ({ id: String(category?.id || "").trim(), name: String(category?.name || category?.id || "").trim() }))
        .filter((category) => category.id && category.name),
    [categories],
  );
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

  const [groupIds, setGroupIds] = React.useState<string[]>([]);
  const [trainerIds, setTrainerIds] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState("");
  const [entries, setEntries] = React.useState<Entry[]>(() => [newEntry(selectedDate)]);
  const [errors, setErrors] = React.useState<Array<{ id: string; label: string }>>([]);
  const [dirty, setDirty] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setGroupIds([]);
    setTrainerIds([]);
    setNotes("");
    setEntries([newEntry(selectedDate)]);
    setErrors([]);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const categoryIds = React.useMemo(() => categoryIdsFromGroups(groupOptions, groupIds), [groupOptions, groupIds]);

  const updateEntry = (key: string, patch: Partial<Entry>) => {
    setEntries((current) => current.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
    setDirty(true);
  };

  const proposeEnd = (key: string) =>
    setEntries((current) =>
      current.map((entry) => {
        if (entry.key !== key || entry.endTime || !entry.startTime) return entry;
        const [, end = ""] = matchTimesOf(suggerisciIntervalloGara(entry.startTime));
        return end ? { ...entry, endTime: end } : entry;
      }),
    );

  const handleSubmit = async () => {
    const found: Array<{ id: string; label: string }> = [];
    if (categoryOptions.length === 0) {
      found.push({ id: `${idPrefix}-groups`, label: "Nessuna categoria registrata. Crea prima una categoria." });
    } else if (categoryIds.length === 0) {
      found.push({ id: `${idPrefix}-groups`, label: "Seleziona almeno una categoria" });
    }
    entries.forEach((entry, index) => {
      const location = entry.fieldId ? entry.fieldId : entry.manualLocation.trim();
      if (!entry.opponent.trim() || !location || !entry.startTime || !parseDateInput(entry.date)) {
        found.push({ id: `${idPrefix}-opponent-${entry.key}`, label: `Compila tutti i campi obbligatori per la partita ${index + 1}` });
      }
    });
    setErrors(found);
    if (found.length) return;

    const payloads: MatchFormPayload[] = entries.map((entry) => {
      const field = entry.fieldId ? homeFields.find((option) => (option.fieldId || option.id) === entry.fieldId) : undefined;
      const time = entry.startTime && entry.endTime ? `${entry.startTime} - ${entry.endTime}` : suggerisciIntervalloGara(entry.startTime);
      return {
        title: `Partita vs ${entry.opponent.trim()}`,
        date: parseDateInput(entry.date) || new Date(),
        time,
        categoryIds,
        groupIds,
        opponent: entry.opponent.trim(),
        location: field ? field.label || field.name : entry.manualLocation.trim(),
        venueMode: field ? "home" : "away",
        structureId: field?.structureId || "",
        fieldId: field ? field.fieldId || field.id : "",
        manualLocation: field ? "" : entry.manualLocation.trim(),
        trainerIds,
        notes,
        matchNumber: entry.matchNumber.trim(),
        isHome: Boolean(field),
        rsvpRequired: false,
        rsvpDeadline: null,
        capacity: null,
      };
    });

    setSubmitting(true);
    try {
      const esito = await onSubmit(payloads);
      if (esito === false) return;
      setDirty(false);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const busy = saving || submitting;
  const locationOptions = [
    { value: FREE_LOCATION, label: "Luogo libero (trasferta)" },
    ...homeFields.map((field) => ({ value: field.fieldId || field.id, label: field.label || field.name })),
  ];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Gare"
      title="Aggiungi più gare"
      description="Squadre, allenatori e note comuni; poi una riga per partita."
      dirty={dirty}
      locked={busy}
      data-test="multiple-matches-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void handleSubmit()} loading={busy} disabled={categoryOptions.length === 0}>
            Aggiungi {entries.length === 1 ? "1 gara" : `${entries.length} gare`}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-6">
          <ValidationSummary errors={errors} />

          <DrawerSection eyebrow="Comuni a tutte le gare">
            {categoryOptions.length > 0 ? (
              <div id={`${idPrefix}-groups`} tabIndex={-1}>
                <TrainingGroupSelector
                  groups={groupOptions}
                  selectedGroupIds={groupIds}
                  onToggle={(group, checked) => {
                    setGroupIds((current) => (checked ? Array.from(new Set([...current, group.id])) : current.filter((id) => id !== group.id)));
                    setDirty(true);
                  }}
                  idPrefix={`${idPrefix}-group`}
                />
              </div>
            ) : (
              <AlertBlock severity="warning" title="Nessuna categoria registrata">
                Crea prima una categoria: una gara si assegna alle squadre che la giocano.
              </AlertBlock>
            )}
            <div className="mt-5">
              <p className="mb-2 font-brand text-[12px] font-semibold leading-none text-egw-ink-62">Allenatori</p>
              <div className="max-h-40 overflow-y-auto rounded-egw-field border border-egw-hairline bg-egw-page-100 p-2" role="group" aria-label="Allenatori">
                {trainers.length > 0 ? (
                  trainers.map((trainer) => {
                    const checkboxId = `${idPrefix}-trainer-${trainer.id}`;
                    return (
                      <label key={trainer.id} htmlFor={checkboxId} className="flex cursor-pointer items-center gap-2.5 rounded-egw-chip px-2 py-1.5 hover:bg-white">
                        <Checkbox
                          id={checkboxId}
                          checked={trainerIds.includes(trainer.id)}
                          onChange={(event) => {
                            setTrainerIds((current) => (event.target.checked ? Array.from(new Set([...current, trainer.id])) : current.filter((id) => id !== trainer.id)));
                            setDirty(true);
                          }}
                        />
                        <span className="egw-ellipsis font-brand text-[13px] text-egw-ink">{trainer.name}</span>
                      </label>
                    );
                  })
                ) : (
                  <p className="px-2 py-1.5 font-brand text-[12.5px] text-egw-ink-62">Nessun allenatore disponibile.</p>
                )}
              </div>
            </div>
            <Field label="Note (comuni a tutte le gare)" htmlFor={`${idPrefix}-notes`} optional className="mt-5">
              <Textarea
                id={`${idPrefix}-notes`}
                value={notes}
                onChange={(event) => {
                  setNotes(event.target.value);
                  setDirty(true);
                }}
                placeholder="Es. Portare divisa da trasferta"
                rows={2}
              />
            </Field>
          </DrawerSection>

          <DrawerSection eyebrow="Partite">
            <div className="flex flex-col gap-3">
              {entries.map((entry, index) => (
                <InsetBlock key={entry.key} className="p-4" data-test="multiple-match-entry">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="font-brand text-[12.5px] font-bold text-egw-ink">Partita {index + 1}</p>
                    {entries.length > 1 ? (
                      <IconButton
                        aria-label={`Rimuovi la partita ${index + 1}`}
                        variant="row"
                        size="xs"
                        onClick={() => {
                          setEntries((current) => current.filter((item) => item.key !== entry.key));
                          setDirty(true);
                        }}
                      >
                        <Trash2 />
                      </IconButton>
                    ) : null}
                  </div>
                  <FormGrid>
                    <Field label="Data" htmlFor={`${idPrefix}-date-${entry.key}`} required>
                      <DateInput id={`${idPrefix}-date-${entry.key}`} value={entry.date} onChange={(event) => updateEntry(entry.key, { date: event.target.value })} />
                    </Field>
                    <Field label="Avversario" htmlFor={`${idPrefix}-opponent-${entry.key}`} required>
                      <TextInput
                        id={`${idPrefix}-opponent-${entry.key}`}
                        value={entry.opponent}
                        onChange={(event) => updateEntry(entry.key, { opponent: event.target.value })}
                        placeholder="Es. Juventus Academy"
                      />
                    </Field>
                    <Field label="Ora inizio" htmlFor={`${idPrefix}-start-${entry.key}`} required helper={`La fine viene proposta a +${DURATA_GARA_SUGGERITA_MINUTI} minuti.`}>
                      <TimeInput
                        id={`${idPrefix}-start-${entry.key}`}
                        value={entry.startTime}
                        onChange={(event) => updateEntry(entry.key, { startTime: event.target.value })}
                        onBlur={() => proposeEnd(entry.key)}
                      />
                    </Field>
                    <Field label="Ora fine" htmlFor={`${idPrefix}-end-${entry.key}`} required>
                      <TimeInput
                        id={`${idPrefix}-end-${entry.key}`}
                        value={entry.endTime}
                        onChange={(event) => updateEntry(entry.key, { endTime: event.target.value })}
                        placeholder={entry.startTime ? sommaMinuti(entry.startTime, DURATA_GARA_SUGGERITA_MINUTI) : undefined}
                      />
                    </Field>
                    <Field label="Luogo" htmlFor={`${idPrefix}-location-${entry.key}`} required>
                      <Select
                        id={`${idPrefix}-location-${entry.key}`}
                        value={entry.fieldId || FREE_LOCATION}
                        onValueChange={(value) => updateEntry(entry.key, { fieldId: value === FREE_LOCATION ? "" : value })}
                        options={locationOptions}
                      />
                    </Field>
                    {entry.fieldId ? (
                      <Field label="Numero di gara" htmlFor={`${idPrefix}-number-${entry.key}`} optional>
                        <TextInput
                          id={`${idPrefix}-number-${entry.key}`}
                          value={entry.matchNumber}
                          onChange={(event) => updateEntry(entry.key, { matchNumber: event.target.value })}
                          placeholder="Es. 12345"
                        />
                      </Field>
                    ) : (
                      <>
                        <Field label="Campo / luogo trasferta" htmlFor={`${idPrefix}-manual-${entry.key}`} required>
                          <TextInput
                            id={`${idPrefix}-manual-${entry.key}`}
                            value={entry.manualLocation}
                            onChange={(event) => updateEntry(entry.key, { manualLocation: event.target.value })}
                            placeholder="Es. Campo Avversario, Via Roma 123"
                          />
                        </Field>
                        <Field label="Numero di gara" htmlFor={`${idPrefix}-number-${entry.key}`} optional>
                          <TextInput
                            id={`${idPrefix}-number-${entry.key}`}
                            value={entry.matchNumber}
                            onChange={(event) => updateEntry(entry.key, { matchNumber: event.target.value })}
                            placeholder="Es. 12345"
                          />
                        </Field>
                      </>
                    )}
                  </FormGrid>
                </InsetBlock>
              ))}
            </div>
            <Button
              variant="neutral"
              size="sm"
              icon={<Plus />}
              className="mt-3"
              onClick={() => {
                setEntries((current) => [...current, newEntry(selectedDate)]);
                setDirty(true);
              }}
            >
              Aggiungi partita
            </Button>
          </DrawerSection>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
