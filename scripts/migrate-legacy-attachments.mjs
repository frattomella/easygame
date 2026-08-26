/**
 * Porta fuori dai record i file rimasti dentro come data URL.
 *
 * **Il difetto che chiude** ([D13](../docs/knowledge-base/16-technical-debt.md),
 * ADR-0034). Fino al Blocco 7 un allegato era una stringa
 * `data:application/pdf;base64,…` **dentro** il JSON dell'atleta o
 * dell'allenatore. Dal Blocco 8 i file nuovi sono righe di `attachments` e il
 * record ne conserva solo il riferimento, ma **i file vecchi sono rimasti dov'
 * erano**: convivono le due forme, e il codice legge entrambe apposta. Questo
 * script converte i vecchi.
 *
 * **Non cancella niente.** Un data URL diventa una riga di `attachments` e il
 * campo diventa `attachment:<id>`: il byte non si perde, cambia posto. Se la
 * scrittura dell'allegato fallisce, il campo resta com'era.
 *
 * **Il valore predefinito e la prova a vuoto.** Senza `--apply` non scrive
 * niente e stampa che cosa farebbe: quanti file, di che tipo, quanti byte,
 * quali record. Una migrazione di dati che parte per sbaglio e peggio di una
 * migrazione che non parte.
 *
 * **E ripetibile.** Un campo gia migrato non e piu un data URL, quindi il giro
 * successivo lo salta: interrompere lo script a meta non lascia niente in uno
 * stato intermedio, e rilanciarlo riprende da dove era arrivato. `--limit`
 * serve proprio a farlo a scaglioni su un archivio grande.
 *
 *     node scripts/migrate-legacy-attachments.mjs               # prova a vuoto
 *     node scripts/migrate-legacy-attachments.mjs --limit=50
 *     node scripts/migrate-legacy-attachments.mjs --apply       # scrive
 *
 * **Prima di eseguirlo con `--apply`** vanno verificate due cose, e nessuna
 * delle due la puo verificare questo file: che l'ambiente puntato sia quello
 * che si crede, e che ci sia l'autorizzazione a scriverci (CLAUDE.md, sez. 8).
 * Lo script si rifiuta di scrivere se `EASYGAME_DB_ENV` non e `development`,
 * a meno di `EASYGAME_ALLOW_SHARED_DB_WRITE=1` — la stessa deroga esplicita
 * che usa `db-guard`.
 */

import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const LIMIT = Number(
  (args.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 0,
);

const DB_ENV = String(process.env.EASYGAME_DB_ENV || "").trim();
const OVERRIDE = process.env.EASYGAME_ALLOW_SHARED_DB_WRITE === "1";

if (APPLY && DB_ENV !== "development" && !OVERRIDE) {
  console.error(
    `\nRifiuto di scrivere: EASYGAME_DB_ENV vale "${DB_ENV || "(vuoto)"}", non "development".\n` +
      "Se l'ambiente e davvero quello giusto, la deroga e esplicita:\n" +
      "  EASYGAME_ALLOW_SHARED_DB_WRITE=1 node scripts/migrate-legacy-attachments.mjs --apply\n",
  );
  process.exit(1);
}

const prisma = new PrismaClient();

/** Massimo che il servizio allegati accetta. Oltre, il file va guardato a mano. */
const MAX_BYTES = 10 * 1024 * 1024;

const isDataUrl = (value) =>
  typeof value === "string" && /^data:[^;,]+(;base64)?,/i.test(value);

const dataUrlBytes = (value) => {
  const body = value.slice(value.indexOf(",") + 1);
  return /;base64,/i.test(value)
    ? Math.floor((body.length * 3) / 4)
    : body.length;
};

const dataUrlMime = (value) =>
  (/^data:([^;,]+)/i.exec(value) || [, "application/octet-stream"])[1];

/**
 * Cammina un valore JSON e chiama `visit` su ogni data URL trovato.
 *
 * `visit` restituisce il valore da mettere al suo posto, oppure `null` per
 * lasciarlo dov'e. La profondita e limitata: un JSON con un ciclo o annidato
 * all'infinito non deve poter bloccare una migrazione.
 */
const walk = async (value, path, visit, depth = 0) => {
  if (depth > 8 || value == null) return value;

  if (isDataUrl(value)) {
    const replacement = await visit(value, path);
    return replacement === null || replacement === undefined
      ? value
      : replacement;
  }

  if (Array.isArray(value)) {
    const next = [];
    for (let index = 0; index < value.length; index += 1) {
      next.push(await walk(value[index], `${path}[${index}]`, visit, depth + 1));
    }
    return next;
  }

  if (typeof value === "object") {
    const next = {};
    for (const key of Object.keys(value)) {
      next[key] = await walk(value[key], `${path}.${key}`, visit, depth + 1);
    }
    return next;
  }

  return value;
};

/*
  Da quale campo viene un file decide la sua «categoria» nell'archivio
  allegati. Non e cosmetica: e cio che permette di ritrovarlo dopo, e di
  cancellare gli allegati di una persona quando la persona se ne va.
*/
const categoryFromPath = (path) => {
  const lowered = path.toLowerCase();
  if (lowered.includes("avatar")) return "avatar";
  if (lowered.includes("identity")) return "identity_document";
  if (lowered.includes("medicalvisit")) return "medical_visit";
  if (lowered.includes("certificate")) return "certificate";
  if (lowered.includes("enrollment")) return "enrollment_document";
  if (lowered.includes("registration")) return "registration";
  if (lowered.includes("contract")) return "contract";
  return "document";
};

const stats = {
  scanned: 0,
  withLegacy: 0,
  files: 0,
  bytes: 0,
  migrated: 0,
  skippedTooBig: 0,
  errors: [],
  byCategory: {},
  byMime: {},
};

const record = (path, value) => {
  const bytes = dataUrlBytes(value);
  const category = categoryFromPath(path);
  const mime = dataUrlMime(value);
  stats.files += 1;
  stats.bytes += bytes;
  stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
  stats.byMime[mime] = (stats.byMime[mime] || 0) + 1;
  return { bytes, category, mime };
};

let attachmentsModule = null;
const loadAttachments = async () => {
  if (!attachmentsModule) {
    attachmentsModule = await import("../src/lib/server/attachments.ts");
  }
  return attachmentsModule;
};

const migrateValue = async (value, path, owner) => {
  const meta = record(path, value);

  if (meta.bytes > MAX_BYTES) {
    stats.skippedTooBig += 1;
    return null;
  }

  if (!APPLY) return null;

  try {
    const { importLegacyDataUrl } = await loadAttachments();
    const attachment = await importLegacyDataUrl(value, {
      organizationId: owner.organizationId,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      category: meta.category,
      fileName: `${meta.category}${extensionFor(meta.mime)}`,
    });

    if (!attachment) return null;

    stats.migrated += 1;
    return `attachment:${attachment.id}`;
  } catch (error) {
    stats.errors.push(`${owner.ownerType}:${owner.ownerId} ${path}: ${error.message}`);
    return null;
  }
};

const extensionFor = (mime) => {
  const map = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
  };
  return map[String(mime).toLowerCase()] || "";
};

