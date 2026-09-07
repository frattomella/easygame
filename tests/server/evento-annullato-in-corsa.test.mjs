import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Un evento annullato non riceve piu atti — nemmeno se lo diventa mentre
 * l'atto e in volo** (`D-INT-13b`).
 *
 * `assertEventoAperto` esisteva e veniva chiamata. Ma la riga su cui decideva
 * veniva letta **prima** e **fuori** dalla transazione che scrive: fra quella
 * lettura e l'`upsert` passano un permesso, due perimetri e due letture di
 * atleti. In quella finestra un `PATCH {"status":"cancelled"}` fa in tempo a
 * committare, e l'appello scrive lo stesso — su un evento che, al momento
 * della scrittura, era gia annullato.
 *
 * Misurato da `scripts/pp-03-round5-concorrenza-e-grafie-probe.mjs` (`B-03`)
 * contro PostgreSQL: appello **200** e annullamento **200**, stato finale
 * `cancelled`, e in archivio una riga `present`. La presenza e la misura dei
 * contributi pubblici (`funding/attendance-measure.ts`): la finestra apriva la
 * strada a gonfiare una rendicontazione con allenamenti che non hanno avuto
 * luogo.
 *
 * ## Cosa prova questo file, e cosa no
 *
 * La corsa vera si misura contro un archivio vero, e la misura la fa la sonda.
 * Qui si prova la **proprieta che rende la corsa innocua**: la guardia decide
 * dentro la transazione che scrive, su una rilettura, e non sulla copia letta
 * prima. Il doppio di Prisma non esegue SQL grezzo, quindi il blocco di riga
 * non c'e — ma il ripiego rilegge lo stato dalla transazione, ed e esattamente
 * il gesto che qui si pretende.
 *
 * Il modo di misurarlo e cambiare il mondo **fra** le due letture: la riga
 * dell'evento diventa `cancelled` un istante prima che il corpo della
 * transazione parta. Se la guardia vive solo fuori, la scrittura passa; se vive
 * anche dentro, viene respinta e non resta niente in archivio.
 *
 * Verificato per mutazione: tolta la chiamata dentro `$transaction`, le quattro
 * prove di annullamento in corsa diventano rosse.
 */

const CLUB = "aaaaaaaa-13b0-4000-8000-00000000000a";
const SEGRETERIA = "11111111-13b0-4000-8000-000000000aaa";
const ALLENAMENTO = "eeeeeeee-13b0-4000-8000-000000000001";
const GARA = "eeeeeeee-13b0-4000-8000-000000000002";

const scope = (activeRole = "owner") => ({
  userId: SEGRETERIA,
  activeOrganizationId: CLUB,
  activeRole,
  allowedOrganizationIds: [CLUB],
});

let eventi;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  eventi = await import("../../src/lib/server/events.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [{ id: SEGRETERIA, email: "segreteria@club.it" }],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [{ id: "u15", name: "Under 15" }],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
    },
  ],
  clubEvent: [
    {
      id: ALLENAMENTO,
      organization_id: CLUB,
      kind: "training",
      legacy_id: "training-13b",
      title: "Allenamento Under 15",
      status: "scheduled",
      category_id: "u15",
      category_name: "Under 15",
      starts_at: new Date("2026-09-05T17:30:00.000Z"),
      ends_at: new Date("2026-09-05T19:00:00.000Z"),
      version: 1,
      payload: { id: "training-13b" },
    },
    {
      id: GARA,
      organization_id: CLUB,
      kind: "match",
      legacy_id: "match-13b",
      title: "Gara Under 15",
      status: "scheduled",
      category_id: "u15",
      category_name: "Under 15",
      starts_at: new Date("2026-09-13T15:00:00.000Z"),
      version: 1,
      payload: { id: "match-13b" },
    },
  ],
  athlete: [
    {
      id: "atleta-1",
      organization_id: CLUB,
      first_name: "Uno",
      last_name: "Club",
      status: "active",
      category_id: "u15",
      category_name: "Under 15",
    },
  ],
  clubEventParticipant: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const rigaEvento = (id) => fake.rows("clubEvent").find((row) => row.id === id);

/**
 * Porta l'evento a `cancelled` **fra** la lettura di `findClubEvent` e il corpo
 * della transazione, avvolgendo `$transaction` una volta sola.
 *
 * E la forma piu fedele della corsa che si possa dare a un doppio: la copia che
 * il dominio ha in mano dice ancora `scheduled`, l'archivio dice gia
 * `cancelled`, e il dominio non ha nessun modo di saperlo se non rileggendo.
 */
