"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  CATEGORY_SITE_SEPARATOR,
  buildCategoryDisplayIndex,
  type CategoryDisplay,
  type CategoryDisplayEntry,
  type CategoryDisplayIndex,
  type CategoryGroupLike,
  type SiteDisplayEntry,
} from "@/lib/categories/display";

/**
 * **La categoria scritta, con la sede accanto solo quando serve** (N3, D-INT-3).
 *
 * Una sola primitiva di resa, non una copia per schermata. La regola su *quando*
 * accostare la sede sta nel dominio (`@/lib/categories/display`); qui sta solo
 * come si vede: la sede e **secondaria**, cioe piu piccola e smorzata, perche
 * il nome della squadra resta la cosa che si legge e la sede e cio che
 * distingue due scritte altrimenti uguali.
 *
 * Non e un'etichetta di identita: chi sceglie una categoria manda
 * l'identificativo. Vedi ADR-0155.
 *
 * La Web corrente e il redesign V2 montano **questo** componente: la sede si
 * scrive «Pulcini · Scauri» in tutti e due, con il separatore del dominio, e
 * mai con un identificativo tecnico (ADR-0185).
 */
export function CategoryLabel({
  category,
  index,
  categories,
  groups,
  sites,
  className,
  siteClassName,
}: {
  /** L'identificativo della categoria, o la voce di catalogo. */
  category: unknown;
  /** L'indice gia costruito: da preferire dentro un elenco. */
  index?: CategoryDisplayIndex;
  /** In alternativa, il catalogo: l'indice si costruisce al volo. */
  categories?: readonly CategoryDisplayEntry[];
  groups?: readonly CategoryGroupLike[];
  /** Il catalogo sedi: risolve il `siteId` dei gruppi letti grezzi. */
  sites?: readonly SiteDisplayEntry[];
  className?: string;
  siteClassName?: string;
}) {
  const descritta: CategoryDisplay = React.useMemo(() => {
    const indice =
      index || buildCategoryDisplayIndex({ categories, groups, sites });
    return indice.describe(category);
  }, [index, categories, groups, sites, category]);

  if (!descritta.site) {
    return <span className={className}>{descritta.name}</span>;
  }

  return (
    <span className={cn("inline-flex items-baseline gap-1", className)}>
      <span>{descritta.name}</span>
      {/*
        La sede sta in un elemento suo e non dentro la stessa stringa: chi legge
        con lo schermo la sente come parte del nome, e chi guarda la vede come
        un dettaglio. `whitespace-nowrap` perche «· Formia» non deve andare a
        capo da solo su 375 px.
      */}
      <span
        className={cn(
          "whitespace-nowrap text-[0.85em] font-normal text-muted-foreground",
          siteClassName,
        )}
      >
        {CATEGORY_SITE_SEPARATOR.trimStart()}
        {descritta.site}
      </span>
    </span>
  );
}
