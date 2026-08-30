/**
 * La **preparazione del tracciato FatturaPA**: dal documento all'XML.
 *
 * **Cosa fa e cosa non fa.** Produce il file `FatturaElettronica` in versione
 * `FPR12` a partire da una fattura gia emessa, dal profilo fiscale
 * dell'emittente e dai dati dell'intestatario. Non lo firma, non lo trasmette e
 * non lo dichiara valido presso lo SdI: la validazione qui e **formale** —
 * campi obbligatori presenti, lunghezze rispettate, importi coerenti — ed e
 * cio che si puo verificare senza un intermediario.
 *
 * **Perche l'XML si scrive a mano.** Il tracciato e un documento con un ordine
 * fisso di elementi, e una libreria che lo generasse ci metterebbe in mezzo il
 * proprio modello di dati: il giorno in cui la specifica cambia — succede — ci
 * si troverebbe a discutere con la libreria invece che con la specifica. Qui
 * l'ordine degli elementi si legge nell'ordine in cui sono scritti.
 *
 * **La riserva che questo file dichiara apertamente.** Il tracciato prodotto e
 * scritto sulla specifica pubblica e **non e mai stato accettato dallo SdI**,
 * perche non esiste un canale verso lo SdI in questo repository. Va considerato
 * *da collaudare*, non funzionante. Il primo invio reale trovera differenze:
 * e normale, ed e il motivo per cui `EInvoiceTransmission` non puo superare
 * `ready_to_send`. Vedi ADR-0053.
 *
 * Modulo **puro**: nessuna rete, nessun database.
 */

import type { FiscalProfile } from "../fiscal-profile";
import { missingForEInvoicing } from "../fiscal-profile";

/* ------------------------------------------------------------- ingressi */

export type EInvoiceLine = {
  description: string;
  quantity: number;
  /** Prezzo unitario in centesimi. */
  unitPriceCents: number;
  /** Aliquota in percentuale. `null` quando l'operazione non e imponibile. */
  vatRate: number | null;
  /** Natura IVA (`N2.2`, `N4`, ...), obbligatoria quando l'aliquota e zero. */
  vatNature?: string | null;
  /**
   * **L'imposta congelata sul documento, quando c'e.**
   *
   * Senza, il tracciato la ricalcolava come `imponibile x aliquota`. Ma il
   * documento l'imposta la ricava **per differenza** dal totale incassato —
   * `splitVatFromTotal` — e le due strade non danno lo stesso centesimo su
   * circa meta degli importi al 22%. Su una fattura da 10,01 euro il tracciato
   * dichiarava `<ImportoTotaleDocumento>10.00`: un file che contraddice la
   * fattura che rappresenta, e che si dichiarava formalmente valido.
   *
   * Quando l'imposta e nota, si usa quella. Il tracciato deve dire cio che il
   * documento dice, non cio che il documento avrebbe potuto dire.
   */
  vatAmountCents?: number | null;
};

export type EInvoiceRecipient = {
  name: string;
  fiscalCode?: string | null;
  vatNumber?: string | null;
  /** `0000000` quando si consegna via PEC. */
  recipientCode?: string | null;
  pec?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  country?: string | null;
  /** Vero per una persona fisica: cambia il blocco anagrafico del tracciato. */
  isNaturalPerson?: boolean;
  firstName?: string | null;
  lastName?: string | null;
};

export type EInvoiceDocument = {
  /** `TD01` (fattura), `TD04` (nota di credito), ... */
  documentType: string;
  number: string;
  /** `YYYY-MM-DD`. */
  date: string;
  currency: "EUR";
  lines: EInvoiceLine[];
  /** Il bollo, quando il profilo lo prevede. */
  stampDutyCents?: number;
  paymentMethodCode?: string;
  notes?: string | null;
};

/* --------------------------------------------------------- validazione */

export type EInvoiceIssue = { path: string; message: string };

const asText = (value: unknown) => String(value ?? "").trim();

const RECIPIENT_CODE_PATTERN = /^[A-Z0-9]{7}$/;

