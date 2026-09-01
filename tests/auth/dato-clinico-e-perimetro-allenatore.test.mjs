import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **D-4 e D-5 — due guardie che vivevano nel browser.**
 *
 * D-4: il dato clinico dei minori era mascherato dal flag `viewMedicalStatus`,
 * che compare in diciannove componenti e in **zero** moduli server. Le schede
 * erano nascoste; il dato usciva comunque da `GET /api/v1/athletes` e da
 * `GET /api/v1/medical_certificates`.
 *
 * D-5: il perimetro dell'allenatore si attivava solo se il chiamante passava
 * `trainer_dashboard=1` nella query string. Un filtro che si accende su un
 * parametro scelto da chi chiama non e un confine — e infatti il contesto della
 * dashboard chiamava `simplified_athletes` **senza** quel parametro e riceveva
 * l'anagrafica completa del club.
 *
 * Questo file esiste perche **fallisca se si toglie la guardia**.
 */

const CLUB = "aaaaaaaa-4000-4000-8000-00000000000a";
const ALLENATORE = "11111111-4000-4000-8000-000000000aaa";
const PROPRIETARIO = "22222222-4000-4000-8000-000000000bbb";

const MIO_ATLETA = "atleta-under-12";
const NON_MIO_ATLETA = "atleta-prima-squadra";

const scopeAllenatore = () => ({
  userId: ALLENATORE,
  activeOrganizationId: CLUB,
  activeRole: "trainer",
  allowedOrganizationIds: [CLUB],
});

const scopeProprietario = () => ({
  userId: PROPRIETARIO,
  activeOrganizationId: CLUB,
  activeRole: "owner",
  allowedOrganizationIds: [CLUB],
});

let risorse;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const datoClinico = {
  bloodType: "0 Rh-",
  allergies: "Arachidi, lattice",
  chronicDiseases: "Asma da sforzo",
  medications: "Salbutamolo al bisogno",
  blsd: true,
};

const seed = () => ({
  user: [
    { id: ALLENATORE, email: "mister@club.it", role: "user" },
    { id: PROPRIETARIO, email: "presidente@club.it", role: "user" },
  ],
  club: [
    {
      id: CLUB,
      slug: "club",
      name: "Club",
      categories: [
        { id: "under-12", name: "Under 12" },
        { id: "prima-squadra", name: "Prima squadra" },
      ],
      trainers: [
        {
          id: "trainer-1",
          name: "Mister",
          email: "mister@club.it",
          linkedUserId: ALLENATORE,
          categories: ["under-12"],
        },
      ],
    },
  ],
  athlete: [
    {
      id: MIO_ATLETA,
      organization_id: CLUB,
      first_name: "Marco",
      last_name: "Rossi",
      data: {
        category: "under-12",
        ...datoClinico,
        medicalCertificateExpiry: "2027-01-31",
      },
    },
    {
      id: NON_MIO_ATLETA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      data: {
        category: "prima-squadra",
        ...datoClinico,
      },
    },
  ],
  medicalCertificate: [
    {
      id: "certificato-1",
      organization_id: CLUB,
      athlete_id: MIO_ATLETA,
      expiry_date: new Date("2027-01-31T00:00:00.000Z"),
      status: "valid",
      notes: "Soffio sistolico innocente, controllo annuale",
      file_url: "/uploads/certificato-1.pdf",
      doctor: "Dott.ssa Verdi",
    },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

const CAMPI_CLINICI = [
  "bloodType",
  "allergies",
  "chronicDiseases",
  "medications",
  "blsd",
];

/* ============================== D-4 — il contenuto clinico === */

test("all'allenatore il contenuto clinico non esce dall'anagrafica", async () => {
  const { records } = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB }),
    scopeAllenatore(),
  );

  assert.ok(records.length > 0, "l'allenatore vede almeno un proprio atleta");

  for (const riga of records) {
    const data = riga.data || {};
    for (const campo of CAMPI_CLINICI) {
      assert.equal(
        campo in data,
        false,
        `${campo} non deve uscire: e contenuto clinico di un minore`,
      );
    }
    assert.equal(
      data.medicalCertificateExpiry ?? null,
      riga.id === MIO_ATLETA ? "2027-01-31" : null,
      "lo stato del certificato resta: e cio che dice se puo scendere in campo",
    );
  }
});

