/**
 * **La sonda dei ruoli personalizzati della Wave 6, contro un database vero.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/wave-6-roles-probe.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Perche i ruoli personalizzati sono la prima cosa della Wave 6 che un club
 * puo **configurare male**, e perche fino a ieri la configurabilita che la
 * schermata dei permessi prometteva era in buona parte finta: cinque caselle
 * che agivano su un bit solo, tre che non agivano affatto, e un `club_manager`
 * che poteva creare una tessera `owner` per chiunque.
 *
 * Un test unitario verifica che una matrice contenga una chiave. Questa sonda
 * verifica un'altra cosa, ed e la sola che conti:
 *
 * > togli la chiave → la guardia risponde **negato**;
 * > rimetti la chiave → risponde **concesso**.
 *
 * Il giro e completo: la riga di `club_role_permissions` viene tolta
 * **dall'archivio**, la sessione viene ricostruita da
 * `resolveOrganizationScopeForUser` — che e chi fabbrica il gettone
 * `custom:<base>:<slug>#chiavi` — e la domanda viene posta alla stessa guardia
 * che le rotte pongono. Fabbricare il gettone a mano avrebbe saltato
 * l'anello dove il difetto e piu probabile: la lettura delle righe.
 *
 * Copre U-25…U-30.
 *
 * ## La regola di questo file
 *
 * **La sonda misura, non corregge.** Un difetto e un `FAIL` con il valore
 * osservato accanto; una scelta deliberata e un `DEVIA` con il motivo.
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

const SEDE_1 = "sede-uat6r-nord";
const SEDE_2 = "sede-uat6r-sud";
const CAT_1 = "cat-uat6r-u12";
const CAT_2 = "cat-uat6r-u15";

const ATLETA_NORD = randomUUID();
const ATLETA_SUD = randomUUID();
const ATLETA_B = randomUUID();

let PROPRIETARIO = null;
let GESTORE = null;
let SEGRETERIA = null;
let DIRETTORE = null;
let PROPRIETARIO_B = null;

let ruoliDiClub;
let ruoloModello;
let catalogo;
let autenticazione;
let risorse;
let eventi;
let documenti;
let appuntamenti;
let contiAtleta;
let registro;

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

const respinta = async (titolo, azione, atteso = /Accesso negato/) => {
  try {
    await azione();
    prova(titolo, "respinta", "riuscita");
    return "";
  } catch (errore) {
    const messaggio = String(errore?.message || errore);
    prova(
      titolo,
      "respinta",
      atteso.test(messaggio) ? "respinta" : "respinta-altro",
      messaggio.slice(0, 140),
    );
    return messaggio;
  }
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
      last_name: "Ruoli",
      password_hash: "$2b$10$uat6r",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const pulisciResidui = async () => {
  /*
    Un ruolo residuo di un'esecuzione interrotta ha lo **stesso slug** — lo
    slug si deriva dal nome — e `createClubRole` rifiuterebbe il duplicato:
    la sonda si fermerebbe alla prima riga invece di misurare. Vedi la stessa
    nota in `wave-6-uat.mjs`.
  */
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "uat6r-" } },
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

  PROPRIETARIO = await utente("uat6r-proprietario@example.invalid", "Ada");
  GESTORE = await utente("uat6r-gestore@example.invalid", "Bruno");
  SEGRETERIA = await utente("uat6r-segreteria@example.invalid", "Clara");
  DIRETTORE = await utente("uat6r-direttore@example.invalid", "Dino");
  PROPRIETARIO_B = await utente("uat6r-proprietario-b@example.invalid", "Ester");

  await prisma.club.create({
    data: {
      id: CLUB_A,
      slug: `uat6r-a-${Date.now()}`,
      name: "ASD Ruoli A",
      creator_id: PROPRIETARIO.id,
      settings: {},
      categories: [
        { id: CAT_1, name: "Under 12" },
        { id: CAT_2, name: "Under 15" },
      ],
      club_sites: [
        { id: SEDE_1, name: "Sede Nord", active: true },
        { id: SEDE_2, name: "Sede Sud", active: true },
      ],
      trainers: [],
      trainings: [],
      matches: [],
      updated_at: new Date(),
    },
  });

  await prisma.club.create({
    data: {
      id: CLUB_B,
      slug: `uat6r-b-${Date.now()}`,
      name: "ASD Ruoli B",
      creator_id: PROPRIETARIO_B.id,
      settings: {},
      categories: [],
      club_sites: [],
      updated_at: new Date(),
    },
  });

  await prisma.organizationUser.createMany({
    data: [
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        user_id: GESTORE.id,
        role: "club_manager",
        is_primary: true,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_B,
        user_id: PROPRIETARIO_B.id,
        role: "owner",
        is_primary: true,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.athlete.createMany({
    data: [
      {
        id: ATLETA_NORD,
        organization_id: CLUB_A,
        first_name: "Nord",
        last_name: "Ruoli",
        category_id: CAT_1,
        category_name: "Under 12",
        status: "active",
        data: {},
        updated_at: new Date(),
      },
      {
        id: ATLETA_SUD,
        organization_id: CLUB_A,
        first_name: "Sud",
        last_name: "Ruoli",
        category_id: CAT_2,
        category_name: "Under 15",
        status: "active",
        data: {},
        updated_at: new Date(),
      },
      {
        id: ATLETA_B,
        organization_id: CLUB_B,
        first_name: "Altrove",
        last_name: "Ruoli",
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
        athlete_id: ATLETA_NORD,
        category_id: CAT_1,
        category_name: "Under 12",
        is_primary: true,
        site_id: SEDE_1,
        updated_at: new Date(),
      },
      {
        id: randomUUID(),
        organization_id: CLUB_A,
        athlete_id: ATLETA_SUD,
        category_id: CAT_2,
        category_name: "Under 15",
        is_primary: true,
        site_id: SEDE_2,
        updated_at: new Date(),
      },
    ],
  });

  const scopeProprietario = scopeCanonico(PROPRIETARIO.id, "owner");
  await eventi.createClubEvent(scopeProprietario, "training", {
    id: "uat6r-nord",
    date: "2026-09-10",
    time: "18:00",
    title: "Allenamento Nord",
    categoryId: CAT_1,
    siteId: SEDE_1,
  });
  await eventi.createClubEvent(scopeProprietario, "training", {
    id: "uat6r-sud",
    date: "2026-09-11",
    time: "18:00",
    title: "Allenamento Sud",
    categoryId: CAT_2,
    siteId: SEDE_2,
  });
};

const pulisci = async () => {
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: [CLUB_A, CLUB_B] } } })
    .catch(() => {});
  for (const id of [CLUB_A, CLUB_B]) {
    await prisma.club.delete({ where: { id } }).catch((errore) => {
      console.error(`Pulizia non riuscita, il club ${id} e rimasto: ${errore?.message}`);
    });
  }
};

