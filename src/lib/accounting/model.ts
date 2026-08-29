/**
 * Il **modello di dominio della prima nota**: cosa e un movimento, cosa puo
 * dire, e cosa non gli e permesso dire.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM. Lo
 * importano il servizio, le rotte, il proiettore e le schermate, perche un
 * invariante che vale solo sul server e un invariante che l'interfaccia
 * violera prima o poi.
 *
 * ---
 *
 * ## Il principio, prima di tutto il resto
 *
 * > Un movimento di prima nota **non e mai la fonte** di un numero che un
 * > altro dominio possiede. E la sua **proiezione datata e classificata**. Se
 * > i due divergono, ha ragione il dominio.
 *
 * Da qui discende la forma dell'intero modulo. `accounting_entries` ospita
 * **solo** cio che oggi vive nelle colonne JSON `clubs.transactions` e
 * `clubs.transfers`: il movimento di cassa registrato a mano e il giroconto.
 * Gli incassi delle famiglie, le uscite del lavoro sportivo, le liquidazioni
 * dei bandi e i pagamenti degli sponsor hanno gia un proprietario canonico e
 * restano dove sono. La prima nota li **legge**.
 *
 * Materializzarli qui sarebbe la seconda contabilita che il committente ha
 * vietato: due fonti per lo stesso numero, e nessun modo di tenerle allineate.
 */

/* ========================================================================== */
/* Il verso                                                                    */
/* ========================================================================== */

/**
 * Entrata o uscita. **Il segno lo dice il verso**, non l'importo: `amount_cents`
 * e sempre positivo, e un vincolo di database lo difende.
 *
 * Il giroconto non compare qui, ed e voluto: non e un terzo verso, e **due
 * movimenti** — un'uscita da un conto e un'entrata su un altro — tenuti insieme
 * da `transfer_group_id`. Modellarlo come un verso a se stante e cio che ha
 * prodotto, nel vecchio aggregatore, righe che non si sapeva se sommare.
 */
export const ENTRY_DIRECTIONS = ["IN", "OUT"] as const;
export type AccountingEntryDirection = (typeof ENTRY_DIRECTIONS)[number];

/**
 * **Stretto di proposito.** Accetta `"IN"` e `"OUT"`, non `"in "` ne
 * `"entrata"`: cio che arriva dal client si normalizza **prima**, con
 * `normalizeDirection`, e cio che sta sulla riga e gia normalizzato. Un
 * controllo che normalizza mentre valida lascia passare in tabella il valore
 * grezzo, e poi un `WHERE direction = 'IN'` non lo trova.
 */
export const isEntryDirection = (value: unknown): value is AccountingEntryDirection =>
  ENTRY_DIRECTIONS.includes(value as any);

/** Normalizza cio che arriva da fuori. Restituisce `null` se non e un verso. */
export const normalizeDirection = (
  value: unknown,
): AccountingEntryDirection | null => {
  const text = String(value ?? "").trim().toUpperCase();
  if (text === "IN" || text === "ENTRATA" || text === "INCOME") return "IN";
  if (text === "OUT" || text === "USCITA" || text === "EXPENSE") return "OUT";
  return null;
};

export const oppositeDirection = (
  direction: AccountingEntryDirection,
): AccountingEntryDirection => (direction === "IN" ? "OUT" : "IN");

/* ========================================================================== */
/* L'origine                                                                   */
/* ========================================================================== */

/**
 * **Da dove nasce un movimento.** Elenco chiuso, e non una stringa libera.
 *
 * Il campo `source` che c'era prima aveva due valori scritti e nessun catalogo:
 * chi leggeva una riga non poteva sapere se «da dove viene questo numero» fosse
 * una domanda con risposta. Qui la risposta e sempre una di queste.
 *
 * Le righe della tabella `accounting_entries` nascono `MANUAL`,
 * `INTERNAL_TRANSFER` o `REVERSAL`. Gli altri valori appartengono alle righe
 * **proiettate** dai domini proprietari, che non vivono in tabella: esistono qui
 * perche la proiezione e la tabella parlino la stessa lingua, e perche un
 * export, un filtro o un rendiconto non debbano distinguere fra le due.
 */
