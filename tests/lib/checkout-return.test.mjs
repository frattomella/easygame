import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildCheckoutReturnUrl } from "../../src/lib/payments/checkout-return.ts";

/**
 * **Dove si torna dopo aver pagato.**
 *
 * Il difetto, trovato a runtime nel collaudo E-13 subito dopo un pagamento
 * riuscito in Stripe Sandbox: l'indirizzo di ritorno veniva ricostruito da zero
 * e perdeva `?clubId=…`, che e il parametro senza il quale la scheda di un
 * atleta non si apre. Chi aveva appena pagato 130 € vedeva «ID del club
 * mancante. Torna alla lista atleti.»
 *
 * I test coprono le tre cose che rendono vera la regola «si torna dove si era»,
 * piu quella che impedisce di tornarci in un modo che non e navigazione.
 */

test("il ritorno conserva i parametri della pagina di partenza", () => {
  const ritorno = buildCheckoutReturnUrl(
    "https://easygame.test/athletes/atleta-1?clubId=club-1&tab=iscrizione",
    "verifica",
  );

  const url = new URL(ritorno);

  assert.equal(url.pathname, "/athletes/atleta-1");
  assert.equal(
    url.searchParams.get("clubId"),
    "club-1",
    "senza il club la scheda dell'atleta non si apre: e il difetto originale",
  );
  assert.equal(
    url.searchParams.get("tab"),
    "iscrizione",
    "si torna sulla linguetta da cui si era partiti",
  );
  assert.equal(url.searchParams.get("pagamento"), "verifica");
});

test("l'annullamento torna allo stesso posto, con il proprio segno", () => {
  const ritorno = buildCheckoutReturnUrl(
    "https://easygame.test/athletes/atleta-1?clubId=club-1",
    "annullato",
  );

  assert.equal(
    new URL(ritorno).searchParams.get("clubId"),
    "club-1",
    "anche chi rinuncia deve ritrovare la pagina da cui e partito",
  );
  assert.equal(new URL(ritorno).searchParams.get("pagamento"), "annullato");
});

test("un secondo ritorno sostituisce il segno invece di accumularlo", () => {
  const primo = buildCheckoutReturnUrl(
    "https://easygame.test/athletes/atleta-1?clubId=club-1",
    "annullato",
  );
  const secondo = buildCheckoutReturnUrl(primo, "verifica");

  const valori = new URL(secondo).searchParams.getAll("pagamento");

  assert.deepEqual(valori, ["verifica"]);
});

test("un indirizzo che non si naviga non diventa un indirizzo di ritorno", () => {
  /*
    Il ritorno viaggia fino al provider, che ci rimanda chi ha appena pagato:
    uno schema che non e http non deve arrivarci nemmeno.
  */
  assert.equal(buildCheckoutReturnUrl("javascript:alert(1)", "verifica"), null);
  assert.equal(buildCheckoutReturnUrl("data:text/html,x", "verifica"), null);
  assert.equal(buildCheckoutReturnUrl("/athletes/atleta-1", "verifica"), null);
  assert.equal(buildCheckoutReturnUrl("", "verifica"), null);
  assert.equal(buildCheckoutReturnUrl(null, "verifica"), null);
});

/* ------------------------------------------- e chi apre il checkout lo usa */

test("«Paga online» costruisce il ritorno dalla pagina corrente", () => {
  const sorgente = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "components",
      "payments",
      "use-athlete-payment-ledger.ts",
    ),
    "utf8",
  );

  assert.match(
    sorgente,
    /buildCheckoutReturnUrl\(\s*window\.location\.href/,
    "il ritorno si ricava dall'indirizzo corrente, non si ricompone",
  );

  assert.doesNotMatch(
    sorgente,
    /successUrl:\s*`\$\{origin\}/,
    "un indirizzo ricomposto perde i parametri che la pagina richiede",
  );
});
