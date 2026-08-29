/**
 * Il modello di un messaggio: oggetto, corpo, e i segnaposto del catalogo.
 *
 * **Il buco che chiude (G-05).** Il testo di ogni messaggio che EasyGame manda
 * a una famiglia e **codice**: `buildPaymentReminderLines` in
 * `src/lib/server/email/email-service.ts` e `buildReminderContent` in
 * `src/lib/server/medical-certificate-reminders.ts` compongono le righe a mano.
 * Un club che voglia cambiare una parola apre una richiesta di assistenza. Da
 * qui in avanti il testo e un **dato del club**, e i segnaposto sono quelli che
 * l'editor dei modelli gia mostra.
 *
 * ## Cosa questo modulo non e
 *
 * Non e un template engine. Non ha condizionali, non ha cicli, non ha filtri,
 * non ha valori predefiniti. Un modello e testo con `{{chiave}}` dentro, e
 * niente altro — perche il momento in cui si accetta `{{#if}}` e il momento in
 * cui il testo di un messaggio torna a essere codice, solo scritto peggio e
 * senza test.
 *
 * ## I vincoli che eredita dal catalogo (ADR-0079)
 *
 * 1. **Catalogo chiuso.** Le chiavi ammesse sono quelle di
 *    `src/lib/documents/placeholders.ts`, le stesse dei documenti. Un
 *    segnaposto fuori catalogo non si risolve **mai**: finisce in `unresolved`,
 *    e `validateMessageTemplate` lo mostra in anteprima prima dell'invio.
 * 2. **Il messaggio non mente.** Un dato che manca lascia il posto vuoto ed e
 *    **dichiarato**. Non esiste un percorso in cui parta una email con
 *    «undefined» dentro, ne una in cui un importo venga indovinato.
 * 3. **Niente HTML iniettabile.** Il corpo e **testo**: nella versione `html`
 *    tutto viene neutralizzato, il testo del modello come i valori. Un cognome
 *    scritto `<script>...` e un cognome.
 * 4. **I dati economici passano da un permesso.** Residuo, importi, rate
 *    scadute e link di pagamento si risolvono solo se chi manda puo vederli
 *    (§11 del planning di Wave 2). Un segnaposto negato non e un segnaposto
 *    mancante: sta in un elenco suo, perche i due errori hanno due rimedi
 *    diversi — «il dato non c'e» e «tu non puoi vederlo».
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM, nessun import da
 * `src/lib/server/**`. Si prova senza database.
 */

import {
  createInlinePlaceholderPattern,
  isEconomicPlaceholderKey,
  isKnownPlaceholderKey,
  normalizePlaceholderKey,
} from "@/lib/documents/placeholders";
/*
  L'escaping non si riscrive: `escapeHtml` e gia esportata da un punto solo ed
  e la stessa che neutralizza i valori dei documenti. Riscriverla qui
  significherebbe avere due definizioni che un giorno divergono, e la copia che
  neutralizza un carattere in meno e quella che nessuno guarda.
*/
import { escapeHtml } from "@/lib/documents/document-view";

/**
 * Un modello di messaggio.
 *
 * `body` e **testo**, non l'HTML dell'editor dei documenti: un messaggio si
 * scrive in una casella di testo e si legge in una email. La forma HTML la
 * costruisce `renderMessageTemplate`, che e l'unico posto in cui questo testo
 * diventa marcatura.
 */
export type MessageTemplate = {
  subject: string;
  body: string;
};

export type RenderedMessage = {
  /** L'oggetto, sempre testo: nessun client di posta lo interpreta come HTML. */
  subject: string;
  /** Il corpo in chiaro. Nessun escaping: e testo che resta testo. */
  text: string;
  /** Il corpo in HTML, con modello e valori entrambi neutralizzati. */
  html: string;
  /**
   * I segnaposto che non hanno prodotto niente: fuori catalogo, oppure senza
   * un valore. Vanno **mostrati** in anteprima, mai nascosti.
   */
  unresolved: string[];
  /**
   * I segnaposto economici che chi manda non e autorizzato a vedere. Sono
   * separati da `unresolved` perche il rimedio e un permesso, non un dato.
   */
  denied: string[];
};

export type RenderMessageTemplateInput = {
  template: MessageTemplate;
  /**
   * I valori gia risolti, per chiave senza parentesi (`athlete.first_name`).
   * Li produce chi conosce il destinatario; questo modulo non li cerca.
   */
  values: Record<string, string | null | undefined>;
  /**
   * Se chi manda puo vedere i dati economici. **Predefinito: no.** Il default
   * negato e la ragione per cui un errore di chiamata non fa uscire un residuo
   * verso chi non lo puo leggere.
   */
  allowEconomic?: boolean;
};

const asText = (value: unknown) => String(value ?? "");

/**
 * Il testo di un segmento diventa una o piu righe HTML.
 *
 * Il corpo e testo: le righe vuote separano i paragrafi e un a capo singolo e
 * un a capo. Senza questa conversione una email HTML arriverebbe come un unico
 * blocco, che e esattamente il messaggio che nessuno legge.
 *
 * Riceve testo **gia neutralizzato**: qui i tag li mette solo questa funzione.
 */
const toHtmlParagraphs = (escaped: string) =>
  escaped
    .split(/\n{2,}/)
    .map((block) => block.split("\n").join("<br />"))
    .filter((block) => block.trim() !== "")
    .map((block) => `<p>${block}</p>`)
    .join("");

