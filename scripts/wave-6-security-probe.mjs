/**
 * **La sonda di sicurezza della Wave 6, contro un database vero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/wave-6-security-probe.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Un test unitario chiama la funzione che sa esistere. Una sonda chiama la
 * funzione che un attaccante chiamerebbe, e guarda **che cosa risponde**.
 *
 * Ogni tentativo qui dentro e **cross-qualcosa**: un genitore sul figlio di
 * un'altra famiglia, un allenatore su un atleta che non e suo, una sessione
 * del club B su una riga del club A. E per ognuno la risposta corretta non e
 * soltanto «no»: e **«inesistente»**. Confermare che una riga altrui esiste e
 * gia un'informazione, e la differenza fra «negato» e «non trovato» e la
 * differenza fra sapere e non sapere che quell'identificativo e buono.
 *
 * Copre U-31…U-38, piu la prova dello **scope contraffatto** — un
 * `activeOrganizationId` di un club e un `allowedOrganizationIds` di un altro
 * — che nella Wave 5 passava ogni `assertActiveClub` su quattro chiamate su
 * quattro.
 *
 * ## La scala di gravita
 *
 * **Critical** e qualunque perdita di: **minori**, **salute**, **denaro**,
 * **tenant**. Non c'e una categoria minore in questo file: se un controllo qui
 * fallisce, e uno di quei quattro.
 *
 * ## La regola di questo file
 *
 * **La sonda misura, non corregge.** Dove trova un difetto lo dichiara `FAIL`
 * con la nota di cio che ha osservato, e non tocca una riga del codice di
 * produzione. Dove una difesa ha una **forma diversa** da quella attesa — e la
 * differenza e una scelta e non una lacuna — e un `DEVIA` con il motivo
 * accanto e il conto separato in fondo.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const CLUB_A = randomUUID();
const CLUB_B = randomUUID();

const SEDE_A = "sede-uat6s";
const CATEGORIA = "cat-uat6s";

/** L'atleta del club A, legato al genitore del club A. */
const ATLETA_A = randomUUID();
/** Un secondo atleta del club A, di **un'altra famiglia**. */
const ATLETA_ALTRUI = randomUUID();
/** L'atleta del club B. */
const ATLETA_B = randomUUID();

const RUOLI = [
  "owner",
  "club_manager",
  "collaborator",
  "staff",
  "trainer",
  "parent",
  "athlete",
];

const utenti = {};
let EVENTO_A = null;
let EVENTO_B = null;
let RICHIESTA_A = null;
let DEPOSITO_A = null;
let ALLEGATO_A = null;
let RICEVUTA_A = null;
let APPUNTAMENTO_A = null;
let RATA_A = null;
let RUOLO_A = null;
let MODULO_A = null;

let eventi;
let documenti;
let appuntamenti;
let risorse;
let autenticazione;
let cruscottoFamiglia;
let contiAtleta;
let allegati;
let permessiSanitari;
let ruoliDiClub;
let registro;
let moduli;
let rotte = null;

/* ----------------------------------------------------------- il verdetto */

const esiti = [];
const deviazioni = [];

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, atteso, trovato, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(66)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const devia = (titolo, motivo) => {
  deviazioni.push({ titolo, motivo });
  console.log(`  DEVIA ${titolo.padEnd(66)} scelta dichiarata`);
  console.log(`        ${motivo}`);
};

/**
 * **I quattro esiti che questa sonda sa distinguere, e perche non bastano due.**
 *
 * `riuscito` e la chiamata che torna un dato. Gli altri sono tutti rifiuti, ma
 * un rifiuto **dice** qualcosa, e cio che dice e meta della domanda:
 *
 * - `inesistente` — la riga non risulta: `null`, elenco vuoto, «non trovato».
 *   Chi ha indovinato l'identificativo resta senza sapere se ha indovinato. E
 *   cio che si pretende dalle **letture** cross-tenant;
 * - `ambiguo` — la formula di `assertActiveClub`: «non e stato trovato, **o**
 *   non appartiene al club attivo». La disgiunzione e deliberata e sta scritta
 *   in `active-club-boundary.ts`: distinguere i due casi direbbe a un
 *   attaccante che l'identificativo esiste. Non e `inesistente`, ma non
 *   conferma niente, e tenerlo separato dice **quale** delle due difese ha
 *   risposto;
 * - `negato` — un `Accesso negato` senza ambiguita: la risposta giusta a un
 *   permesso mancante, e la risposta sbagliata a una lettura cross-tenant.
 *
 * `errore` tiene separato cio che e fallito per un'altra ragione — un vincolo,
 * un campo mancante — da cio che e stato **rifiutato**: una prova che passa
 * perche il dato di semina era sbagliato non prova niente.
 */
const NON_TROVATO = /non\s+(?:e\s+)?(?:stat[oa]\s+)?trovat[oa]?|nessun[ao]?\s+\w+\s+collegat/i;
const FORMULA_AMBIGUA = /o non esiste|o non e di questo club|o non appartiene/i;

const tenta = async (azione) => {
  try {
    const valore = await azione();
    const vuoto =
      valore === null ||
      valore === undefined ||
      valore === false ||
      (Array.isArray(valore) && valore.length === 0) ||
      (valore && Array.isArray(valore.records) && valore.records.length === 0);
    return { esito: vuoto ? "inesistente" : "riuscito", valore, messaggio: "" };
  } catch (errore) {
    const messaggio = String(errore?.message || errore);
    if (FORMULA_AMBIGUA.test(messaggio)) {
      return { esito: "ambiguo", valore: null, messaggio };
    }
    if (NON_TROVATO.test(messaggio)) {
      return { esito: "inesistente", valore: null, messaggio };
    }
    if (messaggio.includes("Accesso negato")) {
      return { esito: "negato", valore: null, messaggio };
    }
    return { esito: "errore", valore: null, messaggio };
  }
};

