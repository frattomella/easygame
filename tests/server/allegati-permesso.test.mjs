import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import {
  attachmentDenied,
  canAccessAttachmentOwner,
} from "../../src/lib/server/attachment-permissions.ts";
import { ATTACHMENT_OWNER_TYPES } from "../../src/lib/attachments.ts";

/**
 * **Un allegato eredita il permesso della cosa a cui e attaccato.**
 *
 * La rotta degli allegati sorvegliava due soli \`owner_type\` — gli annunci e i
 * tipi posseduti dal club — e per tutto il resto bastava appartenere al club.
 * Un audit indipendente lo ha eseguito con un account che nel club era
 * soltanto **genitore**:
 *
 *     GET    /api/v1/attachments        -> l'indice di ogni allegato del club
 *     GET    /api/v1/attachments/<id>   -> i byte di una carta d'identita
 *     DELETE /api/v1/attachments/<id>   -> distrutta
 *     PUT    /api/v1/attachments/<id>   -> i byte di un certificato medico,
 *                                          riscritti dal genitore
 *
 * La rotta **dedicata** — `GET /api/athletes/:id/documents` — lo rifiutava
 * gia. Il gemello generico consegnava gli stessi file alla stessa persona: la
 * correzione era stata messa su una porta e non sull'altra, che e la forma di
 * difetto che questa Wave ha incontrato piu volte.
 *
 * E le letture non lasciano traccia: l'audit registra creazione, modifica e
 * cancellazione, non la lettura. Chi scaricava i documenti d'identita di tutti
 * i tesserati non produceva **nessuna** riga.
 */

const RUOLI_BASSI = ["parent", "athlete", "trainer"];

test("un genitore non legge gli allegati di un atleta", () => {
  for (const tipo of ["athlete", "guardian", "member"]) {
    assert.equal(
      canAccessAttachmentOwner("parent", tipo, "read"),
      false,
      `«${tipo}» non si legge da genitore`,
    );
  }
});

test("ne li riscrive, ne li cancella", () => {
  for (const ruolo of RUOLI_BASSI) {
    for (const azione of ["update", "delete"]) {
      assert.equal(
        canAccessAttachmentOwner(ruolo, "athlete", azione),
        false,
        `${ruolo} non puo ${azione} il documento di un atleta`,
      );
    }
  }
});

test("un allenatore legge cio che il suo ruolo gia legge, e non il resto", () => {
  assert.equal(
    canAccessAttachmentOwner("trainer", "athlete", "read"),
    true,
    "gli atleti li vede: e il suo mestiere",
  );
  assert.equal(
    canAccessAttachmentOwner("trainer", "sport_work_person", "read"),
    false,
    "i contratti del lavoro sportivo no: sono il dato economico piu riservato del prodotto",
  );
});

test("chi tiene i conti li vede, ed e il caso legittimo", () => {
  for (const tipo of ["athlete", "guardian", "sport_work_person", "member"]) {
    assert.equal(
      canAccessAttachmentOwner("owner", tipo, "read"),
      true,
      `«${tipo}» lo vede chi amministra`,
    );
  }
});

/**
 * **Un tipo sconosciuto si chiude, non si apre.**
 *
 * Aggiungerne uno nuovo senza dichiararlo qui lo rende piu riservato, non piu
 * accessibile: e il verso giusto in cui sbagliare, e la ragione per cui questo
 * elenco non e una lista di eccezioni ma una mappa con un valore per difetto.
 */
test("un tipo che nessuno ha dichiarato lo governa chi amministra il club", () => {
  assert.equal(canAccessAttachmentOwner("parent", "cosa_nuova", "read"), false);
  assert.equal(canAccessAttachmentOwner("trainer", "cosa_nuova", "read"), false);
  assert.equal(canAccessAttachmentOwner("owner", "cosa_nuova", "read"), true);
});

test("il rifiuto nomina la cosa, non il file", () => {
  assert.match(
    String(attachmentDenied("athlete").message),
    /Accesso negato/,
    "e la stringa da cui il route handler ricava il 403",
  );
});

/**
 * ===========================================================================
 * Decima tornata
 * ===========================================================================
 */

/**
 * **Ogni tipo che esiste ha una riga, e la riga si vede.**
 *
 * Il difetto che chiude: la mappa elencava il doppio dei tipi reali — plurali
 * e nomi di cose che `owner_type` non e mai stato (`medical_certificate`,
 * `sponsor`, `invoice`) — e nel frattempo non nominava `other`, che invece
 * esiste ed e il valore **predefinito** del caricamento. Un elenco che parla
 * di porte inesistenti e tace su una che c'e non e una mappa dei permessi.
 *
 * Questo test lega la mappa alla sua fonte: aggiungere un `owner_type` senza
 * decidere chi lo vede fa fallire qui, invece di ricadere in silenzio sul
 * valore per difetto.
 */
