/**
 * Le sezioni della scheda atleta, come elenco.
 *
 * **Perche in `lib` e non nel componente** (WP-19, Blocco 8). L'elenco delle
 * sezioni e la struttura della pagina: e la prima cosa che si cerca quando si
 * deve capire dove sta una funzione, e finora era a riga 3.445 di ottomila.
 * Qui e leggibile in dieci secondi, e — non secondario — e verificabile: il
 * runner dei test non sa leggere i file `.tsx`, quindi ogni regola che deve
 * essere provata deve stare fuori dal componente che la usa.
 */

export const ATHLETE_PROFILE_TABS = [
  { value: "generale", label: "Generale" },
  { value: "contatti", label: "Contatti" },
  { value: "sanitari", label: "Dati Sanitari" },
  { value: "pagamenti", label: "Iscrizione" },
  { value: "abbigliamento", label: "Abbigliamento" },
  { value: "documenti", label: "Documenti" },
  { value: "analitiche", label: "Analitiche" },
  { value: "lavoro", label: "Lavoro e compensi" },
] as const;

export type AthleteProfileTabValue =
  (typeof ATHLETE_PROFILE_TABS)[number]["value"];

export const DEFAULT_ATHLETE_PROFILE_TAB: AthleteProfileTabValue = "generale";

/**
 * La sezione richiesta da `?tab=`, se e una di quelle che esistono.
 *
 * Un valore sconosciuto non apre una scheda vuota: riporta a «Generale». Un
 * indirizzo copiato da una versione precedente dell'applicazione deve
 * atterrare da qualche parte.
 */
export const resolveAthleteProfileTab = (
  requested?: string | null,
): AthleteProfileTabValue => {
  const normalized = String(requested || "")
    .trim()
    .toLowerCase();

  const match = ATHLETE_PROFILE_TABS.find((tab) => tab.value === normalized);
  return match ? match.value : DEFAULT_ATHLETE_PROFILE_TAB;
};
