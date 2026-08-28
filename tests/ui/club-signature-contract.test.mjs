import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { canManageClubConfiguration } from "../../src/lib/access-roles.ts";
import {
  CLUB_SIGNATURE_SETTINGS_KEYS,
  MAX_CLUB_SIGNATURE_BYTES,
  validateClubSignatureInput,
} from "../../src/lib/club-signature.ts";

/**
 * Il contratto di firma e timbro, verificato sulle superfici (W1-E).
 *
 * [club-signature](../server/club-signature.test.mjs) prova cosa fa il
 * dominio. Questo prova due regole che il dominio non puo difendere da solo,
 * perche si violano **altrove**:
 *
 * 1. **la firma non torna a essere un data URL.** Il logo del club lo e
 *    ancora (`clubs.logo_url`), ed e il precedente che si copia senza
 *    accorgersene: nelle impostazioni deve esserci un riferimento
 *    `attachment:`, e il modulo server non deve avere un secondo padrone;
 * 2. **il permesso e quello del club, non uno nuovo.** Il rischio qui non e
 *    che manchi il controllo: e che qualcuno ne inventi un secondo, e che i
 *    due divergano. La rotta deve usare `canManageClubConfiguration`, e
 *    `access-roles.ts` non deve avere acquisito una funzione dedicata alla
 *    firma.
 *
 * Sono test statici sul sorgente. Non provano che l'applicazione funzioni:
 * provano che la regola non e stata aggirata in un posto nuovo.
 */

const SRC = path.join(process.cwd(), "src");
const ROUTE = path.join(
  SRC,
  "app",
  "api",
  "v1",
  "clubs",
  "[id]",
  "signature",
  "route.ts",
);

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

const APP_FILES = walk(SRC);
const rel = (file) => path.relative(SRC, file).replace(/\\/g, "/");
const read = (file) => readFileSync(file, "utf8");

/* ------------------------------------------------ la firma non e un data URL */

