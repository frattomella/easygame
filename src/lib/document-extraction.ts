import { parseScannedDocument, type DocumentScanResult } from "./document-scan";
import {
  isWellFormedCodiceFiscale,
  extractBelfioreCode,
} from "./italian-registry";
import { capitalizeName } from "./text-capitalization";

/**
 * Lettura di un documento: il contratto.
 *
 * **Cosa c'era gia** (Blocco 7, punto 15). L'OCR esiste da prima: `tesseract.js`
 * e una dipendenza, `document-scan.ts` sa estrarre cognome, nome, data e
 * numero da un documento d'identita italiano, e la scheda atleta ha un flusso
 * completo. Il problema non era che mancasse: era che viveva **dentro** una
 * pagina, e quindi esisteva solo per gli atleti.
 *
 * Questo modulo non riscrive il riconoscimento. Definisce il **contratto** fra
 * chi legge un documento e chi ne scrive i dati in un'anagrafica, cosi che
 * domani si possa cambiare il motore — un servizio esterno, un modello, una
 * libreria migliore — senza toccare nessun form.
 *
 * **La regola che non cambia mai: si propone, non si scrive.** Un OCR sbaglia,
 * e su un'anagrafica sportiva un dato sbagliato che nessuno ha confermato
 * finisce su un tesseramento. `DocumentExtractionResult` non e uno stato del
 * form: e una proposta che qualcuno deve accettare campo per campo.
 */

/** Un valore estratto, con quanta fiducia. */
export type ExtractedField = {
  value: string;
  /**
   * `high` quando il valore e stato trovato accanto alla sua etichetta o
   * verificato da un algoritmo (il codice fiscale ha un carattere di
   * controllo); `low` quando e stato dedotto.
   */
  confidence: "high" | "low";
  /** Etichetta da mostrare nell'anteprima. */
  label: string;
};

/** I campi anagrafici che una lettura puo produrre. */
export type ExtractedPersonFields = {
  firstName?: ExtractedField;
  lastName?: ExtractedField;
  birthDate?: ExtractedField;
  birthPlace?: ExtractedField;
  fiscalCode?: ExtractedField;
  nationality?: ExtractedField;
  documentType?: ExtractedField;
  documentNumber?: ExtractedField;
  documentIssue?: ExtractedField;
  documentExpiry?: ExtractedField;
  /** Codice catastale, quando ricavabile da un codice fiscale valido. */
  birthPlaceCode?: ExtractedField;
};

export type DocumentExtractionResult = {
  /** Chi ha prodotto il risultato: serve a saperlo nell'anteprima. */
  source: string;
  fields: ExtractedPersonFields;
  /** Testo grezzo: l'ultima risorsa quando l'estrazione non basta. */
  rawText: string;
  /** Vero quando non e stato ricavato nessun campo utilizzabile. */
  empty: boolean;
};

/**
 * Un motore di lettura.
 *
 * L'unica cosa che il resto dell'applicazione sa di un motore e questa firma.
 * Oggi ce n'e uno solo (OCR locale con `tesseract.js`); domani se ne puo
 * aggiungere un altro senza che nessun form se ne accorga.
 */
export type DocumentExtractionProvider = {
  id: string;
  label: string;
  /**
   * I tipi MIME che il motore sa leggere **davvero**.
   *
   * Dichiararlo fa parte del contratto perche il motore di oggi legge
   * immagini e non PDF, e un'interfaccia che accetta un PDF per poi fallire
   * e peggio di una che lo rifiuta subito dicendo perche.
   */
  accepts: string[];
  /** `dataUrl` di un file fra quelli dichiarati in `accepts`. */
  extract: (dataUrl: string) => Promise<DocumentExtractionResult>;
};

/**
 * Quanto puo pesare un documento da leggere: 8 MB.
 *
 * Non e un limite di archiviazione — il file non viene conservato — ma di
 * tempo: l'OCR gira **nel browser**, e su una foto da 20 MB scattata con un
 * telefono recente blocca la scheda per decine di secondi senza dare segno
 * di vita. Sopra questa soglia conviene chiedere una foto piu piccola.
 */
export const MAX_DOCUMENT_SCAN_BYTES = 8 * 1024 * 1024;

/** L'attributo `accept` di un motore, costruito dai tipi che dichiara. */
export const acceptAttributeFor = (provider: DocumentExtractionProvider) =>
  provider.accepts.join(",");

export type DocumentScanValidation =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Questo file si puo leggere?
 *
 * Le tre risposte negative sono diverse fra loro e vanno dette in modo
 * diverso: **troppo grande** si risolve con una foto piu piccola, **PDF** si
 * risolve con una fotografia della pagina, **altro formato** non si risolve.
 * Un unico messaggio «file non valido» lascia l'operatore a indovinare.
 */
