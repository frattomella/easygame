"use client";

import React from "react";
import { Label } from "@/components/ui/label";
import type { CategoryGroup } from "@/lib/club-sites";

/**
 * Con chi si allena questo allenamento (ADR-0055).
 *
 * **Perche non basta la categoria.** Un allenamento delle 18:00 in palestra a
 * Santi Cosma non riguarda «i Pulcini»: riguarda i Pulcini **di Santi Cosma**.
 * Selezionare la categoria significava, all'apertura dell'appello, trovarsi
 * davanti anche i Pulcini di Scauri — che a quell'ora sono a trenta chilometri
 * di distanza.
 *
 * **Perche selezione multipla e non un allenamento per gruppo.** Due sedi
 * vicine che si allenano insieme una volta al mese sono **un** allenamento,
 * con due gruppi. Duplicarlo vorrebbe dire due appelli da tenere allineati,
 * due volte le stesse ore nei conteggi, e due righe da correggere quando
 * l'orario cambia.
 *
 * **Il club mono-sede non vede niente di diverso.** Con un gruppo per
 * categoria le etichette sono i nomi delle categorie, esattamente come prima:
 * il concetto di gruppo resta trasparente a chi non ha il problema.
 */

export type TrainingGroupOption = Pick<
  CategoryGroup,
  "id" | "name" | "categoryId" | "categoryName" | "siteId" | "siteName"
>;

export function TrainingGroupSelector({
  groups,
  selectedGroupIds,
  onToggle,
  idPrefix = "training-group",
  error,
}: {
  groups: TrainingGroupOption[];
  selectedGroupIds: string[];
  onToggle: (group: TrainingGroupOption, checked: boolean) => void;
  idPrefix?: string;
  error?: string | null;
}) {
  /*
    L'etichetta porta la sede solo quando serve a distinguere: con una squadra
    sola per categoria «Pulcini · Scauri» aggiunge rumore e non informazione.
  */
  const groupsPerCategory = React.useMemo(() => {
    const counts = new Map<string, number>();
    groups.forEach((group) => {
      counts.set(group.categoryId, (counts.get(group.categoryId) || 0) + 1);
    });
    return counts;
  }, [groups]);

  return (
    <div className="space-y-2">
      <Label>Gruppi</Label>
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
        {groups.length ? (
          groups.map((group) => {
            const showSite =
              (groupsPerCategory.get(group.categoryId) || 0) > 1 &&
              Boolean(group.siteName);

            return (
              <label
                key={group.id}
                htmlFor={`${idPrefix}-${group.id}`}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  id={`${idPrefix}-${group.id}`}
                  className="h-4 w-4 rounded border-gray-300"
                  checked={selectedGroupIds.includes(group.id)}
                  onChange={(event) => onToggle(group, event.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block truncate">{group.categoryName}</span>
                  {showSite ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {group.siteName}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })
        ) : (
          <p className="px-2 py-1 text-sm text-muted-foreground">
            Nessun gruppo configurato
          </p>
        )}
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

/**
 * Le categorie che discendono dai gruppi scelti.
 *
 * Il resto dell'applicazione continua a ragionare per categoria — colori,
 * titoli, compatibilita — e continua a funzionare senza sapere dei gruppi.
 * Quello che i gruppi aggiungono e **dove**, non **cosa**.
 */
export const categoryIdsFromGroups = (
  groups: readonly TrainingGroupOption[],
  selectedGroupIds: readonly string[],
) =>
  Array.from(
    new Set(
      groups
        .filter((group) => selectedGroupIds.includes(group.id))
        .map((group) => group.categoryId)
        .filter(Boolean),
    ),
  );

/**
 * I gruppi che coprono le categorie di un allenamento senza gruppi dichiarati.
 *
 * Serve ad aprire in modifica un allenamento creato prima dei gruppi: le
 * spunte partono da dove il dato lo colloca oggi, cioe tutte le squadre di
 * quelle categorie, e chi modifica puo restringerle.
 */
export const groupIdsForCategories = (
  groups: readonly TrainingGroupOption[],
  categoryIds: readonly string[],
) => {
  const wanted = new Set(
    categoryIds.map((id) => String(id || "").trim().toLowerCase()).filter(Boolean),
  );

  return groups
    .filter((group) => wanted.has(group.categoryId.trim().toLowerCase()))
    .map((group) => group.id);
};
