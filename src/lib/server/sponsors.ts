/**
 * Gli **sponsor**: contratto, credito, incasso. Unico punto di scrittura.
 *
 * **Cosa questo modulo non e.** Non e un secondo registro di incassi e non e un
 * modulo contratti. Il denaro che entra ha gia un proprietario —
 * `payment_transactions`, via `src/lib/server/payment-transactions.ts` — e una
 * seconda tabella sarebbe la seconda contabilita che
 * `src/lib/accounting/OWNERSHIP.md` vieta. Cio che mancava non era un registro:
 * era la possibilita di dire che la controparte non e un atleta.
 *
 * **Dove vivono gli sponsor.** Dove vivevano: nella collezione di club
 * `sponsors`, letta e riscritta da `resources.ts`, che e il proprietario
 * dell'accesso ai dati di club. Nessuna tabella nuova, nessuna migrazione: il
 * contratto e **quattro campi in piu** sullo stesso oggetto.
 *
 * **Il residuo non si salva.** `residuo = pattuito - incassato`, ricalcolato a
 * ogni lettura da `src/lib/sponsors/model.ts`. E la disciplina di ADR-0036
 * applicata allo sponsor: lo stato di una rata non si imposta, si ricava, e per
 * la stessa ragione un credito salvato divergerebbe dagli incassi il primo
 * giorno in cui qualcuno storna.
 *
 * **Il confine di sicurezza e `organization_id`.** Uno sponsor di un altro club
 * non si legge, non si modifica e non si incassa, e il messaggio contiene
 * «Accesso negato» perche il route handler lo mappi su 403.
 *
 * ---
 *
 * ## Dipendenza aperta verso W4-C — l'ultimo anello
 *
 * `prepareSponsorCollection` produce l'incasso **gia pronto**, controparte
 * compresa, e si ferma un passo prima di scriverlo. Non per prudenza: perche
 * `createPaymentTransaction` non accetta ancora una controparte non-atleta, e
 * passargliela la farebbe scartare in silenzio — resterebbe una riga di incasso
 * che non sa a chi si riferisce, cioe il difetto che questa lane esiste per
 * chiudere.
 *
 * Cosa deve cambiare, esattamente, in `src/lib/server/payment-transactions.ts`
 * (**file di W4-C, non toccato qui**):
 *
 * 1. `CreatePaymentTransactionInput` guadagna tre campi facoltativi:
 *    `counterpartyKind?: CounterpartyKind | null`,
 *    `counterpartyId?: string | null`, `counterpartyLabel?: string | null`;
 * 2. dentro `createPaymentTransaction`, il `client.paymentTransaction.create`
 *    scrive le tre colonne omonime — che **esistono gia** in schema e in
 *    database (barriera, commit `2069d83`);
 * 3. `reversePaymentTransaction` e `recordRefundTransaction` ricopiano i tre
 *    campi dalla riga originale, come gia fanno con `athlete_id`: uno storno
 *    che perdesse la controparte renderebbe il credito dello sponsor sbagliato
 *    proprio nel caso in cui serve leggerlo.
 *
 * Il giorno in cui esiste, `recordSponsorCollection` e una riga:
 * `createPaymentTransaction(await prepareSponsorCollection(input, scope), scope)`.
 */

import { prisma } from "./prisma";
import {
  readClubResourceCollection,
  updateClubResourceItem,
} from "./resources";
import { assertAccountingPermission } from "@/lib/accounting/permissions";
import {
  SPONSOR_RESOURCE_TYPE,
  applySponsorContract,
  buildSponsorCollectionInput,
  normalizeLegacySponsorCollections,
  normalizeSponsor,
  normalizeSponsorCollections,
  resolveSponsorCredit,
  sanitizeSponsorContract,
  sponsorFiscalCounterparty,
  type NormalizedSponsor,
  type SponsorCollection,
  type SponsorCollectionInput,
  type SponsorCredit,
} from "@/lib/sponsors/model";
import { resolveCounterpartyFiscalRecipient } from "@/lib/documents/fiscal-recipient";

