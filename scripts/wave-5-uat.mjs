/**
 * **Il collaudo della Wave 5, contro un database vero.**
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wave-5-uat.mjs
 *
 * ---
 *
 * ## Perche esiste, accanto a quasi quattromila test
 *
 * Perche i tre difetti BLOCKER da cui questa Wave e cominciata **non erano
 * visibili da nessuno dei quattro gate**: 3.632 test verdi, typecheck pulito,
 * build a 153 rotte, e tre superfici del prodotto che non funzionavano. Un
 * genitore con due figli non raggiungeva il secondo; la dashboard
 * dell'allenatore interrogava otto volte una risorsa vietata al suo ruolo e
 * inghiottiva il 403; e la prima operazione della segreteria su un appuntamento
 * cancellava tutte le richieste delle famiglie.
 *
 * I difetti che stanno **fra il clic e la rete**, o dentro un `catch` che
 * restituisce `{}`, non li vede un test che sostituisce il trasporto. Questo
 * collaudo esegue le operazioni **attraverso i servizi**, sul database di
 * sviluppo, e a ogni passo legge cio che le righe dicono davvero.
 *
 * ## L'ambiente, come lo chiede il §22
 *
 * Due club veri sullo stesso archivio. Club A: due sedi, due categorie, tre
 * atleti, un allenatore con due gruppi, due stagioni. Club B: mono-sede, un
 * atleta, un allenatore. Un genitore con **tre figli** — due nel club A in
 * categorie e sedi diverse, uno nel club B.
 *
 * Copre U-01…U-14: i due club e le loro sedi, i tre figli, il perimetro
 * dell'allenatore, il dato clinico, **l'iscrizione e il rinnovo** attraverso il
 * motore dei moduli, il fascicolo documentale, gli appuntamenti, il calendario
 * e l'RSVP. U-15 e U-16 stanno in `wave-5-security-probe.mjs`, U-17 in
 * `wave-5-concurrency-probe.mjs`, U-18 nel test degli invarianti responsive.
 *
 * I due club vengono cancellati alla fine.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();

const CLUB_A = randomUUID();
const CLUB_B = randomUUID();

const SEDE_1 = "sede-uat5-nord";
const SEDE_2 = "sede-uat5-sud";
const CAT_U12 = "cat-uat5-u12";
const CAT_U15 = "cat-uat5-u15";
const GRUPPO_1 = `group:${CAT_U12}:${SEDE_1}`;
const GRUPPO_2 = `group:${CAT_U15}:${SEDE_2}`;

const FIGLIO_1 = randomUUID();
const FIGLIO_2 = randomUUID();
const FIGLIO_3 = randomUUID();
const ESTRANEO_A = randomUUID();

let PROPRIETARIO_A = null;
let PROPRIETARIO_B = null;
let GENITORE = null;
let MISTER = null;

let eventi;
let documenti;
let appuntamenti;
let rsvpService;
let consensi;
let risorse;
let moduli;
let iscrizioni;
let iscrizioni2;
let stagioniServizio;

const esiti = [];

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, atteso, trovato, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(64)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
};

/** Una chiamata che deve fallire, e il modo in cui deve fallire. */
const respinta = async (titolo, azione, atteso = /Accesso negato/) => {
  try {
    await azione();
    prova(titolo, "respinta", "riuscita");
  } catch (errore) {
    const messaggio = String(errore?.message || "");
    prova(
      titolo,
      "respinta",
      atteso.test(messaggio) ? "respinta" : `respinta-altro`,
      messaggio.slice(0, 120),
    );
  }
};

const scope = (organizationId, activeRole, userId) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole,
  allowedOrganizationIds: [organizationId],
});

/** Lo scope che le rotte della famiglia costruiscono: **nessun ruolo**. */
const scopeFamiglia = (organizationId) => ({
  userId: GENITORE.id,
  activeOrganizationId: organizationId,
  activeRole: null,
  allowedOrganizationIds: [organizationId],
});

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Collaudo",
      password_hash: "$2b$10$uat5",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

/* ------------------------------------------------------------- la semina */

