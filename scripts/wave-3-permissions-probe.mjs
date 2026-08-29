/**
 * W3-14 — la fotografia **prima** della correzione.
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *          scripts/wave-3-permissions-probe.mjs --base=http://127.0.0.1:3010
 *
 * Il planning di Wave 3 ([35](../docs/knowledge-base/35-wave-3-planning.md),
 * §1.2) ha classificato W3-14 come `NEEDS RUNTIME`: dalla lettura del codice
 * risultava che `/modulistica` fosse aperta a collaboratore e staff, che
 * `document_templates` stesse fra le risorse del CRUD generico, e che la sola
 * rotta a chiedere `canManageClubConfiguration` fosse quella che **genera** il
 * documento. Tre affermazioni sullo stesso perimetro, nessuna delle tre
 * provata.
 *
 * Questo script le prova. Non corregge niente: crea un club di prova con
 * cinque ruoli veri, cinque sessioni vere, e chiede al server cosa risponde a
 * ciascuno su ognuno dei sette gesti che compongono il ciclo documentale.
 *
 * **Scrive**: un club QA con prefisso `UAT-W3P`, distrutto alla fine.
 */

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const BASE =
  (args.find((arg) => arg.startsWith("--base=")) || "").split("=")[1] ||
  "http://127.0.0.1:3010";
const KEEP = args.includes("--keep");

const DB_ENV = String(process.env.EASYGAME_DB_ENV || "").trim();
if (DB_ENV !== "development") {
  console.error(
    `Rifiuto di scrivere: EASYGAME_DB_ENV vale "${DB_ENV || "(vuoto)"}", non "development".`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const call = async (token, path, options = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `easygame_session=${token}` } : {}),
      ...(options.clubId ? { "x-active-club-id": options.clubId } : {}),
      ...(options.role ? { "x-active-access-role": options.role } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw: raw.slice(0, 120) };
  }
  return { status: response.status, data: payload?.data, error: payload?.error };
};

const ROLES = ["owner", "club_manager", "collaborator", "staff", "trainer"];

