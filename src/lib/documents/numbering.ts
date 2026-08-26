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

export const DOCUMENT_NUMBER_KINDS = ["receipt", "invoice", "credit_note"] as const;

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
  credit_note: { prefix: "NC", label: "Nota di credito" },
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
/**
 * Il codice di una serie, ripulito.
 *
 * Solo lettere e cifre, maiuscolo, al massimo otto caratteri: il codice entra
 * dentro il numero del documento, e un trattino o uno spazio li dentro
 * renderebbero il numero non piu rileggibile.
 */
export const normalizeSeriesCode = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

export const formatDocumentNumber = (
  kind: DocumentNumberKind,
  year: number,
  sequence: number,
  series: string = "",
) => {
  const { prefix } = DOCUMENT_NUMBER_KIND_DEFINITIONS[kind];
  const safeYear = Math.trunc(Number(year) || 0);
  const safeSequence = Math.max(1, Math.trunc(Number(sequence) || 0));
  const safeSeries = normalizeSeriesCode(series);

  /*
    La serie entra fra il prefisso e l'anno, e solo quando c'e. La serie
    predefinita e vuota, ed e quella in cui sono stati emessi tutti i documenti
    fino al Blocco D: un numero gia emesso deve continuare a scriversi
    esattamente come si scriveva, altrimenti la ristampa di una ricevuta
    consegnata l'anno scorso porterebbe un numero che non e il suo.
  */
  return [
    prefix,
    safeSeries || null,
    String(safeYear),
    String(safeSequence).padStart(DOCUMENT_NUMBER_PADDING, "0"),
  ]
    .filter(Boolean)
    .join("-");
};

export type ParsedDocumentNumber = {
  kind: DocumentNumberKind | null;
  /** Vuoto per la serie predefinita. */
  series: string;
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

  /*
    La serie e facoltativa e sta fra il prefisso e l'anno. Il gruppo che la
    cattura e non avido e ancorato all'anno di quattro cifre, cosi
    `FT-2026-0001` continua a leggersi come «nessuna serie» e non come «serie
    2026».
  */
  const match = text.match(/^([A-Za-z]+)-(?:([A-Za-z0-9]+)-)?(\d{4})-(\d+)$/);
  if (!match) return null;

  const prefix = match[1].toUpperCase();
  const kind =
    DOCUMENT_NUMBER_KINDS.find(
      (candidate) =>
        DOCUMENT_NUMBER_KIND_DEFINITIONS[candidate].prefix === prefix,
    ) || null;

  return {
    kind,
    series: (match[2] || "").toUpperCase(),
    year: Number(match[3]),
    sequence: Number(match[4]),
  };
};

/** L'anno di esercizio di una data. Un posto solo, cosi non se ne usano due. */
export const documentYearOf = (value: Date | string | number) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().getFullYear()
    : date.getFullYear();
};
