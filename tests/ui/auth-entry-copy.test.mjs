import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * La porta d'ingresso del prodotto.
 *
 * Le quattro cose fissate qui sono state viste **a schermo** sullo staging, e
 * non sono difetti di logica: la pagina funzionava. Sono difetti di cio che la
 * pagina dice — che su una schermata di accesso e tutto quello che c'e.
 */

const ROOT = process.cwd();
const read = (relative) =>
  readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");

const authShell = () => read("src/components/auth/auth-shell.tsx");
const loginRoute = () => read("src/app/api/v1/auth/login/route.ts");

/**
 * Senza credenziali OAuth la pagina mostrava a chi accede la frase
 * «Google e Microsoft si abilitano inserendo le credenziali OAuth nelle env.»:
 * un'istruzione per chi installa il prodotto, letta da chi lo usa.
 */
test("la pagina di accesso non spiega all'utente come si configurano le env", () => {
  const source = authShell();

  assert.equal(
    /credenziali OAuth nelle/.test(source),
    false,
    "nessun riferimento alle variabili d'ambiente nella schermata di accesso",
  );
  assert.equal(
    /\benv\b\./.test(source),
    false,
    "nessun riferimento alle env nella schermata di accesso",
  );
});

/**
 * E se non c'e nessun provider da scegliere sparisce anche il separatore:
 * «oppure» fra il nulla e il modulo email separa una cosa sola.
 */
test("il separatore «oppure» esiste solo quando c'e davvero un'alternativa", () => {
  const source = authShell();

  assert.match(
    source,
    /const hasProviderChoice\s*=\s*\n?\s*loadingProviders \|\| capabilities\.providers\.length > 0;/,
    "la presenza di un'alternativa deve essere una condizione dichiarata",
  );
  assert.match(
    source,
    /\{hasProviderChoice \? \(\s*<div className="relative text-center/,
    "il separatore «oppure» deve dipendere da quella condizione",
  );
});

/**
 * `/register` monta lo stesso guscio con la scheda «Registrazione» gia scelta.
 * Il titolo restava «Accedi»: chi arriva da un invito legge di essere sulla
 * pagina sbagliata.
 */
test("il titolo della card segue la scheda aperta", () => {
  const source = authShell();

  assert.match(
    source,
    /\{mode === "register" \? "Crea il tuo account" : "Accedi"\}/,
    "il titolo deve dipendere dalla scheda attiva",
  );
  assert.equal(
    /<CardTitle className="text-2xl text-slate-900">Accedi<\/CardTitle>/.test(
      source,
    ),
    false,
    "il titolo non deve piu essere scritto fisso",
  );
});

/**
 * L'errore compare dopo l'invio, lontano dal fuoco rimasto sul pulsante.
 */
test("l'errore della schermata di accesso viene annunciato", () => {
  assert.match(
    authShell(),
    /role="alert"\s*\n\s*className="rounded-xl border border-red-200/,
    "il riquadro d'errore deve essere un alert",
  );
});

/**
 * «Invalid login credentials» era l'unica frase inglese che un utente italiano
 * poteva incontrare, ed era la prima.
 */
test("l'errore di credenziali e in italiano e resta uno solo", () => {
  const source = loginRoute();

  assert.equal(
    /Invalid login credentials/.test(source),
    false,
    "nessuna frase in inglese nella risposta di login",
  );
  assert.match(
    source,
    /const INVALID_CREDENTIALS_MESSAGE = "Email o password non corretti";/,
  );

  /*
    Il punto non e la traduzione: e che utente sconosciuto e password errata
    debbano continuare a rispondere **la stessa** frase. Due frasi diverse
    dicono a chi prova indirizzi a caso quali account esistono.
  */
  assert.equal(
    (source.match(/error: \{ message: INVALID_CREDENTIALS_MESSAGE \}/g) || [])
      .length,
    2,
    "entrambi i rami devono usare la stessa costante",
  );
  assert.match(
    source,
    /await verifyPassword\(password, DUMMY_PASSWORD_HASH\);/,
    "l'utente inesistente deve continuare a pagare il confronto bcrypt",
  );
});
