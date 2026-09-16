"use client";

import { todayLocalDateOnly } from "@/lib/date-only";
import * as React from "react";
import { Plus, Search, UserRoundPlus } from "lucide-react";
import { MarkControl, nextMark, type Mark } from "@/components/training/v2/MarkControl";
import { IdentityTile } from "@/components/web/primitives/Identity";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-notification";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Eyebrow, InsetBlock } from "@/components/web/primitives/Surface";
import { Skeleton } from "@/components/web/primitives/Controls";
import { DateInput, Field, SearchableSelect, TextInput } from "@/components/web/forms/Field";
import { AlertBlock } from "@/components/web/page/Alerts";
import { formatDateShort, joinMeta } from "@/lib/web/format";
import {
  createTrialAthlete,
  listEventTrialAttendance,
  saveEventTrialAttendance,
  searchTrialAthletes,
  type EventTrialAttendanceRow,
  type TrialAthlete,
} from "@/lib/trials/client";
import { ageFromBirthDate, findTrialMatches, trialStatusSpec, validateTrialForm, type TrialFormError } from "@/components/trials/v2/trial-model";
import type { TrialCategoryOption } from "@/components/trials/v2/use-trial-catalog";

/**
 * **Le persone in prova nel registro presenze** (ADR-0188, §19).
 *
 * Sotto gli atleti effettivi: le persone in prova pertinenti — stessa
 * categoria dell'allenamento, ancora in prova — e chi vi ha gia una presenza,
 * con lo stesso controllo a tre stati. «Atleta in prova» apre la ricerca fra
 * le persone gia in prova (nome, cognome, data di nascita per distinguere gli
 * omonimi); se non esiste, la registrazione rapida chiede tre campi e prende
 * la categoria dall'allenamento. Nessun nominativo libero: la riga nasce nel
 * dominio e torna con il suo identificativo, e la presenza si lega a quello.
 *
 * Si salva **insieme** al registro (il cassetto chiama `save()` prima
 * dell'appello degli atleti), su una tabella propria.
 */
export type TrialAttendanceOptions = {
  canRecord: boolean;
  canCreate: boolean;
  canReadContacts: boolean;
  /** La categoria dell'evento: la registrazione rapida la propone. */
  defaultCategoryId?: string | null;
  categoryOptions: readonly TrialCategoryOption[];
};

export type TrialAttendanceSectionHandle = {
  hasChanges: () => boolean;
  save: () => Promise<void>;
};


type TrialRowState = {
  trial: TrialAthlete;
  mark: Mark;
  notes: string;
  /** Vero se in archivio c'e gia una riga. */
  recorded: boolean;
};

const markLabel = (mark: Mark) => (mark === "present" ? "Presente" : mark === "absent" ? "Assente" : "Da segnare");

const toRows = (rows: EventTrialAttendanceRow[]): TrialRowState[] =>
  rows.map((row) => ({
    trial: row.trial,
    mark: row.attendance ? (row.attendance.status === "present" ? "present" : "absent") : null,
    notes: row.attendance?.notes || "",
    recorded: Boolean(row.attendance),
  }));

export const TrialAttendanceSection = React.forwardRef<
  TrialAttendanceSectionHandle,
  { eventId: string; options: TrialAttendanceOptions; onDirty: () => void }