/* ------------------------------------------------------------- lo scope */

const scopeCanonico = (userId, role, organizationId = CLUB_A) => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole: role,
  activeMembershipId: null,
  allowedOrganizationIds: [organizationId],
  accessScopes: [],
});

/**
 * **La sessione vera di una persona, ricostruita dall'archivio.**
 *
 * Non si fabbrica il gettone: lo si fa fabbricare a chi lo fabbrica in
 * produzione. E l'unico modo di provare che le righe di
 * `club_role_permissions` arrivino davvero fino alla guardia — che era il
 * pezzo nuovo, e quindi quello dove un difetto puo esserci.
 */
const sessioneDi = async (userId) =>
  autenticazione.resolveOrganizationScopeForUser(userId);

/* ==================================================================== */
/*  U-25 — i due ruoli del §24 del mandato                              */
/* ==================================================================== */

/* Le chiavi che una segreteria deve avere, dette per nome e non dedotte. */
const CHIAVI_SEGRETERIA = [
  "documents.request",
  "documents.review",
  "documents.read_dossier",
  "documents.templates.read",
  "appointments.read",
  "appointments.manage",
  "appointments.request",
  "members.register.read",
  "clinical.status_read",
];

/* E quelle di un direttore sportivo. */
const CHIAVI_DIRETTORE = [
  "events.read",
  "events.manage",
  "events.convoke",
  "events.attendance",
  "rsvp.read",
  "clinical.status_read",
];

let RUOLO_SEGRETERIA = null;
let RUOLO_DIRETTORE = null;
let TESSERA_SEGRETERIA = null;
let TESSERA_DIRETTORE = null;

