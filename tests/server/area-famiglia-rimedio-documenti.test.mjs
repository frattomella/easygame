import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il documento che la famiglia vedeva e non poteva aprire.**
 *
 * ---
 *
 * ## Il difetto
 *
 * `getFamilyDocumentAreas` costruiva la mappa degli allegati con
 * `url: allegato.url`, cioe `/api/v1/attachments/<id>`. Quella rotta chiede
 * `canAccessAttachmentOwner(activeRole, "athlete", "read")`, che eredita da
 * `canAccessClubResource(role, "athletes", "read")`: per `parent` risponde
 * `false`, e per un tutore senza riga in `organization_users` il ruolo attivo
 * e addirittura `null` — lo scope di questa funzione lo costruisce apposta
 * cosi. Il pulsante «Scarica» rispondeva **403** su un documento che la
 * famiglia stava guardando elencato.
 *
 * ## Perche il test esisteva e non serviva
 *
 * L'unica asserzione era `assert.ok(aree.archive[0].fileUrl)`: verificava che
 * l'indirizzo **esistesse**, non che fosse raggiungibile da chi lo riceve. Un
 * indirizzo che risponde 403 e non vuoto, e passava.
 *
 * Qui si verificano le tre cose che contano insieme:
 *
 * 1. l'indirizzo e quello di **famiglia**, non quello generico degli allegati;
 * 2. l'indirizzo generico sarebbe davvero un rifiuto, per `parent` e per un
 *    ruolo attivo nullo — cosi il test fallisce anche se qualcuno «semplifica»
 *    tornando a `allegato.url`;
 * 3. la rotta di famiglia **risolve** quell'identificativo, cioe l'indirizzo
 *    porta ai byte e non a un 404.
 */

const CLUB = "aaaaaaaa-6f00-4000-8000-00000000000a";

const SEGRETERIA = "11111111-6f00-4000-8000-000000000aaa";
const GENITORE = "22222222-6f00-4000-8000-000000000bbb";

const FIGLIO = "aaaa1111-6f00-4000-8000-000000000001";
const RICHIESTA_CONSEGNATA = "rrrr2222-6f00-4000-8000-000000000002";
const ALLEGATO = "all-figlio";

let areaFamiglia;
let dossierLegacy;
let permessiAllegati;
let setPrismaClientForTests;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  areaFamiglia = await import("../../src/lib/server/parent-dashboard.ts");
  dossierLegacy = await import("../../src/lib/server/document-dossier-legacy.ts");
  permessiAllegati = await import(
    "../../src/lib/server/attachment-permissions.ts"
  );
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  user: [
    {
      id: SEGRETERIA,
      email: "segreteria@club.it",
      first_name: "Sara",
      last_name: "Segre",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: GENITORE,
      email: "mamma@famiglia.it",
      first_name: "Anna",
      last_name: "Rossi",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  /*
    **Nessuna riga in `organizationUser` per il genitore, ed e il punto.**

    Un tutore puo non avere nessuna appartenenza al club: e il caso in cui
    `activeRole` vale `null` e la rotta generica degli allegati e piu chiusa
    che mai.
  */
  organizationUser: [
    {
      id: "ou-segreteria",
      organization_id: CLUB,
      user_id: SEGRETERIA,
      role: "owner",
      is_primary: true,
    },
  ],
  club: [{ id: CLUB, slug: "club", name: "Club", document_templates: [] }],
  athlete: [
    {
      id: FIGLIO,
      organization_id: CLUB,
      first_name: "Marco",
      last_name: "Rossi",
      user_id: GENITORE,
      data: {},
    },
  ],
  documentRequest: [
    {
      id: RICHIESTA_CONSEGNATA,
      organization_id: CLUB,
      subject_kind: "athlete",
      subject_id: FIGLIO,
      document_kind: "medical_certificate",
      title: "Certificato medico agonistico",
      description: null,
      required: true,
      due_date: null,
      season_id: null,
      status: "open",
      last_reminded_at: null,
      created_by: SEGRETERIA,
      created_at: new Date("2026-08-01T08:00:00.000Z"),
      updated_at: new Date("2026-08-01T08:00:00.000Z"),
    },
  ],
  documentSubmission: [
    {
      id: "dep-figlio",
      organization_id: CLUB,
      request_id: RICHIESTA_CONSEGNATA,
      subject_kind: "athlete",
      subject_id: FIGLIO,
      document_kind: "medical_certificate",
      attachment_id: ALLEGATO,
      submitted_by: GENITORE,
      submitted_at: new Date("2026-08-20T10:00:00.000Z"),
      source: "parent",
      status: "under_review",
      decided_by: null,
      decided_at: null,
      decision_note: null,
    },
  ],
  attachment: [
    {
      id: ALLEGATO,
      organization_id: CLUB,
      owner_type: "athlete",
      owner_id: FIGLIO,
      category: "medical_certificate",
      file_name: "certificato.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      checksum: "x",
      storage_driver: "database",
      storage_key: "k",
      valid_from: null,
      valid_until: null,
      created_by: GENITORE,
      created_at: new Date("2026-08-20T10:00:00.000Z"),
      updated_at: new Date("2026-08-20T10:00:00.000Z"),
    },
  ],
  notification: [],
  auditLog: [],
});

