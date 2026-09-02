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
const SEDE_ALTRA = "sede-uat6s-altra";
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
let datiPersonali;
let appuntamenti;
let risorse;
let autenticazione;
let cruscottoFamiglia;
let contiAtleta;
let allegati;
let permessiSanitari;
let permessiAllegati;
let ruoliDiClub;
let registro;
let moduli;
let ruoliDiAccesso;
let permessiContabili;
let agenda;
let pubblico;
let contributi;
let appartenenzeStagione;
let segnaposto;
let compilazioni;
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
    riscatto: await carica("src/app/api/v1/auth/access/redeem/route.ts"),
    personaLavoro: await carica("src/app/api/v1/sport-work/people/[id]/route.ts"),
    avatar: await carica("src/app/api/v1/athletes/[id]/avatar/route.ts"),
    rata: await carica("src/app/api/athlete-payments/[paymentId]/route.ts"),
    documentiGenerati: await carica("src/app/api/v1/documents/generated/route.ts"),
    documentoGenerato: await carica(
      "src/app/api/v1/documents/generated/[id]/route.ts",
    ),
    profiloAtleta: await carica(
      "src/app/api/v1/auth/athlete-profile/[athleteId]/route.ts",
    ),
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

  /*
    **Due sedi, due atleti**: senza questo il perimetro non ha niente da
    restringere, e ogni prova su di esso passerebbe misurando il vuoto.
  */
  await prisma.athleteCategoryMembership.createMany({
    data: [
      {
        organization_id: CLUB_A,
        athlete_id: ATLETA_A,
        category_id: CATEGORIA,
        category_name: "Under 15",
        site_id: SEDE_A,
        is_primary: true,
      },
      {
        organization_id: CLUB_A,
        athlete_id: ATLETA_ALTRUI,
        category_id: CATEGORIA,
        category_name: "Under 15",
        site_id: SEDE_ALTRA,
        is_primary: true,
      },
    ],
  });

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

  /*
    **L'export dell'interessato, esercitato invece che letto.**

    Le prove che presidiavano questo taglio erano cinque `assert.match` sul
    testo del file. Una revisione ostile ha **invertito** la condizione — il
    clinico esce a chi non ha la chiave e sparisce a chi ce l'ha — e i cinque
    controlli sono rimasti verdi. Un presidio che dichiara una proprieta di
    sicurezza e ne verifica la sintassi non presidia niente.

    Qui l'export si chiama davvero, con due ruoli, e si guarda cosa esce.
  */
  const esportaCon = async (ruoloAttivo) => {
    /*
      Lo scope si costruisce sulla stessa utenza — la direzione del club A — e
      cambia **solo** il ruolo attivo: cosi la differenza fra le due misure e il
      gettone, e non la persona.
    */
    const risultato = await datiPersonali.exportDataSubject(
      { ...scopeDi(utenti.club_manager.id, CLUB_A, ruoloAttivo) },
      { subjectKind: "athlete", subjectId: ATLETA_A },
    );
    const testo = JSON.stringify(risultato.sections?.athletes || []);
    return {
      omesso: Boolean(risultato.clinicalContentOmitted),
      allergie: testo.includes("Arachidi"),
    };
  };

  prova(
    "U-34 l'export di chi ha `clinical.read` porta il contenuto clinico",
    { omesso: false, allergie: true },
    await esportaCon("club_manager"),
    "senza questo controspecchio un export che azzera tutto passerebbe per una difesa",
  );

  prova(
    "U-34 e quello di un ruolo a cui la chiave e stata tolta non lo porta, e lo dichiara",
    { omesso: true, allergie: false },
    await esportaCon(
      "custom:club_manager:senza-clinico#documents.request,data_subject.export",
    ),
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

  /* ================================================================== */
  /*  U-39 — il perimetro, esercitato invece che letto  [CRITICAL: minori]  */
  /* ================================================================== */

  /*
    **Perche queste prove stanno qui e non fra i test.**

    Il perimetro si esprime con un filtro su una **relazione**
    (`category_memberships: { some: { site_id: ... } }`), e il doppio di Prisma
    della suite non sa valutarlo: un test scritto li misurerebbe il doppio.

    Non e una sottigliezza. Una revisione ostile ha mutato la guardia del
    perimetro perche non negasse **mai**, e i quattordici controlli che la
    presidiavano sono rimasti verdi: erano tutti `assert.match` sul testo del
    file. Un presidio che legge il sorgente verifica che qualcuno abbia scritto
    la riga, non che la riga faccia qualcosa.

    Qui il database e vero e la riga si esercita.
  */
  /* ================================================================== */
  /*  U-47 — le persone del club: gettone, codice fiscale, IBAN          */
  /*         [CRITICAL: denaro]                                          */
  /* ================================================================== */

  /*
    `trainers` e `staff_members` portano il gettone di accesso in chiaro, il
    codice fiscale e **l'IBAN**. La proiezione ridotta esisteva, ma valeva solo
    quando il ruolo attivo era `trainer`: collaboratore, segreteria e ogni ruolo
    personalizzato leggevano la riga intera.

    `sport_work` e riservata alla direzione con la motivazione esplicita «le
    coordinate bancarie di ogni collaboratore». Le stesse coordinate uscivano
    dalla porta accanto.
  */
  console.log(
    `${NL}U-47 — le persone del club: gettone, CF, IBAN   [CRITICAL: denaro]`,
  );

  /*
    Si **aggiorna** la scheda che la semina ha gia creato, invece di crearne
    una: `createResource` su una risorsa di club riscrive l'aggregato
    `clubs.trainers`, e cosi facendo cancellava il profilo dell'allenatore
    seminato — che e quello su cui poggiano meta delle prove di questo file.

    E una lezione piccola e vera: una sonda che semina puo rompere le prove che
    vengono dopo, e il modo di accorgersene e che qualcosa **altrove** diventa
    rosso.
  */
  await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_A,
      resource_type: "trainers",
      name: "Mario Allenatore",
      payload: {
        first_name: "Mario",
        last_name: "Allenatore",
        email: "mario@example.invalid",
        iban: "IT60X0542811101000000123456",
        fiscalCode: "LLNMRA80A01H501U",
        accessTokenValue: "GETTONE-ALLENATORE-SEGRETO",
      },
      updated_at: new Date(),
    },
  });

  const personaVistaDa = async (ruolo) => {
    const scope = ruolo.includes(":")
      ? scopeDi(utenti.club_manager.id, CLUB_A, ruolo)
      : scopeRuolo(ruolo);
    const righe = await risorse.listResource(
      "trainers",
      new URLSearchParams({ organization_id: CLUB_A }),
      scope,
    );
    const testo = JSON.stringify(righe);
    return {
      righe: righe.length,
      gettone: testo.includes("GETTONE-ALLENATORE-SEGRETO"),
      iban: testo.includes("IT60X0542811101000000123456"),
      cf: testo.includes("LLNMRA80A01H501U"),
    };
  };

  for (const ruolo of [
    "collaborator",
    "staff",
    "custom:club_manager:segreteria#members.register.read",
  ]) {
    prova(
      `U-47 ${ruolo.split("#")[0]} non riceve gettone, IBAN e codice fiscale`,
      { righe: 1, gettone: false, iban: false, cf: false },
      await personaVistaDa(ruolo),
    );
  }

  prova(
    "U-47 la direzione continua a vederli",
    { righe: 1, gettone: true, iban: true, cf: true },
    await personaVistaDa("club_manager"),
    "senza questo controspecchio una proiezione che azzera tutto passerebbe per una difesa",
  );

  /* ================================================================== */
  /*  U-48 — il certificato caricato da un modulo   [CRITICAL: salute]   */
  /* ================================================================== */

  /*
    Ogni caricamento da un modulo online viene depositato con la categoria
    `compilazione-modulo`, qualunque cosa contenga — e il modulo di iscrizione
    chiede il certificato medico. Il cancello sui byte giudica la **categoria**,
    quindi su quei file non si accendeva mai.

    Misurato: lo stesso certificato dello stesso minore era negato se depositato
    dal fascicolo e leggibile se caricato dal modulo di iscrizione, dal ruolo
    personalizzato a cui il club aveva tolto `clinical.read`.
  */
  console.log(
    `${NL}U-48 — il certificato caricato da un modulo   [CRITICAL: salute]`,
  );

  const senzaClinico =
    "custom:club_manager:senza-clinico#documents.review,forms.read";

  prova(
    "U-48 un allegato di modulo non si legge senza il permesso sul dato clinico",
    { modulo: false, fascicolo: false },
    {
      modulo: permessiAllegati.canAccessAttachmentOwner(
        senzaClinico,
        "form",
        "read",
        "compilazione-modulo",
      ),
      fascicolo: permessiAllegati.canAccessAttachmentOwner(
        senzaClinico,
        "athlete",
        "read",
        "medical_certificate",
      ),
    },
    "prima le due porte rispondevano diversamente sullo stesso certificato dello stesso minore",
  );

  prova(
    "U-48 e chi ha il permesso clinico continua a rivedere i moduli",
    { modulo: true, fascicolo: true },
    {
      modulo: permessiAllegati.canAccessAttachmentOwner(
        "collaborator",
        "form",
        "read",
        "compilazione-modulo",
      ),
      fascicolo: permessiAllegati.canAccessAttachmentOwner(
        "collaborator",
        "athlete",
        "read",
        "medical_certificate",
      ),
    },
  );

  /* ================================================================== */
  /*  U-46 — il perimetro sul documentale, fino ai byte                  */
  /*         [CRITICAL: minori]                                          */
  /* ================================================================== */

  /*
    Il perimetro era applicato in **un punto su otto** del dominio documentale —
    `getDocumentDossier` — e le altre sette lo ignoravano. Una revisione ostile
    ha letto per identificativo la richiesta di un minore di un'altra sede, ne
    ha depositato un documento, ne ha cancellato un altro, e **ne ha scaricato i
    byte della carta d'identita**.

    E c'erano due code sulla stessa tabella e sulla **stessa rotta** — una con
    `view=queue` e una senza — di cui solo la prima passava dal perimetro.

    Adesso il perimetro sta **dentro la guardia che tutte chiamano**, e arriva
    fino agli allegati, che sono la fine di ogni catena: chiunque ottenga un
    identificativo, da qualunque elenco, arrivava ai byte.
  */
  console.log(
    `${NL}U-46 — il perimetro sul documentale, fino ai byte   [CRITICAL: minori]`,
  );

  const segreteriaPerimetrata = {
    ...scopeDi(utenti.staff.id, CLUB_A, "staff"),
    accessScopes: [{ kind: "site", value: SEDE_A }],
  };

  /* Una richiesta e un allegato per l'atleta FUORI dal perimetro. */
  const richiestaFuori = await documenti.createDocumentRequest(
    scopeRuolo("club_manager"),
    {
      subjectKind: "athlete",
      subjectId: ATLETA_ALTRUI,
      documentKind: "identity_document",
      title: "Carta d'identita fuori perimetro",
      required: true,
    },
  );
  const idRichiestaFuori =
    richiestaFuori.requestId || richiestaFuori.id || richiestaFuori.request?.id;

  const allegatoFuori = await allegati.createAttachment(
    {
      organizationId: CLUB_A,
      ownerType: "athlete",
      ownerId: ATLETA_ALTRUI,
      category: "identity_document",
      fileName: "carta-identita-fuori.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 BYTE-DI-UN-MINORE-FUORI-PERIMETRO"),
    },
    scopeRuolo("club_manager"),
  );

  await varco(
    "U-46 la richiesta di un minore fuori perimetro non si legge per id",
    () => documenti.getDocumentRequest(segreteriaPerimetrata, idRichiestaFuori),
    ["negato", "ambiguo", "inesistente"],
  );

  await varco(
    "U-46 ne si crea una richiesta su di lui",
    () =>
      documenti.createDocumentRequest(segreteriaPerimetrata, {
        subjectKind: "athlete",
        subjectId: ATLETA_ALTRUI,
        documentKind: "other",
        title: "Iniettata",
        required: false,
      }),
    ["negato", "ambiguo"],
  );

  const codaSenzaParametro = await documenti.listPendingDocumentSubmissions(
    segreteriaPerimetrata,
    {},
  );
  prova(
    "U-46 la coda senza `view=queue` non porta i depositi dell'altra sede",
    true,
    (codaSenzaParametro || []).every(
      (riga) => riga.subjectId !== ATLETA_ALTRUI,
    ),
    `righe=${(codaSenzaParametro || []).length}`,
  );

  await varco(
    "U-46 e i byte del suo documento non si scaricano",
    () => allegati.readAttachment(allegatoFuori.id, segreteriaPerimetrata),
    ["negato", "ambiguo", "inesistente"],
  );

  /*
    I due controspecchi, senza cui una proiezione che azzera tutto passerebbe
    per una difesa: dentro il perimetro si legge, e senza perimetro si legge
    tutto.
  */
  const suoAllegato = await allegati.createAttachment(
    {
      organizationId: CLUB_A,
      ownerType: "athlete",
      ownerId: ATLETA_A,
      category: "identity_document",
      fileName: "carta-identita-dentro.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 DENTRO-IL-PERIMETRO"),
    },
    scopeRuolo("club_manager"),
  );

  const letturaDentro = await tenta(() =>
    allegati.readAttachment(suoAllegato.id, segreteriaPerimetrata),
  );
  prova(
    "U-46 e l'allegato di un atleta dentro il perimetro si legge ancora",
    "riuscito",
    letturaDentro.esito,
    letturaDentro.messaggio ? letturaDentro.messaggio.slice(0, 120) : "",
  );

  const letturaSenzaPerimetro = await tenta(() =>
    allegati.readAttachment(allegatoFuori.id, scopeRuolo("club_manager")),
  );
  prova(
    "U-46 e chi non ha perimetro legge entrambi",
    "riuscito",
    letturaSenzaPerimetro.esito,
  );

  /* ================================================================== */
  /*  U-45 — il perimetro non si allarga da dentro   [CRITICAL: minori]  */
  /* ================================================================== */

  /*
    Il perimetro di sede si calcola su `athlete_category_memberships.site_id`, e
    quella tabella e servita dal registro generico ed e aperta in scrittura alla
    gestione.

    Prima della correzione: un ruolo perimetrato sulla sede Nord creava
    un'appartenenza per un atleta della sede Sud, con la **propria** sede
    dentro, e da quel momento tutte le porte chiuse gli si aprivano **a buon
    diritto**. Il confine non veniva aggirato: veniva **spostato**.

    E la classe piu insidiosa di tutte, perche ogni singola guardia continuava a
    funzionare: il recinto era giusto, erano le assi a essere scrivibili da
    dentro.
  */
  console.log(
    `${NL}U-45 — il perimetro non si allarga da dentro   [CRITICAL: minori]`,
  );

  const perimetratoNord = {
    ...scopeDi(utenti.staff.id, CLUB_A, "staff"),
    accessScopes: [{ kind: "site", value: SEDE_A }],
  };

  await varco(
    "U-45 non si scrive un'appartenenza per un atleta fuori perimetro",
    () =>
      risorse.createResource(
        "athlete_category_memberships",
        {
          organization_id: CLUB_A,
          athlete_id: ATLETA_ALTRUI,
          category_id: CATEGORIA,
          category_name: "Under 15",
          site_id: SEDE_A,
          is_primary: false,
        },
        "create",
        perimetratoNord,
      ),
    ["negato", "ambiguo"],
  );

  await varco(
    "U-45 ne una che dichiara una sede diversa dalla propria",
    () =>
      risorse.createResource(
        "athlete_category_memberships",
        {
          organization_id: CLUB_A,
          athlete_id: ATLETA_A,
          category_id: CATEGORIA,
          category_name: "Under 15",
          site_id: SEDE_ALTRA,
          is_primary: false,
        },
        "create",
        perimetratoNord,
      ),
    ["negato", "ambiguo"],
  );

  const elencoDopoITentativi = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    perimetratoNord,
  );
  prova(
    "U-45 e il perimetro e ancora quello di prima",
    false,
    elencoDopoITentativi.records.map((r) => r.id).includes(ATLETA_ALTRUI),
    "se una delle due scritture fosse passata, l'atleta dell'altra sede comparirebbe qui",
  );

  /*
    Il controspecchio: chi **non** ha un perimetro continua a lavorare come
    prima. Una guardia che blocca anche chi non c'entra non e una guardia, e un
    guasto.
  */
  const senzaPerimetroScrive = await tenta(() =>
    risorse.createResource(
      "athlete_category_memberships",
      {
        organization_id: CLUB_A,
        athlete_id: ATLETA_ALTRUI,
        /* Una categoria diversa: la coppia (atleta, categoria) e unica. */
        category_id: "cat-uat6s-controprova",
        category_name: "Controprova",
        site_id: SEDE_ALTRA,
        is_primary: false,
      },
      "create",
      scopeRuolo("club_manager"),
    ),
  );
  prova(
    "U-45 e chi non ha perimetro continua a scrivere un'appartenenza",
    "riuscito",
    senzaPerimetroScrive.esito,
    senzaPerimetroScrive.messaggio
      ? senzaPerimetroScrive.messaggio.slice(0, 140)
      : "",
  );

  /* ================================================================== */
  /*  U-43 — la risposta di SCRITTURA e proiettata come la lettura       */
  /*         [CRITICAL: minori, salute]                                  */
  /* ================================================================== */

  /*
    `createResource`, `updateResource` e `deleteResource` chiamavano
    `serializeRecord(resource, record)` **senza scope**, e la proiezione esce
    subito quando lo scope manca. Un `PATCH` che cambia il solo cognome
    restituiva allergie, esito della visita, PDF del certificato e gettone
    della famiglia — cioe tutto cio che la `GET` dello stesso ruolo nega.

    Annullava tre scenari di questa sonda insieme (U-34, U-40, U-41), ed e la
    quarta ricorrenza della stessa forma: la difesa messa su una porta e non
    sull'altra.
  */
  console.log(
    `${NL}U-43 — la risposta di scrittura e proiettata   [CRITICAL: salute]`,
  );

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: {
      data: {
        allergies: "Arachidi",
        medicalVisits: [{ title: "Visita", outcome: "da rivalutare" }],
        phone: "3330000000",
        guardians: [
          {
            name: "Tutore Alfa",
            phone: "3331111111",
            parentAccessTokenValue: "GETTONE-IN-CHIARO-DA-NON-VEDERE",
          },
        ],
      },
    },
  });

  const scritturaCon = async (ruolo) => {
    const scope = ruolo.includes(":")
      ? scopeDi(utenti.club_manager.id, CLUB_A, ruolo)
      : scopeRuolo(ruolo);

    const risposta = await risorse.updateResource(
      "athletes",
      ATLETA_A,
      { last_name: `Scritto-${Date.now()}` },
      scope,
    );

    const testo = JSON.stringify(risposta?.data ?? {});
    return {
      allergie: testo.includes("Arachidi"),
      esito: testo.includes("da rivalutare"),
      gettone: testo.includes("GETTONE-IN-CHIARO-DA-NON-VEDERE"),
    };
  };

  prova(
    "U-43 la scrittura di un ruolo senza `clinical.read` non restituisce il clinico",
    { allergie: false, esito: false, gettone: false },
    await scritturaCon("custom:club_manager:senza-clinico#members.register.read"),
  );
  prova(
    "U-43 ne il collaboratore riceve la credenziale della famiglia",
    { allergie: true, esito: true, gettone: false },
    await scritturaCon("collaborator"),
    "il collaboratore ha `clinical.read`, quindi il clinico gli arriva: a non arrivargli e la credenziale",
  );
  prova(
    "U-43 e l'allenatore non riceve niente di clinico nemmeno scrivendo",
    { allergie: false, esito: false, gettone: false },
    await scritturaCon("trainer"),
  );

  /* ================================================================== */
  /*  U-44 — un atleta senza contributi si cancella   [integrita]        */
  /* ================================================================== */

  /*
    La guardia sulle liquidazioni interrogava `accrual.athlete_id`, colonna che
    **non esiste**: `FundingAccrual` ha `enrollment_id`, ed e
    `FundingEnrollment` a portare l'atleta. Prisma rispondeva con un errore di
    validazione invece che con un conteggio, quindi **nessun atleta era
    cancellabile**, da nessun ruolo, nemmeno uno senza un solo contributo.

    I tre test che la presidiavano passavano, perche il doppio di Prisma
    riceveva righe scritte a mano nella forma che il codice si aspettava: il
    presidio modellava l'assunzione sbagliata invece dello schema.
  */
  console.log(`${NL}U-44 — la cancellazione di un atleta   [integrita]`);

  const usaEGetta = await prisma.athlete.create({
    data: {
      organization_id: CLUB_A,
      first_name: "UsaE",
      last_name: "Getta",
      status: "active",
      data: {},
      updated_at: new Date(),
    },
  });

  const cancellazione = await tenta(() =>
    risorse.deleteResource("athletes", usaEGetta.id, scopeRuolo("club_manager")),
  );
  const restaInArchivio = await prisma.athlete.findUnique({
    where: { id: usaEGetta.id },
    select: { id: true },
  });

  prova(
    "U-44 un atleta senza contributi e senza documenti si cancella",
    { esito: "riuscito", restaInArchivio: false },
    { esito: cancellazione.esito, restaInArchivio: Boolean(restaInArchivio) },
    cancellazione.messaggio ? cancellazione.messaggio.slice(0, 140) : "",
  );

  if (restaInArchivio) {
    await prisma.athlete.delete({ where: { id: usaEGetta.id } }).catch(() => {});
  }

  /* ================================================================== */
  /*  U-42 — la seconda porta sulle risorse riservate  [CRITICAL: tenant] */
  /* ================================================================== */

  /*
    `access_tokens`, `bank_accounts`, `document_templates` e `payment_methods`
    hanno una rotta propria, riservata alla direzione. Ma le loro righe **sono**
    `club_resource_items`, che e aperta alla gestione: la protezione era sul
    **cartello**, non sulla porta.

    Misurato prima della correzione: un collaboratore forgiava un gettone di
    accesso con `payload.role: "owner"`, lo riscattava, e si tesserava
    proprietario **senza lasciare una riga di audit**. Dalla stessa porta
    uscivano in lettura i gettoni in chiaro di ogni famiglia e gli IBAN dei
    conti correnti.
  */
  console.log(
    `${NL}U-42 — la seconda porta sulle risorse riservate   [CRITICAL: tenant]`,
  );

  const RISERVATE = [
    "access_tokens",
    "bank_accounts",
    "document_templates",
    "payment_methods",
  ];

  for (const ruolo of ["collaborator", "staff", "trainer"]) {
    const suo = scopeRuolo(ruolo);

    for (const tipo of RISERVATE) {
      await varco(
        `U-42 ${ruolo} non legge ${tipo} dal registro generico`,
        () =>
          risorse.listResourcePage(
            "club_resource_items",
            new URLSearchParams({
              organization_id: CLUB_A,
              resource_type: tipo,
            }),
            suo,
          ),
        ["negato", "ambiguo"],
      );
    }

    await varco(
      `U-42 ${ruolo} non forgia un gettone di accesso dal registro generico`,
      () =>
        risorse.createResource(
          "club_resource_items",
          {
            organization_id: CLUB_A,
            resource_type: "access_tokens",
            name: `FORGIATO-${ruolo}`,
            payload: { role: "owner", one_time: false },
          },
          "create",
          suo,
        ),
      ["negato", "ambiguo"],
    );
  }

  /*
    Il controspecchio: la direzione continua a passare dalla **propria** rotta,
    che e il posto in cui la matrice riservata sa dire di si.
  */
  const dallaSuaRotta = await tenta(() =>
    risorse.listResourcePage(
      "access_tokens",
      new URLSearchParams({ organization_id: CLUB_A }),
      scopeRuolo("club_manager"),
    ),
  );
  prova(
    "U-42 e la direzione continua a leggerli dalla loro rotta",
    true,
    dallaSuaRotta.esito !== "negato" && dallaSuaRotta.esito !== "errore",
    `esito=${dallaSuaRotta.esito}`,
  );

  /* ================================================================== */
  /*  U-40 — la credenziale della famiglia    [CRITICAL: minori, salute]  */
  /* ================================================================== */

  /*
    `athletes.data.guardians[]` porta il valore **in chiaro** del gettone con
    cui un tutore si collega. Non e clinico, quindi nessuno dei tagli lo
    toccava, e `POST /api/v1/auth/access/redeem` lega chi lo presenta **come
    tutore**: chi lo raccoglie ottiene per legame il fascicolo clinico
    completo, cioe esattamente cio che il taglio gli nega. Una difesa aggirata
    non da un buco, ma dalla porta accanto.
  */
  console.log(`${NL}U-40 — la credenziale della famiglia   [CRITICAL: minori]`);

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: {
      data: {
        allergies: "Arachidi",
        bloodType: "0+",
        medications: "Salbutamolo",
        phone: "3330000000",
        guardians: [
          {
            name: "Tutore Alfa",
            phone: "3331111111",
            email: "tutore@example.invalid",
            parentAccessTokenValue: "GETTONE-IN-CHIARO-DA-NON-VEDERE",
          },
        ],
      },
    },
  });

  const gettoneVisibileA = async (ruolo) => {
    const scope = ruolo.includes(":")
      ? scopeDi(utenti.club_manager.id, CLUB_A, ruolo)
      : scopeRuolo(ruolo);
    const righe = await risorse.listResource(
      "athletes",
      new URLSearchParams({ organization_id: CLUB_A, id: ATLETA_A }),
      scope,
    );
    const testo = JSON.stringify(righe[0]?.data || {});
    return {
      righe: righe.length,
      gettone: testo.includes("GETTONE-IN-CHIARO-DA-NON-VEDERE"),
      recapito: testo.includes("3331111111"),
    };
  };

  prova(
    "U-40 l'allenatore non riceve il gettone della famiglia",
    { righe: 1, gettone: false, recapito: true },
    await gettoneVisibileA("trainer"),
    "il recapito resta: chi allena deve poter chiamare una famiglia, ed e per quello che i tutori non sono clinici",
  );
  prova(
    "U-40 e nemmeno il collaboratore, che pure ha `clinical.read`",
    { righe: 1, gettone: false, recapito: true },
    await gettoneVisibileA("collaborator"),
    "la credenziale non e un dato clinico: a proteggerla e la matrice di `access_tokens`, non il taglio sanitario",
  );
  prova(
    "U-40 ne un ruolo personalizzato con una chiave sola",
    { righe: 1, gettone: false, recapito: true },
    await gettoneVisibileA("custom:club_manager:segreteria#members.register.read"),
  );
  prova(
    "U-40 la direzione, che puo leggere i gettoni, continua a vederlo",
    { righe: 1, gettone: true, recapito: true },
    await gettoneVisibileA("club_manager"),
    "senza questo controspecchio una proiezione che azzera tutto passerebbe per una difesa",
  );

  /* ================================================================== */
  /*  U-41 — svuotare cio che non si e potuto leggere  [CRITICAL: salute] */
  /* ================================================================== */

  /*
    La schermata rimanda **sempre** tutte le raccolte, e quelle che chi salva
    non ha potuto leggere arrivano come `[]` o `{}`. Un vuoto non e
    un'assenza: la prima stesura della regola conservava solo le chiavi
    mancanti, e il salvataggio azzerava lo stesso.
  */
  console.log(
    `${NL}U-41 — svuotare cio che non si e potuto leggere   [CRITICAL: salute]`,
  );

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: {
      data: {
        allergies: "Arachidi",
        medicalVisits: [{ title: "Visita", outcome: "da rivalutare" }],
        certificateFiles: { blsd: "data:application/pdf;base64,AAAA" },
        phone: "3330000000",
      },
    },
  });

  const senzaLettura = scopeDi(
    utenti.club_manager.id,
    CLUB_A,
    "custom:club_manager:gestore-senza-clinico#clinical.manage,members.register.read",
  );

  await risorse.updateResource(
    "athletes",
    ATLETA_A,
    {
      last_name: "Corretto",
      data: {
        allergies: "",
        medicalVisits: [],
        certificateFiles: {},
        phone: "3330000000",
      },
    },
    senzaLettura,
  );

  const dopoSalvataggio = await prisma.athlete.findUnique({
    where: { id: ATLETA_A },
    select: { last_name: true, data: true },
  });
  const dati = dopoSalvataggio?.data || {};

  prova(
    "U-41 chi non puo leggere il clinico non lo cancella salvando",
    { visite: 1, certificati: 1, allergie: "Arachidi" },
    {
      visite: Array.isArray(dati.medicalVisits) ? dati.medicalVisits.length : 0,
      certificati: Object.keys(dati.certificateFiles || {}).length,
      allergie: dati.allergies ?? null,
    },
  );
  prova(
    "U-41 e la correzione che voleva fare passa comunque",
    "Corretto",
    dopoSalvataggio?.last_name ?? null,
    "una difesa che impedisce di correggere un cognome e un comando che non fa cio che dice",
  );

  console.log(`${NL}U-39 — il perimetro esercitato, non letto   [CRITICAL: minori]`);

  const perimetrato = {
    ...scopeDi(utenti.staff.id, CLUB_A, "club_manager"),
    accessScopes: [{ kind: "site", value: SEDE_A }],
  };
  const senzaPerimetro = scopeDi(utenti.staff.id, CLUB_A, "club_manager");

  const elencoPerimetrato = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    perimetrato,
  );
  const idPerimetrati = (elencoPerimetrato.records || []).map((r) => r.id);
  prova(
    "U-39 l'elenco non porta l'atleta dell'altra sede",
    [true, false],
    [idPerimetrati.includes(ATLETA_A), idPerimetrati.includes(ATLETA_ALTRUI)],
    `atleti visti=${idPerimetrati.length}`,
  );

  const elencoIntero = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    senzaPerimetro,
  );
  prova(
    "U-39 e senza perimetro li porta entrambi: a restringere e il perimetro",
    true,
    (elencoIntero.records || []).map((r) => r.id).includes(ATLETA_ALTRUI),
  );

  await varco(
    "U-39 per identificativo, l'atleta fuori perimetro e negato",
    () => risorse.getResourceById("athletes", ATLETA_ALTRUI, perimetrato),
    ["inesistente", "ambiguo", "negato"],
  );
  await varco(
    "U-39 e non si modifica",
    () =>
      risorse.updateResource(
        "athletes",
        ATLETA_ALTRUI,
        { first_name: "Cambiato" },
        perimetrato,
      ),
    ["inesistente", "ambiguo", "negato"],
  );

  const dopoTentativo = await prisma.athlete.findUnique({
    where: { id: ATLETA_ALTRUI },
    select: { first_name: true },
  });
  prova(
    "U-39 e nulla e stato scritto",
    "Minore",
    dopoTentativo?.first_name ?? null,
  );

  /*
    **La quarta porta.** Le tre sopra erano quelle che la prima stesura di U-39
    esercitava, e una quarta revisione ha misurato che ne restava una: il ramo
    `upsert`, che non crea — aggiorna per chiave, e la chiave la sceglie chi
    chiama. Passava.
  */
  await varco(
    "U-39 e non si scrive nemmeno per upsert, che aggiorna per chiave",
    () =>
      risorse.createResource(
        "athletes",
        {
          id: ATLETA_ALTRUI,
          organization_id: CLUB_A,
          first_name: "ViaUpsert",
        },
        "upsert",
        perimetrato,
      ),
    ["inesistente", "ambiguo", "negato"],
  );

  const dopoUpsert = await prisma.athlete.findUnique({
    where: { id: ATLETA_ALTRUI },
    select: { first_name: true },
  });
  prova(
    "U-39 e la riga e ancora quella di prima",
    "Minore",
    dopoUpsert?.first_name ?? null,
  );

  const dentro = await risorse.getResourceById("athletes", ATLETA_A, perimetrato);
  prova(
    "U-39 e il proprio atleta si legge ancora: il perimetro restringe, non blocca",
    ATLETA_A,
    dentro?.id ?? null,
  );

  /*
    Il fascicolo: e la superficie dove il perimetro era **sconfitto**, perche
    ogni riga della coda porta nome e cognome di un minore.
  */
  const fascicoloPerimetrato = await documenti.getDocumentDossier(perimetrato, {});
  prova(
    "U-39 il fascicolo non porta le richieste dell'altra sede",
    true,
    (fascicoloPerimetrato || []).every((riga) => riga.subjectId !== ATLETA_ALTRUI),
    `righe=${(fascicoloPerimetrato || []).length}`,
  );

  /*
    L'errore piu facile da commettere qui: confondere «nessun perimetro» con
    «perimetro che non contiene nessuno». Il secondo non deve aprire il club.
  */
  const perimetroVuoto = await documenti.getDocumentDossier(
    {
      ...perimetrato,
      accessScopes: [{ kind: "site", value: "sede-che-non-esiste" }],
    },
    {},
  );
  prova(
    "U-39 un perimetro che non contiene nessuno non apre tutto il club",
    0,
    (perimetroVuoto || []).length,
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

const u49 = async () => {
  /* ================================================================== */
  /*  U-49 — l'export che consegnava anche gli altri   [HIGH: privacy]   */
  /* ================================================================== */

  /*
    Chi esercita il proprio diritto riceve **i propri** dati. L'export ne
    portava due che non erano suoi.

    Il primo: una compilazione che nomina piu persone — un modulo di iscrizione
    con due fratelli, o un genitore e un figlio — usciva **intera**, con le
    `answers` e gli allegati riferiti anche all'altra famiglia. Il dominio la
    sapeva gia riconoscere: `readFormSubmissionsForSubject` la teneva separata
    per decidere che **non si puo cancellare**, e poi l'export le rimetteva
    insieme.

    Il secondo: `communication_deliveries.athlete_ids` e l'elenco di tutti i
    destinatari di quel messaggio. Usciva intero, e diceva a una famiglia chi
    altro e iscritto.
  */
  console.log(
    `${NL}U-49 — l'export che consegnava anche gli altri   [HIGH: privacy]`,
  );

  const modello = await prisma.formTemplate.findFirst({
    where: { organization_id: CLUB_A },
    select: { id: true },
  });
  const versione = modello
    ? await prisma.formTemplateVersion.findFirst({
        where: { template_id: modello.id },
        select: { id: true },
      })
    : null;

  prova(
    "U-49 c'e un modulo su cui costruire la compilazione condivisa",
    { modello: true, versione: true },
    { modello: Boolean(modello), versione: Boolean(versione) },
    "senza il modulo seminato la prova non misurerebbe niente",
  );

  if (!modello || !versione) return;

  const condivisa = await prisma.formSubmission.create({
    data: {
      organization_id: CLUB_A,
      template_id: modello.id,
      version_id: versione.id,
      kind: "enrollment",
      status: "pending",
      subjects: [
        { kind: "athlete", recordId: ATLETA_A, label: "Il mio" },
        { kind: "athlete", recordId: ATLETA_ALTRUI, label: "Di un altro" },
      ],
      answers: {
        note: "RISPOSTA-DELL-ALTRA-FAMIGLIA",
        iban_altrui: "IT60X0542811101000000999999",
      },
      files: [],
      respondent_name: "GENITORE-DELL-ALTRO",
      respondent_email: "altro@example.invalid",
    },
  });

  const consegna = await prisma.communicationDelivery.create({
    data: {
      organization_id: CLUB_A,
      source_kind: "bulk",
      source_id: randomUUID(),
      dedup_key: `sonda-u49-${randomUUID()}`,
      recipient_key: "u49@example.invalid",
      athlete_ids: [ATLETA_A, ATLETA_ALTRUI],
      channel: "email",
      status: "sent",
    },
  });

  const esportato = await datiPersonali.exportDataSubject(
    scopeRuolo("club_manager"),
    { organizationId: CLUB_A, subjectId: ATLETA_A },
  );
  const testo = JSON.stringify(esportato);

  prova(
    "U-49 l'export non porta le risposte di una compilazione condivisa",
    {
      risposteAltrui: false,
      ibanAltrui: false,
      compilanteAltrui: false,
      citata: true,
    },
    {
      risposteAltrui: testo.includes("RISPOSTA-DELL-ALTRA-FAMIGLIA"),
      ibanAltrui: testo.includes("IT60X0542811101000000999999"),
      compilanteAltrui: testo.includes("GENITORE-DELL-ALTRO"),
      citata: testo.includes(condivisa.id),
    },
    "la traccia della compilazione deve restare: e il contenuto altrui che non esce",
  );

  const consegneEsportate = (
    esportato?.sections?.communication_deliveries || []
  ).filter((riga) => riga?.id === consegna.id);

  prova(
    "U-49 una consegna non porta con se l'elenco degli altri destinatari",
    { trovata: 1, destinatari: [ATLETA_A] },
    {
      trovata: consegneEsportate.length,
      destinatari: consegneEsportate[0]?.athlete_ids ?? null,
    },
  );

  prova(
    "U-49 l'altro atleta non compare da nessuna parte nell'export",
    false,
    testo.includes(ATLETA_ALTRUI),
    "controspecchio: senza questo, una proiezione che togliesse tutto passerebbe",
  );

  await prisma.formSubmission.delete({ where: { id: condivisa.id } });
  await prisma.communicationDelivery.delete({ where: { id: consegna.id } });
};

const u50 = async () => {
  /* ================================================================== */
  /*  U-50 — la provenienza dichiarata dal client   [HIGH: integrita]    */
  /* ================================================================== */

  /*
    `source` di un deposito decide due cose vere: se nasce un lavoro nella coda
    di chi deve controllare il documento, e cosa la famiglia legge nel proprio
    fascicolo. Arrivava dal corpo della richiesta —
    `/api/v1/document-submissions` lo inoltrava tal quale — e un genitore che
    scriveva `source=club` otteneva un documento registrato come condiviso
    **dal club**: nessuna riga nella coda della segreteria, una notifica che
    diceva alla famiglia che era stato il club a mandarlo, e un registro che
    attribuiva il deposito a chi non lo aveva fatto.

    Adesso la provenienza si ricava dal ruolo attivo, che il client non scrive.
  */
  console.log(
    `${NL}U-50 — la provenienza dichiarata dal client   [HIGH: integrita]`,
  );

  const scopeFamiglia = await documenti.resolveLinkedFamilyScope(
    utenti.parent.id,
    ATLETA_A,
  );

  const deposito = await documenti.submitDocument(scopeFamiglia, {
    subjectKind: "athlete",
    subjectId: ATLETA_A,
    documentKind: "other",
    /* la bugia: e la famiglia a caricare, e dichiara di essere il club */
    source: "club",
    file: {
      fileName: "provenienza.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 U-50"),
    },
  });

  const idDeposito = deposito.submissions?.[0]?.id || deposito.id;
  const riga = await prisma.documentSubmission.findUnique({
    where: { id: idDeposito },
    select: { id: true, source: true, attachment_id: true },
  });

  prova(
    "U-50 il deposito della famiglia resta della famiglia, anche se dichiara il club",
    "parent",
    riga?.source ?? null,
  );

  const depositoClub = await documenti.submitDocument(
    scopeRuolo("club_manager"),
    {
      subjectKind: "athlete",
      subjectId: ATLETA_A,
      documentKind: "other",
      /* la bugia opposta: e il club, e dichiara la famiglia */
      source: "parent",
      file: {
        fileName: "provenienza-club.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("%PDF-1.4 U-50 bis"),
      },
    },
  );
  const idClub = depositoClub.submissions?.[0]?.id || depositoClub.id;
  const rigaClub = await prisma.documentSubmission.findUnique({
    where: { id: idClub },
    select: { id: true, source: true, attachment_id: true },
  });

  prova(
    "U-50 e il deposito del club resta del club, anche se dichiara la famiglia",
    "club",
    rigaClub?.source ?? null,
    "controspecchio: una regola che scrivesse sempre `parent` passerebbe la meta della prova",
  );

  for (const r of [riga, rigaClub]) {
    if (!r) continue;
    await prisma.documentSubmission.delete({ where: { id: r.id } }).catch(() => {});
    if (r.attachment_id) {
      await prisma.attachment
        .delete({ where: { id: r.attachment_id } })
        .catch(() => {});
    }
  }
};

