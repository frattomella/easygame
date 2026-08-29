import {
  ATTESTATION_TEMPLATE_CONTENT,
  ATTESTATION_TEMPLATE_DESCRIPTION,
  ATTESTATION_TEMPLATE_ID,
  ATTESTATION_TEMPLATE_TITLE,
} from "../attestation-template";
import { isDistributable, type CatalogEntry } from "./model";

export * from "./model";

/**
 * Il catalogo dei modelli di EasyGame.
 *
 * **Dieci voci, non settantasette.** Golee ne ha settantasette e li mantiene;
 * noi non li manteniamo, quindi non li promettiamo. Il criterio per entrare non
 * e «cosa ha il concorrente» ma: *lo chiede ogni club, ogni anno, e i dati per
 * compilarlo li abbiamo gia*. Un modello che non passa tutti e tre i test non
 * entra (§6 del planning).
 *
 * **Sei si distribuiscono, quattro no, e la differenza e dichiarata.** Le
 * quattro che restano ferme (`pending_review`) contengono dichiarazioni di
 * responsabilita o riferimenti normativi che nessuno di noi ha validato: sono
 * scritte — cosi un professionista ha un testo da leggere invece di un foglio
 * bianco — ma non vengono proposte a nessun club. Il §17 dell'incarico dice
 * esattamente questo: se un modello apparentemente A contiene affermazioni
 * normative non validate, non si distribuisce e si registra.
 *
 * **Il catalogo non cresce senza un proprietario.** Aggiungere l'undicesima
 * voce e una decisione con un costo ricorrente, non una riga di contenuto.
 *
 * Modulo **puro**: e testo, versionato con il repository. Non e codice, e non
 * conosce ne Prisma ne la rete.
 */

/** Chi risponde del testo delle voci che distribuiamo. */
const REDAZIONE = "EasyGame — redazione di prodotto";

/** La data dell'ultima rilettura di tutto il catalogo iniziale. */
const REVISIONE = "2026-08-29";

/**
 * L'intestazione comune: club, e a chi si rivolge il foglio.
 *
 * Non e un componente e non e un parziale: e testo copiato in ogni voce, di
 * proposito. Un modello adottato **e del club** e da quel momento si modifica
 * liberamente; un'intestazione condivisa cambierebbe sotto i piedi a chi lo ha
 * gia adottato, che e esattamente cio che il versionamento esiste per
 * impedire.
 */
const intestazione = () =>
  `<p style="text-align: center;"><strong>{{club.name}}</strong><br />{{club.address}} — {{club.city}}<br />C.F. {{club.fiscal_code}} — P.IVA {{club.vat_number}}</p>`;

const chiusura = () =>
  `<p>{{club.city}}, {{current_date}}</p><p>Il Presidente</p><p>{{signature.club_representative}}</p><p>{{stamp.club}}</p>`;

