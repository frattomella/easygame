import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **La liquidazione si raggiunge davvero** (N15), dal lato della superficie.
 *
 * ---
 *
 * ## Il difetto che questo file presidia
 *
 * Non l'estetica: la **raggiungibilita**. Il dominio delle liquidazioni
 * esisteva per intero — testata, ripartizione, due tetti, storno, conto,
 * causale congelata, e trentasei prove — e le sue due rotte non avevano
 * **nessun chiamante**. Nessuna finestra, nessun pulsante, nessun hook.
 *
 * Era la terza volta di fila che questo repository trovava la stessa forma
 * (§11.8 di `CLAUDE.md`), e la piu costosa: riguardava l'unico momento in cui
 * un contributo diventa denaro. Peggio, la scheda scritta da N14 mandava la
 * segreteria a «stornare la liquidazione dalla scheda del programma», dove non
 * c'era nessun controllo del genere.
 *
 * ## Il percorso che deve esistere
 *
 * ```
 * Periodo maturato → Registra liquidazione → movimento del club → riconciliazione
 * ```
 *
 * Ogni anello ha qui la sua prova.
 */

const leggi = (percorso) => readFileSync(percorso, "utf8").replace(/\r\n/g, "\n");

const PERIODI = "src/components/funding/FundingPeriodsTable.tsx";
const RIQUADRO = "src/components/funding/AthleteFundingSummary.tsx";
const FINESTRA = "src/components/funding/SettleAccrualDialog.tsx";
const TAB = "src/components/athletes/enrollment/AthleteEnrollmentTab.tsx";
const ROTTA = "src/app/api/v1/funding/settlements/route.ts";
const ROTTA_STORNO = "src/app/api/v1/funding/settlements/[id]/reverse/route.ts";

const senzaCommenti = (sorgente) =>
  sorgente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* ----------------------------------------- l'anello che mancava del tutto */

test("la rotta delle liquidazioni ha finalmente un chiamante", () => {
  const riquadro = senzaCommenti(leggi(RIQUADRO));

  assert.match(
    riquadro,
    /"\/api\/v1\/funding\/settlements"/,
    "il dominio era scritto, provato e senza una sola porta",
  );
  assert.match(riquadro, /method: "POST"/);
});

test("e lo storno pure", () => {
  assert.match(
    senzaCommenti(leggi(RIQUADRO)),
    /\/api\/v1\/funding\/settlements\/\$\{[^}]+\}\/reverse/,
    "un periodo liquidato per errore era un vicolo cieco",
  );
});

test("un solo termine in tutta la superficie: «Registra liquidazione»", () => {
  const periodi = senzaCommenti(leggi(PERIODI));
  const finestra = senzaCommenti(leggi(FINESTRA));

  assert.match(periodi, /Registra liquidazione/);
  assert.match(periodi, /Registra altra liquidazione/);
  assert.match(finestra, /Registra liquidazione/);

  /*
    «Liquida periodo» direbbe che e il club a liquidare, mentre il club
    **riceve**: su una schermata di cassa quella confusione costa una telefonata
    all'ente.
  */
  /*
    Si guarda cio che l'utente **vede**, non i commenti: la finestra spiega per
    esteso perche il termine scartato e scartato, e vietarne la menzione
    significherebbe vietare di scrivere il perche di una scelta.
  */
  for (const file of [PERIODI, RIQUADRO, FINESTRA]) {
    assert.equal(
      /Liquida periodo/.test(senzaCommenti(leggi(file))),
      false,
      `${file}: due termini per lo stesso gesto sono due gesti, per chi legge`,
    );
  }
});

/* -------------------------------------------- la CTA, dove serve e quando */

test("la CTA sta sulla riga del periodo, non dentro il pannello", () => {
  const source = senzaCommenti(leggi(PERIODI));

  const pannello = source.indexOf("border-t border-egw-rule px-3 pb-3 pt-2");
  const cta = source.indexOf("Registra liquidazione");

  assert.ok(cta > 0 && pannello > 0);
  assert.ok(
    cta < pannello,
    "una CTA che si raggiunge solo dopo aver aperto un accordion e una CTA che non si preme",
  );
});

