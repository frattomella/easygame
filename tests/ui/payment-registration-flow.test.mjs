import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Il flusso «Registra pagamento», come interfaccia (Workstream A, ADR-0036).
 *
 * Questi test non aprono una pagina: verificano che **non ci siano due
 * implementazioni** e che il gesto sbagliato non sia piu offerto. Sono la
 * classe di regressione che questo workstream esiste per chiudere — una
 * seconda finestra «quasi uguale» in un'altra pagina, o una tendina «Stato»
 * che ricompare perche sembrava comoda.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

const ATHLETE_PAGE = "app/athletes/[id]/page.tsx";
const MOVEMENTS_PAGE = "app/movements/page.tsx";
const DIALOG = "components/payments/RegisterPaymentDialog.tsx";
const LEDGER = "components/payments/AthletePaymentLedger.tsx";
const LIST = "components/payments/InstallmentLedgerList.tsx";
const ATHLETE_DIALOGS = "components/athletes/profile/athlete-payment-dialogs.tsx";

// --- un solo flusso ----------------------------------------------------------

test("scheda atleta e area Movimenti montano lo stesso componente", () => {
  for (const page of [ATHLETE_PAGE, MOVEMENTS_PAGE]) {
    assert.match(
      read(page),
      /<AthletePaymentLedger/,
      `${page} deve montare AthletePaymentLedger, non una copia`,
    );
  }
});

test("la finestra «Registra pagamento» esiste una volta sola", () => {
  /*
    Il segno di una seconda implementazione non e la stringa — compare anche
    nei commenti e nei pulsanti che *aprono* la finestra — ma un secondo
    `DialogTitle` che la intitola.
  */
  const titolo = /<DialogTitle>\s*Registra pagamento\s*<\/DialogTitle>/;

  const owners = [
    ATHLETE_PAGE,
    MOVEMENTS_PAGE,
    LEDGER,
    LIST,
    ATHLETE_DIALOGS,
    "components/payments/EnrollmentPaymentBreakdown.tsx",
    DIALOG,
  ].filter((file) => titolo.test(read(file)));

  assert.deepEqual(
    owners,
    [DIALOG],
    "la finestra sta in RegisterPaymentDialog: nessuna pagina se ne scrive una propria",
  );
});

// --- lo stato non e piu un campo ---------------------------------------------

test("la scheda atleta non offre piu di impostare lo stato di una rata", () => {
  const dialogs = read(ATHLETE_DIALOGS);

  assert.equal(
    /<SelectItem value="paid">/.test(dialogs),
    false,
    "«Pagato» non e piu una scelta: si registra un incasso",
  );
  assert.equal(
    /<SelectItem value="Pagato">/.test(dialogs),
    false,
    "nemmeno nella finestra di aggiunta: una voce nasce a debito",
  );
  assert.match(
    dialogs,
    /Si aggiorna da solo quando registri un incasso/,
    "al posto del campo c'e la spiegazione di dove si agisce",
  );
});

test("una voce aggiunta a mano nasce da incassare", () => {
  const page = read(ATHLETE_PAGE);

  assert.match(
    page,
    /paid_at: null,\s*\n\s*status: "pending",/,
    "la creazione non puo dichiarare denaro che nessun movimento dimostra",
  );
});

// --- cosa deve mostrare una rata ---------------------------------------------

test("ogni rata mostra dovuto, incassato, residuo, scadenza, stato e avanzamento", () => {
  const list = read(LIST);

  assert.match(list, /<Progress/, "la barra di avanzamento");
  assert.match(list, /pagati/, "«X / Y pagati»");
  assert.match(list, /Residuo /, "il residuo");
  assert.match(list, /Scadenza \$\{formatDate\(ledger\.dueDate\)\}/);
  assert.match(list, /ledger\.statusLabels\.map/, "gli stati, che possono essere due");
});

test("il dettaglio di una rata elenca data, importo, metodo e note", () => {
  const list = read(LIST);

  for (const column of ["Data", "Importo", "Metodo", "Note"]) {
    assert.match(
      list,
      new RegExp(`<th className="p-2">${column}</th>`),
      `manca la colonna ${column}`,
    );
  }
});

// --- il metodo non e testo libero --------------------------------------------

test("il metodo di pagamento si sceglie fra quelli configurati dal club", () => {
  const dialog = read(DIALOG);

  assert.match(dialog, /methodChoices\.map/, "le opzioni vengono dal club");
  assert.equal(
    /<Input[^>]*name="method"/.test(dialog),
    false,
    "nessun campo libero per il metodo",
  );
  assert.match(
    dialog,
    /Nessun metodo di incasso configurato/,
    "senza metodi configurati lo si dice, invece di accettare testo libero",
  );

  for (const page of [ATHLETE_PAGE, MOVEMENTS_PAGE]) {
    assert.match(
      read(page),
      /methodChoices=\{clubPaymentMethodChoices\}/,
      `${page} deve passare i metodi del club`,
    );
  }
});

// --- l'importo precompilato e modificabile -----------------------------------

test("l'importo parte dal residuo e resta modificabile", () => {
  const dialog = read(DIALOG);

  assert.match(
    dialog,
    /ledger\.residualAmount > 0 \? ledger\.residualAmount\.toFixed\(2\)/,
    "precompilato con il residuo",
  );
  assert.match(
    dialog,
    /onChange=\{\(event\) => \{\s*\n\s*setTouched\(true\);\s*\n\s*setAmount\(event\.target\.value\);/,
    "e modificabile: l'acconto e il caso che prima non esisteva",
  );
});

// --- aggiornamento immediato -------------------------------------------------

test("un incasso registrato aggiorna subito rata e riepiloghi", () => {
  assert.match(
    read(LEDGER),
    /onLedgerChanged\?\.\(/,
    "il componente avvisa la pagina ospite con la rata riscritta dal server",
  );
  assert.match(
    read(ATHLETE_PAGE),
    /onLedgerChanged=\{handleLedgerChanged\}/,
    "la scheda atleta la applica al proprio stato: niente «aggiorna»",
  );
});

// --- responsivita ------------------------------------------------------------

test("le superfici di pagamento non restano a due colonne a 375 px", () => {
  const offenders = [];

  for (const file of [DIALOG, LEDGER, LIST, ATHLETE_DIALOGS]) {
    const offending = read(file)
      .split(/\r?\n/)
      .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line));

    if (offending.length) {
      offenders.push(`${file}: ${offending[0].trim().slice(0, 80)}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "usare grid-cols-1 sm:grid-cols-2: registrare un incasso da telefono deve essere semplice",
  );
});

test("la tabella degli incassi scorre nel proprio contenitore", () => {
  assert.match(
    read(LIST),
    /overflow-x-auto/,
    "una tabella larga non deve allargare il documento",
  );
});

test("i pulsanti della finestra sono a piena larghezza su telefono", () => {
  const dialog = read(DIALOG);

  assert.match(dialog, /className="w-full sm:w-auto"/);
  assert.match(
    dialog,
    /max-h-\[90vh\] overflow-y-auto/,
    "su schermo basso la finestra scorre invece di tagliare il riepilogo",
  );
});

// --- ordine cronologico ------------------------------------------------------

test("gli incassi di una rata si leggono in ordine crescente", () => {
  assert.match(
    read("lib/payments/installment-ledger.ts"),
    /sortTransactionsChronologically[\s\S]{0,400}leftTime - rightTime/,
    "estratto conto: dal piu vecchio al piu recente",
  );
});
