import {
  ACTIVITY_SCOPE_LABELS,
  COUNTERPARTY_KIND_LABELS,
  RECONCILIATION_STATUS_LABELS,
  SOURCE_DOMAIN_LABELS,
  fromCents,
  type AccountingLine,
} from "./model";
import { assertNoOfficialClaim } from "./reporting";
import { csvFileName, toCsv, withCsvBom, type CsvColumn } from "@/lib/csv";

/**
 * L'**export della contabilita per il commercialista**: righe di prima nota
 * dentro un CSV che si apre con un doppio clic.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM.
 * Riceve righe gia lette — `AccountingLine`, la stessa forma che la prima nota
 * e il riepilogo usano — e restituisce testo. Chi le legge e
 * `src/lib/server/accounting-export.ts`.
 *
 * ---
 *
 * ## Perche sta **sopra** `src/lib/csv.ts` e non accanto
 *
 * Il tracciato — separatore `;`, fine riga CRLF, BOM, quoting su `;`, `"`,
 * `\n` **e `\r`**, virgola decimale sui numeri — ha gia un proprietario, e
 * quel modulo esiste perche il CSV era gia stato scritto due volte con due
 * comportamenti diversi. Qui non si decide niente di tutto cio: si decidono
 * **le colonne**, e il testo lo compone `toCsv`.
 *
 * ## La promessa, e cio che non e
 *
 * > *«Meglio un export chiaro e completo che fingere di sostituire il software
 * > del commercialista.»*
 *
 * Nessuno standard di interscambio verso un gestionale di studio esiste (§32
 * del piano): proprio per questo il file deve essere **leggibile da chiunque**
 * — colonne dichiarate in italiano, nessun formato proprietario, nessun
 * tracciato posizionale. E per la stessa ragione nessuna intestazione, nessun
 * nome di file e nessuna etichetta di questo modulo usa «ufficiale»,
 * «conforme», «a norma» o «per il deposito» (§13): la regola non e affidata
 * alla buona volonta di chi scrive una stringa, la verifica
 * `assertNoOfficialClaim` e la difende un test.
 *
 * **Niente XLSX.** Un writer XLSX e una dipendenza nuova per un guadagno
 * estetico: il CSV con `;` e BOM lo apre l'Excel italiano senza chiedere
 * niente, ed e la stessa scelta gia presa dal §27.
 *
 * ## Le due decisioni che rendono il file utile a chi lo riceve
 *
 * - **entrata e uscita sono due colonne**, e nessun importo porta il segno. Un
 *   `-120,00` in una colonna sola costringe chi somma a filtrare per segno, e
 *   il verso di un movimento non e una proprieta del suo importo: e la stessa
 *   ragione per cui `amount_cents` in tabella e sempre positivo;
 * - **cio che era congelato sulla riga resta congelato**: la classificazione,
 *   l'etichetta della causale e quella della controparte escono come stavano
 *   sul movimento, non come sono adesso nella configurazione del club. Un
 *   export che rileggesse la causale di oggi cambierebbe la natura fiscale del
 *   passato ogni volta che qualcuno corregge un catalogo — ed e il motivo per
 *   cui questa funzione **non riceve** ne il catalogo delle causali ne quello
 *   delle controparti: non puo consultarli perche non li ha.
 */

/* ========================================================================== */
/* Cosa esce, oltre alla riga                                                  */
/* ========================================================================== */

/**
 * Una riga di prima nota con i campi che **solo il documento collegato**
 * conosce.
 *
 * Imponibile e imposta non stanno su `accounting_entries` e non ci staranno:
 * l'IVA e un dato della fattura o della ricevuta (§16 — si modella il dato,
 * non la regola), e il movimento la cita. Sono opzionali perche la maggior
 * parte dei movimenti di una ASD non ha un documento con l'IVA, e una colonna
 * vuota e la verita: uno zero direbbe «imposta zero», che e un'altra cosa.
 */
export type AccountingExportLine = AccountingLine & {
  /** Imponibile del documento collegato, in centesimi. */
  taxableCents?: number | null;
  /** Imposta del documento collegato, in centesimi. */
  vatCents?: number | null;
  /** Come si chiama il documento collegato: «Fattura», «Ricevuta». */
  documentLabel?: string | null;
};

/* ========================================================================== */
/* Le colonne                                                                  */
/* ========================================================================== */

