import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Blocco 6 — la scheda «Stagioni» di Organizzazione.
 *
 * Test sul sorgente, come le altre regole di UI (il progetto non ha un
 * renderer di componenti: vedi 15 - Testing). Presidiano tre cose che si sono
 * gia perse una volta altrove: che la logica non torni dentro `page.tsx`, che
 * la scheda non reintroduca font o `fetch` propri, e che le operazioni
 * significative restino dietro una conferma.
 */

const SRC = path.join(process.cwd(), "src");
const read = (file) => readFileSync(path.join(SRC, file), "utf8");
const readCode = (file) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const MANAGER = "components/organization/season-manager.tsx";
const ORG_PAGE = "app/organization/page.tsx";

test("la scheda Stagioni monta il componente dedicato", () => {
  const page = readCode(ORG_PAGE);

  assert.match(page, /<SeasonManager/, "la scheda usa il componente");
  assert.match(
    page,
    /import \{ SeasonManager \} from "@\/components\/organization\/season-manager"/,
  );
});

test("la pagina Organizzazione non contiene piu logica di stagione", () => {
  const page = readCode(ORG_PAGE);

  for (const residuo of [
    "handleCreateSeason",
    "persistSeasonSettings",
    "SEASON_COPYABLE_FIELDS",
    "seasonCopyOptions",
  ]) {
    assert.ok(
      !page.includes(residuo),
      `${residuo} e logica di dominio e non deve stare in page.tsx`,
    );
  }
});

test("il salvataggio del club non riscrive piu le stagioni", () => {
  const page = readCode(ORG_PAGE);

  assert.ok(
    !/^\s*seasons,$/m.test(page),
    "rimandare la fotografia in stato React sovrascriveva le stagioni create nel frattempo",
  );
  assert.ok(!/^\s*activeSeasonId,$/m.test(page));
});

test("il componente parla con l'API, non con fetch ne con Prisma", () => {
  const manager = readCode(MANAGER);

  assert.match(manager, /from "@\/lib\/api\/seasons"/);
  assert.ok(!manager.includes("fetch("), "nessun fetch diretto a /api");
  assert.ok(!manager.includes("@/lib/server/"), "nessun import server-side");
  assert.ok(
    !manager.includes("simplified-db"),
    "le stagioni non passano piu dal dominio client in riduzione (WP-07)",
  );
});

test("nessun font nuovo e nessuna taglia inventata per la stagione", () => {
  const manager = readCode(MANAGER);

  assert.ok(!manager.includes("next/font"), "nessun font nuovo");
  assert.ok(
    !/font-family/i.test(manager),
    "le famiglie sono dichiarate solo in app/layout.tsx",
  );
  assert.match(
    manager,
    /eg-tabular/,
    "date e conteggi usano le cifre tabellari, come le altre colonne di numeri",
  );
});

test("attivazione e archiviazione restano dietro una conferma", () => {
  const manager = readCode(MANAGER);

  assert.match(manager, /ConfirmDialog/, "si riusa la conferma esistente");
  assert.match(manager, /Cambiare stagione attiva\?/);
  assert.match(manager, /Archiviare /);
  assert.ok(
    !manager.includes("createCoalescingSaver"),
    "il cambio di stagione non e autosalvabile (10 - UI/UX)",
  );
});

test("la procedura guidata mostra cosa verra copiato prima di confermare", () => {
  const manager = readCode(MANAGER);

  assert.match(manager, /riepilogo/, "esiste un passo di riepilogo");
  assert.match(manager, /verranno copiati/i);
  assert.match(manager, /Restano disponibili senza copia/);
  assert.match(manager, /Non vengono mai riportati/);
  assert.match(manager, /preview: true/, "il riepilogo viene dal server");
});

test("la scheda regge i tre breakpoint di riferimento", () => {
  const manager = readCode(MANAGER);

  assert.match(
    manager,
    /flex-col[\s\S]*lg:flex-row/,
    "a 375 px le righe della stagione impilano, a 1280 px stanno in linea",
  );
  assert.match(
    manager,
    /grid-cols-1[\s\S]*md:grid-cols-2/,
    "l'elenco di cosa riportare passa da una a due colonne",
  );
  assert.ok(
    !/\bw-\[\d{3,}px\]/.test(manager),
    "nessuna larghezza fissa: produrrebbe scroll orizzontale a 375 px",
  );
});
