/**
 * La **classificazione delle operazioni economiche**: cosa si sta incassando.
 *
 * **Il problema che separa.** Un incasso e un fatto: del denaro e arrivato. Un
 * documento fiscale e un adempimento: dipende da chi incassa, da cosa ha
 * incassato e dal regime in cui si trova. Confonderli — trattare ogni incasso
 * come una fattura — e il modo piu rapido di produrre adempimenti che nessuno
 * doveva fare, o di ometterne di dovuti.
 *
 * **Perche l'elenco e configurazione e non un `enum` del codice.** Ogni voce
 * qui sotto e un *punto di partenza*: EasyGame semina il catalogo alla prima
 * apertura e poi non lo tocca piu. Un club che vende abbigliamento in regime
 * ordinario e un club che non lo vende affatto hanno bisogno di due elenchi
 * diversi, e nessuno dei due e «quello giusto» da scrivere dentro un
 * gestionale.
 *
 * **Cosa questo modulo NON fa: non conclude nulla di fiscale.** `documentRoute`
 * e ciò che il club **ha dichiarato** di voler fare per quel tipo di
 * operazione, e i valori seminati sono i piu conservativi possibili — nessuna
 * aliquota, nessuna natura IVA, nessuna esenzione inventata. Il giorno in cui
 * un commercialista li configura, li configura lui. Vedi ADR-0052.
 *
 * Modulo **puro**.
 */

export const DOCUMENT_ROUTES = [
  "none",
  "receipt",
  "invoice",
  "invoice_or_receipt",
] as const;

export type DocumentRoute = (typeof DOCUMENT_ROUTES)[number];

export const isDocumentRoute = (value: unknown): value is DocumentRoute =>
  DOCUMENT_ROUTES.includes(String(value || "") as DocumentRoute);

export const DOCUMENT_ROUTE_LABELS: Record<DocumentRoute, string> = {
  none: "Nessun documento",
  receipt: "Ricevuta",
  invoice: "Fattura",
  invoice_or_receipt: "Fattura o ricevuta, si sceglie",
};

export const ACTIVITY_SCOPES = [
  "institutional",
  "commercial",
  "unspecified",
] as const;

export type ActivityScope = (typeof ACTIVITY_SCOPES)[number];

export const isActivityScope = (value: unknown): value is ActivityScope =>
  ACTIVITY_SCOPES.includes(String(value || "") as ActivityScope);

export const ACTIVITY_SCOPE_LABELS: Record<ActivityScope, string> = {
  institutional: "Attivita istituzionale",
  commercial: "Attivita commerciale",
  unspecified: "Non dichiarata",
};

/* -------------------------------------------------------- il verso atteso */

/**
 * Il verso che la causale **suggerisce**, e non impone.
 *
 * `null` e un valore legittimo, e il piu frequente su una causale nuova: un
 * rimborso, una nota di credito, una rettifica servono in entrambi i versi.
 * Chi sceglie la causale vede il verso gia impostato e puo cambiarlo — il
 * verso lo decide il movimento, che e l'unico a sapere da che parte il denaro
 * si e mosso davvero.
 *
 * **Perche non «compatibilita cassa/banca» accanto.** Una causale che vieta il
 * contante e una regola gestionale, e le eccezioni sono la norma: l'affitto si
 * paga in contanti quando il proprietario lo chiede. Chi trova la strada
 * sbarrata sceglie un'altra causale, e il dato peggiora invece di migliorare
 * (§9 del piano della Wave 4).
 */
export const DIRECTION_HINTS = ["IN", "OUT"] as const;

export type DirectionHint = (typeof DIRECTION_HINTS)[number];

export const isDirectionHint = (value: unknown): value is DirectionHint =>
  DIRECTION_HINTS.includes(String(value || "").trim().toUpperCase() as DirectionHint);

export const DIRECTION_HINT_LABELS: Record<DirectionHint, string> = {
  IN: "Entrata",
  OUT: "Uscita",
};

/* ------------------------------------------------------- i tre stati logici */

