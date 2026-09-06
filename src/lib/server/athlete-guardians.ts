import { randomUUID } from "crypto";

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
  /**
   * **La riga che il chiamante sta nominando**, quando la conosce.
   *
   * La proiezione dentro `athletes.data.guardians[]` porta `id`, e quello e
   * l'identificativo della riga: la scheda lo rimanda indietro, e da li si sa
   * **quale** riga il salvataggio intendeva, senza doverlo dedurre.
   *
   * Serve a due cose che altrimenti si escludono: una riga senza indirizzo e
   * senza utenza — un tutore di cui il club ha solo il telefono — resta
   * riconoscibile fra un salvataggio e l'altro; e **correggere un indirizzo**
   * resta possibile, perche si vede che l'identita e cambiata su una riga che
   * si sa quale sia.
   */
  rowId?: string | null;
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

/**
 * **La chiave di una riga che non nomina nessuno.**
 *
 * Un tutore di cui il club ha soltanto il nome e il telefono esiste, e deve
 * poter esistere: apre niente — nessuna utenza, nessun indirizzo — ma e un
 * recapito, ed e cio che serve per chiamare una famiglia.
 *
 * La sua identita e la riga stessa. Si conia insieme all'identificativo,
 * perche i due devono coincidere: la proiezione pubblica l'`id`, la scheda lo
 * rimanda, e se la chiave fosse un'altra cosa il salvataggio successivo
 * vedrebbe una persona nuova e ne creerebbe una seconda.
 */
const rigaSenzaIdentita = () => {
  const id = randomUUID();
  return { id, identity_key: `riga:${id}` };
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
 * **L'ordine che l'array aveva e la tabella non ha.**
 *
 * Tre cose leggono i tutori per **posizione** e non per identita:
 * `data.billingGuardianIndex` decide di chi e il codice fiscale su una
 * ricevuta; i segnaposto `{{parent.1.*}}` decidono quale genitore compare su un
 * documento; il `recordId` di una compilazione gia salvata dice quale riga
 * quella pratica stava modificando. Nessuna delle tre puo cambiare persona
 * senza riscrivere un fatto gia accaduto.
 *
 * `created_at` **non** basta e sarebbe una trappola: il travaso scrive tutte le
 * righe con lo stesso `now()`, quindi ordinare per quello e non ordinare
 * affatto — e non ordinare in un modo che sembra funzionare finche non cambia
 * il piano di query. La posizione e percio una colonna, e `id` chiude
 * l'ordinamento perche due righe non possano scambiarsi fra due letture.
 */
const ORDINE_STABILE = [
  { position: "asc" as const },
  { created_at: "asc" as const },
  { id: "asc" as const },
];

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
  const perIdentita = new Map<string, GuardianInput & { posizione: number }>();
  rows.forEach((riga, posizione) => {
    const chiave = guardianIdentityKey(riga);
    if (!chiave) return;

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
            posizione: gia.posizione,
          }
        : { ...riga, posizione },
    );
  });

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
        position: riga.posizione,
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

    await refreshGuardianProjection(tx, [athleteId]);

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
    orderBy: ORDINE_STABILE,
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
    orderBy: ORDINE_STABILE,
  })) as GuardianRow[];

  for (const riga of righe) {
    const gia = per.get(riga.athlete_id);
    if (gia) gia.push(riga);
    else per.set(riga.athlete_id, [riga]);
  }

  return per;
};

/**
 * **La riga che questo identificativo nomina.**
 *
 * Ne esistono di tre forme, e vanno cercate tutte e tre nell'ordine dal piu
 * preciso al piu largo:
 *
 * 1. l'identificativo della **riga**, che e cio che la proiezione pubblica e
 *    che ogni schermata usa da adesso;
 * 2. la chiave che quella riga aveva nel blob, conservata in `legacy_id`:
 *    la porta un invito spedito **prima** del passaggio, e una scheda aperta
 *    in una linguetta che nessuno ha ricaricato;
 * 3. l'identita — l'utenza o l'indirizzo — per chi nomina la persona e non la
 *    riga.
 *
 * L'ordine non e una comodita: cercare prima per identita farebbe collegare
 * **il padre** a un invito spedito alla madre, perche in una famiglia
 * l'indirizzo e uno solo (ADR-0114). La riga vince sempre sulla persona.
 */
export const findGuardianRow = async (
  client: any,
  athleteId: string,
  handle: string | null | undefined,
): Promise<GuardianRow | null> => {
  const chiave = String(handle || "").trim();
  if (!chiave) return null;

  const eUnIdentificativo =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chiave);

  const candidate = (await (client || prisma).athleteGuardian.findMany({
    where: {
      athlete_id: athleteId,
      OR: [
        ...(eUnIdentificativo ? [{ id: chiave }] : []),
        { legacy_id: chiave },
        { identity_key: normalizza(chiave) },
      ],
    },
    orderBy: ORDINE_STABILE,
  })) as GuardianRow[];

  return (
    (eUnIdentificativo && candidate.find((riga) => riga.id === chiave)) ||
    candidate.find((riga) => riga.legacy_id === chiave) ||
    candidate.find((riga) => riga.identity_key === normalizza(chiave)) ||
    null
  );
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

/* -------------------------------------------------------------------------
 * 5. Le porte del dominio
 * ---------------------------------------------------------------------- */

