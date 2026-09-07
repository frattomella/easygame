/**
 * **PP-03 round 7 — le due superfici che il giro conclusivo aveva lasciato
 * misurate solo di riflesso: i BYTE dei documenti e i DESTINATARI di una
 * comunicazione.**
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-03-round7-byte-e-destinatari-probe.mjs
 *
 * Le altre sonde di questa lane misurano il perimetro sulle **righe**: chi
 * compare in un elenco, chi si raggiunge per identificativo, chi si scrive.
 * Restavano due cose che una riga non e.
 *
 * **A — i byte.** `pp-03-allegati-perimetro-probe.mjs` misura il perimetro di
 * categoria dell'allenatore **base**, quello che vive in `clubs.trainers`, e lo
 * trova chiuso. Non misura l'altro perimetro: le righe di `club_access_scopes`
 * di un **ruolo personalizzato**, che e il modo in cui una societa recinta
 * davvero una persona su una sede o su una categoria (ADR-0103). E non misura
 * il ramo dell'**archivio storico** della rotta dei byte, che e un ramo diverso
 * da quello degli allegati e ha le sue guardie.
 *
 * E la superficie che PP-04 ha registrato come `PP04-D10` e che il mandato di
 * questa lane chiede di **dichiarare misurata**, non di correggere: PP-04 e
 * chiusa e il file non e di nessuna lane viva.
 *
 * **B — i destinatari.** Un allenatore recintato che manda un avviso: puo
 * nominare una categoria che non e sua? La domanda non e «legge l'elenco
 * giusto» ma «l'insieme che il server compone e dentro il suo recinto», e le
 * due cose si sono gia scollate una volta in questa lane (§9.1).
 *
 * `PASS` = attacco respinto o atto legittimo riuscito, secondo la riga.
 * `FAIL` = difetto. `INFO` = misura che questa lane dichiara e non giudica.
 *
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(68)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        ${nota}`);
};
const info = (titolo, valore) =>
  console.log(`  INFO  ${titolo.padEnd(68)} ${JSON.stringify(valore)}`);

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
    const tipo = risposta.headers.get("content-type") || "";
    if (tipo.includes("json")) {
      return { stato: risposta.status, corpo: await risposta.json().catch(() => null) };
    }
    /* I byte: quello che conta e se sono arrivati e quanti sono. */
    const buffer = await risposta.arrayBuffer().catch(() => new ArrayBuffer(0));
    return { stato: risposta.status, byte: buffer.byteLength, tipo };
  } catch (errore) {
    return { stato: -1, corpo: { error: { message: String(errore?.message) } } };
  }
};

globalThis.fetch = async (input) => {
  throw new Error(`FETCH-ESTERNO ${String(input)}`);
};

const identita = async (riga, ruolo) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(riga);
  return { token: sessione.access_token, ruolo, club: CLUB };
};

/* ------------------------------------------------------------- gli attori */

const CLUB = randomUUID();
const CAT_A = "cat-r7-alfa";
const CAT_B = "cat-r7-beta";
const SEDE_A = "sede-r7-alfa";
const SEDE_B = "sede-r7-beta";
const ATLETA_A = randomUUID();
const ATLETA_B = randomUUID();
const ASSET_NORMALE = randomUUID();
const ASSET_CLINICO = randomUUID();

/* Le parole che non devono uscire, decise qui. */
const SEGRETI = {
  documento: "CONTRATTO-RISERVATO-R7",
  certificato: "REFERTO-CARDIOLOGICO-R7",
};

let PRESIDENTE = null;
let MISTER_A = null; /* allenatore base, clubs.trainers.categories = [CAT_A] */
let RECINTATO = null; /* ruolo di club su base trainer + righe di access_scope su CAT_A/SEDE_A */
let CAPO = null;
let ALDO = null;
let REC = null;

/* -------------------------------------------------------------- la semina */

