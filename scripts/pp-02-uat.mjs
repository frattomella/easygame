/**
 * **Il collaudo di PP-02, contro un database vero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-02-uat.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Per la stessa ragione di `pp-01-uat.mjs`: i quattromilaseicento test erano
 * verdi mentre l'area famiglia mostrava «Nessuna stagione attiva» a un club che
 * ne ha una, e la CTA del pagamento si spegneva senza dire perche. Le sonde
 * della Wave 6 misuravano il **dominio**, e il dominio era giusto: il difetto
 * stava fra il dominio e la persona.
 *
 * PP-02 aggiunge una domanda che PP-01 non faceva, ed e la domanda che
 * distingue l'area famiglia da ogni altra: **cio che vede questa famiglia e
 * solo suo?** Percio qui gli attori sono due — due genitori, tre figli, un
 * club solo — e per ogni cosa che il primo genitore legge c'e una prova che il
 * secondo non la legge.
 *
 * ## L'ambiente
 *
 * Un club, due sedi, tre categorie, una stagione attiva. **Due famiglie nello
 * stesso club**, che e la configurazione su cui un errore di perimetro si vede
 * — due club diversi si separano gia da soli, per `organization_id`.
 *
 *   * Anna, genitore, due figli:
 *       - Marco, **due categorie su due sedi diverse** (§B),
 *       - Giulia, una categoria, **non piu iscritta** (§A: uno stato che la
 *         schermata di scelta deve dichiarare prima di entrarci).
 *   * Bruno, genitore, un figlio: Luca. Stesso club, altra famiglia.
 *   * Carla, **tutore senza tessera di club**: il legame e solo la riga in
 *     `athletes.data.guardians`. E il caso che nessuna sonda aveva mai posto.
 *
 * Piu una struttura **non prenotabile** con una tariffa a zero (§L), rate
 * aperte e saldate (§D), ricevute (§E), certificati (§F), richieste
 * documentali (§G), un modulo pubblicato (§J) e uno slot di segreteria (§K).
 *
 * ## La regola di questo file
 *
 * **La sonda misura, non corregge.** Dove trova un difetto lo dichiara `FAIL`
 * con il valore osservato accanto. Il club viene cancellato in `finally`, e la
 * semina comincia cancellando i residui di un'esecuzione interrotta.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();

/** L'import di un file `.ts` per percorso assoluto: le cartelle `[id]` non sono URL. */
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

/* ----------------------------------------------------------- il verdetto */

const esiti = [];

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

/** Una chiamata che deve fallire, e **il modo** in cui deve fallire. */
const respinta = async (titolo, azione, atteso) => {
  try {
    await azione();
    prova(titolo, "respinta", "riuscita");
  } catch (errore) {
    const messaggio = String(errore?.message || errore);
    prova(
      titolo,
      "respinta",
      atteso.test(messaggio) ? "respinta" : "respinta-altro",
      messaggio.slice(0, 200),
    );
  }
};

/* ------------------------------------------------------- gli attori ----- */

const CLUB = randomUUID();
const ALTRO_CLUB = randomUUID();
const SEDE_1 = "sede-pp02-nord";
const SEDE_2 = "sede-pp02-sud";
const CAT_A = "cat-pp02-u12";
const CAT_B = "cat-pp02-u15";
const CAT_C = "cat-pp02-prima";
const STRUTTURA_APERTA = "struttura-pp02-aperta";
const STRUTTURA_CHIUSA = "struttura-pp02-chiusa";
const CAMPO_APERTO = "campo-pp02-aperto";
const CAMPO_CHIUSO = "campo-pp02-chiuso";

const MARCO = randomUUID();
const GIULIA = randomUUID();
const LUCA = randomUUID();
const NINA = randomUUID();

let ANNA = null;
let BRUNO = null;
let CARLA = null;
let PRESIDENTE = null;

let cruscotto;

const utente = async (email, nome, verificata = true) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Collaudo",
      password_hash: "$2b$10$pp02",
      role: "user",
      email_verified_at: verificata ? new Date() : null,
      updated_at: new Date(),
    },
  });
};

const tutore = (utenteRiga, relazione = "Genitore") => ({
  id: `guardian-${utenteRiga.id}`,
  name: utenteRiga.first_name,
  surname: utenteRiga.last_name,
  relationship: relazione,
  email: utenteRiga.email,
  linkedUserId: utenteRiga.id,
});

/**
 * **Il tutore conosciuto solo per indirizzo di contatto.**
 *
 * Nessun `linkedUserId`: c'e solo l'indirizzo che la segreteria ha scritto
 * sulla scheda. E il **confine dichiarato** di PP-02: un indirizzo scritto a
 * mano vale come legame solo dove quella persona ha gia una tessera, perche una
 * lettera sbagliata su un dominio diffuso e l'indirizzo verificato di un'altra
 * persona reale.
 */
const tutorePerEmail = (utenteRiga, relazione = "Genitore") => ({
  id: `guardian-email-${utenteRiga.id}`,
  name: utenteRiga.first_name,
  surname: utenteRiga.last_name,
  relationship: relazione,
  email: utenteRiga.email,
});

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp02-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (!ids.length) return;
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: ids } } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

