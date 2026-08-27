/**
 * Quanto costa aprire la Dashboard Club?
 *
 * **Perche uno script e non un cronometro.** «La dashboard e lenta» non e una
 * misura: non dice se e lenta per il numero di richieste, per la loro
 * sequenza, per il peso di una sola, o per il database. Questo script separa
 * le quattro cose e produce la riga «prima» e la riga «dopo» della stessa
 * tabella, senza toccare nessun database: sostituisce `fetch` con un doppio
 * che risponde archivi sintetici con la forma reale dei record, e conta.
 *
 *     npm run measure:dashboard
 *     npm run measure:dashboard -- 200 1000
 *
 * Cosa misura:
 *
 * - **richieste**: quante ne parte una apertura della pagina;
 * - **giri di rete**: quante attese in fila. E il numero che si sente. Dieci
 *   richieste in parallelo costano un giro; tre in fila ne costano tre;
 * - **byte**: quanto arriva al browser, in totale e nella richiesta piu pesante;
 * - **duplicati**: la stessa risorsa chiesta piu volte nella stessa apertura.
 *
 * La latenza simulata (`LATENCY_MS`) serve solo a rendere osservabile la
 * sequenza: il tempo assoluto non e una previsione, il **rapporto** fra prima
 * e dopo si.
 */

import { setTimeout as sleep } from "node:timers/promises";

const SIZES = process.argv.slice(2).map(Number).filter(Boolean);
const ATHLETE_COUNTS = SIZES.length ? SIZES : [200, 1000];
const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

/** Latenza per richiesta. Un valore realistico per Neon da Vercel. */
const LATENCY_MS = 25;

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";

/* ------------------------------------------------ gli archivi sintetici */

const athleteFull = (index) => ({
  id: `athlete-${index}`,
  club_id: CLUB,
  organization_id: CLUB,
  first_name: `Nome${index}`,
  last_name: `Cognome${index}`,
  birth_date: "2010-05-14T00:00:00.000Z",
  status: index % 11 === 0 ? "inactive" : "active",
  category_id: `cat-${index % 8}`,
  category_name: `Under ${12 + (index % 8)}`,
  jersey_number: String(index % 99),
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  data: {
    status: index % 11 === 0 ? "inactive" : "active",
    enrollmentStatus: true,
    medicalCertExpiry: "2027-03-01",
    phone: "+39 333 1234567",
    email: `atleta${index}@esempio.it`,
    address: "Via Roma 1",
    city: "Milano",
    fiscalCode: "RSSMRA10E54F205X",
    clothingSizes: { maglia: "M", pantaloncini: "M", scarpe: "40" },
    guardians: [
      { name: "Genitore Uno", phone: "+39 333 0000001", email: `g1-${index}@esempio.it` },
      { name: "Genitore Due", phone: "+39 333 0000002", email: `g2-${index}@esempio.it` },
    ],
    enrollmentPaymentConfig: {
      planId: "plan-1",
      planName: "Quota annuale",
      installments: [
        { id: "r1", label: "Rata 1", amount: 200, dueDate: "2026-10-01" },
        { id: "r2", label: "Rata 2", amount: 200, dueDate: "2027-01-01" },
      ],
    },
    documents: [
      {
        id: `doc-${index}`,
        title: "Certificato medico",
        fileUrl: "attachment:11111111-2222-4333-8444-555555555555",
      },
    ],
  },
});

const athleteSummary = (index) => {
  const { data, ...rest } = athleteFull(index);
  return {
    ...rest,
    data: {
      status: data.status,
      enrollmentStatus: data.enrollmentStatus,
      medicalCertExpiry: data.medicalCertExpiry,
      phone: data.phone,
      email: data.email,
    },
  };
};

const training = (index) => ({
  id: `training-${index}`,
  date: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`,
  startTime: "18:00",
  endTime: "19:30",
  categories: [`cat-${index % 8}`],
  trainerIds: [`trainer-${index % 4}`],
  status: "scheduled",
});

const match = (index) => ({
  id: `match-${index}`,
  date: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`,
  time: "15:00",
  opponent: `Squadra ${index}`,
  location: "Campo 1",
  category: `Under ${12 + (index % 8)}`,
  status: "scheduled",
  convocati: Array.from({ length: 18 }, (_, i) => `athlete-${(index * 18 + i) % 200}`),
});

const certificate = (index) => ({
  id: `cert-${index}`,
  athlete_id: `athlete-${index}`,
  organization_id: CLUB,
  type: "agonistico",
  expiry_date: "2027-03-01",
});