/**
 * Vero, falso, **o nessuno dei due**.
 *
 * I due flag fiscali della causale — `deductible` e `is_membership_fee` —
 * nascono `null` e non `false`. Non e pignoleria: dire «questa quota non e
 * detraibile» quando nessuno l'ha stabilito e una risposta sbagliata che
 * sembra compilata, e un rendiconto che la somma non ha modo di accorgersene.
 * Un valore non dichiarato si vede che manca.
 *
 * Un `Boolean(value)` al posto di questa funzione trasformerebbe l'assenza in
 * un no, che e il difetto contro cui l'intero modulo e scritto.
 */
export const asDeclaredFlag = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (text === "true" || text === "1" || text === "si") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  return null;
};

/**
 * La **classificazione fiscale** di una causale: le tre cose che qualcuno deve
 * dichiarare, e che nessun automatismo deve indovinare.
 */
export type OperationTypeClassification = {
  activityScope: ActivityScope;
  deductible: boolean | null;
  isMembershipFee: boolean | null;
};

/**
 * Vero se **almeno una** delle tre e stata dichiarata.
 *
 * `unspecified` e `null` non sono dichiarazioni: sono l'assenza di una
 * dichiarazione, ed e la ragione per cui una causale appena seminata non porta
 * ne un autore ne una data.
 */
export const isClassificationDeclared = (
  classification: OperationTypeClassification,
) =>
  classification.activityScope !== "unspecified" ||
  classification.deductible !== null ||
  classification.isMembershipFee !== null;

/** Vero se la dichiarazione e cambiata: e cio che merita un autore nuovo. */
export const classificationChanged = (
  before: OperationTypeClassification,
  after: OperationTypeClassification,
) =>
  before.activityScope !== after.activityScope ||
  before.deductible !== after.deductible ||
  before.isMembershipFee !== after.isMembershipFee;

export type OperationTypeSeed = {
  code: string;
  label: string;
  documentRoute: DocumentRoute;
  activityScope: ActivityScope;
  /**
   * Il verso suggerito. E un aiuto all'interfaccia, non una classificazione
   * fiscale: dire che una quota e un'entrata non afferma niente sul suo
   * trattamento, e non e la stessa cosa che dichiararla istituzionale.
   */
  directionHint?: DirectionHint | null;
  /**
   * La voce di rendiconto proposta, che il club puo riscrivere.
   *
   * Le nove voci del seme originario non ne portano una, e restano cosi: il
   * `reporting_bucket` e **testo del club**, e riempirlo a posteriori su un
   * catalogo gia configurato sarebbe scrivere una scelta al posto suo. Le
   * quattro causali della Wave 6 nascono invece oggi, quindi un valore di partenza
   * non sovrascrive niente — ed e l'unico modo perche il rendiconto per voce
   * abbia qualcosa da raggruppare il primo giorno.
   */
  reportingBucket?: string | null;
  /** Dove nasce questo tipo di operazione, dentro EasyGame. */
  origin:
    | "athlete"
    | "member"
    | "sponsor"
    | "clothing"
    | "service"
    | "sport_work"
    | "funding"
    | "other";
  notes?: string;
};

/**
 * Il catalogo iniziale, seminato una volta per club.
 *
 * **Perche `activityScope` e quasi sempre `unspecified`.** Dire «la quota
 * associativa e istituzionale» sarebbe vero nella maggior parte dei casi e
 * falso in abbastanza casi da produrre danni. Un valore non dichiarato e
 * visibilmente da compilare; un valore sbagliato sembra compilato. Le due sole
 * eccezioni sono la vendita di abbigliamento e la sponsorizzazione, che sono
 * operazioni commerciali per definizione — non per regime del soggetto.
 */