export type SponsorScope = {
  userId: string;
  activeOrganizationId: string | null;
  activeRole?: string | null;
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Il confine, ed e il **club attivo** — non l'insieme dei club accessibili.
 *
 * **Il difetto che l'audit della Wave 4 ha misurato qui.** Il confronto era con
 * `allowedOrganizationIds`, cioe con tutti i club a cui l'utente appartiene.
 * Ma il permesso si verifica con `activeRole`, che e il ruolo **nel club
 * attivo**: i due insiemi non coincidono mai per chi ha piu di un club, e
 * chiunque puo crearsi una societa e diventarne proprietario.
 *
 * Bastava mandare `x-active-club-id: <la mia>` insieme all'identificativo di
 * uno sponsor **di un'altra**, e il permesso veniva concesso con il ruolo
 * sbagliato. L'audit lo ha provato end-to-end: un genitore in un club, e
 * proprietario nel proprio, ha letto l'IBAN altrui, rinominato un conto,
 * registrato un'uscita da 70.000 euro e stornato un movimento.
 *
 * **Era gia stato trovato e chiuso una volta**, in
 * `src/lib/server/document-templates.ts`, con il commento che lo racconta. Sei
 * moduli nuovi lo hanno reintrodotto: la lezione non era nel codice, era in un
 * commento che nessuno ha riletto.
 *
 * La regola giusta e una sola: **la riga deve appartenere al club attivo**. Per
 * lavorare su un altro club si cambia club, e il ruolo viene risolto di nuovo
 * per quello.
 */
const ensureOrganizationAccess = (
  scope: SponsorScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) {
    throw denied("sponsor senza club");
  }
  const attivo = asText(scope.activeOrganizationId);
  if (!attivo) throw denied("nessun club attivo selezionato");
  if (attivo !== asText(organizationId)) {
    throw denied("non trovato, o non appartiene al club attivo");
  }
};

const resolveOrganizationId = (
  scope: SponsorScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per lo sponsor");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

/**
 * Il permesso, prima della lettura.
 *
 * **Perche la matrice della contabilita e non una nuova.** Il contratto e il
 * credito di uno sponsor sono denaro: chi non puo vedere la prima nota non ha
 * ragione di vedere quanto un'azienda deve ancora versare, e chi non puo
 * registrare un movimento non ha ragione di cambiare l'importo pattuito. Una
 * seconda matrice, per giunta con gli stessi ruoli, e la strada per cui una
 * porta risponde 403 e l'altra 200.
 *
 * L'anagrafica dello sponsor resta dove sta, con i permessi che ha sempre
 * avuto: qui si difendono il contratto e le tre cifre, non il numero di
 * telefono.
 */
const assertCanRead = (scope?: SponsorScope) => {
  if (!scope) return;
  assertAccountingPermission(scope.activeRole, "accounting.read");
};

const assertCanManage = (scope?: SponsorScope) => {
  if (!scope) return;
  assertAccountingPermission(scope.activeRole, "accounting.manage");
};

/* --------------------------------------------------------------- lettura */

const readSponsorRecords = async (organizationId: string) => {
  const items = await readClubResourceCollection(
    organizationId,
    SPONSOR_RESOURCE_TYPE,
  );
  return Array.isArray(items) ? items : [];
};

export type ListSponsorsFilter = {
  organizationId?: string | null;
};

/** Gli sponsor del club, normalizzati. Nessun credito: quello ha un costo. */
export const listSponsors = async (
  filter: ListSponsorsFilter = {},
  scope?: SponsorScope,
): Promise<NormalizedSponsor[]> => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  assertCanRead(scope);

  return (await readSponsorRecords(organizationId)).map(normalizeSponsor);
};

type SponsorLookup = {
  organizationId: string;
  /** La riga come sta in archivio: si riscrive, non si ricostruisce. */
  record: Record<string, any>;
  sponsor: NormalizedSponsor;
};

/**
 * Uno sponsor, dentro il suo club.
 *
 * **Perche non esiste una variante che restituisce `null`.** Un id che non si
 * trova nel club a cui si ha accesso e indistinguibile da un id di un altro
 * club: rispondere «non trovato» in un caso e «accesso negato» nell'altro dice
 * a chi prova quale dei due era, ed e un elenco di sponsor letto un id alla
 * volta.
 */
const findSponsor = async (
  sponsorId: string,
  scope?: SponsorScope,
  organizationId?: string | null,
): Promise<SponsorLookup> => {
  const id = asText(sponsorId);
  if (!id) {
    throw new Error("Sponsor non indicato");
  }

  const clubId = resolveOrganizationId(scope, organizationId);
  const records = await readSponsorRecords(clubId);
  const record = records.find((item: any) => asText(item?.id) === id);

  if (!record) {
    throw denied("lo sponsor non appartiene a questo club");
  }

  return {
    organizationId: clubId,
    record,
    sponsor: normalizeSponsor(record),
  };
};