/**
 * **Il salvataggio dell'anagrafica, che non e un atto di concessione.**
 *
 * E la porta che la segreteria attraversa salvando la scheda di un atleta, e
 * la rotta generica ci arriva **dopo** aver tolto i tutori dal blob: qui non
 * si riscrive un JSON, si riconcilia un insieme di righe con una chiave.
 *
 * Le quattro regole, e cosa chiude ciascuna:
 *
 * | Regola | Cosa chiude |
 * |---|---|
 * | una riga **revocata** non si toglie e non si riapre | il salvataggio ordinario che riaccendeva un accesso — il difetto per cui `resources.ts` ha scritto cinque volte il riporto delle difese |
 * | `user_id` non si scrive da qui | «un legame con una famiglia non si crea scrivendo l'anagrafica»: il legame nasce riscattando un invito, che e tracciato e revocabile |
 * | una **identita nuova** richiede `canGrantAccess` | scrivere un indirizzo e un atto che apre il fascicolo sanitario di un minore (ADR-0114), e chiede la chiave che governa proprio questo |
 * | `contact_only` non si toglie da qui | il segno di una riga nata da un modulo pubblico lo toglie solo un invito riscattato |
 *
 * **Cosa e sparito rispetto al blob.** Non c'e piu niente da «abbinare»: la
 * domanda «quale riga in arrivo corrisponde a quale riga in archivio» — quella
 * che quattro stesure hanno sbagliato per `id`, per posizione e per identita —
 * qui non si pone, perche la risposta e la chiave unica. E non c'e piu niente
 * da «riportare»: una difesa che vive sulla riga non si perde riscrivendo il
 * blob accanto, perche non c'e piu un blob accanto.
 */