const semina = async () => {
  /*
    **Il collaudo comincia da un archivio pulito, anche se l'esecuzione
    precedente e stata interrotta.** Un residuo non e neutrale: il genitore di
    collaudo si riconosce per indirizzo verificato, quindi i figli di una
    semina rimasta in piedi si sommerebbero a quelli nuovi e il conteggio del
    §22 direbbe sei dove ne aspetta tre.
  */
  await prisma.club.deleteMany({ where: { slug: { startsWith: "uat5-" } } });

  PROPRIETARIO_A = await utente("uat5-presidente-a@example.invalid", "Anna");
  PROPRIETARIO_B = await utente("uat5-presidente-b@example.invalid", "Bruno");
  GENITORE = await utente("uat5-genitore@example.invalid", "Carla");
  MISTER = await utente("uat5-mister@example.invalid", "Dario");

  const stagioni = {
    seasons: [
      {
        id: "2025-26",
        label: "2025/26",
        startDate: "2025-07-01",
        endDate: "2026-06-30",
        status: "archived",
      },
      {
        id: "2026-27",
        label: "2026/27",
        startDate: "2026-07-01",
        endDate: "2027-06-30",
        status: "active",
      },
    ],
  };

  await prisma.club.create({
    data: {
      id: CLUB_A,
      slug: `uat5-a-${Date.now()}`,
      name: "ASD Collaudo A",
      creator_id: PROPRIETARIO_A.id,
      settings: stagioni,
      categories: [
        { id: CAT_U12, name: "Under 12" },
        { id: CAT_U15, name: "Under 15" },
        { id: "cat-uat5-prima", name: "Prima squadra" },
      ],
      club_sites: [
        { id: SEDE_1, name: "Sede Nord", active: true },
        { id: SEDE_2, name: "Sede Sud", active: true },
      ],
      category_groups: [
        { id: GRUPPO_1, categoryId: CAT_U12, siteId: SEDE_1 },
        { id: GRUPPO_2, categoryId: CAT_U15, siteId: SEDE_2 },
      ],
      trainers: [
        {
          id: "trainer-uat5",
          first_name: "Dario",
          last_name: "Collaudo",
          email: MISTER.email,
          linkedUserId: MISTER.id,
          categories: [CAT_U12, CAT_U15],
          groups: [GRUPPO_1, GRUPPO_2],
        },
      ],
      staff_members: [],
      structures: [
        {
          id: "struttura-uat5",
          name: "Palestra",
          siteId: SEDE_1,
          fields: [
            {
              id: "campo-uat5",
              name: "Campo 1",
              availability: { Sab: [{ start: "09:00", end: "20:00" }] },
            },
          ],
        },
      ],
      trainings: [],
      matches: [],
      appointments: [],
      opening_hours: [
        { day: "Sabato", open: "09:00", close: "13:00", closed: false },
      ],
    },
  });

  await prisma.club.create({
    data: {
      id: CLUB_B,
      slug: `uat5-b-${Date.now()}`,
      name: "ASD Collaudo B",
      creator_id: PROPRIETARIO_B.id,
      settings: stagioni,
      categories: [{ id: CAT_U12, name: "Under 12" }],
      club_sites: [],
      trainers: [],
      trainings: [],
      matches: [],
      appointments: [],
    },
  });

  await prisma.organizationUser.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: GENITORE.id,
        role: "parent",
        is_primary: true,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_B,
        user_id: GENITORE.id,
        role: "parent",
        is_primary: false,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: MISTER.id,
        role: "trainer",
        is_primary: true,
        updated_at: new Date(),
      },
    ],
  });

  const tutore = (linked) => ({
    guardians: [
      {
        name: "Carla Collaudo",
        email: GENITORE.email,
        ...(linked ? { linkedUserId: GENITORE.id } : {}),
      },
    ],
  });

  await prisma.athlete.createMany({
    data: [
      {
        id: FIGLIO_1,
        organization_id: CLUB_A,
        first_name: "Marco",
        last_name: "Collaudo",
        category_id: CAT_U12,
        category_name: "Under 12",
        status: "active",
        data: tutore(true),
        updated_at: new Date(),
      },
      {
        /* Legato **solo per email verificata**: e lo scenario U-03.5. */
        id: FIGLIO_2,
        organization_id: CLUB_A,
        first_name: "Luca",
        last_name: "Collaudo",
        category_id: CAT_U15,
        category_name: "Under 15",
        status: "active",
        data: tutore(false),
        updated_at: new Date(),
      },
      {
        id: FIGLIO_3,
        organization_id: CLUB_B,
        first_name: "Sara",
        last_name: "Collaudo",
        category_id: CAT_U12,
        category_name: "Under 12",
        status: "active",
        data: tutore(true),
        updated_at: new Date(),
      },
      {
        id: ESTRANEO_A,
        organization_id: CLUB_A,
        first_name: "Giulia",
        last_name: "Altrui",
        /*
          Fuori dai gruppi del mister **e** fuori dalle sue categorie: serve a
          provare che il perimetro escluda, e un atleta dentro il perimetro non
          proverebbe niente.
        */
        category_id: "cat-uat5-prima",
        category_name: "Prima squadra",
        status: "active",
        data: {},
        updated_at: new Date(),
      },
    ],
  });

  await prisma.athleteCategoryMembership.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: FIGLIO_1,
        category_id: CAT_U12,
        category_name: "Under 12",
        is_primary: true,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: FIGLIO_2,
        category_id: CAT_U15,
        category_name: "Under 15",
        is_primary: true,
        site_id: SEDE_2,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: ESTRANEO_A,
        category_id: "cat-uat5-prima",
        category_name: "Prima squadra",
        is_primary: true,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
    ],
  });
};

const pulisci = async () => {
  /*
    Gli appuntamenti si tolgono **prima** del club: la riprogrammazione crea una
    riga che punta a quella che sostituisce, e quella chiave esterna e
    `NO ACTION` di proposito — una riga citata da una riprogrammazione non si
    cancella. E la regola giusta per il prodotto, dove un club non si cancella
    mai; qui e il collaudo a doverne tenere conto.
  */
  for (const club of [CLUB_A, CLUB_B]) {
    await prisma.appointment.deleteMany({
      where: { organization_id: club, parent_appointment_id: { not: null } },
    });
    await prisma.appointment.deleteMany({ where: { organization_id: club } });
  }
  await prisma.club.deleteMany({ where: { id: { in: [CLUB_A, CLUB_B] } } });
};

/* ================================================ U-01 — due club ======== */

const u01 = async () => {
  console.log(`${NL}U-01 — due club`);
  const scopeA = scope(CLUB_A, "owner", PROPRIETARIO_A.id);
  const scopeB = scope(CLUB_B, "owner", PROPRIETARIO_B.id);

  await eventi.createClubEvent(scopeA, "training", {
    id: "uat5-t-a",
    date: "2026-09-05",
    time: "18:00",
    endTime: "19:30",
    title: "Allenamento A",
    categoryId: CAT_U12,
    siteId: SEDE_1,
    groupIds: [GRUPPO_1],
  });
  await eventi.createClubEvent(scopeB, "training", {
    id: "uat5-t-b",
    date: "2026-09-05",
    time: "18:00",
    title: "Allenamento B",
    categoryId: CAT_U12,
  });

  const inA = await eventi.listClubEvents(scopeA);
  const inB = await eventi.listClubEvents(scopeB);

  prova(
    "U-01.1 gli eventi del club A sono solo del club A",
    true,
    inA.every((riga) => riga.organization_id === CLUB_A) && inA.length === 1,
  );
  prova(
    "U-01.1 gli eventi del club B sono solo del club B",
    true,
    inB.every((riga) => riga.organization_id === CLUB_B) && inB.length === 1,
  );

  const atletiA = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    scopeA,
  );
  const atletiB = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_B }),
    scopeB,
  );
  prova("U-01.2 gli atleti non si sommano fra i club", [3, 1], [
    atletiA.records.length,
    atletiB.records.length,
  ]);

  /*
    Per una **lettura** l'esito corretto e «inesistente», non «negato»:
    confermare l'esistenza di una riga altrui e gia un'informazione (§22, U-15).
  */
  prova(
    "U-01.3 dal club B un evento del club A risulta inesistente",
    null,
    await eventi.readClubEvent(scopeB, "uat5-t-a"),
  );
};

