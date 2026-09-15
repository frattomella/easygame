"use client";

import * as React from "react";
import { CalendarRange, Trophy } from "lucide-react";
import { ContextControl } from "@/components/web/page/PageHeader";
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/web/primitives/Overlays";
import type { ClubSeason } from "@/lib/club-seasons";
import { fiscalYearChoices } from "../accounting-view";

/**
 * I controlli di contesto della prima nota (guideline 09 §9.2): anno fiscale
 * e stagione sportiva. Cambiano cosa la pagina *significa* — il perimetro dei
 * totali e dell'elenco — quindi stanno a destra del titolo e non nella barra
 * dei filtri della griglia.
 *
 * Sono due assi diversi, e le rotte li accettano entrambi (`fiscal_year`,
 * `season_id`): un anno fiscale non e una stagione, e nessuno dei due si
 * deduce dall'altro. Il valore sentinella «tutti» e la stringa vuota, come
 * per ogni filtro della V1: un parametro che c'e ma non dice niente e piu
 * pericoloso di uno che manca.
 */
const ALL = "__all__";

export function FiscalYearContextControl({
  value,
  onChange,
  id = "prima-nota-anno-fiscale",
}: {
  value: string;
  onChange: (fiscalYear: string) => void;
  id?: string;
}) {
  const anni = fiscalYearChoices();
  return (
    <Menu>
      <MenuTrigger asChild>
        <ContextControl id={id} icon={<CalendarRange />}>
          <span className="sr-only">Anno fiscale: </span>
          {value ? `Anno fiscale ${value}` : "Tutti gli anni"}
        </ContextControl>
      </MenuTrigger>
      <MenuContent align="end" width={220}>
        <MenuLabel>Anno fiscale</MenuLabel>
        <MenuRadioGroup value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
          <MenuRadioItem value={ALL}>Tutti gli anni</MenuRadioItem>
          {anni.map((anno) => (
            <MenuRadioItem key={anno} value={String(anno)}>
              {anno}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

/**
 * Si monta solo se il club ha almeno una stagione leggibile: senza l'elenco
 * il controllo sarebbe un menu con una voce sola, cioe rumore.
 */
export function SeasonContextControl({
  seasons,
  value,
  onChange,
  id = "prima-nota-stagione",
}: {
  seasons: ClubSeason[];
  value: string;
  onChange: (seasonId: string) => void;
  id?: string;
}) {
  if (!seasons.length) return null;
  const current = seasons.find((season) => season.id === value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <ContextControl id={id} icon={<Trophy />}>
          <span className="sr-only">Stagione: </span>
          {current ? current.label : "Tutte le stagioni"}
        </ContextControl>
      </MenuTrigger>
      <MenuContent align="end" width={240}>
        <MenuLabel>Stagione sportiva</MenuLabel>
        <MenuRadioGroup value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
          <MenuRadioItem value={ALL}>Tutte le stagioni</MenuRadioItem>
          {seasons.map((season) => (
            <MenuRadioItem key={season.id} value={season.id}>
              {season.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
