import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Il flusso «Rimborsa», come interfaccia e come confine.
 *
 * Questi test non aprono una pagina: presidiano le proprieta che, se si
 * rompono, si rompono in silenzio e costano denaro vero. Sono sette modi
 * concreti di sbagliare:
 *
 * 1. offrire «Rimborsa» dove **non c'e niente da rimborsare** — su un incasso
 *    manuale, su uno stornato, su un residuo esaurito;
 * 2. lasciare che un **allenatore** rimborsi;
 * 3. dire «rimborsato» **prima** che il provider lo confermi;
 * 4. lasciar partire una **seconda** richiesta mentre la prima e in volo;
 * 5. chiamare Stripe da un componente, invece che dal gateway;
 * 6. costruire un **secondo storico** dei rimborsi accanto a Payments V2;
 * 7. una finestra che a 375 px non ci sta.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

const LIST = "components/payments/InstallmentLedgerList.tsx";
const REFUND_DIALOG = "components/payments/RefundDialog.tsx";
const LEDGER = "components/payments/AthletePaymentLedger.tsx";
const HOOK = "components/payments/use-athlete-payment-ledger.ts";
const DOMAIN = "lib/payments/refunds.ts";
const ROUTE = "app/api/v1/payment-transactions/[id]/route.ts";
const SERVICE = "lib/server/payment-gateway.ts";
const ENROLLMENT_TAB = "components/athletes/enrollment/AthleteEnrollmentTab.tsx";

/** Le due superfici che mostrano le rate di un atleta. */
const SURFACES = [LEDGER, ENROLLMENT_TAB];

/* ----------------------------------- 1. il pulsante compare solo se serve */

test("«Rimborsa» compare solo su un incasso davvero rimborsabile", () => {
  const lista = read(LIST);

  assert.match(
    lista,
    /onRefund && refund\?\.refundable \?/,
    "la CTA e subordinata al rimborsabile calcolato dal dominio",
  );

  assert.doesNotMatch(
    lista,
    /onRefund=\{[^}]*\}\s*>\s*<RotateCcw/,
    "la lista non deve mostrare «Rimborsa» senza passare dal rimborsabile",
  );
});

test("la lista non inventa il rimborsabile: se non glielo danno, non lo calcola", () => {
  const lista = read(LIST);

  assert.match(
    lista,
    /onRefund && refundAvailabilityFor\s*\?\s*refundAvailabilityFor\(transaction\)\s*:\s*null/,
    "senza chi lo sappia calcolare, la riga non mostra nessuna affordance di rimborso",
  );
});

