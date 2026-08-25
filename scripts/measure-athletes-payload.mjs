/**
 * Quanto pesa la lista Atleti di un club vero?
 *
 * **Perche uno script e non una stima.** Il numero «~25 MB per 200 atleti» che
 * gira nella Knowledge Base dal WP-31 e stato misurato una volta e poi
 * ricopiato. Dopo il Blocco 8 gli allegati non stanno piu nel record, e la
 * domanda «di quanto e migliorato» merita una risposta che si possa rifare.
 *
 * Costruisce un club sintetico con la forma reale di `athletes.data`, lo fa
 * passare per il **vero** `listResource` con un doppio di Prisma, e misura il
 * JSON che il browser riceverebbe. Non tocca nessun database.
 *
 *     node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs \
 *       scripts/measure-athletes-payload.mjs [numero-atleti]
 */

import { createFakePrisma } from "../tests/helpers/fake-prisma.mjs";

const ATHLETE_COUNT = Number(process.argv[2]) || 200;
const CLUB = "aaaaaaaa-0000-4000-8000-000000000001";

process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";

const { listResourcePage } = await import("../src/lib/server/resources.ts");
const { __setPrismaClientForTests } = await import(
  "../src/lib/server/prisma.ts"
);

/** Un data URL della dimensione dichiarata: base64, come li salvava l'app. */
const dataUrl = (mime, bytes) =>
  `data:${mime};base64,${"A".repeat(Math.ceil(bytes * 1.34))}`;

/** Un allegato nella forma nuova: un riferimento e niente altro. */
const reference = (index, kind) =>
  `attachment:${String(index).padStart(8, "0")}-0000-4000-8000-${kind}`;

const documento = (index, kind, legacy) => ({
  id: `${kind}-${index}`,
  name: `Documento ${kind}`,
  type: kind,
  fileName: `${kind}-${index}.pdf`,
  fileUrl: legacy ? dataUrl("application/pdf", 180 * 1024) : reference(index, "000000000001"),
  uploadDate: "2026-08-25T10:00:00.000Z",
});

const buildAthlete = (index, legacy) => ({
  id: `athlete-${index}`,
  organization_id: CLUB,
  first_name: `Nome${index}`,
  last_name: `Cognome${index}`,
  birth_date: new Date("2010-05-14"),
  status: "active",
  category_id: `cat-${index % 8}`,
  category_name: `Under ${12 + (index % 8)}`,
  access_code: `AC${index}`,
  jersey_number: String(index % 99),
  avatar_url: null,
  created_at: new Date("2026-01-01"),
  updated_at: new Date("2026-08-01"),
  data: {
    // L'avatar viaggia anche in `view=summary`: la lista lo mostra.
    avatar: dataUrl("image/jpeg", 90 * 1024),
    medicalCertExpiry: "2027-03-01",
    enrollmentStatus: true,
    phone: "+39 333 1234567",
    email: `atleta${index}@esempio.it`,
    address: "Via Giuseppe Garibaldi 12",
    city: "Reggio nell'Emilia",
    notes: "Nessuna nota particolare.",
    // Le collezioni che pesavano: due documenti, un'identita, un certificato.
    documents: [documento(index, "documento", legacy), documento(index, "iscrizione", legacy)],
    identityDocuments: [documento(index, "identita", legacy)],
    enrollmentDocuments: [documento(index, "modulo", legacy)],
    certificateFiles: {
      blsd: legacy
        ? dataUrl("application/pdf", 150 * 1024)
        : reference(index, "000000000002"),
    },
    medicalVisits: [
      {
        id: `visit-${index}`,
        title: "Visita agonistica",
        date: "2026-03-01",
        fileName: "visita.pdf",
        fileUrl: legacy
          ? dataUrl("application/pdf", 200 * 1024)
          : reference(index, "000000000003"),
      },
    ],
    registrations: [
      {
        id: `reg-${index}`,
        federation: "FIP",
        number: `T${index}`,
        fileName: "tesserino.pdf",
        fileUrl: legacy
          ? dataUrl("application/pdf", 120 * 1024)
          : reference(index, "000000000004"),
      },
    ],
  },
});

