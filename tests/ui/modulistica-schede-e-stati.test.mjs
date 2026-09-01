import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **Modulistica: ogni scheda il suo cancello, e tre stati invece di due**
 * (Wave 6, lane 6F — W6-42, W6-43, W6-44).
 *
 * Test sul sorgente, come le altre regole di UI (il progetto non ha un
 * renderer di componenti: vedi 15 — Testing). Presidiano tre difetti
 * misurati, e tutti e tre si vedevano solo aprendo la pagina con il ruolo
 * sbagliato o con la rete lenta:
 *
 * 1. la guardia della pagina era il permesso sui **modelli di documento**, e
 *    bloccava anche la scheda «Moduli online»: due domini distinti dietro un
 *    interruttore solo;
 * 2. l'uscita anticipata su `loading` stava **prima** dei Tabs, quindi ogni
 *    ri-risoluzione del club smontava il cruscotto dei moduli e ne perdeva lo
 *    stato — ed e la causa piu probabile di «i moduli online non vengono
 *    sempre caricati»;
 * 3. il fallimento della lettura era indistinguibile dall'elenco vuoto.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8");
const readCode = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const PAGE = "app/modulistica/page.tsx";
const DASHBOARD = "components/forms/forms-dashboard.tsx";
const PUBLIC_FORM = "components/forms/public-form-page.tsx";
const RENEWAL = "components/enrollment/renewal-form.tsx";

/* --------------------------------------------- W6-42: due domini, due gate */

test("i moduli online hanno un permesso proprio, e non e quello dei documenti", () => {
  const page = readCode(PAGE);

  assert.match(
    page,
    /import \{ canReadClubForms \} from "@\/lib\/forms\/permissions"/,
    "il gate dei moduli deve arrivare dal dominio dei moduli",
  );
  assert.match(page, /canReadForms\s*=\s*canReadClubForms\(activeRole\)/);
});

