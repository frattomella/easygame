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

/**
 * Di chi parla un segnaposto.
 *
 * **Perche il catalogo smette di essere piatto** (Wave 3, barriera). Fino alla
 * Wave 2 il catalogo era un elenco: l'editor proponeva ottantatre chiavi e il
 * risolutore ne sapeva produrre una cinquantina, perche le altre — staff,
 * allenatori, soci, sponsor — in un documento intestato a un **atleta** non
 * hanno un soggetto a cui riferirsi. Chi le usava otteneva un campo bianco
 * dichiarato: corretto, ma l'editor continuava a proporre una promessa che
 * non c'era (debito `DOC-04`).
 *
 * Con il soggetto, l'editor propone **solo** cio che il modello sapra
 * riempire, e la promessa sparisce alla radice invece di essere corretta a
 * valle.
 *
 * - `club` — la societa: c'e sempre, qualunque sia il soggetto del modello;
 * - `athlete` — l'atleta e chi gli ruota attorno (tutori, intestatario
 *   fiscale, iscrizione, rate, frequenza, certificato);
 * - `person` — una persona del lavoro sportivo: allenatore, staff, il suo
 *   rapporto e il suo compenso;
 * - `member` — un socio;
 * - `document` — il documento stesso: titolo, data, protocollo;
 * - `system` — data corrente, stagione, destinatario: non dipendono da nessun
 *   soggetto dichiarabile;
 * - `sponsor`, `supplier`, `event` — **non sono soggetti di un documento**.
 *   Un modello non puo dichiararli (`TEMPLATE_SUBJECT_KINDS` non li contiene),
 *   quindi l'editor non li propone mai e chi li scrive in un modello se lo
 *   sente dire alla pubblicazione. Restano in catalogo perche i messaggi di
 *   Wave 2 li usano, ed e li che hanno un senso.
 */
export const PLACEHOLDER_SUBJECTS = [
  "club",
  "athlete",
  "person",
  "member",
  "document",
  "system",
  "sponsor",
  "supplier",
  "event",
] as const;

export type PlaceholderSubject = (typeof PLACEHOLDER_SUBJECTS)[number];

/** `{{ athlete.first_name }}` → `athlete.first_name`. */
export const normalizePlaceholderKey = (value: unknown) =>
  String(value ?? "")
    .replace(/[{}]/g, "")
    .trim();

/**
 * I soggetti che un **modello** puo dichiarare.
 *
 * Sono meno di quelli di un segnaposto: `document` e `system` non sono
 * soggetti di cui un documento parli, sono cose che qualunque documento ha.
 */
export const TEMPLATE_SUBJECT_KINDS = [
  "club",
  "athlete",
  "person",
  "member",
] as const;

export type TemplateSubjectKind = (typeof TEMPLATE_SUBJECT_KINDS)[number];

export const isTemplateSubjectKind = (
  value: unknown,
): value is TemplateSubjectKind =>
  (TEMPLATE_SUBJECT_KINDS as readonly string[]).includes(
    String(value || "").trim().toLowerCase(),
  );

/**
 * Quanto e delicato il dato che il segnaposto porta.
 *
 * `economic` esisteva gia (`ECONOMIC_PLACEHOLDER_KEYS`) ed era usato dai
 * messaggi di Wave 2: qui viene **generalizzato**, non duplicato — la funzione
 * `isEconomicPlaceholderKey` continua a rispondere esattamente come prima,
 * perche legge questa stessa proprieta.
 *
 * Il criterio resta quello di Wave 2: **quanto**, non **quando**. Una data di
 * scadenza dice a una famiglia una cosa che gia sa; un residuo dice la
 * posizione debitoria.
 *
 * `health` e nuovo e vale per il dato clinico. Non e G-33 — il permesso
 * separato sul dato clinico resta un gap aperto — ma serve gia oggi a
 * impedire che un certificato finisca dentro un documento generato da chi non
 * puo vederlo.
 */
export const PLACEHOLDER_SENSITIVITIES = [
  "plain",
  "economic",
  "health",
] as const;

export type PlaceholderSensitivity = (typeof PLACEHOLDER_SENSITIVITIES)[number];

/**
 * Cosa fare quando il dato non c'e.
 *
 * - `blank` — resta un campo da compilare a mano, ed e elencato in `missing`.
 *   E il comportamento di sempre, e resta il predefinito;
 * - `warn` — come `blank`, ma chi genera lo legge come avviso prima di
 *   stampare;
 * - `block` — la generazione si rifiuta. Serve al giorno in cui un modello
 *   dira un compenso: un contratto senza importo non deve uscire.
 */
export const PLACEHOLDER_NULLABLE_BEHAVIOURS = [
  "blank",
  "warn",
  "block",
] as const;