/**
 * Un tentativo cross-tenant, con l'elenco degli esiti che si accettano.
 *
 * Si dichiara **quali** rifiuti valgono, invece di accettarli tutti: un
 * `errore` — un vincolo violato, un campo mancante — non e una difesa, e
 * confonderlo con un rifiuto e il modo piu comune di scrivere un controllo di
 * sicurezza che passa sempre.
 */
const varco = async (titolo, azione, ammessi = ["inesistente", "ambiguo"]) => {
  const risultato = await tenta(azione);
  prova(
    titolo,
    true,
    ammessi.includes(risultato.esito),
    `esito=${risultato.esito}${risultato.messaggio ? ` — ${risultato.messaggio.slice(0, 110)}` : ""}`,
  );
  return risultato;
};

/* ------------------------------------------------------------- lo scope */

const scopeDi = (userId, organizationId, role) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole: role,
  activeMembershipId: null,
  allowedOrganizationIds: [organizationId],
  accessScopes: [],
});

const scopeRuolo = (ruolo) => scopeDi(utenti[ruolo].id, CLUB_A, ruolo);
const scopeB = () => scopeDi(utenti.ownerB.id, CLUB_B, "owner");

/* --------------------------------------------------------- il trasporto */

let SESSIONE = null;
let CLUB_ATTIVO = null;

const preparaTrasporto = async () => {
  rotte = {
    documento: await carica("src/app/api/v1/documents/[kind]/[id]/route.ts"),
    bacheca: await carica("src/app/api/parent-dashboard/[athleteId]/board/route.ts"),
    moduloPubblico: await carica("src/app/api/public/forms/[publicSlug]/route.ts"),
    risorsa: await carica("src/app/api/v1/[resource]/route.ts"),
  };
};

const comeUtente = async (utente, clubId) => {
  const sessione = await autenticazione.createSessionForUser(utente);
  SESSIONE = sessione.access_token;
  CLUB_ATTIVO = clubId;
};

const richiesta = (url, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (SESSIONE) headers.set("authorization", `Bearer ${SESSIONE}`);
  if (CLUB_ATTIVO) headers.set("x-active-club-id", CLUB_ATTIVO);
  return new Request(`http://collaudo.invalid${url}`, { ...init, headers });
};

/* --------------------------------------------------------------- semina */

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "Sonda",
      password_hash: "$2b$10$uat6s",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const pulisciResidui = async () => {
  /*
    **La semina comincia da un archivio pulito, anche dopo un'interruzione.**
    Un club residuo porta con se i suoi atleti, e questa sonda conta insiemi:
    un elenco che dovrebbe avere un elemento ne avrebbe due, e la prova
    misurerebbe il residuo invece del prodotto.
  */
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "uat6s-" } },
    select: { id: true },
  });
  const ids = residui.map((riga) => riga.id);
  if (!ids.length) return;
  for (const id of ids) {
    await prisma.appointment.deleteMany({
      where: { organization_id: id, parent_appointment_id: { not: null } },
    });
    await prisma.appointment.deleteMany({ where: { organization_id: id } });
  }
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: ids } } })
    .catch(() => {});
  await prisma.club.deleteMany({ where: { id: { in: ids } } });
};