const semina = async () => {
  await pulisciResidui();

  PRESIDENTE = await utente("pp02-presidente@example.invalid", "Paola");
  ANNA = await utente("pp02-anna@example.invalid", "Anna");
  BRUNO = await utente("pp02-bruno@example.invalid", "Bruno");
  CARLA = await utente("pp02-carla@example.invalid", "Carla");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp02-${Date.now()}`,
      name: "ASD Collaudo PP-02",
      creator_id: PRESIDENTE.id,
      settings: {
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
      },
      categories: [
        { id: CAT_A, name: "Under 12" },
        { id: CAT_B, name: "Under 15" },
        { id: CAT_C, name: "Prima squadra" },
      ],
      club_sites: [
        { id: SEDE_1, name: "Sede Nord", active: true },
        { id: SEDE_2, name: "Sede Sud", active: true },
      ],
      /*
        Due strutture: una aperta alle famiglie con una tariffa vera, e una
        **chiusa** con una tariffa a zero. E la coppia su cui §L si misura: il
        difetto segnalato dice che la seconda compare come prenotabile a zero
        euro.
      */
      structures: [
        {
          id: STRUTTURA_APERTA,
          name: "Palazzetto",
          siteId: SEDE_1,
          isVisibleToMembers: true,
          isBookableByMembers: true,
          fields: [
            {
              id: CAMPO_APERTO,
              name: "Campo A",
              isVisible: true,
              isBookable: true,
              /* Lunedi e martedi, 18:00-20:00 nel fuso del club. */
              availability: {
                Lun: [{ start: "18:00", end: "20:00" }],
                Mar: [{ start: "18:00", end: "20:00" }],
              },
              pricing: [{ id: "p1", durationMinutes: 60, price: 25 }],
            },
          ],
        },
        {
          id: STRUTTURA_CHIUSA,
          name: "Campo esterno",
          siteId: SEDE_2,
          isVisibleToMembers: true,
          isBookableByMembers: false,
          fields: [
            {
              id: CAMPO_CHIUSO,
              name: "Campo B",
              isVisible: true,
              isBookable: true,
              pricing: [{ id: "p2", durationMinutes: 60, price: 0 }],
            },
          ],
        },
      ],
      trainers: [],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  /*
    Anna e Bruno hanno la **tessera** di genitore; Carla no, ed e voluto: il
    legame di un tutore puo esistere senza che nessuno gli abbia mai dato una
    riga in `organization_users`, e la domanda «lo vede?» non ha mai avuto una
    sonda.
  */
  await prisma.organizationUser.createMany({
    data: [ANNA, BRUNO].map((riga) => ({
      id: randomUUID(),
      organization_id: CLUB,
      user_id: riga.id,
      role: "parent",
      is_primary: true,
      updated_at: new Date(),
    })),
  });

  const nascita = (anno) => new Date(Date.UTC(anno, 4, 12));

  await prisma.athlete.createMany({
    data: [
      {
        id: MARCO,
        organization_id: CLUB,
        first_name: "Marco",
        last_name: "Rossi",
        birth_date: nascita(2013),
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        data: { guardians: [tutore(ANNA, "Madre")] },
        updated_at: new Date(),
      },
      {
        id: GIULIA,
        organization_id: CLUB,
        first_name: "Giulia",
        last_name: "Rossi",
        birth_date: nascita(2010),
        status: "inactive",
        category_id: CAT_C,
        category_name: "Prima squadra",
        data: { guardians: [tutore(ANNA, "Madre")] },
        updated_at: new Date(),
      },
      {
        id: LUCA,
        organization_id: CLUB,
        first_name: "Luca",
        last_name: "Bianchi",
        birth_date: nascita(2012),
        status: "active",
        category_id: CAT_B,
        category_name: "Under 15",
        data: { guardians: [tutore(BRUNO, "Padre")] },
        updated_at: new Date(),
      },
      {
        id: NINA,
        organization_id: CLUB,
        first_name: "Nina",
        last_name: "Verdi",
        birth_date: nascita(2014),
        status: "active",
        category_id: CAT_A,
        category_name: "Under 12",
        data: { guardians: [tutore(CARLA, "Zia")] },
        updated_at: new Date(),
      },
    ],
  });

  /* Marco in due categorie su due sedi: e la configurazione di §B. */
  await prisma.athleteCategoryMembership.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: MARCO,
        category_id: CAT_A,
        category_name: "Under 12",
        is_primary: true,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: MARCO,
        category_id: CAT_C,
        category_name: "Prima squadra",
        is_primary: false,
        site_id: SEDE_2,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: LUCA,
        category_id: CAT_B,
        category_name: "Under 15",
        is_primary: true,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
    ],
  });

  /* Rate: una aperta su Marco, una saldata; una aperta su Luca (l'altra famiglia). */
  await prisma.athletePayment.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: MARCO,
        description: "Quota iscrizione 2026/27",
        amount: 300,
        status: "pending",
        due_date: new Date(Date.UTC(2026, 9, 31)),
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: MARCO,
        description: "Acconto",
        amount: 100,
        status: "paid",
        due_date: new Date(Date.UTC(2026, 7, 31)),
        paid_at: new Date(Date.UTC(2026, 7, 20)),
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: LUCA,
        description: "Quota iscrizione 2026/27",
        amount: 300,
        status: "pending",
        due_date: new Date(Date.UTC(2026, 9, 31)),
        updated_at: new Date(),
      },
    ],
  });

  /* Una ricevuta per Marco: e cio su cui §E misura la proiezione chiusa. */
  await prisma.receipt.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: MARCO,
      receipt_number: "12/2026",
      issue_date: new Date(Date.UTC(2026, 7, 20)),
      amount: 100,
      description: "Acconto quota 2026/27",
      status: "issued",
      issued_by: PRESIDENTE.id,
      operation_type_code: "quota_associativa",
      data: { note_interne: "riscosso in contanti allo sportello" },
      updated_at: new Date(),
    },
  });

  /* Certificato di Marco: valido, con scadenza; Luca senza. */
  await prisma.medicalCertificate.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: MARCO,
      type: "agonistico",
      issue_date: new Date(Date.UTC(2026, 5, 1)),
      expiry_date: new Date(Date.UTC(2027, 5, 1)),
      updated_at: new Date(),
    },
  });

  cruscotto = await carica("src/lib/server/parent-dashboard.ts");
};

const pulisci = async () => {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: [CLUB, ALTRO_CLUB] } } })
    .catch(() => {});
  const tolti = await prisma.club
    .deleteMany({ where: { id: { in: [CLUB, ALTRO_CLUB] } } })
    .catch((errore) => {
      console.error(`Pulizia non riuscita: ${errore?.message}`);
      return { count: -1 };
    });
  if (tolti.count === -1) console.error(`Il club ${CLUB} e rimasto in archivio.`);
};

/* ==================================================================== */
/*  §A — di quale figlio parliamo                                       */
/* ==================================================================== */

const sezioneA = async () => {
  console.log("\n§A — la scelta del figlio\n");

  const figliAnna = await cruscotto.listParentChildren(ANNA.id);
  prova(
    "P-01 Anna vede entrambi i figli nella schermata di scelta",
    ["Rossi Giulia", "Rossi Marco"],
    figliAnna.map((f) => f.name).sort(),
  );

  prova(
    "P-02 la riga del figlio porta l'anno di nascita",
    [2010, 2013],
    figliAnna.map((f) => f.birthYear).sort(),
  );

  prova(
    "P-03 la riga dichiara lo stato di chi non e piu iscritto",
    "inactive",
    figliAnna.find((f) => f.name === "Rossi Giulia")?.status,
  );

  const figliBruno = await cruscotto.listParentChildren(BRUNO.id);
  prova(
    "P-04 Bruno vede il proprio figlio e nessun altro",
    ["Bianchi Luca"],
    figliBruno.map((f) => f.name),
  );

  prova(
    "P-05 un tutore collegato ma senza tessera di club vede il proprio figlio",
    ["Verdi Nina"],
    (await cruscotto.listParentChildren(CARLA.id)).map((f) => f.name),
    "il legame vive in athletes.data.guardians, non in organization_users",
  );

  prova(
    "P-05b e apre davvero il cruscotto, non solo l'elenco",
    NINA,
    (await cruscotto.getParentDashboardData(CARLA.id, NINA))?.athlete?.id,
  );

  prova(
    "P-05c ma non raggiunge gli altri atleti dello stesso club",
    false,
    await cruscotto.canParentAccessAthlete(CARLA.id, MARCO),
  );

  /*
    Il confine dichiarato, misurato contro il database vero: un indirizzo di
    contatto scritto sulla scheda di un club **estraneo** non apre niente. E la
    proprieta che la Wave 5 presidia per nome, e PP-02 la conferma invece di
    allargarla di nascosto.
  */
  const SARA = randomUUID();
  await prisma.club.create({
    data: {
      id: ALTRO_CLUB,
      slug: `pp02-altro-${Date.now()}`,
      name: "ASD Estranea PP-02",
      creator_id: PRESIDENTE.id,
      updated_at: new Date(),
    },
  });
  await prisma.athlete.create({
    data: {
      id: SARA,
      organization_id: ALTRO_CLUB,
      first_name: "Sara",
      last_name: "Neri",
      status: "active",
      data: { guardians: [tutorePerEmail(CARLA, "Zia")] },
      updated_at: new Date(),
    },
  });
  prova(
    "P-05d un indirizzo di contatto, in un club estraneo, non e un legame",
    false,
    await cruscotto.canParentAccessAthlete(CARLA.id, SARA),
    "l'indirizzo lo scrive la segreteria a mano, non la persona",
  );

  prova(
    "P-06 Anna non raggiunge il figlio dell'altra famiglia",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, LUCA),
  );

  prova(
    "P-07 un identificativo sconosciuto non ricade sul primo figlio",
    null,
    await cruscotto.getParentDashboardData(ANNA.id, randomUUID()),
  );

  prova(
    "P-08 un identificativo malformato non ricade sul primo figlio",
    null,
    await cruscotto.getParentDashboardData(ANNA.id, "pippo"),
    "era il ripiego !UUID_PATTERN.test(...) ? linkedAthletes[0] : null",
  );

  prova(
    "P-09 l'atleta dell'altra famiglia non apre il cruscotto",
    null,
    await cruscotto.getParentDashboardData(ANNA.id, LUCA),
  );

  const perClub = await cruscotto.getParentDashboardData(ANNA.id, CLUB);
  prova(
    "P-10 la forma storica /parent-view/<idClub> continua a risolvere",
    true,
    Boolean(perClub?.athlete?.id),
  );

  const marco = await cruscotto.getParentDashboardData(ANNA.id, MARCO);
  prova(
    "P-11 il cruscotto elenca i figli collegati, per il cambio figlio",
    2,
    marco?.athlete?.linkedAthletes?.length,
  );

  prova(
    "P-12 la scheda del figlio porta la foto per il guscio",
    true,
    Object.prototype.hasOwnProperty.call(marco?.athlete || {}, "avatar_url"),
  );
};

/* ==================================================================== */
/*  §B — le categorie, tutte, con la loro sede                          */
/* ==================================================================== */

const sezioneB = async () => {
  console.log("\n§B — le appartenenze multiple\n");

  const marco = await cruscotto.getParentDashboardData(ANNA.id, MARCO);

  prova(
    "P-20 il figlio in due categorie ne mostra due",
    ["Prima squadra", "Under 12"],
    (marco.athlete.categories || []).map((c) => c.name).sort(),
  );

  prova(
    "P-21 ogni appartenenza porta il nome della sede, non l'identificativo",
    ["Sede Nord", "Sede Sud"],
    (marco.athlete.categories || []).map((c) => c.siteName).sort(),
  );

  prova(
    "P-22 la primaria e dichiarata, non dedotta dall'ordine",
    "Under 12",
    (marco.athlete.categories || []).find((c) => c.isPrimary)?.name,
  );

  const figli = await cruscotto.listParentChildren(ANNA.id);
  prova(
    "P-23 anche la schermata di scelta porta tutte le categorie",
    2,
    figli.find((f) => f.name === "Rossi Marco")?.categories?.length,
  );

  prova(
    "P-24 e la sede accanto a ognuna",
    ["Sede Nord", "Sede Sud"],
    (figli.find((f) => f.name === "Rossi Marco")?.categories || [])
      .map((c) => c.siteName)
      .sort(),
  );

  prova(
    "P-25 un figlio in una sola categoria non ne inventa una seconda",
    1,
    (await cruscotto.getParentDashboardData(BRUNO.id, LUCA)).athlete.categories
      ?.length,
  );
};

/* ==================================================================== */
/*  §C — la stagione attiva                                             */
/* ==================================================================== */

const sezioneC = async () => {
  console.log("\n§C — la stagione attiva\n");

  const marco = await cruscotto.getParentDashboardData(ANNA.id, MARCO);

  prova(
    "P-30 il payload della famiglia porta l'etichetta della stagione attiva",
    "2026/27",
    marco.club.activeSeasonLabel,
  );

  prova(
    "P-31 e il suo identificativo",
    "2026-27",
    marco.club.activeSeasonId,
  );

  prova(
    "P-32 la stagione archiviata non viene scambiata per quella attiva",
    false,
    marco.club.activeSeasonLabel === "2025/26",
  );

  prova(
    "P-33 anche un tutore senza tessera legge la stagione",
    "2026/27",
    (await cruscotto.getParentDashboardData(CARLA.id, NINA)).club
      .activeSeasonLabel,
    "e il caso in cui il localStorage non e mai stato scritto da nessuno",
  );

  prova(
    "P-34 `settings` non esce dal server insieme alla stagione",
    false,
    Object.prototype.hasOwnProperty.call(marco.club, "settings"),
  );
};

/* ==================================================================== */
/*  §K — la segreteria: come riceve il club                             */
/* ==================================================================== */

const sezioneK = async () => {
  console.log("\n§K — la configurazione degli appuntamenti\n");

  const appuntamenti = await carica("src/lib/server/appointments.ts");
  const scopeClub = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  prova(
    "P-100 un club che non ha configurato niente riceve comunque",
    true,
    (await appuntamenti.readAppointmentsConfig(CLUB)).familyBookingEnabled,
    "chi non ha mai avuto un interruttore non puo aver espresso una scelta",
  );

  await appuntamenti.saveAppointmentsConfig(scopeClub, {
    familyBookingEnabled: true,
    types: [
      { name: "Colloquio con la segreteria", durationMinutes: 30 },
      { name: "Convocazione", bookable: false },
    ],
  });

  const config = await appuntamenti.readAppointmentsConfig(CLUB);
  prova(
    "P-101 i motivi configurati si rileggono",
    ["Colloquio con la segreteria", "Convocazione"],
    config.types.map((tipo) => tipo.name),
  );

  prova(
    "P-102 alla famiglia escono solo quelli prenotabili",
    ["Colloquio con la segreteria"],
    (
      await cruscotto.getParentDashboardData(ANNA.id, MARCO)
    ).appointments.config.types.map((tipo) => tipo.name),
  );

  /* Un genitore non configura come riceve il club. */
  await respinta(
    "P-103 un genitore non puo scrivere la configurazione",
    () =>
      appuntamenti.saveAppointmentsConfig(
        {
          userId: ANNA.id,
          activeOrganizationId: CLUB,
          activeRole: "parent",
          activeMembershipId: null,
          allowedOrganizationIds: [CLUB],
          accessScopes: [],
        },
        { familyBookingEnabled: false, types: [] },
      ),
    /Accesso negato/,
  );

  const contesto = await appuntamenti.resolveFamilyAppointmentContext(
    ANNA.id,
    MARCO,
  );

  await respinta(
    "P-104 con i motivi configurati non si manda piu un testo libero",
    () =>
      appuntamenti.requestFamilyAppointment(contesto, {
        reason: "info",
        date: "2027-05-03",
        time: "10:00",
      }),
    /Scegli il motivo/,
  );

  await respinta(
    "P-105 un motivo che il club tiene per se non e prenotabile",
    () =>
      appuntamenti.requestFamilyAppointment(contesto, {
        typeId: config.types.find((tipo) => !tipo.bookable)?.id,
        date: "2027-05-03",
        time: "10:00",
      }),
    /non e disponibile/,
  );

  await appuntamenti.saveAppointmentsConfig(scopeClub, {
    familyBookingEnabled: false,
    types: config.types,
  });

  await respinta(
    "P-106 con le richieste chiuse la famiglia riceve un rifiuto che lo dice",
    () =>
      appuntamenti.requestFamilyAppointment(contesto, {
        typeId: config.types[0].id,
        date: "2027-05-03",
        time: "10:00",
      }),
    /non riceve richieste di appuntamento online/,
  );

  prova(
    "P-107 e la famiglia lo sa prima di compilare",
    false,
    (await cruscotto.getParentDashboardData(ANNA.id, MARCO)).appointments.config
      .familyBookingEnabled,
  );

  prova(
    "P-108 la configurazione non ha cancellato le stagioni del club",
    "2026/27",
    (await cruscotto.getParentDashboardData(ANNA.id, MARCO)).club
      .activeSeasonLabel,
    "si riscrive una chiave di settings, non l'oggetto",
  );
};

/* ==================================================================== */
/*  §M — l'audit ostile: cio che una famiglia non deve raggiungere       */
/* ==================================================================== */

/**
 * **La regola di questa sezione: ogni prova ha due meta.**
 *
 * Che la propria famiglia arrivi dove deve, e che l'altra **non** ci arrivi.
 * Una prova sola delle due non dice niente: un perimetro che nega tutto passa
 * la seconda meta e rompe il prodotto, e uno che concede tutto passa la prima.
 *
 * Gli attori sono nello **stesso club**, che e la configurazione su cui un
 * errore di perimetro si vede: due club diversi si separano gia da soli per
 * `organization_id`, e misurare li vorrebbe dire misurare Prisma.
 */
const sezioneM = async () => {
  console.log("\n§M — l'audit ostile\n");

  const auth = await carica("src/lib/server/auth.ts");
  const sessioneAnna = await auth.createSessionForUser(ANNA);
  const sessioneBruno = await auth.createSessionForUser(BRUNO);

  const chiama = async (modulo, metodo, url, params, token, corpo) => {
    const init = {
      method: metodo,
      headers: { authorization: `Bearer ${token}` },
    };
    if (corpo !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(corpo);
    }
    const risposta = await modulo[metodo](
      new Request(`http://collaudo.invalid${url}`, init),
      { params },
    );
    return {
      stato: risposta.status,
      corpo: await risposta.json().catch(() => ({})),
    };
  };

  /* ------------------------------------------------ ricevute e pagamenti */

  const documenti = await carica("src/app/api/v1/documents/[kind]/[id]/route.ts");
  const ricevutaDiMarco = await prisma.receipt.findFirst({
    where: { organization_id: CLUB, athlete_id: MARCO },
    select: { id: true },
  });

  prova(
    "M-01 la famiglia scarica la ricevuta del proprio figlio",
    200,
    (
      await chiama(
        documenti,
        "GET",
        `/api/v1/documents/receipt/${ricevutaDiMarco.id}`,
        { kind: "receipt", id: ricevutaDiMarco.id },
        sessioneAnna.access_token,
      )
    ).stato,
  );

  prova(
    "M-02 l'altra famiglia dello stesso club no",
    403,
    (
      await chiama(
        documenti,
        "GET",
        `/api/v1/documents/receipt/${ricevutaDiMarco.id}`,
        { kind: "receipt", id: ricevutaDiMarco.id },
        sessioneBruno.access_token,
      )
    ).stato,
  );

  const checkout = await carica(
    "src/app/api/parent-dashboard/[athleteId]/checkout/route.ts",
  );
  const rataDiLuca = await prisma.athletePayment.findFirst({
    where: { organization_id: CLUB, athlete_id: LUCA, status: "pending" },
    select: { id: true },
  });

  const pagamentoAltrui = await chiama(
    checkout,
    "POST",
    `/api/parent-dashboard/${MARCO}/checkout`,
    { athleteId: MARCO },
    sessioneAnna.access_token,
    { payment_id: rataDiLuca.id },
  );
  prova(
    "M-03 non si apre il checkout su una rata di un'altra famiglia",
    404,
    pagamentoAltrui.stato,
    pagamentoAltrui.corpo?.error?.message,
  );

  const cruscottoRotta = await carica(
    "src/app/api/parent-dashboard/[athleteId]/route.ts",
  );
  prova(
    "M-04 il cruscotto di un figlio altrui e negato",
    403,
    (
      await chiama(
        cruscottoRotta,
        "GET",
        `/api/parent-dashboard/${LUCA}`,
        { athleteId: LUCA },
        sessioneAnna.access_token,
      )
    ).stato,
  );

  /* -------------------------------------------------------- i documenti */

  const fascicolo = await carica(
    "src/app/api/parent-dashboard/[athleteId]/documents/route.ts",
  );
  prova(
    "M-05 il fascicolo di un figlio altrui e negato",
    403,
    (
      await chiama(
        fascicolo,
        "GET",
        `/api/parent-dashboard/${LUCA}/documents`,
        { athleteId: LUCA },
        sessioneAnna.access_token,
      )
    ).stato,
  );

  /* ---------------------------------------------------- i moduli online */

  const invii = await carica("src/lib/server/form-submissions.ts");
  await respinta(
    "M-06 non si compila un modulo per il figlio di un'altra famiglia",
    () =>
      invii.submitRenewalForm(ANNA.id, {
        athleteId: LUCA,
        publicSlug: MODULO_LIBERO.slug,
        answers: { f_nome: "Luca" },
        files: [],
        respondentEmail: ANNA.email,
      }),
    /Accesso negato|non disponibile|non trovat/i,
  );

  const pratiche = await carica("src/lib/server/enrollment-requests.ts");
  await respinta(
    "M-07 ne si leggono le sue pratiche",
    () => pratiche.listFamilyEnrollmentRequests(ANNA.id, LUCA),
    /Accesso negato/i,
  );

  await respinta(
    "M-08 ne i suoi moduli online",
    () => pratiche.listFamilyOnlineForms(ANNA.id, LUCA),
    /Accesso negato/i,
  );

  /* ---------------------------------------------------- gli appuntamenti */

  const appuntamenti = await carica("src/lib/server/appointments.ts");
  await appuntamenti.saveAppointmentsConfig(
    {
      userId: PRESIDENTE.id,
      activeOrganizationId: CLUB,
      activeRole: "owner",
      activeMembershipId: null,
      allowedOrganizationIds: [CLUB],
      accessScopes: [],
    },
    { familyBookingEnabled: true, types: [] },
  );

  const contestoBruno = await appuntamenti.resolveFamilyAppointmentContext(
    BRUNO.id,
    LUCA,
  );
  const rigaDiBruno = await prisma.appointment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      starts_at: new Date(Date.UTC(2027, 5, 1, 9, 0)),
      ends_at: new Date(Date.UTC(2027, 5, 1, 9, 30)),
      status: "requested",
      athlete_id: LUCA,
      requested_by_user_id: BRUNO.id,
      reason: "Colloquio",
      version: 1,
      updated_at: new Date(),
    },
  });

  const contestoAnna = await appuntamenti.resolveFamilyAppointmentContext(
    ANNA.id,
    MARCO,
  );

  await respinta(
    "M-09 non si annulla l'appuntamento di un'altra famiglia",
    () => appuntamenti.cancelFamilyAppointment(contestoAnna, rigaDiBruno.id),
    /non trovata|Accesso negato/i,
  );

  await respinta(
    "M-10 ne si riprogramma",
    () =>
      appuntamenti.rescheduleFamilyAppointment(contestoAnna, rigaDiBruno.id, {
        date: "2027-06-02",
        time: "10:00",
      }),
    /non trovata|Accesso negato/i,
  );

  prova("M-11 e Bruno il proprio contesto lo trova", true, Boolean(contestoBruno));

  /* ------------------------------------------------- il tutore revocato */

  /*
    Il caso che il mandato chiama «stale relationship»: il legame si toglie e
    l'accesso deve cadere **alla richiesta successiva**, senza aspettare che
    una sessione scada. Non c'e nessuna cache del legame nel token: ogni rotta
    lo rilegge, ed e questa prova a dirlo.
  */
  const primaDellaRevoca = await cruscotto.canParentAccessAthlete(CARLA.id, NINA);
  await prisma.athlete.update({
    where: { id: NINA },
    data: { data: { guardians: [] } },
  });

  prova(
    "M-12 un tutore scollegato perde l'accesso alla richiesta successiva",
    [true, false],
    [primaDellaRevoca, await cruscotto.canParentAccessAthlete(CARLA.id, NINA)],
  );

  prova(
    "M-13 e non gli resta nemmeno l'elenco",
    [],
    await cruscotto.listParentChildren(CARLA.id),
  );

  /* --------------------------------------- le API generiche del club */

  const ruoli = await carica("src/lib/access-roles.ts");
  prova(
    "M-14 il ruolo genitore non apre nessuna risorsa generica del club",
    [],
    [
      "athletes",
      "clubs",
      "trainers",
      "payment_plans",
      "staff_members",
      "members",
    ].filter(
      (risorsa) =>
        ruoli.canAccessClubResource("parent", risorsa, "read") ||
        ruoli.canAccessClubResource("parent", risorsa, "update"),
    ),
  );
};

