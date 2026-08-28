"use client";

import React from "react";
import {
  Archive,
  ArrowRightLeft,
  CalendarRange,
  Check,
  Plus,
  Search,
  TriangleAlert,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListSkeleton } from "@/components/ui/app-loading-screen";
import { useToast } from "@/components/ui/toast-notification";
import {
  ATHLETE_MEMBERSHIP_ROLLOVER_TYPE,
  SEASON_STATUS_LABELS,
  type ClubSeason,
  type ClubSeasonStatus,
} from "@/lib/club-seasons";
import {
  createSeason,
  fetchSeasonRoster,
  fetchSeasonsOverview,
  runSeasonRollover,
  updateSeasonStatus,
  type SeasonRoster,
  type SeasonRolloverSummary,
  type SeasonsOverview,
} from "@/lib/api/seasons";
import { cn } from "@/lib/utils";

/**
 * Scheda «Stagioni» di Organizzazione (Blocco 6).
 *
 * Sta in un componente e non in `page.tsx` perche la pagina Organizzazione e
 * gia una pagina a nove schede: la logica di dominio non ci deve stare
 * (CLAUDE.md, sezione 11.2). Il componente non conosce Prisma ne `fetch`:
 * parla solo con `@/lib/api/seasons`.
 */

type SeasonManagerProps = {
  /** Chiamata quando cambia la stagione attiva, per riallineare la topbar. */
  onActiveSeasonChange?: (season: ClubSeason) => void;
};

type WizardStep = "periodo" | "riporto" | "tesserati" | "riepilogo";

const STATUS_BADGE_CLASS: Record<ClubSeasonStatus, string> = {
  active: "bg-blue-600 text-white hover:bg-blue-600",
  upcoming: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  archived: "bg-slate-200 text-slate-600 hover:bg-slate-200",
};

const formatDay = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("it-IT");
};

const emptyForm = { label: "", startDate: "", endDate: "", activate: false };