const semina = async () => {
  await pulisciResidui();

  for (const ruolo of RUOLI) {
    utenti[ruolo] = await utente(`uat6s-${ruolo}@example.invalid`, ruolo);
  }
  utenti.ownerB = await utente("uat6s-owner-b@example.invalid", "OwnerB");
  utenti.parentB = await utente("uat6s-parent-b@example.invalid", "ParentB");
  utenti.trainerB = await utente("uat6s-trainer-b@example.invalid", "TrainerB");
  utenti.estraneo = await utente("uat6s-estraneo@example.invalid", "Estraneo");

  await prisma.club.create({
    data: {
      id: CLUB_A,
      slug: `uat6s-a-${Date.now()}`,
      name: "ASD Sonda A",
      creator_id: utenti.owner.id,
      settings: {},
      categories: [{ id: CATEGORIA, name: "Under 15" }],
      club_sites: [{ id: SEDE_A, name: "Sede Unica", active: true }],
      /*
        **L'allenatore deve essere una persona del club, non solo un ruolo.**
        Un utente con ruolo `trainer` e nessuna scheda vede zero atleti e zero
        eventi: una sonda seminata cosi misurerebbe l'assenza della scheda e la
        chiamerebbe «difesa».
      */
      trainers: [
        {
          id: "trainer-uat6s",
          first_name: "Trainer",
          last_name: "Sonda",
          email: utenti.trainer.email,
          linkedUserId: utenti.trainer.id,
          categories: [CATEGORIA],
        },
      ],
      trainings: [],
      matches: [],
      updated_at: new Date(),
    },
  });

  await prisma.club.create({
    data: {
      id: CLUB_B,
      slug: `uat6s-b-${Date.now()}`,
      name: "ASD Sonda B",
      creator_id: utenti.ownerB.id,
      settings: {},
      categories: [{ id: CATEGORIA, name: "Under 15" }],
      club_sites: [],
      trainers: [
        {
          id: "trainer-uat6s-b",
          first_name: "Trainer",
          last_name: "Beta",
          email: utenti.trainerB.email,
          linkedUserId: utenti.trainerB.id,
          categories: [CATEGORIA],
        },
      ],
      trainings: [],
      matches: [],
      updated_at: new Date(),
    },
  });

  for (const ruolo of RUOLI) {
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: utenti[ruolo].id,
        role: ruolo,
        is_primary: true,
        updated_at: new Date(),
      },
    });
  }
  await prisma.organizationUser.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB_B,
        user_id: utenti.ownerB.id,
        role: "owner",
        is_primary: true,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_B,
        user_id: utenti.parentB.id,
        role: "parent",
        is_primary: true,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_B,
        user_id: utenti.trainerB.id,
        role: "trainer",
        is_primary: true,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.athlete.createMany({
    data: [
      {
        id: ATLETA_A,
        organization_id: CLUB_A,
        /* Il legame che `canParentAccessAthlete` riconosce. */
        user_id: utenti.parent.id,
        first_name: "Minore",
        last_name: "Alfa",
        category_id: CATEGORIA,
        category_name: "Under 15",
        status: "active",
        data: {
          /* Contenuto clinico vero: senza, la proiezione non ha niente da togliere. */
          allergies: "Arachidi",
          bloodType: "0+",
          medications: "Salbutamolo",
          phone: "3330000000",
        },
        updated_at: new Date(),
      },
      {
        id: ATLETA_ALTRUI,
        organization_id: CLUB_A,
        first_name: "Minore",
        last_name: "Altrui",
        category_id: CATEGORIA,
        category_name: "Under 15",
        status: "active",
        data: { allergies: "Lattosio" },
        updated_at: new Date(),
      },
      {
        id: ATLETA_B,
        organization_id: CLUB_B,
        user_id: utenti.parentB.id,
        first_name: "Minore",
        last_name: "Beta",
        category_id: CATEGORIA,
        category_name: "Under 15",
        status: "active",
        data: { allergies: "Glutine" },
        updated_at: new Date(),
      },
    ],
  });

  const scopeA = scopeDi(utenti.owner.id, CLUB_A, "owner");
  const scopeBeta = scopeB();

  const eventoA = await eventi.createClubEvent(scopeA, "training", {
    id: "uat6s-evento-a",
    date: "2026-09-15",
    time: "18:00",
    title: "Allenamento A",
    categoryId: CATEGORIA,
    siteId: SEDE_A,
  });
  EVENTO_A = eventoA.id || eventoA.event?.id;

  const eventoB = await eventi.createClubEvent(scopeBeta, "training", {
    id: "uat6s-evento-b",
    date: "2026-09-15",
    time: "18:00",
    title: "Allenamento B",
    categoryId: CATEGORIA,
  });
  EVENTO_B = eventoB.id || eventoB.event?.id;

  /* Un fascicolo documentale vero nel club A. */
  const scopeStaffA = scopeDi(utenti.staff.id, CLUB_A, "staff");
  const richiestaA = await documenti.createDocumentRequest(scopeStaffA, {
    subjectKind: "athlete",
    subjectId: ATLETA_A,
    documentKind: "identity_document",
    title: "Documento d'identita",
    required: true,
  });
  RICHIESTA_A = richiestaA.requestId || richiestaA.id;

  const scopeFamigliaA = await documenti.resolveLinkedFamilyScope(
    utenti.parent.id,
    ATLETA_A,
  );
  const deposito = await documenti.submitDocument(scopeFamigliaA, {
    requestId: RICHIESTA_A,
    source: "parent",
    file: {
      fileName: "identita.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 sonda wave 6"),
    },
  });
  DEPOSITO_A = deposito.submissions?.[0]?.id || deposito.id;
  ALLEGATO_A = (
    await prisma.documentSubmission.findUnique({ where: { id: DEPOSITO_A } })
  )?.attachment_id;

  /* Denaro: una rata e la sua ricevuta. */
  RATA_A = await prisma.athletePayment.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_A,
      athlete_id: ATLETA_A,
      description: "Quota di iscrizione",
      amount: 200,
      due_date: new Date("2026-10-15"),
      status: "pending",
      updated_at: new Date(),
    },
  });
  RICEVUTA_A = await prisma.receipt.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB_A,
      athlete_id: ATLETA_A,
      receipt_number: `UAT6S-${Date.now()}`,
      issue_date: new Date("2026-09-01"),
      amount: 200,
      description: "Quota di iscrizione",
      data: { payerName: "Famiglia Alfa" },
      updated_at: new Date(),
    },
  });

  /* Un appuntamento del club A. */
  const contesto = await appuntamenti.resolveFamilyAppointmentContext(
    utenti.parent.id,
    ATLETA_A,
  );
  await appuntamenti.createAppointmentSlot(
    scopeStaffA,
    {
      siteId: SEDE_A,
      weekday: 3,
      startTime: "15:00",
      endTime: "17:00",
      durationMinutes: 30,
    },
    { userId: utenti.staff.id },
  );
  const liberi = await appuntamenti.listFamilyFreeSlots(contesto, {
    from: "2026-09-07",
    to: "2026-09-28",
    now: new Date("2026-09-02T08:00:00.000Z"),
  });
  const appuntamento = await appuntamenti.requestFamilyAppointment(contesto, {
    startsAt: liberi[0].startsAt,
    reason: "Colloquio",
    slotId: liberi[0].slotId ?? null,
  });
  APPUNTAMENTO_A = appuntamento.id || appuntamento.appointment?.id;

  /* Un ruolo personalizzato del club A. */
  RUOLO_A = await ruoliDiClub.createClubRole(
    { ...scopeA, actorEmail: utenti.owner.email },
    {
      name: "Segreteria Sonda",
      baseRole: "collaborator",
      permissions: ["documents.review", "appointments.read"],
    },
  );

  /* Un modulo pubblico del club A. */
  const scopeModuli = scopeDi(utenti.owner.id, CLUB_A, "owner");
  const modello = await moduli.createFormTemplate(scopeModuli, {
    organizationId: CLUB_A,
  });
  await moduli.updateFormTemplateDraft(scopeModuli, modello.id, {
    title: "Modulo pubblico di collaudo",
    description: "",
    fields: [
      {
        id: "nome",
        type: "short_text",
        label: "Nome e cognome",
        required: true,
      },
    ],
  });
  await moduli.publishFormTemplate(scopeModuli, modello.id);
  MODULO_A = await moduli.setFormTemplatePublicAccess(
    scopeModuli,
    modello.id,
    true,
  );
};

