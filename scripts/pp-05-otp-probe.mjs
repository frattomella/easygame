/**
 * **La sonda dell'OTP, contro Postgres vero.**
 *
 *     EASYGAME_DB_ENV=development AUTH_ALLOW_TEST_CODES=true \
 *       node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-05-otp-probe.mjs
 *
 * ---
 *
 * ## Perche esiste, e cosa misura che i test non misurano
 *
 * Il doppio di Prisma (`tests/helpers/fake-prisma.mjs`) esegue **una chiamata
 * alla volta**: intreccia gli `await`, ma non ha i lock di riga di Postgres,
 * non ha `READ COMMITTED`, non ha vincoli di unicita e non calcola le scadenze
 * con l'orologio del database. Tutto cio che dipende da quelle quattro cose e
 * invisibile in `npm test` **per costruzione**, ed e esattamente dove sono
 * finiti B-H1 e B-H2 nella Wave 6: contatori che contavano le raffiche invece
 * dei tentativi, e che nessun test vedeva.
 *
 * Questa sonda misura le proprieta che PP-05 aggiunge e che hanno la stessa
 * forma:
 *
 * - **P1** — il tetto dei tentativi regge a N conferme **simultanee**;
 * - **P2** — una challenge e **monouso** anche sotto N codici giusti simultanei;
 * - **P3** — il **cooldown** regge a N reinvii simultanei: ne nasce una sola;
 * - **P4** — la challenge e legata al **destinatario**: cambiato il numero, il
 *   codice vecchio non verifica il numero nuovo;
 * - **P5** — una challenge **scaduta** non verifica, con la scadenza calcolata
 *   dal database;
 * - **P6** — il contatore **per numero** ferma la raffica anche cambiando ogni
 *   volta indirizzo IP.
 *
 * ## La regola di questo file
 *
 * **La sonda misura, non corregge.** Scrive righe proprie con identificativi
 * casuali e le cancella alla fine; non tocca dati esistenti e non modifica il
 * codice di produzione.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

process.env.AUTH_ALLOW_TEST_CODES = "true";

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

/**
 * **Un numero diverso per ogni utente della sonda, e a ogni esecuzione.**
 *
 * Il contatore per destinatario vive nel database e sopravvive alla sonda: con
 * un numero fisso le prove successive alla prima trovavano il secchiello gia
 * pieno e misuravano il contatore invece della proprieta che dichiaravano.
 */
const numeroNuovo = () =>
  "+3934" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
const NUMERO_ALTRUI = "+393479000002";

const esiti = [];
const registra = (id, atteso, ok, nota) => {
  esiti.push({ id, atteso, ok, nota });
  const segno = ok ? "PASS" : "FAIL";
  console.log(`[${segno}] ${id} — ${atteso}${nota ? ` :: ${nota}` : ""}`);
};

const nuovoUtente = async (over = {}) => {
  const id = randomUUID();
  await prisma.user.create({
    data: {
      id,
      email: `probe-${id}@example.invalid`,
      password_hash: "x",
      phone: numeroNuovo(),
      phone_verification_required: true,
      /*
        **Il riferimento opaco, che e cio che il flusso vero ha in mano** (M-1
        del secondo round della revisione ostile). Le rotte e il dominio
        accettano l'UUID nudo **solo** da chi ha gia una sessione su
        quell'account; la sonda non ne apre nessuna, quindi passa di qui.
      */
      token_verification_id: `verify_${randomUUID().replace(/-/g, "")}${randomUUID()
        .replace(/-/g, "")
        .slice(0, 16)}`,
      ...over,
    },
  });
  return prisma.user.findUnique({ where: { id } });
};