const u25 = async () => {
  console.log(`${NL}U-25 — «Segreteria» da Collaborator, «Direttore Sportivo» da Staff`);
  const scopeProprietario = {
    ...scopeCanonico(PROPRIETARIO.id, "owner"),
    actorEmail: PROPRIETARIO.email,
  };

  RUOLO_SEGRETERIA = await ruoliDiClub.createClubRole(scopeProprietario, {
    name: "Segreteria",
    description: "Atleti, documenti, iscrizioni, appuntamenti",
    baseRole: "collaborator",
    permissions: CHIAVI_SEGRETERIA,
  });
  RUOLO_DIRETTORE = await ruoliDiClub.createClubRole(scopeProprietario, {
    name: "Direttore Sportivo",
    description: "Atleti, allenatori, eventi, gare, programmazione",
    baseRole: "staff",
    permissions: CHIAVI_DIRETTORE,
  });

  prova(
    "U-25 i due ruoli nascono con lo slug che porta la base dentro il nome",
    ["custom:collaborator:segreteria", "custom:staff:direttore-sportivo"],
    [RUOLO_SEGRETERIA.slug, RUOLO_DIRETTORE.slug],
    "senza la base nel nome la stringa non sarebbe autodescrittiva, e normalizeAccessRole negherebbe tutto",
  );
  prova(
    "U-25 e con esattamente le chiavi chieste, niente di piu",
    [[...CHIAVI_SEGRETERIA].sort(), [...CHIAVI_DIRETTORE].sort()],
    [
      [...RUOLO_SEGRETERIA.permissions].sort(),
      [...RUOLO_DIRETTORE.permissions].sort(),
    ],
  );

  /*
    **Cio che il mandato esclude, e che il tetto rende impossibile.** Compensi
    e configurazione contabile sono chiavi di direzione: non appartengono ne a
    `collaborator` ne a `staff`, quindi non sono nemmeno **proponibili** — non
    e una casella che la schermata mostra e il server ignora.
  */
  const proponibiliSegreteria = new Set(
    ruoloModello
      .listGrantablePermissions("collaborator")
      .map((voce) => voce.key),
  );
  const proponibiliDirettore = new Set(
    ruoloModello.listGrantablePermissions("staff").map((voce) => voce.key),
  );
  prova(
    "U-25 compensi e registro non sono proponibili a una segreteria",
    [false, false, false, false],
    [
      proponibiliSegreteria.has("sport_work.pay"),
      proponibiliSegreteria.has("sport_work.manage"),
      proponibiliSegreteria.has("sport_work.fiscal"),
      proponibiliSegreteria.has("audit.read"),
    ],
  );
  prova(
    "U-25 e un direttore sportivo non puo ricevere i pagamenti",
    [false, false],
    [
      proponibiliDirettore.has("sport_work.pay"),
      proponibiliDirettore.has("members.register.manage"),
    ],
  );
  prova(
    "U-25 nessuna chiave di legame e proponibile a nessuna base",
    [],
    [...proponibiliSegreteria, ...proponibiliDirettore].filter((chiave) =>
      ruoloModello.isLinkGatedPermission(chiave),
    ),
  );

  /* E `owner` non e una base: la proprieta non e un modello da clonare. */
  await respinta(
    "U-25 un ruolo personalizzato non si clona da `owner`",
    () =>
      ruoliDiClub.createClubRole(scopeProprietario, {
        name: "Falso proprietario",
        baseRole: "owner",
        permissions: ["events.read"],
      }),
    /non e clonabile/i,
  );

  const assegnataSegreteria = await ruoliDiClub.assignClubRole(
    scopeProprietario,
    { userId: SEGRETERIA.id, role: RUOLO_SEGRETERIA.slug, isPrimary: true },
  );
  const assegnataDirettore = await ruoliDiClub.assignClubRole(
    scopeProprietario,
    { userId: DIRETTORE.id, role: RUOLO_DIRETTORE.slug, isPrimary: true },
  );
  TESSERA_SEGRETERIA =
    assegnataSegreteria.membership_id ||
    assegnataSegreteria.id ||
    assegnataSegreteria.membership?.id;
  TESSERA_DIRETTORE =
    assegnataDirettore.membership_id ||
    assegnataDirettore.id ||
    assegnataDirettore.membership?.id;

  const inArchivio = await prisma.organizationUser.findUnique({
    where: { id: TESSERA_SEGRETERIA },
  });
  prova(
    "U-25 in archivio sta lo **slug nudo**, e le chiavi stanno nelle loro righe",
    [RUOLO_SEGRETERIA.slug, true, false],
    [
      inArchivio?.role ?? null,
      Boolean(inArchivio?.custom_role_id),
      String(inArchivio?.role || "").includes("#"),
    ],
  );

  const sessione = await sessioneDi(SEGRETERIA.id);
  prova(
    "U-25 e la sessione fabbrica il gettone, con le chiavi dentro",
    [true, [...CHIAVI_SEGRETERIA].sort().join(",")],
    [
      String(sessione.activeRole || "").startsWith(`${RUOLO_SEGRETERIA.slug}#`),
      String(sessione.activeRole || "").split("#")[1] || "",
    ],
  );
};

/* ==================================================================== */
/*  U-26 — la prova di §10.5, su ognuna delle chiavi dell'editor         */
/* ==================================================================== */

/**
 * Le chiavi del ruolo, riscritte in archivio.
 *
 * Si passa dalle righe e non dal gettone perche e **li** che il difetto puo
 * stare: un motore che leggesse le righe una volta sola, o che cachasse il
 * gettone, supererebbe una prova costruita a mano e fallirebbe in produzione
 * al primo cambio di configurazione.
 */
