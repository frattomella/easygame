/**
 * **Chi riceve gli avvisi nuovi su un minore** (49 §H).
 *
 * ---
 *
 * ## Due letture gemelle, e le loro divergenze
 *
 * `medical-certificate-reminders.ts` e `document-requests.ts` rispondevano alla
 * stessa domanda con due funzioni scritte a mano, e ogni tornata di correzioni
 * ne allargava una sola:
 *
 * | | promemoria certificato | notifiche documentali |
 * |---|---|---|
 * | grafie dell'utenza | quattro | due, poi quattro |
 * | indirizzo confrontato col registro delle revoche | si | no (filtrava solo alla fine) |
 * | indirizzo in uscita azzerato se revocato | si | non ne emette |
 * | segno di solo recapito | riga + registro | riga + registro |
 *
 * «Un tutore legato smetteva di ricevere **solo** gli avvisi sui documenti che
 * il club gli chiede, mentre tutto il resto continuava ad arrivare: invisibile
 * da tutte e due le parti.»
 *
 * Qui la risposta e **una**, ed e l'unione delle difese di entrambe.
 *
 * ## Le tre difese, e l'uscita che le regge
 *
 * 1. il **marchio di riga** — revocata o di solo recapito (`isGuardianExcluded`);
 * 2. il **registro delle revoche**, perche il marchio di riga si aggirava
 *    aggiungendone una sorella con lo stesso indirizzo;
 * 3. il **registro dei soli recapiti**, per la stessa ragione.
 *
 * E l'uscita: **un legame dichiarato e non revocato vince**. Senza di essa i
 * canali erano piu chiusi del cancello, e in due modi che si vedevano solo dal
 * lato della famiglia — il percorso normale di una nuova iscrizione dava
 * l'area famiglia completa e **nessun invio**; e madre e padre con lo stesso
 * indirizzo di famiglia (ADR-0114) perdevano i canali **tutti e due** quando
 * se ne revocava uno.
 */

import {
  isGuardianContactOnly,
  isGuardianRevoked,
  asGuardianRecord,
  type GuardianLike,
} from "./exclusion";
import {
  guardianEmailText,
  guardianUserIdText,
  normalizeGuardianIdentity,
  readGuardianIdentityRegistry,
  resolveGuardianIdentity,
} from "./identity";
import { readGuardianEntries } from "./documents";

export type NotificationGuardian = {
  /** L'utenza a cui recapitare, gia scelta fra quelle non revocate. */
  linkedUserId: string;
  /** L'indirizzo a cui scrivere, vuoto se il registro lo dichiara revocato. */
  linkedUserEmail: string;
};

/**
 * La riga superstite **con** il suo recapito risolto.
 *
 * Serve al terzo gemello — il lettore dei recapiti in
 * `src/lib/athlete-guardians.ts`, da cui escono i solleciti degli insoluti e
 * le comunicazioni di gruppo — che oltre al recapito ha bisogno della riga per
 * darle un identificativo stabile e un nome da mostrare. Restituire solo il
 * recapito lo avrebbe costretto a filtrare una seconda volta: cioe a
 * ricostruirsi la regola in casa, che e il difetto che questo consolidamento
 * chiude.
 */
export type NotificationGuardianEntry = NotificationGuardian & {
  /** La riga com'e, senza normalizzazioni: chi la mostra decide come. */
  record: GuardianLike;
};

/**
 * **Le righe da cui partire.**
 *
 * `parent1`/`parent2` sono la forma di un'anagrafica travasata e **concedono**
 * come l'elenco: una lettura che guardasse solo `guardians` non mandava **mai**
 * una notifica a una famiglia travasata.
 *
 * La scelta fra le due forme si fa sul contenuto **grezzo**, mai sul filtrato:
 * guardandola dopo il filtro, un atleta i cui tutori fossero tutti revocati
 * ricadeva sulla coppia storica — cioe la revoca faceva **comparire**
 * destinatari invece di toglierli.
 */