/* ==================================================================== */
/*  §O — i due residui di PP-01                                         */
/* ==================================================================== */

/**
 * **Il trasporto verso i route handler veri.**
 *
 * `cleanupOrphanScheduledTrainings` e il dominio che gira **nel browser**:
 * parla con `/api/v1/...` attraverso `src/lib/api/client.ts`. Il difetto che
 * §O chiude sta esattamente li — una scrittura che il server rifiuta — e
 * chiamare l'API da sola non lo eseguirebbe mai. Qui la rete c'e, ed e vera
 * fino alla riga: c'e solo un cavo piu corto. Stessa forma di
 * `scripts/pp-01-uat.mjs`.
 */
let SESSIONE = null;
let rotte = null;

const preparaTrasporto = async () => {
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    eventi: await carica("src/app/api/v1/events/route.ts"),
    evento: await carica("src/app/api/v1/events/[id]/route.ts"),
  };

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input), "http://collaudo.invalid");
    const metodo = String(init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
    headers.set("x-active-club-id", CLUB);
    headers.set("x-active-access-role", "owner");
    const richiesta = new Request(url.toString(), { ...init, headers });

    const segmenti = url.pathname.replace(/^\/api\/v1\//, "").split("/");

    if (segmenti[0] === "events") {
      const modulo = segmenti.length === 1 ? rotte.eventi : rotte.evento;
      const fn = modulo[metodo];
      if (!fn) throw new Error(`Nessun handler ${metodo} per ${url.pathname}`);
      return segmenti.length === 1
        ? fn(richiesta)
        : fn(richiesta, { params: { id: segmenti[1] } });
    }

    if (segmenti.length === 1) {
      const fn = rotte.elenco[metodo];
      if (!fn) throw new Error(`Nessun handler ${metodo} per /${segmenti[0]}`);
      return fn(richiesta, { params: { resource: segmenti[0] } });
    }

    const fn = rotte.riga[metodo];
    if (!fn) throw new Error(`Nessun handler ${metodo} per ${url.pathname}`);
    return fn(richiesta, { params: { resource: segmenti[0], id: segmenti[1] } });
  };
};

