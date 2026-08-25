"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CLOTHING_PROFILE_LABELS,
  clothingOptionsFor,
  normalizeClothingSizes,
  resolveClothingProfile,
  type ClothingProfile,
  type ClothingSizes,
} from "@/lib/clothing-sizes";

/**
 * Taglie di vestiario per una persona.
 *
 * Le stesse quattro voci della scheda atleta — profilo, maglia, pantalone,
 * scarpe — usabili anche su allenatore, staff e socio (Blocco 7, punto 12).
 *
 * **Nessun numero di maglia qui.** Il numero appartiene a chi scende in campo,
 * e darlo a un dirigente creerebbe conflitti nei gruppi di numerazione (WP-44)
 * per un dato che non serve a nessuno.
 *
 * Il profilo si deduce da sesso ed eta, ma resta scegliibile: un adulto puo
 * portare una taglia bambino, e un elenco che non lo prevede costringe a
 * lasciare il campo vuoto.
 */

export type ClothingSizesFieldsProps = {
  idPrefix?: string;
  value: Partial<ClothingSizes> | null | undefined;
  onChange: (next: ClothingSizes) => void;
  /** Serve solo a dedurre il profilo quando non e stato scelto. */
  person?: { gender?: string | null; birthDate?: string | null } | null;
  disabled?: boolean;
  className?: string;
};

const PROFILES = Object.keys(CLOTHING_PROFILE_LABELS) as ClothingProfile[];

export function ClothingSizesFields({
  idPrefix = "clothing",
  value,
  onChange,
  person,
  disabled = false,
  className,
}: ClothingSizesFieldsProps) {
  const sizes = normalizeClothingSizes(value);
  const profile = resolveClothingProfile(sizes, person);
  const options = clothingOptionsFor(profile);

  const update = (patch: Partial<ClothingSizes>) =>
    onChange({ ...sizes, ...patch });

  const selectClassName =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-profile`}>Profilo taglie</Label>
        <select
          id={`${idPrefix}-profile`}
          className={selectClassName}
          disabled={disabled}
          value={sizes.profile || ""}
          onChange={(event) => update({ profile: event.target.value })}
        >
          <option value="">
            Automatico ({CLOTHING_PROFILE_LABELS[profile]})
          </option>
          {PROFILES.map((option) => (
            <option key={option} value={option}>
              {CLOTHING_PROFILE_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-shirt`}>Taglia maglia</Label>
        <select
          id={`${idPrefix}-shirt`}
          className={selectClassName}
          disabled={disabled}
          value={sizes.shirtSize}
          onChange={(event) => update({ shirtSize: event.target.value })}
        >
          <option value="">Non indicata</option>
          {options.shirt.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          {/* Una taglia gia in archivio fuori dal profilo corrente resta
              selezionabile, invece di sparire al primo salvataggio. */}
          {sizes.shirtSize && !options.shirt.includes(sizes.shirtSize) ? (
            <option value={sizes.shirtSize}>{sizes.shirtSize}</option>
          ) : null}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-pants`}>Taglia pantalone</Label>
        <select
          id={`${idPrefix}-pants`}
          className={selectClassName}
          disabled={disabled}
          value={sizes.pantsSize}
          onChange={(event) => update({ pantsSize: event.target.value })}
        >
          <option value="">Non indicata</option>
          {options.pants.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          {sizes.pantsSize && !options.pants.includes(sizes.pantsSize) ? (
            <option value={sizes.pantsSize}>{sizes.pantsSize}</option>
          ) : null}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-shoes`}>Numero scarpe</Label>
        <select
          id={`${idPrefix}-shoes`}
          className={cn(selectClassName, "eg-tabular")}
          disabled={disabled}
          value={sizes.shoeSize}
          onChange={(event) => update({ shoeSize: event.target.value })}
        >
          <option value="">Non indicato</option>
          {options.shoes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          {sizes.shoeSize && !options.shoes.includes(sizes.shoeSize) ? (
            <option value={sizes.shoeSize}>{sizes.shoeSize}</option>
          ) : null}
        </select>
      </div>
    </div>
  );
}

/**
 * Le stesse taglie, in lettura.
 *
 * **Il difetto che chiude** (Blocco A, punto 13). Le taglie si raccoglievano
 * alla creazione di allenatore, staff e socio — e da li in poi non esistevano
 * piu: nessuna delle tre schede di dettaglio le mostrava, quindi non si
 * potevano ne leggere ne correggere. Un dato scritto una volta e mai piu
 * raggiungibile e peggio di un dato assente, perche l'export lo stampa
 * (`person-export.ts` ha sempre avuto la colonna) e nessuno sa da dove venga.
 *
 * Il riepilogo sta qui, accanto al form che lo modifica, perche le due viste
 * dello stesso dato non divergano: chi aggiunge un capo alle taglie lo vede
 * comparire in entrambe.
 */
export type ClothingSizesSummaryProps = {
  value: Partial<ClothingSizes> | null | undefined;
  person?: { gender?: string | null; birthDate?: string | null } | null;
  className?: string;
};

export function ClothingSizesSummary({
  value,
  person,
  className,
}: ClothingSizesSummaryProps) {
  const sizes = normalizeClothingSizes(value);
  const profile = resolveClothingProfile(sizes, person);

  const rows: Array<{ label: string; value: string; tabular?: boolean }> = [
    {
      label: "Profilo taglie",
      value: sizes.profile
        ? CLOTHING_PROFILE_LABELS[profile]
        : `Automatico (${CLOTHING_PROFILE_LABELS[profile]})`,
    },
    { label: "Taglia maglia", value: sizes.shirtSize },
    { label: "Taglia pantalone", value: sizes.pantsSize },
    { label: "Numero scarpe", value: sizes.shoeSize, tabular: true },
  ];

  return (
    <div className={cn("grid grid-cols-1 gap-6 sm:grid-cols-2", className)}>
      {rows.map((row) => (
        <div key={row.label}>
          <h3 className="text-sm font-medium text-muted-foreground">
            {row.label}
          </h3>
          <p className={cn("mt-1", row.tabular && "eg-tabular")}>
            {row.value || "Non indicata"}
          </p>
        </div>
      ))}
    </div>
  );
}
