import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Le due funzioni che nessuno poteva usare.**
 *
 * Un audit ha trovato due capability dichiarate complete e irraggiungibili
 * dalla UI, tutte e due nella stessa forma: dominio, rotta, test e collaudo
 * verdi, e nessuna schermata che li chiamasse.
 *
 * 1. il **rinnovo**. `GET|POST /api/v1/family/enrollment-requests/renewal`,
 *    `buildRenewalDraft` e `submitRenewalForm` esistevano da una Wave e
 *    nessun `.tsx` nominava il rinnovo: la pagina «Iscrizione e rinnovo»
 *    sapeva leggere una pratica `kind === "renewal"` e non sapeva crearne una;
 * 2. **chiedere un documento invece di respingere**. Il server leggeva
 *    `document_requests`, il client `decideSubmission` accettava solo
 *    `{action, note, subjects}`, e `requestMissingDocuments` restituiva `[]`
 *    ogni volta.
 *
 * Questi test difendono il **collegamento**, non l'estetica: la regressione
 * che intercettano e che qualcuno tolga il pulsante, o riscriva la chiamata
 * dimenticando il campo — cioe che le due funzioni tornino irraggiungibili
 * restando verdi in tutti gli altri test.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8").replace(
    /\r\n/g,
    "\n",
  );

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const API = "lib/api/forms.ts";
const RENEWAL = "components/enrollment/renewal-form.tsx";
const FAMILY_PAGES = "components/parent-dashboard/parent-family-pages.tsx";
const REVIEW_DIALOG = "components/forms/submission-review-dialog.tsx";
const MISSING_FIELD = "components/forms/missing-documents-field.tsx";

/* =============================================== 1 — il rinnovo si apre === */

test("la pagina «Iscrizione e rinnovo» monta il modulo di rinnovo", () => {
  const source = stripComments(read(FAMILY_PAGES));

  assert.match(
    source,
    /import\s*\{[^}]*RenewalForm[^}]*\}\s*from\s*"@\/components\/enrollment\/renewal-form"/,
    "la pagina della famiglia non importa piu il modulo di rinnovo",
  );
  assert.match(
    source,
    /<RenewalForm[\s\S]*?publicSlug=\{slugRinnovo\}/,
    "il modulo di rinnovo non viene montato con lo slug scelto",
  );
  assert.ok(
    source.includes("Apri il rinnovo"),
    "non c'e nessun comando che apra il rinnovo",
  );
});

test("il modulo si sceglie fra quelli pubblicati, non da un link", () => {
  const source = stripComments(read(FAMILY_PAGES));

  assert.ok(
    source.includes("formsApi.fetchRenewalForms(athleteId)"),
    "la pagina non chiede al club quali moduli di rinnovo ha pubblicato",
  );
  assert.match(
    source,
    /<SelectItem[\s\S]*?value=\{modulo\.publicSlug\}/,
    "i moduli pubblicati non compaiono come scelta",
  );

  /*
    La regressione da intercettare e il ritorno al difetto: la scelta che
    ridiventa un campo in cui incollare il link ricevuto dalla societa, cioe
    una funzione che esiste solo per chi sa gia che esiste. Il parametro
    `?modulo=` resta lecito — e una scorciatoia, non l'unica strada.
  */
  assert.ok(
    !/Link del modulo di rinnovo|linkRinnovo|Incolla/.test(source),
    "la scelta del modulo e tornata a dipendere da un link incollato",
  );
});

test("i due casi limite dell'elenco sono detti, non subiti", () => {
  const source = stripComments(read(FAMILY_PAGES));

  assert.match(
    source,
    /elenco\.length === 1 \? elenco\[0\]\.publicSlug/,
    "con un modulo solo si fa comunque scegliere: un menu con una voce sola non informa",
  );
  assert.ok(
    source.includes("non ha pubblicato nessun modulo di rinnovo"),
    "senza moduli pubblicati la pagina non lo dice: resterebbe una scelta vuota",
  );
  assert.ok(
    /statoModuli === "loading"/.test(source) &&
      /statoModuli === "error"/.test(source),
    "caricamento ed errore non sono distinti: un elenco che non arriva verrebbe raccontato come «non c'e niente da rinnovare»",
  );
});