const pulisci = async () => {
  for (const id of [CLUB_A, CLUB_B]) {
    await prisma.appointment.deleteMany({
      where: { organization_id: id, parent_appointment_id: { not: null } },
    });
    await prisma.appointment.deleteMany({ where: { organization_id: id } });
  }
  /*
    L'audit non ha una chiave esterna verso il club — di proposito, perche deve
    sopravvivere alla cancellazione di cio che racconta — quindi va tolto a
    mano, altrimenti la sonda lascia le proprie tracce nel database di sviluppo
    a ogni esecuzione.
  */
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: [CLUB_A, CLUB_B] } } })
    .catch(() => {});
  for (const id of [CLUB_A, CLUB_B]) {
    await prisma.club.delete({ where: { id } }).catch((errore) => {
      console.error(`Pulizia non riuscita, il club ${id} e rimasto: ${errore?.message}`);
    });
  }
};

/* ==================================================================== */
/*  U-31 — il genitore sul figlio altrui                                */
/* ==================================================================== */

const u31 = async () => {
  console.log(`${NL}U-31 — il genitore sul figlio di un'altra famiglia   [CRITICAL: minori]`);

  prova(
    "U-31 il legame risponde no sul figlio di un'altra famiglia dello stesso club",
    false,
    await cruscottoFamiglia.canParentAccessAthlete(
      utenti.parent.id,
      ATLETA_ALTRUI,
    ),
  );
  prova(
    "U-31 e no sul figlio di un altro club",
    false,
    await cruscottoFamiglia.canParentAccessAthlete(utenti.parent.id, ATLETA_B),
  );

  await varco(
    "U-31 il cruscotto del figlio altrui non si apre",
    () =>
      cruscottoFamiglia.getParentDashboardData(utenti.parent.id, ATLETA_ALTRUI),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-31 ne quello del figlio di un altro club",
    () => cruscottoFamiglia.getParentDashboardData(utenti.parent.id, ATLETA_B),
    ["inesistente", "ambiguo", "negato"],
  );

  /*
    Il contesto degli appuntamenti risponde `null` invece di sollevare: e la
    forma giusta, perche chi chiede resta senza sapere se quell'atleta esiste.
  */
  await varco(
    "U-31 il contesto appuntamenti del figlio altrui e inesistente",
    () =>
      appuntamenti.resolveFamilyAppointmentContext(
        utenti.parent.id,
        ATLETA_ALTRUI,
      ),
    ["inesistente"],
  );
  await varco(
    "U-31 e il fascicolo documentale del figlio altrui nemmeno",
    () => documenti.resolveLinkedFamilyScope(utenti.parent.id, ATLETA_ALTRUI),
    ["inesistente", "negato"],
  );

  /* La bacheca passa da una rotta: si interroga la rotta vera. */
  await comeUtente(utenti.parent, CLUB_A);
  const bachecaAltrui = await rotte.bacheca.GET(
    richiesta(`/api/parent-dashboard/${ATLETA_ALTRUI}/board`),
    { params: { athleteId: ATLETA_ALTRUI } },
  );
  const bachecaAltroClub = await rotte.bacheca.GET(
    richiesta(`/api/parent-dashboard/${ATLETA_B}/board`),
    { params: { athleteId: ATLETA_B } },
  );
  prova(
    "U-31 la bacheca di un figlio non suo risponde 403 o 404",
    [true, true],
    [
      [403, 404].includes(bachecaAltrui.status),
      [403, 404].includes(bachecaAltroClub.status),
    ],
    `stati=${bachecaAltrui.status},${bachecaAltroClub.status}`,
  );

  /* Il controspecchio: sul **proprio** figlio la stessa strada si apre. */
  const suo = await rotte.bacheca.GET(
    richiesta(`/api/parent-dashboard/${ATLETA_A}/board`),
    { params: { athleteId: ATLETA_A } },
  );
  prova(
    "U-31 mentre sul proprio figlio la stessa strada si apre",
    200,
    suo.status,
    "senza questo controspecchio un 403 per tutti passerebbe per una difesa",
  );
};

/* ==================================================================== */
/*  U-32 — l'allenatore sull'atleta e sull'evento altrui                 */
/* ==================================================================== */

