/**
 * **Le regole pure della modifica di un tesseramento** (N4).
 *
 * Estratte dalla scheda atleta, che sta sotto un tetto di righe (WP-19), e
 * soprattutto perche una revisione ostile ha trovato **qui** due difetti che
 * nessuna prova vedeva: una riga senza identificativo si riconosceva per
 * identificativo, e due righe aggiunte nello stesso millisecondo ne
 * condividevano uno.
 *
 * Sono funzioni pure: non leggono stato, non chiamano la rete, e si provano
 * senza montare una pagina.
 */

export type AthleteRegistrationRow = Record<string, any>;

/**
 * **Quale riga si sta correggendo.**
 *
 * `String(undefined) === "undefined"`: con due tesseramenti storici privi di
 * `id` — quelli scritti prima che l'id esistesse — un confronto per
 * identificativo cadeva sempre sul **primo**, e la sostituzione piu sotto
 * riscriveva **tutti** quelli senza id con lo stesso oggetto. Due tesseramenti
 * diversi diventavano due copie dello stesso, e l'altro spariva.
 *
 * Chi non ha un identificativo si riconosce percio per **identita di
 * riferimento**, che e l'unica cosa che quelle righe hanno.
 */
export const findRegistrationIndex = (
  registrations: readonly AthleteRegistrationRow[],
  target: AthleteRegistrationRow | null | undefined,
): number => {
  if (!target) return -1;

  return (Array.isArray(registrations) ? registrations : []).findIndex((row) =>
    row?.id && target.id ? String(row.id) === String(target.id) : row === target,
  );
};

/**
 * Un identificativo per una riga nuova.
 *
 * `Date.now()` da solo si scontra fra due righe aggiunte nello stesso
 * millisecondo, e l'identificativo e cio su cui la modifica e la cancellazione
 * lavorano.
 */
export const buildRegistrationId = () =>
  `registration-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * L'elenco dopo il salvataggio: **sostituisce** in correzione, **accoda** in
 * aggiunta. La sostituzione e per posizione, non per identificativo, per la
 * ragione detta sopra.
 */
export const applyRegistrationEdit = (
  registrations: readonly AthleteRegistrationRow[],
  index: number,
  registration: AthleteRegistrationRow,
): AthleteRegistrationRow[] => {
  const righe = Array.isArray(registrations) ? registrations : [];

  return index >= 0
    ? righe.map((row, posizione) => (posizione === index ? registration : row))
    : [...righe, registration];
};
