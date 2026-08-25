"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildCategoryGroupId,
  buildCategoryGroupLabel,
  getActiveClubSites,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";

const NO_STRUCTURE = "__no_structure__";

type StructureOption = { id: string; name: string; siteId?: string };

type DraftGroup = {
  enabled: boolean;
  structureId: string;
};

/**
 * Dove si svolge una categoria.
 *
 * L'editor scrive **gruppi operativi**, non categorie: spuntare Roma e
 * Aprilia su «Pulcini» produce `Pulcini · Roma` e `Pulcini · Aprilia`, e la
 * categoria `Pulcini` resta una sola con la sua fascia d'anno e la sua
 * compatibilita ([ADR-0038](../../../docs/knowledge-base/18-decision-log.md)).
 *
 * Togliere tutte le spunte non lascia la categoria orfana: senza gruppi
 * configurati la lettura ne deriva uno implicito, cioe la categoria stessa.
 */
export function CategoryGroupsEditor({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  sites,
  structures = [],
  groups,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  sites: ClubSite[];
  structures?: StructureOption[];
  groups: CategoryGroup[];
  onSave: (nextGroupsForCategory: CategoryGroup[]) => void | Promise<void>;
}) {
  const activeSites = useMemo(() => getActiveClubSites(sites), [sites]);
  const configured = useMemo(
    () =>
      groups.filter(
        (group) => group.categoryId === categoryId && !group.implicit,
      ),
    [groups, categoryId],
  );

  const [draft, setDraft] = useState<Record<string, DraftGroup>>({});
  const [saving, setSaving] = useState(false);

  // Il draft si (ri)costruisce all'apertura: fuori dal dialogo non serve, e
  // ricostruirlo a ogni render sovrascriverebbe le spunte dell'utente.
  React.useEffect(() => {
    if (!open) return;

    const next: Record<string, DraftGroup> = {};
    activeSites.forEach((site) => {
      const existing = configured.find((group) => group.siteId === site.id);
      next[site.id] = {
        enabled: Boolean(existing),
        structureId: existing?.structureId || "",
      };
    });
    setDraft(next);
  }, [open, activeSites, configured]);

  const save = async () => {
    const nextGroups: CategoryGroup[] = activeSites
      .filter((site) => draft[site.id]?.enabled)
      .map((site) => {
        const existing = configured.find((group) => group.siteId === site.id);

        return {
          id: existing?.id || buildCategoryGroupId(categoryId, site.id),
          name: buildCategoryGroupLabel(categoryName, site.name),
          categoryId,
          categoryName,
          siteId: site.id,
          siteName: site.name,
          structureId: draft[site.id]?.structureId || null,
          notes: existing?.notes || "",
          active: true,
          implicit: false,
          raw: existing?.raw,
        } satisfies CategoryGroup;
      });

    setSaving(true);
    try {
      await onSave(nextGroups);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dove si svolge «{categoryName}»</DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-6 text-slate-600">
          Le sedi spuntate diventano gruppi operativi. La categoria non viene
          duplicata: resta una sola, con la sua fascia d&apos;anno e le sue
          compatibilita.
        </p>

        <div className="space-y-3">
          {activeSites.map((site) => {
            const entry = draft[site.id] || { enabled: false, structureId: "" };
            const siteStructures = structures.filter(
              (structure) =>
                !structure.siteId || structure.siteId === site.id,
            );

            return (
              <div key={site.id} className="rounded-lg border bg-white p-3">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`group-site-${site.id}`}
                    checked={entry.enabled}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({
                        ...current,
                        [site.id]: {
                          structureId: current[site.id]?.structureId || "",
                          enabled: checked === true,
                        },
                      }))
                    }
                  />
                  <Label
                    htmlFor={`group-site-${site.id}`}
                    className="font-medium"
                  >
                    {buildCategoryGroupLabel(categoryName, site.name)}
                  </Label>
                </div>

                {entry.enabled && siteStructures.length ? (
                  <div className="mt-3">
                    <Label
                      htmlFor={`group-structure-${site.id}`}
                      className="text-xs text-slate-500"
                    >
                      Struttura abituale
                    </Label>
                    <Select
                      value={entry.structureId || NO_STRUCTURE}
                      onValueChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          [site.id]: {
                            enabled: true,
                            structureId: value === NO_STRUCTURE ? "" : value,
                          },
                        }))
                      }
                    >
                      <SelectTrigger
                        id={`group-structure-${site.id}`}
                        className="mt-1"
                      >
                        <SelectValue placeholder="Nessuna struttura" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_STRUCTURE}>
                          Nessuna struttura
                        </SelectItem>
                        {siteStructures.map((structure) => (
                          <SelectItem key={structure.id} value={structure.id}>
                            {structure.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Annulla
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