export const OPERATION_TYPE_SEEDS: OperationTypeSeed[] = [
  {
    code: "quota_associativa",
    label: "Quota associativa",
    documentRoute: "receipt",
    activityScope: "unspecified",
    directionHint: "IN",
    origin: "member",
    notes:
      "Quota di adesione all'associazione. Il trattamento dipende dal regime del soggetto.",
  },
  {
    code: "quota_iscrizione",
    label: "Quota di iscrizione all'attivita",
    documentRoute: "receipt",
    activityScope: "unspecified",
    directionHint: "IN",
    origin: "athlete",
  },
  {
    code: "quota_attivita",
    label: "Rata / quota periodica dell'attivita sportiva",
    documentRoute: "receipt",
    activityScope: "unspecified",
    directionHint: "IN",
    origin: "athlete",
  },
  {
    code: "tesseramento",
    label: "Tesseramento federale o ente di promozione",
    documentRoute: "receipt",
    activityScope: "unspecified",
    directionHint: "IN",
    origin: "athlete",
    notes: "Spesso e un rimborso di quanto versato alla federazione.",
  },
  {
    code: "corso_servizio",
    label: "Corso, stage o servizio a pagamento",
    documentRoute: "invoice_or_receipt",
    activityScope: "unspecified",
    directionHint: "IN",
    origin: "service",
  },
  {
    code: "vendita_abbigliamento",
    label: "Vendita di abbigliamento o materiale",
    documentRoute: "invoice_or_receipt",
    activityScope: "commercial",
    directionHint: "IN",
    origin: "clothing",
    notes: "Cessione di beni: e attivita commerciale a prescindere dal soggetto.",
  },
  {
    code: "sponsorizzazione",
    label: "Sponsorizzazione e pubblicita",
    documentRoute: "invoice",
    activityScope: "commercial",
    directionHint: "IN",
    origin: "sponsor",
    notes:
      "Prestazione verso un altro soggetto economico: richiede fattura e un intestatario con posizione fiscale.",
  },
  {
    code: "contributo",
    label: "Contributo o erogazione da ente",
    documentRoute: "none",
    activityScope: "unspecified",
    directionHint: "IN",
    origin: "other",
    notes:
      "Non e un pagamento della famiglia: il dominio contributi resta separato (ADR-0037).",
  },
  {
    /*
      L'unica del seme senza verso suggerito, e di proposito: «altra
      operazione» e la voce che si sceglie quando nessuna delle altre calza, e
      calza in entrambi i versi.
    */
    code: "altra_operazione",
    label: "Altra operazione",
    documentRoute: "invoice_or_receipt",
    activityScope: "unspecified",
    directionHint: null,
    origin: "other",
  },

  /*
    ================================== LE TRE CAUSALI IN USCITA (W4-R7) ===

    Fino alla Wave 6 questo seme aveva **nove voci e otto guardavano in
    entrata**: non esisteva una sola causale pensata per un'uscita. Le due
    strade con cui il denaro si muove fuori dagli incassi delle famiglie — il
    compenso del lavoro sportivo e la liquidazione di un bando — proiettavano
    quindi `NULL` come causale e `unspecified` come ambito, scritti nel SQL
    della vista. Su una stagione vera erano **7.000 euro su 7.210** del non
    classificato: il buco non era un residuo di data entry, era strutturale.

    Sono tre e non sette. I sottotipi di `transaction_type` sul lavoro
    sportivo sono sette, ma quello e un **enum tecnico** che dice come la riga
    e nata; la causale dice sotto quale voce il denaro si somma nel rendiconto,
    e sta un livello sopra. Rispecchiare l'enum avrebbe portato nel piano dei
    conti una distinzione che serve al motore e non a chi legge il bilancio.

    La quarta voce nata con loro — `liquidazione_contributo` — e in questo
    elenco per **provenienza**, non per verso: e un'entrata, e il commento
    accanto alla sua definizione spiega perche.

    Restano `unspecified` come le altre: l'ambito e una **determinazione
    fiscale**, e ADR-0093 tiene distinta la contabilita gestionale dal
    trattamento. Seminarle gia classificate le farebbe sembrare configurate, e
    nessuno tornerebbe a guardarle.
  */
  {
    code: "compenso_sportivo",
    label: "Compenso sportivo",
    documentRoute: "none",
    activityScope: "unspecified",
    directionHint: "OUT",
    reportingBucket: "Compensi sportivi",
    origin: "sport_work",
    notes:
      "Il compenso di un collaboratore sportivo. EasyGame non determina la ritenuta: il trattamento resta del professionista (ADR-0073).",
  },
  {
    code: "rimborso_spese",
    label: "Rimborso spese",
    documentRoute: "none",
    activityScope: "unspecified",
    directionHint: "OUT",
    reportingBucket: "Rimborsi spese",
    origin: "sport_work",
    notes:
      "Un rimborso non e un compenso e non consuma le franchigie del lavoratore: esce dal registro senza toccarle.",
  },
  {
    code: "prestazione_professionale",
    label: "Prestazione professionale",
    documentRoute: "invoice",
    activityScope: "unspecified",
    directionHint: "OUT",
    reportingBucket: "Prestazioni professionali",
    origin: "sport_work",
    notes:
      "La fattura di chi ha una partita IVA. E l'unica delle quattro che nasce da un documento ricevuto.",
  },
  /*
    ------------- e la quarta nata con loro, che e invece un'ENTRATA (W6-R1)

    Questa causale e nata nel blocco delle quattro «in uscita» e ne ha
    ereditato il verso per contiguita, non per un fatto. Il fatto e l'opposto,
    e lo dicono tre punti indipendenti del prodotto:

    - lo schema, sulla colonna che la liquidazione ha accanto: «su quale conto
      e **arrivato** il bonifico dell'ente»;
    - la proiezione del registro, che sul verso legge il segno
      (`firmato < 0 ? "OUT" : "IN"`), e una liquidazione ha importo positivo
      per vincolo di database;
    - la vista SQL gemella, che dice la stessa cosa con
      `CASE WHEN fs.amount < 0 THEN 'OUT' ELSE 'IN' END`.

    Il denaro **arriva** dall'ente al club. Che poi il club lo giri alla
    famiglia e un secondo fatto, che vive nel dominio dei pagamenti e che qui
    non si registra: `funding_settlements` non e la riga con cui il club paga
    qualcuno, e la riga con cui incassa il bando.

    Il verso sbagliato non era cosmetico. Faceva due danni: sommava un incasso
    dentro un capitolo di uscita del rendiconto per voce, e — attraverso la
    guardia di `resolveOutboundClassification`, che rifiuta ogni causale in
    entrata — **rendeva la classificazione corretta un errore 400**. L'unica
    strada aperta era quella sbagliata.

    **E lo storno?** Ha importo negativo, quindi verso `OUT`, e sta nella
    stessa tabella con la stessa causale. Non e una contraddizione: il verso
    suggerito appartiene al **fatto di dominio** — «l'ente ha liquidato» — non
    alla singola riga. Lo storno e quel fatto annullato, e infatti non
    ricalcola niente: eredita la fotografia (codice, etichetta e ambito
    congelati) della riga che sta annullando, cosi le due righe si elidono
    esattamente sotto la stessa voce. La guardia percio si applica dove la
    causale viene **risolta** — una sola volta, sulla liquidazione — e non dove
    viene copiata.

    La voce di rendiconto cambia con il verso: «Contributi liquidati» leggeva
    come un capitolo di spesa. Il capitolo giusto e quello dei contributi
    ricevuti dagli enti.
  */
  {
    code: "liquidazione_contributo",
    label: "Liquidazione di contributo o voucher",
    documentRoute: "none",
    activityScope: "unspecified",
    directionHint: "IN",
    reportingBucket: "Contributi da enti",
    origin: "funding",
    notes:
      "Il bonifico con cui l'ente liquida al club i voucher maturati: e denaro che entra. Non e un pagamento della famiglia al contrario: i due domini non si importano (ADR-0037).",
  },
];

