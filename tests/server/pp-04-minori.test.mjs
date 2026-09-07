import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **L'atleta minorenne e il suo accesso EasyGame** (PP-04, ADR-0116).
 *
 * ---
 *
 * ## La decisione che il repository non puo prendere
 *
 * «Un minore di N anni puo avere un account proprio?», «chi lo autorizza?»,
 * «come si prova che l'ha autorizzato?» sono domande legali. EasyGame non ha
 * una risposta scritta da nessuna parte — non c'e una definizione di consenso
 * per l'accesso digitale in `src/lib/consents/catalog.ts`, e non c'era nessun
 * controllo sull'eta nel dominio degli account atleta.
 *
 * Fino a PP-04 il codice ne dava **una implicita, la piu permissiva**: la
 * segreteria scriveva un indirizzo e un dodicenne aveva un accesso a suo nome,
 * senza che nulla registrasse che qualcuno lo avesse autorizzato. Un'assenza di
 * controllo non e un'assenza di policy: e la policy «si puo sempre», presa da
 * nessuno.
 *
 * ## Cosa fa questa lane, e cosa non fa
 *
 * **Non decide.** Non vieta — vietare deciderebbe quanto permettere — e non
 * inventa una soglia diversa da quella che il prodotto usa gia altrove.
 * Pretende che la decisione sia **presa da una persona e registrata**: la
 * stessa forma della cancellazione di un minore (ADR-0105), che vive due
 * pannelli piu sotto sulla stessa scheda.
 *
 * ## Le proprieta presidiate qui
 *
 * 1. il minore senza conferma **non riceve** l'invito, e non resta niente in
 *    archivio: nessuna utenza, nessuna riga di invito;
 * 2. il maggiorenne non deve confermare niente — la guardia non fa troppo;
 * 3. **la data mancante conta come minore**, ed e il caso piu frequente;
 * 4. la conferma **non e un truthy**: `"true"`, `1`, `"si"` non passano;
 * 5. la conferma finisce **nell'audit**, che e l'unico posto in cui la
 *    decisione sopravvive a chi l'ha presa;
 * 6. il reinvio allo **stesso** indirizzo non richiede una seconda conferma; il
 *    cambio di indirizzo si;
 * 7. la revoca del tutore non tocca l'accesso dell'atleta, e viceversa — il
 *    comportamento conservativo dichiarato, in attesa della policy vera.
 */

const CLUB = "aaaaaaaa-6c00-4000-8000-00000000000a";
const SEGRETERIA = "11111111-6c00-4000-8000-000000000aaa";
const GENITORE = "33333333-6c00-4000-8000-000000000ccc";

const MINORE = "aaaa1111-6c00-4000-8000-0000000ma1a";
const SENZA_DATA = "aaaa2222-6c00-4000-8000-0000000ma2a";
const MAGGIORENNE = "aaaa3333-6c00-4000-8000-0000000ma3a";

let dominio;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  dominio = await import("../../src/lib/server/athlete-accounts.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const scope = () => ({
  userId: SEGRETERIA,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
  actorEmail: "segreteria@club.it",
});

/*
  Le date sono **relative a oggi** e non fisse: una fixture con «2012» diventa
  maggiorenne da sola nel 2030, e il test comincerebbe a misurare l'altro ramo
  senza che nessuno se ne accorga.
*/
const anniFa = (anni) => {
  const data = new Date();
  data.setFullYear(data.getFullYear() - anni);
  return data;
};