const u51 = async () => {
  /* ================================================================== */
  /*  U-51 — il codice della famiglia: il quarto nome, e il salvataggio  */
  /*         che lo cancellava            [HIGH: accesso della famiglia] */
  /* ================================================================== */

  /*
    Due difetti sullo stesso valore, e sono l'uno il rovescio dell'altro.

    Il taglio in lettura entrava in tre contenitori cablati — `guardians`,
    `tutori`, `parents`. Il repository ne usa un quarto, `tutors`, e il gettone
    scritto li usciva intero. Enumerare le porte, di nuovo.

    Il ripristino in scrittura non c'era affatto: la scheda letta **senza** il
    gettone e rimandata indietro lo cancellava. La colonna `data` si salva
    intera, quindi ogni salvataggio di un collaboratore revocava alla famiglia
    il codice con cui entra — senza un errore, senza una riga, e la famiglia lo
    scopriva al primo accesso.

    E la stessa regola gia scritta per il dato clinico: **un'assenza non e una
    cancellazione**.
  */
  console.log(
    `${NL}U-51 — il codice della famiglia: il quarto nome, e il salvataggio che lo cancellava   [HIGH]`,
  );

  const primaData = {
    tutors: [
      {
        id: "tutore-1",
        firstName: "Anna",
        parentAccessTokenValue: "GETTONE-SOTTO-TUTORS",
      },
    ],
    guardians: [
      {
        id: "tutore-2",
        firstName: "Bruno",
        parentAccessTokenValue: "GETTONE-SOTTO-GUARDIANS",
      },
    ],
  };

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { data: primaData },
  });

  const lettoDaCollaboratore = await risorse.getResourceById(
    "athletes",
    ATLETA_A,
    scopeRuolo("collaborator"),
  );
  const testoCollaboratore = JSON.stringify(lettoDaCollaboratore);

  prova(
    "U-51 il gettone non esce da nessuno dei due contenitori",
    { sottoTutors: false, sottoGuardians: false, tutoriRestano: true },
    {
      sottoTutors: testoCollaboratore.includes("GETTONE-SOTTO-TUTORS"),
      sottoGuardians: testoCollaboratore.includes("GETTONE-SOTTO-GUARDIANS"),
      tutoriRestano:
        testoCollaboratore.includes("Anna") &&
        testoCollaboratore.includes("Bruno"),
    },
    "i tutori devono restare visibili: e la credenziale che sparisce, non la persona",
  );

  /*
    Il salvataggio ordinario: si rimanda indietro **esattamente cio che si e
    letto**, che e quello che fa una schermata.
  */
  await risorse.updateResource(
    "athletes",
    ATLETA_A,
    { data: lettoDaCollaboratore?.data ?? {} },
    scopeRuolo("collaborator"),
  );

  const dopoIlSalvataggio = await prisma.athlete.findUnique({
    where: { id: ATLETA_A },
    select: { data: true },
  });
  const testoArchivio = JSON.stringify(dopoIlSalvataggio?.data ?? {});

  prova(
    "U-51 e un salvataggio ordinario non revoca l'accesso alla famiglia",
    { sottoTutors: true, sottoGuardians: true },
    {
      sottoTutors: testoArchivio.includes("GETTONE-SOTTO-TUTORS"),
      sottoGuardians: testoArchivio.includes("GETTONE-SOTTO-GUARDIANS"),
    },
  );

  const lettoDallaDirezione = await risorse.getResourceById(
    "athletes",
    ATLETA_A,
    scopeRuolo("club_manager"),
  );
  const testoDirezione = JSON.stringify(lettoDallaDirezione);

  prova(
    "U-51 la direzione continua a vedere il codice: il taglio restringe, non azzera",
    { sottoTutors: true, sottoGuardians: true },
    {
      sottoTutors: testoDirezione.includes("GETTONE-SOTTO-TUTORS"),
      sottoGuardians: testoDirezione.includes("GETTONE-SOTTO-GUARDIANS"),
    },
    "controspecchio: senza, una proiezione che cancellasse tutto passerebbe per una difesa",
  );

  /*
    E il rovescio del ripristino: chi **puo** vedere il gettone lo deve poter
    togliere davvero, altrimenti la regola avrebbe reso un codice non piu
    revocabile.
  */
  await risorse.updateResource(
    "athletes",
    ATLETA_A,
    {
      data: {
        tutors: [{ id: "tutore-1", firstName: "Anna" }],
        guardians: [{ id: "tutore-2", firstName: "Bruno" }],
      },
    },
    scopeRuolo("owner"),
  );

  const dopoLaRevoca = await prisma.athlete.findUnique({
    where: { id: ATLETA_A },
    select: { data: true },
  });

  prova(
    "U-51 e chi lo vede lo puo revocare",
    false,
    JSON.stringify(dopoLaRevoca?.data ?? {}).includes("GETTONE-SOTTO-"),
  );

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { data: {} },
  });
};