const sezioneO = async () => {
  console.log("\n§O — i residui di PP-01\n");

  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(PRESIDENTE);
  SESSIONE = sessione.access_token;
  await preparaTrasporto();

  const eventi = await carica("src/lib/server/events.ts");
  const scope = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /*
    Due allenamenti sulla categoria che verra tolta: uno pulito, uno con una
    presenza gia registrata. La regola di ADR-0098 dice che il secondo non si
    cancella — si annulla — e la pulizia deve **dirlo**, non contarlo fra i
    rimossi.
  */
  const pulito = await eventi.createClubEvent(scope, "training", {
    id: `pp02-pulito-${Date.now()}`,
    title: "Da ripulire",
    date: "2027-03-01",
    time: "18:00",
    endTime: "19:30",
    categories: [CAT_B],
    categoryId: CAT_B,
  });
  const conStoria = await eventi.createClubEvent(scope, "training", {
    id: `pp02-storia-${Date.now()}`,
    title: "Con presenze",
    date: "2027-03-02",
    time: "18:00",
    endTime: "19:30",
    categories: [CAT_B],
    categoryId: CAT_B,
  });

  await prisma.clubEventParticipant.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      event_id: conStoria.eventId || conStoria.id,
      athlete_id: LUCA,
      status: "present",
      updated_at: new Date(),
    },
  });

  const dominioClient = await carica("src/lib/simplified-db.ts");
  const esito = await dominioClient.cleanupOrphanScheduledTrainings(CLUB, [
    CAT_B,
  ]);

  prova(
    "P-90 la pulizia toglie l'allenamento in programma senza storia",
    1,
    esito.removedUpcomingTrainings.length,
    "prima scriveva clubs.trainings e il server rispondeva 403: falliva sempre",
  );

  prova(
    "P-91 e dichiara quello che non ha potuto togliere",
    1,
    esito.keptWithHistory.length,
  );

  prova(
    "P-92 l'evento senza storia e sparito davvero dall'archivio",
    null,
    await prisma.clubEvent.findUnique({
      where: { id: pulito.eventId || pulito.id },
      select: { id: true },
    }),
  );

  prova(
    "P-93 l'evento con le presenze e ancora li",
    true,
    Boolean(
      await prisma.clubEvent.findUnique({
        where: { id: conStoria.eventId || conStoria.id },
        select: { id: true },
      }),
    ),
  );

  /* ---------------------------------------- PP01-D2, il controllo di versione */

  const evento = await eventi.createClubEvent(scope, "training", {
    id: `pp02-versione-${Date.now()}`,
    title: "Versione",
    date: "2027-04-01",
    time: "18:00",
    endTime: "19:30",
    categories: [CAT_A],
    categoryId: CAT_A,
  });
  const id = evento.eventId || evento.id;

  prova(
    "P-94 la proiezione storica porta la versione, che la schermata deve rimandare",
    1,
    evento.version,
  );

  await eventi.updateClubEvent(scope, id, { title: "Cambiato da un altro" });

  await respinta(
    "P-95 salvare su una versione vecchia viene rifiutato",
    () =>
      eventi.updateClubEvent(
        scope,
        id,
        { title: "Salvataggio in ritardo" },
        {},
        { expectedVersion: 1 },
      ),
    /modificato da qualcun altro/i,
  );

  const riletto = await prisma.clubEvent.findUnique({
    where: { id },
    select: { title: true, version: true },
  });
  prova(
    "P-96 e il salvataggio in ritardo non ha scritto niente",
    "Cambiato da un altro",
    riletto?.title,
  );
  prova("P-97 con la versione giusta invece passa", true, riletto?.version === 2);
};