const annullaAllInizioDellaTransazione = (eventId) => {
  const originale = fake.client.$transaction;
  let fatto = false;

  fake.client.$transaction = async (input) => {
    if (!fatto && typeof input === "function") {
      fatto = true;
      rigaEvento(eventId).status = "cancelled";
    }
    return originale(input);
  };
};

/* ============================ l'appello ================================== */

test("l'appello e respinto se l'evento risulta annullato alla scrittura", async () => {
  annullaAllInizioDellaTransazione(ALLENAMENTO);

  await assert.rejects(
    () =>
      eventi.saveEventAttendance(scope(), ALLENAMENTO, [
        { athleteId: "atleta-1", status: "present" },
      ]),
    /annullato non si tocca piu/,
    "la guardia che decide fuori dalla transazione si scavalca aspettando",
  );
});

test("dopo il rifiuto non resta nessuna presenza in archivio", async () => {
  annullaAllInizioDellaTransazione(ALLENAMENTO);

  await assert.rejects(() =>
    eventi.saveEventAttendance(scope(), ALLENAMENTO, [
      { athleteId: "atleta-1", status: "present" },
    ]),
  );

  assert.deepEqual(
    fake.rows("clubEventParticipant").filter((row) => row.event_id === ALLENAMENTO),
    [],
    "una presenza su un evento annullato alimenta la misura dei contributi",
  );
});

/* ============================ la convocazione ============================ */

test("la convocazione e respinta se la gara risulta annullata alla scrittura", async () => {
  annullaAllInizioDellaTransazione(GARA);

  await assert.rejects(
    () =>
      eventi.saveEventConvocations(scope(), GARA, [
        { athleteId: "atleta-1", status: "convocated" },
      ]),
    /annullato non si tocca piu/,
    "una convocazione fa partire l'invito alla famiglia: non su una gara annullata",
  );
});

test("dopo il rifiuto la gara non risulta convocata", async () => {
  annullaAllInizioDellaTransazione(GARA);

  await assert.rejects(() =>
    eventi.saveEventConvocations(scope(), GARA, [
      { athleteId: "atleta-1", status: "convocated" },
    ]),
  );

  assert.deepEqual(
    fake.rows("clubEventParticipant").filter((row) => row.event_id === GARA),
    [],
  );
  assert.notEqual(
    rigaEvento(GARA).convocation_status,
    "completed",
    "la rosa non si dichiara chiusa su una gara che non si gioca",
  );
});

/* ======================= e cio che deve continuare a passare ============= */

test("su un evento aperto l'appello passa, e la rilettura non lo cambia", async () => {
  await eventi.saveEventAttendance(scope(), ALLENAMENTO, [
    { athleteId: "atleta-1", status: "present", notes: "puntuale" },
  ]);

  const riga = fake
    .rows("clubEventParticipant")
    .find((row) => row.event_id === ALLENAMENTO);

  assert.equal(riga.status, "present");
  assert.equal(riga.notes, "puntuale");
});

test("un evento gia annullato prima della chiamata resta chiuso, come prima", async () => {
  rigaEvento(ALLENAMENTO).status = "cancelled";

  await assert.rejects(
    () =>
      eventi.saveEventAttendance(scope(), ALLENAMENTO, [
        { athleteId: "atleta-1", status: "present" },
      ]),
    /annullato non si tocca piu/,
  );
});

/* ================= la sostanza di un evento non operativo =============== */

/**
 * **Su un evento annullato l'unico atto e riaprirlo.**
 *
 * `updateClubEvent` non poteva chiamare `assertEventoAperto` — la strada che
 * **riapre** un annullato passa proprio di li — e da quella deroga discendeva
 * che, con lo stesso stato in entrata e in uscita, `canTransitionEvent`
 * rispondeva sempre di si e `assertEventoNonConsolidato` usciva subito su un
 * evento senza righe di partecipazione.
 *
 * Misurato da `scripts/audit-finale-scritture-probe.mjs` (`B-01`): un
 * `PATCH {"status":"cancelled","date":"2027-01-20"}` su un evento gia annullato
 * rispondeva **200**, spostava data, campo e squadra, e la riga veniva
 * riproiettata in `clubs.trainings` — dove gli annullati restano.
 */
test("un evento annullato non si sposta di data", async () => {
  rigaEvento(ALLENAMENTO).status = "cancelled";

  await assert.rejects(
    () =>
      eventi.updateClubEvent(scope(), ALLENAMENTO, {
        status: "cancelled",
        date: "2027-01-20",
        time: "21:00",
      }),
    /annullato: non se ne cambia/,
  );

  assert.equal(
    rigaEvento(ALLENAMENTO).starts_at.toISOString(),
    "2026-09-05T17:30:00.000Z",
  );
});