/**
 * Le colonne del §27, nell'ordine in cui sono state chieste, piu le due che il
 * brief non chiede e che un commercialista chiede sempre: **anno fiscale** e
 * **stato di riconciliazione**.
 *
 * Le altre aggiunte sono tre, e ognuna evita una domanda di ritorno:
 *
 * - **codice e etichetta della causale in due celle**: un raggruppamento per
 *   causale in un foglio si fa sul codice, che e stabile, non sull'etichetta,
 *   che si puo correggere;
 * - **tipo di controparte**: «Mario Rossi» da solo non dice se e un atleta o
 *   un fornitore, e la coppia tipo/etichetta e come il movimento la porta;
 * - **stornato il**: una riga stornata e il suo storno stanno **entrambi** nel
 *   file — la storia non si nasconde — ma se lo storno cade fuori dal periodo
 *   esportato, chi somma senza saperlo conta un movimento annullato. La data
 *   nella cella lo dice senza bisogno di incrociare due righe.
 */
export const ACCOUNTING_EXPORT_COLUMNS: readonly CsvColumn[] = [
  { key: "data", label: "Data" },
  { key: "numeroDocumento", label: "Numero documento" },
  { key: "codiceCausale", label: "Codice causale" },
  { key: "causale", label: "Causale" },
  { key: "descrizione", label: "Descrizione" },
  { key: "entrata", label: "Entrata" },
  { key: "uscita", label: "Uscita" },
  { key: "conto", label: "Conto" },
  { key: "metodo", label: "Metodo" },
  { key: "controparte", label: "Controparte" },
  { key: "tipoControparte", label: "Tipo controparte" },
  { key: "documento", label: "Documento" },
  { key: "classificazione", label: "Classificazione" },
  { key: "imponibile", label: "Imponibile IVA" },
  { key: "imposta", label: "IVA" },
  { key: "origine", label: "Origine" },
  { key: "annoFiscale", label: "Anno fiscale" },
  { key: "riconciliazione", label: "Riconciliazione" },
  { key: "stornatoIl", label: "Stornato il" },
  { key: "note", label: "Note" },
] as const;

/** Il nome con cui l'export si presenta. Non promette un documento. */
export const ACCOUNTING_EXPORT_TITLE = "Prima nota";

/* ========================================================================== */
/* I formati                                                                   */
/* ========================================================================== */

const testo = (value: unknown): string => {
  const raw = String(value ?? "").trim();
  return raw;
};

/**
 * La data in forma italiana, letta in **UTC**.
 *
 * `dd/mm/aaaa` perche e cio che l'Excel italiano riconosce come data vera: una
 * colonna di date che resta testo non si ordina e non si filtra per mese, che
 * e la prima cosa che chi riceve il file prova a fare.
 *
 * L'UTC non e pedanteria: `fiscalYearOfEntry` deriva l'anno fiscale con
 * `getUTCFullYear`, e un movimento del primo gennaio letto nel fuso locale
 * uscirebbe datato 31 dicembre accanto a un anno fiscale che dice l'anno dopo.
 * Due colonne dello stesso file si contraddirebbero.
 */