const utente = async (email, nome) => {
  const trovato = await prisma.user.findUnique({ where: { email } });
  if (trovato) return trovato;
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email,
      first_name: nome,
      last_name: "R7",
      password_hash: "$2b$10$pp03r7",
      role: "user",
      email_verified_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const atleta = async (id, nome, categoria, sede, documenti) =>
  prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "R7",
      status: "active",
      data: {
        seasonId: "2026-27",
        name: nome,
        categoryId: categoria,
        categoryName: categoria,
        siteId: sede,
        categoryMemberships: [
          { category_id: categoria, site_id: sede, is_primary: true },
        ],
        sharedDocuments: documenti,
      },
      updated_at: new Date(),
    },
  });

const semina = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "pp03r7-" } },
    select: { id: true },
  });
  if (residui.length) {
    const ids = residui.map((r) => r.id);
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }

  PRESIDENTE = await utente("pp03r7-presidente@example.invalid", "Anna");
  MISTER_A = await utente("pp03r7-aldo@example.invalid", "Aldo");
  RECINTATO = await utente("pp03r7-recintato@example.invalid", "Rea");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `pp03r7-${Date.now()}`,
      name: "ASD Round7",
      creator_id: PRESIDENTE.id,
      settings: {
        seasons: [
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
      ],
      club_sites: [
        { id: SEDE_A, name: "Scauri" },
        { id: SEDE_B, name: "Santi Cosma" },
      ],
      category_groups: [],
      structures: [],
      trainers: [
        {
          id: "trainer-r7-aldo",
          first_name: "Aldo",
          last_name: "R7",
          email: MISTER_A.email,
          linkedUserId: MISTER_A.id,
          categories: [CAT_A],
          groups: [],
        },
        {
          id: "trainer-r7-rea",
          first_name: "Rea",
          last_name: "R7",
          email: RECINTATO.email,
          linkedUserId: RECINTATO.id,
          /*
            **Il recinto vero e nelle righe di `club_access_scopes`.** Qui il
            profilo dichiara entrambe le categorie di proposito: se il perimetro
            reggesse solo grazie a `clubs.trainers`, questa sonda non
            misurerebbe l'asse che vuole misurare.
          */
          categories: [CAT_A, CAT_B],
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

  const documentiB = [
    {
      id: "doc-r7-normale",
      assetId: ASSET_NORMALE,
      fileName: "contratto.pdf",
      documentType: "other",
      title: SEGRETI.documento,
      uploadedAt: new Date().toISOString(),
    },
    {
      id: "doc-r7-clinico",
      assetId: ASSET_CLINICO,
      fileName: "certificato.pdf",
      documentType: "medical_certificate",
      title: SEGRETI.certificato,
      uploadedAt: new Date().toISOString(),
    },
  ];

  await atleta(ATLETA_A, "Ada", CAT_A, SEDE_A, []);
  await atleta(ATLETA_B, "Bea", CAT_B, SEDE_B, documentiB);

  for (const [id, nome] of [
    [ASSET_NORMALE, SEGRETI.documento],
    [ASSET_CLINICO, SEGRETI.certificato],
  ]) {
    await prisma.asset.create({
      data: {
        id,
        bucket: "shared-documents",
        path: `${CLUB}/${ATLETA_B}/${id}.pdf`,
        mime_type: "application/pdf",
        data_base64: Buffer.from(`%PDF-1.4 ${nome}`).toString("base64"),
        public_url: "",
        updated_at: new Date(),
      },
    });
  }

  /* Il ruolo di club recintato, con le sue righe di perimetro. */
  const ruolo = await prisma.clubRole.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      slug: "custom:trainer:recintato",
      name: "recintato",
      base_role: "trainer",
      is_active: true,
      updated_at: new Date(),
    },
  });
  for (const chiave of ["events.read", "clinical.status_read", "documents.read"]) {
    await prisma.clubRolePermission
      .create({
        data: { id: randomUUID(), role_id: ruolo.id, permission_key: chiave },
      })
      .catch(() => {});
  }

  for (const [riga, valore, customId] of [
    [PRESIDENTE, "owner", null],
    [MISTER_A, "trainer", null],
    [RECINTATO, ruolo.slug, ruolo.id],
  ]) {
    const tessera = await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        user_id: riga.id,
        role: valore,
        custom_role_id: customId,
        is_primary: true,
        updated_at: new Date(),
      },
    });

    if (customId) {
      /* Le due righe che recintano: una categoria e una sede, in AND. */
      for (const [asse, valoreAsse] of [
        ["category", CAT_A],
        ["site", SEDE_A],
      ]) {
        await prisma.clubAccessScope
          .create({
            data: {
              id: randomUUID(),
              organization_id: CLUB,
              organization_user_id: tessera.id,
              site_id: asse === "site" ? valoreAsse : null,
              category_id: asse === "category" ? valoreAsse : null,
              updated_at: new Date(),
            },
          })
          .catch(async (errore) => {
            info("semina: club_access_scopes non scritto", String(errore?.message).slice(0, 120));
          });
      }
    }
  }
};

