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

  /*
    **La posizione e l'ordine in cui il salvataggio nomina le righe.**

    E esattamente cio che faceva l'array: la scheda mandava i tutori nell'ordine
    in cui li mostrava, e quell'ordine decideva chi fosse «genitore 1» su un
    documento e chi il destinatario fiscale di una ricevuta. Conservarlo qui e
    la ragione per cui quelle tre letture non si accorgono del passaggio.
  */
  const inArrivo = new Map<string, GuardianInput & { posizione: number }>();
  rows.forEach((riga, posizione) => {
    const chiave = guardianIdentityKey(riga);
    if (!chiave) return;
    const gia = inArrivo.get(chiave);
    inArrivo.set(
      chiave,
      gia
        ? {
            ...gia,
            ...riga,
            contactOnly: Boolean(gia.contactOnly || riga.contactOnly),
            /* Due righe fuse tengono la **prima** posizione: e dove si vedeva. */
            posizione: gia.posizione,
          }
        : { ...riga, posizione },
    );
  });

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

    const perChiave = new Map(esistenti.map((riga) => [riga.identity_key, riga]));

    const aggiunte: string[] = [];
    const aggiornate: string[] = [];
    const tolte: string[] = [];
    const negate: string[] = [];

    for (const [identityKey, riga] of inArrivo) {
      const gia = perChiave.get(identityKey);

      if (!gia) {
        /*
          **Una identita nuova e una concessione, e si chiede.**

          Chi non porta la chiave non riceve un errore: la riga semplicemente
          non nasce, e chi ha salvato lo legge nell'esito. Fallire renderebbe
          impossibile salvare il resto dell'anagrafica — nome, recapiti,
          categoria — per una riga che il client rimanda senza saperlo.
        */
        if (!canGrantAccess) {
          negate.push(identityKey);
          continue;
        }

        await tx.athleteGuardian.create({
          data: {
            organization_id: organizationId,
            athlete_id: athleteId,
            identity_key: identityKey,
            /* `user_id` no: un legame non si crea scrivendo l'anagrafica. */
            email: normalizza(riga.email) || null,
            first_name: testo(riga.firstName),
            last_name: testo(riga.lastName),
            phone: testo(riga.phone),
            relationship: testo(riga.relationship),
            contact_only: Boolean(riga.contactOnly),
            legacy_id: testo(riga.legacyId),
            position: riga.posizione,
          },
        });
        aggiunte.push(identityKey);
        continue;
      }

      /*
        Cio che un salvataggio d'anagrafica puo cambiare: **come si chiama la
        persona e dove la si raggiunge**. Non se apre il fascicolo.
      */
      await tx.athleteGuardian.update({
        where: { id: gia.id },
        data: {
          first_name: testo(riga.firstName) ?? gia.first_name,
          last_name: testo(riga.lastName) ?? gia.last_name,
          phone: testo(riga.phone) ?? gia.phone,
          relationship: testo(riga.relationship) ?? gia.relationship,
          position: riga.posizione,
        },
      });
      aggiornate.push(identityKey);
    }

    for (const riga of esistenti) {
      if (inArrivo.has(riga.identity_key)) continue;

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

    return { aggiunte, aggiornate, tolte, negate };
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
  },
): Promise<GuardianRow | null> => {
  const { organizationId, athleteId, row, contactOnly } = parametri;
  const identityKey = guardianIdentityKey(row);
  if (!identityKey) return null;

  return withGuardianWriter(client, async (tx) => {
    /*
      **Una riga nata da un modulo si accoda**, come faceva `guardians.push`.
      Se cadesse in testa, sposterebbe di uno il destinatario fiscale e il
      «genitore 1» di ogni documento di quell'atleta.
    */
    const ultima = await tx.athleteGuardian.aggregate({
      where: { athlete_id: athleteId },
      _max: { position: true },
    });
    const posizione = Number(ultima?._max?.position ?? -1) + 1;

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

  return withGuardianWriter(client, async (tx) => {
    const riga = guardianRowId
      ? await tx.athleteGuardian.findFirst({
          where: { id: guardianRowId, athlete_id: athleteId },
        })
      : await tx.athleteGuardian.findFirst({
          where: { athlete_id: athleteId, identity_key: { in: identita } },
          orderBy: ORDINE_STABILE,
        });

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
    const esito = await tx.athleteGuardian.updateMany({
      where: {
        organization_id: organizationId,
        revoked_at: null,
        OR: [
          ...(utenza ? [{ user_id: utenza }] : []),
          ...(indirizzo ? [{ email: indirizzo }] : []),
          { identity_key: { in: identita } },
        ],
      },
      data: {
        revoked_at: new Date(),
        user_id: null,
        access_token_status: "revoked",
        access_token_value: null,
      },
    });

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
