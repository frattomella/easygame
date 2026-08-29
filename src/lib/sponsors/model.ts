/**
 * Lo **sponsor**: contratto, credito, controparte. Dominio puro.
 *
 * **Perche questo modulo nasce, e perche non nasce un secondo registro.** La
 * catena `sponsor -> contratto -> documento -> credito -> incasso -> movimento`
 * si fermava al primo anello: c'era l'anagrafica in `clubs.sponsors`, non c'era
 * il contratto, non c'era il credito, e una fattura allo sponsor non si poteva
 * emettere perche l'intestatario di un documento era sempre risolto da un
 * atleta. La sponsorizzazione e **l'unica entrata dichiaratamente commerciale**
 * del catalogo delle causali, l'unica che una fattura la richiede, ed era
 * l'unica che non poteva averla.
 *
 * Lo sponsor **resta dov'e**. Qui si aggiungono tre cose e nient'altro:
 *
 * 1. il **contratto** — importo pattuito, periodo, riferimento del documento,
 *    note — che non e un modulo contratti: sono i campi che rendono il credito
 *    calcolabile;
 * 2. il **credito derivato** — `residuo = pattuito - incassato` — che non e una
 *    colonna e non lo diventera: e la disciplina di ADR-0036 applicata allo
 *    sponsor, la stessa per cui lo stato di una rata non si imposta ma si
 *    ricava;
 * 3. la **controparte congelata** — tipo, id ed etichetta al momento
 *    dell'incasso — perche la riga deve poter dire a chi si riferiva anche
 *    quando la scheda dello sponsor e stata rinominata o cancellata.
 *
 * **Il credito non e cassa.** Un contratto da 5.000 firmato a settembre non e
 * denaro entrato: finche non arriva un incasso, in prima nota non c'e nulla, e
 * nessun totale di entrate lo puo contenere. E la stessa distinzione fra
 * dovuto e incassato che il registro delle rate fa gia, e le tre cifre si
 * mostrano **accanto**, mai sommate.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM. Lo
 * importano sia il servizio sia la pagina, perche un residuo calcolato in due
 * posti diversi e un residuo che prima o poi diverge.
 */

import type { CounterpartyKind } from "@/lib/accounting/model";
import type { FiscalCounterparty } from "@/lib/documents/fiscal-recipient";

const asText = (value: unknown) => String(value ?? "").trim();

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = asText(value);
    if (text) return text;
  }
  return "";
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Da importo a centesimi.
 *
 * **Legge la notazione italiana, che e quella che arriva.** «1.234,50» sono
 * milleduecentotrentaquattro euro e cinquanta, non uno e ventitre: trattare il
 * punto come separatore decimale trasformava un contratto da 5.000 in uno da
 * cinque, e il residuo diventava un numero che nessuno riconosceva.
 *
 * La regola e quella che usa chiunque legga numeri scritti a mano: **l'ultimo
 * separatore comanda**, e un punto isolato che separa gruppi di tre cifre e un
 * separatore di migliaia.
 *
 * Arrotonda una volta sola: sommare euro in virgola mobile e il modo classico
 * per far comparire un centesimo che nessuno ha incassato.
 */
export const toSponsorCents = (value: unknown) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }

  const raw = asText(value).replace(/[\s €]/g, "");
  if (!raw) return 0;

  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  let normalized = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = raw.replace(",", ".");
  } else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
};

export const fromSponsorCents = (cents: number) =>
  Number((Math.round(cents) / 100).toFixed(2));

/** La collezione di club in cui gli sponsor vivono. Non ne nasce una seconda. */
export const SPONSOR_RESOURCE_TYPE = "sponsors";

/* ========================================================================== */
/* Il soggetto                                                                 */
/* ========================================================================== */

/**
 * Sponsor e fornitore sono **lo stesso soggetto con un verso diverso**, e la
 * distinzione esiste gia nel dominio: non serve una tabella `suppliers`, serve
 * leggere il campo che c'e.
 */
export const SPONSOR_KINDS = ["sponsor", "fornitore"] as const;
export type SponsorKind = (typeof SPONSOR_KINDS)[number];

export const normalizeSponsorKind = (value: unknown): SponsorKind =>
  asText(value).toLowerCase() === "fornitore" ? "fornitore" : "sponsor";

export const getSponsorKindLabel = (value: unknown) =>
  normalizeSponsorKind(value) === "fornitore" ? "Fornitore" : "Sponsor";

