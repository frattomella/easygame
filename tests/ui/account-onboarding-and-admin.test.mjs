import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Conformita statica delle superfici toccate dal Blocco 4.
 *
 * Sono test sul sorgente, non sul rendering: il progetto non ha un renderer di
 * componenti (vedi 15 — Testing). Verificano le regole che, se violate di
 * nuovo, riportano esattamente i difetti appena corretti.
 */

const read = (relativePath) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

const ACCOUNT_SCREEN = "src/components/account/account-home-screen.tsx";
const ONBOARDING_PAGE = "src/app/onboarding/page.tsx";
const IMPORT_DIALOG = "src/components/forms/AthleteImportDialog.tsx";
const PLATFORM_ADMIN = "src/app/private/easygame-platform-admin-0c7a/page.tsx";

test("la home account non ha piu una tavolozza tutta sua in esadecimale", () => {
  const source = read(ACCOUNT_SCREEN);
  const hexColors = source.match(/#[0-9a-fA-F]{6}\b/g) || [];
  assert.deepEqual(
    hexColors,
    [],
    "i colori vengono dai token e dalle classi Tailwind condivise, non da letterali",
  );
  assert.match(source, /font-display/, "usa la tipografia del prodotto");
  assert.match(source, /var\(--eg-/, "usa i token di identita");
});

test("la home account distingue caricamento, vuoto ed errore", () => {
  const source = read(ACCOUNT_SCREEN);
  assert.match(source, /function PanelSkeleton/);
  assert.match(source, /function PanelEmptyState/);
  // Un errore di rete non deve essere raccontato come "nessun club".
  assert.match(source, /membershipsStatus === "error" && !hasLoadedMemberships/);
  assert.match(source, /role="alert"/);
});

test("creare un club porta alla configurazione iniziale", () => {
  const source = read(ACCOUNT_SCREEN);
  assert.match(source, /router\.push\("\/onboarding"\)/);
  assert.match(
    source,
    /syncActiveClubLocally\(createdSummary\);/,
    "il club appena creato deve diventare quello attivo, o l'onboarding lavorerebbe su un altro",
  );
});

test("l'area onboarding e protetta come le altre aree di gestione", () => {
  const middleware = read("src/middleware.ts");
  const accessRoles = read("src/lib/access-roles.ts");

  assert.match(middleware, /"\/onboarding"/);
  assert.match(accessRoles, /"\/onboarding"/);

  const adminOnlyBlock = accessRoles.slice(
    accessRoles.indexOf("MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES"),
  );
  assert.match(
    adminOnlyBlock.slice(0, 400),
    /"\/onboarding"/,
    "scrive dati societari: stesso perimetro di /organization",
  );
});

test("l'onboarding e saltabile e non salva nulla senza conferma", () => {
  const source = read(ONBOARDING_PAGE);
  assert.match(source, /Salta per ora/);
  assert.match(source, /Salta questo passo/);
  assert.match(source, /withSkippedOnboarding/);
  assert.equal(
    /setTimeout\([^)]*persist/.test(source),
    false,
    "nessun autosave: ogni passo scrive solo quando lo si conferma",
  );
});

test("l'import atleti mostra un avanzamento reale e un riepilogo finale", () => {
  const source = read(IMPORT_DIALOG);

  assert.match(source, /role="progressbar"/);
  assert.match(source, /aria-valuenow=\{progress\.done\}/);
  assert.match(
    source,
    /onProgress: \(completed: number\) =>/,
    "l'avanzamento arriva da chi scrive davvero le righe",
  );

  // Il riepilogo distingue le tre quantita richieste.
  assert.match(source, /label="Importati"/);
  assert.match(source, /label="Scartati in anteprima"/);
  assert.match(source, /label="Errori in scrittura"/);
  assert.match(source, /Righe non scritte/);
});

test("l'import non scrive prima di aver mostrato l'anteprima", () => {
  const source = read(IMPORT_DIALOG);
  const stepOrder = ["upload", "review", "running", "done"];
  assert.match(source, new RegExp(stepOrder.join('" \\| "')));
  assert.match(
    source,
    /const payload = toImportPayload\(previewRows\);/,
    "si scrive esattamente cio che l'anteprima ha dichiarato importabile",
  );
});

test("la console di piattaforma configura IMAP accanto a SMTP, separati", () => {
  const source = read(PLATFORM_ADMIN);

  assert.match(source, /\/api\/v1\/admin\/email/);
  assert.match(source, /\/api\/v1\/admin\/imap/);
  assert.match(source, /Casella IMAP/);
  assert.match(source, /Test connessione/);

  // Le due password hanno stato separato: nessun riuso fra i due provider.
  assert.match(source, /const \[smtpPassword, setSmtpPassword\]/);
  assert.match(source, /const \[imapPassword, setImapPassword\]/);
  const imapHandler = source.slice(
    source.indexOf("const handleSaveImap"),
    source.indexOf("const handleTestImap"),
  );
  assert.ok(imapHandler.length > 100, "handler IMAP non trovato");
  assert.match(imapHandler, /password: imapPassword/);
  assert.equal(
    imapHandler.includes("smtp"),
    false,
    "la richiesta IMAP non deve toccare nulla di SMTP",
  );
});

test("il servizio IMAP non riusa la tabella ne il contesto crittografico SMTP", () => {
  const service = read("src/lib/server/email/imap-service.ts");
  assert.match(service, /prisma\.imapProviderConfig/);
  assert.equal(
    service.includes("emailProviderConfig"),
    false,
    "IMAP ha una tabella sua: la riga SMTP ha un CHECK su provider = 'smtp'",
  );
  assert.match(service, /encryptCredential\(input\.password, "imap"\)/);
});
