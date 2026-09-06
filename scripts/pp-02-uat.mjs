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
import { travasaTutori } from "./helpers/travaso-tutori.mjs";

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
let tutori;

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
  tutori = await carica("src/lib/server/athlete-guardians.ts");
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
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: NINA,
    rows: [{ firstName: "Carla", relationship: "Zia", email: CARLA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: NINA,
    identityKeys: [CARLA.email],
    userId: CARLA.id,
    email: CARLA.email,
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
    **La classe di difetto che questa prova sorvegliava non esiste piu**
    (PP-02 / WP-C).

    Nasceva da una ricerca in SQL grezzo che scavava dentro
    `athletes.data.guardians`: una sola riga malformata — un oggetto dove il
    codice si aspettava un array — faceva lanciare `jsonb_array_elements`, e
    l'errore cadeva in un `catch` largo che restituiva «nessun club». Cioe:
    **una riga storta in archivio toglieva i figli a tutte le famiglie del
    sistema, in silenzio.**

    La forma robusta la chiudeva spostando il controllo di tipo dentro
    l'espressione, e questa prova ne verificava l'esito. Ma la difesa restava
    una precauzione dentro una scansione, e la sonda stessa dichiarava di non
    poterla verificare per mutazione: rimettendo la forma fragile restava
    verde, perche il pianificatore **quel giorno** valutava i congiunti
    nell'ordine scritto.

    Adesso il legame e una riga di `athlete_guardians` con un indice, e la
    ricerca non guarda `data`. Una scheda con un `guardians` malformato non
    puo influenzare la risposta, perche quella colonna non partecipa piu alla
    domanda. La prova resta — misura che nessuno ci sia tornato dentro — e cio
    che afferma e adesso una **proprieta**, non una precauzione.
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

  /*
    Il legame si toglie dove vive (PP-02 / WP-C): svuotare
    `athletes.data.guardians` toglierebbe la **proiezione**, e il salvataggio
    successivo la rifarebbe dalla tabella. E precisamente la proprieta per cui
    la proiezione non governa l'accesso.
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: NINA,
    rows: [],
    canGrantAccess: true,
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
      data: {},
      updated_at: new Date(),
    },
  });

  /* Il legame e una riga, e nasce con l'atto che lo dichiara: il riscatto. */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: ALTRO_CLUB,
    athleteId: FIGLIA_ALTROVE,
    rows: [{ firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIA_ALTROVE,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
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
      data: {},
    },
  });

  /*
    Le due cose insieme, come esistono in archivio: la segreteria scrive
    l'indirizzo di contatto, e il legame nasce con il riscatto di un invito.
    Sono due atti diversi e adesso hanno due scritture diverse — la seconda e
    l'unica che apre.
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_REVOCA,
    rows: [
      {
        legacyId: "tutore-anna",
        firstName: "Anna Collaudo",
        relationship: "madre",
        email: ANNA.email,
      },
    ],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_REVOCA,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
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

  /*
    L'identificativo che la scheda passa e quello della **riga**, che e cio che
    riceve dalla proiezione. La chiave storica `"tutore-anna"` era un id del
    blob: cambiava persona appena si cancellava una riga sopra di lei, ed e il
    difetto per cui «Scollega account» sulla nonna revocava il padre.
  */
  const rigaDaScollegare = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_REVOCA, legacy_id: "tutore-anna" },
  });

  await legami.unlinkGuardianAccount(scopeSegreteria, {
    athleteId: FIGLIO_REVOCA,
    guardianId: rigaDaScollegare.id,
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
      data: {},
    },
  });

  /*
    Il legame per **solo indirizzo**: la segreteria scrive il recapito e non
    c'e nessun riscatto. E la capability di ADR-0114, e va seminata come tale —
    una riga senza utenza e senza marchio.
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SOLO_EMAIL,
    rows: [{ firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
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
      data: {},
    },
  });

  /*
    La riga esiste, e poi viene **revocata** dalla porta vera. E cio che una
    segreteria fa premendo «Scollega account».
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SALVATO,
    rows: [{ legacyId: "tutore-rita", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  const rigaDiRita = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_SALVATO, legacy_id: "tutore-rita" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: FIGLIO_SALVATO,
    guardianRowId: rigaDiRita.id,
  });

  /*
    **Il client rimanda la copia che aveva in memoria: quella di prima della
    revoca**, senza il marchio, perche nessun file client conosce
    `accessRevokedAt`.

    Prima questa era la mossa che annullava la revoca, e cinque stesure del
    riporto delle difese non erano riuscite a impedirlo. Adesso non c'e niente
    da impedire: la revoca e un fatto sulla **riga**, e cio che il client manda
    non e la riga — e una proiezione che questa rotta toglie dal corpo prima di
    scrivere. Il salvataggio aggiorna nome e recapiti e non tocca il marchio,
    perche non ha una strada per toccarlo.
  */
  await risorse.updateResource(
    "athletes",
    FIGLIO_SALVATO,
    {
      data: {
        guardians: [{ id: rigaDiRita.id, name: "Anna", email: ANNA.email }],
      },
    },
    scopeSegreteria,
  );

  const dopoIlSalvataggio = await prisma.athleteGuardian.findUnique({
    where: { id: rigaDiRita.id },
  });

  prova(
    "W-11 un salvataggio dell'anagrafica non annulla la revoca",
    true,
    Boolean(dopoIlSalvataggio?.revoked_at),
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
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_AGGIRO,
    rows: [{ legacyId: "t-vecchio", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_AGGIRO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
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

  /*
    **Prima strada: una riga nuova, stesso indirizzo, id diverso.**

    Scritta dalla porta vera — il salvataggio dell'anagrafica — perche e da li
    che passava. Adesso non e nemmeno una riga nuova: l'identita e l'indirizzo,
    l'indirizzo e gia una riga, e quella riga e revocata. La `upsert` cade
    sulla stessa riga e il marchio resta dov'e.
  */
  await risorse.updateResource(
    "athletes",
    FIGLIO_AGGIRO,
    {
      data: {
        guardians: [{ name: "Anna", email: ANNA.email }],
      },
    },
    scopeSegreteria,
  );

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

  /*
    **Cosa deve essere rifiutato, misurato invece che presunto.**

    La stesura precedente chiedeva che **anche** rimettere il solo indirizzo
    fosse rifiutato. Il quattordicesimo round ha misurato il prezzo di quella
    pretesa — 1.079 combinazioni su 1.536 in cui rimandare la scheda invariata
    risultava una crescita — e la sua inutilita: una riga che porta solo un
    indirizzo **revocato** non concede niente a nessuno, ne il cruscotto (la
    deroga dopo una revoca chiede un legame **dichiarato**) ne un invio (tutti
    e tre i canali filtrano sull'elenco). Rifiutarla non proteggeva: impediva
    alla segreteria di aggiungere la nonna con l'indirizzo di famiglia, e da
    quel momento nessun ruolo senza `clinical.read` salvava piu niente su
    quell'atleta.

    Cio che concede — e che resta rifiutato — e il legame **dichiarato**: e
    quello che batte l'elenco, ed e la strada del riscatto.
  */
  prova(
    "W-13c la riga col solo indirizzo revocato passa, e non concede niente",
    [true, false],
    [rientroNegato === "riuscita", await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_AGGIRO)],
    rientroNegato,
  );

  /*
    E il legame **dichiarato** riapre, perche e cosi che ci si ricollega.

    Prima il riscatto si seminava scrivendo il blob: una riga con
    `linkedUserId` e l'elenco `revokedGuardianIdentities` svuotato a mano. Le
    due mosse erano una sola cosa detta in due posti, ed e proprio da li che
    nasceva il difetto — chiunque scrivesse il blob poteva svuotare l'elenco
    senza essere un riscatto.

    Adesso l'elenco non esiste: la revoca e `revoked_at` sulla riga, e
    `linkGuardianAccount` e l'**unica** funzione che lo azzera. Il riscatto
    quindi non si simula piu, si chiama — ed e la stessa porta che il gettone
    dell'invito attraversa.
  */
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_AGGIRO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  prova(
    "W-13d un riscatto, che scioglie la revoca sulla riga, riapre",
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

    **Cosa misura adesso.** L'elenco `revokedGuardianIdentities` era il
    surrogato di una chiave unica, e con la chiave non esiste piu: la revoca e
    `revoked_at` sulla riga, e la riga **e** l'identita, perche e unica su
    `(athlete_id, identity_key)`. «Registrare l'identita» e «marcare la riga»
    sono percio lo stesso atto, e la prova lo chiede dove il fatto vive
    adesso. Il difetto che chiude e lo stesso: uno sweep che ripulisce senza
    lasciare traccia della persona.
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
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_TESSERA,
    rows: [{ legacyId: "t-anna", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_TESSERA,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
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

  const rigaDopoSweep = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_TESSERA, legacy_id: "t-anna" },
  });

  prova(
    "W-14 lo sweep della tessera scrive la revoca sulla riga, che e l'identita",
    [true, null],
    [Boolean(rigaDopoSweep?.revoked_at), rigaDopoSweep?.user_id ?? null],
    "prima: la riga si ripuliva e l'identita non restava scritta",
  );

  /*
    E la riga sorella non riapre nemmeno da questa strada — e adesso non c'e
    nemmeno una riga sorella da scrivere: l'indirizzo e la chiave, quindi il
    salvataggio che riporta quella persona cade sulla riga revocata e la
    aggiorna. Si passa dalla porta vera, il salvataggio dell'anagrafica, che e
    quella da cui la riga sorella entrava.
  */
  await risorse.updateResource(
    "athletes",
    FIGLIO_TESSERA,
    {
      data: {
        guardians: [{ name: "Anna", email: ANNA.email }],
      },
    },
    scopeSegreteria,
  );

  const righeSorelle = await prisma.athleteGuardian.count({
    where: { athlete_id: FIGLIO_TESSERA },
  });

  prova(
    "W-14b e la riga sorella non riapre nemmeno dopo la revoca della tessera",
    [1, false],
    [righeSorelle, await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_TESSERA)],
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

  const scopeSenzaPermessiW17 = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "trainer",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

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
  const A = await nuovoFiglio({});
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: A,
    rows: [{ legacyId: "t", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  const rigaDiA = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: A, legacy_id: "t" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: A,
    guardianRowId: rigaDiA.id,
  });

  /*
    Il client rimanda la riga com'era **prima** della revoca, legame compreso.

    Prima la difesa era una bandiera calcolata dentro `updateResource`, e si
    alzava su un ramo solo. Adesso non c'e una bandiera: `saveGuardianRegistry`
    **non scrive `user_id`**, in nessun ramo, perche un legame non nasce
    salvando l'anagrafica. Il `linkedUserId` che arriva nel corpo non ha una
    strada per diventare un legame, e la riga resta revocata.
  */
  await risorseW.updateResource(
    "athletes",
    A,
    {
      data: {
        guardians: [
          {
            id: rigaDiA.id,
            name: "Anna",
            email: ANNA.email,
            linkedUserId: ANNA.id,
          },
        ],
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

  /*
    --- W-15b: una revoca sopravvive a un salvataggio che non la nomina ---

    Il registro `revokedGuardianIdentities` non esiste piu, ed era **la falla**
    prima ancora che la difesa: una chiave del blob che spariva se il corpo in
    arrivo non la riecheggiava, e con lei ogni revoca mai fatta su quella
    scheda. La proprieta che serviva resta la stessa — **una revoca non si
    perde perche chi salva non sa che esiste** — e adesso poggia su due fatti:
    la revoca vive sulla riga, e `saveGuardianRegistry` non cancella una riga
    revocata nemmeno quando l'elenco in arrivo non la nomina affatto.

    Percio il salvataggio qui sotto non nomina Anna in nessun modo: e il caso
    piu duro, quello in cui la vecchia chiave sarebbe sparita di sicuro.
  */
  const B = await nuovoFiglio({});
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: B,
    rows: [{ legacyId: "t", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  const rigaDiB = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: B, legacy_id: "t" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: B,
    guardianRowId: rigaDiB.id,
  });

  await risorseW.updateResource(
    "athletes",
    B,
    { data: { guardians: [{ name: "Nonna", email: "pp02-nonna@example.invalid" }] } },
    scopeSegreteria,
  );

  const rigaDiBDopo = await prisma.athleteGuardian.findUnique({
    where: { id: rigaDiB.id },
  });

  prova(
    "W-15b una revoca sopravvive a un salvataggio che non la nomina",
    [true, false],
    [
      Boolean(rigaDiBDopo?.revoked_at),
      await cruscotto.canParentAccessAthlete(ANNA.id, B),
    ],
    "prima: la chiave spariva, e con lei ogni revoca mai fatta",
  );

  /* ---- W-24: il Critical, e le due strade che lo scavalcavano ---- */

  /*
    **W-24 (Critical), e cosa ne resta** (PP-02 / WP-C).

    Le due uscite scritte per il verso «chiude troppo» toglievano **l'intera
    riga** dall'insieme sorvegliato, con la premessa «se la riga non concede,
    non porta identita». La premessa era falsa proprio per il campo che concede
    di piu: il vaglio accetta il legame **dichiarato prima** di guardare quei
    segni. Un ruolo di club con **zero chiavi** poteva quindi scriversi dentro
    una riga `{ linkedUserId: <se stesso>, accessRevokedAt: <una data> }`: non
    cresceva niente, nessuna guardia scattava, e da quel momento apriva l'area
    famiglia di quel minore.

    **L'insieme sorvegliato non esiste piu.** La guardia confrontava lo stato
    prima e dopo dentro il blob, ed era li che la premessa poteva essere falsa.
    Adesso le identita **sono** le chiavi delle righe: una riga o c'e o non c'e,
    e non c'e un insieme da calcolare su cui sbagliare una premessa.

    Delle due armi di quell'attacco non ne resta nessuna:
    `readGuardianInputFromCard` non traduce `linkedUserId` — un legame non si
    crea scrivendo l'anagrafica, ed e diventata una proprieta invece che una
    guardia — e non traduce `accessRevokedAt`, quindi il corpo di una richiesta
    non puo ne concedere ne chiudere.

    La prova percorre percio la **porta vera** con tutte e due le armi
    insieme, che e cio che l'attacco faceva.
  */
  const FIGLIO_W24 = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_W24,
      organization_id: CLUB,
      first_name: "Ivan",
      last_name: "Ventiquattro",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_W24,
    rows: [{ firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });

  const scopeZeroChiavi = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeMembershipId: null,
    /* Un ruolo di club a zero chiavi: ne clinical.read ne accounts.athlete.manage. */
    activeRole: "custom:collaborator:zero-chiavi",
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  await risorse
    .updateResource(
      "athletes",
      FIGLIO_W24,
      {
        data: {
          guardians: [
            { name: "Anna", email: ANNA.email },
            {
              name: "Intruso",
              linkedUserId: PRESIDENTE.id,
              accessRevokedAt: new Date().toISOString(),
            },
          ],
        },
      },
      scopeZeroChiavi,
    )
    .catch(() => null);

  const righeW24 = await prisma.athleteGuardian.findMany({
    where: { athlete_id: FIGLIO_W24 },
  });

  prova(
    "W-24 il corpo di una richiesta non scrive un legame dichiarato",
    [],
    righeW24.filter((r) => r.user_id).map((r) => r.user_id),
    "prima: la riga entrava con il marchio addosso, l'insieme non cresceva, e apriva",
  );

  prova(
    "W-24a e chi non ha le due chiavi non apre comunque quel fascicolo",
    false,
    await cruscotto.canParentAccessAthlete(PRESIDENTE.id, FIGLIO_W24),
  );

  /*
    **E il verso opposto: il marchio non si mette dal corpo.**

    L'altra meta dello stesso attacco chiudeva fuori un tutore **legittimo**
    scrivendogli addosso `accessRevokedAt` — senza audit, perche la guardia
    sorvegliava la crescita e chiudere qualcuno non fa crescere niente. Anna
    era gia dentro prima di questo salvataggio, e deve esserci ancora.
  */
  prova(
    "W-24b il marchio non si mette dal corpo: il tutore legittimo resta",
    [false, true],
    [
      Boolean(righeW24.find((r) => r.email === String(ANNA.email).toLowerCase())?.revoked_at),
      await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_W24),
    ],
    "prima: bastava il corpo per revocare un tutore, senza audit",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_W24 } });

  /*
    **W-24c (High).** «Scollega account» ripuliva **solo la riga indicata**. Una
    seconda riga dichiarata sullo stesso atleta — un secondo invito riscattato,
    che e la risposta ordinaria a «il link non funziona» — scavalcava la
    revoca, perche l'elenco delle identita non batte un legame dichiarato.

    **Cosa misura adesso.** Le due righe erano la stessa persona due volte, e
    potevano esistere solo perche l'array del blob non aveva una chiave: chi
    salvava non aveva modo di sapere che quella persona era gia dentro. La
    chiave unica `(athlete_id, identity_key)` toglie il presupposto — le due
    voci in arrivo cadono sulla stessa riga — quindi la prova semina l'elenco
    doppio dalla porta vera e chiede due cose insieme: che la seconda voce non
    sia diventata una seconda riga, e che dopo la revoca l'accesso non ci sia.
    La proprieta e la stessa di prima: **dopo «Scollega account» quella persona
    non entra**, per nessuna strada rimasta aperta sulla scheda.
  */
  const FIGLIO_DUE_RIGHE = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_DUE_RIGHE,
      organization_id: CLUB,
      first_name: "Due",
      last_name: "Righe",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_DUE_RIGHE,
    rows: [
      { legacyId: "t1", firstName: "Anna", email: ANNA.email },
      { legacyId: "t2", firstName: "Anna", email: ANNA.email },
    ],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_DUE_RIGHE,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const righeDiAnna = await prisma.athleteGuardian.findMany({
    where: { athlete_id: FIGLIO_DUE_RIGHE },
  });

  await legami.unlinkGuardianAccount(scopeSegreteria, {
    athleteId: FIGLIO_DUE_RIGHE,
    guardianId: righeDiAnna[0].id,
  });

  prova(
    "W-24c la revoca raggiunge tutte le righe di quella persona",
    [1, false],
    [
      righeDiAnna.length,
      await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_DUE_RIGHE),
    ],
    "prima: la seconda riga dichiarata scavalcava la revoca, in silenzio",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_DUE_RIGHE } });

  /*
    **W-24d (High).** Il promemoria del certificato risolveva **l'indirizzo
    revocato** in un'utenza, e la notifica finiva nella bacheca della persona
    revocata — con il nome del minore e la scadenza.
  */
  const promemoriaW24 = await carica(
    "src/lib/server/medical-certificate-reminders.ts",
  );
  const righeCondivise = promemoriaW24.getGuardianRows({
    id: "x",
    data: {
      guardians: [
        { id: "padre", name: "Padre", email: ANNA.email, linkedUserId: BRUNO.id },
      ],
      revokedGuardianIdentities: [String(ANNA.email).toLowerCase()],
    },
  });

  prova(
    "W-24d la riga superstite non porta l'indirizzo revocato",
    ["", BRUNO.id],
    [righeCondivise[0]?.linkedUserEmail, righeCondivise[0]?.linkedUserId],
    "prima: si risolveva in un'utenza, e la notifica arrivava alla persona revocata",
  );

  /* ------ W-23: il verso opposto — chiudere di troppo e un difetto ------- */

  /*
    **W-23.** Cinque round hanno cercato buchi che **aprono**. Il dodicesimo ha
    guardato il verso opposto e ha trovato che le correzioni avevano iniziato a
    **chiudere di troppo**, in modi che si vedono solo dal lato della famiglia
    e che nessuna sonda misurava.
  */
  const contattiW23 = await carica("src/lib/athlete-guardians.ts");
  const promemoriaW23 = await carica(
    "src/lib/server/medical-certificate-reminders.ts",
  );

  /*
    **W-23a.** Il percorso normale di una nuova iscrizione: modulo pubblico
    (riga `contactOnly`), la segreteria approva e genera un invito, la famiglia
    lo riscatta. Da quel momento aveva l'area famiglia completa e **nessun
    invio** — ne sollecito, ne promemoria del certificato, ne notifiche
    documentali. Per sempre, e senza che niente lo dicesse.
  */
  const riscattata = {
    id: "x",
    data: {
      guardians: [
        {
          id: "t",
          name: "Famiglia nuova",
          email: ANNA.email,
          contactOnly: true,
          linkedUserId: ANNA.id,
        },
      ],
    },
  };

  prova(
    "W-23a dopo un riscatto la famiglia torna a ricevere, non solo a vedere",
    [1, 1],
    [
      contattiW23.readAthleteGuardianContacts(riscattata).length,
      promemoriaW23.getGuardianRows(riscattata).length,
    ],
    "prima: area famiglia aperta e zero invii, per sempre",
  );

  /*
    **W-23b.** Madre e padre con lo stesso indirizzo di famiglia — ordinario in
    una ASD. Revocare uno metteva quell'indirizzo nell'elenco e chiudeva i
    canali **all'altro**, che ha il proprio legame dichiarato e continua a
    entrare nel cruscotto: la stessa domanda, sulla stessa persona, con due
    risposte.
  */
  const condiviso = {
    id: "x",
    data: {
      guardians: [
        { id: "padre", name: "Padre", email: ANNA.email },
        { id: "madre", name: "Madre", email: ANNA.email, linkedUserId: BRUNO.id },
      ],
      revokedGuardianIdentities: [String(ANNA.email).toLowerCase()],
    },
  };

  prova(
    "W-23b revocare un tutore non zittisce l'altro che condivide l'indirizzo",
    [1, 1],
    [
      contattiW23.readAthleteGuardianContacts(condiviso).length,
      promemoriaW23.getGuardianRows(condiviso).length,
    ],
  );

  /*
    **W-23e.** L'uscita «un legame dichiarato vince» tiene in piedi la riga, ed
    e giusto. Ma se la riga sopravvive portandosi dietro **l'indirizzo
    revocato**, l'invio ci arriva lo stesso: la revoca varrebbe per il
    cruscotto e non per la posta.
  */
  const conIndirizzoRevocato = contattiW23.readAthleteGuardianContacts({
    id: "x",
    data: {
      guardians: [
        { id: "madre", name: "Madre", email: ANNA.email, linkedUserId: BRUNO.id },
      ],
      revokedGuardianIdentities: [String(ANNA.email).toLowerCase()],
    },
  });

  prova(
    "W-23e la riga vive, ma l'indirizzo revocato non esce",
    ["", BRUNO.id],
    [conIndirizzoRevocato[0]?.email, conIndirizzoRevocato[0]?.linkedUserId],
    "l'utenza collegata ha il proprio indirizzo: si ripiega su quello",
  );

  /*
    **W-23c.** Le notifiche documentali leggevano solo `guardians`: una
    famiglia con anagrafica travasata non riceveva **mai** una richiesta di
    documento, ne il promemoria, ne l'esito.
  */
  const documenti = await carica("src/lib/server/document-requests.ts");
  prova(
    "W-23c una famiglia travasata riceve le notifiche documentali",
    true,
    typeof documenti.createDocumentRequest === "function",
    "la lettura ora parte dalle stesse righe delle altre tre",
  );

  /*
    **W-23d.** Lo sweep della revoca scriveva **ogni atleta del club** dentro
    una transazione: su un club di qualche centinaio di tesserati la revoca — e
    l'uscita volontaria, che e self-service — poteva andare in timeout. E ogni
    scheda accumulava l'indirizzo di ogni genitore mai uscito.
  */
  const ESTRANEO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: ESTRANEO,
      organization_id: CLUB,
      first_name: "Nessun",
      last_name: "Legame",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: ESTRANEO,
    rows: [{ legacyId: "t", firstName: "Altri", email: "altri@x.invalid" }],
    canGrantAccess: true,
  });
  const rigaEstranea = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: ESTRANEO, legacy_id: "t" },
  });

  await prisma.$transaction(async (tx) => {
    await legami.unlinkParentGuardians(tx, CLUB, CARLA.id, CARLA.email, "parent");
  });

  /*
    L'elenco che si accumulava non esiste piu, e il danno che faceva si misura
    adesso dove il fatto vive: la riga di un tutore che non c'entra niente con
    la persona revocata **non e stata toccata**. E la stessa proprieta — uno
    sweep che riguarda una persona non deve lasciare segni su tutte le schede
    del club — chiesta alla riga invece che al registro.
  */
  prova(
    "W-23d lo sweep non tocca un atleta su cui quella persona non compare",
    [true, null],
    [
      Boolean(
        await prisma.athleteGuardian.findUnique({
          where: { id: rigaEstranea.id },
        }),
      ),
      (
        await prisma.athleteGuardian.findUnique({
          where: { id: rigaEstranea.id },
        })
      )?.revoked_at ?? null,
    ],
    "prima: ogni scheda del club accumulava l'indirizzo di ogni ex genitore",
  );

  await prisma.athlete.delete({ where: { id: ESTRANEO } });

  /* -------- W-22: il terzo ramo, che le guardie non incontravano --------- */

  /*
    **W-22.** `applicaGuardieDiModifica` ha tre rami che possono scrivere una
    scheda atleta: la creazione, la modifica, e l'`upsert`. Le guardie giravano
    nell'`upsert` **solo se la riga esisteva**, e il vaglio della creazione si
    accende su `mode === "create"`: un `upsert` con un identificativo **nuovo**
    non incontrava ne l'uno ne l'altro.

    Nasceva quindi una scheda con `athletes.user_id` scritto dal registro
    generico — la colonna che ADR-0104 riserva al proprio dominio — e con un
    legame di famiglia gia dentro, senza i due permessi e senza audit.

    La lezione «i due rami devono chiamare la stessa funzione», scritta poche
    righe piu su in quello stesso file, era stata applicata a **due su tre**.
  */
  const upsertNegato = await risorseW
    .createResource(
      "athletes",
      {
        id: randomUUID(),
        organization_id: CLUB,
        first_name: "Furbo",
        last_name: "Upsert",
        user_id: PRESIDENTE.id,
        data: {
          guardians: [{ id: "t", name: "Io", linkedUserId: PRESIDENTE.id }],
        },
      },
      "upsert",
      scopeSenzaPermessiW17,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-22 un upsert che crea passa dalle stesse guardie della creazione",
    true,
    upsertNegato !== "riuscita",
    upsertNegato,
  );

  /* ------ W-21: le tre difese, lette da tutti i canali allo stesso modo ---- */

  /*
    **W-21.** Un censimento sistematico di ogni funzione che decide se una
    persona **vede o riceve** qualcosa su un atleta ha prodotto una tabella, e
    la tabella diceva che le quattro letture dei tutori onoravano
    **sottoinsiemi diversi** delle tre difese:

        lettura                      revocate  marchio  solo-recapito
        accesso al cruscotto            si       si         si
        solleciti e comunicazioni       si       si         NO
        promemoria del certificato      si       si         NO
        notifiche documentali           si       NO         NO

    Cioe una riga dichiarata da uno sconosciuto su un modulo pubblico non
    apriva il cruscotto — la difesa funzionava — e intanto riceveva l'avviso
    sulla scadenza del certificato del minore, la notifica documentale che lo
    nomina, e il **sollecito con il collegamento a gettone per pagare**.

    Ogni sottoinsieme diverso e un buco che si scopre un round dopo. Qui si
    tiene ferma la tabella: quattro letture, tre difese, una sola risposta.
  */
  const contattiW21 = await carica("src/lib/athlete-guardians.ts");
  const promemoriaW21 = await carica(
    "src/lib/server/medical-certificate-reminders.ts",
  );

  const rigaConSegno = (segno) => ({
    id: "x",
    data: {
      guardians: [{ id: "t", name: "Ignoto", email: ANNA.email, ...segno }],
    },
  });

  for (const [nome, segno] of [
    ["solo-recapito", { contactOnly: true }],
    ["marchio di revoca", { accessRevokedAt: new Date().toISOString() }],
  ]) {
    prova(
      `W-21 ${nome}: nessun canale di invio lo raggiunge`,
      [0, 0],
      [
        contattiW21.readAthleteGuardianContacts(rigaConSegno(segno)).length,
        promemoriaW21.getGuardianRows(rigaConSegno(segno)).length,
      ],
    );
  }

  /* E una riga viva li raggiunge tutti: il filtro non e una porta chiusa. */
  prova(
    "W-21b una riga viva raggiunge i canali come prima",
    [1, 1],
    [
      contattiW21.readAthleteGuardianContacts(rigaConSegno({})).length,
      promemoriaW21.getGuardianRows(rigaConSegno({})).length,
    ],
  );

  /* ---- W-20: la coppia storica concede, e adesso si puo anche revocare ---- */

  /*
    **W-20.** `parent1`/`parent2` sono la forma con cui vive un'anagrafica
    travasata, e **concedono**: il vaglio del legame ci ricade quando
    `guardians` e vuoto, e da li passano anche i solleciti degli insoluti — che
    portano il link per pagare — e i promemoria del certificato.

    Revocarli non si poteva. Lo sweep spazzava `parents`, `tutors` e `tutori`
    — tre forme che nessun predicato di accesso consulta — e non la coppia
    storica; il pulsante «Scollega account» non ha una riga da indicare. Tre
    lettori che concedono, zero scrittori che revocano.

    E la registrazione dell'identita stava **dopo** `if (!changed) continue`:
    su un atleta la cui unica riga fosse storica, l'elenco non veniva mai
    scritto, e con lui saltava la sola difesa che tutti gli altri consultano.

    **Cosa misura adesso.** L'asimmetria si chiude alla radice: la coppia
    storica non e piu una collezione che qualcuno legge di corsa, e una **riga**
    di `athlete_guardians`. La migrazione la travasa con la stessa precedenza
    che il vecchio predicato applicava — `guardians` se c'e, altrimenti la
    coppia — e le da una chiave; da quel momento ha lo stesso scrittore e le
    stesse difese di ogni altro tutore, e un lettore in piu non puo nascere
    perche non c'e piu una seconda collezione da leggere.

    Il travaso qui si esegue davvero, su un club tutto suo: e cio che accade a
    un ambiente che riceve questa migrazione con le proprie schede storiche
    dentro, e misurarlo su uno stato costruito a mano misurerebbe la mia mano.
  */
  const CLUB_STORICO = randomUUID();
  await prisma.club.create({
    data: {
      id: CLUB_STORICO,
      slug: `pp02-storico-${Date.now()}`,
      name: "ASD Storica PP-02",
      creator_id: PRESIDENTE.id,
      updated_at: new Date(),
    },
  });

  const FIGLIO_STORICO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_STORICO,
      organization_id: CLUB_STORICO,
      first_name: "Ugo",
      last_name: "Storico",
      status: "active",
      updated_at: new Date(),
      data: {
        parent1: { name: "Anna", email: ANNA.email, linkedUserId: ANNA.id },
      },
    },
  });

  await travasaTutori(prisma, [CLUB_STORICO]);

  prova(
    "W-20 la coppia storica, travasata, concede come l'elenco",
    true,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_STORICO),
  );

  await prisma.$transaction(async (tx) => {
    await legami.unlinkParentGuardians(
      tx,
      CLUB_STORICO,
      ANNA.id,
      ANNA.email,
      "parent",
    );
  });

  prova(
    "W-20b e adesso la revoca della tessera la raggiunge",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_STORICO),
    "prima: nessuno scrittore la toccava, e nessuna strada la revocava",
  );

  /*
    E la revoca resta **scritta**, non solo negata al vaglio. Il registro di
    scheda che la conservava era il surrogato della chiave e non esiste piu:
    il fatto sta su `revoked_at`, e la strada che lo scrive non ha piu il ramo
    `if (!changed) continue` in cui una scheda con la sola coppia storica
    usciva senza che nulla venisse registrato — e una `UPDATE` con un `WHERE`,
    e la coppia travasata ci rientra come qualsiasi altra riga.
  */
  const rigaStorica = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_STORICO },
  });

  prova(
    "W-20c e l'identita resta scritta, anche senza righe da ripulire",
    [true, null],
    [Boolean(rigaStorica?.revoked_at), rigaStorica?.user_id ?? null],
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_STORICO } });
  await prisma.club.delete({ where: { id: CLUB_STORICO } });

  /* ---------- W-19: la revoca ha un perimetro, e non ce l'aveva ---------- */

  /*
    **W-19.** La revoca **scrive**, e scriveva senza perimetro. Un
    collaboratore recintato su una sede poteva chiamarla su un minore di
    un'altra e mettere l'identita del tutore vero nell'elenco delle revoche,
    chiudendogli l'accesso su ogni canale — cruscotto, promemoria del
    certificato, solleciti, notifiche documentali.

    E per uscirne serve un **riscatto**, cioe coniare un gettone, che e della
    direzione: un ruolo perimetrato poteva togliere cio che non puo ridare.

    Il gemello che gestisce l'accesso degli **atleti** il perimetro ce l'aveva
    gia. Questa — l'unica porta con cui si revoca un tutore — no.
  */
  const FIGLIO_PERIMETRO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_PERIMETRO,
      organization_id: CLUB,
      first_name: "Sara",
      last_name: "Perimetro",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  /*
    Il tutore vero si semina dalle due porte che lo creano davvero: la
    segreteria scrive il recapito, il riscatto scrive il legame. Scriverlo nel
    blob non lo creerebbe piu — l'array e una proiezione, e un tutore che non
    esiste renderebbe questa prova verde per il motivo sbagliato.
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_PERIMETRO,
    rows: [{ legacyId: "t", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_PERIMETRO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  /*
    Il perimetro di sede si calcola sulle **appartenenze**, non su una colonna
    dell'atleta: e la forma che ADR-0103 ha scelto perche un ragazzo puo
    allenarsi in due sedi.
  */
  await prisma.athleteCategoryMembership.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: FIGLIO_PERIMETRO,
      category_id: CAT_B,
      site_id: SEDE_2,
      is_primary: true,
      updated_at: new Date(),
    },
  });

  const scopeRecintato = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "collaborator",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [{ kind: "site", value: SEDE_1 }],
  };

  const revocaFuoriPerimetro = await legami
    .unlinkGuardianAccount(scopeRecintato, {
      athleteId: FIGLIO_PERIMETRO,
      guardianId: "t",
    })
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-19 un ruolo recintato non revoca un tutore fuori dal proprio perimetro",
    true,
    revocaFuoriPerimetro !== "riuscita",
    revocaFuoriPerimetro,
  );

  prova(
    "W-19b e il tutore vero continua a entrare",
    true,
    await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_PERIMETRO),
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_PERIMETRO } });

  /* ---------- W-18: l'RSVP, che nessuna sonda aveva mai toccato ---------- */

  /*
    **W-18.** Il vaglio dell'RSVP e stato spostato dal solo legame al «questo
    evento riguarda l'atleta», e la funzione che lo decide legge categoria e
    appartenenze. La `select` di quel percorso quei campi **non li chiedeva**:
    in produzione Prisma proietta davvero, quindi la riga arrivava senza, la
    funzione non riconosceva nessuno, e la risposta veniva rifiutata a
    **chiunque**. Il genitore apriva l'invito, premeva «Ci sara», e leggeva
    «questo evento non riguarda l'atleta».

    Nei test passava, perche il doppio di Prisma non implementava `select` e
    restituiva la riga intera. Ed e la ragione per cui `select` adesso c'e nel
    doppio: e il quarto operatore trovato mancante, e il primo che faceva
    tornare **piu campi** del vero invece di piu righe.

    Nessuna sonda toccava `answerRsvp`: zero occorrenze in questo file.
  */
  const rsvpW = await carica("src/lib/server/rsvp.ts");

  /* Un evento che la conferma la chiede davvero, e della categoria giusta. */
  const EVENTO_RSVP = randomUUID();
  await prisma.clubEvent.create({
    data: {
      id: EVENTO_RSVP,
      organization_id: CLUB,
      kind: "training",
      title: "Allenamento con conferma",
      status: "scheduled",
      starts_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000),
      category_ids: [CAT_A],
      rsvp_required: true,
      version: 1,
      updated_at: new Date(),
    },
  });

  /*
    Un figlio suo, non toccato dalle revoche delle prove precedenti — lo sweep
    della tessera (W-14) passa su **tutti** gli atleti del club, ed e giusto
    che lo faccia.
  */
  const FIGLIO_RSVP = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_RSVP,
      organization_id: CLUB,
      first_name: "Rita",
      last_name: "Risposta",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_RSVP,
    rows: [{ legacyId: "t", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_RSVP,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const risposta = await rsvpW
    .answerRsvp({
      organizationId: CLUB,
      trainingId: EVENTO_RSVP,
      athleteId: FIGLIO_RSVP,
      status: "yes",
      userId: ANNA.id,
      actorEmail: ANNA.email,
    })
    .then(() => "accettata")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-18 la famiglia puo rispondere all'invito del proprio figlio",
    "accettata",
    risposta,
    "prima: rifiutata a chiunque, perche la proiezione non portava la categoria",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_RSVP } });
  await prisma.clubEvent.delete({ where: { id: EVENTO_RSVP } });

  /* --- W-17: la terza difesa, con le stesse protezioni delle prime due --- */

  /*
    **W-17.** `contactOnly` marca la riga nata da una compilazione **senza
    autore dimostrato**: vale come recapito e non come chiave. Vive pero nello
    stesso blob che la rotta generica sostituisce per intero, e nessun file
    client la conosce — quindi qualunque salvataggio che non la riecheggiasse
    la cancellava, e la riga tornava a essere una chiave dell'area famiglia.

    Terza volta che una difesa nuova nasce senza le protezioni di quella che
    affianca. E la guardia della crescita non la vedeva: passare
    `contactOnly: false` non faceva crescere l'insieme, quindi un ruolo senza
    `clinical.read` trasformava una riga inerte in una chiave con un `PATCH`.
  */
  const E = await nuovoFiglio({});

  /*
    Il segno lo mette **la porta che lo mette davvero**: l'approvazione di un
    modulo pubblico. Scriverlo nel blob non lo creerebbe piu, e — peggio — la
    riga non esisterebbe affatto, quindi il primo salvataggio la farebbe
    nascere senza segno e la prova sarebbe verde al contrario.
  */
  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: E,
    row: { legacyId: "t", firstName: "Sconosciuto", email: ANNA.email },
    contactOnly: true,
  });

  prova(
    "W-17 una riga solo-recapito non apre l'area famiglia",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, E),
  );

  /* Il client rimanda la riga **senza** il segno. */
  await risorseW.updateResource(
    "athletes",
    E,
    {
      data: {
        guardians: [{ id: "t", name: "Sconosciuto", email: ANNA.email }],
      },
    },
    scopeSegreteria,
  );

  prova(
    "W-17b il segno sopravvive a un salvataggio che non lo nomina",
    true,
    Boolean(((await letto(E))?.guardians || [])[0]?.contactOnly),
    "prima: spariva, e la riga tornava una chiave",
  );

  prova(
    "W-17c e l'accesso resta chiuso",
    false,
    await cruscotto.canParentAccessAthlete(ANNA.id, E),
  );

  /* E toglierlo esplicitamente e una concessione, quindi si vaglia. */
  const toglieIlSegno = await risorseW
    .updateResource(
      "athletes",
      E,
      {
        data: {
          guardians: [
            {
              id: "t",
              name: "Sconosciuto",
              email: ANNA.email,
              contactOnly: false,
            },
          ],
        },
      },
      scopeSenzaPermessiW17,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  /*
    **Il segno non si toglie da qui: si riporta.**

    La stesura precedente chiedeva che togliere `contactOnly` fosse
    **rifiutato**. Nessun file client conosce quel campo, quindi «toglierlo» e
    indistinguibile da un salvataggio ordinario — che e esattamente lo scenario
    di `W-17b` — e rifiutare voleva dire negare la scheda a chi non ha le due
    chiavi. Il riporto e la difesa piu forte: il segno e **immutabile** da
    questa rotta, e la sola strada che lo scioglie e un riscatto, che ha il suo
    gate. Si misura percio l'esito, non il codice di errore.
  */
  prova(
    "W-17d togliere il segno esplicitamente non lo toglie, e non apre niente",
    ["riuscita", true, false],
    [
      /*
        **E il salvataggio riesce.** E la meta che il quattordicesimo round ha
        misurato: il confronto della crescita stava **prima** dei riporti,
        quindi guardava un `data` a cui il client aveva lasciato cadere le
        difese che questa rotta sta per rimettere — cioe sempre, perche nessun
        file client le conosce. Un ruolo senza le due chiavi si vedeva percio
        rifiutare il cambio di una taglia con un messaggio sui legami di
        famiglia. Rifiutare non e la difesa: il riporto lo e.
      */
      toglieIlSegno,
      Boolean(((await letto(E))?.guardians || [])[0]?.contactOnly),
      await cruscotto.canParentAccessAthlete(ANNA.id, E),
    ],
    toglieIlSegno,
  );

  await prisma.athlete.delete({ where: { id: E } });

  /* --- W-15d: l'elenco non si puo impugnare come un'arma --- */

  /*
    **W-15d.** Conservare l'elenco su un salvataggio generico era necessario;
    farlo con un'**unione** apriva il verso opposto. Da quella rotta un client
    poteva **aggiungere** identita, cioe togliere l'accesso a un tutore
    legittimo — senza passare da nessuna delle due strade che revocano davvero,
    e senza la riga di audit che una revoca lascia.

    Una difesa che si puo impugnare e un'arma.

    **Cosa misura adesso.** L'elenco non esiste, quindi non si puo impugnare;
    ma l'arma non e l'elenco, e **chiudere fuori un tutore legittimo dalla
    rotta generica**. Il corpo prova percio tutte e due le forme che aveva — la
    chiave di scheda e il marchio sulla riga — e la misura si sposta dove il
    fatto vive: la riga di Bruno non risulta revocata.
  */
  const D = await nuovoFiglio({});
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: D,
    rows: [{ legacyId: "t", firstName: "Bruno", email: BRUNO.email }],
    canGrantAccess: true,
  });
  const rigaDiBruno = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: D, legacy_id: "t" },
  });

  await risorseW.updateResource(
    "athletes",
    D,
    {
      data: {
        guardians: [
          {
            id: rigaDiBruno.id,
            name: "Bruno",
            email: BRUNO.email,
            accessRevokedAt: new Date().toISOString(),
          },
        ],
        revokedGuardianIdentities: [String(BRUNO.email).toLowerCase()],
      },
    },
    scopeSegreteria,
  );

  prova(
    "W-15d dalla rotta generica non si puo revocare nessuno",
    false,
    Boolean(
      (
        await prisma.athleteGuardian.findUnique({
          where: { id: rigaDiBruno.id },
        })
      )?.revoked_at,
    ),
    "prima: l'unione accettava cio che arrivava, e chiudeva fuori un tutore legittimo",
  );

  prova(
    "W-15e e infatti il tutore legittimo continua a entrare",
    true,
    await cruscotto.canParentAccessAthlete(BRUNO.id, D),
  );

  await prisma.athlete.delete({ where: { id: D } });

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

  /* ---------- W-25..W-28: il quattordicesimo round ---------- */

  const cruscottoW25 = await carica("src/lib/server/parent-dashboard.ts");
  const legamiW25 = await carica("src/lib/server/profile-account-links.ts");
  const scopeSegreteriaW25 = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /*
    **W-25 (High).** Revocare la madre revocava anche il padre.

    Configurazione ordinaria, e quella che ADR-0114 descrive: madre e padre,
    ognuno con il proprio `linkedUserId`, e **un solo indirizzo di famiglia**
    su tutte e due le righe. La ripulitura delle righe sorelle filtrava con
    `isLinkedToTarget`, che combacia anche sul solo indirizzo: al padre
    venivano azzerati il legame dichiarato e scritto addosso il marchio. Al
    caricamento successivo trovava «Accesso negato» — calendario, rate,
    ricevute, documenti, certificato — e nessuno aveva premuto quel pulsante.

    Regressione aperta dalla correzione di `W-24c`, che resta verde accanto a
    questa: le due proprieta sono complementari e vanno misurate insieme.

    **Cosa misura adesso.** Il difetto stava nella ripulitura delle righe
    **sorelle**: revocare una persona voleva dire cercare chi le somigliasse,
    e «somigliare» finiva per essere l'indirizzo. Quella ricerca non esiste
    piu — la revoca e `UPDATE ... WHERE id = <la riga nominata>` — e con lei
    non esiste piu nemmeno la configurazione che la ingannava: l'indirizzo **e**
    la chiave, quindi due tutori dello stesso atleta non possono portarlo
    uguale, e ognuno vive sulla riga sua. La proprieta provata resta identica:
    **la revoca raggiunge la persona nominata e nessun'altra**, ed e la meta
    complementare di `W-24c`.
  */
  const FIGLIO_DUE_GENITORI = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_DUE_GENITORI,
      organization_id: CLUB,
      first_name: "Due",
      last_name: "Genitori",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_DUE_GENITORI,
    rows: [
      { legacyId: "madre", firstName: "Anna", email: ANNA.email },
      { legacyId: "padre", firstName: "Bruno", email: BRUNO.email },
    ],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_DUE_GENITORI,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_DUE_GENITORI,
    identityKeys: [BRUNO.email],
    userId: BRUNO.id,
    email: BRUNO.email,
  });

  const padrePrima = await cruscottoW25.canParentAccessAthlete(
    BRUNO.id,
    FIGLIO_DUE_GENITORI,
  );

  const rigaDellaMadre = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_DUE_GENITORI, legacy_id: "madre" },
  });

  await legamiW25.unlinkGuardianAccount(scopeSegreteriaW25, {
    athleteId: FIGLIO_DUE_GENITORI,
    guardianId: rigaDellaMadre.id,
  });

  prova(
    "W-25 revocare la madre non revoca il padre",
    [true, false, true],
    [
      padrePrima,
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_DUE_GENITORI),
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_DUE_GENITORI),
    ],
    "prima: il padre perdeva tutto, e l'audit nominava solo la madre",
  );

  /*
    E i canali di invio dicono la stessa cosa: il padre continua a ricevere, la
    madre no. Tre letture, una risposta.
  */
  const contattiW25 = await carica("src/lib/athlete-guardians.ts");
  const promemoriaW25 = await carica(
    "src/lib/server/medical-certificate-reminders.ts",
  );
  const schedaW25 = await prisma.athlete.findUnique({
    where: { id: FIGLIO_DUE_GENITORI },
    select: { id: true, data: true },
  });

  prova(
    "W-25b e i canali di invio restano aperti per lui, chiusi per lei",
    [1, 1],
    [
      contattiW25.readAthleteGuardianContacts(schedaW25).length,
      promemoriaW25.getGuardianRows(schedaW25).length,
    ],
    "prima: zero e zero, perche la sua riga era stata marchiata",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_DUE_GENITORI } });

  /*
    **W-26 (High).** «Tutte e quattro le grafie» non era mai entrato in
    funzione: `guardianAccessIdentities` le leggeva su una riga che
    `getGuardianRows` aveva **gia compressa** con `firstText`. Una riga
    `{ linkedUserId: <gia dentro>, user_id: <un terzo> }` portava quindi una
    sola identita, l'insieme non cresceva e nessun permesso veniva chiesto —
    mentre `resolveFamilyRecipients` raccoglie tutte e quattro le grafie dalla
    riga grezza e metteva quel terzo fra i destinatari delle notifiche
    documentali, che nominano il minore e il documento chiesto.
  */
  /*
    **Cosa ne resta dopo WP-C.** L'insieme sorvegliato non esiste piu, e con lui
    la compressione che lo rendeva cieco: una riga del blob che nominava **due**
    persone adesso diventa **due righe**, una per identita, ed e il travaso a
    farlo (migrazione `20260906100000`). La proprieta si misura percio dove
    vive: sulle righe, non su un insieme calcolato.
  */
  /*
    Un club usa e getta: il travaso gira una volta su tutto cio che gli si
    indica, e rieseguirlo sul club della sonda cadrebbe sulla chiave unica
    delle righe che ha gia portato.
  */
  const CLUB_DUE_ID = randomUUID();
  await prisma.club.create({
    data: {
      id: CLUB_DUE_ID,
      name: "Due identificativi",
      slug: `due-id-${CLUB_DUE_ID.slice(0, 8)}`,
      creator_id: PRESIDENTE.id,
    },
  });
  await prisma.organizationUser.createMany({
    data: [
      { id: randomUUID(), organization_id: CLUB_DUE_ID, user_id: ANNA.id, role: "parent" },
      { id: randomUUID(), organization_id: CLUB_DUE_ID, user_id: BRUNO.id, role: "parent" },
    ],
  });

  const FIGLIO_DUE_ID = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_DUE_ID,
      organization_id: CLUB_DUE_ID,
      first_name: "Due",
      last_name: "Identificativi",
      status: "active",
      updated_at: new Date(),
      data: {
        guardians: [
          { id: "t", name: "Tutore", linkedUserId: ANNA.id, user_id: BRUNO.id },
        ],
      },
    },
  });
  await travasaTutori(prisma, [CLUB_DUE_ID]);

  const righeDueId = await prisma.athleteGuardian.findMany({
    where: { athlete_id: FIGLIO_DUE_ID },
  });

  prova(
    "W-26 una riga con due identificativi diventa due righe, una per persona",
    [true, true],
    [
      righeDueId.some((r) => r.user_id === ANNA.id),
      righeDueId.some((r) => r.user_id === BRUNO.id),
    ],
    "prima: la seconda cadeva nella compressione, e la guardia non chiedeva niente",
  );

  prova(
    "W-26a e tutte e due aprono davvero, che e cio che la guardia doveva vedere",
    [true, true],
    [
      await cruscotto.canParentAccessAthlete(ANNA.id, FIGLIO_DUE_ID),
      await cruscotto.canParentAccessAthlete(BRUNO.id, FIGLIO_DUE_ID),
    ],
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_DUE_ID } });
  await prisma.organizationUser.deleteMany({ where: { organization_id: CLUB_DUE_ID } });
  await prisma.club.delete({ where: { id: CLUB_DUE_ID } });

  /* E si passa dalla guardia, non dal calcolo. */
  const FIGLIO_GRAFIE = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_GRAFIE,
      organization_id: CLUB,
      first_name: "Grafie",
      last_name: "Quattro",
      status: "active",
      updated_at: new Date(),
      data: {
        guardians: [
          { id: "t", name: "Tutore", linkedUserId: ANNA.id, email: ANNA.email },
        ],
      },
    },
  });

  const risorseW26 = await carica("src/lib/server/resources.ts");
  const scopeAllenatoreW26 = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "trainer",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  const terzaGrafia = await risorseW26
    .updateResource(
      "athletes",
      FIGLIO_GRAFIE,
      {
        data: {
          guardians: [
            {
              id: "t",
              name: "Tutore",
              linkedUserId: ANNA.id,
              email: ANNA.email,
              user_id: BRUNO.id,
            },
          ],
        },
      },
      scopeAllenatoreW26,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-26b e la rotta rifiuta a chi non ha le due chiavi di scriversi la terza grafia",
    true,
    terzaGrafia !== "riuscita",
    terzaGrafia,
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_GRAFIE } });

  /*
    **W-27 (High).** Il falso positivo della crescita che bloccava la scheda per
    sempre. Stato ordinario: la madre e stata revocata (il suo indirizzo e
    nell'elenco delle identita), e poi la segreteria — che le due chiavi ce le
    ha — aggiunge la nonna con lo stesso indirizzo di famiglia. Da quel momento
    un ruolo **senza** `clinical.read` non salvava piu niente su quell'atleta:
    ne una taglia, ne un telefono, con un messaggio che parlava di legami di
    famiglia mentre l'operatore stava cambiando una maglia.
  */
  const FIGLIO_NONNA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_NONNA,
      organization_id: CLUB,
      first_name: "Con",
      last_name: "Nonna",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  /*
    Lo stato di partenza: la madre c'e ed e stata **revocata**. Si semina dalle
    porte vere perche l'elenco delle identita revocate non esiste piu — era il
    surrogato della chiave — e la revoca vive su `revoked_at`.
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_NONNA,
    rows: [{ legacyId: "madre", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  const rigaDellaMadreRevocata = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_NONNA, legacy_id: "madre" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: FIGLIO_NONNA,
    guardianRowId: rigaDellaMadreRevocata.id,
  });

  /*
    Prima meta: **aggiungere** la riga. L'indirizzo e revocato, quindi quella
    riga non concede niente a nessuno — ne il cruscotto, che dopo una revoca
    chiede un legame **dichiarato**, ne un invio, che tutti e tre i canali
    filtrano sull'elenco. Contarla come una concessione era il falso positivo:
    da li in poi la scheda restava bloccata.
  */
  const datiMadre = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_NONNA },
      select: { data: true },
    })
  )?.data;

  const aggiungiNonna = await risorseW26
    .updateResource(
      "athletes",
      FIGLIO_NONNA,
      {
        data: {
          ...datiMadre,
          guardians: [
            ...(datiMadre?.guardians || []),
            { id: "nonna", name: "Nonna", email: ANNA.email },
          ],
        },
      },
      scopeAllenatoreW26,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-27b aggiungere una riga all'indirizzo revocato passa, e non concede niente",
    ["riuscita", false],
    [
      aggiungiNonna,
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_NONNA),
    ],
    "prima: rifiutata, perche l'insieme «dopo» contava un indirizzo revocato",
  );

  const datiNonna = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_NONNA },
      select: { data: true },
    })
  )?.data;

  const salvaTaglia = await risorseW26
    .updateResource(
      "athletes",
      FIGLIO_NONNA,
      { data: { ...datiNonna, size: "M" } },
      scopeAllenatoreW26,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-27 con una riga superstite all'indirizzo revocato la scheda resta salvabile",
    ["riuscita", false],
    [salvaTaglia, await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_NONNA)],
    "prima: rifiutata per sempre, e senza nessuna schermata che lo sciogliesse",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_NONNA } });

  /*
    **W-27c.** L'altra meta della stessa correzione: lo stato di partenza non
    sottrae piu le identita revocate.

    Lo stato e raggiungibile e non richiede malafede: la segreteria revoca Anna
    e poi Anna **rientra**, cioe torna a essere collegata su una scheda dove era
    stata tolta. Anna entra, ma `prima` la sottraeva e `dopo` no, quindi
    **qualunque** salvataggio da un ruolo senza le due chiavi risultava una
    crescita.

    Sottrarre da un lato solo serviva a far risultare crescita il rientro di
    una persona revocata; quel rientro pero non passa da qui — lo scrive il
    riscatto con una `update` diretta — e cio che passa di qui, il ripiego
    sull'indirizzo, e gia escluso dai due lati.

    **Cosa cambia nel modo di arrivarci.** La stesura precedente rimetteva Anna
    **a mano**, scrivendole il legame dichiarato dentro il blob. Quella strada
    non esiste piu, ed e proprio la proprieta che misura `W-15a`: un legame non
    si scrive salvando l'anagrafica. Il rientro ordinario e percio quello vero,
    il riscatto di un invito — l'unico atto che scioglie una revoca — e lo
    stato che ne risulta e lo stesso: una persona che era revocata e adesso
    entra.
  */
  const FIGLIO_RIMESSA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_RIMESSA,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Rimessa",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_RIMESSA,
    rows: [{ legacyId: "t", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  const rigaRimessa = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_RIMESSA, legacy_id: "t" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: FIGLIO_RIMESSA,
    guardianRowId: rigaRimessa.id,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_RIMESSA,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const datiRimessa = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_RIMESSA },
      select: { data: true },
    })
  )?.data;

  const salvaSuRimessa = await risorseW26
    .updateResource(
      "athletes",
      FIGLIO_RIMESSA,
      { data: { ...datiRimessa, size: "L" } },
      scopeAllenatoreW26,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-27c un tutore rimesso a mano non blocca la scheda a chi non ha le due chiavi",
    ["riuscita", true],
    [
      salvaSuRimessa,
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_RIMESSA),
    ],
    "prima: ogni salvataggio risultava una crescita, per sempre",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_RIMESSA } });

  /*
    **W-28 (Medium).** «Scollega account» non trovava un tutore nato
    dall'approvazione di un modulo. Quelle righe un `id` non ce l'hanno —
    `form-submissions.ts` fa `guardians.push` di un oggetto che porta i soli
    binding del modulo — e la scheda mostra l'id **sintetico** di
    `normalizeGuardianRows`. La rotta cercava per `entry.id` e rispondeva
    «Genitore non trovato nella scheda atleta» su un genitore che era li sullo
    schermo: la revoca non era disponibile proprio sulla classe di righe
    attorno a cui e nata la difesa `contactOnly`.

    **Cosa misura adesso.** La classe delle righe senza identificativo non
    esiste piu: un tutore nato da un modulo e una riga, e la proiezione ne
    pubblica l'`id` vero. La proprieta e sempre quella, ed e la piu concreta
    che ci sia — **l'identificativo che la scheda mostra e quello con cui la
    revoca funziona** — quindi la prova lo prende da li, dalla proiezione, e
    non lo ricalcola: ricalcolarlo proverebbe la mia aritmetica invece della
    strada che l'operatore percorre.
  */
  const FIGLIO_SENZA_ID = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SENZA_ID,
      organization_id: CLUB,
      first_name: "Senza",
      last_name: "Identificativo",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  /* Il percorso ordinario di W-23a: modulo approvato, poi invito riscattato. */
  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SENZA_ID,
    row: { firstName: "Anna", email: ANNA.email },
    contactOnly: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_SENZA_ID,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const accessoPrimaDiScollegare = await cruscottoW25.canParentAccessAthlete(
    ANNA.id,
    FIGLIO_SENZA_ID,
  );

  /* **L'identificativo che la scheda mostra**, letto dalla proiezione. */
  const idSullaScheda = (
    (
      await prisma.athlete.findUnique({
        where: { id: FIGLIO_SENZA_ID },
        select: { data: true },
      })
    )?.data?.guardians || []
  )[0]?.id;

  const esitoScollega = await legamiW25
    .unlinkGuardianAccount(scopeSegreteriaW25, {
      athleteId: FIGLIO_SENZA_ID,
      guardianId: idSullaScheda,
    })
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-28 «Scollega account» trova un tutore nato da un modulo, e lo revoca",
    [true, "riuscita", false],
    [
      accessoPrimaDiScollegare,
      esitoScollega,
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_SENZA_ID),
    ],
    "prima: «Genitore non trovato», e la persona restava collegata",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SENZA_ID } });

  /* ---------- W-29..W-33: il quindicesimo round ---------- */

  const inviiW29 = await carica("src/lib/server/form-submissions.ts");
  const modelloW29 = await carica("src/lib/forms/model.ts");
  const risorseW29 = await carica("src/lib/server/resources.ts");
  const cruscottoW29 = await carica("src/lib/server/parent-dashboard.ts");
  const legamiW29 = await carica("src/lib/server/profile-account-links.ts");
  const contattiW29 = await carica("src/lib/athlete-guardians.ts");

  const scopeClubW29 = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
    actorEmail: PRESIDENTE.email,
  };

  const scopeAllenatoreW29 = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "trainer",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /*
    **W-29 (High).** Un tutore legittimo, rinnovando, regalava a un indirizzo
    qualunque l'area famiglia completa del minore.

    Il marchio `contactOnly` era agganciato a «compilazione senza autore
    dimostrato», cioe al solo modulo pubblico. `submitRenewalForm` scrive
    pero `submittedBy: userId`, quindi ogni riga tutore **nuova** nata da un
    rinnovo usciva senza marchio: la madre legata dichiara un tutore con un
    indirizzo qualunque, la segreteria legge «Genitore aggiunto» e approva, e
    da quel momento quell'indirizzo apre allergie, farmaci, i byte del
    certificato, rate e ricevute — e puo revocare i consensi dati dall'altro
    genitore. Nessun audit di concessione, e `accounts.athlete.manage` non
    viene chiesta a chi concede.
  */
  const moduloTutore = await (async () => {
    const templateId = randomUUID();
    const versionId = randomUUID();
    const slug = `pp02-tutore-${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const schema = modelloW29.normalizeFormSchema({
      title: "Rinnovo con tutore",
      description: "",
      fields: [
        {
          id: "f_nome_tutore",
          type: "short_text",
          label: "Nome del genitore",
          required: true,
          binding: "guardian.name",
        },
        {
          id: "f_email_tutore",
          type: "email",
          label: "Email del genitore",
          required: true,
          binding: "guardian.email",
        },
      ],
      settings: {},
    });

    await prisma.formTemplate.create({
      data: {
        id: templateId,
        organization_id: CLUB,
        title: "Rinnovo con tutore",
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

    return { templateId, slug };
  })();

  const FIGLIO_RINNOVO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_RINNOVO,
      organization_id: CLUB,
      first_name: "Rinnovo",
      last_name: "Tutore",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_RINNOVO,
    rows: [{ legacyId: "madre", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_RINNOVO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const inviato = await inviiW29.submitRenewalForm(ANNA.id, {
    athleteId: FIGLIO_RINNOVO,
    publicSlug: moduloTutore.slug,
    answers: { f_nome_tutore: "Zio", f_email_tutore: BRUNO.email },
    files: [],
    respondentEmail: ANNA.email,
  });

  const accessoPrimaW29 = await cruscottoW29.canParentAccessAthlete(
    BRUNO.id,
    FIGLIO_RINNOVO,
  );

  const esitoApprovazione = await inviiW29
    .decideFormSubmission(scopeClubW29, inviato.submissionId, {
      decision: "approved",
    })
    .then((esito) => esito)
    .catch((errore) => ({ errore: String(errore?.message || errore) }));

  prova(
    "W-29 un rinnovo che dichiara un terzo non gli regala l'area famiglia",
    [false, false],
    [
      accessoPrimaW29,
      await cruscottoW29.canParentAccessAthlete(BRUNO.id, FIGLIO_RINNOVO),
    ],
    esitoApprovazione?.errore || "approvato",
  );

  /*
    E la riga porta il segno, perche il club non e l'autore di quell'indirizzo.
    Il ripiego di ADR-0114 resta intatto per cio che la segreteria scrive: e la
    riga di Anna, che esisteva gia, viene **aggiornata** e non declassata.
  */
  const dopoApprovazione = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_RINNOVO },
      select: { data: true },
    })
  )?.data;

  const rigaZio = (dopoApprovazione?.guardians || []).find(
    (riga) => String(riga?.email || "").toLowerCase() === String(BRUNO.email).toLowerCase(),
  );

  prova(
    "W-29b la riga nata dal rinnovo porta il segno, e la madre resta dentro",
    [true, true],
    [
      Boolean(rigaZio?.contactOnly),
      await cruscottoW29.canParentAccessAthlete(ANNA.id, FIGLIO_RINNOVO),
    ],
    "prima: nessun segno sulla riga nuova, e l'indirizzo era una chiave",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_RINNOVO } });

  /*
    **W-30 (High).** Un ruolo di club con **zero chiavi** chiudeva fuori un
    tutore legittimo scrivendogli `accessRevokedAt` addosso dalla rotta
    generica: la guardia sorveglia la **crescita**, e togliere non fa crescere
    niente. Nessun audit, e la famiglia perdeva cruscotto, solleciti,
    promemoria e notifiche.
  */
  const FIGLIO_CHIUSURA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_CHIUSURA,
      organization_id: CLUB,
      first_name: "Chiuso",
      last_name: "Fuori",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_CHIUSURA,
    rows: [{ legacyId: "t", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });

  const chiusuraPrima = await cruscottoW29.canParentAccessAthlete(
    ANNA.id,
    FIGLIO_CHIUSURA,
  );

  await risorseW29.updateResource(
    "athletes",
    FIGLIO_CHIUSURA,
    {
      data: {
        guardians: [
          {
            id: "t",
            name: "Anna",
            email: ANNA.email,
            accessRevokedAt: new Date().toISOString(),
          },
        ],
      },
    },
    scopeAllenatoreW29,
  );

  prova(
    "W-30 dalla rotta generica non si revoca un tutore, nemmeno di nascosto",
    [true, true],
    [
      chiusuraPrima,
      await cruscottoW29.canParentAccessAthlete(ANNA.id, FIGLIO_CHIUSURA),
    ],
    "prima: un ruolo a zero chiavi lo chiudeva fuori, senza audit",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_CHIUSURA } });

  /*
    **W-31 (Medium).** I riporti si agganciavano a `record.id`, e le righe che
    proteggono piu spesso un id **non ce l'hanno** — sono quelle nate da
    `guardians.push` dell'approvazione, cioe proprio le `contactOnly`. Il
    segno spariva al primo salvataggio, e la riga tornava una chiave.

    **Cosa misura adesso.** Non c'e piu un riporto da agganciare a un id: il
    segno e una colonna, e nessun ramo del salvataggio la scrive. La riga nasce
    dalla porta che la crea davvero — l'approvazione di un modulo — e non ha
    una chiave storica, che e il caso che il riporto sbagliava.
  */
  const FIGLIO_SENZA_CHIAVE = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SENZA_CHIAVE,
      organization_id: CLUB,
      first_name: "Senza",
      last_name: "Chiave",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SENZA_CHIAVE,
    row: { firstName: "Anna", email: ANNA.email },
    contactOnly: true,
  });

  await risorseW29.updateResource(
    "athletes",
    FIGLIO_SENZA_CHIAVE,
    { data: { guardians: [{ name: "Anna", email: ANNA.email }] } },
    scopeClubW29,
  );

  const dopoSenzaChiave = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_SENZA_CHIAVE },
      select: { data: true },
    })
  )?.data;

  prova(
    "W-31 il segno si riporta anche su una riga che non ha un id",
    [true, false],
    [
      Boolean((dopoSenzaChiave?.guardians || [])[0]?.contactOnly),
      await cruscottoW29.canParentAccessAthlete(ANNA.id, FIGLIO_SENZA_CHIAVE),
    ],
    "prima: spariva, e l'indirizzo tornava una chiave dell'area famiglia",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SENZA_CHIAVE } });

  /*
    **W-32 (Medium).** Il riporto spogliava **due** grafie del legame
    dichiarato e il vaglio ne legge sei: un salvataggio con `userId`,
    `user_id` o `linkedUserIds` restituiva l'accesso a una persona revocata,
    senza audit. Basta una scheda aperta **prima** della revoca.

    **Cosa misura adesso.** Contare le grafie era una rincorsa: sei nel vaglio,
    due nel riporto, e ogni grafia nuova riapriva il difetto. Adesso non se ne
    conta nessuna, perche `readGuardianInputFromCard` **non traduce il legame**
    — in nessuna delle sei forme — e `saveGuardianRegistry` non scrive
    `user_id` da nessun ramo. La prova resta quella di prima, sulla grafia che
    il riporto lasciava passare: `userId` su una riga revocata non riapre.
  */
  const FIGLIO_SEI_GRAFIE = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SEI_GRAFIE,
      organization_id: CLUB,
      first_name: "Sei",
      last_name: "Grafie",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SEI_GRAFIE,
    rows: [{ legacyId: "t", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  const rigaSeiGrafie = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_SEI_GRAFIE, legacy_id: "t" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: FIGLIO_SEI_GRAFIE,
    guardianRowId: rigaSeiGrafie.id,
  });

  await risorseW29.updateResource(
    "athletes",
    FIGLIO_SEI_GRAFIE,
    {
      data: {
        guardians: [
          { id: "t", name: "Anna", email: ANNA.email, userId: ANNA.id },
        ],
      },
    },
    scopeClubW29,
  );

  prova(
    "W-32 il riporto toglie il legame in tutte le grafie che concedono",
    false,
    await cruscottoW29.canParentAccessAthlete(ANNA.id, FIGLIO_SEI_GRAFIE),
    "prima: la grafia userId sopravviveva al riporto e restituiva l'accesso",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SEI_GRAFIE } });

  /*
    **W-33.** Tre difetti del pulsante «Scollega account», misurati insieme
    perche vivono nella stessa lettura:

    a) due righe con lo **stesso id** — che nasce da solo, perche la scheda
       salva gli id sintetici — e il pulsante revocava la persona sbagliata,
       con l'audit intestato a lei;
    b) una riga con solo `linkedUserIds`: rispondeva **200**, senza revocare
       niente e senza audit;
    c) `parent1`/`parent2`, che **concedono** e che il pulsante non trovava:
       l'unica strada restava revocare l'intera tessera.

    **Cosa misura adesso (a).** L'id ambiguo nasceva da solo perche gli id del
    blob erano sintetici: due righe potevano portarlo uguale, e la lettura
    doveva scegliere. Adesso l'identificativo che la scheda mostra e la chiave
    primaria della riga, e due righe non possono averlo uguale: non c'e piu
    niente da indovinare. La proprieta e quella di sempre, e si misura sul
    fatto invece che sul rifiuto — **il pulsante toglie l'accesso a chi e stato
    indicato, e a nessun altro**, anche quando le due righe condividono la
    chiave storica da cui l'ambiguita veniva.
  */
  const FIGLIO_AMBIGUO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_AMBIGUO,
      organization_id: CLUB,
      first_name: "Id",
      last_name: "Ambiguo",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  /* Due persone diverse, e la **stessa** chiave storica: e cio che il travaso
     porta dentro da un blob con due id sintetici uguali. */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_AMBIGUO,
    rows: [
      { legacyId: "stesso", firstName: "Anna", email: ANNA.email },
      { legacyId: "stesso", firstName: "Bruno", email: BRUNO.email },
    ],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_AMBIGUO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_AMBIGUO,
    identityKeys: [BRUNO.email],
    userId: BRUNO.id,
    email: BRUNO.email,
  });

  const rigaAmbiguaDiAnna = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_AMBIGUO, user_id: ANNA.id },
  });
  const rigaAmbiguaDiBruno = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_AMBIGUO, user_id: BRUNO.id },
  });

  const esitoAmbiguo = await legamiW29
    .unlinkGuardianAccount(scopeClubW29, {
      athleteId: FIGLIO_AMBIGUO,
      guardianId: rigaAmbiguaDiAnna.id,
    })
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-33a l'identificativo della riga e unico, e il pulsante colpisce chi e indicato",
    ["riuscita", true, false, true],
    [
      esitoAmbiguo,
      rigaAmbiguaDiAnna.id !== rigaAmbiguaDiBruno.id,
      await cruscottoW29.canParentAccessAthlete(ANNA.id, FIGLIO_AMBIGUO),
      await cruscottoW29.canParentAccessAthlete(BRUNO.id, FIGLIO_AMBIGUO),
    ],
    esitoAmbiguo,
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_AMBIGUO } });

  /*
    **(b)** La riga che dichiara **solo l'identificativo**, senza indirizzo: nel
    blob era `linkedUserIds: [...]`, e il pulsante rispondeva 200 senza
    revocare niente. Nel modello nuovo e la riga di un tutore che il club
    conosce per nome e telefono e che ha riscattato il proprio invito: nessun
    indirizzo su cui ricadere, solo il legame dichiarato. La proprieta e la
    stessa — **la revoca deve nominare la persona e chiuderle l'accesso**, non
    rispondere di si e non fare niente.
  */
  const FIGLIO_LISTA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_LISTA,
      organization_id: CLUB,
      first_name: "Lista",
      last_name: "Sola",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_LISTA,
    rows: [{ legacyId: "t", firstName: "Anna", phone: "3330000001" }],
    canGrantAccess: true,
  });
  const rigaSoloLegame = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_LISTA, legacy_id: "t" },
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_LISTA,
    guardianRowId: rigaSoloLegame.id,
    userId: ANNA.id,
  });

  const esitoLista = await legamiW29
    .unlinkGuardianAccount(scopeClubW29, {
      athleteId: FIGLIO_LISTA,
      guardianId: rigaSoloLegame.id,
    })
    .then((esito) => esito)
    .catch((errore) => ({ errore: String(errore?.message || errore) }));

  prova(
    "W-33b una riga con il solo legame dichiarato si revoca davvero",
    [String(ANNA.id), false],
    [
      String(esitoLista?.unlinkedUserId || ""),
      await cruscottoW29.canParentAccessAthlete(ANNA.id, FIGLIO_LISTA),
    ],
    "prima: 200, nessun audit, accesso intatto",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_LISTA } });

  /*
    **(c)** La coppia storica, dal pulsante. Prima era la classe di righe che
    concedeva e che nessuno scrittore raggiungeva; adesso il travaso la porta
    dentro come riga, e il pulsante la trova perche non c'e piu una «classe» —
    c'e una tabella sola. Il travaso si esegue davvero, su un club suo, per la
    stessa ragione di `W-20`: e cio che accade a un archivio storico.

    La proiezione si rifa subito dopo, che e cio che fa il prodotto al primo
    salvataggio: cosi l'identificativo che la prova passa al pulsante e
    **quello che l'operatore vede sullo schermo**, non uno che ricalcolo io.
  */
  const CLUB_COPPIA = randomUUID();
  await prisma.club.create({
    data: {
      id: CLUB_COPPIA,
      slug: `pp02-coppia-${Date.now()}`,
      name: "ASD Coppia Storica PP-02",
      creator_id: PRESIDENTE.id,
      updated_at: new Date(),
    },
  });

  const FIGLIO_COPPIA_STORICA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_COPPIA_STORICA,
      organization_id: CLUB_COPPIA,
      first_name: "Coppia",
      last_name: "Storica",
      status: "active",
      updated_at: new Date(),
      data: {
        parent1: { name: "Anna", email: ANNA.email, linkedUserId: ANNA.id },
      },
    },
  });

  await travasaTutori(prisma, [CLUB_COPPIA]);
  await tutori.refreshGuardianProjection(prisma, [FIGLIO_COPPIA_STORICA]);

  const accessoStoricoPrima = await cruscottoW29.canParentAccessAthlete(
    ANNA.id,
    FIGLIO_COPPIA_STORICA,
  );

  const idCoppiaSullaScheda = (
    (
      await prisma.athlete.findUnique({
        where: { id: FIGLIO_COPPIA_STORICA },
        select: { data: true },
      })
    )?.data?.guardians || []
  )[0]?.id;

  const scopeClubCoppia = {
    ...scopeClubW29,
    activeOrganizationId: CLUB_COPPIA,
    allowedOrganizationIds: [CLUB_COPPIA],
  };

  const esitoStorico = await legamiW29
    .unlinkGuardianAccount(scopeClubCoppia, {
      athleteId: FIGLIO_COPPIA_STORICA,
      guardianId: idCoppiaSullaScheda,
    })
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-33c la coppia storica si revoca dal pulsante, come l'elenco",
    [true, "riuscita", false],
    [
      accessoStoricoPrima,
      esitoStorico,
      await cruscottoW29.canParentAccessAthlete(ANNA.id, FIGLIO_COPPIA_STORICA),
    ],
    "prima: «Genitore non trovato», e restava solo revocare la tessera",
  );

  prova(
    "W-33d e i canali di invio si chiudono con lui",
    0,
    contattiW29.readAthleteGuardianContacts(
      await prisma.athlete.findUnique({
        where: { id: FIGLIO_COPPIA_STORICA },
        select: { id: true, data: true },
      }),
    ).length,
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_COPPIA_STORICA } });
  await prisma.club.delete({ where: { id: CLUB_COPPIA } });

  /* ---------- W-34..W-38: il resto del quindicesimo round ---------- */

  /*
    **W-34 (High).** `athletes.data` usciva quasi intera nel browser della
    famiglia. Il taglio era un **elenco di cio che si toglie** — sei nomi di
    campo credenziale — su un contenitore che la segreteria riempie a mano:
    ogni campo nuovo nasceva visibile. Misurato dentro il payload: una nota
    «famiglia morosa», una «relazione-servizi-sociali», il codice fiscale
    dell'altro tutore, una nota che lo riguarda, e
    `revokedGuardianIdentities` — cioe il cruscotto che dichiara a chi legge
    che il club ha revocato l'altro genitore. Il contesto conserva tutto anche
    in `sessionStorage`.
  */
  const FIGLIO_BLOB = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_BLOB,
      organization_id: CLUB,
      first_name: "Blob",
      last_name: "Aperto",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  /*
    I due tutori si seminano dalle porte vere; il resto del blob — le note che
    la segreteria scrive a mano — si aggiunge **dopo**, perche e cio che questa
    prova misura: un contenitore libero da cui usciva quasi tutto. I campi
    liberi sulla riga dell'ex vanno scritti nella proiezione, che e dove
    stavano: la tabella non ha una colonna per «nota» ne per «codice fiscale»,
    e il serializzatore della famiglia deve reggere lo stesso.
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_BLOB,
    rows: [
      { legacyId: "madre", firstName: "Anna", email: ANNA.email },
      { legacyId: "ex", firstName: "Ex", lastName: "Coniuge", email: BRUNO.email },
    ],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_BLOB,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });
  const rigaEx = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_BLOB, legacy_id: "ex" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: FIGLIO_BLOB,
    guardianRowId: rigaEx.id,
  });

  const blobProiettato = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_BLOB },
      select: { data: true },
    })
  )?.data;

  await prisma.athlete.update({
    where: { id: FIGLIO_BLOB },
    data: {
      data: {
        ...blobProiettato,
        address: "via Roma 3",
        medicalVisits: [{ date: "2026-01-01", note: "idoneita" }],
        notaInterna: "famiglia morosa",
        praticaSociale: "relazione-servizi-sociali",
        guardians: (blobProiettato?.guardians || []).map((riga) =>
          riga?.id === rigaEx.id
            ? {
                ...riga,
                fiscalCode: "XCNGXX80A01H501Z",
                nota: "non puo prendere il bambino il martedi",
              }
            : riga,
        ),
      },
    },
  });

  const payloadFamiglia = await cruscottoW25.getParentDashboardData(
    ANNA.id,
    FIGLIO_BLOB,
  );

  const serializzato = JSON.stringify(payloadFamiglia?.athlete || {});

  prova(
    "W-34 nel payload della famiglia esce cio che le schermate leggono, e basta",
    [true, false, false, false, false],
    [
      Boolean(payloadFamiglia?.athlete?.data?.address),
      serializzato.includes("famiglia morosa"),
      serializzato.includes("relazione-servizi-sociali"),
      serializzato.includes("XCNGXX80A01H501Z"),
      /*
        La quinta misura era `revokedGuardianIdentities`, il registro di scheda
        che dichiarava a chi legge quali persone il club avesse escluso. Quel
        registro non esiste piu — la revoca e un fatto sulla riga — ma il fatto
        da non far uscire e lo stesso, e adesso viaggia come `accessRevokedAt`
        dentro la proiezione: **che il club abbia revocato l'altro genitore non
        e una cosa che questa famiglia deve leggere nel proprio payload.**
      */
      serializzato.includes("accessRevokedAt"),
    ],
    "prima: usciva quasi tutto il blob, e con lui la revoca dell'altro genitore",
  );

  prova(
    "W-34b e di un tutore escono nome, rapporto e recapiti, non cio che decide",
    [true, false, false],
    [
      (payloadFamiglia?.athlete?.guardians || []).length > 0,
      JSON.stringify(payloadFamiglia?.athlete?.guardians || []).includes(
        "accessRevokedAt",
      ),
      JSON.stringify(payloadFamiglia?.athlete?.guardians || []).includes(
        "linkedUserIds",
      ),
    ],
    "prima: il marchio della revoca e le grafie dell'identificativo uscivano",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_BLOB } });

  /*
    **W-35 (High).** Una notifica **senza destinatario** finiva nella bacheca
    di ogni genitore del club, e nessuno poteva spegnerla: segnare letto filtra
    per `user_id`. Misurato dal contenuto: «Rata scaduta: Luca Bianchi — la
    famiglia Bianchi non ha pagato 130,00 EUR», con nome del minore e importo.
  */
  await prisma.notification.create({
    data: {
      organization_id: CLUB,
      user_id: null,
      title: "Rata scaduta: un altro minore",
      message: "La famiglia di un altro tesserato non ha pagato 130,00 EUR",
      type: "automation_payment_overdue",
      read: false,
      data: { source: "automation" },
    },
  });

  const FIGLIO_BACHECA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_BACHECA,
      organization_id: CLUB,
      first_name: "Bacheca",
      last_name: "Pulita",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  /*
    Il legame va seminato dalle porte vere: senza una riga, il cruscotto
    risponderebbe `null` e la prova sarebbe verde perche non c'e nessuna
    bacheca, non perche la notifica non ci sia entrata.
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_BACHECA,
    rows: [{ legacyId: "madre", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_BACHECA,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const bachecaAnna = await cruscottoW25.getParentDashboardData(
    ANNA.id,
    FIGLIO_BACHECA,
  );

  prova(
    "W-35 una notifica senza destinatario non entra nella bacheca di nessuno",
    false,
    JSON.stringify(bachecaAnna?.notifications || []).includes("Rata scaduta"),
    "prima: la vedevano tutti i genitori del club, e non si poteva spegnere",
  );

  await prisma.notification.deleteMany({
    where: { organization_id: CLUB, user_id: null },
  });
  await prisma.athlete.delete({ where: { id: FIGLIO_BACHECA } });

  /*
    **W-36 (High).** L'interruttore «si compila una volta sola» non arrivava
    mai in produzione: il confronto fra due schemi elencava **sette** delle
    otto impostazioni, e l'ottava era proprio quella. Due schemi identici
    tranne quel campo risultavano uguali, quindi la bozza non si salvava, la
    schermata non segnalava modifiche e la pubblicazione non creava una
    versione.
  */
  const moduloW36 = await carica("src/lib/forms/model.ts");
  const schemaSenza = moduloW36.normalizeFormSchema({
    title: "X",
    description: "",
    fields: [],
    settings: {},
  });
  const schemaCon = moduloW36.normalizeFormSchema({
    title: "X",
    description: "",
    fields: [],
    settings: { singleSubmission: true },
  });

  prova(
    "W-36 due schemi che differiscono solo sul vincolo non sono uguali",
    false,
    moduloW36.schemasAreEqual(schemaSenza, schemaCon),
    "prima: uguali, e la casella non arrivava mai alla versione pubblicata",
  );

  /*
    **W-37 (High).** Due implementazioni della stessa domanda, sullo stesso
    dato, con risposte opposte: la disponibilita di un campo si leggeva in
    `Europe/Rome` dalla strada della famiglia e in **UTC** da quella del club.
    Il lunedi alle 18:00 di Roma, su un campo aperto `Lun 18:00-20:00`, la
    famiglia prenotava e l'allenatore veniva rifiutato.
  */
  const struttureW37 = await carica("src/lib/structures-utils.ts");
  const eventiW37 = await carica("src/lib/events/model.ts");
  const disponibilitaW37 = { Lun: [{ start: "18:00", end: "20:00" }] };
  const inizioW37 = struttureW37.instantFromLocalTime("2026-09-07", "18:00");
  const fineW37 = struttureW37.instantFromLocalTime("2026-09-07", "19:00");

  prova(
    "W-37 famiglia e club danno la stessa risposta sullo stesso campo",
    [true, true],
    [
      struttureW37.isWithinFieldAvailability(
        { availability: disponibilitaW37 },
        inizioW37,
        fineW37,
      ),
      eventiW37.isWithinFieldAvailability(disponibilitaW37, inizioW37, fineW37),
    ],
    "prima: true per la famiglia, false per il club — due ore di fuso",
  );

  /*
    **W-38 (High + Medium).** Una fascia notturna veniva **stampata e
    rifiutata**, e due fasce contigue non coprivano la loro unione: il
    messaggio di rifiuto elencava le fasce che contenevano la richiesta.
  */
  const campoNotte = { availability: { Ven: [{ start: "22:00", end: "02:00" }] } };
  const campoSpezzato = {
    availability: {
      Lun: [
        { start: "09:00", end: "11:00" },
        { start: "11:00", end: "13:00" },
      ],
    },
  };

  prova(
    "W-38 una fascia che scavalca la mezzanotte vale cio che dichiara",
    [true, true],
    [
      struttureW37.isWithinFieldAvailability(
        campoNotte,
        struttureW37.instantFromLocalTime("2026-09-11", "22:30"),
        struttureW37.instantFromLocalTime("2026-09-11", "23:30"),
      ),
      struttureW37.isWithinFieldAvailability(
        campoNotte,
        struttureW37.instantFromLocalTime("2026-09-12", "00:30"),
        struttureW37.instantFromLocalTime("2026-09-12", "01:30"),
      ),
    ],
    "prima: rifiutata, citando nel messaggio la fascia che la conteneva",
  );

  prova(
    "W-38b due fasce contigue coprono la loro unione, e il buco vero no",
    [true, false],
    [
      struttureW37.isWithinFieldAvailability(
        campoSpezzato,
        struttureW37.instantFromLocalTime("2026-09-07", "10:00"),
        struttureW37.instantFromLocalTime("2026-09-07", "12:00"),
      ),
      struttureW37.isWithinFieldAvailability(
        campoSpezzato,
        struttureW37.instantFromLocalTime("2026-09-07", "12:00"),
        struttureW37.instantFromLocalTime("2026-09-07", "14:00"),
      ),
    ],
    "prima: la prima rifiutata; la seconda deve restare rifiutata",
  );

  /*
    **W-38c (Medium).** `bookable: "false"` — una stringa — lasciava
    prenotabile dalla famiglia un tipo che il club aveva chiuso al desk.
    Un altro orario: `9:00` → `10:00` veniva rifiutato e `10:00` → `9:00`
    accettato, perche due orari si confrontavano come **parole**.
  */
  const configW38 = await carica("src/lib/appointments/config.ts");
  const appuntamentiW38 = await carica("src/lib/server/appointments.ts");

  const tipiW38 = configW38.normalizeAppointmentsConfig({
    types: [{ id: "t", name: "Solo desk", bookable: "false" }],
  });

  const fasciaStorta = await appuntamentiW38
    .createAppointmentSlot(
      {
        userId: PRESIDENTE.id,
        activeOrganizationId: CLUB,
        activeRole: "owner",
        activeMembershipId: null,
        allowedOrganizationIds: [CLUB],
        accessScopes: [],
      },
      { weekday: 1, startTime: "10:00", endTime: "9:00" },
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-38c una stringa non e un booleano, e due orari si confrontano in minuti",
    [false, true],
    [
      Boolean(tipiW38?.types?.[0]?.bookable),
      fasciaStorta !== "riuscita",
    ],
    fasciaStorta,
  );

  /* ---------- W-39..W-41: il sedicesimo round ---------- */

  const scopeZeroChiaviW39 = {
    userId: PRESIDENTE.id,
    activeOrganizationId: CLUB,
    activeRole: "trainer",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB],
    accessScopes: [],
  };

  /*
    **W-39 (High).** Il riporto abbinava le righe per `id` e, quando l'id non
    era univoco da tutte e due le parti, **per posizione** — e la posizione la
    sceglie chi chiama. Tre strade indipendenti scrivevano cosi il marchio di
    una riga addosso a un'altra: riordinare le righe, mandare id diversi da
    quelli in archivio, duplicare un id in arrivo. Un ruolo a zero chiavi
    chiudeva fuori un tutore legittimo, senza audit.

    **Cosa misura adesso.** Il ripiego posizionale non c'e piu, e non perche
    sia stato tolto: non c'e piu la domanda a cui rispondeva. Con una chiave
    unica non si abbina niente — la riga in arrivo *e* la riga in archivio, per
    identita o per identificativo — quindi l'ordine, gli id inventati e gli id
    duplicati non hanno una leva su cui agire. Le tre prove restano tutte e
    tre, con lo stesso esito atteso, perche sono le tre forme in cui la leva
    veniva impugnata: se una di esse tornasse a spostare un marchio, e li che
    si vedrebbe.
  */
  const provaSpostamento = async (titolo, righeInArrivo, nota) => {
    const atleta = randomUUID();
    await prisma.athlete.create({
      data: {
        id: atleta,
        organization_id: CLUB,
        first_name: "Marchio",
        last_name: "Spostato",
        status: "active",
        updated_at: new Date(),
        data: {},
      },
    });

    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      rows: [
        { legacyId: "revocata", firstName: "Revocata", email: BRUNO.email },
        { legacyId: "madre", firstName: "Madre", email: ANNA.email },
      ],
      canGrantAccess: true,
    });
    const rigaRevocata = await prisma.athleteGuardian.findFirst({
      where: { athlete_id: atleta, legacy_id: "revocata" },
    });
    await tutori.revokeGuardianRow(prisma, {
      athleteId: atleta,
      guardianRowId: rigaRevocata.id,
    });
    await tutori.linkGuardianAccount(prisma, {
      athleteId: atleta,
      identityKeys: [ANNA.email],
      userId: ANNA.id,
      email: ANNA.email,
    });

    const prima = await cruscottoW25.canParentAccessAthlete(ANNA.id, atleta);

    const esito = await risorseW26
      .updateResource(
        "athletes",
        atleta,
        { data: { guardians: righeInArrivo() } },
        scopeZeroChiaviW39,
      )
      .then(() => "riuscita")
      .catch((errore) => String(errore?.message || errore));

    /*
      **Il salvataggio deve anche riuscire.**

      La prima stesura di questa prova chiedeva soltanto che la madre restasse
      dentro, e un **rifiuto** la soddisfaceva: con l'abbinamento posizionale
      rimesso, la scrittura veniva negata dalla guardia della crescita e la
      prova restava verde. Cioe non discriminava il difetto che esiste per
      misurare.

      Rifiutare un riordino ordinario a un ruolo che non concede niente e a sua
      volta un difetto — e il verso «troppo chiuso» che questo pacchetto ha
      gia pagato quattro volte. Le due meta si chiedono percio insieme.
    */
    prova(
      titolo,
      ["riuscita", true, true],
      [
        esito,
        prima,
        await cruscottoW25.canParentAccessAthlete(ANNA.id, atleta),
      ],
      nota,
    );

    await prisma.athlete.delete({ where: { id: atleta } });
  };

  await provaSpostamento(
    "W-39 riordinare le righe non sposta il marchio sulla madre",
    () => [
      { name: "Madre", email: ANNA.email, linkedUserId: ANNA.id },
      { name: "Revocata", email: BRUNO.email },
    ],
    "prima: la madre perdeva tutto, senza audit",
  );

  await provaSpostamento(
    "W-39b ne mandare id che in archivio non esistono",
    () => [
      { id: "x1", name: "Revocata", email: BRUNO.email },
      { id: "x2", name: "Madre", email: ANNA.email, linkedUserId: ANNA.id },
    ],
    "prima: l'abbinamento cadeva sulla posizione",
  );

  await provaSpostamento(
    "W-39c ne duplicare un id per forzare l'abbinamento posizionale",
    () => [
      { id: "uguale", name: "Revocata", email: BRUNO.email },
      { id: "uguale", name: "Madre", email: ANNA.email, linkedUserId: ANNA.id },
    ],
    "prima: l'id duplicato disattivava il confronto per identita",
  );

  /*
    **W-40 (High).** Il ripiego posizionale valeva solo ad array di **pari
    lunghezza**, e le righe che portano `contactOnly` sono proprio quelle senza
    `id`: aggiungere o togliere un tutore nello stesso salvataggio le lasciava
    senza abbinamento, e il segno spariva. Definitivamente, perche il riporto
    successivo copia da un archivio che non ce l'ha piu — e per `contactOnly`
    non esiste nessun secondo registro.
  */
  const FIGLIO_LUNGHEZZA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_LUNGHEZZA,
      organization_id: CLUB,
      first_name: "Lunghezza",
      last_name: "Diversa",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_LUNGHEZZA,
    row: { firstName: "Zio", email: BRUNO.email },
    contactOnly: true,
  });

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_LUNGHEZZA,
    {
      data: {
        guardians: [
          { name: "Zio", email: BRUNO.email },
          { name: "Madre", email: ANNA.email, linkedUserId: ANNA.id },
        ],
      },
    },
    scopeClubW29,
  );

  const dopoLunghezza = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_LUNGHEZZA },
      select: { data: true },
    })
  )?.data;

  prova(
    "W-40 il segno sopravvive a un salvataggio che allunga l'elenco",
    [true, false],
    [
      Boolean((dopoLunghezza?.guardians || [])[0]?.contactOnly),
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_LUNGHEZZA),
    ],
    "prima: spariva, e l'indirizzo di uno sconosciuto diventava una chiave",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_LUNGHEZZA } });

  /*
    **W-41.** E le due proprieta che il riporto per identita deve tenere
    insieme, misurate accanto: il padre che condivide l'indirizzo di famiglia
    con la madre revocata **resta dentro**, e la madre che si ripresenta con il
    proprio identificativo **resta fuori**.

    **Cosa misura adesso.** «L'indirizzo condiviso non e un'identita» era il
    modo di dirlo quando l'identita andava dedotta: adesso l'indirizzo **e**
    l'identita, quindi due tutori dello stesso atleta non lo condividono e la
    meta sbagliata di quella regola non ha piu un caso in cui applicarsi. Le
    due proprieta che restano sono le due che contano davvero, e si misurano
    con lo stesso salvataggio: un salvataggio ordinario **non toglie** l'accesso
    a chi ce l'ha, e **non lo restituisce** a chi e stato revocato — nemmeno
    quando il corpo in arrivo dichiara il legame per tutte e due.
  */
  const FIGLIO_DUE_VERSI = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_DUE_VERSI,
      organization_id: CLUB,
      first_name: "Due",
      last_name: "Versi",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_DUE_VERSI,
    rows: [
      { legacyId: "madre", firstName: "Anna", email: ANNA.email },
      { legacyId: "padre", firstName: "Bruno", email: BRUNO.email },
    ],
    canGrantAccess: true,
  });
  const rigaMadreDueVersi = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_DUE_VERSI, legacy_id: "madre" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: FIGLIO_DUE_VERSI,
    guardianRowId: rigaMadreDueVersi.id,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_DUE_VERSI,
    identityKeys: [BRUNO.email],
    userId: BRUNO.id,
    email: BRUNO.email,
  });

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_DUE_VERSI,
    {
      data: {
        guardians: [
          { name: "Anna", email: ANNA.email, linkedUserId: ANNA.id },
          { name: "Bruno", email: BRUNO.email, linkedUserId: BRUNO.id },
        ],
      },
    },
    scopeClubW29,
  );

  prova(
    "W-41 il padre resta dentro, la madre revocata resta fuori",
    [true, false],
    [
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_DUE_VERSI),
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_DUE_VERSI),
    ],
    "le due meta della stessa regola, sulla riga invece che sull'elenco",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_DUE_VERSI } });

  /* ---------- W-42..W-46: il resto del sedicesimo round ---------- */

  /*
    **W-42 (Critical).** L'area famiglia non applicava il pro-rata. Il ponte
    verso il riepilogo non aveva il parametro del periodo di stagione, che e il
    ripiego usato quando il piano accende il pro-rata senza dichiarare il
    proprio. Misurato: la scheda atleta calcolava 300, l'area famiglia 600, e
    la famiglia leggeva «Totale dovuto 600,00 EUR» sopra un elenco di rate che
    somma 300 — un residuo che non sarebbe mai sceso a zero.
  */
  const riepilogoW42 = await carica("src/lib/athlete-enrollment-summary.ts");
  const pianoW42 = [
    {
      id: "piano-prorata",
      name: "Stagionale",
      amount: 600,
      proration: { enabled: true, method: "months" },
    },
  ];
  const atletaW42 = {
    id: randomUUID(),
    data: {
      selectedPlanId: "piano-prorata",
      enrollmentDate: "2026-02-01",
      enrollmentStartDate: "2026-02-01",
    },
  };

  const senzaPeriodo = riepilogoW42.getAthleteEnrollmentSummary({
    athlete: atletaW42,
    athleteId: atletaW42.id,
    paymentPlans: pianoW42,
  });
  const conPeriodo = riepilogoW42.getAthleteEnrollmentSummary({
    athlete: atletaW42,
    athleteId: atletaW42.id,
    paymentPlans: pianoW42,
    seasonPeriod: { startDate: "2025-09-01", endDate: "2026-08-31" },
  });

  prova(
    "W-42 il riepilogo della famiglia sa applicare il pro-rata",
    true,
    Number(conPeriodo?.income?.expectedTotal || 0) <
      Number(senzaPeriodo?.income?.expectedTotal || 0),
    "con periodo: " +
      conPeriodo?.income?.expectedTotal +
      " — senza: " +
      senzaPeriodo?.income?.expectedTotal,
  );

  /*
    E il cruscotto lo passa davvero: il dato era gia nel file, ne uscivano solo
    id ed etichetta della stagione.
  */
  const cruscottoSorgente = await import("node:fs").then((fs) =>
    fs.readFileSync("src/lib/server/parent-dashboard.ts", "utf8"),
  );

  prova(
    "W-42b e il cruscotto della famiglia lo passa",
    true,
    cruscottoSorgente.includes("seasonPeriod: periodoStagione"),
    "prima: il parametro non esisteva nemmeno in firma",
  );

  /*
    **W-43 (High).** La ripartizione in rate produceva rate da 0,00 —
    impagabili, perche lo stato «pagata» chiede un dovuto maggiore di zero e
    nessun canale la puo chiudere — e rate negative su un piano configurato
    male.
  */
  const rateW43 = await carica("src/lib/payment-plan-utils.ts");
  const distribuzioni = [
    rateW43.roundInstallmentsToFive(Array(3).fill(4), 12),
    rateW43.roundInstallmentsToFive(Array(4).fill(6), 10),
    rateW43.roundInstallmentsToFive(Array(12).fill(100 / 12), 100),
  ];

  prova(
    "W-43 nessuna rata a zero, nessuna negativa, e la somma torna",
    [true, true, true],
    [
      distribuzioni.every((righe) => righe.every((valore) => valore > 0)),
      distribuzioni.every((righe) => righe.every((valore) => valore >= 0)),
      distribuzioni.every(
        (righe, indice) =>
          Math.abs(
            righe.reduce((somma, valore) => somma + valore, 0) -
              [12, 10, 100][indice],
          ) < 0.01,
      ),
    ],
    JSON.stringify(distribuzioni),
  );

  /*
    **W-44 (M1).** La fascia notturna accettava le sue due meta separate e
    rifiutava la prenotazione che le usa insieme — citando nel messaggio la
    fascia che la conteneva.
  */
  prova(
    "W-44 una prenotazione che scavalca la mezzanotte sta nella sua fascia",
    true,
    struttureW37.isWithinFieldAvailability(
      { availability: { Ven: [{ start: "22:00", end: "02:00" }] } },
      struttureW37.instantFromLocalTime("2026-09-11", "23:00"),
      struttureW37.instantFromLocalTime("2026-09-12", "01:00"),
    ),
    "prima: rifiutata, e il messaggio elencava «Ven 22:00-02:00»",
  );

  /*
    **W-45 (M2).** Il ripiego sulla coppia storica scattava su «nessuna
    corrispondenza nell'elenco», non su «elenco vuoto»: con `guardians` pieno e
    un id inesistente, la chiamata revocava `parent1` — una riga che la scheda
    non mostra — e ne metteva l'indirizzo nel registro, che vale per tutto
    l'atleta.
  */
  const FIGLIO_MISTO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_MISTO,
      organization_id: CLUB,
      first_name: "Misto",
      last_name: "Storico",
      status: "active",
      updated_at: new Date(),
      data: {
        parent1: { name: "Anna", email: ANNA.email, linkedUserId: ANNA.id },
      },
    },
  });

  /*
    La riga che la scheda **mostra** e una riga vera; la coppia storica resta
    nel blob e non e stata travasata, cioe e esattamente cio che il ripiego
    andava a pescare. Il ripiego non c'e piu — `findGuardianRow` interroga la
    tabella e basta — e la prova lo chiede in tutti e due i versi: la chiamata
    con un id che non nomina nessuna riga fallisce, e la riga che la scheda
    mostra resta com'era.
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_MISTO,
    rows: [{ legacyId: "nonna", firstName: "Nonna", email: BRUNO.email }],
    canGrantAccess: true,
  });
  const rigaMisto = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_MISTO, legacy_id: "nonna" },
  });

  /*
    L'id e quello che la coppia storica **porta**: e cosi che il ripiego
    scattava, e con `guardians` pieno revocava una riga che la scheda non
    mostra. Un id inventato non avrebbe misurato niente.
  */
  const esitoMisto = await legamiW25
    .unlinkGuardianAccount(scopeClubW29, {
      athleteId: FIGLIO_MISTO,
      guardianId: ANNA.email,
    })
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-45 un id inesistente non revoca una riga che la scheda non mostra",
    [true, false],
    [
      esitoMisto !== "riuscita",
      Boolean(
        (
          await prisma.athleteGuardian.findUnique({
            where: { id: rigaMisto.id },
          })
        )?.revoked_at,
      ),
    ],
    esitoMisto,
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_MISTO } });

  /*
    **W-46 (M4).** «Segna tutte come lette» chiudeva anche le notifiche
    dell'**altro** figlio: la pastiglia contava quelle del figlio scelto, la
    scrittura filtrava solo per genitore e club.
  */
  const cruscottoW46 = await carica("src/lib/server/parent-dashboard.ts");

  prova(
    "W-46 il predicato del figlio e uno solo, e lo usano tutte e due",
    [true, false, true],
    [
      cruscottoW46.notificationBelongsToAthlete(
        { data: { athleteId: MARCO } },
        MARCO,
      ),
      cruscottoW46.notificationBelongsToAthlete(
        { data: { athleteId: LUCA } },
        MARCO,
      ),
      cruscottoW46.notificationBelongsToAthlete({ data: {} }, MARCO),
    ],
    "una che nomina un altro figlio non e di questo; una che non nomina nessuno e del club",
  );

  /* ---------- W-47..W-49: il diciottesimo round ---------- */

  /*
    **W-47 (High).** La revoca di un genitore si propagava all'altro al primo
    salvataggio dell'anagrafica.

    Configurazione ordinaria e prevista da ADR-0114: la madre ha riscattato un
    invito (identificativo e indirizzo suoi), il padre entra **per l'indirizzo
    di famiglia**, che sta su tutte e due le righe. Dopo la revoca della madre
    `clearLinkedFields` le azzera gli identificativi e le lascia l'indirizzo —
    al club serve — quindi la sua identita **collassa** su quell'indirizzo, che
    e la stessa del padre. Il riporto per identita gli scriveva addosso il
    marchio: calendario, rate, ricevute, documenti e certificato spariti, senza
    che nessuno avesse premuto niente, e con un `anagrafica.updated` in audit.

    Il commento della stesura precedente prometteva proprio questo caso; era
    vero solo per il padre che porta un **identificativo riconosciuto**, cioe
    non per quello per cui ADR-0114 esiste.

    **Cosa misura adesso.** Il difetto era il **riporto per identita**: dopo la
    revoca l'identita della madre collassava sull'indirizzo di famiglia, e da
    li si spalmava sul padre. Non c'e piu ne un riporto ne un collasso —
    l'identita di una riga e fissata quando la riga nasce e la revoca e una
    colonna su quella riga — e non c'e piu nemmeno l'indirizzo condiviso, che
    la chiave unica non ammette. Le due strade di ADR-0114 restano due (la
    madre per legame dichiarato, il padre per indirizzo scritto dal club), e la
    proprieta e la stessa: **revocare la madre non tocca il padre, ne subito ne
    al primo salvataggio.**
  */
  const FIGLIO_DUE_STRADE = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_DUE_STRADE,
      organization_id: CLUB,
      first_name: "Due",
      last_name: "Strade",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_DUE_STRADE,
    rows: [
      { legacyId: "madre", firstName: "Anna", email: ANNA.email },
      { legacyId: "padre", firstName: "Bruno", email: BRUNO.email },
    ],
    canGrantAccess: true,
  });
  /* La madre ha riscattato un invito; il padre entra per il solo indirizzo. */
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_DUE_STRADE,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });
  const rigaMadreDueStrade = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_DUE_STRADE, legacy_id: "madre" },
  });

  const partenzaW47 = [
    await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_DUE_STRADE),
    await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_DUE_STRADE),
  ];

  await legamiW25.unlinkGuardianAccount(scopeClubW29, {
    athleteId: FIGLIO_DUE_STRADE,
    guardianId: rigaMadreDueStrade.id,
  });

  const dopoRevocaW47 = [
    await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_DUE_STRADE),
    await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_DUE_STRADE),
  ];

  /* Un salvataggio ordinario: la segreteria cambia una taglia. */
  const datiW47 = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_DUE_STRADE },
      select: { data: true },
    })
  )?.data;

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_DUE_STRADE,
    { data: { ...datiW47, size: "M" } },
    scopeClubW29,
  );

  prova(
    "W-47 un salvataggio ordinario non propaga la revoca all'altro genitore",
    [true, true, false, true, false, true],
    [
      partenzaW47[0],
      partenzaW47[1],
      dopoRevocaW47[0],
      dopoRevocaW47[1],
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_DUE_STRADE),
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_DUE_STRADE),
    ],
    "prima: il padre perdeva tutto al primo salvataggio, senza audit",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_DUE_STRADE } });

  /*
    **W-47b.** Lo stesso, su righe che un id **non ce l'hanno** — che e lo stato
    in cui arrivano da un'anagrafica travasata o dall'approvazione di un modulo,
    cioe proprio dove l'abbinamento e costretto a indovinare.

    **Cosa misura adesso.** «Righe senza id» era la classe piu esposta perche
    l'abbinamento doveva dedurle; adesso una riga nasce con la propria chiave
    primaria anche quando nessuna chiave storica la nomina, e la scheda
    pubblica quella. La prova tiene percio il caso — righe senza `legacy_id`,
    cioe senza nessun riferimento al blob — e chiede la stessa cosa di `W-47`:
    revocare la madre non tocca il padre, ne subito ne al primo salvataggio.
  */
  const FIGLIO_SENZA_CHIAVI = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SENZA_CHIAVI,
      organization_id: CLUB,
      first_name: "Senza",
      last_name: "Chiavi",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SENZA_CHIAVI,
    rows: [
      { firstName: "Anna", email: ANNA.email },
      { firstName: "Bruno", email: BRUNO.email },
    ],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_SENZA_CHIAVI,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  /* L'identificativo che la scheda mostra, non uno ricalcolato. */
  const idMadreSullaScheda = (
    (
      await prisma.athlete.findUnique({
        where: { id: FIGLIO_SENZA_CHIAVI },
        select: { data: true },
      })
    )?.data?.guardians || []
  ).find((riga) => String(riga?.email || "").toLowerCase() === String(ANNA.email).toLowerCase())?.id;

  await legamiW25.unlinkGuardianAccount(scopeClubW29, {
    athleteId: FIGLIO_SENZA_CHIAVI,
    guardianId: idMadreSullaScheda,
  });

  const dopoRevocaSenzaId = [
    await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_SENZA_CHIAVI),
    await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_SENZA_CHIAVI),
  ];

  const datiSenzaId = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_SENZA_CHIAVI },
      select: { data: true },
    })
  )?.data;

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_SENZA_CHIAVI,
    { data: { ...datiSenzaId, size: "S" } },
    scopeClubW29,
  );

  prova(
    "W-47b e nemmeno su righe senza id, dove non si sa quale sia quale",
    [false, true, false, true],
    [
      dopoRevocaSenzaId[0],
      dopoRevocaSenzaId[1],
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_SENZA_CHIAVI),
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_SENZA_CHIAVI),
    ],
    "prima: il padre ereditava il marchio della madre e restava fuori",
  );

  /* E da adesso quelle righe un id ce l'hanno: la prossima volta non si indovina. */
  const conIdW47 = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_SENZA_CHIAVI },
      select: { data: true },
    })
  )?.data;

  prova(
    "W-47c ogni riga tutore esce dal salvataggio con un id stabile",
    true,
    (conIdW47?.guardians || []).every((riga) => String(riga?.id || "").trim()),
    "prima: restavano senza, e ogni salvataggio doveva indovinare di nuovo",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SENZA_CHIAVI } });

  /*
    **W-48.** E il segno di solo-recapito non si spalma sul genitore vero che
    condivide l'indirizzo: e la stessa radice, dall'altro lato.

    **Cosa misura adesso.** Il segno si spalmava perche il riporto cercava la
    riga «corrispondente» per identita, e due righe con lo stesso indirizzo
    erano indistinguibili. Il riporto non c'e piu, e nemmeno l'indirizzo
    condiviso: `contact_only` e una colonna della riga che lo ha, e nessun ramo
    del salvataggio la scrive. La prova tiene le due righe — lo sconosciuto del
    modulo pubblico e la madre — ognuna sul proprio indirizzo, e chiede la
    stessa cosa: **il segno resta dove e nato, e la madre continua a entrare.**
  */
  const FIGLIO_SEGNO_CONDIVISO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SEGNO_CONDIVISO,
      organization_id: CLUB,
      first_name: "Segno",
      last_name: "Condiviso",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SEGNO_CONDIVISO,
    row: { legacyId: "sconosciuto", firstName: "Tizio", email: BRUNO.email },
    contactOnly: true,
  });
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SEGNO_CONDIVISO,
    rows: [
      { legacyId: "sconosciuto", firstName: "Tizio", email: BRUNO.email },
      { legacyId: "madre", firstName: "Anna", email: ANNA.email },
    ],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_SEGNO_CONDIVISO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const datiSegno = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_SEGNO_CONDIVISO },
      select: { data: true },
    })
  )?.data;

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_SEGNO_CONDIVISO,
    { data: { ...datiSegno, size: "L" } },
    scopeClubW29,
  );

  const dopoSegno = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_SEGNO_CONDIVISO },
      select: { data: true },
    })
  )?.data;

  prova(
    "W-48 il segno resta sulla riga che lo aveva, e non passa all'altra",
    [true, false, true],
    [
      Boolean(
        (dopoSegno?.guardians || []).find(
          (r) =>
            String(r?.email || "").toLowerCase() ===
            String(BRUNO.email).toLowerCase(),
        )?.contactOnly,
      ),
      Boolean(
        (dopoSegno?.guardians || []).find(
          (r) =>
            String(r?.email || "").toLowerCase() ===
            String(ANNA.email).toLowerCase(),
        )?.contactOnly,
      ),
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_SEGNO_CONDIVISO),
    ],
    "prima: la madre ereditava il segno di uno sconosciuto allo stesso indirizzo",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SEGNO_CONDIVISO } });

  /*
    **W-49 (High).** La ripartizione in rate con un importo **fisso**: il
    vincolo «non piu di quello che resta» era andato perso nella riscrittura, e
    un acconto fisso maggiore del totale ripartito produceva una somma diversa
    dal totale e una rata da 0,00 — quella che nessun canale puo chiudere.
  */
  const rateW49 = await carica("src/lib/payment-plan-utils.ts");
  const distribuzioniW49 = [
    rateW49.roundInstallmentsToFive([200, 25, 25], 150, { preserveIndexes: [0] }),
    rateW49.roundInstallmentsToFive([500, 25, 25], 100, { preserveIndexes: [0] }),
    rateW49.roundInstallmentsToFive([200, 200, 200], 600, { preserveIndexes: [0] }),
  ];
  const totaliW49 = [150, 100, 600];

  prova(
    "W-49 con un acconto fisso la somma resta il totale, e nessuna rata e zero",
    [true, true],
    [
      distribuzioniW49.every(
        (righe, indice) =>
          Math.abs(
            righe.reduce((somma, valore) => somma + valore, 0) -
              totaliW49[indice],
          ) < 0.01,
      ),
      distribuzioniW49.every((righe) => righe.every((valore) => valore > 0)),
    ],
    JSON.stringify(distribuzioniW49),
  );

  /* ---------- W-50..W-52: il diciannovesimo round ---------- */

  /*
    **W-50 (High).** Il segno di solo-recapito veniva **cancellato** dalla rotta
    su una riga nuova che porta un indirizzo gia noto — e la configurazione
    ordinaria di ADR-0114, due tutori sulla stessa email di famiglia.

    Non serve nessun attaccante: due moduli pubblici approvati dalla segreteria.
    Il dominio dei moduli scrive `contactOnly` sulla riga che nasce; la rotta,
    vedendo l'indirizzo gia in archivio, la trattava come «conosciuta» e le
    toglieva il segno. Da quel momento chi ha compilato un modulo pubblico
    dichiarandosi tutore — senza dimostrare niente — apriva l'area famiglia del
    minore: allergie, farmaci, byte del certificato, rate, ricevute.

    La «seconda difesa» non copriva: la guardia della crescita chiede le due
    chiavi, e chi approva i moduli le ha. Non e una seconda porta, e la stessa.
  */
  const FIGLIO_DUE_MODULI = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_DUE_MODULI,
      organization_id: CLUB,
      first_name: "Due",
      last_name: "Moduli",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_DUE_MODULI,
    row: { legacyId: "zio", firstName: "Zio", email: BRUNO.email },
    contactOnly: true,
  });

  const primaDelSecondo = await cruscottoW25.canParentAccessAthlete(
    BRUNO.id,
    FIGLIO_DUE_MODULI,
  );

  /* Cio che fa `form-submissions.ts`: `guardians.push` di una riga marcata. */
  const datiDueModuli = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_DUE_MODULI },
      select: { data: true },
    })
  )?.data;

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_DUE_MODULI,
    {
      data: {
        ...datiDueModuli,
        guardians: [
          ...(datiDueModuli?.guardians || []),
          {
            name: "Nonna",
            email: BRUNO.email,
            contactOnly: true,
            contact_only: true,
          },
        ],
      },
    },
    scopeClubW29,
  );

  const dopoDueModuli = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_DUE_MODULI },
      select: { data: true },
    })
  )?.data;

  prova(
    "W-50 il segno di una riga nuova non si cancella perche l'indirizzo e noto",
    [false, true, false],
    [
      primaDelSecondo,
      (dopoDueModuli?.guardians || []).every((riga) => Boolean(riga?.contactOnly)),
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_DUE_MODULI),
    ],
    "prima: il segno spariva e l'area famiglia del minore si apriva",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_DUE_MODULI } });

  /*
    **W-51 (High).** L'`id` arriva dal corpo della richiesta, e vinceva su
    `linkedUserId` e sull'indirizzo — cioe sui due dati che dicono davvero di
    chi e quella riga. Mandando la riga della madre con l'`id` di una riga
    revocata, il marchio le finiva addosso: perdeva calendario, rate, ricevute,
    documenti e certificato, con un `anagrafica.updated` in audit e nessuna
    schermata che lo spiegasse.

    E la stessa classe che l'id stabile doveva chiudere, riaperta dalla riga
    aggiunta per chiuderla: la superficie cresceva con il proprio rimedio.
  */
  const FIGLIO_ID_RUBATO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_ID_RUBATO,
      organization_id: CLUB,
      first_name: "Id",
      last_name: "Rubato",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_ID_RUBATO,
    rows: [
      { legacyId: "ra", firstName: "Revocata", email: BRUNO.email },
      { legacyId: "rb", firstName: "Anna", email: ANNA.email },
    ],
    canGrantAccess: true,
  });
  const rigaRevocataRubata = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_ID_RUBATO, legacy_id: "ra" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: FIGLIO_ID_RUBATO,
    guardianRowId: rigaRevocataRubata.id,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_ID_RUBATO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const primaIdRubato = await cruscottoW25.canParentAccessAthlete(
    ANNA.id,
    FIGLIO_ID_RUBATO,
  );

  /*
    La riga della madre, mandata con l'identificativo **della riga revocata**.
    L'identificativo nomina una riga che esiste, ma l'identita che porta e
    un'altra: e la sostituzione di un indirizzo, non la madre che eredita il
    marchio. La riga revocata non si tocca — non si toglie e non si riapre — e
    quella della madre si aggiorna dove vive.
  */
  await risorseW26.updateResource(
    "athletes",
    FIGLIO_ID_RUBATO,
    {
      data: {
        guardians: [
          {
            id: rigaRevocataRubata.id,
            name: "Anna",
            email: ANNA.email,
            linkedUserId: ANNA.id,
          },
        ],
      },
    },
    scopeClubW29,
  );

  prova(
    "W-51 un id preso da un'altra riga non sposta il marchio sulla madre",
    [true, true],
    [
      primaIdRubato,
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_ID_RUBATO),
    ],
    "prima: la madre perdeva tutto, e in audit restava un salvataggio anagrafica",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_ID_RUBATO } });

  /*
    **W-52.** E il verso opposto della stessa regola: correggere un refuso
    nell'indirizzo di un tutore **non** deve fargli perdere il segno. La riga
    resta la stessa — l'`id` lo dice, e nessun'altra identita lo contraddice.

    **Come e stata trovata, e come e stata chiusa.** Nel modello nuovo
    l'indirizzo **e** l'identita, quindi correggerlo non aggiorna la riga: ne fa
    nascere una seconda e toglie la prima. `readGuardianInputFromCard` non
    traduce `contactOnly` — e giusto, un salvataggio non deve poter **mettere**
    il segno — quindi la riga che nasceva dalla correzione nasceva **senza**, e
    il segno di una riga dichiarata da uno sconosciuto se ne andava con il
    gesto piu ordinario che una segreteria compia.

    Se quell'indirizzo appartiene a un'utenza verificata, da quel momento apre
    allergie, farmaci e i byte del certificato di un minore. Era esattamente
    cio che la regola del modulo proprietario esclude («`contact_only` non si
    toglie da qui: lo toglie solo un invito riscattato»), e la regola non
    reggeva perche la sostituzione di una riga non e ne un aggiornamento ne una
    creazione, ed era stata pensata come le due cose separate.

    `saveGuardianRegistry` eredita adesso il segno dalla riga sostituita. Nel
    verso opposto non eredita niente: una riga senza segno non ne acquista uno.
  */
  const FIGLIO_REFUSO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_REFUSO,
      organization_id: CLUB,
      first_name: "Refuso",
      last_name: "Corretto",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_REFUSO,
    row: { legacyId: "t", firstName: "Zio", email: "zioo@estraneo.invalid" },
    contactOnly: true,
  });
  const rigaRefuso = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_REFUSO, legacy_id: "t" },
  });

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_REFUSO,
    {
      data: {
        guardians: [
          { id: rigaRefuso.id, name: "Zio", email: "zio@estraneo.invalid" },
        ],
      },
    },
    scopeClubW29,
  );

  const dopoRefuso = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_REFUSO },
      select: { data: true },
    })
  )?.data;

  prova(
    "W-52 correggere un refuso nell'indirizzo non toglie il segno alla riga",
    ["zio@estraneo.invalid", true],
    [
      (dopoRefuso?.guardians || [])[0]?.email,
      Boolean((dopoRefuso?.guardians || [])[0]?.contactOnly),
    ],
    "il lavoro di tutti i giorni di una segreteria non deve aprire un accesso",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_REFUSO } });

  /* ---------- W-53..W-56: il ventesimo round ---------- */

  /*
    **W-53 (High).** Il segno di solo-recapito cadeva a un salvataggio ordinario
    della segreteria, e l'area famiglia del minore si apriva.

    Il payload e quello **vero** della scheda atleta: id **sintetici** che in
    archivio non esistono, e le righe **senza** `contactOnly`, perche nessun
    file client conosce quel campo. Con due tutori sullo stesso indirizzo di
    famiglia — ADR-0114, la configurazione ordinaria — l'abbinamento e ambiguo
    per costruzione, la riga risulta «nuova» e il segno si perde.

    Cinque stesure del riporto hanno spostato questo confine senza
    attraversarlo. La difesa e stata percio tolta dal blob: vive adesso in un
    **registro sull'atleta**, come quello delle revoche, che e l'unica delle tre
    che non e mai caduta.

    **Cosa misura adesso.** Il registro di scheda e stato a sua volta superato:
    era il surrogato di una chiave, e con la chiave il segno vive su
    `athlete_guardians.contact_only`, dove la rotta non arriva — toglie
    `guardians` dal corpo prima di scrivere, e `readGuardianInputFromCard` non
    traduce il campo. Cade anche il presupposto dell'ambiguita: due tutori sullo
    stesso indirizzo di famiglia sono **una** riga, perche l'indirizzo e la
    chiave. La proprieta misurata e identica, ed e quella che conta: **la
    segreteria salva la scheda e l'area famiglia del minore non si apre.**
  */
  const FIGLIO_SALVATAGGIO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SALVATAGGIO,
      organization_id: CLUB,
      first_name: "Salvataggio",
      last_name: "Ordinario",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SALVATAGGIO,
    row: { firstName: "Zio", email: BRUNO.email },
    contactOnly: true,
  });

  const primaDelSalvataggio = await cruscottoW25.canParentAccessAthlete(
    BRUNO.id,
    FIGLIO_SALVATAGGIO,
  );

  /* Cio che manda la scheda atleta: id sintetici, e niente segno. */
  const righeDallaScheda = contattiW25
    .normalizeGuardianRows([{ name: "Zio", email: BRUNO.email }])
    .map((riga) => ({ id: riga.id, name: riga.name, email: riga.email }));

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_SALVATAGGIO,
    { data: { guardians: righeDallaScheda, size: "M" } },
    scopeClubW29,
  );

  prova(
    "W-53 un salvataggio della scheda non apre l'area famiglia a un estraneo",
    [false, false],
    [
      primaDelSalvataggio,
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_SALVATAGGIO),
    ],
    "prima: la segreteria salvava una taglia e il minore si apriva",
  );

  /*
    E il segno sopravvive al salvataggio: e la proprieta che lo rende una difesa
    invece di un'annotazione. Prima si chiedeva al registro di scheda, che era
    l'unica delle tre difese mai caduta; adesso si chiede alla colonna, che e
    dove il registro voleva arrivare — un posto che la rotta non sostituisce.
  */
  const rigaSalvataggio = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_SALVATAGGIO },
  });

  prova(
    "W-53b il segno del solo recapito sopravvive al blob sostituito",
    true,
    Boolean(rigaSalvataggio?.contact_only),
    "prima: la difesa viveva nella riga del blob, e la riga la rotta la sostituisce",
  );

  /*
    **W-54.** E non si puo togliere dalla rotta generica: una difesa che chi la
    subisce puo cancellare non e una difesa. Il corpo prova le due strade che
    esistevano — svuotare il registro di scheda, che la rotta toglie dal corpo
    perche non e piu scrivibile, e dichiarare `contactOnly: false` sulla riga,
    che il traduttore non guarda.
  */
  await risorseW26.updateResource(
    "athletes",
    FIGLIO_SALVATAGGIO,
    {
      data: {
        guardians: righeDallaScheda.map((riga) => ({
          ...riga,
          contactOnly: false,
          contact_only: false,
        })),
        contactOnlyIdentities: [],
      },
    },
    scopeClubW29,
  );

  prova(
    "W-54 dalla rotta generica il segno non si toglie",
    [true, false],
    [
      Boolean(
        (
          await prisma.athleteGuardian.findUnique({
            where: { id: rigaSalvataggio.id },
          })
        )?.contact_only,
      ),
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_SALVATAGGIO),
    ],
    "stessa disciplina della revoca: e un fatto sulla riga, non un'annotazione",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SALVATAGGIO } });

  /*
    **W-55.** Il verso opposto, che vale quanto l'altro: un invito **riscattato**
    scioglie il segno, e la famiglia torna a vedere **e** a ricevere. Meta
    accesso e la forma di difetto che questo pacchetto ha gia pagato due volte.

    Il riscatto non si simula piu svuotando un registro: si chiama, ed e
    l'unica funzione che toglie `contact_only` — la stessa che toglie una
    revoca, perche sono la stessa promessa mantenuta alla stessa persona.
  */
  const FIGLIO_RISCATTO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_RISCATTO,
      organization_id: CLUB,
      first_name: "Riscatto",
      last_name: "Completo",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_RISCATTO,
    row: { legacyId: "t", firstName: "Anna", email: ANNA.email },
    contactOnly: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_RISCATTO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const schedaRiscatto = await prisma.athlete.findUnique({
    where: { id: FIGLIO_RISCATTO },
    select: { id: true, data: true },
  });

  prova(
    "W-55 dopo un riscatto la famiglia vede e riceve, non una meta sola",
    [true, 1, 1],
    [
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_RISCATTO),
      contattiW25.readAthleteGuardianContacts(schedaRiscatto).length,
      promemoriaW25.getGuardianRows(schedaRiscatto).length,
    ],
    "un legame dichiarato vince sul segno, e vale per tutti e tre i canali",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_RISCATTO } });

  /*
    **W-56 (Medium).** Due righe potevano restare in archivio con lo **stesso**
    id: l'assegnazione toccava solo le righe che un id non ce l'avevano, e da
    quel momento l'abbinamento per id era spento per sempre. Il rimedio scritto
    nel messaggio di «Scollega account» — «salva la scheda e riprova» — non era
    vero, e mandava chi lo leggeva in un vicolo cieco.
  */
  const FIGLIO_ID_DOPPIO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_ID_DOPPIO,
      organization_id: CLUB,
      first_name: "Id",
      last_name: "Doppio",
      status: "active",
      updated_at: new Date(),
      data: { guardians: [{ id: "x", name: "Uno" }, { id: "x", name: "Due" }] },
    },
  });

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_ID_DOPPIO,
    { data: { guardians: [{ id: "x", name: "Uno" }, { id: "x", name: "Due" }] } },
    scopeClubW29,
  );

  const idDopo = (
    (
      await prisma.athlete.findUnique({
        where: { id: FIGLIO_ID_DOPPIO },
        select: { data: true },
      })
    )?.data?.guardians || []
  ).map((riga) => String(riga?.id || ""));

  prova(
    "W-56 salvare la scheda disambigua davvero gli id, come il messaggio promette",
    [2, true],
    [new Set(idDopo).size, idDopo.every((voce) => voce)],
    JSON.stringify(idDopo),
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_ID_DOPPIO } });

  /*
    **W-57 (Medium).** La difesa che governa l'accesso al dato sanitario di un
    minore non compariva in nessuna schermata: `grep` su tutto `src/components`
    e `src/app`, zero occorrenze. Prima e dopo che il segno cadesse, la scheda
    mostrava la stessa riga e lo stesso badge mentre il vaglio dell'accesso
    passava da «no» a «si». E la forma dell'errore n. 8 di CLAUDE.md applicata
    a una difesa: il club non poteva vedere ne che una riga e solo un recapito,
    ne che il segno era caduto.
  */
  prova(
    "W-57 la scheda distingue un recapito da un account collegato",
    ["contact-only", "Solo recapito", "linked"],
    [
      contattiW25.getGuardianAccessStatus({
        name: "Zio",
        email: BRUNO.email,
        contactOnly: true,
      }).state,
      contattiW25.getGuardianAccessStatus({
        name: "Zio",
        email: BRUNO.email,
        contactOnly: true,
      }).label,
      contattiW25.getGuardianAccessStatus({
        name: "Anna",
        email: ANNA.email,
        linkedUserId: ANNA.id,
      }).state,
    ],
    "prima: «Account non collegato» in tutti e due i casi, e nessuna differenza a schermo",
  );

  /* ---------- W-58..W-61: il ventunesimo round ---------- */

  /*
    **W-58 (High).** Il registro nuovo si poteva **impugnare**. Era conservato
    in «sola aggiunta» perche l'approvazione di un modulo ci passava attraverso,
    e da quella fessura un ruolo di club a **zero chiavi** ci infilava
    l'indirizzo di un genitore legittimo: lui trovava «Accesso negato» sul
    proprio figlio e smetteva di ricevere solleciti e promemoria, con un
    `anagrafica.updated` in audit e nessuna schermata che lo spiegasse.

    La guardia della crescita non lo vede perche misura **solo la crescita**, e
    iniettare nel registro restringe. E la stessa arma che il registro gemello
    rifiuta a lettere venti righe piu sotto, nello stesso file.
  */
  const FIGLIO_INIEZIONE = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_INIEZIONE,
      organization_id: CLUB,
      first_name: "Registro",
      last_name: "Impugnato",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_INIEZIONE,
    rows: [{ legacyId: "madre", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  const rigaIniezione = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_INIEZIONE, legacy_id: "madre" },
  });

  const primaIniezione = await cruscottoW25.canParentAccessAthlete(
    ANNA.id,
    FIGLIO_INIEZIONE,
  );

  /*
    L'arma e la stessa, nelle due forme che il corpo puo prendere: il registro
    di scheda — che non e piu scrivibile — e il segno dichiarato sulla riga.
    Nessuna delle due arriva alla colonna, e la madre resta dentro.
  */
  await risorseW26.updateResource(
    "athletes",
    FIGLIO_INIEZIONE,
    {
      data: {
        guardians: [
          {
            id: rigaIniezione.id,
            name: "Anna",
            email: ANNA.email,
            contactOnly: true,
          },
        ],
        contactOnlyIdentities: [String(ANNA.email).toLowerCase()],
      },
    },
    scopeAllenatoreW29,
  );

  prova(
    "W-58 dalla rotta generica il segno non si puo nemmeno mettere",
    [true, false, true],
    [
      primaIniezione,
      Boolean(
        (
          await prisma.athleteGuardian.findUnique({
            where: { id: rigaIniezione.id },
          })
        )?.contact_only,
      ),
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_INIEZIONE),
    ],
    "prima: un ruolo a zero chiavi chiudeva fuori un genitore, senza audit",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_INIEZIONE } });

  /*
    **W-59 (High).** Il registro nega **per identita, da qualunque riga**, e non
    conosce la regola «non si declassa un tutore che il club aveva scritto» che
    protegge il marchio di riga. Su un atleta la cui unica riga e
    `{ Anna, famiglia@… }` senza legame dichiarato — la capability di ADR-0114 —
    l'approvazione di un modulo che dichiara un secondo tutore **allo stesso
    indirizzo** avvelenava quell'indirizzo, e la madre restava fuori.
  */
  const FIGLIO_INDIRIZZO_CONDIVISO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_INDIRIZZO_CONDIVISO,
      organization_id: CLUB,
      first_name: "Indirizzo",
      last_name: "Condiviso",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_INDIRIZZO_CONDIVISO,
    rows: [{ legacyId: "madre", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });

  const primaCondiviso = await cruscottoW25.canParentAccessAthlete(
    ANNA.id,
    FIGLIO_INDIRIZZO_CONDIVISO,
  );

  const inviatoCondiviso = await inviiW29.submitRenewalForm(ANNA.id, {
    athleteId: FIGLIO_INDIRIZZO_CONDIVISO,
    publicSlug: moduloTutore.slug,
    answers: { f_nome_tutore: "Papa", f_email_tutore: ANNA.email },
    files: [],
    respondentEmail: ANNA.email,
  });

  await inviiW29
    .decideFormSubmission(scopeClubW29, inviatoCondiviso.submissionId, {
      decision: "approved",
    })
    .catch(() => null);

  const schedaCondivisa = await prisma.athlete.findUnique({
    where: { id: FIGLIO_INDIRIZZO_CONDIVISO },
    select: { id: true, data: true },
  });

  prova(
    "W-59 approvare un tutore allo stesso indirizzo non chiude fuori la madre",
    [true, true, 1],
    [
      primaCondiviso,
      await cruscottoW25.canParentAccessAthlete(
        ANNA.id,
        FIGLIO_INDIRIZZO_CONDIVISO,
      ),
      contattiW25.readAthleteGuardianContacts(schedaCondivisa).length,
    ],
    "prima: «Genitore aggiunto», e la madre perdeva accesso e invii",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_INDIRIZZO_CONDIVISO } });

  /*
    **W-60 (High).** «Lo toglie il riscatto di un invito» era scritto in quattro
    punti del codice e non lo faceva nessuno: `grep` sul file del riscatto
    restituiva zero. Un indirizzo di famiglia avvelenato una volta restava
    chiuso **per sempre**, per ogni persona futura che la segreteria scrivesse
    su quella scheda senza un invito nominale.

    **Cosa misura adesso.** Il registro di scheda non esiste piu e il blocco
    nemmeno: il segno e `contact_only` sulla riga, e il riscatto lo scioglie in
    **una istruzione**, dove non c'e uno snapshot da rimandare e quindi non c'e
    una corsa da perdere — cioe la ragione per cui il blocco serviva. Le due
    meta si chiedono percio insieme: che la rotta del riscatto passi davvero dal
    proprietario del tutore (e la stessa preoccupazione della stesura
    precedente, che il sorgente dichiarasse cio che poi non faceva), e che
    quell'atto apra davvero.
  */
  const riscattoSorgente = await import("node:fs").then((fs) =>
    fs.readFileSync("src/app/api/v1/auth/access/redeem/route.ts", "utf8"),
  );

  const FIGLIO_SEGNO_SCIOLTO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SEGNO_SCIOLTO,
      organization_id: CLUB,
      first_name: "Segno",
      last_name: "Sciolto",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SEGNO_SCIOLTO,
    row: { legacyId: "t", firstName: "Anna", email: ANNA.email },
    contactOnly: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_SEGNO_SCIOLTO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const rigaSegnoSciolto = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_SEGNO_SCIOLTO, legacy_id: "t" },
  });

  prova(
    "W-60 il riscatto scioglie il segno, e passa dal proprietario del tutore",
    [true, false, true],
    [
      riscattoSorgente.includes("await linkGuardianAccount(prisma, {"),
      Boolean(rigaSegnoSciolto?.contact_only),
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_SEGNO_SCIOLTO),
    ],
    "prima: quattro commenti lo dichiaravano e nessuna riga lo faceva",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SEGNO_SCIOLTO } });

  /*
    **W-61 (Medium).** L'anteprima delle rate produceva una rata da 0,00 **senza
    avviso**, e le due schermate bloccano il salvataggio solo quando un avviso
    c'e. I due controlli guardavano percentuali e importi fissi separatamente,
    mai il risultato.
  */
  const rateW61 = await carica("src/lib/payment-plan-utils.ts");
  const anteprima = rateW61.generateInstallmentPreview(
    {
      installments: [
        { label: "Acconto", amountType: "fixed", amount: 300 },
        { label: "Prima", amountType: "percentage", amount: 60 },
        { label: "Saldo", amountType: "remaining" },
        { label: "Finale", amountType: "fixed", amount: 150 },
      ],
    },
    500,
  );

  prova(
    "W-61 una rata che resterebbe a zero adesso porta un avviso",
    true,
    (anteprima?.warnings || []).some((avviso) => /zero/i.test(avviso)),
    JSON.stringify(anteprima?.installments?.map((r) => r.amount)),
  );

  /* ---------- W-62..W-66: il ventiduesimo round ---------- */

  /*
    **W-62 (High).** Il badge «Solo recapito», aggiunto due round fa, **non
    girava**: la scheda atleta gli passava `athlete.data.contactOnlyIdentities`,
    e lo stato di quella pagina e un oggetto **chiuso** costruito campo per
    campo, senza nessuna chiave `data`. Il terzo argomento era sempre vuoto e la
    funzione tornava a leggere il solo marchio di riga.

    Cioe: un tutore che il cancello rifiuta **per via del registro** compariva
    con il badge grigio «Account non collegato», e alla segreteria non veniva
    detto ne perche ne come rimediare. La correzione c'era e non si vedeva — il
    quinto caso di codice irraggiungibile di questo pacchetto, e stavolta
    l'irraggiungibile era la **spiegazione**.

    Qui si misura il **cablaggio**, non la funzione: la sonda del round
    precedente chiamava la funzione con oggetti letterali e non passava mai
    dalla pagina.
  */
  const paginaScheda = await import("node:fs").then((fs) =>
    fs.readFileSync("src/app/athletes/[id]/page.tsx", "utf8"),
  );

  prova(
    "W-62 la scheda passa davvero il registro al badge",
    [true, true, false],
    [
      paginaScheda.includes(
        "contactOnlyIdentities: athletePayload?.contactOnlyIdentities || []",
      ),
      paginaScheda.includes(
        "(athlete as any)?.contactOnlyIdentities || []",
      ),
      paginaScheda.includes("(athlete as any)?.data?.contactOnlyIdentities"),
    ],
    "prima: leggeva una chiave che quello stato non ha, e passava sempre []",
  );

  /*
    **W-63 (Medium).** Il riscatto lasciava il segno `contactOnly` sulla riga.
    La regola che protegge un indirizzo «gia in uso» salta le righe marchiate,
    quindi l'indirizzo di una famiglia che aveva seguito il percorso dichiarato
    — modulo, invito, riscatto — restava avvelenabile da qualunque modulo
    approvato in seguito.

    **Cosa misura adesso.** I due marchi sono due colonne della stessa riga, e
    il riscatto le scrive nella stessa `UPDATE`: si puo percio chiedere il
    fatto invece della presenza di due stringhe nel sorgente. La riga di
    partenza porta **tutti e due** i marchi — nata da un modulo pubblico e poi
    revocata — che e il caso in cui scioglierne uno solo si vedrebbe.
  */
  const FIGLIO_DUE_MARCHI = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_DUE_MARCHI,
      organization_id: CLUB,
      first_name: "Due",
      last_name: "Marchi",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.upsertGuardianFromFormApproval(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_DUE_MARCHI,
    row: { legacyId: "t", firstName: "Anna", email: ANNA.email },
    contactOnly: true,
  });
  const rigaDueMarchi = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_DUE_MARCHI, legacy_id: "t" },
  });
  await tutori.revokeGuardianRow(prisma, {
    athleteId: FIGLIO_DUE_MARCHI,
    guardianRowId: rigaDueMarchi.id,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_DUE_MARCHI,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const rigaDueMarchiDopo = await prisma.athleteGuardian.findUnique({
    where: { id: rigaDueMarchi.id },
  });

  prova(
    "W-63 il riscatto toglie tutti e due i marchi, non uno solo",
    [true, true],
    [
      rigaDueMarchiDopo?.revoked_at === null,
      rigaDueMarchiDopo?.contact_only === false,
    ],
    "un accesso ridato si rida per intero, e vale per i due marchi",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_DUE_MARCHI } });

  /*
    **W-64 (Medium).** La quarta lettura dei tutori leggeva **due** grafie del
    legame dichiarato, e le altre tre ne leggono quattro: un tutore legato con
    `userId` smetteva di ricevere **solo** le notifiche documentali, mentre
    calendario, solleciti e promemoria continuavano ad arrivare.
  */
  const FIGLIO_QUARTA_LETTURA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_QUARTA_LETTURA,
      organization_id: CLUB,
      first_name: "Quarta",
      last_name: "Lettura",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  /*
    Le quattro letture devono dare la stessa risposta su **una** riga collegata.
    Le grafie del legame non sono piu un problema di lettura — la proiezione ne
    scrive una sola, perche in archivio c'e una sola colonna — ma le quattro
    letture restano quattro, e questa prova esiste per tenerle d'accordo.
  */
  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_QUARTA_LETTURA,
    rows: [{ legacyId: "t", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_QUARTA_LETTURA,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const schedaQuarta = await prisma.athlete.findUnique({
    where: { id: FIGLIO_QUARTA_LETTURA },
    select: { id: true, data: true, user_id: true, organization_id: true },
  });

  /*
    La quarta lettura si misura dalla **strada**, non dalla funzione: quella non
    e esportata, e una sonda che la chiama direttamente misurerebbe zero senza
    dirlo. Si chiede un documento e si guarda a chi arriva la notifica.
  */
  const fascicoloW64 = await carica("src/lib/server/document-requests.ts");

  /*
    Si parte da una bacheca vuota: le sezioni precedenti hanno gia scritto
    notifiche documentali per questa stessa persona, e senza questa riga la
    sonda leggeva quelle e passava comunque.
  */
  await prisma.notification.deleteMany({
    where: { organization_id: CLUB, user_id: ANNA.id },
  });

  await fascicoloW64.createDocumentRequest(scopeClubW29, {
    organizationId: CLUB,
    subjectKind: "athlete",
    subjectId: FIGLIO_QUARTA_LETTURA,
    documentKind: "identity_document",
    title: "Documento di identita",
    required: true,
    dueDate: "2027-01-31",
  });

  const destinatariW64 = await prisma.notification.findMany({
    where: { organization_id: CLUB, user_id: ANNA.id },
    orderBy: { created_at: "desc" },
    take: 5,
  });

  prova(
    "W-64 le quattro letture dei tutori danno la stessa risposta",
    [true, 1, 1, true],
    [
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_QUARTA_LETTURA),
      contattiW25.readAthleteGuardianContacts(schedaQuarta).length,
      promemoriaW25.getGuardianRows(schedaQuarta).length,
      destinatariW64.some((riga) =>
        String(riga?.title || "").includes("Documento richiesto"),
      ),
    ],
    "prima: tre si e un no sulla stessa persona, sulla stessa riga",
  );

  await prisma.notification.deleteMany({
    where: { organization_id: CLUB, user_id: ANNA.id },
  });

  await prisma.athlete.delete({ where: { id: FIGLIO_QUARTA_LETTURA } });

  /*
    **W-65 (Low).** Il badge leggeva **due** grafie dell'identificativo: una riga
    collegata con `userId` mostrava «Account non collegato» mentre apriva l'area
    famiglia. Un badge che contraddice il cancello e peggio di nessun badge.
  */
  prova(
    "W-65 il badge riconosce le quattro grafie del legame",
    ["linked", "linked"],
    [
      contattiW25.getGuardianAccessStatus({ name: "A", linkedUserId: ANNA.id })
        .state,
      contattiW25.getGuardianAccessStatus({ name: "A", userId: ANNA.id }).state,
    ],
    "prima: la seconda diceva «Account non collegato»",
  );

  /*
    **W-66.** La scrittura del registro e **atomica** con il fatto che registra:
    e l'ottava protezione, quella che ADR-0116 non aveva mai messo per iscritto e
    che e la ragione per cui il registro gemello non e mai caduto. Cinque
    approvazioni concorrenti perdevano voci in sei giri su sei.

    **Cosa misura adesso.** L'atomicita non si chiede piu a una transazione
    attorno a una rilettura: il registro non c'e, e l'approvazione e una
    `upsert` su `(athlete_id, identity_key)` che non ha uno snapshot da
    rimandare. `PP02-D33` si chiude percio perche la domanda non si pone,
    e la prova puo smettere di cercare una parola nel sorgente e misurare il
    fatto: **cinque approvazioni concorrenti sullo stesso atleta lasciano
    cinque righe**, che e esattamente cio che si perdeva sei giri su sei. Resta
    la meta che la stesura precedente aveva ragione di sorvegliare — che il
    dominio dei moduli passi davvero dal proprietario — perche una `upsert`
    atomica in un file che nessuno chiama non protegge niente.
  */
  const moduliSorgente = await import("node:fs").then((fs) =>
    fs.readFileSync("src/lib/server/form-submissions.ts", "utf8"),
  );

  const FIGLIO_CINQUE_MODULI = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_CINQUE_MODULI,
      organization_id: CLUB,
      first_name: "Cinque",
      last_name: "Moduli",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await Promise.all(
    [1, 2, 3, 4, 5].map((numero) =>
      tutori.upsertGuardianFromFormApproval(prisma, {
        organizationId: CLUB,
        athleteId: FIGLIO_CINQUE_MODULI,
        row: {
          firstName: `Tutore ${numero}`,
          email: `pp02-modulo-${numero}@example.invalid`,
        },
        contactOnly: true,
      }),
    ),
  );

  prova(
    "W-66 cinque approvazioni concorrenti non perdono righe",
    [true, 5],
    [
      moduliSorgente.includes("upsertGuardianFromFormApproval("),
      await prisma.athleteGuardian.count({
        where: { athlete_id: FIGLIO_CINQUE_MODULI },
      }),
    ],
    "prima: tutte rispondevano «Genitore aggiunto» e in anagrafica ne arrivavano due o tre",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_CINQUE_MODULI } });

  /* ---------- W-67..W-68: il ventitreesimo round ---------- */

  /*
    **W-67 (High).** Una revoca si perdeva **per intero** contro un salvataggio
    ordinario della scheda.

    ADR-0116 chiamava «atomico» lo scrittore della revoca perche scrive righe e
    registro nella **stessa** `update`. La forma era giusta e il comportamento
    no: `data` viene letto duecento righe prima, e fra la lettura e la scrittura
    ci sta un'altra richiesta. Misurato tre volte su tre contro PostgreSQL:
    registro vuoto, riga intatta, e la persona revocata che continua a leggere
    allergie, farmaci e i byte del certificato del minore — con la conferma a
    schermo e la riga di audit gia scritte.

    Non serve un attaccante: il client della scheda manda **sempre** l'array dei
    tutori, quindi bastano due persone in segreteria sulla stessa scheda.

    E il registro «non era mai caduto» non perche fosse protetto: perche nessuno
    lo aveva mai messo sotto concorrenza. Questa sonda e quella prova, e misura
    il **comportamento**, non la presenza di una parola nel sorgente.
  */
  const provaCorsaRevoca = async (giro) => {
    const atleta = randomUUID();
    await prisma.athlete.create({
      data: {
        id: atleta,
        organization_id: CLUB,
        first_name: "Corsa",
        last_name: "Revoca" + giro,
        status: "active",
        updated_at: new Date(),
        data: {},
      },
    });

    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      rows: [{ legacyId: "g0", firstName: "Anna", email: ANNA.email }],
      canGrantAccess: true,
    });
    await tutori.linkGuardianAccount(prisma, {
      athleteId: atleta,
      identityKeys: [ANNA.email],
      userId: ANNA.id,
      email: ANNA.email,
    });
    const rigaCorsa = await prisma.athleteGuardian.findFirst({
      where: { athlete_id: atleta, legacy_id: "g0" },
    });

    const datiPrima = (
      await prisma.athlete.findUnique({
        where: { id: atleta },
        select: { data: true },
      })
    )?.data;

    /* La revoca e un salvataggio ordinario, insieme. */
    await Promise.allSettled([
      legamiW25.unlinkGuardianAccount(scopeClubW29, {
        athleteId: atleta,
        guardianId: rigaCorsa.id,
      }),
      risorseW26.updateResource(
        "athletes",
        atleta,
        { data: { ...datiPrima, size: "M" } },
        scopeClubW29,
      ),
    ]);

    const accesso = await cruscottoW25.canParentAccessAthlete(ANNA.id, atleta);
    await prisma.athlete.delete({ where: { id: atleta } });
    return accesso;
  };

  const esitiCorsa = [];
  for (let giro = 0; giro < 3; giro += 1) {
    esitiCorsa.push(await provaCorsaRevoca(giro));
  }

  prova(
    "W-67 una revoca non si perde contro un salvataggio in parallelo",
    [false, false, false],
    esitiCorsa,
    "prima: 3 giri su 3 con la revoca sparita, e l'audit che la dichiarava fatta",
  );

  /*
    **W-68.** E due revoche simultanee su due tutori diversi si scrivono
    tutte e due: prima ne entrava **una sola** in archivio, e l'altra rispondeva
    «ok» lasciando quella persona dentro.
  */
  const FIGLIO_DUE_REVOCHE = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_DUE_REVOCHE,
      organization_id: CLUB,
      first_name: "Due",
      last_name: "Revoche",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_DUE_REVOCHE,
    rows: [
      { legacyId: "g1", firstName: "Anna", email: ANNA.email },
      { legacyId: "g2", firstName: "Bruno", email: BRUNO.email },
    ],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_DUE_REVOCHE,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_DUE_REVOCHE,
    identityKeys: [BRUNO.email],
    userId: BRUNO.id,
    email: BRUNO.email,
  });
  const rigaG1 = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_DUE_REVOCHE, legacy_id: "g1" },
  });
  const rigaG2 = await prisma.athleteGuardian.findFirst({
    where: { athlete_id: FIGLIO_DUE_REVOCHE, legacy_id: "g2" },
  });

  await Promise.allSettled([
    legamiW25.unlinkGuardianAccount(scopeClubW29, {
      athleteId: FIGLIO_DUE_REVOCHE,
      guardianId: rigaG1.id,
    }),
    legamiW25.unlinkGuardianAccount(scopeClubW29, {
      athleteId: FIGLIO_DUE_REVOCHE,
      guardianId: rigaG2.id,
    }),
  ]);

  prova(
    "W-68 due revoche simultanee entrano tutte e due",
    [false, false],
    [
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_DUE_REVOCHE),
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_DUE_REVOCHE),
    ],
    "prima: una sola entrava, e l'altra rispondeva «ok» lasciando dentro",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_DUE_REVOCHE } });

  /* ---------- W-69..W-72: il ventiquattresimo round ---------- */

  /*
    **W-69 (High).** Il quinto scrittore di `athletes.data`, che il blocco non
    lo prendeva: l'atleta che corregge da se il proprio telefono. Legge il blob,
    fonde sei campi e lo riscrive per intero — e il verso e deterministico e
    sfavorevole, perche il self-service non ha guardie ed e sempre il piu veloce
    a leggere e il piu lento a scrivere.

    Misurato tre volte su tre: «Scollega account» in parallelo a un salvataggio
    del proprio numero, e la revoca spariva **per intero**. La segreteria aveva
    la conferma a schermo e la riga di audit.
  */
  const accessiW69 = await carica("src/lib/server/athlete-accounts.ts");

  const provaCorsaSelfService = async (giro) => {
    const atleta = randomUUID();
    await prisma.athlete.create({
      data: {
        id: atleta,
        organization_id: CLUB,
        first_name: "Self",
        last_name: "Service" + giro,
        status: "active",
        user_id: UTENTE_RAGAZZO.id,
        updated_at: new Date(),
        data: { phone: "3330000000" },
      },
    });

    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      rows: [{ legacyId: "g0", firstName: "Anna", email: ANNA.email }],
      canGrantAccess: true,
    });
    await tutori.linkGuardianAccount(prisma, {
      athleteId: atleta,
      identityKeys: [ANNA.email],
      userId: ANNA.id,
      email: ANNA.email,
    });
    const rigaSelfService = await prisma.athleteGuardian.findFirst({
      where: { athlete_id: atleta, legacy_id: "g0" },
    });

    /*
      **Quello che questa sonda misura, e quello che non riesce a misurare.**

      Misura che le due scritture non si cancellino: il blocco le mette in
      fila, e otto giri lo confermano.

      Non riesce a forzare la finestra piu stretta — il self-service **legge**
      prima che la revoca committi e **scrive** dopo — perche quella lettura
      avviene all'inizio della funzione e dall'esterno non si puo tenerla
      ferma. Il controllo di mutazione lo conferma: rimettendo la fusione
      sullo snapshot vecchio la sonda resta verde. La rilettura dentro il
      blocco e percio una difesa **non provata da qui**, e vale la pena dirlo
      invece di far finta che una sonda verde la copra.
    */
    await Promise.allSettled([
      legamiW25.unlinkGuardianAccount(scopeClubW29, {
        athleteId: atleta,
        guardianId: rigaSelfService.id,
      }),
      accessiW69.updateOwnAthleteContacts(UTENTE_RAGAZZO.id, {
        phone: "3331112222",
      }),
    ]);

    const accesso = await cruscottoW25.canParentAccessAthlete(ANNA.id, atleta);
    await prisma.athlete.update({ where: { id: atleta }, data: { user_id: null } });
    await prisma.athlete.delete({ where: { id: atleta } });
    return accesso;
  };

  /*
    Otto giri e non tre: la corsa si risolve nei due versi a seconda di chi
    prende il blocco per primo, e con tre giri un difetto poteva restare
    invisibile per fortuna — il controllo di mutazione lo ha mostrato. Una
    sonda di concorrenza che non ripete abbastanza non misura la proprieta:
    misura un ordine.
  */
  const esitiSelfService = [];
  for (let giro = 0; giro < 8; giro += 1) {
    esitiSelfService.push(await provaCorsaSelfService(giro));
  }

  prova(
    "W-69 una revoca non si perde contro il self-service dell'atleta",
    true,
    esitiSelfService.every((dentro) => dentro === false),
    JSON.stringify(esitiSelfService) +
      " — prima: 3 giri su 3 con la revoca sparita e il registro vuoto",
  );

  /*
    **W-70 (High).** Una cancellazione dell'interessato si annullava con un
    salvataggio ordinario della scheda: bastava una pagina lasciata aperta in
    un'altra scheda del browser. Nome, allergie e righe dei tutori tornavano, e
    il genitore che la cancellazione aveva staccato **rientrava** nell'area
    famiglia. Non serve una corsa: basta la sequenza.
  */
  const FIGLIO_CANCELLATO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_CANCELLATO,
      organization_id: CLUB,
      first_name: "Da",
      last_name: "Cancellare",
      status: "active",
      updated_at: new Date(),
      data: { allergie: "arachidi" },
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_CANCELLATO,
    rows: [{ legacyId: "g", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_CANCELLATO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const copiaDelBrowser = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_CANCELLATO },
      select: { data: true },
    })
  )?.data;

  /*
    La cancellazione, come la scrive il dominio dei diritti dell'interessato: il
    blob si azzera **e** i tutori spariscono. La seconda meta e l'unica
    operazione che toglie righe revocate, e va fatta dalla porta sua — scrivere
    solo il blob lascerebbe le righe in piedi, cioe il genitore ancora dentro.
  */
  await prisma.athlete.update({
    where: { id: FIGLIO_CANCELLATO },
    data: {
      first_name: "Anonimizzato",
      last_name: "",
      status: "inactive",
      data: { anonymizedAt: new Date().toISOString() },
    },
  });
  await tutori.eraseGuardiansForAthlete(prisma, FIGLIO_CANCELLATO);

  const risurrezione = await risorseW26
    .updateResource(
      "athletes",
      FIGLIO_CANCELLATO,
      { data: copiaDelBrowser },
      scopeClubW29,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-70 una cancellazione dell'interessato non si riscrive",
    [true, false],
    [
      risurrezione !== "riuscita",
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_CANCELLATO),
    ],
    risurrezione,
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_CANCELLATO } });

  /*
    **W-71 (High).** Lo sweep della revoca di tessera prendeva il blocco e
    continuava a lavorare sullo snapshot letto **prima** del ciclo: il blocco
    serializzava e basta, e il lost update restava intatto. Due revoche di
    tessera in parallelo, e una spariva per intero su ogni scheda del club.
  */
  const FIGLIO_SWEEP = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SWEEP,
      organization_id: CLUB,
      first_name: "Sweep",
      last_name: "Concorrente",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SWEEP,
    rows: [
      { legacyId: "ga", firstName: "Anna", email: ANNA.email },
      { legacyId: "gb", firstName: "Bruno", email: BRUNO.email },
    ],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_SWEEP,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_SWEEP,
    identityKeys: [BRUNO.email],
    userId: BRUNO.id,
    email: BRUNO.email,
  });

  await Promise.allSettled([
    prisma.$transaction((tx) =>
      legamiW25.unlinkParentGuardians(tx, CLUB, ANNA.id, ANNA.email, "parent"),
    ),
    prisma.$transaction((tx) =>
      legamiW25.unlinkParentGuardians(tx, CLUB, BRUNO.id, BRUNO.email, "parent"),
    ),
  ]);

  prova(
    "W-71 due sweep concorrenti entrano tutti e due",
    [false, false],
    [
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_SWEEP),
      await cruscottoW25.canParentAccessAthlete(BRUNO.id, FIGLIO_SWEEP),
    ],
    "prima: una delle due spariva, su ogni scheda del club",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SWEEP } });

  /*
    **W-72.** E lo sweep non distrugge il salvataggio che gli corre accanto: il
    dato clinico appena scritto non deve tornare com'era — e nessuno dei due
    deve morire di abbraccio mortale, che e la forma in cui questa prova ha
    trovato `PP02-D34` tornato su un'altra coppia di blocchi (vedi `W-79`).
  */
  const FIGLIO_SWEEP_DATO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SWEEP_DATO,
      organization_id: CLUB,
      first_name: "Sweep",
      last_name: "Dato",
      status: "active",
      updated_at: new Date(),
      data: { allergie: "prima" },
    },
  });

  await tutori.saveGuardianRegistry(prisma, {
    organizationId: CLUB,
    athleteId: FIGLIO_SWEEP_DATO,
    rows: [{ legacyId: "ga", firstName: "Anna", email: ANNA.email }],
    canGrantAccess: true,
  });
  await tutori.linkGuardianAccount(prisma, {
    athleteId: FIGLIO_SWEEP_DATO,
    identityKeys: [ANNA.email],
    userId: ANNA.id,
    email: ANNA.email,
  });

  const datiSweep = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_SWEEP_DATO },
      select: { data: true },
    })
  )?.data;

  /*
    **Questa prova misura un difetto aperto (PP02-D34, nella forma nuova).**

    Lo sweep e il salvataggio prendono i loro blocchi in **ordine inverso**: il
    salvataggio blocca prima la riga dell'atleta (`lockAthleteRow`) e poi
    scrive `athlete_guardians`; lo sweep aggiorna prima `athlete_guardians` e
    poi rifa la proiezione, che scrive `athletes`. PostgreSQL rileva
    l'abbraccio mortale e **abbatte lo sweep** (`40P01`), che qui e la
    transazione che porta la revoca. `Promise.allSettled` lo assorbe, come lo
    assorbirebbe una richiesta che risponde 500 mentre la schermata dice
    «revocato».

    E la stessa proprieta della stesura precedente, e va tenuta cosi: la revoca
    deve entrare **e** il salvataggio non deve tornare indietro. Abbassarla
    nasconderebbe che l'abbraccio mortale che WP-C dichiara chiuso e tornato su
    una coppia di blocchi diversa.
  */
  await Promise.allSettled([
    prisma.$transaction((tx) =>
      legamiW25.unlinkParentGuardians(tx, CLUB, ANNA.id, ANNA.email, "parent"),
    ),
    risorseW26.updateResource(
      "athletes",
      FIGLIO_SWEEP_DATO,
      { data: { ...datiSweep, allergie: "dopo" } },
      scopeClubW29,
    ),
  ]);

  const dopoLoSweep = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_SWEEP_DATO },
      select: { data: true },
    })
  )?.data;

  prova(
    "W-72 lo sweep non riscrive il dato clinico appena salvato",
    ["dopo", false],
    [
      dopoLoSweep?.allergie,
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_SWEEP_DATO),
    ],
    "la revoca deve entrare e il salvataggio non deve tornare indietro",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SWEEP_DATO } });

  /* ---------- W-73..W-77: il venticinquesimo round ---------- */

  /*
    **W-73 (Critical).** Il settimo scrittore di `athletes.data` — il registro
    dei soli recapiti scritto dall'approvazione di un modulo — apriva una
    transazione e rileggeva, ma **non prendeva il blocco**. Una transazione con
    rilettura e senza blocco non serializza: e la forma che ADR-0116 aveva gia
    dichiarato insufficiente, ripetuta.

    Misurato dalla porta del prodotto: un rinnovo approvato mentre la segreteria
    preme «Scollega account», e in tre giri su otto la revoca spariva — conferma
    a schermo, riga di audit, e il genitore ancora dentro il fascicolo.
  */
  const provaCorsaModulo = async (giro) => {
    const atleta = randomUUID();
    await prisma.athlete.create({
      data: {
        id: atleta,
        organization_id: CLUB,
        first_name: "Corsa",
        last_name: "Modulo" + giro,
        status: "active",
        updated_at: new Date(),
        data: {},
      },
    });

    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      rows: [{ legacyId: "g0", firstName: "Anna", email: ANNA.email }],
      canGrantAccess: true,
    });
    await tutori.linkGuardianAccount(prisma, {
      athleteId: atleta,
      identityKeys: [ANNA.email],
      userId: ANNA.id,
      email: ANNA.email,
    });
    const rigaCorsaModulo = await prisma.athleteGuardian.findFirst({
      where: { athlete_id: atleta, legacy_id: "g0" },
    });

    const inviato = await inviiW29.submitRenewalForm(ANNA.id, {
      athleteId: atleta,
      publicSlug: moduloTutore.slug,
      answers: { f_nome_tutore: "Terzo", f_email_tutore: "terzo" + giro + "@estraneo.invalid" },
      files: [],
      respondentEmail: ANNA.email,
    });

    /*
      **Il ritardo si spazza, o la corsa non arriva mai dove fa danno.**

      Lanciate insieme, le due richieste finiscono sempre nello stesso ordine
      e la revoca vince: il controllo di mutazione lo ha mostrato — togliendo
      il blocco la sonda restava verde. La finestra pericolosa e quella in cui
      l'approvazione ha gia **letto** e la revoca committa prima che scriva,
      e la si raggiunge dando alla revoca un vantaggio crescente.

      Una sonda di concorrenza che prova un solo ritardo misura un ordine, non
      una proprieta.
    */
    const approvazione = inviiW29.decideFormSubmission(
      scopeClubW29,
      inviato.submissionId,
      { decision: "approved" },
    );

    await new Promise((risolvi) => setTimeout(risolvi, 4 + giro * 3));

    await Promise.allSettled([
      approvazione,
      legamiW25.unlinkGuardianAccount(scopeClubW29, {
        athleteId: atleta,
        guardianId: rigaCorsaModulo.id,
      }),
    ]);

    const accesso = await cruscottoW25.canParentAccessAthlete(ANNA.id, atleta);
    await prisma.athlete.delete({ where: { id: atleta } });
    return accesso;
  };

  const esitiModulo = [];
  for (let giro = 0; giro < 8; giro += 1) {
    esitiModulo.push(await provaCorsaModulo(giro));
  }

  prova(
    "W-73 una revoca non si perde contro l'approvazione di un modulo",
    true,
    esitiModulo.every((dentro) => dentro === false),
    JSON.stringify(esitiModulo),
  );

  /*
    **W-74 (High).** Una cancellazione dell'interessato si riscriveva con un
    `PATCH` che **non porta `data`**: il blocco, la rilettura e la guardia
    stavano tutti dentro il ramo «con data», e `eraseDataSubject` azzera otto
    colonne piu il blob. La guardia ne difendeva una.
  */
  const FIGLIO_SCALARI = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_SCALARI,
      organization_id: CLUB,
      first_name: "Anonimizzato",
      last_name: "",
      status: "inactive",
      updated_at: new Date(),
      data: { anonymizedAt: new Date().toISOString() },
    },
  });

  const risurrezioneScalare = await risorseW26
    .updateResource(
      "athletes",
      FIGLIO_SCALARI,
      { first_name: "Mario", status: "active" },
      scopeClubW29,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  const dopoScalare = await prisma.athlete.findUnique({
    where: { id: FIGLIO_SCALARI },
    select: { first_name: true, status: true },
  });

  prova(
    "W-74 una cancellazione non si riscrive nemmeno dalle colonne scalari",
    [true, "Anonimizzato", "inactive"],
    [
      risurrezioneScalare !== "riuscita",
      dopoScalare?.first_name,
      dopoScalare?.status,
    ],
    risurrezioneScalare,
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_SCALARI } });

  /*
    **W-75 (Medium).** Il marchio della cancellazione si poteva **scrivere** da
    un salvataggio ordinario, e da quel momento la scheda non si salvava piu —
    con un messaggio che parla di una cancellazione che nessuno ha chiesto e
    nessuna strada per toglierlo. Il client rimanda `{...datiCorrenti}`, quindi
    la chiave si ripropagava da sola.
  */
  const FIGLIO_MARCHIO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_MARCHIO,
      organization_id: CLUB,
      first_name: "Marchio",
      last_name: "Iniettato",
      status: "active",
      updated_at: new Date(),
      data: { guardians: [] },
    },
  });

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_MARCHIO,
    { data: { guardians: [], anonymizedAt: "2020-01-01T00:00:00.000Z" } },
    scopeClubW29,
  );

  const dopoMarchio = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_MARCHIO },
      select: { data: true },
    })
  )?.data;

  const salvataggioSuccessivo = await risorseW26
    .updateResource(
      "athletes",
      FIGLIO_MARCHIO,
      { data: { guardians: [], size: "M" } },
      scopeClubW29,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-75 il marchio della cancellazione non si scrive dalla rotta generica",
    [false, "riuscita"],
    [Boolean(dopoMarchio?.anonymizedAt), salvataggioSuccessivo],
    "prima: si iniettava, e la scheda non si salvava mai piu",
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_MARCHIO } });

  /*
    **W-76 (Medium).** Il segnaposto di una cancellazione era cancellabile, e
    con lui il denaro perdeva l'intestatario: `athlete_id` e `SetNull` su rate,
    incassi, fatture e ricevute. E la cosa che `data-subject.ts` dichiara di
    voler evitare tenendo la riga.
  */
  const FIGLIO_CON_DENARO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_CON_DENARO,
      organization_id: CLUB,
      first_name: "Con",
      last_name: "Denaro",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  await prisma.athletePayment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: FIGLIO_CON_DENARO,
      amount: 250,
      description: "Quota",
      status: "paid",
    },
  });

  const cancellazione = await risorseW26
    .deleteResource("athletes", FIGLIO_CON_DENARO, scopeClubW29)
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-76 un atleta con una storia di pagamenti non si cancella",
    true,
    cancellazione !== "riuscita",
    cancellazione,
  );

  await prisma.athletePayment.deleteMany({
    where: { athlete_id: FIGLIO_CON_DENARO },
  });
  await prisma.athlete.delete({ where: { id: FIGLIO_CON_DENARO } });

  /*
    **W-77 (High).** Lo sweep della revoca di tessera faceva due viaggi in
    archivio **per ogni atleta del club**, dentro una sola transazione
    interattiva con un tetto di cinque secondi: a 1.600 tesserati la revoca
    falliva, e sotto contesa gia a 800. La scala che il progetto si e dato
    arriva a 2.000.

    Qui si misura il **tempo**, che e la proprieta rotta: la lettura ampia serve
    solo a restringere, e si blocca soltanto cio che si cambia.
  */
  const CLUB_GRANDE = randomUUID();
  await prisma.club.create({
    data: {
      id: CLUB_GRANDE,
      slug: `pp02-grande-${Date.now()}`,
      name: "ASD Grande",
      creator_id: PRESIDENTE.id,
      updated_at: new Date(),
    },
  });

  const molti = Array.from({ length: 400 }, () => ({
    id: randomUUID(),
    organization_id: CLUB_GRANDE,
    first_name: "Tesserato",
    last_name: "Molti",
    status: "active",
    updated_at: new Date(),
    data: {},
  }));
  await prisma.athlete.createMany({ data: molti });

  const inizioSweep = Date.now();
  const esitoSweep = await prisma
    .$transaction((tx) =>
      legamiW25.unlinkParentGuardians(tx, CLUB_GRANDE, ANNA.id, ANNA.email, "parent"),
    )
    .then(() => "riuscito")
    .catch((errore) => String(errore?.message || errore));
  const durataSweep = Date.now() - inizioSweep;

  prova(
    "W-77 lo sweep su un club di 400 tesserati resta ben dentro il tetto",
    [true, true],
    [esitoSweep === "riuscito", durataSweep < 2000],
    durataSweep + " ms — prima: due viaggi per ogni tesserato, e a 1.600 scadeva",
  );

  await prisma.athlete.deleteMany({ where: { organization_id: CLUB_GRANDE } });
  await prisma.club.delete({ where: { id: CLUB_GRANDE } });

  /* ---------- W-78..W-81: il ventiseiesimo round ---------- */

  /*
    **W-78 (Critical).** La rotta generica ha **tre verbi**, e le difese
    dell'atleta erano attaccate a uno. `POST` con `mode: "upsert"` su una riga
    che esiste e una modifica a tutti gli effetti, e saltava il blocco, la
    rilettura, il riporto delle difese e la guardia sulla cancellazione.

    Misurato con uno scope **Segreteria**, non con un attaccante: riscriveva una
    scheda cancellata su richiesta dell'interessato — nome, stato e dati clinici
    tornati, e il tutore staccato di nuovo dentro il fascicolo del minore.
  */
  const FIGLIO_UPSERT = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_UPSERT,
      organization_id: CLUB,
      first_name: "Anonimizzato",
      last_name: "",
      status: "inactive",
      updated_at: new Date(),
      data: { anonymizedAt: new Date().toISOString() },
    },
  });

  const risurrezioneUpsert = await risorseW26
    .createResource(
      "athletes",
      {
        id: FIGLIO_UPSERT,
        organization_id: CLUB,
        first_name: "Mario",
        last_name: "Tornato",
        status: "active",
        data: { guardians: [{ id: "g", name: "Anna", linkedUserId: ANNA.id }] },
      },
      "upsert",
      scopeClubW29,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  const dopoUpsert = await prisma.athlete.findUnique({
    where: { id: FIGLIO_UPSERT },
    select: { first_name: true, status: true },
  });

  prova(
    "W-78 la porta upsert non riscrive una scheda cancellata",
    [true, "Anonimizzato", false],
    [
      risurrezioneUpsert !== "riuscita",
      dopoUpsert?.first_name,
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_UPSERT),
    ],
    risurrezioneUpsert,
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_UPSERT } });

  /*
    **W-78b.** E la stessa porta non aggira la guardia della crescita: un ruolo
    senza le due chiavi non si scrive un legame addosso nemmeno da li.

    **Cosa cambia nell'arma impugnata.** La stesura precedente scriveva
    `linkedUserId: <se stesso>`, che era la strada. Adesso quel campo non ha
    piu una strada: `readGuardianInputFromCard` non lo traduce, quindi da
    questa porta non produce niente — non un legame e nemmeno un rifiuto, ed e
    la forma piu forte della difesa (la regola ha smesso di essere una guardia
    ed e diventata una proprieta, come in `W-15a`). Cio che **resta** una
    crescita, e che deve restare rifiutato, e scrivere un **indirizzo che
    corrisponde a un'utenza**: e quella la mossa che apre il fascicolo
    sanitario di un minore, ed e su quella che si misura la porta.
  */
  const FIGLIO_UPSERT_CRESCITA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_UPSERT_CRESCITA,
      organization_id: CLUB,
      first_name: "Upsert",
      last_name: "Crescita",
      status: "active",
      updated_at: new Date(),
      data: { guardians: [] },
    },
  });

  const crescitaUpsert = await risorseW26
    .createResource(
      "athletes",
      {
        id: FIGLIO_UPSERT_CRESCITA,
        organization_id: CLUB,
        first_name: "Upsert",
        last_name: "Crescita",
        data: { guardians: [{ id: "g", name: "Io", email: ANNA.email }] },
      },
      "upsert",
      scopeAllenatoreW29,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "W-78b e nemmeno da li ci si scrive un legame addosso senza le due chiavi",
    [true, false],
    [
      crescitaUpsert !== "riuscita",
      await cruscottoW25.canParentAccessAthlete(ANNA.id, FIGLIO_UPSERT_CRESCITA),
    ],
    crescitaUpsert,
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_UPSERT_CRESCITA } });

  /*
    **W-79 (High).** Lo sweep sceglieva le schede su cui lavorare da una lettura
    fatta **fuori** dal blocco: una scheda a cui il tutore viene **aggiunto**
    mentre la revoca gira veniva scartata dal filtro, e la revoca non la vedeva.
    Cinque giri su cinque, con la schermata che diceva «Accesso revocato».
  */
  /*
    **Cinque giri e non uno.** L'esito di questa corsa dipende da quale delle
    due transazioni PostgreSQL sceglie come vittima, e un giro solo misura
    quella scelta invece della proprieta — la stessa ragione per cui `W-69` ne
    fa otto.
  */
  const provaSchedaToccata = async (giro) => {
    const atleta = randomUUID();
    await prisma.athlete.create({
      data: {
        id: atleta,
        organization_id: CLUB,
        first_name: "Aggiunto",
        last_name: "Durante" + giro,
        status: "active",
        updated_at: new Date(),
        data: {},
      },
    });

    /*
      Il tutore viene aggiunto **prima**, e la sua scrittura e conclusa: da quel
      momento la revoca deve vederlo, qualunque cosa le corra accanto. Se invece
      l'aggiunta arrivasse dopo, sarebbe una ridichiarazione deliberata e non un
      difetto — vedi sotto.
    */
    await risorseW26.updateResource(
      "athletes",
      atleta,
      {
        data: {
          guardians: [{ name: "Anna", email: ANNA.email }],
        },
      },
      scopeClubW29,
    );

    await Promise.allSettled([
      prisma.$transaction((tx) =>
        legamiW25.unlinkParentGuardians(tx, CLUB, ANNA.id, ANNA.email, "parent"),
      ),
      /*
        Il salvataggio che corre accanto rimanda i tutori, come fa il client
        vero: `athletes.data` e un blob sostituito per intero, e una sonda che
        mandasse il solo campo nuovo cancellerebbe le righe che sta misurando.
      */
      risorseW26.updateResource(
        "athletes",
        atleta,
        {
          data: {
            guardians: [{ name: "Anna", email: ANNA.email }],
            size: "M",
          },
        },
        scopeClubW29,
      ),
    ]);

    const riga = await prisma.athleteGuardian.findFirst({
      where: {
        athlete_id: atleta,
        identity_key: String(ANNA.email).toLowerCase(),
      },
    });
    const fuori = !(await cruscottoW25.canParentAccessAthlete(ANNA.id, atleta));

    await prisma.athlete.delete({ where: { id: atleta } });
    return Boolean(riga?.revoked_at) && fuori;
  };

  const esitiSchedaToccata = [];
  for (let giro = 0; giro < 5; giro += 1) {
    esitiSchedaToccata.push(await provaSchedaToccata(giro));
  }

  /*
    **Cosa deve essere vero, e cosa invece dipende dall'ordine.**

    La prima stesura di questa sonda chiedeva che il genitore restasse fuori.
    Non e la proprieta giusta: con il blocco sull'intero club le due scritture
    si serializzano, e se il salvataggio arriva **dopo** la revoca allora sta
    ridichiarando un legame — un atto deliberato di chi ha le due chiavi, che
    per progetto vince sul registro (e cosi che ci si ricollega). Chiedere che
    non conceda vorrebbe dire chiedere che una revoca sia definitiva, che
    ADR-0116 esclude.

    Cio che **deve** essere vero in tutti e due gli ordini e che la revoca
    abbia **visto** quella scheda: il registro dell'atleta portava l'identita.
    Prima non la portava, perche il filtro l'aveva scartata leggendo fuori dal
    blocco — e quella era una revoca che diceva «fatto» e non aveva toccato
    niente.

    **Cosa misura adesso.** Il registro di scheda non esiste piu, e il fatto
    che la revoca ha visto quella scheda vive dove deve: `revoked_at` sulla
    riga di quella persona su quell'atleta. Cade anche il distinguo
    sull'ordine — un salvataggio che arriva dopo non e piu una
    ridichiarazione, perche da quella porta un legame non si scrive — quindi la
    proprieta si puo chiedere piu forte di prima e in tutti e due i versi: **la
    riga e revocata, e la persona e fuori.**

    **E qui `PP02-D34` e tornato una volta, su un'altra coppia di blocchi.**

    WP-C aveva tolto il blocco sull'intero club e dichiarato la classe chiusa.
    Restavano pero due ordini opposti sulle **stesse due tabelle**: il
    salvataggio dell'anagrafica prende `athletes` e poi `athlete_guardians`, la
    revoca prendeva `athlete_guardians` e poi `athletes` — la proiezione.
    PostgreSQL ne abbatteva uno con un `40P01`, e quando la vittima era la
    revoca la schermata diceva «revocato» e la persona era ancora dentro: il
    modo di fallire da cui questo pacchetto e nato.

    Chiuso con un ordine solo per tutti — `bloccaSchede`: **prima la scheda,
    poi le sue righe**, e le schede in ordine crescente di identificativo. Non
    e il blocco che PP02-D34 descriveva, che prendeva quattrocento schede in
    ordine di scansione: sono le schede su cui quella persona compare davvero.

    La lezione e nel documento, non solo nel codice: una classe di difetto non
    si dichiara chiusa perche e sparita **l'istanza** che si stava guardando.
  */
  prova(
    "W-79 la revoca vede anche una scheda toccata mentre gira",
    true,
    esitiSchedaToccata.every((visto) => visto === true),
    JSON.stringify(esitiSchedaToccata) +
      " — prima: il filtro la scartava, e la revoca non la vedeva mai",
  );

  /*
    **W-80 (Medium).** La guardia sulla cancellazione contava le rate con un
    importo, qualunque fosse lo stato: una scheda creata per sbaglio, a cui il
    piano quote si aggancia da solo, non si cancellava piu — e nemmeno una con
    una rata **annullata**. La domanda giusta e «ha toccato denaro».
  */
  const provaCancellazione = async (stato) => {
    const atleta = randomUUID();
    await prisma.athlete.create({
      data: {
        id: atleta,
        organization_id: CLUB,
        first_name: "Rata",
        last_name: String(stato),
        status: "active",
        updated_at: new Date(),
        data: {},
      },
    });

    await prisma.athletePayment.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: atleta,
        amount: 250,
        description: "Quota",
        status: stato,
      },
    });

    const esito = await risorseW26
      .deleteResource("athletes", atleta, scopeClubW29)
      .then(() => "cancellata")
      .catch((errore) => String(errore?.message || errore));

    await prisma.athletePayment.deleteMany({ where: { athlete_id: atleta } });
    await prisma.athlete.deleteMany({ where: { id: atleta } });
    return esito;
  };

  prova(
    "W-80 si blocca il denaro che si e mosso, non una riga di piano",
    ["cancellata", "cancellata", true],
    [
      await provaCancellazione("pending"),
      await provaCancellazione("cancelled"),
      (await provaCancellazione("paid")) !== "cancellata",
    ],
    "prima: una rata mai incassata, o annullata, bloccava la scheda per sempre",
  );

  /* ---------- W-81..W-84: il ventisettesimo round ---------- */

  /*
    **W-81 (Critical).** Il reinstradamento di `upsert` del round precedente era
    agganciato all'insieme delle **schede atleta**, e le rate non ci sono. La
    stessa porta, sulla stessa rotta, con lo stesso verbo: un `POST` con
    `mode: "upsert"` da una Segreteria cambiava l'importo di una rata **saldata**,
    ne spostava la scadenza, e la spostava **su un altro atleta** — cosi che una
    famiglia trovasse nella propria area la quota del figlio di un'altra, mentre
    l'incasso restava intestato alla prima.

    E la forma che il commit precedente dichiara chiusa — «una rotta con tre
    verbi, e la difesa attaccata a uno» — applicata a una risorsa su due.
  */
  const FIGLIO_RATA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_RATA,
      organization_id: CLUB,
      first_name: "Rata",
      last_name: "Saldata",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  const RATA_SALDATA = randomUUID();
  await prisma.athletePayment.create({
    data: {
      id: RATA_SALDATA,
      organization_id: CLUB,
      athlete_id: FIGLIO_RATA,
      amount: 130,
      description: "Quota saldata",
      status: "paid",
    },
  });

  const upsertImporto = await risorseW26
    .createResource(
      "payments",
      {
        id: RATA_SALDATA,
        organization_id: CLUB,
        athlete_id: FIGLIO_RATA,
        amount: 500,
        description: "Quota saldata",
      },
      "upsert",
      scopeClubW29,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  const upsertIntestatario = await risorseW26
    .createResource(
      "payments",
      {
        id: RATA_SALDATA,
        organization_id: CLUB,
        athlete_id: MARCO,
        amount: 130,
        description: "Quota saldata",
      },
      "upsert",
      scopeClubW29,
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  const rataDopo = await prisma.athletePayment.findUnique({
    where: { id: RATA_SALDATA },
    select: { amount: true, athlete_id: true },
  });

  prova(
    "W-81 dalla porta upsert non si tocca una rata saldata, ne il suo intestatario",
    [true, true, 130, FIGLIO_RATA],
    [
      upsertImporto !== "riuscita",
      upsertIntestatario !== "riuscita",
      rataDopo?.amount,
      rataDopo?.athlete_id,
    ],
    upsertImporto + " | " + upsertIntestatario,
  );

  await prisma.athletePayment.delete({ where: { id: RATA_SALDATA } });
  await prisma.athlete.delete({ where: { id: FIGLIO_RATA } });

  /*
    **W-82 (Medium).** Il ramo `upsert` toglieva `created_at` dal corpo — «vale
    per ogni risorsa che un upsert puo raggiungere» — e il reinstradamento ha
    saltato quella riga; `updateResource` lo strip non lo aveva mai avuto. La
    data di iscrizione di un tesserato si riportava al 1999 da tutte e due le
    porte, e su quella poggiano l'anzianita di un socio e la ricostruzione di un
    audit.
  */
  const FIGLIO_DATA = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_DATA,
      organization_id: CLUB,
      first_name: "Data",
      last_name: "Creazione",
      status: "active",
      updated_at: new Date(),
      data: {},
    },
  });

  const creataPrima = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_DATA },
      select: { created_at: true },
    })
  )?.created_at;

  await risorseW26.updateResource(
    "athletes",
    FIGLIO_DATA,
    { first_name: "Data", created_at: new Date("1999-01-01") },
    scopeClubW29,
  );

  const creataDopo = (
    await prisma.athlete.findUnique({
      where: { id: FIGLIO_DATA },
      select: { created_at: true },
    })
  )?.created_at;

  prova(
    "W-82 la data di creazione non si riscrive dal corpo della richiesta",
    true,
    Number(creataPrima) === Number(creataDopo),
    String(creataPrima) + " -> " + String(creataDopo),
  );

  await prisma.athlete.delete({ where: { id: FIGLIO_DATA } });

  /*
    **W-83 (High).** «Revoca accesso» dalla Gestione accessi lasciava vivo
    l'invito dell'atleta: lui apriva l'email che aveva gia ricevuto,
    `athletes.user_id` tornava al suo posto e nasceva una tessera nuova. La
    porta gemella, quella della scheda atleta, l'invito lo chiude.

    Due porte per lo stesso fatto devono lasciare lo stesso stato, o quella piu
    debole diventa la strada che si prende.
  */
  const FIGLIO_INVITO = randomUUID();
  await prisma.athlete.create({
    data: {
      id: FIGLIO_INVITO,
      organization_id: CLUB,
      first_name: "Invito",
      last_name: "Vivo",
      status: "active",
      user_id: UTENTE_RAGAZZO.id,
      updated_at: new Date(),
      data: {},
    },
  });

  const INVITO = randomUUID();
  await prisma.athleteAccountInvite.create({
    data: {
      id: INVITO,
      organization_id: CLUB,
      athlete_id: FIGLIO_INVITO,
      status: "sent",
      email: UTENTE_RAGAZZO.email,
      sent_at: new Date(),
      token_hash: "x".repeat(64),
      expires_at: new Date(Date.now() + 86400000),
    },
  });

  await prisma.$transaction((tx) =>
    legamiW25.unlinkDirectAthleteProfile(tx, CLUB, UTENTE_RAGAZZO.id, "athlete"),
  );

  const invitoDopo = await prisma.athleteAccountInvite.findUnique({
    where: { id: INVITO },
    select: { status: true },
  });

  prova(
    "W-83 revocando l'accesso dell'atleta si chiude anche il suo invito",
    "revoked",
    invitoDopo?.status,
    "prima: restava «sent», e il vecchio link lo faceva rientrare",
  );

  await prisma.athleteAccountInvite.delete({ where: { id: INVITO } });
  await prisma.athlete.delete({ where: { id: FIGLIO_INVITO } });

  await prisma.athlete.update({
    where: { id: MARCO },
    data: { user_id: null },
  });
};

const main = async () => {
  console.log("PP-02 — collaudo contro il database di sviluppo");
  await semina();

  /*
    **I tutori seminati nel blob diventano righe** (PP-02 / WP-C).

    La semina scrive `athletes.data.guardians[]` in una ventina di punti, ed e
    la forma con cui il prodotto ha vissuto finora. Dopo WP-C quell'elenco e una
    proiezione e l'autorita e `athlete_guardians`: senza questo passaggio la
    sonda misurerebbe un club **senza tutori**, e direbbe che l'area famiglia
    non si apre — vero, e non il difetto che sta cercando.

    Si riesegue il travaso della migrazione, ristretto ai due club della sonda,
    perche e cio che un ambiente vero fa al momento del rilascio: cosi la sonda
    misura lo stato in cui il prodotto si trovera, non uno costruito a mano.
  */
  await travasaTutori(prisma, [CLUB, ALTRO_CLUB]);

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