const u52 = async () => {
  /* ================================================================== */
  /*  U-52 — il riscatto: nessuna riga, nessun contatore                 */
  /*         [HIGH: accesso al club]                                     */
  /* ================================================================== */

  /*
    Riscattare un gettone **fa entrare una persona in un club**, con il ruolo
    che il gettone porta scritto nel proprio payload. Era l'unico atto di
    questa portata che non lasciava niente:

      * `AUDIT_ACTIONS.accessTokenRedeemed` esisteva in `audit.ts` — dichiarata
        nella Wave 4 e **mai scritta da nessuno**. Una costante non e un
        presidio;
      * nessun contatore. Il codice e corto e si scrive a mano; la sessione
        richiesta non e una difesa, perche le utenze si creano. Chi provava
        mille codici non incontrava nessun limite e non lasciava nessuna
        traccia — cioe la forma esatta di un attacco a forza bruta invisibile.
  */
  console.log(
    `${NL}U-52 — il riscatto: nessuna riga, nessun contatore   [HIGH: accesso al club]`,
  );

  await prisma.authRateLimitBucket.deleteMany({
    where: { scope: "access_token_redeem" },
  });

  const righeRiscatto = (outcome) =>
    prisma.auditLog.count({
      where: { action: "membership.access_token.redeemed", outcome },
    });

  await comeUtente(utenti.athlete, CLUB_A);

  const primaNegati = await righeRiscatto("denied");
  const aVuoto = await rotte.riscatto.POST(
    richiesta("/api/v1/auth/access/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "CODICE-CHE-NON-ESISTE" }),
    }),
  );

  prova(
    "U-52 un gettone inesistente e respinto e lascia una riga",
    { stato: 404, tracciato: true },
    {
      stato: aVuoto.status,
      tracciato: (await righeRiscatto("denied")) > primaNegati,
    },
    "senza la riga, mille tentativi a vuoto sono indistinguibili da zero",
  );

  /*
    Un gettone vero. La **firma** del coniatore c e, ed e la forma che il conio
    di oggi produce: senza, un ruolo che amministra il club non si concede piu —
    lo prova `U-53`, e qui si misura il riscatto riuscito, non il soffitto.
  */
  const gettone = await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_A,
      resource_type: "access_tokens",
      name: "SONDAU52RISCATTO",
      status: "active",
      payload: {
        role: "collaborator",
        one_time: true,
        minted_by_role: "owner",
      },
    },
  });

  const primaRiusciti = await righeRiscatto("success");
  const riuscito = await rotte.riscatto.POST(
    richiesta("/api/v1/auth/access/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "SONDAU52RISCATTO" }),
    }),
  );

  const rigaRiuscita = await prisma.auditLog.findFirst({
    where: {
      action: "membership.access_token.redeemed",
      outcome: "success",
      resource_id: gettone.id,
    },
    orderBy: { created_at: "desc" },
  });

  prova(
    "U-52 il riscatto riuscito lascia la riga, con il club e il ruolo concesso",
    {
      stato: 200,
      contate: true,
      club: CLUB_A,
      ruoloConcesso: "collaborator",
      attore: null,
    },
    {
      stato: riuscito.status,
      contate: (await righeRiscatto("success")) > primaRiusciti,
      club: rigaRiuscita?.organization_id ?? null,
      ruoloConcesso: rigaRiuscita?.metadata?.ruolo_concesso ?? null,
      /*
        Il ruolo **concesso** non e l identita di chi agisce: scriverlo in
        `actor_role` faceva dire alla riga di un gestore che si promuoveva
        «owner», cioe nascondeva il fatto per cui la riga esiste.
      */
      attore: rigaRiuscita?.actor_role ?? null,
    },
  );

  prova(
    "U-52 e il valore del gettone non finisce nel registro",
    false,
    JSON.stringify(rigaRiuscita ?? {}).includes("SONDAU52RISCATTO"),
    "il registro si rilegge: una credenziale scritta dentro sarebbe una credenziale conservata",
  );

  /*
    Il contatore. Il limite per utenza e dieci all'ora: si martella finche non
    risponde 429, e si pretende che arrivi **prima** di venti tentativi.
  */
  let stato429 = null;
  for (let tentativo = 0; tentativo < 20 && stato429 === null; tentativo += 1) {
    const risposta = await rotte.riscatto.POST(
      richiesta("/api/v1/auth/access/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: `TENTATIVO-${tentativo}` }),
      }),
    );
    if (risposta.status === 429) stato429 = tentativo + 1;
  }

  prova(
    "U-52 e provare codici a raffica si ferma da solo",
    true,
    stato429 !== null && stato429 <= 20,
    `fermato al tentativo ${stato429 ?? "mai"}`,
  );

  await prisma.organizationUser.deleteMany({
    where: {
      organization_id: CLUB_A,
      user_id: utenti.athlete.id,
      role: "collaborator",
    },
  });
  await prisma.clubResourceItem.delete({ where: { id: gettone.id } }).catch(() => {});
  await prisma.authRateLimitBucket.deleteMany({
    where: { scope: "access_token_redeem" },
  });
  SESSIONE = null;
  CLUB_ATTIVO = null;
};

const u53 = async () => {
  /* ================================================================== */
  /*  U-53 — il gettone d'accesso: soffitto, confine, stato              */
  /*         [CRITICAL: consegna del club]                               */
  /* ================================================================== */

  /*
    Il riscatto e il **quinto** scrittore di `organization_users`, e l'unico
    che non conosceva nessuna delle guardie messe sugli altri quattro. Tre
    scalate misurate su di lui:

      * un gestore a cui `POST /api/v1/organization_users {role:"owner"}`
        risponde «l'accesso a un club non si concede da soli» coniava un
        gettone `payload.role: "owner"`, lo riscattava, e diventava
        proprietario;
      * `trainer_id` viene dal gettone e la scheda si caricava **senza scope**:
        si scriveva nella scheda di un **altro club**, negando per sempre
        l'onboarding del suo allenatore e sovrascrivendone il codice;
      * lo stato guardato era solo `redeemed`: un gettone **revocato** —
        cioe «Scollega account» — restava riscattabile.
  */
  console.log(
    `${NL}U-53 — il gettone d'accesso: soffitto, confine, stato   [CRITICAL]`,
  );

  const conia = async (dati, ruoloAttore = "club_manager") =>
    risorse.createResource(
      "access_tokens",
      { organization_id: CLUB_A, ...dati },
      "create",
      scopeRuolo(ruoloAttore),
    );

  /* --- il soffitto al conio --- */
  await varco(
    "U-53 un gestore non conia un gettone che consegna il club",
    () =>
      conia({
        name: "U53-OWNER",
        status: "active",
        role: "owner",
        one_time: false,
      }),
    ["negato"],
  );

  const gettoneLecito = await conia({
    name: "U53-COLLABORATORE",
    status: "active",
    role: "collaborator",
  });

  prova(
    "U-53 e un gettone lecito si conia, con la firma di chi lo ha coniato",
    { coniato: true, firma: "club_manager", firmaDelClient: undefined },
    {
      coniato: Boolean(gettoneLecito?.id),
      firma: gettoneLecito?.minted_by_role ?? null,
      /* la firma non la scrive il client: se ci prova, viene tolta */
      firmaDelClient: (
        await conia({
          name: "U53-FIRMA-FALSA",
          status: "active",
          role: "collaborator",
          minted_by_role: "owner",
        })
      )?.minted_by_role === "owner"
        ? "accettata dal client"
        : undefined,
    },
  );

  /* --- il soffitto al riscatto, per i gettoni storici senza firma --- */
  const storicoOwner = await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_A,
      resource_type: "access_tokens",
      name: "U53STORICOOWNER",
      status: "active",
      /* nessuna firma: e la forma di ogni gettone coniato prima di oggi */
      payload: { role: "owner", one_time: false },
    },
  });

  await comeUtente(utenti.athlete, CLUB_A);

  const riscatta = (token) =>
    rotte.riscatto.POST(
      richiesta("/api/v1/auth/access/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );

  const suOwner = await riscatta("U53STORICOOWNER");
  prova(
    "U-53 un gettone storico che consegna il club non si riscatta",
    { stato: 403, tesseraOwner: 0 },
    {
      stato: suOwner.status,
      tesseraOwner: await prisma.organizationUser.count({
        where: {
          organization_id: CLUB_A,
          user_id: utenti.athlete.id,
          role: "owner",
        },
      }),
    },
  );

  /* --- lo stato della riga --- */
  const revocato = await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_A,
      resource_type: "access_tokens",
      name: "U53REVOCATO",
      status: "revoked",
      payload: {
        role: "member",
        /* la scadenza dice ancora che e valido: e cio che guardava prima */
        expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
      },
    },
  });

  const suRevocato = await riscatta("U53REVOCATO");
  prova(
    "U-53 un gettone revocato non si riscatta, anche se non e scaduto",
    { stato: 410, tessera: 0 },
    {
      stato: suRevocato.status,
      tessera: await prisma.organizationUser.count({
        where: {
          organization_id: CLUB_A,
          user_id: utenti.athlete.id,
          role: "member",
        },
      }),
    },
    "«Scollega account» scrive `revoked` e non tocca la scadenza: senza questo, scollegare non scollegava",
  );

  /* --- il confine di club sulla scheda che il gettone nomina --- */
  const schedaAltrui = await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_B,
      resource_type: "trainers",
      name: "Allenatore del club B",
      status: "active",
      payload: { first_name: "Bruno", last_name: "Altrui" },
    },
  });

  const gettoneOltreConfine = await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_A,
      resource_type: "access_tokens",
      name: "U53OLTRECONFINE",
      status: "active",
      payload: { role: "trainer", trainer_id: schedaAltrui.id },
    },
  });

  const suAltrui = await riscatta("U53OLTRECONFINE");
  const schedaDopo = await prisma.clubResourceItem.findUnique({
    where: { id: schedaAltrui.id },
    select: { payload: true },
  });

  prova(
    "U-53 il gettone non raggiunge la scheda di un altro club",
    { stato: 404, scritta: false },
    {
      stato: suAltrui.status,
      scritta: JSON.stringify(schedaDopo?.payload ?? {}).includes(
        utenti.athlete.id,
      ),
    },
    "prima: 200, e da quel momento il vero allenatore del club B non poteva piu collegarsi",
  );

  /* --- lo slug personalizzato, che scriveva una riga incoerente --- */
  const gettoneSlug = await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_A,
      resource_type: "access_tokens",
      name: "U53SLUG",
      status: "active",
      payload: { role: "custom:club_manager:ristretto" },
    },
  });

  const suSlug = await riscatta("U53SLUG");
  prova(
    "U-53 un ruolo personalizzato non si concede con un gettone",
    { stato: 403, righeIncoerenti: 0 },
    {
      stato: suSlug.status,
      righeIncoerenti: await prisma.organizationUser.count({
        where: {
          organization_id: CLUB_A,
          user_id: utenti.athlete.id,
          role: "club_manager",
          custom_role_id: null,
        },
      }),
    },
    "scriveva il ruolo base con `custom_role_id: null`: la riga che ADR-0102 vieta",
  );

  /* --- e i dinieghi che tacevano --- */
  const dinieghiRiscatto = await prisma.auditLog.count({
    where: { action: "membership.access_token.redeemed", outcome: "denied" },
  });
  prova(
    "U-53 ognuno di questi tentativi ha lasciato la sua riga",
    true,
    dinieghiRiscatto >= 4,
    `righe di diniego sul riscatto: ${dinieghiRiscatto}`,
  );

  for (const riga of [storicoOwner, revocato, gettoneOltreConfine, gettoneSlug]) {
    await prisma.clubResourceItem.delete({ where: { id: riga.id } }).catch(() => {});
  }
  await prisma.clubResourceItem
    .deleteMany({ where: { organization_id: CLUB_B, resource_type: "trainers" } })
    .catch(() => {});
  await prisma.clubResourceItem
    .deleteMany({
      where: { organization_id: CLUB_A, resource_type: "access_tokens" },
    })
    .catch(() => {});
  SESSIONE = null;
  CLUB_ATTIVO = null;
};