/**
 * Cosa impedisce di preparare il tracciato.
 *
 * **Perche il codice destinatario e la PEC sono in alternativa e non entrambi
 * obbligatori.** Lo SdI consegna in due modi: al codice destinatario di chi ha
 * un canale accreditato, oppure alla PEC. Pretenderli entrambi renderebbe
 * impossibile fatturare a un privato, che di solito non ha ne l'uno ne
 * l'altra — e per il quale il tracciato prevede `0000000`.
 */
export const validateEInvoice = (input: {
  profile: FiscalProfile;
  document: EInvoiceDocument;
  recipient: EInvoiceRecipient;
}): EInvoiceIssue[] => {
  const issues: EInvoiceIssue[] = [];

  for (const missing of missingForEInvoicing(input.profile)) {
    issues.push({
      path: "profile",
      message: `Dati dell'emittente incompleti: manca ${missing}.`,
    });
  }

  if (!asText(input.recipient?.name)) {
    issues.push({ path: "recipient.name", message: "Manca l'intestatario." });
  }

  if (
    !asText(input.recipient?.fiscalCode) &&
    !asText(input.recipient?.vatNumber)
  ) {
    issues.push({
      path: "recipient.fiscalCode",
      message: "L'intestatario deve avere codice fiscale o partita IVA.",
    });
  }

  const recipientCode = asText(input.recipient?.recipientCode).toUpperCase();
  const pec = asText(input.recipient?.pec);

  if (recipientCode && !RECIPIENT_CODE_PATTERN.test(recipientCode)) {
    issues.push({
      path: "recipient.recipientCode",
      message: "Il codice destinatario ha esattamente sette caratteri.",
    });
  }

  if (!recipientCode && !pec) {
    issues.push({
      path: "recipient.recipientCode",
      message:
        "Serve il codice destinatario oppure la PEC. Per un privato senza canale si usa 0000000.",
    });
  }

  for (const field of ["address", "city", "postalCode", "province"] as const) {
    if (!asText(input.recipient?.[field])) {
      const labels = {
        address: "indirizzo",
        city: "comune",
        postalCode: "CAP",
        province: "provincia",
      };
      issues.push({
        path: `recipient.${field}`,
        message: `Manca ${labels[field]} dell'intestatario.`,
      });
    }
  }

  if (!input.document?.lines?.length) {
    issues.push({
      path: "document.lines",
      message: "Il documento non ha righe.",
    });
  }

  input.document?.lines?.forEach((line, index) => {
    if (!asText(line.description)) {
      issues.push({
        path: `document.lines.${index}.description`,
        message: "Ogni riga deve avere una descrizione.",
      });
    }

    /*
      Aliquota zero senza natura IVA e lo scarto piu comune dello SdI: il
      tracciato vuole sapere *perche* non c'e IVA, e «non c'e» non e una
      risposta ammessa. Lo si dice qui, dove si puo ancora rimediare.
    */
    if ((line.vatRate === null || line.vatRate === 0) && !asText(line.vatNature)) {
      issues.push({
        path: `document.lines.${index}.vatNature`,
        message:
          "Con aliquota zero serve la natura IVA (per esempio N2.2 o N4): lo SdI non accetta un'assenza senza motivo.",
      });
    }

    /*
      **E il contrario, che nessuno controllava.** La natura IVA dice *perche*
      l'operazione non e imponibile: dichiararla insieme a un'aliquota positiva
      significa dire due cose che si escludono, e lo SdI scarta il file. La
      configurazione che lo produce e legittima — una causale puo avere
      aliquota 22 e una natura scritta per errore — quindi il rilievo va detto
      qui, dove si puo ancora rimediare, invece di scoprirlo dallo scarto.
    */
    if (Number(line.vatRate) > 0 && asText(line.vatNature)) {
      issues.push({
        path: `document.lines.${index}.vatNature`,
        message:
          "Un'aliquota maggiore di zero e una natura IVA insieme si escludono: la natura dice perche l'IVA non si applica. Correggi la causale.",
      });
    }
  });

  /*
    **Il bollo dichiarato ma non addebitato.**

    Il bollo entra in `<ImportoTotaleDocumento>`; se il documento non lo ha
    addebitato — e l'importo del documento e l'incasso, che il bollo non lo
    contiene — il tracciato dichiara al Sistema di Interscambio un totale
    diverso da quello che la famiglia ha pagato. E il caso tipico di una ASD:
    aliquota zero e bollo da due euro.
  */
  const bollo = Math.round(Number(input.document?.stampDutyCents) || 0);
  if (bollo > 0) {
    issues.push({
      path: "document.stampDutyCents",
      message:
        "Il bollo entra nel totale del tracciato: verifica che sia stato addebitato anche sul documento, altrimenti l'XML dichiara una cifra diversa da quella incassata.",
    });
  }

  return issues;
};