/* ==================================================================== */
/*  §D e §E — il pagamento e le sue carte                               */
/* ==================================================================== */

const sezioneDE = async () => {
  console.log("\n§D — il pagamento online, e perche a volte non si puo\n");

  const marco = await cruscotto.getParentDashboardData(ANNA.id, MARCO);

  prova(
    "P-40 il payload dichiara lo stato del canale di incasso",
    true,
    typeof marco.payments.online?.available === "boolean",
  );

  /*
    Su un club che non ha nessun conto collegato — che e lo stato di ogni club
    appena creato — il canale deve risultare **spento con un motivo**, e non
    acceso: era il caso in cui il pulsante prometteva e l'errore arrivava dopo
    il clic.
  */
  prova(
    "P-41 senza conto collegato il canale e spento",
    false,
    marco.payments.online?.available,
  );

  prova(
    "P-42 e il motivo e una frase, non un codice",
    true,
    String(marco.payments.online?.message || "").length > 20,
    marco.payments.online?.message,
  );

  prova(
    "P-43 il motivo non nomina l'abbonamento della societa",
    false,
    /abbonament|piano Plus|conto di incasso/i.test(
      String(marco.payments.online?.message || ""),
    ),
    "e un fatto commerciale fra club e EasyGame, non della famiglia",
  );

  console.log("\n§E — le ricevute\n");

  prova(
    "P-50 la famiglia vede la propria ricevuta",
    1,
    marco.payments.receipts.length,
  );

  const ricevuta = marco.payments.receipts[0] || {};
  prova(
    "P-51 la ricevuta e un elenco chiuso di campi",
    [
      "amount",
      "athleteId",
      "athleteName",
      "description",
      "downloadPath",
      "id",
      "issueDate",
      "kind",
      "number",
      "status",
      "statusLabel",
    ],
    Object.keys(ricevuta).sort(),
  );

  prova(
    "P-52 nessun campo interno del club raggiunge la famiglia",
    [],
    [
      "issued_by",
      "cancelled_by",
      "operation_type_code",
      "snapshot",
      "transaction_id",
      "invoice_id",
      "payment_id",
      "data",
      "organization_id",
    ].filter((campo) =>
      Object.prototype.hasOwnProperty.call(ricevuta, campo),
    ),
  );

  prova(
    "P-53 la riga dice di quale figlio parla",
    "Rossi Marco",
    ricevuta.athleteName,
  );

  prova(
    "P-54 e ha una strada per essere aperta",
    true,
    String(ricevuta.downloadPath || "").startsWith("/api/v1/documents/receipt/"),
  );

  prova(
    "P-55 la ricevuta dell'altra famiglia non entra in questo elenco",
    0,
    (await cruscotto.getParentDashboardData(BRUNO.id, LUCA)).payments.receipts
      .length,
  );
};