/* ================================================ U-02 — piu sedi ======== */

const u02 = async () => {
  console.log(`${NL}U-02 — piu sedi`);
  const scopeA = scope(CLUB_A, "owner", PROPRIETARIO_A.id);

  await eventi.createClubEvent(scopeA, "training", {
    id: "uat5-t-sud",
    date: "2026-09-06",
    time: "18:00",
    title: "Allenamento Sud",
    categoryId: CAT_U15,
    siteId: SEDE_2,
    groupIds: [GRUPPO_2],
  });
  await eventi.createClubEvent(scopeA, "training", {
    id: "uat5-t-senza-sede",
    date: "2026-09-07",
    time: "18:00",
    title: "Allenamento senza sede",
    categoryId: CAT_U12,
  });

  const nord = await eventi.listClubEvents(scopeA, { siteId: SEDE_1 });
  const sud = await eventi.listClubEvents(scopeA, { siteId: SEDE_2 });
  const tutti = await eventi.listClubEvents(scopeA);

  prova("U-02.1 il filtro per sede conta", [1, 1, 3], [
    nord.length,
    sud.length,
    tutti.length,
  ]);

  /*
    ADR-0038: un evento senza sede compare **ovunque**, e non in nessun luogo.
    E la proprieta che protegge il dato preesistente da un filtro nuovo.
  */
  const senzaSede = tutti.find((riga) => riga.legacy_id === "uat5-t-senza-sede");
  prova(
    "U-02.2 l'evento senza sede resta visibile senza filtro",
    true,
    Boolean(senzaSede) && senzaSede.site_id === null,
  );

  await appuntamenti.createAppointmentSlot(scopeA, {
    siteId: SEDE_2,
    weekday: 6,
    startTime: "10:00",
    endTime: "12:00",
    durationMinutes: 30,
    capacity: 1,
  });

  const slotSede1 = await appuntamenti.listFreeAppointmentSlots(scopeA, {
    from: "2026-09-05",
    to: "2026-09-12",
    siteId: SEDE_1,
    now: new Date("2026-09-01T08:00:00.000Z"),
  });
  const slotSede2 = await appuntamenti.listFreeAppointmentSlots(scopeA, {
    from: "2026-09-05",
    to: "2026-09-12",
    siteId: SEDE_2,
    now: new Date("2026-09-01T08:00:00.000Z"),
  });

  prova(
    "U-02.3 gli slot dichiarati sulla sede 2 non compaiono nella sede 1",
    [true, false],
    [
      slotSede2.some((slot) => slot.source === "slot" && slot.siteId === SEDE_2),
      slotSede1.some((slot) => slot.source === "slot"),
    ],
  );
  /*
    La sede senza slot dichiarati **ricade sugli orari di apertura**, ed e la
    regola che il dominio dichiara: un ripiego che non si vede e un ripiego che
    nessuno correggera. Qui si prova che la fonte sia detta, non nascosta.
  */
  prova(
    "U-02.3 la sede senza slot ricade sugli orari, e lo dichiara",
    true,
    slotSede1.every((slot) => slot.source === "opening_hours"),
    `sede1=${slotSede1.length} sede2=${slotSede2.length}`,
  );
};

/* ============================== U-03 e U-04 — i tre figli ================ */

const u03 = async () => {
  console.log(`${NL}U-03 / U-04 — tre figli, due club, due categorie`);
  const parentDashboard = await import("../src/lib/server/parent-dashboard.ts");
  const accessRoles = await import("../src/lib/access-roles.ts");

  const collegati = await parentDashboard.getParentLinkedAthletes(GENITORE.id);
  const ids = collegati.map((riga) => riga.id).sort();

  prova(
    "U-03.1 il genitore vede tre figli",
    [FIGLIO_1, FIGLIO_2, FIGLIO_3].sort(),
    ids,
  );

  prova(
    "U-03.5 il figlio legato solo per email verificata e raggiungibile",
    true,
    ids.includes(FIGLIO_2),
  );

  /*
    D-3: la guardia d'area ammetteva **un solo** percorso, quello del primo
    figlio, e il clic sul secondo rimbalzava sul primo.
  */
  const contesto = { linkedAthleteIds: ids };
  prova(
    "U-03.2 la guardia ammette tutti e tre i percorsi",
    [true, true, true],
    [
      accessRoles.canAccessPath("parent", `/parent-view/${FIGLIO_1}`, contesto),
      accessRoles.canAccessPath("parent", `/parent-view/${FIGLIO_2}`, contesto),
      accessRoles.canAccessPath("parent", `/parent-view/${FIGLIO_3}`, contesto),
    ],
  );
  prova(
    "U-03.2 e non quello di un atleta di un'altra famiglia",
    false,
    accessRoles.canAccessPath("parent", `/parent-view/${ESTRANEO_A}`, contesto),
  );

  prova(
    "U-04.3 il figlio del club B non e accessibile a un estraneo",
    false,
    await parentDashboard.canParentAccessAthlete(
      PROPRIETARIO_B.id,
      FIGLIO_1,
    ),
  );

  const cruscotto = await parentDashboard.getParentDashboardData(
    GENITORE.id,
    FIGLIO_1,
  );
  prova(
    "U-04.1 il calendario del figlio 1 non porta gli eventi del figlio 2",
    true,
    cruscotto.trainings.all.every(
      (evento) => String(evento.id) !== "uat5-t-sud",
    ),
    `eventi=${cruscotto.trainings.all.length}`,
  );
};

/* ========================= U-05 — allenatore con due gruppi ============== */