export const getOperationTypeSeed = (code: unknown) =>
  OPERATION_TYPE_SEEDS.find(
    (seed) => seed.code === String(code || "").trim(),
  ) || null;

/**
 * Il tipo di operazione predefinito per un dominio dell'applicazione.
 *
 * Serve a **proporre**, non a decidere: quando la segreteria registra un
 * incasso su una rata, il tipo proposto e «quota attivita» perche e quello che
 * e nove volte su dieci, e resta modificabile. Senza questa mappa ogni pagina
 * avrebbe finito per scrivere il proprio codice a mano, che e il modo in cui
 * una classificazione smette di essere una classificazione.
 */
export const DEFAULT_OPERATION_TYPE_BY_ORIGIN: Record<
  OperationTypeSeed["origin"],
  string
> = {
  athlete: "quota_attivita",
  member: "quota_associativa",
  sponsor: "sponsorizzazione",
  clothing: "vendita_abbigliamento",
  service: "corso_servizio",
  /*
    Le due origini nate con W4-R7. Il compenso e il ripiego del lavoro
    sportivo perche e cio che quel dominio produce piu spesso; rimborso e
    prestazione professionale si scelgono, perche sceglierli e proprio la
    distinzione che il rendiconto perdeva.

    `funding` ripiega su una causale **in entrata**: il bando liquida al club,
    non il contrario.
  */
  sport_work: "compenso_sportivo",
  funding: "liquidazione_contributo",
  other: "altra_operazione",
};

