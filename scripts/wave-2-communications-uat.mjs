/**
 * Collaudo a runtime della **Wave 2 — comunicazioni e automazioni**.
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *          scripts/wave-2-communications-uat.mjs --base=http://127.0.0.1:3010
 *
 * Copre gli scenari del §15 del planning
 * ([33](../docs/knowledge-base/33-wave-2-planning.md)): pubblico, comunicazione
 * massiva, link di pagamento, bacheca, RSVP e automazioni.
 *
 * **Il vincolo che governa tutto.** Non si prova un invio verso indirizzi veri.
 * Il collaudo monta un **server SMTP finto** su `127.0.0.1`, con un certificato
 * autofirmato generato al volo, e configura EasyGame per parlare con quello:
 * cosi «inviato» significa davvero inviato — il messaggio si legge nel sink —
 * e il fallimento parziale si prova rifiutando **un** destinatario, che e
 * l'unico modo per verificare che gli altri partano lo stesso.
 *
 * Il server applicativo va avviato **con le stesse variabili**:
 *
 *     SMTP_CREDENTIALS_SECRET=<32+ caratteri> CRON_SECRET=<segreto> \
 *     NODE_TLS_REJECT_UNAUTHORIZED=0 npx next dev -p 3010
 *
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` serve **solo** perche il certificato del
 * sink e autofirmato, ed e una concessione del banco di prova: vale per il
 * processo di sviluppo che viene spento al termine, mai per un ambiente vero.
 *
 * **Scrive**: due club QA con prefisso `UAT-W2`, distrutti alla fine, e la
 * riga di configurazione SMTP, ripristinata al valore precedente.
 */

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import tls from "node:tls";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const BASE =
  (args.find((arg) => arg.startsWith("--base=")) || "").split("=")[1] ||
  "http://127.0.0.1:3010";
const SMTP_PORT = Number(
  (args.find((arg) => arg.startsWith("--smtp-port=")) || "").split("=")[1] ||
    2526,
);
const CRON_SECRET =
  (args.find((arg) => arg.startsWith("--cron-secret=")) || "").split("=")[1] ||
  process.env.CRON_SECRET ||
  "uat-w2-cron-secret";
const KEEP = args.includes("--keep");

const DB_ENV = String(process.env.EASYGAME_DB_ENV || "").trim();
if (DB_ENV !== "development") {
  console.error(
    `Rifiuto di scrivere: EASYGAME_DB_ENV vale "${DB_ENV || "(vuoto)"}", non "development".`,
  );
  process.exit(1);
}

const prisma = new PrismaClient();

/* ------------------------------------------------------------- il taccuino */

const results = [];
let currentGroup = "";
const group = (name) => {
  currentGroup = name;
  console.log(`\n── ${name}`);
};
const check = (name, condition, detail = "") => {
  const ok = Boolean(condition);
  results.push({ group: currentGroup, name, ok, detail });
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
};
const measures = [];
const measure = (name, ms, detail = "") => {
  measures.push({ name, ms, detail });
  console.log(`   ····  ${name}: ${ms} ms${detail ? ` — ${detail}` : ""}`);
};

/* ------------------------------------------------------------------ la rete */

const call = async (token, path, options = {}) => {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `easygame_session=${token}` } : {}),
      ...(options.clubId ? { "x-active-club-id": options.clubId } : {}),
      ...(options.role ? { "x-active-access-role": options.role } : {}),
      ...(options.headers || {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  return {
    status: response.status,
    data: payload?.data,
    error: payload?.error,
    raw,
    ms: Date.now() - started,
  };
};

/* ----------------------------------------------------- il server SMTP finto */

/**
 * Un sink SMTP su TLS diretto.
 *
 * Parla il minimo indispensabile del protocollo, perche e tutto cio che serve:
 * saluta, accetta l'autenticazione senza guardarla, accetta i destinatari
 * **tranne** quelli che devono fallire, e conserva il messaggio.
 */
const startSmtpSink = ({ port, cert, key, rifiuta = () => false }) => {
  const messaggi = [];

  const server = tls.createServer({ cert, key }, (socket) => {
    let buffer = "";
    let inData = false;
    let corrente = { rcpt: [], body: "" };

    socket.write("220 uat-w2 ESMTP\r\n");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");

      while (true) {
        if (inData) {
          const fine = buffer.indexOf("\r\n.\r\n");
          if (fine === -1) return;
          corrente.body += buffer.slice(0, fine);
          buffer = buffer.slice(fine + 5);
          inData = false;
          messaggi.push({ ...corrente });
          corrente = { rcpt: [], body: "" };
          socket.write("250 2.0.0 Ok\r\n");
          continue;
        }

        const fineRiga = buffer.indexOf("\r\n");
        if (fineRiga === -1) return;
        const riga = buffer.slice(0, fineRiga);
        buffer = buffer.slice(fineRiga + 2);

        const comando = riga.split(" ")[0].toUpperCase();

        if (comando === "EHLO" || comando === "HELO") {
          socket.write("250-uat-w2\r\n250 AUTH PLAIN LOGIN\r\n");
        } else if (comando === "AUTH") {
          socket.write("235 2.7.0 Accepted\r\n");
        } else if (comando === "MAIL") {
          socket.write("250 2.1.0 Ok\r\n");
        } else if (comando === "RCPT") {
          const indirizzo = (riga.match(/<([^>]*)>/) || [])[1] || "";
          if (rifiuta(indirizzo)) {
            socket.write("550 5.1.1 Destinatario rifiutato dal collaudo\r\n");
          } else {
            corrente.rcpt.push(indirizzo.toLowerCase());
            socket.write("250 2.1.5 Ok\r\n");
          }
        } else if (comando === "DATA") {
          inData = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (comando === "QUIT") {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
          return;
        } else if (comando === "RSET") {
          corrente = { rcpt: [], body: "" };
          socket.write("250 2.0.0 Ok\r\n");
        } else {
          socket.write("250 2.0.0 Ok\r\n");
        }
      }
    });

    socket.on("error", () => undefined);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () =>
      resolve({
        messaggi,
        stop: () => new Promise((done) => server.close(done)),
      }),
    );
  });
};

const generaCertificato = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uat-w2-tls-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");

  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath,
    "-days", "1", "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1,DNS:localhost",
  ], { stdio: "ignore" });

  return {
    dir,
    key: readFileSync(keyPath, "utf8"),
    cert: readFileSync(certPath, "utf8"),
  };
};

