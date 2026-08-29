import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Un dominio, un proprietario (Wave 2, CLAUDE.md §2).
 *
 * **Perche questi vincoli sono un test e non una convenzione.** Il difetto
 * storico di questo repository e aggiungere una seconda implementazione di
 * qualcosa che esiste gia — e successo con i toast, con lo storage mobile,
 * con le dashboard allenatore. La Wave 2 apre sei lane in parallelo su un
 * dominio solo: e esattamente la condizione in cui due lane risolvono lo
 * stesso problema in due modi e nessuno se ne accorge finche non e in
 * produzione.
 *
 * Se qualcuno ne scrive un secondo, questo file diventa rosso **prima** che
 * un messaggio parta due volte verso una famiglia.
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

const FILES = walk(SRC).map((file) => ({
  rel: path.relative(SRC, file).split(path.sep).join("/"),
  content: readFileSync(file, "utf8"),
}));

const filesUsing = (needle, allowlist) =>
  FILES.filter(
    (file) => file.content.includes(needle) && !allowlist.includes(file.rel),
  ).map((file) => file.rel);

// --- il pubblico ha un solo risolutore ------------------------------------

test("i tutori di un atleta si leggono da un punto solo", () => {
  /*
    `parent-dashboard` non risolve un pubblico: risolve **l'atleta di chi sta
    guardando**, che e un'altra domanda. `medical-certificate-reminders` e il
    residuo dichiarato: la sua migrazione sull'audience engine e registrata
    come debito della Wave, non e stata dimenticata.
  */
  const consentiti = [
    "lib/athlete-guardians.ts",
    "lib/server/audience.ts",
    "lib/server/parent-dashboard.ts",
    "lib/server/medical-certificate-reminders.ts",
  ];

  assert.deepEqual(
    filesUsing("readAthleteGuardianContacts", [
      ...consentiti,
      /* Il sollecito **delega** all'audience engine: legge i contatti solo
         per risolvere gli account in un colpo solo, non per costruirsi un
         secondo insieme di destinatari. */
      "lib/server/payment-reminders.ts",
    ]),
    [],
    "chi legge i tutori per mandare qualcosa deve passare da src/lib/server/audience.ts",
  );
});

test("il sollecito non si risolve piu gli account per conto proprio", () => {
  const sollecito = FILES.find(
    (file) => file.rel === "lib/server/payment-reminders.ts",
  );

  assert.equal(
    sollecito.content.includes("organizationUser.findMany"),
    false,
    "la verifica di iscrizione al club vive in audience.ts, non qui",
  );
  assert.equal(
    sollecito.content.includes('from "./audience"'),
    true,
    "il sollecito deve importare l'audience engine",
  );
});

test("nessuno costruisce un insieme di destinatari fuori dal modulo puro", () => {
  assert.deepEqual(
    filesUsing("buildAudienceSet", [
      "lib/audience/recipients.ts",
      "lib/server/audience.ts",
    ]),
    [],
    "l'insieme canonico si costruisce in un punto solo",
  );
});

// --- l'invio ha un solo punto ---------------------------------------------

test("le email partono solo da src/lib/server/email/", () => {
  const consentiti = [
    "lib/server/email/email-service.ts",
    "lib/server/email/smtp-provider.ts",
    "lib/server/email/provider.ts",
    "lib/server/auth-workflows.ts",
    "lib/server/communications.ts",
    /*
      Il motore di automazioni (W2-A) e il secondo chiamante legittimo, e non e
      un secondo punto di invio: chiama la **stessa** `sendTransactionalEmail`
      di `src/lib/server/email/`, con la stessa configurazione SMTP e la stessa
      politica di errore. Cio che questo elenco protegge e che nessuno apra un
      canale proprio, non che esista un chiamante solo.
    */
    "lib/server/automations.ts",
  ];

  assert.deepEqual(
    filesUsing("sendTransactionalEmail", consentiti),
    [],
    "un secondo punto di invio significa due configurazioni SMTP e due politiche di errore",
  );

  assert.deepEqual(
    filesUsing("nodemailer", [
      "lib/server/email/smtp-provider.ts",
      "lib/server/email/provider.ts",
    ]),
    [],
    "nessuno parla con un server SMTP fuori da src/lib/server/email/",
  );
});

// --- la deduplica ha un solo registro -------------------------------------

test("la deduplica delle comunicazioni passa dal registro delle consegne", () => {
  assert.deepEqual(
    filesUsing("communicationDelivery", [
      "lib/server/communication-deliveries.ts",
    ]),
    [],
    "solo il proprietario del registro tocca la tabella; gli altri passano dalle sue funzioni",
  );
});

test("la rivendicazione a sei ore dentro l'anagrafica non esiste piu", () => {
  assert.deepEqual(
    filesUsing("paymentReminders:", []),
    [],
    "la rivendicazione viveva in athletes.data: adesso e una riga del registro",
  );

  const sollecito = FILES.find(
    (file) => file.rel === "lib/server/payment-reminders.ts",
  );
  assert.equal(
    sollecito.content.includes("paymentReminders: claims"),
    false,
    "nessuno riscrive piu le rivendicazioni dentro athletes.data",
  );
});

// --- i permessi hanno una sola matrice ------------------------------------

test("i permessi delle comunicazioni si dichiarano in un posto solo", () => {
  const permessi = [
    "communications.send",
    "automations.manage",
    "board.publish",
    "rsvp.read",
  ];

  for (const permesso of permessi) {
    const fuori = FILES.filter(
      (file) =>
        file.rel !== "lib/communications/permissions.ts" &&
        /* Chi lo **usa** lo cita: e chi lo **definisce** che deve essere uno solo. */
        file.content.includes(`"${permesso}"`) &&
        file.content.includes("PERMISSIONS_BY_ROLE"),
    ).map((file) => file.rel);

    assert.deepEqual(
      fuori,
      [],
      `${permesso} ha una seconda matrice di ruoli`,
    );
  }
});

test("il perimetro gestionale si delega, non si ricopia", () => {
  const modulo = FILES.find(
    (file) => file.rel === "lib/communications/permissions.ts",
  );

  assert.equal(
    modulo.content.includes("canManageClubConfiguration"),
    true,
    "il giorno in cui il perimetro si allarga, questa matrice deve allargarsi con lui",
  );
});
