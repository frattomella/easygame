/**
 * Quanto costa una schermata di EasyGame su un archivio grande?
 *
 * **Perche un secondo script di misura.** `measure-athletes-payload.mjs`
 * risponde a una domanda sola — quanto pesa la lista Atleti — e la risponde
 * bene. Questo ne risponde a un'altra: **come cresce** il costo di ogni
 * dominio quando l'archivio raddoppia, e quante interrogazioni servono per
 * disegnare una schermata. Sono due numeri diversi e il secondo e quello che
 * dice se una pagina reggera un cliente vero: un payload grande si sopporta,
 * un `N+1` no.
 *
 * **Prima misura, poi modifica.** Nessuna ottimizzazione va fatta su un
 * sospetto. Questo script serve a produrre la riga «prima» e la riga «dopo»
 * della stessa tabella, e a farlo senza toccare nessun database: costruisce
 * archivi sintetici con la forma reale dei record e li fa passare per il
 * **vero** `listResourcePage` con un doppio di Prisma.
 *
 *     npm run measure:web
 *     npm run measure:web -- 200 1000 2000
 */

import { createFakePrisma } from "../tests/helpers/fake-prisma.mjs";

const SIZES = process.argv.slice(2).map(Number).filter(Boolean);
const ATHLETE_COUNTS = SIZES.length ? SIZES : [200, 1000, 2000];
const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";

const { listResourcePage } = await import("../src/lib/server/resources.ts");
const { __setPrismaClientForTests } = await import(
  "../src/lib/server/prisma.ts"
);

const scope = {
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
};

/* ------------------------------------------------ gli archivi sintetici */

const athlete = (index) => ({
  id: `athlete-${index}`,
  organization_id: CLUB,
  first_name: `Nome${index}`,
  last_name: `Cognome${index}`,
  birth_date: new Date("2010-05-14"),
  status: index % 11 === 0 ? "inactive" : "active",
  category_id: `cat-${index % 8}`,
  category_name: `Under ${12 + (index % 8)}`,
  access_code: `AC${index}`,
  jersey_number: String(index % 99),
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-08-01"),
  data: {
    medicalCertExpiry: "2027-03-01",
    enrollmentStatus: true,
    phone: "+39 333 1234567",
    email: `atleta${index}@esempio.it`,
    address: "Via Giuseppe Garibaldi 12",
    city: "Reggio nell'Emilia",
  },
});

/** Una rata per mese: dieci per atleta, come una stagione sportiva vera. */
const payments = (athletes) =>
  athletes.flatMap((row, index) =>
    Array.from({ length: 10 }, (_, month) => ({
      id: `payment-${index}-${month}`,
      organization_id: CLUB,
      athlete_id: row.id,
      amount: 65,
      due_date: new Date(2026, month, 5),
      status: month < 4 ? "paid" : "pending",
      data: { description: `Rata ${month + 1}` },
    })),
  );

/** Due allenamenti a settimana per otto mesi, per ogni atleta. */
const attendance = (athletes) =>
  athletes.flatMap((row, index) =>
    Array.from({ length: 64 }, (_, session) => ({
      id: `attendance-${index}-${session}`,
      organization_id: CLUB,
      athlete_id: row.id,
      training_id: `training-${session}`,
      date: new Date(2026, Math.floor(session / 8), 1 + (session % 28)),
      status: session % 9 === 0 ? "absent" : "present",
    })),
  );