/* ==================================================================== */
/*  §G e §J — i moduli online, e quello che si compila una volta sola    */
/* ==================================================================== */

let MODULO_LIBERO = null;
let MODULO_UNICO = null;
let MODULO_CHIUSO = null;

const seminaModuli = async () => {
  const moduli = await carica("src/lib/server/forms.ts");
  const modello = await carica("src/lib/forms/model.ts");

  const pubblica = async (titolo, impostazioni) => {
    const templateId = randomUUID();
    const versionId = randomUUID();
    const slug = `pp02-${titolo.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const schema = modello.normalizeFormSchema({
      title: titolo,
      description: "",
      fields: [
        {
          id: "f_nome",
          type: "short_text",
          label: "Nome",
          required: true,
        },
      ],
      settings: impostazioni,
    });

    await prisma.formTemplate.create({
      data: {
        id: templateId,
        organization_id: CLUB,
        title: titolo,
        status: "published",
        public_slug: slug,
        public_enabled: true,
        published_version: 1,
        published_at: new Date(),
        draft: schema,
        updated_at: new Date(),
      },
    });
    await prisma.formTemplateVersion.create({
      data: {
        id: versionId,
        organization_id: CLUB,
        template_id: templateId,
        version: 1,
        schema_json: schema,
        published_at: new Date(),
      },
    });

    return { templateId, versionId, slug };
  };

  MODULO_LIBERO = await pubblica("Questionario", {});
  MODULO_UNICO = await pubblica("Iscrizione", { singleSubmission: true });
  MODULO_CHIUSO = await pubblica("Torneo di Natale", {
    closeAt: "2026-01-01",
  });

  return moduli;
};

const sezioneGJ = async () => {
  console.log("\n§G — i moduli online del fascicolo\n");

  await seminaModuli();
  const pratiche = await carica("src/lib/server/enrollment-requests.ts");

  const elenco = await pratiche.listFamilyOnlineForms(ANNA.id, MARCO);
  const per = (titolo) => elenco.find((riga) => riga.title === titolo);

  prova(
    "P-60 la famiglia vede i moduli pubblicati dal club",
    ["Iscrizione", "Questionario", "Torneo di Natale"],
    elenco.map((riga) => riga.title).sort(),
  );

  prova(
    "P-61 uno mai compilato e da compilare",
    "Da compilare",
    per("Questionario")?.stateLabel,
  );

  prova(
    "P-62 uno chiuso e scaduto, e non si puo compilare",
    ["Scaduto", false],
    [per("Torneo di Natale")?.stateLabel, per("Torneo di Natale")?.canSubmit],
  );

  prova(
    "P-63 la riga dice di quale figlio parla",
    "Marco Rossi",
    per("Iscrizione")?.athleteName,
  );

  console.log("\n§J — il modulo che si compila una volta sola\n");

  const invii = await carica("src/lib/server/form-submissions.ts");

  const invia = (slug, atleta = MARCO, risposte = { f_nome: "Marco" }) =>
    invii.submitRenewalForm(ANNA.id, {
      athleteId: atleta,
      publicSlug: slug,
      answers: risposte,
      files: [],
      respondentEmail: ANNA.email,
    });

  const primo = await invia(MODULO_UNICO.slug);
  prova(
    "P-70 il primo invio passa",
    true,
    Boolean(primo?.submissionId),
  );

  await respinta(
    "P-71 il secondo invio dello stesso modulo viene rifiutato",
    () => invia(MODULO_UNICO.slug, MARCO, { f_nome: "Marco corretto" }),
    /gia stato compilato/i,
  );

  /*
    La deduplicazione a finestra resta e fa un mestiere diverso: quella difende
    dal gesto ripetuto, questa dalla compilazione ripetuta. Un modulo che non
    dichiara il vincolo si puo rimandare — e cio che serve per correggere un
    dato.
  */
  await invia(MODULO_LIBERO.slug);
  const secondoLibero = await invia(MODULO_LIBERO.slug, MARCO, {
    f_nome: "Marco Rossi",
  });
  prova(
    "P-72 un modulo senza il vincolo si puo rimandare",
    true,
    Boolean(secondoLibero?.submissionId),
  );

  /* Il vincolo e **per atleta**, non per club: il fratello non e bloccato. */
  const perGiulia = await invia(MODULO_UNICO.slug, GIULIA, { f_nome: "Giulia" });
  prova(
    "P-73 il vincolo e per atleta: il fratello puo compilare lo stesso modulo",
    true,
    Boolean(perGiulia?.submissionId),
  );

  const dopo = await pratiche.listFamilyOnlineForms(ANNA.id, MARCO);
  const dopoPer = (titolo) => dopo.find((riga) => riga.title === titolo);

  prova(
    "P-74 il fascicolo dichiara «Completato» e non offre di rifarlo",
    ["Completato", false],
    [dopoPer("Iscrizione")?.stateLabel, dopoPer("Iscrizione")?.canSubmit],
  );

  prova(
    "P-75 e per il modulo libero dice «Inviato», con la data",
    ["Inviato", true],
    [
      dopoPer("Questionario")?.stateLabel,
      Boolean(dopoPer("Questionario")?.completedAt),
    ],
  );

  prova(
    "P-76 i moduli dell'altra famiglia non contano su questo figlio",
    "Da compilare",
    (await pratiche.listFamilyOnlineForms(BRUNO.id, LUCA)).find(
      (riga) => riga.title === "Iscrizione",
    )?.stateLabel,
  );
};

/* ==================================================================== */
/*  §L — le strutture non prenotabili                                   */
/* ==================================================================== */

const sezioneL = async () => {
  console.log("\n§L — le strutture non prenotabili\n");

  const marco = await cruscotto.getParentDashboardData(ANNA.id, MARCO);
  const nomi = (marco.structures?.items || []).map((s) => s.name);

  prova(
    "P-80 la struttura aperta compare alla famiglia",
    true,
    nomi.includes("Palazzetto"),
  );

  prova(
    "P-81 la struttura con isBookableByMembers=false non compare",
    false,
    nomi.includes("Campo esterno"),
  );

  const tariffe = (marco.structures?.items || []).flatMap((s) =>
    (s.fields || []).flatMap((f) => (f.pricing || []).map((p) => p.price)),
  );
  prova(
    "P-82 nessuna tariffa a zero raggiunge la famiglia",
    [25],
    tariffe,
  );

  /* --------------------------------------------- la rotta, non la schermata */

  const rotta = await carica(
    "src/app/api/parent-dashboard/[athleteId]/structures/route.ts",
  );
  const auth = await carica("src/lib/server/auth.ts");
  const sessioneAnna = await auth.createSessionForUser(ANNA);

  const prenota = async (corpo) => {
    const risposta = await rotta.POST(
      new Request("http://collaudo.invalid/api/parent-dashboard/x/structures", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessioneAnna.access_token}`,
        },
        body: JSON.stringify(corpo),
      }),
      { params: { athleteId: MARCO } },
    );
    return { stato: risposta.status, corpo: await risposta.json() };
  };

  /* Lunedi 1 marzo 2027: la fascia dichiarata e 18:00-20:00. */
  const dentro = await prenota({
    structureId: STRUTTURA_APERTA,
    fieldId: CAMPO_APERTO,
    start: "2027-03-01T17:00:00.000Z",
    end: "2027-03-01T18:00:00.000Z",
  });
  prova(
    "P-83 dentro la fascia dichiarata la prenotazione passa",
    200,
    dentro.stato,
    dentro.corpo?.error?.message,
  );

  const fuori = await prenota({
    structureId: STRUTTURA_APERTA,
    fieldId: CAMPO_APERTO,
    start: "2027-03-02T01:00:00.000Z",
    end: "2027-03-02T02:00:00.000Z",
  });
  prova(
    "P-84 alle tre di notte il server rifiuta, e nomina le fasce",
    true,
    fuori.stato === 400 &&
      /Fasce aperte/.test(String(fuori.corpo?.error?.message || "")),
    fuori.corpo?.error?.message,
  );

  const chiusa = await prenota({
    structureId: STRUTTURA_CHIUSA,
    fieldId: CAMPO_CHIUSO,
    start: "2027-03-01T17:00:00.000Z",
    end: "2027-03-01T18:00:00.000Z",
  });
  prova(
    "P-85 la struttura non prenotabile e rifiutata dalla rotta, non solo nascosta",
    404,
    chiusa.stato,
    chiusa.corpo?.error?.message,
  );

  prova(
    "P-86 la prenotazione riuscita lascia una riga di audit",
    1,
    await prisma.auditLog.count({
      where: {
        organization_id: CLUB,
        action: "structure_booking.requested",
      },
    }),
  );

  prova(
    "P-87 e avvisa chi in segreteria puo vederla",
    true,
    (await prisma.notification.count({
      where: { organization_id: CLUB, type: "structure_booking" },
    })) > 0,
  );
};

/* ==================================================================== */

const main = async () => {
  console.log("PP-02 — collaudo contro il database di sviluppo");
  await semina();

  try {
    await sezioneA();
    await sezioneB();
    await sezioneC();
    await sezioneDE();
    await sezioneGJ();
    await sezioneL();
    await sezioneK();
    await sezioneO();
    await sezioneM();
  } finally {
    await pulisci();
    await prisma.$disconnect();
  }

  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\nEsito: ${passati}/${esiti.length}`);
  esiti
    .filter((e) => !e.ok)
    .forEach((e) => console.log(`  FAIL  ${e.titolo}`));
  process.exit(passati === esiti.length ? 0 : 1);
};

main().catch(async (errore) => {
  console.error(errore);
  await pulisci().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