const seed = () => ({
  user: [
    {
      id: SEGRETERIA,
      email: "segreteria@club.it",
      email_verified_at: new Date(),
    },
    {
      id: GENITORE,
      email: "genitore@famiglia.it",
      email_verified_at: new Date(),
    },
  ],
  club: [{ id: CLUB, slug: "club", name: "Polisportiva Test" }],
  organizationUser: [
    {
      id: "m1",
      organization_id: CLUB,
      user_id: SEGRETERIA,
      role: "owner",
      is_primary: true,
    },
    { id: "m2", organization_id: CLUB, user_id: GENITORE, role: "parent" },
  ],
  athlete: [
    {
      id: MINORE,
      organization_id: CLUB,
      user_id: null,
      first_name: "Nina",
      last_name: "Piccoli",
      birth_date: anniFa(12),
      status: "active",
      created_at: new Date("2026-01-01T00:00:00.000Z"),
      data: {},
    },
    {
      id: SENZA_DATA,
      organization_id: CLUB,
      user_id: null,
      first_name: "Ignoto",
      last_name: "Senzadata",
      birth_date: null,
      status: "active",
      created_at: new Date("2026-01-02T00:00:00.000Z"),
      data: {},
    },
    {
      id: MAGGIORENNE,
      organization_id: CLUB,
      user_id: null,
      first_name: "Adulto",
      last_name: "Grandi",
      birth_date: anniFa(25),
      status: "active",
      created_at: new Date("2026-01-03T00:00:00.000Z"),
      data: {},
    },
  ],
  athleteAccountInvite: [],
  auditLog: [],
  authVerificationChallenge: [],
  session: [],
  emailProviderConfig: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const invitiDi = (athleteId) =>
  fake.rows("athleteAccountInvite").filter((r) => r.athlete_id === athleteId);

/* ==================================================================== *
 *  1. La domanda pura
 * ==================================================================== */

test("`athleteIsMinor`: la soglia e diciotto anni, e la data mancante conta come minore", () => {
  const oggi = new Date("2026-09-04T12:00:00.000Z");

  assert.equal(dominio.athleteIsMinor(null, oggi), true, "nessuna data");
  assert.equal(dominio.athleteIsMinor("", oggi), true, "stringa vuota");
  assert.equal(
    dominio.athleteIsMinor("non-una-data", oggi),
    true,
    "data illeggibile",
  );

  assert.equal(dominio.athleteIsMinor("2014-01-01", oggi), true);
  assert.equal(dominio.athleteIsMinor("2000-01-01", oggi), false);

  /*
    **Il giorno del diciottesimo compleanno si e maggiorenni**, e il giorno
    prima no: e il confine, ed e il posto in cui un `>=` scambiato per un `>`
    non si vede da nessun'altra parte.
  */
  assert.equal(
    dominio.athleteIsMinor("2008-09-04", new Date("2026-09-04T00:00:00.000Z")),
    false,
    "il giorno dei diciotto anni",
  );
  assert.equal(
    dominio.athleteIsMinor("2008-09-05", new Date("2026-09-04T00:00:00.000Z")),
    true,
    "il giorno prima",
  );
});

/* ==================================================================== *
 *  2. L'invito
 * ==================================================================== */

test("un minore senza la conferma non riceve nessun invito, e non resta niente in archivio", async () => {
  const utenzePrima = fake.rows("user").length;

  await assert.rejects(
    () =>
      dominio.sendAthleteAccountInvite(scope(), {
        athleteId: MINORE,
        email: "nina@famiglia.it",
      }),
    /minorenne/i,
  );

  assert.equal(invitiDi(MINORE).length, 0, "nessun invito creato");
  /*
    **E nessuna utenza.** Il rifiuto sta prima di `risolviUtenza`: se stesse
    dopo, in archivio resterebbe un'utenza senza credenziali nata da un gesto
    che il dominio ha rifiutato — e sarebbe l'utenza di un minore.
  */
  assert.equal(
    fake.rows("user").length,
    utenzePrima,
    "nessuna utenza creata dal gesto rifiutato",
  );
});

test("lo stesso minore, con la conferma, l'invito lo riceve", async () => {
  const esito = await dominio.sendAthleteAccountInvite(scope(), {
    athleteId: MINORE,
    email: "nina@famiglia.it",
    acknowledgeMinor: true,
  });

  assert.equal(esito.email, "nina@famiglia.it");
  assert.equal(invitiDi(MINORE).length, 1);
});

test("un'anagrafica senza data di nascita si tratta come minore", async () => {
  await assert.rejects(
    () =>
      dominio.sendAthleteAccountInvite(scope(), {
        athleteId: SENZA_DATA,
        email: "ignoto@famiglia.it",
      }),
    /minorenne|data di nascita/i,
  );

  assert.equal(invitiDi(SENZA_DATA).length, 0);
});

test("il maggiorenne non deve confermare niente: la guardia non fa troppo", async () => {
  const esito = await dominio.sendAthleteAccountInvite(scope(), {
    athleteId: MAGGIORENNE,
    email: "adulto@posta.it",
  });

  assert.equal(esito.email, "adulto@posta.it");
  assert.equal(invitiDi(MAGGIORENNE).length, 1);
});

test("la conferma non e un truthy: solo `true` passa", async () => {
  for (const finta of ["true", "si", 1, {}, [], "on"]) {
    await assert.rejects(
      () =>
        dominio.sendAthleteAccountInvite(scope(), {
          athleteId: MINORE,
          email: "nina@famiglia.it",
          acknowledgeMinor: finta,
        }),
      /minorenne|data di nascita/i,
      `${JSON.stringify(finta)} non e una dichiarazione`,
    );
  }

  assert.equal(invitiDi(MINORE).length, 0);
});

/* ==================================================================== *
 *  3. La traccia
 * ==================================================================== */

test("la dichiarazione finisce nell'audit, accanto a chi l'ha fatta", async () => {
  await dominio.sendAthleteAccountInvite(scope(), {
    athleteId: MINORE,
    email: "nina@famiglia.it",
    acknowledgeMinor: true,
  });

  const riga = fake
    .rows("auditLog")
    .find((r) => String(r.action || "").includes("invite"));

  assert.ok(riga, "l'invito lascia una riga di audit");
  assert.equal(riga.metadata.minor, true);
  assert.equal(riga.metadata.guardian_acknowledged, true);
  assert.equal(riga.actor_user_id, SEGRETERIA);

  /*
    Sul maggiorenne la riga dice `minor: false` e **non** dichiara una
    responsabilita genitoriale che nessuno ha assunto: `null` e diverso da
    `false`, e chi legge il registro fra un anno deve poter distinguere «non
    era un minore» da «era un minore e nessuno ha confermato», che non puo
    esistere.
  */
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);

  await dominio.sendAthleteAccountInvite(scope(), {
    athleteId: MAGGIORENNE,
    email: "adulto@posta.it",
  });

  const rigaAdulto = fake
    .rows("auditLog")
    .find((r) => String(r.action || "").includes("invite"));

  assert.equal(rigaAdulto.metadata.minor, false);
  assert.equal(rigaAdulto.metadata.guardian_acknowledged, null);
});

/* ==================================================================== *
 *  4. Reinvio e cambio di indirizzo
 * ==================================================================== */

test("il reinvio allo stesso indirizzo non richiede una seconda conferma", async () => {
  await dominio.sendAthleteAccountInvite(scope(), {
    athleteId: MINORE,
    email: "nina@famiglia.it",
    acknowledgeMinor: true,
  });

  /*
    La decisione e gia stata presa e registrata, e il link va alla **stessa**
    casella. Chiederla di nuovo trasformerebbe una dichiarazione in una casella
    da spuntare a ogni clic, che e il modo in cui una dichiarazione smette di
    significare qualcosa.
  */
  const esito = await dominio.resendAthleteAccountInvite(scope(), {
    athleteId: MINORE,
  });

  assert.equal(esito.email, "nina@famiglia.it");
  assert.equal(
    invitiDi(MINORE).filter((r) => r.status === "sent").length,
    1,
    "un solo invito vivo",
  );
});

test("il cambio di indirizzo la richiede: il link va a una casella diversa", async () => {
  await dominio.sendAthleteAccountInvite(scope(), {
    athleteId: MINORE,
    email: "nina@famiglia.it",
    acknowledgeMinor: true,
  });

  await assert.rejects(
    () =>
      dominio.changeAthleteAccountEmail(scope(), {
        athleteId: MINORE,
        email: "altra-casella@qualsiasi.it",
      }),
    /minorenne|data di nascita/i,
  );

  assert.equal(
    invitiDi(MINORE).some((r) => r.email === "altra-casella@qualsiasi.it"),
    false,
    "nessun invito e partito verso il nuovo indirizzo",
  );

  const esito = await dominio.changeAthleteAccountEmail(scope(), {
    athleteId: MINORE,
    email: "altra-casella@qualsiasi.it",
    acknowledgeMinor: true,
  });
  assert.equal(esito.email, "altra-casella@qualsiasi.it");
});

/* ==================================================================== *
 *  5. Lo stato che la scheda legge
 * ==================================================================== */

test("lo stato porta `isMinor`, e non porta la data di nascita", async () => {
  const stato = await dominio.readAthleteAccountState(scope(), MINORE);
  assert.equal(stato.isMinor, true);

  const adulto = await dominio.readAthleteAccountState(scope(), MAGGIORENNE);
  assert.equal(adulto.isMinor, false);

  const senzaData = await dominio.readAthleteAccountState(scope(), SENZA_DATA);
  assert.equal(senzaData.isMinor, true);

  /*
    La domanda e «serve la conferma?», e la risposta e un booleano: la data di
    nascita non ha ragione di uscire da questo pannello, che parla di accessi.
  */
  for (const proibito of ["birthDate", "birth_date", "dataNascita"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(stato, proibito),
      false,
      `${proibito} non appartiene allo stato dell'accesso`,
    );
  }
});

/* ==================================================================== *
 *  6. Il pannello: la casella c'e, e il pulsante la aspetta
 * ==================================================================== */

test("il pannello chiede la conferma invece di far rispondere 400 al server", () => {
  const sorgente = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "components",
      "athletes",
      "profile",
      "athlete-account-section.tsx",
    ),
    "utf8",
  );

  /* La casella esiste, ed e legata a `isMinor`. */
  assert.ok(sorgente.includes("stato.isMinor"));
  assert.ok(sorgente.includes("responsabilita genitoriale"));

  /* La dichiarazione viaggia con la richiesta, in entrambi i gesti. */
  const invii = sorgente.match(/acknowledgeMinor: tutoreAutorizza/g) || [];
  assert.equal(
    invii.length,
    2,
    "l'invito e il cambio di indirizzo la mandano entrambi",
  );

  /*
    E il pulsante resta spento finche non c'e: non e il presidio — il presidio
    e il dominio — ma un pulsante acceso che risponde 400 e il difetto che
    questa Wave ha trovato dieci volte.
  */
  const spenti = sorgente.match(/mancaLaConferma/g) || [];
  assert.ok(
    spenti.length >= 3,
    "la derivazione e i due pulsanti che la guardano",
  );

  /*
    **La casella riparte da spenta dopo ogni gesto riuscito.** Una casella che
    restasse spuntata fra un atleta e l'altro sarebbe una dichiarazione che
    nessuno ha piu fatto.
  */
  assert.ok(sorgente.includes("setTutoreAutorizza(false)"));
});

