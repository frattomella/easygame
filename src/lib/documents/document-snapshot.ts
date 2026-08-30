/**
 * La **fotografia** di un documento al momento in cui viene emesso.
 *
 * **Il difetto che chiude.** Fino al Blocco D una ricevuta si ristampava
 * leggendo l'anagrafica *di oggi*: nome, indirizzo e codice fiscale
 * dell'intestatario venivano ricaricati dal record dell'atleta. Bastava che una
 * famiglia traslocasse — o che qualcuno correggesse un codice fiscale digitato
 * male — perche la ricevuta gia consegnata mesi prima diventasse un documento
 * **diverso** da quello che quella famiglia aveva in mano. Non e una
 * sfumatura: sono due documenti con lo stesso numero.
 *
 * **La regola.** Un documento emesso e un fatto storico. Al momento
 * dell'emissione si scrive qui dentro tutto cio che serve a ristamparlo
 * identico fra dieci anni — emittente, intestatario, importi, causale,
 * riferimenti — e da quel momento la ristampa legge **solo** questo. Se
 * l'anagrafica cambia, cambiano i documenti futuri.
 *
 * **Perche i campi sciolti restano.** `invoices.vat_number`,
 * `receipts.method` e compagnia continuano a esistere perche mezza
 * applicazione li interroga e li filtra, e una query su un campo JSON non e la
 * stessa cosa. Lo snapshot e la fonte **autorevole**; i campi sciolti sono una
 * copia interrogabile. Quando divergono, vince lo snapshot.
 *
 * Modulo **puro**. Vedi ADR-0052.
 */

import type { FiscalProfile } from "@/lib/fiscal/fiscal-profile";
import {
  UNCLASSIFIED_LABEL,
  type ActivityScope,
  type FrozenClassification,
} from "@/lib/fiscal/operation-types";
import type { FiscalRecipient } from "./fiscal-recipient";

/** La versione dello schema dello snapshot. Cambia solo se cambia la forma. */
export const DOCUMENT_SNAPSHOT_VERSION = 1;

const asText = (value: unknown) => String(value ?? "").trim();

export type DocumentIssuerSnapshot = {
  name: string;
  legalForm: string;
  fiscalCode: string;
  vatNumber: string;
  taxRegimeCode: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  pec: string;
  reaOffice: string;
  reaNumber: string;
};

export type DocumentRecipientSnapshot = {
  name: string;
  fiscalCode: string;
  vatNumber: string;
  recipientCode: string;
  email: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  /** Da chi sono stati presi i dati: si legge sul documento, non si indovina. */
  source: FiscalRecipient["source"];
};

export type DocumentAmountsSnapshot = {
  currency: "EUR";
  /** L'importo del documento in centesimi. Interi, come ovunque nel denaro. */
  totalCents: number;
  stampDutyCents: number;
  vatRate: number | null;
  vatNature: string | null;
  /**
   * **Imponibile e imposta, congelati.**
   *
   * `null` quando l'aliquota non e dichiarata, che e il caso di quasi tutti i
   * documenti di quasi tutte le ASD: un imponibile pari al totale scritto senza
   * che nessuno abbia dichiarato l'aliquota sarebbe un'affermazione fiscale
   * gratuita. Vedi `src/lib/fiscal/vat.ts` e §16 del piano della Wave 4.
   */
  taxableAmountCents: number | null;
  vatAmountCents: number | null;
};

/**
 * **La classificazione al momento dell'emissione.**
 *
 * La causale e configurazione **mutabile**: se domani il club corregge
 * l'ambito di «quota di iscrizione», tutti i documenti gia consegnati
 * cambierebbero natura retroattivamente. Qui l'ambito si congela, con la
 * dichiarazione di **chi** l'ha detto: `declared: false` significa che
 * EasyGame l'aveva solo proposto, e il documento resta `NON CLASSIFICATO`.
 */
export type DocumentClassificationSnapshot = {
  activityScope: ActivityScope;
  declared: boolean;
  source: FrozenClassification["source"];
  label: string;
  deductible: boolean | null;
  isMembershipFee: boolean | null;
};