const u32 = async () => {
  console.log(`${NL}U-32 — l'allenatore, fuori dal proprio club   [CRITICAL: minori, tenant]`);
  const scopeTrainerA = scopeRuolo("trainer");
  const scopeTrainerB = scopeDi(utenti.trainerB.id, CLUB_B, "trainer");

  await varco(
    "U-32 l'allenatore del club A non legge l'atleta del club B",
    () =>
      risorse.listResource(
        "athletes",
        new URLSearchParams({ organization_id: CLUB_B, id: ATLETA_B }),
        scopeTrainerA,
      ),
    ["inesistente", "ambiguo", "negato"],
  );

  await varco(
    "U-32 e l'evento del club B non risulta",
    () => eventi.readClubEvent(scopeTrainerA, EVENTO_B),
    ["inesistente"],
  );

  await varco(
    "U-32 ne ci puo scrivere sopra",
    () => eventi.updateClubEvent(scopeTrainerA, EVENTO_B, { title: "Riscritto" }),
    ["inesistente", "ambiguo", "negato"],
  );

  await varco(
    "U-32 e l'allenatore del club B non tocca l'evento del club A",
    () => eventi.updateClubEvent(scopeTrainerB, EVENTO_A, { title: "Riscritto" }),
    ["inesistente", "ambiguo", "negato"],
  );

  /*
    **La convocazione e l'appello sono la strada che W6-23 nominava**: un
    allenatore che conosce un `eventId` fuori perimetro poteva farci appello e
    convocazioni. Qui l'evento e addirittura di un altro club.
  */
  await varco(
    "U-32 non convoca su un evento che non e del suo club",
    () =>
      eventi.saveEventConvocations(
        scopeTrainerA,
        EVENTO_B,
        [{ athleteId: ATLETA_B, status: "convocated" }],
        { userId: utenti.trainer.id },
      ),
    ["inesistente", "ambiguo", "negato"],
  );

  const suoi = await eventi.listClubEvents(scopeTrainerA);
  prova(
    "U-32 e il suo elenco contiene solo eventi del suo club",
    true,
    suoi.length > 0 && suoi.every((riga) => riga.organization_id === CLUB_A),
    `eventi=${suoi.length}`,
  );
};

/* ==================================================================== */
/*  U-33 — il download documentale cross-club                           */
/* ==================================================================== */

const u33 = async () => {
  console.log(`${NL}U-33 — la ricevuta e gli allegati, da un altro club   [CRITICAL: denaro, tenant]`);

  await comeUtente(utenti.ownerB, CLUB_B);
  const daAltroClub = await rotte.documento.GET(
    richiesta(`/api/v1/documents/receipt/${RICEVUTA_A.id}`),
    { params: { kind: "receipt", id: RICEVUTA_A.id } },
  );
  prova(
    "U-33 il proprietario del club B non scarica la ricevuta del club A",
    true,
    [403, 404].includes(daAltroClub.status),
    `stato=${daAltroClub.status}`,
  );

  /* Un estraneo senza nessuna tessera nemmeno. */
  await comeUtente(utenti.estraneo, CLUB_A);
  const daEstraneo = await rotte.documento.GET(
    richiesta(`/api/v1/documents/receipt/${RICEVUTA_A.id}`),
    { params: { kind: "receipt", id: RICEVUTA_A.id } },
  );
  prova(
    "U-33 e un estraneo senza tessera nemmeno",
    true,
    [401, 403, 404].includes(daEstraneo.status),
    `stato=${daEstraneo.status}`,
  );

  /* Senza sessione, la rotta non risponde con il documento. */
  SESSIONE = null;
  const senzaSessione = await rotte.documento.GET(
    richiesta(`/api/v1/documents/receipt/${RICEVUTA_A.id}`),
    { params: { kind: "receipt", id: RICEVUTA_A.id } },
  );
  prova(
    "U-33 e senza sessione la rotta risponde 401",
    401,
    senzaSessione.status,
  );

  /* I byte dell'allegato: `Attachment` porta il club sulla riga. */
  await varco(
    "U-33 l'allegato del club A non si legge dal club B",
    () => allegati.readAttachment(ALLEGATO_A, scopeB()),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-33 e l'elenco degli allegati del club A, dal club B, e vuoto",
    () =>
      allegati.listAttachments(
        { organizationId: CLUB_A, ownerType: "athlete", ownerId: ATLETA_A },
        scopeB(),
      ),
    ["inesistente", "ambiguo", "negato"],
  );

  await varco(
    "U-33 il fascicolo del club A non si apre dal club B",
    () =>
      documenti.getDocumentDossier(scopeB(), {
        subjectKind: "athlete",
        subjectId: ATLETA_A,
      }),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-33 e il deposito del club A non si decide dal club B",
    () =>
      documenti.decideDocumentSubmission(scopeB(), DEPOSITO_A, {
        decision: "approved",
      }),
    ["inesistente", "ambiguo", "negato"],
  );
};

/* ==================================================================== */
/*  U-34 — il dato clinico                                              */
/* ==================================================================== */