/**
 * **La causale che il prodotto sa gia dedurre, per il denaro che esce.**
 *
 * W4-R7. La domanda che il §21 del piano della Wave 5 lasciava aperta era se
 * compenso, rimborso e liquidazione condividessero una lista di causali o ne
 * servissero tre. La risposta e nei dati: il lavoro sportivo distingue gia
 * **otto** sottotipi di uscita in `transaction_type`, e quella distinzione la
 * conosce il motore nel momento in cui scrive la riga.
 *
 * Quindi la causale non si chiede a nessuno: si **deriva** da cio che il
 * sistema gia sa, e resta sovrascrivibile. E la differenza fra un campo
 * facoltativo che nessuno compila — cioe il buco di prima con un nome nuovo —
 * e una classificazione che c'e dal primo giorno.
 *
 * Le quattro causali non rispecchiano gli otto sottotipi uno a uno, ed e
 * deliberato: `transaction_type` dice **come la riga e nata**, la causale dice
 * **sotto quale voce il denaro si somma** nel rendiconto. Sono due domande, e
 * la seconda sta un livello sopra.
 */
export const OUTBOUND_OPERATION_TYPE_BY_TRANSACTION: Record<string, string> = {
  COMPENSATION_PAYMENT: "compenso_sportivo",
  COMPENSATION_REVERSAL: "compenso_sportivo",
  /*
    Un premio e un compenso ai fini del rendiconto, anche se non consuma le
    franchigie del lavoratore: le franchigie sono una regola previdenziale, la
    voce di bilancio e un'altra cosa.
  */
  BONUS_PAYMENT: "compenso_sportivo",
  EXPENSE_REIMBURSEMENT: "rimborso_spese",
  VAT_INVOICE_PAYMENT: "prestazione_professionale",
  EXTERNAL_PAYROLL_COST: "prestazione_professionale",
  /*
    Il versamento dei contributi non e ne un compenso ne una prestazione: e un
    adempimento. Resta senza causale dedotta, e chi lo registra sceglie —
    dedurne una sbagliata sarebbe peggio che non dedurne nessuna.
  */
};

/**
 * Le causali che il seme dichiara **in uscita**.
 *
 * `liquidazione_contributo` non e piu qui: il bonifico dell'ente e un'entrata,
 * e tenerlo in questo elenco significava dichiarare un verso che i tre punti
 * del prodotto che lo calcolano — schema, proiezione e vista SQL — smentiscono
 * tutti e tre.
 */
export const OUTBOUND_OPERATION_TYPE_CODES = [
  "compenso_sportivo",
  "rimborso_spese",
  "prestazione_professionale",
] as const;

export type NormalizedOperationType = {
  code: string;
  label: string;
  documentRoute: DocumentRoute;
  vatRate: number | null;
  vatNature: string | null;
  activityScope: ActivityScope;
  /** Il verso suggerito, `null` quando la causale serve in entrambi. */
  directionHint: DirectionHint | null;
  /** La voce di rendiconto sotto cui la causale si somma. Testo del club. */
  reportingBucket: string | null;
  /** La descrizione che il movimento eredita quando l'operatore tace. */
  defaultDescription: string | null;
  /** Detraibile ai fini del 730. `null` = nessuno l'ha dichiarato. */
  deductible: boolean | null;
  /** Quota associativa, distinta dalla quota sportiva. `null` = non dichiarato. */
  isMembershipFee: boolean | null;
  /** Chi ha attribuito la classificazione fiscale, e quando. */
  classifiedBy: string | null;
  classifiedAt: string | null;
  isActive: boolean;
  isSystem: boolean;
  notes: string | null;
};