test("ogni owner_type dichiarato ha una regola esplicita", () => {
  for (const tipo of ATTACHMENT_OWNER_TYPES) {
    // `club` e `announcement` hanno regole proprie e passano di la.
    if (tipo === "club" || tipo === "announcement") continue;
    assert.equal(
      canAccessAttachmentOwner("owner", tipo, "read"),
      true,
      `«${tipo}» deve essere leggibile da chi amministra`,
    );
    assert.equal(
      canAccessAttachmentOwner("parent", tipo, "read"),
      false,
      `«${tipo}» non deve essere leggibile da un genitore`,
    );
  }
});

/**
 * **Il lavoro sportivo e riservato anche quando ci si arriva da un allegato.**
 *
 * La segreteria riceve 403 da `/api/v1/sport-work/people`, ma la risorsa
 * `sport_work` non era dichiarata fra quelle riservate: gli stessi documenti —
 * documento d'identita, autocertificazione, **coordinate bancarie** — si
 * ottenevano da `/api/v1/attachments?owner_type=sport_work_person`, e si
 * potevano riscrivere e cancellare. La correzione era stata messa sulla
 * pagina e sulla rotta, non sulla matrice.
 */
test("segreteria e collaboratore non toccano gli allegati del lavoro sportivo", () => {
  for (const ruolo of ["staff", "collaborator"]) {
    for (const tipo of ["sport_work_person", "sport_work_relationship"]) {
      for (const azione of ["read", "create", "update", "delete"]) {
        assert.equal(
          canAccessAttachmentOwner(ruolo, tipo, azione),
          false,
          `${ruolo} non puo ${azione} «${tipo}»`,
        );
      }
    }
  }
});

/**
 * **E il caricamento e un'azione come le altre.**
 *
 * `POST /api/v1/attachments` era sorvegliato solo per `club` e `announcement`:
 * la correzione della nona tornata aveva coperto lettura, modifica e
 * cancellazione e si era fermata a tre verbi su quattro. Un genitore poteva
 * depositare un file nella cartella di un atleta di un'altra famiglia, e alla
 * segreteria compariva fra i documenti di quel ragazzo.
 */
test("chi non puo leggere un tipo non puo nemmeno caricarci dentro", () => {
  for (const ruolo of RUOLI_BASSI) {
    assert.equal(
      canAccessAttachmentOwner(ruolo, "athlete", "create") &&
        !canAccessAttachmentOwner(ruolo, "athlete", "read"),
      false,
      `${ruolo} non deve poter creare cio che non puo leggere`,
    );
  }
  assert.equal(
    canAccessAttachmentOwner("parent", "athlete", "create"),
    false,
    "un genitore non deposita documenti nella cartella di un atleta",
  );
});

/** `other` e il valore predefinito: e previsto, e lo governa chi amministra. */
test("«other» e una scelta dichiarata, non una ricaduta", () => {
  assert.equal(canAccessAttachmentOwner("owner", "other", "read"), true);
  assert.equal(canAccessAttachmentOwner("staff", "other", "read"), false);
  assert.equal(canAccessAttachmentOwner("trainer", "other", "read"), false);
});

/**
 * **Ogni verbo della rotta passa dalla guardia.**
 *
 * Test statico sul sorgente, nell'idioma di `tests/auth/api-authorization.test.mjs`:
 * il modulo dei permessi si puo esercitare a runtime, la rotta no (importa
 * Prisma a livello di modulo). Il difetto pero non era nella funzione — che
 * rispondeva gia correttamente a `create` — ma nel fatto che `POST` non la
 * **chiamava**. Un test sulla sola funzione non lo avrebbe mai visto, ed e
 * esattamente cosi che e sopravvissuto a una tornata.
 */
test("la rotta degli allegati chiama la guardia in tutti i suoi verbi", () => {
  const radice = path.resolve(import.meta.dirname, "..", "..");
  const rotte = [
    ["src/app/api/v1/attachments/route.ts", ["GET", "POST"]],
    ["src/app/api/v1/attachments/[id]/route.ts", ["GET", "PUT", "DELETE"]],
  ];

  for (const [relativo, verbi] of rotte) {
    const sorgente = fs.readFileSync(path.join(radice, relativo), "utf8");
    assert.match(
      sorgente,
      /canAccessAttachmentOwner/,
      `${relativo} deve importare la guardia`,
    );

    for (const verbo of verbi) {
      const inizio = sorgente.indexOf(`export async function ${verbo}(`);
      assert.notEqual(inizio, -1, `${relativo} deve esportare ${verbo}`);

      // Il corpo del verbo arriva fino al prossimo `export async function`.
      const successivo = sorgente.indexOf("export async function", inizio + 1);
      const corpo = sorgente.slice(
        inizio,
        successivo === -1 ? sorgente.length : successivo,
      );

      /*
        Due forme accettate: la chiamata diretta, oppure l'aiutante che la
        avvolge (`assertAttachmentPermission`), che e la forma della rotta del
        singolo allegato. Quello che non deve esistere e un verbo che non
        chiede niente a nessuno dei due — che era il caso di `POST`.
      */
      assert.match(
        corpo,
        /canAccessAttachmentOwner|assertAttachmentPermission/,
        `${verbo} di ${relativo} deve chiedere il permesso di cio a cui l'allegato appartiene`,
      );
    }
  }
});
