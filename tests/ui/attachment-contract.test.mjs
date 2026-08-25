import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Il contratto unico degli allegati, verificato sulle superfici (Blocco 8).
 *
 * [attachment-names](../lib/attachment-names.test.mjs) difende **come** si
 * apre e si scarica un allegato. Questo difende **dove finisce quando lo si
 * carica**: la regola nuova e che un file non entra mai in un record di
 * dominio.
 *
 * Sono test statici sul sorgente. Non provano che l'applicazione funzioni:
 * provano che la regola non e stata aggirata in un posto nuovo — che e
 * l'errore che questo repository ha gia commesso sei volte con lo stesso
 * blocco di codice degli allegati.
 */

const SRC = path.join(process.cwd(), "src");

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

/**
 * Le superfici che leggono un file **senza conservarlo**: la lettura documenti
 * lo dà in pasto all'OCR, lo scanner ne fa un'anteprima. Un data URL li e
 * corretto, perche non finisce in nessun record.
 */
const READ_ONLY_SURFACES = new Set([
  "components/forms/document-extraction-field.tsx",
  "lib/client-files.ts",
  "lib/supabase.ts",
]);

/**
 * Le superfici che caricano su `assets` tramite un endpoint dedicato. Il file
 * non e nel record di dominio — e il difetto che WP-15 chiude — ma e una
 * seconda implementazione di storage, dichiarata in ADR-0034 e ancora aperta.
 */
const LEGACY_ASSET_SURFACES = new Set([
  "app/athletes/[id]/page.tsx",
  "components/forms/OnlinePublicForm.tsx",
]);

/** I moduli che *sono* il contratto: possono nominare cio che gli altri non devono. */
const CONTRACT_MODULES = new Set([
  "lib/attachments.ts",
  "lib/api/attachments.ts",
]);

test("nessun file nuovo finisce dentro un record come data URL", () => {
  const offenders = [];

  for (const file of APP_FILES) {
    const name = rel(file);
    if (
      READ_ONLY_SURFACES.has(name) ||
      LEGACY_ASSET_SURFACES.has(name) ||
      CONTRACT_MODULES.has(name)
    ) {
      continue;
    }

    const source = read(file);
    // `fileUrl = await fileToDataUrl(...)`, in ogni sua forma.
    if (/(fileUrl|attachmentUrl|documentUrl)\s*[=:]\s*await\s+fileToDataUrl/.test(source)) {
      offenders.push(name);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "usare uploadAttachmentReference: un file dentro un record e il difetto che WP-15 chiude",
  );
});

test("ogni allegato dichiara a chi appartiene", () => {
  const users = APP_FILES.filter((file) =>
    /<CertificateAttachmentField/.test(read(file)),
  );

  assert.ok(users.length > 0, "il componente deve essere usato da qualche parte");

  for (const file of users) {
    const source = read(file);
    const mounts = source.match(/<CertificateAttachmentField[\s\S]*?\/>/g) || [];

    for (const mount of mounts) {
      assert.match(
        mount,
        /owner=\{\{/,
        `${rel(file)}: un allegato senza proprietario non puo essere autorizzato`,
      );
    }
  }
});

test("l'URL di un allegato non viene costruito a mano", () => {
  const offenders = APP_FILES.filter((file) => {
    const name = rel(file);
    // Il modulo che lo costruisce e il client che lo consuma possono; il
    // registro API deve nominarlo, perche il suo lavoro e elencare i path.
    if (CONTRACT_MODULES.has(name) || name === "lib/api/registry.ts") {
      return false;
    }
    return /["'`]\/api\/v1\/attachments/.test(read(file));
  }).map(rel);

  assert.deepEqual(
    offenders,
    [],
    "usare buildAttachmentUrl / ATTACHMENT_ENDPOINT",
  );
});

test("nessun componente client importa il servizio server degli allegati", () => {
  const offenders = APP_FILES.filter((file) => {
    const source = read(file);
    if (!/@\/lib\/server\/attachments/.test(source)) return false;
    // Le route sono server: sono l'unico posto da cui il servizio si chiama.
    return !rel(file).startsWith("app/api/");
  }).map(rel);

  assert.deepEqual(
    offenders,
    [],
    "il servizio allegati e server-only: dal client si passa da @/lib/api/attachments",
  );
});

/**
 * Il limite di dimensione e l'elenco dei tipi esistono per essere applicati
 * **sul server**. Un controllo solo client e una cortesia, non una difesa.
 */
test("il caricamento e validato sul server, non solo nel browser", () => {
  const service = read(path.join(SRC, "lib", "server", "attachments.ts"));

  assert.match(
    service,
    /validateAttachmentInput/,
    "il servizio deve validare tipo e dimensione",
  );
  assert.match(
    service,
    /Accesso negato/,
    "il diniego deve contenere la stringa che il route handler mappa su 403",
  );
});

/**
 * La foto di un atleta viaggia come `<img src>`, e un `<img>` non manda header.
 *
 * `apiRequest` aggiunge `x-active-club-id` a ogni chiamata; il browser, quando
 * scarica un'immagine, no. Se l'endpoint autorizzasse sul **club attivo**, un
 * utente con due club vedrebbe i volti solo in uno dei due — e il difetto
 * apparirebbe come «alcune foto non si caricano», che e la forma piu difficile
 * da diagnosticare.
 *
 * L'autorizzazione va quindi fatta su **tutti** i club dell'utente.
 */
test("l'avatar autorizza su tutti i club dell'utente, non solo su quello attivo", () => {
  const source = readFileSync(
    path.join(SRC, "app", "api", "v1", "athletes", "[id]", "avatar", "route.ts"),
    "utf8",
  );

  assert.match(
    source,
    /scope\.allowedOrganizationIds\.includes\(athlete\.organization_id\)/,
    "un <img> non manda x-active-club-id: autorizzare sul club attivo romperebbe gli utenti multi-club",
  );
  assert.equal(
    /scope\.activeOrganizationId\s*===\s*athlete\.organization_id/.test(source),
    false,
    "il confronto sul club attivo e proprio il difetto da evitare",
  );
});

/**
 * Un allegato e un dato di club: non deve finire in una cache condivisa, e non
 * deve essere interpretato dal browser come qualcosa di diverso da cio che e.
 */
test("la risposta che serve un file porta le intestazioni di sicurezza", () => {
  const source = readFileSync(
    path.join(SRC, "app", "api", "v1", "attachments", "[id]", "route.ts"),
    "utf8",
  );

  assert.match(source, /"X-Content-Type-Options": "nosniff"/);
  assert.match(source, /"Cache-Control": "private/);
  assert.match(
    source,
    /"Content-Security-Policy": "sandbox/,
    "un HTML caricato come allegato non deve poter eseguire niente",
  );
});
