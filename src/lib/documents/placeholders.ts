/**
 * Il catalogo dei segnaposto documentali, e la sostituzione che li consuma.
 *
 * **Perche un modulo e non due elenchi.** Il catalogo esisteva gia dentro
 * `DocumentEditor`: e cio che la barra laterale mostra a chi scrive un
 * modello. Il risolutore lato server (W1-G) deve conoscere **esattamente** gli
 * stessi segnaposto — un elenco che mostra `{{payment.total_paid}}` e un
 * risolutore che non lo conosce e peggio di nessun elenco, perche promette un
 * dato e stampa un campo vuoto senza spiegare il perche.
 *
 * Il catalogo vive quindi qui, in un modulo **client-safe** (nessun import di
 * `src/lib/server/**`), e lo importano entrambi: l'editor per proporlo,
 * `src/lib/server/document-placeholders.ts` per risolverlo. Un test di
 * contratto verifica che non ne nasca un secondo.
 *
 * **Il catalogo e chiuso.** Un segnaposto che non e in elenco non viene
 * inventato: resta un campo vuoto e viene **dichiarato** a chi genera il
 * documento. Un'attestazione che si inventa un numero non e un documento, e
 * una bugia con l'intestazione del club sopra.
 *
 * Modulo **puro**: non conosce Prisma, non conosce la rete, non conosce il
 * DOM. Si prova senza database.
 */

export type DocumentTemplateToken = {
  label: string;
  value: string;
  group: string;
  description?: string;
};

export type DocumentSignatureToken = {
  label: string;
  value: string;
};

/**
 * I segnaposto che un modello puo contenere.
 *
 * L'ordine e quello dei gruppi mostrati nell'editor: chi scrive un modello
 * cerca «Atleta» o «Iscrizione/Pagamenti», non una chiave alfabetica.
 */
