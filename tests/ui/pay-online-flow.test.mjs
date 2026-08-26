import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Il flusso «Paga online», come interfaccia.
 *
 * Questi test non aprono una pagina: presidiano le proprieta che, se si
 * rompono, si rompono in silenzio e se ne accorge una famiglia davanti a una
 * rata. Sono cinque, e ognuna corrisponde a un modo concreto di sbagliare:
 *
 * 1. offrire il pagamento online quando il club **non puo incassare** — un
 *    pulsante che si accende e poi spiega di non funzionare e peggio di un
 *    pulsante che non c'e;
 * 2. avere **due finestre** per lo stesso gesto, che e il modo in cui i due
 *    percorsi ricominciano a divergere;
 * 3. confondere «Registra pagamento» (incasso **manuale**, lo fa la
 *    segreteria su denaro gia arrivato) con «Paga online» (il denaro deve
 *    ancora partire, e lo muove il PSP);
 * 4. offrire una CTA di pagamento su una rata **gia saldata**;
 * 5. perdere lo stato «in verifica» proprio nella finestra in cui serve —
 *    cioe al ritorno dal checkout, quando la pagina e stata ricaricata.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

const LIST = "components/payments/InstallmentLedgerList.tsx";
const PAY_DIALOG = "components/payments/PayOnlineDialog.tsx";
const REGISTER_DIALOG = "components/payments/RegisterPaymentDialog.tsx";
const LEDGER = "components/payments/AthletePaymentLedger.tsx";
const HOOK = "components/payments/use-athlete-payment-ledger.ts";
const ENROLLMENT_TAB = "components/athletes/enrollment/AthleteEnrollmentTab.tsx";

const SURFACES = [LEDGER, ENROLLMENT_TAB];

/* ------------------------------------- 1. Connect spento, niente pulsante */

