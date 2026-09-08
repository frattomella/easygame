import assert from "node:assert/strict";
import test, { before } from "node:test";
import { readFileSync } from "node:fs";

/**
 * **N5 — perche SALVA non salvava, e perche non puo tornare a non salvare.**
 *
 * Il form del certificato medico caricava il file cosi:
 *
 * ```ts
 * await supabase.storage.from("medical-certificates").upload(storagePath, file);
 * ```
 *
 * `supabase` in questo repository **non parla con Supabase** (CLAUDE.md §11.6):
 * e un adattatore su `fetch`, e `storage.from(...).upload(...)` e una
 * `POST /api/v1/assets`. Ma `assets` e una risorsa **chiusa**: `ensureResource`
 * la sbarra prima ancora di leggere la sessione, perche non porta un
 * `organization_id` e dedurre il club dal nome del file non e un confine.
 *
 * Quindi: 403 → `throw` → il `catch` tre righe sotto → un avviso generico →
 * `onSubmit` **mai chiamato** → nessuna riga in `medical_certificates`. Il file
 * era obbligatorio, quindi non esisteva nemmeno una strada che lo evitasse.
 *
 * Due difese, e sono la stessa letta dai due lati: la porta resta **chiusa**, e
 * nessuno ci bussa piu.
 *
 * Il commento accanto alla chiusura diceva «nessun client chiedeva
 * `/api/v1/assets`: la porta era aperta e non serviva a niente». Era falso nel
 * momento in cui e stato scritto, e nessuna prova lo misurava: la prova che
 * chiudeva la porta asseriva la **premessa** — che nessuno la usasse — invece
 * del fatto.
 */

let risorse;

before(async () => {
  process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
  risorse = await import("../../src/lib/server/resources.ts");
});

const sorgente = (percorso) => readFileSync(percorso, "utf8");

const senzaCommenti = (testo) =>
  testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const FORM = "src/components/forms/AddCertificateForm.tsx";

/* ------------------------------------------------------------------ */
/* La porta resta chiusa                                               */
/* ------------------------------------------------------------------ */

test("`assets` resta una risorsa chiusa", () => {
  assert.equal(
    risorse.isClosedResource("assets"),
    true,
    "riaprirla per far funzionare un form vorrebbe dire autorizzare un documento sanitario da una convenzione sul nome del file",
  );
});

/* ------------------------------------------------------------------ */
/* Nessuno ci bussa piu                                                */
/* ------------------------------------------------------------------ */

test("il form del certificato non passa piu da `supabase.storage`", () => {
  const codice = senzaCommenti(sorgente(FORM));

  assert.doesNotMatch(
    codice,
    /supabase\s*\.?\s*\n?\s*\.storage/,
    "e la chiamata che rispondeva 403 e faceva fallire ogni salvataggio",
  );
  assert.doesNotMatch(
    codice,
    /getPublicUrl/,
    "restituiva l'intero data URL in base64: un PDF dentro una colonna TEXT",
  );
});

test("il file passa da Attachment Core, sul genere che accende la guardia clinica", () => {
  const codice = senzaCommenti(sorgente(FORM));

  assert.match(codice, /uploadAttachment\(/);
  assert.match(
    codice,
    /category:\s*"medical_certificate"/,
    "e la categoria che fa pretendere `clinical.read` allo scaricamento",
  );
  assert.match(
    codice,
    /ownerType:\s*"athlete"/,
    "un allegato senza proprietario e un allegato che nessuno sa a chi mostrare",
  );
});

test("la categoria dichiarata e riconosciuta come certificato medico", async () => {
  const { isMedicalCertificateDocumentKind } = await import(
    "../../src/lib/documents/request-model.ts"
  );

  assert.equal(
    isMedicalCertificateDocumentKind("medical_certificate"),
    true,
    "se non lo fosse, la guardia in `attachment-permissions` non scatterebbe e il file uscirebbe a chi vede solo lo stato",
  );
});

/* ------------------------------------------------------------------ */
/* Il resto del mandato N5                                             */
/* ------------------------------------------------------------------ */

test("la finestra sa correggere, non solo creare", () => {
  const codice = senzaCommenti(sorgente(FORM));

  assert.match(codice, /certificate\?:\s*EditableCertificate/);
  assert.match(codice, /const isEditing = Boolean\(certificate\?\.id\)/);
  assert.match(
    codice,
    /Salva modifiche/,
    "chi corregge deve vedere che sta correggendo",
  );
});

test("in correzione il file non e obbligatorio, e caricarne uno lo sostituisce", () => {
  const codice = senzaCommenti(sorgente(FORM));

  assert.match(
    codice,
    /if \(!selectedFile && !hasExistingFile\)/,
    "pretendere di ricaricare lo stesso PDF per correggere un refuso non e una difesa",
  );
  assert.match(
    codice,
    /replaceAttachment\(source\.id/,
    "sostituire allo stesso id: il record non punta mai a un allegato che non c'e piu",
  );
});

test("il form non dichiara lo stato del certificato", () => {
  const codice = senzaCommenti(sorgente(FORM));

  assert.doesNotMatch(
    codice,
    /status:\s*new Date\(formData\.expiryDate\)/,
    "lo stato si ricava dalla scadenza confrontata con oggi: una colonna che dice «valido» accanto a una data passata e come un ragazzo scende in campo senza copertura",
  );
});

test("la scheda atleta ha una strada per correggere un certificato", () => {
  const codice = senzaCommenti(sorgente("src/app/athletes/[id]/page.tsx"));

  assert.match(codice, /handleUpdateMedicalCertificate/);
  assert.match(
    codice,
    /setCertificateToEdit\(\{/,
    "un percorso di dominio senza un pulsante che lo apra e codice irraggiungibile (CLAUDE.md §11.8)",
  );
});

test("la data arriva al campo senza passare da un fuso orario", () => {
  const codice = senzaCommenti(sorgente(FORM));

  assert.match(
    codice,
    /const toDateInputValue[\s\S]{0,200}match\(\/\^\(\\d\{4\}-\\d\{2\}-\\d\{2\}\)\//,
    "`new Date()` su una data nuda la sposta indietro di un giorno a ovest di Greenwich, e su una scadenza sanitaria e un giorno di copertura in meno",
  );
});