test("compare solo su un periodo che si puo davvero liquidare", () => {
  const source = senzaCommenti(leggi(PERIODI));

  assert.match(
    source,
    /const liquidabile =\s*\n?\s*accrual && describeSettlementEligibility\(accrual\)\.kind === "eligible"/,
    "lo decide la stessa funzione che il servizio applica",
  );
  assert.match(source, /canSettle && onSettle && liquidabile \?/);
});

test("su un periodo gia liquidato per intero non resta una CTA ambigua", () => {
  /*
    `describeSettlementEligibility` risponde `blocked` con «gia liquidato per
    intero», quindi `liquidabile` e falso e il pulsante non c'e. Cio che resta
    e lo storno, che e un'altra cosa e si chiama in un altro modo.
  */
  const model = leggi("src/lib/funding/funding-model.ts");
  assert.match(model, /gia liquidato per intero/);
});

test("l'etichetta cambia quando un accredito c'e gia", () => {
  assert.match(
    senzaCommenti(leggi(PERIODI)),
    /settledAmount > 0\s*\n?\s*\?\s*"Registra altra liquidazione"\s*\n?\s*:\s*"Registra liquidazione"/,
    "«Registra liquidazione» su un periodo liquidato a meta farebbe credere di dover ricominciare",
  );
});

/* ------------------------------------------------- cosa mostra il periodo */

test("ogni periodo dice previsto, maturato, liquidato e da ricevere", () => {
  const source = senzaCommenti(leggi(PERIODI));

  assert.match(source, /label="Importo previsto"/);
  assert.match(source, /label="Maturato"/);
  assert.match(source, /label="Liquidato"/);
  assert.match(source, /label="Da ricevere"/);
});

