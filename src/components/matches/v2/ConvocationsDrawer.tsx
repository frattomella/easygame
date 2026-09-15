"use client";

import * as React from "react";
import { Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/api/client";
import { Drawer } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { IdentityTile } from "@/components/web/primitives/Identity";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Checkbox, ProgressBar, SegmentedControl } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { FieldSizeProvider, TextInput } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import {
  getMedicalCertificateAvailability,
  getMedicalCertificateAvailabilityLabel,
} from "@/lib/medical-certificates";
import { formatDateShort, formatDateTime, formatTime, joinMeta } from "@/lib/web/format";
import { formatMatchLocationLabel } from "@/lib/match-location";
import {
  callupSpec,
  matchStartTime,
  rsvpAnswerSpec,
  rsvpAnswerWord,
  type MatchRecord,
  type RsvpAnswer,
} from "@/components/matches/v2/match-page-model";

/**
 * Le convocazioni in pannello laterale (guideline 09 §9.4 Call-up, §9.7): il
 * cassetto da 480 con la rosa della gara, una casella per atleta — «Convoca:
 * {nome}» — la pillola `CONVOCATO` / `NON CONVOCATO`, l'avviso sul
 * certificato, la risposta della famiglia quando la gara la chiede
 * (`SENZA RISPOSTA` come pillola; «ci sarà» / «non ci sarà» come parole),
 * «Convoca tutti», l'atleta extra cercato fra tutto il club, la riga di
 * avanzamento e il salvataggio nel piede.
 *
 * E la forma V2 di `MatchConvocations` (`src/components/trainer/`), che resta
 * alle schermate dell'allenatore: **stesso contratto** — le stesse righe in
 * ingresso, lo stesso `onSave({matchId, convocatedAthletes,
 * convocationEntries})` con le stesse voci (fuori quota, contesto di
 * appartenenza, disponibilita del certificato) — e stessi avvisi: il toast
 * alla spunta di chi non ha il certificato in regola, e quello dopo il
 * salvataggio con i nomi di chi lo ha mancante o scaduto.
 *
 * Le risposte delle famiglie le legge `GET /api/v1/rsvp?training_id=` — la
 * rotta accetta l'id di qualunque evento (RSVP sulle gare, Wave 5) — e un 403
 * qui e una risposta legittima: la sezione non compare.
 */
export type ConvocationAthlete = {
  id: string;
  name: string;
  avatar?: string;
  jerseyNumber?: string | null;
  matchesPlayed?: number;
  matchesAbsent?: number;
  medicalCertExpiry?: string | null;
  participationContext?: "primary" | "secondary" | "extra";
  participationBadgeLabel?: string | null;
  isExtraCategory?: boolean;
  isManualExtra?: boolean;
  primaryCategoryName?: string | null;
};

export type ConvocationEntry = {
  athleteId: string;
  isExtraCategory?: boolean;
  isManualExtra?: boolean;
  categoryMembershipType?: string | null;
  medicalCertificateAvailability?: string | null;
  medicalCertificateWarning?: string | null;
};

export type ConvocationsSavePayload = {
  matchId: string;
  convocatedAthletes: string[];
  convocationEntries: ConvocationEntry[];
};

type RsvpSummaryPayload = {
  rsvpRequired: boolean;
  deadline: string | null;
  deadlinePassed: boolean;
  totals: { yes: number; no: number; noResponse: number; expected: number };
  athletes: Array<{ athleteId: string; athleteName: string; state: RsvpAnswer; note: string }>;
};

type RowFilter = "all" | "called" | "not_called";

const normalizeId = (value: unknown) => String(value || "").trim();

const entryFor = (athlete: ConvocationAthlete, existing?: ConvocationEntry): ConvocationEntry => {
  const availability = getMedicalCertificateAvailability(athlete.medicalCertExpiry);
  return {
    ...(existing || {}),
    athleteId: normalizeId(athlete.id),
    isExtraCategory:
      existing?.isExtraCategory ?? (athlete.participationContext === "extra" || Boolean(athlete.isExtraCategory)),
    isManualExtra:
      existing?.isManualExtra ?? (athlete.participationContext === "extra" || Boolean(athlete.isManualExtra)),
    categoryMembershipType: existing?.categoryMembershipType || athlete.participationContext || "primary",
    medicalCertificateAvailability: availability,
    medicalCertificateWarning:
      availability !== "valid" ? getMedicalCertificateAvailabilityLabel(availability) : null,
  };
};