export const saveGuardianRegistry = async (
  client: any,
  parametri: {
    organizationId: string;
    athleteId: string;
    rows: GuardianInput[];
    /**
     * Se chi salva porta la chiave che governa la concessione di un accesso
     * all'area famiglia. Lo calcola chi conosce il perimetro di chi scrive —
     * la rotta — perche e una domanda sui permessi; **la regola** invece sta
     * qui, in un posto solo.
     */
    canGrantAccess: boolean;
  },
): Promise<{
  aggiunte: string[];
  aggiornate: string[];
  tolte: string[];
  negate: string[];
}> => {
  const { organizationId, athleteId, rows, canGrantAccess } = parametri;

  return withGuardianWriter(client, async (tx) => {
    /*
      La lettura sta **dentro** la transazione, e non serve un blocco sulla
      riga dell'atleta: due salvataggi concorrenti toccano righe diverse quando
      nominano persone diverse, e la stessa riga quando nominano la stessa
      persona — dove la chiave unica e l'`UPDATE` fanno il lavoro che il blocco
      faceva sul blob. E la ragione per cui `lockAthleteRow` esce da questi
      percorsi.
    */
    const esistenti = (await tx.athleteGuardian.findMany({
      where: { athlete_id: athleteId },
    })) as GuardianRow[];

    const perId = new Map(esistenti.map((riga) => [riga.id, riga]));
    const perChiave = new Map(esistenti.map((riga) => [riga.identity_key, riga]));

    /*
      **Chi e questa riga in arrivo**, in due domande e nell'ordine giusto.

      1. **Nomina una riga che esiste?** La proiezione pubblica l'`id`, e la
         scheda lo rimanda. E la risposta esatta, e non si deduce.
      2. Altrimenti, **che identita porta?** L'utenza se c'e, l'indirizzo se no.

      L'ordine conta: chiedere prima l'identita renderebbe impossibile
      **correggere un indirizzo** — l'identita cambierebbe e la riga vecchia
      resterebbe viva accanto alla nuova, cioe una persona che oggi perde
      l'accesso domani lo terrebbe. Chiedendo prima la riga, si vede che quella
      riga ha cambiato identita, ed e una sostituzione.
    */
    type InArrivo = {
      input: GuardianInput;
      posizione: number;
      /** La riga che questo elemento nomina, se ne nomina una. */
      riga: GuardianRow | null;
      /** L'identita che porta adesso. `null` se non nomina nessuno. */
      chiave: string | null;
    };

    const inArrivo: InArrivo[] = [];
    const nominate = new Set<string>();

    rows.forEach((input, posizione) => {
      const riga = perId.get(String(input.rowId || "")) || null;
      const chiave = guardianIdentityKey(input);

      /*
        Due elementi che finiscono sulla stessa riga o sulla stessa identita si
        fondono: gli id sintetici del blob collidevano per costruzione, quindi
        un elenco che porta due volte la stessa persona e la norma. Vince il
        primo, che e quello che si vedeva piu in alto.
      */
      const gia = riga ? `riga:${riga.id}` : chiave;
      if (gia) {
        if (nominate.has(gia)) return;
        nominate.add(gia);
      }

      inArrivo.push({ input, posizione, riga, chiave });
    });

    const aggiunte: string[] = [];
    const aggiornate: string[] = [];
    const tolte: string[] = [];

    /*
      **Una identita nuova concede solo se appartiene a qualcuno.**

      Questa e la regola che la rotta generica aveva scritto tre volte, e va
      riportata **esatta**, non «piu stretta»: negare ogni crescita e gia stato
      provato, e il prezzo misurato era che una «Segreteria» modellata come
      ruolo di club non poteva piu correggere un refuso nell'email di un
      tutore — cioe il lavoro di tutti i giorni.

      Cio che concede accesso non e scrivere un indirizzo: e scriverne uno che
      **corrisponde a un'utenza**. Si guarda quindi se le identita nuove
      esistono davvero, e solo allora la scrittura e una concessione.

      Resta la finestra, e va detta: scrivere oggi l'indirizzo di un'utenza che
      **nascera domani** produce il legame senza passare di qui. Chiuderla
      vorrebbe dire negare la correzione di un'email. E in
      `16-technical-debt.md`.

      **Perche solleva invece di saltare la riga.** Un salvataggio che riesce a
      meta e peggio di uno che fallisce: la segreteria legge «salvato», e il
      tutore che credeva di avere aggiunto non c'e. La rotta traduce
      «Accesso negato» in un 403, ed e cio che l'interfaccia sa mostrare.
    */
    const nuove = inArrivo
      .filter(
        (voce) =>
          voce.chiave &&
          voce.chiave !== voce.riga?.identity_key &&
          !perChiave.has(voce.chiave),
      )
      .map((voce) => voce.chiave as string);

    if (nuove.length && !canGrantAccess) {
      const perUuid = nuove.filter((valore) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valore),
      );
      const perEmail = nuove.filter((valore) => valore.includes("@"));

      const utenze =
        perUuid.length || perEmail.length
          ? await tx.user.findMany({
              where: {
                OR: [
                  ...(perUuid.length ? [{ id: { in: perUuid } }] : []),
                  ...(perEmail.length
                    ? [{ email: { in: perEmail, mode: "insensitive" as const } }]
                    : []),
                ],
              },
              select: { id: true, email: true },
            })
          : [];

      const esistentiFraLeUtenze = new Set<string>();
      for (const utenza of utenze) {
        esistentiFraLeUtenze.add(normalizza(utenza.id));
        if (utenza.email) esistentiFraLeUtenze.add(normalizza(utenza.email));
      }

      if (nuove.some((chiave) => esistentiFraLeUtenze.has(chiave))) {
        throw new Error(
          "Accesso negato: il legame fra un tutore e un'utenza apre a quella persona l'area famiglia del minore — dato sanitario compreso — e servono sia il permesso sugli accessi sia quello sul dato clinico",
        );
      }
    }

    const sopravvissute = new Set<string>();

    for (const voce of inArrivo) {
      const { input, posizione, riga, chiave } = voce;

      /*
        La riga esiste e la sua identita non e cambiata: si aggiorna **come si
        chiama la persona e dove la si raggiunge**, e nient'altro. Non se apre
        il fascicolo, non se e revocata, non se e un solo-recapito.
      */
      if (riga && (!chiave || chiave === riga.identity_key)) {
        await tx.athleteGuardian.update({
          where: { id: riga.id },
          data: {
            first_name: testo(input.firstName) ?? riga.first_name,
            last_name: testo(input.lastName) ?? riga.last_name,
            phone: testo(input.phone) ?? riga.phone,
            relationship: testo(input.relationship) ?? riga.relationship,
            position: posizione,
          },
        });
        sopravvissute.add(riga.id);
        aggiornate.push(riga.identity_key);
        continue;
      }

      /*
        L'identita in arrivo esiste gia su un'altra riga: e la stessa persona,
        e si aggiorna quella. Non se ne crea una seconda, che e cio che la
        chiave unica rifiuterebbe comunque.
      */
      const gemella = chiave ? perChiave.get(chiave) : null;
      if (gemella) {
        await tx.athleteGuardian.update({
          where: { id: gemella.id },
          data: {
            first_name: testo(input.firstName) ?? gemella.first_name,
            last_name: testo(input.lastName) ?? gemella.last_name,
            phone: testo(input.phone) ?? gemella.phone,
            relationship: testo(input.relationship) ?? gemella.relationship,
            position: posizione,
          },
        });
        sopravvissute.add(gemella.id);
        aggiornate.push(gemella.identity_key);
        continue;
      }

      /* Nasce una riga: o e una persona nuova, o e un indirizzo corretto. */
      const coniata = chiave ? null : rigaSenzaIdentita();
      const creata = await tx.athleteGuardian.create({
        data: {
          ...(coniata ? { id: coniata.id } : {}),
          organization_id: organizationId,
          athlete_id: athleteId,
          identity_key: chiave || (coniata as { identity_key: string }).identity_key,
          /* `user_id` no: un legame non si crea scrivendo l'anagrafica. */
          email: normalizza(input.email) || null,
          first_name: testo(input.firstName),
          last_name: testo(input.lastName),
          phone: testo(input.phone),
          relationship: testo(input.relationship),
          contact_only: Boolean(input.contactOnly),
          legacy_id: testo(input.legacyId),
          position: posizione,
        },
      });
      sopravvissute.add(creata.id);
      aggiunte.push(creata.identity_key);
    }

    for (const riga of esistenti) {
      if (sopravvissute.has(riga.id)) continue;

      /*
        **Una riga revocata non si toglie da qui.**

        Toglierla e riscriverla sarebbe il modo di lavare il marchio: due
        salvataggi ordinari, e la persona che il club aveva escluso torna
        dentro senza che nessuna schermata di revoca sia stata toccata. Una
        riga `contact_only` invece si puo togliere — non apre niente, e
        riscriverla costa comunque la chiave della concessione.
      */
      if (riga.revoked_at) continue;

      await tx.athleteGuardian.delete({ where: { id: riga.id } });
      tolte.push(riga.identity_key);
    }

    await refreshGuardianProjection(tx, [athleteId]);

    return { aggiunte, aggiornate, tolte, negate: [] };
  });
};