const u05 = async () => {
  console.log(`${NL}U-05 — allenatore con due gruppi`);
  const scopeMister = scope(CLUB_A, "trainer", MISTER.id);

  const suoi = await eventi.listClubEvents(scopeMister);
  prova(
    "U-05.1 vede gli eventi di entrambi i gruppi",
    true,
    suoi.length >= 2,
    `eventi=${suoi.length}`,
  );

  /*
    D-5: il filtro si attivava solo se il chiamante passava
    `trainer_dashboard=1`. Qui la chiamata **non lo passa**.
  */
  const senzaParametro = await risorse.listResourcePage(
    "simplified_athletes",
    new URLSearchParams({ club_id: CLUB_A }),
    scopeMister,
  );
  const conParametro = await risorse.listResourcePage(
    "simplified_athletes",
    new URLSearchParams({ club_id: CLUB_A, trainer_dashboard: "1" }),
    scopeMister,
  );

  prova(
    "U-05.3 senza il parametro la risposta non contiene tutto il club",
    senzaParametro.records.map((riga) => riga.id).sort().join(","),
    conParametro.records.map((riga) => riga.id).sort().join(","),
    "il perimetro e implicito sul ruolo",
  );

  /*
    Il perimetro per **gruppo operativo** e un confine sul dato personale
    (W5-69): il mister ha entrambi i gruppi, quindi vede i due figli e non
    l'atleta senza gruppo.
  */
  prova(
    "U-05.2 vede gli atleti dei propri gruppi e non gli altri",
    [FIGLIO_1, FIGLIO_2].sort(),
    senzaParametro.records.map((riga) => riga.id).sort(),
  );
};

/* ====================== U-06 — il taglio sul dato clinico ================ */

const u06 = async () => {
  console.log(`${NL}U-06 — il dato clinico (al posto dei ruoli personalizzati)`);
  const scopeMister = scope(CLUB_A, "trainer", MISTER.id);
  const scopeStaff = scope(CLUB_A, "staff", PROPRIETARIO_A.id);

  await prisma.athlete.update({
    where: { id: FIGLIO_1 },
    data: {
      data: {
        guardians: [{ name: "Carla", email: GENITORE.email, linkedUserId: GENITORE.id }],
        allergies: "Arachidi",
        bloodType: "0 Rh-",
        medications: "Salbutamolo",
        medicalCertificateExpiry: "2027-01-31",
      },
    },
  });

  const perMister = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    scopeMister,
  );
  const rigaMister = perMister.records.find((riga) => riga.id === FIGLIO_1);

  prova(
    "U-06.2 il contenuto clinico non e nella risposta all'allenatore",
    [false, false, false],
    [
      "allergies" in (rigaMister?.data || {}),
      "bloodType" in (rigaMister?.data || {}),
      "medications" in (rigaMister?.data || {}),
    ],
  );
  prova(
    "U-06.3 lo stato del certificato resta, perche serve a convocare",
    "2027-01-31",
    rigaMister?.data?.medicalCertificateExpiry ?? null,
  );

  const perStaff = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    scopeStaff,
  );
  const rigaStaff = perStaff.records.find((riga) => riga.id === FIGLIO_1);
  prova(
    "U-06.4 la segreteria, che ha clinical.read, vede il contenuto",
    "Arachidi",
    rigaStaff?.data?.allergies ?? null,
    "la differenza fra i due la fa il server, non lo schermo",
  );
};

/* ================== U-09, U-10, U-11 — il fascicolo documentale ========== */

let RICHIESTA = null;
let DEPOSITO = null;

const u09 = async () => {
  console.log(`${NL}U-09 / U-10 / U-11 — il fascicolo documentale`);
  const scopeStaff = scope(CLUB_A, "staff", PROPRIETARIO_A.id);

  const voceRichiesta = await documenti.createDocumentRequest(scopeStaff, {
    subjectKind: "athlete",
    subjectId: FIGLIO_1,
    documentKind: "medical_certificate",
    title: "Certificato medico agonistico",
    required: true,
    dueDate: "2026-10-31",
  });
  RICHIESTA = voceRichiesta.requestId || voceRichiesta.id;

  prova(
    "U-09.1 la richiesta nasce come riga aperta",
    "open",
    (
      await prisma.documentRequest.findUnique({ where: { id: RICHIESTA } })
    )?.status,
  );

  const fascicoloFamiglia = await documenti.getDocumentDossier(
    await documenti.resolveLinkedFamilyScope(GENITORE.id, FIGLIO_1),
    { subjectKind: "athlete", subjectId: FIGLIO_1 },
  );
  const voci = Array.isArray(fascicoloFamiglia)
    ? fascicoloFamiglia
    : fascicoloFamiglia.entries || [];
  const laSua = voci.find((voce) => voce.requestId === RICHIESTA);
  prova(
    "U-09.2 il genitore la trova nel proprio fascicolo, con la scadenza",
    [true, "2026-10-31"],
    [Boolean(laSua), String(laSua?.dueDate || "").slice(0, 10)],
  );

  const scopeGenitore = await documenti.resolveLinkedFamilyScope(
    GENITORE.id,
    FIGLIO_1,
  );
  const deposito = await documenti.submitDocument(scopeGenitore, {
    requestId: RICHIESTA,
    source: "parent",
    file: {
      fileName: "certificato.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 collaudo wave 5"),
    },
  });
  DEPOSITO = deposito.submissions?.[0]?.id || null;

  const rigaDeposito = await prisma.documentSubmission.findUnique({
    where: { id: DEPOSITO },
  });
  prova("U-09.3 il deposito nasce «da verificare»", "under_review", rigaDeposito?.status);

  /*
    U-09.4: il file e un `Attachment` con il club **sulla riga**, e non un
    `Asset`, che di `organization_id` non ne ha uno.
  */
  const allegato = rigaDeposito?.attachment_id
    ? await prisma.attachment.findUnique({
        where: { id: rigaDeposito.attachment_id },
      })
    : null;
  prova(
    "U-09.4 i byte stanno in Attachment Core, con il club sulla riga",
    [true, CLUB_A],
    [Boolean(allegato), allegato?.organization_id ?? null],
  );

  /* U-10 — il deposito spontaneo. */
  const spontaneo = await documenti.submitDocument(scopeGenitore, {
    subjectKind: "athlete",
    subjectId: FIGLIO_1,
    documentKind: "identity_document",
    source: "parent",
    file: {
      fileName: "identita.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 identita"),
    },
  });
  const rigaSpontanea = await prisma.documentSubmission.findUnique({
    where: { id: spontaneo.submissions?.[0]?.id || spontaneo.id },
  });
  prova(
    "U-10.2 il deposito spontaneo ha request_id nullo e la stessa coda",
    [null, "under_review"],
    [rigaSpontanea?.request_id ?? null, rigaSpontanea?.status],
  );

  /* U-11 — accettazione, rifiuto, diniego, audit. */
  const primaAudit = await prisma.auditLog.count({
    where: { organization_id: CLUB_A, action: { startsWith: "document." } },
  });

  await documenti.decideDocumentSubmission(scopeStaff, DEPOSITO, {
    decision: "approved",
  });
  const dopoAccettazione = await prisma.documentSubmission.findUnique({
    where: { id: DEPOSITO },
  });
  prova("U-11.1 il documento viene accettato", "approved", dopoAccettazione?.status);

  await documenti.decideDocumentSubmission(
    scopeStaff,
    rigaSpontanea.id,
    { decision: "rejected", note: "Illeggibile: rifallo" },
  );
  const dopoRifiuto = await prisma.documentSubmission.findUnique({
    where: { id: rigaSpontanea.id },
  });
  prova(
    "U-11.2 il rifiuto porta con se il motivo",
    ["rejected", "Illeggibile: rifallo"],
    [dopoRifiuto?.status, dopoRifiuto?.decision_note],
  );

  await respinta(
    "U-11.3 un allenatore non puo decidere su un documento",
    () =>
      documenti.decideDocumentSubmission(
        scope(CLUB_A, "trainer", MISTER.id),
        DEPOSITO,
        { decision: "approved" },
      ),
  );

  const dopoAudit = await prisma.auditLog.count({
    where: { organization_id: CLUB_A, action: { startsWith: "document." } },
  });
  prova(
    "U-11.4 le decisioni lasciano una traccia di audit",
    true,
    dopoAudit > primaAudit,
    `prima=${primaAudit} dopo=${dopoAudit}`,
  );

  /* U-12.4 — il certificato accettato **promuove** una riga. */
  const certificati = await prisma.medicalCertificate.count({
    where: { organization_id: CLUB_A, athlete_id: FIGLIO_1 },
  });
  prova(
    "U-12.4 il certificato accettato promuove medical_certificates",
    true,
    certificati > 0,
    `righe=${certificati}`,
  );
};

