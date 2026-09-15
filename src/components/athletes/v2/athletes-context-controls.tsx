"use client";

import * as React from "react";
import { MapPin, Users } from "lucide-react";
import { ContextControl } from "@/components/web/page/PageHeader";
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/web/primitives/Overlays";
import {
  getActiveClubSites,
  isMultiSiteClub,
  type ClubSite,
} from "@/lib/club-sites";
import {
  ALL_GROUPS_VALUE,
  ALL_SITES_VALUE,
} from "@/components/sites/site-filter";

/**
 * I controlli di contesto dell'elenco Atleti (guideline 09 §9.2): sede e
 * gruppo operativo. Cambiano cosa la pagina *significa*, quindi stanno a
 * destra del titolo e non nella barra dei filtri.
 *
 * Sono la forma V2 di `SiteFilter` e `CategoryGroupFilter`
 * (`src/components/sites/site-filter.tsx`), con le **stesse regole di
 * montaggio**: la sede non compare se il club non e multi-sede (ADR-0038), il
 * gruppo non compare con meno di due squadre (ADR-0055). I valori sentinella
 * «tutte» sono quelli condivisi, cosi il contratto con la pagina — stringa
 * vuota = nessuna restrizione — resta identico.
 */
export function SiteContextControl({
  sites,
  value,
  onChange,
  id = "athletes-site-filter",
}: {
  sites: ClubSite[];
  value: string;
  onChange: (siteId: string) => void;
  id?: string;
}) {
  if (!isMultiSiteClub(sites)) {
    return null;
  }

  const activeSites = getActiveClubSites(sites);
  const current = activeSites.find((site) => site.id === value);

  return (
    <Menu>
      <MenuTrigger asChild>
        <ContextControl id={id} icon={<MapPin />}>
          <span className="sr-only">Sede: </span>
          {current ? current.name : "Tutte le sedi"}
        </ContextControl>
      </MenuTrigger>
      <MenuContent align="end" width={240}>
        <MenuLabel>Sede</MenuLabel>
        <MenuRadioGroup
          value={value || ALL_SITES_VALUE}
          onValueChange={(next) =>
            onChange(next === ALL_SITES_VALUE ? "" : next)
          }
        >
          <MenuRadioItem value={ALL_SITES_VALUE}>Tutte le sedi</MenuRadioItem>
          {activeSites.map((site) => (
            <MenuRadioItem key={site.id} value={site.id}>
              {site.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

export function GroupContextControl({
  groups,
  value,
  onChange,
  id = "athletes-group-filter",
}: {
  /** Gia filtrati per la sede scelta, se ce n'e una. */
  groups: { id: string; name: string }[];
  value: string;
  onChange: (groupId: string) => void;
  id?: string;
}) {
  if (groups.length < 2) {
    return null;
  }

  const current = groups.find((group) => group.id === value);

  return (
    <Menu>
      <MenuTrigger asChild>
        <ContextControl id={id} icon={<Users />}>
          <span className="sr-only">Gruppo: </span>
          {current ? current.name : "Tutti i gruppi"}
        </ContextControl>
      </MenuTrigger>
      <MenuContent align="end" width={262}>
        <MenuLabel>Gruppo</MenuLabel>
        <MenuRadioGroup
          value={value || ALL_GROUPS_VALUE}
          onValueChange={(next) =>
            onChange(next === ALL_GROUPS_VALUE ? "" : next)
          }
        >
          <MenuRadioItem value={ALL_GROUPS_VALUE}>Tutti i gruppi</MenuRadioItem>
          {groups.map((group) => (
            <MenuRadioItem key={group.id} value={group.id}>
              {group.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
