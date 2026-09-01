/**
 * **Chi puo fare cosa con i consensi.**
 *
 * ## Perche questo file nasce nella Wave 6
 *
 * I tre predicati che seguono vivevano in `src/lib/documents/permissions.ts`, e
 * si riducevano tutti e tre a una funzione privata di due righe:
 *
 * ```
 * const canStandBeforeADocument = (role) =>
 *   roleHasPermission(role, "documents.templates.read");
 * ```
 *
 * Cioe: **una chiave del dominio *documenti* decideva tre atti sui *consensi***.
 * Togliere a un ruolo la lettura dei modelli di stampa gli toglieva anche la
 * facolta di registrare l'accettazione di una liberatoria — due cose che non
 * hanno niente in comune, e che nessuna schermata di configurazione avrebbe
 * potuto separare.
 *
 * Era il difetto W5-D01, e il motivo per cui va chiuso **prima** dei ruoli
 * personalizzati: un club che spuntasse tre caselle distinte vedendone agire
 * una sola avrebbe in mano una configurabilita finta.
 *
 * ## Le tre chiavi, e perche sono tre
 *
 * | Chiave | Atto | Ruoli |
 * |---|---|---|
 * | `consents.definitions.manage` | definire un consenso e pubblicarne le versioni | direzione |
 * | `consents.decide_for_others` | registrare accettazione o revoca **per conto di** qualcuno | segreteria |
 * | `consents.records.read` | leggere lo stato dei consensi del club | segreteria |
 *
 * Definire un consenso e configurazione societaria: e il testo che la societa
 * dichiara, e chi lo scrive decide cosa le famiglie stanno accettando.
 * Registrare una decisione, invece, e un gesto operativo — la segreteria lo fa
 * tutti i giorni con un foglio in mano.
 *
 * Resta fuori `consents.decide_own`, che non e di ruolo ma **di legame**: la
 * decide la famiglia sul proprio figlio, e il suo gate e il legame con
 * quell'atleta. Non compare qui apposta, e non deve essere concedibile a un
 * ruolo.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete. Lo importano sia
 * le rotte sia le schermate, perche un pulsante che si vede e risponde 403 e un
 * difetto quanto una porta aperta.
 */

import { roleHasPermission } from "@/lib/permissions/catalog";

/** Definire un consenso e pubblicarne le versioni: configurazione societaria. */
export const canManageConsentDefinitions = (role?: string | null) =>
  roleHasPermission(role, "consents.definitions.manage");

/**
 * Registrare un'accettazione o una revoca per conto di qualcuno.
 *
 * La segreteria lo fa tutti i giorni con un foglio in mano: e un gesto
 * operativo, non una configurazione.
 */
export const canRecordConsentDecision = (role?: string | null) =>
  roleHasPermission(role, "consents.decide_for_others");

/** Leggere lo stato dei consensi del club. */
export const canReadConsentRecords = (role?: string | null) =>
  roleHasPermission(role, "consents.records.read");
