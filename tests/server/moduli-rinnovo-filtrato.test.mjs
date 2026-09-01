import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **Il menu del rinnovo, e cio che non deve offrire** (Wave 6, lane 6F,
 * W6-46 e W6-49).
 *
 * `listFamilyRenewalForms` aveva due difetti che si vedevano solo dal lato
 * della famiglia:
 *
 * 1. il filtro `published_version: { not: null }` era **sempre vero** — la
 *    colonna e `Int @default(0)` e non e nullable — quindi un modulo
 *    pubblicato con versione zero finiva nel menu e poi non si apriva. Un
 *    menu che offre cio che non si puo compilare e peggio di un menu vuoto;
 * 2. **nessun filtro sul tipo**: usciva ogni modulo pubblicato e pubblico del
 *    club, e un questionario di gradimento si presentava alla famiglia sotto
 *    «quale modulo vuoi rinnovare».
 *
 * E l'elenco dei moduli lato club leggeva una versione per riga dentro un
 * ciclo sequenziale (W6-49): il test conta le letture, perche il numero di
 * viaggi verso il database e l'unica cosa che quella correzione cambia.
 */

const CLUB_A = "aaaaaaaa-6f00-4000-8000-00000000000a";
const CLUB_B = "bbbbbbbb-6f00-4000-8000-00000000000b";

const SEGRETERIA_A = "11111111-6f00-4000-8000-000000000aaa";
const SEGRETERIA_B = "22222222-6f00-4000-8000-000000000bbb";
const GENITORE = "33333333-6f00-4000-8000-000000000ccc";

const ATLETA = "a1a1a1a1-6f00-4000-8000-000000000001";

const scope = (organizationId, userId, activeRole = "owner") => ({
  userId,
  activeOrganizationId: organizationId,
  activeRole,
  allowedOrganizationIds: [organizationId],
});

const scopeA = () => scope(CLUB_A, SEGRETERIA_A);

let forms;
let iscrizioni;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  forms = await import("../../src/lib/server/forms.ts");
  iscrizioni = await import("../../src/lib/server/enrollment-requests.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const club = (id, name, creatorId) => ({
  id,
  slug: `slug-${id}`,
  name,
  business_name: `${name} ASD`,
  contact_email: `info@${id}.it`,
  logo_url: null,
  payment_plans: [],
  club_sites: [],
  categories: [],
  settings: {},
  creator_id: creatorId,
  organization_users: [],
});

const seed = () => ({
  user: [
    { id: SEGRETERIA_A, email: "segreteria@alfa.it", email_verified_at: new Date() },
    { id: SEGRETERIA_B, email: "segreteria@beta.it", email_verified_at: new Date() },
    { id: GENITORE, email: "mamma@famiglia.it", email_verified_at: new Date() },
  ],
  organizationUser: [
    { id: "ou-a", organization_id: CLUB_A, user_id: SEGRETERIA_A, role: "owner" },
    { id: "ou-b", organization_id: CLUB_B, user_id: SEGRETERIA_B, role: "owner" },
  ],
  club: [
    club(CLUB_A, "ASD Alfa", SEGRETERIA_A),
    club(CLUB_B, "ASD Beta", SEGRETERIA_B),
  ],
  athlete: [
    {
      id: ATLETA,
      organization_id: CLUB_A,
      first_name: "Mario",
      last_name: "Rossi",
      /* Il legame vero: e questo, e non una membership, a fare il genitore. */
      user_id: GENITORE,
      data: { guardians: [{ name: "Anna Rossi", linkedUserId: GENITORE }] },
    },
  ],
  formSubmission: [],
});

/*
  Il doppio di Prisma non implementa le chiavi composte
  (`template_id_version`). Servirla qui fa provare al test il codice vero.
*/
const insegnaChiaveComposta = () => {
  const versioni = fake.client.formTemplateVersion;
  const originale = versioni.findUnique;
  versioni.findUnique = async (args = {}) => {
    const composta = args.where?.template_id_version;
    if (!composta) return originale(args);
    return (
      fake
        .rows("formTemplateVersion")
        .find(
          (row) =>
            row.template_id === composta.template_id &&
            Number(row.version) === Number(composta.version),
        ) || null
    );
  };
};

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
  insegnaChiaveComposta();
});

const CAMPI_ATLETA = [
  {
    id: "f_nome",
    type: "short_text",
    label: "Nome",
    binding: "athlete.firstName",
    required: true,
  },
  {
    id: "f_cognome",
    type: "short_text",
    label: "Cognome",
    binding: "athlete.lastName",
    required: true,
  },
];

const CAMPI_QUESTIONARIO = [
  {
    id: "f_voto",
    type: "dropdown",
    label: "Come e andata la stagione?",
    options: ["Bene", "Cosi cosi", "Male"],
  },
  { id: "f_note", type: "long_text", label: "Suggerimenti" },
];

/** Un modulo del club, pubblicato o no, con i campi e le impostazioni date. */
const modulo = async ({
  titolo,
  campi = CAMPI_ATLETA,
  settings = {},
  pubblica = true,
  proprietario = scopeA(),
}) => {
  const creato = await forms.createFormTemplate(proprietario, { starter: "blank" });

  await forms.updateFormTemplateDraft(proprietario, creato.id, {
    title: titolo,
    description: "",
    fields: campi,
    settings: {
      successMessage: "Grazie",
      closeAt: "",
      collectRespondentEmail: false,
      notifyOnSubmit: false,
      documentTemplateId: "",
      ...settings,
    },
  });

  return pubblica
    ? forms.publishFormTemplate(proprietario, creato.id)
    : forms.getFormTemplate(proprietario, creato.id);
};

