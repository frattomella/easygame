import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPasswordResetEmail,
  buildVerificationEmail,
} from "../../src/lib/server/auth-workflows.ts";
import { buildAthleteInviteEmailHtml } from "../../src/lib/server/athlete-accounts.ts";
import { buildGenericNotificationEmailHtml } from "../../src/lib/server/email/email-service.ts";

/**
 * Questi builder sono stati estratti dalle funzioni di invio (Branding Pass)
 * perche l'anteprima (`/private/email-preview`) li chiama direttamente: deve
 * mostrare esattamente quello che si spedisce, non un markup reimplementato.
 * Questi test bloccano una regressione facile — un builder che smette di
 * includere il dato che dovrebbe mostrare, o che smette di passare dal guscio
 * comune (niente piu logo).
 *
 * **Da PP-05B i due builder di auth restituiscono le due forme** (`html` e
 * `text`) invece della sola stringa HTML: il testo semplice si scriveva a mano
 * accanto all'HTML e divergeva alla prima modifica. Qui si prova che esistono
 * entrambe e che dicono la stessa cosa.
 */

const hasEasyGameLogo = (html) => /<img src="[^"]+logotipo-b\.png"/.test(html);

test("l'email di verifica mostra il codice, in HTML e in testo semplice", () => {
  const { html, text } = buildVerificationEmail({
    firstName: "Marco",
    code: "482913",
  });
  assert.match(html, /482913/);
  assert.match(text, /482913/);
  assert.match(html, /Marco/);
  assert.ok(hasEasyGameLogo(html), "marchio EasyGame: non la manda un club");
});

test("l'email di verifica funziona anche senza il nome di battesimo", () => {
  /*
    Prima usciva «Ciao , usa questo codice»: la virgola dopo il vuoto. Un
    account creato da un import non ha sempre un nome.
  */
  const { html, text } = buildVerificationEmail({ firstName: "", code: "000123" });
  assert.ok(!html.includes("Ciao ,"));
  assert.ok(!text.includes("Ciao ,"));
  assert.match(text, /000123/, "gli zeri iniziali sopravvivono");
});

test("l'email di reset password porta il link, sfuggito nell'HTML e intero nel testo", () => {
  const resetUrl =
    "https://esempio.easygame.app/auth/reset-password?uid=x&token=y";
  const { html, text } = buildPasswordResetEmail({
    firstName: "Marco",
    resetUrl,
  });

  /*
    Nell'HTML la `&` diventa `&amp;`: e la forma **corretta** dentro un
    attributo, e il client la riconverte prima di aprire il collegamento. Nel
    testo semplice non c'e niente da sfuggire, e il link deve essere
    copiabile-incollabile per intero.
  */
  assert.match(html, /uid=x&amp;token=y/);
  assert.ok(text.includes(resetUrl), "nel testo il link resta intero");
  assert.ok(hasEasyGameLogo(html));
});

test("un link di reset malformato non diventa un collegamento", () => {
  /*
    `resetUrl` e generato dal server, quindi oggi non e sfruttabile — ma era
    l'unico punto del prodotto in cui un URL entrava in un `href` senza
    passare da niente. La difesa vale a prescindere da chi lo scrive.
  */
  const { html } = buildPasswordResetEmail({
    firstName: "Marco",
    resetUrl: "javascript:alert(1)",
  });
  assert.ok(!html.includes("javascript"));
  assert.ok(!/<a\s+href/i.test(html), "nessun collegamento");
  assert.match(html, /Scegli una nuova password/, "l'etichetta resta leggibile");
});

test("l'invito atleta mostra il nome del club e il link, e passa dal guscio comune", () => {
  const html = buildAthleteInviteEmailHtml({
    athleteName: "Marco Rossi",
    clubName: "ASD Esempio",
    link: "https://esempio.easygame.app/athlete-invite/demo",
  });
  assert.match(html, /ASD Esempio/);
  assert.match(html, /athlete-invite\/demo/);
  assert.ok(hasEasyGameLogo(html));
});

test("la notifica generica non contiene mai un dato personale, e passa dal guscio comune", () => {
  const html = buildGenericNotificationEmailHtml();
  assert.match(html, /Accedi a/);
  assert.ok(hasEasyGameLogo(html));
});
