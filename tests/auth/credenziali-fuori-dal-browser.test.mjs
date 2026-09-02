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

test("nessun percorso scrive una sessione nel browser senza togliere le credenziali", async () => {
  /*
    Si cerca la forma reale del difetto: uno `setItem` che serializza una
    variabile chiamata `session` (o `sessione`). Chi la scrive deve passare da
    `sessionSenzaCredenziali` nella stessa istruzione — chiamarla venti righe
    prima e riscrivere l'originale e proprio come e nato il secondo caso.
  */
  const file = await sorgenti(SRC);
  const colpevoli = [];

  for (const percorso of file) {
    const testo = await readFile(percorso, "utf8");
    if (!/setItem\(/.test(testo)) continue;

    const scritture =
      testo.match(/setItem\(\s*[\s\S]{0,200}?JSON\.stringify\(\s*[\s\S]{0,120}?\)/g) || [];

    for (const scrittura of scritture) {
      const parlaDiSessione = /\bsession\b|\bsessione\b/i.test(scrittura);
      if (!parlaDiSessione) continue;
      if (scrittura.includes("sessionSenzaCredenziali")) continue;
      colpevoli.push(`${path.relative(SRC, percorso)}: ${scrittura.slice(0, 90)}`);
    }
  }

  assert.deepEqual(
    colpevoli,
    [],
    `una sessione viene scritta nel browser con le credenziali dentro:\n${colpevoli.join("\n")}\n` +
      "Passa da `sessionSenzaCredenziali` (src/lib/auth/session-sync.ts): il cookie e httpOnly proprio perche quella copia non esista",
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
