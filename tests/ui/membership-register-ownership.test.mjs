import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Chi ha il diritto di scrivere un socio, e chi di dargli un numero.
 *
 * Questo test non guarda un comportamento: guarda che non **ricompaia** cio
 * che la Wave 4 ha appena tolto di mezzo (§19).
 *
 * - la creazione di un socio era una lettura di `clubs.members`, un append e
 *   una riscrittura dell'intera colonna **fatta dal browser**: due segreterie
 *   nello stesso minuto, e la seconda scrittura cancellava la prima. Nessun
 *   errore, nessuna traccia, un socio che sparisce;
 * - il numero di tessera era un campo di testo digitato a mano, e due
 *   segreterie potevano scrivere lo stesso;
 * - il registro e append-only, e la sola difesa che regge nel tempo e che nel
 *   servizio **non esista** una scrittura che aggiorna o cancella un evento.
 */

const read = (relative) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const SOCI_PAGES = [
  "src/app/soci/page.tsx",
  "src/app/soci/new/page.tsx",
  "src/app/soci/[id]/page.tsx",
  "src/app/soci/[id]/membership-register-panel.tsx",
];

test("la creazione di un socio non riscrive piu la colonna dal browser", () => {
  const source = read("src/app/soci/new/page.tsx");

  assert.equal(
    /\.update\(\s*\{\s*members/.test(source),
    false,
    "l'anagrafica dei soci non si riscrive dal browser: la scrive il server, sotto un lock",
  );
  assert.match(
    source,
    /admitNewMember/,
    "la creazione passa da POST /api/v1/membership/admissions",
  );
});

test("nessuna schermata dei soci digita un numero di tessera", () => {
  for (const page of SOCI_PAGES) {
    const source = read(page);

    assert.equal(
      /name="membershipNumber"|membershipNumber:\s*(formData|form)\./.test(source),
      false,
      `${page}: il numero di tessera lo assegna il libro, non un campo di testo`,
    );
  }
});

test("le schermate non importano il servizio del libro soci", () => {
  for (const page of SOCI_PAGES) {
    assert.equal(
      /@\/lib\/server\/members/.test(read(page)),
      false,
      `${page}: un componente client non importa src/lib/server/**`,
    );
  }
});

test("il servizio del libro soci non aggiorna e non cancella un evento", () => {
  const service = read("src/lib/server/members.ts");

  for (const scrittura of ["update", "updateMany", "delete", "deleteMany"]) {
    assert.equal(
      new RegExp(`eventClient\\([^)]*\\)\\.${scrittura}\\b`).test(service),
      false,
      `il registro e append-only: nessun \`${scrittura}\` su membership_events`,
    );
  }

  assert.match(
    service,
    /allocateSequenceNumber/,
    "il numero arriva dal proprietario della numerazione, non da un conteggio",
  );
});

test("la classificazione del prodotto arriva dal dominio, non da una frase in pagina", () => {
  for (const page of SOCI_PAGES) {
    const source = read(page);
    if (!/MEMBERSHIP_REGISTER_DISCLAIMER/.test(source)) continue;

    assert.equal(
      /libro soci (ufficiale|conforme|a norma)/i.test(source),
      false,
      `${page}: nessuna etichetta promette una conformita che nessuna norma definisce`,
    );
  }
});
