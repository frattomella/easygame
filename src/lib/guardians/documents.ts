/**
 * **Chi un documento nuovo puo nominare** (49 §G, ADR-0149).
 *
 * ---
 *
 * Tre lettori prendono i tutori **per posto**: l'intestatario di una ricevuta
 * (`documents/fiscal-recipient.ts`), i segnaposto `{{parent.N.*}}`
 * (`server/document-placeholders.ts`), e l'indice con cui l'approvazione di un
 * modulo dice quale riga sta sostituendo (`server/form-submissions.ts`).
 *
 * Tutti e tre avevano il **proprio** filtro, e due tornate di fila hanno
 * misurato cosa costa: una ricevuta intestata a chi il club aveva escluso, e —
 * dopo la correzione — una ricevuta intestata al padre vivo **con il codice
 * fiscale e l'indirizzo della madre revocata**.
 *
 * ## Le due regole, insieme
 *
 * 1. **una persona esclusa non compare**: la voce esclusa risponde `null`;
 * 2. **e non fa slittare nessun altro**: la posizione resta dov'e. Togliere le
 *    voci escluse dall'elenco farebbe scorrere le posizioni, e cio che era il
 *    genitore due diventerebbe il genitore uno — con il codice fiscale
 *    stampato su una ricevuta che cambia persona.
 *
 * La provenienza dei campi dentro una voce fusa la governa la proiezione
 * (49 §E): qui si legge cio che la voce dichiara, mai cio che sta dietro.
 */

import { isGuardianExcluded, asGuardianRecord, type GuardianLike } from "./exclusion";
import { normalizeGuardianIdentity, resolveGuardianIdentity } from "./identity";

/**
 * **L'elenco grezzo della proiezione.**
 *
 * Non filtra: e la forma su cui si contano le posizioni, e serve anche a chi
 * deve decidere «l'elenco e vuoto?» **prima** di applicare un filtro — una
 * scelta che, fatta dopo, faceva ricadere sulla coppia storica un atleta i cui
 * tutori fossero tutti revocati, cioe faceva **comparire** destinatari.
 */
export const readGuardianEntries = (data: unknown): GuardianLike[] => {
  const d = asGuardianRecord(data);
  const elenco = Array.isArray(d.guardians) ? d.guardians : [];
  return elenco.filter(
    (voce): voce is GuardianLike =>
      Boolean(voce) && typeof voce === "object" && !Array.isArray(voce),
  );
};

/**
 * **Le voci che un documento nuovo puo nominare, per posizione.**
 *
 * Stessa lunghezza dell'elenco grezzo: chi e escluso e `null` al proprio
 * posto, e nessuno scorre.
 */
export const resolveDocumentGuardians = (
  data: unknown,
): (GuardianLike | null)[] =>
  readGuardianEntries(data).map((voce) =>
    isGuardianExcluded(voce) ? null : voce,
  );

/**
 * **La voce in quel posto, se un documento nuovo puo nominarla.**
 *
 * `null` quando la posizione non esiste **e** quando chi la occupa e escluso:
 * per chi legge un documento le due cose sono la stessa — quella posizione non
 * ha un soggetto — e distinguerle vorrebbe dire dare a un modello un modo di
 * dire che qualcuno c'era.
 */
export const documentGuardianAt = (
  data: unknown,
  index: number,
): GuardianLike | null => {
  if (!Number.isInteger(index) || index < 0) return null;
  const voci = resolveDocumentGuardians(data);
  return index < voci.length ? voci[index] : null;
};

/**
 * **La voce di cui questa persona e il soggetto**, quando un modulo la nomina.
 *
 * Stessa regola dei tre lettori posizionali — una persona esclusa non e un
 * soggetto — su una domanda diversa: non «quale posto» ma «quale voce e
 * questa persona».
 *
 * La usa la bozza di rinnovo, che precompila un modulo con l'anagrafica del
 * tutore che lo apre. Li la ricerca era scritta a mano: leggeva le quattro
 * grafie dell'utenza (e faceva bene) ma **non** guardava i marchi, quindi la
 * guardia — che decide sulle **righe**, dove l'accesso si decide — e l'uso —
 * che pescava dentro la proiezione — non interrogavano la stessa cosa. E la
 * prima delle due regole del confine (49 §J): verificare con una domanda e poi
 * rileggere con un'altra non e una guardia.
 */
export const resolveGuardianSubjectForUser = (
  data: unknown,
  userId: unknown,
): GuardianLike | null => {
  const cercato = normalizeGuardianIdentity(userId);
  if (!cercato) return null;

  return (
    resolveDocumentGuardians(data).find(
      (voce) =>
        voce && resolveGuardianIdentity(voce).userIds.includes(cercato),
    ) ?? null
  );
};