export const validateDocumentForExtraction = (
  file: { type?: string | null; size?: number | null; name?: string | null },
  provider: DocumentExtractionProvider,
): DocumentScanValidation => {
  const size = Number(file?.size || 0);
  if (size > MAX_DOCUMENT_SCAN_BYTES) {
    return {
      ok: false,
      message: `L'immagine supera gli ${Math.round(
        MAX_DOCUMENT_SCAN_BYTES / (1024 * 1024),
      )} MB: la lettura avviene nel browser e un file cosi grande lo blocca. Riprova con una foto piu piccola.`,
    };
  }

  const type = String(file?.type || "").trim().toLowerCase();
  const name = String(file?.name || "").toLowerCase();

  /*
    Wave 6. Il PDF non si rifiuta piu **qui**, perche a questo punto non si
    sa ancora che PDF sia: quello prodotto da un telefono che «scansiona» e
    una fotografia dentro un contenitore, e quella si legge. Il rifiuto —
    con la stessa frase di prima — arriva dal motore, che il contenitore lo
    ha aperto e sa cosa c e dentro.

    Se il motore in uso i PDF non li dichiara affatto, li rifiuta il
    controllo sui formati qui sotto.
  */

  if (type && !provider.accepts.includes(type)) {
    return {
      ok: false,
      message:
        "Formato non leggibile. Accetto fotografie e scansioni in JPG, PNG, WEBP o HEIC.",
    };
  }

  return { ok: true };
};

const field = (
  label: string,
  value: string | undefined,
  confidence: "high" | "low" = "high",
): ExtractedField | undefined => {
  const trimmed = String(value || "").trim();
  return trimmed ? { value: trimmed, confidence, label } : undefined;
};

/**
 * Nome proprio letto da un documento.
 *
 * `capitalizeName` lascia stare le parole tutte maiuscole, perche di norma
 * sono sigle volute. Qui vale il contrario: un OCR di documento restituisce
 * **sempre** tutto maiuscolo, perche cosi e stampato sulla tessera. Si
 * abbassa prima, cosi `MARIO DE LUCA` diventa `Mario de Luca` e non resta un
 * urlo.
 */
const capitalizeFromDocument = (value?: string | null) =>
  capitalizeName(String(value || "").toLowerCase());

/**
 * Da risultato OCR grezzo a campi anagrafici.
 *
 * Due normalizzazioni, entrambe con una ragione:
 *
 * - nome e cognome passano da `capitalizeName`, perche l'OCR di un documento
 *   d'identita restituisce quasi sempre tutto maiuscolo, ed e cosi che
 *   stampato sul documento — ma non e cosi che si scrive in un elenco;
 * - il **codice catastale** si ricava dal codice fiscale solo se il codice ha
 *   il carattere di controllo giusto. Non si indovina mai (ADR-0027/0032).
 */
export const mapScanToPersonFields = (
  scan: DocumentScanResult,
): ExtractedPersonFields => {
  const fiscalCode = String(scan.fiscalCode || "").trim().toUpperCase();
  const fiscalCodeIsValid = isWellFormedCodiceFiscale(fiscalCode);
  const belfiore = fiscalCodeIsValid ? extractBelfioreCode(fiscalCode) : "";

  return {
    firstName: field("Nome", capitalizeFromDocument(scan.name)),
    lastName: field("Cognome", capitalizeFromDocument(scan.surname)),
    birthDate: field("Data di nascita", scan.birthDate),
    birthPlace: field("Comune di nascita", capitalizeFromDocument(scan.birthPlace)),
    nationality: field("Nazionalita", capitalizeFromDocument(scan.nationality)),
    // Un codice fiscale che non torna resta proposto, ma marcato: e comunque
    // un punto di partenza migliore di un campo vuoto, e chi conferma vede
    // l'avviso.
    fiscalCode: field(
      "Codice fiscale",
      fiscalCode,
      fiscalCodeIsValid ? "high" : "low",
    ),
    birthPlaceCode: field("Codice catastale", belfiore),
    documentType: field("Tipo documento", scan.documentType),
    documentNumber: field("Numero documento", scan.documentNumber),
    documentIssue: field("Data di rilascio", scan.documentIssue),
    documentExpiry: field("Scadenza documento", scan.documentExpiry),
  };
};

export const isExtractionEmpty = (fields: ExtractedPersonFields) =>
  Object.values(fields).every((entry) => !entry?.value);

/** Il risultato in forma di elenco, per l'anteprima. */
export const listExtractedFields = (
  fields: ExtractedPersonFields,
): Array<{ key: keyof ExtractedPersonFields } & ExtractedField> =>
  (Object.keys(fields) as Array<keyof ExtractedPersonFields>)
    .map((key) => {
      const entry = fields[key];
      return entry ? { key, ...entry } : null;
    })
    .filter(Boolean) as Array<{ key: keyof ExtractedPersonFields } & ExtractedField>;

/**
 * I soli campi accettati, pronti da fondere nello stato di un form.
 *
 * Non ritorna mai chiavi con valore vuoto: chi lo applica fa uno spread, e una
 * chiave vuota cancellerebbe un dato gia inserito a mano.
 */
export const acceptExtractedFields = (
  fields: ExtractedPersonFields,
  accepted: Array<keyof ExtractedPersonFields>,
): Record<string, string> => {
  const patch: Record<string, string> = {};

  for (const key of accepted) {
    const value = fields[key]?.value;
    if (value) patch[key] = value;
  }

  return patch;
};

/**
 * Costruisce un risultato dal testo grezzo di un OCR.
 *
 * Sta qui e non nel provider perche e la parte **pura**: si puo verificare
 * senza un browser e senza `tesseract.js`.
 */
export const buildExtractionFromText = (
  rawText: string,
  source: string,
): DocumentExtractionResult => {
  const scan = parseScannedDocument(rawText);
  const fields = mapScanToPersonFields(scan);

  return {
    source,
    fields,
    rawText: scan.rawText,
    empty: isExtractionEmpty(fields),
  };
};
