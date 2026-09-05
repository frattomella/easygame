/**
 * **PP-03 round 6 — §15.4 rotta per rotta: i contenitori ammessi, il ruolo che
 * non ha nessuna delle due chiavi, e le porte che il ruolo non lo passano.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round6-anagrafica-contenitori-probe.mjs
 *
 * `PASS` = attacco respinto / regressione assente. `FAIL` = riuscito.
 * Il club di collaudo si cancella **per identificativo** in `finally`.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok, nota });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(70)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(70)} ${JSON.stringify(valore)}`);

/* --------------------------------------------------------- il trasporto - */

const RADICE = path.resolve("src/app/api");
const scopriRotte = (dir = RADICE, prefisso = []) => {
  const trovate = [];
  for (const voce of fs.readdirSync(dir, { withFileTypes: true })) {
    if (voce.isDirectory()) {
      trovate.push(...scopriRotte(path.join(dir, voce.name), [...prefisso, voce.name]));
    } else if (voce.name === "route.ts") {
      trovate.push({ segmenti: prefisso, file: path.join(dir, voce.name) });
    }
  }
  return trovate;
};
const ROTTE = scopriRotte().sort(
  (a, b) =>
    a.segmenti.filter((s) => s.startsWith("[")).length -
    b.segmenti.filter((s) => s.startsWith("[")).length,
);
const abbina = (percorso) => {
  const segmenti = percorso.replace(/^\/api\//, "").split("/").filter(Boolean);
  for (const rotta of ROTTE) {
    if (rotta.segmenti.length !== segmenti.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segmenti.length; i += 1) {
      const atteso = rotta.segmenti[i];
      if (atteso.startsWith("[")) params[atteso.slice(1, -1)] = decodeURIComponent(segmenti[i]);
      else if (atteso !== segmenti[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { rotta, params };
  }
  return null;
};

const moduli = new Map();
const invia = async (identita, percorso, init = {}) => {
  const url = new URL(String(percorso), "http://collaudo.invalid");
  const metodo = String(init.method || "GET").toUpperCase();
  const headers = new Headers(init.headers || {});
  if (identita?.token) headers.set("authorization", `Bearer ${identita.token}`);
  headers.set("x-active-club-id", identita?.club || CLUB);
  if (identita?.ruolo) headers.set("x-active-access-role", identita.ruolo);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const richiesta = new Request(url.toString(), { ...init, headers });
  const abbinata = abbina(url.pathname);
  if (!abbinata) return { stato: -1, corpo: { error: { message: `NESSUNA-ROTTA ${url.pathname}` } } };
  const chiave = abbinata.rotta.file;
  if (!moduli.has(chiave)) moduli.set(chiave, await import(pathToFileURL(chiave).href));
  const fn = moduli.get(chiave)[metodo];
  if (!fn) return { stato: -1, corpo: { error: { message: `NESSUN-HANDLER ${metodo} ${url.pathname}` } } };
  try {
    const risposta = await fn(richiesta, { params: abbinata.params });
    const corpo = await risposta.json().catch(() => null);
    return { stato: risposta.status, corpo };
  } catch (errore) {
    return { stato: -1, corpo: { error: { message: String(errore?.message) } } };
  }
};

globalThis.fetch = async (input) => {
  throw new Error(`FETCH-ESTERNO ${String(input)}`);
};

const identita = async (riga, ruolo, club) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(riga);
  return { token: sessione.access_token, ruolo, club: club || CLUB };
};

/* ------------------------------------------------------------- gli attori */

const CLUB = randomUUID();
const CAT_A = "cat-r6a-a";
const ATLETA = randomUUID();

let PRESIDENTE = null;
let MISTER = null;
let RISTRETTO = null; /* ruolo di club su base trainer, SENZA clinical.status_read */
let CONSTATUS = null; /* ruolo di club su base trainer, CON clinical.status_read */
let SEGRETARIA = null; /* ruolo di club su base collaborator, SENZA clinical.read */
let PRIVACY = null; /* base club_manager con data_subject.export, SENZA clinical.read */
let GENITORE = null;

let ALLENATORE = null;
let RIST = null;
let CONST = null;
let SEGR = null;
let PRIV = null;
let FAMIGLIA = null;
let CAPO = null;

/*
  **Le parole che non devono uscire.** Sono inventate qui, come vuole la
  regola del commit: elencare i nomi noti verificherebbe l'elenco.
*/
const SEGRETI = {
  dentroTutore: "EPILESSIA-FOCALE-R6A",
  dentroTaglie: "SOFFIO-SISTOLICO-R6A",
  dentroCategorie: "ASMA-DA-SFORZO-R6A",
  dentroPagamenti: "MOROSA-R6A",
  campoSemplice: "DIAGNOSI-PIANA-R6A",
  campoSemplice2: "REFERTO-PIANO-R6A",
  dentroSorgente: "SORGENTE-CLINICA-R6A",
};

const DATA_ATLETA = {
  seasonId: "2026-27",
  name: "Nina",
  surname: "Sonda",
  phone: "+39 333 0000000",
  email: "nina@example.invalid",
  category: "Under 12",
  categoryId: CAT_A,
  categoryName: "Under 12",
  /* le cinque grafie della stessa data: devono restare tutte */
  medicalCertExpiry: "2027-01-01",
  medical_cert_expiry: "2027-01-01",
  medicalCertificateExpiry: "2027-01-01",
  medical_certificate_expiry: "2027-01-01",
  certificateStatus: "valid",
  /* contenitori AMMESSI, con dentro testo clinico */
  guardians: [
    {
      name: "Mara",
      surname: "Sonda",
      phone: "+39 333 1111111",
      relationship: "madre",
      note: `nota: ${SEGRETI.dentroTutore}, terapia in corso`,
    },
  ],
  clothingSizes: { shirt: "M", referto: `esito visita: ${SEGRETI.dentroTaglie}` },
  categories: [{ id: CAT_A, name: "Under 12", anamnesi: SEGRETI.dentroCategorie }],
  payments: [{ id: "p1", amount: 120, note: `famiglia ${SEGRETI.dentroPagamenti}` }],
  /* campi semplici dal nome inventato */
  diagnosi: SEGRETI.campoSemplice,
  referto: SEGRETI.campoSemplice2,
  /* contenitori NON clinici e NON dichiarati: servono a misurare il verso opposto */
  indirizzoDiCasa: { via: "via Roma 1", citta: "Formia" },
  contattiEmergenza: [{ nome: "Zio", telefono: "+39 333 2222222" }],
};

/* -------------------------------------------------------------- la semina */

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "R6a",
      password_hash: "$2b$10$pp03r6a",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const ruoloDiClub = async (slug, base, chiavi) => {
  const riga = await prisma.clubRole.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      slug: `custom:${base}:${slug}`,
      name: slug,
      base_role: base,
      is_active: true,
      updated_at: new Date(),
    },
  });
  for (const chiave of chiavi) {
    await prisma.clubRolePermission.create({
      data: { id: randomUUID(), role_id: riga.id, permission_key: chiave },
    });
  }
  return riga;
};

