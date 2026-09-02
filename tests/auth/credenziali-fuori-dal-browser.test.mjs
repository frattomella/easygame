import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { sessionSenzaCredenziali } from "../../src/lib/auth/session-sync.ts";

/**
 * **Il gettone di sessione non sopravvive in nessun archivio del browser.**
 *
 * Il cookie di sessione e `httpOnly` e `sameSite=lax`: uno script della pagina
 * non lo legge, ed e tutto il punto di quella scelta. Ma il prodotto ne teneva
 * **due** copie in chiaro — una in `localStorage` e una in `sessionStorage` — e
 * ognuna delle due annullava la difesa da sola: a uno script ostile non serviva
 * rubare un cookie, bastava un `getItem` e poi `Authorization: Bearer`, con una
 * credenziale viva quattordici giorni.
 *
 * **Perche questo file esiste, e non un solo controllo.** Il primo rimedio
 * aveva tolto la copia da `localStorage`, e il commento che lo accompagnava
 * affermava che non ne restava nessuna. Era falso: la seconda stava a duecento
 * righe di distanza, in un altro file, e l'ha trovata una revisione ostile.
 * Due rimedi scritti a mano in due posti sono due rimedi che divergono.
 *
 * Quindi qui non si presidia «il file X non scrive il gettone»: si presidia la
 * **proprieta** — nessun percorso del browser scrive un oggetto sessione senza
 * passare dalla funzione che toglie le credenziali. Una terza cache che
 * nascesse domani fallisce qui.
 *
 * **Cosa resta, ed e dichiarato.** Il gettone continua a uscire nel *corpo*
 * della risposta di login, perche e l'unica credenziale della app mobile, che
 * lo rilegge e lo manda come `Bearer`. Toglierlo dalla risposta e un cambio di
 * contratto fra i due alberi del repository, con la sua migrazione. La
 * differenza che questi controlli ottengono e quella che conta: si puo ancora
 * **agire** come l'utente su una pagina aperta, non piu **portarsi via** una
 * credenziale da usare altrove.
 */

const SRC = path.resolve("src");

const CAMPI_CREDENZIALE = ["access_token", "refresh_token"];

/* ------------------------------------------------------- la funzione sola */

test("la funzione toglie le credenziali e lascia tutto il resto", () => {
  const sessione = {
    access_token: "6d5c5fec-token-vivo",
    refresh_token: "6d5c5fec-token-vivo",
    token_type: "bearer",
    expires_at: 1_800_000_000,
    user: { id: "user-1", email: "tizio@esempio.it" },
  };

  const ripulita = sessionSenzaCredenziali(sessione);

  for (const campo of CAMPI_CREDENZIALE) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(ripulita, campo),
      false,
      `«${campo}» non deve sopravvivere alla cache`,
    );
  }

  /*
    Cio che la cache serve a fare deve continuare a funzionare: e usata **solo**
    per dipingere subito l'interfaccia, e per farlo le basta l'utente.
  */
  assert.deepEqual(ripulita.user, sessione.user);
  assert.equal(ripulita.expires_at, sessione.expires_at);
});

test("nessuna credenziale sopravvive alla serializzazione", () => {
  /*
    Il controllo sopra guarda le chiavi di primo livello. Questo guarda il
    **testo** che finisce nell'archivio: se un giorno il gettone comparisse
    annidato dentro un altro campo, la prima prova non lo vedrebbe e questa si.
  */
  const gettone = "8401a28a-gettone-che-non-deve-uscire";
  const serializzata = JSON.stringify(
    sessionSenzaCredenziali({
      access_token: gettone,
      refresh_token: gettone,
      user: { id: "user-1" },
    }),
  );

  assert.equal(
    serializzata.includes(gettone),
    false,
    "il gettone e finito comunque nel testo scritto in archivio",
  );
});

test("l'oggetto di partenza non viene modificato", () => {
  const sessione = { access_token: "vivo", user: { id: "user-1" } };
  sessionSenzaCredenziali(sessione);

  assert.equal(
    sessione.access_token,
    "vivo",
    "la funzione produce una copia: mutare la sessione la romperebbe per chi la sta ancora usando",
  );
});

/* ------------------------------------------ nessuna terza cache, mai piu */

const sorgenti = async (cartella) => {
  const voci = await readdir(cartella, { withFileTypes: true });
  const file = [];
  for (const voce of voci) {
    const completo = path.join(cartella, voce.name);
    if (voce.isDirectory()) {
      file.push(...(await sorgenti(completo)));
    } else if (/\.(ts|tsx)$/.test(voce.name)) {
      file.push(completo);
    }
  }
  return file;
};