/**
 * **L'approvazione di un modulo, che aggiunge un tutore senza leggerne l'elenco.**
 *
 * `PP02-D33` diceva: cinque approvazioni concorrenti sullo stesso atleta
 * perdono righe, «tutte rispondono Genitore aggiunto e in anagrafica ne
 * arrivano due o tre». Misurato sei giri su sei. La causa non era il blocco
 * mancante: era che `decideFormSubmission` legge l'array **prima** della
 * transazione e lo rimanda, quindi due decisioni serializzate scrivono ognuna
 * il proprio snapshot.
 *
 * Qui l'elenco non si legge affatto. Una `upsert` su `(athlete_id,
 * identity_key)` non ha uno snapshot da rimandare: cinque approvazioni
 * concorrenti scrivono cinque righe, o la stessa riga cinque volte se
 * nominano la stessa persona. **D33 si chiude perche la domanda non si pone
 * piu**, non perche sia stata messa una serratura piu grossa.
 *
 * `contactOnly` lo decide chi chiama, e il criterio e uno solo: **l'ha scritto
 * il club?** ADR-0114 fa valere l'indirizzo come chiave poggiando su quel
 * presupposto, e una compilazione pubblica non lo soddisfa.
 */
export const upsertGuardianFromFormApproval = async (
  client: any,
  parametri: {
    organizationId: string;
    athleteId: string;
    row: GuardianInput;
    contactOnly: boolean;
    /**
     * La riga che questa compilazione stava **modificando**, quando la
     * modifica ne cambia l'identita — cioe l'indirizzo.
     *
     * Serve a non allargare: nel blob l'approvazione sovrascriveva la riga in
     * quella posizione, quindi il vecchio indirizzo smetteva di aprire. Qui
     * l'identita nuova nasce come riga sua, e senza questo la vecchia
     * resterebbe viva — una persona che oggi perde l'accesso, domani lo
     * terrebbe.
     */
    replacesGuardianRowId?: string | null;
  },
): Promise<GuardianRow | null> => {
  const { organizationId, athleteId, row, contactOnly } = parametri;

  /*
    Un tutore dichiarato con il solo nome e telefono non nomina nessuno, e deve
    poter esistere lo stesso: e un recapito, non una chiave. La sua identita e
    la riga, coniata insieme all'identificativo perche i due coincidano.
  */
  const coniata = guardianIdentityKey(row) ? null : rigaSenzaIdentita();
  const identityKey =
    guardianIdentityKey(row) || (coniata as { identity_key: string }).identity_key;

  return withGuardianWriter(client, async (tx) => {
    /*
      **Una riga nata da un modulo si accoda**, come faceva `guardians.push`.
      Se cadesse in testa, sposterebbe di uno il destinatario fiscale e il
      «genitore 1» di ogni documento di quell'atleta.
    */
    const gia = (await tx.athleteGuardian.findMany({
      where: { athlete_id: athleteId },
      select: { position: true },
    })) as Array<{ position: number }>;
    const posizione =
      gia.reduce((massimo, riga) => Math.max(massimo, Number(riga.position ?? 0)), -1) + 1;

    /*
      **Il segno si mette solo su una riga che nasce.**

      Applicarlo anche all'aggiornamento declasserebbe a solo-recapito un
      tutore che la segreteria aveva scritto mesi prima — che ADR-0114 dichiara
      valido — perche uno sconosciuto ha compilato il modulo pubblico su quel
      minore. Nel blob questa distinzione richiedeva di sapere se l'indice
      corrispondesse a una riga esistente; qui la fa la `upsert`.
    */
    const record = await tx.athleteGuardian.upsert({
      where: {
        athlete_id_identity_key: { athlete_id: athleteId, identity_key: identityKey },
      },
      create: {
        ...(coniata ? { id: coniata.id } : {}),
        organization_id: organizationId,
        athlete_id: athleteId,
        identity_key: identityKey,
        email: normalizza(row.email) || null,
        first_name: testo(row.firstName),
        last_name: testo(row.lastName),
        phone: testo(row.phone),
        relationship: testo(row.relationship),
        contact_only: contactOnly,
        legacy_id: testo(row.legacyId),
        position: posizione,
      },
      update: {
        first_name: testo(row.firstName) ?? undefined,
        last_name: testo(row.lastName) ?? undefined,
        phone: testo(row.phone) ?? undefined,
        relationship: testo(row.relationship) ?? undefined,
      },
    });

    /*
      **La riga sostituita se ne va, tranne se e revocata.**

      Toglierne una revocata e riscriverla con un indirizzo appena diverso
      sarebbe il modo di lavare il marchio approvando un modulo, cioe da una
      porta che non chiede la chiave della concessione. Una riga revocata
      resta dov'e, e la persona nuova nasce accanto.
    */
    const sostituita = testo(parametri.replacesGuardianRowId);
    if (sostituita && sostituita !== record.id) {
      await tx.athleteGuardian.deleteMany({
        where: { id: sostituita, athlete_id: athleteId, revoked_at: null },
      });
    }

    await refreshGuardianProjection(tx, [athleteId]);

    return record as GuardianRow;
  });
};