/* ========================== U-13 — gli appuntamenti ====================== */

const u13 = async () => {
  console.log(`${NL}U-13 — gli appuntamenti`);
  const scopeStaff = scope(CLUB_A, "staff", PROPRIETARIO_A.id);

  const contesto = await appuntamenti.resolveFamilyAppointmentContext(
    GENITORE.id,
    FIGLIO_1,
  );
  const liberi = await appuntamenti.listFamilyFreeSlots(contesto, {
    from: "2026-09-05",
    to: "2026-09-12",
    now: new Date("2026-09-01T08:00:00.000Z"),
  });
  prova(
    "U-13.1 la famiglia vede gli slot liberi",
    true,
    liberi.length > 0,
    `slot=${liberi.length} fonti=${Array.from(new Set(liberi.map((s) => s.source))).join(",")}`,
  );

  const scelto = liberi[0];
  const richiesta = await appuntamenti.requestFamilyAppointment(contesto, {
    startsAt: scelto.startsAt,
    reason: "Colloquio con la segreteria",
    slotId: scelto.slotId ?? null,
  });
  const idRichiesta = richiesta.id || richiesta.appointment?.id;
  prova(
    "U-13.1 la richiesta nasce «richiesta»",
    "requested",
    (await prisma.appointment.findUnique({ where: { id: idRichiesta } }))?.status,
  );

  await appuntamenti.confirmAppointment(scopeStaff, idRichiesta, {}, {
    userId: PROPRIETARIO_A.id,
  });
  prova(
    "U-13.2 la segreteria conferma, e lo stato lo dice",
    "confirmed",
    (await prisma.appointment.findUnique({ where: { id: idRichiesta } }))?.status,
    "prima nessun codice scriveva «confermato»",
  );

  const notifiche = await prisma.notification.count({
    where: { organization_id: CLUB_A, user_id: GENITORE.id },
  });
  prova(
    "U-13.2 la famiglia riceve una notifica",
    true,
    notifiche > 0,
    `notifiche=${notifiche}`,
  );

  const riprogrammato = await appuntamenti.rescheduleAppointment(
    scopeStaff,
    idRichiesta,
    {
      startsAt: new Date("2026-09-12T10:30:00.000Z"),
      reason: "Colloquio con la segreteria",
      outsideAvailability: true,
    },
    { userId: PROPRIETARIO_A.id },
  );
  /* La riprogrammazione restituisce **due** righe: quella chiusa e quella nata. */
  const nuovoId = riprogrammato.created?.id;
  const vecchio = await prisma.appointment.findUnique({
    where: { id: idRichiesta },
  });
  const nuovo = await prisma.appointment.findUnique({ where: { id: nuovoId } });

  prova(
    "U-13.4 la riprogrammazione crea una riga e chiude la vecchia",
    ["rescheduled", idRichiesta],
    [vecchio?.status, nuovo?.parent_appointment_id ?? null],
  );

  /*
    U-13.7 — **la prova che prima falliva.** La segreteria opera un'altra
    collezione del club dal registro generico; la richiesta della famiglia deve
    essere ancora li. Prima, `syncClubAggregateField` rigenerava
    `clubs.appointments` da `club_resource_items` e la faceva sparire.
  */
  await risorse.updateResource(
    "clubs",
    CLUB_A,
    { secretariat_notes: [{ id: "nota-uat5", text: "prova" }] },
    scopeStaff,
  );
  const vive = await prisma.appointment.count({
    where: { organization_id: CLUB_A },
  });
  prova(
    "U-13.7 la richiesta della famiglia sopravvive a un'operazione del club",
    true,
    vive >= 2,
    `appuntamenti=${vive}`,
  );

  await respinta(
    "U-13.6 un allenatore non conferma un appuntamento non suo",
    () =>
      appuntamenti.confirmAppointment(
        scope(CLUB_A, "trainer", MISTER.id),
        nuovoId,
        {},
        { userId: MISTER.id },
      ),
  );
};

/* ==================== U-14 — convocazione, RSVP, appello ================= */

