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
  operationTypeCode?: string | null;
  operationTypeLabel?: string | null;
  transactionIds?: string[];
  installmentId?: string | null;
  issuedByUserId?: string | null;
}): DocumentSnapshot => {
  const issuedAt =
    input.issuedAt instanceof Date ? input.issuedAt : new Date(input.issuedAt);

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
    },
    description: asText(input.description),
    operationTypeCode: asText(input.operationTypeCode) || null,
    operationTypeLabel: asText(input.operationTypeLabel) || null,
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
