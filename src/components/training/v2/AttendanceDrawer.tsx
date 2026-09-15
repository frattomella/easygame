"use client";

import * as React from "react";
import { Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { IdentityTile } from "@/components/web/primitives/Identity";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { ProgressBar, SegmentedControl } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { FieldSizeProvider, TextInput } from "@/components/web/forms/Field";
import { TrainingRsvpSummary } from "@/components/trainer/TrainingRsvpSummary";
import {
  getMedicalCertificateAvailability,
  getMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import { formatDateShort, formatTime, joinMeta } from "@/lib/web/format";
import type { TrainingSession } from "@/components/training/v2/training-page-model";

/**
 * Le presenze in pannello laterale (mockup P4, guideline 09 §9.7): il cassetto
 * da 480 con l'elenco della squadra, un controllo a tre stati per atleta —
 * `da segnare → presente → assente` — «Segna tutti presenti», la riga di
 * avanzamento e il salvataggio nel piede.
 *
 * E la forma V2 di `AttendanceSheet` (`src/components/trainer/`), che resta
 * alle schermate dell'allenatore: **stesso contratto** — le stesse righe in
 * ingresso, lo stesso `onSave({trainingId, attendance})` — e stesse capacita:
 * le risposte delle famiglie sopra l'appello (`TrainingRsvpSummary`),
 * l'atleta extra cercato fra tutto il club, l'avviso sul certificato, la
 * categoria primaria di chi non e della squadra, la nota per atleta.
 *
 * Chi non e stato segnato si salva come assente: e cio che la V1 faceva con
 * la sua casella spenta, e l'archivio conosce due stati soli. La differenza e
 * che qui si vede **chi manca all'appello** prima di premere Salva.
 */
export type AttendanceDrawerAthlete = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  jerseyNumber?: string | null;
  avatar?: string;
  present?: boolean;
  /** Vero se per questo atleta esiste gia una voce di appello. */
  recorded?: boolean;
  notes?: string;
  medicalCertExpiry?: string | null;
  participationContext?: "primary" | "secondary" | "extra";
  participationBadgeLabel?: string | null;
  isExtraCategory?: boolean;
  isManualExtra?: boolean;
  primaryCategoryName?: string | null;
};

export type AttendanceSavePayload = {
  trainingId: string;
  attendance: Array<{
    athleteId: string;
    present: boolean;
    notes: string;
    isExtraCategory?: boolean;
    isManualExtra?: boolean;
    categoryMembershipType?: string | null;
  }>;
};

type Mark = "present" | "absent" | null;

type RowState = {
  athlete: AttendanceDrawerAthlete;
  mark: Mark;
  notes: string;
  noteOpen: boolean;
};

const initialMark = (athlete: AttendanceDrawerAthlete): Mark => {
  if (athlete.recorded) return athlete.present ? "present" : "absent";
  return athlete.present ? "present" : null;
};

const nextMark = (mark: Mark): Mark => (mark === null ? "present" : mark === "present" ? "absent" : null);

const toRows = (athletes: AttendanceDrawerAthlete[]): RowState[] =>
  athletes.map((athlete) => ({
    athlete,
    mark: initialMark(athlete),
    notes: athlete.notes || "",
    noteOpen: Boolean(athlete.notes),
  }));

type RowFilter = "all" | "present" | "absent";

export function AttendanceDrawer({
  open,
  onOpenChange,
  training,
  athletes,
  clubAthletes,
  onSave,
  saving = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  training: TrainingSession | null;
  athletes: AttendanceDrawerAthlete[];
  clubAthletes: AttendanceDrawerAthlete[];
  onSave: (payload: AttendanceSavePayload) => void | Promise<void>;
  saving?: boolean;
}) {
  const [rows, setRows] = React.useState<RowState[]>(() => toRows(athletes));
  const [dirty, setDirty] = React.useState(false);
  const [filter, setFilter] = React.useState<RowFilter>("all");
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    setRows(toRows(athletes));
    setDirty(false);
    setFilter("all");
    setQuery("");
  }, [athletes]);

  const update = (updater: (current: RowState[]) => RowState[]) => {
    setRows((current) => updater(current));
    setDirty(true);
  };

  const cycle = (athleteId: string) =>
    update((current) => current.map((row) => (row.athlete.id === athleteId ? { ...row, mark: nextMark(row.mark) } : row)));

  const setNotes = (athleteId: string, notes: string) =>
    update((current) => current.map((row) => (row.athlete.id === athleteId ? { ...row, notes } : row)));

  const toggleNote = (athleteId: string) =>
    setRows((current) => current.map((row) => (row.athlete.id === athleteId ? { ...row, noteOpen: !row.noteOpen } : row)));

  const markAllPresent = () => update((current) => current.map((row) => ({ ...row, mark: "present" })));

  const addExtra = (athlete: AttendanceDrawerAthlete) => {
    if (rows.some((row) => row.athlete.id === athlete.id)) return;
    update((current) => [...current, { athlete: { ...athlete, present: true }, mark: "present", notes: "", noteOpen: false }]);
    setQuery("");
  };

  const present = rows.filter((row) => row.mark === "present").length;
  const absent = rows.filter((row) => row.mark === "absent").length;
  const marked = present + absent;

  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return clubAthletes
      .filter((athlete) => !rows.some((row) => row.athlete.id === athlete.id) && athlete.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [clubAthletes, query, rows]);

  const visibleRows = rows.filter((row) => (filter === "all" ? true : filter === "present" ? row.mark === "present" : row.mark === "absent"));

  const save = async () => {
    if (!training) return;
    await onSave({
      trainingId: training.id,
      attendance: rows.map((row) => ({
        athleteId: row.athlete.id,
        present: row.mark === "present",
        notes: row.notes,
        isExtraCategory: Boolean(row.athlete.isExtraCategory),
        isManualExtra: Boolean(row.athlete.isManualExtra),
        categoryMembershipType: row.athlete.participationContext || "primary",
      })),
    });
    /*
      Il cassetto non si dichiara pulito da solo: se il salvataggio riesce la
      pagina lo chiude, se fallisce le modifiche sono ancora da salvare e la
      guardia deve restare accesa.
    */
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={training ? joinMeta("Presenze", training.time ? formatTime(training.time) : null, training.category) : "Presenze"}
      title={training?.title ?? "Presenze"}
      description={training ? joinMeta(formatDateShort(training.date), training.location, training.trainer) : undefined}
      dirty={dirty}
      locked={saving}
      bodyClassName="px-0 py-0"
      data-test="attendance-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!training}>
            Salva presenze <span className="egw-num opacity-80">{present}/{rows.length}</span>
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="border-b border-egw-hairline bg-white px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl<RowFilter>
              aria-label="Filtra l'elenco"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Tutti", count: rows.length },
                { value: "present", label: "Presenti", count: present },
                { value: "absent", label: "Assenti", count: absent },
              ]}
            />
            <Button variant="text" size="xs" icon={<Check />} onClick={markAllPresent}>
              Segna tutti presenti
            </Button>
          </div>
          <ProgressBar
            className="mt-3"
            value={marked}
            max={Math.max(rows.length, 1)}
            tone={marked >= rows.length && rows.length > 0 ? "green" : "action"}
            label={`${marked} di ${rows.length} segnati`}
          />
        </div>

        {training ? (
          <div className="px-6 pt-4 [&>div]:mb-0">
            <TrainingRsvpSummary trainingId={training.id} />
          </div>
        ) : null}

        <ul className="divide-y divide-egw-rule" aria-label="Elenco presenze">
          {visibleRows.length === 0 ? (
            <li className="px-6 py-6 text-center font-brand text-[12.5px] text-egw-ink-62">
              {rows.length === 0 ? "Nessun atleta in squadra per questa seduta." : "Nessun atleta in questo filtro."}
            </li>
          ) : null}
          {visibleRows.map((row) => (
            <AthleteRow
              key={row.athlete.id}
              row={row}
              onCycle={() => cycle(row.athlete.id)}
              onToggleNote={() => toggleNote(row.athlete.id)}
              onNotes={(notes) => setNotes(row.athlete.id, notes)}
            />
          ))}
        </ul>

        <div className="px-6 pb-6 pt-4">
          <InsetBlock className="p-3.5">
            <p className="font-brand text-[12.5px] font-semibold text-egw-ink">Aggiungi atleta extra</p>
            <p className="mt-0.5 font-brand text-[11.5px] text-egw-ink-62">
              Cerca tra tutti gli atleti del club ed evita duplicati nella lista presenze.
            </p>
            <TextInput
              className="mt-2.5"
              leading={<Search />}
              placeholder="Cerca atleta del club…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Cerca atleta del club"
            />
            {query.trim() ? (
              suggestions.length ? (
                <ul className="mt-2 divide-y divide-egw-rule rounded-egw-field border border-egw-hairline bg-white">
                  {suggestions.map((athlete) => (
                    <li key={`extra-${athlete.id}`}>
                      <button
                        type="button"
                        onClick={() => addExtra(athlete)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-egw-page-100 focus-visible:outline-none focus-visible:bg-egw-page-100"
                      >
                        <span className="min-w-0">
                          <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{athlete.name}</span>
                          {athlete.primaryCategoryName ? (
                            <span className="egw-ellipsis block font-brand text-[11px] text-egw-ink-62">
                              Categoria primaria: {athlete.primaryCategoryName}
                            </span>
                          ) : null}
                        </span>
                        <DataChip size="sm" tone={participationTone(athlete.participationContext)}>
                          {athlete.participationBadgeLabel || "Aggiungi"}
                        </DataChip>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 font-brand text-[11.5px] text-egw-ink-62">Nessun atleta disponibile con questo filtro.</p>
              )
            ) : null}
          </InsetBlock>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}

const participationTone = (context?: "primary" | "secondary" | "extra") =>
  context === "extra" ? "amber" : context === "secondary" ? "blue" : "green";

const markLabel = (mark: Mark) => (mark === "present" ? "Presente" : mark === "absent" ? "Assente" : "Da segnare");

function AthleteRow({
  row,
  onCycle,
  onToggleNote,
  onNotes,
}: {
  row: RowState;
  onCycle: () => void;
  onToggleNote: () => void;
  onNotes: (notes: string) => void;
}) {
  const { athlete, mark } = row;
  const certificate = getMedicalCertificateAvailability(athlete.medicalCertExpiry);
  const certificateWarning = certificate !== "valid" ? getMedicalCertificateAvailabilityLabel(certificate) : null;
  return (
    <li className="px-6 py-2.5">
      <div className="flex items-center gap-3">
        <IdentityTile number={athlete.jerseyNumber} name={athlete.name} size={36} />
        <button
          type="button"
          onClick={onCycle}
          className="min-w-0 flex-1 rounded-egw-chip text-left focus-visible:outline-none focus-visible:shadow-egw-focus"
          aria-label={`${athlete.name}: ${markLabel(mark)}. Cambia stato`}
        >
          <span className="egw-ellipsis block font-brand text-[13px] font-semibold text-egw-ink">{athlete.name}</span>
          <span
            className={cn(
              "egw-ellipsis block font-brand text-[11.5px]",
              mark === "present" && "text-egw-green",
              mark === "absent" && "text-egw-red",
              mark === null && "text-egw-ink-62",
            )}
          >
            {joinMeta(
              markLabel(mark),
              certificateWarning,
              athlete.participationContext && athlete.participationContext !== "primary" && athlete.primaryCategoryName
                ? `Categoria primaria: ${athlete.primaryCategoryName}`
                : null,
            )}
          </span>
        </button>
        {athlete.participationBadgeLabel ? (
          <DataChip size="sm" tone={participationTone(athlete.participationContext)} className="hidden sm:inline-flex">
            {athlete.participationBadgeLabel}
          </DataChip>
        ) : null}
        <Button variant="text" size="xs" onClick={onToggleNote} aria-expanded={row.noteOpen} aria-label={`Nota per ${athlete.name}`}>
          Nota
        </Button>
        <MarkControl mark={mark} name={athlete.name} onCycle={onCycle} />
      </div>
      {row.noteOpen ? (
        <div className="mt-2 pl-[48px]">
          <TextInput
            placeholder="Note per questo atleta"
            value={row.notes}
            onChange={(event) => onNotes(event.target.value)}
            aria-label={`Note per ${athlete.name}`}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * Il controllo a tre stati: un anello vuoto (da segnare), verde con la spunta
 * (presente), rosso con la croce (assente). E una casella con un nome —
 * `Presente: {nome}` — perche qui si segnano le presenze di un minore, e chi
 * legge con lo schermo deve sapere di chi e.
 */
function MarkControl({ mark, name, onCycle }: { mark: Mark; name: string; onCycle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mark === "present" ? true : mark === "absent" ? false : "mixed"}
      aria-label={`Presente: ${name}`}
      onClick={onCycle}
      className={cn(
        "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-egw-pill border-[1.5px] transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus",
        mark === "present" && "border-egw-green bg-egw-tint-green text-egw-green",
        mark === "absent" && "border-egw-red bg-egw-tint-red text-egw-red",
        mark === null && "border-[rgba(11,26,58,.2)] bg-white text-transparent hover:border-[rgba(37,99,235,.32)]",
      )}
    >
      {mark === "present" ? <Check className="h-4 w-4" aria-hidden /> : mark === "absent" ? <X className="h-4 w-4" aria-hidden /> : null}
    </button>
  );
}
