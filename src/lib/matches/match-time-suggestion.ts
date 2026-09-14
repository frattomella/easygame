/**
 * **La fine indicativa di una gara, quando l'utente scrive solo l'inizio**
 * (bug UAT "giovedi 17 alle 19:00 il campo non e disponibile").
 *
 * Dominio puro apposta — nessun React, nessuna rete — cosi la si prova con
 * un assert diretto invece che leggendo il sorgente del form per pattern:
 * la stessa ragione per cui la data/ora dell'evento vive in
 * `src/lib/events/model.ts` e non dentro una pagina.
 *
 * **Perche vive qui e non nel dominio degli eventi.** Non e una regola che
 * il server applica o verifica: e un suggerimento della UI, prima che la
 * richiesta parta. Il server continua a vedere solo `"19:00 - 20:30"`, mai
 * un `"19:00"` nudo che ha "deciso" da solo una fine — quella decisione
 * resta visibile e modificabile nel campo, non nascosta in una richiesta.
 */

/** `"19:00"`, non un intervallo: nessun trattino, solo l'inizio. */
const SOLO_ORA_INIZIO = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * 90 minuti e un default UX, non una regola di dominio: la durata comune di
 * una gara, non un vincolo che il server applica o verifica.
 */
export const DURATA_GARA_SUGGERITA_MINUTI = 90;

/** L'orario `HH:MM`, `minuti` dopo — avvolge oltre la mezzanotte. */
export const sommaMinuti = (orario: string, minuti: number): string => {
  const [ore, min] = orario.split(":").map(Number);
  const totale =
    (((ore * 60 + min + minuti) % (24 * 60)) + 24 * 60) % (24 * 60);
  const oreSuggerite = Math.floor(totale / 60);
  const minutiSuggeriti = totale % 60;
  return `${String(oreSuggerite).padStart(2, "0")}:${String(minutiSuggeriti).padStart(2, "0")}`;
};

/**
 * Se `value` e un solo orario di inizio, propone l'intervallo con la fine
 * suggerita (`+90` minuti). Un valore gia scritto come intervallo (con un
 * trattino), vuoto, o non riconoscibile come `HH:MM` torna invariato: qui
 * non si corregge un dato che l'utente sta ancora scrivendo, si completa
 * solo cio che manca del tutto.
 */
export const suggerisciIntervalloGara = (value: string): string => {
  const testo = value.trim();
  if (!SOLO_ORA_INIZIO.test(testo)) return value;
  return `${testo} - ${sommaMinuti(testo, DURATA_GARA_SUGGERITA_MINUTI)}`;
};