/* ========================================================================== */
/* Il contratto                                                                */
/* ========================================================================== */

/**
 * Il contratto di sponsorizzazione, ridotto a cio che serve.
 *
 * **Quattro campi, non un modulo contratti.** Rinnovi, clausole, allegati e
 * scadenzario sono un prodotto a se: qui c'e l'importo pattuito, il periodo a
 * cui si riferisce, il riferimento della scrittura firmata e le note. Da questi
 * il credito si calcola; senza questi non si calcola affatto.
 *
 * **`agreedAmountCents` non e cassa.** E cio che lo sponsor si e impegnato a
 * versare, non cio che ha versato. Chi lo somma alle entrate produce il difetto
 * che tutta la Wave 4 esiste per chiudere.
 */
export type SponsorContract = {
  /** L'importo pattuito, in centesimi. Zero = nessun contratto registrato. */
  agreedAmountCents: number;
  /** Inizio e fine del periodo, in formato ISO `yyyy-mm-dd`. */
  startDate: string | null;
  endDate: string | null;
  /** Il riferimento della scrittura firmata: numero, protocollo, o titolo. */
  documentReference: string;
  notes: string;
};

export const EMPTY_SPONSOR_CONTRACT: SponsorContract = {
  agreedAmountCents: 0,
  startDate: null,
  endDate: null,
  documentReference: "",
  notes: "",
};

const toIsoDateOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString().slice(0, 10);
  }

  const raw = asText(value);
  if (!raw) return null;

  /*
    Una data gia in forma `yyyy-mm-dd` non passa da `new Date`: interpretarla
    e riscriverla in UTC sposta di un giorno le date scritte a mezzanotte in
    un fuso a est, ed e il difetto che una scadenza contrattuale non perdona.
  */
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
};

export const normalizeSponsorContract = (raw: unknown): SponsorContract => {
  if (!isRecord(raw)) return { ...EMPTY_SPONSOR_CONTRACT };

  const amountCents = isRecord(raw)
    ? raw.agreedAmountCents !== undefined && raw.agreedAmountCents !== null
      ? Math.round(Number(raw.agreedAmountCents) || 0)
      : toSponsorCents(
          firstText(raw.agreedAmount, raw.amount, raw.agreed_amount),
        )
    : 0;

  return {
    agreedAmountCents: Number.isFinite(amountCents) ? amountCents : 0,
    startDate: toIsoDateOrNull(firstText(raw.startDate, raw.start_date, raw.from)),
    endDate: toIsoDateOrNull(firstText(raw.endDate, raw.end_date, raw.to)),
    documentReference: firstText(
      raw.documentReference,
      raw.document_reference,
      raw.reference,
    ),
    notes: firstText(raw.notes, raw.note),
  };
};

/**
 * Cosa non va nel contratto che si sta per salvare.
 *
 * **Si restituisce un elenco, non il primo errore.** Chi compila un contratto
 * riempie quattro campi insieme: dirgli un problema alla volta lo fa salvare
 * quattro volte, ed e la ragione per cui i form di questo prodotto raccolgono.
 */
export const sponsorContractInputErrors = (raw: unknown): string[] => {
  const contract = normalizeSponsorContract(raw);
  const errors: string[] = [];

  if (contract.agreedAmountCents < 0) {
    errors.push("L'importo pattuito non puo essere negativo");
  }

  if (
    contract.startDate &&
    contract.endDate &&
    contract.endDate < contract.startDate
  ) {
    errors.push("La fine del periodo precede l'inizio");
  }

  return errors;
};

/**
 * Il contratto pronto da scrivere, oppure l'errore.
 *
 * Solleva con «Accesso negato» **no**: qui non c'e un problema di permessi, c'e
 * un dato malformato. Il messaggio dice cosa correggere.
 */
export const sanitizeSponsorContract = (raw: unknown): SponsorContract => {
  const errors = sponsorContractInputErrors(raw);
  if (errors.length) {
    throw new Error(`Contratto non valido: ${errors.join("; ")}`);
  }
  return normalizeSponsorContract(raw);
};

/** Vero se un contratto e stato davvero registrato, e non solo aperto e chiuso. */
export const hasSponsorContract = (contract: SponsorContract) =>
  contract.agreedAmountCents > 0 ||
  Boolean(contract.startDate) ||
  Boolean(contract.endDate) ||
  Boolean(contract.documentReference);