test("nemmeno di categoria", async () => {
  rigaEvento(ALLENAMENTO).status = "cancelled";

  await assert.rejects(
    () =>
      eventi.updateClubEvent(scope(), ALLENAMENTO, {
        status: "cancelled",
        categoryId: "prima",
        categoryName: "Prima squadra",
      }),
    /annullato: non se ne cambia/,
  );
});

/**
 * **Il controspecchio, e conta il doppio qui.** Chiudere gli atti su un
 * annullato non deve chiudere la strada che lo riapre: e il difetto `D-AUD-20`,
 * dove stringere la lettura aveva reso irraggiungibile il ripristino.
 */
test("ma il ripristino resta possibile", async () => {
  rigaEvento(ALLENAMENTO).status = "cancelled";

  await eventi.updateClubEvent(scope(), ALLENAMENTO, { status: "scheduled" });

  assert.equal(rigaEvento(ALLENAMENTO).status, "scheduled");
});

test("e il titolo di un annullato si corregge: non e un campo congelato", async () => {
  rigaEvento(ALLENAMENTO).status = "cancelled";

  await eventi.updateClubEvent(scope(), ALLENAMENTO, {
    status: "cancelled",
    title: "Annullato per maltempo",
  });

  assert.equal(rigaEvento(ALLENAMENTO).title, "Annullato per maltempo");
});

/* ============ un identificativo malformato non e un errore del db ======= */

/**
 * **Cio che non ha la forma di un identificativo non e un atleta di questo
 * club** (`A-05b`, classe `W4-R14`).
 *
 * `athletes.id` e un `uuid` in colonna: `WHERE id IN ('non-e-un-uuid')` non
 * risponde «nessuno», **fallisce**, e l'errore che risale porta con se il testo
 * interno di Prisma — nome del modello, invocazione, codice PostgreSQL — fino
 * al browser di chiunque abbia una tessera nel club.
 *
 * Misurato da `scripts/pp-03-eventi-scope-ruoli-probe.mjs`. La risposta giusta
 * non e nascondere l'errore: e non farlo nascere.
 */
test("un identificativo malformato e un accesso negato, non un errore di Prisma", async () => {
  /*
    Il doppio di Prisma non converte niente e non fallisce, quindi la corsia
    `P2023` la si mette qui a mano: e l'unico modo di provare **cosa fa il
    dominio** quando l'archivio dice «questo valore non e un identificativo».
  */
  const originale = fake.client.athlete.findMany;
  fake.client.athlete.findMany = async (args) => {
    const richiesti = args?.where?.id?.in || [];
    /*
      Il doppio rifiuta cio che PostgreSQL rifiuta — un valore che non ha la
      forma di un identificativo — e **risponde** a tutto il resto: e la
      differenza su cui il dominio decide, e un doppio che fallisse sempre
      farebbe passare la prova anche a una guardia che inghiotte i guasti.
    */
    if (richiesti.some((id) => !/^[0-9a-f-]{36}$/i.test(String(id)))) {
      const errore = new Error(
        "Invalid `prisma.athlete.findMany()` invocation: Inconsistent column data",
      );
      errore.code = "P2023";
      throw errore;
    }
    return originale(args);
  };

  try {
    await assert.rejects(
      () =>
        eventi.saveEventConvocations(scope(), GARA, [
          { athleteId: "non-e-un-uuid", status: "convocated" },
        ]),
      (errore) => {
        assert.match(String(errore.message), /Accesso negato/);
        assert.doesNotMatch(String(errore.message), /prisma|invocation|findMany/i);
        return true;
      },
    );
  } finally {
    fake.client.athlete.findMany = originale;
  }

  assert.deepEqual(
    fake.rows("clubEventParticipant").filter((row) => row.event_id === GARA),
    [],
    "e non lascia nessuna riga",
  );
});

/**
 * **Il controspecchio, e conta.** Un guasto vero dell'archivio deve restare un
 * guasto: convertirlo in «accesso negato» nasconderebbe un'indisponibilita
 * dietro una risposta che sembra una decisione.
 */
test("un guasto dell'archivio non diventa un accesso negato", async () => {
  const originale = fake.client.athlete.findMany;
  fake.client.athlete.findMany = async () => {
    throw new Error("Can't reach database server");
  };

  try {
    await assert.rejects(
      () =>
        eventi.saveEventConvocations(scope(), GARA, [
          { athleteId: "atleta-1", status: "convocated" },
        ]),
      /Can't reach database server/,
    );
  } finally {
    fake.client.athlete.findMany = originale;
  }
});