const sorgente = (data: unknown): GuardianLike[] => {
  const d = asGuardianRecord(data);
  const elenco = readGuardianEntries(d);
  if (elenco.length > 0) return elenco;

  return [d.parent1, d.parent2]
    .filter((riga): riga is GuardianLike => Boolean(riga) && typeof riga === "object")
    .map((riga) => asGuardianRecord(riga));
};

/**
 * **I tutori che possono ricevere un avviso nuovo su questo minore.**
 *
 * `data` e `athletes.data`: la proiezione piu i due registri derivati.
 */
export const resolveNotificationGuardianEntries = (
  data: unknown,
): NotificationGuardianEntry[] => {
  const d = asGuardianRecord(data);

  const revocate = readGuardianIdentityRegistry(d.revokedGuardianIdentities);
  const recapitiSoli = readGuardianIdentityRegistry(d.contactOnlyIdentities);

  return sorgente(d)
    .filter((riga) => {
      const identita = resolveGuardianIdentity(riga);

      /* Un legame dichiarato e non revocato vince, come per l'accesso. */
      if (identita.userIds.some((voce) => !revocate.has(voce))) return true;

      /*
        Il registro delle revoche vale sull'utenza **e** sull'indirizzo: la
        riga sorella con lo stesso indirizzo di famiglia e il modo in cui il
        marchio di riga si aggirava.
      */
      if ([...identita.userIds, ...identita.emails].some((voce) => revocate.has(voce))) {
        return false;
      }

      if (isGuardianExcludedPerInvio(riga, recapitiSoli)) return false;

      return true;
    })
    .map((riga) => {
      const scritto = guardianEmailText(riga);
      return {
        record: riga,
        linkedUserId: guardianUserIdText(riga, revocate),
        /*
          **Un indirizzo revocato non esce nemmeno da una riga superstite.**

          L'uscita «un legame dichiarato vince» tiene in piedi la riga del
          padre, che pero porta l'indirizzo di famiglia condiviso — lo stesso
          che la revoca della madre ha messo nel registro. Da li la notifica
          finiva **nella bacheca della madre revocata**, con il nome del minore.
        */
        linkedUserEmail:
          scritto && revocate.has(normalizeGuardianIdentity(scritto)) ? "" : scritto,
      };
    });
};

/**
 * **I tutori che possono ricevere un avviso nuovo, come recapiti.**
 *
 * La stessa risposta di `resolveNotificationGuardianEntries` senza la riga:
 * chi manda un avviso non ha bisogno di sapere da quale riga viene.
 */
export const resolveNotificationGuardians = (
  data: unknown,
): NotificationGuardian[] =>
  resolveNotificationGuardianEntries(data).map(({ record: _riga, ...recapito }) => recapito);

/**
 * Il marchio di riga piu il registro dei soli recapiti: il segno vive dentro
 * il blob che la rotta generica sostituisce per intero, e il registro sta
 * sull'atleta.
 */
const isGuardianExcludedPerInvio = (
  riga: GuardianLike,
  recapitiSoli: ReadonlySet<string>,
): boolean => {
  if (isGuardianContactOnly(riga) || isGuardianRevoked(riga)) return true;
  if (!recapitiSoli.size) return false;

  return resolveGuardianIdentity(riga).emails.some((voce) => recapitiSoli.has(voce));
};

/**
 * **Le utenze a cui recapitare una notifica su questo atleta**: i tutori vivi
 * piu l'atleta stesso, se ha un'utenza sua.
 *
 * Il filtro finale sul registro resta anche qui: l'utenza dell'atleta non
 * passa dai tutori, e una riga potrebbe portarne una che nessuna delle uscite
 * qui sopra ha guardato.
 */
export const resolveNotificationRecipientUserIds = (athlete: unknown): string[] => {
  const a = asGuardianRecord(athlete);
  const revocate = readGuardianIdentityRegistry(
    asGuardianRecord(a.data).revokedGuardianIdentities,
  );

  const collegati = resolveNotificationGuardians(a.data)
    .map((voce) => voce.linkedUserId)
    .filter(Boolean);

  const suo = String(a.user_id ?? "").trim();

  return [...new Set([suo, ...collegati].filter(Boolean))].filter(
    (id) => !revocate.has(normalizeGuardianIdentity(id)),
  );
};