/* ==================================================================== *
 *  7. Tutore e atleta: due accessi, due revoche
 * ==================================================================== */

test("revocare l'accesso dell'atleta non tocca la tessera del tutore", async () => {
  /*
    **Il comportamento conservativo dichiarato** (ADR-0116). «La revoca del
    tutore revoca anche l'atleta?» e l'altra domanda che nessuna policy scritta
    risponde. Finche non c'e, i due accessi restano indipendenti — che e lo
    stato di fatto del dominio e la scelta che **non distrugge** un accesso che
    nessuno ha chiesto di togliere: un accesso tolto per sbaglio si rimette con
    un invito, un accesso lasciato per sbaglio si toglie con un clic, ma i due
    errori non costano uguale a chi li subisce.

    Se la policy vera dira il contrario, il posto in cui scriverla e
    `revokeClubAccess`, e questo test e la riga che verra cambiata di proposito
    invece che per caso.
  */
  await dominio.sendAthleteAccountInvite(scope(), {
    athleteId: MINORE,
    email: "nina@famiglia.it",
    acknowledgeMinor: true,
  });

  const invito = invitiDi(MINORE)[0];
  fake.rows("athlete").find((r) => r.id === MINORE).user_id = invito.user_id;
  fake.rows("athleteAccountInvite")[0].status = "accepted";
  fake.rows("athleteAccountInvite")[0].accepted_at = new Date();
  fake.rows("organizationUser").push({
    id: "m-atleta",
    organization_id: CLUB,
    user_id: invito.user_id,
    role: "athlete",
  });

  await dominio.revokeAthleteAccess(scope(), { athleteId: MINORE });

  const tessereTutore = fake
    .rows("organizationUser")
    .filter((r) => r.user_id === GENITORE);

  assert.equal(
    tessereTutore.length,
    1,
    "la tessera del tutore sopravvive alla revoca dell'atleta",
  );
  assert.equal(tessereTutore[0].role, "parent");
});