const titoliOfferti = async () => {
  const moduli = await iscrizioni.listFamilyRenewalForms(GENITORE, ATLETA);
  return moduli.map((voce) => voce.title).sort();
};

/* ------------------------------------------- cosa il menu offre e cosa no */

test("il menu offre un modulo di iscrizione pubblicato", async () => {
  await modulo({ titolo: "Iscrizione 2026" });

  assert.deepEqual(await titoliOfferti(), ["Iscrizione 2026"]);
});

test("il menu non offre un questionario di gradimento", async () => {
  await modulo({ titolo: "Iscrizione 2026" });
  await modulo({ titolo: "Come e andata la stagione", campi: CAMPI_QUESTIONARIO });

  assert.deepEqual(
    await titoliOfferti(),
    ["Iscrizione 2026"],
    "un questionario non e un modulo da rinnovare",
  );
});

test("il menu non offre un modulo che il club ha dichiarato «altro»", async () => {
  await modulo({ titolo: "Iscrizione 2026" });
  await modulo({
    titolo: "Certificato medico",
    settings: { purpose: "generic" },
  });

  assert.deepEqual(await titoliOfferti(), ["Iscrizione 2026"]);
});

test("il menu non offre un modulo senza una versione pubblicata", async () => {
  /*
    Il difetto misurato: `published_version` e `Int @default(0)` e non
    nullable, quindi `{ not: null }` lasciava passare la versione zero. Qui il
    modulo e in stato `published` **e** ha versione zero, che e il caso in cui
    `findPublicFormBySlug` poi non trova niente da compilare.
  */
  const bozza = await modulo({ titolo: "Iscrizione senza versione", pubblica: false });

  await fake.client.formTemplate.update({
    where: { id: bozza.id },
    data: { status: "published", published_version: 0 },
  });

  assert.deepEqual(await titoliOfferti(), []);
});

test("il menu non offre un modulo la cui riga di versione non esiste piu", async () => {
  const pubblicato = await modulo({ titolo: "Iscrizione 2026" });

  await fake.client.formTemplateVersion.deleteMany({
    where: { template_id: pubblicato.id },
  });

  assert.deepEqual(
    await titoliOfferti(),
    [],
    "offrire uno slug la cui versione non si risolve e promettere un 404",
  );
});

test("il menu non offre un modulo con il link pubblico spento", async () => {
  const pubblicato = await modulo({ titolo: "Iscrizione 2026" });
  await forms.setFormTemplatePublicAccess(scopeA(), pubblicato.id, false);

  assert.deepEqual(await titoliOfferti(), []);
});

test("il menu non offre i moduli di un altro club", async () => {
  await modulo({
    titolo: "Iscrizione della Beta",
    proprietario: scope(CLUB_B, SEGRETERIA_B),
  });

  assert.deepEqual(await titoliOfferti(), []);
});

test("il titolo offerto e quello della versione pubblicata, non della bozza", async () => {
  const pubblicato = await modulo({ titolo: "Iscrizione 2026" });

  await forms.updateFormTemplateDraft(scopeA(), pubblicato.id, {
    title: "Iscrizione 2027 (bozza)",
    description: "",
    fields: CAMPI_ATLETA,
    settings: { successMessage: "Grazie" },
  });

  assert.deepEqual(
    await titoliOfferti(),
    ["Iscrizione 2026"],
    "la famiglia compila la versione pubblicata: e quello il titolo che leggera",
  );
});

/* ------------------------------------------------ l'elenco lato club (W6-49) */

test("l'elenco dei moduli legge le versioni pubblicate in una lettura sola", async () => {
  for (const titolo of ["Uno", "Due", "Tre", "Quattro"]) {
    await modulo({ titolo });
  }

  const prima = fake.calls.filter(
    (call) =>
      call.delegate === "formTemplateVersion" &&
      (call.method === "findMany" || call.method === "findUnique"),
  ).length;

  const elenco = await forms.listFormTemplates(scopeA(), {});
  assert.equal(elenco.length, 4);

  const letture = fake.calls
    .slice()
    .filter(
      (call) =>
        call.delegate === "formTemplateVersion" &&
        (call.method === "findMany" || call.method === "findUnique"),
    ).length;

  assert.equal(
    letture - prima,
    1,
    "quattro moduli non devono costare quattro viaggi verso il database",
  );
});

test("l'elenco dei moduli dice da quale modello vengono e a cosa servono", async () => {
  const adottato = await forms.createFormTemplate(scopeA(), {
    starter: "online_enrollment",
  });
  await modulo({ titolo: "Questionario", campi: CAMPI_QUESTIONARIO });

  const elenco = await forms.listFormTemplates(scopeA(), {});
  const perId = new Map(elenco.map((voce) => [voce.id, voce]));

  assert.equal(perId.get(adottato.id).catalogKey, "online_enrollment");
  assert.equal(perId.get(adottato.id).isEnrollment, true);

  const questionario = elenco.find((voce) => voce.title === "Questionario");
  assert.equal(questionario.catalogKey, "");
  assert.equal(questionario.isEnrollment, false);
});