const u54 = async () => {
  /* ================================================================== */
  /*  U-54 — l'upsert e una modifica   [CRITICAL: minori, salute]        */
  /* ================================================================== */

  /*
    `updateResource` sa che `athletes.user_id` non si scrive dal registro
    generico (ADR-0104) e che un contenitore clinico assente non e una
    cancellazione. `createResource` in modo `upsert` **aggiorna per chiave** —
    quindi modifica — e non incontrava nessuna delle due.

    Misurato: `PATCH` con `user_id` -> 403; lo stesso campo per `upsert` ->
    200, e `GET /api/v1/athlete-accounts/me`, che risolve la scheda **da quel
    campo** e non chiede ne ruolo ne tessera, consegnava a un estraneo l'area
    completa di un minore.
  */
  console.log(`${NL}U-54 — l'upsert e una modifica   [CRITICAL: minori, salute]`);

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: {
      user_id: null,
      data: { allergies: "ALLERGIA-U54", medicalNotes: "NOTA-U54" },
    },
  });

  const perUpsert = {
    id: ATLETA_A,
    organization_id: CLUB_A,
    first_name: "Minore",
    last_name: "Uno",
  };

  await varco(
    "U-54 l'upsert non collega la scheda di un minore a un'utenza",
    () =>
      risorse.createResource(
        "athletes",
        { ...perUpsert, user_id: utenti.staff.id },
        "upsert",
        scopeRuolo("staff"),
      ),
    ["negato"],
  );

  const dopoIlLegame = await prisma.athlete.findUnique({
    where: { id: ATLETA_A },
    select: { user_id: true, data: true },
  });

  prova(
    "U-54 e nessun legame e stato scritto",
    null,
    dopoIlLegame?.user_id ?? null,
  );

  await risorse.createResource(
    "athletes",
    { ...perUpsert, data: { note: "solo questa" } },
    "upsert",
    scopeRuolo("staff"),
  );

  const dopoIlClinico = await prisma.athlete.findUnique({
    where: { id: ATLETA_A },
    select: { data: true },
  });
  const testoClinico = JSON.stringify(dopoIlClinico?.data ?? {});

  prova(
    "U-54 e un upsert parziale non cancella il contenuto clinico",
    { allergia: true, nota: true, nuovoCampo: true },
    {
      allergia: testoClinico.includes("ALLERGIA-U54"),
      nota: testoClinico.includes("NOTA-U54"),
      nuovoCampo: testoClinico.includes("solo questa"),
    },
    "il PATCH lo conservava gia: era l'altra porta a cancellarlo in silenzio",
  );

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { data: {} },
  });
};

const u55 = async () => {
  /* ================================================================== */
  /*  U-55 — un ruolo personalizzato non e la direzione                  */
  /*         [CRITICAL: credenziali, denaro]                             */
  /* ================================================================== */

  /*
    `normalizeAccessRole` di `custom:club_manager:<slug>` risponde
    `club_manager`, e due predicati ci costruivano sopra una risposta secca:

      * `canAccessClubResource` usciva `true` **prima** di guardare l'elenco
        delle risorse riservate: un ruolo con una chiave sola leggeva
        `access_tokens` — il codice d'accesso delle famiglie in chiaro — e
        `bank_accounts`, e ne coniava di nuovi;
      * `canManageClubConfiguration` autorizzava l'attore in ventuno rotte: lo
        stesso ruolo a cui il club aveva **tolto** la contabilita non poteva
        leggere la prima nota e poteva scriverci un incasso.
  */
  console.log(
    `${NL}U-55 — un ruolo personalizzato non e la direzione   [CRITICAL]`,
  );

  const unaChiaveSola = "custom:club_manager:segreteria#events.read";
  const conLaContabilita =
    "custom:club_manager:amministrazione#accounting.manage,accounting.read";

  prova(
    "U-55 le risorse riservate alla direzione non si aprono a un ruolo ristretto",
    {
      gettoni: false,
      conti: false,
      modelli: false,
      /* e restano aperte a chi le ha davvero */
      direzione: true,
    },
    {
      gettoni: ruoliDiAccesso.canAccessClubResource(
        unaChiaveSola,
        "access_tokens",
        "read",
      ),
      conti: ruoliDiAccesso.canAccessClubResource(
        unaChiaveSola,
        "bank_accounts",
        "read",
      ),
      modelli: ruoliDiAccesso.canAccessClubResource(
        unaChiaveSola,
        "document_templates",
        "update",
      ),
      direzione: ruoliDiAccesso.canAccessClubResource(
        "club_manager",
        "access_tokens",
        "read",
      ),
    },
  );

  prova(
    "U-55 e le risorse aperte restano aperte: il taglio riguarda le riservate",
    true,
    ruoliDiAccesso.canAccessClubResource(unaChiaveSola, "categories", "read"),
    "controspecchio: una regola che negasse tutto passerebbe per una difesa",
  );

  prova(
    "U-55 l'atto della direzione non lo compie un ruolo ristretto",
    { ristretto: false, canonico: true },
    {
      ristretto:
        ruoliDiAccesso.canManageClubConfigurationAsActor(unaChiaveSola),
      canonico: ruoliDiAccesso.canManageClubConfigurationAsActor("club_manager"),
    },
  );

  prova(
    "U-55 ma la chiave che il club ha spuntato conta davvero",
    { legge: true, scrive: true, senzaChiaveLegge: false, senzaChiaveScrive: false },
    {
      legge: permessiContabili.hasAccountingPermission(
        conLaContabilita,
        "accounting.read",
      ),
      scrive: permessiContabili.hasAccountingPermission(
        conLaContabilita,
        "accounting.manage",
      ),
      senzaChiaveLegge: permessiContabili.hasAccountingPermission(
        unaChiaveSola,
        "accounting.read",
      ),
      senzaChiaveScrive: permessiContabili.hasAccountingPermission(
        unaChiaveSola,
        "accounting.manage",
      ),
    },
    "prima: non poteva leggere e poteva scrivere. Il verso peggiore in cui sbagliare",
  );
};

const u56 = async () => {
  /* ================================================================== */
  /*  U-56 — il perimetro, sulle nove porte che non lo guardavano        */
  /*         [CRITICAL: minori, salute, cancellazione]                   */
  /* ================================================================== */

  /*
    Una revisione ha censito **ogni** funzione che tocca un atleta e ha
    misurato quali applicano il perimetro. Il risultato: le cinque superfici
    coperte erano esattamente le cinque che le sonde esistenti esercitavano —
    elenco, lettura per id, fascicolo, byte dell'allegato, scrittura
    dell'appartenenza — e tutte le altre erano aperte.

    Non e un difetto: e la forma di un presidio scritto **enumerando le porte**
    invece che dichiarando la proprieta. Questa prova esiste per cambiare la
    domanda: non «la porta X e chiusa?» ma «di tutto cio che si puo fare a una
    persona, cosa passa il recinto?».
  */
  console.log(
    `${NL}U-56 — il perimetro, sulle nove porte che non lo guardavano   [CRITICAL]`,
  );

  const perimetrato = {
    ...scopeDi(utenti.club_manager.id, CLUB_A, "club_manager"),
    accessScopes: [{ kind: "site", value: SEDE_A }],
  };

  /* Il controspecchio: dentro il perimetro tutto deve continuare a funzionare. */
  prova(
    "U-56 il controspecchio: il proprio atleta si legge ancora",
    ATLETA_A,
    (
      await risorse.getResourceById("athletes", ATLETA_A, perimetrato)
    )?.id ?? null,
    "senza questo, una regola che negasse tutto passerebbe per una difesa",
  );

  /* --- 1. i diritti dell'interessato: export e cancellazione --- */
  await varco(
    "U-56 l'inventario di un minore fuori perimetro e negato",
    () =>
      datiPersonali.previewDataSubjectErasure(perimetrato, {
        organizationId: CLUB_A,
        subjectId: ATLETA_ALTRUI,
      }),
    ["negato"],
  );

  await varco(
    "U-56 e il suo export",
    () =>
      datiPersonali.exportDataSubject(perimetrato, {
        organizationId: CLUB_A,
        subjectId: ATLETA_ALTRUI,
      }),
    ["negato"],
  );

  await varco(
    "U-56 e la sua cancellazione, che e irreversibile",
    () =>
      datiPersonali.eraseDataSubject(perimetrato, {
        organizationId: CLUB_A,
        subjectId: ATLETA_ALTRUI,
      }),
    ["negato"],
  );

  const vivo = await prisma.athlete.findUnique({
    where: { id: ATLETA_ALTRUI },
    select: { first_name: true },
  });
  prova(
    "U-56 e il minore fuori perimetro e ancora integro",
    "Minore",
    vivo?.first_name ?? null,
    "la cancellazione anonimizza: se fosse passata, questo direbbe «[dato cancellato]»",
  );

  /* --- 2. il documentale per identificativo --- */
  const richiestaFuori = await documenti.createDocumentRequest(
    scopeRuolo("club_manager"),
    {
      subjectKind: "athlete",
      subjectId: ATLETA_ALTRUI,
      documentKind: "identity_document",
      title: "Carta d'identita U-56",
      required: true,
    },
  );
  const idFuori =
    richiestaFuori.requestId || richiestaFuori.id || richiestaFuori.request?.id;

  for (const [titolo, atto] of [
    [
      "U-56 il sollecito su una richiesta fuori perimetro e negato",
      () => documenti.remindDocumentRequest(perimetrato, idFuori),
    ],
    [
      "U-56 e il suo annullamento",
      () => documenti.cancelDocumentRequest(perimetrato, idFuori),
    ],
  ]) {
    await varco(titolo, atto, ["negato", "ambiguo", "inesistente"]);
  }

  const richiestaDopo = await prisma.documentRequest.findUnique({
    where: { id: idFuori },
    select: { status: true, last_reminded_at: true },
  });
  prova(
    "U-56 e la richiesta e intatta: nessun sollecito, nessun annullamento",
    { stato: "open", sollecitata: false },
    {
      stato: richiestaDopo?.status ?? null,
      sollecitata: Boolean(richiestaDopo?.last_reminded_at),
    },
  );

  /* --- 3. gli allegati: leggere, riscrivere, distruggere --- */
  const allegatoFuori = await allegati.createAttachment(
    {
      organizationId: CLUB_A,
      ownerType: "athlete",
      ownerId: ATLETA_ALTRUI,
      category: "identity_document",
      fileName: "u56-fuori.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.4 U56 BYTE DI UN MINORE FUORI PERIMETRO"),
    },
    scopeRuolo("club_manager"),
  );

  for (const [titolo, atto] of [
    [
      "U-56 i byte di un minore fuori perimetro non si leggono",
      () => allegati.readAttachment(allegatoFuori.id, perimetrato),
    ],
    [
      "U-56 e nemmeno si riscrivono",
      () =>
        allegati.replaceAttachmentContent(
          allegatoFuori.id,
          {
            fileName: "sostituito.pdf",
            mimeType: "application/pdf",
            content: Buffer.from("%PDF-1.4 SOSTITUITO DA CHI NON PUO LEGGERLO"),
          },
          perimetrato,
        ),
    ],
    [
      "U-56 e nemmeno si distruggono",
      () => allegati.deleteAttachment(allegatoFuori.id, perimetrato),
    ],
    [
      "U-56 e nemmeno se ne leggono i metadati, che nominano la persona",
      () => allegati.getAttachmentMetadata(allegatoFuori.id, perimetrato),
    ],
  ]) {
    await varco(titolo, atto, ["negato"]);
  }

  const bytesDopo = await allegati.readAttachment(
    allegatoFuori.id,
    scopeRuolo("club_manager"),
  );
  prova(
    "U-56 e il file e ancora quello di prima",
    { esiste: true, originale: true },
    {
      esiste: Boolean(bytesDopo),
      originale: String(bytesDopo?.content || "").includes("U56 BYTE"),
    },
  );

  const elencati = await allegati.listAttachments(
    { organizationId: CLUB_A, ownerType: "athlete" },
    perimetrato,
  );
  prova(
    "U-56 e l'elenco non nomina i file di chi e fuori",
    false,
    JSON.stringify(elencati).includes("u56-fuori.pdf"),
    "il nome di un file nomina la persona, e la riga porta il suo identificativo",
  );

  /* --- 4. l'accesso EasyGame di un minore fuori perimetro --- */
  await varco(
    "U-56 l'invito all'account di un minore fuori perimetro e negato",
    () =>
      contiAtleta.sendAthleteAccountInvite(perimetrato, {
        athleteId: ATLETA_ALTRUI,
        email: "attaccante-u56@example.invalid",
      }),
    ["negato"],
  );

  prova(
    "U-56 e nessun invito e stato scritto",
    0,
    await prisma.athleteAccountInvite.count({
      where: { athlete_id: ATLETA_ALTRUI },
    }),
  );

  /* --- 5. convocazione e presenza su una persona fuori perimetro --- */
  const eventoDentro = await eventi.createClubEvent(
    scopeRuolo("club_manager"),
    "training",
    {
      id: "u56-allenamento",
      date: "2026-10-08",
      time: "18:00",
      title: "Allenamento U-56",
      siteId: SEDE_A,
    },
  );
  const idEvento =
    eventoDentro?.id || eventoDentro?.event?.id || "u56-allenamento";

  await varco(
    "U-56 non si convoca un atleta fuori perimetro in un evento della propria sede",
    () =>
      eventi.saveEventConvocations(perimetrato, idEvento, [
        { athleteId: ATLETA_ALTRUI, status: "convocated" },
      ]),
    ["negato"],
  );

  await varco(
    "U-56 e non se ne segna la presenza",
    () =>
      eventi.saveEventAttendance(perimetrato, idEvento, [
        { athleteId: ATLETA_ALTRUI, status: "present" },
      ]),
    ["negato"],
  );

  prova(
    "U-56 e nessuna riga di partecipazione e stata scritta",
    0,
    await prisma.clubEventParticipant.count({
      where: { athlete_id: ATLETA_ALTRUI },
    }),
  );

  /* --- 6. l'appuntamento, che scrive e avvisa --- */
  await varco(
    "U-56 non si fissa un appuntamento su un minore fuori perimetro",
    () =>
      appuntamenti.createAppointment(perimetrato, {
        athleteId: ATLETA_ALTRUI,
        reason: "Colloquio su un minore fuori perimetro",
        startsAt: new Date(Date.now() + 172800_000).toISOString(),
        outsideAvailability: true,
        confirmed: true,
      }),
    ["negato"],
  );

  /* --- 7. la mappa del perimetro, servita dal registro generico --- */
  const appartenenze = await risorse.listResource(
    "athlete_category_memberships",
    new URLSearchParams({ organization_id: CLUB_A }),
    perimetrato,
  );
  prova(
    "U-56 la tabella che definisce il perimetro non lo pubblica",
    false,
    JSON.stringify(appartenenze).includes(ATLETA_ALTRUI),
    "e la mappa atleta -> sede: darla a chi e recintato e dargli le chiavi di tutte le altre porte",
  );

  /* --- 8. la foto --- */
  /*
    La foto va **seminata**: senza, la rotta risponde 404 per assenza e la
    prova passerebbe anche a difesa spenta. E la forma di vacuita che questa
    Wave ha imparato a temere.
  */
  await prisma.athlete.update({
    where: { id: ATLETA_ALTRUI },
    data: {
      avatar_url:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    },
  });

  /*
    E il perimetro va scritto **in archivio**: questa rotta risolve il proprio
    scope da sola — un `<img src>` non manda gli header — quindi uno scope
    sintetico non la raggiungerebbe. E anche il modo giusto di provarlo: e
    l unico percorso in cui il perimetro arriva dalla sessione vera.
  */
  const tesseraGestore = await prisma.organizationUser.findFirst({
    where: {
      organization_id: CLUB_A,
      user_id: utenti.club_manager.id,
      role: "club_manager",
    },
    select: { id: true },
  });
  await prisma.clubAccessScope.create({
    data: {
      organization_user_id: tesseraGestore.id,
      scope_kind: "site",
      scope_value: SEDE_A,
    },
  });

  await comeUtente(utenti.club_manager, CLUB_A);
  const foto = await rotte.avatar.GET(
    richiesta(`/api/v1/athletes/${ATLETA_ALTRUI}/avatar`, {
      headers: { "x-active-access-role": "club_manager" },
    }),
    { params: { id: ATLETA_ALTRUI } },
  );
  SESSIONE = null;
  CLUB_ATTIVO = null;
  await prisma.clubAccessScope.deleteMany({
    where: { organization_user_id: tesseraGestore.id },
  });

  prova(
    "U-56 e il volto di un minore fuori perimetro non esce",
    true,
    foto.status === 403,
    `stato=${foto.status}. La catena era completa: l'elenco dava gli id, questa rotta le facce`,
  );

  /* --- 9. il documento generato, che rende i campi uno per uno --- */
  await varco(
    "U-56 un documento non si genera su un minore fuori perimetro",
    () =>
      segnaposto.resolveDocumentPlaceholders({
        template: {
          id: "u56",
          title: "Prova",
          content: "<p>{{athlete.address}} / {{athlete.phone}}</p>",
        },
        organizationId: CLUB_A,
        athleteId: ATLETA_ALTRUI,
        scope: perimetrato,
      }),
    ["negato"],
  );

  await prisma.attachment
    .delete({ where: { id: allegatoFuori.id } })
    .catch(() => {});
  await prisma.documentRequest.delete({ where: { id: idFuori } }).catch(() => {});
};