/**
 * I soli file lato client che possono **nominare** una credenziale di sessione.
 *
 * E la piu forte delle tre difese, e la ragione e questa: per far uscire il
 * gettone dal browser bisogna o **nominarlo** — e allora si finisce qui — o
 * scriverlo in un archivio, che e cio che le regole successive coprono.
 */
const PUO_NOMINARE_LA_CREDENZIALE = new Map([
  [
    path.join("lib", "auth", "session-sync.ts"),
    "e il modulo che le toglie: e l'unico posto in cui i due nomi devono comparire",
  ],
  [
    path.join("lib", "supabase.ts"),
    "dichiara la forma della sessione che il server risponde, e non ne scrive nessuna copia",
  ],
]);

test("nessun file del browser nomina una credenziale di sessione", async () => {
  /*
    **La prima delle tre difese, e quella che chiude l'aliasing.**

    Una revisione ostile ha rimesso il gettone in `localStorage` in tre modi:
    rinominando la variabile serializzata, usando una **chiave nuova**, e
    passando da `document.cookie`. Una revisione successiva ne ha trovato un
    quarto: **comporre il nome a pezzi**, `"access" + "_token"`.

    Il codice server e escluso: li il gettone si crea, ed e il suo posto.
  */
  const file = await sorgenti(SRC);
  const colpevoli = [];

  for (const percorso of file) {
    const relativo = path.relative(SRC, percorso);
    if (relativo.startsWith(path.join("lib", "server"))) continue;
    if (relativo.startsWith(path.join("app", "api"))) continue;

    const testo = (await readFile(percorso, "utf8"))
      .replace(/parent_access_token\w*/g, "")
      .replace(/access_tokens/g, "");

    /* Un nome ricomposto e lo stesso nome: si toglie cio che separa i pezzi. */
    const ricomposto = testo.replace(/["'`]\s*\+\s*["'`]/g, "");

    const nomina = (t) => /\baccess_token\b|\brefresh_token\b/.test(t);
    if (!nomina(testo) && !nomina(ricomposto)) continue;
    if (PUO_NOMINARE_LA_CREDENZIALE.has(relativo)) continue;
    colpevoli.push(relativo);
  }

  assert.deepEqual(
    colpevoli,
    [],
    "file del browser che nominano una credenziale di sessione: " +
      colpevoli.join(", ") +
      ". Il cookie e httpOnly proprio perche il gettone non viva nel browser",
  );
});

/**
 * **Le chiavi che il prodotto puo scrivere in un archivio del browser.**
 *
 * La stesura precedente dichiarava i **file**, e una revisione ha misurato il
 * prezzo di quella scelta: `AuthProvider.tsx` era dichiarato — per il club
 * attivo — ed e esattamente il file che ha in mano l'oggetto sessione. Da li
 * si scriveva `sessionStorage.setItem("easygame.sync.v2",
 * JSON.stringify(session))` con sei gate verdi.
 *
 * Si dichiara quindi la **chiave**, che e cio che finisce nel browser: una
 * chiave nuova si nota anche dentro un file gia dichiarato, ed e il punto.
 *
 * Le chiavi composte a runtime si dichiarano con la loro **forma**:
 * l'interpolazione e sempre un identificativo, mai un contenuto.
 */
const CHIAVI_DICHIARATE = new Map([
  ["activeClub", "il club attivo"],
  ["activeClub_${}", "il club attivo, per utente"],
  ["userClubs", "l'elenco dei club dell'utente"],
  ["userClubs_${}", "l'elenco dei club, per utente"],
  ["supabase_session_timestamp", "l'istante dell'ultima sincronizzazione"],
  ["app-language", "la lingua scelta"],
  ["organization-name", "il nome del club, per dipingere subito l'intestazione"],
  ["organization-logo", "il logo del club, per la stessa ragione"],
  ["sidebar-collapsed", "barra laterale aperta o chiusa"],
  ["athlete-sidebar-collapsed", "barra laterale aperta o chiusa"],
  ["parent-sidebar-collapsed", "barra laterale aperta o chiusa"],
  ["trainer-sidebar-collapsed", "barra laterale aperta o chiusa"],
  ["profileImage_${}", "immagine del profilo, durante la verifica"],
  ["userName_${}", "nome mostrato, durante la verifica"],
  ["athleteColumns_${}", "colonne scelte nella tabella atleti"],
  ["matchSettings_scheduleConflicts", "preferenza di vista sulle gare"],
  ["matchSettings_athleteStatusFilter", "preferenza di vista sulle gare"],
  ["userProfile_${}", "nome e immagine, per dipingere subito l'intestazione"],
  /*
    **La cache della sessione, ed e la sola chiave che ne contiene una.**

    Ci finisce cio che `sessionSenzaCredenziali` restituisce, non la sessione
    intera. La regola che segue lo pretende: dichiarare la chiave non basta,
    perche una dichiarazione e un permesso e non una garanzia.
  */
  ["supabase_session", "la sessione senza credenziali, per dipingere subito l'interfaccia"],
]);

/**
 * I prefissi delle chiavi che una schermata compone per se — bozze, filtri,
 * lotti — e che non si possono elencare una per una perche ne esiste una per
 * documento aperto. Ognuno dice **che cosa** ci finisce dentro.
 */
const PREFISSI_DICHIARATI = new Map([
  ["easygame-comm-draft", "bozza della comunicazione in corso"],
  ["easygame-bulk", "lotto di generazione documenti in corso"],
  ["easygame:form-draft", "bozza di una compilazione, senza allegati"],
  ["easygame-parent", "figlio selezionato e preferenze di vista"],
  ["easygame.parent", "figlio selezionato e preferenze di vista"],
  ["easygame-payments", "filtri della vista pagamenti"],
  ["easygame.payments", "filtri della vista pagamenti"],
]);

const PREFISSI = [...PREFISSI_DICHIARATI.keys()];

const chiaveDichiarata = (chiave) =>
  CHIAVI_DICHIARATE.has(chiave) ||
  PREFISSI.some((prefisso) => chiave.startsWith(prefisso));

test("ogni chiave scritta in un archivio del browser e dichiarata", async () => {
  /*
    **Si guarda la chiave, non la forma del valore ne il file.**

    Due evasioni misurate hanno portato qui. La prima: il presidio si accendeva
    solo su `JSON.stringify(`, e `String(session[campo])` gli passava davanti.
    La seconda: l'eccezione era per file, e il file che ha in mano la sessione
    era fra le eccezioni.

    Si cerca anche la scrittura **per proprieta** — `localStorage["x"] = y` —
    che scrive un item esattamente come `setItem` e che nessuna regola
    guardava.
  */
  const file = await sorgenti(SRC);
  const colpevoli = [];

  const FORME = [
    /(?:localStorage|sessionStorage)\s*\.\s*setItem\s*\(\s*(?:["'`][^"'`]*["'`]|`[^`]*`)/g,
    /(?:localStorage|sessionStorage)\s*\[\s*(?:["'`][^"'`]*["'`]|`[^`]*`)\s*\]\s*=/g,
  ];

  for (const percorso of file) {
    const relativo = path.relative(SRC, percorso).split(path.sep).join("/");
    const testo = await readFile(percorso, "utf8");

    for (const forma of FORME) {
      for (const trovato of testo.match(forma) || []) {
        const conApici = trovato.match(/["'](.*)["']$/);
        const conTemplate = trovato.match(/`([^`]*)`/);
        const chiave = conTemplate
          ? conTemplate[1].replace(/\$\{[^}]*\}/g, "${}")
          : conApici
            ? conApici[1]
            : null;

        if (chiave !== null && chiaveDichiarata(chiave)) continue;
        colpevoli.push(`${relativo}: ${chiave ?? trovato.trim()}`);
      }
    }
  }

  assert.deepEqual(
    colpevoli,
    [],
    "chiavi scritte in un archivio del browser e non dichiarate: " +
      colpevoli.join(" | ") +
      ". Dichiarala in CHIAVI_DICHIARATE con il motivo",
  );
});

/**
 * Le chiavi sotto cui vive una **sessione**, e che percio non possono essere
 * scritte con l'oggetto intero.
 */
const CHIAVI_DI_SESSIONE = ["supabase_session", "easygame.session"];

test("cio che si scrive sotto una chiave di sessione passa dalla funzione che toglie le credenziali", async () => {
  /*
    **Dichiarare una chiave e un permesso, non una garanzia.**

    `supabase_session` e dichiarata, e deve esserlo: la cache serve a dipingere
    subito l'interfaccia. Ma chiunque potrebbe scriverci `JSON.stringify(session)`
    — l'oggetto intero, gettone compreso — e nessuna delle altre regole se ne
    accorgerebbe, perche quella riga non **nomina** nessuna credenziale e la
    chiave e in elenco.

    Questa regola guarda **cosa** ci si scrive: sotto una chiave di sessione
    puo finire solo cio che passa da `sessionSenzaCredenziali`.
  */
  const file = await sorgenti(SRC);
  const colpevoli = [];

  for (const percorso of file) {
    const relativo = path.relative(SRC, percorso).split(path.sep).join("/");
    const testo = await readFile(percorso, "utf8");

    for (const chiave of CHIAVI_DI_SESSIONE) {
      const scritture =
        testo.match(
          new RegExp(
            String.raw`(?:localStorage|sessionStorage)\s*(?:\.\s*setItem\s*\(|\[)\s*["'\`]` +
              chiave.replace(/\./g, "\\.") +
              String.raw`["'\`][\s\S]{0,200}?\)`,
              "g",
          ),
        ) || [];

      for (const scrittura of scritture) {
        if (scrittura.includes("sessionSenzaCredenziali")) continue;
        colpevoli.push(
          relativo + ": " + scrittura.replace(/\s+/g, " ").slice(0, 90),
        );
      }
    }
  }

  assert.deepEqual(
    colpevoli,
    [],
    "sotto una chiave di sessione si scrive qualcosa che non passa da " +
      "sessionSenzaCredenziali: " + colpevoli.join(" | "),
  );
});

test("le chiavi dichiarate esistono ancora", async () => {
  /*
    Un elenco di eccezioni invecchia: una voce che non corrisponde piu a
    niente fa credere coperto un posto che non c'e piu.
  */
  const file = await sorgenti(SRC);
  const scritte = new Set();

  for (const percorso of file) {
    const testo = await readFile(percorso, "utf8");
    for (const trovato of testo.match(
      /(?:localStorage|sessionStorage)\s*\.\s*(?:setItem|getItem|removeItem)\s*\(\s*(?:["'`][^"'`]*["'`]|`[^`]*`)/g,
    ) || []) {
      const conApici = trovato.match(/["'](.*)["']$/);
      const conTemplate = trovato.match(/`([^`]*)`/);
      const chiave = conTemplate
        ? conTemplate[1].replace(/\$\{[^}]*\}/g, "${}")
        : conApici
          ? conApici[1]
          : null;
      if (chiave !== null) scritte.add(chiave);
    }
  }

  const scomparse = [...CHIAVI_DICHIARATE.keys()].filter(
    (chiave) => !scritte.has(chiave),
  );

  assert.deepEqual(
    scomparse,
    [],
    "chiavi dichiarate che nessuno scrive o legge piu: " + scomparse.join(", "),
  );
});

test("nessun percorso del browser usa un archivio non dichiarato", async () => {
  /*
    Gli altri archivi che un browser offre: `window.name` sopravvive alla
    navigazione, IndexedDB e uno spazio intero, e lo stato della cronologia
    viaggia con la pagina. Nessuno dei tre e usato dal prodotto, ed e per
    questo che vale la pena dirlo adesso.
  */
  const file = await sorgenti(SRC);
  const colpevoli = [];

  const ARCHIVI = [
    [/\bwindow\.name\s*=/, "window.name"],
    [/\bindexedDB\b/, "IndexedDB"],
    [
      /history\.(replace|push)State\s*\(\s*(?!\{\s*\}|null|undefined|window\.history\.state|history\.state)[^)\s]/,
      "history.state",
    ],
  ];

  for (const percorso of file) {
    const relativo = path.relative(SRC, percorso);
    if (relativo.startsWith(path.join("lib", "server"))) continue;
    if (relativo.startsWith(path.join("app", "api"))) continue;

    const testo = await readFile(percorso, "utf8");
    for (const [forma, nome] of ARCHIVI) {
      if (forma.test(testo)) colpevoli.push(`${relativo}: ${nome}`);
    }
  }

  assert.deepEqual(
    colpevoli,
    [],
    "archivi del browser usati senza che nessuno li abbia dichiarati: " +
      colpevoli.join(", "),
  );
});

test("nessun percorso del browser scrive un cookie a mano", async () => {
  /*
    I cookie di sessione li scrive il **server**, con `httpOnly`: uno scritto
    dal browser e per definizione leggibile da ogni script della pagina, ed e
    esattamente cio che quella scelta serve a impedire.
  */
  const file = await sorgenti(SRC);
  const colpevoli = [];

  for (const percorso of file) {
    const relativo = path.relative(SRC, percorso);
    if (relativo.startsWith(path.join("lib", "server"))) continue;
    if (relativo.startsWith(path.join("app", "api"))) continue;

    const testo = await readFile(percorso, "utf8");
    if (/document\.cookie\s*=/.test(testo)) colpevoli.push(relativo);
  }

  assert.deepEqual(
    colpevoli,
    [],
    "file del browser che scrivono un cookie a mano: " + colpevoli.join(", "),
  );
});
