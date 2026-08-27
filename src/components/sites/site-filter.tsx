"use client";

import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MapPin, Users } from "lucide-react";
import {
  getActiveClubSites,
  isMultiSiteClub,
  type ClubSite,
} from "@/lib/club-sites";

/** Valore del filtro quando non si vuole restringere a nessuna sede. */
export const ALL_SITES_VALUE = "__all_sites__";

/**
 * Filtro sede.
 *
 * **Non si monta se il club non e multi-sede** ([ADR-0038](../../../docs/knowledge-base/18-decision-log.md)):
 * un club con una sola sede vedrebbe un menu con una voce sola, cioe rumore.
 * Il controllo sta qui e non nelle pagine, cosi ogni schermata che vuole il
 * filtro lo ottiene con la stessa regola senza riscriverla.
 */
export function SiteFilter({
  sites,
  value,
  onChange,
  label = "Sede",
  className,
  id = "site-filter",
}: {
  sites: ClubSite[];
  value: string;
  onChange: (siteId: string) => void;
  label?: string;
  className?: string;
  id?: string;
}) {
  if (!isMultiSiteClub(sites)) {
    return null;
  }

  const activeSites = getActiveClubSites(sites);

  return (
    <div className={className}>
      <Label htmlFor={id} className="text-xs text-slate-500">
        {label}
      </Label>
      <Select
        value={value || ALL_SITES_VALUE}
        onValueChange={(next) =>
          onChange(next === ALL_SITES_VALUE ? "" : next)
        }
      >
        <SelectTrigger id={id} className="mt-1 w-full sm:w-56">
          <MapPin className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
          <SelectValue placeholder="Tutte le sedi" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SITES_VALUE}>Tutte le sedi</SelectItem>
          {activeSites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Valore del filtro quando non si vuole restringere a nessun gruppo. */
export const ALL_GROUPS_VALUE = "__all_groups__";

/**
 * Filtro **gruppo operativo**: `Pulcini · Roma`.
 *
 * **Perche esiste** (RC Fix 2, punto 13). Le liste erano gia separate per
 * gruppo — una scheda per squadra, con il proprio conteggio — ma per arrivare
 * a una squadra si poteva solo scegliere la sede e poi scorrere. Su un club
 * con sei categorie in tre sedi sono diciotto schede da attraversare per
 * arrivare a quella che si cercava.
 *
 * **Sede → Gruppo, oppure direttamente Gruppo.** Le due strade convivono: se
 * una sede e selezionata questo elenco mostra solo le sue squadre, altrimenti
 * le mostra tutte con la sede scritta nell'etichetta. Non e un secondo modo di
 * filtrare per sede: e il modo di arrivare a **una** squadra.
 *
 * **Non si monta con una squadra sola.** Come il filtro sede, e per la stessa
 * ragione: un menu con una voce sola e rumore. Un club mono-sede non lo vede
 * mai, perche li gruppo e categoria sono la stessa cosa (ADR-0055).
 */
export function CategoryGroupFilter({
  groups,
  value,
  onChange,
  label = "Gruppo",
  className,
  id = "group-filter",
}: {
  /** Gia filtrati per la sede scelta, se ce n'e una. */
  groups: { id: string; name: string }[];
  value: string;
  onChange: (groupId: string) => void;
  label?: string;
  className?: string;
  id?: string;
}) {
  if (groups.length < 2) {
    return null;
  }

  return (
    <div className={className}>
      <Label htmlFor={id} className="text-xs text-slate-500">
        {label}
      </Label>
      <Select
        value={value || ALL_GROUPS_VALUE}
        onValueChange={(next) =>
          onChange(next === ALL_GROUPS_VALUE ? "" : next)
        }
      >
        <SelectTrigger id={id} className="mt-1 w-full sm:w-56">
          <Users className="mr-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <SelectValue placeholder="Tutti i gruppi" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_GROUPS_VALUE}>Tutti i gruppi</SelectItem>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Selettore della sede di un record (struttura, gruppo). A differenza del
 * filtro **si monta sempre che ci sia almeno una sede**: assegnare una sede a
 * una struttura ha senso anche mentre il club ne sta configurando la seconda.
 */
export function SiteSelect({
  sites,
  value,
  onChange,
  id = "site-select",
  emptyLabel = "Nessuna sede",
  disabled = false,
}: {
  sites: ClubSite[];
  value: string;
  onChange: (siteId: string) => void;
  id?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const activeSites = getActiveClubSites(sites);

  if (!activeSites.length) {
    return null;
  }

  return (
    <Select
      value={value || ALL_SITES_VALUE}
      onValueChange={(next) => onChange(next === ALL_SITES_VALUE ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="mt-2">
        <SelectValue placeholder={emptyLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_SITES_VALUE}>{emptyLabel}</SelectItem>
        {activeSites.map((site) => (
          <SelectItem key={site.id} value={site.id}>
            {site.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
