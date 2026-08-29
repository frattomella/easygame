/**
 * Il tracciato CSV di EasyGame, in un posto solo.
 *
 * ## Perche esiste
 *
 * Il CSV era gia stato scritto due volte — nella riconciliazione dei bandi e
 * nel pannello degli adempimenti — e le due versioni erano gia divergenti: una
 * metteva il BOM, l'altra no; una convertiva i decimali in virgola, l'altra
 * no; **nessuna delle due proteggeva il ritorno a capo `\r`**. Aggiungere qui
 * una terza copia per le anagrafiche avrebbe reso il difetto strutturale.
 *
 * Questo modulo e il **proprietario del tracciato**: separatore, fine riga,
 * quoting, BOM e nome del file. E puro — niente React, niente import server —
 * cosi si collauda senza montare una pagina.
 *
 * ## Le scelte, e il motivo di ciascuna
 *
 * - **Separatore `;`**: e cio che Excel in italiano apre senza chiedere
 *   niente. Con la virgola, un importo scritto `12,50` spaccherebbe la riga
 *   in due colonne.
 * - **Fine riga CRLF**: e quello che si aspettano Excel e LibreOffice su
 *   Windows, ed e cio che gia fa la riconciliazione.
 * - **Quoting su `;`, `"`, `\n` e `\r`**: il `\r` mancava alle due
 *   implementazioni precedenti. Un indirizzo incollato da Windows dentro una
 *   nota porta `\r\n`: senza virgolette quella riga si spezza in due, e chi
 *   apre il file trova una persona in piu che nessuno ha censito.
 */

/** Il punto e virgola: e cio che Excel in italiano legge senza chiedere. */
export const CSV_DELIMITER = ";";

/** CRLF: e la fine riga che Excel e LibreOffice si aspettano. */
export const CSV_EOL = "\r\n";

/** Byte Order Mark UTF-8. Vedi `buildCsvBlob`. */
export const CSV_BOM = "\uFEFF";