/* ------------------------------------------------------------------- A - */

const byteDeiDocumenti = async () => {
  console.log("\nA — i byte di un documento fuori dal perimetro");

  /*
    **Si chiede per `assetId`, e non per l'identificativo logico.** La rotta
    prova prima il ramo dei depositi documentali, che filtra su una colonna
    `uuid`: un identificativo logico — `doc-r7-normale`, la grafia che il
    prodotto scrive dentro `data.sharedDocuments` — fa fallire la query con
    `invalid input syntax for type uuid` e la rotta risponde **500** prima di
    arrivare al ramo dell'archivio storico. E la stessa forma gia vista su
    `club_resource_items` e vale per la direzione quanto per l'allenatore, cioe
    non e un perimetro: e una porta che si rompe. Misurata sotto come `A-500`.
  */
  const porte = [
    [ASSET_NORMALE, "documento NON clinico"],
    [ASSET_CLINICO, "certificato medico"],
  ];

  for (const [attore, nome] of [
    [ALDO, "allenatore base (perimetro in clubs.trainers)"],
    [REC, "ruolo di club RECINTATO (righe di access_scope)"],
  ]) {
    for (const [documento, etichetta] of porte) {
      const r = await invia(
        attore,
        `/api/athletes/${ATLETA_B}/documents/${documento}/file`,
      );
      const consegnato = r.stato < 400 && Number(r.byte || 0) > 0;
      /*
        **Questa riga e una misura, non un giudizio** (`PP04-D10`).

        Il perimetro di sede e categoria **non vale sui byte** dell'archivio
        storico: la rotta chiede il ruolo (`medical_certificates` in lettura),
        l'appartenenza al club e — per un certificato — `clinical.read`, e non
        chiede mai se **questo** atleta e dentro il recinto di **questo**
        allenatore. Il difetto e preesistente, sta in un file che non e di
        nessuna lane viva, e il mandato di questa fase lo assegna
        all'integrazione: PP-03 lo **dichiara misurato** e non lo corregge.

        La misura precisa una cosa che il registro di PP-04 diceva piu larga:
        il **certificato medico non esce** — lo ferma la guardia clinica di
        §6.2 di questa lane, che vale su entrambi i rami. Esce il documento
        **non clinico**, ed e gia abbastanza: contratti, documenti d'identita,
        moduli firmati di un minore di un'altra squadra.
      */
      info(
        `A · ${nome.slice(0, 24)} · ${etichetta}`,
        {
          consegnato,
          stato: r.stato,
          byte: r.byte ?? null,
          errore: String(r.corpo?.error?.message ?? "").slice(0, 70),
        },
      );
    }
  }

  /*
    Cio che questa lane **giudica**: il certificato medico non esce da nessuno
    dei due, che e il vincolo non negoziabile della lane.
  */
  for (const [attore, nome] of [
    [ALDO, "allenatore base"],
    [REC, "ruolo di club recintato"],
  ]) {
    const r = await invia(attore, `/api/athletes/${ATLETA_B}/documents/${ASSET_CLINICO}/file`);
    prova(
      `A-clin · ${nome}: i byte del certificato medico restano negati`,
      false,
      r.stato < 400 && Number(r.byte || 0) > 0,
      `stato ${r.stato} byte ${r.byte ?? "-"}`,
    );
  }

  /* Il controllo positivo: la direzione i byte li prende. */
  const capo = await invia(CAPO, `/api/athletes/${ATLETA_B}/documents/${ASSET_NORMALE}/file`);
  prova(
    "A-pos · controllo positivo: la direzione scarica il documento",
    true,
    capo.stato < 400 && Number(capo.byte || 0) > 0,
    `stato ${capo.stato} byte ${capo.byte ?? "-"}`,
  );

  const nonUuid = await invia(CAPO, `/api/athletes/${ATLETA_B}/documents/doc-r7-normale/file`);
  info("A-500 identificativo logico invece dell'assetId (anche alla direzione)", {
    stato: nonUuid.stato,
    errore: String(nonUuid.corpo?.error?.message ?? "").slice(0, 90),
  });

  /*
    E la meta che §16.2 ha gia chiuso, ricontrollata da qui: gli
    identificativi da mettere in questa rotta arrivavano dall'elenco atleti.
  */
  const elenco = await invia(ALDO, `/api/v1/athletes?club_id=${CLUB}&limit=100`);
  const testo = JSON.stringify(elenco.corpo ?? null);
  prova(
    "A-id · l'elenco atleti non consegna gli identificativi dei documenti",
    [],
    [ASSET_NORMALE, ASSET_CLINICO, "sharedDocuments"].filter((m) => testo.includes(m)),
    `stato ${elenco.stato}`,
  );
};