const buildArchive = (athleteCount) => ({
  athletesFull: Array.from({ length: athleteCount }, (_, i) => athleteFull(i)),
  athletesSummary: Array.from({ length: athleteCount }, (_, i) => athleteSummary(i)),
  trainings: Array.from({ length: 60 }, (_, i) => training(i)),
  matches: Array.from({ length: 40 }, (_, i) => match(i)),
  certificates: Array.from({ length: athleteCount }, (_, i) => certificate(i)),
  categories: Array.from({ length: 8 }, (_, i) => ({
    id: `cat-${i}`,
    name: `Under ${12 + i}`,
  })),
  appointments: Array.from({ length: 12 }, (_, i) => ({
    id: `app-${i}`,
    title: `Appuntamento ${i}`,
    date: "2026-09-10",
    time: "10:00",
  })),
  notes: Array.from({ length: 10 }, (_, i) => ({
    id: `note-${i}`,
    content: `Promemoria ${i}`,
    date: "2026-09-01",
  })),
  trainers: Array.from({ length: 6 }, (_, i) => ({
    id: `trainer-${i}`,
    name: `Allenatore ${i}`,
  })),
  members: [],
});

/* ------------------------------------------------ il doppio di `fetch` */

const createProbe = (archive) => {
  const requests = [];
  let concurrentDepth = 0;
  let roundTrips = 0;

  const bodyFor = (url) => {
    const [path, query = ""] = String(url).split("?");
    const params = new URLSearchParams(query);
    const fields = (params.get("fields") || "").split(",").filter(Boolean);

    if (path === "/api/v1/simplified_athletes" || path === "/api/v1/athletes") {
      const rows =
        params.get("view") === "summary"
          ? archive.athletesSummary
          : archive.athletesFull;
      const select = params.get("select");
      if (select) {
        const columns = select.split(",").map((column) => column.trim());
        return rows.map((row) =>
          Object.fromEntries(columns.map((column) => [column, row[column]])),
        );
      }
      return rows;
    }

    if (path === "/api/v1/medical_certificates") return archive.certificates;
    if (path === "/api/v1/athlete_category_memberships") return [];
    if (path === "/api/v1/organization_users") return [];

    if (path === "/api/v1/clubs" || path === "/api/v1/organizations") {
      const all = {
        id: CLUB,
        slug: "club",
        name: "ASD Misura",
        logo_url: null,
        settings: { seasons: [], activeSeasonId: null },
        appointments: archive.appointments,
        secretariat_notes: archive.notes,
        matches: archive.matches,
        categories: archive.categories,
        trainings: archive.trainings,
        trainers: archive.trainers,
        members: archive.members,
      };
      const record = fields.length
        ? Object.fromEntries(
            Object.entries(all).filter(
              ([key]) =>
                fields.includes(key) ||
                ["id", "slug", "name", "settings"].includes(key),
            ),
          )
        : all;
      return [record];
    }

    return [];
  };

  const probe = async (url) => {
    const start = Date.now();
    concurrentDepth += 1;
    const depth = concurrentDepth;

    await sleep(LATENCY_MS);

    const data = bodyFor(url);
    const bytes = Buffer.byteLength(JSON.stringify({ data, error: null }));
    requests.push({ url: String(url), bytes, depth, start });
    concurrentDepth -= 1;

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      json: async () => ({ data, error: null }),
    };
  };

  return {
    probe,
    requests,
    get roundTrips() {
      return roundTrips;
    },
  };
};

/**
 * Giri di rete: quante attese in fila.
 *
 * Si ricava dagli intervalli: due richieste che si sovrappongono nel tempo
 * costano un giro solo. E la differenza fra «dieci richieste» e «dieci
 * attese», che e cio che l'utente sente.
 */
const countRoundTrips = (requests) => {
  const spans = requests
    .map((request) => ({ start: request.start, end: request.start + LATENCY_MS }))
    .sort((left, right) => left.start - right.start);

  let trips = 0;
  let openUntil = -1;

  for (const span of spans) {
    if (span.start >= openUntil) {
      trips += 1;
      openUntil = span.end;
    } else {
      openUntil = Math.max(openUntil, span.end);
    }
  }

  return trips;
};

const summarize = (label, requests, elapsed) => {
  const total = requests.reduce((sum, request) => sum + request.bytes, 0);
  const heaviest = requests.reduce(
    (worst, request) => (request.bytes > worst.bytes ? request : worst),
    { bytes: 0, url: "-" },
  );

  const byPath = new Map();
  for (const request of requests) {
    const key = String(request.url).split("?")[0];
    byPath.set(key, (byPath.get(key) || 0) + 1);
  }
  const duplicates = [...byPath.entries()].filter(([, count]) => count > 1);

  return {
    label,
    requests: requests.length,
    roundTrips: countRoundTrips(requests),
    elapsedMs: elapsed,
    totalKb: Math.round(total / 1024),
    heaviestKb: Math.round(heaviest.bytes / 1024),
    heaviestUrl: String(heaviest.url).split("?")[0],
    duplicates: duplicates
      .map(([path, count]) => `${path.replace("/api/v1/", "")} x${count}`)
      .join(", "),
  };
};

/* ------------------------------------------------ le due aperture */