const NEEDS_QUOTES = /[";\r\n]/;

/**
 * Una cella che comincia per `=`, `+`, `-` o `@` la maggior parte dei fogli di
 * calcolo prova a valutarla come **formula**.
 *
 * Il contenuto di questi file arriva dall'anagrafica, che la compilano gli
 * utenti e che si popola anche per import: un cognome o una nota scritti
 * `=HYPERLINK("http://…";"clicca")` diventerebbero un collegamento eseguito
 * all'apertura, sul computer di chi riceve il file.
 *
 * La difesa e anteporre un apice. **Va detto che in un CSV importato l'apice si
 * vede**: non e invisibile come in una cella digitata a mano. E quindi una
 * difesa che sporca la cella, e va applicata dove serve davvero e non a
 * tappeto:
 *
 * - `=` e `@` aprono una formula da soli, e nessun dato di anagrafica comincia
 *   cosi per caso: si neutralizzano sempre;
 * - `+` e `-` cominciano molto piu spesso un **numero di telefono**
 *   (`+39 333 …`) o un importo negativo che una formula. Si neutralizzano solo
 *   quando il valore somiglia davvero a una formula: contiene una parentesi,
 *   un `=` o un `!` (`+HYPERLINK(...)`), oppure il segno e seguito da una
 *   **lettera** (`-A1+B2`), che dopo un prefisso internazionale non capita mai;
 * - la tabulazione e il ritorno a capo in testa si tolgono di mezzo comunque.
 *
 * Un numero non passa di qui: `csvValue` lo formatta prima, quindi `-12,50` in
 * una colonna di importi resta un importo.
 */
const FORMULA_LEAD_SEMPRE = /^[=@\t\r]/;
const FORMULA_LEAD_SEGNO = /^[+-]/;
const SEMBRA_UNA_FORMULA = /[()=!]|^[+-]\s*[A-Za-z]/;

const neutralizeFormula = (text: string) => {
  if (FORMULA_LEAD_SEMPRE.test(text)) return `'${text}`;
  if (FORMULA_LEAD_SEGNO.test(text) && SEMBRA_UNA_FORMULA.test(text)) {
    return `'${text}`;
  }
  return text;
};

/**
 * Un valore dentro una cella, con le virgolette quando servono.
 *
 * `String(value ?? "")`: un campo assente e una cella vuota, non la parola
 * «null» in mezzo a un'anagrafica.
 */
const quote = (text: string) =>
  NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

export const csvEscape = (value: unknown): string =>
  quote(neutralizeFormula(String(value ?? "")));

/**
 * Come `csvEscape`, ma i numeri escono con la **virgola decimale**.
 *
 * Un `12.5` scritto col punto, in un foglio italiano, non e un numero: e
 * testo, e non si somma. La conversione sta qui e non nei chiamanti perche
 * era gia stata dimenticata una volta.
 */
export const csvValue = (value: unknown): string =>
  typeof value === "number"
    ? // Un numero non passa dalla neutralizzazione delle formule: un importo
      // negativo comincia per `-` e resterebbe testo in una colonna di importi.
      quote(String(value).replace(".", ","))
    : csvEscape(value);

export type CsvColumn = { key: string; label: string };

/**
 * Righe e colonne in un testo CSV.
 *
 * **L'intestazione c'e sempre**, anche a zero righe: un file vuoto senza
 * intestazione non si distingue da un export fallito.
 */
export const toCsv = (
  columns: readonly CsvColumn[],
  rows: readonly Record<string, unknown>[],
): string => {
  const lines = [
    columns.map((column) => csvEscape(column.label)).join(CSV_DELIMITER),
  ];

  for (const row of rows) {
    lines.push(
      columns.map((column) => csvValue(row[column.key])).join(CSV_DELIMITER),
    );
  }

  return lines.join(CSV_EOL);
};

/**
 * Il testo con il BOM in testa, **una volta sola**.
 *
 * L'idempotenza non e eleganza: il CSV della contabilita nasce sul server gia
 * completo di BOM — la risposta HTTP viene salvata da chi la riceve, e senza
 * BOM in quel corpo un doppio clic su Excel mostrerebbe «NicolÃ²» — e poi
 * passa comunque da `downloadCsv` nel browser. Senza questo controllo il file
 * porterebbe **due** BOM, e il secondo si vedrebbe dentro la prima cella
 * dell'intestazione.
 */
export const withCsvBom = (text: string): string =>
  text.startsWith(CSV_BOM) ? text : `${CSV_BOM}${text}`;

/**
 * Il testo CSV pronto da scaricare, **con il BOM in testa**.
 *
 * Il BOM e cio che dice a Excel «questo file e UTF-8». Senza, Excel su
 * Windows apre il file con la codepage locale e «Nicolo» diventa «NicolÃ²»:
 * un'anagrafica illeggibile. LibreOffice il BOM lo ignora, quindi non costa
 * niente.
 *
 * **La risposta HTTP della riconciliazione dei bandi non ce l'ha, e resta
 * cosi**: quel CSV lo consuma un programma, non un foglio di calcolo, e il
 * BOM sarebbe un carattere spurio all'inizio del primo campo. Il BOM serve al
 * download del browser, non al trasporto.
 */
export const buildCsvBlob = (text: string): Blob =>
  new Blob([withCsvBom(text)], { type: "text/csv;charset=utf-8;" });

/**
 * Fa scaricare il CSV al browser.
 *
 * Ritorna `false` fuori dal browser (render server) invece di lanciare: chi
 * chiama e un gestore di click, e un'eccezione li diventa una pagina bianca.
 */
export const downloadCsv = (fileName: string, text: string): boolean => {
  if (typeof window === "undefined") return false;

  const url = URL.createObjectURL(buildCsvBlob(text));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  return true;
};

/**
 * Il nome del file: slug minuscolo e data, es. `elenco-atleti-2026-08-28.csv`.
 *
 * La data e **quella locale**, non UTC: chi esporta alle 23:30 non vuole
 * trovarsi in mano il file di domani.
 */
export const csvFileName = (
  base: string,
  generatedAt: Date = new Date(),
): string => {
  const slug =
    base
      .normalize("NFD")
      // Toglie i segni diacritici: un nome file con l'accento viaggia male.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export";

  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${generatedAt.getFullYear()}-${pad(generatedAt.getMonth() + 1)}-${pad(generatedAt.getDate())}`;

  return `${slug}-${day}.csv`;
};