const participationTone = (context?: "primary" | "secondary" | "extra") =>
  context === "extra" ? "amber" : context === "secondary" ? "blue" : "green";

export function ConvocationsDrawer({
  open,
  onOpenChange,
  match,
  athletes,
  clubAthletes,
  savedConvocations,
  savedConvocationEntries,
  onSave,
  saving = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: MatchRecord | null;
  athletes: ConvocationAthlete[];
  clubAthletes: ConvocationAthlete[];
  /** La rosa gia convocata, letta dalle righe (P0-6). */
  savedConvocations: string[];
  savedConvocationEntries: ConvocationEntry[];
  onSave: (payload: ConvocationsSavePayload) => void | Promise<void>;
  saving?: boolean;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = React.useState<ConvocationAthlete[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [entries, setEntries] = React.useState<Map<string, ConvocationEntry>>(() => new Map());
  const [dirty, setDirty] = React.useState(false);
  const [filter, setFilter] = React.useState<RowFilter>("all");
  const [query, setQuery] = React.useState("");
  const [rsvp, setRsvp] = React.useState<RsvpSummaryPayload | null>(null);

  const matchId = normalizeId(match?.eventId || match?.id);

  /* La rosa e la selezione ripartono a ogni apertura, dalle righe salvate. */
  React.useEffect(() => {
    if (!open) return;
    const savedIds = new Set(savedConvocations.map(normalizeId).filter(Boolean));
    if (!savedIds.size) {
      for (const entry of savedConvocationEntries) {
        const id = normalizeId(entry?.athleteId);
        if (id) savedIds.add(id);
      }
    }
    const missingSaved = clubAthletes.filter(
      (athlete) => savedIds.has(normalizeId(athlete.id)) && !athletes.some((row) => normalizeId(row.id) === normalizeId(athlete.id)),
    );
    const seen = new Set<string>();
    const nextRows = [...athletes, ...missingSaved].filter((athlete) => {
      const id = normalizeId(athlete.id);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const nextEntries = new Map<string, ConvocationEntry>();
    for (const entry of savedConvocationEntries) {
      const id = normalizeId(entry?.athleteId);
      if (id) nextEntries.set(id, { ...entry, athleteId: id });
    }
    for (const id of savedIds) {
      if (!nextEntries.has(id)) {
        const athlete = nextRows.find((row) => normalizeId(row.id) === id);
        if (athlete) nextEntries.set(id, entryFor(athlete));
      }
    }
    setRows(nextRows);
    setSelected(savedIds);
    setEntries(nextEntries);
    setDirty(false);
    setFilter("all");
    setQuery("");
  }, [open, matchId, athletes, clubAthletes, savedConvocations, savedConvocationEntries]);

  /* Le risposte delle famiglie: un 403 o una gara senza RSVP = niente. */
  React.useEffect(() => {
    if (!open || !matchId) {
      setRsvp(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const response = await apiRequest<RsvpSummaryPayload>(
        `/api/v1/rsvp?training_id=${encodeURIComponent(matchId)}`,
      );
      if (cancelled) return;
      setRsvp(response.error || !response.data || !response.data.rsvpRequired ? null : response.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, matchId]);

  const rsvpByAthlete = React.useMemo(() => {
    const map = new Map<string, RsvpAnswer>();
    for (const row of rsvp?.athletes || []) map.set(normalizeId(row.athleteId), row.state);
    return map;
  }, [rsvp]);

  const warnCertificate = (athlete: ConvocationAthlete) => {
    const availability = getMedicalCertificateAvailability(athlete.medicalCertExpiry);
    if (availability !== "valid") {
      showToast("info", `Attenzione: ${getMedicalCertificateAvailabilityLabel(availability).toLowerCase()}`);
    }
  };

  const setAthleteSelected = (athlete: ConvocationAthlete, next: boolean) => {
    const id = normalizeId(athlete.id);
    if (!id) return;
    setSelected((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
    setEntries((current) => {
      const copy = new Map(current);
      if (next) {
        if (!copy.has(id)) copy.set(id, entryFor(athlete));
      } else {
        copy.delete(id);
      }
      return copy;
    });
    setDirty(true);
    if (next) warnCertificate(athlete);
  };

  const callAll = () => {
    setSelected(new Set(rows.map((row) => normalizeId(row.id))));
    setEntries((current) => {
      const copy = new Map(current);
      for (const row of rows) {
        const id = normalizeId(row.id);
        if (!copy.has(id)) copy.set(id, entryFor(row));
      }
      return copy;
    });
    setDirty(true);
  };

  const addExtra = (athlete: ConvocationAthlete) => {
    const id = normalizeId(athlete.id);
    if (!id || rows.some((row) => normalizeId(row.id) === id)) return;
    setRows((current) => [...current, athlete]);
    setAthleteSelected(athlete, true);
    setQuery("");
  };

  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return clubAthletes
      .filter(
        (athlete) =>
          !rows.some((row) => normalizeId(row.id) === normalizeId(athlete.id)) &&
          athlete.name.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [clubAthletes, query, rows]);

  const called = rows.filter((row) => selected.has(normalizeId(row.id))).length;
  const visibleRows = rows.filter((row) => {
    const isCalled = selected.has(normalizeId(row.id));
    return filter === "all" ? true : filter === "called" ? isCalled : !isCalled;
  });

  const save = async () => {
    if (!match) return;
    const convocatedAthletes = rows
      .map((row) => normalizeId(row.id))
      .filter((id) => selected.has(id));
    const convocationEntries = convocatedAthletes.map((id) => {
      const athlete = rows.find((row) => normalizeId(row.id) === id)!;
      return entryFor(athlete, entries.get(id));
    });
    await onSave({ matchId: normalizeId(match.id), convocatedAthletes, convocationEntries });
    /*
      Il toast con i nomi di chi ha il certificato mancante o scaduto: la
      pagina chiude il cassetto se il salvataggio riesce; se fallisce, le
      modifiche sono ancora da salvare e la guardia resta accesa.
    */
    const flagged = rows
      .filter((row) => convocatedAthletes.includes(normalizeId(row.id)))
      .map((row) => ({ name: row.name, availability: getMedicalCertificateAvailability(row.medicalCertExpiry) }))
      .filter((row) => row.availability === "missing" || row.availability === "expired");
    if (flagged.length > 0) {
      showToast(
        "info",
        flagged.map((row) => `${row.name}: ${getMedicalCertificateAvailabilityLabel(row.availability)}`).join(" · "),
      );
    }
  };

  const start = match ? matchStartTime(match) : "";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={match ? joinMeta("Convocazioni", start ? formatTime(start) : null, match.category) : "Convocazioni"}
      title={match ? (match.opponent ? `vs ${match.opponent}` : match.title) : "Convocazioni"}
      description={
        match
          ? joinMeta(formatDateShort(match.date), formatMatchLocationLabel(match), match.title !== `vs ${match.opponent}` ? match.title : null)
          : undefined
      }
      dirty={dirty}
      locked={saving}
      bodyClassName="px-0 py-0"
      data-test="convocations-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!match}>
            Salva convocazioni <span className="egw-num opacity-80">{called}/{rows.length}</span>
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
                { value: "called", label: "Convocati", count: called },
                { value: "not_called", label: "Non convocati", count: rows.length - called },
              ]}
            />
            <Button variant="text" size="xs" icon={<Check />} onClick={callAll}>
              Convoca tutti
            </Button>
          </div>
          <ProgressBar
            className="mt-3"
            value={called}
            max={Math.max(rows.length, 1)}
            tone={called > 0 ? "green" : "action"}
            label={`${called} di ${rows.length} convocati`}
          />
        </div>

        {match?.notes ? (
          <div className="px-6 pt-4">
            <InsetBlock className="p-3.5">
              <p className="font-brand text-[11px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">Note gara</p>
              <p className="mt-1 whitespace-pre-line font-brand text-[12.5px] text-egw-ink-72">{match.notes}</p>
            </InsetBlock>
          </div>
        ) : null}

        {rsvp ? (
          <div className="px-6 pt-4" data-test="convocations-rsvp">
            <InsetBlock className="p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-brand text-[12.5px] font-semibold text-egw-ink">Risposte delle famiglie</p>
                {rsvp.deadline ? (
                  <p className="font-brand text-[11.5px] text-egw-ink-62">
                    {rsvp.deadlinePassed ? "Conferme chiuse il " : "Conferme aperte fino al "}
                    {formatDateTime(rsvp.deadline)}
                  </p>
                ) : null}
              </div>
              <p className="egw-num mt-1.5 font-brand text-[12px] text-egw-ink-72">
                <span className="font-bold text-egw-green">{rsvp.totals.yes}</span> ci saranno ·{" "}
                <span className="font-bold text-egw-red">{rsvp.totals.no}</span> non ci saranno ·{" "}
                <span className="font-bold text-egw-amber-ink">{rsvp.totals.noResponse}</span> senza risposta
              </p>
            </InsetBlock>
          </div>
        ) : null}

        <ul className="divide-y divide-egw-rule pt-2" aria-label="Rosa convocabile">
          {visibleRows.length === 0 ? (
            <li className="px-6 py-6 text-center font-brand text-[12.5px] text-egw-ink-62">
              {rows.length === 0 ? "Nessun atleta convocabile per questa gara." : "Nessun atleta in questo filtro."}
            </li>
          ) : null}
          {visibleRows.map((athlete) => (
            <AthleteRow
              key={normalizeId(athlete.id)}
              athlete={athlete}
              convocated={selected.has(normalizeId(athlete.id))}
              answer={rsvp ? rsvpByAthlete.get(normalizeId(athlete.id)) ?? null : undefined}
              onToggle={(next) => setAthleteSelected(athlete, next)}
            />
          ))}
        </ul>

        <div className="px-6 pb-6 pt-4">
          <InsetBlock className="p-3.5">
            <p className="font-brand text-[12.5px] font-semibold text-egw-ink">Aggiungi atleta extra</p>
            <p className="mt-0.5 font-brand text-[11.5px] text-egw-ink-62">
              Cerca tra tutti gli atleti del club e aggiungi solo chi non è già in lista.
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
                    <li key={`extra-${normalizeId(athlete.id)}`}>
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

function AthleteRow({
  athlete,
  convocated,
  answer,
  onToggle,
}: {
  athlete: ConvocationAthlete;
  convocated: boolean;
  /** `undefined` = la gara non chiede conferme; `null` = nessuna riga per questo atleta. */
  answer: RsvpAnswer | null | undefined;
  onToggle: (next: boolean) => void;
}) {
  const certificate = getMedicalCertificateAvailability(athlete.medicalCertExpiry);
  const certificateWarning = certificate !== "valid" ? getMedicalCertificateAvailabilityLabel(certificate) : null;
  const answerSpec = convocated ? rsvpAnswerSpec(answer) : null;
  const answerWord = convocated ? rsvpAnswerWord(answer) : null;
  const checkboxId = `convoca-${normalizeId(athlete.id)}`;
  return (
    <li className="px-6 py-2.5">
      <div className="flex items-center gap-3">
        <Checkbox
          id={checkboxId}
          aria-label={`Convoca: ${athlete.name}`}
          checked={convocated}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <IdentityTile number={athlete.jerseyNumber} name={athlete.name} size={36} />
        <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
          <span className="egw-ellipsis block font-brand text-[13px] font-semibold text-egw-ink">{athlete.name}</span>
          <span
            className={cn(
              "egw-ellipsis block font-brand text-[11.5px]",
              certificateWarning ? "text-egw-amber-ink" : "text-egw-ink-62",
            )}
          >
            {joinMeta(
              certificateWarning,
              answerWord,
              athlete.participationContext && athlete.participationContext !== "primary" && athlete.primaryCategoryName
                ? `Categoria primaria: ${athlete.primaryCategoryName}`
                : null,
            ) || (convocated ? "Convocato" : "Non convocato")}
          </span>
        </label>
        {athlete.participationBadgeLabel ? (
          <DataChip size="sm" tone={participationTone(athlete.participationContext)} className="hidden sm:inline-flex">
            {athlete.participationBadgeLabel}
          </DataChip>
        ) : null}
        {answerSpec ? <StatusPill status={answerSpec} size="sm" /> : null}
        <StatusPill status={callupSpec(convocated)} size="sm" className="hidden sm:inline-flex" />
      </div>
    </li>
  );
}