export const SOURCE_DOMAINS = [
  /** Un fatto di cassa che nessun altro evento ha generato: l'affitto pagato in contanti. */
  "MANUAL",
  /** Una gamba di giroconto. L'altra porta lo stesso `transfer_group_id`. */
  "INTERNAL_TRANSFER",
  /** Lo storno di una riga di questa tabella. */
  "REVERSAL",
  /** Un incasso da una famiglia: proprietario `payment_transactions`. */
  "ATHLETE_PAYMENT",
  /** Un bonifico dell'ente: proprietario `funding_settlements`. */
  "FUNDING_SETTLEMENT",
  /** Un'erogazione del lavoro sportivo: proprietario `sport_work_outbound_transactions`. */
  "SPORT_WORK_PAYOUT",
  /** Un incasso da uno sponsor. */
  "SPONSOR_PAYMENT",
  /** Un rimborso a una famiglia. Non e uno storno: e denaro che torna indietro. */
  "REFUND",
] as const;
export type AccountingSourceDomain = (typeof SOURCE_DOMAINS)[number];

/**
 * Le origini che possono essere **scritte** in `accounting_entries`.
 *
 * Le altre sono proiezioni: se una riga con una di quelle finisse in tabella,
 * lo stesso fatto sarebbe rappresentato due volte — una dal dominio, una dalla
 * copia — e i totali lo conterebbero due volte.
 */
export const WRITABLE_SOURCE_DOMAINS = new Set<AccountingSourceDomain>([
  "MANUAL",
  "INTERNAL_TRANSFER",
  "REVERSAL",
]);

export const isSourceDomain = (value: unknown): value is AccountingSourceDomain =>
  SOURCE_DOMAINS.includes(String(value || "").trim().toUpperCase() as any);

/** Le etichette italiane, per l'interfaccia e per l'export. */
export const SOURCE_DOMAIN_LABELS: Record<AccountingSourceDomain, string> = {
  MANUAL: "Movimento manuale",
  INTERNAL_TRANSFER: "Giroconto",
  REVERSAL: "Storno",
  ATHLETE_PAYMENT: "Incasso quota",
  FUNDING_SETTLEMENT: "Liquidazione contributo",
  SPORT_WORK_PAYOUT: "Compenso lavoro sportivo",
  SPONSOR_PAYMENT: "Incasso sponsor",
  REFUND: "Rimborso",
};

/* ========================================================================== */
/* Il conto                                                                    */
/* ========================================================================== */

/**
 * I tipi di conto, e non uno di piu.
 *
 * `CLEARING` esiste per un motivo concreto: il denaro incassato online non e in
 * banca il giorno dell'incasso, e il versamento del prestatore arriva dopo, al
 * netto delle commissioni. Senza un conto di transito, o il saldo banca e
 * sbagliato per giorni, o le commissioni spariscono.
 */
export const FINANCIAL_ACCOUNT_KINDS = ["CASH", "BANK", "CLEARING"] as const;
export type FinancialAccountKind = (typeof FINANCIAL_ACCOUNT_KINDS)[number];

export const FINANCIAL_ACCOUNT_KIND_LABELS: Record<FinancialAccountKind, string> = {
  CASH: "Cassa",
  BANK: "Banca",
  CLEARING: "Transito",
};

export const isFinancialAccountKind = (
  value: unknown,
): value is FinancialAccountKind =>
  FINANCIAL_ACCOUNT_KINDS.includes(String(value || "").trim().toUpperCase() as any);

/* ========================================================================== */
/* La controparte                                                              */
/* ========================================================================== */

/**
 * Chi sta dall'altra parte del movimento.
 *
 * **Non** una tabella `counterparties`: duplicherebbe atleti, soci, persone del
 * lavoro sportivo e sponsor, che esistono gia. Una coppia polimorfa — il tipo e
 * l'id nel dominio proprietario — piu **l'etichetta congelata**.
 *
 * L'etichetta congelata non e una duplicazione sciatta: e la stessa scelta dello
 * snapshot di un documento fiscale. Il movimento deve poter dire a chi si
 * riferiva anche se quella scheda e stata corretta o cancellata.
 */
export const COUNTERPARTY_KINDS = [
  "ATHLETE",
  "MEMBER",
  "SPORT_WORK_PERSON",
  "SPONSOR",
  "SUPPLIER",
  "ENTITY",
  "CLUB",
  "OTHER",
] as const;
export type CounterpartyKind = (typeof COUNTERPARTY_KINDS)[number];

export const isCounterpartyKind = (value: unknown): value is CounterpartyKind =>
  COUNTERPARTY_KINDS.includes(String(value || "").trim().toUpperCase() as any);

