"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { Checkbox, Toggle } from "@/components/web/primitives/Controls";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { Field, FormGrid, Select, TextInput } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import { sportsApi, type CompetitionDto } from "@/lib/sports/client";
import {
  COMPETITION_KIND_OPTIONS,
  draftToStandings,
  emptyStandingsRow,
  moveStandingsRow,
  STANDINGS_NUMBER_COLUMNS,
  standingsRowsWithoutTeam,
  standingsToDraft,
  type CompetitionKind,
  type StandingsNumberKey,
  type StandingsRowDraft,
} from "@/components/sports/competitions/competitions-model";

/**
 * **Crea o modifica una competizione, con la sua classifica** (ADR-0200 §8).
 * Scrive solo da `POST /api/v1/competitions` (unico scrittore
 * `src/lib/server/competitions.ts`). La classifica e quella che il club
 * inserisce: EasyGame non la calcola dalle gare, perche conosce solo le sue.
 */

const NONE = "__none__";

type CompetitionDraft = {
  name: string;
  shortName: string;
  seasonId: string;
  kind: CompetitionKind;
  active: boolean;
  standings: StandingsRowDraft[];
};

const draftFrom = (competition: CompetitionDto | null, defaultSeasonId: string | null): CompetitionDraft => ({
  name: competition?.name || "",
  shortName: competition?.shortName || "",
  seasonId: competition ? competition.seasonId || "" : defaultSeasonId || "",
  kind: competition?.kind || "league",
  active: competition ? competition.active : true,
  standings: standingsToDraft(competition?.standings || []),
});

const comparable = (draft: CompetitionDraft) =>
  JSON.stringify({ ...draft, standings: draft.standings.map(({ key: _ignored, ...rest }) => rest) });

export type CompetitionDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competition: CompetitionDto | null;
  seasons: ReadonlyArray<{ id: string; label: string; active: boolean }>;
  defaultSeasonId: string | null;
  onSaved: (competition: CompetitionDto) => void;
};