test("i sei ostacoli al rimborso vivono nel dominio, non nella schermata", () => {
  const dominio = read(DOMAIN);

  for (const blocker of [
    "not_a_payment",
    "reversed",
    "manual_payment",
    "provider_missing",
    "nothing_left",
    "in_progress",
  ]) {
    assert.match(dominio, new RegExp(`"${blocker}"`));
  }

  /* La regola sta in un modulo puro: server e interfaccia applicano la stessa. */
  assert.doesNotMatch(dominio, /from "\.\.\/server\//);
  assert.doesNotMatch(dominio, /prisma/i);
});

test("un incasso manuale non offre il rimborso dal provider", () => {
  const dominio = read(DOMAIN);

  assert.match(
    dominio,
    /original\.source === "MANUAL"[\s\S]{0,200}manual_payment/,
    "quel denaro dal PSP non e mai passato: si storna",
  );
});

/* ------------------------------------------------- 2. chi puo rimborsare */

test("solo proprietario e gestore del club possono rimborsare", () => {
  const rotta = read(ROUTE);

  assert.match(rotta, /canManageClubConfigurationAsActor\(scope\.activeRole\)/);
  assert.match(rotta, /rimborsare un incasso/);

  /*
    Il controllo sta **prima** dello smistamento per azione: il rimborso non
    puo avere un varco che lo storno non ha.
  */
  const guardia = rotta.indexOf("canManageClubConfiguration");
  const azione = rotta.indexOf('action === "refund"');

  assert.ok(guardia > 0 && azione > guardia);
});

test("il rimborso non e fra le capacita di un allenatore", () => {
  const ruoli = readFileSync(path.join(SRC, "lib", "access-roles.ts"), "utf8");

  assert.match(
    ruoli,
    /canManageClubConfiguration[\s\S]{0,200}"owner"[\s\S]{0,60}"club_manager"/,
  );
});

test("il confine di club lo fa il servizio, non la schermata", () => {
  const servizio = read(SERVICE);

  assert.match(
    servizio,
    /getPaymentTransactionById\(input\.transactionId, scope\)/,
    "lo scope entra nella lettura dell'incasso: un incasso di un altro club non si legge",
  );
  assert.match(servizio, /appartiene a un conto diverso/);
});

/* --------------------------- 3. non si dice «rimborsato» prima del tempo */

test("il movimento lo scrive il webhook, non la risposta HTTP", () => {
  const servizio = read(SERVICE);

  assert.match(servizio, /markRefundRequested/);

  /*
    Si guarda **dentro** la funzione, non nel file: `recordRefundTransaction`
    vive qui accanto ed e giusto che ci sia — la chiama il webhook. Quel che
    non deve succedere e che la chiami chi avvia il rimborso.
  */
  const inizio = servizio.indexOf("export const requestGatewayRefund");
  const corpo = servizio.slice(
    inizio,
    servizio.indexOf("/* ----", inizio + 10),
  );

  assert.ok(inizio > 0 && corpo.length > 500);
  assert.doesNotMatch(
    corpo,
    /recordRefundTransaction/,
    "il servizio di rimborso non deve scrivere il movimento",
  );
});

test("l'interfaccia riporta «in elaborazione» quando il provider non ha confermato", () => {
  const hook = read(HOOK);

  assert.match(hook, /awaitingWebhook/);
  assert.match(hook, /Rimborso in elaborazione/);

  const lista = read(LIST);
  assert.match(lista, /Rimborso in elaborazione/);
  assert.match(lista, /refund\?\.pending\.length/);
});

test("la finestra dice che il rimborso resta in elaborazione, prima del clic", () => {
  const finestra = read(REFUND_DIALOG);

  assert.match(finestra, /in elaborazione/i);
  assert.match(
    finestra,
    /non viene cancellato/i,
    "l'incasso originale resta: dirlo prima evita la telefonata",
  );
});

/* ------------------------------------------- 4. niente doppia richiesta */

test("una richiesta in volo impedisce la successiva", () => {
  const dominio = read(DOMAIN);

  assert.match(dominio, /pendingCents > 0[\s\S]{0,200}in_progress/);
  assert.match(
    dominio,
    /originalCents - refundedCents - pendingCents/,
    "l'importo gia in volo e impegnato: mostrarlo disponibile lo farebbe restituire due volte",
  );
});

test("la chiave di idempotenza cambia dopo ogni rimborso riuscito", () => {
  const dominio = read(DOMAIN);

  assert.match(
    dominio,
    /buildRefundIdempotencyKey[\s\S]{0,400}refundedCents/,
    "senza il gia rimborsato, un secondo rimborso dello stesso importo riceverebbe il primo",
  );
});

test("il pulsante si spegne mentre la richiesta e in corso", () => {
  const lista = read(LIST);

  assert.match(
    lista,
    /disabled=\{busyTransactionId === transaction\.id\}[\s\S]{0,120}onRefund\(transaction\)/,
  );

  const finestra = read(REFUND_DIALOG);
  assert.match(finestra, /disabled=\{isSubmitting \|\| Boolean\(validationError\)\}/);
});

/* --------------------------------- 5. Stripe si chiama dal gateway, e basta */

test("nessun componente parla con Stripe", () => {
  for (const file of [LIST, REFUND_DIALOG, LEDGER, HOOK]) {
    const source = read(file);

    assert.doesNotMatch(source, /api\.stripe\.com/, `${file} non deve chiamare Stripe`);
    assert.doesNotMatch(source, /STRIPE_SECRET_KEY/, `${file} non deve leggere credenziali`);
  }

  const hook = read(HOOK);
  assert.match(
    hook,
    /\/api\/v1\/payment-transactions\/\$\{encodeURIComponent\(transaction\.id\)\}/,
  );
  assert.match(hook, /action: "refund"/);
});

test("il servizio passa dal gateway, non da un client HTTP proprio", () => {
  const servizio = read(SERVICE);

  assert.match(servizio, /requirePaymentGateway\(account\.provider\)/);
  assert.match(servizio, /provider\.refund\(\{/);
});

/* ----------------------------------- 6. nessun secondo storico dei rimborsi */

test("il rimborso resta una riga di Payments V2", () => {
  const servizio = read(SERVICE);
  const dominio = read(DOMAIN);

  /* Nessuna tabella nuova, nessun modello nuovo: solo `payment_transactions`. */
  assert.doesNotMatch(servizio, /refundClient\(\)/);
  assert.doesNotMatch(dominio, /prisma/i);

  const schema = readFileSync(
    path.join(ROOT, "prisma", "schema.prisma"),
    "utf8",
  );

  assert.doesNotMatch(
    schema,
    /model\s+\w*Refund\w*\s*\{/,
    "un modello dedicato ai rimborsi sarebbe un secondo storico accanto a quello canonico",
  );
});

test("un rimborso si distingue da uno storno anche nella cronologia", () => {
  const lista = read(LIST);

  assert.match(lista, /isRefundTransaction\(transaction\)/);
  assert.match(lista, /Rimborso —/);
  assert.match(lista, /Storno —/);
});

/* ------------------------------------------------- 7. 375 / 768 / 1280 px */

test("la finestra «Rimborsa» sta dentro 375 px", () => {
  const finestra = read(REFUND_DIALOG);

  assert.match(finestra, /max-h-\[90vh\] overflow-y-auto/);
  assert.match(finestra, /DialogFooter className="flex-col gap-2 sm:flex-row"/);

  const bottoniLarghi = finestra.match(/className="w-full[^"]*sm:w-auto/g) || [];
  assert.ok(
    bottoniLarghi.length >= 2,
    "i pulsanti del piede devono essere a tutta larghezza sotto 640 px",
  );

  /* Nessuna griglia a piu colonne che a 375 px non ci starebbe. */
  const colonneFisse = finestra
    .split(/\r?\n/)
    .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line));

  assert.deepEqual(colonneFisse, []);
});

test("gli importi della finestra restano leggibili accanto alle etichette", () => {
  const finestra = read(REFUND_DIALOG);

  /*
    Le righe del riepilogo sono `flex justify-between gap-4`: l'etichetta a
    sinistra, il numero a destra, e uno spazio che non li fa toccare quando la
    riga si stringe.
  */
  const righe = finestra.match(/flex justify-between gap-4/g) || [];
  assert.ok(
    righe.length >= 6,
    "pagamento originale, gia rimborsato, rimborsabile, netto, residuo, stato, commissione",
  );
});

test("la cronologia degli incassi resta scorribile su schermo stretto", () => {
  const lista = read(LIST);

  assert.match(
    lista,
    /<div className="overflow-x-auto">/,
    "la tabella scorre dentro il proprio contenitore, non fa scorrere la pagina",
  );
});

/* ---------------------------------------- la finestra e una sola, ovunque */

test("le due superfici aprono la stessa finestra, una volta sola ciascuna", () => {
  /*
    Area Movimenti e scheda «Iscrizione» mostrano le stesse rate. Se una delle
    due non offrisse il rimborso, la segreteria imparerebbe che «dipende da
    dove guardi»; se una delle due montasse una finestra propria, i due
    percorsi ricomincerebbero a divergere — che e l'errore tipico n. 1 di
    `CLAUDE.md`.
  */
  for (const surface of SURFACES) {
    const source = read(surface);

    assert.equal(
      (source.match(/<RefundDialog/g) || []).length,
      1,
      `${surface} deve montare una e una sola finestra di rimborso`,
    );

    assert.match(
      source,
      /onRefundTransaction=\{[\s\S]{0,40}ledger\.canPayOnline[\s\S]{0,80}selectRefundTransaction/,
      `${surface} deve subordinare la CTA di rimborso agli incassi online`,
    );

    assert.match(
      source,
      /refundAvailabilityFor=\{ledger\.refundAvailabilityFor\}/,
      `${surface} deve passare il rimborsabile calcolato dall'hook`,
    );
  }
});

test("il riepilogo dice cosa succedera alla rata, non solo al movimento", () => {
  const finestra = read(REFUND_DIALOG);

  assert.match(finestra, /previewInstallmentAfterRefund/);
  assert.match(finestra, /Residuo della rata/);
  assert.match(finestra, /Stato della rata/);
  assert.match(finestra, /Commissione EasyGame restituita/);
});

/* ------------- 8. l'importo digitato non si riscrive da solo */

/**
 * **Il difetto trovato a runtime nel collaudo E-13.**
 *
 * L'effetto che ricompone i campi all'apertura dipendeva da `availability`,
 * cioe da un **oggetto** che chi monta la finestra ricalcola a ogni proprio
 * render: `refundAvailabilityFor(refundTarget)` restituisce una struttura
 * nuova ogni volta. Ne seguiva che qualunque render del genitore rieseguiva
 * l'effetto e riportava il campo al massimo rimborsabile — cancellando
 * l'importo appena digitato. Una segreteria scriveva 30 su un incasso da 130 e
 * poteva ritrovarsi 130 sul pulsante che restituisce il denaro.
 *
 * La proprieta da presidiare non e «l'effetto e scritto cosi»: e che le sue
 * dipendenze siano **valori stabili fra un render e l'altro**.
 */

test("i campi si ricompongono all'apertura, non a ogni render del genitore", () => {
  const finestra = read(REFUND_DIALOG);

  const dipendenze = finestra.match(
    /setAmount\([\s\S]*?\n  \}, \[([^\]]*)\]\);/,
  );

  assert.ok(dipendenze, "non trovo l'effetto che ricompone i campi");

  const elencate = dipendenze[1]
    .split(",")
    .map((voce) => voce.trim())
    .filter(Boolean);

  assert.ok(
    elencate.includes("open"),
    "la finestra deve ricomporsi quando si apre",
  );

  assert.ok(
    !elencate.includes("availability"),
    "«availability» e un oggetto nuovo a ogni render del genitore: elencarlo qui riscrive l'importo digitato",
  );

  assert.ok(
    !elencate.includes("transaction") && !elencate.includes("ledger"),
    "vale per ogni oggetto ricalcolato dal genitore, non solo per «availability»",
  );
});

test("il massimo rimborsabile entra nell'effetto come numero", () => {
  const finestra = read(REFUND_DIALOG);

  assert.match(
    finestra,
    /const refundableCents = availability\?\.refundableCents \?\? 0;/,
    "il valore si estrae prima, cosi la dipendenza e un numero e non cambia identita",
  );

  assert.match(
    finestra,
    /const targetTransactionId = transaction\?\.id \|\| "";/,
    "cambiare incasso deve ancora ricomporre i campi: l'identificativo e una stringa",
  );
});
