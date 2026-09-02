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

/*
  **Le chiavi sotto cui vive una sessione.**

  Il presidio guarda **queste**, non il nome della variabile che viene
  serializzata: una revisione ostile ha rimesso il difetto rinominando
  `session` in `dati`, e la prima stesura — che cercava la parola «session»
  dentro lo `setItem` — dava cinque verdi con il gettone di nuovo in chiaro.

  Il nome di una variabile e di chi scrive; la chiave dell'archivio e il
  contratto.
/**
 * I soli file lato client che possono **nominare** una credenziale di sessione.
 *
 * E la piu forte delle tre difese, e la ragione e questa: per far uscire il
 * gettone dal browser bisogna o **nominarlo** — e allora si finisce qui — o
 * serializzare l'oggetto sessione intero, che e cio che il controllo successivo
 * copre.
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

    Una revisione ostile ha rimesso il gettone in `localStorage` in tre modi
    diversi: rinominando la variabile serializzata, usando una **chiave nuova**,
    e passando da `document.cookie`. Il presidio precedente cercava la chiave
    dell'archivio fra cinque nomi cablati, e tutti e tre gli passavano davanti.

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

    if (!/\baccess_token\b|\brefresh_token\b/.test(testo)) continue;
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
 * Le scritture di un **oggetto** in un archivio del browser, dichiarate una per
 * una con il motivo.
 *
 * Cercare la **chiave** fra cinque nomi noti non poteva vedere una cache
 * battezzata `easygame.session.v2`: una revisione ostile ne ha aggiunta una e
 * ha ottenuto sei verdi. Qui si prende la direzione opposta — si dichiara cosa
 * puo essere scritto — che e la stessa forma usata altrove nel repository per
 * le aree, le risorse e i confini.
 *
 * Sono poche e stabili. Una in piu si nota, ed e il punto.
 */
const SCRITTURE_DICHIARATE = new Map([
  ["components/dashboard/Sidebar.tsx", "preferenze di larghezza della barra"],
  ["components/layout/MobileTopBar.tsx", "sezioni aperte del menu"],
  ["app/communications/page.tsx", "bozza della comunicazione in corso"],
  ["components/documents/bulk-generation.ts", "lotto di generazione in corso"],
  [
    "components/parent-dashboard/parent-dashboard-context.tsx",
    "figlio selezionato e preferenze di vista",
  ],
  [
    "components/payments/use-athlete-payment-ledger.ts",
    "filtri della vista pagamenti",
  ],
  ["lib/forms/draft-storage.ts", "bozza di una compilazione, senza allegati"],

  /*
    Il club attivo e le sue liste. Portano nome, identificativo e stagione — non
    credenziali — e servono a dipingere l'interfaccia prima che il server
    risponda. Sono molte perche il valore e scritto da ogni schermata che puo
    cambiare club: e un debito di forma, non di sicurezza, e sta in [16].
  */
  ["app/dashboard/page.tsx", "club attivo dopo la scelta"],
  ["app/dashboard/[dashboardId]/page.tsx", "club attivo dopo la scelta"],
  ["app/organization/page.tsx", "club attivo dopo il salvataggio dei dati societari"],
  ["app/token-verification/[userId]/page.tsx", "club attivo e elenco club dopo la verifica"],
  ["components/account/account-home-screen.tsx", "club attivo scelto dalla schermata account"],
  ["lib/api/client.ts", "stagione attiva dentro il club gia in cache"],
  ["lib/simplified-db.ts", "club attivo e elenco club"],

  /* Preferenze di vista: colonne, filtri, impostazioni di una schermata. */
  ["app/athletes/page.tsx", "colonne visibili dell'elenco atleti"],
  ["app/matches/page.tsx", "impostazioni della schermata gare"],
  ["app/profile/[userId]/page.tsx", "cache del proprio profilo, per dipingere subito"],
]);

test("nessun percorso scrive un oggetto nel browser senza dichiararlo", async () => {
  const file = await sorgenti(SRC);
  const colpevoli = [];

  for (const percorso of file) {
    const relativo = path.relative(SRC, percorso).split(path.sep).join("/");
    const testo = await readFile(percorso, "utf8");
    if (!testo.includes("setItem(")) continue;

    const scritture =
      testo.match(new RegExp(String.raw`setItem\([\s\S]{0,400}?\)\s*;`, "g")) ||
      [];

    for (const scrittura of scritture) {
      if (!scrittura.includes("JSON.stringify(")) continue;
      if (scrittura.includes("sessionSenzaCredenziali")) continue;
      if (SCRITTURE_DICHIARATE.has(relativo)) continue;
      colpevoli.push(
        relativo + ": " + scrittura.replace(/\s+/g, " ").slice(0, 80),
      );
    }
  }

  assert.deepEqual(
    colpevoli,
    [],
    "scritture di oggetti nel browser non dichiarate: " +
      colpevoli.join(" | ") +
      ". Dichiarala in SCRITTURE_DICHIARATE con il motivo, oppure passa dalla funzione che toglie le credenziali",
  );
});

test("le scritture dichiarate esistono ancora", async () => {
  /*
    Un elenco di eccezioni invecchia: una voce che non corrisponde piu a niente
    fa credere coperto un file che non c'e piu, e nasconde il posto in cui la
    prossima nascera.
  */
  const file = await sorgenti(SRC);
  const conosciuti = new Set(
    file.map((percorso) =>
      path.relative(SRC, percorso).split(path.sep).join("/"),
    ),
  );

  const scomparse = [...SCRITTURE_DICHIARATE.keys()].filter(
    (relativo) => !conosciuti.has(relativo),
  );

  assert.deepEqual(
    scomparse,
    [],
    "scritture dichiarate che non esistono piu: " + scomparse.join(", "),
  );
});

test("nessun percorso del browser scrive un cookie a mano", async () => {
  /*
    **La terza difesa, e chiude la strada che nessuno aveva guardato.**

    La revisione ha rimesso il gettone anche con `document.cookie = "…"`. I
    cookie di sessione li scrive il **server**, con `httpOnly`: uno scritto dal
    browser e per definizione leggibile da ogni script della pagina, ed e
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

test("la regola vive in un posto solo, insieme alle chiavi delle cache", async () => {
  /*
    Le due copie erano nate perche la regola era scritta a mano, e una delle due
    scritture se ne era dimenticata. Il proprietario e `session-sync.ts`, che
    possiede gia i nomi delle chiavi: chi tocca una cache trova li anche la
    regola.
  */
  const modulo = await readFile("src/lib/auth/session-sync.ts", "utf8");
  assert.match(
    modulo,
    /export const sessionSenzaCredenziali/,
    "la funzione deve stare nel modulo che possiede le chiavi delle cache",
  );

  const consumatori = [
    "src/lib/supabase.ts",
    "src/components/providers/AuthProvider.tsx",
  ];
  for (const percorso of consumatori) {
    const testo = await readFile(percorso, "utf8");
    assert.match(
      testo,
      /sessionSenzaCredenziali/,
      `${percorso} scrive una cache di sessione e deve passare dalla regola condivisa`,
    );
  }
});