export type DocumentSnapshot = {
  version: number;
  issuedAt: string;
  issuer: DocumentIssuerSnapshot;
  recipient: DocumentRecipientSnapshot;
  amounts: DocumentAmountsSnapshot;
  /** La causale come e stata scritta sul documento. */
  description: string;
  operationTypeCode: string | null;
  operationTypeLabel: string | null;
  /** Cosa il documento dichiara di essere, fiscalmente, e chi l'ha deciso. */
  classification: DocumentClassificationSnapshot;
  /** Gli incassi documentati. Un documento puo coprirne piu di uno. */
  transactionIds: string[];
  /** La rata a cui l'incasso si riferisce, quando c'e. */
  installmentId: string | null;
  /** Chi ha emesso. Un documento senza autore non si contesta a nessuno. */
  issuedByUserId: string | null;
};

const issuerFrom = (profile: FiscalProfile, fallbackName: string): DocumentIssuerSnapshot => ({
  name: asText(profile?.legalName) || asText(fallbackName),
  legalForm: asText(profile?.legalForm) || "altro",
  fiscalCode: asText(profile?.fiscalCode),
  vatNumber: asText(profile?.vatNumber),
  taxRegimeCode: asText(profile?.taxRegimeCode),
  address: asText(profile?.address),
  city: asText(profile?.city),
  postalCode: asText(profile?.postalCode),
  province: asText(profile?.province),
  country: asText(profile?.country) || "IT",
  pec: asText(profile?.pec),
  reaOffice: asText(profile?.reaOffice),
  reaNumber: asText(profile?.reaNumber),
});

const recipientFrom = (recipient: FiscalRecipient): DocumentRecipientSnapshot => ({
  name: asText(recipient?.name),
  fiscalCode: asText(recipient?.fiscalCode),
  vatNumber: asText(recipient?.vatNumber),
  recipientCode: asText(recipient?.recipientCode),
  email: asText(recipient?.email),
  address: asText(recipient?.address),
  city: asText(recipient?.city),
  postalCode: asText(recipient?.postalCode),
  province: asText(recipient?.province),
  country: asText(recipient?.country) || "Italia",
  source: recipient?.source || "unknown",
});

/**
 * Costruisce la fotografia.
 *
 * `issuedAt` arriva da chi chiama e non da `new Date()` qui dentro: la data del
 * documento e quella dell'incasso, non quella in cui qualcuno ha premuto il
 * pulsante, e le due possono distare giorni quando una segreteria registra il
 * sabato gli incassi della settimana.
 */
export const buildDocumentSnapshot = (input: {
  profile: FiscalProfile;
  organizationName: string;
  recipient: FiscalRecipient;
  issuedAt: Date | string;
  description: string;
  totalCents: number;
  stampDutyCents?: number;
  vatRate?: number | null;
  vatNature?: string | null;
  taxableAmountCents?: number | null;
  vatAmountCents?: number | null;
  operationTypeCode?: string | null;
  operationTypeLabel?: string | null;
  /** La classificazione da congelare. Assente = nessuno l'ha dichiarata. */
  classification?: FrozenClassification | null;
  transactionIds?: string[];
  installmentId?: string | null;
  issuedByUserId?: string | null;
}): DocumentSnapshot => {
  const issuedAt =
    input.issuedAt instanceof Date ? input.issuedAt : new Date(input.issuedAt);

  /*
    Nessuna classificazione passata **non** vuol dire «istituzionale», e non
    vuol dire nemmeno «commerciale»: vuol dire che questo documento non porta
    una dichiarazione, e deve dirlo. Un default silenzioso qui e esattamente il
    difetto del §5.2 spostato di un file.
  */
  const classification: DocumentClassificationSnapshot = input.classification
    ? {
        activityScope: input.classification.activityScope,
        declared: input.classification.declared,
        source: input.classification.source,
        label: input.classification.label,
        deductible: input.classification.deductible,
        isMembershipFee: input.classification.isMembershipFee,
      }
    : {
        activityScope: "unspecified",
        declared: false,
        source: "absent",
        label: UNCLASSIFIED_LABEL,
        deductible: null,
        isMembershipFee: null,
      };

  const asCentsOrNull = (value: unknown) =>
    value === null || value === undefined ? null : Math.round(Number(value) || 0);

  return {
    version: DOCUMENT_SNAPSHOT_VERSION,
    issuedAt: Number.isNaN(issuedAt.getTime())
      ? new Date().toISOString()
      : issuedAt.toISOString(),
    issuer: issuerFrom(input.profile, input.organizationName),
    recipient: recipientFrom(input.recipient),
    amounts: {
      currency: "EUR",
      totalCents: Math.round(Number(input.totalCents) || 0),
      stampDutyCents: Math.max(0, Math.round(Number(input.stampDutyCents) || 0)),
      vatRate:
        input.vatRate === null || input.vatRate === undefined
          ? null
          : Number(input.vatRate),
      vatNature: asText(input.vatNature) || null,
      taxableAmountCents: asCentsOrNull(input.taxableAmountCents),
      vatAmountCents: asCentsOrNull(input.vatAmountCents),
    },
    description: asText(input.description),
    operationTypeCode: asText(input.operationTypeCode) || null,
    operationTypeLabel: asText(input.operationTypeLabel) || null,
    classification,
    transactionIds: (input.transactionIds || []).map(asText).filter(Boolean),
    installmentId: asText(input.installmentId) || null,
    issuedByUserId: asText(input.issuedByUserId) || null,
  };
};

