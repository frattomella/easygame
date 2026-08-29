/**
 * Un lettore di CSV per i test, con la semantica del tracciato di EasyGame:
 * separatore `;`, fine riga CRLF, celle virgolettate che possono contenere il
 * separatore, le virgolette e **i ritorni a capo**.
 *
 * **Perche un lettore vero e non uno `split`.** Lo scenario 42 del piano
 * chiede di provare che un importo con la virgola e una nota con un ritorno a
 * capo non spezzino una riga. Un test che dividesse il testo su `\r\n` e su
 * `;` fallirebbe **su un file corretto** — la cella virgolettata contiene per
 * definizione un ritorno a capo — e passerebbe su uno rotto, dove i ritorni a
 * capo sono liberi. Cioe proverebbe l'opposto di cio che deve provare.
 */

export const CSV_BOM = "\uFEFF";

/** Toglie il BOM, se c'e. Il file dell'export lo porta sempre. */
export const stripBom = (text) =>
  String(text || "").startsWith(CSV_BOM) ? String(text).slice(CSV_BOM.length) : String(text || "");

/** Il CSV come matrice di celle: `[intestazione, ...righe]`. */
export const parseCsv = (text, delimiter = ";") => {
  const source = stripBom(text);
  const righe = [];
  let cella = "";
  let riga = [];
  let dentroVirgolette = false;

  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];

    if (dentroVirgolette) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cella += '"';
          i += 1;
        } else {
          dentroVirgolette = false;
        }
      } else {
        cella += c;
      }
      continue;
    }

    if (c === '"') {
      dentroVirgolette = true;
      continue;
    }
    if (c === delimiter) {
      riga.push(cella);
      cella = "";
      continue;
    }
    if (c === "\r" && source[i + 1] === "\n") {
      riga.push(cella);
      righe.push(riga);
      riga = [];
      cella = "";
      i += 1;
      continue;
    }
    cella += c;
  }

  riga.push(cella);
  righe.push(riga);
  return righe;
};

/**
 * Le righe di dati come oggetti, con l'intestazione per chiave: un test che
 * cerca «Entrata» non deve conoscere la posizione della colonna.
 */
export const readCsvRows = (text, delimiter = ";") => {
  const [intestazione = [], ...dati] = parseCsv(text, delimiter);
  return dati.map((riga) =>
    Object.fromEntries(intestazione.map((label, indice) => [label, riga[indice] ?? ""])),
  );
};