>(function TrialAttendanceSection({ eventId, options, onDirty }, ref) {
  const { showToast } = useToast();
  const [rows, setRows] = React.useState<TrialRowState[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<TrialAthlete[] | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [creatingSaving, setCreatingSaving] = React.useState(false);
  const [form, setForm] = React.useState({ firstName: "", lastName: "", birthDate: "", categoryId: options.defaultCategoryId || "" });
  const [formErrors, setFormErrors] = React.useState<TrialFormError[]>([]);
  const changed = React.useRef(false);

  React.useEffect(() => {
    let annullato = false;
    setRows(null);
    setError(null);
    changed.current = false;
    listEventTrialAttendance(eventId)
      .then((data) => {
        if (!annullato) setRows(toRows(data));
      })
      .catch((caught: any) => {
        if (!annullato) {
          setError(caught?.message || "Impossibile leggere le persone in prova");
          setRows([]);
        }
      });
    return () => {
      annullato = true;
    };
  }, [eventId]);

  React.useEffect(() => {
    setForm((current) => ({ ...current, categoryId: options.defaultCategoryId || "" }));
  }, [options.defaultCategoryId]);

  /* La ricerca fra chi e gia in prova, con un piccolo ritardo per non chiedere a ogni tasto. */
  React.useEffect(() => {
    if (!adding) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let annullato = false;
    const timer = setTimeout(() => {
      searchTrialAthletes(q)
        .then((data) => {
          if (!annullato) setResults(data);
        })
        .catch(() => {
          if (!annullato) setResults([]);
        });
    }, 250);
    return () => {
      annullato = true;
      clearTimeout(timer);
    };
  }, [adding, query]);

  const update = (updater: (current: TrialRowState[]) => TrialRowState[]) => {
    setRows((current) => updater(current || []));
    changed.current = true;
    onDirty();
  };

  const cycle = (trialId: string) =>
    update((current) => current.map((row) => (row.trial.id === trialId ? { ...row, mark: nextMark(row.mark) } : row)));

  const addTrial = (trial: TrialAthlete) => {
    update((current) =>
      current.some((row) => row.trial.id === trial.id)
        ? current.map((row) => (row.trial.id === trial.id ? { ...row, mark: "present" } : row))
        : [...current, { trial, mark: "present", notes: "", recorded: false }],
    );
    setAdding(false);
    setQuery("");
    setResults(null);
    setCreating(false);
  };

  const quickCreate = async () => {
    const errors = validateTrialForm({ ...form, groupId: "", siteId: "", phone: "", email: "", guardianName: "", guardianPhone: "", notes: "" });
    setFormErrors(errors);
    if (errors.length) return;
    setCreatingSaving(true);
    try {
      const created = await createTrialAthlete({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        birthDate: form.birthDate,
        categoryId: form.categoryId || null,
      });
      addTrial(created);
      setForm({ firstName: "", lastName: "", birthDate: "", categoryId: options.defaultCategoryId || "" });
      showToast("success", `${created.name} registrata in prova`);
    } catch (caught: any) {
      showToast("error", caught?.message || "Registrazione non riuscita");
    } finally {
      setCreatingSaving(false);
    }
  };

  React.useImperativeHandle(ref, () => ({
    hasChanges: () => changed.current,
    save: async () => {
      /*
        Tutte le righe della sezione, comprese quelle tornate a «da segnare»:
        `status: null` toglie la presenza registrata (revisione ostile, M5).
        Una riga mai registrata e mai segnata non viaggia.
      */
      const entries = (rows || [])
        .filter((row) => row.mark !== null || row.recorded)
        .map((row) => ({ trialAthleteId: row.trial.id, status: row.mark, notes: row.mark ? row.notes || null : null }));
      if (!entries.length) {
        changed.current = false;
        return;
      }
      const saved = await saveEventTrialAttendance(eventId, entries);
      setRows(toRows(saved));
      changed.current = false;
    },
  }));

  const known = React.useMemo(() => (rows || []).map((row) => row.trial), [rows]);
  const matches = React.useMemo(
    () => (creating ? findTrialMatches(form, [...known, ...(results || [])].filter((trial, index, all) => all.findIndex((other) => other.id === trial.id) === index)) : []),
    [creating, form, known, results],
  );
  const present = (rows || []).filter((row) => row.mark === "present").length;

  return (
    <section className="border-t border-egw-hairline px-6 pb-2 pt-4" aria-label="Persone in prova">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Eyebrow as="p">In prova</Eyebrow>
          <p className="mt-1 font-brand text-[13px] font-bold text-egw-ink">
            Persone in prova {rows ? <span className="egw-num font-semibold text-egw-ink-62">· {present}/{rows.length}</span> : null}
          </p>
        </div>
        {options.canRecord ? (
          <Button variant="secondary" size="sm" icon={<UserRoundPlus />} onClick={() => setAdding((current) => !current)} aria-expanded={adding}>
            Atleta in prova
          </Button>
        ) : null}
      </div>

      {error ? <AlertBlock severity="warning" title={error} className="mt-3" /> : null}

      {rows === null ? (
        <div className="mt-3 flex flex-col gap-2" role="status" aria-busy>
          <span className="sr-only">Persone in prova in caricamento</span>
          <Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-2 font-brand text-[12px] text-egw-ink-62">Nessuna persona in prova per questa squadra. Con «Atleta in prova» ne cerchi una o la registri al volo.</p>
      ) : (
        <ul className="mt-2 divide-y divide-egw-rule" aria-label="Elenco delle persone in prova">
          {rows.map((row) => {
            const eta = ageFromBirthDate(row.trial.birthDate);
            return (
              <li key={row.trial.id} className="flex items-center gap-3 py-2">
                <IdentityTile name={row.trial.name} size={36} className="border border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink" />
                <button
                  type="button"
                  onClick={() => options.canRecord && cycle(row.trial.id)}
                  disabled={!options.canRecord}
                  className="min-w-0 flex-1 rounded-egw-chip text-left focus-visible:outline-none focus-visible:shadow-egw-focus disabled:cursor-default"
                  aria-label={`${row.trial.name}, in prova: ${markLabel(row.mark)}. Cambia stato`}
                >
                  <span className="egw-ellipsis block font-brand text-[13px] font-semibold text-egw-ink">{row.trial.name}</span>
                  <span className={cn("egw-ellipsis block font-brand text-[11.5px]", row.mark === "present" && "text-egw-green", row.mark === "absent" && "text-egw-red", row.mark === null && "text-egw-ink-62")}>
                    {joinMeta(markLabel(row.mark), eta !== null ? `${eta} anni` : null, `${row.trial.trialsCount} ${row.trial.trialsCount === 1 ? "prova" : "prove"}`)}
                  </span>
                </button>
                <StatusPill status={trialStatusSpec(row.trial.status)} size="sm" className="hidden sm:inline-flex" />
                {options.canRecord ? (
                  <MarkControl mark={row.mark} name={row.trial.name} label="Presente in prova" onCycle={() => cycle(row.trial.id)} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <InsetBlock className="mt-3 p-3.5">
          {!creating ? (
            <>
              <p className="font-brand text-[12.5px] font-semibold text-egw-ink">Chi viene a provare?</p>
              <p className="mt-0.5 font-brand text-[11.5px] text-egw-ink-62">Cerca fra le persone gia in prova: se e tornata, e la stessa persona.</p>
              <TextInput
                className="mt-2.5"
                leading={<Search />}
                placeholder="Nome, cognome o data di nascita…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Cerca fra le persone in prova"
                autoFocus
              />
              {query.trim().length >= 2 ? (
                results === null ? (
                  <Skeleton className="mt-2 h-9 w-full" />
                ) : results.length ? (
                  <ul className="mt-2 divide-y divide-egw-rule rounded-egw-field border border-egw-hairline bg-white" aria-label="Persone in prova trovate">
                    {results.slice(0, 6).map((trial) => {
                      const giaInElenco = (rows || []).some((row) => row.trial.id === trial.id);
                      return (
                        <li key={trial.id}>
                          <button
                            type="button"
                            onClick={() => addTrial(trial)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-egw-page-100 focus-visible:bg-egw-page-100 focus-visible:outline-none"
                          >
                            <span className="min-w-0">
                              <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{trial.name}</span>
                              <span className="egw-num egw-ellipsis block font-brand text-[11px] text-egw-ink-62">
                                {joinMeta(`nato il ${formatDateShort(trial.birthDate)}`, trial.categoryLabel, `${trial.trialsCount} ${trial.trialsCount === 1 ? "prova" : "prove"}`)}
                              </span>
                            </span>
                            <DataChip size="sm" tone={giaInElenco ? "blue" : "green"}>
                              {giaInElenco ? "Segna presente" : "Aggiungi"}
                            </DataChip>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 font-brand text-[11.5px] text-egw-ink-62">Nessuna persona in prova con questo nome.</p>
                )
              ) : null}
              {options.canCreate ? (
                <div className="mt-3">
                  <Button variant="text" size="sm" icon={<Plus />} onClick={() => setCreating(true)}>
                    Non c&apos;e ancora: registra una persona nuova
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="font-brand text-[12.5px] font-semibold text-egw-ink">Registrazione rapida</p>
              <p className="mt-0.5 font-brand text-[11.5px] text-egw-ink-62">Tre campi, e la persona e registrata in prova e segnata presente. Il resto si completa dopo dalla sua scheda.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Nome" htmlFor="trial-quick-firstName" required error={formErrors.find((e) => e.field === "firstName")?.message}>
                  <TextInput id="trial-quick-firstName" autoComplete="off" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} autoFocus />
                </Field>
                <Field label="Cognome" htmlFor="trial-quick-lastName" required error={formErrors.find((e) => e.field === "lastName")?.message}>
                  <TextInput id="trial-quick-lastName" autoComplete="off" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} />
                </Field>
                <Field label="Data di nascita" htmlFor="trial-quick-birthDate" required error={formErrors.find((e) => e.field === "birthDate")?.message}>
                  <DateInput id="trial-quick-birthDate" value={form.birthDate} max={todayLocalDateOnly()} onChange={(event) => setForm((current) => ({ ...current, birthDate: event.target.value }))} />
                </Field>
                <Field label="Categoria" htmlFor="trial-quick-category" optional>
                  <SearchableSelect
                    id="trial-quick-category"
                    value={form.categoryId || null}
                    onValueChange={(value) => setForm((current) => ({ ...current, categoryId: value || "" }))}
                    options={options.categoryOptions.map((option) => ({ value: option.id, label: option.label }))}
                    placeholder="Nessuna categoria"
                    allowClear
                  />
                </Field>
              </div>
              {matches.length ? (
                <AlertBlock severity="warning" title="C'e gia una persona in prova con questo nome" className="mt-3">
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {matches.slice(0, 3).map(({ trial, exact }) => (
                      <li key={trial.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="egw-num font-brand text-[12px] text-egw-ink">
                          {trial.name} · nato il {formatDateShort(trial.birthDate)}
                          {exact ? " · stessa data di nascita" : ""}
                        </span>
                        {trial.status === "in_trial" ? (
                          <Button variant="secondary" size="xs" onClick={() => addTrial(trial)}>
                            E lei
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </AlertBlock>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" loading={creatingSaving} onClick={() => void quickCreate()}>
                  Registra e segna presente
                </Button>
                <Button variant="secondary" size="sm" disabled={creatingSaving} onClick={() => setCreating(false)}>
                  Torna alla ricerca
                </Button>
              </div>
            </>
          )}
        </InsetBlock>
      ) : null}
    </section>
  );
});