export const getSponsor = async (
  sponsorId: string,
  scope?: SponsorScope,
  organizationId?: string | null,
): Promise<NormalizedSponsor> => {
  const clubId = resolveOrganizationId(scope, organizationId);
  assertCanRead(scope);
  return (await findSponsor(sponsorId, scope, clubId)).sponsor;
};

/* ------------------------------------------------------------- gli incassi */

/**
 * Gli incassi di uno sponsor, dalle **due** fonti che esistono oggi.
 *
 * 1. `payment_transactions` con la controparte dichiarata: e la fonte canonica,
 *    quella che vale per ogni altro denaro che entra e che vale anche qui.
 * 2. la vecchia collezione JSON `sponsor_payments`, che porta lo storico dei
 *    club che incassavano da li.
 *
 * **Perche entrambe, e perche non si sommano due volte.** Un residuo che
 * ignorasse lo storico direbbe che ogni sponsor deve ancora tutto, il giorno in
 * cui il contratto viene registrato. E il doppio conteggio non puo avvenire
 * perche l'incasso nuovo non scrive piu nel JSON: le due fonti sono disgiunte
 * per costruzione, non per convenzione.
 */
export const listSponsorCollections = async (
  sponsorId: string,
  organizationId: string,
): Promise<SponsorCollection[]> => {
  const id = asText(sponsorId);

  const [rows, legacy] = await Promise.all([
    (prisma as any).paymentTransaction.findMany({
      where: {
        organization_id: organizationId,
        counterparty_id: id,
        counterparty_kind: { in: ["SPONSOR", "SUPPLIER"] },
      },
      orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
    }),
    readClubResourceCollection(organizationId, "sponsor_payments"),
  ]);

  return [
    ...normalizeSponsorCollections(rows),
    ...normalizeLegacySponsorCollections(legacy, id),
  ];
};

/**
 * Le **tre cifre** di uno sponsor: dovuto, incassato, residuo.
 *
 * Si restituiscono insieme e si mostrano accanto. Sommarle non significa
 * niente, e il riquadro unico che le somma e il difetto che il §37 del piano
 * chiede di non ripetere.
 */
export const getSponsorCredit = async (
  sponsorId: string,
  scope?: SponsorScope,
  organizationId?: string | null,
): Promise<{ sponsor: NormalizedSponsor; credit: SponsorCredit }> => {
  const clubId = resolveOrganizationId(scope, organizationId);
  assertCanRead(scope);

  const { sponsor } = await findSponsor(sponsorId, scope, clubId);
  const collections = await listSponsorCollections(sponsor.id, clubId);

  return {
    sponsor,
    credit: resolveSponsorCredit({
      contract: sponsor.contract,
      collections,
    }),
  };
};

/**
 * Tutti gli sponsor del club con il loro credito, in **due letture**.
 *
 * Non una query per sponsor: e la lista, e una lista che interroga il registro
 * una volta per riga e la stessa lista che il Blocco Finale C ha passato mesi a
 * togliere dalle schermate degli atleti.
 */
export const listSponsorsWithCredit = async (
  filter: ListSponsorsFilter = {},
  scope?: SponsorScope,
): Promise<Array<{ sponsor: NormalizedSponsor; credit: SponsorCredit }>> => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  assertCanRead(scope);

  const [records, rows, legacy] = await Promise.all([
    readSponsorRecords(organizationId),
    (prisma as any).paymentTransaction.findMany({
      where: {
        organization_id: organizationId,
        counterparty_kind: { in: ["SPONSOR", "SUPPLIER"] },
      },
      orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
    }),
    readClubResourceCollection(organizationId, "sponsor_payments"),
  ]);

  const bySponsor = new Map<string, any[]>();

  const push = (key: unknown, row: any) => {
    const id = asText(key);
    if (!id) return;
    const bucket = bySponsor.get(id);
    if (bucket) bucket.push(row);
    else bySponsor.set(id, [row]);
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    push(row?.counterparty_id, row);
  }

  for (const row of Array.isArray(legacy) ? legacy : []) {
    /* Stessa regola di `normalizeLegacySponsorCollections`: un'uscita non e un incasso. */
    if (asText(row?.type || "entrata").toLowerCase() === "uscita") continue;
    push(row?.sponsorId || row?.sponsor_id, row);
  }

  return records.map((record: any) => {
    const sponsor = normalizeSponsor(record);
    return {
      sponsor,
      credit: resolveSponsorCredit({
        contract: sponsor.contract,
        collections: normalizeSponsorCollections(bySponsor.get(sponsor.id) || []),
      }),
    };
  });
};

