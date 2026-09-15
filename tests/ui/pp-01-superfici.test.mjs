import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **PP-01 — le superfici che sono cambiate, e le regole che le tengono ferme.**
 *
 * Questo file presidia cio che PP-01 ha spostato: la barra laterale, la scheda
 * atleta e il modulo di modifica di un allenamento. Non presidia la **logica**
 * — quella sta nei test di dominio e in `scripts/pp-01-uat.mjs`, che gira
 * contro un database vero — ma il fatto che una funzione **abbia una porta**.
 *
 * E la lezione del difetto §11 di CLAUDE.md, che PP-01 ha incontrato tre volte
 * in una settimana: la forma piu comune di funzione incompleta non e il codice
 * mancante, e il codice **irraggiungibile**. «Accesso EasyGame» esisteva, era
 * completo e testato, e PP-01 lo ha spostato dietro un pulsante: se quel
 * pulsante sparisse, ogni test di dominio resterebbe verde.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const senzaCommenti = (sorgente) =>
  sorgente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const SCHEDA = "app/athletes/[id]/page.tsx";
/* Dal Web V2 l'intestazione della scheda e il `RecordHeader` avvolto per l'atleta. */
const INTESTAZIONE = "components/athletes/profile/v2/AthleteRecordHeader.tsx";
const ACCESSO = "components/athletes/profile/athlete-account-section.tsx";
/*
  Dal Web V2 la barra del club e in due file: le voci (etichette, indirizzi,
  gruppi) in `web/shell/navigation.ts`, il disegno in `web/shell/Sidebar.tsx`.
*/
const BARRA = "components/web/shell/navigation.ts";
const BARRA_UI = "components/web/shell/Sidebar.tsx";
const BARRA_MOBILE = "components/layout/MobileTopBar.tsx";

/* ==================================================================== */
/*  §G — «Accesso EasyGame» dietro un pulsante, non sopra l'anagrafica   */
/* ==================================================================== */

test("§G · l'accesso EasyGame ha un pulsante che lo apre", () => {
  const intestazione = senzaCommenti(leggi(INTESTAZIONE));
  const scheda = senzaCommenti(leggi(SCHEDA));

  assert.ok(
    intestazione.includes("Accesso EasyGame"),
    "il pulsante deve stare nell'intestazione della scheda",
  );
  assert.ok(
    intestazione.includes("onOpenAccount"),
    "e deve chiamare qualcuno: un pulsante senza gestore e la forma piu comune di funzione irraggiungibile",
  );
  assert.ok(
    scheda.includes("<AthleteAccountDialog"),
    "la scheda monta il dialogo, altrimenti il pulsante apre il nulla",
  );
  assert.ok(
    scheda.includes("setPannelloAccessoAperto(true)"),
    "e il pulsante lo apre davvero",
  );
});

test("§G · il pulsante non compare a chi non puo gestire l'accesso", () => {
  const scheda = senzaCommenti(leggi(SCHEDA));
  const accesso = leggi(ACCESSO);

  assert.ok(
    scheda.includes("usePuoGestireAccessoAtleta()"),
    "la scheda chiede il permesso con lo stesso gancio del pannello",
  );
  assert.ok(
    scheda.includes("puoGestireAccesso"),
    "e lo usa per decidere se disegnare il pulsante",
  );

  /*
    **La chiave resta una sola.** Se la scheda la scrivesse per conto proprio,
    il giorno in cui una delle due cambiasse comparirebbe un pulsante che apre
    un pannello vuoto — che e esattamente il difetto W6-26, un pulsante che
    prometteva una cosa che non succedeva.
  */
  assert.equal(
    (scheda.match(/accounts\.athlete\.manage/g) || []).length,
    0,
    "la chiave del permesso vive nel proprietario del dominio, non nella pagina",
  );
  assert.ok(
    accesso.includes('"accounts.athlete.manage"'),
    "e il proprietario e la sezione dell'accesso",
  );
  assert.ok(
    accesso.includes("if (!puoGestire) return null;"),
    "il pannello si difende comunque da se: nascondere non e proteggere",
  );
});

test("§G · nessuna password compare nel pannello, in nessun ramo", () => {
  /*
    ADR-0104: non esiste una password da mostrare. Il server manda un link e la
    persona la sceglie. Il presidio resta anche dopo lo spostamento, perche cio
    che si sposta e piu facile perdere di vista.
  */
  const accesso = senzaCommenti(leggi(ACCESSO));
  for (const vietato of ["password:", "password ="]) {
    assert.equal(
      accesso.toLowerCase().includes(vietato),
      false,
      `il pannello non compone credenziali (${vietato})`,
    );
  }
});

