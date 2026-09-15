"use client";

import * as React from "react";
import { Tag } from "lucide-react";
import { ContextControl } from "@/components/web/page/PageHeader";
import {
  Menu,
  MenuContent,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/web/primitives/Overlays";

const ALL_CATEGORIES_VALUE = "__all__";

/**
 * Il contesto «categoria» della pagina Gare (guideline 09 §9.2): e la tendina
 * «Tutte le categorie» della V1, che restringeva giornata, settimana, elenco
 * e prossime gare insieme. Cambia cosa la pagina *significa*, quindi sta a
 * destra del titolo e non nella barra dei filtri. Stringa vuota = nessuna
 * restrizione. Con meno di due categorie non compare.
 */
export function CategoryContextControl({
  categories,
  value,
  onChange,
  id = "matches-category-filter",
}: {
  categories: Array<{ id: string; label: string }>;
  value: string;
  onChange: (categoryId: string) => void;
  id?: string;
}) {
  if (categories.length < 2) return null;
  const current = categories.find((category) => category.id === value);
  return (
    <Menu>
      <MenuTrigger asChild>
        <ContextControl id={id} icon={<Tag />}>
          <span className="sr-only">Categoria: </span>
          {current ? current.label : "Tutte le categorie"}
        </ContextControl>
      </MenuTrigger>
      <MenuContent align="end" width={262}>
        <MenuLabel>Categoria</MenuLabel>
        <MenuRadioGroup
          value={value || ALL_CATEGORIES_VALUE}
          onValueChange={(next) => onChange(next === ALL_CATEGORIES_VALUE ? "" : next)}
        >
          <MenuRadioItem value={ALL_CATEGORIES_VALUE}>Tutte le categorie</MenuRadioItem>
          {categories.map((category) => (
            <MenuRadioItem key={category.id} value={category.id}>
              {category.label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