const asText = (value: unknown) => String(value ?? "").trim();

const asIsoOrNull = (value: unknown) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Porta una riga di `fiscal_operation_types` — o il corpo di una richiesta —
 * nella forma con cui il resto dell'applicazione la legge.
 *
 * `vatRate` resta `null` quando non e stata dichiarata, e non diventa `0`:
 * «aliquota zero» e una dichiarazione fiscale precisa, «non dichiarata» e
 * l'assenza di una dichiarazione. Confonderle produrrebbe documenti che
 * affermano qualcosa che nessuno ha affermato.
 */
export const normalizeOperationType = (
  value: unknown,
): NormalizedOperationType => {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};

  const rawVatRate = record.vat_rate ?? record.vatRate;
  const parsedVatRate = Number(rawVatRate);

  return {
    code: asText(record.code),
    label: asText(record.label) || asText(record.code),
    documentRoute: isDocumentRoute(record.document_route ?? record.documentRoute)
      ? ((record.document_route ?? record.documentRoute) as DocumentRoute)
      : "receipt",
    vatRate:
      rawVatRate === null || rawVatRate === undefined || rawVatRate === ""
        ? null
        : Number.isFinite(parsedVatRate)
          ? Math.min(100, Math.max(0, parsedVatRate))
          : null,
    vatNature: asText(record.vat_nature ?? record.vatNature) || null,
    activityScope: isActivityScope(record.activity_scope ?? record.activityScope)
      ? ((record.activity_scope ?? record.activityScope) as ActivityScope)
      : "unspecified",
    directionHint: isDirectionHint(record.direction_hint ?? record.directionHint)
      ? (String(record.direction_hint ?? record.directionHint)
          .trim()
          .toUpperCase() as DirectionHint)
      : null,
    reportingBucket:
      asText(record.reporting_bucket ?? record.reportingBucket) || null,
    defaultDescription:
      asText(record.default_description ?? record.defaultDescription) || null,
    /*
      I due flag passano da `asDeclaredFlag` e non da `Boolean`: l'assenza di
      una dichiarazione deve restare assenza. `Boolean(undefined)` la
      trasformerebbe in un «no» che nessuno ha detto, e sarebbe indistinguibile
      da un no vero il giorno in cui qualcuno somma le quote detraibili.
    */
    deductible: asDeclaredFlag(record.deductible),
    isMembershipFee: asDeclaredFlag(
      record.is_membership_fee ?? record.isMembershipFee,
    ),
    classifiedBy: asText(record.classified_by ?? record.classifiedBy) || null,
    classifiedAt: asIsoOrNull(record.classified_at ?? record.classifiedAt),
    isActive: Boolean(record.is_active ?? record.isActive ?? true),
    isSystem: Boolean(record.is_system ?? record.isSystem ?? false),
    notes: asText(record.notes) || null,
  };
};

/** La sola classificazione, estratta da una causale gia normalizzata. */
export const classificationOf = (
  operationType: NormalizedOperationType,
): OperationTypeClassification => ({
  activityScope: operationType.activityScope,
  deductible: operationType.deductible,
  isMembershipFee: operationType.isMembershipFee,
});

/* ------------------------------------ dichiarato, proposto, non classificato */

