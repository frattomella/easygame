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
  /** Dove nasce questo tipo di incasso, dentro EasyGame. */
  origin: "athlete" | "member" | "sponsor" | "clothing" | "service" | "other";
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
  other: "altra_operazione",
};

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