/**
 * Rilegge una fotografia salvata.
 *
 * Tollerante: i documenti emessi **prima** del Blocco D non ne hanno una, e
 * quelli restano leggibili dai campi sciolti. Restituisce `null` invece di
 * lanciare, cosi chi ristampa sa che deve ripiegare sui campi e non su un
 * errore.
 */
export const readDocumentSnapshot = (value: unknown): DocumentSnapshot | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, any>;
  if (!record.issuer || !record.amounts) return null;

  return record as DocumentSnapshot;
};

/* -------------------------------------------------- immutabilita */

/**
 * I campi che, una volta emesso il documento, **non si modificano piu**.
 *
 * **Perche un elenco e non un blocco totale.** Alcune cose su un documento
 * emesso si devono poter cambiare — l'allegato PDF rigenerato, un riferimento
 * interno, la marcatura di annullamento. Quel che non si tocca e cio che
 * qualcuno ha in mano su carta: numero, data, importo, intestatario. Un elenco
 * esplicito si legge e si prova; «e immutabile» sparso nel codice no.
 */
export const IMMUTABLE_DOCUMENT_FIELDS = [
  "organization_id",
  "receipt_number",
  "invoice_number",
  "series",
  "sequence",
  "document_year",
  "issue_date",
  "amount",
  /*
    Imponibile e imposta entrano nell'elenco perche sono **importi**: sono la
    scomposizione dello stesso numero che il documento consegnato porta, e
    riscriverli dopo l'emissione cambierebbe cio che quel documento dichiara
    senza cambiare il totale — cioe nel modo meno visibile possibile.
  */
  "taxable_amount_cents",
  "vat_amount_cents",
  "snapshot",
  "athlete_id",
  "transaction_id",
  "payment_id",
  "vat_number",
  "fiscal_code",
  "recipient_code",
  "address",
  "city",
  "postal_code",
  "province",
  "country",
  /*
    **Lo stato, e cio che lo accompagna.** (C-1)

    Non erano nell'elenco, e l'audit ne ha fatto un aggiramento in **due
    chiamate**: `PATCH {"status":"draft"}` passava — l'insieme dei campi
    toccati era vuoto — e la seconda `PATCH` trovava una riga che si
    dichiarava bozza, quindi `assertDocumentMutable` usciva subito e lasciava
    riscrivere importo, data, imponibile, imposta, intestatario e **lo
    snapshot** di una fattura gia consegnata.

    La stessa mossa riportava in vita un documento **annullato**:
    `{"status":"draft","cancelled_at":null}` lo faceva tornare modificabile.

    `is_electronic` sta qui per una ragione sua: `fiscal-documents.ts` lo
    scrive esplicitamente a `false` citando ADR-0053 — «far credere a una
    societa di aver adempiuto» — e dal CRUD generico si poteva rimettere a
    `true` su una fattura emessa, senza nemmeno il declassamento.

    `data` ci sta perche la rotta di stampa di una fattura ne legge
    l'intestatario: era il modo piu breve per cambiare a chi risulta intestato
    un documento consegnato.
  */
  "status",
  "cancelled_at",
  "cancelled_by",
  "cancellation_reason",
  "cancels_document_id",
  "is_electronic",
  "operation_type_code",
  "data",
] as const;

export type ImmutableDocumentField = (typeof IMMUTABLE_DOCUMENT_FIELDS)[number];