/**
 * **Il riscatto di un invito: l'unico atto che apre.**
 *
 * E la sola strada che azzera `revoked_at` e toglie `contact_only`, e non e
 * una concessione discrezionale: e la persona che dimostra di avere ricevuto
 * l'invito. Cio che nel blob erano tre scritture in corsa fra loro — la riga,
 * il registro delle revoche, il registro dei recapiti — qui e **una riga**.
 *
 * Quando l'invito nomina un indirizzo e la persona che lo riscatta ha
 * un'utenza, la riga resta sulla chiave con cui e nata: `identity_key` non si
 * riscrive, altrimenti una riga travasata e la stessa riga riscritta dal
 * prodotto diventerebbero due.
 */
export const linkGuardianAccount = async (
  client: any,
  parametri: {
    athleteId: string;
    /** La riga da collegare, se il chiamante la conosce gia. */
    guardianRowId?: string | null;
    /** Altrimenti la si trova per identita. */
    identityKeys?: string[];
    userId: string;
    email?: string | null;
  },
): Promise<GuardianRow | null> => {
  const { athleteId, guardianRowId, identityKeys, userId, email } = parametri;

  const identita = Array.from(
    new Set([...(identityKeys || []), userId, email].map(normalizza).filter(Boolean)),
  );

  /*
    **Un invito spedito prima del passaggio nomina una riga del blob.**

    Il gettone porta l'identificativo del tutore com'era quando e stato coniato,
    e ne esistono di tre forme: l'identificativo della **riga** (quelli coniati
    da adesso), una chiave del blob conservata in `legacy_id` (quelli coniati
    prima), e nessuna delle due — un invito che nomina la persona e basta.

    Si cercano tutte e tre, nell'ordine dal piu preciso al piu largo. Un invito
    gia spedito e una promessa fatta a una famiglia: non deve smettere di
    funzionare perche l'archivio ha cambiato forma.
  */
  const eUnIdentificativo =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(guardianRowId || ""),
    );

  return withGuardianWriter(client, async (tx) => {
    const strade: any[] = [];
    if (guardianRowId && eUnIdentificativo) strade.push({ id: guardianRowId });
    if (guardianRowId) strade.push({ legacy_id: String(guardianRowId) });
    if (identita.length) strade.push({ identity_key: { in: identita } });

    if (!strade.length) return null;

    /*
      L'ordine delle strade decide, e `findFirst` non lo conosce: si cercano
      tutte e si sceglie la prima strada che ha trovato qualcosa. Una riga
      nominata per identificativo vince su una trovata per identita, altrimenti
      un invito per la madre potrebbe collegare il padre allo stesso indirizzo.
    */
    const candidate = (await tx.athleteGuardian.findMany({
      where: { athlete_id: athleteId, OR: strade },
      orderBy: ORDINE_STABILE,
    })) as GuardianRow[];

    const riga =
      (eUnIdentificativo &&
        candidate.find((voce) => voce.id === guardianRowId)) ||
      (guardianRowId &&
        candidate.find((voce) => voce.legacy_id === String(guardianRowId))) ||
      candidate.find((voce) => identita.includes(voce.identity_key)) ||
      null;

    if (!riga) return null;

    const record = await tx.athleteGuardian.update({
      where: { id: riga.id },
      data: {
        user_id: userId,
        email: normalizza(email) || riga.email,
        linked_at: riga.linked_at ?? new Date(),
        /* Le tre difese che il riscatto scioglie, e nient'altro. */
        revoked_at: null,
        contact_only: false,
        access_token_status: "redeemed",
        access_token_value: null,
      },
    });

    await refreshGuardianProjection(tx, [athleteId]);

    return record as GuardianRow;
  });
};

/**
 * **Scollegare un tutore: la revoca e un fatto sulla riga.**
 *
 * Nel blob questa operazione doveva bloccare la riga dell'atleta, rileggere il
 * blob dentro il blocco, rifare la ripulitura per identita su tutte le righe
 * sorelle e riscrivere il registro — perche il client della scheda rimanda
 * **sempre** l'array dei tutori, e bastavano due persone in segreteria sulla
 * stessa scheda perche la revoca sparisse per intero (misurato tre volte su
 * tre). Qui e una `UPDATE` su una riga con una chiave: non c'e uno snapshot da
 * rimandare, quindi non c'e una corsa da perdere.
 */
export const revokeGuardianRow = async (
  client: any,
  parametri: { athleteId: string; guardianRowId: string },
): Promise<GuardianRow | null> =>
  withGuardianWriter(client, async (tx) => {
    const aggiornate = await tx.athleteGuardian.updateMany({
      where: { id: parametri.guardianRowId, athlete_id: parametri.athleteId },
      data: {
        revoked_at: new Date(),
        user_id: null,
        access_token_status: "revoked",
        access_token_value: null,
      },
    });

    if (!aggiornate.count) return null;

    await refreshGuardianProjection(tx, [parametri.athleteId]);

    return (await tx.athleteGuardian.findUnique({
      where: { id: parametri.guardianRowId },
    })) as GuardianRow;
  });