type Substitution = {
  text: string;
  /** Lo stesso contenuto, con modello e valori neutralizzati. */
  escaped: string;
};

/**
 * Il valore di una chiave, o la stringa vuota con il motivo registrato.
 *
 * L'ordine dei tre controlli non e casuale. Prima il catalogo: una chiave
 * inventata non e «negata», e sbagliata. Poi il permesso: un residuo che chi
 * manda non puo vedere non deve nemmeno essere letto da `values`. Solo alla
 * fine il dato.
 */
const resolveKey = (
  key: string,
  values: Record<string, string | null | undefined>,
  allowEconomic: boolean,
  unresolved: Set<string>,
  denied: Set<string>,
) => {
  if (!key) return "";

  if (!isKnownPlaceholderKey(key)) {
    unresolved.add(key);
    return "";
  }

  if (!allowEconomic && isEconomicPlaceholderKey(key)) {
    denied.add(key);
    return "";
  }

  const value = asText(values[key]);
  if (!value) {
    unresolved.add(key);
    return "";
  }

  return value;
};

/**
 * Sostituisce i segnaposto di **una** stringa, e registra cosa non ha scritto.
 *
 * Testo e HTML nascono nella stessa passata, sullo stesso esito: se nascessero
 * in due passate potrebbero divergere — l'una risolvere un segnaposto che
 * l'altra nega — e nessuno se ne accorgerebbe finche una famiglia non legge
 * due messaggi diversi a seconda del client di posta.
 */
const substitute = (
  source: string,
  values: Record<string, string | null | undefined>,
  allowEconomic: boolean,
  unresolved: Set<string>,
  denied: Set<string>,
): Substitution => {
  const pattern = createInlinePlaceholderPattern();
  const text: string[] = [];
  const escaped: string[] = [];

  let cursor = 0;
  let match = pattern.exec(source);

  while (match) {
    const literal = source.slice(cursor, match.index);
    text.push(literal);
    escaped.push(escapeHtml(literal));

    const key = normalizePlaceholderKey(match[1]);
    const resolved = resolveKey(key, values, allowEconomic, unresolved, denied);
    text.push(resolved);
    escaped.push(escapeHtml(resolved));

    cursor = match.index + match[0].length;
    match = pattern.exec(source);
  }

  const tail = source.slice(cursor);
  text.push(tail);
  escaped.push(escapeHtml(tail));

  return { text: text.join(""), escaped: escaped.join("") };
};

/**
 * Un modello piu i valori: il messaggio come lo leggera il destinatario.
 *
 * **Deterministico.** Non legge l'orologio, non genera identificativi, non
 * consulta niente fuori dai suoi argomenti: due chiamate con lo stesso ingresso
 * danno lo stesso messaggio, byte per byte. E la condizione perche l'anteprima
 * mostri davvero cio che partira, e non qualcosa che le somiglia.
 */
export const renderMessageTemplate = ({
  template,
  values,
  allowEconomic = false,
}: RenderMessageTemplateInput): RenderedMessage => {
  const unresolved = new Set<string>();
  const denied = new Set<string>();
  const safeValues = values || {};

  const subject = substitute(
    asText(template?.subject),
    safeValues,
    allowEconomic,
    unresolved,
    denied,
  );
  const body = substitute(
    asText(template?.body),
    safeValues,
    allowEconomic,
    unresolved,
    denied,
  );

  return {
    subject: subject.text,
    text: body.text,
    html: toHtmlParagraphs(body.escaped),
    unresolved: [...unresolved].sort(),
    denied: [...denied].sort(),
  };
};

/**
 * I segnaposto di un modello che il catalogo non conosce.
 *
 * Serve a **bloccare in anteprima** un modello scritto male: `{{importo}}` non
 * deve arrivare a una famiglia scritto cosi com'e, e non deve nemmeno sparire
 * in silenzio. Chi scrive il modello lo corregge prima, non dopo trecento
 * invii.
 */
export const validateMessageTemplate = (template: MessageTemplate): string[] => {
  const unknown = new Set<string>();

  for (const source of [asText(template?.subject), asText(template?.body)]) {
    const pattern = createInlinePlaceholderPattern();
    let match = pattern.exec(source);
    while (match) {
      const key = normalizePlaceholderKey(match[1]);
      if (key && !isKnownPlaceholderKey(key)) unknown.add(key);
      match = pattern.exec(source);
    }
  }

  return [...unknown].sort();
};

/**
 * I segnaposto economici che un modello usa.
 *
 * Chi decide se un invio e permesso deve poterlo sapere **prima** di comporre:
 * §11 del planning di Wave 2 chiede il permesso per **inviare** un modello che
 * contiene importi, non solo per scriverlo.
 */
export const economicPlaceholdersUsed = (template: MessageTemplate): string[] => {
  const used = new Set<string>();

  for (const source of [asText(template?.subject), asText(template?.body)]) {
    const pattern = createInlinePlaceholderPattern();
    let match = pattern.exec(source);
    while (match) {
      const key = normalizePlaceholderKey(match[1]);
      if (key && isEconomicPlaceholderKey(key)) used.add(key);
      match = pattern.exec(source);
    }
  }

  return [...used].sort();
};
