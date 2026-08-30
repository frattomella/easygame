import assert from "node:assert/strict";
import test from "node:test";

import {
  attachmentDenied,
  canAccessAttachmentOwner,
} from "../../src/lib/server/attachment-permissions.ts";

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
  for (const tipo of ["athlete", "medical_certificate", "guardian"]) {
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
        canAccessAttachmentOwner(ruolo, "medical_certificate", azione),
        false,
        `${ruolo} non puo ${azione} un certificato medico`,
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
  for (const tipo of ["athlete", "medical_certificate", "sport_work_person", "member"]) {
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
    String(attachmentDenied("medical_certificate").message),
    /Accesso negato/,
    "e la stringa da cui il route handler ricava il 403",
  );
});
