import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il libro soci a runtime (Wave 4, W4-F, §19).
 *
 * Sei cose vanno dimostrate, non affermate:
 *
 * 1. **la creazione del socio e del server, e transazionale.** Prima era una
 *    lettura, un append e una riscrittura dell'intera colonna `clubs.members`
 *    fatta dal browser: due segreterie nello stesso minuto, e la seconda
 *    scrittura cancellava la prima;
 * 2. **il registro e append-only**: nessun percorso modifica o cancella un
 *    evento;
 * 3. **un socio si ammette una volta sola**, e il servizio lo dice **prima**
 *    del vincolo del database, con una frase leggibile;
 * 4. **il numero di tessera si assegna e non si digita.** Prima era un campo
 *    di testo libero: due segreterie potevano scrivere lo stesso numero e
 *    nessuno se ne accorgeva;
 * 5. **l'isolamento multi-tenant.** Ogni operazione viene provata dal club
 *    sbagliato e deve fallire con «Accesso negato» — la stringa da cui il route
 *    handler ricava il 403 — senza mai restituire un dato;
 * 6. **i permessi**, per tutti e sette i ruoli canonici. Il libro soci e
 *    configurazione societaria in scrittura, perimetro gestionale in lettura.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const UTENTE_A = "11111111-0000-4000-8000-00000000000a";
const UTENTE_B = "22222222-0000-4000-8000-00000000000b";

const SOCIO_A = "cccccccc-0000-4000-8000-00000000000c";
const SOCIO_B = "dddddddd-0000-4000-8000-00000000000d";