/**
 * Quali campi fiscalmente rilevanti una modifica sta cercando di toccare.
 *
 * Restituisce l'elenco invece di un booleano perche il messaggio d'errore deve
 * poter dire *quale* campo: «documento non modificabile» manda al telefono,
 * «il numero e la data di un documento emesso non si cambiano» no.
 */
export const immutableFieldsTouchedBy = (
  updates: Record<string, unknown>,
  current: Record<string, unknown>,
): ImmutableDocumentField[] =>
  IMMUTABLE_DOCUMENT_FIELDS.filter((field) => {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) return false;

    const wanted = updates[field];
    const existing = current?.[field];

    /*
      Rimandare indietro lo stesso valore non e una modifica, e succede a ogni
      salvataggio di un form che rispedisce l'intero record. Rifiutarlo
      renderebbe impossibile cambiare le note di un documento.
    */
    try {
      return JSON.stringify(wanted ?? null) !== JSON.stringify(existing ?? null);
    } catch {
      return wanted !== existing;
    }
  });

/**
 * Rifiuta una modifica che tocchi i dati fiscalmente rilevanti di un documento
 * emesso.
 *
 * **Perche una funzione e non un controllo dentro il CRUD.** Perche un
 * documento si aggiorna da piu punti — il CRUD generico, la rigenerazione del
 * PDF, l'annullamento — e la regola deve valere per tutti e tre. Il messaggio
 * dice **quale** campo: «documento non modificabile» manda al telefono, «il
 * numero e la data di un documento emesso non si cambiano» no.
 *
 * **Perche vive qui e non accanto all'emissione.** Perche il chiamante che
 * mancava e `src/lib/server/resources.ts`, e `fiscal-documents.ts` importa
 * `sponsors.ts` che importa `resources.ts`: chiamarla da li avrebbe chiuso un
 * anello fra tre moduli server per una funzione che non tocca il database. Il
 * proprietario del dominio la riesporta, cosi il punto di ingresso documentato
 * resta uno solo.
 */
/**
 * Gli stati a partire dai quali un documento e **gia uscito** dalla societa.
 *
 * Un documento annullato e emesso quanto uno valido: qualcuno ce l'ha in mano,
 * e cio che dice non si riscrive. Cambia solo che non e piu in vigore.
 */
const STATI_EMESSI = new Set(["issued", "cancelled"]);

export const assertDocumentMutable = (
  current: Record<string, any>,
  updates: Record<string, any>,
) => {
  const status = String(current?.status ?? "").trim();
  if (!STATI_EMESSI.has(status)) return;

  const touched = immutableFieldsTouchedBy(updates, current);
  if (!touched.length) return;

  throw new Error(
    `Un documento emesso non si modifica: ${touched.join(", ")} appartengono al documento consegnato. Annullalo ed emetti una rettifica.`,
  );
};

/* --------------------------------------- il numero non lo digita il client */

/** Le risorse del CRUD generico che portano un numero di documento. */
export const CLIENT_ASSIGNED_DOCUMENT_NUMBER_FIELDS: Record<string, string> = {
  invoices: "invoice_number",
  receipts: "receipt_number",
};

/**
 * **Il numero di un documento non arriva mai dal client.**
 *
 * Lo alloca `document_number_sequences` dentro una transazione, ed e l'unico
 * modo per cui due sportelli della stessa segreteria che emettono nello stesso
 * secondo non ottengono lo stesso numero. Il CRUD generico invece accettava
 * `invoice_number` come una colonna qualunque: bastava un `POST
 * /api/v1/invoices {"invoice_number":"FT-2026-0001"}` per scrivere un numero
 * scelto a mano — e, con il vincolo di unicita per club, per **occupare** il
 * numero che la sequenza avrebbe assegnato dopo.
 *
 * Restituisce il campo rifiutato, o `null` se non c'era niente da rifiutare:
 * chi chiama decide se ignorarlo o fermarsi, e l'audit sa cosa e stato tolto.
 */
export const clientAssignedDocumentNumberField = (
  resource: string,
  input: Record<string, unknown> | null | undefined,
): string | null => {
  const field = CLIENT_ASSIGNED_DOCUMENT_NUMBER_FIELDS[resource];
  if (!field || !input) return null;
  if (!Object.prototype.hasOwnProperty.call(input, field)) return null;

  return String(input[field] ?? "").trim() ? field : null;
};
