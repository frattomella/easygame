"use client";

import * as React from "react";
import { CalendarRange, Layers } from "lucide-react";
import { ContextControl } from "@/components/web/page/PageHeader";
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/web/primitives/Overlays";
import type { NormalizedCategoryOption } from "@/lib/category-utils";
import type { ReportPeriodKey } from "@/lib/club-report-utils";

/**
 * I controlli di contesto di `/reports` (guideline 09 §9.2): categoria e
 * periodo. Cambiano cosa la pagina *significa* — su quali atleti e su quale
 * finestra si contano allenamenti, presenze, gare e incassi — quindi stanno a
 * destra del titolo e non in una barra di filtri.
 *
 * Sono la forma V2 dei due `Select` che la V1 montava nell'intestazione, con
 * lo **stesso contratto**: `"all"` per «Tutte le categorie» e le tre chiavi
 * di `PERIOD_OPTIONS` per il periodo. Il riepilogo gestionale in fondo alla
 * pagina **non** li eredita: ha i filtri propri.
 */
export const ALL_CATEGORIES_VALUE = "all";

export const PERIOD_OPTIONS: ReadonlyArray<{
  value: ReportPeriodKey;
  label: string;
}> = [
  { value: "all", label: "Intero periodo" },
  { value: "last30", label: "Ultimo mese" },
  { value: "last90", label: "Ultimi 3 mesi" },
];

export function CategoryContextControl({
  categories,
  value,
  onChange,
  id = "reports-category-filter",
}: {
  categories: NormalizedCategoryOption[];
  value: string;
  onChange: (categoryId: string) => void;
  id?: string;
}) {
  const current = categories.find(
    (category) => String(category.id) === String(value),
  );

  return (
    <Menu>
      <MenuTrigger asChild>
        <ContextControl id={id} icon={<Layers />}>
          <span className="sr-only">Categoria: </span>
          {current ? current.name : "Tutte le categorie"}
        </ContextControl>
      </MenuTrigger>
      <MenuContent align="end" width={262}>
        <MenuLabel>Categoria</MenuLabel>
        <MenuRadioGroup
          value={current ? String(current.id) : ALL_CATEGORIES_VALUE}
          onValueChange={onChange}
        >
          <MenuRadioItem value={ALL_CATEGORIES_VALUE}>
            Tutte le categorie
          </MenuRadioItem>
          {categories.map((category) => (
            <MenuRadioItem key={category.id} value={String(category.id)}>
              {category.name}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}

export function PeriodContextControl({
  value,
  onChange,
  id = "reports-period-filter",
}: {
  value: ReportPeriodKey;
  onChange: (period: ReportPeriodKey) => void;
  id?: string;
}) {
  const current =
    PERIOD_OPTIONS.find((option) => option.value === value) ??
    PERIOD_OPTIONS[0];

  return (
    <Menu>
      <MenuTrigger asChild>
        <ContextControl id={id} icon={<CalendarRange />}>
          <span className="sr-only">Periodo: </span>
          {current.label}
        </ContextControl>
      </MenuTrigger>
      <MenuContent align="end" width={220}>
        <MenuLabel>Periodo</MenuLabel>
        <MenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as ReportPeriodKey)}
        >
          {PERIOD_OPTIONS.map((option) => (
            <MenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