/* ------------------------------------------------------------- scrittura */

export type SaveSponsorContractInput = {
  sponsorId: string;
  organizationId?: string | null;
  contract: unknown;
};

/**
 * Registra o aggiorna il **contratto** di uno sponsor.
 *
 * ---
 *
 * ## Una riga sola, e perche non l'intera collezione
 *
 * Prima riscriveva tutta la collezione, «perche e cosi che una collezione di
 * club si scrive». Non era piu vero, e una sonda di concorrenza lo ha mostrato:
 * due contratti salvati insieme si infrangevano **tutte e otto le volte** su un
 * conflitto di chiave primaria in `club_resource_items`, con un messaggio che
 * non diceva niente a chi lo riceveva. Una riscrittura di massa cancella le
 * righe e le ricrea; due che si incrociano si contendono gli stessi
 * identificativi.
 *
 * `updateClubResourceItem` tocca **una riga** sotto il `FOR UPDATE` del club:
 * due segreterie che salvano due contratti diversi nello stesso momento
 * riescono tutte e due, e ognuna vede l'altro contratto.
 *
 * ## Cosa conserva
 *
 * Ogni campo dello sponsor che questo modulo non nomina — logo, iban, regione —
 * perche la modifica si fonde con il payload esistente invece di sostituirlo.
 * Un salvataggio che li perdesse sarebbe indistinguibile da una cancellazione.
 */
export const saveSponsorContract = async (
  input: SaveSponsorContractInput,
  scope?: SponsorScope,
): Promise<NormalizedSponsor> => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);
  assertCanManage(scope);

  const sponsorId = asText(input.sponsorId);
  const contract = sanitizeSponsorContract(input.contract);

  const records = await readSponsorRecords(organizationId);
  const esistente = records.find((item: any) => asText(item?.id) === sponsorId);

  if (!esistente) {
    throw denied("lo sponsor non appartiene a questo club");
  }

  const aggiornato = await (prisma as any).$transaction((tx: any) =>
    updateClubResourceItem(
      tx,
      organizationId,
      SPONSOR_RESOURCE_TYPE,
      sponsorId,
      applySponsorContract(esistente, contract),
    ),
  );

  if (!aggiornato) {
    throw denied("lo sponsor non appartiene a questo club");
  }

  return normalizeSponsor(aggiornato);
};

export type PrepareSponsorCollectionInput = {
  sponsorId: string;
  organizationId?: string | null;
  amount: unknown;
  paidAt?: unknown;
  paymentMethod?: unknown;
  notes?: unknown;
  operationTypeCode?: unknown;
};

/**
 * L'incasso di uno sponsor, **pronto per il registro degli incassi**.
 *
 * Congela qui l'etichetta della controparte, e non piu tardi: il nome che
 * finisce sulla riga e quello letto adesso, cosi la riga continua a dire a chi
 * si riferiva anche dopo che la scheda e stata rinominata o cancellata.
 *
 * Si ferma prima della scrittura: vedi la dipendenza verso W4-C in testa al
 * modulo.
 */
export const prepareSponsorCollection = async (
  input: PrepareSponsorCollectionInput,
  scope?: SponsorScope,
): Promise<SponsorCollectionInput> => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);
  assertCanManage(scope);

  const { sponsor } = await findSponsor(input.sponsorId, scope, organizationId);

  return buildSponsorCollectionInput({
    organizationId,
    sponsor,
    amount: input.amount,
    paidAt: input.paidAt,
    paymentMethod: input.paymentMethod,
    notes: input.notes,
    operationTypeCode: input.operationTypeCode,
  });
};

/* ------------------------------------------------------ il documento fiscale */

/**
 * L'intestatario di un documento emesso a uno sponsor.
 *
 * **E lo sponsor, non un atleta.** Con la sua partita IVA o il suo codice
 * fiscale e la sua sede. Chi emette passa di qui e non dall'anagrafica atleti,
 * ed e la ragione per cui la sponsorizzazione — l'unica entrata dichiaratamente
 * commerciale del catalogo, l'unica che una fattura la richiede — puo finalmente
 * averne una.
 */
export const getSponsorFiscalRecipient = async (
  sponsorId: string,
  scope?: SponsorScope,
  organizationId?: string | null,
) => {
  const clubId = resolveOrganizationId(scope, organizationId);
  assertCanRead(scope);

  const { sponsor } = await findSponsor(sponsorId, scope, clubId);
  return resolveCounterpartyFiscalRecipient(sponsorFiscalCounterparty(sponsor));
};