/* ========================================================================== */
/* Lo sponsor normalizzato                                                     */
/* ========================================================================== */

export type NormalizedSponsor = {
  id: string;
  name: string;
  kind: SponsorKind;
  vatNumber: string;
  /**
   * **Il codice fiscale, accanto alla P.IVA.** Non e un doppione: uno sponsor
   * puo essere una persona fisica o un ente non commerciale, che una partita
   * IVA non ce l'ha, e una fattura senza nessuno dei due non e emettibile.
   */
  fiscalCode: string;
  email: string;
  pec: string;
  recipientCode: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  contract: SponsorContract;
};

export const normalizeSponsor = (raw: unknown): NormalizedSponsor => {
  const record = isRecord(raw) ? raw : {};

  return {
    id: asText(record.id),
    name: firstText(record.name, record.business_name, record.businessName),
    kind: normalizeSponsorKind(record.type),
    vatNumber: firstText(record.vatNumber, record.vat_number, record.piva),
    fiscalCode: firstText(
      record.fiscalCode,
      record.fiscal_code,
      record.codiceFiscale,
    ),
    email: asText(record.email),
    pec: asText(record.pec),
    recipientCode: firstText(record.sdi, record.sdiCode, record.recipientCode),
    phone: asText(record.phone),
    address: asText(record.address),
    city: asText(record.city),
    postalCode: firstText(record.postalCode, record.cap),
    province: asText(record.province),
    country: firstText(record.country, "Italia"),
    contract: normalizeSponsorContract(record.contract),
  };
};

/**
 * Lo sponsor riscritto per l'archivio, **conservando i campi che non conosco**.
 *
 * La collezione e un JSON storico: logo, iban, regione e qualunque cosa una
 * schermata abbia aggiunto negli anni stanno li dentro. Riscriverla dal solo
 * modello normalizzato cancellerebbe in silenzio cio che questo modulo non
 * nomina, ed e esattamente il modo in cui un salvataggio innocuo perde dati.
 *
 * **Cosa non viene mai scritto: il residuo.** Non e una dimenticanza — e
 * l'invariante. Se un giorno comparisse una colonna «residuo», divergerebbe
 * dagli incassi il primo giorno in cui qualcuno storna.
 */
export const applySponsorContract = (
  raw: unknown,
  contract: SponsorContract,
): Record<string, any> => ({
  ...(isRecord(raw) ? raw : {}),
  contract: { ...contract },
});

/* ========================================================================== */
/* La controparte                                                              */
/* ========================================================================== */

/**
 * Il tipo di controparte di uno sponsor.
 *
 * Un fornitore e uno sponsor con `type: "fornitore"`: la distinzione esiste
 * gia, e mapparla sul catalogo chiuso della barriera evita che il denaro in
 * uscita verso un fornitore si presenti come una sponsorizzazione.
 */
export const sponsorCounterpartyKind = (
  sponsor: NormalizedSponsor,
): CounterpartyKind => (sponsor.kind === "fornitore" ? "SUPPLIER" : "SPONSOR");

/**
 * L'etichetta da **congelare** sulla riga.
 *
 * Si legge adesso e si scrive adesso: e la stessa scelta dello snapshot di un
 * documento fiscale. Se la scheda cambia nome domani, la riga di sei mesi fa
 * deve continuare a dire a chi si riferiva.
 */
export const sponsorCounterpartyLabel = (sponsor: NormalizedSponsor) =>
  sponsor.name || getSponsorKindLabel(sponsor.kind);

/**
 * Lo sponsor come **intestatario** di un documento fiscale.
 *
 * Non e l'atleta, e non gli somiglia: ha una partita IVA, un codice
 * destinatario e una sede. Vedi `src/lib/documents/fiscal-recipient.ts`, che ha
 * imparato questa seconda forma proprio per lui.
 */
export const sponsorFiscalCounterparty = (
  sponsor: NormalizedSponsor,
): FiscalCounterparty => ({
  kind: sponsorCounterpartyKind(sponsor),
  id: sponsor.id || null,
  name: sponsorCounterpartyLabel(sponsor),
  fiscalCode: sponsor.fiscalCode,
  vatNumber: sponsor.vatNumber,
  recipientCode: sponsor.recipientCode,
  email: sponsor.pec || sponsor.email,
  address: sponsor.address,
  city: sponsor.city,
  postalCode: sponsor.postalCode,
  province: sponsor.province,
  country: sponsor.country,
});