test("dopo l'invio l'elenco delle pratiche viene riletto", () => {
  const source = stripComments(read(FAMILY_PAGES));

  assert.match(
    source,
    /onSent=\{[\s\S]*?setVersione\(/,
    "l'invio del rinnovo non fa rileggere le pratiche: la pratica appena inviata non comparirebbe",
  );
  assert.match(
    source,
    /\}, \[athleteId, showToast, versione\]\)/,
    "la lettura delle pratiche non dipende dalla versione: nessuna rilettura",
  );
});

test("il rinnovo riusa FormRenderer invece di disegnare un secondo modulo", () => {
  const source = stripComments(read(RENEWAL));

  assert.match(
    source,
    /import\s*\{\s*FormRenderer\s*\}\s*from\s*"@\/components\/forms\/form-renderer"/,
    "il rinnovo non usa il renderer condiviso",
  );
  assert.match(
    source,
    /prefilledFieldIds=\{draft\.prefilledFieldIds\}/,
    "i campi precompilati non vengono dichiarati: un modulo gia pieno senza spiegazione sembra gia inviato",
  );

  for (const primitiva of ["Textarea", "SelectItem", "Checkbox"]) {
    assert.ok(
      !source.includes(primitiva),
      `«${primitiva}» qui vuol dire un secondo motore di rendering dei campi`,
    );
  }
});

test("la stagione la decide il server: nel rinnovo non si sceglie", () => {
  const source = stripComments(read(RENEWAL));

  assert.ok(
    source.includes("draft.seasonLabel"),
    "la stagione di destinazione non viene mostrata a chi compila",
  );
  assert.ok(
    !/setSeason|seasonId=|onValueChange/.test(source),
    "il rinnovo offre una scelta della stagione: la stagione la decide il server",
  );
});

test("il riferimento della ricevuta non si consegna nell'area autenticata", () => {
  const source = read(RENEWAL);

  assert.ok(
    !stripComments(source).includes("receiptReference"),
    "il riferimento della ricevuta viene mostrato: qui c'e una sessione e la pratica e in elenco, e una credenziale al portatore in piu",
  );
  assert.ok(
    source.includes("Perche qui non si consegna il riferimento della ricevuta"),
    "la scelta di non mostrare la ricevuta non e motivata nel file",
  );
});