export function CompetitionDrawer({ open, onOpenChange, competition, seasons, defaultSeasonId, onSaved }: CompetitionDrawerProps) {
  const { showToast } = useToast();
  const [draft, setDraft] = React.useState<CompetitionDraft>(() => draftFrom(competition, defaultSeasonId));
  const [initial, setInitial] = React.useState(() => comparable(draftFrom(competition, defaultSeasonId)));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nameError, setNameError] = React.useState<string | null>(null);
  const [standingsError, setStandingsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const next = draftFrom(competition, defaultSeasonId);
    setDraft(next);
    setInitial(comparable(next));
    setError(null);
    setNameError(null);
    setStandingsError(null);
  }, [open, competition, defaultSeasonId]);

  const update = (patch: Partial<CompetitionDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const updateRow = (key: string, patch: Partial<StandingsRowDraft>) =>
    setDraft((current) => ({
      ...current,
      standings: current.standings.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));

  const dirty = comparable(draft) !== initial;

  const handleSave = async () => {
    if (saving) return;
    const name = draft.name.trim();
    const orphans = standingsRowsWithoutTeam(draft.standings);
    setNameError(name ? null : "Dai un nome alla competizione");
    setStandingsError(orphans.length ? "Ogni riga della classifica con dei numeri deve avere il nome della squadra." : null);
    if (!name || orphans.length) return;

    setSaving(true);
    setError(null);
    const response = await sportsApi.saveCompetition({
      ...(competition ? { id: competition.id } : {}),
      name,
      shortName: draft.shortName.trim(),
      seasonId: draft.seasonId || null,
      kind: draft.kind,
      active: draft.active,
      standings: draftToStandings(draft.standings),
    });
    setSaving(false);
    if (response.error || !response.data) {
      const message = response.error?.message || "Impossibile salvare la competizione";
      setError(message);
      showToast("error", message);
      return;
    }
    showToast("success", competition ? `Competizione «${response.data.name}» salvata` : `Competizione «${response.data.name}» creata`);
    setInitial(comparable(draft));
    onSaved(response.data);
    onOpenChange(false);
  };

  const seasonOptions = [
    { value: NONE, label: "Nessuna stagione" },
    ...seasons.map((season) => ({ value: season.id, label: season.active ? `${season.label} (attiva)` : season.label })),
  ];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Competizione"
      title={competition ? `Modifica «${competition.name}»` : "Nuova competizione"}
      description="Un campionato, una coppa o un torneo: classifica le gare e compare sul sito del club."
      dirty={dirty && !saving}
      locked={saving}
      footer={
        <>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
            {competition ? "Salva" : "Crea competizione"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      {error ? (
        <AlertBlock severity="danger" title="Il salvataggio non è riuscito" className="mb-5">
          {error}
        </AlertBlock>
      ) : null}

      <DrawerSection eyebrow="Dati">
        <FormGrid>
          <Field label="Nome" htmlFor="competition-name" required error={nameError}>
            <TextInput
              id="competition-name"
              value={draft.name}
              onChange={(event) => update({ name: event.target.value.slice(0, 120) })}
              placeholder="Serie C Gold girone B"
              disabled={saving}
            />
          </Field>
          <Field label="Nome breve" htmlFor="competition-short-name" optional>
            <TextInput
              id="competition-short-name"
              value={draft.shortName}
              onChange={(event) => update({ shortName: event.target.value.slice(0, 40) })}
              placeholder="Serie C"
              disabled={saving}
            />
          </Field>
          <Field label="Stagione" htmlFor="competition-season">
            <Select
              id="competition-season"
              value={draft.seasonId || NONE}
              onValueChange={(value) => update({ seasonId: value === NONE ? "" : value })}
              options={seasonOptions}
              disabled={saving}
            />
          </Field>
          <Field label="Tipo" htmlFor="competition-kind">
            <Select
              id="competition-kind"
              value={draft.kind}
              onValueChange={(value) => update({ kind: value as CompetitionKind })}
              options={COMPETITION_KIND_OPTIONS}
              disabled={saving}
            />
          </Field>
        </FormGrid>
        <div className="mt-4 flex items-center justify-between gap-3">
          <label htmlFor="competition-active" className="font-brand text-[12px] font-semibold text-egw-ink-62">
            Competizione attiva
          </label>
          <Toggle id="competition-active" checked={draft.active} onCheckedChange={(next) => update({ active: next })} disabled={saving} />
        </div>
        <p className="mt-1 text-[11.5px] text-egw-ink-62">Una competizione non attiva non si propone più nelle gare nuove.</p>
      </DrawerSection>

      <DrawerSection eyebrow="Classifica">
        <InfoCard className="mb-3">
          La classifica la inserisce il club: EasyGame non la calcola, perché conosce solo le gare del club. Tutti i numeri
          sono facoltativi; spunta «Club» sulla riga della tua squadra.
        </InfoCard>
        {draft.standings.length ? (
          <div className="egw-scroll max-w-full overflow-x-auto rounded-egw-field border border-egw-hairline">
            <table className="w-full min-w-max border-collapse text-[12.5px]">
              <caption className="sr-only">Classifica della competizione</caption>
              <thead>
                <tr className="bg-egw-page-100 text-left text-egw-ink-62">
                  <th scope="col" className="px-2 py-2 font-semibold">
                    <abbr title="Posizione" className="no-underline">Pos.</abbr>
                  </th>
                  <th scope="col" className="px-2 py-2 font-semibold">Squadra</th>
                  <th scope="col" className="px-2 py-2 text-center font-semibold">Club</th>
                  {STANDINGS_NUMBER_COLUMNS.map((column) => (
                    <th key={column.key} scope="col" className="px-1 py-2 text-center font-semibold">
                      <abbr title={column.label} className="no-underline">{column.short}</abbr>
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-2 font-semibold">
                    <span className="sr-only">Azioni</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.standings.map((row, index) => {
                  const teamLabel = row.team.trim() || `riga ${index + 1}`;
                  return (
                    <tr key={row.key} className={row.isClub ? "border-t border-egw-hairline bg-egw-tint-blue" : "border-t border-egw-hairline"}>
                      <td className="px-1 py-1">
                        <TextInput
                          type="number"
                          inputMode="numeric"
                          numeric
                          aria-label={`Posizione di ${teamLabel}`}
                          value={row.position}
                          onChange={(event) => updateRow(row.key, { position: event.target.value })}
                          disabled={saving}
                          className="h-9 w-[56px] px-2"
                        />
                      </td>
                      <td className="px-1 py-1">
                        <TextInput
                          aria-label={`Nome della squadra, riga ${index + 1}`}
                          value={row.team}
                          onChange={(event) => updateRow(row.key, { team: event.target.value.slice(0, 80) })}
                          disabled={saving}
                          className="h-9 w-[180px] px-2"
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <Checkbox
                          aria-label={`${teamLabel} è il club`}
                          checked={row.isClub}
                          onChange={(event) => updateRow(row.key, { isClub: event.target.checked })}
                          disabled={saving}
                        />
                      </td>
                      {STANDINGS_NUMBER_COLUMNS.map((column) => (
                        <td key={column.key} className="px-1 py-1">
                          <TextInput
                            type="number"
                            inputMode="numeric"
                            numeric
                            aria-label={`${column.label} di ${teamLabel}`}
                            value={row[column.key as StandingsNumberKey]}
                            onChange={(event) => updateRow(row.key, { [column.key]: event.target.value } as Partial<StandingsRowDraft>)}
                            disabled={saving}
                            className="h-9 w-[58px] px-2"
                          />
                        </td>
                      ))}
                      <td className="px-1 py-1">
                        <div className="flex items-center gap-1">
                          <IconButton
                            aria-label={`Sposta su ${teamLabel}`}
                            size="xs"
                            onClick={() => update({ standings: moveStandingsRow(draft.standings, index, -1) })}
                            disabled={saving || index === 0}
                          >
                            <ArrowUp />
                          </IconButton>
                          <IconButton
                            aria-label={`Sposta giù ${teamLabel}`}
                            size="xs"
                            onClick={() => update({ standings: moveStandingsRow(draft.standings, index, 1) })}
                            disabled={saving || index === draft.standings.length - 1}
                          >
                            <ArrowDown />
                          </IconButton>
                          <IconButton
                            aria-label={`Togli ${teamLabel}`}
                            size="xs"
                            variant="danger"
                            onClick={() => update({ standings: draft.standings.filter((item) => item.key !== row.key) })}
                            disabled={saving}
                          >
                            <Trash2 />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[12.5px] text-egw-ink-62">Nessuna riga: la classifica non compare sul sito.</p>
        )}
        {standingsError ? (
          <p role="alert" className="mt-2 text-[11.5px] font-medium text-egw-red">
            {standingsError}
          </p>
        ) : null}
        {draft.standings.length < 40 ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => update({ standings: [...draft.standings, emptyStandingsRow(draft.standings.length + 1)] })}
            disabled={saving}
          >
            Aggiungi una riga
          </Button>
        ) : null}
      </DrawerSection>
    </Drawer>
  );
}
