"use client";

import * as React from "react";
import { buildMembershipTargetIndex } from "@/lib/categories/placement";
import { supabase } from "@/lib/supabase";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { selectableCategoryOptions } from "@/lib/category-utils";
import {
  buildCategoryGroups,
  compareCategoryGroups,
  getActiveCategoryGroups,
  labelCategoryGroupOptions,
  normalizeClubSites,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";

/**
 * Il catalogo con cui una persona in prova si colloca: **le stesse** categorie,
 * sedi e gruppi della scheda atleta, lette dalle stesse sorgenti e descritte
 * dallo stesso indice canonico (ADR-0185). Le opzioni sono solo le voci
 * configurate (`selectableCategoryOptions`): un'etichetta storica non e una
 * squadra fra cui scegliere. Nessuna etichetta composta qui.
 */
export type TrialCategoryOption = { id: string; name: string; label: string };
export type TrialGroupOption = { id: string; label: string; categoryId: string; siteId: string };
/** Una squadra scegliibile per la prova: categoria, gruppo (vuoto se la categoria non ha sedi) e sede derivata. */
export type TrialTargetOption = { id: string; label: string; categoryId: string; groupId: string; siteId: string };

export function useTrialCatalog(clubId: string | null | undefined) {
  const [categories, setCategories] = React.useState<Array<{ id: string; name: string; configured?: boolean | null }>>([]);
  const [sites, setSites] = React.useState<ClubSite[]>([]);
  const [groups, setGroups] = React.useState<CategoryGroup[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let annullato = false;
    if (!clubId) {
      setCategories([]);
      setSites([]);
      setGroups([]);
      return;
    }
    setLoading(true);
    (async () => {
      const [{ data: categoriesData }, { data: clubData }] = await Promise.all([
        supabase.from("categories").select("*").eq("club_id", clubId).order("created_at", { ascending: true }),
        supabase.from("clubs").select("club_sites, category_groups").eq("id", clubId).single(),
      ]);
      if (annullato) return;
      const elenco = (Array.isArray(categoriesData) ? categoriesData : []).map((voce: any) => ({
        ...voce,
        id: String(voce?.id || ""),
        name: String(voce?.name || ""),
      }));
      const sedi = normalizeClubSites(clubData?.club_sites);
      setCategories(elenco);
      setSites(sedi);
      setGroups(buildCategoryGroups({ categories: elenco, sites: sedi, groups: clubData?.category_groups }));
      setLoading(false);
    })().catch(() => {
      if (!annullato) setLoading(false);
    });
    return () => {
      annullato = true;
    };
  }, [clubId]);

  const display = React.useMemo(() => buildCategoryDisplayIndex({ categories, groups, sites }), [categories, groups, sites]);

  const categoryOptions = React.useMemo<TrialCategoryOption[]>(
    () =>
      selectableCategoryOptions(categories)
        .filter((voce) => voce.id)
        .map((voce) => ({ id: voce.id, name: voce.name, label: display.label(voce.id) })),
    [categories, display],
  );

  const groupOptions = React.useMemo<TrialGroupOption[]>(() => {
    const attivi = getActiveCategoryGroups(groups).filter((group) => !group.implicit).slice().sort(compareCategoryGroups);
    const etichetta = labelCategoryGroupOptions(attivi);
    return attivi.map((group) => ({ id: group.id, label: etichetta(group), categoryId: group.categoryId, siteId: group.siteId }));
  }, [groups]);

  const siteOptions = React.useMemo(() => sites.map((site) => ({ id: site.id, label: site.name })), [sites]);

  /*
    Le squadre scegliibili (ADR-0194 §16): una per gruppo operativo attivo,
    la categoria nuda dove non ha sedi. La persona in prova sceglie una
    squadra, e categoria, gruppo e sede della prova sono quelli della squadra.
  */
  const targetIndex = React.useMemo(
    () => buildMembershipTargetIndex({ categories: selectableCategoryOptions(categories), groups: groups.filter((g) => !g.implicit), sites }),
    [categories, groups, sites],
  );
  const targetOptions = React.useMemo<TrialTargetOption[]>(
    () =>
      targetIndex.targets.map((target) => ({
        id: target.id,
        label: target.label,
        categoryId: target.categoryId,
        groupId: target.implicit ? "" : target.id,
        siteId: target.siteId,
      })),
    [targetIndex],
  );

  return { loading, categories, sites, groups, display, categoryOptions, groupOptions, siteOptions, targetIndex, targetOptions };
}
