"use client";

import * as React from "react";
import { Archive, ArrowRightLeft, CalendarRange, Check, Plus, Search, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-notification";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, RowActionDef } from "@/components/web/datagrid/types";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { ConfirmDialog } from "@/components/web/overlays/Modal";
import { Button } from "@/components/web/primitives/Button";
import { Checkbox, Skeleton } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { SummaryCard } from "@/components/web/page/Cards";
import { DateInput, Field, FieldSizeProvider, FormGrid, Select, TextInput } from "@/components/web/forms/Field";
import { formatDateShort, formatInteger } from "@/lib/web/format";
import { ATHLETE_MEMBERSHIP_ROLLOVER_TYPE, SEASON_STATUS_LABELS, type ClubSeason } from "@/lib/club-seasons";
import {
  createSeason,
  deleteSeason,
  fetchSeasonDeleteImpact,
  fetchSeasonRoster,
  fetchSeasonsOverview,
  runSeasonRollover,
  updateSeasonStatus,
  type SeasonDeleteImpact,
  type SeasonRoster,
  type SeasonRolloverSummary,
  type SeasonsOverview,
} from "@/lib/api/seasons";
import { SEASON_STATUS_SPEC } from "@/components/organization/v2/club-model";

/**
 * La sezione «Stagioni» della scheda Club (Web V2).
 *
 * Stessa logica e stessi endpoint della V1 (`@/lib/api/seasons`), forma del
 * sistema: l'elenco e la griglia (guideline 07), la procedura «Nuova
 * stagione» e il riporto sono cassetti a 720 con lo stepper di 08 §8.5,
 * attivazione e archiviazione restano dietro `ConfirmDialog` (08 §8.9). Il
 * componente non conosce Prisma ne `fetch`, e non e in autosave: cambiare
 * stagione e un'operazione con conferma, non un modulo da salvare.
 */
type SeasonManagerProps = {
  /** Chiamata quando cambia la stagione attiva, per riallineare la topbar. */
  onActiveSeasonChange?: (season: ClubSeason) => void;
};

type WizardStep = "periodo" | "riporto" | "tesserati" | "riepilogo";

const STEP_LABELS: Record<WizardStep, string> = {
  periodo: "Periodo",
  riporto: "Cosa riportare",
  tesserati: "Tesserati",
  riepilogo: "Riepilogo",
};

const emptyForm = { label: "", startDate: "", endDate: "", activate: false };

/* ── Stepper (08 §8.5): tessere 26px unite da un filo; fatto = check, corrente = numero ── */
function StepperHeader({ steps, current }: { steps: WizardStep[]; current: WizardStep }) {
  const currentIndex = steps.indexOf(current);
  return (
    <ol className="egw-scroll mb-5 flex items-start overflow-x-auto pb-1" aria-label="Passi della procedura">
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step} className={cn("flex min-w-0 items-start", index < steps.length - 1 && "flex-1")}>
            <div className="flex min-w-[72px] flex-col items-center gap-1.5">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "egw-num inline-flex h-[26px] w-[26px] items-center justify-center rounded-egw-chip font-brand text-[11px] font-bold",
                  done || active ? "bg-egw-action text-white" : "bg-egw-page-100 text-egw-ink-42",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className={cn("whitespace-nowrap font-brand text-[10.5px] font-semibold", active ? "text-egw-ink" : "text-egw-ink-62")}>{STEP_LABELS[step]}</span>
            </div>
            {index < steps.length - 1 ? <span aria-hidden className="mt-[13px] h-px min-w-3 flex-1 bg-egw-hairline" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ── Riconferma dei tesserati ────────────────────────────────────────────── */
/**
 * L'elenco di riconferma: chi c'era, e **nessuno e scelto finche il club non
 * lo sceglie** (ADR-0196). Prima l'elenco arrivava tutto spuntato e chi non
 * toccava niente riportava l'intera stagione: «nessuna selezione» valeva
 * «tutti», e il club ha visto due atleti nella stagione nuova senza averli
 * mai riconfermati. Riportare e un atto: «Seleziona tutti» esiste, ed e un
 * pulsante. Una lista verticale e non una griglia: a 375 px, con duecento
 * righe, una scelta riga per riga si fa cosi.
 */
function RosterConfirmation({
  roster,
  loading,
  confirmedIds,
  onToggle,
  onSelectAll,
  onSelectNone,
  disabled,
}: {
  roster: SeasonRoster | null;
  loading: boolean;
  confirmedIds: Set<string>;
  onToggle: (athleteId: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const athletes = React.useMemo(() => roster?.athletes ?? [], [roster]);
  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return athletes;
    return athletes.filter(
      (athlete) => athlete.fullName.toLowerCase().includes(needle) || athlete.memberships.some((membership) => membership.categoryName.toLowerCase().includes(needle)),
    );
  }, [athletes, query]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    );
  }

  if (!athletes.length) {
    return (
      <InsetBlock>
        <p className="font-brand text-[13px] font-semibold text-egw-ink">Nessun tesserato da riconfermare</p>
        <p className="mt-1 font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">
          Nella stagione di origine non risulta nessun atleta assegnato a una squadra. La stagione nuova nascera con le categorie vuote.
        </p>
      </InsetBlock>
    );
  }

  const notConfirmed = athletes.length - confirmedIds.size;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-brand text-[13px] text-egw-ink" aria-live="polite">
          {confirmedIds.size === 0 ? (
            <>
              <strong>Nessuno selezionato</strong>
              <span className="text-egw-ink-62">
                {" "}
                · <span className="egw-num">{formatInteger(athletes.length)}</span> proposti: spunta chi rinnova, o «Seleziona tutti»
              </span>
            </>
          ) : (
            <>
              <strong className="egw-num">{formatInteger(confirmedIds.size)}</strong> riconfermati su <span className="egw-num">{formatInteger(athletes.length)}</span>
              {notConfirmed ? (
                <span className="text-egw-ink-62">
                  {" "}
                  · <span className="egw-num">{formatInteger(notConfirmed)}</span> restano fuori
                </span>
              ) : null}
            </>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onSelectAll} disabled={disabled || confirmedIds.size === athletes.length}>
            Seleziona tutti
          </Button>
          <Button variant="secondary" size="sm" onClick={onSelectNone} disabled={disabled || confirmedIds.size === 0}>
            Nessuno
          </Button>
        </div>
      </div>

      <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per nome o squadra" leading={<Search />} aria-label="Cerca fra i tesserati da riconfermare" />

      <ul className="egw-scroll flex max-h-80 flex-col gap-1.5 overflow-y-auto pr-1">
        {filtered.map((athlete) => (
          <li key={athlete.athleteId}>
            <label className="flex items-start gap-3 rounded-egw-field border border-egw-hairline bg-white px-3 py-2.5">
              <Checkbox checked={confirmedIds.has(athlete.athleteId)} onChange={() => onToggle(athlete.athleteId)} disabled={disabled} aria-label={`Riconferma ${athlete.fullName}`} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="break-words font-brand text-[13px] font-semibold text-egw-ink">{athlete.fullName}</span>
                <span className="flex flex-wrap gap-1">
                  {athlete.memberships.map((membership) => (
                    <DataChip key={membership.membershipId} size="sm">
                      {membership.categoryName}
                      {membership.isPrimary ? " · principale" : ""}
                    </DataChip>
                  ))}
                </span>
              </span>
            </label>
          </li>
        ))}
        {!filtered.length ? <li className="rounded-egw-field border border-dashed border-egw-hairline px-3 py-3 font-brand text-[12.5px] text-egw-ink-62">Nessun tesserato corrisponde alla ricerca.</li> : null}
      </ul>

      <p className="font-brand text-[11.5px] leading-[1.5] text-egw-ink-62">
        Chi resta fuori non viene cancellato: mantiene la sua storia e le sue appartenenze passate, e semplicemente non entra nelle squadre della stagione nuova.
      </p>
    </div>
  );
}

/* ── I tipi da riportare: una casella per tipo con il conteggio della sorgente ── */
function RolloverTypeList({
  types,
  selected,
  counts,
  onToggle,
  disabled,
}: {
  types: SeasonsOverview["rolloverTypes"];
  selected: string[];
  counts: Record<string, number>;
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
      {types.map((type) => (
        <label key={type.key} className="flex items-start gap-3 rounded-egw-field border border-egw-hairline bg-white px-3 py-2.5">
          <Checkbox checked={selected.includes(type.key)} onChange={() => onToggle(type.key)} disabled={disabled} />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-brand text-[13px] font-semibold text-egw-ink">
              {type.label}
              <span className="egw-num text-[11px] font-bold text-egw-ink-42">{formatInteger(counts[type.key] ?? 0)}</span>
            </span>
            <span className="font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">{type.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export function SeasonManager({ onActiveSeasonChange }: SeasonManagerProps) {
  const { showToast } = useToast();
  const [overview, setOverview] = React.useState<SeasonsOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [step, setStep] = React.useState<WizardStep>("periodo");
  const [form, setForm] = React.useState(emptyForm);
  const [wizardDirty, setWizardDirty] = React.useState(false);
  const [sourceSeasonId, setSourceSeasonId] = React.useState<string>("");
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);
  const [roster, setRoster] = React.useState<SeasonRoster | null>(null);
  const [rosterLoading, setRosterLoading] = React.useState(false);
  const [rosterFallito, setRosterFallito] = React.useState(false);
  const [confirmedIds, setConfirmedIds] = React.useState<Set<string>>(() => new Set());

  const [rolloverTarget, setRolloverTarget] = React.useState<ClubSeason | null>(null);
  const [rolloverPreview, setRolloverPreview] = React.useState<SeasonRolloverSummary | null>(null);
  const [lastSummary, setLastSummary] = React.useState<SeasonRolloverSummary | null>(null);
  const [pendingArchive, setPendingArchive] = React.useState<ClubSeason | null>(null);
  /* Eliminazione (ADR-0197 §32): la stagione, l'impatto letto dal server, il testo scritto. */
  const [deleteTarget, setDeleteTarget] = React.useState<ClubSeason | null>(null);
  const [deleteImpact, setDeleteImpact] = React.useState<SeasonDeleteImpact | null>(null);
  const [deleteImpactError, setDeleteImpactError] = React.useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = React.useState("");
  const [pendingActivation, setPendingActivation] = React.useState<ClubSeason | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await fetchSeasonsOverview();
      setOverview(data);
      setLoadError(null);
      return data;
    } catch (error: any) {
      const message = error?.message || "Errore nel caricamento delle stagioni";
      setLoadError(message);
      showToast("error", message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const rolloverTypes = React.useMemo(() => overview?.rolloverTypes ?? [], [overview]);
  const seasons = React.useMemo(() => overview?.seasons ?? [], [overview]);
  const countsFor = React.useCallback((seasonId: string) => overview?.counts?.[seasonId] || {}, [overview]);
  const selectableSources = React.useMemo(() => seasons.filter((season) => season.id !== rolloverTarget?.id), [seasons, rolloverTarget]);

  const openWizard = () => {
    setForm(emptyForm);
    setWizardDirty(false);
    setStep("periodo");
    setSourceSeasonId(overview?.activeSeasonId || "");
    setSelectedTypes(rolloverTypes.filter((type) => type.defaultSelected).map((type) => type.key));
    setLastSummary(null);
    setRoster(null);
    setConfirmedIds(new Set());
    setWizardOpen(true);
  };

  const toggleType = (key: string) => {
    setSelectedTypes((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
  };

  const carriesAthletes = selectedTypes.includes(ATHLETE_MEMBERSHIP_ROLLOVER_TYPE);

  /**
   * Carica l'elenco di riconferma e lo propone **senza nessuno selezionato**
   * (ADR-0196): la scelta e del club, e «tutti» e un pulsante. Cambiare la
   * stagione di origine azzera la scelta, perche l'elenco e un altro.
   */
  const rosterRichiesto = React.useRef<string>("");
  const loadRoster = React.useCallback(
    async (seasonId: string) => {
      if (!seasonId) return null;
      /*
        L'elenco di un'altra stagione non resta sotto l'origine nuova: si
        azzera subito, e una risposta arrivata in ritardo per un'origine che
        nel frattempo e cambiata si scarta (revisione ostile ADR-0196 A4).
      */
      rosterRichiesto.current = seasonId;
      setRoster(null);
      setConfirmedIds(new Set());
      setRolloverPreview(null);
      setRosterLoading(true);
      setRosterFallito(false);
      try {
        const data = await fetchSeasonRoster(seasonId);
        if (rosterRichiesto.current !== seasonId) return null;
        setRoster(data);
        setConfirmedIds(new Set());
        return data;
      } catch (error: any) {
        if (rosterRichiesto.current !== seasonId) return null;
        showToast("error", error?.message || "Errore nel caricamento dei tesserati");
        setRosterFallito(true);
        return null;
      } finally {
        if (rosterRichiesto.current === seasonId) setRosterLoading(false);
      }
    },
    [showToast],
  );

  const toggleConfirmed = (athleteId: string) => {
    setConfirmedIds((current) => {
      const next = new Set(current);
      if (next.has(athleteId)) next.delete(athleteId);
      else next.add(athleteId);
      return next;
    });
  };
  const confirmAllAthletes = () => setConfirmedIds(new Set((roster?.athletes ?? []).map((athlete) => athlete.athleteId)));
  const confirmNoAthlete = () => setConfirmedIds(new Set());

  /**
   * L'elenco che parte: sempre un elenco quando i tesserati si portano —
   * `[]` significa «nessuno», e il server lo scrive come zero. `null` solo
   * quando «Tesserati nelle squadre» non e fra i tipi: la, il server rifiuta
   * un elenco mancante invece di leggerlo come «tutti» (ADR-0196).
   */
  const confirmedAthleteIds = carriesAthletes ? Array.from(confirmedIds) : null;

  /**
   * Vero quando l'elenco di riconferma **ha provato a caricarsi e non ci e
   * riuscito**: un elenco che non si e caricato ferma il passo, non degrada
   * in «nessuno riconfermato».
   */
  const rosterNonCaricato = carriesAthletes && rosterFallito;

  const goToRiporto = () => {
    if (!form.startDate || !form.endDate) {
      showToast("error", "Indica la data di inizio e la data di fine");
      return;
    }
    if (new Date(form.startDate) >= new Date(form.endDate)) {
      showToast("error", "La data di fine deve essere successiva a quella di inizio");
      return;
    }
    setStep("riporto");
  };

  /** Il passo di riconferma esiste solo se i tesserati si portano. */
  const goToTesserati = async () => {
    if (!carriesAthletes) {
      setStep("riepilogo");
      return;
    }
    const loaded = roster?.seasonId === sourceSeasonId ? roster : null;
    setStep("tesserati");
    if (!loaded) await loadRoster(sourceSeasonId);
  };

  const wizardSteps: WizardStep[] = carriesAthletes ? ["periodo", "riporto", "tesserati", "riepilogo"] : ["periodo", "riporto", "riepilogo"];
  const previousStep: WizardStep = step === "riepilogo" ? (carriesAthletes ? "tesserati" : "riporto") : step === "tesserati" ? "riporto" : "periodo";

  const handleCreate = async () => {
    setBusy(true);
    try {
      const result = await createSeason({
        label: form.label.trim() || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        activate: form.activate,
        rollover: selectedTypes.length ? { sourceSeasonId: sourceSeasonId || undefined, types: selectedTypes, athleteIds: confirmedAthleteIds } : null,
      });

      setWizardDirty(false);
      setWizardOpen(false);
      setLastSummary(result.rollover);
      const refreshed = await load();

      if (form.activate && refreshed) {
        const active = refreshed.seasons.find((season) => season.id === refreshed.activeSeasonId);
        if (active) onActiveSeasonChange?.(active);
      }

      showToast(
        "success",
        result.rollover
          ? `Stagione ${result.season.label} creata: ${result.rollover.createdTotal} elementi riportati, ${result.rollover.athletes.carried} tesserati`
          : `Stagione ${result.season.label} creata`,
      );
    } catch (error: any) {
      showToast("error", error?.message || "Errore nella creazione della stagione");
    } finally {
      setBusy(false);
    }
  };

  const handleActivate = async (season: ClubSeason) => {
    setBusy(true);
    try {
      const result = await updateSeasonStatus(season.id, "activate");
      setPendingActivation(null);
      await load();
      onActiveSeasonChange?.(result.season);
      showToast("success", `Stagione attiva impostata su ${season.label}`);
    } catch (error: any) {
      showToast("error", error?.message || "Errore nel cambio stagione");
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (season: ClubSeason) => {
    setBusy(true);
    try {
      await updateSeasonStatus(season.id, "archive");
      setPendingArchive(null);
      await load();
      showToast("success", `Stagione ${season.label} archiviata`);
    } catch (error: any) {
      showToast("error", error?.message || "Errore nell'archiviazione");
    } finally {
      setBusy(false);
    }
  };

  const openDelete = async (season: ClubSeason) => {
    setDeleteTarget(season);
    setDeleteImpact(null);
    setDeleteImpactError(null);
    setDeleteConfirmation("");
    try {
      setDeleteImpact(await fetchSeasonDeleteImpact(season.id));
    } catch (error: any) {
      setDeleteImpactError(error?.message || "Impossibile leggere il contenuto della stagione");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !deleteImpact) return;
    setBusy(true);
    try {
      const result = await deleteSeason(deleteTarget.id, deleteConfirmation.trim());
      setDeleteTarget(null);
      setDeleteImpact(null);
      await load();
      showToast(
        "success",
        `Stagione ${result.season.label} eliminata definitivamente${result.detachedTrainerAssignments ? ` · ${result.detachedTrainerAssignments} assegnazioni allenatori staccate` : ""}`,
      );
    } catch (error: any) {
      showToast("error", error?.message || "Errore nell'eliminazione della stagione");
    } finally {
      setBusy(false);
    }
  };

  const openRollover = async (season: ClubSeason) => {
    setRolloverTarget(season);
    setRolloverPreview(null);
    const fallbackSource = seasons.find((entry) => entry.id !== season.id)?.id || "";
    const nextSource = overview?.activeSeasonId && overview.activeSeasonId !== season.id ? overview.activeSeasonId : fallbackSource;
    setSourceSeasonId(nextSource);
    setSelectedTypes(rolloverTypes.filter((type) => type.defaultSelected).map((type) => type.key));
    setRoster(null);
    setConfirmedIds(new Set());
    await loadRoster(nextSource);
  };

  const previewRollover = async () => {
    if (!rolloverTarget || !sourceSeasonId || !selectedTypes.length) {
      showToast("error", "Scegli la stagione di origine e almeno un tipo di dato");
      return;
    }
    if (carriesAthletes && (rosterLoading || rosterFallito)) {
      showToast("error", "Aspetta l'elenco dei tesserati: senza non si puo dire chi entra");
      return;
    }
    setBusy(true);
    try {
      const summary = await runSeasonRollover({ targetSeasonId: rolloverTarget.id, sourceSeasonId, types: selectedTypes, athleteIds: confirmedAthleteIds, preview: true });
      setRolloverPreview(summary);
    } catch (error: any) {
      showToast("error", error?.message || "Errore nel calcolo del riporto");
    } finally {
      setBusy(false);
    }
  };

  const confirmRollover = async () => {
    if (!rolloverTarget) return;
    setBusy(true);
    try {
      const summary = await runSeasonRollover({ targetSeasonId: rolloverTarget.id, sourceSeasonId, types: selectedTypes, athleteIds: confirmedAthleteIds });
      setRolloverTarget(null);
      setRolloverPreview(null);
      setLastSummary(summary);
      await load();
      showToast("success", `Riportati ${summary.createdTotal} elementi e ${summary.athletes.carried} tesserati in ${summary.targetSeasonLabel}`);
    } catch (error: any) {
      showToast("error", error?.message || "Errore durante il riporto");
    } finally {
      setBusy(false);
    }
  };

  const sourceCounts = countsFor(sourceSeasonId);

  /**
   * Le stagioni gia salvate con cui il periodo scelto si sovrappone. Non e
   * un blocco: e l'avviso che un movimento senza stagione dichiarata — un
   * incasso, che la stagione non la porta — cadrebbe per data in tutte e due
   * (ADR-0196). Il club pilota aveva creato «2026/27» da settembre sopra una
   * «2026/2027» da luglio, e leggeva i pagamenti in entrambe.
   */
  const stagioniSovrapposte = React.useMemo(() => {
    if (!form.startDate || !form.endDate) return [] as ClubSeason[];
    const inizio = new Date(form.startDate).getTime();
    const fine = new Date(form.endDate).getTime();
    if (!Number.isFinite(inizio) || !Number.isFinite(fine) || inizio >= fine) return [] as ClubSeason[];
    return seasons.filter((season) => {
      const altroInizio = new Date(season.startDate).getTime();
      const altraFine = new Date(season.endDate).getTime();
      return Number.isFinite(altroInizio) && Number.isFinite(altraFine) && inizio <= altraFine && altroInizio <= fine;
    });
  }, [form.startDate, form.endDate, seasons]);
  const selectedDescriptors = rolloverTypes.filter((type) => selectedTypes.includes(type.key));
  const activeSeasonId = overview?.activeSeasonId;

  /* ── La griglia ────────────────────────────────────────────────────────── */
  const columns: ColumnDef<ClubSeason>[] = [
    {
      id: "label",
      header: "Stagione",
      kind: "identity",
      locked: true,
      cell: (season) => {
        const total = Object.values(countsFor(season.id)).reduce((sum, value) => sum + value, 0);
        return (
          <span className="flex min-w-0 flex-col">
            <span className="egw-ellipsis font-brand text-[12.5px] font-semibold text-egw-ink">{season.label}</span>
            <span className="egw-num font-brand text-[10.5px] text-[rgba(11,26,58,.55)]">{formatInteger(total)} voci di configurazione stagionale</span>
          </span>
        );
      },
      sortValue: (season) => season.startDate,
      title: (season) => season.label,
    },
    {
      id: "period",
      header: "Periodo",
      kind: "date",
      cell: (season) => `${formatDateShort(season.startDate)} → ${formatDateShort(season.endDate)}`,
      sortValue: (season) => season.startDate,
    },
    {
      id: "status",
      header: "Stato",
      kind: "status",
      cell: (season) => <StatusPill status={SEASON_STATUS_SPEC[season.status]} />,
      sortValue: (season) => SEASON_STATUS_LABELS[season.status],
    },
  ];

  /*
    Un'azione che per **quella** riga non ha senso e assente, non
    disabilitata: attivare la stagione gia attiva, archiviare l'archiviata.
  */
  const rowActions: RowActionDef<ClubSeason>[] = [
    { id: "activate", label: "Attiva", icon: <Check />, primary: true, hidden: (season) => season.id === activeSeasonId, onClick: (season) => setPendingActivation(season) },
    { id: "rollover", label: "Riporta dati", icon: <ArrowRightLeft />, hidden: (season) => season.status === "archived", onClick: (season) => void openRollover(season) },
    { id: "archive", label: "Archivia", icon: <Archive />, hidden: (season) => season.status === "archived" || season.id === activeSeasonId, onClick: (season) => setPendingArchive(season) },
    /* Eliminare non e archiviare: la stagione attiva non lo offre, e per le altre decide il server cosa e possibile (ADR-0197 §30). */
    { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", hidden: (season) => season.id === activeSeasonId, onClick: (season) => void openDelete(season) },
  ];

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-brand text-[15px] font-bold leading-5 text-egw-ink">Stagioni sportive</h2>
          <p className="mt-1 max-w-[80ch] font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">
            La stagione attiva e il perimetro dei dati che vedi in tutta l&apos;applicazione. Le stagioni archiviate restano consultabili: per rileggerle basta attivarle di nuovo.
          </p>
        </div>
        <Button variant="primary" icon={<Plus />} onClick={openWizard} disabled={busy || loading}>
          Nuova stagione
        </Button>
      </div>

      {/* Dopo un cambio di stagione il club deve sapere subito quanti atleti sono rimasti senza squadra. */}
      {overview?.athletesWithoutTeam ? (
        <AlertBlock
          severity="warning"
          title={
            <>
              <span className="egw-num">{formatInteger(overview.athletesWithoutTeam)}</span> atleti non appartengono a nessuna squadra della stagione attiva
            </>
          }
          actions={
            <Button asChild variant="secondary" size="sm">
              <a href="/athletes">Assegnali</a>
            </Button>
          }
        >
          Senza una squadra non compaiono negli allenamenti e nelle convocazioni della stagione.
        </AlertBlock>
      ) : null}

      <DataGrid<ClubSeason>
        module="club-stagioni"
        aria-label="Elenco delle stagioni"
        rows={seasons}
        getRowId={(season) => season.id}
        rowLabel={(season) => season.label}
        columns={columns}
        rowActions={rowActions}
        defaultSort={{ columnId: "label", direction: "desc" }}
        noun={{ singular: "stagione", plural: "stagioni" }}
        state={loading ? "loading" : loadError ? "error" : "ready"}
        errorMessage={loadError}
        onRetry={() => void load()}
        hideViews
        hideFooter={seasons.length <= 25}
        persist={false}
        empty={{
          icon: <CalendarRange />,
          title: "Nessuna stagione registrata",
          description: "Crea la prima stagione: da li in poi ogni dato sportivo appartiene a un'annata.",
          primary: (
            <Button variant="primary" size="sm" icon={<Plus />} onClick={openWizard}>
              Nuova stagione
            </Button>
          ),
        }}
      />

      {lastSummary ? (
        <SummaryCard
          eyebrow="Ultimo riporto"
          title={`Da ${lastSummary.sourceSeasonLabel} a ${lastSummary.targetSeasonLabel}`}
          rows={[
            ...lastSummary.entries.map((entry) => ({ label: entry.label, value: `${formatInteger(entry.created)} creati / ${formatInteger(entry.skipped)} saltati` })),
            { label: "Tesserati riportati", value: `${formatInteger(lastSummary.athletes.carried)} su ${formatInteger(lastSummary.athletes.proposed)} proposti` },
            ...(lastSummary.athletes.notConfirmed ? [{ label: "Non riconfermati", value: formatInteger(lastSummary.athletes.notConfirmed), tone: "muted" as const }] : []),
            ...(lastSummary.athletes.alreadyPresent ? [{ label: "Gia presenti", value: formatInteger(lastSummary.athletes.alreadyPresent), tone: "muted" as const }] : []),
            ...(lastSummary.athletes.unmappable ? [{ label: "Senza squadra di destinazione", value: formatInteger(lastSummary.athletes.unmappable), tone: "amber" as const }] : []),
            /* Le assegnazioni degli allenatori, e cio che non ha trovato una destinazione (ADR-0197 §7, revisione D-M4). */
            ...(lastSummary.trainers?.requested
              ? [{ label: "Allenatori con squadre riportate", value: `${formatInteger(lastSummary.trainers.trainersUpdated)} su ${formatInteger(lastSummary.trainers.trainersWithAssignments)}` }]
              : []),
            ...(lastSummary.trainers?.unmapped?.length
              ? [{ label: "Assegnazioni senza destinazione", value: `${formatInteger(lastSummary.trainers.unmapped.length)} (${Array.from(new Set(lastSummary.trainers.unmapped.map((entry) => entry.trainerName))).join(", ")})`, tone: "amber" as const }]
              : []),
          ]}
          /* «non creati» e non «gia presenti»: fra i saltati c'e anche chi l'operatore ha deliberatamente escluso. */
          total={{ label: "Elementi creati · non creati", value: `${formatInteger(lastSummary.createdTotal)} · ${formatInteger(lastSummary.skippedTotal)}` }}
          footer={lastSummary.athletes.requested ? null : <p className="font-brand text-[12px] text-egw-ink-62">I tesserati non erano fra i tipi scelti.</p>}
        />
      ) : null}

      {/* ── Procedura guidata: periodo, cosa riportare, riconferma, riepilogo ── */}
      <Drawer
        open={wizardOpen}
        onOpenChange={(open) => !busy && setWizardOpen(open)}
        width="wide"
        eyebrow="Stagioni"
        title="Nuova stagione"
        description={
          step === "periodo"
            ? "Indica il periodo della stagione."
            : step === "riporto"
              ? "Scegli cosa riportare dalla stagione precedente."
              : step === "tesserati"
                ? "Chi rinnova? Spunta chi entra nelle squadre della stagione nuova: chi non spunti resta fuori."
                : "Controlla cosa verra creato prima di confermare."
        }
        dirty={wizardDirty}
        locked={busy}
        data-test="season-wizard-drawer"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2.5">
            <div>
              {step !== "periodo" ? (
                <Button variant="secondary" onClick={() => setStep(previousStep)} disabled={busy}>
                  Indietro
                </Button>
              ) : null}
            </div>
            <span className="egw-num font-brand text-[12px] font-medium text-[rgba(11,26,58,.55)]">
              Passo {wizardSteps.indexOf(step) + 1} di {wizardSteps.length}
            </span>
            <div>
              {step === "periodo" ? (
                <Button variant="primary" onClick={goToRiporto}>
                  Continua
                </Button>
              ) : null}
              {step === "riporto" ? (
                <Button variant="primary" onClick={() => void goToTesserati()} disabled={busy}>
                  Continua
                </Button>
              ) : null}
              {step === "tesserati" ? (
                <Button variant="primary" onClick={() => setStep("riepilogo")} disabled={rosterLoading || rosterNonCaricato}>
                  Continua
                </Button>
              ) : null}
              {step === "riepilogo" ? (
                <Button variant="primary" icon={<CalendarRange />} onClick={() => void handleCreate()} loading={busy}>
                  Crea stagione
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        <FieldSizeProvider size="sm">
          <StepperHeader steps={wizardSteps} current={step} />

          {step === "periodo" ? (
            <div className="flex flex-col gap-5">
              <FormGrid>
                <Field label="Nome" htmlFor="season-label" optional helper="Senza nome, la stagione prende quello delle date.">
                  <TextInput
                    id="season-label"
                    value={form.label}
                    placeholder="Es. 2027/2028"
                    onChange={(event) => {
                      setForm((current) => ({ ...current, label: event.target.value }));
                      setWizardDirty(true);
                    }}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Inizio" htmlFor="season-start" required>
                    <DateInput
                      id="season-start"
                      value={form.startDate}
                      onChange={(event) => {
                        setForm((current) => ({ ...current, startDate: event.target.value }));
                        setWizardDirty(true);
                      }}
                    />
                  </Field>
                  <Field label="Fine" htmlFor="season-end" required>
                    <DateInput
                      id="season-end"
                      value={form.endDate}
                      onChange={(event) => {
                        setForm((current) => ({ ...current, endDate: event.target.value }));
                        setWizardDirty(true);
                      }}
                    />
                  </Field>
                </div>
              </FormGrid>

              {stagioniSovrapposte.length ? (
                <AlertBlock severity="warning" title={`Il periodo si sovrappone a ${stagioniSovrapposte.map((season) => season.label).join(", ")}`}>
                  Un incasso o un movimento che non dichiara la stagione si attribuisce per data: nei giorni in comune comparirebbe in entrambe. Se le stagioni si susseguono, fai iniziare la nuova il giorno dopo la fine della precedente.
                </AlertBlock>
              ) : null}

              <label className="flex items-start gap-3 rounded-egw-field border border-egw-hairline bg-white px-3.5 py-3">
                <Checkbox
                  checked={form.activate}
                  onChange={(event) => {
                    setForm((current) => ({ ...current, activate: event.target.checked }));
                    setWizardDirty(true);
                  }}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="font-brand text-[13px] font-semibold text-egw-ink">Rendila subito la stagione attiva</span>
                  <span className="font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">Senza questa scelta la stagione nasce «futura»: la prepari con calma e la attivi quando comincia davvero.</span>
                </span>
              </label>
            </div>
          ) : null}

          {step === "riporto" ? (
            <div className="flex flex-col gap-5">
              <Field label="Stagione di origine" htmlFor="season-source">
                <Select
                  id="season-source"
                  value={sourceSeasonId}
                  onValueChange={(value) => {
                    /* Un'altra origine e un altro elenco: le spunte di prima non valgono (A10). */
                    setSourceSeasonId(value);
                    setRoster(null);
                    setConfirmedIds(new Set());
                  }}
                  options={seasons.map((season) => ({ value: season.id, label: `${season.label} — ${SEASON_STATUS_LABELS[season.status]}` }))}
                  placeholder="Seleziona la stagione da cui copiare"
                />
              </Field>

              <RolloverTypeList types={rolloverTypes} selected={selectedTypes} counts={sourceCounts} onToggle={toggleType} />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <InsetBlock>
                  <p className="font-brand text-[12.5px] font-semibold text-egw-ink">Restano disponibili senza copia</p>
                  <p className="mt-1 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">
                    {(overview?.globalTypes ?? []).map((entry) => entry.label).join(", ")}. Sono dati globali del club: valgono per tutte le stagioni.
                  </p>
                </InsetBlock>
                <InsetBlock>
                  <p className="font-brand text-[12.5px] font-semibold text-egw-ink">Non vengono mai riportati</p>
                  <p className="mt-1 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">
                    {(overview?.neverCopiedTypes ?? []).map((entry) => entry.label).join(", ")}. Appartengono alla stagione in cui sono nati.
                  </p>
                </InsetBlock>
              </div>
            </div>
          ) : null}

          {step === "tesserati" && rosterNonCaricato ? (
            <AlertBlock
              severity="warning"
              title="L'elenco dei tesserati non si e caricato"
              actions={
                <Button variant="secondary" size="sm" onClick={() => void loadRoster(sourceSeasonId)} loading={rosterLoading}>
                  Riprova
                </Button>
              }
            >
              Non si puo scegliere chi rinnova senza vederli: riprova, oppure torna indietro e togli «Tesserati nelle squadre» per riportare la sola configurazione.
            </AlertBlock>
          ) : null}

          {step === "tesserati" && !rosterNonCaricato ? (
            <RosterConfirmation roster={roster} loading={rosterLoading} confirmedIds={confirmedIds} onToggle={toggleConfirmed} onSelectAll={confirmAllAthletes} onSelectNone={confirmNoAthlete} disabled={busy} />
          ) : null}

          {step === "riepilogo" ? (
            <div className="flex flex-col gap-4 font-brand text-[13px] text-egw-ink">
              <p>
                Verra creata la stagione <strong>{form.label.trim() || "senza nome"}</strong> dal <span className="egw-num">{formatDateShort(form.startDate)}</span> al{" "}
                <span className="egw-num">{formatDateShort(form.endDate)}</span>, in stato <strong>{form.activate ? "attiva" : "futura"}</strong>.
              </p>

              {selectedDescriptors.length ? (
                <DrawerSection title={`Dalla stagione ${seasons.find((season) => season.id === sourceSeasonId)?.label || "selezionata"} verranno copiati:`}>
                  <ul className="flex flex-col">
                    {selectedDescriptors.map((type) => (
                      <li key={type.key} className="flex items-baseline justify-between gap-4 border-b border-dashed border-egw-hairline py-1.5 last:border-0">
                        <span>{type.label}</span>
                        {/* I tesserati: quanti ne entrano, non quanti ce ne sono. Il numero della sorgente qui diceva «209» sopra un «nessuno riconfermato» (ADR-0196). */}
                        {type.key === ATHLETE_MEMBERSHIP_ROLLOVER_TYPE ? (
                          <span className="egw-num font-bold">
                            {formatInteger(confirmedIds.size)} <span className="font-medium text-egw-ink-62">su {formatInteger(sourceCounts[type.key] ?? roster?.athletes.length ?? 0)}</span>
                          </span>
                        ) : (
                          <span className="egw-num font-bold">{formatInteger(sourceCounts[type.key] ?? 0)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11.5px] leading-[1.45] text-egw-ink-62">Ogni elemento copiato e un record nuovo della stagione di destinazione: modificarlo non tocca la stagione di origine.</p>
                </DrawerSection>
              ) : (
                <p className="text-egw-ink-62">Non verra copiato nulla: la stagione nasce vuota.</p>
              )}

              {/* Cio che NON viene riportato si dichiara, voce per voce: nessun riporto nascosto (ADR-0197 §29). */}
              <DrawerSection title="Non viene riportato">
                <ul className="flex flex-col" data-test="season-wizard-not-carried">
                  {rolloverTypes
                    .filter((type) => !selectedTypes.includes(type.key) && type.key !== ATHLETE_MEMBERSHIP_ROLLOVER_TYPE)
                    .map((type) => (
                      <li key={type.key} className="flex items-baseline justify-between gap-4 border-b border-dashed border-egw-hairline py-1.5 last:border-0 text-egw-ink-62">
                        <span>{type.label}</span>
                        <span className="egw-num">
                          0 <span className="font-medium">riportat{type.label.endsWith("i") ? "i" : "e"} su {formatInteger(sourceCounts[type.key] ?? 0)}</span>
                        </span>
                      </li>
                    ))}
                  {(overview?.neverCopiedTypes ?? []).map((entry) => (
                    <li key={entry.key} className="flex items-baseline justify-between gap-4 border-b border-dashed border-egw-hairline py-1.5 last:border-0 text-egw-ink-62">
                      <span>{entry.label}</span>
                      <span className="egw-num">0 <span className="font-medium">— lo storico resta nella stagione di origine</span></span>
                    </li>
                  ))}
                </ul>
              </DrawerSection>

              {/* I tesserati si dichiarano sempre, anche a zero. */}
              <InsetBlock>
                <p className="flex items-center gap-2 font-semibold">
                  <Users className="h-4 w-4" aria-hidden />
                  Tesserati
                </p>
                {carriesAthletes && confirmedIds.size === 0 ? (
                  <p className="mt-1 text-egw-ink-62">
                    <strong className="text-egw-ink">Nessun tesserato riconfermato: le squadre della stagione nuova nascono vuote.</strong>{" "}
                    {roster?.athletes.length ? (
                      <>
                        I <span className="egw-num">{formatInteger(roster.athletes.length)}</span> proposti restano nella stagione di origine, con la loro storia intatta. Se non e quello che vuoi, torna a «Tesserati» e spunta chi rinnova.
                      </>
                    ) : (
                      "Nella stagione di origine nessuno risulta in una squadra."
                    )}
                  </p>
                ) : carriesAthletes ? (
                  <p className="mt-1 text-egw-ink-62">
                    <span className="egw-num font-bold text-egw-ink">{formatInteger(confirmedIds.size)}</span> riconfermati entrano nelle squadre della stagione nuova;{" "}
                    <span className="egw-num font-bold text-egw-ink">{formatInteger(Math.max(0, (roster?.athletes.length ?? 0) - confirmedIds.size))}</span> restano fuori, con la loro storia intatta.
                  </p>
                ) : (
                  <p className="mt-1 text-egw-ink-62">
                    <strong className="text-egw-ink">Nessun tesserato verra riportato.</strong> Le categorie della stagione nuova nascono vuote: potrai assegnare gli atleti dopo, o tornare indietro e scegliere «Tesserati nelle squadre».
                  </p>
                )}
              </InsetBlock>
            </div>
          ) : null}
        </FieldSizeProvider>
      </Drawer>

      {/* ── Riporto verso una stagione gia esistente ── */}
      <Drawer
        open={Boolean(rolloverTarget)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRolloverTarget(null);
            setRolloverPreview(null);
          }
        }}
        width="wide"
        eyebrow="Stagioni"
        title={`Riporta dati in ${rolloverTarget?.label || ""}`}
        description="Gli elementi gia presenti non vengono duplicati: puoi rieseguire il riporto senza conseguenze."
        locked={busy}
        data-test="season-rollover-drawer"
        footer={
          <>
            <Button variant="primary" onClick={() => void confirmRollover()} loading={busy} disabled={!rolloverPreview || rolloverPreview.createdTotal === 0}>
              Conferma riporto
            </Button>
            <Button variant="secondary" onClick={() => void previewRollover()} disabled={busy || (carriesAthletes && (rosterLoading || rosterFallito))}>
              Calcola anteprima
            </Button>
          </>
        }
      >
        <FieldSizeProvider size="sm">
          <div className="flex flex-col gap-5">
            <Field label="Stagione di origine" htmlFor="rollover-source">
              <Select
                id="rollover-source"
                value={sourceSeasonId}
                onValueChange={(value) => {
                  setSourceSeasonId(value);
                  setRolloverPreview(null);
                  void loadRoster(value);
                }}
                options={selectableSources.map((season) => ({ value: season.id, label: `${season.label} — ${SEASON_STATUS_LABELS[season.status]}` }))}
                placeholder="Seleziona la stagione da cui copiare"
              />
            </Field>

            <RolloverTypeList
              types={rolloverTypes}
              selected={selectedTypes}
              counts={sourceCounts}
              onToggle={(key) => {
                toggleType(key);
                setRolloverPreview(null);
              }}
            />

            {carriesAthletes && rosterFallito ? (
              <AlertBlock
                severity="warning"
                title="L'elenco dei tesserati non si e caricato"
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void loadRoster(sourceSeasonId)} loading={rosterLoading}>
                    Riprova
                  </Button>
                }
              >
                Senza l&apos;elenco non si calcola l&apos;anteprima e non si conferma: riprova, oppure togli «Tesserati nelle squadre».
              </AlertBlock>
            ) : null}

            {carriesAthletes && !rosterFallito ? (
              <DrawerSection
                title={
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" aria-hidden />
                    Chi rinnova
                  </span>
                }
              >
                <RosterConfirmation
                  roster={roster}
                  loading={rosterLoading}
                  confirmedIds={confirmedIds}
                  onToggle={(athleteId) => {
                    toggleConfirmed(athleteId);
                    setRolloverPreview(null);
                  }}
                  onSelectAll={() => {
                    confirmAllAthletes();
                    setRolloverPreview(null);
                  }}
                  onSelectNone={() => {
                    confirmNoAthlete();
                    setRolloverPreview(null);
                  }}
                  disabled={busy}
                />
              </DrawerSection>
            ) : null}

            {rolloverPreview ? (
              <InsetBlock>
                <p className="font-brand text-[13px] font-semibold text-egw-ink">
                  Verranno creati <span className="egw-num">{formatInteger(rolloverPreview.createdTotal)}</span> elementi
                </p>
                <ul className="mt-2 flex flex-col font-brand text-[12.5px] text-egw-ink">
                  {rolloverPreview.entries.map((entry) => (
                    <li key={entry.type} className="flex items-baseline justify-between gap-4 border-b border-dashed border-egw-hairline py-1.5 last:border-0">
                      <span>{entry.label}</span>
                      <span className="egw-num text-egw-ink-62">
                        {formatInteger(entry.created)} nuovi / {formatInteger(entry.skipped)} gia presenti
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="egw-num mt-2 font-brand text-[11.5px] text-egw-ink-62">
                  Tesserati: {formatInteger(rolloverPreview.athletes.confirmed)} riconfermati su {formatInteger(rolloverPreview.athletes.proposed)} proposti, {formatInteger(rolloverPreview.athletes.notConfirmed)} restano fuori.
                </p>
              </InsetBlock>
            ) : (
              <p className="font-brand text-[12px] text-egw-ink-62">Calcola l&apos;anteprima per vedere cosa verrebbe creato: il riporto si conferma solo dopo.</p>
            )}
          </div>
        </FieldSizeProvider>
      </Drawer>

      {/* ── Conferme per le due operazioni che cambiano lo stato ── */}
      <ConfirmDialog
        open={Boolean(pendingActivation)}
        onOpenChange={(open) => !open && setPendingActivation(null)}
        onConfirm={() => (pendingActivation ? handleActivate(pendingActivation) : undefined)}
        title="Cambiare stagione attiva?"
        description={`Tutta l'applicazione passera a ${pendingActivation?.label || ""}. Nessun dato viene spostato: cambia solo il perimetro di cio che vedi.`}
        confirmLabel="Attiva stagione"
        loading={busy}
      />

      {/* ── Eliminazione definitiva: zona pericolosa (ADR-0197 §32) ── */}
      <Drawer
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDeleteTarget(null);
            setDeleteImpact(null);
          }
        }}
        width="narrow"
        eyebrow="Zona pericolosa"
        title={`Eliminare la stagione ${deleteTarget?.label || ""}?`}
        description="Questa operazione e irreversibile."
        locked={busy}
        data-test="season-delete-drawer"
        footer={
          <>
            <Button
              variant="danger"
              onClick={() => void handleDelete()}
              loading={busy}
              disabled={!deleteImpact?.canDelete || deleteConfirmation.trim() !== (deleteImpact?.confirmationText || "")}
              data-test="season-delete-confirm"
            >
              Elimina definitivamente
            </Button>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={busy}>
              Annulla
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4 font-brand text-[13px] text-egw-ink">
          <p>
            Stai per eliminare <strong>definitivamente</strong> la stagione <strong>{deleteTarget?.label}</strong>
            {deleteTarget ? (
              <>
                {" "}(dal <span className="egw-num">{formatDateShort(deleteTarget.startDate)}</span> al <span className="egw-num">{formatDateShort(deleteTarget.endDate)}</span>)
              </>
            ) : null}
            .
          </p>

          {deleteImpactError ? (
            <AlertBlock severity="danger" title="Impossibile leggere il contenuto della stagione">
              {deleteImpactError}
            </AlertBlock>
          ) : null}

          {!deleteImpact && !deleteImpactError ? <Skeleton className="h-24 w-full" /> : null}

          {deleteImpact ? (
            <>
              <DrawerSection title="Cosa contiene">
                <ul className="flex flex-col" data-test="season-delete-impact">
                  {deleteImpact.entries
                    .filter((entry) => entry.count > 0 || entry.classification === "cascade")
                    .map((entry) => (
                      <li key={entry.key} className="flex items-baseline justify-between gap-4 border-b border-dashed border-egw-hairline py-1.5 last:border-0">
                        <span className={cn(entry.classification === "block" && entry.count > 0 ? "text-egw-red-ink font-semibold" : undefined)}>
                          {entry.label}
                          {entry.classification === "detach" && entry.count > 0 ? <span className="text-egw-ink-62"> · verranno staccate</span> : null}
                          {entry.classification === "block" && entry.count > 0 ? <span> · impedisce l&apos;eliminazione</span> : null}
                        </span>
                        <span className="egw-num font-bold">{formatInteger(entry.count)}</span>
                      </li>
                    ))}
                </ul>
              </DrawerSection>

              {deleteImpact.isActive ? (
                <AlertBlock severity="warning" title="Questa stagione e attiva">
                  Prima di eliminare questa stagione, imposta un&apos;altra stagione come attiva.
                </AlertBlock>
              ) : deleteImpact.blockers.length ? (
                <AlertBlock severity="warning" title="Questa stagione ha una storia">
                  Eventi, presenze, movimenti e tesserati non si cancellano: sono cio che il club ha fatto. Archivia la stagione invece di eliminarla.
                </AlertBlock>
              ) : (
                <>
                  <AlertBlock severity="warning" title="Questa operazione e irreversibile">
                    La configurazione elencata sopra verra cancellata e la stagione sparira dall&apos;elenco. Per confermare scrivi <strong>{deleteImpact.confirmationText}</strong>.
                  </AlertBlock>
                  <Field label="Conferma" helper={`Scrivi esattamente: ${deleteImpact.confirmationText}`}>
                    <TextInput
                      value={deleteConfirmation}
                      onChange={(event) => setDeleteConfirmation(event.target.value)}
                      placeholder={deleteImpact.confirmationText}
                      autoComplete="off"
                      data-test="season-delete-confirmation"
                    />
                  </Field>
                </>
              )}
            </>
          ) : null}
        </div>
      </Drawer>

      <ConfirmDialog
        open={Boolean(pendingArchive)}
        onOpenChange={(open) => !open && setPendingArchive(null)}
        onConfirm={() => (pendingArchive ? handleArchive(pendingArchive) : undefined)}
        title={`Archiviare ${pendingArchive?.label || ""}?`}
        description="I dati restano consultabili e non vengono modificati. Una stagione archiviata non puo ricevere riporti finche non la riattivi."
        confirmLabel="Archivia"
        loading={busy}
      />
    </div>
  );
}

export default SeasonManager;