test("il trasporto del rinnovo sta in lib/api, non nei componenti", () => {
  const api = stripComments(read(API));

  assert.match(
    api,
    /\/api\/v1\/family\/enrollment-requests\/renewal\?athlete_id=/,
    "il client non chiama la rotta del rinnovo",
  );
  assert.ok(
    api.includes("export const fetchRenewalForms") &&
      api.includes("export const fetchRenewalDraft") &&
      api.includes("export const submitRenewal"),
    "mancano le tre funzioni del rinnovo: elenco dei moduli, bozza e invio",
  );
  assert.match(
    api,
    /publicSlug \? `&slug=\$\{encodeURIComponent\(publicSlug\)\}` : ""/,
    "l'indirizzo del rinnovo non e piu uno solo: senza slug la stessa rotta risponde l'elenco",
  );
  assert.ok(
    api.includes("body.append(`file:${fieldId}`"),
    "gli allegati del rinnovo non viaggiano nella parte «file:<idCampo>», l'unico posto in cui il client dice a quale campo appartengono",
  );

  const renewal = stripComments(read(RENEWAL));
  assert.ok(
    !/fetch\(\s*["'`]\/api/.test(renewal),
    "il componente parla direttamente con /api: il trasporto passa da lib/api (CLAUDE.md §2)",
  );
});

test("gli errori campo per campo dell'invio non vengono buttati via", () => {
  const api = stripComments(read(API));
  const invio = api.slice(api.indexOf("export const submitRenewal"));

  assert.ok(
    invio.includes("fieldErrors"),
    "l'invio del rinnovo non restituisce gli errori dei singoli campi",
  );

  const renewal = stripComments(read(RENEWAL));
  assert.match(
    renewal,
    /setErrors\(esito\.fieldErrors\)/,
    "gli errori dei campi non arrivano al modulo: chi compila non sa cosa correggere",
  );
});

test("il modulo di rinnovo resta usabile a 375 px", () => {
  const source = stripComments(read(RENEWAL));
  const comandi = source.match(/min-h-\[44px\]/g) || [];

  assert.ok(
    comandi.length >= 2,
    "i comandi del rinnovo non dichiarano l'altezza minima da telefono",
  );
  assert.ok(
    !/\bw-\[\d+px\]|\bmin-w-\[\d{3,}px\]/.test(source),
    "il rinnovo ha una larghezza fissa in pixel",
  );
});

/* ================================ 2 — i documenti mancanti arrivano al server */

test("decideSubmission accetta e invia i documenti mancanti", () => {
  const source = stripComments(read(API));
  const decisione = source.slice(
    source.indexOf("export const decideSubmission"),
    source.indexOf("Compila un modulo dalla segreteria"),
  );

  assert.ok(
    decisione.includes("documentRequests?: MissingDocumentRequest[]"),
    "il tipo della decisione non prevede i documenti mancanti",
  );
  assert.ok(
    decisione.includes("document_requests:"),
    "i documenti mancanti non vengono inviati con il nome che la rotta legge",
  );

  /* La forma esatta che `normalizeMissingDocuments` accetta, e nessun'altra. */
  for (const chiave of ["document_kind:", "title:", "due_date:", "required:"]) {
    assert.ok(
      decisione.includes(chiave),
      `manca «${chiave}» nella richiesta documentale inviata`,
    );
  }
});

test("il dialogo di revisione ha il controllo dei documenti mancanti", () => {
  const source = stripComments(read(REVIEW_DIALOG));

  assert.match(
    source,
    /import\s*\{[\s\S]*?MissingDocumentsField[\s\S]*?\}\s*from\s*"\.\/missing-documents-field"/,
    "il dialogo non monta il controllo dei documenti mancanti",
  );
  assert.match(
    source,
    /<MissingDocumentsField[\s\S]*?onChange=\{setMissingDocuments\}/,
    "il controllo non e collegato allo stato del dialogo",
  );
  assert.match(
    source,
    /documentRequests:\s*\n?\s*action === "approve"/,
    "i documenti mancanti non sono legati all'approvazione: si chiedono approvando, non respingendo",
  );
});

test("i tipi di documento sono quelli che il club gia usa", () => {
  const source = stripComments(read(MISSING_FIELD));

  /*
    W6-47. L'invariante non cambia — **un solo vocabolario dei tipi** — cambia
    dove vive.

    Stava in `src/lib/shared-documents.ts`, che e il file destinato alla
    cancellazione (lane 5J) e che non conosceva ne la tessera sanitaria ne la
    delega: due dei documenti che una segreteria chiede piu spesso. Il catalogo
    canonico e ora nel dominio documentale nuovo, con gli alias storici, e
    sopravvive a quella cancellazione.

    Il difetto che questo test presidia resta lo stesso: due «certificato
    medico» diversi, di cui uno solo viene promosso nel fascicolo.
  */
  assert.match(
    source,
    /from\s*"@\/lib\/documents\/kind-catalog"/,
    "il controllo si e scritto un elenco di tipi tutto suo: due «certificato medico» diversi, e solo uno viene promosso nel fascicolo",
  );
  assert.ok(
    source.includes("DOCUMENT_KIND_OPTIONS"),
    "le voci proponibili vengono dal catalogo canonico",
  );
  assert.ok(
    !/const\s+\w*(TIPI|KINDS|TYPES)\w*\s*=\s*\[/.test(source),
    "c'e un secondo vocabolario dei tipi di documento dentro il controllo",
  );
});

test("una riga senza tipo non diventa una richiesta", () => {
  const source = stripComments(read(MISSING_FIELD));

  assert.match(
    source,
    /export const collectMissingDocuments[\s\S]*?\.filter\(/,
    "le righe incomplete verrebbero inviate: il server le scarta comunque, e la chiamata direbbe piu di cio che succede",
  );
  assert.ok(
    source.includes("canRequest"),
    "il controllo non dice quando non c'e nessun atleta a cui intestare la richiesta",
  );
});
