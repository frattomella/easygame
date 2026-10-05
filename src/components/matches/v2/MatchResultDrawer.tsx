"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl, Skeleton } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { Field, FormGrid, SearchableSelect, Select, TextInput } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import {
  getSportAdapter,
  normalizePeriodScores,
  resultFromPeriods,
  type SportAdapter,
} from "@/lib/sports/adapters";
import { sportsApi, type ClubTeamDto, type CompetitionDto, type OpponentDto } from "@/lib/sports/client";
import { isHomeMatch, type MatchRecord } from "@/components/matches/v2/match-page-model";
import {
  convocatedAthleteIds,
  loadMatchEventDetail,
  matchEventKey,
  parseScoreInput,
  snapshotFromEventRow,
  type MatchEventRow,
  type MatchResultSnapshot,
  type MatchResultStatus,
} from "@/components/matches/v2/match-result-model";

/**
 * **Il risultato di una gara** (ADR-0200 §8): squadra, competizione,
 * avversario e giornata; il punteggio secondo casa e trasferta con i
 * parziali dello sport; le statistiche dei convocati.
 *
 * Scrive solo dalle due porte del dominio degli eventi: `sport-details` per i
 * dettagli sportivi e `result` per punteggio, parziali e statistiche, con la
 * versione della riga. I controlli veri — parziali che non tornano, pareggio
 * dove non esiste, atleti fuori dal club — li fa il server, e il suo
 * messaggio si mostra com'e.
 */

const NONE = "__none__";

type PeriodDraft = { label: string; home: string; away: string };

type Draft = {
  teamId: string;
  competitionId: string;
  opponentId: string;
  roundLabel: string;
  homeScore: string;
  awayScore: string;
  status: MatchResultStatus;
  periods: PeriodDraft[];
  stats: Record<string, Record<string, string>>;
};

type Loaded = {
  row: MatchEventRow;
  convocated: string[];
  teams: ClubTeamDto[];
  competitions: CompetitionDto[];
  opponents: OpponentDto[];
  /** Gli atleti che avevano gia statistiche registrate. */
  statsAthleteIds: string[];
};

const scoreText = (value: unknown) => (value === null || value === undefined || value === "" ? "" : String(value));

const defaultPeriods = (adapter: SportAdapter): PeriodDraft[] =>
  Array.from({ length: adapter.defaultPeriods }, (_, index) => ({
    label: adapter.periodName(index + 1),
    home: "",
    away: "",
  }));

const periodsAreEmpty = (periods: readonly PeriodDraft[]) => periods.every((period) => !period.home.trim() && !period.away.trim());

const toPeriodInput = (periods: readonly PeriodDraft[]) =>
  periods.map((period) => ({ label: period.label, home: parseScoreInput(period.home), away: parseScoreInput(period.away) }));

const athleteJersey = (athlete: Record<string, any> | undefined) =>
  String(athlete?.jersey_number ?? athlete?.jerseyNumber ?? athlete?.data?.jerseyNumber ?? athlete?.data?.jersey_number ?? "").trim();

export type MatchResultDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: MatchRecord | null;
  /** Il nome del club: etichetta del punteggio «nostro». */
  clubName: string;
  /** Lo sport del club (`settings.sports[0]`); la squadra lo sovrascrive. */
  clubSport: string | null;
  /** Gli atleti del club, per dare un nome ai convocati. */
  athletes: readonly Record<string, any>[];
  /** `events.manage`: solo per la presentazione, il server decide. */
  canManage: boolean;
  onSaved: (eventKey: string, snapshot: MatchResultSnapshot) => void;
};