/* ------------------------------------------------------------------- B - */

const destinatariDiUnAvviso = async () => {
  console.log("\nB — i destinatari di una comunicazione");

  const rotte = [
    ["POST", "/api/v1/announcements", { title: "R7", body: "R7", audience: { kind: "category_ids", categoryIds: [CAT_B] } }],
    ["POST", "/api/v1/communications", { subject: "R7", body: "R7", audience: { kind: "all_families" } }],
    ["POST", "/api/v1/communications/preview", { audience: { kind: "category_ids", categoryIds: [CAT_B] } }],
  ];

  for (const [metodo, percorso, corpo] of rotte) {
    const r = await invia(ALDO, percorso, { method: metodo, body: JSON.stringify(corpo) });
    prova(
      `B · ${metodo} ${percorso.replace("/api/v1", "")} negato all'allenatore`,
      true,
      r.stato === -1 || r.stato >= 400,
      `stato ${r.stato} ${JSON.stringify(r.corpo?.error?.message ?? "").slice(0, 90)}`,
    );
  }

  /*
    E la porta che l'allenatore **ha**: la notifica uno-a-uno. Il debito
    `PP03-D7` dice che resta aperta; qui si misura che almeno il **confine**
    regge — un destinatario fuori dal club, e il «a tutti» che è nullo.
  */
  const fuori = await utente("pp03r7-estraneo@example.invalid", "Ext");
  const aEstraneo = await invia(ALDO, "/api/v1/notifications", {
    method: "POST",
    body: JSON.stringify({ user_id: fuori.id, title: "R7", message: "R7", club_id: CLUB }),
  });
  prova(
    "B-04 · notifica a un utente fuori dal club",
    true,
    aEstraneo.stato >= 400,
    `stato ${aEstraneo.stato}`,
  );

  const aTutti = await invia(ALDO, "/api/v1/notifications", {
    method: "POST",
    body: JSON.stringify({ user_id: null, title: "R7", message: "R7", club_id: CLUB }),
  });
  prova(
    "B-05 · notifica «a tutto il club» (user_id nullo)",
    true,
    aTutti.stato >= 400,
    `stato ${aTutti.stato}`,
  );
};

/* ------------------------------------------------------------------- C - */