/* ==================================================================== */
/*  §I — «Dati personali» in fondo a «Generale»                          */
/* ==================================================================== */

test("§I · i dati personali stanno dentro la scheda Generale", () => {
  const scheda = leggi(SCHEDA);

  assert.ok(
    scheda.includes(
      'from "@/components/athletes/profile/athlete-data-subject-section"',
    ),
    "la sezione resta montata: spostarla non e toglierla",
  );

  /*
    Con il Web V2 «Generale» e diventata l'area **Profilo** (09 §9.8): la
    sezione sta dentro quell'area, ed e l'ultima — chi apre la scheda cerca
    l'anagrafica, e i diritti dell'interessato sono l'ultima cosa che si fa,
    non la prima che si legge.
  */
  const profilo = scheda.indexOf('area === "profilo"');
  const attivita = scheda.indexOf('area === "attivita"');
  const sezione = scheda.indexOf("<AthleteDataSubjectSection");

  assert.ok(profilo > 0 && attivita > profilo, "le due aree esistono in ordine");
  assert.ok(
    sezione > profilo && sezione < attivita,
    "la sezione sta dentro «Profilo», e non piu sopra le aree",
  );

  const anagrafica = scheda.indexOf("<AthleteAnagraficaCard");
  const famiglia = scheda.indexOf("<AthleteGuardiansPanel");
  assert.ok(
    anagrafica > profilo && famiglia > anagrafica && sezione > famiglia,
    "sta dopo l'anagrafica e la famiglia, in coda all'area",
  );
});

test("§I · nessuna delle due sezioni e montata due volte", () => {
  const scheda = leggi(SCHEDA);
  for (const [componente, quante] of [
    ["<AthleteDataSubjectSection", 1],
    ["<AthleteAccountDialog", 1],
    ["<AthleteRecordHeader", 1],
  ]) {
    assert.equal(
      (scheda.split(componente).length - 1),
      quante,
      `${componente} deve comparire ${quante} volta`,
    );
  }
});

/* ==================================================================== */
/*  §K e §L — la barra laterale                                         */
/* ==================================================================== */

test("§K · la barra blu ha una larghezza sola, e le tre la condividono", () => {
  /*
    La barra del club segue la geometria del sistema Web V2 (256/72,
    guideline 06 §6.1–6.2); quelle di allenatore e famiglia restano a 264/80
    finche non vengono ridisegnate.
  */
  const club = leggi(BARRA_UI);
  assert.ok(club.includes('"w-[256px]"'), `${BARRA_UI}: la barra estesa e a 256px`);
  assert.ok(club.includes('"w-[72px]"'), `${BARRA_UI}: la barra compressa e a 72px`);
  assert.equal(club.includes('"w-[320px]"'), false);

  const barre = [
    "components/trainer/TrainerSidebar.tsx",
    "components/parent-dashboard/ParentSidebar.tsx",
  ];

  for (const file of barre) {
    const sorgente = leggi(file);
    assert.ok(
      sorgente.includes('"w-[264px]"'),
      `${file}: la barra estesa deve avere la larghezza ridotta di PP-01`,
    );
    assert.ok(
      sorgente.includes('"w-[80px]"'),
      `${file}: la barra compressa non e cambiata`,
    );
    assert.equal(
      sorgente.includes('"w-[320px]"'),
      false,
      `${file}: la larghezza precedente non deve sopravvivere in nessun ramo`,
    );
  }
});

test("§K · nella barra compressa ogni voce dice il proprio nome", () => {
  const barra = senzaCommenti(leggi(BARRA_UI));
  const voci = senzaCommenti(leggi(BARRA));

  /*
    L'HUB era l'unica icona della barra compressa senza il fumetto delle altre:
    aveva `title`, che e del browser, arriva dopo un secondo e non risponde al
    fuoco da tastiera. Nel Web V2 l'HUB e una voce come le altre, e ogni voce
    compressa ha il `Tooltip` del sistema.
  */
  assert.ok(
    voci.includes('href: "/hub"') &&
      barra.includes("<Tooltip content={item.label}"),
    "anche l'HUB e una pagina, e nella barra compressa e un'icona come le altre",
  );
  assert.equal(
    barra.includes('title="EasyGame HUB"'),
    false,
    "e non deve restare il fumetto del browser accanto a quello dell'applicazione",
  );
});

