"use client";

import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import {
  applyCapitalization,
  capitalizationModeForField,
  type CapitalizationMode,
} from "@/lib/text-capitalization";

/**
 * `Input` che sistema la maiuscola iniziale **all'uscita dal campo**.
 *
 * Non mentre si digita: chi scrive `deLuca` e a meta di `De Luca`, e
 * correggerlo al terzo carattere gli sposta il cursore sotto le dita. Al blur
 * il valore e finito e la correzione e sicura.
 *
 * La modalita si deduce dal nome del campo quando non e dichiarata, cosi lo
 * stesso componente puo sostituire un `Input` senza che chi lo monta debba
 * ricordarsi che le email non si capitalizzano (vedi
 * `src/lib/text-capitalization.ts`).
 */

export type CapitalizedInputProps =
  React.ComponentPropsWithoutRef<typeof Input> & {
    /** Forza la regola invece di dedurla da `name` / `id`. */
    capitalize?: CapitalizationMode;
    /** Riceve il valore gia sistemato. */
    onValueChange?: (value: string) => void;
  };

export const CapitalizedInput = forwardRef<
  HTMLInputElement,
  CapitalizedInputProps
>(function CapitalizedInput(
  { capitalize, onValueChange, onBlur, name, id, type, ...props },
  ref,
) {
  const mode =
    capitalize ??
    // Un `type` tecnico decide da solo: nessuna email o password si
    // capitalizza, qualunque cosa dica il nome del campo.
    (type && ["email", "password", "url", "tel", "number"].includes(type)
      ? "none"
      : capitalizationModeForField(name || id));

  return (
    <Input
      {...props}
      ref={ref}
      id={id}
      name={name}
      type={type}
      onBlur={(event) => {
        if (mode !== "none") {
          const next = applyCapitalization(event.target.value, mode);
          if (next !== event.target.value) {
            onValueChange?.(next);
          }
        }
        onBlur?.(event);
      }}
    />
  );
});
