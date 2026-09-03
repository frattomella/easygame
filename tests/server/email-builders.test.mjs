import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPasswordResetEmailHtml,
  buildVerificationEmailHtml,
} from "../../src/lib/server/auth-workflows.ts";
import { buildAthleteInviteEmailHtml } from "../../src/lib/server/athlete-accounts.ts";
import { buildGenericNotificationEmailHtml } from "../../src/lib/server/email/email-service.ts";

/**
 * Questi builder sono stati estratti dalle funzioni di invio (Branding Pass)
 * perche l'anteprima di sviluppo (`/private/email-preview`) li chiama
 * direttamente: deve mostrare esattamente quello che si spedisce, non un
 * markup reimplementato. Questi test bloccano una regressione facile — un
 * builder che smette di includere il dato che dovrebbe mostrare, o che
 * smette di passare dal guscio comune (niente piu logo).
 */

const hasEasyGameLogo = (html) => /<img src="[^"]+logotipo-b\.png"/.test(html);

test("l'email di verifica mostra il codice e passa dal guscio comune", () => {
  const html = buildVerificationEmailHtml({ firstName: "Marco", code: "482913" });
  assert.match(html, /482913/);
  assert.ok(hasEasyGameLogo(html));
});

test("l'email di reset password mostra il link e passa dal guscio comune", () => {
  const resetUrl = "https://esempio.easygame.app/auth/reset-password?uid=x&token=y";
  const html = buildPasswordResetEmailHtml({ firstName: "Marco", resetUrl });
  assert.match(html, new RegExp(resetUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.ok(hasEasyGameLogo(html));
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
