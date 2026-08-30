/**
 * Il documento stampabile di una ricevuta o di una fattura.
 *
 * **Perche il documento si genera e non si conserva.** Una ricevuta e una
 * **proiezione** della riga che la descrive: numero, data, intestatario,
 * importo, causale, riferimento all'incasso. Tutto cio che serve a
 * ristamparla e gia nel database, e conservarne anche una copia impaginata
 * vorrebbe dire tenere due verita che possono divergere — la prima volta che
 * il club cambia logo, o che qualcuno corregge una causale.
 *
 * **Perche non finisce in Attachment V2, oggi.** Ci sono due strade e nessuna
 * si prende scrivendo un file. Archiviarlo come **PDF** richiede una libreria
 * di generazione, cioe una dipendenza nel bundle del server, e va deciso.
 * Archiviarlo come **HTML** richiederebbe di aggiungere `text/html`
 * all'elenco chiuso dei tipi accettati da `attachments`, che oggi esclude
 * proprio l'HTML perche quell'endpoint serve file **caricati dagli utenti**:
 * ammetterlo per un documento generato dal server lo ammetterebbe anche per
 * un file che arriva da un modulo pubblico. Vedi D38.
 *
 * Il documento resta quindi **ristampabile in qualunque momento**, che e cio
 * che serve a una segreteria, e la decisione sull'archiviazione resta aperta
 * e scritta.
 *
 * Modulo **puro**: costruisce una stringa. Non conosce Prisma, non conosce
 * la rete, e si prova senza database.
 */

import {
  DOCUMENT_NUMBER_KIND_DEFINITIONS,
  type DocumentNumberKind,
} from "./numbering";

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Nessun valore entra nel documento senza passare da qui.
 *
 * La causale di una rata e la ragione sociale di un club sono testo scritto
 * da una persona: se finisse nel documento cosi com'e, un apostrofo
 * romperebbe la pagina e un tag la riscriverebbe.
 */
export const escapeHtml = (value: unknown) =>
  asText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

/**
 * La data, sempre `gg/mm/aaaa`.
 *
 * Come per l'importo, scritta a mano: `toLocaleDateString("it-IT")` ripiega
 * sull'ordine americano se l'ambiente non ha i dati di localizzazione
 * italiani, e una ricevuta datata `08/26/2026` non e un dettaglio estetico —
 * per undici giorni al mese e una data diversa, e nessuno se ne accorge.
 */
export const formatDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "";

  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
};

/**
 * L'importo, in euro, **sempre nella stessa forma**.
 *
 * Scritto a mano e non con `Intl`: la formattazione di `Intl` dipende dai
 * dati di localizzazione presenti nell'ambiente, e un Node compilato con ICU
 * ridotto stampa `1234,50` dove quello completo stampa `1.234,50`. Su una
 * ricevuta non e un dettaglio estetico — e lo stesso documento che risulta
 * diverso a seconda di dove e stato generato.
 */