const scope = {
  userId: "user-a",
  activeOrganizationId: CLUB,
  allowedOrganizationIds: [CLUB],
};

const measure = async (label, legacy, query) => {
  const fake = createFakePrisma({
    athlete: Array.from({ length: ATHLETE_COUNT }, (_, index) =>
      buildAthlete(index, legacy),
    ),
  });
  __setPrismaClientForTests(fake.client);

  const started = process.hrtime.bigint();
  const { records, meta } = await listResourcePage(
    "athletes",
    new URLSearchParams(query),
    scope,
  );
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  const bytes = Buffer.byteLength(JSON.stringify({ data: records }), "utf8");

  return {
    label,
    query: query || "(nessuna)",
    righe: records.length,
    totale: meta ? meta.total : records.length,
    bytes,
    elapsedMs,
  };
};

const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;

const rows = [
  await measure("Record intero, allegati DENTRO (prima)", true, ""),
  await measure("Record intero, allegati FUORI  (dopo)", false, ""),
  await measure("view=summary, allegati DENTRO  (prima)", true, "view=summary"),
  await measure("view=summary, allegati FUORI   (dopo)", false, "view=summary"),
  await measure("view=summary + pagina da 50    (dopo)", false, "view=summary&limit=50"),
];

console.log(`\nLista Atleti — ${ATHLETE_COUNT} atleti sintetici`);
console.log(
  "Ogni atleta: avatar 90 kB, 4 documenti, 1 attestato, 1 visita, 1 tesseramento.\n",
);

const width = Math.max(...rows.map((row) => row.label.length));
for (const row of rows) {
  console.log(
    `${row.label.padEnd(width)}  ${mb(row.bytes).padStart(9)}  (${kb(row.bytes).padStart(7)})  ` +
      `${String(row.righe).padStart(4)} righe su ${row.totale}  ${row.elapsedMs.toFixed(0)} ms`,
  );
}

/**
 * Quanto pesavano gli avatar dentro la risposta.
 *
 * Fino al Blocco 8 `view=summary` toglieva tutti gli allegati **tranne**
 * l'avatar, perche la lista lo mostra. Questa e la differenza fra la risposta
 * di allora e quella di oggi, e si calcola invece di stimarla: e la somma dei
 * data URL che oggi sono diventati un indirizzo.
 */
const avatarBytes = Array.from({ length: ATHLETE_COUNT }, (_, index) =>
  Buffer.byteLength(JSON.stringify(buildAthlete(index, false).data.avatar), "utf8"),
).reduce((total, size) => total + size, 0);

const sommarioOggi = rows[3].bytes;
const sommarioPrima = sommarioOggi + avatarBytes;
const pagina = rows[4].bytes;
const pct = (from, to) => (((from - to) / from) * 100).toFixed(2);

console.log("\nLa risposta che riceve la pagina Atleti (view=summary):");
console.log(`  prima del Blocco 8, avatar base64 dentro: ${mb(sommarioPrima)}`);
console.log(`  oggi, avatar servito come immagine:       ${kb(sommarioOggi)}`);
console.log(`  oggi, con una pagina da 50 (WP-12):       ${kb(pagina)}`);
console.log(
  `  riduzione: ${pct(sommarioPrima, sommarioOggi)}% intera, ` +
    `${pct(sommarioPrima, pagina)}% paginata`,
);

console.log(
  `\nAllegati fuori dal record: la scheda di un atleta passa da ` +
    `${kb(rows[0].bytes / ATHLETE_COUNT)} a ${kb(rows[1].bytes / ATHLETE_COUNT)} ` +
    `— e cio che si scarica aprendola.\n`,
);
