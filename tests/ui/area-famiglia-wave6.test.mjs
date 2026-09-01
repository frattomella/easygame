import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  canAccessPath,
  getAccessRedirectPath,
} from "../../src/lib/access-roles.ts";

/**
 * **L'area famiglia, dopo la lane 6D.**
 *
 * Otto difetti con una radice comune: l'area famiglia **non diceva di chi
 * stesse parlando**, e in piu punti parlava di qualcun altro.
 *
 * - **W6-09/W6-10** «Nessuna stagione attiva» su un club che ne ha una;
 * - **W6-11** la ricevuta non scaricabile dal tutore che non ha una tessera;
 * - **W6-12** l'ingresso portava sempre al primo figlio, e il cambio esisteva
 *   in due pagine su tredici;
 * - **W6-13** notifiche, bacheca e prenotazioni **non** filtrate per figlio;
 * - **W6-14** la seconda categoria non caricata, quindi mezzo calendario;
 * - **W6-16/17/18** il certificato senza «in scadenza», con la data del
 *   certificato sbagliato e senza un posto dove portarne uno nuovo;
 * - **W6-19** le fatture nel payload e in nessuna schermata;
 * - **W6-21** quattro voci di menu verso pagine inesistenti.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const senzaCommenti = (sorgente) =>
  sorgente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const SERVER = "lib/server/parent-dashboard.ts";
const PAGINE = "components/parent-dashboard/parent-dashboard-pages.tsx";
const CONTESTO = "components/parent-dashboard/parent-dashboard-context.tsx";

/* ------------------------------------------------------------ W6-12 */

test("W6-12 · con piu figli si sceglie, con uno solo si entra", () => {
  const conDue = getAccessRedirectPath("parent", {
    linkedAthleteIds: ["a-1", "a-2"],
  });
  assert.equal(conDue, "/parent-view");

  const conUno = getAccessRedirectPath("parent", {
    linkedAthleteIds: ["a-1"],
  });
  assert.equal(conUno, "/parent-view/a-1");

  const senzaFigli = getAccessRedirectPath("parent", { linkedAthleteIds: [] });
  assert.equal(senzaFigli, "/account");
});

test("W6-12 · la schermata di scelta e raggiungibile, quella di un figlio altrui no", () => {
  const contesto = { linkedAthleteIds: ["a-1", "a-2"] };

  assert.equal(canAccessPath("parent", "/parent-view", contesto), true);
  assert.equal(canAccessPath("parent", "/parent-view/a-2/payments", contesto), true);
  assert.equal(
    canAccessPath("parent", "/parent-view/a-99/payments", contesto),
    false,
    "la scelta si fa fra i propri figli, e la guardia resta quella di prima",
  );

  // E resta un'area della famiglia: nessun altro ruolo ci entra.
  assert.equal(canAccessPath("trainer", "/parent-view", contesto), false);
  assert.equal(canAccessPath("owner", "/parent-view", contesto), false);
});