const migrateAthletes = async () => {
  const athletes = await prisma.athlete.findMany({
    select: { id: true, organization_id: true, data: true, avatar_url: true },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  for (const athlete of athletes) {
    stats.scanned += 1;
    const before = stats.files;
    const owner = {
      organizationId: athlete.organization_id,
      ownerType: "athlete",
      ownerId: athlete.id,
    };

    const nextData = await walk(athlete.data, "data", (value, path) =>
      migrateValue(value, path, owner),
    );
    const nextAvatar = isDataUrl(athlete.avatar_url)
      ? await migrateValue(athlete.avatar_url, "avatar_url", owner)
      : null;

    if (stats.files > before) stats.withLegacy += 1;

    if (
      APPLY &&
      (JSON.stringify(nextData) !== JSON.stringify(athlete.data) || nextAvatar)
    ) {
      await prisma.athlete.update({
        where: { id: athlete.id },
        data: {
          data: nextData,
          ...(nextAvatar ? { avatar_url: nextAvatar } : {}),
        },
      });
    }
  }
};

/*
  Allenatori, staff e soci non hanno una tabella propria: sono righe di
  `club_resource_items` con il payload nel JSON. Il tipo di proprietario si
  ricava dal `resource_type`, perche e cio che permette di ritrovare l'allegato
  dalla scheda della persona.
*/
const RESOURCE_OWNER_TYPES = {
  trainers: "trainer",
  staff_members: "staff",
  members: "member",
};

const migrateClubResources = async () => {
  const rows = await prisma.clubResourceItem.findMany({
    where: { resource_type: { in: Object.keys(RESOURCE_OWNER_TYPES) } },
    select: { id: true, organization_id: true, resource_type: true, payload: true },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  for (const row of rows) {
    stats.scanned += 1;
    const before = stats.files;
    const owner = {
      organizationId: row.organization_id,
      ownerType: RESOURCE_OWNER_TYPES[row.resource_type] || "other",
      ownerId: row.id,
    };

    const next = await walk(row.payload, "payload", (value, path) =>
      migrateValue(value, path, owner),
    );

    if (stats.files > before) stats.withLegacy += 1;

    if (APPLY && JSON.stringify(next) !== JSON.stringify(row.payload)) {
      await prisma.clubResourceItem.update({
        where: { id: row.id },
        data: { payload: next },
      });
    }
  }
};

const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

const main = async () => {
  console.log(
    `\nFile legacy dentro i record — ${APPLY ? "SCRITTURA" : "prova a vuoto"}` +
      (LIMIT ? ` — al massimo ${LIMIT} record per tabella` : "") +
      `\nDatabase dichiarato: ${DB_ENV || "(non dichiarato)"}\n`,
  );

  await migrateAthletes();
  await migrateClubResources();

  console.log(`Record letti:            ${stats.scanned}`);
  console.log(`Record con file dentro:  ${stats.withLegacy}`);
  console.log(`File trovati:            ${stats.files}  (${mb(stats.bytes)})`);
  console.log(`Troppo grandi, saltati:  ${stats.skippedTooBig}`);
  console.log(`Migrati:                 ${APPLY ? stats.migrated : "0 (prova a vuoto)"}`);

  if (stats.files) {
    console.log("\nPer categoria:", JSON.stringify(stats.byCategory));
    console.log("Per tipo:     ", JSON.stringify(stats.byMime));
  }

  if (stats.errors.length) {
    console.log(`\nErrori (${stats.errors.length}):`);
    for (const error of stats.errors.slice(0, 20)) console.log(`  ${error}`);
  }

  if (!APPLY && stats.files) {
    console.log(
      "\nNiente e stato scritto. Per farlo davvero: --apply, dopo aver" +
        " verificato quale database e puntato.\n",
    );
  } else {
    console.log("");
  }
};

main()
  .catch((error) => {
    console.error("Migrazione interrotta:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
