import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PAYMENT_PROVIDER_REGISTRY } from "../../src/lib/payments/provider-registry.ts";

/**
 * Chi incassa il denaro delle famiglie, detto per nome (RC Fix 2, punto 16).
 *
 * **Il difetto.** La scheda dei pagamenti online diceva «il provider» sette
 * volte e non nominava mai Stripe. Era una scelta deliberata — il registro dei
 * provider prevede che un domani ce ne sia un altro — ma il risultato per chi
 * guardava era una societa che stava per dare i propri dati bancari, e a cui
 * venivano chiesti documenti d'identita, da un'azienda senza nome.
 *
 * **La misura.** Il nome arriva dal record dell'account, non da una stringa
 * scritta nella pagina: il giorno in cui un club incassa con un altro
 * intermediario, la scheda lo dice da sola. Il marchio Stripe si mostra solo
 * quando l'intermediario e Stripe, e solo dove si decide di collegare un
 * conto.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");

test("il provider arriva dal record, non e scritto nella pagina", () => {
  const route = read("app/api/v1/payments/account/route.ts");
  const panel = read("components/payments/ClubPaymentAccountPanel.tsx");

  assert.match(
    route,
    /provider: account\.provider/,
    "la rotta deve dire quale intermediario e",
  );
  assert.match(
    panel,
    /getPaymentProviderDefinition\(providerKey\)/,
    "l'etichetta viene dal registro dei provider",
  );
  assert.equal(
    /"Stripe"|>Stripe</.test(panel),
    false,
    "la parola Stripe non va scritta a mano nella scheda: verrebbe mostrata anche a chi usa un altro intermediario",
  );
});

test("il marchio Stripe compare solo quando l'intermediario e Stripe", () => {
  const panel = read("components/payments/ClubPaymentAccountPanel.tsx");

  assert.match(panel, /const isStripe = providerKey === "stripe"/);
  assert.match(
    panel,
    /isStripe \? \(\s*<StripeBrandBadge/,
    "il marchio va dietro la condizione, non montato sempre",
  );
});

/**
 * Il marchio sta dove si decide di collegare un conto, e da nessun'altra
 * parte. Su ogni rata e su ogni movimento sarebbe pubblicita dentro un
 * registro contabile; nello storico basta il metodo.
 */
test("il marchio non si e sparso su rate, movimenti e ricevute", () => {
  const surfaces = [
    "components/payments/AthletePaymentLedger.tsx",
    "components/payments/InstallmentLedgerList.tsx",
    "components/payments/RegisterPaymentDialog.tsx",
    "components/payments/PayOnlineDialog.tsx",
    "components/payments/ClubPaymentSettings.tsx",
  ];

  for (const file of surfaces) {
    assert.equal(
      /StripeWordmark|StripeBrandBadge/.test(read(file)),
      false,
      `${file}: il marchio non va qui`,
    );
  }
});

/**
 * Le due capacita restano distinte.
 *
 * Un conto puo incassare e non poter ancora versare: sono due verifiche
 * diverse presso l'intermediario, e riassumerle in una riga sola nasconde
 * proprio il caso in cui qualcuno deve fare qualcosa.
 */
test("pagamenti online e payout si leggono separatamente", () => {
  const panel = read("components/payments/ClubPaymentAccountPanel.tsx");

  assert.match(panel, /label="Pagamenti online"/);
  assert.match(panel, /label="Payout"/);
  assert.match(
    panel,
    /Configurazione incompleta/,
    "quando manca qualcosa lo si deve dire con quelle parole",
  );
});

/** Il viola ufficiale vive in una costante, non ricopiato «quasi uguale». */
test("il colore del marchio e dichiarato una volta sola", () => {
  const brand = read("components/brand/stripe-brand.tsx");

  assert.match(brand, /export const STRIPE_BRAND_COLOR = "#635BFF"/);
  assert.equal(
    /(fill|stroke|color)=["']#/.test(brand),
    false,
    "il colore non va ricopiato in un attributo: due copie divergono",
  );
  assert.match(
    brand,
    /fill=\{STRIPE_BRAND_COLOR\}/,
    "il logotipo si colora dalla costante",
  );
  assert.match(
    brand,
    /role="img"[\s\S]*?aria-label=\{title\}/,
    "senza nome accessibile chi naviga a voce sente un blocco grafico anonimo",
  );
});

/** Il registro resta la fonte del nome di ogni intermediario. */
test("Stripe e nel registro dei provider ed e l'unico implementato", () => {
  assert.equal(PAYMENT_PROVIDER_REGISTRY.stripe.label, "Stripe");
  assert.equal(PAYMENT_PROVIDER_REGISTRY.stripe.isImplemented, true);

  const implemented = Object.values(PAYMENT_PROVIDER_REGISTRY).filter(
    (provider) => provider.isImplemented,
  );
  assert.deepEqual(
    implemented.map((provider) => provider.key),
    ["stripe"],
    "se un secondo provider diventa reale, questa scheda va riguardata",
  );
});