const u14 = async () => {
  console.log(`${NL}U-14 — convocazione, RSVP, appello`);
  const scopeA = scope(CLUB_A, "owner", PROPRIETARIO_A.id);

  const gara = await eventi.createClubEvent(scopeA, "match", {
    id: "uat5-gara",
    date: "2026-09-13",
    time: "15:00",
    title: "Gara di collaudo",
    categoryId: CAT_U12,
    siteId: SEDE_1,
    groupIds: [GRUPPO_1],
    opponent: "Rivali",
    rsvpRequired: true,
    rsvpDeadline: "2026-09-12T18:00:00.000Z",
    capacity: 20,
  });

  prova(
    "U-14.1 la gara chiede conferma, e la scadenza e sulla riga",
    [true, true],
    [gara.rsvp_required, Boolean(gara.rsvp_deadline)],
    "prima la casella non esisteva in nessuna schermata",
  );

  await eventi.saveEventConvocations(
    scopeA,
    gara.id,
    [
      { athleteId: FIGLIO_1, status: "convocated" },
      { athleteId: ESTRANEO_A, status: "convocated" },
    ],
    { userId: PROPRIETARIO_A.id },
  );

  const convocati = await prisma.clubEventParticipant.count({
    where: {
      organization_id: CLUB_A,
      event_id: gara.id,
      convocation_status: "convocated",
    },
  });
  prova("U-14.2 i convocati sono righe", 2, convocati);

  await rsvpService.answerRsvp({
    trainingId: gara.id,
    athleteId: FIGLIO_1,
    status: "yes",
    userId: GENITORE.id,
    actorEmail: GENITORE.email,
    now: new Date("2026-09-10T10:00:00.000Z"),
  });

  const dopoRsvp = await prisma.clubEventParticipant.findFirst({
    where: { event_id: gara.id, athlete_id: FIGLIO_1 },
  });
  prova(
    "U-14.3 la risposta della famiglia non tocca la presenza",
    ["yes", "pending", "convocated"],
    [dopoRsvp?.rsvp_status, dopoRsvp?.status, dopoRsvp?.convocation_status],
  );

  await eventi.saveEventAttendance(
    scopeA,
    gara.id,
    [{ athleteId: FIGLIO_1, status: "absent" }],
    { userId: PROPRIETARIO_A.id },
  );
  const dopoAppello = await prisma.clubEventParticipant.findFirst({
    where: { event_id: gara.id, athlete_id: FIGLIO_1 },
  });
  prova(
    "U-14.7 l'appello non riscrive l'RSVP, e l'RSVP non riscrive la presenza",
    ["absent", "yes", "convocated"],
    [
      dopoAppello?.status,
      dopoAppello?.rsvp_status,
      dopoAppello?.convocation_status,
    ],
    "ADR-0086, esteso da ADR-0099",
  );

  /* U-14.5 — «scrivi a chi non ha risposto», che prima era inesprimibile. */
  const audience = await import("../src/lib/server/audience.ts");
  const senzaRisposta = await audience.resolveAudience({
    organizationId: CLUB_A,
    scope: scopeA,
    actorRole: "owner",
    criteria: [{ kind: "event_no_rsvp", values: [gara.id] }],
  });
  const convocatiTutti = await audience.resolveAudience({
    organizationId: CLUB_A,
    scope: scopeA,
    actorRole: "owner",
    criteria: [{ kind: "event_convocated", values: [gara.id] }],
  });

  prova(
    "U-14.5 «senza risposta» seleziona chi tace, non chi non e stato chiamato",
    [1, 2],
    [senzaRisposta.athleteIds.length, convocatiTutti.athleteIds.length],
    "prima nessun criterio poteva nominare un evento",
  );

  /* U-14.6 — dopo la scadenza la risposta non si accetta piu. */
  await respinta(
    "U-14.6 dopo la scadenza la risposta non e piu accettata",
    () =>
      rsvpService.answerRsvp({
        trainingId: gara.id,
        athleteId: FIGLIO_1,
        status: "no",
        userId: GENITORE.id,
        actorEmail: GENITORE.email,
        now: new Date("2026-09-13T10:00:00.000Z"),
      }),
    /scadut|chius|non e piu|termine/i,
  );

  /* U-14.8 — la misura dei bandi legge le presenze, non le promesse. */
  const misura = await import("../src/lib/funding/attendance-measure.ts");
  prova(
    "U-14.8 un «si» senza appello non e una presenza",
    false,
    misura.isPresentAttendance({ status: "pending", rsvp_status: "yes" }),
  );
};

/* ================== U-07 e U-08 — iscrizione e rinnovo =================== */

/**
 * **La domanda di iscrizione, dal modulo pubblico all'anagrafica.**
 *
 * I due scenari stanno insieme perche il rinnovo **e** l'iscrizione con un
 * contesto: stesso motore, stessa coda, stessa approvazione umana. Provarli in
 * due posti diversi avrebbe dato l'idea sbagliata — che siano due strade — che
 * e esattamente cio che il codice ha evitato di diventare.
 *
 * La regola d'oro che questi controlli presidiano e ADR-0040: **l'anagrafica
 * nasce solo all'approvazione umana**. Un modulo compilato da un anonimo non
 * scrive niente in archivio finche una persona non decide.
 */

let MODULO = null;
let DOMANDA = null;
let RIFERIMENTO = "";