const u57 = async () => {
  /* ================================================================== */
  /*  U-57 — il perimetro non si allarga per interposta persona          */
  /*         [CRITICAL: consegna del club]                               */
  /* ================================================================== */

  /*
    `updateAssignmentScopes` vieta gia di cambiare il **proprio** perimetro, e
    il commento accanto spiega perche. Ma il perimetro non faceva parte del
    soffitto di una concessione: `assertMayGrantRole` confronta le **chiavi** e
    mai gli **scope**.

    Misurato: un `club_manager` recintato sulla sede Nord concedeva a una
    seconda utenza un `club_manager` **senza perimetro**, e da quel momento
    leggeva tutto il club per interposta persona. E la stessa lezione gia
    scritta per le chiavi — «l'auto-assegnazione era vietata; concederlo a un
    complice no» — un asse piu in la.
  */
  console.log(
    `${NL}U-57 — il perimetro non si allarga per interposta persona   [CRITICAL]`,
  );

  const perimetrato = {
    userId: utenti.club_manager.id,
    activeOrganizationId: CLUB_A,
    activeRole: "club_manager",
    allowedOrganizationIds: [CLUB_A],
    accessScopes: [{ kind: "site", value: SEDE_A }],
    actorEmail: utenti.club_manager.email,
  };

  await varco(
    "U-57 chi e recintato non concede un accesso senza recinto",
    () =>
      ruoliDiClub.assignClubRole(perimetrato, {
        userId: utenti.athlete.id,
        role: "collaborator",
        scopes: [],
      }),
    ["negato"],
  );

  await varco(
    "U-57 ne uno recintato su un'altra sede",
    () =>
      ruoliDiClub.assignClubRole(perimetrato, {
        userId: utenti.athlete.id,
        role: "collaborator",
        scopes: [{ kind: "site", value: SEDE_ALTRA }],
      }),
    ["negato"],
  );

  const dentro = await ruoliDiClub
    .assignClubRole(perimetrato, {
      userId: utenti.athlete.id,
      role: "collaborator",
      scopes: [{ kind: "site", value: SEDE_A }],
    })
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "U-57 ma dentro il proprio recinto delega ancora",
    "riuscita",
    dentro,
    "controspecchio: una regola che negasse ogni concessione passerebbe per una difesa",
  );

  await prisma.organizationUser.deleteMany({
    where: {
      organization_id: CLUB_A,
      user_id: utenti.athlete.id,
      role: "collaborator",
    },
  });
};

const u58 = async () => {
  /* ================================================================== */
  /*  U-58 — le credenziali della famiglia: chi le vede, chi le tocca    */
  /*         [HIGH: accesso della famiglia]                              */
  /* ================================================================== */

  /*
    **Quattro stesure di questa regola, e tre revisioni per arrivarci.**

    Il problema di partenza: `data` si salva **intera**, quindi la scheda
    riletta senza il gettone — il taglio lo toglie a chi non deve vederlo — e
    rimandata indietro lo cancellava.

    Le tre risposte sbagliate, tutte misurate:

      1. ripristinare una chiave assente **o vuota**: annullava le revoche, e
         accoppiando per posizione ed email spostava il gettone di un tutore
         su un altro;
      2. ripristinare solo l'assente, e **rifiutare** la scrittura quando un
         valore spariva: i tutori gia in archivio non hanno l'`id` — lo
         assegna il browser — quindi la scheda di quei minori era diventata
         **non salvabile**, e togliere un tutore era vietato alla segreteria;
      3. accettare la chiave presente: lasciava **forgiare** un codice di
         accesso a chi non l'aveva mai visto.

    La risposta buona e la piu semplice: per chi non vede una credenziale,
    quei campi sono **in sola lettura**. Non li cancella per omissione, non li
    scrive, e non gli impediscono di fare il proprio lavoro.
  */
  console.log(
    `${NL}U-58 — le credenziali della famiglia: chi le vede, chi le tocca   [HIGH]`,
  );

  const scriviTutori = async (tutori) =>
    prisma.athlete.update({
      where: { id: ATLETA_A },
      data: { data: { guardians: tutori } },
    });

  const leggiArchivio = async () =>
    JSON.stringify(
      (
        await prisma.athlete.findUnique({
          where: { id: ATLETA_A },
          select: { data: true },
        })
      )?.data ?? {},
    );

  const DUE_TUTORI = [
    { id: "g-madre", firstName: "Anna", parentAccessTokenValue: "U58-MADRE" },
    { id: "g-padre", firstName: "Bruno", parentAccessTokenValue: "U58-PADRE" },
  ];

  /* --- 1. chi non vede non scrive: ne il vuoto, ne un valore scelto --- */
  for (const [titolo, valore] of [
    ["U-58 chi non vede la credenziale non la azzera", ""],
    ["U-58 ne la sostituisce con un valore scelto", "FORGIATO-DA-ME"],
  ]) {
    await scriviTutori(DUE_TUTORI);

    await risorse.updateResource(
      "athletes",
      ATLETA_A,
      {
        data: {
          guardians: [
            { id: "g-madre", firstName: "Anna", parentAccessTokenValue: valore },
            { id: "g-padre", firstName: "Bruno" },
          ],
        },
      },
      scopeRuolo("collaborator"),
    );

    const dopo = await leggiArchivio();
    prova(
      titolo,
      { madre: true, padre: true, forgiato: false },
      {
        madre: dopo.includes("U58-MADRE"),
        padre: dopo.includes("U58-PADRE"),
        forgiato: dopo.includes("FORGIATO-DA-ME"),
      },
      "il valore precedente vince: non e un rifiuto, e una sola lettura",
    );
  }

  /* --- 2. e non lo eredita nessun altro --- */
  await scriviTutori(DUE_TUTORI);
  await risorse.updateResource(
    "athletes",
    ATLETA_A,
    {
      data: {
        guardians: [
          {
            id: "g-intruso",
            firstName: "Mallory",
            email: "anna@example.invalid",
            parentAccessTokenValue: "PROVO-A-PRENDERLO",
          },
          { id: "g-padre", firstName: "Bruno" },
        ],
      },
    },
    scopeRuolo("collaborator"),
  );

  const dopoIntruso = JSON.parse(await leggiArchivio());
  const gettoneIntruso = (dopoIntruso.guardians || []).find(
    (t) => t.id === "g-intruso",
  )?.parentAccessTokenValue;

  prova(
    "U-58 un tutore nuovo non nasce con un codice di accesso",
    { gettone: undefined, padreConservato: true },
    {
      gettone: gettoneIntruso,
      padreConservato: (await leggiArchivio()).includes("U58-PADRE"),
    },
    "non c'era una controparte: la chiave sparisce invece di portare cio che il client manda",
  );

  /* --- 3. le tre controprove positive, che le stesure 2 e 3 avevano rotto --- */
  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: {
      data: {
        email: "atleta@example.invalid",
        guardians: [
          /* **senza `id`**: e la forma dei dati gia in archivio */
          { firstName: "Anna", parentAccessTokenValue: "U58-STORICO" },
        ],
      },
    },
  });

  const salvataggioStorico = await risorse
    .updateResource(
      "athletes",
      ATLETA_A,
      {
        data: {
          email: "atleta@example.invalid",
          guardians: [{ firstName: "Anna", phone: "3330001111" }],
        },
      },
      scopeRuolo("collaborator"),
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "U-58 la scheda di un tutore SENZA id resta salvabile, e conserva il codice",
    { esito: "riuscita", codice: true, telefono: true },
    {
      esito: salvataggioStorico,
      codice: (await leggiArchivio()).includes("U58-STORICO"),
      telefono: (await leggiArchivio()).includes("3330001111"),
    },
    "l'`id` lo assegna il browser: senza questo, quelle schede erano bloccate per sempre",
  );

  const togliereUnTutore = await risorse
    .updateResource(
      "athletes",
      ATLETA_A,
      { data: { email: "atleta@example.invalid", guardians: [] } },
      scopeRuolo("collaborator"),
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "U-58 e la segreteria puo togliere un tutore, con il suo codice",
    { esito: "riuscita", codice: false },
    {
      esito: togliereUnTutore,
      codice: (await leggiArchivio()).includes("U58-STORICO"),
    },
    "togliere un tutore e un atto legittimo: vietarlo era la regressione della stesura precedente",
  );

  const recapitoAtleta = await risorse
    .updateResource(
      "athletes",
      ATLETA_A,
      { data: { email: "nuovo@example.invalid" } },
      {
        ...scopeRuolo("staff"),
        activeRole: "custom:staff:segreteria-u58#members.register.read",
      },
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "U-58 e il recapito dell'atleta non e il legame di un tutore",
    "riuscita",
    recapitoAtleta,
    "la copia locale percorreva tutto `data`: la chiave `email` di primo livello e dell'atleta",
  );

  /* --- 4. il controspecchio: chi lo vede lo revoca --- */
  await scriviTutori(DUE_TUTORI);
  await risorse.updateResource(
    "athletes",
    ATLETA_A,
    {
      data: {
        guardians: [
          { id: "g-madre", firstName: "Anna", parentAccessTokenValue: "" },
          { id: "g-padre", firstName: "Bruno", parentAccessTokenValue: "U58-PADRE" },
        ],
      },
    },
    scopeRuolo("owner"),
  );

  prova(
    "U-58 la direzione revoca ancora un codice, e non tocca l'altro",
    { madre: false, padre: true },
    {
      madre: (await leggiArchivio()).includes("U58-MADRE"),
      padre: (await leggiArchivio()).includes("U58-PADRE"),
    },
    "controspecchio: una regola che vietasse ogni scrittura renderebbe un codice non piu revocabile",
  );

  await prisma.athlete.update({ where: { id: ATLETA_A }, data: { data: {} } });
};
const u59 = async () => {
  /* ================================================================== */
  /*  U-59 — l'elenco senza filtro, il cruscotto grezzo, e il tutore     */
  /*         che si nominava da solo   [CRITICAL: credenziali, salute]   */
  /* ================================================================== */

  /*
    Tre porte diverse sullo stesso valore — il codice con cui una famiglia
    entra — piu la strada che permetteva di **diventare** famiglia.
  */
  console.log(
    `${NL}U-59 — l'elenco senza filtro, il cruscotto grezzo, e il tutore che si nominava da solo   [CRITICAL]`,
  );

  const gettoneFamiglia = await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_A,
      resource_type: "access_tokens",
      name: "U59CODICEFAMIGLIA",
      status: "active",
      payload: {
        role: "parent",
        athlete_id: ATLETA_A,
        guardian_id: "g-madre",
        minted_by_role: "owner",
      },
    },
  });

  /* --- 1. l'elenco senza filtro --- */
  const senzaFiltro = async (ruolo) =>
    JSON.stringify(
      await risorse.listResource(
        "club_resource_items",
        new URLSearchParams({ organization_id: CLUB_A }),
        scopeRuolo(ruolo),
      ),
    ).includes("U59CODICEFAMIGLIA");

  prova(
    "U-59 chiedendo l'elenco senza nominare il tipo, i gettoni non escono",
    { trainer: false, staff: false, collaborator: false, direzione: true },
    {
      trainer: await senzaFiltro("trainer"),
      staff: await senzaFiltro("staff"),
      collaborator: await senzaFiltro("collaborator"),
      direzione: await senzaFiltro("owner"),
    },
    "la guardia giudicava la domanda: chiedere `?resource_type=access_tokens` era negato, chiedere niente restituiva tutto",
  );

  /* --- 2. il cruscotto della famiglia --- */
  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: {
      data: {
        guardians: [
          {
            id: "g-madre",
            firstName: "Anna",
            linkedUserId: utenti.parent.id,
            parentAccessTokenValue: "U59-GETTONE-MADRE",
          },
          {
            id: "g-padre",
            firstName: "Bruno",
            parentAccessTokenValue: "U59-GETTONE-PADRE",
          },
        ],
        allergies: "ALLERGIA-U59",
      },
    },
  });

  const cruscotto = JSON.stringify(
    await cruscottoFamiglia.getParentDashboardData(utenti.parent.id, ATLETA_A),
  );

  prova(
    "U-59 la madre non riceve il codice d'accesso del padre",
    { padre: false, proprio: false, clinicoDelFiglio: true },
    {
      padre: cruscotto.includes("U59-GETTONE-PADRE"),
      proprio: cruscotto.includes("U59-GETTONE-MADRE"),
      /* il dato clinico del proprio figlio resta: e il motivo per cui la schermata esiste */
      clinicoDelFiglio: cruscotto.includes("ALLERGIA-U59"),
    },
    "usciva `athletes.data` grezza accanto ai tutori gia sanificati",
  );

  /* --- 3. l'auto-nomina a tutore --- */
  /*
    **La prima stesura provava la cosa con il ruolo sbagliato.**

    Vietava di far crescere l'insieme dei legami a chiunque, e lo misurava con
    `staff`. Una revisione ha mostrato due cose: che la guardia sorvegliava
    due campi mentre il predicato ne legge sette — bastava l'**email di
    contatto** — e che vietarlo del tutto avrebbe rotto la strada con cui una
    famiglia entra senza codice, che `U-06` verifica per nome.

    La regola giusta e che scrivere un legame **concede la vista clinica**,
    quindi la puo scrivere chi quella vista ce l'ha. Si prova percio con un
    ruolo a cui il club l'ha tolta, e si controspecchia con la segreteria, che
    ce l'ha per matrice e deve continuare a lavorare.
  */
  const senzaClinicoU59 =
    "custom:staff:segreteria-u59#members.register.read,documents.review";

  for (const [titolo, campo] of [
    ["U-59 non ci si nomina tutori scrivendo `linkedUserId`", "linkedUserId"],
    ["U-59 ne scrivendo l'email di contatto, che vale come legame", "email"],
  ]) {
    await varco(
      titolo,
      () =>
        risorse.updateResource(
          "athletes",
          ATLETA_A,
          {
            data: {
              guardians: [
                {
                  id: "g-madre",
                  firstName: "Anna",
                  linkedUserId: utenti.parent.id,
                },
                { id: "g-padre", firstName: "Bruno" },
                {
                  id: "g-intruso",
                  firstName: "Mallory",
                  [campo]:
                    campo === "email" ? utenti.staff.email : utenti.staff.id,
                },
              ],
            },
          },
          { ...scopeRuolo("staff"), activeRole: senzaClinicoU59 },
        ),
      ["negato"],
    );
  }

  prova(
    "U-59 e l'intruso non e famiglia di quel minore",
    false,
    await cruscottoFamiglia.canParentAccessAthlete(utenti.staff.id, ATLETA_A),
    "da li si leggeva il fascicolo clinico che `clinical.read` gli nega",
  );

  prova(
    "U-59 ma la madre lo e ancora: il divieto e su chi scrive, non sul legame",
    true,
    await cruscottoFamiglia.canParentAccessAthlete(utenti.parent.id, ATLETA_A),
    "controspecchio: una regola che negasse ogni legame romperebbe l'area famiglia",
  );

  /*
    E il controspecchio che conta di piu: la segreteria, che `clinical.read`
    ce l'ha per matrice, deve poter aggiungere un tutore con la sua email —
    perche e cosi che una famiglia entra.
  */
  const conIlClinico = await risorse
    .updateResource(
      "athletes",
      ATLETA_A,
      {
        data: {
          guardians: [
            { id: "g-madre", firstName: "Anna", linkedUserId: utenti.parent.id },
            { id: "g-padre", firstName: "Bruno" },
            {
              id: "g-nuovo",
              firstName: "Carla",
              email: "carla-u59@example.invalid",
            },
          ],
        },
      },
      scopeRuolo("staff"),
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "U-59 e la segreteria aggiunge ancora un tutore con la sua email",
    "riuscita",
    conIlClinico,
    "e la strada con cui una famiglia entra senza riscattare un codice",
  );
  /* --- 4. le due porte sulla stessa rata, e i compensi storici --- */
  prova(
    "U-59 le due porte sulla rata dicono la stessa cosa",
    { segreteriaModifica: true, segreteriaCancella: false, direzioneCancella: true },
    {
      segreteriaModifica: ruoliDiAccesso.canAccessClubResource(
        "staff",
        "payments",
        "update",
      ),
      segreteriaCancella: ruoliDiAccesso.canAccessClubResource(
        "staff",
        "payments",
        "delete",
      ),
      direzioneCancella: ruoliDiAccesso.canAccessClubResource(
        "club_manager",
        "payments",
        "delete",
      ),
    },
    "la rotta dedicata ora chiede a questa matrice invece di riscriverne una propria",
  );

  prova(
    "U-59 i compensi storici sono riservati come quelli nuovi",
    { staff: false, direzione: true },
    {
      staff: ruoliDiAccesso.canAccessClubResource(
        "staff",
        "trainer_payments",
        "read",
      ),
      direzione: ruoliDiAccesso.canAccessClubResource(
        "club_manager",
        "trainer_payments",
        "read",
      ),
    },
    "`sport_work` era riservata «perche dice quanto guadagna una persona»; la tabella che ha sostituito no",
  );

  /* --- 5. il ruolo ristretto sul registro generico --- */
  const senzaChiavi = "custom:collaborator:vuoto#";
  const conLaChiave = "custom:collaborator:segreteria#members.register.read";

  /*
    La guardia vive nel **registro**, non nel predicato: `access-roles.ts` e un
    modulo puro e importare il catalogo da li creerebbe un ciclo. Si prova
    quindi dove la guardia sta davvero, chiamando l'elenco.
  */
  const elenca = (ruolo, risorsa) =>
    risorse
      .listResource(
        risorsa,
        new URLSearchParams({ organization_id: CLUB_A }),
        scopeDi(utenti.collaborator.id, CLUB_A, ruolo),
      )
      .then(() => "riuscita")
      .catch((errore) =>
        String(errore?.message || "").includes("Accesso negato")
          ? "negato"
          : `errore: ${errore?.message}`,
      );

  prova(
    "U-59 un ruolo con zero chiavi non legge cio che una chiave governa",
    { senza: "negato", con: "riuscita", senzaChiaveGovernata: "riuscita" },
    {
      senza: await elenca(senzaChiavi, "members"),
      con: await elenca(conLaChiave, "members"),
      /* e cio che nessuna chiave governa resta al ruolo base, come dichiarato */
      senzaChiaveGovernata: await elenca(senzaChiavi, "categories"),
    },
  );

  await prisma.clubResourceItem
    .delete({ where: { id: gettoneFamiglia.id } })
    .catch(() => {});
  await prisma.athlete.update({ where: { id: ATLETA_A }, data: { data: {} } });
};