test("«Paga online» non si offre se il club non puo incassare", () => {
  /*
    `canPayOnline` arriva da `readiness.canCheckout`, che e il server a
    calcolare: e la stessa risposta che distingue «provider non configurato»,
    «club senza account», «account in verifica» e «servizio spento dalla
    piattaforma». L'interfaccia non la ricalcola e non la indovina.
  */
  const hook = read(HOOK);

  assert.match(hook, /readiness\?:\s*\{\s*canCheckout\?:\s*boolean\s*\}/);
  assert.match(hook, /\/api\/v1\/payments\/account/);
  assert.match(hook, /setCanPayOnline\(Boolean\(/);

  for (const surface of SURFACES) {
    const source = read(surface);

    assert.match(
      source,
      /ledger\.canPayOnline[\s\S]{0,40}\?/,
      `${surface} deve subordinare la CTA online a canPayOnline`,
    );
    assert.doesNotMatch(
      source,
      /onPayOnline=\{\s*ledger\.selectOnlineLedger\s*\}/,
      `${surface} non deve passare la CTA online senza il controllo su canPayOnline`,
    );
  }
});

test("la lista non inventa la disponibilita: se non le danno la CTA, non la mostra", () => {
  /*
    Il componente di lista non conosce Stripe e non deve conoscerlo: mostra il
    pulsante **solo** se chi lo monta gli passa `onPayOnline`. Un valore
    predefinito qui dentro riaprirebbe il difetto dal basso.
  */
  const list = read(LIST);

  assert.match(list, /\{onPayOnline && ledger\.residualAmount > 0 \?/);
  assert.doesNotMatch(
    list,
    /onPayOnline\s*=\s*\(\s*\)\s*=>/,
    "nessun gestore predefinito: la disponibilita la decide chi monta",
  );
});

/* ------------------------------------------ 2. una finestra, non due */

test("la finestra «Paga online» esiste una volta sola", () => {
  const titolo = /<DialogTitle>\s*Paga online\s*<\/DialogTitle>/;

  assert.match(read(PAY_DIALOG), titolo);

  for (const surface of [LIST, LEDGER, ENROLLMENT_TAB, REGISTER_DIALOG]) {
    assert.doesNotMatch(
      read(surface),
      titolo,
      `${surface} non deve contenere una seconda finestra «Paga online»`,
    );
  }
});

test("le due scorciatoie della scheda Iscrizione aprono la stessa finestra", () => {
  /*
    La scheda ha due punti da cui si paga: la prossima rata in cima e la riga
    nella sezione «Rate». Due scorciatoie allo stesso gesto vanno bene; due
    gesti diversi per lo stesso fatto no — e il secondo era il difetto, perche
    la scorciatoia in cima apriva il checkout **saltando** la scelta
    dell'importo.
  */
  const tab = read(ENROLLMENT_TAB);

  assert.doesNotMatch(
    tab,
    /ledger\.payOnline\(next\)/,
    "la scorciatoia non deve aprire il checkout scavalcando la finestra",
  );
  assert.match(tab, /selectOnlineLedger\(next\)/);
  assert.match(tab, /onPayOnline=\{[\s\S]{0,120}selectOnlineLedger/);
});

/* ------------------------- 3. manuale e online restano due gesti distinti */

test("«Registra pagamento» resta l'incasso manuale, «Paga online» il PSP", () => {
  const register = read(REGISTER_DIALOG);
  const online = read(PAY_DIALOG);

  /* Il manuale chiede il metodo e la data: e un fatto gia avvenuto. */
  assert.match(register, /Metodo di pagamento/);
  assert.match(register, /Data incasso/);

  /*
    L'online non li chiede e non deve: il metodo lo sceglie chi paga sulla
    pagina del PSP, e la data la stabilisce l'evento firmato. Chiederli qui
    vorrebbe dire raccogliere due valori che verranno ignorati.
  */
  assert.doesNotMatch(online, /Metodo di pagamento/);
  assert.doesNotMatch(online, /Data incasso/);
  assert.match(online, /pagina sicura di Stripe/i);
});

test("l'importo online non puo superare il residuo, e la regola sta nel dominio", () => {
  const online = read(PAY_DIALOG);

  assert.match(online, /validateOnlinePaymentAmount/);
  assert.match(
    online,
    /max=\{ledger \? ledger\.residualAmount : undefined\}/,
    "anche il campo deve dire il limite, non solo il messaggio di errore",
  );
  assert.match(read(HOOK), /validateOnlinePaymentAmount\(\{ amount, ledger \}\)/);
});

test("l'importo e precompilato con il residuo e resta modificabile", () => {
  const online = read(PAY_DIALOG);

  assert.match(online, /ledger\.residualAmount\.toFixed\(2\)/);
  assert.match(online, /Puoi versare un acconto/i);
  assert.match(online, /onChange=\{\(event\) => \{/);
});

test("il checkout parte con l'importo scelto, non con il residuo", () => {
  /*
    Era esattamente il difetto: il server accettava gia un importo parziale, e
    il client mandava sempre `residualAmount`.
  */
  const hook = read(HOOK);

  assert.match(hook, /amountCents: Math\.round\(toPaymentAmount\(amount\) \* 100\)/);
  assert.doesNotMatch(
    hook,
    /amountCents: Math\.round\(ledger\.residualAmount \* 100\)/,
    "l'importo del checkout non deve tornare a essere implicito nel residuo",
  );
});

/* ---------------------------------- 4. rata saldata, nessuna CTA */

test("su una rata saldata non compare nessuna CTA di pagamento", () => {
  const list = read(LIST);

  /* Entrambe le CTA passano dallo stesso guardiano: residuo maggiore di zero. */
  assert.match(list, /\{onPayOnline && ledger\.residualAmount > 0 \?/);
  assert.match(
    list,
    /\{canManage && ledger\.residualAmount > 0 && onRegisterPayment \?/,
  );
});

/* --------------------------- 5. «in verifica» sopravvive al ritorno */

test("lo stato «in verifica» sopravvive al ritorno dal checkout", () => {
  /*
    Il checkout porta fuori dall'applicazione: al ritorno la pagina e stata
    ricaricata da zero, e con essa qualunque stato in memoria. La finestra in
    cui «in verifica» va detto e **esattamente** quella che una variabile di
    stato React non sopravvive — ed era il difetto.
  */
  const hook = read(HOOK);

  assert.match(hook, /sessionStorage\.setItem/);
  assert.match(hook, /sessionStorage\.getItem/);
  assert.match(hook, /residualAtCheckout/);
  assert.match(read(LIST), /Pagamento in verifica/);
});

test("«in verifica» smette da solo quando il webhook ha registrato l'incasso", () => {
  /*
    Il confronto sul residuo e cio che permette di smettere senza interrogare
    nessuno: quando l'incasso e stato registrato il residuo scende, e la prima
    lettura del registro lo rivela. Senza, l'etichetta resterebbe appesa.
  */
  const hook = read(HOOK);

  assert.match(hook, /forgetPendingCheckout/);
  assert.match(
    hook,
    /Math\.round\(current\.residualAmount \* 100\) <[\s\S]{0,80}residualAtCheckout \* 100\)/,
  );
});

test("il segno «in verifica» si scrive prima di lasciare la pagina", () => {
  /*
    Dopo `openExternalUrl` questa pagina puo non esistere piu, e con essa la
    riga che non abbiamo scritto.
  */
  const hook = read(HOOK);

  const scrittura = hook.indexOf("sessionStorage.setItem");
  const navigazione = hook.indexOf("openExternalUrl(data.checkoutUrl)");

  assert.ok(scrittura > 0 && navigazione > 0);
  assert.ok(
    scrittura < navigazione,
    "la memoria va scritta prima della navigazione, non dopo",
  );
});

/* ------------------------------------ il ledger resta la fonte unica */

test("pagato, residuo e progressione restano derivati dal registro", () => {
  /*
    Vale anche dopo un rimborso: il rimborso e un movimento, e il residuo si
    ricalcola da solo. Nessuna schermata scrive lo stato di una rata (ADR-0036,
    ADR-0058).
  */
  const list = read(LIST);

  assert.match(list, /ledger\.paidAmount/);
  assert.match(list, /ledger\.residualAmount/);
  assert.match(list, /<Progress\s+value=\{Math\.round\(ledger\.progress \* 100\)\}/);
  assert.doesNotMatch(
    list,
    /setStatus|status:\s*"paid"/,
    "nessuna scrittura di stato dall'interfaccia",
  );
});

/* ------------------------------------------------ 375 / 768 / 1280 px */

test("la finestra «Paga online» sta dentro 375 px", () => {
  /*
    Le stesse regole della finestra manuale, e per la stessa ragione: a 375 px
    due pulsanti affiancati nel piede non ci stanno, e un contenuto piu alto
    dello schermo va scorso invece che tagliato.
  */
  const online = read(PAY_DIALOG);

  assert.match(online, /max-h-\[90vh\] overflow-y-auto/);
  assert.match(online, /DialogFooter className="flex-col gap-2 sm:flex-row"/);

  const bottoniLarghi = online.match(/className="w-full[^"]*sm:w-auto/g) || [];
  assert.ok(
    bottoniLarghi.length >= 2,
    "i pulsanti del piede devono essere a tutta larghezza sotto 640 px",
  );

  /* Nessuna griglia a piu colonne che a 375 px non ci starebbe. */
  const colonneFisse = online
    .split(/\r?\n/)
    .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line));

  assert.deepEqual(colonneFisse, []);
});