const main = async () => {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const owner = await prisma.user.create({
    data: {
      email: `uat-w3p-owner-${stamp}@easygame.test`,
      password_hash: "uat-w3p",
      first_name: "UAT-W3P",
      last_name: "OWNER",
    },
  });
  const club = await prisma.club.create({
    data: {
      name: `UAT-W3P Club ${stamp}`,
      slug: `uat-w3p-club-${stamp}`,
      creator_id: owner.id,
      settings: {},
      document_templates: [
        {
          id: "probe-template",
          title: "Modello sonda",
          description: "Esiste solo per capire chi puo toccarlo",
          content: "<h1>{{club.name}}</h1><p>{{athlete.first_name}}</p>",
          createdAt: new Date().toISOString(),
        },
      ],
    },
  });

  const athlete = await prisma.athlete.create({
    data: {
      organization_id: club.id,
      first_name: "Sonda",
      last_name: "Atleta",
      status: "active",
      data: {},
    },
  });

  const sessions = {};
  for (const role of ROLES) {
    const user =
      role === "owner"
        ? owner
        : await prisma.user.create({
            data: {
              email: `uat-w3p-${role}-${stamp}@easygame.test`,
              password_hash: "uat-w3p",
              first_name: "UAT-W3P",
              last_name: role.toUpperCase(),
            },
          });
    await prisma.organizationUser.create({
      data: { organization_id: club.id, user_id: user.id, role },
    });
    const token = `uat-w3p-${randomUUID()}`;
    await prisma.session.create({
      data: {
        token,
        user_id: user.id,
        expires_at: new Date(Date.now() + 3600_000),
      },
    });
    sessions[role] = token;
  }

  const gestures = [
    {
      name: "elencare i modelli (CRUD generico)",
      run: (token, role) =>
        call(token, `/api/v1/document_templates?organization_id=${club.id}`, {
          clubId: club.id,
          role,
        }),
    },
    {
      name: "leggere i modelli dalla riga del club",
      run: (token, role) =>
        call(
          token,
          `/api/v1/clubs?id=${club.id}&fields=document_templates`,
          { clubId: club.id, role },
        ),
    },
    {
      name: "CREARE un modello (CRUD generico)",
      run: (token, role) =>
        call(token, `/api/v1/document_templates`, {
          method: "POST",
          clubId: club.id,
          role,
          body: {
            organization_id: club.id,
            name: `sonda-${role}`,
            payload: { title: `Creato da ${role}`, content: "<p>x</p>" },
          },
        }),
    },
    {
      /*
        Un modello per ruolo, creato dall'owner appena prima: PATCH e DELETE
        hanno bisogno di un identificativo che esista davvero, altrimenti la
        rotta risponde 400 per una ragione che non c'entra con il permesso.
      */
      name: "MODIFICARE un modello (CRUD generico)",
      run: async (token, role) => {
        const created = await call(sessions.owner, `/api/v1/document_templates`, {
          method: "POST",
          clubId: club.id,
          role: "owner",
          body: {
            organization_id: club.id,
            name: `bersaglio-patch-${role}`,
            payload: { title: "Bersaglio", content: "<p>x</p>" },
          },
        });
        const id = created?.data?.id || created?.data?.[0]?.id;
        if (!id) return { status: `NO-ID ${created.status}` };
        return call(token, `/api/v1/document_templates/${id}`, {
          method: "PATCH",
          clubId: club.id,
          role,
          body: { payload: { content: `<p>riscritto da ${role}</p>` } },
        });
      },
    },
    {
      name: "CANCELLARE un modello (CRUD generico)",
      run: async (token, role) => {
        const created = await call(sessions.owner, `/api/v1/document_templates`, {
          method: "POST",
          clubId: club.id,
          role: "owner",
          body: {
            organization_id: club.id,
            name: `bersaglio-delete-${role}`,
            payload: { title: "Bersaglio", content: "<p>x</p>" },
          },
        });
        const id = created?.data?.id || created?.data?.[0]?.id;
        if (!id) return { status: `NO-ID ${created.status}` };
        return call(token, `/api/v1/document_templates/${id}`, {
          method: "DELETE",
          clubId: club.id,
          role,
        });
      },
    },
    {
      name: "GENERARE il documento compilato",
      run: async (token, role) => {
        /*
          Il modello va riscritto nella forma che `/modulistica` usa — titolo e
          contenuto in chiaro — perche il CRUD generico ne salva un'altra
          (`payload`), e il risolutore cerca la prima.
        */
        await prisma.club.update({
          where: { id: club.id },
          data: {
            document_templates: [
              {
                id: "probe-template",
                title: "Modello sonda",
                description: "Sonda",
                content: "<h1>{{club.name}}</h1><p>{{athlete.first_name}}</p>",
                createdAt: new Date().toISOString(),
              },
            ],
          },
        });
        return call(
          token,
          `/api/v1/documents/filled?templateId=probe-template&athleteId=${athlete.id}`,
          { clubId: club.id, role },
        );
      },
    },
    {
      name: "scrivere i modelli dalla riga del club (PATCH clubs)",
      run: (token, role) =>
        call(token, `/api/v1/clubs?id=${club.id}&fields=id`, {
          method: "PATCH",
          clubId: club.id,
          role,
          body: { document_templates: [] },
        }),
    },
  ];

  console.log(`\nW3-14 — comportamento attuale, ${BASE}`);
  console.log(`club di prova: ${club.id}\n`);

  const width = 46;
  console.log(
    `${"gesto".padEnd(width)}${ROLES.map((r) => r.slice(0, 11).padEnd(13)).join("")}`,
  );
  console.log("-".repeat(width + ROLES.length * 13));

  const table = [];
  for (const gesture of gestures) {
    const row = { gesture: gesture.name, byRole: {} };
    const cells = [];
    for (const role of ROLES) {
      let status;
      try {
        const result = await gesture.run(sessions[role], role);
        status = result.status;
      } catch (error) {
        status = `ERR ${String(error?.message || error).slice(0, 20)}`;
      }
      row.byRole[role] = status;
      const mark =
        status === 200 || status === 201 ? `${status} SI` : `${status}`;
      cells.push(String(mark).padEnd(13));
    }
    table.push(row);
    console.log(`${gesture.name.padEnd(width)}${cells.join("")}`);
  }

  console.log(
    `\nNota: 200/201 = il gesto riesce. 403 = negato dal ruolo. 404 = non trovato.`,
  );

  /* Cosa e rimasto scritto: dice se una PATCH andata a buon fine ha davvero
     cambiato il dato, che e la domanda vera dietro «puo modificare». */
  const after = await prisma.club.findUnique({
    where: { id: club.id },
    select: { document_templates: true },
  });
  console.log(
    `\nModelli rimasti sulla riga del club: ${JSON.stringify(after?.document_templates)?.slice(0, 400)}`,
  );

  if (!KEEP) {
    await prisma.session.deleteMany({
      where: { user: { email: { startsWith: `uat-w3p-` } } },
    });
    await prisma.athlete.deleteMany({ where: { organization_id: club.id } });
    await prisma.organizationUser.deleteMany({
      where: { organization_id: club.id },
    });
    await prisma.auditLog.deleteMany({ where: { organization_id: club.id } });
    await prisma.clubResourceItem.deleteMany({
      where: { organization_id: club.id },
    });
    await prisma.club.delete({ where: { id: club.id } });
    await prisma.user.deleteMany({
      where: { email: { startsWith: `uat-w3p-` } },
    });
    console.log("\nBanco di prova rimosso.");
  }

  await prisma.$disconnect();
};

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