export function MatchResultDrawer({
  open,
  onOpenChange,
  match,
  clubName,
  clubSport,
  athletes,
  canManage,
  onSaved,
}: MatchResultDrawerProps) {
  const { showToast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [initial, setInitial] = React.useState<string>("");
  const [version, setVersion] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [statsOpen, setStatsOpen] = React.useState(false);
  const [newOpponentOpen, setNewOpponentOpen] = React.useState(false);
  const [newOpponentName, setNewOpponentName] = React.useState("");
  const [creatingOpponent, setCreatingOpponent] = React.useState(false);
  const [reloadToken, setReloadToken] = React.useState(0);

  const eventKey = match ? matchEventKey(match) : "";

  React.useEffect(() => {
    if (!open || !eventKey) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setLoaded(null);
    setDraft(null);
    setNewOpponentOpen(false);
    setNewOpponentName("");
    void (async () => {
      try {
        const [detail, teams, competitions, opponents, stats] = await Promise.all([
          loadMatchEventDetail(eventKey),
          sportsApi.teams(),
          sportsApi.competitions(),
          sportsApi.opponents(),
          sportsApi.matchStats(eventKey),
        ]);
        if (cancelled) return;
        const firstError = [teams, competitions, opponents, stats].find((response) => response.error)?.error;
        if (firstError) throw new Error(firstError.message);

        const row = detail.row;
        const teamList = Array.isArray(teams.data) ? teams.data : [];
        const team = teamList.find((candidate) => candidate.id === row.team_id);
        const adapter = getSportAdapter(team?.sport || clubSport);
        const storedPeriods = normalizePeriodScores(row.period_scores, adapter);
        const statRows = Array.isArray(stats.data) ? stats.data : [];
        const statsDraft: Draft["stats"] = {};
        for (const entry of statRows) {
          const athleteId = String(entry?.athlete_id || "");
          if (!athleteId) continue;
          statsDraft[athleteId] = Object.fromEntries(
            Object.entries(entry.stats || {}).map(([key, value]) => [key, scoreText(value)]),
          );
        }
        const nextDraft: Draft = {
          teamId: row.team_id || "",
          competitionId: row.competition_id || "",
          opponentId: row.opponent_id || "",
          roundLabel: row.round_label || "",
          homeScore: scoreText(row.home_score),
          awayScore: scoreText(row.away_score),
          status: row.result_status === "provisional" ? "provisional" : "final",
          periods: storedPeriods.length
            ? storedPeriods.map((period) => ({ label: period.label, home: scoreText(period.home), away: scoreText(period.away) }))
            : defaultPeriods(adapter),
          stats: statsDraft,
        };
        setLoaded({
          row,
          convocated: convocatedAthleteIds(detail.participants),
          teams: teamList,
          competitions: Array.isArray(competitions.data) ? competitions.data : [],
          opponents: Array.isArray(opponents.data) ? opponents.data : [],
          statsAthleteIds: Object.keys(statsDraft),
        });
        setDraft(nextDraft);
        setInitial(JSON.stringify(nextDraft));
        setVersion(typeof row.version === "number" ? row.version : null);
        setStatsOpen(statRows.length > 0);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Impossibile leggere la gara");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, eventKey, clubSport, reloadToken]);

  const team = loaded?.teams.find((candidate) => candidate.id === draft?.teamId) || null;
  const adapter = React.useMemo(() => getSportAdapter(team?.sport || clubSport), [team?.sport, clubSport]);

  /* Cambiare squadra puo cambiare sport: i parziali ancora vuoti prendono i nomi giusti. */
  React.useEffect(() => {
    setDraft((current) => {
      if (!current || !periodsAreEmpty(current.periods)) return current;
      const next = defaultPeriods(adapter);
      if (JSON.stringify(next) === JSON.stringify(current.periods)) return current;
      return { ...current, periods: next };
    });
  }, [adapter]);

  const update = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current));

  const home = match ? isHomeMatch(match) : true;
  const opponentRecord = loaded?.opponents.find((candidate) => candidate.id === draft?.opponentId) || null;
  const opponentName = opponentRecord?.name || match?.opponent || "Avversario";
  const homeName = home ? clubName : opponentName;
  const awayName = home ? opponentName : clubName;

  const periodScores = React.useMemo(
    () => normalizePeriodScores(draft ? toPeriodInput(draft.periods) : [], adapter),
    [draft, adapter],
  );
  const derived = React.useMemo(() => resultFromPeriods(periodScores, adapter), [periodScores, adapter]);
  const homeValue = draft ? parseScoreInput(draft.homeScore) : null;
  const awayValue = draft ? parseScoreInput(draft.awayScore) : null;
  const derivedDiffers = Boolean(derived && (derived.home !== homeValue || derived.away !== awayValue));
  const drawNotAllowed =
    !adapter.allowsDraw && draft?.status === "final" && homeValue !== null && homeValue === awayValue;

  const statAthletes = React.useMemo(() => {
    if (!loaded) return [];
    const ids = Array.from(new Set([...loaded.convocated, ...loaded.statsAthleteIds]));
    const byId = new Map(athletes.map((athlete) => [String(athlete?.id || ""), athlete]));
    return ids
      .map((id) => {
        const athlete = byId.get(id);
        return {
          id,
          name: (athlete ? getAthleteDisplayName(athlete) : "") || "Atleta",
          jersey: athleteJersey(athlete),
          convocated: loaded.convocated.includes(id),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  }, [loaded, athletes]);

  const dirty = Boolean(draft && initial && JSON.stringify(draft) !== initial);
  const hadResult = Boolean(loaded && (loaded.row.home_score !== null && loaded.row.home_score !== undefined));
  const disabled = !canManage || saving;

  const sportDetailsChanged = (() => {
    if (!draft || !loaded) return false;
    const row = loaded.row;
    return (
      draft.teamId !== (row.team_id || "") ||
      draft.competitionId !== (row.competition_id || "") ||
      draft.opponentId !== (row.opponent_id || "") ||
      draft.roundLabel.trim() !== (row.round_label || "").trim()
    );
  })();

  const buildPlayerStats = (current: Draft) => {
    const entries: Array<{ athleteId: string; stats: Record<string, number> }> = [];
    for (const athlete of statAthletes) {
      const values = current.stats[athlete.id] || {};
      const stats: Record<string, number> = {};
      for (const stat of adapter.stats) {
        const n = parseScoreInput(values[stat.key] || "");
        if (n !== null) stats[stat.key] = n;
      }
      const hadBefore = loaded?.statsAthleteIds.includes(athlete.id);
      if (Object.keys(stats).length || hadBefore) entries.push({ athleteId: athlete.id, stats });
    }
    return entries;
  };

  const resultTouched = (current: Draft) =>
    Boolean(
      current.homeScore.trim() ||
        current.awayScore.trim() ||
        !periodsAreEmpty(current.periods) ||
        Object.values(current.stats).some((values) => Object.values(values).some((value) => value.trim())),
    );

  const handleSave = async () => {
    if (!draft || !loaded || !eventKey || saving) return;
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    setSaving(true);
    setSaveError(null);
    let currentVersion = version;
    let savedRow: MatchEventRow | null = null;
    try {
      if (sportDetailsChanged) {
        const response = await sportsApi.saveMatchSportDetails(eventKey, {
          teamId: draft.teamId || null,
          competitionId: draft.competitionId || null,
          opponentId: draft.opponentId || null,
          roundLabel: draft.roundLabel.trim() || null,
          expectedVersion: currentVersion ?? undefined,
        });
        if (response.error) throw new Error(response.error.message);
        savedRow = (response.data as MatchEventRow) || null;
        if (typeof savedRow?.version === "number") {
          currentVersion = savedRow.version;
          setVersion(savedRow.version);
        }
        setLoaded((current) => (current && savedRow ? { ...current, row: { ...current.row, ...savedRow } } : current));
      }

      if (resultTouched(draft) || hadResult) {
        const response = await sportsApi.saveMatchResult(eventKey, {
          homeScore: parseScoreInput(draft.homeScore),
          awayScore: parseScoreInput(draft.awayScore),
          status: draft.status,
          periods: toPeriodInput(draft.periods),
          playerStats: buildPlayerStats(draft),
          expectedVersion: currentVersion ?? undefined,
        });
        if (response.error) throw new Error(response.error.message);
        savedRow = (response.data as MatchEventRow) || savedRow;
      }

      if (!savedRow) {
        showToast("info", "Nessuna modifica da salvare");
        return;
      }
      const snapshot = snapshotFromEventRow(savedRow);
      onSaved(eventKey, snapshot);
      showToast(
        "success",
        snapshot.homeScore !== null && snapshot.awayScore !== null
          ? `Risultato salvato · ${snapshot.homeScore}-${snapshot.awayScore}`
          : "Dettagli della gara salvati",
      );
      setInitial(JSON.stringify(draft));
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossibile salvare il risultato";
      setSaveError(message);
      showToast("error", message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!eventKey || saving) return;
    const ok = await confirm({
      title: "Togliere il risultato di questa gara?",
      description: "Si azzerano punteggio, parziali e statistiche dei giocatori. Squadra, competizione e avversario restano.",
      confirmLabel: "Togli il risultato",
      tone: "danger",
      consequences: [
        "Il punteggio e i parziali non compaiono più, nemmeno sul sito.",
        "Le statistiche individuali di questa gara si cancellano.",
      ],
    });
    if (!ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await sportsApi.saveMatchResult(eventKey, {
        clear: true,
        homeScore: null,
        awayScore: null,
        status: "provisional",
        periods: [],
        expectedVersion: version ?? undefined,
      });
      if (response.error) throw new Error(response.error.message);
      onSaved(eventKey, snapshotFromEventRow((response.data as MatchEventRow) || null));
      showToast("success", "Risultato tolto");
      setInitial("");
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossibile togliere il risultato";
      setSaveError(message);
      showToast("error", message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOpponent = async () => {
    const name = newOpponentName.trim();
    if (!name || creatingOpponent) return;
    setCreatingOpponent(true);
    const response = await sportsApi.saveOpponent({ name });
    setCreatingOpponent(false);
    if (response.error || !response.data) {
      showToast("error", response.error?.message || "Impossibile creare l'avversario");
      return;
    }
    const created = response.data;
    setLoaded((current) =>
      current
        ? { ...current, opponents: [...current.opponents, created].sort((a, b) => a.name.localeCompare(b.name, "it")) }
        : current,
    );
    update({ opponentId: created.id });
    setNewOpponentOpen(false);
    setNewOpponentName("");
    showToast("success", `Avversario «${created.name}» aggiunto`);
  };

  const setPeriod = (index: number, patch: Partial<PeriodDraft>) =>
    setDraft((current) =>
      current
        ? { ...current, periods: current.periods.map((period, position) => (position === index ? { ...period, ...patch } : period)) }
        : current,
    );

  const setStat = (athleteId: string, key: string, value: string) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            stats: { ...current.stats, [athleteId]: { ...(current.stats[athleteId] || {}), [key]: value } },
          }
        : current,
    );

  const teamOptions = [
    { value: NONE, label: "Nessuna squadra" },
    ...(loaded?.teams || [])
      .filter((candidate) => candidate.active || candidate.id === draft?.teamId)
      .map((candidate) => ({ value: candidate.id, label: candidate.name })),
  ];
  const competitionOptions = [
    { value: NONE, label: "Nessuna competizione" },
    ...(loaded?.competitions || [])
      .filter((candidate) => candidate.active || candidate.id === draft?.competitionId)
      .map((candidate) => ({ value: candidate.id, label: candidate.name })),
  ];
  const opponentOptions = (loaded?.opponents || []).map((candidate) => ({
    value: candidate.id,
    label: candidate.city ? `${candidate.name} (${candidate.city})` : candidate.name,
  }));

  const title = match ? (match.opponent ? `Risultato · vs ${match.opponent}` : `Risultato · ${match.title}`) : "Risultato";

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Gara"
      title={title}
      description={home ? "Gara in casa: il punteggio del club è quello di casa." : "Gara in trasferta: il punteggio del club è quello in trasferta."}
      dirty={dirty && !saving}
      locked={saving}
      footer={
        draft ? (
          <>
            {canManage ? (
              <Button variant="primary" onClick={() => void handleSave()} loading={saving} disabled={disabled}>
                Salva
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
              {canManage ? "Annulla" : "Chiudi"}
            </Button>
            {canManage && hadResult ? (
              <Button
                variant="danger"
                className="sm:ml-auto"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => void handleClear()}
                disabled={saving}
              >
                Togli il risultato
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Caricamento della gara">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-[46px] w-full" />
          <Skeleton className="h-[46px] w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : loadError ? (
        <AlertBlock
          severity="danger"
          title="Non è stato possibile aprire la gara"
          actions={
            <Button variant="secondary" size="sm" onClick={() => setReloadToken((value) => value + 1)}>
              Riprova
            </Button>
          }
        >
          {loadError}
        </AlertBlock>
      ) : draft && loaded ? (
        <>
          {saveError ? (
            <AlertBlock severity="danger" title="Il salvataggio non è riuscito" className="mb-5">
              {saveError}
            </AlertBlock>
          ) : null}
          {!canManage ? (
            <InfoCard className="mb-5">Il risultato lo registra chi gestisce il calendario delle gare: qui puoi solo consultarlo.</InfoCard>
          ) : null}

          <DrawerSection eyebrow="Dettagli sportivi">
            <FormGrid>
              <Field label="Squadra" htmlFor="match-result-team" helper="La squadra stabile del club che gioca la gara.">
                <Select
                  id="match-result-team"
                  value={draft.teamId || NONE}
                  onValueChange={(value) => update({ teamId: value === NONE ? "" : value })}
                  options={teamOptions}
                  disabled={disabled}
                />
              </Field>
              <Field label="Competizione" htmlFor="match-result-competition">
                <Select
                  id="match-result-competition"
                  value={draft.competitionId || NONE}
                  onValueChange={(value) => update({ competitionId: value === NONE ? "" : value })}
                  options={competitionOptions}
                  disabled={disabled}
                />
              </Field>
              <Field
                label="Avversario"
                htmlFor="match-result-opponent"
                helper={
                  !draft.opponentId && match?.opponent
                    ? `Nella gara è scritto «${match.opponent}»: sceglilo dall'elenco per collegarlo all'anagrafica.`
                    : "Scegliendolo dall'elenco, il nome della gara si allinea all'anagrafica."
                }
              >
                <SearchableSelect
                  id="match-result-opponent"
                  value={draft.opponentId || null}
                  onValueChange={(value) => update({ opponentId: value || "" })}
                  options={opponentOptions}
                  placeholder={match?.opponent ? `${match.opponent} (testo libero)` : "Scegli l'avversario"}
                  searchPlaceholder="Cerca un avversario"
                  emptyLabel="Nessun avversario in anagrafica"
                  allowClear
                  disabled={disabled}
                />
              </Field>
              <Field label="Giornata o turno" htmlFor="match-result-round" optional>
                <TextInput
                  id="match-result-round"
                  value={draft.roundLabel}
                  onChange={(event) => update({ roundLabel: event.target.value.slice(0, 60) })}
                  placeholder="Giornata 12"
                  disabled={disabled}
                />
              </Field>
            </FormGrid>
            {canManage ? (
              newOpponentOpen ? (
                <InsetBlock className="mt-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <Field label="Nome del nuovo avversario" htmlFor="match-result-new-opponent" className="flex-1">
                      <TextInput
                        id="match-result-new-opponent"
                        value={newOpponentName}
                        onChange={(event) => setNewOpponentName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleCreateOpponent();
                          }
                        }}
                        placeholder={match?.opponent || "Basket Latina"}
                        disabled={creatingOpponent}
                      />
                    </Field>
                    <div className="flex gap-2">
                      <Button
                        variant="neutral"
                        onClick={() => void handleCreateOpponent()}
                        loading={creatingOpponent}
                        disabled={!newOpponentName.trim()}
                      >
                        Crea
                      </Button>
                      <Button variant="text" onClick={() => setNewOpponentOpen(false)} disabled={creatingOpponent}>
                        Annulla
                      </Button>
                    </div>
                  </div>
                </InsetBlock>
              ) : (
                <Button
                  variant="text"
                  size="sm"
                  className="mt-2"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setNewOpponentName(draft.opponentId ? "" : match?.opponent || "");
                    setNewOpponentOpen(true);
                  }}
                  disabled={disabled}
                >
                  Nuovo avversario
                </Button>
              )
            ) : null}
          </DrawerSection>

          <DrawerSection eyebrow="Risultato">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={`${homeName} (casa)`} htmlFor="match-result-home">
                <TextInput
                  id="match-result-home"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  numeric
                  value={draft.homeScore}
                  onChange={(event) => update({ homeScore: event.target.value })}
                  disabled={disabled}
                />
              </Field>
              <Field label={`${awayName} (trasferta)`} htmlFor="match-result-away">
                <TextInput
                  id="match-result-away"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={999}
                  numeric
                  value={draft.awayScore}
                  onChange={(event) => update({ awayScore: event.target.value })}
                  disabled={disabled}
                />
              </Field>
            </div>
            {drawNotAllowed ? (
              <p role="alert" className="mt-2 text-[12px] font-medium text-egw-red">
                Nella {adapter.label.toLowerCase()} non esiste il pareggio: un risultato definitivo in parità non si può salvare.
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-brand text-[12px] font-semibold text-egw-ink-62">
                Stato del risultato
              </span>
              <SegmentedControl<MatchResultStatus>
                aria-label="Stato del risultato"
                mode="radio"
                size="sm"
                value={draft.status}
                onChange={(value) => update({ status: value })}
                options={[
                  { value: "provisional", label: "Provvisorio", disabled },
                  { value: "final", label: "Definitivo", disabled },
                ]}
              />
            </div>
            <p className="mt-1.5 text-[11.5px] text-egw-ink-62">
              Un risultato definitivo chiude la gara; uno provvisorio la lascia com&apos;è, per correggerlo dopo.
              {!adapter.allowsDraw ? ` Nella ${adapter.label.toLowerCase()} il pareggio non esiste.` : ""}
            </p>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="font-brand text-[13px] font-bold text-egw-ink">
                  {adapter.periodLabelPlural}
                  {adapter.resultCountsPeriodsWon ? (
                    <span className="ml-1 font-normal text-egw-ink-62">(punti per {adapter.periodLabel.toLowerCase()}: il risultato conta i {adapter.periodLabelPlural.toLowerCase()} vinti)</span>
                  ) : null}
                </h4>
                <span className="text-[11.5px] text-egw-ink-62">facoltativi</span>
              </div>
              <ul className="space-y-2">
                {draft.periods.map((period, index) => {
                  const last = index === draft.periods.length - 1;
                  return (
                    <li key={index} className="grid grid-cols-[minmax(0,1fr)_72px_72px_32px] items-center gap-2">
                      <span className="egw-ellipsis text-[12.5px] font-semibold text-egw-ink-72" title={period.label}>
                        {period.label}
                      </span>
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={999}
                        numeric
                        aria-label={`${period.label}: ${homeName}`}
                        placeholder="Casa"
                        value={period.home}
                        onChange={(event) => setPeriod(index, { home: event.target.value })}
                        disabled={disabled}
                      />
                      <TextInput
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={999}
                        numeric
                        aria-label={`${period.label}: ${awayName}`}
                        placeholder="Trasf."
                        value={period.away}
                        onChange={(event) => setPeriod(index, { away: event.target.value })}
                        disabled={disabled}
                      />
                      {last && draft.periods.length > 0 ? (
                        <Button
                          variant="text"
                          size="xs"
                          aria-label={`Togli ${period.label}`}
                          onClick={() => update({ periods: draft.periods.slice(0, -1) })}
                          disabled={disabled}
                          className="px-1.5"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <span aria-hidden />
                      )}
                    </li>
                  );
                })}
              </ul>
              {draft.periods.length < adapter.maxPeriods ? (
                <Button
                  variant="text"
                  size="sm"
                  className="mt-2"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() =>
                    update({
                      periods: [...draft.periods, { label: adapter.periodName(draft.periods.length + 1), home: "", away: "" }],
                    })
                  }
                  disabled={disabled}
                >
                  Aggiungi {adapter.periodName(draft.periods.length + 1).toLowerCase()}
                </Button>
              ) : null}
              {derived ? (
                <InsetBlock className="mt-3 flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="text-[12.5px] text-egw-ink-72">
                    I parziali danno <strong className="egw-num text-egw-ink">{derived.home}-{derived.away}</strong>
                    {derivedDiffers && homeValue !== null && awayValue !== null ? (
                      <span className="text-egw-amber-ink"> · il risultato scritto è {homeValue}-{awayValue}</span>
                    ) : null}
                  </span>
                  {derivedDiffers ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => update({ homeScore: String(derived.home), awayScore: String(derived.away) })}
                      disabled={disabled}
                    >
                      Usa come risultato
                    </Button>
                  ) : null}
                </InsetBlock>
              ) : null}
            </div>
          </DrawerSection>

          <DrawerSection>
            <button
              type="button"
              onClick={() => setStatsOpen((value) => !value)}
              aria-expanded={statsOpen}
              aria-controls="match-result-stats"
              className="flex w-full items-center gap-2 rounded-egw-chip py-1 text-left focus-visible:outline-none focus-visible:shadow-egw-focus"
            >
              {statsOpen ? <ChevronDown className="h-4 w-4 text-egw-ink-42" /> : <ChevronRight className="h-4 w-4 text-egw-ink-42" />}
              <span className="font-brand text-[13.5px] font-bold text-egw-ink">Statistiche dei giocatori</span>
              <span className="text-[11.5px] text-egw-ink-62">
                {statAthletes.length ? `${statAthletes.length} ${statAthletes.length === 1 ? "atleta" : "atleti"}` : "facoltative"}
              </span>
            </button>
            {statsOpen ? (
              <div id="match-result-stats" className="mt-3">
                {!statAthletes.length ? (
                  <InfoCard>
                    Le statistiche si inseriscono per gli atleti convocati: questa gara non ha ancora convocazioni.
                    Convoca la squadra dalla pagina Gare e torna qui.
                  </InfoCard>
                ) : (
                  <>
                    <p className="mb-2 text-[11.5px] text-egw-ink-62">
                      Solo numeri interi. Una riga lasciata vuota non registra niente (e cancella ciò che c&apos;era).
                    </p>
                    <div className="egw-scroll max-w-full overflow-x-auto rounded-egw-field border border-egw-hairline">
                      <table className="w-full min-w-max border-collapse text-[12.5px]">
                        <caption className="sr-only">Statistiche dei giocatori convocati</caption>
                        <thead>
                          <tr className="bg-egw-page-100 text-left">
                            <th scope="col" className="sticky left-0 z-[1] bg-egw-page-100 px-3 py-2 font-semibold text-egw-ink-62">
                              Atleta
                            </th>
                            {adapter.stats.map((stat) => (
                              <th key={stat.key} scope="col" className="px-1.5 py-2 text-center font-semibold text-egw-ink-62">
                                <abbr title={stat.label} className="no-underline">
                                  {stat.short}
                                </abbr>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {statAthletes.map((athlete) => (
                            <tr key={athlete.id} className="border-t border-egw-hairline">
                              <th scope="row" className="sticky left-0 z-[1] max-w-[180px] bg-white px-3 py-1.5 text-left font-medium text-egw-ink">
                                <span className="egw-ellipsis block" title={athlete.name}>
                                  {athlete.jersey ? <span className="egw-num mr-1 text-egw-ink-62">#{athlete.jersey}</span> : null}
                                  {athlete.name}
                                </span>
                                {!athlete.convocated ? (
                                  <span className="block text-[10.5px] font-normal text-egw-amber-ink">non più convocato</span>
                                ) : null}
                              </th>
                              {adapter.stats.map((stat) => (
                                <td key={stat.key} className="px-1 py-1">
                                  <TextInput
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    max={9999}
                                    numeric
                                    aria-label={`${stat.label} di ${athlete.name}`}
                                    value={draft.stats[athlete.id]?.[stat.key] || ""}
                                    onChange={(event) => setStat(athlete.id, stat.key, event.target.value)}
                                    disabled={disabled}
                                    className={cn("h-9 w-[64px] px-2")}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-[11.5px] text-egw-ink-62">
                      Le statistiche si salvano insieme al risultato: senza un punteggio (o parziali completi) il server non le accetta.
                    </p>
                  </>
                )}
              </div>
            ) : null}
          </DrawerSection>
        </>
      ) : null}
      {confirmDialog}
    </Drawer>
  );
}
