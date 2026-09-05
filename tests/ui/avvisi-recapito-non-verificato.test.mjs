import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Il requisito piu visibile di PP-05, e il solo che nessuna prova presidiava.**
 *
 * Il brief lo chiede alla lettera: nella pagina Account deve essere
 * «chiaramente visibile `Email non verificata` con CTA `Verifica email`». Tutto
 * cio che sta dietro quell'avviso — le rotte di verifica, il legame col
 * destinatario, il monouso, i tre assi di rate limit — e misurato contro
 * PostgreSQL da tre sonde e da quattro file di test. La **superficie** no: era
 * l'unica parte della catena a non avere nessuno che la guardasse.
 *
 * Ed e esattamente la forma di incompletezza che questo repository produce piu
 * spesso (CLAUDE.md §11.8): non il codice mancante, ma il codice
 * **irraggiungibile**. L'RSVP era completo e testato da due Wave, e nessuna
 * schermata sapeva accenderlo. Un avviso cancellato per sbaglio da un
 * refactoring non rompe nessuna prova di dominio: rompe solo il prodotto.
 *
 * Sono test sul **sorgente**, non sul rendering: il progetto non ha un renderer
 * di componenti (vedi 15 — Testing). Verificano cio che, se sparisse, non
 * farebbe fallire nient'altro.
 */

const leggi = (percorso) =>
  readFileSync(path.join(process.cwd(), percorso), "utf8");

const SCHERMATA_ACCOUNT = "src/components/account/account-home-screen.tsx";

/**
 * Il corpo di un componente, dalla sua dichiarazione a quella successiva.
 *
 * Non una fetta di lunghezza fissa: una fetta arbitraria sconfina nel
 * componente dopo, e una prova che boccia le classi di **qualcun altro** non
 * misura cio che dice di misurare.
 */
const estraiComponente = (sorgente, nome) => {
  const inizio = sorgente.indexOf(`function ${nome}(`);
  assert.ok(inizio > 0, `il componente ${nome} deve esistere`);
  const successivo = sorgente.indexOf("\nfunction ", inizio + 1);
  return sorgente.slice(inizio, successivo > 0 ? successivo : undefined);
};

test("l'avviso «Email non verificata» esiste, e porta accanto la CTA che lo risolve", () => {
  const sorgente = leggi(SCHERMATA_ACCOUNT);

  assert.match(
    sorgente,
    /title="Email non verificata"/,
    "e la dicitura chiesta dal prodotto, alla lettera",
  );
  assert.match(
    sorgente,
    /ctaLabel="Verifica email"/,
    "un avviso senza il gesto che lo risolve e un rimprovero, non una funzione",
  );
});

test("l'avviso del telefono esiste, e dice che quel recapito blocca davvero", () => {
  const sorgente = leggi(SCHERMATA_ACCOUNT);

  assert.match(sorgente, /title="Telefono non verificato"/);
  assert.match(sorgente, /ctaLabel="Verifica telefono"/);
  /*
    I due avvisi non sono intercambiabili: il telefono blocca il rientro
    (ADR-0115), l'email no. Se un giorno le due descrizioni diventassero la
    stessa, uno dei due starebbe mentendo.
  */
  assert.match(
    sorgente,
    /non potrai rientrare al prossimo accesso/,
    "l'avviso del telefono deve dire la conseguenza vera",
  );
  assert.match(
    sorgente,
    /Puoi usare EasyGame lo stesso/,
    "quello dell'email deve dire che non blocca: gridare come l'altro insegna a ignorarli entrambi",
  );
});