export const DOCUMENT_TEMPLATE_TOKENS: DocumentTemplateToken[] = [
  { label: "Nome club", value: "{{club.name}}", group: "Club" },
  { label: "Indirizzo club", value: "{{club.address}}", group: "Club" },
  { label: "Citta club", value: "{{club.city}}", group: "Club" },
  { label: "Email club", value: "{{club.email}}", group: "Club" },
  { label: "Telefono club", value: "{{club.phone}}", group: "Club" },
  { label: "Codice fiscale club", value: "{{club.fiscal_code}}", group: "Club" },
  { label: "Partita IVA club", value: "{{club.vat_number}}", group: "Club" },
  { label: "Sito web club", value: "{{club.website}}", group: "Club" },
  { label: "Nome atleta", value: "{{athlete.first_name}}", group: "Atleta" },
  { label: "Cognome atleta", value: "{{athlete.last_name}}", group: "Atleta" },
  { label: "Data nascita atleta", value: "{{athlete.birth_date}}", group: "Atleta" },
  { label: "Categoria atleta", value: "{{athlete.category_name}}", group: "Atleta" },
  { label: "Codice fiscale atleta", value: "{{athlete.fiscal_code}}", group: "Atleta" },
  { label: "Indirizzo atleta", value: "{{athlete.address}}", group: "Atleta" },
  { label: "Email atleta", value: "{{athlete.email}}", group: "Atleta" },
  { label: "Telefono atleta", value: "{{athlete.phone}}", group: "Atleta" },
  { label: "Numero maglia", value: "{{athlete.jersey_number}}", group: "Atleta" },
  { label: "Nome genitore 1", value: "{{parent.1.first_name}}", group: "Genitori/Tutori" },
  { label: "Cognome genitore 1", value: "{{parent.1.last_name}}", group: "Genitori/Tutori" },
  { label: "Email genitore 1", value: "{{parent.1.email}}", group: "Genitori/Tutori" },
  { label: "Telefono genitore 1", value: "{{parent.1.phone}}", group: "Genitori/Tutori" },
  { label: "Nome genitore 2", value: "{{parent.2.first_name}}", group: "Genitori/Tutori" },
  { label: "Cognome genitore 2", value: "{{parent.2.last_name}}", group: "Genitori/Tutori" },
  { label: "Email genitore 2", value: "{{parent.2.email}}", group: "Genitori/Tutori" },
  { label: "Telefono genitore 2", value: "{{parent.2.phone}}", group: "Genitori/Tutori" },
  { label: "Tutore principale", value: "{{guardian.name}}", group: "Genitori/Tutori" },
  /*
    L'intestatario fiscale non e l'atleta, quasi mai: la quota la paga un
    genitore e la detrazione la chiede lui, con **il suo** codice fiscale.
    L'attestazione di pagamento serve proprio a quello, e senza questi tre
    segnaposto il documento sarebbe intestato alla persona sbagliata
    (`src/lib/documents/fiscal-recipient.ts`).
  */
  { label: "Intestatario", value: "{{fiscal_recipient.name}}", group: "Intestatario fiscale" },
  {
    label: "Codice fiscale intestatario",
    value: "{{fiscal_recipient.fiscal_code}}",
    group: "Intestatario fiscale",
  },
  {
    label: "Indirizzo intestatario",
    value: "{{fiscal_recipient.address}}",
    group: "Intestatario fiscale",
  },
  { label: "Nome staff", value: "{{staff.first_name}}", group: "Staff" },
  { label: "Cognome staff", value: "{{staff.last_name}}", group: "Staff" },
  { label: "Ruolo staff", value: "{{staff.role}}", group: "Staff" },
  { label: "Email staff", value: "{{staff.email}}", group: "Staff" },
  { label: "Telefono staff", value: "{{staff.phone}}", group: "Staff" },
  { label: "Nome allenatore", value: "{{trainer.first_name}}", group: "Allenatori" },
  { label: "Cognome allenatore", value: "{{trainer.last_name}}", group: "Allenatori" },
  { label: "Ruolo allenatore", value: "{{trainer.role}}", group: "Allenatori" },
  { label: "Email allenatore", value: "{{trainer.email}}", group: "Allenatori" },
  { label: "Telefono allenatore", value: "{{trainer.phone}}", group: "Allenatori" },
  { label: "Nome socio", value: "{{member.first_name}}", group: "Soci" },
  { label: "Cognome socio", value: "{{member.last_name}}", group: "Soci" },
  { label: "Email socio", value: "{{member.email}}", group: "Soci" },
  { label: "Telefono socio", value: "{{member.phone}}", group: "Soci" },
  /*
    Il destinatario non e l'atleta, e in un **messaggio** non e nemmeno
    l'intestatario fiscale: e la persona a cui il messaggio arriva — un
    genitore, un socio, un allenatore — e chi scrive il modello non sa in
    anticipo quale delle tre sia. Senza queste due chiavi ogni modello dovrebbe
    scegliere un soggetto («Gentile {{parent.1.first_name}}») e sbagliare tutte
    le volte in cui il destinatario e un altro.
  */
  { label: "Nome destinatario", value: "{{recipient.name}}", group: "Destinatario" },
  {
    label: "Nome di battesimo destinatario",
    value: "{{recipient.first_name}}",
    group: "Destinatario",
  },
  { label: "Nome sponsor", value: "{{sponsor.name}}", group: "Sponsor/Fornitori" },
  { label: "Referente sponsor", value: "{{sponsor.contact_name}}", group: "Sponsor/Fornitori" },
  { label: "Email sponsor", value: "{{sponsor.email}}", group: "Sponsor/Fornitori" },
  { label: "Telefono sponsor", value: "{{sponsor.phone}}", group: "Sponsor/Fornitori" },
  { label: "Nome fornitore", value: "{{supplier.name}}", group: "Sponsor/Fornitori" },
  { label: "Categoria", value: "{{category.name}}", group: "Categorie e gruppi" },
  { label: "Squadra/gruppo", value: "{{team.name}}", group: "Categorie e gruppi" },
  { label: "Stato certificato", value: "{{medical_certificate.status}}", group: "Certificati" },
  { label: "Scadenza certificato", value: "{{medical_certificate.expiry_date}}", group: "Certificati" },
  { label: "Stato iscrizione", value: "{{registration.status}}", group: "Iscrizione/Pagamenti" },
  { label: "Piano pagamento", value: "{{payment.plan}}", group: "Iscrizione/Pagamenti" },
  { label: "Totale dovuto", value: "{{payment.total_due}}", group: "Iscrizione/Pagamenti" },
  { label: "Totale pagato", value: "{{payment.total_paid}}", group: "Iscrizione/Pagamenti" },
  { label: "Totale rimanente", value: "{{payment.remaining}}", group: "Iscrizione/Pagamenti" },
  /*
    I segnaposto della **singola rata**, che un'attestazione non usa e un
    messaggio non puo evitare: un sollecito che non dice quale rata e quando
    scade obbliga la famiglia a telefonare in segreteria, cioe non solleva
    nessuno da niente.

    La data di scadenza **non** e un dato economico (vedi
    `ECONOMIC_PLACEHOLDER_KEYS`): dice quando, non quanto.
  */
  { label: "Scadenza rata", value: "{{installment.due_date}}", group: "Iscrizione/Pagamenti" },
  {
    label: "Descrizione rata",
    value: "{{installment.description}}",
    group: "Iscrizione/Pagamenti",
  },
  {
    label: "Residuo della rata",
    value: "{{installment.residual_amount}}",
    group: "Iscrizione/Pagamenti",
  },
  {
    label: "Numero di rate scadute",
    value: "{{installment.overdue_count}}",
    group: "Iscrizione/Pagamenti",
  },
  {
    label: "Prossima scadenza",
    value: "{{payment.next_due_date}}",
    group: "Iscrizione/Pagamenti",
  },
  /*
    Il link di pagamento sicuro lo **produce** un altro dominio
    (`src/lib/server/payment-links.ts`, lane W2-B): qui e solo una chiave che
    un modello puo nominare. Il catalogo dichiara cosa si puo chiedere, non sa
    fabbricarlo — chi risolve i valori passa il link gia firmato, oppure il
    segnaposto resta irrisolto e chi manda lo vede in anteprima.
  */
  { label: "Link di pagamento", value: "{{payment.link}}", group: "Iscrizione/Pagamenti" },
  /*
    L'evento: serve all'invito a confermare la presenza (AUT-04). Data e ora
    sono due chiavi e non una perche un messaggio le scrive quasi sempre in due
    punti diversi della frase — «domenica 12» e «alle 15:30».
  */
  { label: "Titolo evento", value: "{{event.title}}", group: "Eventi" },
  { label: "Data evento", value: "{{event.date}}", group: "Eventi" },
  { label: "Ora evento", value: "{{event.time}}", group: "Eventi" },
  /*
    La frequenza e la meta dell'attestazione che le famiglie chiedono: «ha
    pagato» e «ha frequentato» viaggiano sullo stesso foglio. La misura non si
    calcola qui — la produce il dominio contributi, che la misura gia per
    atleta e per periodo (`src/lib/funding/attendance-measure.ts`, ADR-0037).
  */
  { label: "Presenze nel periodo", value: "{{attendance.sessions}}", group: "Frequenza" },
  { label: "Ore nel periodo", value: "{{attendance.hours}}", group: "Frequenza" },
  { label: "Titolo documento", value: "{{document.title}}", group: "Documenti" },
  { label: "Data documento", value: "{{document.date}}", group: "Documenti" },
  { label: "Data corrente", value: "{{current_date}}", group: "Date e sistema" },
  { label: "Anno sportivo", value: "{{season.year}}", group: "Date e sistema" },
  { label: "Inizio stagione", value: "{{season.start_date}}", group: "Date e sistema" },
  { label: "Fine stagione", value: "{{season.end_date}}", group: "Date e sistema" },
];

