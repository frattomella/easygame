import assert from "node:assert/strict";
import test, { afterEach, before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * RC Fix 1, punto 11 — quanto costa aprire la Dashboard Club.
 *
 * La misura di partenza, con `npm run measure:dashboard` su 200 atleti:
 *
 *     richieste  giri di rete  kB     duplicati
 *     29         10            1.960  clubs x9, simplified_athletes x6, ...
 *
 * Non era una query lenta: erano dieci attese **in fila** e lo stesso
 * archivio letto quattro volte, tre delle quali con il `data` intero — che
 * porta tutori, rate e documenti — per contare gli atleti attivi.
 *
 * Questi test difendono il numero, non la sensazione: una lettura sola, in
 * parallelo, in proiezione `summary`. Se qualcuno riaggiunge una lettura,
 * qui si vede.
 */

let overview;
let fetchOriginale;
let richieste;

const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

const atleti = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `athlete-${index}`,
    club_id: CLUB,
    first_name: `Nome${index}`,
    last_name: `Cognome${index}`,
    category_id: `cat-${index % 4}`,
    data: { status: index % 10 === 0 ? "inactive" : "active" },
  }));

const rispostaPer = (url) => {
  const [percorso, query = ""] = String(url).split("?");
  const params = new URLSearchParams(query);

  if (percorso === "/api/v1/clubs") {
    return [
      {
        id: CLUB,
        name: "ASD Misura",
        settings: {},
        logo_url: null,
        appointments: [],
        secretariat_notes: [],
        matches: [],
        categories: [{ id: "cat-0" }, { id: "cat-1" }],
        trainings: [],
      },
    ];
  }

  if (percorso === "/api/v1/simplified_athletes") {
    assert.equal(
      params.get("view"),
      "summary",
      "la dashboard conta e avvisa: non deve chiedere il data intero",
    );
    return atleti(10);
  }

  if (percorso === "/api/v1/medical_certificates") {
    return [
      {
        id: "cert-1",
        athlete_id: "athlete-1",
        type: "agonistico",
        expiry_date: "2026-01-01",
      },
    ];
  }

  return [];
};

before(async () => {
  overview = await import("../../src/lib/dashboard/club-overview.ts");
});

beforeEach(() => {
  richieste = [];
  fetchOriginale = globalThis.fetch;
  globalThis.fetch = async (url) => {
    richieste.push(String(url));
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ data: rispostaPer(url), error: null }),
    };
  };
});

afterEach(() => {
  globalThis.fetch = fetchOriginale;
});

// --- il costo -----------------------------------------------------------------

test("l'apertura costa quattro richieste, non ventinove", async () => {
  await overview.loadClubDashboardOverview(CLUB);

  assert.equal(
    richieste.length,
    4,
    `richieste effettive:\n${richieste.join("\n")}`,
  );
});

test("nessuna risorsa viene chiesta due volte", async () => {
  await overview.loadClubDashboardOverview(CLUB);

  const percorsi = richieste.map((url) => url.split("?")[0]);
  assert.deepEqual(
    percorsi.length,
    new Set(percorsi).size,
    `duplicati: ${percorsi.join(", ")}`,
  );
});

test("la riga del club arriva in una richiesta sola, con la proiezione", async () => {
  await overview.loadClubDashboardOverview(CLUB);

  const clubRequests = richieste.filter((url) =>
    url.startsWith("/api/v1/clubs"),
  );
  assert.equal(clubRequests.length, 1, "erano cinque letture della stessa riga");

  const fields = new URLSearchParams(clubRequests[0].split("?")[1]).get(
    "fields",
  );
  for (const field of [
    "appointments",
    "secretariat_notes",
    "matches",
    "categories",
    "trainings",
  ]) {
    assert.equal(
      String(fields).includes(field),
      true,
      `${field} deve arrivare con la stessa richiesta`,
    );
  }
});

test("un club assente non fa partire nessuna richiesta", async () => {
  const result = await overview.loadClubDashboardOverview("");

  assert.deepEqual(richieste, []);
  assert.deepEqual(result, { club: null, athletes: [], certificates: [] });
});

// --- cio che se ne ricava ------------------------------------------------------

const OGGI = new Date("2026-08-27T10:00:00Z");

test("gli appuntamenti passati non compaiono, e l'ordine e cronologico", () => {
  const selezionati = overview.selectUpcomingAppointments(
    [
      { id: "b", title: "Dopo", date: "2026-09-02", time: "10:00" },
      { id: "vecchio", title: "Ieri", date: "2026-08-26", time: "10:00" },
      { id: "a", title: "Domani", date: "2026-08-28", time: "09:00" },
      { id: "a2", title: "Domani tardi", date: "2026-08-28", time: "18:00" },
      { id: "rotto", title: "Senza data" },
    ],
    OGGI,
  );

  assert.deepEqual(
    selezionati.map((appointment) => appointment.id),
    ["a", "a2", "b"],
  );
});

test("le partite annullate non sono prossime partite", () => {
  const selezionate = overview.selectUpcomingMatches(
    [
      { id: "ok", date: "2026-09-01", status: "scheduled" },
      { id: "annullata", date: "2026-09-01", status: "cancelled" },
      { id: "passata", date: "2026-08-01", status: "scheduled" },
    ],
    OGGI,
  );

  assert.deepEqual(
    selezionate.map((match) => match.id),
    ["ok"],
  );
});