test("«da ricevere» si legge senza aprire il periodo", () => {
  assert.match(
    senzaCommenti(leggi(PERIODI)),
    /daRicevere > 0 \? \(\s*\n?\s*<span/,
    "e la cifra per cui una segreteria apre questo elenco",
  );
});

test("«da ricevere» e maturato meno liquidato, e lo calcola il dominio", () => {
  const source = senzaCommenti(leggi(PERIODI));

  assert.match(source, /pendingSettlementOfAccrual\(accrual\)/);
  assert.equal(
    /accrued_amount\s*-\s*settled_amount|accruedAmount\s*-\s*settledAmount/.test(
      source,
    ),
    false,
    "la sottrazione non si riscrive nella schermata",
  );
});

/* --------------------------------------------------------- la finestra */

test("la finestra dice a chi, da chi, per cosa e per quanto", () => {
  const source = senzaCommenti(leggi(FINESTRA));

  for (const etichetta of [
    "Atleta",
    "Ente erogatore",
    "Programma",
    "Periodo",
    "Maturato",
    "Gia liquidato",
    "Da ricevere",
  ]) {
    assert.match(
      source,
      new RegExp(`label="${etichetta}"`),
      `«${etichetta}» manca dal riepilogo della finestra`,
    );
  }
});

test("e raccoglie importo, data, conto, riferimento e note", () => {
  const source = senzaCommenti(leggi(FINESTRA));

  assert.match(source, /Importo liquidato/);
  assert.match(source, /Data accredito/);
  assert.match(source, /Conto del club/);
  assert.match(source, /Riferimento bancario/);
  assert.match(source, /id="settlement-notes"/);
});

test("l'importo si propone dal residuo e resta modificabile", () => {
  const source = senzaCommenti(leggi(FINESTRA));

  assert.match(source, /setAmount\(daRicevere > 0 \? daRicevere\.toFixed\(2\) : ""\)/);
  assert.match(source, /onChange=\{\(event\) => setAmount\(event\.target\.value\)\}/);
});

test("i conti li chiede all'hook che gia esiste", () => {
  const source = leggi(FINESTRA);

  assert.match(source, /useContiIncasso/);
  assert.equal(
    /\/api\/v1\/accounting\/accounts/.test(source),
    false,
    "una seconda lettura degli stessi conti sarebbe un secondo elenco da tenere allineato",
  );
});

test("chi non puo vedere i conti non riceve un elenco di conti", () => {
  assert.match(
    senzaCommenti(leggi(FINESTRA)),
    /canChooseAccount \? \(/,
    "gli estremi bancari hanno un permesso proprio",
  );
});

test("la finestra dice che non e un pagamento della famiglia", () => {
  assert.match(
    leggi(FINESTRA),
    /non e un pagamento della famiglia/i,
    "e la frase che impedisce di contare la stessa quota due volte",
  );
});

test("una chiave per gesto, non per importo", () => {
  const source = leggi(FINESTRA);

  assert.match(source, /chiaveTentativo/);
  assert.match(source, /crypto\.randomUUID/);
  assert.match(source, /idempotencyKey: chiaveTentativo\.current/);
});

/* ------------------------------------------------------------ lo storno */

test("gli accrediti di un periodo si vedono, e si stornano da li", () => {
  const source = senzaCommenti(leggi(PERIODI));

  assert.match(source, /Accrediti dell&apos;ente/);
  assert.match(source, /onReverseSettlement/);
  assert.match(source, /Storna/);
});

test("una riga gia stornata non offre un secondo storno", () => {
  assert.match(
    senzaCommenti(leggi(PERIODI)),
    /!accredito\.reversedAt &&\s*\n?\s*!accredito\.isReversal/,
    "uno storno non si storna, e il pulsante non compare invece di rifiutarsi",
  );
});

test("lo storno chiede un motivo prima di partire", () => {
  assert.match(
    senzaCommenti(leggi(RIQUADRO)),
    /if \(!motivo \|\| !motivo\.trim\(\)\) return;/,
    "senza motivo la riga non spiega niente, e il dominio lo pretende",
  );
});

/* ------------------------------------------------------- i due permessi */

test("il permesso lo dichiara il server, non il gettone del browser", () => {
  const riquadro = senzaCommenti(leggi(RIQUADRO));

  assert.match(riquadro, /canSettle=\{Boolean\(\(overview as any\)\.canSettle\)\}/);
  assert.match(riquadro, /canReverseSettlement/);
});

test("le due rotte chiedono la porta a due chiavi", () => {
  for (const rotta of [ROTTA, ROTTA_STORNO]) {
    const source = leggi(rotta);
    assert.match(source, /assertFundingSettlementPermission/, `${rotta}`);
    assert.equal(
      /canManageClubConfigurationAsActor\(/.test(source),
      false,
      `${rotta}: il predicato vecchio rifiutava ogni ruolo personalizzato`,
    );
  }
});

test("la porta e una congiunzione, non una disgiunzione", () => {
  const source = leggi("src/lib/funding/settlement-permissions.ts");

  assert.match(
    source,
    /hasFundingPermission\(role, "funding\.manage"\) &&\s*\n?\s*hasAccountingPermission/,
    "chi ha una chiave sola sta facendo meta di un'operazione che non si fa a meta",
  );
});

/* ---------------------------------------------- il riepilogo della scheda */

test("il riepilogo economico dice quanto l'ente deve ancora versare", () => {
  assert.match(senzaCommenti(leggi(TAB)), /label="Voucher da ricevere"/);
  assert.match(senzaCommenti(leggi(RIQUADRO)), /label="Voucher da ricevere"/);
});

test("«da ricevere» non e «previsto meno liquidato»", () => {
  const dominio = leggi("src/lib/payments/coverage-ledger.ts");

  assert.match(
    dominio,
    /pendingCoverage: Math\.max\(0, accruedCents - settledCents\) \/ 100/,
    "cio che non e maturato non e ancora un credito verso l'ente",
  );
});

/* ---------------------------------------------------------- responsivita */

test("la superficie nuova non resta a due colonne a 375 px", () => {
  const colpevoli = [];

  for (const file of [PERIODI, RIQUADRO, FINESTRA]) {
    const righe = leggi(file)
      .split("\n")
      .filter((riga) => /(?<![a-z:])grid-cols-[2345]\b/.test(riga));
    if (righe.length) colpevoli.push(`${file}: ${righe[0].trim().slice(0, 70)}`);
  }

  assert.deepEqual(colpevoli, []);
});

test("la CTA non richiede il passaggio del mouse", () => {
  assert.equal(
    /(?<![a-z-])(group-)?hover:(flex|block|opacity-100)/.test(leggi(PERIODI)),
    false,
    "su un telefono non esiste l'hover",
  );
});

test("la finestra scorre invece di uscire dallo schermo a 375 px", () => {
  assert.match(
    leggi(FINESTRA),
    /max-h-\[90vh\] overflow-y-auto/,
    "sette righe di riepilogo piu cinque campi non stanno in 812 px",
  );
});