const scopeA = (role = "owner") => ({
  userId: UTENTE_A,
  activeOrganizationId: CLUB_A,
  activeRole: role,
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = (role = "owner") => ({
  userId: UTENTE_B,
  activeOrganizationId: CLUB_B,
  activeRole: role,
  allowedOrganizationIds: [CLUB_B],
});

let members;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  members = await import("../../src/lib/server/members.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const socioInAnagrafica = (organizationId, id, cognome) => ({
  id: `riga-${id}`,
  organization_id: organizationId,
  resource_type: "members",
  name: `${cognome} Mario`,
  status: "active",
  created_at: new Date("2024-01-01T00:00:00.000Z"),
  updated_at: new Date("2024-01-01T00:00:00.000Z"),
  payload: {
    id,
    firstName: "Mario",
    lastName: cognome,
    name: `${cognome} Mario`,
    fullName: `${cognome} Mario`,
    type: "ordinario",
  },
});

const seed = () => ({
  club: [
    { id: CLUB_A, name: "ASD Alfa", members: [] },
    { id: CLUB_B, name: "ASD Beta", members: [] },
  ],
  clubResourceItem: [
    socioInAnagrafica(CLUB_A, SOCIO_A, "Rossi"),
    socioInAnagrafica(CLUB_B, SOCIO_B, "Bianchi"),
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const ammetti = (scope = scopeA(), memberId = SOCIO_A, extra = {}) =>
  members.recordMembershipEvent(scope, {
    memberId,
    eventType: "ADMISSION",
    effectiveDate: "2024-09-01",
    resolutionReference: "Delibera 12/2024",
    resolutionDate: "2024-08-28",
    ...extra,
  });

const dimetti = (scope = scopeA(), memberId = SOCIO_A, extra = {}) =>
  members.recordMembershipEvent(scope, {
    memberId,
    eventType: "RESIGNATION",
    effectiveDate: "2026-06-30",
    reason: "Trasferimento in altra citta",
    ...extra,
  });

/* ------------------------------------------------------- l'ammissione */

test("l'ammissione porta delibera e numero, e lo stato si deriva", async () => {
  const esito = await ammetti();

  assert.equal(esito.event.eventType, "ADMISSION");
  assert.equal(esito.event.resolutionReference, "Delibera 12/2024");
  assert.equal(esito.event.membershipNumber, "0001");
  assert.equal(esito.event.memberLabel, "Rossi Mario");
  assert.equal(esito.status.status, "ammesso");
  assert.equal(esito.status.isMember, true);

  // Il nome e **congelato** sull'evento: il libro deve poter dire chi e stato
  // ammesso anche se la scheda viene poi corretta.
  assert.equal(fake.rows("membershipEvent")[0].member_label, "Rossi Mario");
});

test("senza delibera l'ammissione non si registra, e senza motivo nemmeno la cessazione", async () => {
  await assert.rejects(
    () => ammetti(scopeA(), SOCIO_A, { resolutionReference: null }),
    /delibera/i,
  );

  await ammetti();

  await assert.rejects(
    () => dimetti(scopeA(), SOCIO_A, { reason: null }),
    /motivo/i,
  );

  assert.equal(fake.rows("membershipEvent").length, 1);
});

test("un socio che non e in anagrafica non entra nel libro", async () => {
  await assert.rejects(
    () => ammetti(scopeA(), "socio-che-non-esiste"),
    /non trovato/i,
  );
});

/* -------------------------------------------------------- append-only */

test("ammissione, dimissione, riammissione: tre righe, e nessuna viene toccata", async () => {
  await ammetti();
  await dimetti();
  const rientro = await members.recordMembershipEvent(scopeA(), {
    memberId: SOCIO_A,
    eventType: "REINSTATEMENT",
    effectiveDate: "2026-09-01",
    resolutionReference: "Delibera 3/2026",
  });

  assert.equal(fake.rows("membershipEvent").length, 3);
  assert.equal(
    fake.calls.some(
      (chiamata) =>
        chiamata.delegate === "membershipEvent" &&
        ["update", "updateMany", "delete", "deleteMany"].includes(
          chiamata.method,
        ),
    ),
    false,
    "un evento del libro soci non si modifica e non si cancella",
  );

  assert.equal(rientro.status.status, "riammesso");
  assert.equal(rientro.status.isMember, true);
  assert.equal(
    rientro.status.membershipNumber,
    "0001",
    "il numero resta quello dell'ammissione: una dimissione non lo cancella",
  );

  const storico = await members.listMembershipEvents(scopeA(), SOCIO_A);
  assert.deepEqual(
    storico.map((riga) => riga.eventType),
    ["REINSTATEMENT", "RESIGNATION", "ADMISSION"],
    "lo storico si legge dal piu recente",
  );
});

test("una seconda ammissione si rifiuta prima del database, con una frase leggibile", async () => {
  await ammetti();

  await assert.rejects(() => ammetti(), /gia socia/i);

  await dimetti();
  await assert.rejects(() => ammetti(), /riammissione/i);

  assert.equal(fake.rows("membershipEvent").length, 2);

  /*
    E l'indice unico parziale c'e davvero: se il servizio smettesse di
    controllare, sarebbe il database a rifiutare. Provato scrivendo la riga
    direttamente, cioe scavalcando il servizio.
  */
  await assert.rejects(
    () =>
      fake.client.membershipEvent.create({
        data: {
          organization_id: CLUB_A,
          member_id: SOCIO_A,
          member_label: "Rossi Mario",
          event_type: "ADMISSION",
          effective_date: new Date("2027-01-01"),
        },
      }),
    (error) => error.code === "P2002",
  );
});

/* ------------------------------------------------------------ il numero */

test("il numero e progressivo per club, e il client non puo proporlo", async () => {
  await assert.rejects(
    () => ammetti(scopeA(), SOCIO_A, { membershipNumber: "0042" }),
    /non si digita/i,
  );

  const primo = await ammetti();
  assert.equal(primo.event.membershipNumber, "0001");

  const nuovo = await members.admitNewMember(scopeA(), {
    member: { firstName: "Anna", lastName: "Verdi", membershipNumber: "0042" },
    effectiveDate: "2026-01-10",
    resolutionReference: "Delibera 1/2026",
  });

  assert.equal(
    nuovo.event.membershipNumber,
    "0002",
    "il numero lo assegna la sequenza, non il campo mandato dal client",
  );
  assert.equal(nuovo.member.membershipNumber, undefined);

  // La sequenza e per club: l'altro club riparte da uno.
  const altrove = await members.recordMembershipEvent(scopeB(), {
    memberId: SOCIO_B,
    eventType: "ADMISSION",
    effectiveDate: "2026-02-01",
    resolutionReference: "Delibera 1/2026",
  });
  assert.equal(altrove.event.membershipNumber, "0001");

  // E non e una numerazione per esercizio: l'anno della sequenza e zero.
  const sequenze = fake.rows("documentNumberSequence");
  assert.equal(sequenze.every((riga) => riga.year === 0), true);
  assert.equal(sequenze.every((riga) => riga.kind === "member"), true);
});

/* -------------------------------------------- la creazione del socio */

test("creare un socio scrive anagrafica ed evento insieme, dal server", async () => {
  const esito = await members.admitNewMember(scopeA(), {
    member: {
      id: "id-scelto-dal-client",
      firstName: "Anna",
      lastName: "Verdi",
      email: "anna@example.com",
      type: "sostenitore",
    },
    effectiveDate: "2026-01-10",
    resolutionReference: "Delibera 1/2026",
  });

  assert.notEqual(
    esito.member.id,
    "id-scelto-dal-client",
    "l'identita della riga la decide il server",
  );
  assert.equal(esito.member.fullName, "Anna Verdi");
  assert.equal(esito.member.status, "active");
  assert.equal(esito.member.membershipDate, "2026-01-10");
  assert.equal(esito.status.status, "ammesso");

  // La colonna JSON e la tabella delle risorse restano allineate, e la
  // scrittura non ha riscritto l'anagrafica intera: la riga nuova e una sola.
  const righe = fake
    .rows("clubResourceItem")
    .filter((riga) => riga.organization_id === CLUB_A);
  assert.equal(righe.length, 2, "il socio che c'era gia non e stato riscritto");

  const club = fake.rows("club").find((riga) => riga.id === CLUB_A);
  assert.equal(club.members.length, 2);
  assert.ok(club.members.some((socio) => socio.fullName === "Anna Verdi"));
  assert.ok(
    club.members.some((socio) => socio.id === SOCIO_A),
    "il socio gia presente non e sparito: e il difetto che questa lane chiude",
  );

  assert.equal(
    fake.calls.some(
      (chiamata) =>
        chiamata.delegate === "clubResourceItem" &&
        chiamata.method === "deleteMany",
    ),
    false,
    "aggiungere un socio non cancella e riscrive la collezione",
  );
});

test("nome e cognome sono obbligatori, e l'anagrafica non riceve chiavi riservate", async () => {
  await assert.rejects(
    () =>
      members.admitNewMember(scopeA(), {
        member: { firstName: "Anna" },
        effectiveDate: "2026-01-10",
        resolutionReference: "Delibera 1/2026",
      }),
    /Nome e cognome/i,
  );

  const esito = await members.admitNewMember(scopeA(), {
    member: {
      firstName: "Anna",
      lastName: "Verdi",
      user_id: UTENTE_B,
      createdAt: "1999-01-01T00:00:00.000Z",
    },
    effectiveDate: "2026-01-10",
    resolutionReference: "Delibera 1/2026",
  });

  assert.equal(esito.member.user_id, undefined);
  assert.notEqual(esito.member.createdAt, "1999-01-01T00:00:00.000Z");
});

/* ------------------------------------------------- lo stato a una data */

test("«chi era socio il 12 marzo 2026»: il libro risponde a una data", async () => {
  await ammetti();
  await dimetti();

  const durante = await members.getMembershipRecord(scopeA(), SOCIO_A, {
    atDate: "2026-03-12",
  });
  assert.equal(durante.status.isMember, true);
  assert.equal(durante.status.status, "ammesso");
  assert.equal(
    durante.events.length,
    2,
    "lo storico resta intero: cambia la derivazione, non il registro",
  );

  const oggi = await members.getMembershipRecord(scopeA(), SOCIO_A);
  assert.equal(oggi.status.status, "dimesso");

  assert.equal(await members.wasMemberOn(scopeA(), SOCIO_A, "2026-03-12"), true);
  assert.equal(await members.wasMemberOn(scopeA(), SOCIO_A, "2024-01-01"), false);
});

test("il libro completo mostra anche chi in anagrafica non ha nessun evento", async () => {
  const nuovo = await members.admitNewMember(scopeA(), {
    member: { firstName: "Anna", lastName: "Verdi" },
    effectiveDate: "2026-01-10",
    resolutionReference: "Delibera 1/2026",
  });

  const libro = await members.listMembershipRegister(scopeA());
  assert.equal(libro.length, 2);

  const senzaEventi = libro.find((riga) => riga.memberId === SOCIO_A);
  assert.equal(senzaEventi.status.status, "mai_ammesso");
  assert.equal(senzaEventi.eventCount, 0);

  const ammessa = libro.find((riga) => riga.memberId === nuovo.member.id);
  assert.equal(ammessa.status.isMember, true);
  assert.equal(ammessa.status.membershipNumber, "0001");

  // A una data precedente all'ammissione, nessuno risulta socio.
  const prima = await members.listMembershipRegister(scopeA(), {
    atDate: "2020-01-01",
  });
  assert.equal(prima.every((riga) => riga.status.isMember === false), true);
});

/* ------------------------------------------------------- multi-tenant */

test("il socio di un altro club: «Accesso negato», e nessun dato", async () => {
  await ammetti();

  await assert.rejects(
    () =>
      members.recordMembershipEvent(scopeB(), {
        organizationId: CLUB_A,
        memberId: SOCIO_A,
        eventType: "RESIGNATION",
        effectiveDate: "2026-06-30",
        reason: "Tentativo da un altro club",
      }),
    /Accesso negato/,
  );

  await assert.rejects(
    () =>
      members.getMembershipRecord(scopeB(), SOCIO_A, { organizationId: CLUB_A }),
    /Accesso negato/,
  );

  await assert.rejects(
    () => members.listMembershipEvents(scopeB(), SOCIO_A, { organizationId: CLUB_A }),
    /Accesso negato/,
  );

  // Senza dichiarare il club si opera sul proprio: li quel socio non esiste, e
  // nessuna riga dell'altro club viene restituita.
  await assert.rejects(
    () => members.getMembershipRecord(scopeB(), SOCIO_A),
    /non trovato/i,
  );

  const libroB = await members.listMembershipRegister(scopeB());
  assert.deepEqual(
    libroB.map((riga) => riga.memberId),
    [SOCIO_B],
  );

  assert.equal(fake.rows("membershipEvent").length, 1);
});

/* ------------------------------------------------------------ permessi */

test("i sette ruoli canonici: il libro lo tiene la direzione, lo legge la gestione", async () => {
  const possonoScrivere = ["owner", "club_manager"];
  const nonPossonoScrivere = [
    "collaborator",
    "staff",
    "trainer",
    "parent",
    "athlete",
  ];

  for (const ruolo of nonPossonoScrivere) {
    await assert.rejects(
      () => ammetti(scopeA(ruolo)),
      /Accesso negato/,
      `${ruolo} non deve poter ammettere un socio`,
    );
    await assert.rejects(
      () =>
        members.admitNewMember(scopeA(ruolo), {
          member: { firstName: "Anna", lastName: "Verdi" },
          effectiveDate: "2026-01-10",
          resolutionReference: "Delibera 1/2026",
        }),
      /Accesso negato/,
      `${ruolo} non deve poter creare un socio`,
    );
  }

  assert.equal(fake.rows("membershipEvent").length, 0);

  for (const ruolo of possonoScrivere) {
    const esito = await members.admitNewMember(scopeA(ruolo), {
      member: { firstName: "Anna", lastName: `Verdi ${ruolo}` },
      effectiveDate: "2026-01-10",
      resolutionReference: "Delibera 1/2026",
    });
    assert.equal(esito.status.isMember, true, `${ruolo} deve poter ammettere`);
  }

  for (const ruolo of ["owner", "club_manager", "collaborator", "staff"]) {
    const libro = await members.listMembershipRegister(scopeA(ruolo));
    assert.ok(libro.length > 0, `${ruolo} deve poter leggere il libro`);
  }

  for (const ruolo of ["trainer", "parent", "athlete"]) {
    await assert.rejects(
      () => members.listMembershipRegister(scopeA(ruolo)),
      /Accesso negato/,
      `${ruolo} non deve poter leggere il libro soci`,
    );
    await assert.rejects(
      () => members.getMembershipRecord(scopeA(ruolo), SOCIO_A),
      /Accesso negato/,
    );
  }
});

/* --------------------------------------------------------------- audit */

test("ammissione e cessazione lasciano una traccia, e la cessazione ha la sua", async () => {
  await ammetti();
  await dimetti();

  const azioni = fake.rows("auditLog").map((riga) => riga.action);
  assert.ok(azioni.includes("member.admitted"));
  assert.ok(
    azioni.includes("member.ceased"),
    "la cessazione e la riga che si va a cercare: non si confonde con le altre",
  );

  const cessazione = fake
    .rows("auditLog")
    .find((riga) => riga.action === "member.ceased");
  assert.equal(cessazione.organization_id, CLUB_A);
  assert.equal(cessazione.metadata.evento, "RESIGNATION");
  assert.equal(cessazione.metadata.socio, SOCIO_A);
});

/* ================== la scheda del socio, una alla volta === */

/*
  **Il difetto che una sonda di concorrenza ha misurato.**

  Correggere o cancellare un socio era una lettura, una modifica di un elemento
  dell'array e una riscrittura dell'**intera** colonna `clubs.members`, fatta
  dal browser. Lanciata insieme a un'ammissione, quella riscrittura ha prodotto
  lo stato che nessuna schermata puo spiegare: **un socio presente nel libro e
  assente dall'anagrafica**, perche la copia partita dal browser non lo
  conteneva ancora.

  Il libro soci esiste per essere dimostrabile. Un registro che cita una persona
  che l'anagrafica non conosce piu non dimostra piu niente.
*/

test("la correzione tocca un socio solo e conserva cio che non nomina", async () => {
  fake.rows("clubResourceItem").push(socioInAnagrafica(CLUB_A, "socio-2", "Verdi"));

  const aggiornato = await members.updateMemberProfile(scopeA(), SOCIO_A, {
    firstName: "Mario",
    lastName: "Rossi",
    email: "mario.rossi@example.it",
  });

  assert.equal(aggiornato.email, "mario.rossi@example.it");
  assert.equal(aggiornato.type, "ordinario", "i campi non nominati restano");

  const righe = fake
    .rows("clubResourceItem")
    .filter((r) => r.resource_type === "members" && r.organization_id === CLUB_A);
  assert.equal(righe.length, 2, "nessuna riga cancellata e ricreata");
  assert.equal(
    righe.find((r) => r.payload.id === "socio-2").payload.lastName,
    "Verdi",
    "l'altro socio non e stato toccato",
  );
});

test("il numero di tessera non si corregge da qui", async () => {
  await members.recordMembershipEvent(scopeA(), {
    memberId: SOCIO_A,
    eventType: "ADMISSION",
    effectiveDate: "2024-09-01",
    resolutionReference: "Delibera 12/2024",
  });

  const aggiornato = await members.updateMemberProfile(scopeA(), SOCIO_A, {
    email: "x@y.it",
    membershipNumber: "9999",
  });

  assert.equal(
    aggiornato.membershipNumber,
    undefined,
    "il numero lo assegna il libro, e non si digita",
  );
});

test("la scheda di un socio di un altro club non si corregge", async () => {
  await assert.rejects(
    () => members.updateMemberProfile(scopeA(), SOCIO_B, { email: "x@y.it" }),
    /non trovato/i,
  );

  const altrui = fake.rows("clubResourceItem").find((r) => r.payload.id === SOCIO_B);
  assert.equal(altrui.payload.email, undefined);
});

test("un socio senza storia si cancella", async () => {
  const esito = await members.removeMemberProfile(scopeA(), SOCIO_A);

  assert.equal(esito.removed.id, SOCIO_A);
  assert.equal(
    fake
      .rows("clubResourceItem")
      .filter((r) => r.resource_type === "members" && r.organization_id === CLUB_A)
      .length,
    0,
  );
});

test("un socio nominato dal libro non si cancella: si dimette", async () => {
  /*
    Stessa regola del difetto D-1, applicata alle persone invece che al denaro:
    cio che ha una storia non si cancella. Chi non e piu socio si dimette o si
    esclude — e un evento, con una data e una delibera — e non e la stessa cosa
    che non essere mai esistito.
  */
  await ammetti();

  await assert.rejects(
    () => members.removeMemberProfile(scopeA(), SOCIO_A),
    /non si cancella/,
  );

  assert.equal(
    fake
      .rows("clubResourceItem")
      .filter((r) => r.resource_type === "members" && r.organization_id === CLUB_A)
      .length,
    1,
    "il socio deve essere ancora li",
  );
  assert.equal(fake.rows("membershipEvent").length, 1, "e il libro pure");
});

test("chi non tiene il libro non corregge e non cancella una scheda", async () => {
  for (const ruolo of ["trainer", "parent", "athlete", "staff"]) {
    await assert.rejects(
      () => members.updateMemberProfile(scopeA(ruolo), SOCIO_A, { email: "x@y.it" }),
      /Accesso negato/,
    );
    await assert.rejects(
      () => members.removeMemberProfile(scopeA(ruolo), SOCIO_A),
      /Accesso negato/,
    );
  }
});