test("un promemoria senza scadenza resta attivo", () => {
  const attivi = overview.selectActiveNotes(
    [
      { id: "senza", content: "Sempre", date: "2026-01-01" },
      { id: "valido", content: "Vale", date: "2026-01-01", expiryDate: "2026-12-31" },
      { id: "scaduto", content: "Scaduto", date: "2026-01-01", expiryDate: "2026-01-31" },
    ],
    OGGI,
  );

  assert.deepEqual(
    attivi.map((note) => note.id),
    ["senza", "valido"],
  );
});

test("le metriche si ricavano dai dati gia letti", () => {
  const metrics = overview.buildDashboardMetrics({
    club: {
      categories: [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
      trainings: [
        { id: "t1", date: "2026-09-02", status: "scheduled" },
        { id: "t2", date: "2026-09-20", status: "annullato" },
        { id: "t3", date: "2026-12-01", status: "scheduled" },
        { id: "t4", date: "2026-08-01", status: "scheduled" },
      ],
    },
    athletes: atleti(20),
    certificates: [
      { id: "c1", athleteId: "athlete-1", type: "a", expiryDate: "2026-08-01" },
      { id: "c2", athleteId: "athlete-2", type: "a", expiryDate: "2026-09-10" },
      { id: "c3", athleteId: "athlete-3", type: "a", expiryDate: "2027-01-01" },
      { id: "c4", athleteId: "athlete-4", type: "a", expiryDate: null },
    ],
    today: OGGI,
  });

  assert.equal(metrics.totalAthletes, 18, "due su venti sono inattivi");
  assert.equal(metrics.activeCategories, 3);
  assert.equal(
    metrics.upcomingTrainings,
    1,
    "solo quelli nei trenta giorni, annullati esclusi",
  );
  assert.equal(metrics.expiredCertificates, 1);
  assert.equal(metrics.expiringCertificates, 1);
});

test("gli avvisi distinguono scaduto, in scadenza e mancante", () => {
  const alerts = overview.buildCertificateAlerts({
    athletes: [
      { id: "athlete-1", first_name: "Mario", last_name: "Rossi", data: { status: "active" } },
      { id: "athlete-2", first_name: "Anna", last_name: "Bianchi", data: { status: "active" } },
      { id: "athlete-3", first_name: "Luca", last_name: "Verdi", data: { status: "active" } },
      { id: "athlete-4", first_name: "Sara", last_name: "Neri", data: { status: "inactive" } },
      { id: "athlete-5", first_name: "Ugo", last_name: "Gialli", data: { status: "active" } },
    ],
    certificates: [
      { id: "c1", athleteId: "athlete-1", type: "agonistico", expiryDate: "2026-08-01" },
      { id: "c2", athleteId: "athlete-2", type: "agonistico", expiryDate: "2026-09-10" },
      { id: "c3", athleteId: "athlete-3", type: "agonistico", expiryDate: "2027-06-01" },
      { id: "c4", athleteId: "athlete-4", type: "agonistico", expiryDate: "2026-08-01" },
    ],
    today: OGGI,
  });

  assert.deepEqual(
    alerts.map((alert) => [alert.athleteId, alert.status]),
    [
      ["athlete-1", "expired"],
      ["athlete-2", "expiring"],
      ["athlete-5", "missing"],
    ],
    "un certificato valido non e un avviso, e un atleta inattivo nemmeno",
  );
  assert.equal(alerts[0].athleteName, "Rossi Mario");
});

test("con due certificati per lo stesso atleta vale il piu recente", () => {
  const alerts = overview.buildCertificateAlerts({
    athletes: [
      { id: "athlete-1", first_name: "Mario", last_name: "Rossi", data: { status: "active" } },
    ],
    certificates: [
      { id: "vecchio", athleteId: "athlete-1", type: "a", expiryDate: "2025-01-01" },
      { id: "nuovo", athleteId: "athlete-1", type: "a", expiryDate: "2027-01-01" },
    ],
    today: OGGI,
  });

  assert.deepEqual(alerts, [], "il rinnovo vale, non il certificato superato");
});

// --- la pagina ------------------------------------------------------------------

const read = (relative) =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

test("la dashboard non rilegge cio che ha gia", () => {
  const page = read("src/app/dashboard/page.tsx");

  assert.match(page, /loadClubDashboardOverview\(activeClubId\)/);
  assert.equal(
    /getClubData\(/.test(page),
    false,
    "erano quattro letture consecutive della stessa riga del club",
  );
  assert.equal(
    /getClubAthletes\(/.test(page),
    false,
    "gli atleti arrivano dalla lettura sola",
  );
  assert.match(page, /source="provided"/, "gli avvisi non si rileggono");
  assert.equal(
    /<MetricsOverview[\s\S]{0,400}organizationId=/.test(page),
    false,
    "con organizationId il componente riparte a leggere per conto suo",
  );
});

test("il riquadro allenamenti non aspetta 300 ms prima di partire", () => {
  const widget = read("src/components/dashboard/UpcomingTrainings.tsx");

  assert.equal(
    /debounce\(/.test(widget),
    false,
    "alla prima apertura non c'e niente da accorpare",
  );
  assert.match(widget, /getClubAthletes\(orgId, \{ view: "summary" \}\)/);
});