/**
 * La controparte di un documento, dato l'id sulla riga dell'incasso.
 *
 * **Perche non chiede uno scope.** Il chiamante e l'emissione dei documenti,
 * che il permesso l'ha gia verificato sull'incasso e ha gia stabilito di quale
 * club e: ripetere qui il controllo con uno scope che non ha significherebbe
 * inventarne uno. Il club arriva **dalla riga dell'incasso**, mai dal client.
 *
 * Restituisce `null` quando lo sponsor non c'e piu: un documento gia emesso non
 * si rifiuta di ristampare perche l'anagrafica e stata cancellata — per quello
 * c'e lo snapshot, che quel giorno l'aveva congelata.
 */
export const findSponsorCounterparty = async (
  organizationId: string,
  sponsorId: string,
) => {
  const clubId = asText(organizationId);
  const id = asText(sponsorId);
  if (!clubId || !id) return null;

  const records = await readSponsorRecords(clubId);
  const record = records.find((item: any) => asText(item?.id) === id);

  return record ? sponsorFiscalCounterparty(normalizeSponsor(record)) : null;
};

/* ============================================================ l'incasso vero */

/**
 * L'incasso di uno sponsor, **registrato**.
 *
 * ---
 *
 * ## L'anello che mancava
 *
 * `prepareSponsorCollection` produceva l'incasso gia pronto e si fermava li,
 * «per la dipendenza verso W4-C». La dipendenza e chiusa da tempo, e la
 * conseguenza di lasciarla aperta non era teorica: la schermata degli sponsor
 * continuava a scrivere nella vecchia collezione JSON `sponsor_payments`, e il
 * denaro di uno sponsor **non arrivava in prima nota**. Il §12 del piano chiede
 * che un contratto da 5.000 con 2.000 incassati produca 2.000 di entrata nel
 * registro, e ne produceva zero.
 *
 * ## Perche passa dal registro degli incassi e non da una tabella sua
 *
 * Perche un incasso da uno sponsor **e** un incasso: ha un conto, una causale,
 * una data, una controparte e uno storno. `payment_transactions` sa gia fare
 * tutte e cinque le cose, e il proiettore del registro lo legge gia. Una
 * seconda tabella sarebbe stata la seconda contabilita.
 *
 * ## Cosa resta della vecchia collezione
 *
 * Si **legge** e non si scrive piu: `listSponsorCollections` unisce le due
 * fonti, e il doppio conteggio non puo avvenire perche sono disgiunte per
 * costruzione. Un club che aveva incassi nel blob li vede ancora nel suo
 * residuo; da oggi in poi ogni incasso nuovo passa di qui.
 */
export const recordSponsorCollection = async (
  input: PrepareSponsorCollectionInput & {
    financialAccountId?: unknown;
    externalReference?: unknown;
  },
  scope?: SponsorScope,
) => {
  const preparato = await prepareSponsorCollection(input, scope);

  /*
    **La causale di sponsorizzazione e una proposta, non una dichiarazione.**

    `buildSponsorCollectionInput` mette il codice `sponsorizzazione` quando
    nessuno ne indica uno: e un ripiego ragionevole, ma un club che quella
    causale non l'ha configurata non deve vedersi **rifiutare l'incasso** —
    perche il registro degli incassi rifiuta un codice fuori catalogo, ed e
    giusto che lo faccia quando qualcuno lo **dichiara**.
    La distinzione fra dichiarato e proposto e la stessa che i documenti
    fiscali fanno da sempre: qui la proposta cade se il catalogo non la
    riconosce, e l'incasso entra non classificato invece di non entrare.
  */
  const codice = asText(preparato.operationTypeCode);
  const dichiarato = asText(input.operationTypeCode);
  if (codice && !dichiarato) {
    const { getOperationType } = await import("./fiscal-config");
    const causale = await getOperationType({
      organizationId: preparato.organizationId,
      code: codice,
    });
    if (!causale) preparato.operationTypeCode = null;
  }

  const { createPaymentTransaction } = await import("./payment-transactions");

  const esito = await createPaymentTransaction(
    {
      ...preparato,
      financialAccountId: input.financialAccountId ?? null,
      externalReference: input.externalReference ?? null,
    },
    scope
      ? {
          userId: scope.userId,
          activeOrganizationId: scope.activeOrganizationId,
          allowedOrganizationIds: scope.allowedOrganizationIds,
        }
      : undefined,
  );

  return esito;
};