const semina = async () => {
  /*
    Il prefisso e lungo e proprio di questa sonda: il round 5 ha cancellato il
    club di collaudo `pp03-uat` con un `startsWith("pp03")`.
  */
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r6a-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r6a-presidente@example.invalid", "Anna");
  MISTER = await utente("pp03r6a-mister@example.invalid", "Aldo");
  RISTRETTO = await utente("pp03r6a-ristretto@example.invalid", "Rita");
  CONSTATUS = await utente("pp03r6a-constatus@example.invalid", "Carla");
  SEGRETARIA = await utente("pp03r6a-segretaria@example.invalid", "Sara");
  GENITORE = await utente("pp03r6a-genitore@example.invalid", "Mara");
  PRIVACY = await utente("pp03r6a-privacy@example.invalid", "Pia");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r6a-${Date.now()}`,
      name: "ASD Round6 A",
      creator_id: PRESIDENTE.id,
      settings: {
        seasons: [
          { id: "2026-27", label: "2026/27", startDate: "2026-07-01", endDate: "2027-06-30", status: "active" },
        ],
      },
      categories: [{ id: CAT_A, name: "Under 12" }],
      club_sites: [],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-r6a",
          first_name: "Aldo",
          last_name: "R6a",
          email: MISTER.email,
          linkedUserId: MISTER.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-r6a-rist",
          first_name: "Rita",
          last_name: "R6a",
          email: RISTRETTO.email,
          linkedUserId: RISTRETTO.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-r6a-const",
          first_name: "Carla",
          last_name: "R6a",
          email: CONSTATUS.email,
          linkedUserId: CONSTATUS.id,
          categories: [CAT_A],
          groups: [],
        },
      ],
      staff_members: [],
      trainings: [],
      matches: [],
      appointments: [],
      updated_at: new Date(),
    },
  });

  const ruoloRistretto = await ruoloDiClub("aiuto-allenatore", "trainer", ["events.read"]);
  const ruoloConStatus = await ruoloDiClub("vice", "trainer", ["events.read", "clinical.status_read"]);
  const ruoloSegreteria = await ruoloDiClub("front-office", "collaborator", [
    "events.read",
    "clinical.status_read",
  ]);
  const ruoloPrivacy = await ruoloDiClub("privacy", "club_manager", [
    "clinical.status_read",
    "data_subject.export",
    "data_subject.erase",
  ]);

  const tessere = [
    [PRESIDENTE, "owner", null],
    [MISTER, "trainer", null],
    [RISTRETTO, ruoloRistretto.slug, ruoloRistretto.id],
    [CONSTATUS, ruoloConStatus.slug, ruoloConStatus.id],
    [SEGRETARIA, ruoloSegreteria.slug, ruoloSegreteria.id],
    [PRIVACY, ruoloPrivacy.slug, ruoloPrivacy.id],
    [GENITORE, "parent", null],
  ];
  for (const [riga, ruolo, customId] of tessere) {
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: riga.id,
        role: ruolo,
        custom_role_id: customId,
        is_primary: true,
        updated_at: new Date(),
      },
    });
  }

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Nina",
      last_name: "Sonda",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      data: {
        ...DATA_ATLETA,
        guardians: [{ ...DATA_ATLETA.guardians[0], linkedUserId: GENITORE.id }],
      },
      updated_at: new Date(),
    },
  });

  await prisma.medicalCertificate.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      athlete_id: ATLETA,
      type: "medical",
      status: "valid",
      expiry_date: new Date("2027-01-01"),
      data: { source: { diagnosi: SEGRETI.dentroSorgente } },
      updated_at: new Date(),
    },
  });
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: CLUB } }).catch((e) => {
    console.error(`Pulizia non riuscita: ${e?.message}`);
  });
};

/* ==================================================================== */

const cerca = (corpo) => {
  const testo = JSON.stringify(corpo ?? null);
  return Object.entries(SEGRETI)
    .filter(([, parola]) => testo.includes(parola))
    .map(([nome]) => nome);
};

const PORTE = [
  ["athletes elenco", () => `/api/v1/athletes?club_id=${CLUB}`],
  ["athletes per id", () => `/api/v1/athletes/${ATLETA}`],
  ["simplified_athletes", () => `/api/v1/simplified_athletes?club_id=${CLUB}`],
  ["athletes view=summary", () => `/api/v1/athletes?club_id=${CLUB}&view=summary`],
];

/* ------------------------------------------------------------------- A - */

const contenitoriAmmessi = async () => {
  console.log("\nA — testo clinico dentro un contenitore AMMESSO (allenatore canonico)");
  for (const [nome, url] of PORTE) {
    const r = await invia(ALLENATORE, url());
    prova(`A · ${nome}`, [], cerca(r.corpo), `stato ${r.stato}`);
  }
};

/* ------------------------------------------------------------------- B - */

const ruoliPersonalizzati = async () => {
  console.log("\nB — i ruoli di club basati su trainer");

  const permessi = await carica("src/lib/permissions/catalog.ts");
  info("B-00 ruolo ristretto: status_read", permessi.roleHasPermission("custom:trainer:aiuto-allenatore#events.read", "clinical.status_read"));

  for (const [nome, url] of PORTE) {
    const r = await invia(RIST, url());
    prova(`B-r · ristretto SENZA status_read · ${nome}`, [], cerca(r.corpo), `stato ${r.stato}`);
  }
  for (const [nome, url] of PORTE) {
    const r = await invia(CONST, url());
    prova(`B-c · con status_read · ${nome}`, [], cerca(r.corpo), `stato ${r.stato}`);
  }
};

/* ------------------------------------------------------------------- C - */

const altrePorte = async () => {
  console.log("\nC — le porte che il ruolo non lo passano");

  const profilo = await invia(SEGR, `/api/v1/auth/athlete-profile/${ATLETA}`);
  prova(
    "C-01 · auth/athlete-profile a ruolo di club senza clinical.read",
    [],
    cerca(profilo.corpo),
    `stato ${profilo.stato}`,
  );

  const profiloPriv = await invia(PRIV, `/api/v1/auth/athlete-profile/${ATLETA}`);
  prova(
    "C-01b · auth/athlete-profile a ruolo club_manager senza clinical.read",
    [],
    cerca(profiloPriv.corpo),
    `stato ${profiloPriv.stato}`,
  );

  const esporta = await invia(PRIV, `/api/v1/data-subject/${ATLETA}/export?subject_kind=athlete&organization_id=${CLUB}`);
  prova(
    "C-02 · data-subject export a ruolo senza clinical.read",
    [],
    cerca(esporta.corpo),
    `stato ${esporta.stato}`,
  );
  info("C-02b export: contenitori non dichiarati presenti", {
    stato: esporta.stato,
    indirizzo: JSON.stringify(esporta.corpo ?? null).includes("indirizzoDiCasa"),
    emergenza: JSON.stringify(esporta.corpo ?? null).includes("contattiEmergenza"),
  });

  /*
    La stessa cosa scritta **dalla rotta**, non dal seed: se l'anagrafica
    accetta una chiave nuova dentro un contenitore ammesso, il difetto e
    raggiungibile senza toccare l'archivio.
  */
  const scrittura = await invia(CAPO, `/api/v1/athletes/${ATLETA}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        ...DATA_ATLETA,
        guardians: [
          { ...DATA_ATLETA.guardians[0], linkedUserId: GENITORE.id, note: `viarotta ${SEGRETI.dentroTutore}` },
        ],
      },
    }),
  });
  const riletta = await prisma.athlete.findUnique({ where: { id: ATLETA } });
  info("C-04 la rotta accetta una chiave nuova dentro guardians", {
    patch: scrittura.stato,
    scritta: JSON.stringify(riletta?.data ?? null).includes("viarotta"),
  });

  const creato = await invia(CAPO, "/api/v1/athletes", {
    method: "POST",
    body: JSON.stringify({
      organization_id: CLUB,
      first_name: "Rea",
      last_name: "Sonda",
      status: "active",
      category_id: CAT_A,
      category_name: "Under 12",
      data: {
        seasonId: "2026-27",
        name: "Rea",
        guardians: [{ name: "Ida", phone: "+39 333 9", note: "viacrea EPILESSIA-FOCALE-R6A" }],
        clothingSizes: { shirt: "S", noteLibere: "viacrea2 SOFFIO-SISTOLICO-R6A" },
      },
    }),
  });
  const NUOVO = creato.corpo?.data?.id ?? null;
  const rigaNuova = NUOVO ? await prisma.athlete.findUnique({ where: { id: NUOVO } }) : null;
  info("C-06bis creazione con testo libero dentro contenitori ammessi", {
    stato: creato.stato,
    scritto: JSON.stringify(rigaNuova?.data ?? null).includes("viacrea"),
  });
  if (NUOVO) {
    const letturaAll = await invia(ALLENATORE, `/api/v1/athletes/${NUOVO}`);
    prova(
      "C-06ter · l'allenatore non legge il testo libero creato dentro un contenitore ammesso",
      false,
      JSON.stringify(letturaAll.corpo ?? null).includes("viacrea"),
      `stato ${letturaAll.stato}`,
    );
  }

  const soloTaglie = await invia(CAPO, `/api/v1/athletes/${ATLETA}`, {
    method: "PATCH",
    body: JSON.stringify({ data: { clothingSizes: { shirt: "L", noteLibere: "viasolo SEGRETO-ISOLATO-R6A" } } }),
  });
  const rilettaSolo = await prisma.athlete.findUnique({ where: { id: ATLETA } });
  info("C-06pre PATCH del solo clothingSizes", {
    stato: soloTaglie.stato,
    errore: String(soloTaglie.corpo?.error?.message ?? "").slice(0, 90),
    scritto: JSON.stringify(rilettaSolo?.data ?? null).includes("viasolo"),
    chiavi: Object.keys(rilettaSolo?.data ?? {}),
  });

  const scritturaTaglie = await invia(CAPO, `/api/v1/athletes/${ATLETA}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        ...DATA_ATLETA,
        guardians: [{ ...DATA_ATLETA.guardians[0], linkedUserId: GENITORE.id }],
        clothingSizes: { shirt: "M", noteLibere: `viataglie ${SEGRETI.dentroTaglie}` },
        categories: [{ id: CAT_A, name: "Under 12", promemoria: `viacat ${SEGRETI.dentroCategorie}` }],
      },
    }),
  });
  const rilettaTaglie = await prisma.athlete.findUnique({ where: { id: ATLETA } });
  info("C-06 la rotta accetta chiavi nuove in clothingSizes/categories", {
    patch: scritturaTaglie.stato,
    taglie: JSON.stringify(rilettaTaglie?.data ?? null).includes("viataglie"),
    categorie: JSON.stringify(rilettaTaglie?.data ?? null).includes("viacat"),
  });
  const dopoTaglie = await invia(ALLENATORE, `/api/v1/athletes/${ATLETA}`);
  prova(
    "C-07 · l'allenatore non legge il testo libero scritto in clothingSizes/categories dalla rotta",
    false,
    JSON.stringify(dopoTaglie.corpo ?? null).includes("viataglie") ||
      JSON.stringify(dopoTaglie.corpo ?? null).includes("viacat"),
    `stato ${dopoTaglie.stato}`,
  );

  const dopoScrittura = await invia(ALLENATORE, `/api/v1/athletes/${ATLETA}`);
  prova(
    "C-05 · dopo la scrittura dalla rotta, l'allenatore non legge la nota",
    false,
    JSON.stringify(dopoScrittura.corpo ?? null).includes("viarotta"),
    `stato ${dopoScrittura.stato}`,
  );

  const profiloCapo = await invia(CAPO, `/api/v1/auth/athlete-profile/${ATLETA}`);
  info("C-03 profilo dal proprietario (controllo positivo)", {
    stato: profiloCapo.stato,
    segreti: cerca(profiloCapo.corpo),
  });
};

/* ------------------------------------------------------------------- D - */

const versoOpposto = async () => {
  console.log("\nD — il verso opposto: cosa deve continuare ad arrivare");

  const elenco = await invia(ALLENATORE, `/api/v1/athletes?club_id=${CLUB}`);
  const riga = (elenco.corpo?.data || []).find((a) => a?.id === ATLETA);
  const dati = riga?.data ?? {};
  prova("D-01 · l'allenatore vede il nome", "Nina", dati.name ?? riga?.first_name ?? null);
  prova("D-02 · l'allenatore vede il recapito", "+39 333 0000000", dati.phone ?? null);
  prova("D-03 · l'allenatore vede la categoria", "Under 12", dati.categoryName ?? null);
  for (const grafia of [
    "medicalCertExpiry",
    "medical_cert_expiry",
    "medicalCertificateExpiry",
    "medical_certificate_expiry",
    "certificateStatus",
  ]) {
    prova(`D-04 · grafia ${grafia}`, true, dati[grafia] !== undefined, JSON.stringify(Object.keys(dati)));
  }
  prova(
    "D-05 · l'allenatore vede il tutore per chiamarlo",
    "+39 333 1111111",
    Array.isArray(dati.guardians) ? (dati.guardians[0]?.phone ?? null) : null,
  );

  /* la famiglia: la scheda del proprio figlio deve arrivare come prima */
  const cruscotto = await invia(FAMIGLIA, `/api/parent-dashboard/${ATLETA}?club_id=${CLUB}`);
  info("D-06 parent-dashboard", { stato: cruscotto.stato });
  const testoCruscotto = JSON.stringify(cruscotto.corpo ?? null);

  const perId = await invia(FAMIGLIA, `/api/v1/athletes/${ATLETA}`);
  const datiFamiglia = perId.corpo?.data?.data ?? {};
  info("D-07 athletes/:id come genitore", {
    stato: perId.stato,
    chiavi: Object.keys(datiFamiglia),
  });
  prova(
    "D-08 · la famiglia conserva i contenitori non dichiarati (indirizzo)",
    true,
    datiFamiglia.indirizzoDiCasa !== undefined ||
      testoCruscotto.includes("indirizzoDiCasa"),
    `athletes/:id ${perId.stato}; cruscotto ${cruscotto.stato}`,
  );
  prova(
    "D-09 · la famiglia conserva i contatti d'emergenza",
    true,
    datiFamiglia.contattiEmergenza !== undefined ||
      testoCruscotto.includes("contattiEmergenza"),
  );

  /* controllo positivo: il proprietario vede tutto */
  const capo = await invia(CAPO, `/api/v1/athletes/${ATLETA}`);
  const datiCapo = capo.corpo?.data?.data ?? {};
  prova(
    "D-10 · controllo positivo: il proprietario vede i contenitori non dichiarati",
    true,
    datiCapo.indirizzoDiCasa !== undefined,
    `stato ${capo.stato} chiavi ${JSON.stringify(Object.keys(datiCapo))}`,
  );
};

/* ------------------------------------------------------------------- E - */

const sorgenteCertificato = async () => {
  console.log("\nE — medical_certificates.data.source nelle forme esotiche");

  const salute = await carica("src/lib/health/permissions.ts");
  const forme = [
    ["oggetto", { diagnosi: SEGRETI.dentroSorgente }],
    ["elenco", [SEGRETI.dentroSorgente]],
    ["stringa lunga", `import ${SEGRETI.dentroSorgente}`],
    ["numero", 42],
  ];
  for (const [nome, valore] of forme) {
    const tagliato = salute.stripClinicalCertificateFields({
      id: "x",
      status: "valid",
      data: { source: valore },
    });
    const uscito = JSON.stringify(tagliato).includes(SEGRETI.dentroSorgente);
    if (nome === "stringa lunga") {
      info(`E · source ${nome} (ammesso per progetto)`, uscito);
    } else {
      prova(`E · source ${nome}`, false, uscito, JSON.stringify(tagliato));
    }
  }

  const elenco = await invia(ALLENATORE, `/api/v1/medical_certificates?club_id=${CLUB}`);
  prova(
    "E-05 · l'elenco certificati non porta la sorgente composta",
    [],
    cerca(elenco.corpo),
    `stato ${elenco.stato}`,
  );
};

/* ------------------------------------------------------------------- F - */

const formeDelRuolo = async () => {
  console.log("\nF — il ruolo passato in forme strane a stripClinicalAthleteFields");

  const salute = await carica("src/lib/health/permissions.ts");
  const dato = { diagnosi: SEGRETI.campoSemplice, name: "Nina" };
  const casi = [
    ["undefined", undefined],
    ["null", null],
    ["stringa vuota", ""],
    ["TRAINER maiuscolo", "TRAINER"],
    ["allenatore (alias)", "allenatore"],
    ["  trainer  (spazi)", "  trainer  "],
    ["gettone custom trainer con status_read", "custom:trainer:vice#clinical.status_read"],
    ["gettone custom trainer senza status_read", "custom:trainer:aiuto#events.read"],
  ];
  for (const [nome, ruolo] of casi) {
    const uscita = salute.stripClinicalAthleteFields(dato, ruolo);
    const passa = Object.prototype.hasOwnProperty.call(uscita, "diagnosi");
    prova(`F · ruolo ${nome} non lascia passare 'diagnosi'`, false, passa);
  }
};

/* ==================================================================== */

const main = async () => {
  await semina();
  ALLENATORE = await identita(MISTER, "trainer");
  RIST = await identita(RISTRETTO, "custom:trainer:aiuto-allenatore");
  CONST = await identita(CONSTATUS, "custom:trainer:vice");
  SEGR = await identita(SEGRETARIA, "custom:collaborator:front-office");
  PRIV = await identita(PRIVACY, "custom:club_manager:privacy");
  FAMIGLIA = await identita(GENITORE, "parent");
  CAPO = await identita(PRESIDENTE, "owner");

  await contenitoriAmmessi();
  await ruoliPersonalizzati();
  await altrePorte();
  await versoOpposto();
  await sorgenteCertificato();
  await formeDelRuolo();

  const rossi = esiti.filter((e) => !e.ok);
  console.log(`\n  ${esiti.length - rossi.length}/${esiti.length} verdi.`);
  if (rossi.length) {
    console.log("\n  ROSSI:");
    for (const r of rossi) console.log(`   - ${r.titolo}`);
  }
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pulisci();
    await prisma.$disconnect();
  });