test("la scheda «Moduli online» e condizionata al suo permesso, non a quello dei documenti", () => {
  const page = readCode(PAGE);

  assert.match(
    page,
    /\{canReadForms \?\s*\(?\s*<TabsTrigger value="online-forms">/,
    "la scheda dei moduli deve dipendere da canReadForms",
  );
  assert.match(
    page,
    /\{canRead \?\s*\(?\s*<TabsTrigger value="documents">/,
    "la scheda dei documenti deve dipendere da canRead",
  );
});

test("la pagina si apre se almeno uno dei due domini e aperto", () => {
  const page = readCode(PAGE);

  assert.match(page, /canOpenPage\s*=\s*canRead \|\| canReadForms/);
  assert.match(
    page,
    /if \(!clubId \|\| !canOpenPage\)/,
    "la guardia della pagina non deve piu essere il solo permesso documentale",
  );
  /*
    E il diniego non nomina piu i soli modelli di documento: chi lo legge
    dev'essere in grado di capire che gli mancano entrambe le cose.
  */
  assert.match(page, /I modelli di documento e i moduli online li vede/);
});

test("un ruolo senza i modelli di stampa atterra su una scheda che esiste", () => {
  const page = readCode(PAGE);

  /*
    La scheda attiva si **ricava** dall'elenco di quelle disponibili: con
    `activeTab` fisso a «documents», chi non ha i modelli di documento sarebbe
    atterrato su una scheda che per lui non esiste, cioe su una pagina vuota.
  */
  assert.match(page, /availableTabs/);
  assert.match(page, /currentTab/);
  assert.match(page, /<Tabs\s+value=\{currentTab\}/);
});

/* ------------------------------ W6-43: un caricamento non smonta le altre */

test("l'uscita anticipata su loading non c'e piu", () => {
  const page = readCode(PAGE);

  assert.ok(
    !/if \(loading\) \{\s*return/.test(page),
    "un return su loading prima dei Tabs smonta FormsDashboard a ogni ricarica",
  );
});

test("la scheda dei moduli online non dipende dal caricamento dei documenti", () => {
  const page = readCode(PAGE);
  const scheda = page.slice(
    page.indexOf('<TabsContent value="online-forms">'),
    page.indexOf("</TabsContent>", page.indexOf('<TabsContent value="online-forms">')),
  );

  assert.ok(scheda.includes("<FormsDashboard />"));
  assert.ok(
    !scheda.includes("documentsLoading") && !scheda.includes("loading"),
    "il cruscotto dei moduli si carica da solo",
  );
});

test("le schede documentali mostrano il caricamento al proprio interno", () => {
  const page = readCode(PAGE);

  assert.match(page, /documentsLoading \? \(/);
  assert.match(
    page,
    /\{documentsLoading \? \(\s*<div[^>]*>\s*<AppLoadingScreen/,
    "il caricamento dei modelli sta dentro la sua scheda",
  );
});

/* -------------------------- W6-44: caricamento, errore, elenco vuoto */

test("errore ed elenco vuoto sono due schermate diverse", () => {
  const dashboard = readCode(DASHBOARD);

  for (const stato of [
    'templatesState.status === "loading"',
    'templatesState.status === "error"',
    'submissionsState.status === "loading"',
    'submissionsState.status === "error"',
  ]) {
    assert.ok(
      dashboard.includes(stato),
      `manca lo stato ${stato}: un errore tornerebbe a leggersi come «non c'e niente»`,
    );
  }

  assert.match(dashboard, /Nessun modulo, per ora/);
  assert.match(dashboard, /Niente in coda/);
});

test("l'errore si puo riprovare, e lo dice", () => {
  const dashboard = readCode(DASHBOARD);

  assert.match(dashboard, /function LoadFailure|const LoadFailure/);
  assert.match(dashboard, /Riprova/);
  assert.match(dashboard, /onRetry=\{\(\) => void loadTemplates\(\)\}/);
  assert.match(dashboard, /onRetry=\{\(\) => void loadSubmissions\(\)\}/);
});

test("un elenco letto male si butta, non si mostra accanto all'errore", () => {
  const dashboard = readCode(DASHBOARD);

  assert.match(dashboard, /setTemplates\(\[\]\);\s*setTemplatesState\(\{/);
  assert.match(dashboard, /setSubmissions\(\[\]\);\s*setSubmissionsState\(\{/);
});

/* ------------------------------ W6-45: modello e istanza sono due cose */

test("i modelli consigliati sono un catalogo, non voci di «Nuovo modulo»", () => {
  const dashboard = readCode(DASHBOARD);

  assert.match(dashboard, /Modelli consigliati/);
  assert.match(dashboard, /<TabsTrigger value="modelli">/);
  assert.ok(
    !dashboard.includes("STARTER_TEMPLATES"),
    "l'elenco dei modelli non e piu un menu a tendina sotto «Nuovo modulo»",
  );
  assert.match(dashboard, /DISTRIBUTABLE_FORM_CATALOG/);
});

test("una voce di catalogo dice classe, proprietario del contenuto e rilettura", () => {
  const dashboard = readCode(DASHBOARD);

  assert.match(dashboard, /FORM_CATALOG_CLASS_LABELS/);
  assert.match(dashboard, /entry\.editorialOwner/);
  assert.match(dashboard, /entry\.lastReviewedAt/);
});

test("un modulo nato da un modello dice da quale", () => {
  const dashboard = readCode(DASHBOARD);

  assert.match(dashboard, /Da modello EasyGame/);
  assert.match(dashboard, /catalogTitleByKey\.get\(template\.catalogKey\)/);
});

/* --------------------------------------------- W6-48: salva e riprendi */

test("i due moduli compilabili salvano e riprendono la bozza locale", () => {
  for (const componente of [PUBLIC_FORM, RENEWAL]) {
    const code = readCode(componente);

    assert.match(
      code,
      /from "@\/lib\/forms\/draft-storage"/,
      `${componente} deve passare dal proprietario della bozza locale`,
    );
    assert.match(code, /saveFormDraft\(/, `${componente} non salva`);
    assert.match(code, /readFormDraft\(/, `${componente} non riprende`);
    assert.match(
      code,
      /clearFormDraft\(draftKey\)/,
      `${componente} non cancella la bozza`,
    );
    assert.ok(
      !code.includes("localStorage") && !code.includes("sessionStorage"),
      `${componente} non deve parlare direttamente con l'archivio del browser`,
    );
  }
});

test("la bozza si propone, non si ripristina di nascosto", () => {
  for (const componente of [PUBLIC_FORM, RENEWAL]) {
    const code = readCode(componente);

    assert.match(code, /foundDraft/, `${componente} deve tenere la bozza in attesa`);
    assert.match(code, /Riprendi/, `${componente} deve offrire di riprendere`);
    assert.match(code, /Ricomincia/, `${componente} deve offrire di ricominciare`);
  }
});

test("non si salva prima che qualcuno abbia scritto qualcosa", () => {
  for (const componente of [PUBLIC_FORM, RENEWAL]) {
    const code = readCode(componente);

    /*
      Senza questa guardia il primo salvataggio parte al montaggio con il
      modulo vuoto e **cancella** la bozza appena ritrovata.
    */
    assert.match(code, /!touched\) return/, `${componente} salva troppo presto`);
    assert.match(code, /setTouched\(true\)/);
  }
});

test("la bozza si cancella solo dopo un invio riuscito", () => {
  const pubblico = readCode(PUBLIC_FORM);
  const posizioneErrore = pubblico.indexOf("setFailure(result?.error?.message");
  /* La pulizia dentro `submit` sta **dopo** il ritorno anticipato sull'errore. */
  const posizionePulizia = pubblico.indexOf(
    "clearFormDraft(draftKey);",
    posizioneErrore,
  );
  const posizioneSuccesso = pubblico.indexOf(
    "setSuccess(result.data.successMessage)",
  );

  assert.ok(posizioneErrore > 0 && posizionePulizia > 0);
  assert.ok(
    posizionePulizia > posizioneErrore && posizionePulizia < posizioneSuccesso,
    "cancellare la bozza su un invio rifiutato e il modo peggiore di dire «controlla i campi»",
  );
});