/**
 * **La revoca di una tessera, in una istruzione.**
 *
 * Questo e il cuore di `R-2` e di `PP02-D34`, e vale la pena dire cosa era e
 * cosa e.
 *
 * **Era** un ciclo su ogni tesserato del club: per ognuno un blocco di riga,
 * una rilettura, una ripulitura del blob in memoria e una `update`. Da quella
 * forma discendevano due difetti che **non si potevano chiudere insieme**:
 * scegliere le schede fuori dal blocco lasciava sfuggire quella che acquista
 * il tutore mentre la revoca gira (5 giri su 5), e bloccarle tutte con un
 * `FOR UPDATE` sul club chiudeva quella finestra ma andava in abbraccio
 * mortale con il passaggio di stagione, che prende le stesse righe in un
 * ordine scorrelato (5 giri su 5, dal log di PostgreSQL). Piu un tetto: oltre
 * ~1.100 schede toccate la transazione scadeva.
 *
 * **E** una `UPDATE` con un `WHERE`. Non c'e una scansione, quindi non c'e una
 * finestra fra la scelta e l'azione; non ci sono blocchi per riga, quindi non
 * c'e un ordine di acquisizione da incrociare con nessun altro; e il costo non
 * cresce con i tesserati del club ma con le righe che riguardano davvero
 * quella persona.
 *
 * L'indirizzo si revoca **insieme** all'utenza perche sono due strade per la
 * stessa porta: revocare solo l'una lascerebbe aperta l'altra, ed e esattamente
 * il difetto per cui «Scollega account» rispondeva 200 mentre la persona
 * continuava a leggere il fascicolo del minore.
 */
export const revokeGuardianAccessInClub = async (
  client: any,
  parametri: {
    organizationId: string;
    userId?: string | null;
    email?: string | null;
  },
): Promise<number> => {
  const { organizationId } = parametri;
  const utenza = normalizza(parametri.userId);
  const indirizzo = normalizza(parametri.email);

  const identita = [utenza, indirizzo].filter(Boolean);
  if (!identita.length) return 0;

  return withGuardianWriter(client, async (tx) => {
    const dove = {
      organization_id: organizationId,
      revoked_at: null,
      OR: [
        ...(utenza ? [{ user_id: utenza }] : []),
        ...(indirizzo ? [{ email: indirizzo }] : []),
        { identity_key: { in: identita } },
      ],
    };

    /*
      **Quali schede toccare si sa prima, e sono poche.**

      Non e la scansione che PP02-D34 descrive: quella percorreva **ogni**
      tesserato del club perche il blob non aveva una chiave da interrogare.
      Qui l'indice `(organization_id, user_id)` porta direttamente le righe di
      questa persona, che su un club sono una o due — i suoi figli.
    */
    const toccate = (await tx.athleteGuardian.findMany({
      where: dove,
      select: { athlete_id: true },
    })) as Array<{ athlete_id: string }>;

    const esito = await tx.athleteGuardian.updateMany({
      where: dove,
      data: {
        revoked_at: new Date(),
        user_id: null,
        access_token_status: "revoked",
        access_token_value: null,
      },
    });

    await refreshGuardianProjection(
      tx,
      toccate.map((riga) => riga.athlete_id),
    );

    return esito.count as number;
  });
};

/**
 * **Il diritto all'oblio.**
 *
 * I tutori di un atleta cancellato spariscono con lui: e la sola operazione
 * che toglie righe revocate, ed e giusto che lo sia. Una scheda cancellata su
 * richiesta dell'interessato non deve lasciare in archivio il nome, l'indirizzo
 * e il telefono di sua madre.
 */
export const eraseGuardiansForAthlete = async (
  client: any,
  athleteId: string,
): Promise<number> =>
  withGuardianWriter(client, async (tx) => {
    const esito = await tx.athleteGuardian.deleteMany({
      where: { athlete_id: athleteId },
    });

    /*
      La proiezione si svuota **insieme** alle righe: una cancellazione
      dell'interessato che lasciasse il nome e il telefono di sua madre dentro
      `athletes.data` non sarebbe una cancellazione.
    */
    await refreshGuardianProjection(tx, [athleteId]);

    return esito.count as number;
  });

/* -------------------------------------------------------------------------
 * 6. La ricerca che apre l'area famiglia
 * ---------------------------------------------------------------------- */

/**
 * **Di quali atleti questa persona e tutore.**
 *
 * Sostituisce due cose insieme: la scansione in SQL grezzo di `athletes` — «un
 * oggetto dentro un array JSON con una di queste quattro grafie uguale a
 * questo valore», che nessun indice puo aiutare — e il vaglio in memoria che
 * girava **dopo**, su un insieme di candidati che poteva gia non contenere il
 * figlio giusto. Chiude il debito `PP02-D1`, che diceva esattamente questo: «la
 * chiusura vera e materializzare il legame in una tabella con la sua chiave».
 *
 * **La differenza fra le due strade non e una sfumatura.** L'utenza vale
 * ovunque, perche nasce dal riscatto di un invito: e un atto della persona,
 * tracciato e revocabile. L'indirizzo di contatto lo scrive la segreteria a
 * mano, e un refuso su un dominio diffuso e l'indirizzo verificato di
 * qualcun altro: vale percio **solo dove quella persona ha gia una tessera**,
 * che e il comportamento odierno e la proprieta che
 * `tests/server/area-famiglia.test.mjs` presidia per nome.
 */