/* --------------------------------------------------------- i dati del banco */

const createSession = async (userId) => {
  const token = `uat-w2-${randomUUID()}`;
  await prisma.session.create({
    data: {
      token,
      user_id: userId,
      expires_at: new Date(Date.now() + 6 * 3600_000),
    },
  });
  return token;
};

const makeClub = async (label) => {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const user = await prisma.user.create({
    data: {
      email: `uat-w2-${label}-${stamp}@easygame.test`,
      password_hash: "uat-w2",
      first_name: "UAT-W2",
      last_name: label.toUpperCase(),
    },
  });
  const club = await prisma.club.create({
    data: {
      name: `UAT-W2 Club ${label} ${stamp}`,
      slug: `uat-w2-club-${label}-${stamp}`,
      creator_id: user.id,
      settings: {},
    },
  });
  await prisma.organizationUser.create({
    data: { organization_id: club.id, user_id: user.id, role: "owner" },
  });
  return { club, user };
};

const makeGuardianUser = async (email) => {
  const user = await prisma.user.create({
    data: {
      email,
      password_hash: "uat-w2",
      first_name: "Tutore",
      last_name: "QA",
    },
  });
  return user;
};

const makeAthlete = async ({
  clubId,
  firstName,
  lastName,
  categoryId,
  siteId,
  guardianEmail,
  guardianUserId = null,
}) =>
  prisma.athlete.create({
    data: {
      organization_id: clubId,
      first_name: firstName,
      last_name: lastName,
      status: "active",
      category_id: categoryId,
      category_name: categoryId,
      data: {
        guardians: guardianEmail
          ? [
              {
                name: "Tutore",
                surname: lastName,
                email: guardianEmail,
                ...(guardianUserId ? { linkedUserId: guardianUserId } : {}),
              },
            ]
          : [],
      },
      category_memberships: {
        create: [
          {
            organization_id: clubId,
            category_id: categoryId,
            category_name: categoryId,
            site_id: siteId || null,
            is_primary: true,
          },
        ],
      },
    },
  });

const cleanup = async (clubIds) => {
  for (const clubId of clubIds) {
    if (!clubId) continue;
    await prisma.communicationDelivery.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.paymentLink.deleteMany({ where: { organization_id: clubId } });
    await prisma.paymentTransaction.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.receipt.deleteMany({ where: { organization_id: clubId } });
    await prisma.athletePayment.deleteMany({ where: { organization_id: clubId } });
    await prisma.trainingAttendance.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.notification.deleteMany({ where: { organization_id: clubId } });
    await prisma.athleteCategoryMembership.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.medicalCertificate.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.athlete.deleteMany({ where: { organization_id: clubId } });
    await prisma.attachmentBlob.deleteMany({
      where: { attachment: { organization_id: clubId } },
    });
    await prisma.attachment.deleteMany({ where: { organization_id: clubId } });
    await prisma.clubResourceItem.deleteMany({
      where: { organization_id: clubId },
    });
    await prisma.auditLog.deleteMany({ where: { organization_id: clubId } });
    await prisma.organizationUser.deleteMany({
      where: { organization_id: clubId },
    });
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { creator_id: true },
    });
    await prisma.club.delete({ where: { id: clubId } }).catch(() => {});
    if (club?.creator_id) {
      await prisma.session.deleteMany({ where: { user_id: club.creator_id } });
      await prisma.user.delete({ where: { id: club.creator_id } }).catch(() => {});
    }
  }
  await prisma.session.deleteMany({ where: { token: { startsWith: "uat-w2-" } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: "uat-w2-" } } });
};

/* ------------------------------------------------------- la configurazione */

const SEGRETO_SMTP =
  process.env.SMTP_CREDENTIALS_SECRET ||
  process.env.AUTH_RATE_LIMIT_SECRET ||
  "";

const configuraSmtp = async () => {
  const { SMTP_CONFIG_ID } = await import("../src/lib/email/smtp-config.ts");
  const { encryptCredential } = await import(
    "../src/lib/server/email/credential-crypto.ts"
  );

  const precedente = await prisma.emailProviderConfig.findUnique({
    where: { id: SMTP_CONFIG_ID },
  });

  const cifrata = encryptCredential("uat-w2-password");

  const riga = {
    provider: "smtp",
    enabled: true,
    host: "127.0.0.1",
    port: SMTP_PORT,
    security_mode: "ssl",
    username: "uat-w2",
    password_ciphertext: cifrata.ciphertext,
    password_iv: cifrata.iv,
    password_tag: cifrata.tag,
    from_email: "noreply@easygame.test",
    from_name: "UAT W2",
  };

  await prisma.emailProviderConfig.upsert({
    where: { id: SMTP_CONFIG_ID },
    create: { id: SMTP_CONFIG_ID, ...riga },
    update: riga,
  });

  return async () => {
    if (precedente) {
      await prisma.emailProviderConfig.update({
        where: { id: SMTP_CONFIG_ID },
        data: precedente,
      });
    } else {
      await prisma.emailProviderConfig
        .delete({ where: { id: SMTP_CONFIG_ID } })
        .catch(() => {});
    }
  };
};

/* ------------------------------------------------------------------ il giro */

const attendi = (ms) => new Promise((done) => setTimeout(done, ms));

