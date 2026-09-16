"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SiteSelect } from "@/components/sites/site-filter";
import { isMultiSiteClub, type ClubSite } from "@/lib/club-sites";
import type { AthleteCategoryMembership } from "@/lib/athlete-category-memberships";
import {
  buildCategoryDisplayIndex,
  type CategoryGroupLike,
} from "@/lib/categories/display";
import { CategoryLabel } from "@/components/categories/category-label";
import { selectableCategoryOptions } from "@/lib/category-utils";

type CategoryOption = { id: string; name: string; configured?: boolean | null };

/**
 * Le categorie di un atleta nella finestra di modifica: primaria, sede della
 * primaria, secondarie.
 *
 * Estratto da `app/athletes/[id]/page.tsx`, che il Blocco 8 tiene sotto un
 * tetto di righe (WP-19): il campo sede andava aggiunto proprio qui, e
 * aggiungerlo in pagina avrebbe superato il tetto. Il pannello non possiede
 * lo stato — riceve le appartenenze normalizzate e restituisce le intenzioni
 * — cosi la pagina resta l'unico posto che decide come si salvano.
 *
 * La sede accompagna la **categoria primaria** e non l'anagrafica: dice dove
 * l'atleta svolge quella categoria (ADR-0038). Le secondarie nascono senza
 * sede, perche dedurla vorrebbe dire indovinare dove si allena.
 */
export function AthleteCategoriesPanel({
  categories,
  groups = [],
  memberships,
  primaryCategoryId,
  primarySiteId,
  sites,
  onPrimaryCategoryChange,
  onPrimarySiteChange,
  onToggleSecondaryCategory,
}: {
  categories: CategoryOption[];
  /**
   * I gruppi operativi del club (N3).
   *
   * Servono a scrivere «Under 15 · Formia» dove il nome da solo ne nomina due:
   * una categoria non porta una sede, la coppia (categoria, sede) e il gruppo
   * (ADR-0038). Senza, la tendina della **primaria** offre due voci identiche
   * proprio dove sceglierne una sbagliata sposta un ragazzo di squadra.
   */
  groups?: readonly CategoryGroupLike[];
  memberships: AthleteCategoryMembership[];
  primaryCategoryId: string;
  primarySiteId: string;
  sites: ClubSite[];
  onPrimaryCategoryChange: (categoryId: string) => void;
  onPrimarySiteChange: (siteId: string) => void;
  onToggleSecondaryCategory: (categoryId: string, enabled: boolean) => void;
}) {
  const display = React.useMemo(
    () => buildCategoryDisplayIndex({ categories, groups, sites }),
    [categories, groups, sites],
  );

  /*
    **Si sceglie solo fra cio che il club ha configurato** (ADR-0185).

    Il catalogo che arriva porta anche le voci nate solo perche una scheda le
    cita (`configured: false`): «Pulcini - S. Cosma» scritto dove serviva un
    identificativo. Offrirle qui era la terza Pulcini che il club non ha.
  */
  const options = React.useMemo(
    () => selectableCategoryOptions(categories),
    [categories],
  );

  return (
    <div className="space-y-3 rounded-egw-control border border-egw-hairline bg-egw-page-100 p-4">
      <div>
        <Label htmlFor="athlete-primary-category">Categoria primaria</Label>
        <select
          id="athlete-primary-category"
          value={primaryCategoryId}
          onChange={(event) => onPrimaryCategoryChange(event.target.value)}
          className="mt-2 w-full rounded-egw-control border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Seleziona categoria primaria</option>
          {/*
            La primaria che il club non ha piu fra le configurate — una riga
            storica, o una categoria cancellata — si **vede** e non si
            risceglie: senza questa voce la tendina mostrava il segnaposto
            come se l'atleta non avesse nessuna categoria.
          */}
          {primaryCategoryId &&
          !options.some((category) => category.id === primaryCategoryId) ? (
            <option value={primaryCategoryId} disabled>
              {display.label(
                memberships.find(
                  (membership) => membership.categoryId === primaryCategoryId,
                ) ?? primaryCategoryId,
              )}{" "}
              (non configurata)
            </option>
          ) : null}
          {options.map((category) => (
            <option
              key={`athlete-primary-category-${category.id}`}
              value={category.id}
            >
              {display.label(category.id)}
            </option>
          ))}
        </select>
      </div>

      {isMultiSiteClub(sites) ? (
        <div>
          <Label htmlFor="athlete-primary-site">Sede</Label>
          <SiteSelect
            id="athlete-primary-site"
            sites={sites}
            value={primarySiteId}
            onChange={onPrimarySiteChange}
            emptyLabel="Nessuna sede"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Dove svolge la categoria primaria. Senza sede resta visibile con
            qualunque filtro.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Categorie secondarie</Label>
        {options.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((category) => {
              const isPrimary = primaryCategoryId === category.id;
              const isSelected = memberships.some(
                (membership) =>
                  membership.categoryId === category.id && !membership.isPrimary,
              );

              return (
                <label
                  key={`athlete-secondary-category-${category.id}`}
                  className={`flex items-center gap-2 rounded-egw-control border px-3 py-2 text-sm ${
                    isPrimary
                      ? "cursor-not-allowed border-egw-hairline bg-egw-page-100 text-egw-ink-42"
                      : "cursor-pointer border-egw-hairline bg-white"
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={isPrimary}
                    onCheckedChange={(checked) =>
                      onToggleSecondaryCategory(category.id, Boolean(checked))
                    }
                  />
                  <CategoryLabel category={category.id} index={display} />
                </label>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nessuna categoria disponibile per il club.
          </p>
        )}
      </div>
    </div>
  );
}
