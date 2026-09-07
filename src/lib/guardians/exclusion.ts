/**
 * **L'esclusione del dominio dei tutori: un predicato solo.**
 *
 * ---
 *
 * ## Perche questo file esiste
 *
 * La domanda «questa persona e fuori?» era scritta a mano in **cinque** posti,
 * con cinque sfumature:
 *
 * | Dove | Come |
 * |---|---|
 * | `athlete-guardians.ts`, dentro `perPosizione` | `Boolean(v.accessRevokedAt) \|\| v.contactOnly === true` |
 * | `documents/fiscal-recipient.ts`, `intestabile` | `firstText(accessRevokedAt, access_revoked_at)` + `contactOnly !== true` + `contact_only !== true` |
 * | `server/document-placeholders.ts`, `guardianAt` | `String(...).trim()` + `=== true` sulle due grafie |
 * | `server/form-submissions.ts`, `voceEsclusa` | truthiness sulle quattro chiavi |
 * | `server/document-requests.ts` e `medical-certificate-reminders.ts` | due `if` separati, in ordine diverso |
 *
 * Correggerne una lasciava le altre, e ogni correzione ne creava una versione
 * nuova: e la ragione per cui quindici revisioni non convergevano. Da qui in
 * poi la risposta e **una funzione**, e chi la chiama non puo sceglierne la
 * semantica — non ci sono parametri.
 *
 * ## La regola (49 §C)
 *
 * ```
 * esclusa  ⟺  revocata  ∨  di solo recapito
 * ```
 *
 * E un **OR**. Averlo ripiegato con due `AND` indipendenti ha prodotto una
 * voce le cui righe erano tutte escluse **in due modi diversi** e che usciva
 * senza nessuno dei due marchi: viva per chi la legge, e intestataria di una
 * ricevuta.
 *
 * ## Perche vale sulla riga **e** sulla voce
 *
 * Sono due forme della stessa cosa e portano il marchio con due grafie: la
 * riga ha le colonne `revoked_at` / `contact_only`, la voce le chiavi
 * `accessRevokedAt` / `contactOnly`. Nessuna delle cinque stesure leggeva
 * quelle della **riga**: passare un `GuardianRow` a `intestabile` rispondeva
 * percio «intestabile» su una riga revocata. Un predicato che vale solo su
 * meta delle forme del proprio dominio e un predicato che qualcuno chiamera
 * sull'altra meta.
 */

/** Un tutore, in una qualunque delle sue forme: riga, voce, coppia storica. */
export type GuardianLike = Record<string, any>;

export const asGuardianRecord = (valore: unknown): GuardianLike =>
  valore && typeof valore === "object" && !Array.isArray(valore)
    ? (valore as GuardianLike)
    : {};

/**
 * Le grafie del marchio di revoca. Le prime due sono della **voce**, le altre
 * due della **riga**: il travaso non le ha mai scritte dentro `data` — la
 * migrazione `20260906180000` toglie dal residuo proprio `accessRevokedAt` e
 * `access_revoked_at` — quindi leggerle tutte e quattro non puo far comparire
 * un marchio che nessuno ha messo.
 */
const CHIAVI_REVOCA = [
  "accessRevokedAt",
  "access_revoked_at",
  "revokedAt",
  "revoked_at",
] as const;

/** Le grafie del segno di solo recapito, sulla voce e sulla riga. */
const CHIAVI_SOLO_RECAPITO = ["contactOnly", "contact_only"] as const;

/**
 * **Un marchio e acceso quando c'e**, e le forme in cui un JSON dice «non c'e»
 * sono piu di una.
 *
 * `contactOnly: false` non esclude — e il caso ordinario, e la proiezione lo
 * scrive apposta perche «un segno **falso** deve arrivare a destinazione».
 * `"false"` e `"0"` nemmeno: sono la stessa cosa passata da un modulo o da un
 * parametro di query. Tutto il resto — una data, un oggetto `Date`, un `true`,
 * una stringa non vuota — accende.
 */
const NEGATIVI = new Set(["", "false", "0", "null", "undefined", "no"]);

const segnoAcceso = (valore: unknown): boolean => {
  if (valore === null || valore === undefined || valore === false) return false;
  if (typeof valore === "string") {
    return !NEGATIVI.has(valore.trim().toLowerCase());
  }
  if (typeof valore === "number") return valore !== 0;
  return true;
};

const unQualunque = (voce: unknown, chiavi: readonly string[]): boolean => {
  const v = asGuardianRecord(voce);
  return chiavi.some((chiave) => segnoAcceso(v[chiave]));
};

/** **Vero se questa riga, o questa voce, e revocata.** */
export const isGuardianRevoked = (voce: unknown): boolean =>
  unQualunque(voce, CHIAVI_REVOCA);

/** **Vero se questa riga, o questa voce, e di solo recapito.** */
export const isGuardianContactOnly = (voce: unknown): boolean =>
  unQualunque(voce, CHIAVI_SOLO_RECAPITO);

/**
 * **L'unica risposta alla domanda «questa persona e fuori?»** (49 §C).
 *
 * Nessun consumatore la ricostruisce, e nessuno puo chiederne una versione
 * piu larga o piu stretta: non ci sono parametri, perche un parametro di
 * sicurezza e il permesso di divergere scritto nella firma.
 */
export const isGuardianExcluded = (voce: unknown): boolean =>
  isGuardianRevoked(voce) || isGuardianContactOnly(voce);

/**
 * **I marchi di una voce, piegati con la stessa domanda che li legge**
 * (49 §C, ADR-0152).
 *
 * Quando piu righe finiscono nella stessa voce, il marchio vale per la voce
 * solo se vale per **tutte** le righe. Ripiegarlo con due `AND` indipendenti
 * — `contactOnly && contactOnly`, `accessRevokedAt && accessRevokedAt` — non e
 * la stessa cosa: due righe escluse **in due modi diversi** perdevano
 * entrambi i marchi, e la voce usciva viva.
 *
 * Si decide percio una volta sola, con `isGuardianExcluded`, e **poi** si
 * sceglie quale marchio esporre.
 */
export const foldGuardianExclusionMarks = (
  righe: readonly unknown[],
): { accessRevokedAt: string | null; contactOnly: boolean } => {
  const tutte = righe.length > 0 && righe.every((riga) => isGuardianExcluded(riga));
  if (!tutte) return { accessRevokedAt: null, contactOnly: false };

  const conRevoca = righe.find((riga) => isGuardianRevoked(riga));
  const marchio = conRevoca
    ? asGuardianRecord(conRevoca)
    : null;

  const valore = marchio
    ? CHIAVI_REVOCA.map((chiave) => marchio[chiave]).find((v) => segnoAcceso(v))
    : null;

  return {
    accessRevokedAt:
      valore instanceof Date
        ? valore.toISOString()
        : valore === null || valore === undefined
          ? null
          : String(valore),
    contactOnly: righe.some((riga) => isGuardianContactOnly(riga)),
  };
};