const u34 = async () => {
  console.log(`${NL}U-34 — il contenuto clinico   [CRITICAL: salute]`);

  const clinici = permessiSanitari.CLINICAL_ATHLETE_FIELDS;

  /*
    **Il conteggio delle righe sta nella stessa asserzione dei campi**, e non e
    pedanteria: se l'allenatore ricevesse zero atleti — per il perimetro, per
    un filtro sbagliato — l'elenco dei campi clinici sarebbe vuoto e la prova
    passerebbe senza avere misurato niente.
  */
  const leggi = async (scope) => {
    const righe = await risorse.listResource(
      "athletes",
      new URLSearchParams({ organization_id: CLUB_A, id: ATLETA_A }),
      scope,
    );
    const dati = righe[0]?.data || {};
    return { righe: righe.length, clinici: clinici.filter((campo) => campo in dati) };
  };

  devia(
    "U-34 `clinical.read` non nega: proietta",
    "la chiave protegge un campo, non una chiamata: la risposta arriva **senza** i campi clinici invece di essere rifiutata. Registrarla come «negato mancante» direbbe difetto dove c'e una difesa di forma diversa.",
  );

  prova(
    "U-34 l'allenatore riceve l'atleta e non allergie, farmaci, gruppo sanguigno",
    { righe: 1, clinici: [] },
    await leggi(scopeRuolo("trainer")),
  );
  prova(
    "U-34 il collaboratore, che ha `clinical.read`, li riceve",
    { righe: 1, clinici: ["allergies", "bloodType", "medications"] },
    await leggi(scopeRuolo("collaborator")),
    "senza questo controspecchio una proiezione che azzera tutto passerebbe per una difesa",
  );

  await varco(
    "U-34 e dal club B l'atleta del club A non esce affatto",
    () =>
      risorse.listResource(
        "athletes",
        new URLSearchParams({ organization_id: CLUB_A, id: ATLETA_A }),
        scopeB(),
      ),
    ["inesistente", "ambiguo", "negato"],
  );

  const certificatiAltrui = await prisma.medicalCertificate.count({
    where: { organization_id: CLUB_B, athlete_id: ATLETA_A },
  });
  prova(
    "U-34 e nessun certificato del club A e attribuito al club B",
    0,
    certificatiAltrui,
  );
};

/* ==================================================================== */
/*  U-35 — i pagamenti                                                  */
/* ==================================================================== */

const u35 = async () => {
  console.log(`${NL}U-35 — il denaro, da un altro club   [CRITICAL: denaro, tenant]`);

  await varco(
    "U-35 le rate del club A non si elencano dal club B",
    () =>
      risorse.listResourcePage(
        "payments",
        new URLSearchParams({ organization_id: CLUB_A }),
        scopeB(),
      ),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-35 la singola rata del club A non si legge dal club B",
    () =>
      risorse.listResource(
        "payments",
        new URLSearchParams({ organization_id: CLUB_A, id: RATA_A.id }),
        scopeB(),
      ),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-35 e non si scrive: una rata altrui non si marca saldata",
    () =>
      risorse.updateResource("payments", RATA_A.id, { status: "paid" }, scopeB()),
    ["inesistente", "ambiguo", "negato"],
  );

  const dopo = await prisma.athletePayment.findUnique({
    where: { id: RATA_A.id },
  });
  prova(
    "U-35 e la rata e rimasta come stava",
    "pending",
    dopo?.status,
    "il controllo sul valore, non sull'eccezione: un rifiuto dopo la scrittura non e un rifiuto",
  );

  await varco(
    "U-35 le ricevute del club A non si elencano dal club B",
    () =>
      risorse.listResourcePage(
        "receipts",
        new URLSearchParams({ organization_id: CLUB_A }),
        scopeB(),
      ),
    ["inesistente", "ambiguo", "negato"],
  );

  /*
    **Un genitore non e un contabile nemmeno del proprio club**, e questa prova
    passa dalla **rotta** e non dal servizio: la matrice per risorsa
    (`assertClubResourceAccess`) e applicata dal route handler, non da
    `listResourcePage`. Misurarla sul servizio direbbe «difetto» dove c'e una
    guardia che sta un piano piu su — ma e anche il motivo per cui una seconda
    strada verso `listResourcePage` sarebbe una strada senza quella guardia.
  */
  await comeUtente(utenti.parent, CLUB_A);
  for (const risorsa of ["receipts", "payments", "invoices"]) {
    const risposta = await rotte.risorsa.GET(
      richiesta(`/api/v1/${risorsa}?organization_id=${CLUB_A}`),
      { params: { resource: risorsa } },
    );
    prova(
      `U-35 dal browser di un genitore, GET /api/v1/${risorsa} risponde 403`,
      403,
      risposta.status,
    );
  }

  /* E il diniego lascia una riga, perche «chi ha provato» e un evento di sicurezza. */
  const tracce = await prisma.auditLog.count({
    where: {
      organization_id: CLUB_A,
      outcome: "denied",
      actor_user_id: utenti.parent.id,
    },
  });
  prova(
    "U-35 e i tre tentativi lasciano una traccia",
    true,
    tracce >= 3,
    `dinieghi tracciati=${tracce}`,
  );
};

/* ==================================================================== */
/*  U-36 — l'invito atleta e i moduli pubblici                          */
/* ==================================================================== */