export type PlaceholderNullableBehaviour =
  (typeof PLACEHOLDER_NULLABLE_BEHAVIOURS)[number];

export type DocumentTemplateToken = {
  label: string;
  value: string;
  group: string;
  description?: string;
  /**
   * Il soggetto che deve esistere perche la chiave abbia un valore.
   *
   * Lo assegna `PLACEHOLDER_CONTRACT`, piu sotto, e un test verifica che non
   * ne resti fuori nessuna chiave. Assente = `club`, che e il soggetto sempre
   * disponibile.
   */
  subject?: PlaceholderSubject;
  /** Chi produce il dato: `installment-ledger`, `attendance-measure`, … */
  owner?: string;
  /** Assente = `plain`. */
  sensitivity?: PlaceholderSensitivity;
  /** Assente = `blank`. */
  nullable?: PlaceholderNullableBehaviour;
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
const RAW_DOCUMENT_TEMPLATE_TOKENS: DocumentTemplateToken[] = [
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
 * **Il contratto di ogni chiave**: di chi parla, chi la produce, quanto e
 * delicata (Wave 3, barriera).
 *
 * **Perche una tabella e non un attributo su ogni voce.** Le voci qui sopra
 * sono ottantatre e si leggono per gruppo — «Atleta», «Iscrizione/Pagamenti» —
 * perche cosi le cerca chi scrive un modello. Il contratto si legge invece per
 * **colonna**: «quali chiavi sono economiche?», «quali hanno senso in un
 * documento che parla di un allenatore?». Due domande diverse, due letture
 * diverse, e mescolarle avrebbe reso illeggibili entrambe. Un test verifica
 * che nessuna chiave resti fuori da questa tabella.
 *
 * **I tre soggetti che nessun modello puo dichiarare.** `sponsor`, `supplier`
 * ed `event` non sono soggetti di un documento: sono cose che vivono altrove —
 * i primi due in `clubs.sponsors`, il terzo in un invito. Marcandoli cosi,
 * `listPlaceholderTokensForSubject` **non li propone mai** e
 * `validateTemplateDraft` rifiuta un modello che li nomina. E la chiusura del
 * debito `DOC-04` senza togliere niente dal catalogo: le chiavi restano, per i
 * messaggi che le usano, e smettono di promettere qualcosa a chi scrive un
 * documento.
 */
const PLACEHOLDER_CONTRACT: Record<
  string,
  {
    subject: PlaceholderSubject;
    owner?: string;
    sensitivity?: PlaceholderSensitivity;
    nullable?: PlaceholderNullableBehaviour;
  }
> = {
  /* Il club: c'e sempre, qualunque sia il soggetto del modello. */
  "club.name": { subject: "club", owner: "resources:clubs" },
  "club.address": { subject: "club", owner: "resources:clubs" },
  "club.city": { subject: "club", owner: "resources:clubs" },
  "club.email": { subject: "club", owner: "resources:clubs" },
  "club.phone": { subject: "club", owner: "resources:clubs" },
  "club.fiscal_code": { subject: "club", owner: "resources:clubs" },
  "club.vat_number": { subject: "club", owner: "resources:clubs" },
  "club.website": { subject: "club", owner: "resources:clubs" },

  /* L'atleta e cio che gli ruota attorno. */
  "athlete.first_name": { subject: "athlete", owner: "athletes" },
  "athlete.last_name": { subject: "athlete", owner: "athletes" },
  "athlete.birth_date": { subject: "athlete", owner: "athletes" },
  "athlete.category_name": { subject: "athlete", owner: "athletes" },
  "athlete.fiscal_code": { subject: "athlete", owner: "athletes" },
  "athlete.address": { subject: "athlete", owner: "athletes" },
  "athlete.email": { subject: "athlete", owner: "athletes" },
  "athlete.phone": { subject: "athlete", owner: "athletes" },
  "athlete.jersey_number": { subject: "athlete", owner: "athletes" },
  "parent.1.first_name": { subject: "athlete", owner: "athlete-guardians" },
  "parent.1.last_name": { subject: "athlete", owner: "athlete-guardians" },
  "parent.1.email": { subject: "athlete", owner: "athlete-guardians" },
  "parent.1.phone": { subject: "athlete", owner: "athlete-guardians" },
  "parent.2.first_name": { subject: "athlete", owner: "athlete-guardians" },
  "parent.2.last_name": { subject: "athlete", owner: "athlete-guardians" },
  "parent.2.email": { subject: "athlete", owner: "athlete-guardians" },
  "parent.2.phone": { subject: "athlete", owner: "athlete-guardians" },
  "guardian.name": { subject: "athlete", owner: "athlete-guardians" },
  "fiscal_recipient.name": { subject: "athlete", owner: "fiscal-recipient" },
  "fiscal_recipient.fiscal_code": {
    subject: "athlete",
    owner: "fiscal-recipient",
  },
  "fiscal_recipient.address": { subject: "athlete", owner: "fiscal-recipient" },
  "category.name": { subject: "athlete", owner: "athletes" },
  "team.name": { subject: "athlete", owner: "athletes" },
  "registration.status": { subject: "athlete", owner: "athletes" },

  /* Il dato clinico. Non e G-33 — il permesso separato resta un gap — ma un
     certificato non deve finire in un documento generato da chi non lo vede. */
  "medical_certificate.status": {
    subject: "athlete",
    owner: "medical-certificates",
    sensitivity: "health",
  },
  "medical_certificate.expiry_date": {
    subject: "athlete",
    owner: "medical-certificates",
    sensitivity: "health",
  },

  /* Il denaro. `payment.plan` e il **nome** di un piano, non un importo: dice
     quale listino, non quanto. */
  "payment.plan": { subject: "athlete", owner: "payment-plans" },
  "payment.total_due": {
    subject: "athlete",
    owner: "installment-ledger",
    sensitivity: "economic",
  },
  "payment.total_paid": {
    subject: "athlete",
    owner: "installment-ledger",
    sensitivity: "economic",
  },
  "payment.remaining": {
    subject: "athlete",
    owner: "installment-ledger",
    sensitivity: "economic",
  },
  "installment.due_date": { subject: "athlete", owner: "installment-ledger" },
  "installment.description": {
    subject: "athlete",
    owner: "installment-ledger",
  },
  "installment.residual_amount": {
    subject: "athlete",
    owner: "installment-ledger",
    sensitivity: "economic",
  },
  "installment.overdue_count": {
    subject: "athlete",
    owner: "installment-ledger",
    sensitivity: "economic",
  },
  "payment.next_due_date": { subject: "athlete", owner: "installment-ledger" },
  "payment.link": {
    subject: "athlete",
    owner: "payment-links",
    sensitivity: "economic",
  },
  "attendance.sessions": { subject: "athlete", owner: "attendance-measure" },
  "attendance.hours": { subject: "athlete", owner: "attendance-measure" },

  /* Le persone del lavoro sportivo: allenatori e staff sono lo stesso
     soggetto, perche il documento parla di **una persona con un ruolo**. */
  "staff.first_name": { subject: "person", owner: "sport-work" },
  "staff.last_name": { subject: "person", owner: "sport-work" },
  "staff.role": { subject: "person", owner: "sport-work" },
  "staff.email": { subject: "person", owner: "sport-work" },
  "staff.phone": { subject: "person", owner: "sport-work" },
  "trainer.first_name": { subject: "person", owner: "sport-work" },
  "trainer.last_name": { subject: "person", owner: "sport-work" },
  "trainer.role": { subject: "person", owner: "sport-work" },
  "trainer.email": { subject: "person", owner: "sport-work" },
  "trainer.phone": { subject: "person", owner: "sport-work" },

  /* I soci. */
  "member.first_name": { subject: "member", owner: "resources:members" },
  "member.last_name": { subject: "member", owner: "resources:members" },
  "member.email": { subject: "member", owner: "resources:members" },
  "member.phone": { subject: "member", owner: "resources:members" },

  /*
    Il destinatario. In un **messaggio** e la persona a cui il messaggio arriva
    e lo risolve chi manda; in un **documento** e il soggetto stesso, e lo
    risolve il generatore. Vale quindi per qualunque modello: `system`.
  */
  "recipient.name": { subject: "system", owner: "generated-document" },
  "recipient.first_name": { subject: "system", owner: "generated-document" },

  /*
    Sponsor, fornitori ed eventi: **nessun modello puo dichiararli come
    soggetto**, quindi l'editor non li propone mai e un modello che li nomina
    non si pubblica. Restano in catalogo per i messaggi.
  */
  "sponsor.name": { subject: "sponsor", owner: "resources:sponsors" },
  "sponsor.contact_name": { subject: "sponsor", owner: "resources:sponsors" },
  "sponsor.email": { subject: "sponsor", owner: "resources:sponsors" },
  "sponsor.phone": { subject: "sponsor", owner: "resources:sponsors" },
  "supplier.name": { subject: "supplier", owner: "resources:sponsors" },
  "event.title": { subject: "event", owner: "trainings" },
  "event.date": { subject: "event", owner: "trainings" },
  "event.time": { subject: "event", owner: "trainings" },

  /* Il documento stesso, e cio che non dipende da nessun soggetto. */
  "document.title": { subject: "document", owner: "generated-document" },
  "document.date": { subject: "document", owner: "generated-document" },
  "current_date": { subject: "system", owner: "generated-document" },
  "season.year": { subject: "system", owner: "club-seasons" },
  "season.start_date": { subject: "system", owner: "club-seasons" },
  "season.end_date": { subject: "system", owner: "club-seasons" },
};

/**
 * I segnaposto, con il loro contratto applicato.
 *
 * E questa la lista che editor, risolutore e validatore leggono: la forma
 * grezza qui sopra esiste solo perche si legga per gruppo.
 */
export const DOCUMENT_TEMPLATE_TOKENS: DocumentTemplateToken[] =
  RAW_DOCUMENT_TEMPLATE_TOKENS.map((token) => {
    const key = normalizePlaceholderKey(token.value);
    const contract = PLACEHOLDER_CONTRACT[key];
    return contract ? { ...token, ...contract } : token;
  });

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

/** Le chiavi del catalogo, senza parentesi: e l'elenco chiuso. */
export const DOCUMENT_PLACEHOLDER_KEYS: string[] = [
  ...DOCUMENT_TEMPLATE_TOKENS,
  ...DOCUMENT_SIGNATURE_TOKENS,
].map((token) => normalizePlaceholderKey(token.value));

const PLACEHOLDER_KEY_SET = new Set(DOCUMENT_PLACEHOLDER_KEYS);

export const isKnownPlaceholderKey = (key: unknown) =>
  PLACEHOLDER_KEY_SET.has(normalizePlaceholderKey(key));

const TOKEN_BY_KEY = new Map(
  DOCUMENT_TEMPLATE_TOKENS.map((token) => [
    normalizePlaceholderKey(token.value),
    token,
  ]),
);

/** La voce di catalogo di una chiave, se e in catalogo. */
export const getPlaceholderToken = (
  key: unknown,
): DocumentTemplateToken | undefined =>
  TOKEN_BY_KEY.get(normalizePlaceholderKey(key));

/**
 * Il soggetto di una chiave. Predefinito `club`, che c'e sempre.
 *
 * I blocchi firma non sono nel catalogo dei token e non hanno soggetto: sono
 * uno spazio, non un dato. Rispondono `club` e vanno bene per qualunque
 * modello.
 */
export const getPlaceholderSubject = (key: unknown): PlaceholderSubject =>
  getPlaceholderToken(key)?.subject ?? "club";

export const getPlaceholderSensitivity = (
  key: unknown,
): PlaceholderSensitivity => getPlaceholderToken(key)?.sensitivity ?? "plain";

export const getPlaceholderNullableBehaviour = (
  key: unknown,
): PlaceholderNullableBehaviour =>
  getPlaceholderToken(key)?.nullable ?? "blank";

/**
 * Le chiavi che un modello con quel soggetto puo davvero riempire.
 *
 * `club`, `document` e `system` valgono sempre: sono cio che qualunque
 * documento ha. Il soggetto dichiarato dal modello aggiunge le sue.
 */
export const listPlaceholderTokensForSubject = (
  subject: TemplateSubjectKind,
): DocumentTemplateToken[] =>
  DOCUMENT_TEMPLATE_TOKENS.filter((token) => {
    const tokenSubject = token.subject ?? "club";
    if (
      tokenSubject === "club" ||
      tokenSubject === "document" ||
      tokenSubject === "system"
    ) {
      return true;
    }
    return tokenSubject === subject;
  });

/**
 * Le classi sensibili presenti in un insieme di chiavi, senza `plain`.
 *
 * E cio che una versione di modello congela alla pubblicazione, e cio su cui
 * si decide chi puo generare quel documento.
 */
export const collectPlaceholderSensitivities = (
  keys: Iterable<string>,
): PlaceholderSensitivity[] => {
  const found = new Set<PlaceholderSensitivity>();
  for (const key of keys) {
    const sensitivity = getPlaceholderSensitivity(key);
    if (sensitivity !== "plain") found.add(sensitivity);
  }
  return [...found].sort();
};

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
 *
 * **Perche adesso e derivato e non piu scritto a mano** (Wave 3, barriera).
 * Era un secondo elenco accanto al catalogo, e il commento qui sopra gia
 * spiegava il rischio: una chiave di importo aggiunta nel catalogo e
 * dimenticata qui sarebbe finita in un messaggio a chi non puo vederla. Ora la
 * sensibilita e una proprieta della **voce di catalogo** e questo elenco la
 * legge. Le sei chiavi sono le stesse di prima, e un test lo verifica.
 */
export const ECONOMIC_PLACEHOLDER_KEYS: string[] = DOCUMENT_TEMPLATE_TOKENS
  .filter((token) => token.sensitivity === "economic")
  .map((token) => normalizePlaceholderKey(token.value));

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