const u07 = async () => {
  console.log(`${NL}U-07 — iscrizione di un nuovo atleta`);
  const scopeA = scope(CLUB_A, "owner", PROPRIETARIO_A.id);
  const scopeStaff = scope(CLUB_A, "staff", PROPRIETARIO_A.id);

  const creato = await moduli.createFormTemplate(scopeA, { starter: "blank" });
  await moduli.updateFormTemplateDraft(scopeA, creato.id, {
    title: "Iscrizione 2026/27",
    description: "",
    fields: [
      {
        id: "f_nome",
        type: "short_text",
        label: "Nome",
        binding: "athlete.firstName",
        required: true,
      },
      {
        id: "f_cognome",
        type: "short_text",
        label: "Cognome",
        binding: "athlete.lastName",
        required: true,
      },
      { id: "f_allegato", type: "file_upload", label: "Documento di identita" },
    ],
    settings: {
      successMessage: "Grazie, ti faremo sapere",
      closeAt: "",
      collectRespondentEmail: true,
      notifyOnSubmit: false,
      documentTemplateId: "",
    },
  });
  MODULO = await moduli.publishFormTemplate(scopeA, creato.id);

  const atletiPrima = await prisma.athlete.count({
    where: { organization_id: CLUB_A },
  });

  const ricevuta = await iscrizioni.submitPublicForm(MODULO.publicSlug, {
    answers: { f_nome: "Elia", f_cognome: "Verdi" },
    files: [
      {
        fieldId: "f_allegato",
        fileName: "carta-identita.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-1.4 uat5"),
      },
    ],
    respondentName: "Carla Verdi",
    respondentEmail: "carla.verdi@example.invalid",
  });
  DOMANDA = ricevuta.submissionId;
  RIFERIMENTO = ricevuta.receiptReference;

  prova(
    "U-07.1 l'invio anonimo restituisce un riferimento",
    [true, 43],
    [Boolean(RIFERIMENTO), RIFERIMENTO.length],
    "trentadue byte in base64url: e una credenziale, non un identificativo",
  );

  const atletiDopo = await prisma.athlete.count({
    where: { organization_id: CLUB_A },
  });
  prova(
    "U-07.1bis l'invio non ha scritto nessuna anagrafica (ADR-0040)",
    atletiPrima,
    atletiDopo,
    "l'atleta nasce all'approvazione umana, non all'invio",
  );

  const statoIniziale = await iscrizioni2.readPublicEnrollmentStatus(RIFERIMENTO);
  prova(
    "U-07.2 la famiglia consulta lo stato: inviata",
    ["sent", "Iscrizione"],
    [statoIniziale?.state, statoIniziale?.kindLabel],
  );

  prova(
    "U-07.2bis la vista pubblica non porta le risposte del modulo",
    [false, false],
    ["answers" in (statoIniziale || {}), "files" in (statoIniziale || {})],
    "chi ha la ricevuta ha diritto di sapere a che punto e, non di rileggersi l'anagrafica",
  );

  const allegati = await prisma.attachment.count({
    where: { organization_id: CLUB_A, owner_type: "form" },
  });
  prova(
    "U-07.3 l'allegato e in Attachment Core, non in Asset",
    [1, 0],
    [
      allegati,
      await prisma.asset
        .count({ where: { path: { contains: String(MODULO.id) } } })
        .catch(() => 0),
    ],
  );

  const coda = await iscrizioni.listFormSubmissions(scopeStaff, {
    status: "pending",
  });
  const righeCoda = Array.isArray(coda) ? coda : coda.records || coda.items || [];
  prova(
    "U-07.4 la domanda e nella coda della segreteria",
    true,
    righeCoda.some((riga) => riga.id === DOMANDA),
  );

  /*
    **Il club chiede il documento mancante approvando, non respingendo.** E il
    punto in cui iscrizione e fascicolo si saldano, e il §22 lo chiede
    esattamente cosi: prima l'unica risposta a «manca il certificato» era
    respingere, e la famiglia ricompilava tutto da capo.

    La richiesta si intesta all'**atleta**, che prima dell'approvazione non
    esiste: e la ragione per cui non c'e un passo intermedio «in lavorazione»
    su una domanda di iscrizione nuova. Su un rinnovo, dove l'atleta c'e gia,
    quello stato si raggiunge — ed e provato da U-09, che apre una richiesta su
    un atleta esistente.
  */
  const esito = await iscrizioni.decideFormSubmission(scopeStaff, DOMANDA, {
    decision: "approve",
    documentRequests: [
      {
        documentKind: "medical_certificate",
        title: "Certificato medico agonistico",
        required: true,
        dueDate: "2026-11-30",
      },
    ],
  });
  prova(
    "U-07.5 all'approvazione l'atleta nasce",
    [atletiPrima + 1, []],
    [
      await prisma.athlete.count({ where: { organization_id: CLUB_A } }),
      esito.issues || [],
    ],
  );

  const nato = await prisma.athlete.findFirst({
    where: { organization_id: CLUB_A, first_name: "Elia" },
  });
  const richieste = await prisma.documentRequest.count({
    where: {
      organization_id: CLUB_A,
      subject_kind: "athlete",
      subject_id: nato?.id || "",
      status: "open",
    },
  });
  prova(
    "U-07.6 e con lui nasce la richiesta del documento mancante",
    [true, 1],
    [Boolean(nato), richieste],
  );

  const statoFinale = await iscrizioni2.readPublicEnrollmentStatus(RIFERIMENTO);
  prova(
    "U-07.7 la famiglia legge «approvata», con accanto cio che manca",
    ["approved", 1],
    [statoFinale?.state, (statoFinale?.pendingDocuments || []).length],
    "una decisione presa vince su cio che resta da consegnare, che si mostra accanto e non al posto",
  );
};

const u08 = async () => {
  console.log(`${NL}U-08 — rinnovo di un atleta esistente`);
  const scopeStaff = scope(CLUB_A, "staff", PROPRIETARIO_A.id);

  const bozza = await iscrizioni2.buildRenewalDraft(GENITORE.id, {
    athleteId: FIGLIO_1,
    publicSlug: MODULO.publicSlug,
  });

  prova(
    "U-08.1 il modulo del rinnovo arriva precompilato dall'archivio",
    ["Marco", true],
    [
      bozza?.answers?.f_nome ?? null,
      (bozza?.prefilledFieldIds || []).includes("f_cognome"),
    ],
    "la precompilazione la fa buildPrefilledAnswers, che e gia il proprietario di quella regola",
  );

  prova(
    "U-08.1bis la bozza cita la stagione attiva, e non la sceglie la famiglia",
    "2026-27",
    bozza?.seasonId ?? null,
  );

  /*
    La famiglia corregge un dato prima di confermare: e il caso normale, ed e
    anche cio che rende questo invio diverso da quello di U-07 agli occhi della
    chiave del doppio invio.
  */
  const ricevutaRinnovo = await iscrizioni.submitRenewalForm(GENITORE.id, {
    athleteId: FIGLIO_1,
    publicSlug: MODULO.publicSlug,
    answers: { ...bozza.answers, f_cognome: "Rossi Bianchi" },
    files: [],
    respondentName: "Carla Collaudo",
    respondentEmail: "uat5-genitore@example.invalid",
  });

  const rigaRinnovo = await prisma.formSubmission.findUnique({
    where: { id: ricevutaRinnovo.submissionId },
  });
  prova(
    "U-08.2 il rinnovo entra in coda come rinnovo, e dichiara la stagione",
    ["renewal", "pending", "2026-27", GENITORE.id],
    [
      rigaRinnovo?.kind,
      rigaRinnovo?.status,
      rigaRinnovo?.season_id,
      rigaRinnovo?.submitted_by,
    ],
  );

  const atletiPrima = await prisma.athlete.count({
    where: { organization_id: CLUB_A },
  });

  const esito = await iscrizioni.decideFormSubmission(
    scopeStaff,
    ricevutaRinnovo.submissionId,
    { decision: "approve" },
  );

  const figlio = await prisma.athlete.findUnique({ where: { id: FIGLIO_1 } });
  prova(
    "U-08.3 l'approvazione aggiorna l'atleta e non ne crea un secondo",
    [atletiPrima, "Rossi Bianchi", []],
    [
      await prisma.athlete.count({ where: { organization_id: CLUB_A } }),
      figlio?.last_name ?? null,
      esito.issues || [],
    ],
    "il rinnovo cita l'atleta fra i soggetti, quindi l'approvazione aggiorna invece di creare",
  );

  const stagioni = await stagioniServizio.readClubSeasonState(CLUB_A);
  prova(
    "U-08.4 il riporto stagionale gestionale non e stato toccato",
    ["2026-27", 2],
    [stagioni.activeSeasonId, (stagioni.seasons || []).length],
  );
};

