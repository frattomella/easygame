"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SiteSelect } from "@/components/sites/site-filter";
import { isMultiSiteClub, type ClubSite } from "@/lib/club-sites";
import type { AthleteCategoryMembership } from "@/lib/athlete-category-memberships";

type CategoryOption = { id: string; name: string };

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
  memberships,
  primaryCategoryId,
  primarySiteId,
  sites,
  onPrimaryCategoryChange,
  onPrimarySiteChange,
  onToggleSecondaryCategory,
}: {
  categories: CategoryOption[];
  memberships: AthleteCategoryMembership[];
  primaryCategoryId: string;
  primarySiteId: string;
  sites: ClubSite[];
  onPrimaryCategoryChange: (categoryId: string) => void;
  onPrimarySiteChange: (siteId: string) => void;
  onToggleSecondaryCategory: (categoryId: string, enabled: boolean) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <div>
        <Label htmlFor="athlete-primary-category">Categoria primaria</Label>
        <select
          id="athlete-primary-category"
          value={primaryCategoryId}
          onChange={(event) => onPrimaryCategoryChange(event.target.value)}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Seleziona categoria primaria</option>
          {categories.map((category) => (
            <option
              key={`athlete-primary-category-${category.id}`}
              value={category.id}
            >
              {category.name}
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
        {categories.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((category) => {
              const isPrimary = primaryCategoryId === category.id;
              const isSelected = memberships.some(
                (membership) =>
                  membership.categoryId === category.id && !membership.isPrimary,
              );

              return (
                <label
                  key={`athlete-secondary-category-${category.id}`}
                  className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    isPrimary
                      ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                      : "cursor-pointer border-slate-200 bg-white"
                  }`}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={isPrimary}
                    onCheckedChange={(checked) =>
                      onToggleSecondaryCategory(category.id, Boolean(checked))
                    }
                  />
                  <span>{category.name}</span>
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