/**
 * Come la pagina caricava i dati prima di RC Fix 1.
 *
 * Ricostruita fedelmente dalle chiamate che facevano `dashboard/page.tsx`,
 * `MetricsOverview`, `UpcomingTrainings` e `CertificationAlerts`. Resta qui
 * come termine di paragone: e la riga «prima» della tabella, e senza di essa
 * la riga «dopo» non dice niente.
 */
const openDashboardBefore = async (supabase, simplifiedDb) => {
  const { getClubData, getClubAthletes, getClubTrainings, getClubCategories, getClubTrainers } =
    simplifiedDb;

  // dashboard/page.tsx — fetchClubInfo, poi loadTodayData, tutto in fila
  await supabase.from("organizations").select("id, name, logo_url").eq("id", CLUB).single();
  await getClubData(CLUB, "appointments");
  await getClubData(CLUB, "secretariat_notes");
  await getClubData(CLUB, "matches");
  await getClubAthletes(CLUB);

  // MetricsOverview — quattro in parallelo, una delle quali inutilizzata
  await Promise.all([
    supabase.from("clubs").select("categories, trainings").eq("id", CLUB).single(),
    supabase.from("simplified_athletes").select("id, data").eq("club_id", CLUB),
    supabase.from("simplified_athletes").select("id").eq("club_id", CLUB),
    supabase.from("medical_certificates").select("athlete_id, expiry_date").eq("organization_id", CLUB),
  ]);

  // UpcomingTrainings — quattro in parallelo, atleti per la seconda volta
  await Promise.all([
    getClubTrainings(CLUB),
    getClubCategories(CLUB),
    getClubTrainers(CLUB),
    getClubAthletes(CLUB),
  ]);

  // CertificationAlerts — due in fila
  await supabase.from("athletes").select("id, first_name, last_name").eq("organization_id", CLUB);
  await supabase
    .from("medical_certificates")
    .select("id, type, expiry_date, athlete_id")
    .eq("athletes.organization_id", CLUB);
};

const openDashboardAfter = async (overview) => {
  await overview.loadClubDashboardOverview(CLUB);
};

/**
 * L'apertura intera: la lettura sopra la piega **piu** il riquadro degli
 * allenamenti, che resta una lettura a se perche mette insieme allenamenti,
 * categorie e allenatori da piu origini.
 *
 * Sta qui per onesta: nascondere il costo del riquadro dietro la riga
 * «dopo» sarebbe misurare cio che fa comodo.
 */
const openDashboardAfterFull = async (overview, simplifiedDb) => {
  const { getClubTrainings, getClubCategories, getClubTrainers, getClubAthletes } =
    simplifiedDb;

  await Promise.all([
    overview.loadClubDashboardOverview(CLUB),
    (async () => {
      await Promise.all([
        getClubTrainings(CLUB),
        getClubCategories(CLUB),
        getClubTrainers(CLUB),
        getClubAthletes(CLUB, { view: "summary" }),
      ]);
    })(),
  ]);
};

/* ------------------------------------------------ esecuzione */

const run = async () => {
  const { supabase } = await import("../src/lib/supabase.ts");
  const simplifiedDb = await import("../src/lib/simplified-db.ts");

  let overview = null;
  try {
    overview = await import("../src/lib/dashboard/club-overview.ts");
  } catch {
    overview = null;
  }

  const rows = [];

  for (const athleteCount of ATHLETE_COUNTS) {
    const archive = buildArchive(athleteCount);

    for (const [label, open] of [
      ["prima", () => openDashboardBefore(supabase, simplifiedDb)],
      ...(overview
        ? [
            ["dopo", () => openDashboardAfter(overview)],
            [
              "dopo+riquadri",
              () => openDashboardAfterFull(overview, simplifiedDb),
            ],
          ]
        : []),
    ]) {
      const { probe, requests } = createProbe(archive);
      const original = globalThis.fetch;
      globalThis.fetch = probe;

      const started = Date.now();
      try {
        await open();
      } finally {
        globalThis.fetch = original;
      }
      const elapsed = Date.now() - started;

      rows.push({
        athletes: athleteCount,
        ...summarize(label, requests, elapsed),
      });
    }
  }

  const header = [
    "atleti",
    "apertura",
    "richieste",
    "giri",
    "ms",
    "kB",
    "kB max",
    "duplicati",
  ];
  const table = rows.map((row) => [
    String(row.athletes),
    row.label,
    String(row.requests),
    String(row.roundTrips),
    String(row.elapsedMs),
    String(row.totalKb),
    String(row.heaviestKb),
    row.duplicates || "-",
  ]);

  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...table.map((line) => line[index].length)),
  );
  const render = (cells) =>
    cells.map((cell, index) => cell.padEnd(widths[index])).join("  ");

  console.log("");
  console.log(`Dashboard Club — latenza simulata ${LATENCY_MS} ms per richiesta`);
  console.log("");
  console.log(render(header));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const line of table) console.log(render(line));
  console.log("");

  if (!overview) {
    console.log(
      "src/lib/dashboard/club-overview.ts non esiste: misurata solo la riga «prima».",
    );
    console.log("");
  }
};

await run();