/**
 * **Da dove viene la causale di un fatto economico.**
 *
 * Il difetto che questo tipo chiude e il §5.2 del piano della Wave 4, e non
 * era un difetto di calcolo: era un difetto di **presentazione**.
 * `operation_type_code` era sempre nullo sugli incassi, la catena ricadeva su
 * `DEFAULT_OPERATION_TYPE_BY_ORIGIN`, e da quel momento in poi il prodotto
 * mostrava «Rata / quota periodica dell'attivita sportiva» su ogni documento —
 * con la stessa faccia che avrebbe avuto se qualcuno l'avesse scelto. Un
 * rendiconto costruito su quel dato diceva «istituzionale 0, commerciale 0»
 * e sembrava un rendiconto.
 *
 * - `declared` — l'ha detto una persona: e sulla riga dell'incasso, oppure
 *   arriva nella richiesta di emissione;
 * - `proposed` — l'ha proposta EasyGame a partire dal dominio di origine. E
 *   una proposta utile e non e una dichiarazione;
 * - `absent` — non c'e ne l'una ne l'altra.
 *
 * Vedi ADR-0073: il motore propone e spiega; cio che non e stato dichiarato
 * non deve sembrare dichiarato.
 */
export const OPERATION_TYPE_SOURCES = [
  "declared",
  "proposed",
  "absent",
] as const;

export type OperationTypeSource = (typeof OPERATION_TYPE_SOURCES)[number];

/**
 * L'etichetta di cio che nessuno ha classificato.
 *
 * Maiuscola di proposito: in un elenco di voci di rendiconto deve **saltare
 * all'occhio**, perche e la riga che dice al club che c'e una configurazione da
 * fare. «Non dichiarata» in mezzo ad altre etichette si legge come una
 * categoria fra le altre.
 */
export const UNCLASSIFIED_LABEL = "NON CLASSIFICATO";

/**
 * Come si scrive l'ambito di un fatto economico, tenendo conto di **chi** l'ha
 * detto.
 *
 * Una causale soltanto proposta non porta il suo ambito: sarebbe
 * indistinguibile da un ambito scelto, ed e esattamente la confusione che il
 * §15 del piano chiede di togliere.
 */
export const activityScopeLabelOf = (
  scope: ActivityScope,
  source: OperationTypeSource = "declared",
) =>
  source === "declared" && scope !== "unspecified"
    ? ACTIVITY_SCOPE_LABELS[scope]
    : UNCLASSIFIED_LABEL;

/**
 * La classificazione **congelata** su un fatto: cio che si scrive sulla riga e
 * nello snapshot, e che non cambia piu.
 *
 * **Perche congelata e non referenziata.** La causale e configurazione
 * mutabile: `saveOperationType` riscrive `activity_scope` in place. Se domani
 * un club corregge la classificazione di una causale, tutti i documenti gia
 * emessi cambierebbero natura retroattivamente — e un documento consegnato non
 * cambia natura. E la stessa disciplina con cui il lavoro sportivo congela
 * contributi e aliquote sulla riga di registro.
 */
export type FrozenClassification = {
  operationTypeCode: string | null;
  operationTypeLabel: string | null;
  activityScope: ActivityScope;
  /** Falso quando l'ambito e solo proposto: e cio che rende visibile il vuoto. */
  declared: boolean;
  source: OperationTypeSource;
  /** Gia pronta da mostrare: `NON CLASSIFICATO` quando nessuno ha deciso. */
  label: string;
  deductible: boolean | null;
  isMembershipFee: boolean | null;
};

export const freezeClassification = (
  operationType: NormalizedOperationType | null,
  source: OperationTypeSource,
): FrozenClassification => {
  const declared = Boolean(
    operationType && source === "declared" && operationType.activityScope !== "unspecified",
  );

  /*
    Il codice e l'etichetta di una causale **proposta** restano leggibili — chi
    emette deve poter vedere cosa EasyGame stava proponendo — ma l'ambito no:
    quello e la grandezza che un rendiconto somma, e sommare una proposta e il
    modo in cui un numero inventato diventa un totale.
  */
  const activityScope: ActivityScope = declared
    ? (operationType as NormalizedOperationType).activityScope
    : "unspecified";

  return {
    operationTypeCode: operationType?.code || null,
    operationTypeLabel: operationType?.label || null,
    activityScope,
    declared,
    source,
    label: activityScopeLabelOf(activityScope, declared ? "declared" : source),
    deductible: source === "declared" ? (operationType?.deductible ?? null) : null,
    isMembershipFee:
      source === "declared" ? (operationType?.isMembershipFee ?? null) : null,
  };
};