export const COUNTERPARTY_KIND_LABELS: Record<CounterpartyKind, string> = {
  ATHLETE: "Atleta",
  MEMBER: "Socio",
  SPORT_WORK_PERSON: "Lavoratore sportivo",
  SPONSOR: "Sponsor",
  SUPPLIER: "Fornitore",
  ENTITY: "Ente",
  CLUB: "Societa",
  OTHER: "Altro",
};

/* ========================================================================== */
/* La riconciliazione                                                          */
/* ========================================================================== */

/**
 * Lo stato di riconciliazione bancaria.
 *
 * In V1 la riconciliazione e **un atto umano su un dato che il sistema gia
 * conosce**: chi ha l'estratto conto davanti spunta. Nessun import di tracciati
 * bancari, nessun matching automatico su causale libera — sbaglia abbastanza da
 * farsi disattivare, e nel frattempo ha marcato come riconciliate righe che non
 * lo erano.
 */
export const RECONCILIATION_STATUSES = [
  "unreconciled",
  "reconciled",
  "disputed",
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export const isReconciliationStatus = (
  value: unknown,
): value is ReconciliationStatus =>
  RECONCILIATION_STATUSES.includes(String(value || "").trim().toLowerCase() as any);

export const RECONCILIATION_STATUS_LABELS: Record<ReconciliationStatus, string> = {
  unreconciled: "Da riconciliare",
  reconciled: "Riconciliato",
  disputed: "Contestato",
};

/* ========================================================================== */
/* La classificazione                                                          */
/* ========================================================================== */

/**
 * Istituzionale, commerciale, o **non classificato**.
 *
 * Il terzo valore non e un ripiego: e l'unico stato onesto finche un
 * professionista non ha guardato. Un rendiconto che dice «istituzionale
 * 12.400, commerciale 3.100, **non classificato 22.700**» fa capire al club che
 * deve configurare le causali. Uno che mostra solo i primi due numeri gli fa
 * credere di avere un rendiconto.
 */
export const ACTIVITY_SCOPES = [
  "institutional",
  "commercial",
  "unspecified",
] as const;
export type ActivityScope = (typeof ACTIVITY_SCOPES)[number];

export const ACTIVITY_SCOPE_LABELS: Record<ActivityScope, string> = {
  institutional: "Istituzionale",
  commercial: "Commerciale",
  unspecified: "Non classificato",
};

export const isActivityScope = (value: unknown): value is ActivityScope =>
  ACTIVITY_SCOPES.includes(String(value || "").trim().toLowerCase() as any);

export const normalizeActivityScope = (value: unknown): ActivityScope =>
  isActivityScope(value)
    ? (String(value).trim().toLowerCase() as ActivityScope)
    : "unspecified";

/* ========================================================================== */
/* Anno fiscale e stagione                                                     */
/* ========================================================================== */

/**
 * L'anno fiscale di un movimento: **l'anno solare UTC della data del fatto**.
 *
 * Non si digita mai. E un asse diverso dalla stagione sportiva, e servono
 * entrambi: la stagione 2026/27 contiene movimenti del 2026 e del 2027, e il
 * riepilogo fiscale del 2026 prende solo i primi. Sono due domande diverse, e
 * il prodotto deve rispondere a tutte e due senza che l'utente debba capire
 * perche.
 *
 * E la stessa scelta gia fatta dal lavoro sportivo, e per la stessa ragione
 * scritta li: mettere i due assi nello stesso perimetro azzererebbe i
 * progressivi cambiando stagione, cioe a giugno.
 */
export const fiscalYearOfEntry = (value: Date | string | number): number => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Data del movimento non valida: l'anno fiscale non e determinabile");
  }
  return date.getUTCFullYear();
};

/**
 * **La trappola del filtro per anno, e il modo di non caderci.**
 *
 * `Number(null)` non e `NaN`: e `0`, ed e un intero. Un filtro scritto come
 * `Number.isInteger(Number(anno)) ? { fiscal_year: Number(anno) } : {}` passa i
 * test — che passano `undefined` — e **in produzione filtra `fiscal_year = 0`**,
 * cioe risponde elenco vuoto a chiunque non chieda un anno esplicito, perche
 * `searchParams.get()` restituisce `null` quando il parametro manca.
 *
 * E un difetto trovato a runtime con duemila test verdi, e il gemello di
 * `toYearFilter` del lavoro sportivo. Ogni filtro per anno della contabilita
 * passa di qui.
 */
export const toFiscalYearFilter = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < 2000 || parsed > 2200) return null;
  return parsed;
};

/* ========================================================================== */
/* Il contratto della proiezione                                               */
/* ========================================================================== */

