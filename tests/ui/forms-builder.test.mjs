import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Modulistica V2 — le regole di interfaccia.
 *
 * Test sul sorgente, come le altre regole di UI (il progetto non ha un
 * renderer di componenti: vedi 15 — Testing). Non provano che il builder sia
 * piacevole da usare: nessun test statico puo dirlo. Presidiano le quattro
 * cose che si perdono per prime, e che si sono gia perse una volta nella
 * versione precedente:
 *
 * 1. la logica non torna dentro `page.tsx`;
 * 2. nessun componente parla con `/api` senza passare da `@/lib/api/forms`;
 * 3. l'utente non vede mai un identificativo tecnico al posto di un'etichetta;
 * 4. niente resta a due colonne a 375 px, e i modali restano scorrevoli.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");
const readCode = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PAGE = "app/modulistica/page.tsx";

const COMPONENTS = [
  "components/forms/forms-dashboard.tsx",
  "components/forms/form-builder.tsx",
  "components/forms/form-field-card.tsx",
  "components/forms/form-renderer.tsx",
  "components/forms/form-public-link.tsx",
  "components/forms/dynamic-field-picker.tsx",
  "components/forms/submission-review-dialog.tsx",
  "components/forms/public-form-page.tsx",
  "components/forms/signature-pad.tsx",
];

const DIALOGS = [
  "components/forms/dynamic-field-picker.tsx",
  "components/forms/submission-review-dialog.tsx",
];

/* ------------------------------------------------------------ struttura */

test("la scheda «Moduli online» monta il componente dedicato", () => {
  const page = readCode(PAGE);

  assert.match(page, /<FormsDashboard\s*\/>/);
  assert.match(
    page,
    /import \{ FormsDashboard \} from "@\/components\/forms\/forms-dashboard"/,
  );
});

test("la pagina Modulistica non contiene logica dei moduli online", () => {
  const page = readCode(PAGE);

  for (const residuo of [
    "createFormTemplate",
    "publishForm",
    "publicSlug",
    "online_form",
    "FormSchema",
  ]) {
    assert.ok(
      !page.includes(residuo),
      `${residuo} e logica di dominio e non deve stare in page.tsx`,
    );
  }
});

test("la prima versione del builder e stata rimossa, non affiancata", () => {
  for (const rimosso of [
    "components/forms/OnlineFormsDashboard.tsx",
    "components/forms/OnlinePublicForm.tsx",
    "components/forms/FormShareDialog.tsx",
  ]) {
    assert.equal(
      existsSync(path.join(SRC, ...rimosso.split("/"))),
      false,
      `${rimosso} esiste ancora: due implementazioni della stessa cosa`,
    );
  }
});

/* ------------------------------------------------------------- trasporto */