test("§L · Lavoro Sportivo e una voce sola, in tutte e due le barre", () => {
  const sottopagine = [
    "/sport-work/relationships",
    "/sport-work/compensations",
    "/sport-work/deadlines",
    "/sport-work/obligations",
  ];

  for (const file of [BARRA, BARRA_MOBILE]) {
    const sorgente = senzaCommenti(leggi(file));
    assert.ok(
      sorgente.includes('href: "/sport-work"'),
      `${file}: la voce del modulo deve restare`,
    );
    for (const sottopagina of sottopagine) {
      assert.equal(
        sorgente.includes(sottopagina),
        false,
        `${file}: ${sottopagina} non deve essere una voce di menu`,
      );
    }
  }
});

test("§L · le sottopagine restano raggiungibili dentro il modulo", () => {
  /*
    **Togliere una voce di menu e togliere una funzione, se non resta una
    strada.** Qui la strada c'e ed e precedente: il modulo disegna la propria
    riga di sezioni su tutte le sue pagine. Questo controllo verifica che
    continui a esistere, perche e cio che rende la rimozione una
    semplificazione invece di una perdita.
  */
  /*
    Wave E (Web V2): la riga di sezioni della V1 e diventata il controllo
    segmentato di `src/components/sport-work/v2/sport-work-shell.tsx`, che
    dichiara le stesse cinque destinazioni e le disegna con la stessa mappa.
  */
  const guscio = leggi("components/sport-work/v2/sport-work-shell.tsx");

  for (const percorso of [
    "/sport-work",
    "/sport-work/relationships",
    "/sport-work/compensations",
    "/sport-work/deadlines",
    "/sport-work/obligations",
  ]) {
    assert.ok(
      guscio.includes(`href: "${percorso}"`),
      `${percorso} deve restare nella navigazione interna del modulo`,
    );
  }

  assert.ok(
    guscio.includes("SPORT_WORK_SECTIONS.map"),
    "e la riga di sezioni deve essere disegnata, non solo dichiarata",
  );
});

/* ==================================================================== */
/*  §M — due nomi diversi per due sistemi diversi                       */
/* ==================================================================== */

test("§M · «Permessi» e «Ruoli e accessi» non si chiamano piu allo stesso modo", () => {
  /*
    Le due voci stanno adiacenti nello stesso gruppo e governano sistemi
    disgiunti: la prima gli interruttori della dashboard dell'allenatore in
    `clubs.settings`, la seconda i ruoli di club in tabelle proprie (ADR-0102).
    Nessuna delle venticinque chiavi della prima sta nel catalogo della seconda.
    La ricognizione che porta a **tenerle separate** sta in
    `docs/knowledge-base/42-pp-01-club-atleti-allenamenti.md`.
  */
  for (const file of [BARRA, BARRA_MOBILE]) {
    const sorgente = senzaCommenti(leggi(file));
    assert.ok(
      sorgente.includes('"Permessi allenatore"'),
      `${file}: la voce deve dire di quali permessi si tratta`,
    );
    assert.ok(
      sorgente.includes('"Ruoli e accessi"'),
      `${file}: e l'altra deve restare distinta`,
    );
  }

  /* Web V2 (Wave E): la pagina porta lo stesso nome della barra, lettera per lettera. */
  assert.ok(
    leggi("components/permissions/v2/trainer-permissions-page.tsx").includes(
      'title="Permessi allenatore"',
    ),
    "la pagina si chiama come la voce della barra",
  );
});

/* ==================================================================== */
/*  §J — una sola superficie per il proprio account                     */
/* ==================================================================== */

test("§J · «Profilo» porta all'unica superficie che funziona per ogni ruolo", () => {
  for (const file of [
    "components/web/shell/Topbar.tsx",
    "components/layout/MobileTopBar.tsx",
  ]) {
    const sorgente = senzaCommenti(leggi(file));
    assert.ok(
      sorgente.includes('/account?profile=1'),
      `${file}: la voce «Profilo» apre il profilo dentro /account`,
    );
    assert.equal(
      /\/profile\/\$\{/.test(sorgente),
      false,
      `${file}: non deve piu portare alla seconda superficie`,
    );
  }

  assert.ok(
    leggi("components/account/v2/account-home-screen.tsx").includes(
      'params.get("profile") === "1"',
    ),
    "e il parametro deve aprire davvero il dialogo, non lasciare la persona a cercarlo",
  );
});

test("§J · il vecchio indirizzo resta una porta, non un 404", () => {
  const pagina = leggi("app/profile/[userId]/page.tsx");
  assert.ok(
    pagina.includes('redirect("/account?profile=1")'),
    "un segnalibro o un messaggio di primo accesso deve continuare ad arrivare da qualche parte",
  );
  assert.equal(
    pagina.includes("supabase"),
    false,
    "la pagina che scriveva su una colonna inesistente non deve sopravvivere sotto il reindirizzamento",
  );
});
