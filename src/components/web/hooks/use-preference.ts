"use client";

import { useCallback, useEffect, useState } from "react";
import { readPreference, writePreference } from "@/lib/web/preferences";

/**
 * Una preferenza `egw.<modulo>.<impostazione>` come stato React.
 *
 * Il primo render usa il default (cosi server e client dipingono la stessa
 * cosa); al montaggio si legge il valore salvato. Ogni scrittura persiste.
 */
export function usePreference<T>(module: string, setting: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(readPreference(module, setting, fallback));
    setHydrated(true);
    // `fallback` e un valore di default stabile per chiamata; non lo si vuole
    // come dipendenza, altrimenti un oggetto letterale rilegge a ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, setting]);

  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved =
          typeof next === "function" ? (next as (c: T) => T)(current) : next;
        writePreference(module, setting, resolved);
        return resolved;
      });
    },
    [module, setting],
  );

  return [value, update, hydrated] as const;
}