test("nessun componente chiama /api senza passare dal modulo di trasporto", () => {
  const offenders = COMPONENTS.filter((file) => {
    const source = readCode(file);
    if (!/fetch\(/.test(source)) return false;
    // Il modulo pubblico non ha sessione ne club attivo: vedi lib/api/forms.
    return file !== "components/forms/public-form-page.tsx";
  });

  assert.deepEqual(
    offenders,
    [],
    "usare @/lib/api/forms: nessun fetch diretto a /api da un componente",
  );
});

test("il modulo pubblico non attacca gli header del club a chi non ce l'ha", () => {
  const source = readCode("components/forms/public-form-page.tsx");

  assert.ok(
    !source.includes("@/lib/api/client"),
    "apiRequest aggiunge x-active-club-id letto dal browser di chi compila",
  );
  assert.match(source, /fetch\(`\/api\/public\/forms\//);
});

test("nessun componente client importa il servizio server dei moduli", () => {
  const offenders = COMPONENTS.filter((file) =>
    /@\/lib\/server\//.test(read(file)),
  );

  assert.deepEqual(offenders, [], "i moduli server sono server-only");
});

/* ------------------------------------------------ etichette, non chiavi */

test("l'utente non legge mai un identificativo tecnico di un dato", () => {
  const offenders = [];

  for (const file of COMPONENTS) {
    const source = readCode(file);
    /*
      `guardian.phone` e simili sono chiavi di serializzazione. Se compaiono
      in un componente vuol dire che qualcuno le sta mostrando, o peggio le
      sta confrontando a mano invece di usare il catalogo.
    */
    if (/["'`](athlete|guardian|trainer|staff|member|club)\.[a-zA-Z]+["'`]/.test(source)) {
      offenders.push(file);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "usare getDynamicFieldLabel: la UI mostra «Telefono del genitore»",
  );
});

test("il selettore dei dati mostra etichette e segnala la sola lettura", () => {
  const picker = readCode("components/forms/dynamic-field-picker.tsx");

  assert.match(picker, /field\.label/);
  assert.match(picker, /Sola lettura/);
  assert.ok(
    !picker.includes("field.path"),
    "il percorso tecnico non si mostra e non serve al client",
  );
});

/* ------------------------------------------------------------- builder */

test("il builder ha reorder, duplicazione, eliminazione, anteprima e pubblicazione", () => {
  const builder = readCode("components/forms/form-builder.tsx");
  const card = readCode("components/forms/form-field-card.tsx");

  assert.match(builder, /Anteprima/);
  assert.match(builder, /Pubblica/);
  assert.match(builder, /Aggiungi campo/);
  assert.match(builder, /moveField/);
  assert.match(builder, /duplicateField/);
  assert.match(builder, /removeField/);
  assert.match(card, /Sposta su/);
  assert.match(card, /Sposta giu/);
  assert.match(card, /Duplica campo/);
  assert.match(card, /Elimina campo/);
});

test("le impostazioni di un campo stanno dietro un pannello, non tutte aperte", () => {
  const card = readCode("components/forms/form-field-card.tsx");

  assert.match(card, /const \[expanded, setExpanded\] = useState\(false\)/);
  assert.match(card, /aria-expanded=\{expanded\}/);
  assert.ok(
    card.indexOf("expanded ? (") < card.indexOf("Descrizione o istruzioni"),
    "descrizione, opzioni e collegamento devono stare dentro il pannello",
  );
});

test("l'anteprima usa lo stesso renderer del modulo pubblico", () => {
  const builder = readCode("components/forms/form-builder.tsx");
  const publicPage = readCode("components/forms/public-form-page.tsx");

  assert.match(builder, /<FormRenderer/);
  assert.match(publicPage, /<FormRenderer/);
});

test("l'autosave della bozza ha debounce, accorpamento e stato visibile", () => {
  const builder = readCode("components/forms/form-builder.tsx");

  assert.match(builder, /createCoalescingSaver/);
  assert.match(builder, /setTimeout\(/);
  assert.match(builder, /<SaveStatus/);
});

test("una bozza modificata dichiara che il pubblico vede ancora l'altra versione", () => {
  const builder = readCode("components/forms/form-builder.tsx");

  assert.match(builder, /hasUnpublishedChanges/);
  assert.match(builder, /vede ancora la\s*\n?\s*versione/);
});

/* --------------------------------------------------------- revisione */

test("la revisione mostra valore attuale e valore proposto, non solo il nuovo", () => {
  const dialog = readCode("components/forms/submission-review-dialog.tsx");

  assert.match(dialog, /change\.currentValue/);
  assert.match(dialog, /change\.proposedValue/);
  assert.match(dialog, /DUPLICATE_MATCH_LABELS/);
  assert.match(dialog, /Aggiorna questa scheda/);
});

test("la revisione non decide al posto della segreteria", () => {
  const dialog = readCode("components/forms/submission-review-dialog.tsx");

  assert.match(dialog, /Approva e aggiorna/);
  assert.match(dialog, /Rifiuta/);
  assert.ok(
    !/autoApprove|approveAll/.test(dialog),
    "nessuna approvazione automatica o di massa",
  );
});

/**
 * **Il difetto, per nome.** Cio che l'approvazione non era riuscita a fare
 * usciva come un avviso passeggero per ogni problema, e la pila ne tiene
 * **uno** (`TOAST_LIMIT = 1`): con tre consensi falliti se ne vedeva uno, per
 * cinque secondi, su un dialogo gia chiuso. Gli altri due sparivano — e
 * ognuno era un consenso che il club crede di aver raccolto e non ha.
 */
test("cio che l'approvazione non e riuscita a fare si legge nel dialogo", () => {
  const dialog = readCode("components/forms/submission-review-dialog.tsx");

  assert.ok(
    !/for \(const issue of outcome\.issues/.test(dialog),
    "un avviso per problema, in una pila che ne tiene uno: gli altri sparivano",
  );
  assert.match(
    dialog,
    /setIssues\(problemi\);\s*\n\s*return;/,
    "con dei problemi il dialogo resta aperto invece di chiudersi",
  );
  assert.match(
    dialog,
    /issues\.map\(\(issue\) => \(/,
    "si elencano uno per uno, come nel dialogo che spiega perche non si puo pubblicare",
  );
  assert.match(
    dialog,
    /La compilazione e stata registrata, ma queste cose non sono/,
    "non e un errore dell'operazione: l'anagrafica e stata scritta, e va detto",
  );
  assert.match(
    dialog,
    /role="alert"/,
    "chi non vede il dialogo deve sentirlo: e la sola cosa che chiede un gesto",
  );
});

/* ------------------------------------------------------------ responsive */

test("nessuna griglia dei moduli resta a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of COMPONENTS) {
    const offending = read(file)
      .split(/\r?\n/)
      .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line))
      .filter((line) => !line.includes("TabsList"));

    if (offending.length) offenders.push(`${file}: ${offending[0].trim()}`);
  }

  assert.deepEqual(
    offenders,
    [],
    "usare grid-cols-1 sm:grid-cols-2: a 375 px due colonne non ci stanno",
  );
});

test("i modali dei moduli restano raggiungibili in fondo su telefono", () => {
  for (const file of DIALOGS) {
    const source = read(file);
    assert.match(
      source,
      /max-h-\[calc\(100dvh-2rem\)\]/,
      `${file} senza altezza massima: i pulsanti in fondo spariscono`,
    );
    assert.match(source, /overflow-y-auto/, `${file} senza scorrimento interno`);
  }
});

test("il modulo pubblico e a colonna singola e con comandi da 44 px", () => {
  const source = read("components/forms/public-form-page.tsx");

  assert.match(source, /max-w-2xl/, "una colonna sola, anche su desktop");
  assert.match(source, /min-h-\[44px\]/, "comandi toccabili con il pollice");
  assert.match(source, /min-h-\[100dvh\]/, "non 100vh: su telefono e piu alto dello schermo");
  assert.ok(
    !/sm:grid-cols|lg:grid-cols/.test(source),
    "un modulo di iscrizione non diventa a due colonne su desktop",
  );
});

test("la firma non fa scorrere la pagina mentre si disegna", () => {
  const source = read("components/forms/signature-pad.tsx");

  assert.match(source, /touch-none/);
});

/* ------------------------------------------------ compilazione dalla scheda */

test("dalla scheda atleta si compila un modulo, con l'atleta gia selezionato", () => {
  const page = readCode("app/athletes/[id]/page.tsx");
  const dialog = readCode("components/forms/compile-form-dialog.tsx");

  assert.match(page, /<CompileFormDialog/);
  assert.match(page, /Compila modulo/);
  assert.match(dialog, /atleta gia selezionato/);
  assert.ok(
    !dialog.includes("Scegli l'atleta"),
    "si e gia dentro la scheda: l'atleta non si sceglie una seconda volta",
  );
});

test("se il modulo nomina un genitore, quale genitore si sceglie", () => {
  const dialog = readCode("components/forms/compile-form-dialog.tsx");

  assert.match(dialog, /guardianOptions/);
  assert.match(dialog, /Genitore o tutore/);
  assert.match(dialog, /Scegli chi firma/);
});

test("la compilazione dalla segreteria passa dalla stessa revisione", () => {
  const dialog = readCode("components/forms/compile-form-dialog.tsx");

  assert.match(dialog, /<SubmissionReviewDialog/);
  assert.ok(
    !/decideSubmission/.test(dialog),
    "un secondo percorso di scrittura sarebbe una seconda implementazione",
  );
});

test("i campi precompilati sono dichiarati, non nascosti", () => {
  const dialog = readCode("components/forms/compile-form-dialog.tsx");
  const renderer = readCode("components/forms/form-renderer.tsx");

  assert.match(dialog, /prefilledFieldIds=\{context\.prefilledFieldIds\}/);
  assert.match(renderer, /Dato gia in archivio/);
});

test("la prima modulistica online e uscita dalla scheda atleta", () => {
  const page = readCode("app/athletes/[id]/page.tsx");

  for (const residuo of [
    "/api/online-forms",
    "refreshOnlineForms",
    "selectedOnlineFormId",
    "handleCopyOnlineFormLink",
  ]) {
    assert.ok(!page.includes(residuo), `${residuo} e un residuo della V1`);
  }
});

test("la prima modulistica online non esiste piu nel repository", () => {
  for (const rimosso of [
    "lib/online-forms.ts",
    "lib/server/online-forms.ts",
    "app/api/online-forms/route.ts",
  ]) {
    assert.equal(
      existsSync(path.join(SRC, ...rimosso.split("/"))),
      false,
      `${rimosso} esiste ancora`,
    );
  }
});
