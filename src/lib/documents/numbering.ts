/**
 * Come si chiama un documento: la forma del numero.
 *
 * **Perche e un modulo a se, e puro.** Il numero di una ricevuta compare in
 * cinque posti — il documento, la scheda atleta, l'elenco movimenti, il PDF,
 * la riga di riconciliazione — e in nessuno di quei posti va ricostruito a
 * mano. Qui si decide una volta come si scrive e come si rilegge; chi lo
 * mostra lo mostra e basta.
 *
 * **Cosa non c'e qui.** L'assegnazione del prossimo numero, che non si puo
 * fare senza database e senza una transazione: sta in
 * `src/lib/server/document-numbering.ts`. La separazione non e cosmetica —
 * la forma si prova senza database, l'unicita no.
 */

export const DOCUMENT_NUMBER_KINDS = ["receipt", "invoice"] as const;

export type DocumentNumberKind = (typeof DOCUMENT_NUMBER_KINDS)[number];

export const isDocumentNumberKind = (
  value: unknown,
): value is DocumentNumberKind =>
  DOCUMENT_NUMBER_KINDS.includes(String(value || "") as DocumentNumberKind);

type DocumentKindDefinition = {
  /** Il prefisso: si legge sul documento e distingue i due registri. */
  prefix: string;
  label: string;
};

export const DOCUMENT_NUMBER_KIND_DEFINITIONS: Record<
  DocumentNumberKind,
  DocumentKindDefinition
> = {
  receipt: { prefix: "R", label: "Ricevuta" },
  invoice: { prefix: "FT", label: "Fattura" },
};

/** Quante cifre ha la parte progressiva. Quattro bastano a un club per anno. */
export const DOCUMENT_NUMBER_PADDING = 4;

/**
 * Il numero di un documento: `R-2026-0001`.
 *
 * L'anno sta **dentro** il numero e non solo nella data: un registro si
 * consulta per numero, e «la 7» senza anno non identifica niente al secondo
 * esercizio.
 */
export const formatDocumentNumber = (
  kind: DocumentNumberKind,
  year: number,
  sequence: number,
) => {
  const { prefix } = DOCUMENT_NUMBER_KIND_DEFINITIONS[kind];
  const safeYear = Math.trunc(Number(year) || 0);
  const safeSequence = Math.max(1, Math.trunc(Number(sequence) || 0));

  return `${prefix}-${safeYear}-${String(safeSequence).padStart(
    DOCUMENT_NUMBER_PADDING,
    "0",
  )}`;
};

export type ParsedDocumentNumber = {
  kind: DocumentNumberKind | null;
  year: number;
  sequence: number;
};

/**
 * Rilegge un numero gia emesso.
 *
 * Tollerante di proposito: fino a oggi il numero di una fattura lo mandava il
 * client, quindi nei dati esistono forme che nessuno ha progettato. Si legge
 * cio che si riesce a leggere e si dichiara `null` il resto, invece di
 * rifiutare una riga che esiste.
 */
export const parseDocumentNumber = (
  value: unknown,
): ParsedDocumentNumber | null => {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = text.match(/^([A-Za-z]+)-(\d{4})-(\d+)$/);
  if (!match) return null;

  const prefix = match[1].toUpperCase();
  const kind =
    DOCUMENT_NUMBER_KINDS.find(
      (candidate) =>
        DOCUMENT_NUMBER_KIND_DEFINITIONS[candidate].prefix === prefix,
    ) || null;

  return {
    kind,
    year: Number(match[2]),
    sequence: Number(match[3]),
  };
};

/** L'anno di esercizio di una data. Un posto solo, cosi non se ne usano due. */
export const documentYearOf = (value: Date | string | number) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().getFullYear()
    : date.getFullYear();
};