test("W6-12 · la scelta si fa in un posto solo, non in ogni pagina", () => {
  assert.ok(
    existsSync(path.join(SRC, "app", "parent-view", "page.tsx")),
    "manca la schermata di scelta",
  );

  const guscio = leggi(
    "components/parent-dashboard/parent-dashboard-shell.tsx",
  );
  assert.ok(
    guscio.includes('href="/parent-view"'),
    "il guscio deve offrire il ritorno alla scelta",
  );
  assert.ok(
    guscio.includes("Cambia figlio"),
    "e deve dirlo con parole, non con un'icona sola",
  );

  /*
    I tre selettori sparsi devono essere spariti: erano su due pagine su
    tredici, e il difetto non era la loro forma ma il fatto che le altre undici
    non dicessero niente.
  */
  for (const file of [
    PAGINE,
    "components/parent-dashboard/parent-family-pages.tsx",
  ]) {
    const sorgente = senzaCommenti(leggi(file));
    assert.equal(
      /linkedAthletes\.map\(\(athlete\) => \(/.test(sorgente) ||
        /figli\.map\(\(figlio: any\) => \(/.test(sorgente),
      false,
      `${file}: un selettore di figlio per pagina moltiplica i posti in cui la scelta puo diventare incoerente`,
    );
  }
});

/* ------------------------------------------------------- W6-09 · W6-10 */

test("W6-09 · la stagione la risolve il server, non il localStorage", () => {
  const server = leggi(SERVER);
  assert.ok(
    server.includes("normalizeActiveClubSeason(club)"),
    "era la funzione con zero chiamanti, ed e quella che risolve il difetto",
  );

  const contesto = leggi(CONTESTO);
  assert.ok(
    contesto.includes("activeSeasonId: payload.data.club.activeSeasonId"),
    "il contesto deve trasportare la stagione, non ricalcolarla",
  );
  assert.ok(
    contesto.includes("activeSeasonLabel: payload.data.club.activeSeasonLabel"),
    "senza l'etichetta l'intestazione torna ad azzerarla al primo `club-updated`",
  );
});

test("W6-10 · `settings` non esce piu intero verso la famiglia", () => {
  const server = senzaCommenti(leggi(SERVER));

  assert.equal(
    /^\s*settings: club\.settings,$/m.test(server),
    false,
    "l'intero blob di configurazione del club finiva nel browser di ogni genitore, per un campo solo",
  );
  assert.ok(
    server.includes("website:"),
    "cio che serve alla famiglia si dichiara, campo per campo",
  );

  const pagine = senzaCommenti(leggi(PAGINE));
  assert.equal(
    pagine.includes("data.club.settings"),
    false,
    "nessuna schermata della famiglia deve leggere la configurazione del club",
  );
});

/* ------------------------------------------------------------ W6-11 */

test("W6-11 · per una famiglia il confine e il legame, e il club dell'atleta si verifica", () => {
  const rotta = leggi("app/api/v1/documents/[kind]/[id]/route.ts");

  assert.ok(
    rotta.includes("if (!perLegame) {"),
    "il confine del club attivo non deve girare prima del ramo del legame",
  );
  assert.ok(
    /organization_id: row\.organization_id,/.test(rotta),
    "il legame da solo non dice di quale club e il documento: l'atleta va verificato",
  );

  const senza = senzaCommenti(rotta);
  const posizioneLegame = senza.indexOf("const perLegame");
  const posizioneConfine = senza.indexOf("assertActiveClub(scope");
  assert.ok(
    posizioneLegame > 0 && posizioneLegame < posizioneConfine,
    "il legame si valuta prima, altrimenti il tutore senza tessera non arriva mai al proprio ramo",
  );
});

/* ------------------------------------------------------------ W6-13 */

test("W6-13 · notifiche, bacheca e prenotazioni parlano del figlio scelto", () => {
  const server = leggi(SERVER);

  assert.ok(
    server.includes("const notificheDelFiglio = notifications.filter("),
    "le notifiche che nominano un atleta devono nominare questo",
  );
  assert.ok(
    server.includes('asRecord(notification.data).athleteId'),
    "l'attribuzione esiste gia nel dato: i promemoria sui certificati la scrivono",
  );

  const consegne = leggi("lib/server/communication-deliveries.ts");
  assert.ok(
    consegne.includes("athlete_ids: { isEmpty: true }"),
    "cio che non nomina nessun figlio parla del club, e resta visibile",
  );
  assert.ok(consegne.includes("athlete_ids: { has: athleteId }"));

  const prenotazioni = senzaCommenti(server);
  assert.equal(
    prenotazioni.includes("sameId(booking?.athleteId, selectedAthlete.id) ||"),
    false,
    "«del figlio OPPURE fatte da me» portava dentro le prenotazioni dell'altro figlio",
  );
});

/* ------------------------------------------------------------ W6-14 */

test("W6-14 · le appartenenze si caricano tutte, non solo la primaria", () => {
  const server = leggi(SERVER);

  assert.ok(
    server.includes("category_memberships: true,"),
    "la relazione non veniva nemmeno caricata: il calendario perdeva la seconda squadra",
  );
  assert.ok(
    server.includes("categories: asArray(athlete.category_memberships).map("),
    "e la famiglia deve vederle tutte, con la primaria dichiarata",
  );
});

/* ------------------------------------------- W6-16 · W6-17 · W6-18 */

test("W6-16/17 · lo stato del certificato lo dice il dominio, e la data esce con lui", () => {
  const server = leggi(SERVER);

  assert.ok(
    server.includes("getMedicalCertificateAvailability("),
    "«in scadenza» esiste nel dominio da prima: la famiglia non lo vedeva",
  );
  assert.ok(
    server.includes("getLatestMedicalCertificateExpiry(certificates)"),
    "la data e quella del certificato che governa, non del primo dell'elenco",
  );
  assert.ok(server.includes("expiryDate: scadenzaCertificato,"));

  const senza = senzaCommenti(server);
  assert.equal(
    senza.includes("const validCertificate"),
    false,
    "i due `find` scritti a mano erano la seconda implementazione della stessa domanda",
  );
});

test("W6-16/17/18 · la data si legge nei quattro stati, e c'e dove portare il nuovo", () => {
  const pagine = leggi(PAGINE);

  assert.ok(pagine.includes("Scaduto il "));
  assert.ok(pagine.includes("Scade il "));
  assert.ok(
    pagine.includes("Data di scadenza non disponibile"),
    "quando la data manca va detto, non taciuto",
  );
  assert.ok(
    pagine.includes("Aggiorna il certificato"),
    "sapere che scade fra dieci giorni e non avere dove portarlo e meta informazione",
  );

  const senza = senzaCommenti(pagine);
  assert.equal(
    senza.includes("data.health.certificates[0]?.expiry_date"),
    false,
    "era la data del certificato piu vecchio, accostata all'etichetta di quello valido",
  );
});

test("W6-18 · il tipo del documento arriva al server", () => {
  const contesto = leggi(CONTESTO);
  assert.ok(
    contesto.includes("documentType: input.documentType,"),
    "la rotta lo accetta da sempre, e nessun client glielo mandava: il certificato entrava come «altro»",
  );

  const pagine = leggi(PAGINE);
  assert.ok(pagine.includes("documentType:"));
});

/* ------------------------------------------------------ W6-19 · W6-21 */

test("W6-19 · le fatture hanno una schermata", () => {
  const pagine = leggi(PAGINE);
  assert.ok(pagine.includes("<CardTitle>Fatture</CardTitle>"));
  assert.ok(
    pagine.includes("/api/v1/documents/invoice/"),
    "il gate del legame su `invoice` esisteva gia: mancava la card",
  );
});

test("W6-21 · nessuna voce di menu promette una pagina che non esiste", () => {
  const menu = senzaCommenti(leggi("components/ui/mobile-header.tsx"));

  for (const rotta of [
    '"/parent-view/calendar"',
    '"/parent-view/messages"',
    '"/parent-view/documents"',
  ]) {
    assert.equal(
      menu.includes(rotta),
      false,
      `${rotta}: senza l'identificativo del figlio non e risolvibile, e «messages» non esiste affatto`,
    );
  }
});

/* ------------------------------------------------------------ W6-20 */

test("W6-20 · una notifica si puo chiudere", () => {
  assert.ok(
    existsSync(
      path.join(
        SRC,
        "app",
        "api",
        "parent-dashboard",
        "[athleteId]",
        "notifications",
        "route.ts",
      ),
    ),
    "senza una rotta la campanella resta accesa per sempre",
  );

  const rotta = leggi(
    "app/api/parent-dashboard/[athleteId]/notifications/route.ts",
  );
  assert.ok(
    rotta.includes("canParentAccessAthlete"),
    "il gate e il legame: un genitore non passa da canAccessClubResource",
  );
  assert.ok(
    rotta.includes("user_id: session.db.user_id"),
    "si segna letto solo cio che e indirizzato a chi chiede",
  );

  const famiglia = leggi("components/parent-dashboard/parent-family-pages.tsx");
  assert.ok(famiglia.includes("Segna tutte come lette"));
});
