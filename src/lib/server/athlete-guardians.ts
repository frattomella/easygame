import { prisma } from "./prisma";

/**
 * **L'unico scrittore dei tutori di un atleta** (PP-02, WP-C).
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * I tutori vivevano dentro `athletes.data.guardians[]`: un array JSON **senza
 * chiave**, dentro un blob che la rotta generica sostituisce per intero. In
 * quell'array c'era la decisione se una persona vede o non vede il fascicolo
 * sanitario di un minore.
 *
 * Da li discendeva tutto il resto, e non per caso:
 *
 * | Sintomo | Perche era inevitabile |
 * |---|---|
 * | la perdita di aggiornamento come guasto **normale** | leggere un array, modificarlo in memoria e riscriverlo per intero e una corsa per costruzione |
 * | cinque stesure del **riporto delle difese** in `resources.ts` | senza chiave non si sa quale riga in arrivo corrisponda a quale riga in archivio |
 * | due registri di scheda (`revokedGuardianIdentities`, `contactOnlyIdentities`) | erano il **surrogato** di una chiave unica |
 * | il ciclo dello sweep di revoca, e il suo blocco per riga | revocare una persona significava riscrivere ogni scheda del club |
 * | l'abbraccio mortale con il passaggio di stagione (`PP02-D34`) | due cicli che prendono le stesse righe in ordini scorrelati |
 * | il censimento degli scrittori: 4 → 6 → 8 → 9 → 16 | la rotta generica scrive con un delegato **calcolato a runtime**: nessuna ricerca testuale la trova |
 *
 * Una chiave unica non e un'ottimizzazione: e la condizione perche le altre
 * sei righe di questa tabella smettano di esistere.
 *
 * ## Come si diventa proprietari, davvero
 *
 * Dichiarare in CLAUDE.md «questo modulo e l'unico scrittore» e cio che questo
 * repository ha gia fatto per altri sei domini, e regge finche qualcuno legge
 * il documento. Qui non regge: il censimento e stato sbagliato cinque volte da
 * chi il documento lo aveva letto.
 *
 * Percio la proprieta e **imposta dall'archivio**. `athlete_guardians` accetta
 * un `INSERT` o un `UPDATE` solo dentro una transazione che abbia dichiarato
 * `SET LOCAL "easygame.guardian_writer" = 'on'`, e quella dichiarazione la
 * scrive una sola funzione: `withGuardianWriter`, qui sotto. Uno scrittore
 * nuovo — in un file che oggi non esiste, con Prisma o con SQL grezzo, dentro
 * la rotta generica o fuori — non incontra un elenco da aggiornare: incontra un
 * errore.
 *
 * La sonda `scripts/pp-02-proprietario-tutore.mjs` lo misura contro
 * PostgreSQL, e la prova 3 e la piu importante: dimostra che la difesa
 * **discrimina**, cioe che non e semplicemente una tabella in sola lettura.
 *
 * ## Le regole del dominio, in un posto solo
 *
 * 1. **Un tutore e una riga**, unica per `(athlete_id, identity_key)`.
 *    L'identita e l'utenza se c'e, altrimenti l'indirizzo in minuscolo. E la
 *    stessa normalizzazione con cui il travaso di WP-B ha riempito la tabella.
 * 2. **La revoca e un fatto sulla riga** (`revoked_at`), e si toglie solo
 *    riscattando un invito — che e l'atto tracciato che la scrive.
 * 3. **`contact_only` marca un recapito, non una chiave**: una riga nata da un
 *    modulo pubblico vale come indirizzo a cui scrivere e non apre l'area
 *    famiglia (ADR-0114 poggia sul presupposto che l'indirizzo lo scriva il
 *    club, e li quel presupposto non c'e).
 * 4. **Un salvataggio d'anagrafica non concede accessi.** Puo aggiornare cio
 *    che esiste e togliere righe; non puo far **crescere** l'insieme delle
 *    identita che aprono il fascicolo, ne resuscitare una riga revocata, a meno
 *    che chi scrive non porti la chiave che governa proprio questo.
 */

/* -------------------------------------------------------------------------
 * 1. Identita
 * ---------------------------------------------------------------------- */

/** `  Mario@ESEMPIO.it ` → `mario@esempio.it`. */
const normalizza = (valore: unknown): string =>
  String(valore ?? "")
    .trim()
    .toLowerCase();

const testo = (valore: unknown): string | null => {
  const pulito = String(valore ?? "").trim();
  return pulito || null;
};