/* ========================================================================== */
/* Gli incassi                                                                 */
/* ========================================================================== */

/**
 * Un incasso dello sponsor, nella forma in cui il credito lo usa.
 *
 * La fonte canonica e `payment_transactions`, come per ogni altro denaro che
 * entra: la funzione accetta sia una riga del registro sia una riga della
 * vecchia collezione JSON `sponsor_payments`, perche i due mondi convivono
 * finche lo storico non e migrato — e un residuo che ignorasse lo storico
 * direbbe che uno sponsor deve ancora tutto.
 */
export type SponsorCollection = {
  id: string;
  amountCents: number;
  paidAt: string | null;
  paymentMethod: string;
  notes: string;
  /** Uno storno, o la riga che lo storno annulla: nessuna delle due e cassa. */
  reversed: boolean;
  /** L'etichetta congelata sulla riga, quando c'e. */
  counterpartyLabel: string;
};

const toIsoOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const raw = asText(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
};

export const normalizeSponsorCollection = (
  raw: unknown,
): SponsorCollection | null => {
  if (!isRecord(raw)) return null;

  const amountCents =
    raw.amount_cents !== undefined && raw.amount_cents !== null
      ? Math.round(Number(raw.amount_cents) || 0)
      : toSponsorCents(raw.amount);

  return {
    id: asText(raw.id),
    amountCents: Number.isFinite(amountCents) ? amountCents : 0,
    paidAt: toIsoOrNull(firstText(raw.paid_at, raw.paidAt, raw.date)),
    paymentMethod: firstText(
      raw.payment_method,
      raw.paymentMethod,
      raw.method,
    ),
    notes: firstText(raw.notes, raw.description),
    /*
      Le due facce dello storno si escludono **entrambe**: la riga stornata
      perche il denaro non c'e piu, la riga di storno perche conterebbe due
      volte in negativo. E la stessa regola di `isSettledTransaction`.
    */
    reversed: Boolean(
      raw.reversed_at ||
        raw.reversedAt ||
        raw.reverses_transaction_id ||
        raw.reversesTransactionId,
    ),
    counterpartyLabel: firstText(raw.counterparty_label, raw.counterpartyLabel),
  };
};

export const normalizeSponsorCollections = (
  rows: unknown,
): SponsorCollection[] =>
  (Array.isArray(rows) ? rows : [])
    .map(normalizeSponsorCollection)
    .filter((row): row is SponsorCollection => Boolean(row));

/**
 * Le righe della **vecchia** collezione JSON, ripulite.
 *
 * Li dentro «entrata» e «uscita» convivono, e un rimborso allo sponsor non e un
 * incasso: sommarlo abbasserebbe il residuo di un denaro che dal club e uscito.
 * La regola sta qui e non in chi chiama, perche il servizio e la schermata
 * devono leggere lo storico allo stesso modo.
 */
export const normalizeLegacySponsorCollections = (
  rows: unknown,
  sponsorId?: string,
): SponsorCollection[] => {
  const wanted = asText(sponsorId);

  return normalizeSponsorCollections(
    (Array.isArray(rows) ? rows : []).filter((row: any) => {
      if (!isRecord(row)) return false;
      if (asText(row.type || "entrata").toLowerCase() === "uscita") return false;
      if (!wanted) return true;
      return asText(row.sponsorId || row.sponsor_id) === wanted;
    }),
  );
};

/** Gli incassi che contano davvero: gli storni non sono cassa. */
export const settledSponsorCollections = (collections: SponsorCollection[]) =>
  collections.filter((collection) => !collection.reversed);

export const sumSponsorCollectionsCents = (collections: SponsorCollection[]) =>
  settledSponsorCollections(collections).reduce(
    (total, collection) => total + collection.amountCents,
    0,
  );

/* ========================================================================== */
/* Il credito                                                                  */
/* ========================================================================== */

