/**
 * Chi puo fare cosa con i documenti. **Una volta sola.**
 *
 * **Perche esiste, e perche sta nella barriera.** La Wave 2 ha imparato che
 * quattro copie della stessa matrice dei permessi restano indietro in
 * silenzio: la si scrive prima di aprire le lane, e le lane la importano. Qui
 * dentro non c'e nessun permesso nuovo — c'e la composizione di quelli che
 * esistono gia:
 *
 * - `canManageClubConfiguration` (`src/lib/access-roles.ts`) e il perimetro
 *   che gia protegge conti correnti, configurazione societaria e firma del
 *   presidente. Un modello e il testo con cui la societa dichiara cose per
 *   iscritto, con quella firma sopra: e configurazione societaria;
 * - `sport_work.read` (`src/lib/sport-work/permissions.ts`) e il permesso che
 *   gia governa «quanto guadagna una persona». Un documento che stampa un
 *   compenso non puo chiedere meno di quanto chieda la schermata che lo mostra.
 *
 * **Il difetto che questa matrice chiude (W3-14).** Misurato a runtime prima
 * di correggerlo, con `scripts/wave-3-permissions-probe.mjs`: collaboratore e
 * staff rispondevano `200` a creare, modificare e cancellare un modello
 * attraverso il CRUD generico, e `403` a generarne un documento. Potevano
 * riscrivere il testo che la societa firma, e non potevano stamparne una copia.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM. Lo
 * importano sia le rotte sia le schermate, perche un pulsante che si vede e
 * risponde 403 e un difetto quanto una porta aperta.
 */

import { canManageClubConfiguration } from "@/lib/access-roles";
import { hasSportWorkPermission } from "@/lib/sport-work/permissions";
import { roleHasPermission } from "@/lib/permissions/catalog";
import type { PlaceholderSensitivity } from "./placeholders";

/*
  I ruoli che possono stare davanti a un documento. Genitori, atleti e
  allenatori non compaiono: le loro aree hanno rotte dedicate e non passano
  di qui.
*/
/*
  **Le chiavi, invece dei booleani senza nome** (W5-70).

  Questi predicati esistevano gia ed erano corretti, ma non avevano ne una
  chiave ne un'etichetta: non si potevano elencare in una schermata di
  configurazione, e un motore di ruoli personalizzati non avrebbe avuto niente
  da leggere. La matrice per ruolo e la stessa di prima — questo non e un
  cambio di comportamento — e adesso vive nel catalogo unico.
*/
/** Vero per i ruoli che possono stare davanti a un documento. */
const canStandBeforeADocument = (role?: string | null) =>
  roleHasPermission(role, "documents.templates.read");

/**
 * Creare, modificare, pubblicare, ritirare un modello.
 *
 * Proprietario e gestore del club, come per ogni altra configurazione
 * societaria. **E una restrizione rispetto a prima**, ed e voluta: fino alla
 * Wave 3 un collaboratore poteva riscrivere il testo di un'attestazione che
 * esce con la firma del presidente.
 */
export const canManageDocumentTemplates = (role?: string | null) =>
  roleHasPermission(role, "documents.templates.manage");

/** Vedere l'elenco dei modelli e il loro contenuto. */
export const canReadDocumentTemplates = (role?: string | null) =>
  canStandBeforeADocument(role);

/**
 * Puo generare un documento che porta **queste** classi sensibili?
 *
 * La domanda non e «puo generare», e «puo generare **questo**»: dipende da cosa
 * il modello dice, non da come si chiama. Le classi arrivano dalla versione,
 * che le congela alla pubblicazione — cosi una correzione che aggiunge un
 * importo cambia chi puo generare quel modello dal momento in cui viene
 * pubblicata, e non dal momento in cui qualcuno se ne accorge.
 */
