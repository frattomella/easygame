/**
 * L'import delle conferme di maturazione (ADR-0054).
 *
 * **Perche esiste, e perche e piccolo.** Quando la fonte ufficiale della
 * frequenza e una piattaforma dell'ente, le conferme arrivano in blocco: un
 * foglio con un periodo e un importo per riga, scaricato da li. Confermarle a
 * mano una per una su duecento beneficiari e il modo piu rapido perche
 * nessuno le confermi affatto.
 *
 * **Perche non e un'integrazione.** Non esiste, oggi, nessun ente con una API
 * pubblica che EasyGame possa chiamare. Costruire un client verso un
 * endpoint immaginario vorrebbe dire scrivere codice che non e mai stato
 * eseguito contro niente, e chiamarlo «integrazione». Qui c'e un parser di
 * cinque colonne, che si legge in un minuto e si prova con un file vero.
 *
 * Il tracciato e lo stesso della riconciliazione in uscita — punto e virgola,
 * virgola decimale — cosi il file che il club esporta e quello che rimanda
 * indietro hanno la stessa forma.
 *
 *     periodo;importo;riferimento;note
 *     ottobre 2026;60,00;PROT-2026-114;
 *     novembre 2026;0,00;PROT-2026-114;requisito non raggiunto
 *
 * Modulo **puro**: non conosce Prisma e non decide niente: dice solo cosa il
 * file contiene e quali righe non si possono leggere.
 */

const asText = (value: unknown) => String(value ?? "").trim();

/** Un importo scritto all'italiana — `1.234,50` — o all'inglese. */
export const parseImportedAmount = (value: unknown): number | null => {
  const raw = asText(value).replace(/[€\s]/g, "");
  if (!raw) return null;

  /*
    `1.234,50` e `1234.50` sono lo stesso numero scritto da due paesi. Si
    distinguono da quale separatore compare per ultimo: quello e il decimale.
  */
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const normalized =
    lastComma > lastDot
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

export type ImportedConfirmation = {
  /** Il periodo com'e scritto nel file: un'etichetta o un indice. */
  period: string;
  amount: number;
  externalReference: string;
  notes: string;
  /** La riga del file, per poter dire **dove** sta un errore. */
  line: number;
};

export type ConfirmationImportResult = {
  rows: ImportedConfirmation[];
  /** Le righe scartate, con il motivo: si mostrano, non si ingoiano. */
  rejected: Array<{ line: number; content: string; reason: string }>;
};

const HEADER_TOKENS = ["periodo", "period", "mese"];

const splitLine = (line: string) => {
  const separator = line.includes(";") ? ";" : line.includes("\t") ? "\t" : ";";
  return line.split(separator).map((cell) => asText(cell));
};

/**
 * Legge il testo di un file di conferme.
 *
 * Una riga illeggibile non interrompe l'import e non sparisce: finisce in
 * `rejected` con il suo numero di riga. Un import che scarta in silenzio e
 * peggio di un import che fallisce, perche il totale sembra giusto.
 */
export const parseConfirmationImport = (
  text: unknown,
): ConfirmationImportResult => {
  const rows: ImportedConfirmation[] = [];
  const rejected: ConfirmationImportResult["rejected"] = [];

  const lines = asText(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/^﻿/, ""));

  lines.forEach((raw, index) => {
    const line = index + 1;
    const content = raw.trim();
    if (!content) return;

    const cells = splitLine(content);
    const period = asText(cells[0]);

    if (!period) {
      rejected.push({ line, content, reason: "Periodo mancante" });
      return;
    }

    // L'intestazione e facoltativa: se c'e, si riconosce e si salta.
    if (index === 0 && HEADER_TOKENS.includes(period.toLowerCase())) {
      return;
    }

    const amount = parseImportedAmount(cells[1]);
    if (amount === null) {
      rejected.push({
        line,
        content,
        reason: "Importo non leggibile",
      });
      return;
    }

    if (amount < 0) {
      rejected.push({
        line,
        content,
        reason: "Un importo confermato non puo essere negativo",
      });
      return;
    }

    rows.push({
      period,
      amount,
      externalReference: asText(cells[2]),
      notes: asText(cells[3]),
      line,
    });
  });

  return { rows, rejected };
};

/**
 * Collega ogni riga del file al periodo giusto.
 *
 * Il file puo dire «ottobre 2026» o «3»: la prima forma e quella che l'ente
 * usa nei suoi prospetti, la seconda quella che esce da un export. Si
 * accettano entrambe, e una riga che non trova il suo periodo resta un
 * problema **dichiarato**, non una conferma mancante e silenziosa.
 */
export const matchConfirmationsToPeriods = ({
  rows,
  periods,
}: {
  rows: readonly ImportedConfirmation[];
  periods: ReadonlyArray<{ index: number; label: string }>;
}) => {
  const byLabel = new Map(
    periods.map((period) => [asText(period.label).toLowerCase(), period.index]),
  );
  const byIndex = new Set(periods.map((period) => period.index));

  const matched: Array<ImportedConfirmation & { periodIndex: number }> = [];
  const unmatched: ImportedConfirmation[] = [];

  rows.forEach((row) => {
    const label = row.period.toLowerCase();
    const fromLabel = byLabel.get(label);

    if (fromLabel !== undefined) {
      matched.push({ ...row, periodIndex: fromLabel });
      return;
    }

    const asIndex = Number.parseInt(row.period, 10);
    if (Number.isFinite(asIndex) && byIndex.has(asIndex)) {
      matched.push({ ...row, periodIndex: asIndex });
      return;
    }

    unmatched.push(row);
  });

  return { matched, unmatched };
};
