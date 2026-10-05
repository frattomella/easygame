"use client";

import * as React from "react";
import { Modal } from "@/components/web/overlays/Modal";
import { Button } from "@/components/web/primitives/Button";
import { Field, Select } from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import { sportsApi } from "@/lib/sports/client";
import type { TeamSeasonOption } from "@/components/sports/teams/team-options";

/**
 * «Crea dalle categorie della stagione»: per ogni categoria della stagione
 * senza squadra ne nasce una, e quelle con lo stesso nome si collegano. E un
 * aiuto della prima configurazione, non una decisione irreversibile: il
 * server (`createTeamsFromSeasonCategories`) fa il lavoro, qui si sceglie la
 * stagione e si dice com'e andata.
 */
export function TeamsFromCategoriesModal({
  open,
  onOpenChange,
  seasons,
  activeSeasonId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seasons: readonly TeamSeasonOption[];
  activeSeasonId: string | null;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [seasonId, setSeasonId] = React.useState<string>(activeSeasonId || "");
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setSeasonId(activeSeasonId || seasons[0]?.id || "");
      setError(null);
    }
  }, [open, activeSeasonId, seasons]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    const response = await sportsApi.teamsFromCategories(seasonId || undefined);
    setRunning(false);
    if (response.error || !response.data) {
      setError(response.error?.message || "Impossibile creare le squadre");
      return;
    }
    const { created, linked } = response.data;
    showToast(
      "success",
      created || linked
        ? `${created} ${created === 1 ? "squadra creata" : "squadre create"} · ${linked} ${linked === 1 ? "collegata" : "collegate"}`
        : "Ogni categoria della stagione ha già la sua squadra",
    );
    onDone();
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!running) onOpenChange(next);
      }}
      title="Crea le squadre dalle categorie"
      description="Per ogni categoria della stagione che non ha ancora una squadra ne nasce una con lo stesso nome; le squadre che esistono già con quel nome vengono collegate. Potrai rinominarle e correggerle."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={running}>
            Annulla
          </Button>
          <Button variant="primary" onClick={() => void run()} loading={running} disabled={!seasonId}>
            Crea le squadre
          </Button>
        </>
      }
    >
      <Field label="Stagione" htmlFor="teams-from-categories-season">
        <Select
          id="teams-from-categories-season"
          value={seasonId || null}
          onValueChange={setSeasonId}
          options={seasons.map((season) => ({ value: season.id, label: season.active ? `${season.label} (attiva)` : season.label }))}
          disabled={running}
        />
      </Field>
      {error ? (
        <p role="alert" className="mt-3 text-[12.5px] font-medium text-egw-red">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