const riscriviChiavi = async (roleId, chiavi) => {
  await prisma.clubRolePermission.deleteMany({ where: { role_id: roleId } });
  if (chiavi.length) {
    await prisma.clubRolePermission.createMany({
      data: chiavi.map((permission_key) => ({ role_id: roleId, permission_key })),
    });
  }
};

const u26 = async () => {
  console.log(`${NL}U-26 — togli la chiave: negato. Rimettila: concesso.`);

  const casi = [
    { ruolo: RUOLO_SEGRETERIA, utenteId: SEGRETERIA.id, base: "collaborator" },
    { ruolo: RUOLO_DIRETTORE, utenteId: DIRETTORE.id, base: "staff" },
  ];

  for (const caso of casi) {
    const concedibili = ruoloModello
      .listGrantablePermissions(caso.base)
      .map((voce) => voce.key);

    const senza = [];
    const con = [];

    for (const chiave of concedibili) {
      await riscriviChiavi(
        caso.ruolo.id,
        concedibili.filter((altra) => altra !== chiave),
      );
      const sessioneSenza = await sessioneDi(caso.utenteId);
      if (catalogo.roleHasPermission(sessioneSenza.activeRole, chiave)) {
        senza.push(chiave);
      }

      await riscriviChiavi(caso.ruolo.id, concedibili);
      const sessioneCon = await sessioneDi(caso.utenteId);
      if (!catalogo.roleHasPermission(sessioneCon.activeRole, chiave)) {
        con.push(chiave);
      }
    }

    prova(
      `U-26 [${caso.base}] tolta la chiave, la guardia nega — su ${concedibili.length} chiavi`,
      [],
      senza,
      senza.length ? `ancora concesse senza la riga: ${senza.join(", ")}` : "",
    );
    prova(
      `U-26 [${caso.base}] rimessa la chiave, la guardia concede — su ${concedibili.length} chiavi`,
      [],
      con,
      con.length ? `ancora negate con la riga: ${con.join(", ")}` : "",
    );

    /*
      **E il tetto regge anche contro l'archivio.** Una riga di
      `club_role_permissions` che dicesse una chiave fuori dal ruolo base non
      deve concedere niente: un archivio si puo corrompere, il tetto no.
    */
    await riscriviChiavi(caso.ruolo.id, [...concedibili, "sport_work.pay"]);
    const sessioneOltre = await sessioneDi(caso.utenteId);
    prova(
      `U-26 [${caso.base}] una riga fuori dal ruolo base non concede niente`,
      false,
      catalogo.roleHasPermission(sessioneOltre.activeRole, "sport_work.pay"),
      "il tetto e ricalcolato a ogni domanda, non fidato dall'archivio",
    );
  }

  /* Si torna alla configurazione dichiarata dal §24 del mandato. */
  await riscriviChiavi(RUOLO_SEGRETERIA.id, CHIAVI_SEGRETERIA);
  await riscriviChiavi(RUOLO_DIRETTORE.id, CHIAVI_DIRETTORE);

  /*
    **Il giro completo, su quattro chiavi con una funzione vera dietro.**
    `roleHasPermission` e la stessa domanda che le quindici guardie di dominio
    pongono, ma provarla soltanto su di lei significherebbe provare la
    funzione e non il prodotto: qui la chiamata e quella che la schermata fa.
  */
  const conChiave = async (ruolo, chiavi) => {
    await riscriviChiavi(ruolo.id, chiavi);
  };

  const scopeSegreteria = async () => sessioneDi(SEGRETERIA.id);

  await conChiave(RUOLO_SEGRETERIA, CHIAVI_SEGRETERIA);
  const coda = await documenti.listDocumentReviewQueue(
    { ...(await scopeSegreteria()), actorEmail: SEGRETERIA.email },
    { organizationId: CLUB_A },
  );
  prova(
    "U-26 con `documents.review` la coda dei documenti si apre",
    true,
    Array.isArray(coda),
  );

  await conChiave(
    RUOLO_SEGRETERIA,
    CHIAVI_SEGRETERIA.filter((chiave) => chiave !== "documents.review"),
  );
  await respinta(
    "U-26 tolta `documents.review`, la stessa chiamata risponde negato",
    async () =>
      documenti.listDocumentReviewQueue(await scopeSegreteria(), {
        organizationId: CLUB_A,
      }),
  );

  await conChiave(RUOLO_SEGRETERIA, CHIAVI_SEGRETERIA);
  const slot = await appuntamenti.createAppointmentSlot(
    await scopeSegreteria(),
    { siteId: SEDE_1, weekday: 2, startTime: "15:00", endTime: "17:00", durationMinutes: 30 },
    { userId: SEGRETERIA.id },
  );
  prova(
    "U-26 con `appointments.manage` la disponibilita si configura",
    CLUB_A,
    slot.organization_id,
  );

  await conChiave(
    RUOLO_SEGRETERIA,
    CHIAVI_SEGRETERIA.filter((chiave) => chiave !== "appointments.manage"),
  );
  await respinta(
    "U-26 tolta `appointments.manage`, lo stesso atto e respinto",
    async () =>
      appuntamenti.createAppointmentSlot(
        await scopeSegreteria(),
        { siteId: SEDE_1, weekday: 4, startTime: "15:00", endTime: "17:00", durationMinutes: 30 },
        { userId: SEGRETERIA.id },
      ),
  );
  await conChiave(RUOLO_SEGRETERIA, CHIAVI_SEGRETERIA);

  await respinta(
    "U-26 e la segreteria non tocca gli eventi, che non sono suoi",
    async () =>
      eventi.createClubEvent(await scopeSegreteria(), "training", {
        id: "uat6r-non-suo",
        date: "2026-09-20",
        time: "18:00",
        title: "Non e suo",
        categoryId: CAT_1,
      }),
  );

  const scopeDirettore = await sessioneDi(DIRETTORE.id);
  const suoiEventi = await eventi.listClubEvents(scopeDirettore);
  prova(
    "U-26 mentre il direttore sportivo, che ha `events.read`, li vede",
    2,
    suoiEventi.length,
  );

  /*
    **La deviazione dichiarata.** `clinical.read` non nega: **proietta**. Non
    ha una guardia che risponda 403, toglie i campi dalla risposta — ed e la
    stessa scelta che la Wave 5 ha registrato. Provarla con la forma «negato /
    concesso» direbbe «difetto» dove c'e una difesa di forma diversa, e la
    misura giusta e nella sonda di sicurezza, dove il taglio si misura sui
    campi.
  */
  devia(
    "U-26 `clinical.read`",
    "non nega la chiamata: toglie i campi clinici dalla risposta. Il taglio si misura in wave-6-security-probe.mjs, non qui.",
  );
};