test("il contenuto clinico non esce nemmeno dalla rotta senza il parametro della dashboard", async () => {
  /*
    Era la strada da cui il dato usciva davvero: `simplified_athletes` senza
    `trainer_dashboard=1`.
  */
  const { records } = await risorse.listResourcePage(
    "simplified_athletes",
    new URLSearchParams({ club_id: CLUB }),
    scopeAllenatore(),
  );

  for (const riga of records) {
    for (const campo of CAMPI_CLINICI) {
      assert.equal(campo in (riga.data || {}), false);
    }
  }
});

test("del certificato l'allenatore vede lo stato, non il contenuto", async () => {
  const { records } = await risorse.listResourcePage(
    "medical_certificates",
    new URLSearchParams({ organization_id: CLUB }),
    scopeAllenatore(),
  );

  const certificato = records[0];
  assert.ok(certificato, "il certificato resta elencabile");
  assert.ok(certificato.expiry_date, "la scadenza e lo stato, e resta");
  assert.equal(certificato.status, "valid");

  for (const campo of ["notes", "file_url", "doctor"]) {
    assert.equal(
      campo in certificato,
      false,
      `${campo} e contenuto clinico, non stato`,
    );
  }
});

test("proprietario e segreteria continuano a vedere il fascicolo intero", async () => {
  const { records } = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB }),
    scopeProprietario(),
  );

  const atleta = records.find((riga) => riga.id === MIO_ATLETA);
  assert.equal(atleta.data.allergies, datoClinico.allergies);
  assert.equal(atleta.data.bloodType, datoClinico.bloodType);

  const { records: certificati } = await risorse.listResourcePage(
    "medical_certificates",
    new URLSearchParams({ organization_id: CLUB }),
    scopeProprietario(),
  );
  assert.equal(
    certificati[0].notes,
    "Soffio sistolico innocente, controllo annuale",
  );
});

test("le letture interne del server non perdono il dato clinico", async () => {
  /*
    Senza `scope` non si toglie niente: e il server che legge per se — per
    promuovere un certificato, per calcolare una scadenza — e ha gia il suo
    confine. Se questa proiezione si applicasse anche li, il promemoria
    notturno smetterebbe di sapere di cosa parla.
  */
  const { records } = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB }),
  );

  assert.equal(records[0].data.allergies, datoClinico.allergies);
});

/* ======================= D-5 — il perimetro dell'allenatore === */

test("il perimetro dell'allenatore non si spegne omettendo il parametro", async () => {
  const conParametro = await risorse.listResourcePage(
    "simplified_athletes",
    new URLSearchParams({ club_id: CLUB, trainer_dashboard: "1" }),
    scopeAllenatore(),
  );
  const senzaParametro = await risorse.listResourcePage(
    "simplified_athletes",
    new URLSearchParams({ club_id: CLUB }),
    scopeAllenatore(),
  );

  const ids = (risultato) => risultato.records.map((riga) => riga.id).sort();

  assert.deepEqual(
    ids(senzaParametro),
    ids(conParametro),
    "il filtro e implicito sul ruolo: non c'e un parametro da omettere",
  );
  assert.deepEqual(ids(conParametro), [MIO_ATLETA]);
  assert.equal(
    senzaParametro.records.some((riga) => riga.id === NON_MIO_ATLETA),
    false,
    "l'anagrafica della prima squadra non esce all'allenatore dell'Under 12",
  );
});

test("chi non e allenatore continua a vedere tutto il club", async () => {
  const { records } = await risorse.listResourcePage(
    "simplified_athletes",
    new URLSearchParams({ club_id: CLUB }),
    scopeProprietario(),
  );

  assert.deepEqual(
    records.map((riga) => riga.id).sort(),
    [NON_MIO_ATLETA, MIO_ATLETA].sort(),
  );
});