/**
 * L'elenco di riconferma: chi c'era, tutti proposti, si toglie chi non rinnova.
 *
 * E una lista verticale e non una tabella perche deve restare usabile a 375 px
 * con duecento righe: una tabella a scorrimento orizzontale, su una scelta da
 * fare riga per riga, non lo e.
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
    if (!needle) {
      return athletes;
    }
    return athletes.filter(
      (athlete) =>
        athlete.fullName.toLowerCase().includes(needle) ||
        athlete.memberships.some((membership) =>
          membership.categoryName.toLowerCase().includes(needle),
        ),
    );
  }, [athletes, query]);

  if (loading) {
    return <ListSkeleton rows={4} />;
  }

  if (!athletes.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p className="font-medium">Nessun tesserato da riconfermare</p>
        <p className="text-muted-foreground">
          Nella stagione di origine non risulta nessun atleta assegnato a una
          squadra. La stagione nuova nascera con le categorie vuote.
        </p>
      </div>
    );
  }

  const notConfirmed = athletes.length - confirmedIds.size;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          <strong className="eg-tabular">{confirmedIds.size}</strong> riconfermati
          su <span className="eg-tabular">{athletes.length}</span>
          {notConfirmed ? (
            <span className="text-muted-foreground">
              {" "}
              · <span className="eg-tabular">{notConfirmed}</span> restano fuori
            </span>
          ) : null}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            disabled={disabled}
          >
            Tutti
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectNone}
            disabled={disabled}
          >
            Nessuno
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca per nome o squadra"
          className="pl-9"
          aria-label="Cerca fra i tesserati da riconfermare"
        />
      </div>

      <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {filtered.map((athlete) => (
          <li key={athlete.athleteId}>
            <label className="flex items-start gap-3 rounded-xl border p-3">
              <Checkbox
                checked={confirmedIds.has(athlete.athleteId)}
                onCheckedChange={() => onToggle(athlete.athleteId)}
                disabled={disabled}
                aria-label={`Riconferma ${athlete.fullName}`}
              />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block break-words text-sm font-medium">
                  {athlete.fullName}
                </span>
                <span className="flex flex-wrap gap-1">
                  {athlete.memberships.map((membership) => (
                    <Badge
                      key={membership.membershipId}
                      variant="outline"
                      className="max-w-full break-words text-xs font-normal"
                    >
                      {membership.categoryName}
                      {membership.isPrimary ? " · principale" : ""}
                    </Badge>
                  ))}
                </span>
              </span>
            </label>
          </li>
        ))}
        {!filtered.length ? (
          <li className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            Nessun tesserato corrisponde alla ricerca.
          </li>
        ) : null}
      </ul>

      <p className="text-xs text-muted-foreground">
        Chi resta fuori non viene cancellato: mantiene la sua storia e le sue
        appartenenze passate, e semplicemente non entra nelle squadre della
        stagione nuova.
      </p>
    </div>
  );
}

export function SeasonManager({ onActiveSeasonChange }: SeasonManagerProps) {
  const { showToast } = useToast();
  const [overview, setOverview] = React.useState<SeasonsOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [step, setStep] = React.useState<WizardStep>("periodo");
  const [form, setForm] = React.useState(emptyForm);
  const [sourceSeasonId, setSourceSeasonId] = React.useState<string>("");
  const [selectedTypes, setSelectedTypes] = React.useState<string[]>([]);
  const [roster, setRoster] = React.useState<SeasonRoster | null>(null);
  const [rosterLoading, setRosterLoading] = React.useState(false);
  const [confirmedIds, setConfirmedIds] = React.useState<Set<string>>(
    () => new Set(),
  );

  const [rolloverTarget, setRolloverTarget] = React.useState<ClubSeason | null>(
    null,
  );
  const [rolloverPreview, setRolloverPreview] =
    React.useState<SeasonRolloverSummary | null>(null);
  const [lastSummary, setLastSummary] =
    React.useState<SeasonRolloverSummary | null>(null);
  const [pendingArchive, setPendingArchive] = React.useState<ClubSeason | null>(
    null,
  );
  const [pendingActivation, setPendingActivation] =
    React.useState<ClubSeason | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await fetchSeasonsOverview();
      setOverview(data);
      return data;
    } catch (error: any) {
      showToast("error", error?.message || "Errore nel caricamento delle stagioni");
      return null;
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const rolloverTypes = overview?.rolloverTypes ?? [];
  const seasons = React.useMemo(() => overview?.seasons ?? [], [overview]);

  const countsFor = (seasonId: string) => overview?.counts?.[seasonId] || {};

  const selectableSources = React.useMemo(
    () => seasons.filter((season) => season.id !== rolloverTarget?.id),
    [seasons, rolloverTarget],
  );

  const openWizard = () => {
    setForm(emptyForm);
    setStep("periodo");
    setSourceSeasonId(overview?.activeSeasonId || "");
    setSelectedTypes(
      rolloverTypes.filter((type) => type.defaultSelected).map((type) => type.key),
    );
    setLastSummary(null);
    setRoster(null);
    setConfirmedIds(new Set());
    setWizardOpen(true);
  };

  const toggleType = (key: string) => {
    setSelectedTypes((current) =>
      current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key],
    );
  };

  const carriesAthletes = selectedTypes.includes(
    ATHLETE_MEMBERSHIP_ROLLOVER_TYPE,
  );

  /**
   * Carica l'elenco di riconferma e lo propone **tutto selezionato**: il caso
   * normale e che la squadra rinnovi, e chi non rinnova lo si toglie.
   */
  const loadRoster = React.useCallback(
    async (seasonId: string) => {
      if (!seasonId) {
        return null;
      }
      setRosterLoading(true);
      try {
        const data = await fetchSeasonRoster(seasonId);
        setRoster(data);
        setConfirmedIds(
          new Set(data.athletes.map((athlete) => athlete.athleteId)),
        );
        return data;
      } catch (error: any) {
        showToast(
          "error",
          error?.message || "Errore nel caricamento dei tesserati",
        );
        return null;
      } finally {
        setRosterLoading(false);
      }
    },
    [showToast],
  );

  const toggleConfirmed = (athleteId: string) => {
    setConfirmedIds((current) => {
      const next = new Set(current);
      if (next.has(athleteId)) {
        next.delete(athleteId);
      } else {
        next.add(athleteId);
      }
      return next;
    });
  };

  const confirmAllAthletes = () =>
    setConfirmedIds(
      new Set((roster?.athletes ?? []).map((athlete) => athlete.athleteId)),
    );

  const confirmNoAthlete = () => setConfirmedIds(new Set());

  /**
   * Gli id da mandare al server. `null` quando i tesserati non si portano: e
   * diverso da «nessuno riconfermato», e il server lo distingue.
   */
  const confirmedAthleteIds = carriesAthletes
    ? Array.from(confirmedIds)
    : null;

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

  /**
   * Il passo di riconferma esiste solo se i tesserati si portano: chi non li
   * porta non deve attraversare una schermata che non lo riguarda.
   */
  const goToTesserati = async () => {
    if (!carriesAthletes) {
      setStep("riepilogo");
      return;
    }

    const loaded = roster?.seasonId === sourceSeasonId ? roster : null;
    setStep("tesserati");
    if (!loaded) {
      await loadRoster(sourceSeasonId);
    }
  };

  const previousStep: WizardStep =
    step === "riepilogo"
      ? carriesAthletes
        ? "tesserati"
        : "riporto"
      : step === "tesserati"
        ? "riporto"
        : "periodo";

  const handleCreate = async () => {
    setBusy(true);
    try {
      const result = await createSeason({
        label: form.label.trim() || undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        activate: form.activate,
        rollover: selectedTypes.length
          ? {
              sourceSeasonId: sourceSeasonId || undefined,
              types: selectedTypes,
              athleteIds: confirmedAthleteIds,
            }
          : null,
      });

      setWizardOpen(false);
      setLastSummary(result.rollover);
      const refreshed = await load();

      if (form.activate && refreshed) {
        const active = refreshed.seasons.find(
          (season) => season.id === refreshed.activeSeasonId,
        );
        if (active) {
          onActiveSeasonChange?.(active);
        }
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

  const openRollover = async (season: ClubSeason) => {
    setRolloverTarget(season);
    setRolloverPreview(null);
    const fallbackSource =
      seasons.find((entry) => entry.id !== season.id)?.id || "";
    const nextSource =
      overview?.activeSeasonId && overview.activeSeasonId !== season.id
        ? overview.activeSeasonId
        : fallbackSource;
    setSourceSeasonId(nextSource);
    setSelectedTypes(
      rolloverTypes.filter((type) => type.defaultSelected).map((type) => type.key),
    );
    setRoster(null);
    setConfirmedIds(new Set());
    await loadRoster(nextSource);
  };

  const previewRollover = async () => {
    if (!rolloverTarget || !sourceSeasonId || !selectedTypes.length) {
      showToast("error", "Scegli la stagione di origine e almeno un tipo di dato");
      return;
    }

    setBusy(true);
    try {
      const summary = await runSeasonRollover({
        targetSeasonId: rolloverTarget.id,
        sourceSeasonId,
        types: selectedTypes,
        athleteIds: confirmedAthleteIds,
        preview: true,
      });
      setRolloverPreview(summary);
    } catch (error: any) {
      showToast("error", error?.message || "Errore nel calcolo del riporto");
    } finally {
      setBusy(false);
    }
  };

  const confirmRollover = async () => {
    if (!rolloverTarget) {
      return;
    }

    setBusy(true);
    try {
      const summary = await runSeasonRollover({
        targetSeasonId: rolloverTarget.id,
        sourceSeasonId,
        types: selectedTypes,
        athleteIds: confirmedAthleteIds,
      });
      setRolloverTarget(null);
      setRolloverPreview(null);
      setLastSummary(summary);
      await load();
      showToast(
        "success",
        `Riportati ${summary.createdTotal} elementi e ${summary.athletes.carried} tesserati in ${summary.targetSeasonLabel}`,
      );
    } catch (error: any) {
      showToast("error", error?.message || "Errore durante il riporto");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <ListSkeleton rows={3} />;
  }

  const sourceCounts = countsFor(sourceSeasonId);
  const selectedDescriptors = rolloverTypes.filter((type) =>
    selectedTypes.includes(type.key),
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Stagioni sportive</CardTitle>
          <Button onClick={openWizard} disabled={busy} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nuova stagione
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            La stagione attiva e il perimetro dei dati che vedi in tutta
            l&apos;applicazione. Le stagioni archiviate restano consultabili: per
            rileggerle basta attivarle di nuovo.
          </p>

          {/*
            L'avviso che manca oggi: dopo un cambio di stagione il club deve
            sapere subito quanti atleti sono rimasti senza squadra, invece di
            scoprirlo a settembre aprendo un elenco vuoto.
          */}
          {overview?.athletesWithoutTeam ? (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong className="eg-tabular">
                    {overview.athletesWithoutTeam}
                  </strong>{" "}
                  atleti non appartengono a nessuna squadra della stagione
                  attiva.
                </span>
              </p>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <a href="/athletes">Assegnali</a>
              </Button>
            </div>
          ) : null}

          <div className="space-y-3">
            {seasons.map((season) => {
              const counts = countsFor(season.id);
              const total = Object.values(counts).reduce(
                (sum, value) => sum + value,
                0,
              );

              return (
                <div
                  key={season.id}
                  className="flex flex-col gap-3 rounded-2xl border p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display font-semibold text-slate-900">
                        {season.label}
                      </h3>
                      <Badge className={cn(STATUS_BADGE_CLASS[season.status])}>
                        {SEASON_STATUS_LABELS[season.status]}
                      </Badge>
                    </div>
                    <p className="eg-tabular text-sm text-muted-foreground">
                      {formatDay(season.startDate)} — {formatDay(season.endDate)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {total} voci di configurazione stagionale
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || season.id === overview?.activeSeasonId}
                      onClick={() => setPendingActivation(season)}
                    >
                      <Check className="mr-2 h-4 w-4" />
                      {season.id === overview?.activeSeasonId
                        ? "Stagione attiva"
                        : "Attiva"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy || season.status === "archived"}
                      onClick={() => void openRollover(season)}
                    >
                      <ArrowRightLeft className="mr-2 h-4 w-4" />
                      Riporta dati
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        busy ||
                        season.status === "archived" ||
                        season.id === overview?.activeSeasonId
                      }
                      onClick={() => setPendingArchive(season)}
                    >
                      <Archive className="mr-2 h-4 w-4" />
                      Archivia
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {lastSummary ? (
        <Card>
          <CardHeader>
            <CardTitle>Ultimo riporto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Da <strong>{lastSummary.sourceSeasonLabel}</strong> a{" "}
              <strong>{lastSummary.targetSeasonLabel}</strong>:{" "}
              {lastSummary.createdTotal} elementi creati,{" "}
              {lastSummary.skippedTotal} gia presenti e quindi non duplicati.
            </p>
            {/*
              La riga sui tesserati c'e sempre, anche a zero. Prima il riepilogo
              diceva «6 voci create» e taceva sulle persone: il club credeva di
              aver traslocato e aveva le squadre vuote.
            */}
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <strong className="eg-tabular">
                {lastSummary.athletes.carried}
              </strong>{" "}
              tesserati riportati su{" "}
              <span className="eg-tabular">{lastSummary.athletes.proposed}</span>{" "}
              proposti
              {lastSummary.athletes.notConfirmed ? (
                <>
                  ,{" "}
                  <span className="eg-tabular">
                    {lastSummary.athletes.notConfirmed}
                  </span>{" "}
                  non riconfermati
                </>
              ) : null}
              {lastSummary.athletes.alreadyPresent ? (
                <>
                  ,{" "}
                  <span className="eg-tabular">
                    {lastSummary.athletes.alreadyPresent}
                  </span>{" "}
                  gia presenti
                </>
              ) : null}
              {lastSummary.athletes.unmappable ? (
                <>
                  ,{" "}
                  <span className="eg-tabular">
                    {lastSummary.athletes.unmappable}
                  </span>{" "}
                  senza squadra di destinazione
                </>
              ) : null}
              .{" "}
              {lastSummary.athletes.requested ? null : (
                <span className="text-muted-foreground">
                  I tesserati non erano fra i tipi scelti.
                </span>
              )}
            </p>
            <ul className="space-y-1">
              {lastSummary.entries.map((entry) => (
                <li key={entry.type} className="flex justify-between gap-4">
                  <span>{entry.label}</span>
                  <span className="eg-tabular text-muted-foreground">
                    {entry.created} creati / {entry.skipped} saltati
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Procedura guidata: periodo, cosa riportare, riconferma, riepilogo */}
      <Dialog open={wizardOpen} onOpenChange={(open) => !busy && setWizardOpen(open)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuova stagione</DialogTitle>
            <DialogDescription>
              {step === "periodo"
                ? "Indica il periodo della stagione."
                : step === "riporto"
                  ? "Scegli cosa riportare dalla stagione precedente."
                  : step === "tesserati"
                    ? "Chi rinnova? Sono proposti tutti: togli chi non riconfermi."
                    : "Controlla cosa verra creato prima di confermare."}
            </DialogDescription>
          </DialogHeader>

          {step === "periodo" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="season-label">Nome</Label>
                  <Input
                    id="season-label"
                    value={form.label}
                    placeholder="Es. 2027/2028"
                    onChange={(event) =>
                      setForm((current) => ({ ...current, label: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="season-start">Inizio</Label>
                  <Input
                    id="season-start"
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="season-end">Fine</Label>
                  <Input
                    id="season-end"
                    type="date"
                    value={form.endDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        endDate: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-xl border p-3">
                <Checkbox
                  checked={form.activate}
                  onCheckedChange={(checked) =>
                    setForm((current) => ({
                      ...current,
                      activate: Boolean(checked),
                    }))
                  }
                />
                <span className="space-y-1">
                  <span className="block text-sm font-medium">
                    Rendila subito la stagione attiva
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Senza questa scelta la stagione nasce «futura»: la prepari
                    con calma e la attivi quando comincia davvero.
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          {step === "riporto" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Stagione di origine</Label>
                <Select value={sourceSeasonId} onValueChange={setSourceSeasonId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona la stagione da cui copiare" />
                  </SelectTrigger>
                  <SelectContent>
                    {seasons.map((season) => (
                      <SelectItem key={season.id} value={season.id}>
                        {season.label} — {SEASON_STATUS_LABELS[season.status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {rolloverTypes.map((type) => (
                  <label
                    key={type.key}
                    className="flex items-start gap-3 rounded-xl border p-3"
                  >
                    <Checkbox
                      checked={selectedTypes.includes(type.key)}
                      onCheckedChange={() => toggleType(type.key)}
                    />
                    <span className="min-w-0 space-y-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {type.label}
                        <span className="eg-tabular text-xs text-muted-foreground">
                          {sourceCounts[type.key] ?? 0}
                        </span>
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {type.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-medium">Restano disponibili senza copia</p>
                  <p className="text-muted-foreground">
                    {(overview?.globalTypes ?? [])
                      .map((entry) => entry.label)
                      .join(", ")}
                    . Sono dati globali del club: valgono per tutte le stagioni.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="font-medium">Non vengono mai riportati</p>
                  <p className="text-muted-foreground">
                    {(overview?.neverCopiedTypes ?? [])
                      .map((entry) => entry.label)
                      .join(", ")}
                    . Appartengono alla stagione in cui sono nati.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {step === "tesserati" ? (
            <RosterConfirmation
              roster={roster}
              loading={rosterLoading}
              confirmedIds={confirmedIds}
              onToggle={toggleConfirmed}
              onSelectAll={confirmAllAthletes}
              onSelectNone={confirmNoAthlete}
              disabled={busy}
            />
          ) : null}

          {step === "riepilogo" ? (
            <div className="space-y-3 text-sm">
              <p>
                Verra creata la stagione{" "}
                <strong>{form.label.trim() || "senza nome"}</strong> dal{" "}
                <span className="eg-tabular">{formatDay(form.startDate)}</span> al{" "}
                <span className="eg-tabular">{formatDay(form.endDate)}</span>, in
                stato{" "}
                <strong>{form.activate ? "attiva" : "futura"}</strong>.
              </p>

              {selectedDescriptors.length ? (
                <div className="space-y-2">
                  <p className="font-medium">
                    Dalla stagione{" "}
                    {seasons.find((season) => season.id === sourceSeasonId)?.label ||
                      "selezionata"}{" "}
                    verranno copiati:
                  </p>
                  <ul className="space-y-1">
                    {selectedDescriptors.map((type) => (
                      <li key={type.key} className="flex justify-between gap-4">
                        <span>{type.label}</span>
                        <span className="eg-tabular text-muted-foreground">
                          {sourceCounts[type.key] ?? 0}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Ogni elemento copiato e un record nuovo della stagione di
                    destinazione: modificarlo non tocca la stagione di origine.
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Non verra copiato nulla: la stagione nasce vuota.
                </p>
              )}

              {/*
                I tesserati si dichiarano sempre, anche a zero: il difetto che
                questa Wave chiude non e solo che non venivano portati, e che
                nessuna schermata lo diceva.
              */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center gap-2 font-medium">
                  <Users className="h-4 w-4" />
                  Tesserati
                </p>
                {carriesAthletes ? (
                  <p className="text-muted-foreground">
                    <span className="eg-tabular">{confirmedIds.size}</span>{" "}
                    riconfermati entrano nelle squadre della stagione nuova;{" "}
                    <span className="eg-tabular">
                      {Math.max(
                        0,
                        (roster?.athletes.length ?? 0) - confirmedIds.size,
                      )}
                    </span>{" "}
                    restano fuori, con la loro storia intatta.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    <strong>Nessun tesserato verra riportato.</strong> Le
                    categorie della stagione nuova nascono vuote: potrai
                    assegnare gli atleti dopo, o tornare indietro e scegliere
                    «Tesserati nelle squadre».
                  </p>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {step !== "periodo" ? (
              <Button
                variant="outline"
                onClick={() => setStep(previousStep)}
                disabled={busy}
              >
                Indietro
              </Button>
            ) : null}

            {step === "periodo" ? (
              <Button onClick={goToRiporto}>Avanti</Button>
            ) : null}
            {step === "riporto" ? (
              <Button onClick={() => void goToTesserati()} disabled={busy}>
                Avanti
              </Button>
            ) : null}
            {step === "tesserati" ? (
              <Button onClick={() => setStep("riepilogo")} disabled={rosterLoading}>
                Avanti
              </Button>
            ) : null}
            {step === "riepilogo" ? (
              <Button onClick={() => void handleCreate()} disabled={busy}>
                <CalendarRange className="mr-2 h-4 w-4" />
                Crea stagione
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Riporto verso una stagione gia esistente */}
      <Dialog
        open={Boolean(rolloverTarget)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRolloverTarget(null);
            setRolloverPreview(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Riporta dati in {rolloverTarget?.label}
            </DialogTitle>
            <DialogDescription>
              Gli elementi gia presenti non vengono duplicati: puoi rieseguire il
              riporto senza conseguenze.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Stagione di origine</Label>
              <Select
                value={sourceSeasonId}
                onValueChange={(value) => {
                  setSourceSeasonId(value);
                  setRolloverPreview(null);
                  void loadRoster(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona la stagione da cui copiare" />
                </SelectTrigger>
                <SelectContent>
                  {selectableSources.map((season) => (
                    <SelectItem key={season.id} value={season.id}>
                      {season.label} — {SEASON_STATUS_LABELS[season.status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rolloverTypes.map((type) => (
                <label
                  key={type.key}
                  className="flex items-start gap-3 rounded-xl border p-3"
                >
                  <Checkbox
                    checked={selectedTypes.includes(type.key)}
                    onCheckedChange={() => {
                      toggleType(type.key);
                      setRolloverPreview(null);
                    }}
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {type.label}
                      <span className="eg-tabular text-xs text-muted-foreground">
                        {sourceCounts[type.key] ?? 0}
                      </span>
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {type.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            {carriesAthletes ? (
              <div className="space-y-2 rounded-xl border p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Chi rinnova
                </p>
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
              </div>
            ) : null}

            {rolloverPreview ? (
              <div className="rounded-xl border p-3 text-sm">
                <p className="font-medium">
                  Verranno creati {rolloverPreview.createdTotal} elementi
                </p>
                <ul className="mt-2 space-y-1">
                  {rolloverPreview.entries.map((entry) => (
                    <li key={entry.type} className="flex justify-between gap-4">
                      <span>{entry.label}</span>
                      <span className="eg-tabular text-muted-foreground">
                        {entry.created} nuovi / {entry.skipped} gia presenti
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Tesserati: {rolloverPreview.athletes.confirmed} riconfermati su{" "}
                  {rolloverPreview.athletes.proposed} proposti,{" "}
                  {rolloverPreview.athletes.notConfirmed} restano fuori.
                </p>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => void previewRollover()}
              disabled={busy}
            >
              Calcola anteprima
            </Button>
            <Button
              onClick={() => void confirmRollover()}
              disabled={busy || !rolloverPreview || rolloverPreview.createdTotal === 0}
            >
              Conferma riporto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conferme per le due operazioni che cambiano lo stato */}
      <ConfirmDialog
        isOpen={Boolean(pendingActivation)}
        onClose={() => setPendingActivation(null)}
        onConfirm={() =>
          pendingActivation ? void handleActivate(pendingActivation) : undefined
        }
        title="Cambiare stagione attiva?"
        description={`Tutta l'applicazione passera a ${
          pendingActivation?.label || ""
        }. Nessun dato viene spostato: cambia solo il perimetro di cio che vedi.`}
        confirmText="Attiva stagione"
        type="question"
      />

      <ConfirmDialog
        isOpen={Boolean(pendingArchive)}
        onClose={() => setPendingArchive(null)}
        onConfirm={() =>
          pendingArchive ? void handleArchive(pendingArchive) : undefined
        }
        title={`Archiviare ${pendingArchive?.label || ""}?`}
        description="I dati restano consultabili e non vengono modificati. Una stagione archiviata non puo ricevere riporti finche non la riattivi."
        confirmText="Archivia"
        type="warning"
      />
    </div>
  );
}

export default SeasonManager;