/** Una risorsa di club, nella forma normalizzata di `club_resource_items`. */
const clubResource = (resourceType, count, payload) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${resourceType}-${index}`,
    organization_id: CLUB,
    resource_type: resourceType,
    name: `${resourceType} ${index}`,
    status: null,
    date: null,
    payload: payload(index),
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-08-01"),
  }));

/* ---------------------------------------------------------- la misura */

const bytesOf = (records) =>
  Buffer.byteLength(JSON.stringify({ data: records }), "utf8");

const measure = async (seed, resource, query) => {
  const fake = createFakePrisma(seed);
  __setPrismaClientForTests(fake.client);

  const started = process.hrtime.bigint();
  const { records, meta } = await listResourcePage(
    resource,
    new URLSearchParams(query),
    scope,
  );
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  return {
    righe: records.length,
    totale: meta ? meta.total : records.length,
    bytes: bytesOf(records),
    elapsedMs,
    /*
      Il numero che conta piu del peso. Una schermata che cresce di
      interrogazioni al crescere delle righe ha un `N+1` dentro, e nessun
      indice lo salva.
    */
    query: fake.calls.filter((call) =>
      ["findMany", "findFirst", "findUnique", "count"].includes(call.method),
    ).length,
  };
};

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;

const printTable = (title, rows) => {
  console.log(`\n${title}`);
  const width = Math.max(...rows.map((row) => row.label.length));
  for (const row of rows) {
    console.log(
      `  ${row.label.padEnd(width)}  ${kb(row.bytes).padStart(9)}  ` +
        `${String(row.righe).padStart(5)} righe su ${String(row.totale).padEnd(6)}  ` +
        `${row.query} query  ${row.elapsedMs.toFixed(0)} ms`,
    );
  }
};

/* ------------------------------------------------------------ Atleti */

const atleti = [];
for (const count of ATHLETE_COUNTS) {
  const rows = Array.from({ length: count }, (_, index) => athlete(index));
  const seed = { athlete: rows };

  atleti.push({
    label: `${count} atleti · archivio intero`,
    ...(await measure(seed, "simplified_athletes", "view=summary")),
  });
  atleti.push({
    label: `${count} atleti · una pagina da 200`,
    ...(await measure(seed, "simplified_athletes", "view=summary&limit=200")),
  });
  atleti.push({
    label: `${count} atleti · pagina + ricerca`,
    ...(await measure(
      seed,
      "simplified_athletes",
      "view=summary&limit=200&q=Cognome1",
    )),
  });
}
printTable("Atleti", atleti);

/* --------------------------------------------------------- Pagamenti */

const rate = [];
for (const count of ATHLETE_COUNTS) {
  const rows = Array.from({ length: count }, (_, index) => athlete(index));
  const seed = { athlete: rows, athletePayment: payments(rows) };

  rate.push({
    label: `${count} atleti · ${count * 10} rate · intero`,
    ...(await measure(seed, "payments", "")),
  });
  rate.push({
    label: `${count} atleti · ${count * 10} rate · pagina`,
    ...(await measure(seed, "payments", "limit=200")),
  });
}
printTable("Pagamenti (rate)", rate);

/* ---------------------------------------------------------- Presenze */

const presenze = [];
for (const count of ATHLETE_COUNTS) {
  const rows = Array.from({ length: count }, (_, index) => athlete(index));
  const seed = { athlete: rows, trainingAttendance: attendance(rows) };

  presenze.push({
    label: `${count} atleti · ${count * 64} presenze · intero`,
    ...(await measure(seed, "training_attendance", "")),
  });
  presenze.push({
    label: `${count} atleti · ${count * 64} presenze · pagina`,
    ...(await measure(seed, "training_attendance", "limit=200")),
  });
}
printTable("Presenze", presenze);

/* ------------------------------ Abbigliamento, numerazione, modulistica */

const risorse = [];
for (const count of ATHLETE_COUNTS) {
  const magazzino = clubResource("clothing_inventory", 120, (index) => ({
    id: `articolo-${index}`,
    name: `Articolo ${index}`,
    sizes: { S: 10, M: 20, L: 15 },
  }));
  const assegnazioni = clubResource("kit_assignments", count, (index) => ({
    id: `assegnazione-${index}`,
    athleteId: `athlete-${index}`,
    items: [
      { productId: "articolo-1", size: "M", state: "delivered" },
      { productId: "articolo-2", size: "L", state: "pending" },
    ],
  }));
  const gruppi = clubResource("jersey_groups", 24, (index) => ({
    id: `gruppo-${index}`,
    name: `Gruppo ${index}`,
    categoryIds: [`cat-${index % 8}`],
    siteIds: [],
  }));

  const seed = {
    clubResourceItem: [...magazzino, ...assegnazioni, ...gruppi],
  };

  risorse.push({
    label: `${count} assegnazioni kit · intero`,
    ...(await measure(seed, "kit_assignments", "")),
  });
  risorse.push({
    label: `${count} assegnazioni kit · pagina`,
    ...(await measure(seed, "kit_assignments", "limit=200")),
  });
  risorse.push({
    label: `catalogo abbigliamento (120)`,
    ...(await measure(seed, "clothing_inventory", "")),
  });
  risorse.push({
    label: `gruppi di numerazione (24)`,
    ...(await measure(seed, "jersey_groups", "")),
  });
}
printTable("Abbigliamento e numerazione", risorse);

/* ---------------------------------------------------------- Il verdetto */

const crescita = (rows, label) => {
  const interi = rows.filter((row) => row.label.includes("intero"));
  if (interi.length < 2) return null;
  const primo = interi[0];
  const ultimo = interi[interi.length - 1];
  const fattoreRighe = ultimo.totale / Math.max(1, primo.totale);
  const fattoreTempo = ultimo.elapsedMs / Math.max(0.001, primo.elapsedMs);
  return `${label}: ${fattoreRighe.toFixed(1)}x righe -> ${fattoreTempo.toFixed(1)}x tempo`;
};

console.log("\nCome cresce il costo quando cresce l'archivio:");
for (const riga of [
  crescita(atleti, "Atleti"),
  crescita(rate, "Pagamenti"),
  crescita(presenze, "Presenze"),
].filter(Boolean)) {
  console.log(`  ${riga}`);
}

const conQueryCrescenti = [...atleti, ...rate, ...presenze, ...risorse].filter(
  (row) => row.query > 3,
);

console.log(
  conQueryCrescenti.length
    ? `\nATTENZIONE: ${conQueryCrescenti.length} misure usano piu di tre interrogazioni. Un N+1 non si vede dal peso.`
    : "\nNessuna schermata cresce di interrogazioni al crescere delle righe.",
);
console.log("");