export const findGuardianLinks = async (
  client: any,
  parametri: {
    userId: string;
    /** Solo se **verificato**: un indirizzo non verificato non e una prova. */
    verifiedEmail?: string | null;
    /** I club in cui questa persona ha una tessera, o di cui e proprietaria. */
    organizationIdsForEmail: string[];
  },
): Promise<GuardianRow[]> => {
  const utenza = normalizza(parametri.userId);
  const indirizzo = normalizza(parametri.verifiedEmail);
  const club = Array.from(
    new Set(parametri.organizationIdsForEmail.filter(Boolean)),
  );

  const strade: any[] = [];
  if (utenza) strade.push({ user_id: utenza });
  if (indirizzo && club.length) {
    strade.push({
      email: indirizzo,
      contact_only: false,
      organization_id: { in: club },
    });
  }

  if (!strade.length) return [];

  return (client || prisma).athleteGuardian.findMany({
    where: { revoked_at: null, OR: strade },
    orderBy: ORDINE_STABILE,
  }) as Promise<GuardianRow[]>;
};

/* -------------------------------------------------------------------------
 * 7. La proiezione in sola lettura dentro `athletes.data`
 * ---------------------------------------------------------------------- */

/**
 * **`athletes.data.guardians` non e piu l'autorita: e una copia derivata.**
 *
 * ---
 *
 * ## Perche resta
 *
 * Un censimento indipendente dei lettori ne ha contati una quarantina, e solo
 * una manciata decide un accesso. Gli altri fanno cose che la tabella non
 * cambia e che non si possono rifare tutte in un colpo senza rompere qualcosa:
 *
 * | Chi legge | Cosa ne fa |
 * |---|---|
 * | `fiscal-recipient.ts` | di chi e il codice fiscale su una ricevuta — **per posizione** |
 * | `document-placeholders.ts` | `{{parent.1.*}}` su un documento — **per posizione** |
 * | `form-submissions.ts` | il `recordId` di una pratica gia salvata — **per posizione** |
 * | la scheda atleta, la segreteria, la vista allenatore | mostrano nome, rapporto, recapiti |
 *
 * Spostare **anche** questi in un solo passaggio significherebbe cambiare, nello
 * stesso commit, chi paga una fattura e quale genitore firma un modulo. Sono
 * decisioni con conseguenze fuori dal prodotto, e hanno il loro perimetro.
 *
 * ## Perche non e una doppia scrittura
 *
 * Una doppia scrittura e quando due depositi sono **tutti e due autorevoli** e
 * chi legge sceglie. Qui:
 *
 * - **un solo scrittore**: la proiezione la riscrive questo modulo, dentro la
 *   stessa transazione della riga, e nessun altro puo scriverla — la rotta
 *   generica toglie la chiave da cio che riceve;
 * - **nessuna decisione di accesso la guarda**: chi apre l'area famiglia,
 *   chi scarica un certificato, chi revoca, passa tutto da `athlete_guardians`;
 * - **si ricostruisce da se**: e derivata, quindi perderla non perde niente.
 *   La rotta generica la rifa dalla tabella a ogni salvataggio della scheda.
 *
 * La proiezione riproduce **la forma vecchia per intero**, righe revocate
 * comprese e con i loro marchi: e la condizione perche i lettori storici si
 * comportino esattamente come prima invece che «quasi».
 *
 * ## Perche una istruzione sola
 *
 * La revoca di una tessera tocca tutte le schede su cui quella persona compare.
 * Rifare la proiezione con un ciclo — una lettura e una `update` per scheda —
 * rimetterebbe in piedi esattamente cio che `PP02-D34` descrive: un ordine di
 * acquisizione dei blocchi che si incrocia con il passaggio di stagione, e un
 * tetto oltre il quale la transazione scade.
 */
/**
 * Una riga della tabella, nella forma che il blob aveva.
 *
 * Riproduce **tutto**, marchi compresi: e la condizione perche i lettori
 * storici si comportino esattamente come prima invece che «quasi». Una
 * proiezione che nascondesse le righe revocate cambierebbe, senza dirlo, chi
 * compare su un documento e chi riceve un avviso.
 */