export const formatExportDate = (value: unknown): string => {
  const raw = testo(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
};

/**
 * L'importo in euro, **oppure la cella vuota**.
 *
 * Esce un `number`: la conversione a virgola decimale la fa `csvValue`, che e
 * il proprietario del tracciato, e un numero scritto qui come stringa
 * «12,50» sarebbe la quarta implementazione della stessa regola.
 *
 * **Vuoto e non zero.** In una riga di entrata la colonna «Uscita» non vale
 * zero: non c'e. Uno zero in quella cella verrebbe sommato, contato fra i
 * movimenti e mostrato in un grafico come un'uscita che non e mai avvenuta.
 */
const euro = (cents: unknown): number | null => {
  if (cents === null || cents === undefined) return null;
  const parsed = Number(cents);
  if (!Number.isFinite(parsed)) return null;
  return fromCents(parsed);
};

/**
 * Il verso decide **quale** delle due colonne porta l'importo, e il valore
 * assoluto garantisce che nessuna delle due porti un segno.
 *
 * `Math.abs` non e difensivismo: le righe proiettate arrivano da domini che
 * usano il segno per distinguere uno storno (`payment_transactions` scrive
 * importi negativi), e la proiezione lo normalizza gia. Se un giorno un
 * dominio nuovo se ne dimenticasse, il file non mostrerebbe comunque un
 * «-120,00» in una colonna di uscite.
 */
const importoDelVerso = (
  line: AccountingExportLine,
  direction: "IN" | "OUT",
): number | null =>
  line.direction === direction ? euro(Math.abs(Number(line.amountCents) || 0)) : null;

const ETICHETTE_DOCUMENTO: Record<string, string> = {
  invoice: "Fattura",
  fattura: "Fattura",
  receipt: "Ricevuta",
  ricevuta: "Ricevuta",
};

const etichettaDocumento = (line: AccountingExportLine): string => {
  const dichiarata = testo(line.documentLabel);
  if (dichiarata) return dichiarata;
  const kind = testo(line.documentKind);
  if (!kind) return "";
  return ETICHETTE_DOCUMENTO[kind.toLowerCase()] || kind;
};

/* ========================================================================== */
/* Dalla riga alla riga del foglio                                             */
/* ========================================================================== */

/**
 * Una riga di prima nota diventa una riga del foglio.
 *
 * Esportata perche sia collaudabile da sola: e qui che si decide cosa una
 * cella dice, e una regressione su una cella e piu facile da leggere di una
 * regressione su un file intero.
 */
export const toAccountingExportRow = (
  line: AccountingExportLine,
): Record<string, unknown> => ({
  data: formatExportDate(line.entryDate),
  numeroDocumento: testo(line.documentNumber),
  codiceCausale: testo(line.operationTypeCode),
  causale: testo(line.operationTypeLabel),
  descrizione: testo(line.description),
  entrata: importoDelVerso(line, "IN"),
  uscita: importoDelVerso(line, "OUT"),
  conto: testo(line.financialAccountName),
  metodo: testo(line.paymentMethod),
  /*
    L'etichetta **congelata**, e non il nome che quella persona ha adesso in
    anagrafica: il movimento deve poter dire a chi si riferiva anche dopo che
    la scheda e stata corretta o cancellata. E la stessa scelta dello snapshot
    di un documento fiscale.
  */
  controparte: testo(line.counterpartyLabel),
  tipoControparte: line.counterpartyKind
    ? COUNTERPARTY_KIND_LABELS[line.counterpartyKind] || testo(line.counterpartyKind)
    : "",
  documento: etichettaDocumento(line),
  /*
    `activityScope` sulla riga **e** lo snapshot: la prima nota lo legge da
    `activity_scope_snapshot` e la proiezione preferisce il congelato al
    corrente. Qui non si consulta nessun catalogo, e non si puo: questa
    funzione riceve una riga e nient'altro.
  */
  classificazione: ACTIVITY_SCOPE_LABELS[line.activityScope] || "",
  imponibile: euro(line.taxableCents),
  imposta: euro(line.vatCents),
  origine: SOURCE_DOMAIN_LABELS[line.sourceDomain] || testo(line.sourceDomain),
  annoFiscale: Number.isFinite(Number(line.fiscalYear))
    ? Number(line.fiscalYear)
    : "",
  riconciliazione:
    RECONCILIATION_STATUS_LABELS[line.reconciliationStatus] ||
    testo(line.reconciliationStatus),
  stornatoIl: formatExportDate(line.reversedAt),
  note: testo(line.notes),
});

/* ========================================================================== */
/* Il file                                                                     */
/* ========================================================================== */

export type AccountingExportResult = {
  /** Il testo del file, **BOM compreso**: e destinato a un doppio clic. */
  csv: string;
  /** Il nome proposto, gia ripulito: minuscolo, senza accenti, con la data. */
  fileName: string;
  /** Quante righe di dati, intestazione esclusa. */
  rowCount: number;
  /** Le colonne, per chi deve dichiararle a chi riceve il file. */
  columns: readonly CsvColumn[];
};

/**
 * Il CSV dell'export contabile.
 *
 * **Il BOM e dentro il testo**, e non aggiunto dal browser al momento del
 * salvataggio: questo file nasce da una risposta HTTP e puo essere salvato
 * dall'utente, ripreso da uno script o inoltrato per posta. Senza BOM nel
 * corpo, chi lo apre su Excel in Windows legge «NicolÃ²». La riconciliazione
 * dei bandi resta senza BOM ed e giusto cosi: quel CSV lo consuma un
 * programma, questo lo apre una persona.
 *
 * **L'intestazione c'e anche a zero righe** — e `toCsv` a garantirlo: un file
 * vuoto senza intestazione non si distingue da un export fallito, e chi lo
 * riceve non saprebbe se il periodo era vuoto o se qualcosa e andato storto.
 */
export const buildAccountingExportCsv = (
  lines: readonly AccountingExportLine[],
  options: { fileNameBase?: string; generatedAt?: Date } = {},
): AccountingExportResult => {
  const base = assertNoOfficialClaim(
    String(options.fileNameBase || ACCOUNTING_EXPORT_TITLE),
    "nome del file dell'export",
  );

  for (const column of ACCOUNTING_EXPORT_COLUMNS) {
    assertNoOfficialClaim(column.label, "intestazione di colonna dell'export");
  }

  const righe = lines.map(toAccountingExportRow);

  return {
    csv: withCsvBom(toCsv(ACCOUNTING_EXPORT_COLUMNS, righe)),
    fileName: csvFileName(base, options.generatedAt),
    rowCount: righe.length,
    columns: ACCOUNTING_EXPORT_COLUMNS,
  };
};