/**
 * Una riga di prima nota, quale che sia la sua origine.
 *
 * E il **contratto** che la tabella e la proiezione rispettano entrambe: chi
 * legge la prima nota non deve sapere se una riga viene da `accounting_entries`
 * o da un dominio proprietario.
 */
export type AccountingLine = {
  id: string;
  organizationId: string;
  entryDate: string;
  fiscalYear: number;
  seasonId?: string | null;
  direction: AccountingEntryDirection;
  amountCents: number;
  currency: string;
  financialAccountId: string | null;
  financialAccountName?: string | null;
  operationTypeCode?: string | null;
  operationTypeLabel?: string | null;
  activityScope: ActivityScope;
  description: string;
  notes?: string | null;
  paymentMethod?: string | null;
  counterpartyKind?: CounterpartyKind | null;
  counterpartyId?: string | null;
  counterpartyLabel?: string | null;
  sourceDomain: AccountingSourceDomain;
  sourceId?: string | null;
  documentKind?: string | null;
  documentId?: string | null;
  documentNumber?: string | null;
  siteId?: string | null;
  reconciliationStatus: ReconciliationStatus;
  valueDate?: string | null;
  bankReference?: string | null;
  transferGroupId?: string | null;
  reversalOfId?: string | null;
  reversedAt?: string | null;
  reversalReason?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  /**
   * **Cosa si puo fare su questa riga da qui.**
   *
   * Una riga **proiettata** e sempre in sola lettura, e non e una scelta di
   * comodo: modificarla da qui vorrebbe dire scrivere nel dominio proprietario
   * aggirando i suoi permessi e i suoi invarianti. Un compenso si corregge dove
   * i compensi si erogano, non dalla prima nota.
   */
  canEdit: boolean;
  canDelete: boolean;
  canReverse: boolean;
  canReconcile: boolean;
};

/**
 * **Il contratto della proiezione, in una funzione.**
 *
 * Ogni riga che non nasce in `accounting_entries` passa di qui prima di essere
 * mostrata, e ne esce marcata in sola lettura. E il presidio che impedisce a
 * una lane futura di rendere modificabile, per distrazione, una riga che
 * appartiene a un altro dominio.
 */
export const asProjectedLine = <T extends Partial<AccountingLine>>(line: T) => ({
  ...line,
  canEdit: false,
  canDelete: false,
  canReverse: false,
  /*
    La riconciliazione fa eccezione, ed e l'unica: spuntare «l'ho visto in
    banca» non cambia nessun numero del dominio proprietario, dice solo che
    l'estratto conto lo conferma. Ma vive sulla riga di prima nota, quindi una
    riga proiettata la accetta solo dove esiste una riga propria che la porti.
  */
  canReconcile: false,
});

/* ========================================================================== */
/* Gli invarianti                                                              */
/* ========================================================================== */

/**
 * Gli invarianti del movimento, scritti come funzione perche siano provabili.
 *
 * Sono gli stessi che il database difende con i suoi vincoli. La ridondanza e
 * voluta: il database protegge da chiunque, anche da uno script; questo
 * protegge **prima**, e produce un messaggio che una persona puo leggere invece
 * di un errore di violazione di vincolo.
 *
 * Ogni errore contiene il motivo, e nessuno di essi contiene «Accesso negato»:
 * un invariante violato non e un problema di permessi, ed etichettarlo cosi
 * darebbe un 403 dove serve un 400.
 */
export type AccountingEntryDraft = {
  direction?: unknown;
  amountCents?: unknown;
  entryDate?: unknown;
  fiscalYear?: unknown;
  sourceDomain?: unknown;
  financialAccountId?: unknown;
  operationTypeCode?: unknown;
  description?: unknown;
  transferGroupId?: unknown;
  reversalOfId?: unknown;
};