test("nelle impostazioni del club la firma e sempre un riferimento, mai un data URL", () => {
  const offenders = [];

  for (const file of APP_FILES) {
    const source = read(file);
    for (const key of CLUB_SIGNATURE_SETTINGS_KEYS) {
      // `presidentSignature: "data:image/png;base64,…"`, in ogni sua forma.
      const assignsDataUrl = new RegExp(
        `${key}\\s*[:=]\\s*(\`|"|')?\\s*data:`,
        "i",
      );
      if (assignsDataUrl.test(source)) offenders.push(`${rel(file)} (${key})`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "la firma passa da Attachment Core: nelle impostazioni va `attachment:<id>`",
  );
});

test("il riferimento lo scrive solo il modulo server della firma", () => {
  const writers = APP_FILES.filter((file) => {
    const name = rel(file);
    if (name === "lib/club-signature.ts") return false; // dichiara le chiavi
    const source = read(file);
    if (!/settings_patch/.test(source)) return false;

    // La chiave puo comparire scritta a mano oppure presa dalla mappa: sono
    // due modi di scrivere la stessa cosa, e vanno cercati entrambi.
    return (
      /CLUB_SIGNATURE_SETTINGS_KEY_BY_KIND/.test(source) ||
      CLUB_SIGNATURE_SETTINGS_KEYS.some((key) => source.includes(key))
    );
  }).map(rel);

  assert.deepEqual(
    writers,
    ["lib/server/club-signature.ts"],
    "un secondo posto che scrive la chiave e un secondo proprietario del dominio",
  );
});

test("nessun componente client importa il modulo server della firma", () => {
  const offenders = [];

  for (const file of APP_FILES) {
    const name = rel(file);
    if (name === "lib/server/club-signature.ts") continue;

    const source = read(file);
    if (!/@\/lib\/server\/club-signature/.test(source)) continue;

    // Un componente client si riconosce dalla direttiva, non dalla cartella:
    // `page.tsx` e i pannelli di `components/` sono quasi tutti client.
    if (/^\s*["']use client["']/m.test(source)) offenders.push(name);
  }

  assert.deepEqual(
    offenders,
    [],
    "il modulo server non e importabile dal browser: usare `@/lib/api/club-signature`",
  );
});

test("l'anteprima passa dal trasporto, non da un fetch nel componente", () => {
  const panel = read(
    path.join(SRC, "components", "organization", "club-signature-panel.tsx"),
  );

  assert.doesNotMatch(
    panel,
    /fetch\(\s*[`"']\/api/,
    "nessun fetch diretto a /api da un componente (CLAUDE.md)",
  );
  assert.match(panel, /@\/lib\/api\/club-signature/);
});

/* ------------------------------------------------------------- il permesso */

test("la rotta gira il permesso a canManageClubConfiguration", () => {
  const source = read(ROUTE);

  assert.match(source, /canManageClubConfiguration/);
  assert.match(source, /@\/lib\/access-roles/);
  assert.match(source, /Accesso negato/);
});

test("scrittura e cancellazione passano dal gate, la lettura no", () => {
  const source = read(ROUTE);

  const bodyOf = (method) => {
    const start = source.indexOf(`export async function ${method}(`);
    assert.notEqual(start, -1, `manca ${method}`);
    const next = source.indexOf("export async function ", start + 1);
    return source.slice(start, next === -1 ? source.length : next);
  };

  assert.match(bodyOf("PUT"), /assertCanManage\(/);
  assert.match(bodyOf("DELETE"), /assertCanManage\(/);

  /*
    La lettura resta di tutto il club di proposito: serve all'anteprima e al
    documento stampabile, che la segreteria emette. Restringerla ai gestori
    farebbe uscire ricevute senza firma.
  */
  assert.doesNotMatch(bodyOf("GET"), /assertCanManage\(/);
});

test("i ruoli operativi non possono scrivere la firma", () => {
  for (const role of ["collaborator", "staff", "trainer", "member", "parent"]) {
    assert.equal(
      canManageClubConfiguration(role),
      false,
      `${role} non deve poter caricare la firma del presidente`,
    );
  }

  for (const role of ["owner", "club_manager"]) {
    assert.equal(canManageClubConfiguration(role), true);
  }
});

test("la firma non ha un sistema di permessi proprio", () => {
  const accessRoles = read(path.join(SRC, "lib", "access-roles.ts"));

  assert.doesNotMatch(
    accessRoles,
    /signature|firma|timbro/i,
    "il permesso della firma e quello della configurazione del club: non se ne aggiunge un secondo",
  );
});

/* ---------------------------------------------------------------- i limiti */

test("i limiti della firma sono piu stretti di quelli di un allegato", () => {
  const attachments = read(path.join(SRC, "lib", "attachments.ts"));
  const maxAttachment = /MAX_ATTACHMENT_BYTES\s*=\s*(\d+)\s*\*\s*1024\s*\*\s*1024/.exec(
    attachments,
  );

  assert.ok(maxAttachment, "il limite degli allegati deve restare leggibile");
  assert.ok(
    MAX_CLUB_SIGNATURE_BYTES < Number(maxAttachment[1]) * 1024 * 1024,
    "una firma finisce dentro un documento: il suo limite non puo essere quello di un PDF",
  );

  assert.equal(
    validateClubSignatureInput({ mimeType: "application/pdf", sizeBytes: 1000 })
      .ok,
    false,
  );
  assert.equal(
    validateClubSignatureInput({ mimeType: "image/heic", sizeBytes: 1000 }).ok,
    false,
  );
  assert.equal(
    validateClubSignatureInput({ mimeType: "image/png", sizeBytes: 1000 }).ok,
    true,
  );
});

// --- FIRMA-01: gli allegati del club non si toccano dalla porta generica ------

test("le rotte allegati proteggono cio che appartiene al club", () => {
  /*
    Il difetto: i byte della firma vivono in `attachments`, e
    `/api/v1/attachments/**` autorizzava solo su sessione e appartenenza al
    club. Un collaboratore poteva quindi elencare gli allegati del club,
    trovare la firma del presidente e sostituirla o cancellarla da li,
    scavalcando il gate della sua schermata.
  */
  const collezione = readFileSync(
    path.join(process.cwd(), "src", "app", "api", "v1", "attachments", "route.ts"),
    "utf8",
  );
  const singolo = readFileSync(
    path.join(
      process.cwd(),
      "src",
      "app",
      "api",
      "v1",
      "attachments",
      "[id]",
      "route.ts",
    ),
    "utf8",
  );

  assert.match(
    collezione,
    /owner_type[^\n]*===\s*"club"[\s\S]{0,200}canManageClubConfiguration/,
    "creare un allegato del club deve passare dal permesso di configurazione",
  );

  assert.match(
    singolo,
    /assertClubAttachmentWritable/,
    "sostituzione e cancellazione devono passare dalla guardia",
  );
  const guardie = singolo.match(/assertClubAttachmentWritable\(/g) || [];
  assert.ok(
    guardie.length >= 2,
    `la guardia va applicata sia al PUT sia al DELETE (trovate ${guardie.length} chiamate)`,
  );

  assert.doesNotMatch(
    singolo,
    /export async function GET[\s\S]{0,900}assertClubAttachmentWritable/,
    "la lettura resta a chi appartiene al club: serve all'anteprima e ai documenti",
  );
});