const riattacco = async () => {
  console.log("\nC — riattacco alle correzioni di §17");

  /* §17.1 dal verso opposto: chi ha gruppi e NON ha categorie. */
  const eventi = await carica("src/lib/server/events.ts");
  const senzaCategorie = {
    categoryIds: [],
    categoryTokens: [],
    groupIds: ["grp-suo"],
  };
  prova(
    "C-01 · §17.1 chi non ha categorie non scrive nella categoria di un altro",
    false,
    eventi.eventWithinTrainerPerimeter(
      senzaCategorie,
      { category_id: "cat-altrui", category_ids: ["cat-altrui"], group_ids: ["grp-suo"] },
      "scrittura",
    ),
  );
  prova(
    "C-02 · §17.1 e l'evento di soli gruppi suoi resta scrivibile",
    true,
    eventi.eventWithinTrainerPerimeter(
      senzaCategorie,
      { category_id: null, category_ids: [], group_ids: ["grp-suo"] },
      "scrittura",
    ),
  );

  /* §17.3: la riga negata raggiunta dalle altre grafie del percorso. */
  const righe = await prisma.clubResourceItem.findMany({
    where: { organization_id: CLUB },
    select: { id: true, resource_type: true },
  });
  info("C-03 righe di club_resource_items seminate", righe.length);

  const sconto = await invia(CAPO, `/api/v1/discounts?club_id=${CLUB}`, {
    method: "POST",
    body: JSON.stringify({ name: "Sconto R7", payload: { nota: "SCONTO-RISERVATO-R7" } }),
  });
  info("C-04 lo sconto creato dalla direzione", { stato: sconto.stato });

  const creato = await prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, resource_type: "discounts" },
  });
  if (creato) {
    for (const [nome, percorso] of [
      ["per contenitore", `/api/v1/club_resource_items/${creato.id}?club_id=${CLUB}`],
      ["per nome", `/api/v1/discounts/${creato.id}?club_id=${CLUB}`],
      ["contenitore con fields", `/api/v1/club_resource_items/${creato.id}?club_id=${CLUB}&fields=id,payload`],
    ]) {
      const r = await invia(ALDO, percorso);
      prova(
        `C-05 · §17.3 lo sconto ${nome} resta negato`,
        false,
        r.stato < 400 && JSON.stringify(r.corpo ?? null).includes("SCONTO-RISERVATO-R7"),
        `stato ${r.stato}`,
      );
    }
  } else {
    info("C-05 nessuno sconto creato: caso non misurato", null);
  }

  /* §17.4: la scheda dell'atleta di un'altra categoria, per identificativo. */
  const profilo = await invia(ALDO, `/api/v1/auth/athlete-profile/${ATLETA_B}`);
  prova(
    "C-06 · §17.4 l'allenatore non apre il fascicolo di un'altra categoria",
    true,
    profilo.stato >= 400,
    `stato ${profilo.stato}`,
  );

  const suo = await invia(ALDO, `/api/v1/athletes/${ATLETA_A}?club_id=${CLUB}`);
  prova(
    "C-07 · controllo positivo: il proprio atleta si legge",
    true,
    suo.stato < 400,
    `stato ${suo.stato}`,
  );
};

/* ==================================================================== */

const main = async () => {
  await semina();
  CAPO = await identita(PRESIDENTE, "owner");
  ALDO = await identita(MISTER_A, "trainer");
  REC = await identita(RECINTATO, "custom:trainer:recintato");

  await byteDeiDocumenti();
  await destinatariDiUnAvviso();
  await riattacco();

  const verdi = esiti.filter((e) => e.ok).length;
  console.log(`\n  ${verdi}/${esiti.length} verdi.`);
  const rossi = esiti.filter((e) => !e.ok);
  if (rossi.length) {
    console.log("\n  ROSSI:");
    for (const r of rossi) console.log(`   - ${r.titolo}`);
  }
};

main()
  .catch((errore) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
    await prisma.asset
      .deleteMany({ where: { id: { in: [ASSET_NORMALE, ASSET_CLINICO] } } })
      .catch(() => {});
    await prisma.club.deleteMany({ where: { id: CLUB } }).catch(() => {});
    await prisma.$disconnect();
  });