/**
 * I blocchi firma: non sono un dato, sono uno spazio.
 *
 * `{{signature.club_representative}}` e `{{stamp.club}}` fanno eccezione, ed e
 * il punto di §5.5.25: se il club ha caricato firma e timbro
 * (`src/lib/server/club-signature.ts`) il documento li porta come immagine; se
 * non li ha, restano lo spazio bianco di sempre e chi genera **lo sa prima**.
 */
export const DOCUMENT_SIGNATURE_TOKENS: DocumentSignatureToken[] = [
  { label: "Firma atleta", value: "{{signature.athlete}}" },
  { label: "Firma genitore", value: "{{signature.parent}}" },
  {
    label: "Firma presidente/club",
    value: "{{signature.club_representative}}",
  },
  { label: "Firma allenatore", value: "{{signature.trainer}}" },
  { label: "Timbro del club", value: "{{stamp.club}}" },
];

/** `{{ athlete.first_name }}` → `athlete.first_name`. */
export const normalizePlaceholderKey = (value: unknown) =>
  String(value ?? "")
    .replace(/[{}]/g, "")
    .trim();

/** Le chiavi del catalogo, senza parentesi: e l'elenco chiuso. */
export const DOCUMENT_PLACEHOLDER_KEYS: string[] = [
  ...DOCUMENT_TEMPLATE_TOKENS,
  ...DOCUMENT_SIGNATURE_TOKENS,
].map((token) => normalizePlaceholderKey(token.value));