const u60 = async () => {
  /* ================================================================== */
  /*  U-60 — la tessera spenta in silenzio, e i due modi di vedere il    */
  /*         dato clinico senza la sua chiave   [HIGH]                   */
  /* ================================================================== */

  console.log(
    `${NL}U-60 — la tessera spenta in silenzio, e il clinico dalla porta accanto   [HIGH]`,
  );

  /* --- 1. `custom_role_id` scritto dal registro generico --- */
  const ruolo = await ruoliDiClub.createClubRole(scopeRuolo("owner"), {
    name: "Ruolo U-60",
    baseRole: "collaborator",
    permissions: ["events.read"],
  });

  const tesseraVittima = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB_A, user_id: utenti.owner.id, role: "owner" },
    select: { id: true, custom_role_id: true },
  });

  await varco(
    "U-60 il ruolo personalizzato di una tessera non si scrive dal registro generico",
    () =>
      risorse.updateResource(
        "organization_users",
        tesseraVittima.id,
        { custom_role_id: ruolo.id },
        scopeRuolo("club_manager"),
      ),
    ["negato"],
  );

  const tesseraDopo = await prisma.organizationUser.findUnique({
    where: { id: tesseraVittima.id },
    select: { role: true, custom_role_id: true },
  });

  prova(
    "U-60 e la tessera del proprietario e ancora coerente",
    { ruolo: "owner", riferimento: null },
    {
      ruolo: tesseraDopo?.role ?? null,
      riferimento: tesseraDopo?.custom_role_id ?? null,
    },
    "una riga con il ruolo canonico e un riferimento personalizzato viene scartata: la vittima usciva dal club",
  );

  /* --- 2. il club d'ingresso di un altro --- */
  const tesseraAltrui = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB_A, user_id: utenti.staff.id },
    select: { id: true, is_primary: true },
  });

  await varco(
    "U-60 il club d'ingresso di un'altra persona non si sposta",
    () =>
      risorse.updateResource(
        "organization_users",
        tesseraAltrui.id,
        { is_primary: !tesseraAltrui.is_primary },
        scopeRuolo("club_manager"),
      ),
    ["negato"],
  );

  /* --- 3. la rotta storica dei file di modulo --- */
  const senzaClinico =
    "custom:club_manager:senza-clinico#documents.review,forms.read";

  prova(
    "U-60 i byte di un allegato di modulo chiedono il permesso sul dato clinico",
    { core: false, storica: false, conIlPermesso: true },
    {
      core: permessiAllegati.canAccessAttachmentOwner(
        senzaClinico,
        "form",
        "read",
        "compilazione-modulo",
      ),
      /*
        La rotta storica non e una funzione pura: si guarda che il cancello
        esista e che sia lo **stesso** — ed e cio che la revisione aveva
        misurato mancante, con Attachment Core a 403 e questa a 200.
      */
      storica: permessiSanitari.hasHealthPermission(
        senzaClinico,
        "clinical.read",
      ),
      conIlPermesso: permessiSanitari.hasHealthPermission(
        "collaborator",
        "clinical.read",
      ),
    },
  );

  /* --- 4. la precompilazione di un modulo --- */
  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { data: { allergies: "ALLERGIA-U60", phone: "3331112222" } },
  });

  /*
    Serve un modulo che **dichiari** il campo clinico: quello seminato non ne
    ha, e la prova misurerebbe un elenco vuoto. La vacuita si evita cosi.
  */
  const scopeModuli = scopeDi(utenti.owner.id, CLUB_A, "owner");
  const modelloClinico = await moduli.createFormTemplate(scopeModuli, {
    organizationId: CLUB_A,
  });
  await moduli.updateFormTemplateDraft(scopeModuli, modelloClinico.id, {
    title: "Modulo U-60 con campo clinico",
    description: "",
    fields: [
      {
        id: "allergie",
        type: "long_text",
        label: "Allergie",
        binding: "athlete.allergies",
        required: false,
      },
    ],
  });
  await moduli.publishFormTemplate(scopeModuli, modelloClinico.id);

  const precompila = async (ruoloAttivo) => {
    const contesto = await compilazioni.buildCompileContext(
      { ...scopeRuolo("collaborator"), activeRole: ruoloAttivo },
      {
        templateId: modelloClinico.id,
        subjects: [{ subject: "athlete", recordId: ATLETA_A }],
      },
    );
    return JSON.stringify(contesto?.answers ?? {});
  };

  const conClinico = await precompila("collaborator").catch(
    (errore) => `errore: ${errore?.message}`,
  );
  const senza = await precompila(senzaClinico).catch(
    (errore) => `errore: ${errore?.message}`,
  );

  prova(
    "U-60 un modulo non precompila un campo clinico a chi non ha la chiave",
    { senzaChiave: false, conChiave: true },
    {
      senzaChiave: senza.includes("ALLERGIA-U60"),
      conChiave: conClinico.includes("ALLERGIA-U60"),
    },
    "il vocabolario dei campi dinamici dichiara `athlete.allergies`, e la rotta chiedeva solo `forms.read`",
  );

  await prisma.athlete.update({ where: { id: ATLETA_A }, data: { data: {} } });
  await prisma.formTemplateVersion
    .deleteMany({ where: { template_id: modelloClinico.id } })
    .catch(() => {});
  await prisma.formTemplate
    .delete({ where: { id: modelloClinico.id } })
    .catch(() => {});
  await prisma.clubRolePermission
    .deleteMany({ where: { role_id: ruolo.id } })
    .catch(() => {});
  await prisma.clubRole.delete({ where: { id: ruolo.id } }).catch(() => {});
};

const u61 = async () => {
  /* ================================================================== */
  /*  U-61 — la settima revisione: il campo aggregato, il `data` nullo,  */
  /*         e le tre porte rimaste          [CRITICAL: consegna, salute]*/
  /* ================================================================== */

  console.log(
    `${NL}U-61 — il campo aggregato, il \`data\` nullo, e le tre porte rimaste   [CRITICAL]`,
  );

  /* --- 1. il campo JSON aggregato del club, terza porta sul conio --- */
  await varco(
    "U-61 un gettone non si conia dal campo aggregato del club",
    () =>
      risorse.updateResource(
        "clubs",
        CLUB_A,
        {
          access_tokens: [
            {
              id: "u61-forgiato",
              name: "U61FORGIATO",
              status: "active",
              role: "owner",
              minted_by_role: "owner",
              one_time: false,
            },
          ],
        },
        scopeRuolo("club_manager"),
      ),
    ["negato"],
  );

  prova(
    "U-61 e nessun gettone e stato scritto",
    0,
    await prisma.clubResourceItem.count({
      where: { organization_id: CLUB_A, name: "U61FORGIATO" },
    }),
    "la stessa chiamata cancellava anche tutti i gettoni legittimi del club, perche riscrive la collezione intera",
  );

  for (const riservata of ["bank_accounts", "document_templates"]) {
    await varco(
      `U-61 ne si scrive «${riservata}» da quella porta`,
      () =>
        risorse.updateResource(
          "clubs",
          CLUB_A,
          { [riservata]: [{ id: `u61-${riservata}`, name: "Forgiata" }] },
          scopeRuolo("club_manager"),
        ),
      ["negato"],
    );
  }

  /* --- 2. `data` nullo spegneva tutte e tre le guardie dell'anagrafica --- */
  const senzaClinicoU61 =
    "custom:staff:segreteria-u61#members.register.read,documents.review";
  const scopeSenzaClinico = {
    ...scopeRuolo("staff"),
    activeRole: senzaClinicoU61,
  };

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: {
      data: {
        allergies: "ALLERGIA-U61",
        guardians: [
          { id: "g-madre", firstName: "Anna", parentAccessTokenValue: "U61-GETTONE" },
        ],
      },
    },
  });

  for (const vuoto of [null, "", 0]) {
    await risorse
      .updateResource("athletes", ATLETA_A, { data: vuoto }, scopeSenzaClinico)
      .catch(() => {});
  }

  const dopoIlVuoto = JSON.stringify(
    (
      await prisma.athlete.findUnique({
        where: { id: ATLETA_A },
        select: { data: true },
      })
    )?.data ?? {},
  );

  prova(
    "U-61 un `data` nullo non cancella il contenuto clinico",
    { allergia: true },
    { allergia: dopoIlVuoto.includes("ALLERGIA-U61") },
    "le tre guardie erano condizionate a due valori **veri**: un nullo le attraversava tutte",
  );

  /*
    I tutori invece se ne vanno, ed e coerente: svuotare `data` e togliere i
    tutori, che e un atto legittimo — lo stesso che la segreteria compie dalla
    scheda. Cio che non deve succedere e che il **legame** cresca, e lo prova
    il passo successivo.
  */

  await varco(
    "U-61 e il secondo passo non aggiunge un legame di famiglia",
    () =>
      risorse.updateResource(
        "athletes",
        ATLETA_A,
        {
          data: {
            guardians: [
              { id: "g-madre", firstName: "Anna" },
              { id: "g-io", firstName: "Mallory", linkedUserId: utenti.staff.id },
            ],
          },
        },
        scopeSenzaClinico,
      ),
    ["negato"],
  );

  prova(
    "U-61 e chi ci ha provato non e famiglia di quel minore",
    false,
    await cruscottoFamiglia.canParentAccessAthlete(utenti.staff.id, ATLETA_A),
  );

  /* --- 3. le tre porte del perimetro rimaste --- */
  const perimetrato = {
    ...scopeDi(utenti.club_manager.id, CLUB_A, "club_manager"),
    accessScopes: [{ kind: "site", value: SEDE_A }],
  };

  const appuntamentoFuori = await appuntamenti.createAppointment(
    scopeRuolo("club_manager"),
    {
      athleteId: ATLETA_ALTRUI,
      reason: "Colloquio U-61",
      startsAt: new Date(Date.now() + 259200_000).toISOString(),
      outsideAvailability: true,
      confirmed: false,
    },
  );
  const idAppuntamento = appuntamentoFuori?.id || appuntamentoFuori?.appointment?.id;

  await varco(
    "U-61 un appuntamento fuori perimetro non si conferma",
    () => appuntamenti.confirmAppointment(perimetrato, idAppuntamento),
    ["negato"],
    "confermare manda una notifica ai tutori del minore: la creazione lo verificava, le cinque transizioni no",
  );

  await varco(
    "U-61 ne si annulla",
    () => appuntamenti.cancelAppointment(perimetrato, idAppuntamento),
    ["negato"],
  );

  await varco(
    "U-61 e un allegato non si deposita nel fascicolo di chi e fuori",
    () =>
      allegati.createAttachment(
        {
          organizationId: CLUB_A,
          ownerType: "athlete",
          ownerId: ATLETA_ALTRUI,
          category: "other",
          fileName: "u61.pdf",
          mimeType: "application/pdf",
          content: Buffer.from("%PDF-1.4 U61"),
        },
        perimetrato,
      ),
    ["negato"],
    "era la sesta porta di Attachment Core, e l'unica senza perimetro",
  );

  /* --- 4. il riscatto: l'id logico, e il gettone senza firma --- */
  const schedaLogica = await risorse.createResource(
    "trainers",
    {
      organization_id: CLUB_A,
      id: "trainer-u61-logico",
      first_name: "Ugo",
      last_name: "Sessantuno",
    },
    "create",
    scopeRuolo("club_manager"),
  );

  const gettoneAllenatore = await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_A,
      resource_type: "access_tokens",
      name: "U61ALLENATORE",
      status: "active",
      payload: {
        role: "trainer",
        token_type: "trainer_access",
        trainer_id: "trainer-u61-logico",
        minted_by_role: "club_manager",
      },
    },
  });

  await comeUtente(utenti.athlete, CLUB_A);
  const riscattoAllenatore = await rotte.riscatto.POST(
    richiesta("/api/v1/auth/access/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "U61ALLENATORE" }),
    }),
  );

  prova(
    "U-61 il gettone di un allenatore vero si riscatta ancora",
    200,
    riscattoAllenatore.status,
    "`club_resource_items.id` e `uuid` e `trainer_id` porta l'id logico: il confronto faceva fallire la query, e ogni allenatore riceveva 500",
  );

  const senzaFirma = await prisma.clubResourceItem.create({
    data: {
      organization_id: CLUB_A,
      resource_type: "access_tokens",
      name: "U61SENZAFIRMA",
      status: "active",
      payload: { role: "club_manager" },
    },
  });

  const riscattoSenzaFirma = await rotte.riscatto.POST(
    richiesta("/api/v1/auth/access/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "U61SENZAFIRMA" }),
    }),
  );
  SESSIONE = null;
  CLUB_ATTIVO = null;

  prova(
    "U-61 e un gettone storico senza firma non concede chi amministra il club",
    { stato: 403, tessera: 0 },
    {
      stato: riscattoSenzaFirma.status,
      tessera: await prisma.organizationUser.count({
        where: {
          organization_id: CLUB_A,
          user_id: utenti.athlete.id,
          role: "club_manager",
        },
      }),
    },
    "prima di questa Wave un collaboratore poteva forgiarne uno: fidarsi che lo abbia coniato la direzione e cio che non si puo sapere",
  );

  /* --- 5. le due porte rimaste sulla tessera --- */
  const tesseraStaff = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB_A, user_id: utenti.staff.id },
    select: { id: true },
  });

  await varco(
    "U-61 `custom_role_id` non si scrive nemmeno in creazione",
    () =>
      risorse.createResource(
        "organization_users",
        {
          organization_id: CLUB_A,
          user_id: utenti.athlete.id,
          role: "collaborator",
          custom_role_id: RUOLO_A?.id || null,
        },
        "create",
        scopeRuolo("club_manager"),
      ),
    ["negato"],
  );

  await varco(
    "U-61 ne `is_primary` altrui passa dall'upsert",
    () =>
      risorse.createResource(
        "organization_users",
        {
          organization_id: CLUB_A,
          user_id: utenti.staff.id,
          role: "staff",
          is_primary: false,
        },
        "upsert",
        scopeRuolo("club_manager"),
      ),
    ["negato"],
  );

  /* pulizia */
  await prisma.appointment
    .deleteMany({ where: { athlete_id: ATLETA_ALTRUI } })
    .catch(() => {});
  for (const riga of [gettoneAllenatore, senzaFirma]) {
    await prisma.clubResourceItem.delete({ where: { id: riga.id } }).catch(() => {});
  }
  await prisma.clubResourceItem
    .deleteMany({ where: { organization_id: CLUB_A, resource_type: "trainers" } })
    .catch(() => {});
  await prisma.organizationUser
    .deleteMany({
      where: {
        organization_id: CLUB_A,
        user_id: utenti.athlete.id,
        role: { in: ["trainer", "club_manager", "collaborator"] },
      },
    })
    .catch(() => {});
  await prisma.athlete.update({ where: { id: ATLETA_A }, data: { data: {} } });
  void tesseraStaff;
  void schedaLogica;
};

const u62 = async () => {
  /* ================================================================== */
  /*  U-62 — le difese che nessun gate esercitava   [HIGH]               */
  /* ================================================================== */

  /*
    Una revisione ha fatto mutation testing su ventotto difese e ha misurato
    che **sette** non erano viste da nessun gate. Le tre qui sotto sono quelle
    che si misurano a runtime; le altre quattro sono difetti dei presidi, e si
    correggono nei presidi.
  */
  console.log(`${NL}U-62 — le difese che nessun gate esercitava   [HIGH]`);

  /* --- 1. il profilo atleta e la sua proiezione --- */
  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: {
      user_id: utenti.athlete.id,
      data: {
        guardians: [
          {
            id: "g-madre",
            firstName: "Anna",
            parentAccessTokenValue: "U62-CODICE-FAMIGLIA",
          },
        ],
      },
    },
  });

  await comeUtente(utenti.athlete, CLUB_A);
  const profilo = await rotte.profiloAtleta.GET(
    richiesta(`/api/v1/auth/athlete-profile/${ATLETA_A}`),
    { params: { athleteId: ATLETA_A } },
  );
  const corpoProfilo = JSON.stringify(await profilo.json());
  SESSIONE = null;
  CLUB_ATTIVO = null;

  prova(
    "U-62 il profilo di un atleta non porta il codice d'accesso della sua famiglia",
    { stato: 200, codice: false },
    { stato: profilo.status, codice: corpoProfilo.includes("U62-CODICE-FAMIGLIA") },
    "la riga che lo toglie esiste dalla Wave 6 e nessun gate la esercitava: toglierla dava sei verdi",
  );

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { user_id: null, data: {} },
  });
};