/* ======================= U-06bis — i consensi della famiglia ============= */

const uConsensi = async () => {
  console.log(`${NL}U-06bis — i consensi decisi dalla famiglia`);
  const scopeStaff = scope(CLUB_A, "staff", PROPRIETARIO_A.id);
  /*
    **Definire** un consenso e configurazione societaria e la fa la direzione;
    **registrare** una decisione la fa la segreteria. Sono due permessi diversi,
    ed e la ragione per cui qui servono due scope.
  */
  const scopeDirezione = scope(CLUB_A, "owner", PROPRIETARIO_A.id);

  const definizione = await consensi.createConsentDefinition(scopeDirezione, {
    key: "foto-uat5",
    title: "Pubblicazione fotografie",
    description: "Le foto delle partite sui canali della societa",
    required: false,
  });
  const definitionId = definizione.id || definizione.definition?.id;

  /*
    **Prima il testo, poi l'attivazione.** Un consenso non si attiva senza una
    versione pubblicata: raccoglierlo su una bozza vorrebbe dire raccoglierlo
    su un testo che il club non ha ancora deciso (ADR-0090).
  */
  await consensi.publishConsentVersion(scopeDirezione, definitionId, {
    title: "Informativa fotografie",
    bodyText: "Testo dell'informativa di collaudo, versione 1.",
  });
  await consensi.setConsentDefinitionStatus(scopeDirezione, definitionId, "active");

  const scopeGen = scopeFamiglia(CLUB_A);
  void scopeStaff;
  const esito = await consensi.recordConsentDecision(scopeGen, {
    definitionId,
    subjectKind: "athlete",
    subjectId: FIGLIO_1,
    status: "accepted",
    source: "subject",
    asSubject: { userId: GENITORE.id, athleteId: FIGLIO_1 },
  });

  prova("§13 la famiglia accetta un consenso da se", "accepted", esito.state.status);

  const riga = await prisma.consentRecord.findFirst({
    where: { organization_id: CLUB_A, subject_id: FIGLIO_1 },
    orderBy: { decided_at: "desc" },
  });
  prova(
    "§13 la sorgente distingue chi ha deciso",
    ["subject", GENITORE.id],
    [riga?.source, riga?.decided_by],
  );

  const revoca = await consensi.recordConsentDecision(scopeGen, {
    definitionId,
    subjectKind: "athlete",
    subjectId: FIGLIO_1,
    status: "revoked",
    source: "subject",
    asSubject: { userId: GENITORE.id, athleteId: FIGLIO_1 },
  });
  prova("§13 e la revoca funziona", "revoked", revoca.state.status);

  await respinta(
    "§13 dal contesto del figlio 1 non si decide per il figlio 2",
    () =>
      consensi.recordConsentDecision(scopeGen, {
        definitionId,
        subjectKind: "athlete",
        subjectId: FIGLIO_2,
        status: "accepted",
        source: "subject",
        asSubject: { userId: GENITORE.id, athleteId: FIGLIO_1 },
      }),
  );
};

/* --------------------------------------------------------------- il giro */

try {
  eventi = await import("../src/lib/server/events.ts");
  documenti = await import("../src/lib/server/document-requests.ts");
  appuntamenti = await import("../src/lib/server/appointments.ts");
  rsvpService = await import("../src/lib/server/rsvp.ts");
  consensi = await import("../src/lib/server/consents.ts");
  risorse = await import("../src/lib/server/resources.ts");
  moduli = await import("../src/lib/server/forms.ts");
  iscrizioni = await import("../src/lib/server/form-submissions.ts");
  iscrizioni2 = await import("../src/lib/server/enrollment-requests.ts");
  stagioniServizio = await import("../src/lib/server/seasons.ts");

  console.log(`${NL}Semina dei due club di collaudo...`);
  await semina();

  await u01();
  await u02();
  await u03();
  await u05();
  await u06();
  await u07();
  await u08();
  await u09();
  await u13();
  await u14();
  await uConsensi();

  const falliti = esiti.filter((e) => !e.ok);
  console.log(
    `${NL}${esiti.length - falliti.length}/${esiti.length} controlli passati.`,
  );
  if (falliti.length) {
    console.log(`${NL}FALLITI:`);
    for (const e of falliti) {
      console.log(
        `  ${e.titolo}${NL}    atteso  ${JSON.stringify(e.atteso)}${NL}    trovato ${JSON.stringify(e.trovato)}${e.nota ? `${NL}    nota    ${e.nota}` : ""}`,
      );
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `${NL}Collaudo interrotto:${NL}${String(error?.stack || error?.message).split(NL).slice(0, 25).join(NL)}`,
  );
  process.exitCode = 1;
} finally {
  await pulisci();
  await prisma.$disconnect();
}