beforeEach(() => {
  setPrismaClientForTests(createFakePrisma(seed()).client);
});

const areeDelFiglio = () =>
  areaFamiglia.getFamilyDocumentAreas(
    GENITORE,
    { id: FIGLIO, organization_id: CLUB },
    { document_templates: [] },
    { now: new Date("2026-09-01T12:00:00.000Z") },
  );

/* La forma esatta dello scope che `resolveLinkedFamilyScope` produce. */
const scopeDiFamiglia = {
  userId: GENITORE,
  activeOrganizationId: CLUB,
  activeRole: null,
  allowedOrganizationIds: [CLUB],
};

test("l'indirizzo del documento e quello di famiglia, non quello generico degli allegati", async () => {
  const aree = await areeDelFiglio();
  const riga = aree.archive[0];

  assert.equal(
    riga.fileUrl,
    `/api/parent-dashboard/${FIGLIO}/documents/${ALLEGATO}?download=1`,
  );
  assert.equal(
    riga.fileUrl.startsWith("/api/v1/attachments/"),
    false,
    "la famiglia sta ricevendo l'indirizzo della rotta generica: quel pulsante risponde 403",
  );
});

test("l'indirizzo generico sarebbe davvero un rifiuto, per il genitore e per il tutore senza tessera", () => {
  /*
    Se un giorno questo diventasse `true`, la riga sopra sarebbe una
    precauzione inutile e andrebbe riaperta la discussione — non aggirata.
  */
  assert.equal(
    permessiAllegati.canAccessAttachmentOwner("parent", "athlete", "read"),
    false,
  );
  assert.equal(
    permessiAllegati.canAccessAttachmentOwner(null, "athlete", "read"),
    false,
    "un tutore senza riga in organization_users ha activeRole null",
  );
});

test("la rotta di famiglia risolve quell'indirizzo: porta ai byte, non a un 404", async () => {
  const aree = await areeDelFiglio();
  const riga = aree.archive[0];

  /*
    Si legge l'identificativo **dall'indirizzo**, come fa la rotta con
    `params.assetId`: e questo che rende il test una verifica del percorso e
    non una ripetizione della costante.
  */
  const assetId = decodeURIComponent(
    riga.fileUrl.split("/documents/")[1].split("?")[0],
  );

  const risolto = await dossierLegacy.resolveDossierAttachmentId(
    scopeDiFamiglia,
    FIGLIO,
    assetId,
  );

  assert.equal(
    risolto,
    ALLEGATO,
    "la rotta di famiglia non riesce a risalire all'allegato da questo indirizzo",
  );
});

test("il file mantiene nome e tipo: l'indirizzo cambia, i metadati no", async () => {
  const aree = await areeDelFiglio();

  assert.equal(aree.archive[0].fileName, "certificato.pdf");
  assert.equal(aree.archive[0].mimeType, "application/pdf");
});