test("i due avvisi compaiono solo quando servono, e nell'ordine giusto", () => {
  const sorgente = leggi(SCHERMATA_ACCOUNT);

  assert.match(
    sorgente,
    /\{!phoneVerified \? \(\s*<VerificationNotice/,
    "un avviso mostrato a chi ha gia verificato e rumore",
  );
  assert.match(sorgente, /\{!emailVerified \? \(\s*<VerificationNotice/);

  const posizioneTelefono = sorgente.indexOf('title="Telefono non verificato"');
  const posizioneEmail = sorgente.indexOf('title="Email non verificata"');
  assert.ok(posizioneTelefono > 0 && posizioneEmail > 0);
  assert.ok(
    posizioneTelefono < posizioneEmail,
    "sopra sta quello che blocca: l'ordine e la sola gerarchia che un elenco di avvisi ha",
  );
});

test("la via d'uscita per chi non conosce nessuna password sta accanto agli avvisi", () => {
  const sorgente = leggi(SCHERMATA_ACCOUNT);

  /*
    Chiude PP05-D1. Chi accede solo con Google, e chi ha appena subito uno
    sfratto (ADR-0117), non conosce nessuna password: `CURRENT_PASSWORD_REQUIRED`
    chiudeva a entrambe le popolazioni il cellulare che il prodotto dichiara
    obbligatorio. La strada esisteva ed era «Password dimenticata»; mancava il
    pulsante.
  */
  assert.match(sorgente, /Ricevi un link per impostarla/);
  assert.match(
    sorgente,
    /requestPasswordLink/,
    "il pulsante deve chiamare qualcosa, o e una scritta",
  );

  /*
    `lastIndexOf` e non `indexOf`: la stessa frase compare due volte, e la
    prima e il rimando dentro il messaggio d'errore del modulo del profilo
    («Se non ne hai una, usa "Ricevi un link per impostarla"»). Quella e una
    citazione; il pulsante e l'altra.
  */
  const posizioneAvviso = sorgente.indexOf('title="Email non verificata"');
  const posizionePulsante = sorgente.lastIndexOf(
    "Ricevi un link per impostarla",
  );
  assert.ok(
    posizionePulsante > posizioneAvviso,
    "sta accanto agli avvisi e non dentro il modulo del profilo: chi ne ha bisogno non arriva dal profilo",
  );
});

test("gli avvisi restano usabili a 375 px", () => {
  const sorgente = leggi(SCHERMATA_ACCOUNT);

  const componente = estraiComponente(sorgente, "VerificationNotice");

  assert.match(
    componente,
    /flex flex-wrap items-center gap-3/,
    "a 375 px il pulsante deve andare a capo sotto il testo, non uscire dallo schermo",
  );
  assert.match(
    componente,
    /min-w-0 flex-1/,
    "senza min-w-0 un testo lungo allarga il contenitore invece di andare a capo",
  );
  assert.match(
    componente,
    /flex flex-col gap-2 sm:flex-row/,
    "il campo del codice va a colonna singola sotto i 640 px: a 375 px un campo accanto a due pulsanti non lascia spazio a nessuno dei tre",
  );

  /*
    Le larghezze che allargano davvero a 375 px, e nessun'altra: una `max-w` non
    allarga niente, e una classe dietro un prefisso di breakpoint (`sm:`, `md:`)
    a 375 px non si applica. La lookbehind esclude entrambe — senza, questa
    prova bocciava `sm:max-w-[180px]`, che e proprio la riga che rende il campo
    del codice usabile.
  */
  assert.doesNotMatch(
    componente,
    /(?<![-:\w])(?:min-)?w-\[\d{3,}px\]/,
    "nessuna larghezza fissa a tre cifre: a 375 px allargherebbe la pagina",
  );
});

test("un solo riquadro per i due canali, e nessuna tavolozza propria", () => {
  const sorgente = leggi(SCHERMATA_ACCOUNT);

  /*
    Il telefono e l'email hanno lo stesso problema — «questo recapito non e
    provato» — e due riquadri scritti a mano sarebbero divergiti alla prima
    modifica: e successo per il testo semplice delle email di auth, che diceva
    una cosa diversa dall'HTML accanto (PP-05B).
  */
  const occorrenze = sorgente.match(/function VerificationNotice/g) || [];
  assert.equal(occorrenze.length, 1, "un componente solo per i due canali");

  const componente = estraiComponente(sorgente, "VerificationNotice");
  assert.deepEqual(
    componente.match(/#[0-9a-fA-F]{6}\b/g) || [],
    [],
    "i colori sono quelli gia usati dagli altri avvisi di questa pagina",
  );
});