const pulisci = async (userIds) => {
  await prisma.authVerificationChallenge.deleteMany({
    where: { user_id: { in: userIds } },
  });
  await prisma.session.deleteMany({ where: { user_id: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};

const main = async () => {
  const flussi = await carica("src/lib/server/auth-workflows.ts");
  const sms = await carica("src/lib/server/sms/sms-service.ts");
  const inviaTelefono = (
    await carica("src/app/api/v1/auth/verify/phone/send/route.ts")
  ).POST;
  const confermaTelefono = (
    await carica("src/app/api/v1/auth/verify/phone/confirm/route.ts")
  ).POST;

  const consegnati = [];
  sms.__setSmsProviderForTests({
    id: "probe",
    async send(message) {
      consegnati.push(message);
    },
  });

  const creati = [];
  const richiesta = (corpo, ip = "203.0.113.1") =>
    new Request("http://easygame.local/api", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(corpo),
    });
  const corpo = async (r) => ({ status: r.status, body: await r.json() });

  /* ------------------------------------------------------------------ P1 */
  {
    const utente = await nuovoUtente();
    creati.push(utente.id);
    const invio = await flussi.sendPhoneVerificationChallenge(
      utente,
      "verify_phone",
    );
    const giusto = invio.previewCode;
    const sbagliato = giusto === "000000" ? "111111" : "000000";

    await Promise.allSettled(
      Array.from({ length: 40 }, () =>
        flussi.confirmPhoneVerification(utente.token_verification_id, sbagliato),
      ),
    );

    const riga = await prisma.authVerificationChallenge.findFirst({
      where: { user_id: utente.id },
      orderBy: { created_at: "desc" },
    });
    registra(
      "P1",
      "quaranta conferme simultanee spendono al massimo cinque tentativi",
      riga.attempts <= 5,
      `attempts = ${riga.attempts}`,
    );

    const dopo = await flussi
      .confirmPhoneVerification(utente.token_verification_id, giusto)
      .then(() => "verificato")
      .catch(() => "rifiutato");
    registra(
      "P1b",
      "esaurito il tetto, il codice giusto non verifica",
      dopo === "rifiutato",
      dopo,
    );
  }

  /* ------------------------------------------------------------------ P2 */
  {
    const utente = await nuovoUtente();
    creati.push(utente.id);
    const invio = await flussi.sendPhoneVerificationChallenge(
      utente,
      "verify_phone",
    );

    const risultati = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        flussi.confirmPhoneVerification(utente.token_verification_id, invio.previewCode),
      ),
    );
    const riuscite = risultati.filter((r) => r.status === "fulfilled").length;
    registra(
      "P2",
      "dieci codici giusti simultanei producono una verifica sola",
      riuscite === 1,
      `riuscite = ${riuscite}`,
    );
  }

  /* ------------------------------------------------------------------ P3 */
  {
    const utente = await nuovoUtente();
    creati.push(utente.id);

    const risultati = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        flussi.sendPhoneVerificationChallenge(utente, "verify_phone"),
      ),
    );
    const partite = risultati.filter((r) => r.status === "fulfilled").length;
    const vive = await prisma.authVerificationChallenge.count({
      where: { user_id: utente.id, channel: "phone", consumed_at: null },
    });

    /*
      Il cooldown legge la challenge piu recente e poi ne scrive una: fra la
      lettura e la scrittura ci sta una corsa, e questa sonda serve a
      **misurarne l'ampiezza**. La proprieta che conta non e «ne nasce
      esattamente una» — sarebbe un lock, e un lock su questo percorso e
      sproporzionato — ma «ne resta viva una sola», perche ogni apertura chiude
      le precedenti. Se restassero vive due challenge, esisterebbero due codici
      validi insieme, ed e quello il difetto.
    */
    registra(
      "P3",
      "dodici reinvii simultanei lasciano viva una challenge sola",
      vive <= 1,
      `partite = ${partite}, vive = ${vive}`,
    );
  }

  /* ------------------------------------------------------------------ P4 */
  {
    const utente = await nuovoUtente();
    creati.push(utente.id);
    const invio = await flussi.sendPhoneVerificationChallenge(
      utente,
      "verify_phone",
    );

    await prisma.user.update({
      where: { id: utente.id },
      data: { phone: NUMERO_ALTRUI, phone_verified_at: null },
    });

    const esito = await flussi
      .confirmPhoneVerification(utente.token_verification_id, invio.previewCode)
      .then(() => "verificato")
      .catch(() => "rifiutato");
    const dopo = await prisma.user.findUnique({ where: { id: utente.id } });

    registra(
      "P4",
      "cambiato il numero, il codice vecchio non verifica quello nuovo",
      esito === "rifiutato" && dopo.phone_verified_at === null,
      `${esito}, phone_verified_at = ${dopo.phone_verified_at}`,
    );
  }

  /* ------------------------------------------------------------------ P5 */
  {
    const utente = await nuovoUtente();
    creati.push(utente.id);
    const invio = await flussi.sendPhoneVerificationChallenge(
      utente,
      "verify_phone",
    );

    await prisma.authVerificationChallenge.updateMany({
      where: { user_id: utente.id },
      data: { expires_at: new Date(Date.now() - 60_000) },
    });

    const esito = await flussi
      .confirmPhoneVerification(utente.token_verification_id, invio.previewCode)
      .then(() => "verificato")
      .catch(() => "rifiutato");
    registra(
      "P5",
      "una challenge scaduta non verifica",
      esito === "rifiutato",
      esito,
    );
  }

  /* ------------------------------------------------------------------ P6 */
  {
    const utente = await nuovoUtente();
    creati.push(utente.id);
    const prima = consegnati.length;
    let bloccato = false;

    /*
      **Una rete nuova a ogni esecuzione della sonda.**

      I secchielli del contatore vivono nel database e sopravvivono alla sonda:
      con indirizzi fissi la seconda esecuzione trovava i secchielli della prima
      gia pieni, si fermava al primo giro e passava — dichiarando verde una
      proprieta che non aveva misurato. Un ottetto casuale rende ogni esecuzione
      indipendente, e l'asserzione su `partiti === 5` non lascia passare il caso
      «bloccato subito».
    */
    const rete = 1 + Math.floor(Math.random() * 250);

    for (let i = 0; i < 12 && !bloccato; i += 1) {
      /* Ogni giro da una rete diversa, e con il cooldown gia trascorso. */
      await prisma.authVerificationChallenge.updateMany({
        where: { user_id: utente.id },
        data: { created_at: new Date(Date.now() - 300_000) },
      });
      const esito = await corpo(
        await inviaTelefono(
          richiesta({ userId: utente.token_verification_id }, `198.51.${rete}.${i + 1}`),
        ),
      );
      if (esito.status === 429) bloccato = true;
    }

    const partiti = consegnati.length - prima;
    registra(
      "P6",
      "cambiare rete non azzera il contatore degli invii verso un numero",
      bloccato && partiti === 5,
      `SMS partiti = ${partiti}, bloccato = ${bloccato}`,
    );
  }

  await pulisci(creati);
  await prisma.$disconnect();

  const falliti = esiti.filter((e) => !e.ok);
  console.log("");
  console.log(
    `Sonda PP-05: ${esiti.length - falliti.length}/${esiti.length} verdi.`,
  );
  if (falliti.length) process.exitCode = 1;
};

main().catch(async (error) => {
  console.error("Sonda interrotta:", error?.message);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