/* ------------------------------------------------------------ scrittura */

/**
 * Le cinque entita che XML riserva.
 *
 * Scritte a mano perche il tracciato porta ragioni sociali e indirizzi
 * italiani, e una `&` in «Rossi & Figli» rompe il file senza che nessuno se ne
 * accorga finche lo SdI non lo scarta.
 */
const escapeXml = (value: unknown) =>
  asText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Il tracciato vuole i decimali con il punto e due cifre. */
const money = (cents: number) => (Math.round(Number(cents) || 0) / 100).toFixed(2);

const el = (name: string, value: unknown) => {
  const text = escapeXml(value);
  return text ? `<${name}>${text}</${name}>` : "";
};

const compact = (parts: Array<string | null | undefined>) =>
  parts.filter((part) => Boolean(part && part.trim())).join("");

const lineTotalCents = (line: EInvoiceLine) =>
  Math.round(Number(line.quantity || 0) * Number(line.unitPriceCents || 0));

/**
 * Il nome del file secondo la convenzione dello SdI:
 * `IT01234567890_00001.xml`.
 *
 * Il progressivo e alfanumerico in base 36 e non decimale: cinque caratteri
 * decimali si esauriscono a centomila documenti, e un emittente che li
 * esaurisce si trova con un nome file duplicato, che lo SdI rifiuta.
 */
export const buildEInvoiceFileName = (input: {
  country: string;
  identifier: string;
  progressive: number;
}) => {
  const country = asText(input.country).toUpperCase() || "IT";
  const identifier = asText(input.identifier).toUpperCase();
  const progressive = Math.max(1, Math.trunc(Number(input.progressive) || 1));

  return `${country}${identifier}_${progressive
    .toString(36)
    .toUpperCase()
    .padStart(5, "0")}.xml`;
};

export type BuiltEInvoice = {
  xml: string;
  fileName: string;
  totalCents: number;
  issues: EInvoiceIssue[];
  /** Vero solo se non ci sono rilievi formali. Non dice «lo SdI l'accettera». */
  formallyValid: boolean;
};

/**
 * Prepara il tracciato.
 *
 * Restituisce **sempre** l'XML, anche quando ci sono rilievi: un file
 * incompleto che si puo leggere aiuta chi deve capire cosa manca molto piu di
 * un errore che non produce niente. Quel che i rilievi impediscono e il
 * passaggio a `ready_to_send`, non la generazione.
 */
