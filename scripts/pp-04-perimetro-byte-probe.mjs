/**
 * **I byte veri, il perimetro e le ricevute** — quarto round ostile di PP-04.
 *
 *     EASYGAME_DB_ENV=development node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/pp-04-perimetro-byte-probe.mjs
 *
 * ---
 *
 * ## Attenzione: **cinque prove sono rosse, e devono esserlo**
 *
 * Questa sonda e la **riproduzione** di un difetto che PP-04 ha trovato e
 * **non ha corretto**, perche vive in due file di rotta che nessuna delle tre
 * lane parallele possiede. E registrato come **PP04-D10** e **PP04-D11** in
 * `docs/knowledge-base/16-technical-debt.md`, con il contratto chiesto al
 * proprietario. Finche quella correzione non arriva, l'esecuzione esce con
 * `12/17` e codice 1: e il verbale, non una regressione.
 *
 * Le rosse, e cosa dicono:
 *
 * | Prova | Cosa esce, e non dovrebbe |
 * |---|---|
 * | M-3 | il diniego di perimetro esce **500** invece che 403 (PP04-D11) |
 * | M-4 | i byte dell'archivio storico di un atleta **fuori perimetro** |
 * | M-5 | i byte del **certificato medico** di un atleta fuori perimetro |
 * | M-6 | idem, con un allenatore recintato |
 * | R-3 | la **ricevuta** di un atleta fuori perimetro |
 *
 * Le dodici verdi sono altrettanto importanti, e vanno lette come il
 * contrappunto: il confine fra **club** regge, il confine fra **famiglie**
 * regge (F-1…F-6), e l'**atleta** e chiuso su tutto cio che non e suo
 * (A-4, A-5). Cio che non regge e il recinto di sede e categoria, e solo sui
 * byte e sulla stampa.
 *
 * ## Cosa semina
 *
 * Due atleti dello stesso club in due categorie diverse, due allegati veri per
 * ognuno (uno nel fascicolo nuovo, uno nell'archivio storico con la riga
 * `Asset`), due ricevute vere, e cinque identita: gestione senza recinto,
 * gestione **recintata** su una categoria, allenatore recintato, un tutore,
 * un atleta. Poi prova ogni identificativo con ogni identita.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("serve EASYGAME_DB_ENV=development");
  process.exit(1);
}

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const prova = (t, atteso, trovato, n = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ t, ok });
  console.log(
    "  " + (ok ? "PASS" : "FAIL") + "  " + t.padEnd(70) + " " +
      JSON.stringify(trovato) + (ok ? "" : "  atteso " + JSON.stringify(atteso)) +
      (n ? "  | " + n : ""),
  );
};
const nota = (t, v) => console.log("  ....  " + t.padEnd(70) + " " + JSON.stringify(v));

const C = randomUUID();
const CAT_A = "sec4b-cat-a";
const CAT_B = "sec4b-cat-b";
const AA = randomUUID();
const AB = randomUUID();

const U = {};
const ID = {};
let rotte = null;
let dominio = null;

const richiesta = (url, opts = {}) => {
  const { method = "GET", token, club, ruolo, body } = opts;
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", "Bearer " + token);
  if (club) headers.set("x-active-club-id", club);
  if (ruolo) headers.set("x-active-access-role", ruolo);
  return new Request(new URL(url, "http://sec4.invalid").toString(), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
};

const leggi = async (r) => {
  const testo = await r.text();
  let corpo = null;
  try {
    corpo = testo ? JSON.parse(testo) : null;
  } catch {
    corpo = testo;
  }
  return { status: r.status, corpo, testo };
};

const sessionePer = async (u) => {
  const auth = await carica("src/lib/server/auth.ts");
  return (await auth.createSessionForUser(u)).access_token;
};

const utente = (email, nome) =>
  prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      id: randomUUID(), email, first_name: nome, last_name: "Sec4",
      password_hash: "$2b$10$sec4", role: "user",
      email_verified_at: new Date(), updated_at: new Date(),
    },
  });

const pulisciResidui = async () => {
  const residui = await prisma.club.findMany({
    where: { slug: { startsWith: "sec4b-" } }, select: { id: true },
  });
  const ids = residui.map((r) => r.id);
  if (ids.length) {
    await prisma.auditLog.deleteMany({ where: { organization_id: { in: ids } } }).catch(() => {});
    await prisma.asset.deleteMany({ where: { bucket: "shared-documents", path: { startsWith: ids[0] } } }).catch(() => {});
    await prisma.club.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { email: { endsWith: "@sec4b.invalid" } } }).catch(() => {});
};

const tessera = async (club, userId, role, perimetro = []) => {
  const riga = await prisma.organizationUser.create({
    data: {
      id: randomUUID(), organization_id: club, user_id: userId, role,
      is_primary: false, updated_at: new Date(),
    },
  });
  for (const p of perimetro) {
    await prisma.clubAccessScope.create({
      data: {
        id: randomUUID(), organization_user_id: riga.id,
        scope_kind: p.kind, scope_value: p.value,
      },
    });
  }
  return riga;
};

const creaAsset = async (club, atleta, nome, segreto) => {
  const id = randomUUID();
  await prisma.asset.create({
    data: {
      id, bucket: "shared-documents",
      path: `${club}/${atleta}/${nome}`,
      public_url: `https://sec4.invalid/${nome}`,
      file_name: nome, mime_type: "text/plain",
      data_base64: Buffer.from(segreto).toString("base64"),
      updated_at: new Date(),
    },
  });
  return id;
};

const scopeOwner = () => ({
  userId: U.pres.id, activeOrganizationId: C, activeRole: "owner",
  allowedOrganizationIds: [C], accessScopes: [], actorEmail: U.pres.email,
});

const invitaEAccetta = async (athleteId, email) => {
  const esito = await dominio.sendAthleteAccountInvite(scopeOwner(), {
    athleteId, email, acknowledgeMinor: true,
  });
  const token = randomBytes(32).toString("hex");
  await prisma.athleteAccountInvite.update({
    where: { id: esito.inviteId },
    data: { token_hash: createHash("sha256").update(token).digest("hex") },
  });
  return { token, ...(await dominio.acceptAthleteAccountInvite(token)) };
};

const semina = async () => {
  await pulisciResidui();
  U.pres = await utente("pres@sec4b.invalid", "Pres");
  U.mgr = await utente("mgr@sec4b.invalid", "Mgr");
  U.pa = await utente("pa@sec4b.invalid", "Pa");
  U.pb = await utente("pb@sec4b.invalid", "Pb");
  U.atl = await utente("atl@sec4b.invalid", "Atl");
  U.trainer = await utente("trainer@sec4b.invalid", "Trainer");

  await prisma.club.create({
    data: {
      id: C, slug: "sec4b-" + Date.now(), name: "ASD Sec4 Byte",
      creator_id: U.pres.id,
      settings: { seasons: [{ id: "2026-27", label: "2026/27", startDate: "2026-07-01", endDate: "2027-06-30", status: "active" }] },
      categories: [{ id: CAT_A, name: "Under A" }, { id: CAT_B, name: "Under B" }],
      club_sites: [{ id: "sec4b-sede", name: "Sede", active: true }],
      structures: [], trainers: [], staff_members: [], trainings: [], matches: [],
      appointments: [], updated_at: new Date(),
    },
  });
  await tessera(C, U.pres.id, "owner");
  await tessera(C, U.mgr.id, "club_manager", [{ kind: "category", value: CAT_A }]);
  await tessera(C, U.trainer.id, "trainer", [{ kind: "category", value: CAT_A }]);
  await tessera(C, U.pa.id, "parent");
  await tessera(C, U.pb.id, "parent");

  const atleta = (id, nome, cat, email) =>
    prisma.athlete.create({
      data: {
        id, organization_id: C, first_name: nome, last_name: "Atleta",
        status: "active", category_id: cat, category_name: cat,
        birth_date: new Date("2012-01-01"), user_id: null,
        data: {
          allergies: "ALLERGIA-" + nome,
          medical_notes: "NOTA-" + nome,
          guardians: [{ id: "g-" + nome, first_name: nome, last_name: "Tutore", email, fiscal_code: "TUTORE00A00A000A" }],
        },
        updated_at: new Date(),
      },
    });
  await atleta(AA, "AA", CAT_A, U.pa.email);
  await atleta(AB, "AB", CAT_B, U.pb.email);

  // Archivio storico: un Asset vero per ognuno, piu la riga in data.sharedDocuments.
  ID.assetAA = await creaAsset(C, AA, "carta-aa.txt", "BYTE-SEGRETI-AA");
  ID.assetAB = await creaAsset(C, AB, "carta-ab.txt", "BYTE-SEGRETI-AB");
  ID.assetMedAB = await creaAsset(C, AB, "certificato-ab.txt", "BYTE-CLINICI-AB");

  const storico = (assetId, tipo) => ({
    id: assetId, assetId, title: "Documento " + tipo, documentType: tipo,
    fileName: "file.txt", mimeType: "text/plain", visibleToParent: true,
    uploadedByRole: "club", status: "approved", archived: false,
  });
  for (const [id, docs] of [
    [AA, [storico(ID.assetAA, "identity_document")]],
    [AB, [storico(ID.assetAB, "identity_document"), storico(ID.assetMedAB, "medical_certificate")]],
  ]) {
    const riga = await prisma.athlete.findUnique({ where: { id }, select: { data: true } });
    await prisma.athlete.update({
      where: { id }, data: { data: { ...riga.data, sharedDocuments: docs } },
    });
  }

  // Fascicolo nuovo: un allegato vero per ognuno, depositato dal proprietario.
  const documenti = await carica("src/lib/server/document-requests.ts");
  const deposita = async (athleteId, marca) => {
    const entry = await documenti.submitDocument(scopeOwner(), {
      subjectKind: "athlete", subjectId: athleteId,
      documentKind: "identity_document", source: "club",
      file: {
        fileName: "dossier-" + marca + ".txt", mimeType: "text/plain",
        content: Buffer.from("DOSSIER-SEGRETO-" + marca),
      },
    });
    return entry;
  };
  ID.dossierAA = await deposita(AA, "AA");
  ID.dossierAB = await deposita(AB, "AB");

  // Ricevute vere.
  const ricevuta = async (athleteId, marca) => {
    const r = await prisma.receipt.create({
      data: {
        id: randomUUID(), organization_id: C, athlete_id: athleteId,
        receipt_number: "R-" + marca, issue_date: new Date("2026-05-01"),
        amount: 250.5, description: "RICEVUTA-SEGRETA-" + marca,
        status: "issued", updated_at: new Date(),
        snapshot: {
          issuer: { name: "ASD Sec4 Byte" },
          recipient: { name: "Tutore " + marca, fiscalCode: "TUTORE00A00A000A" },
          description: "RICEVUTA-SEGRETA-" + marca,
        },
      },
    });
    return r.id;
  };
  ID.ricAA = await ricevuta(AA, "AA");
  ID.ricAB = await ricevuta(AB, "AB");

  dominio = await carica("src/lib/server/athlete-accounts.ts");
  rotte = {
    famDoc: await carica("src/app/api/parent-dashboard/[athleteId]/documents/[assetId]/route.ts"),
    famDocs: await carica("src/app/api/parent-dashboard/[athleteId]/documents/route.ts"),
    clubDocs: await carica("src/app/api/athletes/[athleteId]/documents/route.ts"),
    clubFile: await carica("src/app/api/athletes/[athleteId]/documents/[documentId]/file/route.ts"),
    fiscale: await carica("src/app/api/v1/documents/[kind]/[id]/route.ts"),
  };
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: C } }).catch(() => {});
  await prisma.asset.deleteMany({ where: { path: { startsWith: C } } }).catch(() => {});
  await prisma.club.deleteMany({ where: { id: C } }).catch((e) => console.error("pulizia:", e && e.message));
  await prisma.user.deleteMany({ where: { email: { endsWith: "@sec4b.invalid" } } }).catch(() => {});
};

const SEGRETI = ["BYTE-SEGRETI-AB", "BYTE-CLINICI-AB", "DOSSIER-SEGRETO-AB", "RICEVUTA-SEGRETA-AB", "ALLERGIA-AB", "NOTA-AB"];
const perdite = (t) => SEGRETI.filter((s) => String(t || "").includes(s));

const fileClub = async (token, athleteId, docId, ruolo) =>
  leggi(
    await rotte.clubFile.GET(
      richiesta(`/api/athletes/${athleteId}/documents/${docId}/file`, { token, club: C, ruolo }),
      { params: { athleteId, documentId: docId } },
    ),
  );

const fileFamiglia = async (token, athleteId, assetId) =>
  leggi(
    await rotte.famDoc.GET(
      richiesta(`/api/parent-dashboard/${athleteId}/documents/${assetId}`, { token, club: C }),
      { params: { athleteId, assetId } },
    ),
  );

const fiscale = async (token, kind, id, ruolo) =>
  leggi(
    await rotte.fiscale.GET(
      richiesta(`/api/v1/documents/${kind}/${id}`, { token, club: C, ruolo }),
      { params: { kind, id } },
    ),
  );

const main = async () => {
  await semina();

  const tokMgr = await sessionePer(U.mgr);
  const tokTrainer = await sessionePer(U.trainer);
  const tokPa = await sessionePer(U.pa);
  const tokPb = await sessionePer(U.pb);

  const accessRoles = await carica("src/lib/access-roles.ts");
  const salute = await carica("src/lib/health/permissions.ts");
  nota("R0 permessi del club_manager", {
    medical_certificates: accessRoles.canAccessClubResource("club_manager", "medical_certificates", "read"),
    receipts: accessRoles.canAccessClubResource("club_manager", "receipts", "read"),
    clinical: salute.hasHealthPermission("club_manager", "clinical.read"),
  });
  nota("R0 permessi del trainer", {
    medical_certificates: accessRoles.canAccessClubResource("trainer", "medical_certificates", "read"),
    receipts: accessRoles.canAccessClubResource("trainer", "receipts", "read"),
    clinical: salute.hasHealthPermission("trainer", "clinical.read"),
  });
  nota("R0 permessi del parent", {
    receipts: accessRoles.canAccessClubResource("parent", "receipts", "read"),
  });
  nota("R0 permessi dell'athlete", {
    receipts: accessRoles.canAccessClubResource("athlete", "receipts", "read"),
    medical_certificates: accessRoles.canAccessClubResource("athlete", "medical_certificates", "read"),
  });

  console.log("\n===== M — perimetro di categoria: il recinto vale sui BYTE? =====");
  const listaDentro = await leggi(
    await rotte.clubDocs.GET(richiesta(`/api/athletes/${AA}/documents`, { token: tokMgr, club: C, ruolo: "club_manager" }), { params: { athleteId: AA } }),
  );
  prova("M-1 elenco documenti DENTRO il perimetro", 200, listaDentro.status);
  const listaFuori = await leggi(
    await rotte.clubDocs.GET(richiesta(`/api/athletes/${AB}/documents`, { token: tokMgr, club: C, ruolo: "club_manager" }), { params: { athleteId: AB } }),
  );
  prova("M-2 elenco documenti FUORI perimetro chiuso", 403, listaFuori.status,
    perdite(listaFuori.testo).join(",") || "");

  const fDossierFuori = await fileClub(tokMgr, AB, ID.dossierAB.state.attachmentId, "club_manager");
  prova("M-3 BYTE del fascicolo nuovo FUORI perimetro", 403, fDossierFuori.status,
    perdite(fDossierFuori.testo).length ? "PERDITA " + perdite(fDossierFuori.testo).join(",") : "");

  const fStoricoFuori = await fileClub(tokMgr, AB, ID.assetAB, "club_manager");
  prova("M-4 BYTE dell'archivio storico FUORI perimetro", 403, fStoricoFuori.status,
    perdite(fStoricoFuori.testo).length ? "PERDITA " + perdite(fStoricoFuori.testo).join(",") : "");

  const fMedFuori = await fileClub(tokMgr, AB, ID.assetMedAB, "club_manager");
  prova("M-5 BYTE del CERTIFICATO MEDICO fuori perimetro", 403, fMedFuori.status,
    perdite(fMedFuori.testo).length ? "PERDITA " + perdite(fMedFuori.testo).join(",") : "");

  const fTrainerFuori = await fileClub(tokTrainer, AB, ID.assetAB, "trainer");
  prova("M-6 allenatore recintato, byte storici fuori perimetro", 403, fTrainerFuori.status,
    perdite(fTrainerFuori.testo).length ? "PERDITA " + perdite(fTrainerFuori.testo).join(",") : "");

  console.log("\n===== F — la famiglia e gli identificativi dell'altra famiglia =====");
  const okProprio = await fileFamiglia(tokPa, AA, ID.assetAA);
  prova("F-1 il tutore scarica il documento del PROPRIO figlio", 200, okProprio.status);
  const okDossier = await fileFamiglia(tokPa, AA, ID.dossierAA.state.attachmentId);
  prova("F-2 idem dal fascicolo nuovo", 200, okDossier.status);

  const incrocio1 = await fileFamiglia(tokPa, AA, ID.assetAB);
  prova("F-3 assetId dell'ALTRA famiglia sotto il proprio figlio", true, incrocio1.status >= 400,
    "status " + incrocio1.status + (perdite(incrocio1.testo).length ? " PERDITA " + perdite(incrocio1.testo).join(",") : ""));
  const incrocio2 = await fileFamiglia(tokPa, AA, ID.dossierAB.state.attachmentId);
  prova("F-4 allegato del fascicolo dell'ALTRA famiglia sotto il proprio figlio", true, incrocio2.status >= 400,
    "status " + incrocio2.status + (perdite(incrocio2.testo).length ? " PERDITA " + perdite(incrocio2.testo).join(",") : ""));
  const incrocio3 = await fileFamiglia(tokPa, AB, ID.assetAB);
  prova("F-5 la scheda dell'altra famiglia", 403, incrocio3.status,
    perdite(incrocio3.testo).length ? "PERDITA " + perdite(incrocio3.testo).join(",") : "");
  const incrocio4 = await fileFamiglia(tokPa, AA, ID.assetMedAB);
  prova("F-6 certificato medico dell'altra famiglia sotto il proprio figlio", true, incrocio4.status >= 400,
    "status " + incrocio4.status + (perdite(incrocio4.testo).length ? " PERDITA " + perdite(incrocio4.testo).join(",") : ""));

  console.log("\n===== R — ricevute =====");
  const rProprio = await fiscale(tokPa, "receipt", ID.ricAA, "parent");
  prova("R-1 il tutore stampa la ricevuta del proprio figlio", 200, rProprio.status);
  const rAltrui = await fiscale(tokPa, "receipt", ID.ricAB, "parent");
  prova("R-2 la ricevuta dell'altra famiglia", 403, rAltrui.status,
    perdite(rAltrui.testo).length ? "PERDITA " + perdite(rAltrui.testo).join(",") : "");
  const rMgrFuori = await fiscale(tokMgr, "receipt", ID.ricAB, "club_manager");
  prova("R-3 ruolo RECINTATO sulla ricevuta fuori perimetro", 403, rMgrFuori.status,
    perdite(rMgrFuori.testo).length ? "PERDITA " + perdite(rMgrFuori.testo).join(",") : "");

  console.log("\n===== A — l'atleta di se stesso =====");
  await invitaEAccetta(AA, U.atl.email);
  const tokAtl = await sessionePer(U.atl);
  const aRic = await fiscale(tokAtl, "receipt", ID.ricAA, "athlete");
  nota("A-1 l'atleta chiede la PROPRIA ricevuta", aRic.status);
  const aDoc = await fileClub(tokAtl, AA, ID.assetAA, "athlete");
  nota("A-2 l'atleta chiede il byte del PROPRIO documento (rotta club)", aDoc.status);
  const aFam = await fileFamiglia(tokAtl, AA, ID.assetAA);
  nota("A-3 l'atleta chiede il byte dal cruscotto famiglia", aFam.status);
  const aAltro = await fileClub(tokAtl, AB, ID.assetAB, "athlete");
  prova("A-4 l'atleta chiede il byte di un ALTRO atleta", true, aAltro.status >= 400,
    "status " + aAltro.status + (perdite(aAltro.testo).length ? " PERDITA " + perdite(aAltro.testo).join(",") : ""));
  const aRicAltro = await fiscale(tokAtl, "receipt", ID.ricAB, "athlete");
  prova("A-5 l'atleta chiede la ricevuta di un ALTRO atleta", 403, aRicAltro.status,
    perdite(aRicAltro.testo).length ? "PERDITA " + perdite(aRicAltro.testo).join(",") : "");
};

main()
  .catch((e) => {
    console.error("\nESPLOSA:", e);
    esiti.push({ t: "sonda", ok: false });
  })
  .finally(async () => {
    await pulisci();
    await prisma.$disconnect();
    const ko = esiti.filter((e) => !e.ok);
    console.log("\n===== " + (esiti.length - ko.length) + "/" + esiti.length + " verdi =====");
    if (ko.length) {
      console.log("ROSSE:");
      ko.forEach((e) => console.log("  - " + e.t));
    }
  });
