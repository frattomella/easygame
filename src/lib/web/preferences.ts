/**
 * Preferenze persistite per utente del Web V2 (guideline 10 §10.6).
 *
 * Chiavi `egw.<modulo>.<impostazione>`: `egw.atleti.density`,
 * `egw.atleti.columns`, `egw.shell.sidebar`. Vivono in `localStorage`, valgono
 * solo per quel browser, e ogni lettura tollera l'assenza: un valore che non
 * c'e o non si legge rende il default, mai un errore.
 *
 * L'archivio si usa **per nome** (`window.localStorage`), mai tramite un alias:
 * e la regola di `tests/auth/credenziali-fuori-dal-browser.test.mjs`. Per i
 * test si puo passare un archivio esplicito come ultimo parametro.
 */

export type PreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const preferenceKey = (module: string, setting: string) =>
  `egw.${module}.${setting}`;

export const readPreference = <T>(
  module: string,
  setting: string,
  fallback: T,
  storage?: PreferenceStorage | null,
): T => {
  const key = preferenceKey(module, setting);
  try {
    const raw = storage
      ? storage.getItem(key)
      : typeof window === "undefined"
        ? null
        : window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writePreference = <T>(
  module: string,
  setting: string,
  value: T,
  storage?: PreferenceStorage | null,
): void => {
  const key = preferenceKey(module, setting);
  try {
    if (value === undefined || value === null) {
      if (storage) storage.removeItem(key);
      else if (typeof window !== "undefined") window.localStorage.removeItem(key);
      return;
    }
    const serialized = JSON.stringify(value);
    if (storage) storage.setItem(key, serialized);
    else if (typeof window !== "undefined") window.localStorage.setItem(key, serialized);
  } catch {
    /* quota piena o archivio bloccato (navigazione privata): l'app va avanti */
  }
};

export const clearPreference = (
  module: string,
  setting: string,
  storage?: PreferenceStorage | null,
): void => writePreference(module, setting, null, storage);