const u36 = async () => {
  console.log(`${NL}U-36 — l'invito atleta e il modulo pubblico   [CRITICAL: minori, tenant]`);

  await varco(
    "U-36 dal club B non si invita l'atleta del club A",
    () =>
      contiAtleta.sendAthleteAccountInvite(
        { ...scopeB(), actorEmail: utenti.ownerB.email },
        { athleteId: ATLETA_A, email: "scalata@example.invalid" },
      ),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-36 ne si legge lo stato del suo accesso",
    () =>
      contiAtleta.readAthleteAccountState(
        { ...scopeB(), actorEmail: utenti.ownerB.email },
        ATLETA_A,
      ),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-36 e un allenatore non gestisce gli accessi nemmeno nel proprio club",
    () =>
      contiAtleta.sendAthleteAccountInvite(
        { ...scopeRuolo("trainer"), actorEmail: utenti.trainer.email },
        { athleteId: ATLETA_A, email: "scalata2@example.invalid" },
      ),
    ["negato"],
  );

  const inviti = await prisma.athleteAccountInvite.count({
    where: { athlete_id: ATLETA_A },
  });
  prova(
    "U-36 e nessun invito e stato scritto",
    0,
    inviti,
    "il controllo sul valore: un'eccezione dopo l'INSERT non e un rifiuto",
  );

  /* Il modulo pubblico: cosa esce a chi ha solo il link. */
  const pubblico = await rotte.moduloPubblico.GET(
    new Request(
      `http://collaudo.invalid/api/public/forms/${MODULO_A.publicSlug || MODULO_A.public_slug}`,
    ),
    { params: { publicSlug: MODULO_A.publicSlug || MODULO_A.public_slug } },
  );
  const corpo = await pubblico.json();
  prova(
    "U-36 il modulo pubblico risponde, e porta il modulo e l'identita del club",
    [200, true, true],
    [
      pubblico.status,
      Boolean(corpo?.data?.form?.fields),
      Boolean(corpo?.data?.club?.name),
    ],
  );
  prova(
    "U-36 e non porta identificativi interni ne compilazioni gia raccolte",
    [false, false, false],
    [
      "id" in (corpo?.data?.club || {}),
      "organizationId" in (corpo?.data?.form || {}),
      "submissions" in (corpo?.data || {}),
    ],
    "chi apre un link pubblico non e nessuno finche non si dichiara",
  );

  const inventato = await rotte.moduloPubblico.GET(
    new Request("http://collaudo.invalid/api/public/forms/uat6s-non-esiste"),
    { params: { publicSlug: "uat6s-non-esiste" } },
  );
  prova(
    "U-36 e uno slug inventato risponde 404, non un errore parlante",
    404,
    inventato.status,
  );
};

/* ==================================================================== */
/*  U-37 — appuntamento e fascicolo, da un altro club                   */
/* ==================================================================== */

const u37 = async () => {
  console.log(`${NL}U-37 — l'appuntamento e l'iscrizione   [CRITICAL: minori, tenant]`);

  await varco(
    "U-37 l'appuntamento del club A non si legge dal club B",
    () => appuntamenti.readAppointment(scopeB(), APPUNTAMENTO_A),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-37 e non si conferma dal club B",
    () =>
      appuntamenti.confirmAppointment(scopeB(), APPUNTAMENTO_A, {}, {
        userId: utenti.ownerB.id,
      }),
    ["inesistente", "ambiguo", "negato"],
  );

  const statoDopo = await prisma.appointment.findUnique({
    where: { id: APPUNTAMENTO_A },
  });
  prova(
    "U-37 e l'appuntamento e rimasto «richiesto»",
    "requested",
    statoDopo?.status,
    "nella Wave 5 questa stessa chiamata, con uno scope contraffatto, lo portava a «confermato»",
  );

  await varco(
    "U-37 il genitore del club B non vede gli appuntamenti dell'atleta del club A",
    () =>
      appuntamenti.resolveFamilyAppointmentContext(utenti.parentB.id, ATLETA_A),
    ["inesistente"],
  );

  await varco(
    "U-37 e la richiesta documentale del club A non si annulla dal club B",
    () => documenti.cancelDocumentRequest(scopeB(), RICHIESTA_A),
    ["inesistente", "ambiguo", "negato"],
  );

  const richiestaViva = await prisma.documentRequest.findUnique({
    where: { id: RICHIESTA_A },
  });
  prova(
    "U-37 e la richiesta e ancora viva",
    true,
    richiestaViva?.status !== "cancelled",
    `stato=${richiestaViva?.status}`,
  );
};

/* ==================================================================== */
/*  U-38 — audit, ruoli, e lo scope contraffatto                        */
/* ==================================================================== */

