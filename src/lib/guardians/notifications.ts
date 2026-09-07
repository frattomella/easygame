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
import { isEmptyGuardianEntry, readGuardianEntries } from "./documents";

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

  /*
    Le voci vuote non sono destinatari per costruzione — non portano ne
    utenza ne indirizzo — e toglierle **non cambia chi riceve**. Non e il
    filtro che decideva l'emptiness: quello sta nella riga dopo, e guarda
    l'array grezzo.
  */
  const elenco = readGuardianEntries(d).filter(
    (voce) => !isEmptyGuardianEntry(voce),
  );

  /*
    **Se la proiezione ha girato, il blob storico e morto** (49 §A).

    La scelta era «l'elenco se non e vuoto, altrimenti la coppia storica», e la
    giustificazione diceva: «ogni lettore storico consulta la coppia solo
    quando `guardians` e vuoto, e dopo il travaso non lo e piu». **Non e
    vero**: `guardians` torna vuoto appena si toglie l'ultima riga di tutore —
    il gesto piu ordinario che ci sia — e il travaso non cancella
    `parent1`/`parent2` da `athletes.data`.

    Esito misurato: tolta l'ultima voce, l'ex tutore continuava a ricevere per
    sempre i solleciti degli insoluti — con il nome del minore e il link per
    pagare — i promemoria del certificato e le notifiche documentali. Il blob
    non porta marchi, e nessun registro derivato lo copre: era un'autorita di
    fatto, che §A vieta.

    La domanda giusta non e «l'elenco e vuoto?» ma **«la proiezione esiste?»**.
    `refreshGuardianProjection` scrive sempre la chiave, anche a zero righe:
    se c'e, l'autorita ha parlato, e ha detto «nessuno».
  */
  if (Array.isArray(d.guardians)) return elenco;

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

      /*
        **Il marchio della riga viene prima, e vince su tutto** (49 §C).

        L'uscita qui sotto — «un legame dichiarato e non revocato vince» —
        stava **prima**, e quindi il marchio della riga non veniva mai
        consultato per chi porta un'utenza. Su una riga `contact_only` che
        porta anche `user_id` — configurazione che la §3 del travaso produce,
        perche marca per identita senza azzerare l'utenza — la voce risultava
        esclusa per `isGuardianExcluded` e **riceveva lo stesso**, su tutti e
        tre i canali: promemoria del certificato, notifiche documentali e
        solleciti degli insoluti con il link per pagare.

        L'uscita esiste per un'altra ragione, e resta: i **registri** sono
        elenchi di identita, e un indirizzo di famiglia condiviso (ADR-0114) vi
        finisce dentro revocando **l'altro** genitore. E li che un legame
        dichiarato deve poter vincere — sul registro, mai sul marchio, che e
        l'autorita della propria riga.
      */
      if (isGuardianExcludedPerRiga(riga)) return false;

      /* Un legame dichiarato e non revocato vince **sul registro**. */
      if (identita.userIds.some((voce) => !revocate.has(voce))) return true;

      /*
        Il registro delle revoche vale sull'utenza **e** sull'indirizzo: la
        riga sorella con lo stesso indirizzo di famiglia e il modo in cui il
        marchio di riga si aggirava.
      */
      if ([...identita.userIds, ...identita.emails].some((voce) => revocate.has(voce))) {
        return false;
      }

      if (identita.emails.some((voce) => recapitiSoli.has(voce))) return false;

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
 * **Il marchio della riga**, che e l'autorita della riga su se stessa.
 *
 * Sta separato dai due registri perche i due hanno forza diversa: il marchio
 * non si aggira e non ammette uscite, i registri sono elenchi di **identita** e
 * un indirizzo condiviso vi finisce dentro per colpa di qualcun altro.
 */
const isGuardianExcludedPerRiga = (riga: GuardianLike): boolean =>
  isGuardianContactOnly(riga) || isGuardianRevoked(riga);

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