export const formatAmountValue = (value: unknown) => {
  const amount = Number(value || 0);
  const negative = amount < 0;
  const cents = Math.round(Math.abs(amount) * 100);
  const units = String(Math.floor(cents / 100));
  const decimals = String(cents % 100).padStart(2, "0");
  const grouped = units.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${negative ? "-" : ""}${grouped},${decimals}`;
};

/*
  Il simbolo si aggiunge, non si riscrive: l'attestazione compilata usa lo
  stesso numero senza «€» dentro una frase che la valuta la dice gia
  («la somma di 130,00 euro»), e due funzioni di formattazione tornerebbero a
  produrre due importi diversi per lo stesso incasso.
*/
const formatAmount = (value: unknown) => `${formatAmountValue(value)} €`;

export type DocumentIssuer = {
  name: string;
  logoUrl?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  fiscalCode?: string | null;
  vatNumber?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

export type DocumentRecipient = {
  name: string;
  fiscalCode?: string | null;
  vatNumber?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
};

export type PrintableDocument = {
  kind: DocumentNumberKind;
  number: string;
  issueDate: unknown;
  amount: unknown;
  description: string;
  method?: string | null;
  /** L'incasso da cui nasce: e cio che lega il documento al denaro. */
  transactionReference?: string | null;
  athleteName?: string | null;
  /**
   * **L'annullamento, quando c'e.**
   *
   * Era il difetto H-3 dell'audit: un documento annullato si ristampava
   * identico a uno valido. Chi lo riceveva non aveva **nessun** modo di
   * accorgersene — ne una filigrana, ne una riga, ne un rifiuto — e un
   * documento fiscale ritirato che circola come valido non e un problema di
   * grafica.
   *
   * Il renderer non decide se un documento e annullato: lo riceve. La
   * decisione sta dove sta il dato, cioe su `cancelled_at`.
   */
  cancelledAt?: unknown;
  cancellationReason?: string | null;
};

const addressLine = (subject: DocumentIssuer | DocumentRecipient) =>
  [
    asText(subject.address),
    [asText(subject.postalCode), asText(subject.city)]
      .filter(Boolean)
      .join(" "),
    asText(subject.province) ? `(${asText(subject.province)})` : "",
  ]
    .filter(Boolean)
    .join(" — ");

const definitionLine = (label: string, value: unknown) =>
  asText(value)
    ? `<div class="row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    : "";

/**
 * Il documento, come pagina.
 *
 * Autonoma: lo stile e dentro, e non ci sono richieste verso l'esterno
 * tranne il logo del club — che sta gia sul dominio dell'applicazione. Una
 * pagina che dipendesse da un foglio di stile remoto si stamperebbe nuda dal
 * portatile di una segreteria senza rete.
 */
export const renderDocumentHtml = (input: {
  document: PrintableDocument;
  issuer: DocumentIssuer;
  recipient: DocumentRecipient;
}) => {
  const { document: doc, issuer, recipient } = input;
  const title = DOCUMENT_NUMBER_KIND_DEFINITIONS[doc.kind].label;
  const annullato = Boolean(doc.cancelledAt);

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${annullato ? "ANNULLATO - " : ""}${escapeHtml(title)} ${escapeHtml(doc.number)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    background: #f8fafc;
  }
  .sheet {
    max-width: 720px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 24px;
  }
  header { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
  header img { max-height: 64px; max-width: 180px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em;
       color: #64748b; margin: 24px 0 8px; }
  .muted { color: #64748b; font-size: 13px; margin: 2px 0; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
  .row { display: flex; justify-content: space-between; gap: 12px;
         padding: 6px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  dt { color: #64748b; margin: 0; }
  dd { margin: 0; text-align: right; font-weight: 500; }
  .total { display: flex; justify-content: space-between; align-items: baseline;
           margin-top: 16px; padding-top: 12px; border-top: 2px solid #0f172a; }
  .total strong { font-size: 22px; }
  footer { margin-top: 24px; font-size: 12px; color: #94a3b8; }
  /*
    L'annullamento si vede **prima** di leggere: una fascia in testa al foglio
    e una filigrana che attraversa il corpo. Solo la fascia sparirebbe dietro
    una piega o un ritaglio; solo la filigrana passerebbe per decorazione.
  */
  .voided-banner {
    border: 2px solid #b91c1c; background: #fef2f2; color: #7f1d1d;
    border-radius: 12px; padding: 12px 16px; margin-bottom: 20px;
  }
  .voided-banner strong { display: block; font-size: 18px; letter-spacing: .08em; }
  .voided-banner span { font-size: 13px; }
  .sheet.voided { position: relative; overflow: hidden; }
  .sheet.voided::after {
    content: "ANNULLATO";
    position: absolute; inset: 0; display: flex;
    align-items: center; justify-content: center;
    font-size: 96px; font-weight: 800; letter-spacing: .12em;
    color: rgba(185, 28, 28, .14); transform: rotate(-24deg);
    pointer-events: none; white-space: nowrap;
  }
  @media (min-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: 0; border-radius: 0; max-width: none; }
  }
</style>
</head>
<body>
  <div class="sheet${annullato ? " voided" : ""}">
    ${
      annullato
        ? `<div class="voided-banner">
      <strong>DOCUMENTO ANNULLATO</strong>
      <span>${escapeHtml(
        [
          `Annullato il ${formatDate(doc.cancelledAt)}`,
          asText(doc.cancellationReason)
            ? `Motivo: ${asText(doc.cancellationReason)}`
            : "",
        ]
          .filter(Boolean)
          .join(" - "),
      )} - non ha valore fiscale e non prova nessun incasso.</span>
    </div>`
        : ""
    }
    <header>
      ${
        asText(issuer.logoUrl)
          ? `<img src="${escapeHtml(issuer.logoUrl)}" alt="" />`
          : ""
      }
      <div>
        <h1>${escapeHtml(issuer.name)}</h1>
        <p class="muted">${escapeHtml(addressLine(issuer))}</p>
        <p class="muted">${[
          asText(issuer.fiscalCode) ? `C.F. ${escapeHtml(issuer.fiscalCode)}` : "",
          asText(issuer.vatNumber) ? `P.IVA ${escapeHtml(issuer.vatNumber)}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}</p>
        <p class="muted">${[
          escapeHtml(issuer.contactEmail),
          escapeHtml(issuer.contactPhone),
        ]
          .filter(Boolean)
          .join(" · ")}</p>
      </div>
    </header>

    <div class="grid">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <dl>
          ${definitionLine("Numero", doc.number)}
          ${definitionLine("Data", formatDate(doc.issueDate))}
        </dl>
      </div>
      <div>
        <h2>Intestata a</h2>
        <p class="muted"><strong>${escapeHtml(recipient.name)}</strong></p>
        <p class="muted">${escapeHtml(addressLine(recipient))}</p>
        <p class="muted">${[
          asText(recipient.fiscalCode)
            ? `C.F. ${escapeHtml(recipient.fiscalCode)}`
            : "",
          asText(recipient.vatNumber)
            ? `P.IVA ${escapeHtml(recipient.vatNumber)}`
            : "",
        ]
          .filter(Boolean)
          .join(" · ")}</p>
      </div>
    </div>

    <h2>Dettaglio</h2>
    <dl>
      ${definitionLine("Causale", doc.description)}
      ${definitionLine("Atleta", doc.athleteName)}
      ${definitionLine("Modalita di pagamento", doc.method)}
      ${definitionLine("Riferimento incasso", doc.transactionReference)}
    </dl>

    <div class="total">
      <span>Totale</span>
      <strong>${escapeHtml(formatAmount(doc.amount))}</strong>
    </div>

    <footer>
      ${
        annullato
          ? "Documento ANNULLATO. Il numero resta assegnato e non torna disponibile: un buco nella numerazione e leggibile, lo stesso numero su due documenti no (ADR-0044)."
          : doc.kind === "invoice"
            ? "Documento emesso da EasyGame. La trasmissione telematica al Sistema di Interscambio non e effettuata da questa applicazione."
            : "Documento emesso da EasyGame a fronte dell'incasso indicato."
      }
    </footer>
  </div>
</body>
</html>`;
};

/**
 * Il foglio di stile di un documento stampabile: **una sola definizione**.
 *
 * **Perche e una costante e non quattro regole ripetute.** Le stesse quattro
 * cose — il campo tratteggiato, l'interruzione di pagina, il formato A4 con i
 * suoi margini, la larghezza di un foglio a 794 px — servono a chiunque
 * stampi: il documento compilato qui sotto, e il modulo vuoto di
 * `/modulistica`. Ricopiarle di la ha gia prodotto due fogli di stile che
 * divergevano in silenzio: lo stesso modello stampato vuoto e stampato
 * compilato veniva su due impaginazioni diverse, e chi lo firmava se ne
 * accorgeva.
 *
 * E la stessa ragione per cui il fascicolo
 * (`src/components/documents/document-bundle.ts`) lo **estrae** dal documento
 * invece di riscriverlo.
 */
export const PRINTABLE_DOCUMENT_STYLESHEET = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    background: #f8fafc;
    font-size: 14px;
    line-height: 1.65;
  }
  .sheet {
    max-width: 794px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 16px;
    padding: 24px;
  }
  header { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;
           border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 20px; }
  header img { max-height: 64px; max-width: 180px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #64748b; font-size: 13px; margin: 2px 0; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; }
  td, th { padding: 6px 8px; border: 1px solid #e2e8f0; }
  /* Il campo lasciato in bianco: identico a quello del modulo da compilare a
     mano, perche e la stessa cosa — un dato che il documento non ha. */
  .blank-field { display: inline-block; min-width: 160px; height: 1.2em;
                 border-bottom: 1px solid #94a3b8; vertical-align: baseline; }
  .easygame-page-break { break-before: page; page-break-before: always;
                         height: 0; overflow: hidden; }
  @page { size: A4; margin: 18mm; }
  @media print {
    body { background: #fff; padding: 0; }
    .sheet { border: 0; border-radius: 0; max-width: none; padding: 0; }
  }
`;

/**
 * Un modello di modulistica gia compilato, come pagina stampabile.
 *
 * **Perche sta qui e non in `/modulistica`.** Perche e la stessa pagina
 * autonoma di una ricevuta — stile dentro, nessuna richiesta verso l'esterno,
 * `Stampa → Salva come PDF` — e perche l'intestazione con il logo del club era
 * gia scritta. Rifarla nel browser vorrebbe dire due impaginazioni per lo
 * stesso club, che e il difetto che questo file esiste per non avere.
 *
 * `bodyHtml` arriva **gia sostituito e gia neutralizzato** dal risolutore dei
 * segnaposto (`src/lib/server/document-placeholders.ts`): qui non si sfugge
 * nulla, perche il corpo e HTML voluto — il modello lo ha scritto la
 * segreteria.
 */
export const renderFilledDocumentHtml = (input: {
  title: string;
  bodyHtml: string;
  issuer: DocumentIssuer;
}) => {
  const { title, bodyHtml, issuer } = input;

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${PRINTABLE_DOCUMENT_STYLESHEET}</style>
</head>
<body>
  <div class="sheet">
    <header>
      ${
        asText(issuer.logoUrl)
          ? `<img src="${escapeHtml(issuer.logoUrl)}" alt="" />`
          : ""
      }
      <div>
        <h1>${escapeHtml(issuer.name)}</h1>
        <p class="muted">${escapeHtml(addressLine(issuer))}</p>
        <p class="muted">${[
          asText(issuer.fiscalCode) ? `C.F. ${escapeHtml(issuer.fiscalCode)}` : "",
          asText(issuer.vatNumber) ? `P.IVA ${escapeHtml(issuer.vatNumber)}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}</p>
      </div>
    </header>
    ${bodyHtml}
  </div>
</body>
</html>`;
};

/**
 * Il **modulo vuoto**: lo stesso foglio, senza nessun dato dentro.
 *
 * **Perche sta qui accanto al compilato.** Sono la stessa pagina stampata due
 * volte — stesso formato, stessi margini, stessi campi tratteggiati — e finche
 * la componeva `/modulistica` con il suo `<style>` a mano, le due impaginazioni
 * potevano divergere senza che nessun test se ne accorgesse. Adesso il foglio
 * di stile e uno solo (`PRINTABLE_DOCUMENT_STYLESHEET`) e lo condividono.
 *
 * **Non porta l'intestazione del club.** Un modulo da compilare a penna esce
 * dal modello, e il modello la sua intestazione ce l'ha gia scritta dentro: il
 * compilato invece nasce dal server, che conosce logo e dati fiscali. Metterla
 * anche qui vorrebbe dire stampare due volte lo stesso nome.
 *
 * `bodyHtml` e HTML **voluto**: e il testo del modello con i segnaposto gia
 * svuotati da `applyPlaceholderValues`. Qui non si sfugge niente, come nel
 * compilato.
 */
export const renderBlankFormHtml = (input: {
  title: string;
  bodyHtml: string;
}) => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(input.title)}</title>
<style>${PRINTABLE_DOCUMENT_STYLESHEET}</style>
</head>
<body>
  <div class="sheet">
    ${input.bodyHtml}
  </div>
</body>
</html>`;