const u38 = async () => {
  console.log(`${NL}U-38 — l'audit, il ruolo altrui, e lo scope contraffatto   [CRITICAL: tenant]`);

  /* Le righe di audit del club A esistono: senza, la prova non misura niente. */
  const righeA = await prisma.auditLog.count({
    where: { organization_id: CLUB_A },
  });
  prova(
    "U-38 il club A ha righe di audit da proteggere",
    true,
    righeA > 0,
    `righe=${righeA}`,
  );

  const daB = await registro.listAuditEvents(CLUB_B, { limit: 50 });
  prova(
    "U-38 e il registro del club B non ne contiene nessuna del club A",
    0,
    daB.items.filter((riga) => riga.organizationId === CLUB_A).length,
    `righe viste dal club B=${daB.items.length}`,
  );

  await varco(
    "U-38 un collaboratore non legge il registro: `audit.read` e di direzione",
    () =>
      registro.assertAuditReadPermission({
        ...scopeRuolo("collaborator"),
        actorEmail: utenti.collaborator.email,
      }),
    ["negato"],
  );

  await varco(
    "U-38 il ruolo personalizzato del club A non si modifica dal club B",
    () =>
      ruoliDiClub.updateClubRole(
        { ...scopeB(), actorEmail: utenti.ownerB.email },
        RUOLO_A.id,
        { name: "Rubato" },
      ),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-38 ne si cancella",
    () =>
      ruoliDiClub.deleteClubRole(
        { ...scopeB(), actorEmail: utenti.ownerB.email },
        RUOLO_A.id,
      ),
    ["inesistente", "ambiguo", "negato"],
  );
  prova(
    "U-38 e il ruolo del club A e ancora li, con il suo nome",
    "Segreteria Sonda",
    (await prisma.clubRole.findUnique({ where: { id: RUOLO_A.id } }))?.name ??
      null,
  );

  /*
    **Lo scope contraffatto.**

    Non una riga altrui chiesta con il proprio club attivo — quella la ferma il
    confronto con il club attivo — ma uno scope **incoerente**:
    `activeOrganizationId` del club A e `allowedOrganizationIds` del club B.
    Nella Wave 5 le quattro chiamate provate riuscivano tutte: titolo di un
    evento riscritto, appuntamento portato a «confermato». Nessuna guardia se
    ne accorgeva, perche per disegno nessuna guarda l'elenco.
  */
  const contraffatto = {
    userId: utenti.ownerB.id,
    activeOrganizationId: CLUB_A,
    activeRole: "owner",
    activeMembershipId: null,
    allowedOrganizationIds: [CLUB_B],
    accessScopes: [],
  };

  await varco(
    "U-38 scope contraffatto: non legge l'evento del club A",
    () => eventi.readClubEvent(contraffatto, EVENTO_A),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-38 scope contraffatto: non riscrive il titolo dell'evento",
    () => eventi.updateClubEvent(contraffatto, EVENTO_A, { title: "Contraffatto" }),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-38 scope contraffatto: non conferma l'appuntamento",
    () =>
      appuntamenti.confirmAppointment(contraffatto, APPUNTAMENTO_A, {}, {
        userId: utenti.ownerB.id,
      }),
    ["inesistente", "ambiguo", "negato"],
  );
  /*
    **La stessa contraffazione, contro il registro generico.**

    Eventi e appuntamenti passano da `assertActiveClub`, che dalla Wave 5
    contiene `assertScopeIsCoherent`. Il registro generico non ci passa: il suo
    `ensureOrganizationAccess` (`src/lib/server/resources.ts`) chiama
    `belongsToActiveClub` direttamente, e quella funzione — per disegno — non
    guarda l'elenco. Se questa riga fallisce, la difesa della Wave 5 copre due
    domini e non copre la superficie piu ampia: una cinquantina di risorse.
  */
  await varco(
    "U-38 scope contraffatto: non elenca gli atleti del club A",
    () =>
      risorse.listResourcePage(
        "athletes",
        new URLSearchParams({ organization_id: CLUB_A }),
        contraffatto,
      ),
    ["inesistente", "ambiguo", "negato"],
  );

  const evento = await prisma.clubEvent.findUnique({ where: { id: EVENTO_A } });
  prova(
    "U-38 e nulla e stato scritto: il titolo e ancora il suo",
    "Allenamento A",
    evento?.title ?? null,
  );

  /*
    **Il verso opposto**, senza cui la difesa sopra sarebbe una curiosita:
    `resolveOrganizationScopeForUser` — l'unico costruttore di scope — non
    produce uno scope sul club A per un utente del club B, nemmeno se glielo si
    chiede per nome.
  */
  const vero = await autenticazione.resolveOrganizationScopeForUser(
    utenti.ownerB.id,
    CLUB_A,
    "owner",
  );
  prova(
    "U-38 e la sessione vera non fabbrica uno scope sul club altrui",
    [true, false],
    [
      vero.activeOrganizationId !== CLUB_A,
      (vero.allowedOrganizationIds || []).includes(CLUB_A),
    ],
    `club risolto=${vero.activeOrganizationId}`,
  );
};

/* ------------------------------------------------------------- il giro */

try {
  eventi = await carica("src/lib/server/events.ts");
  documenti = await carica("src/lib/server/document-requests.ts");
  appuntamenti = await carica("src/lib/server/appointments.ts");
  risorse = await carica("src/lib/server/resources.ts");
  autenticazione = await carica("src/lib/server/auth.ts");
  cruscottoFamiglia = await carica("src/lib/server/parent-dashboard.ts");
  contiAtleta = await carica("src/lib/server/athlete-accounts.ts");
  allegati = await carica("src/lib/server/attachments.ts");
  permessiSanitari = await carica("src/lib/health/permissions.ts");
  ruoliDiClub = await carica("src/lib/server/club-roles.ts");
  registro = await carica("src/lib/server/audit.ts");
  moduli = await carica("src/lib/server/forms.ts");

  await preparaTrasporto();

  console.log(`${NL}Semina dei due club ${CLUB_A} / ${CLUB_B}...`);
  await semina();

  await u31();
  await u32();
  await u33();
  await u34();
  await u35();
  await u36();
  await u37();
  await u38();

  const falliti = esiti.filter((e) => !e.ok);
  if (deviazioni.length) {
    console.log(
      `${NL}${deviazioni.length} deviazioni dichiarate (non sono ne successi ne difetti):`,
    );
    for (const d of deviazioni) console.log(`  - ${d.titolo.trim()}: ${d.motivo}`);
  }
  console.log(
    `${NL}${esiti.length - falliti.length}/${esiti.length} controlli passati.`,
  );
  if (falliti.length) {
    console.log(`${NL}FALLITI (ognuno e CRITICAL: minori, salute, denaro o tenant):`);
    for (const e of falliti) {
      console.log(
        `  ${e.titolo.trim()}${NL}    atteso  ${JSON.stringify(e.atteso)}${NL}    trovato ${JSON.stringify(e.trovato)}${e.nota ? `${NL}    nota    ${e.nota}` : ""}`,
      );
    }
    process.exitCode = 1;
  }
} catch (errore) {
  console.error(
    `${NL}Sonda interrotta:${NL}${String(errore?.stack || errore?.message)
      .split(NL)
      .slice(0, 30)
      .join(NL)}`,
  );
  process.exitCode = 1;
} finally {
  await pulisci();
  await prisma.$disconnect();
}