const proiettaRiga = (riga: GuardianRow) => ({
  id: riga.id,
  name: riga.first_name,
  surname: riga.last_name,
  relationship: riga.relationship,
  email: riga.email,
  phone: riga.phone,
  linkedUserId: riga.user_id,
  /*
    **L'indirizzo di recapito e l'indirizzo che apre sono due cose diverse**, e
    il blob le teneva in due chiavi: `email` resta dopo una revoca — al club
    serve per scrivere a quella persona — mentre `linkedUserEmail` e il legame,
    e con la revoca cade.

    La tabella ne ha una colonna sola perche sono lo stesso testo; qui la
    proiezione le separa di nuovo, secondo cio che la riga dice: un indirizzo
    apre solo se la riga non e revocata e non e un solo-recapito. E la stessa
    condizione che `findGuardianLinks` applica, scritta una seconda volta in
    una forma che i lettori storici sanno leggere.
  */
  linkedUserEmail:
    riga.revoked_at || riga.contact_only ? null : riga.email,
  linkedAt: riga.linked_at ? new Date(riga.linked_at).toISOString() : null,
  accessRevokedAt: riga.revoked_at ? new Date(riga.revoked_at).toISOString() : null,
  /*
    Un segno **falso** deve arrivare a destinazione, e non mancare: un lettore
    che non trova la chiave e un lettore che decide da solo cosa voglia dire.
  */
  contactOnly: Boolean(riga.contact_only),
  parentAccessTokenValue: riga.access_token_value,
  parentAccessTokenStatus: riga.access_token_status,
  parentAccessTokenExpiresAt: riga.access_token_expires_at
    ? new Date(riga.access_token_expires_at).toISOString()
    : null,
  parentAccessTokenGeneratedAt: riga.access_token_generated_at
    ? new Date(riga.access_token_generated_at).toISOString()
    : null,
});

/**
 * Riscrive `athletes.data.guardians` dalla tabella, per gli atleti indicati.
 *
 * **Perche un ciclo qui non e il ciclo di prima.** Lo sweep che `PP02-D34`
 * descrive percorreva **ogni tesserato del club** — quattrocento schede, 222 ms
 * di blocchi presi in un ordine scorrelato da quello del passaggio di stagione.
 * Qui gli atleti sono quelli su cui quella persona compare davvero: i suoi
 * figli, uno o due. L'ordine di acquisizione e comunque **deterministico**,
 * perche due ordini deterministici uguali non si incrociano mai.
 */
export const refreshGuardianProjection = async (
  client: any,
  athleteIds: string[],
): Promise<number> => {
  const identificativi = Array.from(new Set(athleteIds.filter(Boolean))).sort();
  if (!identificativi.length) return 0;

  const tx = client || prisma;

  const righe = (await tx.athleteGuardian.findMany({
    where: { athlete_id: { in: identificativi } },
    orderBy: ORDINE_STABILE,
  })) as GuardianRow[];

  const perAtleta = new Map<string, GuardianRow[]>();
  for (const riga of righe) {
    const gia = perAtleta.get(riga.athlete_id);
    if (gia) gia.push(riga);
    else perAtleta.set(riga.athlete_id, [riga]);
  }

  let scritte = 0;
  for (const athleteId of identificativi) {
    const fresca = await tx.athlete.findUnique({
      where: { id: athleteId },
      select: { data: true },
    });
    if (!fresca) continue;

    const base =
      fresca.data && typeof fresca.data === "object" && !Array.isArray(fresca.data)
        ? (fresca.data as Record<string, any>)
        : {};

    await tx.athlete.update({
      where: { id: athleteId },
      data: {
        data: {
          ...base,
          guardians: (perAtleta.get(athleteId) || []).map(proiettaRiga),
        },
      },
    });
    scritte += 1;
  }

  return scritte;
};

/**
 * Le chiavi che, dentro `athletes.data`, non sono piu scrivibili da nessuna
 * rotta: sono la proiezione e i due registri che la chiave unica ha reso
 * inutili.
 *
 * `parent1`, `parent2`, `parents`, `tutors` e `tutori` **non** sono in questo
 * elenco. Il travaso le ha gia lette, la proiezione le rende irraggiungibili —
 * ogni lettore storico consulta la coppia solo quando `guardians` e vuoto, e
 * dopo il travaso non lo e piu — e cancellarle sarebbe distruggere un dato
 * senza bisogno.
 */
export const GUARDIAN_KEYS_NON_SCRIVIBILI = [
  "guardians",
  "revokedGuardianIdentities",
  "contactOnlyIdentities",
] as const;

/**
 * **Cio che la scheda manda, letto come un elenco di persone.**
 *
 * Il client dell'anagrafica manda le righe nella forma storica, con le sue
 * grafie. Questa e l'unica funzione che le traduce, e sta qui perche tradurle
 * e gia una decisione sul dominio: quale campo dice l'identita, quale
 * l'indirizzo, quale il rapporto.
 *
 * Cio che **non** traduce e altrettanto importante: `linkedUserId` non entra.
 * Un legame con una famiglia non si crea scrivendo l'anagrafica, e il posto in
 * cui quella regola smette di essere una guardia e diventa una proprieta e
 * questo — il campo non ha una strada per arrivare alla riga.
 */
export const readGuardianInputFromCard = (valore: unknown): GuardianInput[] => {
  if (!Array.isArray(valore)) return [];

  return valore
    .filter((riga) => riga && typeof riga === "object")
    .map((riga: any) => ({
      /*
        L'identificativo della **riga**, che la proiezione pubblica: e cosi che
        un salvataggio dice «questa qui», invece di farlo dedurre da una
        posizione o da un id sintetico.
      */
      rowId: testo(riga.id),
      email:
        testo(riga.linkedUserEmail) ||
        testo(riga.linked_user_email) ||
        testo(riga.email),
      firstName: testo(riga.name) || testo(riga.firstName) || testo(riga.first_name),
      lastName: testo(riga.surname) || testo(riga.lastName) || testo(riga.last_name),
      phone: testo(riga.phone) || testo(riga.telefono),
      relationship: testo(riga.relationship) || testo(riga.role),
    }));
};