export type GuardianInput = {
  userId?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  relationship?: string | null;
  contactOnly?: boolean;
  /** La chiave che la riga portava dentro il blob, per i riferimenti storici. */
  legacyId?: string | null;
  accessTokenValue?: string | null;
  accessTokenStatus?: string | null;
  accessTokenExpiresAt?: Date | null;
  accessTokenGeneratedAt?: Date | null;
};

/**
 * **L'identita su cui la riga e unica dentro l'atleta.**
 *
 * L'utenza se c'e, altrimenti l'indirizzo in minuscolo, altrimenti un ripiego
 * costruito sulla chiave storica — che **non fonde due sconosciuti diversi**,
 * perche due righe senza utenza e senza indirizzo sono due persone di cui non
 * si sa niente, non la stessa persona.
 *
 * Deve restare identica a quella del travaso (migrazione
 * `20260905120000_pp02_tutore_e_una_riga`, §3): se divergessero, una riga
 * travasata e la stessa riga riscritta dal prodotto diventerebbero due, e la
 * chiave unica smetterebbe di significare qualcosa.
 */
export const guardianIdentityKey = (input: GuardianInput): string | null => {
  const utenza = normalizza(input.userId);
  if (utenza) return utenza;

  const indirizzo = normalizza(input.email);
  if (indirizzo) return indirizzo;

  const storica = testo(input.legacyId);
  return storica ? `riga:${storica}` : null;
};

/* -------------------------------------------------------------------------
 * 2. Il permesso di scrivere
 * ---------------------------------------------------------------------- */

/**
 * Un client Prisma dentro una transazione interattiva non espone
 * `$transaction`. E il modo con cui il repository distingue gia altrove «mi
 * hanno passato una transazione» da «devo aprirne una io».
 */
const eUnaTransazione = (client: any) =>
  Boolean(client) && typeof client.$transaction !== "function";

/**
 * **L'unico posto in cui il permesso di scrivere i tutori viene acceso.**
 *
 * `SET LOCAL` vale per la transazione corrente e si spegne al `COMMIT` come al
 * `ROLLBACK`. Non e un dettaglio di implementazione: e la ragione per cui e un
 * permesso e non un interruttore. Prisma serve richieste diverse dalla stessa
 * connessione, e un flag di sessione resterebbe acceso per tutto cio che quella
 * connessione serve dopo la prima scrittura legittima.
 *
 * Il nome del parametro non e interpolabile — non e un valore, e un
 * identificatore — quindi la stringa qui e costante e non tocca mai un dato.
 */
export const withGuardianWriter = async <T>(
  client: any,
  azione: (tx: any) => Promise<T>,
): Promise<T> => {
  const esegui = async (tx: any) => {
    await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
    return azione(tx);
  };

  if (eUnaTransazione(client)) return esegui(client);

  const radice = client || prisma;
  return radice.$transaction((tx: any) => esegui(tx));
};

/* -------------------------------------------------------------------------
 * 3. Scrittura
 * ---------------------------------------------------------------------- */

export type GuardianRow = {
  id: string;
  organization_id: string;
  athlete_id: string;
  identity_key: string;
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  relationship: string | null;
  contact_only: boolean;
  linked_at: Date | null;
  revoked_at: Date | null;
  access_token_value: string | null;
  access_token_status: string | null;
  access_token_expires_at: Date | null;
  access_token_generated_at: Date | null;
  legacy_id: string | null;
};

/**
 * Scrive le righe passate, una `upsert` per identita.
 *
 * **Non e la porta dell'anagrafica**: e il mattone su cui le porte si
 * costruiscono. Non decide chi puo concedere un accesso, non toglie righe che
 * non le sono state nominate, e non tocca `revoked_at` — chi ha il diritto di
 * togliere una revoca lo fa da `linkGuardianAccount`, che e l'atto tracciato.
 *
 * Le righe senza identita si scartano: una riga che non nomina ne un'utenza ne
 * un indirizzo ne una chiave storica non e una persona, e in una tabella con
 * una chiave unica non ha un posto dove stare.
 */
