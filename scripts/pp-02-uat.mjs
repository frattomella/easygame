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

import fs from "node:fs";
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
/*  §R — cio che la revisione indipendente ha trovato                   */
/* ==================================================================== */

/**
 * **Le prove nate da una revisione, non da una segnalazione.**
 *
 * Un pacchetto che si dichiara chiuso e passato a una revisione ostile
 * indipendente. Ha trovato un High e otto Medium reali, tutti corretti; queste
 * sono le prove che li tengono chiusi, e sono qui e non fra le altre perche la
 * loro ragione e diversa: non riproducono un difetto segnalato da chi usa il
 * prodotto, ma uno che sarebbe arrivato a chi lo usa.
 */
const sezioneR = async () => {
  console.log("\n§R — le correzioni della revisione indipendente\n");

  const appuntamenti = await carica("src/lib/server/appointments.ts");
  const scopeClub = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  await appuntamenti.saveAppointmentsConfig(scopeClub, {
    familyBookingEnabled: true,
    types: [
      { name: "Colloquio con la segreteria" },
      { name: "Consegna documenti" },
    ],
  });

  const config = await appuntamenti.readAppointmentsConfig(CLUB);
  const primo = config.types[0];
  const secondo = config.types[1];

  const contesto = await appuntamenti.resolveFamilyAppointmentContext(
    ANNA.id,
    MARCO,
  );

  /*
    Una fascia vera in cui spostare: la famiglia sceglie **uno slot libero**,
    non una data qualunque, ed e il senso di tutta la lane 5E. Senza, la
    riprogrammazione fallirebbe per l'orario e non si misurerebbe il motivo.
  */
  await prisma.appointmentSlot.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      weekday: 5,
      start_time: "10:00",
      end_time: "12:00",
      duration_minutes: 30,
      active: true,
      updated_at: new Date(),
    },
  });

  /* Un appuntamento gia in agenda, che la famiglia vuole spostare. */
  const riga = await prisma.appointment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      starts_at: new Date(Date.UTC(2027, 6, 1, 9, 0)),
      ends_at: new Date(Date.UTC(2027, 6, 1, 9, 30)),
      status: "requested",
      athlete_id: MARCO,
      requested_by_user_id: ANNA.id,
      reason: primo.name,
      version: 1,
      updated_at: new Date(),
    },
  });

  /*
    **R1 (High). E si passa dalla ROTTA, non dal servizio.**

    La prima stesura di questa prova chiamava `rescheduleFamilyAppointment`
    direttamente, passandogli `typeId`. Passava — e intanto la rotta `PATCH`
    quel campo **non lo leggeva affatto**: il client lo mandava, il server lo
    buttava, e la scelta della famiglia non arrivava da nessuna parte. Il
    secondo round di revisione lo ha trovato leggendo la rotta.

    E la stessa lezione di tutto il pacchetto, per la terza volta: cio che era
    coperto era il vaglio, non la **strada** che ci arriva. Da qui in avanti
    questa prova percorre la strada.
  */
  const rottaAppuntamenti = await carica(
    "src/app/api/parent-dashboard/[athleteId]/appointments/route.ts",
  );
  const authR = await carica("src/lib/server/auth.ts");
  const sessioneR = await authR.createSessionForUser(ANNA);

  const riprogramma = async (id, corpo) => {
    const risposta = await rottaAppuntamenti.PATCH(
      new Request(
        `http://collaudo.invalid/api/parent-dashboard/${MARCO}/appointments`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${sessioneR.access_token}`,
          },
          body: JSON.stringify({ id, ...corpo }),
        },
      ),
      { params: { athleteId: MARCO } },
    );
    const corpoRisposta = await risposta.json().catch(() => ({}));
    return corpoRisposta?.data || { errore: corpoRisposta?.error?.message };
  };

  const spostato = await riprogramma(riga.id, {
    type_id: secondo.id,
    date: "2027-07-02",
    time: "10:00",
  });

  /*
    **E il testo libero non rientra dalla porta della riprogrammazione.**

    Con i motivi configurati resta una strada sola: un tipo prenotabile, oppure
    il motivo **che c'era gia**. Accettare un `reason` nuovo vorrebbe dire che
    si sposta l'orario e nel frattempo si scrive quello che si vuole.
  */
  const altraRiga = await prisma.appointment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      starts_at: new Date(Date.UTC(2027, 6, 8, 9, 0)),
      ends_at: new Date(Date.UTC(2027, 6, 8, 9, 30)),
      status: "requested",
      athlete_id: MARCO,
      requested_by_user_id: ANNA.id,
      reason: secondo.name,
      version: 1,
      updated_at: new Date(),
    },
  });

  const conTestoLibero = await riprogramma(altraRiga.id, {
    reason: "quello che mi pare",
    date: "2027-07-09",
    time: "11:00",
  });

  prova(
    "R-01b il testo libero non rientra dalla riprogrammazione",
    secondo.name,
    conTestoLibero?.errore
      ? `errore: ${conTestoLibero.errore}`
      : conTestoLibero?.reason,
    "resta il motivo che c'era: un tipo scelto, o quello di prima",
  );

  prova(
    "R-01 riprogrammando, il motivo scelto e quello che viene salvato",
    secondo.name,
    spostato?.errore ? `errore: ${spostato.errore}` : spostato?.reason,
  );

  /*
    **S2 (Medium).** L'interruttore non chiudeva la porta: la socchiudeva.
    Riprogrammare **crea una riga nuova** (ADR-0101), cioe e una richiesta.
  */
  await appuntamenti.saveAppointmentsConfig(scopeClub, {
    familyBookingEnabled: false,
    types: config.types,
  });

  const daSpostare = await prisma.appointment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      starts_at: new Date(Date.UTC(2027, 7, 1, 9, 0)),
      ends_at: new Date(Date.UTC(2027, 7, 1, 9, 30)),
      status: "requested",
      athlete_id: MARCO,
      requested_by_user_id: ANNA.id,
      reason: primo.name,
      version: 1,
      updated_at: new Date(),
    },
  });

  await respinta(
    "R-02 con le richieste chiuse non si riprogramma nemmeno",
    () =>
      appuntamenti.rescheduleFamilyAppointment(contesto, daSpostare.id, {
        typeId: primo.id,
        date: "2027-08-02",
        time: "10:00",
      }),
    /non riceve richieste di appuntamento online/,
  );

  await appuntamenti.saveAppointmentsConfig(scopeClub, {
    familyBookingEnabled: true,
    types: [],
  });

  /*
    **Q1 (Medium).** Una riga con `guardians` scritto come **oggetto** invece
    che come array faceva lanciare `jsonb_array_elements` e cadere l'intera
    ricerca nel `catch`: l'allargamento ai club dove si e tutori spariva per
    **tutte** le famiglie, in silenzio.
  */
  /*
    Carla e stata scollegata da §M, ed e giusto: quella prova misura la revoca.
    Qui serve di nuovo un tutore che dipenda **solo** dalla ricerca grezza —
    senza tessera, senza altra strada — perche e quella che il dato malformato
    farebbe cadere.
  */
  await prisma.athlete.update({
    where: { id: NINA },
    data: { data: { guardians: [tutore(CARLA, "Zia")] } },
  });

  const MALFORMATO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: MALFORMATO,
      organization_id: CLUB,
      first_name: "Dato",
      last_name: "Storto",
      status: "active",
      data: { guardians: { name: "un oggetto, non un elenco" } },
      updated_at: new Date(),
    },
  });

  /*
    **Questa prova non diventa rossa togliendo la correzione, e va detto.**

    Misurato: rimettendo `WHERE jsonb_typeof(...) = 'array' AND EXISTS(...)` la
    prova resta verde, perche su questa forma di query il pianificatore di
    Postgres valuta i due congiunti nell'ordine scritto. Il rischio che la
    revisione ha descritto e **reale ma latente**: lo standard non garantisce
    quell'ordine, e un piano diverso — piu righe, un indice nuovo, una versione
    successiva — lo cambierebbe senza avvisare.

    Cio che questa prova misura, e che serve comunque: che la forma robusta
    **non abbia rotto niente**, e che una riga malformata in archivio non faccia
    sparire i figli di nessuno.
  */
  prova(
    "R-03 una riga con `guardians` malformato non fa sparire i figli di nessuno",
    ["Verdi Nina"],
    (await cruscotto.listParentChildren(CARLA.id)).map((f) => f.name),
  );

  await prisma.athlete.delete({ where: { id: MALFORMATO } });

  /*
    **R8 (Low).** Due nomi che si riducono allo stesso identificativo: il
    pulsante rispondeva «aggiunto» e la voce non compariva.
  */
  await appuntamenti.saveAppointmentsConfig(scopeClub, {
    familyBookingEnabled: true,
    types: [{ name: "Colloquio!" }, { name: "Colloquio?" }],
  });

  prova(
    "R-04 due motivi con lo stesso identificativo restano due motivi",
    ["Colloquio!", "Colloquio?"],
    (await appuntamenti.readAppointmentsConfig(CLUB)).types.map((t) => t.name),
  );

  /*
    **Config (Low).** Cio che non e un booleano non e una scelta: un client che
    non sia il browser mandava `"false"` e riaccendeva le prenotazioni credendo
    di spegnerle.
  */
  await appuntamenti.saveAppointmentsConfig(scopeClub, {
    familyBookingEnabled: "false",
    types: [],
  });
  prova(
    "R-05 una stringa non spegne e non accende: vale l'assenza",
    true,
    (await appuntamenti.readAppointmentsConfig(CLUB)).familyBookingEnabled,
  );

  /*
    **R2 (Medium).** La riga del certificato perdeva l'etichetta quando la data
    non c'era, cioe proprio sull'atleta che il certificato non lo ha portato.
  */
  const certificati = await carica("src/lib/medical-certificates.ts");
  prova(
    "R-06 senza data la riga porta comunque lo stato",
    [
      "Mancante — Data di scadenza non disponibile",
      "Consegnato — Data di scadenza non disponibile",
    ],
    [
      certificati.describeMedicalCertificateForFamily("missing", null).summary,
      certificati.describeMedicalCertificateForFamily("undated", null).summary,
    ],
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

  /*
    **Queste due passano dalla ROTTA, e non dal servizio.**

    La prima stesura chiamava `cancelFamilyAppointment` e
    `rescheduleFamilyAppointment` direttamente, con un contesto gia risolto:
    misuravano il vaglio del dominio, non la strada che ci arriva. E la classe
    di difetto che questo pacchetto ha prodotto sette volte, e che su una
    proprieta di **sicurezza** non si puo permettere: se domani una rotta
    risolvesse il contesto in modo diverso — o non lo risolvesse affatto — una
    prova che parte da dentro resterebbe verde.

    Qui si costruisce una `Request` con la sessione vera di Anna e si chiede al
    server di toccare l'appuntamento di un'**altra famiglia**, per percorso e
    per corpo insieme: sono le due leve che un attaccante ha.
  */
  const authM = await carica("src/lib/server/auth.ts");
  const sessioneAnnaM = await authM.createSessionForUser(ANNA);
  const rottaAppuntamentiM = await carica(
    "src/app/api/parent-dashboard/[athleteId]/appointments/route.ts",
  );

  const chiediSuAppuntamento = async (metodo, corpo, atletaNelPercorso) => {
    const richiesta = new Request(
      "http://collaudo.invalid/api/parent-dashboard/x/appointments",
      {
        method: metodo,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessioneAnnaM.access_token}`,
        },
        body: JSON.stringify(corpo),
      },
    );
    const risposta = await rottaAppuntamentiM[metodo](richiesta, {
      params: { athleteId: atletaNelPercorso },
    });
    const letto = await risposta.json().catch(() => ({}));
    return {
      stato: risposta.status,
      messaggio: String(letto?.error?.message || ""),
    };
  };

  /* Il percorso e il proprio figlio, l'appuntamento e di un'altra famiglia. */
  const disdettaAltrui = await chiediSuAppuntamento(
    "DELETE",
    { id: rigaDiBruno.id },
    MARCO,
  );
  prova(
    "M-09 dalla rotta non si annulla l'appuntamento di un'altra famiglia",
    true,
    disdettaAltrui.stato >= 400 &&
      /non trovata|Accesso negato/i.test(disdettaAltrui.messaggio),
    `${disdettaAltrui.stato} ${disdettaAltrui.messaggio}`,
  );

  const spostaAltrui = await chiediSuAppuntamento(
    "PATCH",
    { id: rigaDiBruno.id, date: "2027-06-02", time: "10:00" },
    MARCO,
  );
  prova(
    "M-10 ne si riprogramma dalla rotta",
    true,
    spostaAltrui.stato >= 400 &&
      /non trovata|Accesso negato/i.test(spostaAltrui.messaggio),
    `${spostaAltrui.stato} ${spostaAltrui.messaggio}`,
  );

  /*
    E la seconda leva: mettere **il figlio altrui nel percorso**. Qui non deve
    bastare che l'appuntamento non si trovi: deve cadere prima, sul legame.
  */
  const conFiglioAltruiNelPercorso = await chiediSuAppuntamento(
    "DELETE",
    { id: rigaDiBruno.id },
    LUCA,
  );
  prova(
    "M-09b ne mettendo il figlio altrui nel percorso",
    true,
    conFiglioAltruiNelPercorso.stato >= 400,
    `${conFiglioAltruiNelPercorso.stato} ${conFiglioAltruiNelPercorso.messaggio}`,
  );

  /* E la riga dell'altra famiglia e ancora li, intatta. */
  const rigaDopoITentativi = await prisma.appointment.findUnique({
    where: { id: rigaDiBruno.id },
    select: { status: true, athlete_id: true },
  });
  prova(
    "M-09c dopo i tre tentativi la riga dell'altra famiglia e intatta",
    ["requested", LUCA],
    [rigaDopoITentativi?.status, rigaDopoITentativi?.athlete_id],
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
/*  §H e §I — una sola verita su tre schermate                          */
/* ==================================================================== */

/**
 * **La domanda che questa sezione pone e una sola: le tre superfici dicono la
 * stessa cosa?**
 *
 * Il fascicolo della famiglia, la coda della segreteria e la scheda dell'atleta
 * guardano lo stesso documento da tre lati. Il mandato chiede che non ci sia
 * «duplicazione di stato fra tre sistemi diversi», e la prova non e leggere il
 * codice: e **fare il giro** — la segreteria chiede, la famiglia consegna, la
 * segreteria decide — e guardare le tre superfici dopo ogni passo.
 *
 * Se una delle tre divergesse, la duplicazione ci sarebbe **anche se il codice
 * sembrasse pulito**.
 */
const sezioneHI = async () => {
  console.log("\n§H e §I — la stessa verita su tre schermate\n");

  const fascicolo = await carica("src/lib/server/document-requests.ts");
  const legacy = await carica("src/lib/server/document-dossier-legacy.ts");

  const scopeClub = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /* 1. La segreteria chiede. */
  await fascicolo.createDocumentRequest(scopeClub, {
    organizationId: CLUB,
    subjectKind: "athlete",
    subjectId: MARCO,
    documentKind: "identity_document",
    title: "Documento di identita",
    required: true,
    dueDate: "2027-01-31",
  });

  const codaIniziale = await fascicolo.listDocumentReviewQueue(scopeClub);
  const rigaCoda = codaIniziale.find(
    (riga) => riga.subjectId === MARCO && riga.documentKind === "identity_document",
  );
  prova(
    "P-110 la richiesta compare nella coda del club",
    "missing",
    rigaCoda?.state,
  );

  const daFare = (
    await cruscotto.getParentDashboardData(ANNA.id, MARCO)
  ).documents.required.find((voce) => voce.title === "Documento di identita");
  prova(
    "P-111 e nella colonna «Da fare» della famiglia",
    true,
    Boolean(daFare),
  );

  /* 2. La famiglia consegna. */
  const scopeFamiglia = await fascicolo.resolveLinkedFamilyScope(ANNA.id, MARCO);
  await fascicolo.submitDocument(scopeFamiglia, {
    organizationId: CLUB,
    requestId: rigaCoda?.requestId,
    subjectKind: "athlete",
    subjectId: MARCO,
    documentKind: "identity_document",
    source: "parent",
    file: {
      fileName: "identita.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 collaudo pp-02"),
    },
  });

  const dopoInvio = await cruscotto.getParentDashboardData(ANNA.id, MARCO);
  const codaDopoInvio = await fascicolo.listDocumentReviewQueue(scopeClub);
  const schedaDopoInvio = await legacy.listAthleteDocumentsWithLegacy(
    scopeClub,
    MARCO,
  );

  prova(
    "P-112 dopo l'invio la coda del club dice «in verifica»",
    "under_review",
    codaDopoInvio.find((riga) => riga.subjectId === MARCO)?.state,
  );

  prova(
    "P-113 la famiglia non lo vede piu fra le cose da fare",
    false,
    dopoInvio.documents.required.some(
      (voce) => voce.title === "Documento di identita",
    ),
    "una voce sta in un'area sola: la regola di W6-40",
  );

  prova(
    "P-114 e la scheda atleta dice la stessa cosa",
    "under_review",
    schedaDopoInvio.find((voce) => voce.title === "Documento di identita")
      ?.status,
  );

  /* 3. La segreteria rifiuta, con il motivo. */
  const inAttesa = codaDopoInvio.find((riga) => riga.subjectId === MARCO);
  await fascicolo.decideDocumentSubmission(scopeClub, inAttesa.submissionId, {
    decision: "rejected",
    note: "La foto e illeggibile: rifalla con piu luce",
  });

  const dopoRifiuto = await cruscotto.getParentDashboardData(ANNA.id, MARCO);
  const vociDaFare = dopoRifiuto.documents.required.find(
    (voce) => voce.title === "Documento di identita",
  );

  prova(
    "P-115 la famiglia lo ritrova fra le cose da fare",
    true,
    Boolean(vociDaFare),
  );

  prova(
    "P-116 e legge il motivo che la segreteria ha scritto",
    "La foto e illeggibile: rifalla con piu luce",
    vociDaFare?.rejectionReason,
    "un rifiuto senza motivo fa ricaricare lo stesso file",
  );

  prova(
    "P-117 la coda del club lo chiama «da integrare»",
    "rejected",
    (await fascicolo.listDocumentReviewQueue(scopeClub)).find(
      (riga) => riga.subjectId === MARCO,
    )?.state,
  );

  /*
    Il motivo del rifiuto e per la **famiglia interessata**: e cio che le dice
    cosa rifare. Non deve raggiungere l'altra, e questa e la prova.
  */
  prova(
    "P-118 il motivo non finisce nel fascicolo di un'altra famiglia",
    false,
    JSON.stringify(
      await cruscotto.getParentDashboardData(BRUNO.id, LUCA),
    ).includes("La foto e illeggibile"),
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

/* ==================================================================== */
/*  §S — cio che la TERZA revisione indipendente ha trovato             */
/* ==================================================================== */

/**
 * **Due revisioni in parallelo — una sulla correttezza del percorso, una
 * ostile sulla sicurezza — su un pacchetto che si era gia dichiarato pulito
 * due volte.**
 *
 * Nessun Critical, e nessuna via per cui un genitore raggiunga i dati di un
 * figlio non suo. Ma due High di correttezza, un High di disponibilita, un
 * Medium multi-tenant e nove fra Medium e Low.
 *
 * Il filo che li tiene insieme e lo stesso del secondo round, e va scritto una
 * terza volta: **le sonde misuravano il dominio, e i difetti stavano nel
 * percorso.** Il correttivo del secondo round era stato applicato solo dove il
 * difetto era stato trovato. Queste prove partono tutte da fuori.
 */
const sezioneS = async () => {
  console.log("\n§S — le correzioni della terza revisione\n");

  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(ANNA);

  /* ------------------------------------------------- il proprio impianto */

  /*
    Un campo **senza fasce dichiarate**: e lo stato normale di ogni club che
    quel riquadro non lo ha compilato, ed e il ramo che nessuna sonda toccava.
    Si aggiunge qui e non nel semaforo comune perche P-80 elenca le strutture
    per nome.
  */
  const STRUTTURA_LIBERA = "struttura-pp02-libera";
  const CAMPO_LIBERO = "campo-pp02-libero";

  const clubCorrente = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { structures: true },
  });

  await prisma.club.update({
    where: { id: CLUB },
    data: {
      structures: [
        ...(clubCorrente?.structures || []),
        {
          id: STRUTTURA_LIBERA,
          name: "Palestra senza orari",
          siteId: SEDE_1,
          isVisibleToMembers: true,
          isBookableByMembers: true,
          fields: [
            {
              id: CAMPO_LIBERO,
              name: "Campo C",
              isVisible: true,
              isBookable: true,
              pricing: [{ id: "p3", durationMinutes: 60, price: 10 }],
            },
          ],
        },
      ],
    },
  });

  const rottaStrutture = await carica(
    "src/app/api/parent-dashboard/[athleteId]/structures/route.ts",
  );

  const prenotaS = async (corpo) => {
    const risposta = await rottaStrutture.POST(
      new Request("http://collaudo.invalid/api/parent-dashboard/x/structures", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessione.access_token}`,
        },
        body: JSON.stringify(corpo),
      }),
      { params: { athleteId: MARCO } },
    );
    return { stato: risposta.status, corpo: await risposta.json() };
  };

  /* ---------------------------------- S1: una richiesta ha una durata */

  /*
    **S1 (High).** Il solo vincolo era `inizio < fine`, e la fascia non copre
    il caso: un campo che non dichiara fasce non ha vincolo, ed e deliberato
    (W6-D03, il silenzio non e un divieto). Su un campo cosi bastava chiedere
    dal 2027 al 2099. La riga nasce `pending`, e `hasBookingConflict` considera
    `pending` bloccante: **il campo restava occupato per settant'anni**, per
    ogni altra famiglia e per la segreteria. Non serviva malafede: un errore di
    battitura sull'anno bastava.
  */
  const settantAnni = await prenotaS({
    structureId: STRUTTURA_LIBERA,
    fieldId: CAMPO_LIBERO,
    start: "2027-01-04T09:00:00.000Z",
    end: "2099-01-01T09:00:00.000Z",
  });
  prova(
    "S-01 una prenotazione non puo durare settant'anni",
    true,
    settantAnni.stato === 400 &&
      /piu di un giorno/.test(String(settantAnni.corpo?.error?.message || "")),
    settantAnni.corpo?.error?.message,
  );

  /*
    E il campo senza fasce **resta prenotabile**: il tetto e sulla durata, non
    sul silenzio del club. Se questa diventasse rossa avremmo trasformato
    W6-D03 nel suo opposto, che e proprio cio che il difetto R4 aveva fatto.
  */
  const normale = await prenotaS({
    structureId: STRUTTURA_LIBERA,
    fieldId: CAMPO_LIBERO,
    start: "2027-05-04T09:00:00.000Z",
    end: "2027-05-04T10:00:00.000Z",
  });
  prova(
    "S-02 un campo senza fasce dichiarate resta prenotabile",
    200,
    normale.stato,
    normale.corpo?.error?.message,
  );

  const passato = await prenotaS({
    structureId: STRUTTURA_LIBERA,
    fieldId: CAMPO_LIBERO,
    start: "2020-01-01T09:00:00.000Z",
    end: "2020-01-01T10:00:00.000Z",
  });
  prova(
    "S-03 non si prenota un orario gia passato",
    true,
    passato.stato === 400 &&
      /gia passato/.test(String(passato.corpo?.error?.message || "")),
    passato.corpo?.error?.message,
  );

  /* ------------------------- S4: il figlio lo dice il percorso, non il corpo */

  /*
    **S4 (Medium, multi-tenant).** Il corpo poteva sovrascrivere il figlio: si
    cercava `body.athleteId` fra `linkedAthletes`, che sono tutti i figli di chi
    chiede, di **tutti** i club. Il controllo verificava che l'id fosse di un
    proprio figlio e **non** che quel figlio fosse di questo club — mentre il
    club della prenotazione viene dal percorso.

    Anna, con Marco qui e una figlia in un'altra societa, poteva far scrivere
    dentro le strutture di **questo** club una prenotazione intestata alla
    figlia dell'altra: con la sua riga di audit e una notifica a tutta la
    dirigenza che nomina un minore **che non e loro tesserato**.
  */
  const FIGLIA_ALTROVE = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIA_ALTROVE,
      organization_id: ALTRO_CLUB,
      first_name: "Elena",
      last_name: "Collaudo",
      status: "active",
      data: { guardians: [{ name: "Anna", linkedUserId: ANNA.id }] },
      updated_at: new Date(),
    },
  });

  /* Il legame c'e davvero: e cio che rendeva l'attacco possibile. */
  prova(
    "S-04a la figlia nell'altro club e davvero una figlia",
    true,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIA_ALTROVE),
  );

  await prenotaS({
    structureId: STRUTTURA_LIBERA,
    fieldId: CAMPO_LIBERO,
    start: "2027-05-05T09:00:00.000Z",
    end: "2027-05-05T10:00:00.000Z",
    athleteId: FIGLIA_ALTROVE,
  });

  const dopo = await prisma.club.findUnique({
    where: { id: CLUB },
    select: { structures: true },
  });
  const intestatari = (dopo?.structures || [])
    .filter((s) => s.id === STRUTTURA_LIBERA)
    .flatMap((s) => s.bookings || [])
    .filter((b) => String(b.start || "").startsWith("2027-05-05"))
    .map((b) => b.athleteId);

  prova(
    "S-04 il corpo non porta un figlio di un altro club dentro questo club",
    [MARCO],
    intestatari,
    "prima: la riga nasceva intestata alla figlia dell'altra societa",
  );

  /* ------------------------------- S5: la versione dopo il salvataggio */

  /*
    **S5 (High).** La schermata mandava la versione — la correzione di §O — e
    non riscriveva mai quella **tornata indietro**: la copia in memoria veniva
    ricomposta campo per campo e `version` non era fra i campi. Il modale non si
    chiude da solo dopo un salvataggio riuscito, quindi la seconda modifica di
    fila ripartiva da una versione **gia consumata**: «modificato da qualcun
    altro», con nessun altro che aveva toccato niente. E riprovando dallo stesso
    modale, lo stesso errore per sempre.

    Qui si misura la proprieta su cui la correzione poggia: la risposta del
    `PATCH` porta la versione nuova, risalvare su quella vecchia viene respinto,
    e con quella fresca passa.
  */
  const rottaEvento = await carica("src/app/api/v1/events/[id]/route.ts");
  const sessionePresidente = await auth.createSessionForUser(PRESIDENTE);

  const evento = await prisma.clubEvent.findFirst({
    where: { organization_id: CLUB, kind: "training" },
    select: { id: true, version: true },
  });

  const patchEvento = async (versione, titolo) => {
    const risposta = await rottaEvento.PATCH(
      new Request(`http://collaudo.invalid/api/v1/events/${evento.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionePresidente.access_token}`,
        },
        body: JSON.stringify({ data: { title: titolo, version: versione } }),
      }),
      { params: { id: evento.id } },
    );
    return { stato: risposta.status, corpo: await risposta.json() };
  };

  const versionePartenza = evento.version ?? 1;
  const primo = await patchEvento(versionePartenza, "Rinominato una volta");
  const versioneTornata = primo.corpo?.data?.row?.version;

  prova(
    "S-05 la risposta del salvataggio porta la versione nuova",
    true,
    typeof versioneTornata === "number" && versioneTornata > versionePartenza,
    `${versionePartenza} -> ${versioneTornata}`,
  );

  const conVecchia = await patchEvento(versionePartenza, "Secondo tentativo");
  prova(
    "S-06 risalvare sulla versione gia consumata viene respinto",
    true,
    conVecchia.stato >= 400 &&
      /modificato da qualcun altro/i.test(
        String(conVecchia.corpo?.error?.message || ""),
      ),
    conVecchia.corpo?.error?.message,
  );

  const conFresca = await patchEvento(versioneTornata, "Secondo tentativo");
  prova(
    "S-07 con la versione tornata indietro il secondo salvataggio passa",
    200,
    conFresca.stato,
    conFresca.corpo?.error?.message,
  );

  /* ------------------------- S8: un questionario non e un rinnovo */

  /*
    **S8 (High).** L'elenco dei moduli online non filtra per tipo, ed e giusto:
    risponde a «cosa ti chiede il club», e un questionario lo e. Ma la CTA
    mandava **tutti** al flusso di rinnovo, che apre `RenewalForm` sotto il
    titolo «Rinnova l'iscrizione» e invia con `kind: "renewal"`: un questionario
    di gradimento arrivava in segreteria etichettato come **pratica di
    rinnovo**, da esaminare e approvare — e approvarla avrebbe scritto
    anagrafica da risposte che non sono un'iscrizione.

    L'elenco non doveva restringersi: doveva restringersi la **destinazione**.
    Percio la proiezione adesso dice cosa e ogni modulo.
  */
  const modello = await carica("src/lib/forms/model.ts");
  const pubblicaTipata = async (titolo, purpose) => {
    const templateId = randomUUID();
    const slug = `pp02-s-${purpose}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const schema = modello.normalizeFormSchema({
      title: titolo,
      description: "",
      fields: [{ id: "f_nome", type: "short_text", label: "Nome" }],
      settings: { purpose },
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
        id: randomUUID(),
        organization_id: CLUB,
        template_id: templateId,
        version: 1,
        schema_json: schema,
        published_at: new Date(),
      },
    });

    return slug;
  };

  const slugIscrizione = await pubblicaTipata("Iscrizione S", "enrollment");
  const slugQuestionario = await pubblicaTipata("Questionario S", "generic");

  const moduliFamiglia = await carica("src/lib/server/enrollment-requests.ts");
  const elenco = await moduliFamiglia.listFamilyOnlineForms(ANNA.id, MARCO);
  const per = new Map(elenco.map((m) => [m.publicSlug, m]));

  prova(
    "S-08 la proiezione distingue un'iscrizione da un questionario",
    [true, false],
    [
      per.get(slugIscrizione)?.isEnrollment,
      per.get(slugQuestionario)?.isEnrollment,
    ],
    "prima: il campo non esisteva, e la CTA mandava tutti al rinnovo",
  );

  /*
    Ed entrambi restano in elenco: il difetto non era che il questionario ci
    fosse — quello e voluto — ma dove portava il pulsante.
  */
  prova(
    "S-08b il questionario resta fra i moduli che il club chiede",
    true,
    Boolean(per.get(slugQuestionario)),
  );

  /* ------------------ S9: il desk non e vincolato dal «una volta sola» */

  /*
    **S9 (Medium).** Il vincolo era applicato in `storeSubmission`, coda comune
    di tre strade: la segretaria che ricompilava un modulo per correggere un
    dato **per conto** della famiglia riceveva l'errore scritto per la famiglia
    — «se serve una correzione, scrivi alla segreteria» — cioe l'istruzione di
    scrivere a se stessa, con come unica uscita respingere la pratica esistente.
  */
  const invii = await carica("src/lib/server/form-submissions.ts");
  const scopeSegreteria = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  const daDesk = await invii
    .submitInternalForm(scopeSegreteria, {
      templateId: MODULO_UNICO.templateId,
      answers: { f_nome: "Correzione dal desk" },
      files: [],
      subjects: [{ subject: "athlete", recordId: MARCO }],
      respondentEmail: PRESIDENTE.email,
    })
    .catch((errore) => ({ errore: String(errore?.message || errore) }));

  prova(
    "S-09 la segreteria puo ricompilare un modulo «una volta sola»",
    true,
    !daDesk?.errore,
    daDesk?.errore || "accettato",
  );

  /*
    E per la famiglia il vincolo **resta**: la correzione non lo ha spento, lo
    ha ristretto a chi compila da fuori.
  */
  await respinta(
    "S-09b per la famiglia il vincolo vale ancora",
    () =>
      invii.submitRenewalForm(ANNA.id, {
        athleteId: MARCO,
        publicSlug: MODULO_UNICO.slug,
        answers: { f_nome: "Ancora una volta" },
        files: [],
        respondentEmail: ANNA.email,
      }),
    /gia stato compilato|gia compilato|non si puo inviare/i,
  );

  /* ------------------------- S10: la mezzanotte del cambio d'ora */

  /*
    **S10 (Low).** Il giorno seguente si calcolava aggiungendo ventiquattro ore
    **UTC** all'istante di inizio. Nella notte in cui l'orologio va avanti
    quelle ventiquattro ore scavalcano il giorno seguente e atterrano su quello
    dopo ancora: una prenotazione 23:00 → 00:00 dentro una fascia dichiarata
    veniva rifiutata. Un giorno l'anno, e nessuno avrebbe saputo dire perche.
  */
  const strutture = await carica("src/lib/structures-utils.ts");
  const campoNotturno = {
    availability: { Sab: [{ start: "22:00", end: "00:00" }] },
  };

  prova(
    "S-10 la notte del cambio d'ora, mezzanotte chiude ancora la giornata",
    true,
    strutture.isWithinFieldAvailability(
      campoNotturno,
      strutture.instantFromLocalTime("2027-03-27", "23:00"),
      strutture.instantFromLocalTime("2027-03-28", "00:00"),
    ),
    "prima: il giorno seguente risultava il 29, e la prenotazione era rifiutata",
  );

  /* ------------------- S11: l'operatore del club non esce alla famiglia */

  /*
    **S11 (Low).** `toFamilyAppointment` includeva `requested_by_user_id`, che
    su una riga nata dal desk porta **l'operatore del club**. Nessuna schermata
    lo disegnava, ma usciva nella risposta: ripetendo su piu appuntamenti si
    ricostruiva l'elenco di chi lavora in segreteria e di chi riceve in quali
    giorni. E lo stesso dato che gli slot dichiarano di aver tolto, per la
    stessa ragione — una risposta e cio che si pubblica.
  */
  const proiezione = await carica("src/lib/appointments/projection.ts");
  const reso = proiezione.toFamilyAppointment(
    {
      id: randomUUID(),
      organization_id: CLUB,
      starts_at: new Date(),
      ends_at: new Date(),
      status: "requested",
      requested_by_user_id: PRESIDENTE.id,
      version: 1,
    },
    {},
  );

  prova(
    "S-11 la risposta alla famiglia non nomina l'operatore del club",
    false,
    Object.prototype.hasOwnProperty.call(reso, "requested_by_user_id"),
    Object.keys(reso).join(","),
  );

  /* ---------------- S12: il messaggio dell'ORM non arriva al browser */

  /*
    **S12 (Low).** Cinque rotte di famiglia rimandavano il messaggio grezzo
    dell'ORM. Un `id` che non e un UUID **passa il gate** — il legame con il
    figlio e vero — e poi la query lancia: il `catch` restituiva nome del
    modello, operazione e `PostgresError`. E la classe W4-R14, che
    `api-errors.ts` esiste per chiudere, e che PP-02 aveva chiuso su quattro
    rotte lasciandone scoperte cinque.
  */
  const rottaAppuntamentiS = await carica(
    "src/app/api/parent-dashboard/[athleteId]/appointments/route.ts",
  );
  const idStorto = await rottaAppuntamentiS.PATCH(
    new Request("http://collaudo.invalid/api/parent-dashboard/x/appointments", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessione.access_token}`,
      },
      body: JSON.stringify({
        id: "non-un-uuid",
        date: "2027-09-01",
        time: "10:00",
      }),
    }),
    { params: { athleteId: MARCO } },
  );
  const messaggioStorto = String(
    (await idStorto.json().catch(() => ({})))?.error?.message || "",
  );

  prova(
    "S-12 un identificativo malformato non fa uscire il messaggio dell'ORM",
    false,
    /prisma|PostgresError|invalid input syntax/i.test(messaggioStorto),
    messaggioStorto.slice(0, 120),
  );
};