const u63 = async () => {
  /* ================================================================== */
  /*  U-63 — l'ottava revisione: il ramo che scavalcava, il valore in    */
  /*         array, e le difese scritte e mai percorse   [CRITICAL]      */
  /* ================================================================== */

  console.log(
    `${NL}U-63 — il ramo che scavalcava, il valore in array, e le difese mai percorse   [CRITICAL]`,
  );

  const perimetrato = {
    ...scopeDi(utenti.club_manager.id, CLUB_A, "club_manager"),
    accessScopes: [{ kind: "site", value: SEDE_A }],
  };

  /* --- 1. il restringimento vale anche per la base `club_manager` --- */
  const suBaseGestore = "custom:club_manager:controllo#events.read";
  const suBaseCollaboratore = "custom:collaborator:controllo#events.read";

  prova(
    "U-63 un ruolo ristretto e ristretto su ogni base, non su tre su quattro",
    {
      gestore: false,
      collaboratore: false,
      canonico: true,
      cancellaRata: false,
    },
    {
      gestore: ruoliDiAccesso.canAccessClubResource(
        suBaseGestore,
        "payments",
        "read",
      ),
      collaboratore: ruoliDiAccesso.canAccessClubResource(
        suBaseCollaboratore,
        "payments",
        "read",
      ),
      canonico: ruoliDiAccesso.canAccessClubResource(
        "club_manager",
        "payments",
        "read",
      ),
      /* misurato: rispondeva `true`, cioe piu di una segreteria canonica */
      cancellaRata: ruoliDiAccesso.canAccessClubResource(
        suBaseGestore,
        "payments",
        "delete",
      ),
    },
    "la regola stava sotto il ramo `owner || club_manager`, che esce `true` per primo",
  );

  /* --- 2. il legame di famiglia, e il valore in array --- */
  const senzaAccessi =
    "custom:staff:segreteria-u63#members.register.read,clinical.read";

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: {
      data: {
        allergies: "ALLERGIA-U63",
        guardians: [{ id: "g-madre", firstName: "Anna" }],
      },
    },
  });

  for (const [titolo, valore] of [
    ["U-63 il legame non si scrive come stringa", utenti.staff.email],
    ["U-63 ne come array, che il predicato stringifica", [utenti.staff.email]],
  ]) {
    await varco(
      titolo,
      () =>
        risorse.updateResource(
          "athletes",
          ATLETA_A,
          {
            /*
              **Niente campi clinici nel carico.**

              La prima stesura mandava anche `allergies`, e a fermarla era
              `assertClinicalWrite` — non la guardia in prova. Il controllo
              restava verde anche togliendo la guardia: vacuo.
            */
            data: {
              guardians: [
                { id: "g-madre", firstName: "Anna" },
                { id: "g-intruso", firstName: "Mallory", email: valore },
              ],
            },
          },
          { ...scopeRuolo("staff"), activeRole: senzaAccessi },
        ),
      ["negato"],
    );
  }

  prova(
    "U-63 e chi ci ha provato non e famiglia di quel minore",
    false,
    await cruscottoFamiglia.canParentAccessAthlete(utenti.staff.id, ATLETA_A),
    "la guardia contava solo le stringhe, `firstText` fa `String(v)`: le due parti non concordavano su cosa sia un valore",
  );

  /*
    E il controspecchio: la chiave che governa questo atto e quella degli
    **accessi**, non quella clinica — un legame apre molto piu del dato
    sanitario. Chi la porta continua a lavorare.
  */
  const conGliAccessi = await risorse
    .updateResource(
      "athletes",
      ATLETA_A,
      {
        data: {
          guardians: [
            { id: "g-madre", firstName: "Anna" },
            {
              id: "g-nuovo",
              firstName: "Carla",
              email: "carla-u63@example.invalid",
            },
          ],
        },
      },
      scopeRuolo("staff"),
    )
    .then(() => "riuscita")
    .catch((errore) => String(errore?.message || errore));

  prova(
    "U-63 ma la segreteria aggiunge ancora un tutore con la sua email",
    "riuscita",
    conGliAccessi,
    "e la strada con cui una famiglia entra senza riscattare un codice",
  );

  /* --- 3. i documenti generati: la difesa scritta e mai percorsa --- */
  /*
    Il modello si semina qui: senza, il blocco veniva **saltato** e la prova
    non misurava niente — la forma di vacuita che questa Wave ha imparato a
    riconoscere.
  */
  const modelloDoc = await prisma.documentTemplate.create({
    data: {
      organization_id: CLUB_A,
      title: "Modello U-63",
      subject_kind: "athlete",
      status: "published",
    },
  });

  if (modelloDoc) {
    const versione = await prisma.documentTemplateVersion.create({
      data: {
        template_id: modelloDoc.id,
        organization_id: CLUB_A,
        version: 1,
        title: "Modello U-63",
        content_html: "<p>{{athlete.address}}</p>",
        subject_kind: "athlete",
      },
    });

    const generato = await prisma.generatedDocument.create({
      data: {
        organization_id: CLUB_A,
        template_id: modelloDoc.id,
        version_id: versione.id,
        subject_kind: "athlete",
        subject_id: ATLETA_ALTRUI,
        subject_label: "Minore fuori perimetro",
        content_html: "<p>Via Riservata 1 — U63</p>",
        values_snapshot: {},
        sensitivity: [],
        status: "issued",
      },
    });

    await comeUtente(utenti.club_manager, CLUB_A);
    const tesseraGestore = await prisma.organizationUser.findFirst({
      where: {
        organization_id: CLUB_A,
        user_id: utenti.club_manager.id,
        role: "club_manager",
      },
      select: { id: true },
    });
    await prisma.clubAccessScope.create({
      data: {
        organization_user_id: tesseraGestore.id,
        scope_kind: "site",
        scope_value: SEDE_A,
      },
    });

    const elenco = await rotte.documentiGenerati.GET(
      richiesta(`/api/v1/documents/generated?organization_id=${CLUB_A}`),
    );
    const corpoElenco = JSON.stringify(await elenco.json());

    const perId = await rotte.documentoGenerato.GET(
      richiesta(`/api/v1/documents/generated/${generato.id}`),
      { params: { id: generato.id } },
    );

    await prisma.clubAccessScope.deleteMany({
      where: { organization_user_id: tesseraGestore.id },
    });
    SESSIONE = null;
    CLUB_ATTIVO = null;

    prova(
      "U-63 un documento gia generato su un minore fuori perimetro non si legge",
      { nellElenco: false, perId: true },
      {
        nellElenco: corpoElenco.includes("Minore fuori perimetro"),
        perId: [403, 404].includes(perId.status),
      },
      "la guardia leggeva `scope.accessScopes` e le rotte non lo passavano: scritta e mai percorsa",
    );

    await prisma.generatedDocument
      .delete({ where: { id: generato.id } })
      .catch(() => {});
    await prisma.documentTemplateVersion
      .deleteMany({ where: { template_id: modelloDoc.id } })
      .catch(() => {});
    await prisma.documentTemplate
      .delete({ where: { id: modelloDoc.id } })
      .catch(() => {});
  }

  /* --- 4. le due porte rimaste, e la controprova che non negano troppo --- */
  const scopeModuliU63 = scopeDi(utenti.owner.id, CLUB_A, "owner");
  const modelloU63 = await moduli.createFormTemplate(scopeModuliU63, {
    organizationId: CLUB_A,
  });
  await moduli.updateFormTemplateDraft(scopeModuliU63, modelloU63.id, {
    title: "Modulo U-63",
    description: "",
    fields: [
      { id: "nome", type: "short_text", label: "Nome", binding: "athlete.firstName" },
    ],
  });
  await moduli.publishFormTemplate(scopeModuliU63, modelloU63.id);

  await varco(
    "U-63 un modulo non si precompila su un minore fuori perimetro",
    () =>
      compilazioni.buildCompileContext(
        { ...scopeRuolo("club_manager"), accessScopes: perimetrato.accessScopes },
        {
          templateId: modelloU63.id,
          subjects: [{ subject: "athlete", recordId: ATLETA_ALTRUI }],
        },
      ),
    ["negato"],
  );

  const appuntamentoFuori = await appuntamenti.createAppointment(
    scopeRuolo("club_manager"),
    {
      athleteId: ATLETA_ALTRUI,
      reason: "Colloquio U-63",
      startsAt: new Date(Date.now() + 345600_000).toISOString(),
      outsideAvailability: true,
      confirmed: false,
    },
  );
  const idApp = appuntamentoFuori?.id || appuntamentoFuori?.appointment?.id;

  await varco(
    "U-63 e un appuntamento fuori perimetro non si legge",
    () => appuntamenti.readAppointment(perimetrato, idApp),
    ["negato"],
    "porta il nome del minore e un `reason` libero, che dice perche ci si vede",
  );

  const elencoApp = await appuntamenti.listAppointments(perimetrato, {});
  prova(
    "U-63 ne compare nell'elenco",
    false,
    JSON.stringify(elencoApp).includes("Colloquio U-63"),
  );

  /* la controprova: dentro il recinto si legge e si scrive come prima */
  const appuntamentoDentro = await appuntamenti.createAppointment(perimetrato, {
    athleteId: ATLETA_A,
    reason: "Colloquio dentro il recinto",
    startsAt: new Date(Date.now() + 432000_000).toISOString(),
    outsideAvailability: true,
    confirmed: false,
  });
  const idDentro =
    appuntamentoDentro?.id || appuntamentoDentro?.appointment?.id;

  const letturaDentro = await appuntamenti
    .readAppointment(perimetrato, idDentro)
    .then((riga) => (riga ? "riuscita" : "vuota"))
    .catch((errore) => String(errore?.message || errore));

  prova(
    "U-63 e dentro il recinto si legge e si scrive come prima",
    "riuscita",
    letturaDentro,
    "controspecchio: un perimetro che nega dentro il proprio recinto e un difetto quanto uno che non nega fuori",
  );

  /* --- 5. le due colonne della tessera, e la regressione che avevano causato --- */
  const appartenenza = await prisma.athleteCategoryMembership.findFirst({
    where: { athlete_id: ATLETA_A },
    select: { id: true },
  });

  if (appartenenza) {
    const categoriaPrimaria = await risorse
      .updateResource(
        "athlete_category_memberships",
        appartenenza.id,
        { is_primary: true },
        scopeRuolo("owner"),
      )
      .then(() => "riuscita")
      .catch((errore) => String(errore?.message || errore));

    prova(
      "U-63 la categoria primaria di un atleta si cambia ancora",
      "riuscita",
      categoriaPrimaria,
      "la guardia sulle tessere aveva perso il filtro di risorsa e negava anche questa, al proprietario compreso",
    );
  }

  await prisma.appointment
    .deleteMany({ where: { athlete_id: { in: [ATLETA_A, ATLETA_ALTRUI] } } })
    .catch(() => {});
  await prisma.formTemplateVersion
    .deleteMany({ where: { template_id: modelloU63.id } })
    .catch(() => {});
  await prisma.formTemplate
    .delete({ where: { id: modelloU63.id } })
    .catch(() => {});
  await prisma.athlete.update({ where: { id: ATLETA_A }, data: { data: {} } });
};

const u64 = async () => {
  /* ================================================================== */
  /*  U-64 — le due difese che funzionavano e che niente teneva ferme    */
  /*         [HIGH]                                                      */
  /* ================================================================== */

  /*
    Una revisione ha rimesso la riga sbagliata in due correzioni gia fatte, e
    **tutti e sei i gate sono rimasti verdi**. Una difesa che funziona e che
    nessuno tiene ferma e una difesa che dura fino al prossimo refactor.
  */
  console.log(
    `${NL}U-64 — le due difese che niente teneva ferme   [HIGH]`,
  );

  /* --- 1. la rata: il verbo viene dall'azione, non dal metodo HTTP --- */
  const rata = await prisma.athletePayment.findFirst({
    where: { athlete_id: ATLETA_A },
    select: { id: true, status: true },
  });

  if (rata) {
    await comeUtente(utenti.staff, CLUB_A);

    const chiama = (azione) =>
      rotte.rata.PATCH(
        richiesta(`/api/athlete-payments/${rata.id}`, {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-active-access-role": "staff",
          },
          body: JSON.stringify({ action: azione, amount: 120 }),
        }),
        { params: { paymentId: rata.id } },
      );

    const modifica = await chiama("update");
    const annullamento = await chiama("cancel");
    const cancellazione = await chiama("delete");

    SESSIONE = null;
    CLUB_ATTIVO = null;

    prova(
      "U-64 la segreteria modifica una rata e non la annulla",
      /*
        Si guarda il **verdetto**, non il codice: un 400 di merito — importo
        fuori forma, rata in uno stato che non lo ammette — e una risposta del
        dominio, non della guardia. Cio che conta e che la modifica non sia
        **negata** e che l annullamento lo sia.
      */
      { modificaNegata: false, annullamento: 403, cancellazione: 403 },
      {
        modificaNegata: modifica.status === 403,
        annullamento: annullamento.status,
        cancellazione: cancellazione.status,
      },
      "il verbo veniva da `request.method`, e questo file esporta solo PATCH: il ramo `delete` non si interrogava mai",
    );

    const rataDopo = await prisma.athletePayment.findUnique({
      where: { id: rata.id },
      select: { status: true },
    });
    prova(
      "U-64 e la rata non e stata annullata",
      true,
      rataDopo?.status !== "cancelled",
    );
  }

  /* --- 2. il registro generico: la porta, non solo la mappa --- */
  const senzaChiavi = "custom:collaborator:vuoto-u64#";
  const conLaChiave = "custom:collaborator:soci-u64#members.register.read";

  const elencaComeRuolo = (ruolo, risorsa) =>
    risorse
      .listResource(
        risorsa,
        new URLSearchParams({ organization_id: CLUB_A }),
        scopeDi(utenti.collaborator.id, CLUB_A, ruolo),
      )
      .then(() => "riuscita")
      .catch((errore) =>
        String(errore?.message || "").includes("Accesso negato")
          ? "negato"
          : `errore: ${errore?.message}`,
      );

  prova(
    "U-64 la porta nega, non solo la mappa",
    { senza: "negato", con: "riuscita" },
    {
      senza: await elencaComeRuolo(senzaChiavi, "members"),
      con: await elencaComeRuolo(conLaChiave, "members"),
    },
    "il pin provava `customRoleReachesResource`, che e la funzione pura: togliere il cancello dal predicato lasciava tutto verde",
  );

  /*
    E la stessa domanda su una risorsa che una chiave governa e che il registro
    serve: se qualcuno degradasse la voce della mappa, questa cade.
  */
  prova(
    "U-64 e vale per ogni risorsa governata, non per una sola",
    { sconti: "negato", certificati: "negato" },
    {
      sconti: await elencaComeRuolo(senzaChiavi, "discounts"),
      certificati: await elencaComeRuolo(senzaChiavi, "medical_certificates"),
    },
  );
};

const u65 = async () => {
  /* ================================================================== */
  /*  U-65 — la nona revisione: il denaro due volte, e le due chiavi     */
  /*         [CRITICAL: denaro, salute]                                  */
  /* ================================================================== */

  console.log(
    `${NL}U-65 — il denaro che usciva due volte, e le due chiavi   [CRITICAL]`,
  );

  /* --- 1. il legame di famiglia: servono entrambe le chiavi --- */
  const soloAccessi = "custom:collaborator:accessi#accounts.athlete.manage";
  const soloClinico = "custom:collaborator:clinico#clinical.read";
  const entrambe =
    "custom:collaborator:segreteria#accounts.athlete.manage,clinical.read";

  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { data: { guardians: [{ id: "g-madre", firstName: "Anna" }] } },
  });

  const provaLegame = async (ruolo, email) => {
    /* ogni tentativo riparte dallo stesso archivio: le tre prove sono
       indipendenti, altrimenti la prima che passa spegne le altre */
    await prisma.athlete.update({
      where: { id: ATLETA_A },
      data: { data: { guardians: [{ id: "g-madre", firstName: "Anna" }] } },
    });

    return risorse
      .updateResource(
        "athletes",
        ATLETA_A,
        {
          data: {
            guardians: [
              { id: "g-madre", firstName: "Anna" },
              { id: "g-nuovo", firstName: "Chi Prova", email },
            ],
          },
        },
        { ...scopeRuolo("collaborator"), activeRole: ruolo },
      )
      .then(() => "riuscita")
      .catch((errore) =>
        String(errore?.message || "").includes("Accesso negato")
          ? "negato"
          : `errore: ${errore?.message}`,
      );
  };

  prova(
    "U-65 un legame verso un'utenza vera chiede entrambe le chiavi",
    { soloAccessi: "negato", soloClinico: "negato", entrambe: "riuscita" },
    {
      soloAccessi: await provaLegame(soloAccessi, utenti.staff.email),
      soloClinico: await provaLegame(soloClinico, utenti.staff.email),
      entrambe: await provaLegame(entrambe, utenti.staff.email),
    },
    "la stesura precedente aveva **sostituito** la chiave clinica invece di aggiungerla: chi non vedeva il clinico se lo riprendeva legandosi",
  );

  prova(
    "U-65 e chi si e legato con entrambe e davvero famiglia",
    true,
    await cruscottoFamiglia.canParentAccessAthlete(utenti.staff.id, ATLETA_A),
    "controspecchio: se negasse sempre, il legame non si potrebbe piu creare da nessuno",
  );

  /*
    E la correzione di un refuso — un indirizzo che non e di nessuno — non e una
    concessione, e non deve chiedere niente. Era il difetto opposto: una
    «Segreteria» di club non poteva piu correggere un'email sbagliata.
  */
  await prisma.athlete.update({
    where: { id: ATLETA_A },
    data: { data: { guardians: [{ id: "g-madre", firstName: "Anna" }] } },
  });

  prova(
    "U-65 ma correggere un'email che non e di nessuno non chiede niente",
    "riuscita",
    await provaLegame(
      "custom:collaborator:segreteria-ridotta#members.register.read",
      "refuso-u65@example.invalid",
    ),
    "cio che concede accesso non e scrivere un indirizzo: e scriverne uno che corrisponde a un'utenza",
  );

  /* --- 2. il denaro che usciva due volte --- */
  const persona = await prisma.sportWorkPerson
    .create({
      data: {
        organization_id: CLUB_A,
        first_name: "Ugo",
        last_name: "Sessantacinque",
      },
    })
    .catch((e) => {
      console.log("DEBUG persona:", String(e?.message).slice(0, 120));
      return null;
    });

  if (persona) {
    const premio = await prisma.sportWorkBonus
      .create({
        data: {
          organization_id: CLUB_A,
          person_id: persona.id,
          amount: 1000,
          reason: "Premio U-65",
          award_date: new Date(),
          status: "SCHEDULED",
        },
      })
      .catch((e) => {
        console.log("DEBUG premio:", String(e?.message).slice(0, 120));
        return null;
      });

    if (premio) {
      const scopeLavoro = {
        ...scopeRuolo("owner"),
        actorEmail: utenti.owner.email,
      };

      /*
        Due erogazioni **in parallelo**: e il doppio clic, o il retry di una
        richiesta lenta. Prima passavano entrambe.
      */
      const esiti = await Promise.allSettled([
        agenda.payBonus(premio.id, {}, scopeLavoro),
        agenda.payBonus(premio.id, {}, scopeLavoro),
      ]);

      const riuscite = esiti.filter((e) => e.status === "fulfilled").length;
      const uscite = await prisma.sportWorkOutboundTransaction.count({
        where: { person_id: persona.id },
      });

      prova(
        "U-65 un premio non si eroga due volte in parallelo",
        { riuscite: 1, righeDiUscita: 1 },
        { riuscite, righeDiUscita: uscite },
        "`findUnique` dentro una transazione non blocca niente, e la variabile si chiamava `locked`: misurato 1000 euro usciti due volte",
      );

      await prisma.sportWorkOutboundTransaction
        .deleteMany({ where: { person_id: persona.id } })
        .catch(() => {});
      await prisma.sportWorkBonus
        .deleteMany({ where: { person_id: persona.id } })
        .catch(() => {});
    }

    await prisma.sportWorkPerson
      .delete({ where: { id: persona.id } })
      .catch(() => {});
  }

  await prisma.athlete.update({ where: { id: ATLETA_A }, data: { data: {} } });
};