/* ==================================================================== */
/*  U-27 / U-28 — il perimetro per sede e per categoria                 */
/* ==================================================================== */

const u27 = async () => {
  console.log(`${NL}U-27 / U-28 — il perimetro per sede e per categoria`);
  const scopeProprietario = {
    ...scopeCanonico(PROPRIETARIO.id, "owner"),
    actorEmail: PROPRIETARIO.email,
  };

  /* Zero righe di perimetro = tutto il club: e cio che rende additiva la migrazione. */
  const senzaPerimetro = await sessioneDi(DIRETTORE.id);
  const tuttiGliAtleti = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    senzaPerimetro,
  );
  prova(
    "U-27 senza perimetro dichiarato si vede tutto il club",
    [ATLETA_NORD, ATLETA_SUD].sort(),
    tuttiGliAtleti.records.map((riga) => riga.id).sort(),
  );

  await ruoliDiClub.updateAssignmentScopes(scopeProprietario, TESSERA_DIRETTORE, [
    { kind: "site", value: SEDE_1 },
  ]);
  const soloNord = await sessioneDi(DIRETTORE.id);
  prova(
    "U-27 il perimetro arriva nella sessione",
    [{ kind: "site", value: SEDE_1 }],
    soloNord.accessScopes,
  );

  const atletiNord = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    soloNord,
  );
  prova(
    "U-27 con perimetro di sede si vedono solo gli atleti di quella sede",
    [ATLETA_NORD],
    atletiNord.records.map((riga) => riga.id),
  );

  const eventiNord = await eventi.listClubEvents(soloNord);
  prova(
    "U-27 e solo gli eventi di quella sede",
    ["uat6r-nord"],
    eventiNord.map((riga) => riga.legacy_id),
  );

  /*
    **Il perimetro su un ruolo CANONICO, che e la porta che nessuna sonda
    esercitava.**

    U-27 qui sopra lo prova sul direttore, che porta un ruolo **personalizzato**
    — cioe la porta gia presidiata. E la stessa forma che il commit `986a497`
    descrive per la scalata precedente: «la sonda lo sfiorava, provando lo
    stesso scenario con un ruolo personalizzato».

    La quinta revisione ha misurato cosa c'era dietro: `resolveOrganizationScopeForUser`
    leggeva `club_access_scopes` **solo** per le tessere con uno slug
    personalizzato. Ma la schermata di gestione accessi offre le caselle Sedi e
    Categorie anche per i ruoli canonici, e `assignClubRole` le scrive. Il
    proprietario assegnava «Collaboratore, solo sede Nord», vedeva la pastiglia,
    l'audit registrava la riga — e la persona vedeva **tutto il club**.

    Una recinzione che si configura, si mostra, si registra e non recinta.
  */
  const tesseraGestore = await prisma.organizationUser.findFirst({
    where: { organization_id: CLUB_A, user_id: GESTORE.id },
    select: { id: true, role: true },
  });

  prova(
    "U-27bis la tessera del gestore porta un ruolo canonico",
    ["club_manager", false],
    [
      tesseraGestore?.role ?? null,
      String(tesseraGestore?.role ?? "").includes("custom:"),
    ],
  );

  await ruoliDiClub.updateAssignmentScopes(
    scopeProprietario,
    tesseraGestore.id,
    [{ kind: "site", value: SEDE_1 }],
  );

  const gestorePerimetrato = await sessioneDi(GESTORE.id);
  prova(
    "U-27bis il perimetro di un ruolo canonico arriva nella sessione",
    [{ kind: "site", value: SEDE_1 }],
    gestorePerimetrato.accessScopes,
    "e la meta che mancava: le righe si scrivevano, la schermata le mostrava, e la sessione non le leggeva",
  );

  const atletiDelGestore = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    gestorePerimetrato,
  );
  prova(
    "U-27bis e restringe davvero cio che vede",
    [ATLETA_NORD],
    atletiDelGestore.records.map((riga) => riga.id),
  );

  /* Rimesso com'era: le prove che seguono non devono ereditare il perimetro. */
  await ruoliDiClub.updateAssignmentScopes(
    scopeProprietario,
    tesseraGestore.id,
    [],
  );

  const prima = await prisma.auditLog.count({
    where: { organization_id: CLUB_A, outcome: "denied" },
  });
  await respinta(
    "U-27 e un atto su un evento fuori dal perimetro e respinto",
    async () =>
      eventi.createClubEvent(soloNord, "training", {
        id: "uat6r-fuori-sede",
        date: "2026-09-22",
        time: "18:00",
        title: "Fuori dal perimetro",
        categoryId: CAT_2,
        siteId: SEDE_2,
      }),
  );
  const dopo = await prisma.auditLog.count({
    where: { organization_id: CLUB_A, outcome: "denied" },
  });
  prova(
    "U-27 e il diniego di perimetro lascia una riga di audit",
    true,
    dopo > prima,
    `dinieghi prima=${prima} dopo=${dopo}`,
  );

  /* U-28 — lo stesso, per categoria. */
  await ruoliDiClub.updateAssignmentScopes(scopeProprietario, TESSERA_DIRETTORE, [
    { kind: "category", value: CAT_2 },
  ]);
  const soloU15 = await sessioneDi(DIRETTORE.id);
  const atletiU15 = await risorse.listResourcePage(
    "athletes",
    new URLSearchParams({ organization_id: CLUB_A }),
    soloU15,
  );
  prova(
    "U-28 con perimetro di categoria si vedono solo gli atleti di quella categoria",
    [ATLETA_SUD],
    atletiU15.records.map((riga) => riga.id),
  );
  prova(
    "U-28 e solo i suoi eventi",
    ["uat6r-sud"],
    (await eventi.listClubEvents(soloU15)).map((riga) => riga.legacy_id),
  );

  /*
    Un perimetro incompleto e una **richiesta sbagliata**, non un tentativo di
    scalata: se passasse, il perimetro nascerebbe vuoto — cioe tutto il club —
    e chi lo ha scritto crederebbe di aver ristretto qualcosa.
  */
  await respinta(
    "U-28 un perimetro senza tipo o senza valore viene rifiutato",
    () =>
      ruoliDiClub.updateAssignmentScopes(scopeProprietario, TESSERA_DIRETTORE, [
        { kind: "site", value: "" },
      ]),
    /perimetro/i,
  );

  /* Si torna senza perimetro, per non falsare le prove che seguono. */
  await ruoliDiClub.updateAssignmentScopes(
    scopeProprietario,
    TESSERA_DIRETTORE,
    [],
  );
};

