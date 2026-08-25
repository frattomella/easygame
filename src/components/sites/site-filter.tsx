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
import { MapPin } from "lucide-react";
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
 * **Non si monta se il club non e multi-sede** ([ADR-0036](../../../docs/knowledge-base/18-decision-log.md)):
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