export const canGenerateDocumentWithSensitivity = (
  role: string | null | undefined,
  sensitivity: Iterable<PlaceholderSensitivity | string>,
) => {
  if (!roleHasPermission(role, "documents.generate")) return false;

  for (const entry of sensitivity) {
    const value = String(entry || "").trim().toLowerCase();
    if (value === "economic" && !canManageClubConfiguration(role)) return false;
    if (value === "health" && !canManageClubConfiguration(role)) return false;
    /*
      Il compenso e l'unica classe che non basta essere della direzione per
      vedere: e il dominio del lavoro sportivo a decidere, e lo decide gia.
      Se un giorno il catalogo dei segnaposto imparasse `relationship.*`, e
      questa riga che impedirebbe a un contratto di uscire dalle mani
      sbagliate.
    */
    if (
      value === "compensation" &&
      !hasSportWorkPermission(role, "sport_work.read")
    ) {
      return false;
    }
  }

  return true;
};

/**
 * Il motivo del diniego, detto a chi lo legge.
 *
 * Restituisce `null` quando si puo generare. Non e cosmetica: ADR-0046 e
 * ADR-0048 hanno gia deciso che un utente bloccato deve sapere **perche**, e
 * un documento rifiutato senza spiegazione manda una segreteria a chiamare
 * l'assistenza.
 */
export const explainGenerationDenial = (
  role: string | null | undefined,
  sensitivity: Iterable<PlaceholderSensitivity | string>,
): string | null => {
  if (!roleHasPermission(role, "documents.generate")) {
    return "Accesso negato: i documenti li genera chi lavora nella segreteria del club";
  }

  const classes = [...sensitivity].map((entry) =>
    String(entry || "").trim().toLowerCase(),
  );

  if (
    (classes.includes("economic") || classes.includes("health")) &&
    !canManageClubConfiguration(role)
  ) {
    const what = classes.includes("economic")
      ? "importi"
      : "dati sanitari";
    return `Accesso negato: questo modello contiene ${what}, e li genera la direzione del club`;
  }

  if (
    classes.includes("compensation") &&
    !hasSportWorkPermission(role, "sport_work.read")
  ) {
    return "Accesso negato: questo modello contiene un compenso, e serve il permesso sul lavoro sportivo";
  }

  return null;
};

/**
 * Rileggere un documento **gia generato**.
 *
 * **Non e la stessa domanda della generazione**, ed e la ragione per cui un
 * documento generato non e un allegato (ADR-0089): l'endpoint degli allegati
 * autorizza la lettura a chiunque appartenga al club, e un'attestazione che
 * dice quanto ha versato una famiglia sarebbe leggibile da ogni allenatore.
 *
 * La regola: chi puo generarlo puo rileggerlo; chi non poteva generarlo puo
 * rileggere **solo cio che ha generato**. Un collaboratore che ha prodotto una
 * dichiarazione di iscrizione la ritrova; l'attestazione con gli importi che
 * ha prodotto il presidente, no.
 */
export const canReadGeneratedDocument = (
  role: string | null | undefined,
  document: { sensitivity?: string[] | null; generated_by?: string | null },
  viewerUserId?: string | null,
) => {
  if (!roleHasPermission(role, "documents.generated.read")) return false;

  const sensitivity = Array.isArray(document.sensitivity)
    ? document.sensitivity
    : [];

  if (canGenerateDocumentWithSensitivity(role, sensitivity)) return true;

  const author = String(document.generated_by || "").trim();
  const viewer = String(viewerUserId || "").trim();
  return Boolean(author) && author === viewer;
};

/** Caricare la copia firmata e portare avanti lo stato del documento. */
export const canAdvanceGeneratedDocument = (role?: string | null) =>
  roleHasPermission(role, "documents.generated.advance");

/*
  I tre predicati sui consensi vivevano qui, e si riducevano tutti e tre a
  `documents.templates.read`: una chiave del dominio *documenti* decideva tre
  atti sui *consensi*. Sono in `src/lib/consents/permissions.ts` (W5-D01).
*/