/* ==================================================================== */
/*  U-29 / U-30 — i quattro tentativi di escalation                     */
/* ==================================================================== */

const u29 = async () => {
  console.log(`${NL}U-29 / U-30 — le quattro scalate, negate e tracciate`);

  /*
    **Il giro di andata e ritorno: dallo slug in archivio all'header e ritorno.**

    Nessuna prova lo copriva, e per questo il difetto e vissuto: le sonde
    chiamano `resolveOrganizationScopeForUser(userId)` **senza header**, cioe
    saltando esattamente il pezzo rotto.

    Il browser normalizzava lo slug prima di salvarlo e mandava la **base** come
    `x-active-access-role`. Il server cerca una tessera con quello slug, non ne
    trova nessuna — la sua e quella personalizzata — e risolve `activeRole:
    null`: menu intero a schermo e **403 su ogni rotta**. La capability di punta
    della Wave era irraggiungibile dall'interfaccia.

    Qui si simula il giro come lo fa il prodotto: si legge lo slug dall'archivio
    esattamente come lo legge il browser, lo si passa come header, e si guarda
    cosa risolve la sessione.
  */
  const tesseraSegreteria = await prisma.organizationUser.findUnique({
    where: { id: TESSERA_SEGRETERIA },
    select: { role: true },
  });

  const comeLoManderebbeIlBrowser = tesseraSegreteria?.role ?? null;

  prova(
    "U-30bis il browser conserva lo slug della tessera, non la sua base",
    [true, false],
    [
      String(comeLoManderebbeIlBrowser || "").startsWith("custom:"),
      comeLoManderebbeIlBrowser === "collaborator",
    ],
    `valore mandato = ${comeLoManderebbeIlBrowser}`,
  );

  const conHeader = await autenticazione.resolveOrganizationScopeForUser(
    SEGRETERIA.id,
    CLUB_A,
    comeLoManderebbeIlBrowser,
  );

  prova(
    "U-30bis e con quell'header la sessione risolve il ruolo, non `null`",
    [true, true],
    [
      Boolean(conHeader.activeRole),
      String(conHeader.activeRole || "").startsWith("custom:"),
    ],
    `activeRole = ${conHeader.activeRole}`,
  );

  /*
    Il controspecchio, che e cio che rendeva il difetto invisibile: mandando la
    **base** — come faceva il browser — la sessione non risolve niente.
  */
  const conLaBase = await autenticazione.resolveOrganizationScopeForUser(
    SEGRETERIA.id,
    CLUB_A,
    String(comeLoManderebbeIlBrowser || "").split(":")[1] || "collaborator",
  );
  prova(
    "U-30bis mentre mandando la base la sessione non risolve nessun ruolo",
    null,
    conLaBase.activeRole,
    "e la ragione per cui una persona con un ruolo personalizzato riceveva 403 ovunque",
  );



  const scopeGestore = {
    ...scopeCanonico(GESTORE.id, "club_manager"),
    actorEmail: GESTORE.email,
  };
  const scopeProprietario = {
    ...scopeCanonico(PROPRIETARIO.id, "owner"),
    actorEmail: PROPRIETARIO.email,
  };

  const dinieghi = async () =>
    prisma.auditLog.count({
      where: { organization_id: CLUB_A, outcome: "denied" },
    });

  /* 1) concedere `owner` — l'atto che oggi un `club_manager` poteva compiere. */
  let prima = await dinieghi();
  await respinta(
    "U-29.1 un gestore non concede il ruolo di proprietario",
    () =>
      ruoliDiClub.assignClubRole(scopeGestore, {
        userId: SEGRETERIA.id,
        role: "owner",
      }),
    /proprietario/i,
  );
  prova(
    "U-30.1 e il tentativo lascia una riga di audit",
    true,
    (await dinieghi()) > prima,
  );

  /* 2) concedere una chiave che non si possiede. */
  const RUOLO_LIMITATO = await ruoliDiClub.createClubRole(scopeProprietario, {
    name: "Gestore limitato",
    baseRole: "club_manager",
    permissions: ["events.read"],
  });
  await ruoliDiClub.assignClubRole(scopeProprietario, {
    userId: GESTORE.id,
    role: RUOLO_LIMITATO.slug,
    isPrimary: true,
  });
  const scopeLimitato = {
    ...(await sessioneDi(GESTORE.id)),
    actorEmail: GESTORE.email,
  };
  prova(
    "U-29.2 il gestore limitato porta una chiave sola",
    [true, false],
    [
      catalogo.roleHasPermission(scopeLimitato.activeRole, "events.read"),
      catalogo.roleHasPermission(scopeLimitato.activeRole, "documents.review"),
    ],
  );

  prima = await dinieghi();
  await respinta(
    "U-29.2 e non puo concedere una chiave che lui non ha",
    () =>
      ruoliDiClub.assignClubRole(scopeLimitato, {
        userId: SEGRETERIA.id,
        role: RUOLO_SEGRETERIA.slug,
      }),
    /non si concede il permesso/i,
  );
  prova(
    "U-30.2 e anche questo tentativo lascia una riga di audit",
    true,
    (await dinieghi()) > prima,
    "altrimenti una scalata tentata e una scalata invisibile",
  );

  /* 3) concedere una chiave di legame. */
  for (const chiave of ruoloModello.LINK_GATED_PERMISSION_KEYS) {
    await respinta(
      `U-29.3 «${chiave}» non si mette su un ruolo`,
      () =>
        ruoliDiClub.createClubRole(scopeProprietario, {
          name: `Legame ${chiave}`,
          baseRole: "collaborator",
          permissions: [chiave],
        }),
      /legame|non appartiene al ruolo base/i,
    );
  }
  /*
    La chiave di legame viene fermata da `validateCustomRoleDraft`, che e una
    **richiesta sbagliata** e non un tentativo di scalata: chi spunta una
    casella impossibile sta sbagliando a compilare. Per questo resta un errore
    parlante e **non** lascia una riga di diniego, e la scelta e dichiarata qui
    invece di essere misurata come una lacuna.
  */
  devia(
    "U-30.3 la chiave di legame non lascia audit",
    "e fermata come richiesta malformata (400), non come tentativo di accesso (403): la distinzione e in `roleDenied` di custom-role.ts.",
  );

  /* 4) auto-promozione: una tessera non si firma da soli. */
  prima = await dinieghi();
  await respinta(
    "U-29.4 nessuno si assegna un ruolo da se",
    () =>
      ruoliDiClub.assignClubRole(scopeProprietario, {
        userId: PROPRIETARIO.id,
        role: RUOLO_SEGRETERIA.slug,
      }),
    /a se stessi/i,
  );
  prova(
    "U-30.4 e l'auto-promozione lascia una riga di audit",
    true,
    (await dinieghi()) > prima,
  );

  /*
    E i tre atti riservati al proprietario, che un gestore non compie: creare,
    modificare e cancellare un ruolo. Prima della Wave 6 `isOwnerAccessRole`
    aveva **zero chiamanti** e `owner` era indistinguibile da `club_manager`.
  */
  const gestoreCanonico = {
    ...scopeCanonico(GESTORE.id, "club_manager"),
    actorEmail: GESTORE.email,
  };
  await respinta(
    "U-29.5 un gestore non crea un ruolo personalizzato",
    () =>
      ruoliDiClub.createClubRole(gestoreCanonico, {
        name: "Ruolo del gestore",
        baseRole: "staff",
        permissions: ["events.read"],
      }),
    /soltanto il proprietario/i,
  );
  await respinta(
    "U-29.5 ne lo cancella",
    () => ruoliDiClub.deleteClubRole(gestoreCanonico, RUOLO_LIMITATO.id),
    /soltanto il proprietario/i,
  );

  /*
    **Il ruolo di un altro club non esiste.** Non «non e permesso»: non
    esiste, e la risposta deve dirlo cosi.
  */
  const scopeAltroClub = {
    ...scopeCanonico(PROPRIETARIO_B.id, "owner", CLUB_B),
    actorEmail: PROPRIETARIO_B.email,
  };
  await respinta(
    "U-29.6 il ruolo di un altro club non si assegna",
    () =>
      ruoliDiClub.assignClubRole(scopeAltroClub, {
        userId: SEGRETERIA.id,
        role: RUOLO_SEGRETERIA.slug,
      }),
    /non esiste in questo club/i,
  );

  const elencoAltrove = await ruoliDiClub.listClubRoles(scopeAltroClub);
  prova(
    "U-29.6 e dall'altro club l'elenco dei ruoli non ne mostra nessuno",
    0,
    elencoAltrove.length,
  );

  /* La revoca chiude il giro: il ruolo si toglie, e la sessione lo perde. */
  await ruoliDiClub.revokeClubAccess(scopeProprietario, TESSERA_SEGRETERIA);
  const dopoRevoca = await sessioneDi(SEGRETERIA.id);
  prova(
    "U-29.7 revocato l'accesso, la sessione non risolve piu quel ruolo",
    [null, false],
    [
      dopoRevoca.activeRole,
      catalogo.roleHasPermission(dopoRevoca.activeRole, "documents.review"),
    ],
  );
};

/* ------------------------------------------------------------- il giro */

try {
  ruoliDiClub = await import("../src/lib/server/club-roles.ts");
  ruoloModello = await import("../src/lib/roles/custom-role.ts");
  catalogo = await import("../src/lib/permissions/catalog.ts");
  autenticazione = await import("../src/lib/server/auth.ts");
  risorse = await import("../src/lib/server/resources.ts");
  eventi = await import("../src/lib/server/events.ts");
  documenti = await import("../src/lib/server/document-requests.ts");
  appuntamenti = await import("../src/lib/server/appointments.ts");
  contiAtleta = await import("../src/lib/server/athlete-accounts.ts");
  registro = await import("../src/lib/server/audit.ts");
  void contiAtleta;
  void registro;

  console.log(`${NL}Semina dei due club ${CLUB_A} / ${CLUB_B}...`);
  await semina();

  await u25();
  await u26();
  await u27();
  await u29();

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
    console.log(`${NL}FALLITI:`);
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