/** Il sorgente di un file, per le poche prove che guardano la schermata. */
const leggiSorgente = (rel) =>
  fs.readFileSync(path.resolve(rel), "utf8");

/* ==================================================================== */
/*  §T — cio che la QUARTA revisione indipendente ha trovato            */
/* ==================================================================== */

/**
 * **Il round che doveva tornare pulito, e non e tornato pulito.**
 *
 * Le otto correzioni del terzo round hanno retto tutte alla verifica. Ma la
 * stessa lettura ne ha trovate altre quattro di gravita alta, e sono **tutte
 * la stessa forma** — quella che questo pacchetto continua a produrre:
 *
 *   il dominio calcola la risposta giusta, e la schermata non gliela chiede.
 *
 * Una di queste — la CTA del modulo generico — era una regressione introdotta
 * **dalla correzione del round precedente**. Vale la pena scriverlo per esteso
 * invece che nasconderlo: correggere la destinazione di un pulsante aveva
 * spostato il difetto invece di chiuderlo.
 */
const sezioneT = async () => {
  console.log("\n§T — le correzioni della quarta revisione\n");

  const config = await carica("src/lib/appointments/config.ts");
  const appuntamenti = await carica("src/lib/server/appointments.ts");
  const scopeClub = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /* ------------------- T1: il club che chiude senza dirlo */

  /*
    **T1 (High).** Con i motivi configurati il dominio non accetta piu testo
    libero e vuole un motivo **prenotabile**. Il cruscotto pero mandava alla
    famiglia i soli motivi prenotabili — che in un club con tutti i motivi
    «solo dal desk» sono **zero** — e la schermata leggeva quello zero come
    «il club non ha configurato niente»: rendeva il campo libero, lo accettava,
    e il server rispondeva ogni volta «Scegli il motivo fra quelli proposti».
    Con zero motivi proposti da qualsiasi parte, e senza una frase che lo
    spiegasse: `familyBookingEnabled` restava `true`, quindi nemmeno il
    riquadro «le richieste non sono attive» compariva.

    Un vicolo cieco. Adesso la porta si chiude in un posto solo, e chi la
    guarda ne legge lo stesso stato del server.
  */
  prova(
    "T-01 con tutti i motivi «solo dal desk» la famiglia non puo chiedere",
    false,
    config.familyCanRequestAppointment({
      familyBookingEnabled: true,
      types: [{ id: "colloquio", name: "Colloquio", bookable: false }],
    }),
    "prima: il cruscotto diceva `true` e il server rifiutava sempre",
  );

  prova(
    "T-02 senza motivi configurati la famiglia puo ancora chiedere",
    true,
    config.familyCanRequestAppointment({
      familyBookingEnabled: true,
      types: [],
    }),
    "il silenzio non e un divieto: W6-D03",
  );

  prova(
    "T-03 basta un motivo prenotabile perche la porta resti aperta",
    true,
    config.familyCanRequestAppointment({
      familyBookingEnabled: true,
      types: [
        { id: "a", name: "Solo desk", bookable: false },
        { id: "b", name: "Colloquio", bookable: true },
      ],
    }),
  );

  /*
    E la stessa verita la dice il **cruscotto**, che e cio che la schermata
    legge: era li che le due meta divergevano.
  */
  await appuntamenti.saveAppointmentsConfig(scopeClub, {
    familyBookingEnabled: true,
    types: [{ name: "Colloquio", bookable: false }],
  });

  const cruscottoSoloDesk = await cruscotto.getParentDashboardData(
    ANNA.id,
    MARCO,
  );

  prova(
    "T-04 il cruscotto lo dice alla schermata, non solo al server",
    false,
    cruscottoSoloDesk?.appointments?.config?.familyBookingEnabled,
    "prima: `true`, con zero motivi in elenco e ogni invio rifiutato",
  );

  const contestoSoloDesk =
    await appuntamenti.resolveFamilyAppointmentContext(ANNA.id, MARCO);

  await respinta(
    "T-05 e il server rifiuta per la porta chiusa, non per il motivo",
    () =>
      appuntamenti.requestFamilyAppointment(contestoSoloDesk, {
        date: "2027-10-01",
        time: "10:00",
        reason: "quello che mi pare",
      }),
    /non riceve richieste di appuntamento online/,
  );

  await appuntamenti.saveAppointmentsConfig(scopeClub, {
    familyBookingEnabled: true,
    types: [],
  });

  /* --------------- T6: la riga dell'appuntamento sa cosa e successo */

  /*
    **T6 (High).** `toFamilyAppointment` calcola `status_label`,
    `decision_note`, `can_reschedule` e `can_cancel`, e la schermata li
    ignorava **tutti e quattro**. Il badge passava da un vocabolario scritto
    per gli eventi, che non conosce `cancelled_by_family`, `cancelled_by_club`,
    `rescheduled` e `no_show`: una famiglia che disdiceva il proprio
    appuntamento leggeva la conferma della disdetta e poi, nella riga, che
    l'appuntamento **e in programma**.

    Qui si tiene fermo cio che la proiezione manda; che la schermata lo legga
    lo tiene fermo il test di superficie, che non cerca piu una stringa ma il
    campo.
  */
  const proiezione = await carica("src/lib/appointments/projection.ts");
  const resa = (stato) =>
    proiezione.toFamilyAppointment(
      {
        id: randomUUID(),
        organization_id: CLUB,
        starts_at: new Date(),
        ends_at: new Date(),
        status: stato,
        version: 1,
        decision_note: "Manca il certificato",
      },
      {},
    );

  prova(
    "T-06 ogni stato ha la sua etichetta, e nessuno cade su un ripiego",
    [
      "Annullato dalla famiglia",
      "Annullato dalla segreteria",
      "Riprogrammato",
      "Assente",
      "Rifiutato",
    ],
    [
      resa("cancelled_by_family").status_label,
      resa("cancelled_by_club").status_label,
      resa("rescheduled").status_label,
      resa("no_show").status_label,
      resa("rejected").status_label,
    ],
  );

  /*
    E i due permessi: su una riga conclusa non si disdice e non si sposta. La
    schermata mostrava «Elimina» su **ogni** riga storica, perche confrontava
    con `"cancelled"`, che non e uno stato di questo dominio: la condizione era
    sempre vera. Chi premeva confermava un dialogo distruttivo e riceveva il
    messaggio interno sulle transizioni non ammesse.
  */
  prova(
    "T-07 su una riga conclusa non si disdice e non si sposta",
    [false, false],
    [resa("completed").can_cancel, resa("completed").can_reschedule],
  );

  prova(
    "T-08 su una richiesta aperta si puo ancora fare entrambe",
    [true, true],
    [resa("requested").can_cancel, resa("requested").can_reschedule],
  );

  /*
    Il motivo della risposta della segreteria arriva: era la sola cosa che
    rendeva utile un rifiuto, e non veniva disegnata da nessuna parte.
  */
  prova(
    "T-09 il motivo del rifiuto arriva alla famiglia",
    "Manca il certificato",
    resa("rejected").decision_note,
  );

  /* ------- T10: un questionario resta nel fascicolo, e cambia stato */

  /*
    **T10 (High), e questa e una regressione mia.** Il terzo round aveva
    trovato che ogni modulo online diventava una pratica di **rinnovo**. La
    correzione mandava i moduli generici alla pagina pubblica `/forms/<slug>`,
    che e **anonima**: l'invio nasceva con `selections: []` e `submittedBy:
    null`, quindi il legame con il figlio si perdeva. Conseguenze: la card
    restava «Da compilare» per sempre anche dopo dieci invii, l'interruttore
    «una volta sola» del club diventava inerte su quel percorso, e in
    segreteria la pratica arrivava senza atleta e senza autore.

    La destinazione non era il problema: lo era il **tipo scritto fisso**
    all'arrivo. Adesso si deriva dal modulo, e la famiglia resta dentro la sua
    area.
  */
  const modello = await carica("src/lib/forms/model.ts");
  const invii = await carica("src/lib/server/form-submissions.ts");

  const pubblicaT = async (titolo, purpose) => {
    const templateId = randomUUID();
    const slug = `pp02-t-${purpose}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const schema = modello.normalizeFormSchema({
      title: titolo,
      description: "",
      fields: [{ id: "f_nome", type: "short_text", label: "Nome" }],
      settings: { purpose },
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
        id: randomUUID(),
        organization_id: CLUB,
        template_id: templateId,
        version: 1,
        schema_json: schema,
        published_at: new Date(),
      },
    });

    return slug;
  };

  const slugQuestionario = await pubblicaT("Questionario T", "generic");
  const slugIscrizione = await pubblicaT("Iscrizione T", "enrollment");

  const inviaT = (slug) =>
    invii.submitRenewalForm(ANNA.id, {
      athleteId: MARCO,
      publicSlug: slug,
      answers: { f_nome: "Marco" },
      files: [],
      respondentEmail: ANNA.email,
    });

  const ricevutaQuestionario = await inviaT(slugQuestionario);
  const ricevutaIscrizione = await inviaT(slugIscrizione);

  const righe = await prisma.formSubmission.findMany({
    where: {
      organization_id: CLUB,
      id: { in: [ricevutaQuestionario.submissionId, ricevutaIscrizione.submissionId] },
    },
    select: { id: true, kind: true, subjects: true, submitted_by: true },
  });
  const perId = new Map(righe.map((r) => [r.id, r]));

  prova(
    "T-10 un questionario non arriva in segreteria come un rinnovo",
    ["submission", "renewal"],
    [
      perId.get(ricevutaQuestionario.submissionId)?.kind,
      perId.get(ricevutaIscrizione.submissionId)?.kind,
    ],
    "prima: `renewal` per entrambi, e la segreteria doveva approvare un questionario",
  );

  prova(
    "T-11 e porta comunque il figlio e chi lo ha inviato",
    [true, true],
    [
      (perId.get(ricevutaQuestionario.submissionId)?.subjects || []).some(
        (s) => s?.recordId === MARCO,
      ),
      perId.get(ricevutaQuestionario.submissionId)?.submitted_by === ANNA.id,
    ],
    "il primo rimedio passava dalla pagina anonima e perdeva entrambi",
  );

  /*
    E la card del fascicolo se ne accorge: era il difetto piu visibile del
    rimedio precedente — dieci invii e lo stato restava «Da compilare».
  */
  const moduliFamiglia = await carica("src/lib/server/enrollment-requests.ts");
  const elencoT = await moduliFamiglia.listFamilyOnlineForms(ANNA.id, MARCO);
  const cardQuestionario = elencoT.find(
    (m) => m.publicSlug === slugQuestionario,
  );

  prova(
    "T-12 dopo l'invio la card del questionario non dice piu «Da compilare»",
    true,
    Boolean(cardQuestionario) && cardQuestionario.state !== "todo",
    cardQuestionario?.state,
  );

  /* ---------------- T13: la scheda del figlio dice uno stato vero */

  /*
    **T13 (Medium).** `getStatusLabel` degli eventi non conosce il vocabolario
    degli atleti: ogni figlio, iscritto o no, leggeva «In programma» sulla
    propria scheda. Compreso quello **non piu iscritto**, per cui §B aveva
    appena scritto l'etichetta giusta sulla schermata di scelta.
  */
  const superfici = leggiSorgente(
    "src/components/parent-dashboard/parent-dashboard-pages.tsx",
  );

  prova(
    "T-13 la scheda del figlio non usa il vocabolario degli eventi per lo stato",
    true,
    superfici.includes("etichettaStatoAtleta(athlete.status)") &&
      !superfici.includes('label: "Stato", value: getStatusLabel(athlete.status)'),
  );

  /* -------- T14: i fratelli sono un elenco, non venti campi ciascuno */

  /*
    **T14 (Medium).** `linkedAthletes` usciva con `serializeAthleteCard`, nata
    per l'atleta **selezionato**: una ventina di campi — codice fiscale, luogo
    di nascita, indirizzo, telefono, email — per ogni fratello, a ogni
    caricamento di tutte e tredici le pagine. Non e dato di un'altra famiglia,
    ed e esattamente la proprieta che questo file difende per nome tre volte
    poche righe piu su.
  */
  const cruscottoFinale = await cruscotto.getParentDashboardData(ANNA.id, MARCO);
  const chiaviFratello = Object.keys(
    (cruscottoFinale?.athlete?.linkedAthletes || [])[0] || {},
  ).sort();

  /* ------- U: il termine scaduto spegne la CTA anche su un gia inviato */

  /*
    **U1 (Medium).** `chiuso` era consultato solo sul ramo «non inviato»: un
    modulo con il termine passato, gia mandato da questa famiglia e
    rimandabile, usciva `submitted` con la CTA accesa. Premendo «Compila di
    nuovo» si finiva su «Modulo non trovato» — perche la ricerca scarta i
    moduli chiusi — che non dice nemmeno che il termine e scaduto.
  */
  const slugChiuso = await pubblicaT("Chiuso U", "generic");
  await inviaT(slugChiuso);
  await prisma.formTemplate.updateMany({
    where: { organization_id: CLUB, public_slug: slugChiuso },
    data: {
      draft: {
        title: "Chiuso U",
        description: "",
        fields: [{ id: "f_nome", type: "short_text", label: "Nome" }],
        settings: { purpose: "generic", closeAt: "2020-01-01T00:00:00.000Z" },
      },
    },
  });
  await prisma.formTemplateVersion.updateMany({
    where: { organization_id: CLUB, template: { public_slug: slugChiuso } },
    data: {
      schema_json: {
        title: "Chiuso U",
        description: "",
        fields: [{ id: "f_nome", type: "short_text", label: "Nome" }],
        settings: { purpose: "generic", closeAt: "2020-01-01T00:00:00.000Z" },
      },
    },
  });

  const elencoU = await moduliFamiglia.listFamilyOnlineForms(ANNA.id, MARCO);
  const cardChiusa = elencoU.find((m) => m.publicSlug === slugChiuso);

  prova(
    "U-01 un modulo scaduto non offre «Compila di nuovo»",
    false,
    cardChiusa?.canSubmit,
    "prima: la CTA si accendeva e portava a «Modulo non trovato»",
  );

  /* ------------- V: cio che il sesto round ha trovato sul dominio */

  /*
    **V1.** L'area atleta si costruisce dallo **stesso** cruscotto della
    famiglia, e teneva le tre chiavi vecchie del certificato: `status` vale
    `"missing"` ogni volta che non c'e una data, cioe anche quando il documento
    e stato consegnato senza scadenza. Al ragazzo si diceva «Certificato
    mancante» per una cosa che aveva gia fatto, mentre sulla Home il genitore
    leggeva «Consegnato»: lo stesso documento, due risposte opposte dentro lo
    stesso prodotto.
  */
  await prisma.medicalCertificate.deleteMany({
    where: { organization_id: CLUB, athlete_id: MARCO },
  });
  await prisma.medicalCertificate.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: MARCO,
      type: "agonistico",
      status: "valid",
      expiry_date: null,
      updated_at: new Date(),
    },
  });

  const cruscottoSenzaData = await cruscotto.getParentDashboardData(
    ANNA.id,
    MARCO,
  );

  prova(
    "V-01 un certificato consegnato senza scadenza non e «mancante» per la famiglia",
    ["undated", "Consegnato"],
    [
      cruscottoSenzaData?.health?.familyState,
      cruscottoSenzaData?.health?.familyLabel,
    ],
  );

  /*
    Serve un ragazzo con il proprio accesso: `readAthleteAreaOverview` parte da
    `athletes.user_id`. Qui si scrive la colonna direttamente perche e
    **allestimento di collaudo** — in produzione l'unica strada resta
    `athlete-accounts.ts`, e la prova che lo tiene fermo vive altrove.
  */
  const UTENTE_MARCO = await utente("marco.pp02@collaudo.invalid", "Marco");
  await prisma.athlete.update({
    where: { id: MARCO },
    data: { user_id: UTENTE_MARCO.id },
  });

  const accessoAtleta = await carica("src/lib/server/athlete-accounts.ts");
  const areaAtleta = await accessoAtleta
    .readAthleteAreaOverview(UTENTE_MARCO.id)
    .catch((errore) => ({ errore: String(errore?.message || errore) }));

  prova(
    "V-02 e nemmeno per il ragazzo, che legge dallo stesso cruscotto",
    ["undated", "Consegnato"],
    areaAtleta?.errore
      ? `errore: ${areaAtleta.errore}`
      : [areaAtleta?.health?.status, areaAtleta?.health?.statusLabel],
    "prima: «missing» / «Certificato mancante», per un certificato consegnato",
  );

  await prisma.athlete.update({
    where: { id: MARCO },
    data: { user_id: null },
  });

  /*
    **V3.** Lo stato dell'atleta usciva **grezzo** dalla colonna, e chi lo legge
    si indicizza un vocabolario chiuso. La colonna contiene davvero altre
    grafie, perche la guardia in scrittura canonicalizza da oggi in avanti e non
    riscrive le righe storiche: con una di quelle, il figlio non riceveva
    **nessuna** pastiglia sul selettore — cioe la schermata tornava a promettere
    un'iscrizione viva.
  */
  await prisma.athlete.update({
    where: { id: GIULIA },
    data: { status: "disattivato" },
  });

  const figliConGrafiaStorica = await cruscotto.listParentChildren(ANNA.id);
  const giulia = figliConGrafiaStorica.find((f) => f.id === GIULIA);

  prova(
    "V-03 una grafia storica dello stato esce canonica, non grezza",
    "inactive",
    giulia?.status,
    "prima: «disattivato», e nessuna etichetta la riconosceva",
  );

  await prisma.athlete.update({
    where: { id: GIULIA },
    data: { status: "active" },
  });

  prova(
    "T-14 la riga di un fratello porta cinque campi, non venti",
    ["birth_date", "category_name", "id", "name", "organization_id"],
    chiaviFratello,
  );
};

/* ==================================================================== */
/*  §W — la revoca che non revocava                                      */
/* ==================================================================== */

/**
 * **Il reperto piu grave dell'intero pacchetto, e non era nel diff.**
 *
 * Esistevano **due definizioni divergenti di «tutore collegato»**. Quella che
 * concede l'accesso guarda quattro campi, e l'ultimo e l'indirizzo di contatto
 * che la segreteria scrive a mano sulla scheda. Quella che **revoca** azzera
 * gli altri tre e non tocca l'indirizzo.
 *
 * Il risultato: la segreteria preme «Scollega account», legge la conferma che
 * promette «perde l'accesso all'area famiglia: non vedra piu calendario,
 * pagamenti e documenti del minore», la scheda mostra «Account non collegato»
 * — e la persona continua a vedere tutto. Calendario, rate, ricevute, fatture,
 * documenti, i **byte** del certificato medico, e puo perfino revocare i
 * consensi dati dall'altro genitore.
 *
 * **Perche nessuna sonda lo vedeva.** `M-12`/`M-13` la revoca la simulavano
 * cosi:
 *
 *     data: { guardians: [] }
 *
 * cioe cancellando l'intera riga del tutore — una revoca che il prodotto non
 * esegue mai. Misuravano una revoca ipotetica, non quella che il pulsante fa.
 * E la quarta volta in questo pacchetto: cio che era coperto era il vaglio,
 * non la strada.
 */
const sezioneW = async () => {
  console.log("\n§W — la revoca che non revocava\n");

  const legami = await carica("src/lib/server/profile-account-links.ts");

  /*
    L'allestimento e quello vero: la segreteria scrive l'indirizzo di contatto
    **e** il legame nasce con il riscatto di un token, che scrive
    `linkedUserId`. Sono le due cose insieme che esistono in archivio.
  */
  const FIGLIO_REVOCA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_REVOCA,
      organization_id: CLUB,
      first_name: "Elia",
      last_name: "Revoca",
      status: "active",
      updated_at: new Date(),
      data: {
        guardians: [
          {
            id: "tutore-anna",
            name: "Anna Collaudo",
            relation: "madre",
            email: ANNA.email,
            linkedUserId: ANNA.id,
            linkedUserEmail: ANNA.email,
          },
        ],
      },
    },
  });

  prova(
    "W-01 prima della revoca il legame c'e",
    true,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_REVOCA),
  );

  /* La revoca **vera**: quella che preme il pulsante della segreteria. */
  const scopeSegreteria = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  await legami.unlinkGuardianAccount(scopeSegreteria, {
    athleteId: FIGLIO_REVOCA,
    guardianId: "tutore-anna",
  });

  const dopoLaRevoca = await prisma.athlete.findUnique({
    where: { id: FIGLIO_REVOCA },
    select: { data: true },
  });
  const rigaTutore = (dopoLaRevoca?.data?.guardians || [])[0] || {};

  prova(
    "W-02 la revoca azzera il riferimento all'utente",
    [null, null],
    [rigaTutore.linkedUserId ?? null, rigaTutore.linkedUserEmail ?? null],
  );

  /*
    **E l'indirizzo di contatto resta**, ed e giusto che resti: la segreteria
    deve poter continuare a scrivere a quella persona. Cio che non deve restare
    e l'**accesso**.
  */
  prova(
    "W-03 l'indirizzo di contatto resta, perche serve al club",
    ANNA.email,
    rigaTutore.email,
  );

  prova(
    "W-04 ma dopo la revoca l'accesso non c'e piu",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_REVOCA),
    "prima: l'indirizzo di contatto teneva in piedi il legame, e la revoca era una bugia",
  );

  /*
    E la strada vera, non solo il vaglio: la rotta del cruscotto deve negare.
    Un accesso revocato che risponde 200 e la forma in cui questo difetto si
    sarebbe visto in produzione.
  */
  const authW = await carica("src/lib/server/auth.ts");
  const sessioneW = await authW.createSessionForUser(ANNA);
  const rottaCruscotto = await carica(
    "src/app/api/parent-dashboard/[athleteId]/route.ts",
  );

  const rispostaRevocata = await rottaCruscotto.GET(
    new Request("http://collaudo.invalid/api/parent-dashboard/x", {
      headers: { authorization: `Bearer ${sessioneW.access_token}` },
    }),
    { params: { athleteId: FIGLIO_REVOCA } },
  );

  prova(
    "W-05 e la rotta del cruscotto lo nega, non solo il vaglio",
    true,
    rispostaRevocata.status >= 400,
    `stato ${rispostaRevocata.status}`,
  );

  /*
    **Il legame per solo indirizzo, quando non e mai stato revocato, resta.**

    E la decisione ADR-0114 / PP02-D2: la segreteria scrive l'indirizzo, la
    famiglia si registra con quello, e dentro un club dove ha gia una tessera il
    legame vale. La correzione non doveva toccarla — doveva togliere l'accesso
    a chi e stato **scollegato esplicitamente**, che e un'altra cosa.
  */
  const FIGLIO_SOLO_EMAIL = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SOLO_EMAIL,
      organization_id: CLUB,
      first_name: "Nina",
      last_name: "SoloEmail",
      status: "active",
      updated_at: new Date(),
      data: { guardians: [{ name: "Anna", email: ANNA.email }] },
    },
  });

  prova(
    "W-06 un legame per solo indirizzo, mai revocato, continua a valere",
    true,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_SOLO_EMAIL),
    "la correzione non deve capovolgere ADR-0114",
  );

  await prisma.athlete.deleteMany({
    where: { id: { in: [FIGLIO_REVOCA, FIGLIO_SOLO_EMAIL] } },
  });

  /*
    **W-10.** La seconda definizione di «tutore collegato»: quella che decide
    **chi riceve** gli avvisi sul certificato medico. Come la prima accettava
    l'indirizzo di contatto, e da li risolveva l'account della persona. Dopo
    «Scollega account» gli avvisi sulla salute di un minore continuavano ad
    arrivare a chi era stato scollegato.
  */
  const promemoria = await carica("src/lib/server/medical-certificate-reminders.ts");

  const rigaRevocata = {
    data: {
      guardians: [
        {
          id: "t1",
          name: "Anna",
          email: ANNA.email,
          accessRevokedAt: new Date().toISOString(),
        },
      ],
    },
  };
  const rigaViva = {
    data: { guardians: [{ id: "t1", name: "Anna", email: ANNA.email }] },
  };

  prova(
    "W-10 un tutore scollegato non e piu destinatario degli avvisi sul certificato",
    [0, 1],
    [
      promemoria.getGuardianRows(rigaRevocata).length,
      promemoria.getGuardianRows(rigaViva).length,
    ],
    "prima: l'indirizzo di contatto lo teneva fra i destinatari",
  );

  /*
    **W-11.** Il marchio della revoca si cancellava con un salvataggio
    ordinario dell'anagrafica.

    `athletes.data` e un blob JSON che la rotta generica **sostituisce per
    intero**, e il client manda l'array dei tutori come lo aveva in memoria:
    dopo una revoca quella copia e quella di **prima**, perche nessun file
    client conosce `accessRevokedAt`. Bastava premere «Scollega account» e poi,
    senza ricaricare, caricare un certificato o salvare una sezione — e la
    revoca si annullava da sola.

    La guardia esistente sorveglia la **crescita** dell'insieme delle identita,
    e togliere il marchio non fa crescere niente: l'indirizzo era gia dentro.
    Non e una concessione nuova, e una concessione **restituita**.
  */
  const risorse = await carica("src/lib/server/resources.ts");

  const FIGLIO_SALVATO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SALVATO,
      organization_id: CLUB,
      first_name: "Rita",
      last_name: "Salvata",
      status: "active",
      updated_at: new Date(),
      data: {
        guardians: [
          {
            id: "tutore-rita",
            name: "Anna",
            email: ANNA.email,
            accessRevokedAt: new Date().toISOString(),
          },
        ],
      },
    },
  });

  /* Il client rimanda l'array **senza** il marchio: e la copia pre-revoca. */
  await risorse.updateResource(
    "athletes",
    FIGLIO_SALVATO,
    {
      data: {
        guardians: [{ id: "tutore-rita", name: "Anna", email: ANNA.email }],
      },
    },
    scopeSegreteria,
  );

  const dopoIlSalvataggio = await prisma.athlete.findUnique({
    where: { id: FIGLIO_SALVATO },
    select: { data: true },
  });

  prova(
    "W-11 un salvataggio dell'anagrafica non annulla la revoca",
    true,
    Boolean(
      ((dopoIlSalvataggio?.data?.guardians || [])[0] || {}).accessRevokedAt,
    ),
    "prima: il marchio spariva e l'accesso tornava",
  );

  prova(
    "W-11b e infatti l'accesso resta negato",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_SALVATO),
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SALVATO } });

  /*
    **W-13. Le due strade con cui si aggirava il marchio della revoca.**

    Il marchio stava sulla **riga**, e l'accesso si concede a un'**identita**.
    Bastava quindi una riga nuova con lo stesso indirizzo e un `id` diverso —
    scritta a mano, o creata da sola all'approvazione di un modulo in cui la
    persona si dichiara tutore, dove il dominio dei moduli fa un `push`.

    E la guardia della crescita non se ne accorgeva: l'indirizzo era gia
    dentro l'insieme sorvegliato, quindi riaggiungere quella persona non era
    «crescita» e il vaglio dei due permessi non scattava.
  */
  const FIGLIO_AGGIRO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_AGGIRO,
      organization_id: CLUB,
      first_name: "Ivo",
      last_name: "Aggiro",
      status: "active",
      updated_at: new Date(),
      data: {
        guardians: [
          { id: "t-vecchio", name: "Anna", email: ANNA.email, linkedUserId: ANNA.id },
        ],
      },
    },
  });

  await legami.unlinkGuardianAccount(scopeSegreteria, {
    athleteId: FIGLIO_AGGIRO,
    guardianId: "t-vecchio",
  });

  prova(
    "W-13a dopo la revoca l'accesso non c'e",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_AGGIRO),
  );

  /* Prima strada: una riga **nuova**, stesso indirizzo, id diverso. */
  const rigaAttuale = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_AGGIRO },
      select: { data: true },
    })
  )?.data;

  await prisma.athlete.update({
    where: { id: FIGLIO_AGGIRO },
    data: {
      data: {
        ...rigaAttuale,
        guardians: [
          ...(rigaAttuale?.guardians || []),
          { id: "t-nuovo", name: "Anna", email: ANNA.email },
        ],
      },
    },
  });

  prova(
    "W-13b una riga sorella con lo stesso indirizzo non riapre l'accesso",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_AGGIRO),
    "prima: il marchio era sulla riga, e la riga nuova non ce l'aveva",
  );

  /*
    Seconda strada: la guardia della crescita deve **vedere** il rientro.

    E qui si misura il **delta**, non l'insieme isolato. La prima stesura di
    questa prova guardava `guardianAccessIdentities(data)` da sola e la
    dichiarava priva dell'identita revocata: vero, e inutile — perche la
    guardia confronta due insiemi, e sottrarre le revocate da **entrambi**
    lasciava la differenza identica. La proprieta provata era vera; quella che
    serviva era falsa, e la guardia era piu debole di prima.
  */
  const datiAggiro = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_AGGIRO },
      select: { data: true },
    })
  )?.data;

  /*
    E si passa dalla **guardia**, non dal calcolo. Calcolare il delta qui
    dentro proverebbe la mia aritmetica; cio che serve e che
    `updateResource` **rifiuti** a un ruolo che non puo ne vedere ne
    concedere. E la stessa distinzione fra il vaglio e la strada che questo
    pacchetto ha pagato otto volte.
  */
  const risorseAggiro = await carica("src/lib/server/resources.ts");
  const scopeSenzaPermessi = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "trainer",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  const rientroNegato = await risorseAggiro
    .updateResource(
      "athletes",
      FIGLIO_AGGIRO,
      {
        data: {
          ...datiAggiro,
          guardians: [
            ...(datiAggiro?.guardians || []),
            /*
              La riga porta l**indirizzo**, che e l identita **revocata**: e
              quella che deve risultare una crescita. Con l identificativo
              utente crescerebbe comunque, perche e un altra identita, e la
              prova non distinguerebbe niente.
            */
            { id: "t-rientro", name: "Anna", email: ANNA.email },
          ],
        },
      },
      scopeSenzaPermessi,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-13c rimettere un'identita revocata e una crescita, e la guardia la rifiuta",
    true,
    rientroNegato !== "riuscita",
    rientroNegato,
  );

  /* E il legame **dichiarato** riapre, perche e cosi che ci si ricollega. */
  const dopoAggiro = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_AGGIRO },
      select: { data: true },
    })
  )?.data;

  await prisma.athlete.update({
    where: { id: FIGLIO_AGGIRO },
    data: {
      data: {
        ...dopoAggiro,
        guardians: [{ id: "t-nuovo", name: "Anna", linkedUserId: ANNA.id }],
        revokedGuardianIdentities: [],
      },
    },
  });

  prova(
    "W-13d un riscatto, che riscrive il legame e pulisce l'elenco, riapre",
    true,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_AGGIRO),
    "una revoca non deve essere definitiva",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_AGGIRO } });

  /*
    **W-14. La revoca della tessera, che e l'altra porta.**

    `unlinkParentGuardians` e lo sweep che segue la revoca di una **tessera** —
    e l'uscita volontaria dal club. Ripuliva le righe e non registrava
    l'identita, quindi da questa strada si rientrava esattamente come
    dall'altra: una riga sorella con lo stesso indirizzo. Due modi di togliere
    l'accesso e uno solo che lo scriveva.
  */
  const FIGLIO_TESSERA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_TESSERA,
      organization_id: CLUB,
      first_name: "Tea",
      last_name: "Tessera",
      status: "active",
      updated_at: new Date(),
      data: {
        guardians: [
          { id: "t-anna", name: "Anna", email: ANNA.email, linkedUserId: ANNA.id },
        ],
      },
    },
  });

  await prisma.$transaction(async (tx) => {
    await legami.unlinkParentGuardians(
      tx,
      CLUB,
      ANNA.id,
      ANNA.email,
      "parent",
    );
  });

  const dopoSweep = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_TESSERA },
      select: { data: true },
    })
  )?.data;

  prova(
    "W-14 lo sweep della tessera registra l'identita, non solo la riga",
    true,
    (dopoSweep?.revokedGuardianIdentities || []).includes(
      String(ANNA.email).toLowerCase(),
    ),
    "prima: la riga si ripuliva e l'identita non restava scritta",
  );

  /* E la riga sorella non riapre nemmeno da questa strada. */
  await prisma.athlete.update({
    where: { id: FIGLIO_TESSERA },
    data: {
      data: {
        ...dopoSweep,
        guardians: [
          ...(dopoSweep?.guardians || []),
          { id: "t-sorella", name: "Anna", email: ANNA.email },
        ],
      },
    },
  });

  prova(
    "W-14b e la riga sorella non riapre nemmeno dopo la revoca della tessera",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_TESSERA),
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_TESSERA } });

  /*
    **W-15. Le quattro falle della stesura precedente.**

    Il decimo round le ha trovate tutte dentro la correzione del nono, che era
    la correzione dell'ottavo. Quattro forme, e nessuna e una svista di
    battitura: sono i modi in cui una difesa nuova non eredita le protezioni
    di quella che sostituisce.
  */
  const risorseW = await carica("src/lib/server/resources.ts");

  const nuovoFiglio = async (dati) => {
    const id = randomUUID();
    await prisma.athlete.create({
      data: {
        id,
        organization_id: CLUB,
        first_name: "Prova",
        last_name: "Quindici",
        status: "active",
        updated_at: new Date(),
        data: dati,
      },
    });
    return id;
  };

  const letto = async (id) =>
    (
      await prisma.athlete.findUnique({
        where: { id },
        select: { data: true },
      })
    )?.data;

  /* --- W-15a: il ramo del legame dichiarato non alzava la bandiera --- */
  const A = await nuovoFiglio({
    guardians: [
      {
        id: "t",
        name: "Anna",
        email: ANNA.email,
        accessRevokedAt: new Date().toISOString(),
      },
    ],
    revokedGuardianIdentities: [String(ANNA.email).toLowerCase()],
  });

  /* Il client rimanda la riga com'era **prima** della revoca. */
  await risorseW.updateResource(
    "athletes",
    A,
    {
      data: {
        guardians: [
          { id: "t", name: "Anna", email: ANNA.email, linkedUserId: ANNA.id },
        ],
        revokedGuardianIdentities: [String(ANNA.email).toLowerCase()],
      },
    },
    scopeSegreteria,
  );

  prova(
    "W-15a un salvataggio che riporta il legame non riapre l'accesso",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, A),
    "prima: la bandiera si alzava solo sull'altro ramo, e il risultato veniva buttato",
  );

  /* --- W-15b: il registro delle revoche si conserva --- */
  const B = await nuovoFiglio({
    guardians: [{ id: "t", name: "Anna", email: ANNA.email }],
    revokedGuardianIdentities: [String(ANNA.email).toLowerCase()],
  });

  /* Un salvataggio che non riecheggia la chiave la azzerava. */
  await risorseW.updateResource(
    "athletes",
    B,
    { data: { guardians: [{ id: "t", name: "Anna", email: ANNA.email }] } },
    scopeSegreteria,
  );

  prova(
    "W-15b il registro delle revoche sopravvive a un salvataggio che non lo nomina",
    true,
    ((await letto(B))?.revokedGuardianIdentities || []).includes(
      String(ANNA.email).toLowerCase(),
    ),
    "prima: la chiave spariva, e con lei ogni revoca mai fatta",
  );

  /* --- W-15c: i due canali di invio leggono l'elenco --- */
  const promemoriaW = await carica(
    "src/lib/server/medical-certificate-reminders.ts",
  );
  const contattiW = await carica("src/lib/athlete-guardians.ts");

  const rigaSorella = {
    data: {
      guardians: [
        { id: "t-vecchio", name: "Anna", email: ANNA.email },
        { id: "t-sorella", name: "Anna", email: ANNA.email },
      ],
      revokedGuardianIdentities: [String(ANNA.email).toLowerCase()],
    },
    id: "x",
  };

  prova(
    "W-15c la riga sorella non riapre i due canali di invio",
    [0, 0],
    [
      promemoriaW.getGuardianRows(rigaSorella).length,
      contattiW.readAthleteGuardianContacts(rigaSorella).length,
    ],
    "promemoria del certificato e solleciti: leggevano solo il marchio di riga",
  );

  await prisma.athlete.deleteMany({ where: { id: { in: [A, B] } } });

  /*
    **W-16. Le pratiche di iscrizione non sono aperte a chiunque abbia una
    tessera.**

    La voce di catalogo dei moduli diceva `keys: []`, e
    `customRoleReachesResource` su una voce senza chiavi risponde `true`
    **incondizionatamente**: un ruolo di club con una casella sola — o con
    nessuna — leggeva ogni pratica di iscrizione online del club. Codice
    fiscale, data di nascita, indirizzo, telefono e tutori di ogni minore
    iscritto. E poteva **respingerle**, con il proprio nome sulla decisione.

    La motivazione era «i moduli hanno le proprie rotte di dominio», ma quelle
    rotte autorizzano proprio con il registro generico che la riga dichiarava
    non governato: il rimando era circolare, e in mezzo non c'era niente.
  */
  const catalogo = await carica("src/lib/permissions/catalog.ts");

  prova(
    "W-16 le due chiavi dei moduli esistono e sono della gestione",
    [true, true],
    [
      catalogo.roleHasPermission("collaborator", "forms.submissions.read"),
      catalogo.roleHasPermission("collaborator", "forms.submissions.review"),
    ],
  );

  prova(
    "W-16b un ruolo che non lavora sulle pratiche non le legge ne le decide",
    [false, false],
    [
      catalogo.roleHasPermission("trainer", "forms.submissions.read"),
      catalogo.roleHasPermission("trainer", "forms.submissions.review"),
    ],
    "prima: la voce di catalogo era senza chiavi, e passava chiunque",
  );

  /* E il dominio le chiede davvero, non solo il catalogo le dichiara. */
  const inviiW16 = await carica("src/lib/server/form-submissions.ts");
  const scopeSenzaModuli = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    /*
      **Il ruolo che esponeva il buco**: un ruolo di club su base
      collaboratore, con **nessuna** casella. Passa il primo vaglio — la
      risorsa `forms` e fra quelle aperte alla gestione — e prima non ne
      incontrava un secondo.
    */
    activeRole: "custom:collaborator:magazziniere",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  const letturaNegata = await inviiW16
    .listFormSubmissions(scopeSenzaModuli, {})
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-16c e il dominio le chiede, non solo il catalogo le dichiara",
    true,
    /Accesso negato/.test(letturaNegata),
    letturaNegata,
  );

  /* ------------- W7: un ragazzo non e tutore di se stesso --------------- */

  /*
    **W7.** `athleteBelongsToParent` rispondeva vero anche quando chi chiede
    **e** l'atleta, e da li passa tutta l'area famiglia: nome, indirizzo e
    telefono dei propri tutori — dati di terzi — la riga `data` grezza,
    allergie e note mediche, le rate, le ricevute, le fatture; e dai documenti
    i **byte** del certificato medico. E poteva revocare il consenso alle
    immagini dato dal genitore, con l'audit intestato al ruolo `parent`.

    L'area atleta e un elenco chiuso proprio per non mostrare quelle cose, e il
    commento accanto dichiara di non mettere il link ai documenti «perche
    quella rotta risponderebbe». Una difesa che vale finche nessuno digita
    l'indirizzo.
  */
  const UTENTE_RAGAZZO = await utente("ragazzo.pp02@collaudo.invalid", "Elia");
  await prisma.athlete.update({
    where: { id: MARCO },
    data: { user_id: UTENTE_RAGAZZO.id },
  });

  prova(
    "W-07 per le rotte della famiglia un atleta non e tutore di se stesso",
    false,
    await cruscotto.canParentAccessAthlete(UTENTE_RAGAZZO.id, MARCO),
    "prima: vero, e con esso tutta l'area famiglia del proprio profilo",
  );

  const authW7 = await carica("src/lib/server/auth.ts");
  const sessioneRagazzo = await authW7.createSessionForUser(UTENTE_RAGAZZO);
  const rottaCruscottoW7 = await carica(
    "src/app/api/parent-dashboard/[athleteId]/route.ts",
  );
  const rispostaRagazzo = await rottaCruscottoW7.GET(
    new Request("http://collaudo.invalid/api/parent-dashboard/x", {
      headers: { authorization: "Bearer " + sessioneRagazzo.access_token },
    }),
    { params: { athleteId: MARCO } },
  );

  prova(
    "W-08 e la rotta glielo dice, non solo il vaglio",
    true,
    rispostaRagazzo.status >= 400,
    "stato " + rispostaRagazzo.status,
  );

  /*
    **W-12. Le rotte che l'area del ragazzo percorre davvero.**

    `W-09` provava che «la sua area continua a funzionare» chiamando il
    **dominio**, e per questo non ha visto che la sua **bacheca** rispondeva
    403: quella schermata passa da una rotta della famiglia, e chiudere il ramo
    «sono io» l'aveva spenta. Stessa cosa per «segna letta» sulla campanella.

    Qui si percorrono le rotte, una per una, con la sessione del ragazzo. E un
    elenco che va allungato ogni volta che l'area atleta ne usa una nuova.
  */
  const rotteDelRagazzo = [
    ["bacheca", "src/app/api/parent-dashboard/[athleteId]/board/route.ts", "GET"],
    [
      "segna letta una notifica",
      "src/app/api/parent-dashboard/[athleteId]/notifications/route.ts",
      "PATCH",
    ],
  ];

  for (const [nome, percorso, metodo] of rotteDelRagazzo) {
    const modulo = await carica(percorso);
    const risposta = await modulo[metodo](
      new Request("http://collaudo.invalid/api/parent-dashboard/x", {
        method: metodo === "GET" ? "GET" : metodo,
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + sessioneRagazzo.access_token,
        },
        ...(metodo === "GET" ? {} : { body: JSON.stringify({ all: true }) }),
      }),
      { params: { athleteId: MARCO } },
    );

    prova(
      `W-12 ${nome}: la rotta risponde al ragazzo per la propria scheda`,
      true,
      risposta.status < 400,
      "stato " + risposta.status,
    );
  }

  /*
    E la stessa rotta, per un atleta che **non e** lui, continua a negare: il
    ramo «sono io» non e una porta aperta a tutti.
  */
  const bachecaAltrui = await (
    await carica("src/app/api/parent-dashboard/[athleteId]/board/route.ts")
  ).GET(
    new Request("http://collaudo.invalid/api/parent-dashboard/x", {
      headers: { authorization: "Bearer " + sessioneRagazzo.access_token },
    }),
    { params: { athleteId: LUCA } },
  );

  prova(
    "W-12b ma non per la scheda di un altro atleta",
    true,
    bachecaAltrui.status >= 400,
    "stato " + bachecaAltrui.status,
  );

  /*
    **E la sua area resta aperta**, perche e da quegli stessi dati che nasce.
    Se questa diventasse rossa avremmo chiuso una porta e spento una stanza.
  */
  const accessoW7 = await carica("src/lib/server/athlete-accounts.ts");
  const suaArea = await accessoW7
    .readAthleteAreaOverview(UTENTE_RAGAZZO.id)
    .catch((errore) => ({ errore: String(errore?.message || errore) }));

  prova(
    "W-09 ma la sua area atleta continua a funzionare",
    true,
    !suaArea?.errore && Boolean(suaArea?.me?.id),
    suaArea?.errore || "aperta",
  );

  await prisma.athlete.update({
    where: { id: MARCO },
    data: { user_id: null },
  });
};

const main = async () => {
  console.log("PP-02 — collaudo contro il database di sviluppo");
  await semina();

  try {
    await sezioneA();
    await sezioneB();
    await sezioneC();
    await sezioneDE();
    await sezioneGJ();
    await sezioneHI();
    await sezioneL();
    await sezioneK();
    await sezioneO();
    await sezioneM();
    await sezioneR();
    await sezioneS();
    await sezioneT();
    await sezioneW();
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