const PLACEHOLDER_KEY_SET = new Set(DOCUMENT_PLACEHOLDER_KEYS);

export const isKnownPlaceholderKey = (key: unknown) =>
  PLACEHOLDER_KEY_SET.has(normalizePlaceholderKey(key));

/**
 * I segnaposto che portano un dato **economico**.
 *
 * **Perche vive qui e non nel modulo dei messaggi.** E una proprieta della
 * chiave, non del canale: `{{payment.remaining}}` e un dato economico che lo
 * si stampi su un'attestazione o lo si mandi per email. Se l'elenco stesse
 * altrove sarebbe un secondo catalogo, e il giorno in cui qualcuno aggiunge
 * una chiave di importo qui sopra dimenticandosi di aggiungerla la, il
 * messaggio la scriverebbe a chi non puo vederla.
 *
 * Il criterio: **quanto**, non **quando**. Una data di scadenza dice a una
 * famiglia una cosa che gia sa; un residuo, un numero di rate scadute o un
 * link che apre un pagamento dicono la posizione debitoria — ed e quella che
 * §11 del planning di Wave 2 chiude dietro `canManageClubConfiguration`.
 */
export const ECONOMIC_PLACEHOLDER_KEYS: string[] = [
  "payment.total_due",
  "payment.total_paid",
  "payment.remaining",
  "installment.residual_amount",
  "installment.overdue_count",
  "payment.link",
];

const ECONOMIC_KEY_SET = new Set(ECONOMIC_PLACEHOLDER_KEYS);

export const isEconomicPlaceholderKey = (key: unknown) =>
  ECONOMIC_KEY_SET.has(normalizePlaceholderKey(key));

/*
  Le tre forme in cui un segnaposto compare dentro un modello.

  L'editor visuale non scrive `{{...}}` in chiaro: incapsula il segnaposto in
  un elemento con `data-template-placeholder` (o `data-signature-placeholder`
  per i blocchi firma) e ci mette dentro l'etichetta leggibile — «Nome atleta».
  Sostituire solo il testo fra parentesi lascerebbe in pagina l'etichetta, cioe
  scriverebbe «Nome atleta» dove doveva esserci «Mario».
*/
const TEMPLATE_CHIP_PATTERN =
  /<span[^>]*data-template-placeholder=["']([^"']+)["'][^>]*>.*?<\/span>/gis;