export const buildEInvoiceXml = (input: {
  profile: FiscalProfile;
  document: EInvoiceDocument;
  recipient: EInvoiceRecipient;
  progressive: number;
}): BuiltEInvoice => {
  const issues = validateEInvoice(input);
  const { profile, document, recipient } = input;

  /*
    **Il totale del documento comprende l'imposta.** (difetto latente chiuso
    dalla Wave 4)

    Prima era la somma delle righe piu il bollo, e basta: con una riga da
    1.000 EUR al 22% il tracciato dichiarava `<ImportoTotaleDocumento>1000.00`
    mentre il `<DatiRiepilogo>` accanto esponeva 220 EUR di imposta. Il
    documento contraddiceva se stesso.

    Non si manifestava **solo perche** l'unica classificazione raggiungibile
    aveva `vat_rate = null`, trattato come zero: ogni documento nasceva senza
    IVA. Nel momento in cui la Wave 4 rende raggiungibile una causale con
    un'aliquota, il difetto diventa attivo — e un file sbagliato scaricato e
    dato al commercialista e un danno reale, anche senza trasmissione.

    L'imposta si calcola **per riepilogo** e non riga per riga, con lo stesso
    arrotondamento del `<DatiRiepilogo>`: sommare imposte arrotondate riga per
    riga darebbe un totale diverso da quello che il documento stesso dichiara.
  */
  const taxableCents = document.lines.reduce(
    (sum, line) => sum + lineTotalCents(line),
    0,
  );
  const stampDutyCents = Math.max(
    0,
    Math.round(Number(document.stampDutyCents) || 0),
  );

  const transmitterIdentifier = profile.vatNumber || profile.fiscalCode;
  const fileName = buildEInvoiceFileName({
    country: profile.country || "IT",
    identifier: transmitterIdentifier,
    progressive: input.progressive,
  });

  const recipientCode = asText(recipient.recipientCode).toUpperCase() || "0000000";

  /* Le righe raggruppate per aliquota: il riepilogo ne vuole una per aliquota. */
  const summaries = new Map<
    string,
    { rate: number; nature: string; taxableCents: number; vatCents: number | null }
  >();
  for (const line of document.lines) {
    const rate = line.vatRate === null ? 0 : Number(line.vatRate) || 0;
    const nature = asText(line.vatNature);
    const key = `${rate}|${nature}`;
    const current =
      summaries.get(key) || { rate, nature, taxableCents: 0, vatCents: null };
    current.taxableCents += lineTotalCents(line);

    /*
      **L'imposta dichiarata vince su quella ricalcolata.** Il documento la
      ricava per differenza dal totale incassato; ricalcolarla come
      `imponibile x aliquota` da un centesimo diverso su circa meta degli
      importi al 22%, e il tracciato finiva per contraddire la fattura che
      rappresenta.
    */
    if (line.vatAmountCents !== null && line.vatAmountCents !== undefined) {
      current.vatCents =
        (current.vatCents ?? 0) + Math.round(Number(line.vatAmountCents) || 0);
    }
    summaries.set(key, current);
  }

  /* L'imposta di ogni riepilogo: quella dichiarata, o quella dell'aliquota. */
  const vatOf = (summary: {
    rate: number;
    taxableCents: number;
    vatCents: number | null;
  }) =>
    summary.vatCents !== null
      ? summary.vatCents
      : Math.round((summary.taxableCents * summary.rate) / 100);

  const vatCents = Array.from(summaries.values()).reduce(
    (sum, summary) => sum + vatOf(summary),
    0,
  );

  const totalCents = taxableCents + vatCents + stampDutyCents;

  const header = compact([
    "<FatturaElettronicaHeader>",
    "<DatiTrasmissione>",
    "<IdTrasmittente>",
    el("IdPaese", profile.country || "IT"),
    el("IdCodice", transmitterIdentifier),
    "</IdTrasmittente>",
    el("ProgressivoInvio", input.progressive.toString(36).toUpperCase()),
    el("FormatoTrasmissione", "FPR12"),
    el("CodiceDestinatario", recipientCode),
    recipientCode === "0000000" && recipient.pec
      ? el("PECDestinatario", recipient.pec)
      : "",
    "</DatiTrasmissione>",
    "<CedentePrestatore>",
    "<DatiAnagrafici>",
    profile.vatNumber
      ? compact([
          "<IdFiscaleIVA>",
          el("IdPaese", profile.country || "IT"),
          el("IdCodice", profile.vatNumber),
          "</IdFiscaleIVA>",
        ])
      : "",
    profile.fiscalCode ? el("CodiceFiscale", profile.fiscalCode) : "",
    compact(["<Anagrafica>", el("Denominazione", profile.legalName), "</Anagrafica>"]),
    el("RegimeFiscale", profile.taxRegimeCode),
    "</DatiAnagrafici>",
    "<Sede>",
    el("Indirizzo", profile.address),
    el("CAP", profile.postalCode),
    el("Comune", profile.city),
    el("Provincia", profile.province),
    el("Nazione", profile.country || "IT"),
    "</Sede>",
    profile.reaNumber
      ? compact([
          "<IscrizioneREA>",
          el("Ufficio", profile.reaOffice),
          el("NumeroREA", profile.reaNumber),
          profile.reaCapital !== null
            ? el("CapitaleSociale", (profile.reaCapital || 0).toFixed(2))
            : "",
          profile.reaSoleShareholder !== null
            ? el("SocioUnico", profile.reaSoleShareholder ? "SU" : "SM")
            : "",
          el("StatoLiquidazione", profile.reaInLiquidation ? "LS" : "LN"),
          "</IscrizioneREA>",
        ])
      : "",
    "</CedentePrestatore>",
    "<CessionarioCommittente>",
    "<DatiAnagrafici>",
    recipient.vatNumber
      ? compact([
          "<IdFiscaleIVA>",
          el("IdPaese", recipient.country || "IT"),
          el("IdCodice", recipient.vatNumber),
          "</IdFiscaleIVA>",
        ])
      : "",
    recipient.fiscalCode ? el("CodiceFiscale", recipient.fiscalCode) : "",
    "<Anagrafica>",
    recipient.isNaturalPerson && recipient.lastName
      ? compact([el("Nome", recipient.firstName), el("Cognome", recipient.lastName)])
      : el("Denominazione", recipient.name),
    "</Anagrafica>",
    "</DatiAnagrafici>",
    "<Sede>",
    el("Indirizzo", recipient.address),
    el("CAP", recipient.postalCode),
    el("Comune", recipient.city),
    el("Provincia", recipient.province),
    el("Nazione", recipient.country || "IT"),
    "</Sede>",
    "</CessionarioCommittente>",
    "</FatturaElettronicaHeader>",
  ]);

  const body = compact([
    "<FatturaElettronicaBody>",
    "<DatiGenerali>",
    "<DatiGeneraliDocumento>",
    el("TipoDocumento", document.documentType || "TD01"),
    el("Divisa", document.currency || "EUR"),
    el("Data", document.date),
    el("Numero", document.number),
    document.stampDutyCents
      ? compact([
          "<DatiBollo>",
          el("BolloVirtuale", "SI"),
          el("ImportoBollo", money(document.stampDutyCents)),
          "</DatiBollo>",
        ])
      : "",
    el("ImportoTotaleDocumento", money(totalCents)),
    document.notes ? el("Causale", document.notes) : "",
    "</DatiGeneraliDocumento>",
    "</DatiGenerali>",
    "<DatiBeniServizi>",
    ...document.lines.map((line, index) =>
      compact([
        "<DettaglioLinee>",
        el("NumeroLinea", String(index + 1)),
        el("Descrizione", line.description),
        el("Quantita", (Number(line.quantity) || 0).toFixed(2)),
        el("PrezzoUnitario", money(line.unitPriceCents)),
        el("PrezzoTotale", money(lineTotalCents(line))),
        el("AliquotaIVA", (line.vatRate === null ? 0 : Number(line.vatRate) || 0).toFixed(2)),
        line.vatNature ? el("Natura", line.vatNature) : "",
        "</DettaglioLinee>",
      ]),
    ),
    ...Array.from(summaries.values()).map((summary) =>
      compact([
        "<DatiRiepilogo>",
        el("AliquotaIVA", summary.rate.toFixed(2)),
        summary.nature ? el("Natura", summary.nature) : "",
        el("ImponibileImporto", money(summary.taxableCents)),
        el("Imposta", money(vatOf(summary))),
        "</DatiRiepilogo>",
      ]),
    ),
    "</DatiBeniServizi>",
    "</FatturaElettronicaBody>",
  ]);

  const xml = compact([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">',
    header,
    body,
    "</p:FatturaElettronica>",
  ]);

  return {
    xml,
    fileName,
    totalCents,
    issues,
    formallyValid: issues.length === 0,
  };
};