export const upsertGuardianRows = async (
  client: any,
  parametri: {
    organizationId: string;
    athleteId: string;
    rows: GuardianInput[];
  },
): Promise<GuardianRow[]> => {
  const { organizationId, athleteId, rows } = parametri;

  /*
    **Due righe in arrivo con la stessa identita si fondono, non si scontrano.**

    Gli id sintetici del blob collidevano per costruzione, quindi un elenco che
    porta due volte lo stesso indirizzo e la norma e non un caso limite. Senza
    questa fusione la seconda `upsert` sovrascriverebbe la prima dentro la
    stessa transazione, e l'esito dipenderebbe dall'ordine.

    La fusione e **conservativa sulle difese**, come nel travaso: se una
    qualunque delle righe fuse era solo-recapito, lo e la riga risultante. Nel
    verso opposto si aprirebbe un accesso che nessuna delle due righe apriva.
  */
  const perIdentita = new Map<string, GuardianInput>();
  for (const riga of rows) {
    const chiave = guardianIdentityKey(riga);
    if (!chiave) continue;

    const gia = perIdentita.get(chiave);
    perIdentita.set(
      chiave,
      gia
        ? {
            ...gia,
            ...Object.fromEntries(
              Object.entries(riga).filter(([, valore]) => valore != null && valore !== ""),
            ),
            contactOnly: Boolean(gia.contactOnly || riga.contactOnly),
          }
        : riga,
    );
  }

  if (!perIdentita.size) return [];

  return withGuardianWriter(client, async (tx) => {
    const scritte: GuardianRow[] = [];

    for (const [identityKey, riga] of perIdentita) {
      const comuni = {
        user_id: testo(riga.userId),
        email: normalizza(riga.email) || null,
        first_name: testo(riga.firstName),
        last_name: testo(riga.lastName),
        phone: testo(riga.phone),
        relationship: testo(riga.relationship),
        contact_only: Boolean(riga.contactOnly),
        legacy_id: testo(riga.legacyId),
        access_token_value: testo(riga.accessTokenValue),
        access_token_status: testo(riga.accessTokenStatus),
        access_token_expires_at: riga.accessTokenExpiresAt ?? null,
        access_token_generated_at: riga.accessTokenGeneratedAt ?? null,
      };

      const record = await tx.athleteGuardian.upsert({
        where: { athlete_id_identity_key: { athlete_id: athleteId, identity_key: identityKey } },
        create: {
          organization_id: organizationId,
          athlete_id: athleteId,
          identity_key: identityKey,
          ...comuni,
        },
        update: comuni,
      });

      scritte.push(record as GuardianRow);
    }

    return scritte;
  });
};

/* -------------------------------------------------------------------------
 * 4. Lettura di autorita
 * ---------------------------------------------------------------------- */

/** I tutori di un atleta, come li vede chi decide un accesso. */
export const readGuardiansForAthlete = async (
  client: any,
  athleteId: string,
): Promise<GuardianRow[]> =>
  (client || prisma).athleteGuardian.findMany({
    where: { athlete_id: athleteId },
    orderBy: [{ created_at: "asc" }],
  }) as Promise<GuardianRow[]>;

/**
 * I tutori di piu atleti in **una** interrogazione.
 *
 * Su Neon da Vercel ogni lettura paga un giro di rete: una schermata che mostra
 * duecento atleti non deve pagarne duecento.
 */
export const readGuardiansForAthletes = async (
  client: any,
  athleteIds: string[],
): Promise<Map<string, GuardianRow[]>> => {
  const per = new Map<string, GuardianRow[]>();
  const identificativi = Array.from(new Set(athleteIds.filter(Boolean)));
  if (!identificativi.length) return per;

  const righe = (await (client || prisma).athleteGuardian.findMany({
    where: { athlete_id: { in: identificativi } },
    orderBy: [{ created_at: "asc" }],
  })) as GuardianRow[];

  for (const riga of righe) {
    const gia = per.get(riga.athlete_id);
    if (gia) gia.push(riga);
    else per.set(riga.athlete_id, [riga]);
  }

  return per;
};

/**
 * **Questa riga apre l'area famiglia a questa persona?**
 *
 * Le tre porte, nell'ordine in cui contano:
 *
 * 1. una riga **revocata** non apre niente. La revoca si toglie riscattando un
 *    invito, che riscrive `user_id` e azzera `revoked_at`;
 * 2. un legame **dichiarato** — l'utenza sulla riga — apre sempre, ed e l'atto
 *    tracciato e revocabile;
 * 3. l'indirizzo di contatto apre solo se **verificato** e solo se la riga non
 *    e `contact_only` (ADR-0114: vale perche lo scrive il club).
 */
export const guardianRowGrantsAccess = (
  riga: GuardianRow,
  userId: string,
  verifiedEmail?: string | null,
): boolean => {
  if (riga.revoked_at) return false;

  const utenza = normalizza(userId);
  if (utenza && normalizza(riga.user_id) === utenza) return true;

  if (riga.contact_only) return false;

  const indirizzo = normalizza(verifiedEmail);
  return Boolean(indirizzo) && normalizza(riga.email) === indirizzo;
};