const SIGNATURE_BLOCK_PATTERN =
  /<div[^>]*data-signature-placeholder=["']([^"']+)["'][^>]*>.*?<\/div>/gis;
/**
 * La sintassi di un segnaposto in chiaro, in una copia nuova ogni volta.
 *
 * Serve a chi deve **sostituire diversamente** — il corpo di un messaggio non
 * produce campi tratteggiati, produce testo — senza riscriversi la regex e
 * quindi senza far divergere la sintassi accettata dai due lati. La copia e
 * necessaria perche `lastIndex` di una regex globale sopravvive fra le
 * chiamate: condividerne l'istanza farebbe leggere meno segnaposto alla
 * seconda passata.
 */
export const createInlinePlaceholderPattern = () => /{{\s*([^{}]+?)\s*}}/g;

const INLINE_PLACEHOLDER_PATTERN = createInlinePlaceholderPattern();

/** Il campo da compilare a mano: la stessa classe che usa il modulo vuoto. */
export const BLANK_FIELD_HTML = '<span class="blank-field"></span>';

export type ApplyPlaceholderValuesResult = {
  /** Il contenuto del modello con i segnaposto sostituiti. */
  html: string;
  /**
   * I segnaposto incontrati per i quali non e stato fornito nulla: restano un
   * campo vuoto e vanno **mostrati** a chi genera il documento.
   */
  unresolved: string[];
};

/**
 * Sostituisce i segnaposto di un modello con l'HTML gia pronto.
 *
 * **`rendered` contiene HTML, non testo.** Chi chiama ha gia deciso come si
 * scrive ogni valore — un nome passa da `escapeHtml`, una firma e un `<img>` —
 * perche la scelta fra «testo da neutralizzare» e «frammento voluto» non si
 * puo indovinare qui: indovinarla vorrebbe dire o rompere le firme o lasciar
 * passare uno `<script>` scritto dentro il nome di un atleta.
 *
 * Un segnaposto assente da `rendered` non viene inventato: diventa un campo
 * vuoto e finisce in `unresolved`.
 */
export const applyPlaceholderValues = ({
  content,
  rendered,
}: {
  content: string;
  rendered: Record<string, string>;
}): ApplyPlaceholderValuesResult => {
  const unresolved = new Set<string>();

  const substitute = (raw: string) => {
    const key = normalizePlaceholderKey(raw);
    if (!key) return "";

    const value = rendered[key];
    if (value === undefined) {
      unresolved.add(key);
      return BLANK_FIELD_HTML;
    }

    return value;
  };

  const html = String(content || "")
    .replace(TEMPLATE_CHIP_PATTERN, (_match, key) => substitute(key))
    .replace(SIGNATURE_BLOCK_PATTERN, (_match, key) => substitute(key))
    .replace(INLINE_PLACEHOLDER_PATTERN, (_match, key) => substitute(key));

  return { html, unresolved: [...unresolved].sort() };
};

/**
 * I segnaposto presenti in un modello, nell'ordine in cui compaiono.
 *
 * Serve all'anteprima e ai test: dire «questo modello chiede undici dati» e
 * possibile solo leggendoli dal modello, non dal catalogo.
 */
export const extractPlaceholderKeys = (content: string): string[] => {
  const found = new Set<string>();

  for (const pattern of [
    TEMPLATE_CHIP_PATTERN,
    SIGNATURE_BLOCK_PATTERN,
    INLINE_PLACEHOLDER_PATTERN,
  ]) {
    // `lastIndex` sopravvive fra le chiamate su una regex globale: senza
    // questo azzeramento la seconda lettura dello stesso modello ne
    // troverebbe meno della prima.
    pattern.lastIndex = 0;
    let match = pattern.exec(String(content || ""));
    while (match) {
      const key = normalizePlaceholderKey(match[1]);
      if (key) found.add(key);
      match = pattern.exec(String(content || ""));
    }
    pattern.lastIndex = 0;
  }

  return [...found];
};
