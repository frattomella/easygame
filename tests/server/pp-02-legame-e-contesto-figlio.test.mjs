import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * **PP-02 §A — il legame di un tutore, e il figlio di cui si sta parlando.**
 *
 * Due difetti diversi con la stessa radice: **il legame veniva dedotto da
 * qualcosa che legame non e.**
 *
 * 1. **La tessera al posto del legame.** `getParentLinkedAthletes` cercava i
 *    candidati fra «gli atleti di cui sono l'utenza collegata piu tutti gli
 *    atleti dei club in cui ho una tessera», e solo **dopo** applicava il vaglio
 *    vero, che legge `athletes.data.guardians`. Un vaglio che gira su un insieme
 *    non puo trovare cio che l'insieme non contiene: **un tutore collegato ma
 *    senza tessera non trovava nessun figlio**, mentre il prodotto dichiara che
 *    «per genitore e atleta il gate e il legame, non il ruolo».
 *
 *    Nessuna sonda lo aveva mai chiesto senza dare prima una tessera: `U-06`
 *    della Wave 6 misura la corrispondenza del legame su un genitore che la
 *    tessera ce l'ha. Questi test non gliela danno.
 *
 *    **Il confine resta dov'era**, ed e dichiarato qui sotto: l'allargamento
 *    vale per l'identificativo dell'utenza — che nasce da un atto della
 *    persona, il riscatto di un gettone — e **non** per l'indirizzo di
 *    contatto, che lo scrive la segreteria a mano e che una lettera sbagliata
 *    trasforma nell'indirizzo verificato di uno sconosciuto.
 *
 * 2. **Il primo figlio al posto del figlio chiesto.** `getParentDashboardData`
 *    ricadeva su `linkedAthletes[0]` quando l'identificativo non era uno UUID.
 *    Non usciva dal perimetro della famiglia, e per questo era sopravvissuto
 *    alle revisioni; ma dentro il perimetro faceva la cosa peggiore che quella
 *    schermata possa fare — rispondere del **figlio sbagliato senza dirlo**, su
 *    pagine che parlano di importi e di certificati medici.
 */

const CLUB = "aaaaaaaa-0202-4000-8000-00000000000a";
const ALTRO_CLUB = "bbbbbbbb-0202-4000-8000-00000000000b";

const ANNA = "11111111-0202-4000-8000-000000000aaa";
const CARLA = "22222222-0202-4000-8000-000000000bbb";
const BRUNO = "33333333-0202-4000-8000-000000000ccc";

const MARCO = "aaaa0202-0202-4000-8000-00000000000a";
const GIULIA = "bbbb0202-0202-4000-8000-00000000000b";
const NINA = "cccc0202-0202-4000-8000-00000000000c";
const LUCA = "dddd0202-0202-4000-8000-00000000000d";

let cruscotto;
let setPrismaClientForTests;
let fake;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  cruscotto = await import("../../src/lib/server/parent-dashboard.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const club = (id, nome) => ({
  id,
  slug: id,
  name: nome,
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
  club_sites: [
    { id: "nord", name: "Sede Nord", active: true },
    { id: "sud", name: "Sede Sud", active: true },
  ],
  categories: [
    { id: "u12", name: "Under 12" },
    { id: "prima", name: "Prima squadra" },
  ],
});