export const DOCUMENT_CATALOG: CatalogEntry[] = [
  /* ============================================ le sei che distribuiamo */

  {
    /*
      La prima voce **e** il modello che la Wave 1 seminava a mano dal pulsante
      «Aggiungi attestazione di pagamento». Non se ne scrive una copia: si
      importa quella, o il giorno in cui una delle due cambia il club si
      troverebbe due attestazioni diverse con lo stesso nome.
    */
    key: ATTESTATION_TEMPLATE_ID,
    title: ATTESTATION_TEMPLATE_TITLE,
    description: ATTESTATION_TEMPLATE_DESCRIPTION,
    subjectKind: "athlete",
    catalogClass: "A",
    status: "active",
    editorialOwner: REDAZIONE,
    lastReviewedAt: REVISIONE,
    content: ATTESTATION_TEMPLATE_CONTENT,
  },

  {
    /*
      La stessa attestazione **senza gli importi**, e non e una variante
      cosmetica: e la sola che una segreteria senza accesso alla cassa possa
      generare. Il permesso guarda cosa il documento dice, quindi due testi
      diversi sono davvero due modelli.
    */
    key: "attestazione-frequenza",
    title: "Attestazione di frequenza",
    description:
      "Dichiara quante sedute e quante ore l'atleta ha svolto nella stagione. Senza importi: la genera anche chi non vede la cassa.",
    subjectKind: "athlete",
    catalogClass: "A",
    status: "active",
    editorialOwner: REDAZIONE,
    lastReviewedAt: REVISIONE,
    content: `<h1 style="text-align: center;">ATTESTAZIONE DI FREQUENZA</h1>
${intestazione()}
<p>Il/La sottoscritto/a legale rappresentante della societa sopra indicata</p>
<p style="text-align: center;"><strong>ATTESTA</strong></p>
<p>che <strong>{{athlete.first_name}} {{athlete.last_name}}</strong>, nato/a il {{athlete.birth_date}}, codice fiscale {{athlete.fiscal_code}}, ha svolto attivita sportiva presso questa societa nella stagione <strong>{{season.year}}</strong>, dal {{season.start_date}} al {{season.end_date}}, nella categoria {{athlete.category_name}}.</p>
<p>Nel medesimo periodo ha partecipato a <strong>{{attendance.sessions}}</strong> sedute di allenamento, per complessive <strong>{{attendance.hours}}</strong> ore.</p>
<p>La presente attestazione viene rilasciata su richiesta dell'interessato per gli usi consentiti dalla legge.</p>
${chiusura()}`,
  },

  {
    key: "dichiarazione-iscrizione",
    title: "Dichiarazione di iscrizione all'attivita",
    description:
      "Il foglio che scuola, datore di lavoro ed ente locale chiedono a stagione aperta.",
    subjectKind: "athlete",
    catalogClass: "A",
    status: "active",
    editorialOwner: REDAZIONE,
    lastReviewedAt: REVISIONE,
    content: `<h1 style="text-align: center;">DICHIARAZIONE DI ISCRIZIONE</h1>
${intestazione()}
<p>Si dichiara che <strong>{{athlete.first_name}} {{athlete.last_name}}</strong>, nato/a il {{athlete.birth_date}}, residente in {{athlete.address}}, risulta iscritto/a alle attivita sportive organizzate da questa societa per la stagione <strong>{{season.year}}</strong>.</p>
<p>L'atleta e inserito/a nel gruppo <strong>{{athlete.category_name}}</strong>. Stato dell'iscrizione: {{registration.status}}.</p>
<p>La presente dichiarazione viene rilasciata a richiesta dell'interessato per gli usi consentiti dalla legge.</p>
${chiusura()}`,
  },

  {
    /*
      Non e una ricevuta e non deve sembrarlo: le ricevute sono documenti
      fiscali con una numerazione propria (ADR-0044, ADR-0047) e si emettono da
      un'altra parte. Questo e un **avviso**, cioe cio che una segreteria
      consegna o allega a un messaggio per dire «manca questo, entro questa
      data, e si paga cosi».
    */
    key: "avviso-versamento-quota",
    title: "Avviso di versamento della quota",
    description:
      "Dice quanto manca, entro quando, e con quale link si paga. Non e una ricevuta fiscale.",
    subjectKind: "athlete",
    catalogClass: "A",
    status: "active",
    editorialOwner: REDAZIONE,
    lastReviewedAt: REVISIONE,
    content: `<h1 style="text-align: center;">AVVISO DI VERSAMENTO</h1>
${intestazione()}
<p>Gentile {{guardian.name}},</p>
<p>con riferimento alla posizione di <strong>{{athlete.first_name}} {{athlete.last_name}}</strong> per la stagione {{season.year}}, risulta quanto segue.</p>
<p>Piano di pagamento: <strong>{{payment.plan}}</strong>.<br />Totale dovuto: {{payment.total_due}} euro.<br />Gia versato: {{payment.total_paid}} euro.<br />Residuo: <strong>{{payment.remaining}} euro</strong>.</p>
<p>Prossima scadenza: <strong>{{payment.next_due_date}}</strong> — {{installment.description}}, residuo {{installment.residual_amount}} euro.</p>
<p>Il versamento si puo effettuare da questo collegamento: {{payment.link}}</p>
<p>Il presente avviso non costituisce documento fiscale. La ricevuta viene emessa a incasso avvenuto.</p>
${chiusura()}`,
  },

  {
    /*
      **Non e il modulo della ASL.** Golee ne mantiene trentatre, di cui trenta
      per territorio: e il suo fossato editoriale, e il §17 del planning dice
      che non lo apriamo. Questa e una lettera del club al medico, che vale
      ovunque perche non pretende di essere un modulo regionale — e il caso
      d'uso della stampa massiva a settembre.
    */
    key: "richiesta-visita-medico-sportiva",
    title: "Richiesta di visita medico-sportiva",
    description:
      "Lettera del club al medico per la visita di idoneita. Non e il modulo regionale della ASL: quello lo carica il club.",
    subjectKind: "athlete",
    catalogClass: "A",
    status: "active",
    editorialOwner: REDAZIONE,
    lastReviewedAt: REVISIONE,
    content: `<h1 style="text-align: center;">RICHIESTA DI VISITA MEDICO-SPORTIVA</h1>
${intestazione()}
<p>Al medico certificatore</p>
<p>Si richiede la visita per il rilascio della certificazione di idoneita all'attivita sportiva per:</p>
<p><strong>{{athlete.first_name}} {{athlete.last_name}}</strong>, nato/a il {{athlete.birth_date}}, codice fiscale {{athlete.fiscal_code}}, residente in {{athlete.address}}.</p>
<p>L'atleta pratica attivita presso questa societa nel gruppo <strong>{{athlete.category_name}}</strong>, stagione {{season.year}}.</p>
<p>Recapito della famiglia: {{parent.1.first_name}} {{parent.1.last_name}} — {{parent.1.phone}} — {{parent.1.email}}.</p>
<p>Si ringrazia per la collaborazione.</p>
${chiusura()}`,
  },

  {
    /*
      Il vantaggio V-01 che arriva sul foglio. La frequenza non e dichiarata a
      occhio: e **misurata dal server** con la stessa funzione che rendiconta i
      contributi pubblici (ADR-0037), e gli importi vengono dal registro
      incassi. E la ragione per cui un ente puo accettarlo.
    */
    key: "attestazione-bando-voucher",
    title: "Attestazione per bando o voucher sportivo",
    description:
      "Importi versati e frequenza misurata, nel formato che un ente erogatore chiede.",
    subjectKind: "athlete",
    catalogClass: "A",
    status: "active",
    editorialOwner: REDAZIONE,
    lastReviewedAt: REVISIONE,
    content: `<h1 style="text-align: center;">ATTESTAZIONE PER BANDO O VOUCHER SPORTIVO</h1>
${intestazione()}
<p>Il/La sottoscritto/a legale rappresentante della societa sopra indicata</p>
<p style="text-align: center;"><strong>ATTESTA</strong></p>
<p>che <strong>{{athlete.first_name}} {{athlete.last_name}}</strong>, nato/a il {{athlete.birth_date}}, codice fiscale {{athlete.fiscal_code}}, ha frequentato le attivita sportive di questa societa nella stagione <strong>{{season.year}}</strong> (dal {{season.start_date}} al {{season.end_date}}), partecipando a <strong>{{attendance.sessions}}</strong> sedute per complessive <strong>{{attendance.hours}}</strong> ore.</p>
<p>Per la partecipazione risulta versata la somma di <strong>{{payment.total_paid}} euro</strong>, a fronte di un dovuto di {{payment.total_due}} euro.</p>
<p>Il versamento risulta effettuato da <strong>{{fiscal_recipient.name}}</strong>, codice fiscale {{fiscal_recipient.fiscal_code}}, residente in {{fiscal_recipient.address}}.</p>
<p>La presente attestazione viene rilasciata ai fini della partecipazione al bando indicato dall'interessato.</p>
${chiusura()}`,
  },

  /* ================== le quattro scritte e NON distribuite (classe C) ==== */

  {
    /*
      **Perche non si distribuisce.** Un'informativa privacy cita il
      Regolamento (UE) 2016/679, dichiara basi giuridiche, tempi di
      conservazione e diritti dell'interessato: sono affermazioni normative, e
      nessuno in questo repository e nella posizione di validarle. Distribuirla
      significherebbe che EasyGame risponde di un'informativa che non ha fatto
      controllare.

      Il testo c'e — cosi un professionista ha qualcosa da leggere — ma non
      viene proposto a nessun club. Il consenso **come oggetto** resta comunque
      disponibile: e il dominio dei consensi (W3-C), che non ha bisogno di
      questo foglio per funzionare.
    */
    key: "informativa-consenso-privacy",
    title: "Informativa e consenso al trattamento dei dati",
    description:
      "Scheletro dell'informativa. Da far validare: contiene riferimenti normativi.",
    subjectKind: "athlete",
    catalogClass: "C",
    status: "pending_review",
    editorialOwner: "Da assegnare — richiede validazione professionale",
    lastReviewedAt: REVISIONE,
    notes:
      "Cita il Regolamento (UE) 2016/679: basi giuridiche, tempi di conservazione e diritti dell'interessato vanno verificati da un professionista prima di qualunque distribuzione.",
    content: `<h1 style="text-align: center;">INFORMATIVA E CONSENSO AL TRATTAMENTO DEI DATI</h1>
${intestazione()}
<p><em>Testo da validare. Questo scheletro non e stato verificato da un professionista e non deve essere consegnato cosi com'e.</em></p>
<p>Titolare del trattamento: <strong>{{club.name}}</strong>, {{club.address}} — {{club.city}}, C.F. {{club.fiscal_code}}, {{club.email}}.</p>
<p>Interessato: <strong>{{athlete.first_name}} {{athlete.last_name}}</strong>, nato/a il {{athlete.birth_date}}. Per i minori, il consenso e espresso da chi esercita la responsabilita genitoriale: {{guardian.name}}.</p>
<p>Finalita del trattamento: [DA COMPLETARE].<br />Base giuridica: [DA COMPLETARE].<br />Periodo di conservazione: [DA COMPLETARE].<br />Diritti dell'interessato: [DA COMPLETARE].</p>
<p>{{club.city}}, {{current_date}}</p>
<p>{{signature.parent}}</p>`,
  },

  {
    /*
      Stessa ragione dell'informativa: un consenso alla pubblicazione di
      immagini di un **minore** ha effetti che vanno oltre il gestionale, e la
      formula corretta non la decide chi scrive software.

      Nota che il dominio dei consensi (W3-C) copre gia la parte che conta —
      dimostrabilita e revoca — senza questo foglio: la revoca vive in
      `consent_records`, non in un PDF.
    */
    key: "consenso-immagini",
    title: "Consenso all'uso di immagini e video",
    description:
      "Scheletro della liberatoria per foto e video. Da far validare: riguarda minori.",
    subjectKind: "athlete",
    catalogClass: "C",
    status: "pending_review",
    editorialOwner: "Da assegnare — richiede validazione professionale",
    lastReviewedAt: REVISIONE,
    notes:
      "Riguarda l'immagine di minori e la sua diffusione, anche online. Il dominio dei consensi copre gia dimostrabilita e revoca senza questo documento.",
    content: `<h1 style="text-align: center;">CONSENSO ALL'USO DI IMMAGINI E VIDEO</h1>
${intestazione()}
<p><em>Testo da validare. Questo scheletro non e stato verificato da un professionista e non deve essere consegnato cosi com'e.</em></p>
<p>Il/La sottoscritto/a <strong>{{guardian.name}}</strong>, in qualita di esercente la responsabilita genitoriale su <strong>{{athlete.first_name}} {{athlete.last_name}}</strong>, nato/a il {{athlete.birth_date}},</p>
<p>relativamente alle immagini e ai video ripresi nel corso delle attivita organizzate da {{club.name}}: [AMBITO, DURATA E CANALI DI DIFFUSIONE DA COMPLETARE].</p>
<p>{{club.city}}, {{current_date}}</p>
<p>{{signature.parent}}</p>`,
  },

  {
    key: "liberatoria-trasferta",
    title: "Autorizzazione alla trasferta",
    description:
      "Scheletro dell'autorizzazione per la trasferta di un minore. Da far validare.",
    subjectKind: "athlete",
    catalogClass: "C",
    status: "pending_review",
    editorialOwner: "Da assegnare — richiede validazione professionale",
    lastReviewedAt: REVISIONE,
    notes:
      "Assegna responsabilita durante il trasporto e la permanenza fuori sede: la formula corretta non la decide chi scrive software.",
    content: `<h1 style="text-align: center;">AUTORIZZAZIONE ALLA TRASFERTA</h1>
${intestazione()}
<p><em>Testo da validare. Questo scheletro non e stato verificato da un professionista e non deve essere consegnato cosi com'e.</em></p>
<p>Il/La sottoscritto/a <strong>{{guardian.name}}</strong>, esercente la responsabilita genitoriale su <strong>{{athlete.first_name}} {{athlete.last_name}}</strong>, autorizza la partecipazione alla trasferta organizzata da {{club.name}}.</p>
<p>Destinazione, date, modalita di trasporto e accompagnatori: [DA COMPLETARE].</p>
<p>Recapiti in caso di necessita: {{parent.1.phone}} — {{parent.2.phone}}.</p>
<p>{{club.city}}, {{current_date}}</p>
<p>{{signature.parent}}</p>`,
  },

  {
    key: "delega-ritiro-minore",
    title: "Delega al ritiro del minore",
    description:
      "Scheletro della delega a ritirare il minore al termine dell'attivita. Da far validare.",
    subjectKind: "athlete",
    catalogClass: "C",
    status: "pending_review",
    editorialOwner: "Da assegnare — richiede validazione professionale",
    lastReviewedAt: REVISIONE,
    notes:
      "Sposta la responsabilita della custodia di un minore su una persona diversa dal genitore. Va scritta da chi risponde di quella responsabilita, non da noi.",
    content: `<h1 style="text-align: center;">DELEGA AL RITIRO DEL MINORE</h1>
${intestazione()}
<p><em>Testo da validare. Questo scheletro non e stato verificato da un professionista e non deve essere consegnato cosi com'e.</em></p>
<p>Il/La sottoscritto/a <strong>{{guardian.name}}</strong>, esercente la responsabilita genitoriale su <strong>{{athlete.first_name}} {{athlete.last_name}}</strong>, delega al ritiro del minore al termine delle attivita le seguenti persone:</p>
<p>[NOME, COGNOME, DOCUMENTO E RECAPITO DI CIASCUN DELEGATO — DA COMPLETARE]</p>
<p>Validita e modalita di revoca della delega: [DA COMPLETARE].</p>
<p>{{club.city}}, {{current_date}}</p>
<p>{{signature.parent}}</p>`,
  },
];

/** Le voci che un club puo davvero adottare. */
export const DISTRIBUTABLE_CATALOG = DOCUMENT_CATALOG.filter(isDistributable);

export const findCatalogEntry = (key: unknown) =>
  DOCUMENT_CATALOG.find(
    (entry) => entry.key === String(key || "").trim(),
  ) || null;