/**
 * Le **tre cifre** di uno sponsor. Si mostrano accanto, non si sommano.
 *
 * - `dueCents` — cio che il contratto impegna. **Non e cassa.**
 * - `collectedCents` — cio che e arrivato davvero, dal registro degli incassi.
 * - `outstandingCents` — la differenza. Non e un dato salvato: e questa
 *   sottrazione, rifatta a ogni lettura.
 *
 * **Perche il residuo non viene azzerato quando e negativo.** Uno sponsor che
 * versa piu del pattuito esiste — un rinnovo verbale, una tranche in piu — e
 * un residuo bloccato a zero nasconderebbe l'unica cosa che chi guarda deve
 * vedere: che i conti non tornano e qualcuno deve decidere cosa farne.
 */
export type SponsorCredit = {
  dueCents: number;
  collectedCents: number;
  outstandingCents: number;
  hasContract: boolean;
  isSettled: boolean;
};

export const resolveSponsorCredit = (input: {
  contract?: SponsorContract | null;
  collections?: SponsorCollection[] | null;
}): SponsorCredit => {
  const contract = input.contract || EMPTY_SPONSOR_CONTRACT;
  const collections = input.collections || [];

  const dueCents = Math.round(contract.agreedAmountCents || 0);
  const collectedCents = sumSponsorCollectionsCents(collections);

  return {
    dueCents,
    collectedCents,
    outstandingCents: dueCents - collectedCents,
    hasContract: hasSponsorContract(contract),
    /*
      Senza contratto non c'e niente da saldare: dichiarare «saldato» uno
      sponsor di cui non si e pattuito nulla direbbe che il credito e chiuso
      quando in realta non e mai stato aperto.
    */
    isSettled: dueCents > 0 && collectedCents >= dueCents,
  };
};

/* ========================================================================== */
/* L'incasso da registrare                                                     */
/* ========================================================================== */

/**
 * L'incasso di uno sponsor, nella forma che il **registro degli incassi**
 * accetta.
 *
 * **Perche non un ledger sponsor.** Perche il denaro che entra ha gia un
 * proprietario — `payment_transactions` — e una seconda tabella di incassi
 * sarebbe la seconda contabilita che l'OWNERSHIP vieta. Cio che mancava non era
 * un registro: era la possibilita di dire che la controparte non e un atleta.
 *
 * I tre campi della controparte viaggiano **congelati**: il tipo, l'id nel
 * dominio proprietario e il nome letto adesso.
 */
export type SponsorCollectionInput = {
  organizationId: string;
  /** Nessuna rata: la sponsorizzazione non e un piano di pagamento. */
  paymentId: null;
  athleteId: null;
  amount: number;
  paidAt: string | null;
  paymentMethod: string;
  notes: string | null;
  operationTypeCode: string | null;
  counterpartyKind: CounterpartyKind;
  counterpartyId: string | null;
  counterpartyLabel: string;
};

/**
 * La causale predefinita di una sponsorizzazione.
 *
 * E l'unica entrata dichiaratamente **commerciale** del catalogo, ed e l'unica
 * con `documentRoute: "invoice"`. Chi registra puo dichiararne un'altra; il
 * valore che si propone e questo.
 */
export const SPONSORSHIP_OPERATION_TYPE_CODE = "sponsorizzazione";

export const buildSponsorCollectionInput = (input: {
  organizationId: string;
  sponsor: NormalizedSponsor;
  amount: unknown;
  paidAt?: unknown;
  paymentMethod?: unknown;
  notes?: unknown;
  operationTypeCode?: unknown;
}): SponsorCollectionInput => {
  const amountCents = toSponsorCents(input.amount);

  if (amountCents <= 0) {
    throw new Error("L'importo dell'incasso deve essere maggiore di zero");
  }

  const paymentMethod = asText(input.paymentMethod);
  if (!paymentMethod) {
    throw new Error("Indica il metodo di pagamento dell'incasso");
  }

  return {
    organizationId: asText(input.organizationId),
    paymentId: null,
    /*
      `athleteId` resta nullo, e non e un buco: e il punto dell'estensione. Un
      incasso di sponsorizzazione non ha un atleta, e finora era questo a
      renderlo impossibile.
    */
    athleteId: null,
    amount: fromSponsorCents(amountCents),
    paidAt: toIsoOrNull(input.paidAt),
    paymentMethod,
    notes: asText(input.notes) || null,
    operationTypeCode:
      asText(input.operationTypeCode) || SPONSORSHIP_OPERATION_TYPE_CODE,
    counterpartyKind: sponsorCounterpartyKind(input.sponsor),
    counterpartyId: input.sponsor.id || null,
    counterpartyLabel: sponsorCounterpartyLabel(input.sponsor),
  };
};