const u66 = async () => {
  /* ================================================================== */
  /*  U-66 — la nona revisione, seconda tornata: quattro porte senza     */
  /*         perimetro, e un IBAN che usciva in lettura   [HIGH]         */
  /* ================================================================== */

  console.log(
    `${NL}U-66 — quattro porte senza perimetro, e un IBAN in lettura   [HIGH]`,
  );

  const perimetroSedeA = [{ kind: "site", value: SEDE_A }];

  /* ---------------------------------------------------------------- */
  /*  1. l'IBAN esce solo da chi amministra, e si misura dalla rotta   */
  /* ---------------------------------------------------------------- */

  const personaIban = await prisma.sportWorkPerson.create({
    data: {
      organization_id: CLUB_A,
      first_name: "Iba",
      last_name: "Sessantasei",
      iban: "IT60X0542811101000000123456",
    },
  });

  const leggiPersona = async (utenteAttore, ruolo) => {
    await comeUtente(utenteAttore, CLUB_A);
    const risposta = await rotte.personaLavoro.GET(
      richiesta(`/api/v1/sport-work/people/${personaIban.id}`, {
        headers: { "x-active-access-role": ruolo },
      }),
      { params: { id: personaIban.id } },
    );
    SESSIONE = null;
    CLUB_ATTIVO = null;
    const corpo = await risposta.json().catch(() => ({}));
    return { stato: risposta.status, dati: corpo?.data || {} };
  };

  /*
    Un ruolo di club costruito su `club_manager` con la sola lettura: e
    esattamente la figura che prepara i bonifici senza poterli disporre, ed e
    la ragione per cui `sport_work.read` esiste separata da `manage`.

    Il ruolo si crea **in archivio** e si assegna a una tessera vera: il
    gettone effimero `custom:...#chiavi` lo compone lo scope dalla riga, non
    l'intestazione della richiesta. Passarlo a mano misurerebbe una sessione
    che non esiste.
  */
  const ruoloContabile = await ruoliDiClub.createClubRole(
    { ...scopeRuolo("owner"), actorEmail: utenti.owner.email },
    {
      name: "Contabile Sonda",
      baseRole: "club_manager",
      permissions: ["sport_work.read"],
    },
  );

  await ruoliDiClub.assignClubRole(
    { ...scopeRuolo("owner"), actorEmail: utenti.owner.email },
    { userId: utenti.staff.id, role: ruoloContabile.slug },
  );

  const inLettura = await leggiPersona(utenti.staff, ruoloContabile.slug);
  const inGestione = await leggiPersona(utenti.owner, "owner");

  prova(
    "U-66 l'IBAN non esce a chi ha la sola lettura del lavoro sportivo",
    { stato: 200, iban: undefined, has_iban: true },
    {
      stato: inLettura.stato,
      iban: inLettura.dati.iban,
      has_iban: inLettura.dati.has_iban,
    },
    "`projectPersonForList` lo toglieva dall'elenco e dichiarava che si legge aprendo la scheda «con `sport_work.manage`»: la scheda chiedeva `read` e restituiva la riga intera",
  );

  prova(
    "U-66 ma chi amministra le coordinate bancarie le vede",
    { stato: 200, iban: "IT60X0542811101000000123456" },
    { stato: inGestione.stato, iban: inGestione.dati.iban },
    "controspecchio: una redazione che togliesse sempre l'IBAN renderebbe impossibile disporre un bonifico, e nessuna prova di diniego se ne accorgerebbe",
  );

  await prisma.sportWorkPerson
    .delete({ where: { id: personaIban.id } })
    .catch(() => {});

  await prisma.organizationUser
    .deleteMany({
      where: {
        organization_id: CLUB_A,
        user_id: utenti.staff.id,
        custom_role_id: ruoloContabile.id,
      },
    })
    .catch(() => {});
  await prisma.clubRole
    .delete({ where: { id: ruoloContabile.id } })
    .catch(() => {});

  /* ---------------------------------------------------------------- */
  /*  2. fattura e ricevuta seguono l'atleta                           */
  /* ---------------------------------------------------------------- */

  const fatturaDentro = await prisma.invoice.create({
    data: {
      organization_id: CLUB_A,
      athlete_id: ATLETA_A,
      invoice_number: "U66-DENTRO",
      issue_date: new Date(),
      amount: 100,
      description: "Quota U66-DENTRO",
      status: "issued",
      updated_at: new Date(),
    },
  });
  const fatturaFuori = await prisma.invoice.create({
    data: {
      organization_id: CLUB_A,
      athlete_id: ATLETA_ALTRUI,
      invoice_number: "U66-FUORI",
      issue_date: new Date(),
      amount: 200,
      description: "Quota U66-FUORI",
      status: "issued",
      updated_at: new Date(),
    },
  });

  const numeriFattura = async (scope) => {
    const pagina = await risorse.listResourcePage(
      "invoices",
      new URLSearchParams({ organization_id: CLUB_A }),
      scope,
    );
    return (pagina.records || [])
      .map((riga) => riga.invoice_number)
      .filter((numero) => String(numero || "").startsWith("U66-"))
      .sort();
  };

  prova(
    "U-66 le fatture di un minore fuori perimetro non si elencano",
    ["U66-DENTRO"],
    await numeriFattura({
      ...scopeRuolo("club_manager"),
      accessScopes: perimetroSedeA,
    }),
    "il documento fiscale di un minore porta nome, indirizzo, codice fiscale e importo: e la stessa anagrafica che il perimetro toglie, su carta intestata",
  );

  prova(
    "U-66 e senza perimetro si vedono tutte e due",
    ["U66-DENTRO", "U66-FUORI"],
    await numeriFattura(scopeRuolo("club_manager")),
    "controspecchio: zero righe di perimetro significano **tutto il club**, e un filtro che negasse sempre romperebbe la contabilita di ogni club che non usa le sedi",
  );

  await prisma.invoice
    .deleteMany({ where: { id: { in: [fatturaDentro.id, fatturaFuori.id] } } })
    .catch(() => {});

  /* ---------------------------------------------------------------- */
  /*  3. il roster della stagione e una mappa atleta -> sede           */
  /* ---------------------------------------------------------------- */

  /*
    Si misura sull'atleta dell'**altra** sede, non su un elenco fisso: le
    prove che lo precedono spostano appartenenze, e un elenco atteso alla
    lettera misurerebbe la loro scia invece del perimetro.
  */
  const roster = async (accessScopes) =>
    (
      await appartenenzeStagione.listSeasonRoster({
        organizationId: CLUB_A,
        sourceCategoryIds: [CATEGORIA],
        accessScopes,
      })
    ).athletes.map((atleta) => atleta.athleteId);

  const rosterRecintato = await roster(perimetroSedeA);
  const rosterIntero = await roster([]);

  prova(
    "U-66 il roster della riconferma rispetta il perimetro",
    { fuoriPerimetro: false, vuoto: false },
    {
      fuoriPerimetro: rosterRecintato.includes(ATLETA_ALTRUI),
      vuoto: rosterRecintato.length === 0,
    },
    "la rotta chiede `seasons.change`, che e della direzione: ma un ruolo di club puo avere quella chiave **e** un recinto, e l'elenco dava la corrispondenza completa atleta -> sede",
  );

  prova(
    "U-66 e senza perimetro il roster contiene anche l'altra sede",
    true,
    rosterIntero.includes(ATLETA_ALTRUI),
    "controspecchio: il passo di riconferma esiste per vedere chi si sta per riportare, e un filtro sempre chiuso lo spegnerebbe",
  );

  /* ---------------------------------------------------------------- */
  /*  4. il pubblico di una comunicazione                              */
  /* ---------------------------------------------------------------- */

  const destinatari = async (accessScopes) => {
    const esito = await pubblico.resolveAudience({
      organizationId: CLUB_A,
      criteria: [{ kind: "all_families" }],
      scope: { ...scopeRuolo("club_manager"), accessScopes },
      actorRole: "club_manager",
    });
    const nomi = new Set();
    for (const gruppo of [esito.recipients || [], esito.exclusions || []]) {
      for (const voce of gruppo) {
        nomi.add(String(voce.athleteName || ""));
      }
    }
    return [...nomi];
  };

  const nomeAltrui = (nome) => nome.includes("Altrui");
  const pubblicoRecintato = await destinatari(perimetroSedeA);
  const pubblicoIntero = await destinatari([]);

  prova(
    "U-66 il pubblico di una comunicazione rispetta il perimetro",
    false,
    pubblicoRecintato.some(nomeAltrui),
    "«manda a tutte le famiglie» chiedeva il permesso di comunicare e non il recinto di chi comunica: il permesso e fra i primi che un club delega, e lo delega **insieme** a un recinto",
  );

  prova(
    "U-66 e senza perimetro il pubblico raggiunge anche l'altra sede",
    true,
    pubblicoIntero.some(nomeAltrui),
    "controspecchio: senza questa riga un filtro sempre chiuso spegnerebbe la comunicazione massiva e nessuna prova di diniego lo direbbe",
  );

  /* ---------------------------------------------------------------- */
  /*  5. un codice che risponde per due club non si riscatta           */
  /* ---------------------------------------------------------------- */

  const nomeGettone = "U66OMONIMO";

  const coniaGettone = (clubId) =>
    prisma.clubResourceItem.create({
      data: {
        organization_id: clubId,
        resource_type: "access_tokens",
        name: nomeGettone,
        status: "active",
        payload: {
          role: "collaborator",
          minted_by_role: "owner",
          one_time: true,
        },
        updated_at: new Date(),
      },
    });

  const riscatta = async () => {
    await comeUtente(utenti.staff, CLUB_A);
    const risposta = await rotte.riscatto.POST(
      richiesta("/api/v1/auth/access/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: nomeGettone }),
      }),
    );
    SESSIONE = null;
    CLUB_ATTIVO = null;
    return risposta.status;
  };

  const gettoneA = await coniaGettone(CLUB_A);
  const gettoneB = await coniaGettone(CLUB_B);

  prova(
    "U-66 un codice che risponde per due club viene rifiutato",
    409,
    await riscatta(),
    "si teneva «il piu recente»: chi conosce un codice ne coniava uno omonimo nel proprio club e da quel momento era il suo club a rispondere",
  );

  await prisma.clubResourceItem.delete({ where: { id: gettoneB.id } });

  prova(
    "U-66 e quando il codice e di un club solo il riscatto arriva alla verifica",
    true,
    (await riscatta()) !== 409,
    "controspecchio: rifiutare sempre spegnerebbe l'onboarding, e la prova qui sopra passerebbe lo stesso",
  );

  await prisma.clubResourceItem
    .deleteMany({ where: { name: nomeGettone } })
    .catch(() => {});
  await prisma.organizationUser
    .deleteMany({
      where: {
        organization_id: CLUB_A,
        user_id: utenti.staff.id,
        role: "collaborator",
      },
    })
    .catch(() => {});
};

const u67 = async () => {
  /* ================================================================== */
  /*  U-67 — i contributi: il beneficiario di un altro club, e il        */
  /*         maturato di un altro bando               [tenant, denaro]   */
  /* ================================================================== */

  console.log(
    `${NL}U-67 — il beneficiario di un altro club, e il maturato di un altro bando`,
  );

  const scopeFondi = { ...scopeRuolo("owner"), actorEmail: utenti.owner.email };

  const bando = async (nome) =>
    contributi.createFundingProgram(
      {
        organizationId: CLUB_A,
        name: nome,
        funderName: "Ente Sonda",
        validFrom: "2026-01-01",
        validTo: "2026-12-31",
        athletePlafond: 500,
        totalPlafond: 5000,
        periodAmount: 100,
        periodFrequency: "monthly",
        unmetBehavior: "full",
        accrualSource: "easygame_attendance",
      },
      scopeFondi,
    );

  const bandoUno = await bando("Bando U-67 uno");
  const bandoDue = await bando("Bando U-67 due");

  /* --- 1. il beneficiario deve essere del club del bando --- */

  const iscrivi = (programId, athleteId) =>
    contributi
      .createFundingEnrollment({ programId, athleteId }, scopeFondi)
      .then(() => "riuscita")
      .catch((errore) => String(errore?.message || "errore"));

  prova(
    "U-67 un atleta di un altro club non si iscrive a un bando",
    "Atleta non trovato",
    await iscrivi(bandoUno.id, ATLETA_B),
    "il bando si risolveva nello scope e la riga nasceva con la sua organizzazione: ma il calcolo del maturato legge **le presenze del beneficiario**, e la frequenza di un minore dice dove si trova due volte a settimana",
  );

  prova(
    "U-67 e un atleta del club si iscrive",
    "riuscita",
    await iscrivi(bandoUno.id, ATLETA_A),
    "controspecchio: una guardia che negasse sempre spegnerebbe i contributi, e la prova qui sopra passerebbe lo stesso",
  );

  /* --- 2. un maturato appartiene al suo bando --- */

  await contributi.createFundingEnrollment(
    { programId: bandoDue.id, athleteId: ATLETA_ALTRUI },
    scopeFondi,
  );

  const iscrizioneDue = (
    await contributi.listFundingEnrollments(
      { programId: bandoDue.id },
      scopeFondi,
    )
  )[0];

  /*
    Il maturato non porta il bando: lo porta la sua iscrizione. E la ragione
    per cui la guardia deve leggerlo di li, e la ragione per cui una prima
    stesura — che cercava `program_id` sulla riga — avrebbe rifiutato **ogni**
    liquidazione senza che nessuna prova di diniego se ne accorgesse.
  */
  const maturatoDue = await prisma.fundingAccrual.create({
    data: {
      organization_id: CLUB_A,
      enrollment_id: iscrizioneDue.id,
      period_index: 1,
      period_label: "Gennaio 2026",
      period_start: new Date("2026-01-01"),
      period_end: new Date("2026-01-31"),
      requirement_min: 0,
      requirement_unit: "hours",
      requirement_met: true,
      eligible_amount: 100,
      accrued_amount: 100,
      status: "confirmed",
      confirmed_at: new Date(),
      computed_at: new Date(),
    },
  });

  const liquida = (programId, accrualId) =>
    contributi
      .createFundingSettlement(
        {
          programId,
          amount: 100,
          lines: [{ accrualId, amount: 100 }],
        },
        scopeFondi,
      )
      .then(() => "riuscita")
      .catch((errore) => String(errore?.message || "errore"));

  prova(
    "U-67 il maturato di un bando non chiude il credito di un altro",
    "Una riga della liquidazione non appartiene a questo programma",
    await liquida(bandoUno.id, maturatoDue.id),
    "il club era verificato, il bando no: il rendiconto che si manda all'ente conteneva ore che quell'ente non ha finanziato",
  );

  prova(
    "U-67 e sul proprio bando la liquidazione passa",
    "riuscita",
    await liquida(bandoDue.id, maturatoDue.id),
    "controspecchio: senza questa riga un vincolo sempre chiuso renderebbe impossibile liquidare, e nessuna prova di diniego lo direbbe",
  );

  /* --- pulizia --- */
  await prisma.fundingSettlement
    .deleteMany({ where: { organization_id: CLUB_A } })
    .catch(() => {});
  await prisma.fundingAccrual
    .deleteMany({ where: { organization_id: CLUB_A } })
    .catch(() => {});
  await prisma.fundingEnrollment
    .deleteMany({ where: { program_id: { in: [bandoUno.id, bandoDue.id] } } })
    .catch(() => {});
  await prisma.fundingProgram
    .deleteMany({ where: { id: { in: [bandoUno.id, bandoDue.id] } } })
    .catch(() => {});
};

/* ------------------------------------------------------------- il giro */

try {
  eventi = await carica("src/lib/server/events.ts");
  documenti = await carica("src/lib/server/document-requests.ts");
  datiPersonali = await carica("src/lib/server/data-subject.ts");
  permessiAllegati = await carica("src/lib/server/attachment-permissions.ts");
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
  compilazioni = await carica("src/lib/server/form-submissions.ts");
  ruoliDiAccesso = await carica("src/lib/access-roles.ts");
  permessiContabili = await carica("src/lib/accounting/permissions.ts");
  agenda = await carica("src/lib/server/sport-work-agenda.ts");
  pubblico = await carica("src/lib/server/audience.ts");
  contributi = await carica("src/lib/server/funding.ts");
  appartenenzeStagione = await carica("src/lib/server/season-memberships.ts");
  segnaposto = await carica("src/lib/server/document-placeholders.ts");

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
  await u49();
  await u50();
  await u51();
  await u52();
  await u53();
  await u54();
  await u55();
  await u56();
  await u57();
  await u58();
  await u59();
  await u60();
  await u61();
  await u62();
  await u63();
  await u64();
  await u65();
  await u66();
  await u67();

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