const run = async () => {
  if (SEGRETO_SMTP.length < 32) {
    console.error(
      "SMTP_CREDENTIALS_SECRET assente o troppo corto: senza, la configurazione SMTP non e cifrabile e il collaudo non puo provare una consegna vera.",
    );
    process.exit(1);
  }

  const residui = await prisma.club.findMany({
    where: { name: { startsWith: "UAT-W2 Club" } },
    select: { id: true },
  });
  if (residui.length) {
    console.log(`Rimuovo ${residui.length} club QA di un giro precedente`);
    await cleanup(residui.map((row) => row.id));
  }
  const clubPreesistenti = await prisma.club.count();

  const tls = generaCertificato();
  const sink = await startSmtpSink({
    port: SMTP_PORT,
    cert: tls.cert,
    key: tls.key,
    rifiuta: (indirizzo) => indirizzo.toLowerCase().startsWith("rifiuta@"),
  });
  const ripristinaSmtp = await configuraSmtp();

  const clubIds = [];

  try {
    const { club: clubA, user: ownerA } = await makeClub("a");
    const { club: clubB, user: ownerB } = await makeClub("b");
    clubIds.push(clubA.id, clubB.id);

    const tokenA = await createSession(ownerA.id);
    const tokenB = await createSession(ownerB.id);

    const A = (path, options = {}) =>
      call(tokenA, path, { clubId: clubA.id, role: "owner", ...options });
    const Atrainer = (path, options = {}) =>
      call(tokenA, path, { clubId: clubA.id, role: "trainer", ...options });
    const B = (path, options = {}) =>
      call(tokenB, path, { clubId: clubB.id, role: "owner", ...options });

    console.log(`\nCollaudo su ${BASE}`);
    console.log(`Club A: ${clubA.name} (${clubA.id})`);
    console.log(`Club B: ${clubB.name} (${clubB.id})`);
    console.log(`Sink SMTP: 127.0.0.1:${SMTP_PORT}\n`);

    /* Sedi e categorie del club A. */
    await prisma.club.update({
      where: { id: clubA.id },
      data: {
        club_sites: [
          { id: "sede-nord", name: "Sede Nord", active: true },
          { id: "sede-sud", name: "Sede Sud", active: true },
        ],
        categories: [
          { id: "u14", name: "Under 14" },
          { id: "u16", name: "Under 16" },
        ],
      },
    });

    /* Il tutore con account, iscritto al club A. */
    const tutoreConAccount = await makeGuardianUser(
      "uat-w2-famiglia1@easygame.test",
    );
    await prisma.organizationUser.create({
      data: {
        organization_id: clubA.id,
        user_id: tutoreConAccount.id,
        role: "parent",
      },
    });
    const tokenTutore = await createSession(tutoreConAccount.id);
    const Tutore = (path, options = {}) =>
      call(tokenTutore, path, { clubId: clubA.id, role: "parent", ...options });

    const a1 = await makeAthlete({
      clubId: clubA.id,
      firstName: "Luca",
      lastName: "Bianchi",
      categoryId: "u14",
      siteId: "sede-nord",
      guardianEmail: "uat-w2-famiglia1@easygame.test",
      guardianUserId: tutoreConAccount.id,
    });
    const a2 = await makeAthlete({
      clubId: clubA.id,
      firstName: "Marco",
      lastName: "Verdi",
      categoryId: "u16",
      siteId: "sede-sud",
      guardianEmail: "uat-w2-famiglia2@easygame.test",
    });
    const a3 = await makeAthlete({
      clubId: clubA.id,
      firstName: "Sara",
      lastName: "Bianchi",
      categoryId: "u14",
      siteId: "sede-nord",
      guardianEmail: "uat-w2-famiglia1@easygame.test",
      guardianUserId: tutoreConAccount.id,
    });
    const a4 = await makeAthlete({
      clubId: clubA.id,
      firstName: "Senza",
      lastName: "Recapito",
      categoryId: "u14",
      siteId: "sede-nord",
      guardianEmail: "",
    });
    const a5 = await makeAthlete({
      clubId: clubA.id,
      firstName: "Rifiutato",
      lastName: "Dal Server",
      categoryId: "u14",
      siteId: "sede-nord",
      guardianEmail: "rifiuta@easygame.test",
    });

    /* Il club B ha la **stessa** email di tutore: e il caso multi-tenant. */
    await makeAthlete({
      clubId: clubB.id,
      firstName: "Altro",
      lastName: "Club",
      categoryId: "u14",
      siteId: null,
      guardianEmail: "uat-w2-famiglia1@easygame.test",
    });

    /* ================================================== 1 — IL PUBBLICO === */

    group("1 — Il pubblico");

    const tutti = await A("/api/v1/communications", {
      method: "POST",
      body: {
        preview: true,
        criteria: [{ kind: "all_families" }],
        template: { subject: "Prova", body: "Ciao {{recipient.name}}" },
      },
    });

    check(
      "l'anteprima risponde 200",
      tutti.status === 200,
      `status ${tutti.status} ${tutti.error?.message || ""}`,
    );
    check(
      "la famiglia con due figli e un destinatario solo",
      tutti.data?.counts?.recipients === 3,
      `raggiungibili ${tutti.data?.counts?.recipients} (attesi 3: famiglia1, famiglia2, rifiuta)`,
    );
    check(
      "e porta con se due posizioni",
      tutti.data?.reachable?.find((row) =>
        row.email === "uat-w2-famiglia1@easygame.test",
      )?.athleteNames?.length === 2,
      "un messaggio, due atleti",
    );
    check(
      "l'atleta senza recapito compare fra gli esclusi con il motivo",
      tutti.data?.excluded?.some((row) => row.reason === "no_guardian"),
      JSON.stringify(tutti.data?.excluded?.map((row) => row.reason) || []),
    );
    check(
      "nessun destinatario dell'altro club",
      !tutti.raw.includes(clubB.id),
      "il pubblico non attraversa i club",
    );

    const perCategoria = await A("/api/v1/communications", {
      method: "POST",
      body: {
        preview: true,
        criteria: [{ kind: "category_ids", values: ["u16"] }],
        template: { subject: "x", body: "y" },
      },
    });
    check(
      "il filtro per categoria restringe",
      perCategoria.data?.counts?.recipients === 1 &&
        perCategoria.data?.reachable?.[0]?.email ===
          "uat-w2-famiglia2@easygame.test",
      `${perCategoria.data?.counts?.recipients} destinatari`,
    );

    const perSede = await A("/api/v1/communications", {
      method: "POST",
      body: {
        preview: true,
        criteria: [{ kind: "site_ids", values: ["sede-sud"] }],
        template: { subject: "x", body: "y" },
      },
    });
    check(
      "il filtro per sede restringe",
      perSede.data?.counts?.recipients === 1,
      `${perSede.data?.counts?.recipients} destinatari`,
    );

    const perSelezione = await A("/api/v1/communications", {
      method: "POST",
      body: {
        preview: true,
        criteria: [{ kind: "athlete_ids", values: [a2.id] }],
        template: { subject: "x", body: "y" },
      },
    });
    check(
      "il filtro per selezione restringe a un atleta",
      perSelezione.data?.counts?.recipients === 1,
      `${perSelezione.data?.counts?.recipients} destinatari`,
    );

    const criterioInventato = await A("/api/v1/communications", {
      method: "POST",
      body: {
        preview: true,
        criteria: [{ kind: "quelli_che_mi_stanno_simpatici" }],
        template: { subject: "x", body: "y" },
      },
    });
    check(
      "un criterio inventato fa fallire invece di allargare il pubblico",
      criterioInventato.status === 400,
      `status ${criterioInventato.status}`,
    );

    const insolutiAllenatore = await Atrainer("/api/v1/communications", {
      method: "POST",
      body: {
        preview: true,
        criteria: [{ kind: "overdue_payments" }],
        template: { subject: "x", body: "y" },
      },
    });
    check(
      "l'allenatore non ottiene l'elenco di chi non ha pagato",
      insolutiAllenatore.status === 403 &&
        String(insolutiAllenatore.error?.message || "").includes(
          "Accesso negato",
        ),
      `status ${insolutiAllenatore.status}`,
    );

    const invioAllenatore = await Atrainer("/api/v1/communications", {
      method: "POST",
      body: {
        criteria: [{ kind: "all_families" }],
        template: { subject: "x", body: "y" },
      },
    });
    check(
      "l'allenatore non puo mandare una comunicazione",
      invioAllenatore.status === 403,
      `status ${invioAllenatore.status}`,
    );

    const clubAltrui = await B("/api/v1/communications", {
      method: "POST",
      body: {
        preview: true,
        organization_id: clubA.id,
        criteria: [{ kind: "all_families" }],
        template: { subject: "x", body: "y" },
      },
    });
    check(
      "il club B non vede le famiglie del club A",
      !clubAltrui.raw.includes("famiglia2"),
      `status ${clubAltrui.status}`,
    );

    /* ==================================== 2 — LA COMUNICAZIONE MASSIVA === */

    group("2 — La comunicazione massiva");

    const idComunicazione = randomUUID();
    const modello = {
      subject: "{{club.name}}: avviso",
      body: "Gentile {{recipient.name}}, riguarda {{athlete.first_name}}.",
    };

    const anteprima = await A("/api/v1/communications", {
      method: "POST",
      body: {
        preview: true,
        criteria: [{ kind: "all_families" }],
        template: modello,
        communication_id: idComunicazione,
      },
    });
    check(
      "l'anteprima mostra il messaggio come lo leggera il primo destinatario",
      anteprima.data?.sample?.subject?.includes(clubA.name) === true,
      anteprima.data?.sample?.subject,
    );
    check(
      "l'anteprima non scrive niente nel registro",
      (await prisma.communicationDelivery.count({
        where: { organization_id: clubA.id },
      })) === 0,
      "nessuna consegna prima dell'invio",
    );

    const prima = Date.now();
    const invio = await A("/api/v1/communications", {
      method: "POST",
      body: {
        criteria: [{ kind: "all_families" }],
        template: modello,
        communication_id: idComunicazione,
      },
    });
    measure("invio a 3 destinatari", Date.now() - prima);

    await attendi(300);

    check(
      "due destinatari su tre ricevono davvero",
      invio.data?.totals?.sent === 2,
      `inviati ${invio.data?.totals?.sent}, falliti ${invio.data?.totals?.failed}`,
    );
    check(
      "il destinatario rifiutato dal server risulta fallito, non inviato",
      invio.data?.deliveries?.some(
        (row) => row.email === "rifiuta@easygame.test" && row.status === "failed",
      ),
      "il fallimento parziale non annulla il resto",
    );
    check(
      "il messaggio e arrivato davvero al sink",
      sink.messaggi.length === 2,
      `${sink.messaggi.length} messaggi consegnati`,
    );
    check(
      "i segnaposto sono risolti nel messaggio consegnato",
      sink.messaggi.some((messaggio) =>
        messaggio.body.includes("Luca"),
      ),
      "il nome dell'atleta compare nel corpo",
    );

    const doppioClic = await A("/api/v1/communications", {
      method: "POST",
      body: {
        criteria: [{ kind: "all_families" }],
        template: modello,
        communication_id: idComunicazione,
      },
    });
    check(
      "il doppio clic non manda un secondo messaggio",
      doppioClic.data?.totals?.sent === 0,
      `inviati ${doppioClic.data?.totals?.sent}`,
    );
    check(
      "chi aveva fallito riparte, e solo lui",
      sink.messaggi.length === 2,
      `${sink.messaggi.length} messaggi in tutto`,
    );

    const registro = await prisma.communicationDelivery.findMany({
      where: { organization_id: clubA.id, source_kind: "bulk" },
    });
    const perEmail = registro.filter((row) => row.channel === "email");
    const perApplicazione = registro.filter((row) => row.channel === "in_app");
    check(
      "il registro dice chi ha ricevuto cosa, canale per canale",
      perEmail.filter((row) => row.status === "sent").length === 2 &&
        perEmail.some((row) => row.status === "failed"),
      `${perEmail.length} righe email, ${perApplicazione.length} in applicazione`,
    );
    check(
      "chi ha un account riceve anche la copia in applicazione",
      perApplicazione.length === 1 && perApplicazione[0].status === "sent",
      "la notifica accompagna l'email, non la sostituisce",
    );
    check(
      "la riga del registro conserva le persone rappresentate",
      registro.find(
        (row) => row.recipient_key === "uat-w2-famiglia1@easygame.test",
      )?.athlete_ids?.length === 2,
      "un messaggio, due atleti tracciati",
    );

    const modelloRotto = await A("/api/v1/communications", {
      method: "POST",
      body: {
        criteria: [{ kind: "all_families" }],
        template: { subject: "x", body: "Ciao {{questo.non.esiste}}" },
        communication_id: randomUUID(),
      },
    });
    check(
      "un segnaposto inventato blocca l'invio",
      modelloRotto.status === 400,
      `status ${modelloRotto.status}`,
    );

    /* ================================== 3 — IL LINK DI PAGAMENTO ======== */

    group("3 — Il link di pagamento");

    const rata = await prisma.athletePayment.create({
      data: {
        organization_id: clubA.id,
        athlete_id: a1.id,
        description: "Quota UAT",
        amount: 130,
        due_date: new Date("2026-11-30T00:00:00Z"),
        status: "pending",
        data: {},
      },
    });

    const emissione = await A("/api/v1/payment-links", {
      method: "POST",
      body: { payment_id: rata.id },
    });
    check(
      "senza il piano che comprende i pagamenti online il link non si emette, e lo dice",
      emissione.status === 409 || emissione.status === 200,
      `status ${emissione.status} ${emissione.error?.message || ""}`,
    );

    /** `/pay/<token>` → `<token>`: la rotta non restituisce il token nudo. */
    const tokenDaPercorso = (percorso) =>
      String(percorso || "").split("/").filter(Boolean).pop() || null;

    const emesso = emissione.status === 200;
    let token = emesso ? tokenDaPercorso(emissione.data?.path) : null;
    let linkId = emesso ? emissione.data?.linkId : null;

    if (!emesso) {
      /*
        Il club di prova nasce senza il piano che comprende i pagamenti
        online. Lo si concede qui **solo per il collaudo**, perche il resto
        degli scenari del link non e verificabile altrimenti.
      */
      const clubCorrente = await prisma.club.findUnique({
        where: { id: clubA.id },
        select: { settings: true },
      });
      await prisma.club.update({
        where: { id: clubA.id },
        data: {
          settings: {
            ...(clubCorrente?.settings || {}),
            /*
              Il piano vive sotto `settings.subscription` e non basta da solo:
              serve anche uno stato che paghi. Lo si concede qui **solo per il
              collaudo** — in esercizio ci passa `POST /api/v1/entitlements`
              con ruolo di piattaforma (ADR-0048).
            */
            subscription: { plan: "plus", status: "active" },
          },
        },
      });
      const secondoTentativo = await A("/api/v1/payment-links", {
        method: "POST",
        body: { payment_id: rata.id },
      });
      token = tokenDaPercorso(secondoTentativo.data?.path);
      linkId = secondoTentativo.data?.linkId;
      check(
        "con il piano giusto il link si emette",
        secondoTentativo.status === 200 && Boolean(token),
        `status ${secondoTentativo.status} ${secondoTentativo.error?.message || ""}`,
      );
    }

    if (token) {
      const vista = await fetch(
        `${BASE}/api/public/payment-links/${token}`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json().catch(() => ({})),
      }));

      check(
        "il link valido apre la pagina pubblica",
        vista.status === 200,
        `status ${vista.status}`,
      );

      const serializzata = JSON.stringify(vista.body || {});
      check(
        "la pagina pubblica non espone nessun identificativo interno",
        !serializzata.includes(clubA.id) &&
          !serializzata.includes(rata.id) &&
          !serializzata.includes(a1.id),
        "ne club, ne rata, ne atleta",
      );

      const manomesso = `${token.slice(0, -1)}${token.slice(-1) === "A" ? "B" : "A"}`;
      const tampered = await fetch(
        `${BASE}/api/public/payment-links/${manomesso}`,
      ).then(async (response) => ({
        status: response.status,
        raw: await response.text(),
      }));
      const sconosciuto = await fetch(
        `${BASE}/api/public/payment-links/${"z".repeat(43)}`,
      ).then(async (response) => ({
        status: response.status,
        raw: await response.text(),
      }));
      check(
        "token manomesso e token sconosciuto rispondono la stessa cosa",
        tampered.status === sconosciuto.status &&
          tampered.raw === sconosciuto.raw,
        `${tampered.status} vs ${sconosciuto.status}`,
      );

      /* Rata saldata: si registra un incasso pari al dovuto. */
      await prisma.paymentTransaction.create({
        data: {
          organization_id: clubA.id,
          athlete_id: a1.id,
          payment_id: rata.id,
          amount: 130,
          payment_method: "cash",
          paid_at: new Date(),
          data: {},
        },
      });

      const saldata = await fetch(
        `${BASE}/api/public/payment-links/${token}`,
      ).then(async (response) => ({
        status: response.status,
        body: await response.json().catch(() => ({})),
      }));
      check(
        "una rata gia saldata lo dice invece di dare errore",
        saldata.status === 200 &&
          JSON.stringify(saldata.body).includes("settled"),
        `status ${saldata.status}`,
      );

      const link = await prisma.paymentLink.findFirst({
        where: { organization_id: clubA.id },
      });
      check(
        "in archivio c'e solo l'impronta del token, mai il token",
        Boolean(link?.token_hash) && !JSON.stringify(link).includes(token),
        "il token in chiaro non e memorizzato",
      );

      if (linkId) {
        await A(`/api/v1/payment-links/${linkId}`, { method: "DELETE" });
        const revocato = await fetch(
          `${BASE}/api/public/payment-links/${token}`,
        ).then(async (response) => ({
          status: response.status,
          raw: await response.text(),
        }));
        check(
          "un link revocato risponde come uno sconosciuto",
          revocato.status === sconosciuto.status &&
            revocato.raw === sconosciuto.raw,
          `status ${revocato.status}`,
        );
      }
    }

    /* ============================================ 4 — LA BACHECA ======== */

    group("4 — La bacheca");

    const bozza = await A("/api/v1/announcements", {
      method: "POST",
      body: {
        title: "Campo chiuso domenica",
        body: "Il campo restera chiuso per manutenzione.",
        criteria: [{ kind: "category_ids", values: ["u14"] }],
      },
    });
    check(
      "un annuncio nasce bozza",
      bozza.status === 200 && bozza.data?.status === "draft",
      `status ${bozza.status} ${bozza.error?.message || ""}`,
    );

    const bachecaPrimaDellaPubblicazione = await Tutore(
      "/api/v1/announcements?mine=1",
    );
    check(
      "una bozza non la legge nessuno",
      Array.isArray(bachecaPrimaDellaPubblicazione.data) &&
        bachecaPrimaDellaPubblicazione.data.length === 0,
      `${bachecaPrimaDellaPubblicazione.data?.length} annunci`,
    );

    const pubblicazione = await A(`/api/v1/announcements/${bozza.data?.id}`, {
      method: "POST",
      body: { action: "publish" },
    });
    check(
      "pubblicare consegna al pubblico scelto",
      pubblicazione.data?.delivered === 1,
      `consegnati ${pubblicazione.data?.delivered}, senza account ${pubblicazione.data?.withoutAccount}`,
    );

    const ripubblicazione = await A(`/api/v1/announcements/${bozza.data?.id}`, {
      method: "POST",
      body: { action: "publish" },
    });
    check(
      "pubblicare due volte non consegna due volte",
      ripubblicazione.data?.delivered === 0,
      `consegnati ${ripubblicazione.data?.delivered}`,
    );

    const bacheca = await Tutore("/api/v1/announcements?mine=1");
    check(
      "il destinatario vede l'annuncio",
      Array.isArray(bacheca.data) && bacheca.data.length === 1,
      `${bacheca.data?.length} annunci`,
    );
    check(
      "e risulta non letto",
      bacheca.data?.[0]?.readAt === null,
      `readAt ${bacheca.data?.[0]?.readAt}`,
    );

    const segnaLetto = await Tutore(
      `/api/v1/announcements/${bozza.data?.id}`,
      {
        method: "POST",
        body: { action: "read", delivery_id: bacheca.data?.[0]?.deliveryId },
      },
    );
    const segnaLettoDueVolte = await Tutore(
      `/api/v1/announcements/${bozza.data?.id}`,
      {
        method: "POST",
        body: { action: "read", delivery_id: bacheca.data?.[0]?.deliveryId },
      },
    );
    check(
      "segnare letto funziona una volta sola",
      segnaLetto.data?.read === true && segnaLettoDueVolte.data?.read === false,
      "la seconda apertura non sposta la data",
    );

    const elencoSocieta = await A("/api/v1/announcements");
    check(
      "la societa vede quanti lo hanno aperto",
      elencoSocieta.data?.[0]?.readCount === 1 &&
        elencoSocieta.data?.[0]?.audienceCount === 1,
      `${elencoSocieta.data?.[0]?.readCount}/${elencoSocieta.data?.[0]?.audienceCount}`,
    );

    const annuncioAltroClub = await B(
      `/api/v1/announcements/${bozza.data?.id}`,
    );
    check(
      "un annuncio di un altro club non si legge",
      annuncioAltroClub.status === 404 || annuncioAltroClub.status === 403,
      `status ${annuncioAltroClub.status}`,
    );

    const ritiro = await A(`/api/v1/announcements/${bozza.data?.id}`, {
      method: "POST",
      body: { action: "withdraw" },
    });
    const bachecaDopoIlRitiro = await Tutore("/api/v1/announcements?mine=1");
    check(
      "ritirare toglie dalla bacheca senza cancellare la consegna",
      ritiro.status === 200 &&
        bachecaDopoIlRitiro.data?.length === 0 &&
        (await prisma.communicationDelivery.count({
          where: { organization_id: clubA.id, source_kind: "board" },
        })) === 1,
      "la prova di averlo pubblicato resta",
    );

    /* =============================================== 5 — L'RSVP ========= */

    group("5 — L'RSVP");

    const allenamentoId = randomUUID();
    const domani = new Date(Date.now() + 24 * 3600_000);
    await prisma.club.update({
      where: { id: clubA.id },
      data: {
        trainings: [
          {
            id: allenamentoId,
            title: "Allenamento UAT",
            date: domani.toISOString().slice(0, 10),
            startsAt: domani.toISOString(),
            time: "18:00",
            categoryId: "u14",
            category: "u14",
            rsvpRequired: true,
            rsvpDeadline: new Date(Date.now() + 12 * 3600_000).toISOString(),
            status: "scheduled",
          },
        ],
      },
    });

    const rispostaSi = await Tutore("/api/v1/rsvp", {
      method: "POST",
      body: { training_id: allenamentoId, athlete_id: a1.id, status: "yes" },
    });
    check(
      "la famiglia risponde «si»",
      rispostaSi.status === 200,
      `status ${rispostaSi.status} ${rispostaSi.error?.message || ""}`,
    );

    const rigaPresenza = await prisma.trainingAttendance.findFirst({
      where: { organization_id: clubA.id, athlete_id: a1.id },
    });
    check(
      "la risposta non scrive una presenza",
      rigaPresenza?.rsvp_status === "yes" && rigaPresenza?.status !== "present",
      `rsvp ${rigaPresenza?.rsvp_status}, presenza ${rigaPresenza?.status}`,
    );

    const cambio = await Tutore("/api/v1/rsvp", {
      method: "POST",
      body: {
        training_id: allenamentoId,
        athlete_id: a1.id,
        status: "no",
        note: "Ha la febbre",
      },
    });
    const righeDopoIlCambio = await prisma.trainingAttendance.count({
      where: {
        organization_id: clubA.id,
        athlete_id: a1.id,
        training_id: allenamentoId,
      },
    });
    check(
      "la risposta si puo cambiare, e resta una riga sola",
      cambio.status === 200 && righeDopoIlCambio === 1,
      `${righeDopoIlCambio} righe`,
    );

    const doppiaRisposta = await Promise.all([
      Tutore("/api/v1/rsvp", {
        method: "POST",
        body: { training_id: allenamentoId, athlete_id: a3.id, status: "yes" },
      }),
      Tutore("/api/v1/rsvp", {
        method: "POST",
        body: { training_id: allenamentoId, athlete_id: a3.id, status: "yes" },
      }),
    ]);
    const righeGemelle = await prisma.trainingAttendance.count({
      where: {
        organization_id: clubA.id,
        athlete_id: a3.id,
        training_id: allenamentoId,
      },
    });
    check(
      "due risposte simultanee producono una riga sola",
      righeGemelle === 1,
      `${righeGemelle} righe, status ${doppiaRisposta.map((row) => row.status).join("/")}`,
    );

    const rispostaCrossTenant = await B("/api/v1/rsvp", {
      method: "POST",
      body: { training_id: allenamentoId, athlete_id: a1.id, status: "yes" },
    });
    check(
      "il club B non risponde per un atleta del club A",
      rispostaCrossTenant.status === 403 || rispostaCrossTenant.status === 404,
      `status ${rispostaCrossTenant.status}`,
    );

    const riepilogo = await A(`/api/v1/rsvp?training_id=${allenamentoId}`);
    check(
      "lo staff vede si, no e senza risposta",
      riepilogo.status === 200 &&
        typeof riepilogo.data?.totals?.noResponse === "number" &&
        riepilogo.data.totals.no === 1,
      JSON.stringify(riepilogo.data?.totals || {}),
    );

    /* Appello dell'allenatore: scrive la presenza e non tocca l'RSVP. */
    await prisma.trainingAttendance.updateMany({
      where: {
        organization_id: clubA.id,
        athlete_id: a1.id,
        training_id: allenamentoId,
      },
      data: { status: "present" },
    });
    const dopoAppello = await prisma.trainingAttendance.findFirst({
      where: {
        organization_id: clubA.id,
        athlete_id: a1.id,
        training_id: allenamentoId,
      },
    });
    check(
      "l'appello scrive la presenza senza toccare l'intenzione",
      dopoAppello?.status === "present" && dopoAppello?.rsvp_status === "no",
      `presenza ${dopoAppello?.status}, rsvp ${dopoAppello?.rsvp_status}`,
    );

    /* ============================================== 6 — LA SCALA ======== */

    group("6 — La scala");

    const creazioni = [];
    for (let index = 0; index < 120; index += 1) {
      creazioni.push(
        makeAthlete({
          clubId: clubA.id,
          firstName: "Massa",
          lastName: String(index),
          categoryId: "u14",
          siteId: "sede-nord",
          guardianEmail: `uat-w2-massa-${index}@easygame.test`,
        }),
      );
    }
    await Promise.all(creazioni);

    const inizioScala = Date.now();
    const anteprimaScala = await A("/api/v1/communications", {
      method: "POST",
      body: {
        preview: true,
        criteria: [{ kind: "all_families" }],
        template: { subject: "x", body: "y" },
      },
    });
    const msScala = Date.now() - inizioScala;
    measure(
      "anteprima su 125 atleti",
      msScala,
      `${anteprimaScala.data?.counts?.recipients} destinatari`,
    );
    check(
      "l'anteprima su 120+ destinatari resta sotto i 5 secondi",
      msScala < 5000,
      `${msScala} ms`,
    );
    check(
      "e li conta tutti",
      anteprimaScala.data?.counts?.recipients >= 120,
      `${anteprimaScala.data?.counts?.recipients} destinatari`,
    );

    /* =============================================== 7 — IL CRON ======== */

    group("7 — Le porte automatiche");

    const cronSenzaSegreto = await fetch(
      `${BASE}/api/v1/automations/run`,
    ).then((response) => response.status);
    const cronConSegretoSbagliato = await fetch(
      `${BASE}/api/v1/automations/run`,
      { headers: { authorization: "Bearer sbagliato" } },
    ).then((response) => response.status);

    check(
      "la porta del cron non risponde 200 a vuoto",
      cronSenzaSegreto === 401 ||
        cronSenzaSegreto === 503 ||
        cronSenzaSegreto === 404,
      `status ${cronSenzaSegreto}`,
    );
    check(
      "un segreto sbagliato non apre la porta del cron",
      cronConSegretoSbagliato === 401 ||
        cronConSegretoSbagliato === 503 ||
        cronConSegretoSbagliato === 404,
      `status ${cronConSegretoSbagliato}`,
    );


    /* ========================================== 8 — LE AUTOMAZIONI ====== */

    group("8 — Le automazioni");

    const cron = (path) =>
      fetch(`${BASE}${path}`, {
        headers: { authorization: `Bearer ${CRON_SECRET}` },
      }).then(async (response) => ({
        status: response.status,
        body: await response.json().catch(() => ({})),
      }));

    /*
      Una rata che scade fra **sette** giorni: e il primo anticipo di AUT-01, e
      la corrispondenza deve essere esatta.
    */
    /*
      La scadenza si costruisce a **mezzanotte UTC**, che e come il prodotto la
      scrive: `toIsoDateOnly` produce un giorno puro e Prisma lo rilegge cosi.
      Costruirla a mezzanotte **locale** — come faceva la prima versione di
      questo collaudo — la sposta di un giorno a ovest di UTC, e con la
      corrispondenza esatta degli anticipi il promemoria non parte affatto. E
      lo stesso difetto che la revisione ha trovato nel prodotto, e il collaudo
      lo aveva anche lui.
    */
    const oggiUtc = new Date();
    const fraSetteGiorni = new Date(
      Date.UTC(
        oggiUtc.getUTCFullYear(),
        oggiUtc.getUTCMonth(),
        oggiUtc.getUTCDate() + 7,
      ),
    );

    const rataInScadenza = await prisma.athletePayment.create({
      data: {
        organization_id: clubA.id,
        athlete_id: a2.id,
        description: "Quota in scadenza",
        amount: 90,
        due_date: fraSetteGiorni,
        status: "pending",
        data: {},
      },
    });

    const accensione = await A("/api/v1/automations", {
      method: "POST",
      body: {
        rule: {
          trigger: "installment_due",
          enabled: true,
          offsetDays: [7, 3],
          audience: "family",
          delivery: "immediate",
        },
      },
    });
    check(
      "una regola si accende dalla schermata",
      accensione.status === 200,
      `status ${accensione.status} ${accensione.error?.message || ""}`,
    );

    const messaggiPrima = sink.messaggi.length;
    const primoGiro = await A("/api/v1/automations/run", { method: "POST" });
    await attendi(300);

    check(
      "il giro parte e riferisce",
      primoGiro.status === 200,
      `status ${primoGiro.status} ${primoGiro.error?.message || ""}`,
    );
    check(
      "la rata in scadenza fra sette giorni produce un messaggio",
      sink.messaggi.length === messaggiPrima + 1,
      `${sink.messaggi.length - messaggiPrima} messaggi nuovi`,
    );

    const secondoGiro = await A("/api/v1/automations/run", { method: "POST" });
    await attendi(300);
    check(
      "la seconda esecuzione dello stesso giorno non manda niente",
      sink.messaggi.length === messaggiPrima + 1,
      `${sink.messaggi.length - messaggiPrima} messaggi in tutto`,
    );

    /* Due giri **in parallelo**: e il caso in cui un controllo in memoria cede. */
    const messaggiPrimaDellaCorsa = sink.messaggi.length;
    const rataGemella = await prisma.athletePayment.create({
      data: {
        organization_id: clubA.id,
        athlete_id: a1.id,
        description: "Quota in scadenza gemella",
        amount: 50,
        due_date: fraSetteGiorni,
        status: "pending",
        data: {},
      },
    });

    await Promise.all([
      A("/api/v1/automations/run", { method: "POST" }),
      A("/api/v1/automations/run", { method: "POST" }),
    ]);
    await attendi(500);

    check(
      "due giri in parallelo producono un messaggio solo",
      sink.messaggi.length === messaggiPrimaDellaCorsa + 1,
      `${sink.messaggi.length - messaggiPrimaDellaCorsa} messaggi nuovi per una rata sola`,
    );

    /* Un anticipo gia trascorso non recupera all'indietro. */
    const messaggiPrimaDelRecupero = sink.messaggi.length;

    await prisma.athletePayment.create({
      data: {
        organization_id: clubA.id,
        athlete_id: a2.id,
        description: "Quota con anticipo gia trascorso",
        amount: 40,
        /* Scade fra due giorni: nessuno dei due anticipi (7 e 3) corrisponde. */
        due_date: new Date(
          Date.UTC(
            oggiUtc.getUTCFullYear(),
            oggiUtc.getUTCMonth(),
            oggiUtc.getUTCDate() + 2,
          ),
        ),
        status: "pending",
        data: {},
      },
    });

    await A("/api/v1/automations/run", { method: "POST" });
    await attendi(300);
    check(
      "un anticipo gia trascorso non recupera all'indietro",
      sink.messaggi.length === messaggiPrimaDelRecupero,
      `${sink.messaggi.length - messaggiPrimaDelRecupero} messaggi (attesi 0)`,
    );

    /* Regola spenta. */
    await A("/api/v1/automations", {
      method: "POST",
      body: { rule: { trigger: "installment_due", enabled: false } },
    });
    const messaggiPrimaDelloSpegnimento = sink.messaggi.length;
    await prisma.athletePayment.create({
      data: {
        organization_id: clubA.id,
        athlete_id: a5.id,
        description: "Quota a regola spenta",
        amount: 30,
        due_date: fraSetteGiorni,
        status: "pending",
        data: {},
      },
    });
    await A("/api/v1/automations/run", { method: "POST" });
    await attendi(300);
    check(
      "una regola spenta non manda niente",
      sink.messaggi.length === messaggiPrimaDelloSpegnimento,
      `${sink.messaggi.length - messaggiPrimaDelloSpegnimento} messaggi (attesi 0)`,
    );

    /* Il giro da cron, su tutti i club, con un club che ha dati incoerenti. */
    await A("/api/v1/automations", {
      method: "POST",
      body: {
        rule: {
          trigger: "installment_due",
          enabled: true,
          offsetDays: [7],
          audience: "family",
          delivery: "immediate",
        },
      },
    });
    /*
      Il club B ha una rata che punta a un atleta **inesistente**: il giro deve
      passarci sopra senza fermarsi, e il club A deve ricevere lo stesso.
    */
    await B("/api/v1/automations", {
      method: "POST",
      body: {
        rule: {
          trigger: "installment_due",
          enabled: true,
          offsetDays: [7],
          audience: "family",
          delivery: "immediate",
        },
      },
    });
    await prisma.athletePayment.create({
      data: {
        organization_id: clubB.id,
        athlete_id: null,
        description: "Rata orfana",
        amount: 10,
        due_date: fraSetteGiorni,
        status: "pending",
        data: {},
      },
    });

    const giroCron = await cron("/api/v1/automations/run");
    await attendi(500);

    check(
      "il giro da cron risponde con il segreto giusto",
      giroCron.status === 200,
      `status ${giroCron.status}`,
    );
    check(
      "il giro attraversa piu club e li conta",
      Number(giroCron.body?.data?.processedClubs || 0) >= 2,
      `${giroCron.body?.data?.processedClubs} club elaborati, ${giroCron.body?.data?.failed} falliti`,
    );

    const consegneAutomazioni = await prisma.communicationDelivery.findMany({
      where: { organization_id: clubA.id, source_kind: "automation" },
    });
    check(
      "ogni messaggio automatico lascia una riga nel registro",
      consegneAutomazioni.length > 0 &&
        consegneAutomazioni.every((riga) => riga.dedup_key.startsWith("automation")),
      `${consegneAutomazioni.length} righe`,
    );

    const consegneAltroClub = await prisma.communicationDelivery.findMany({
      where: { organization_id: clubB.id },
    });
    check(
      "le consegne di un club non finiscono nell'altro",
      consegneAltroClub.every((riga) => riga.organization_id === clubB.id),
      `${consegneAltroClub.length} righe nel club B`,
    );

    /* L'automazione non tocca il dominio. */
    const rateDopo = await prisma.athletePayment.findMany({
      where: { organization_id: clubA.id },
      orderBy: { id: "asc" },
    });
    check(
      "nessuna rata e stata modificata dal giro",
      rateDopo.every((riga) => riga.status === "pending" && !riga.paid_at),
      `${rateDopo.length} rate, tutte intatte`,
    );

    const presenzeDopo = await prisma.trainingAttendance.count({
      where: { organization_id: clubA.id },
    });
    check(
      "nessuna presenza e stata creata dal giro",
      presenzeDopo === 2,
      `${presenzeDopo} righe di presenza (attese 2, quelle dell'RSVP)`,
    );

    const permessoAutomazioni = await Atrainer("/api/v1/automations", {
      method: "POST",
      body: { rule: { trigger: "installment_due", enabled: false } },
    });
    check(
      "l'allenatore non configura le automazioni",
      permessoAutomazioni.status === 403,
      `status ${permessoAutomazioni.status}`,
    );

    /* ---------------------------------------------------------- il verdetto */

    const passati = results.filter((row) => row.ok).length;
    console.log(
      `\n══ ${passati}/${results.length} controlli superati\n`,
    );

    for (const row of results.filter((entry) => !entry.ok)) {
      console.log(`   FAIL  [${row.group}] ${row.name} — ${row.detail}`);
    }

    if (measures.length) {
      console.log("\nMisure:");
      for (const row of measures) {
        console.log(`   ${row.name}: ${row.ms} ms ${row.detail}`);
      }
    }

    return { passati, totale: results.length, clubPreesistenti };
  } finally {
    await ripristinaSmtp();
    await sink.stop();
    rmSync(tls.dir, { recursive: true, force: true });

    if (!KEEP) {
      await cleanup(clubIds);
      const rimasti = await prisma.club.count({
        where: { name: { startsWith: "UAT-W2 Club" } },
      });
      const utentiResidui = await prisma.user.count({
        where: { email: { startsWith: "uat-w2-" } },
      });
      console.log(
        `\nPulizia: club QA residui ${rimasti}, utenti QA residui ${utentiResidui}`,
      );
    }

    await prisma.$disconnect();
  }
};

run()
  .then((esito) => {
    process.exit(esito.passati === esito.totale ? 0 : 1);
  })
  .catch(async (error) => {
    console.error("\nIl collaudo si e interrotto:", error);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