export const assertAccountingEntryInvariants = (draft: AccountingEntryDraft) => {
  if (!isEntryDirection(draft.direction)) {
    throw new Error("Il verso del movimento deve essere IN o OUT");
  }

  const amount = Number(draft.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      "L'importo di un movimento e un numero intero di centesimi maggiore di zero: il segno lo dice il verso",
    );
  }

  if (draft.entryDate === null || draft.entryDate === undefined || draft.entryDate === "") {
    throw new Error("Un movimento senza data non e collocabile in nessun esercizio");
  }
  const anno = fiscalYearOfEntry(draft.entryDate as any);
  if (anno < 2000 || anno > 2200) {
    throw new Error("La data del movimento e fuori scala");
  }
  if (
    draft.fiscalYear !== undefined &&
    draft.fiscalYear !== null &&
    Number(draft.fiscalYear) !== anno
  ) {
    throw new Error(
      "L'anno fiscale non si digita: e l'anno solare della data del movimento",
    );
  }

  const origine = String(draft.sourceDomain || "MANUAL").trim().toUpperCase();
  if (!isSourceDomain(origine)) {
    throw new Error("Origine del movimento sconosciuta");
  }
  if (!WRITABLE_SOURCE_DOMAINS.has(origine as AccountingSourceDomain)) {
    throw new Error(
      `Un movimento di origine ${origine} appartiene al suo dominio e non si scrive in prima nota: la prima nota lo proietta`,
    );
  }

  if (!String(draft.financialAccountId || "").trim()) {
    throw new Error("Un movimento deve dire su quale conto il denaro si e mosso");
  }

  if (!String(draft.description || "").trim()) {
    throw new Error("Un movimento senza descrizione non e leggibile da nessuno");
  }

  /*
    La causale e obbligatoria sul movimento manuale, e non sullo storno: uno
    storno eredita la causale della riga che compensa, e chiederla di nuovo
    aprirebbe la porta a uno storno classificato diversamente dall'originale.
  */
  if (origine === "MANUAL" && !String(draft.operationTypeCode || "").trim()) {
    throw new Error(
      "Un movimento senza causale nasce gia sbagliato: scegliere la causale e la prima cosa",
    );
  }

  if (origine === "INTERNAL_TRANSFER" && !String(draft.transferGroupId || "").trim()) {
    throw new Error("Un giroconto ha due gambe: senza il gruppo non si tengono insieme");
  }
  if (origine !== "INTERNAL_TRANSFER" && String(draft.transferGroupId || "").trim()) {
    throw new Error("Solo un giroconto appartiene a un gruppo di trasferimento");
  }

  if (origine === "REVERSAL" && !String(draft.reversalOfId || "").trim()) {
    throw new Error("Uno storno deve dire quale movimento sta compensando");
  }
  if (origine !== "REVERSAL" && String(draft.reversalOfId || "").trim()) {
    throw new Error("Solo uno storno cita un altro movimento");
  }
};

/* ========================================================================== */
/* Il saldo                                                                    */
/* ========================================================================== */

/**
 * Il saldo di un conto, **derivato**.
 *
 * Non e una colonna, e non lo diventera: e la somma dei movimenti, come lo
 * stato di una rata e la somma dei suoi incassi. E la disciplina di ADR-0036
 * applicata al conto, e chiude il difetto per cui `current_balance` veniva
 * mutato a mano dal browser con una chiamata HTTP separata e non transazionale.
 *
 * L'apertura si somma perche i movimenti che l'hanno prodotta non esistono: e
 * il numero che il vecchio blob dichiarava il giorno del travaso, e conservarlo
 * come punto di partenza e l'unica cosa onesta da farne.
 *
 * **Le righe stornate e gli storni escono entrambi**: una coppia
 * originale/storno somma zero, e lasciarli dentro darebbe lo stesso risultato
 * con due righe in piu da spiegare. Escluderli entrambi dice la verita in modo
 * piu diretto.
 */
export type BalanceContribution = {
  direction: AccountingEntryDirection;
  amountCents: number;
  reversedAt?: Date | string | null;
  reversalOfId?: string | null;
};

export const deriveAccountBalanceCents = (
  openingBalanceCents: number,
  lines: readonly BalanceContribution[],
) =>
  lines.reduce((saldo, line) => {
    if (line.reversedAt || line.reversalOfId) return saldo;
    const amount = Number(line.amountCents) || 0;
    return line.direction === "IN" ? saldo + amount : saldo - amount;
  }, Number(openingBalanceCents) || 0);

/* ========================================================================== */
/* Importi                                                                     */
/* ========================================================================== */

/**
 * Da euro a centesimi, senza passare per l'aritmetica in virgola mobile piu del
 * necessario.
 *
 * `Math.round` e sulla moltiplicazione e non dopo: `12.34 * 100` vale
 * `1233.9999999999998`, e un troncamento produrrebbe 1233 centesimi su un
 * importo che vale 1234.
 */
export const toCents = (value: number | string): number => {
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) {
    throw new Error("Importo non valido");
  }
  return Math.round(parsed * 100);
};

export const fromCents = (cents: number): number =>
  Number(((Number(cents) || 0) / 100).toFixed(2));