const seed = () => ({
  user: [
    {
      id: ANNA,
      email: "anna@example.it",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    /*
      Carla non ha nessuna riga in `organizationUser`, ed e il punto: il suo
      legame vive **solo** sulla scheda dell'atleta.
    */
    {
      id: CARLA,
      email: "carla@example.it",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: BRUNO,
      email: "bruno@example.it",
      email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  club: [club(CLUB, "ASD Collaudo"), club(ALTRO_CLUB, "Altro club")],
  organizationUser: [
    {
      id: "ou-anna",
      organization_id: CLUB,
      user_id: ANNA,
      role: "parent",
      is_primary: true,
    },
    {
      id: "ou-bruno",
      organization_id: CLUB,
      user_id: BRUNO,
      role: "parent",
      is_primary: true,
    },
  ],
  athlete: [
    {
      id: MARCO,
      organization_id: CLUB,
      first_name: "Marco",
      last_name: "Rossi",
      status: "active",
      category_id: "u12",
      category_name: "Under 12",
      birth_date: new Date("2013-05-12T00:00:00.000Z"),
      data: { guardians: [{ name: "Anna", linkedUserId: ANNA }] },
    },
    {
      id: GIULIA,
      organization_id: CLUB,
      first_name: "Giulia",
      last_name: "Rossi",
      status: "inactive",
      category_id: "prima",
      category_name: "Prima squadra",
      birth_date: new Date("2010-05-12T00:00:00.000Z"),
      data: { guardians: [{ name: "Anna", linkedUserId: ANNA }] },
    },
    {
      id: NINA,
      organization_id: CLUB,
      first_name: "Nina",
      last_name: "Verdi",
      status: "active",
      category_id: "u12",
      category_name: "Under 12",
      birth_date: new Date("2014-05-12T00:00:00.000Z"),
      data: { guardians: [{ name: "Carla", linkedUserId: CARLA }] },
    },
    {
      id: LUCA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      status: "active",
      category_id: "u12",
      category_name: "Under 12",
      data: { guardians: [{ name: "Bruno", linkedUserId: BRUNO }] },
    },
  ],
  athleteCategoryMembership: [
    {
      id: "acm-1",
      organization_id: CLUB,
      athlete_id: MARCO,
      category_id: "u12",
      category_name: "Under 12",
      is_primary: true,
      site_id: "nord",
    },
    {
      id: "acm-2",
      organization_id: CLUB,
      athlete_id: MARCO,
      category_id: "prima",
      category_name: "Prima squadra",
      is_primary: false,
      site_id: "sud",
    },
  ],
  athletePayment: [],
  receipt: [],
  invoice: [],
  medicalCertificate: [],
  clubEventParticipant: [],
  notification: [],
  documentRequest: [],
  documentSubmission: [],
  attachment: [],
  auditLog: [],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/* -------------------------------------------------- il legame, senza tessera */

test("un tutore senza tessera di club raggiunge il proprio figlio", async () => {
  const figli = await cruscotto.listParentChildren(CARLA);
  assert.deepEqual(
    figli.map((figlio) => figlio.name),
    ["Verdi Nina"],
  );
});

test("e lo raggiunge senza nessuna riga in organization_users", async () => {
  assert.equal(await cruscotto.canParentAccessAthlete(CARLA, NINA), true);
});

test("ma non raggiunge gli altri atleti dello stesso club", async () => {
  assert.equal(await cruscotto.canParentAccessAthlete(CARLA, MARCO), false);
  assert.equal(await cruscotto.canParentAccessAthlete(CARLA, LUCA), false);
});

test("il tutore senza tessera apre davvero il cruscotto, non solo l'elenco", async () => {
  const dati = await cruscotto.getParentDashboardData(CARLA, NINA);
  assert.equal(dati?.athlete?.id, NINA);
  /*
    E la stagione la legge dal server: e proprio la persona per cui il
    `localStorage` non e mai stato scritto da nessuno, cioe il caso in cui la
    barra diceva «Nessuna stagione attiva» su un club che ne ha una.
  */
  assert.equal(dati?.club?.activeSeasonLabel, "2026/27");
});

test("un indirizzo di contatto, in un club estraneo, non e un legame", async () => {
  /*
    **Il confine, misurato.** La scheda di Sara — in un club dove Carla non ha
    ne tessera ne nessun altro figlio — porta l'indirizzo verificato di Carla.
    Non basta: un indirizzo lo scrive la segreteria a mano, e un refuso su un
    dominio diffuso e l'indirizzo verificato di un'altra persona reale.

    E la stessa proprieta che `area-famiglia.test.mjs` presidia per nome. PP-02
    la conferma invece di allargarla di nascosto: allargarla e una decisione di
    prodotto, e sta fra i residui.

    Dentro un club in cui il tutore **e gia entrato** l'indirizzo continua a
    valere, ed e il comportamento odierno: e la strada con cui la segreteria
    collega il secondo figlio senza un secondo invito.
  */
  fake.rows("athlete").push({
    id: "eeee0202-0202-4000-8000-00000000000e",
    organization_id: ALTRO_CLUB,
    first_name: "Sara",
    last_name: "Neri",
    status: "active",
    data: { guardians: [{ name: "Carla", email: "carla@example.it" }] },
  });

  assert.equal(
    await cruscotto.canParentAccessAthlete(
      CARLA,
      "eeee0202-0202-4000-8000-00000000000e",
    ),
    false,
  );
});

test("un genitore con tessera ma senza legame non raggiunge nessuno", async () => {
  /*
    Il rovescio dell'allargamento, e la meta che va misurata due volte: la
    tessera **da sola** non e mai bastata, e continua a non bastare.
  */
  const senzaLegame = await cruscotto.listParentChildren(
    "99999999-0202-4000-8000-000000000999",
  );
  assert.deepEqual(senzaLegame, []);
});

/* ------------------------------------------ il figlio chiesto, non il primo */

test("un identificativo sconosciuto non ricade sul primo figlio", async () => {
  assert.equal(
    await cruscotto.getParentDashboardData(
      ANNA,
      "77777777-0202-4000-8000-000000000777",
    ),
    null,
  );
});

test("un identificativo malformato non ricade sul primo figlio", async () => {
  assert.equal(await cruscotto.getParentDashboardData(ANNA, "pippo"), null);
  assert.equal(await cruscotto.getParentDashboardData(ANNA, ""), null);
});

test("l'atleta di un'altra famiglia dello stesso club non apre niente", async () => {
  assert.equal(await cruscotto.getParentDashboardData(ANNA, LUCA), null);
  assert.equal(await cruscotto.canParentAccessAthlete(ANNA, LUCA), false);
});

test("la forma storica /parent-view/<idClub> continua a risolvere", async () => {
  const dati = await cruscotto.getParentDashboardData(ANNA, CLUB);
  assert.equal(Boolean(dati?.athlete?.id), true);
});

/* ------------------------------------- la scheda di scelta, e le categorie */

test("la schermata di scelta porta anno, stato e tutte le categorie", async () => {
  const figli = await cruscotto.listParentChildren(ANNA);
  const marco = figli.find((figlio) => figlio.name === "Rossi Marco");
  const giulia = figli.find((figlio) => figlio.name === "Rossi Giulia");

  assert.equal(marco.birthYear, 2013);
  assert.equal(giulia.status, "inactive");
  assert.equal(marco.categories.length, 2);
});

test("ogni appartenenza porta il nome della sede, non l'identificativo", async () => {
  const figli = await cruscotto.listParentChildren(ANNA);
  const marco = figli.find((figlio) => figlio.name === "Rossi Marco");

  assert.deepEqual(
    marco.categories.map((categoria) => categoria.siteName).sort(),
    ["Sede Nord", "Sede Sud"],
  );
});

test("la schermata di scelta non porta niente di clinico o economico", async () => {
  /*
    L'elenco chiuso e la regola: un campo nuovo sulla riga dell'atleta deve
    nascere **invisibile** qui. Il presidio elenca cio che puo uscire, cosi
    aggiungerne uno per sbaglio fa fallire questo test e non una revisione.
  */
  const [figlio] = await cruscotto.listParentChildren(CARLA);
  assert.deepEqual(Object.keys(figlio).sort(), [
    "avatarUrl",
    "birthYear",
    "categories",
    "categoryName",
    "clubId",
    "clubLogoUrl",
    "clubName",
    "id",
    "name",
    "status",
  ]);
});

test("il cruscotto porta la foto del figlio, per il guscio", async () => {
  const dati = await cruscotto.getParentDashboardData(ANNA, MARCO);
  assert.equal(
    Object.prototype.hasOwnProperty.call(dati.athlete, "avatar_url"),
    true,
  );
});

test("il figlio in due categorie ne mostra due, con la primaria dichiarata", async () => {
  const dati = await cruscotto.getParentDashboardData(ANNA, MARCO);
  assert.deepEqual(
    dati.athlete.categories.map((categoria) => categoria.name).sort(),
    ["Prima squadra", "Under 12"],
  );
  assert.equal(
    dati.athlete.categories.find((categoria) => categoria.isPrimary)?.name,
    "Under 12",
  );
});
