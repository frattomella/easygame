/**
 * **Le prove dei difetti chiusi dalla revisione ostile PP-05A.**
 *
 *     EASYGAME_DB_ENV=development \
 *       node --experimental-strip-types \
 *       --import ./tests/helpers/register-hooks.mjs scripts/pp-05-sicurezza-probe.mjs
 *
 * Ogni prova qui dentro **falliva prima del fix corrispondente** ed e stata
 * verificata anche per mutazione: rimossa la guardia, la riga torna rossa. Le
 * proprieta misurate dipendono da PostgreSQL vero — vincoli di unicita,
 * transazioni, contatori che vivono in tabella — e nessun doppio in memoria le
 * rappresenta.
 *
 * - **S1** — l'adozione OAuth di un account occupato azzera anche il
 *   **numero**, non solo la password (CRITICAL-1);
 * - **S2** — il reset password su un account mai verificato fa lo stesso, e
 *   verifica l'indirizzo (CRITICAL-1);
 * - **S3** — un codice chiesto da `/verify/<canale>/send` **non apre una
 *   sessione** (CRITICAL-1, seconda difesa);
 * - **S4** — `SMS_PROVIDER=noop` non fa bloccare l'accesso, e un nome
 *   sconosciuto non spegne la verifica in silenzio (HIGH-2);
 * - **S5** — la registrazione consuma il contatore **per numero** (HIGH-3);
 * - **S6** — `PATCH /auth/user` ha un tetto ai tentativi di password (MEDIUM-7);
 * - **S7** — le risposte senza sessione non portano il numero in chiaro (MEDIUM-5);
 * - **S8** — sei richieste di reset simultanee non producono violazioni
 *   `P2002` non gestite (LOW-9);
 * - **S9** — senza sessione l'UUID nudo di un account non pilota le rotte di
 *   verifica, e non si distingue da uno inventato (MEDIUM-1);
 * - **S10** — un indirizzo dell'elenco degli amministratori, mai verificato, non
 *   si concede la piattaforma scrivendosi `emailVerified` addosso (CRITICAL del
 *   terzo round).
 *
 * **La sonda misura, non corregge.** Scrive righe proprie con identificativi
 * casuali e le cancella alla fine.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

process.env.AUTH_ALLOW_TEST_CODES = "true";
process.env.SMS_PROVIDER = "noop";

const prisma = new PrismaClient({ log: [] });
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const segna = (nome, ok, dettaglio) => {
  esiti.push({ nome, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${nome} :: ${dettaglio}`);
};

const marchio = randomBytes(4).toString("hex");

/**
 * Una rete diversa a ogni esecuzione.
 *
 * I secchielli per indirizzo IP vivono in tabella e sopravvivono alla sonda:
 * con indirizzi fissi, dalla seconda esecuzione in poi la registrazione veniva
 * fermata da `registerIp` **prima** di arrivare al telefono, e S5 misurava il
 * contatore delle registrazioni invece di quello per numero.
 */
const reteDellaSonda = `198.18.${parseInt(marchio.slice(0, 2), 16)}`;
const creati = new Set();

/** Numeri diversi a ogni esecuzione: i contatori per numero vivono in tabella. */
let contatoreNumeri = 0;
const numeroNuovo = () => {
  contatoreNumeri += 1;
  const coda = String(
    (parseInt(marchio, 16) + contatoreNumeri * 7919) % 10_000_000,
  ).padStart(7, "0");
  return `+39340${coda}`;
};

const creaUtente = async (dati = {}) => {
  const { hashPassword } = await carica("src/lib/server/auth.ts");
  const utente = await prisma.user.create({
    data: {
      email: `pp05-${marchio}-${randomUUID().slice(0, 8)}@example.invalid`,
      password_hash: await hashPassword("PasswordDiProva!2026"),
      role: "user",
      token_verification_id: `verify_${randomBytes(16).toString("hex")}`,
      ...dati,
    },
  });
  creati.add(utente.id);
  return utente;
};

const pulisci = async () => {
  const ids = [...creati];
  if (!ids.length) return;
  await prisma.session.deleteMany({ where: { user_id: { in: ids } } });
  await prisma.authVerificationChallenge.deleteMany({
    where: { user_id: { in: ids } },
  });
  await prisma.externalAccount.deleteMany({ where: { user_id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actor_user_id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
};

const main = async () => {
  const flussi = await carica("src/lib/server/auth-workflows.ts");
  const { __setSmsProviderForTests } = await carica(
    "src/lib/server/sms/sms-service.ts",
  );

  /* Il trasporto e un doppio che **legge** il codice, come farebbe l'occupante. */
  const smsRicevuti = [];
  __setSmsProviderForTests({
    id: "sonda",
    async send(message) {
      smsRicevuti.push(message);
    },
  });

  const codiceDaSms = () => {
    const ultimo = smsRicevuti[smsRicevuti.length - 1];
    return ultimo ? (ultimo.text.match(/\b(\d{6})\b/) || [])[1] : null;
  };

  /* ---------------- S1: adozione OAuth ---------------- */
  {
    const numero = numeroNuovo();
    const occupato = await creaUtente({
      phone: numero,
      phone_verified_at: new Date(),
      phone_verification_required: true,
      email_verified_at: null,
    });

    await flussi.findOrCreateOAuthUser({
      email: occupato.email,
      firstName: "Vittima",
      lastName: "Vera",
      avatarUrl: null,
      providerId: "google",
      providerAccountId: `sonda-${marchio}-${randomUUID().slice(0, 8)}`,
      /* L'accesso esterno certifica l'indirizzo: e la premessa dell'adozione. */
      emailVerified: true,
    });

    const dopo = await prisma.user.findUnique({ where: { id: occupato.id } });
    const ok =
      dopo.phone === null &&
      dopo.phone_verified_at === null &&
      dopo.token_verification_id !== occupato.token_verification_id &&
      dopo.password_hash !== occupato.password_hash &&
      Boolean(dopo.email_verified_at);
    segna(
      "S1 — l'adozione OAuth sfratta anche il numero, non solo la password",
      ok,
      `phone=${dopo.phone} · riferimento ruotato=${dopo.token_verification_id !== occupato.token_verification_id}`,
    );

    /*
      E la vittima non resta chiusa fuori: senza numero,
      `isPhoneVerificationBlocking` non blocca, quindi la sessione nasce.
    */
    const bloccata = flussi.isPhoneVerificationBlocking(dopo);
    segna(
      "S1b — dopo lo sfratto la vittima non e bloccata dal telefono altrui",
      bloccata === false,
      `blocca=${bloccata}`,
    );
  }

  /* ---------------- S2: reset password ---------------- */
  {
    const numero = numeroNuovo();
    const occupato = await creaUtente({
      phone: numero,
      phone_verified_at: new Date(),
      phone_verification_required: true,
      email_verified_at: null,
    });

    const token = randomBytes(32).toString("hex");
    await prisma.authVerificationChallenge.create({
      data: {
        user_id: occupato.id,
        channel: "email",
        purpose: "reset_password",
        target: occupato.email,
        code_hash: flussi.hashOtpCode(token, {
          userId: occupato.id,
          channel: "email",
          purpose: "reset_password",
          target: occupato.email,
        }),
        expires_at: new Date(Date.now() + 30 * 60_000),
      },
    });

    await flussi.confirmPasswordReset({
      userId: occupato.id,
      token,
      password: "NuovaPasswordVera!2026",
    });

    const dopo = await prisma.user.findUnique({ where: { id: occupato.id } });
    const ok =
      dopo.phone === null &&
      dopo.phone_verified_at === null &&
      Boolean(dopo.email_verified_at) &&
      dopo.token_verification_id !== occupato.token_verification_id;
    segna(
      "S2 — il reset su un account mai verificato sfratta il numero e verifica l'indirizzo",
      ok,
      `phone=${dopo.phone} · email_verified=${Boolean(dopo.email_verified_at)}`,
    );
  }

  /* ---------------- S3: uno scopo non apre una sessione ---------------- */
  {
    const numero = numeroNuovo();
    const utente = await creaUtente({
      phone: numero,
      phone_verification_required: true,
      email_verified_at: new Date(),
    });

    smsRicevuti.length = 0;
    await flussi.sendPhoneVerificationChallenge(utente, "verify_phone");
    const codice = codiceDaSms();

    const { purpose } = await flussi.confirmPhoneVerification(
      utente.token_verification_id,
      codice,
    );
    const apre = flussi.challengePurposeCanMintSession(purpose);
    const verificato = await prisma.user.findUnique({
      where: { id: utente.id },
    });

    segna(
      "S3 — un codice chiesto da /verify/<canale>/send verifica il numero ma non apre una sessione",
      purpose === "verify_phone" &&
        apre === false &&
        Boolean(verificato.phone_verified_at),
      `scopo=${purpose} · apre=${apre} · numero verificato=${Boolean(verificato.phone_verified_at)}`,
    );

    /* Controspecchio: uno scopo di registrazione apre. */
    segna(
      "S3b — controspecchio: `signup` e `login` aprono una sessione",
      flussi.challengePurposeCanMintSession("signup") &&
        flussi.challengePurposeCanMintSession("login"),
      "signup=true · login=true",
    );
  }

  /* ---------------- S4: il trasporto che non consegna ---------------- */
  {
    const policy = await carica("src/lib/auth/provider-policy.ts");
    const soloNoop = { NODE_ENV: "production", SMS_PROVIDER: "noop" };
    const sconosciuto = { NODE_ENV: "production", SMS_PROVIDER: "smshosting" };

    segna(
      "S4 — `noop` non fa bloccare l'accesso, e un nome sconosciuto non spegne niente in silenzio",
      policy.isSmsTransportConfigured(soloNoop) === false &&
        policy.isPhoneVerificationRequired(soloNoop) === false &&
        policy.isSmsTransportConfigured(sconosciuto) === false,
      "noop: consegna=false, blocca=false · nome ignoto: consegna=false",
    );
  }

  /* ---------------- S5: il contatore per numero, dalla registrazione ---------------- */
  {
    const { POST } = await carica("src/app/api/v1/auth/register/route.ts");
    const numeroVittima = numeroNuovo();
    const chiave = flussi.buildOtpTargetCounterKey(numeroVittima);


    smsRicevuti.length = 0;
    const emailUsate = [];
    const stati = [];
    for (let i = 0; i < 8; i += 1) {
      const email = `pp05-${marchio}-flood${i}@example.invalid`;
      emailUsate.push(email);
      const risposta = await POST(
        new Request("http://localhost/api/v1/auth/register", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            /*
              Un indirizzo diverso a ogni giro: l'asse per rete non deve
              bastare. Il valore varia **in coda** perche `getRequestIp` legge
              la catena a partire dal fondo, contando i proxy fidati: mettere
              la parte variabile in testa avrebbe fatto ricadere tutti gli otto
              giri nello stesso secchiello, e la prova avrebbe misurato il
              contatore delle registrazioni invece di quello per numero.
            */
            "x-forwarded-for": `10.0.0.1, ${reteDellaSonda}.${10 + i}`,
          },
          body: JSON.stringify({
            email,
            password: "PasswordDiProva!2026",
            options: {
              data: { firstName: "Prova", lastName: "Sonda", phone: numeroVittima },
            },
          }),
        }),
      );
      stati.push(risposta.status);
    }

    for (const email of emailUsate) {
      const riga = await prisma.user.findUnique({ where: { email } });
      if (riga) creati.add(riga.id);
    }

    const secchiello = await prisma.authRateLimitBucket.findFirst({
      where: { scope: "otp_send" },
    });

    segna(
      "S5 — otto registrazioni verso lo stesso numero da otto reti diverse non producono otto SMS",
      /*
        Uguale a cinque, non «al piu cinque»: con `<=` la prova sarebbe passata
        anche a zero SMS, cioe anche quando la registrazione veniva fermata
        prima di arrivare al telefono — ed e esattamente il modo in cui, in una
        prima stesura, questa riga era verde per la ragione sbagliata.
      */
      stati.every((stato) => stato === 202) &&
        smsRicevuti.length === 5 &&
        Boolean(secchiello),
      `registrazioni accettate = ${stati.filter((s) => s === 202).length}/8 · SMS partiti = ${smsRicevuti.length} (tetto 5) · secchiello otp_send aperto = ${Boolean(secchiello)} · chiave=${chiave.slice(0, 8)}…`,
    );
  }

  /* ---------------- S6: tetto sui tentativi di password attuale ---------------- */
  {
    const { PATCH } = await carica("src/app/api/v1/auth/user/route.ts");
    const { createSessionForUser } = await carica("src/lib/server/auth.ts");

    const utente = await creaUtente({ email_verified_at: new Date() });
    const sessione = await createSessionForUser(utente);

    let primoBlocco = null;
    for (let i = 1; i <= 20 && primoBlocco === null; i += 1) {
      const risposta = await PATCH(
        new Request("http://localhost/api/v1/auth/user", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${sessione.access_token}`,
            "x-forwarded-for": `10.0.0.1, ${reteDellaSonda}.200`,
          },
          body: JSON.stringify({
            currentPassword: `sbagliata-${i}`,
            email: `cambiata-${i}-${marchio}@example.invalid`,
          }),
        }),
      );
      if (risposta.status === 429) primoBlocco = i;
    }

    const tracce = await prisma.auditLog.count({
      where: { actor_user_id: utente.id, outcome: "failure" },
    });

    segna(
      "S6 — indovinare la password attuale ha un tetto, e lascia una traccia",
      primoBlocco !== null && primoBlocco <= 11 && tracce > 0,
      `primo 429 al tentativo ${primoBlocco} · righe di audit = ${tracce}`,
    );
  }

  /* ---------------- S7: nessun numero in chiaro senza sessione ---------------- */
  {
    const { serializeAuthUserWithoutSession, serializeAuthUser } = await carica(
      "src/lib/server/auth.ts",
    );
    const numero = numeroNuovo();
    const utente = await creaUtente({
      phone: numero,
      phone_verification_required: true,
    });

    const senzaSessione = JSON.stringify(
      serializeAuthUserWithoutSession(utente),
    );
    const conSessione = JSON.stringify(serializeAuthUser(utente));

    segna(
      "S7 — la risposta senza sessione non porta il numero in chiaro; quella con sessione si",
      !senzaSessione.includes(numero) && conSessione.includes(numero),
      `senza sessione contiene il numero = ${senzaSessione.includes(numero)}`,
    );
  }

  /* ---------------- S8: sei reset simultanei ---------------- */
  {
    const utente = await creaUtente({ email_verified_at: new Date() });
    const esitiReset = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        flussi.sendPasswordResetChallenge({
          id: utente.id,
          email: utente.email,
          first_name: "Prova",
        }),
      ),
    );

    const respinti = esitiReset.filter((e) => e.status === "rejected");
    const vive = await prisma.authVerificationChallenge.count({
      where: {
        user_id: utente.id,
        purpose: "reset_password",
        consumed_at: null,
      },
    });

    segna(
      "S8 — sei richieste di reset simultanee: nessuna eccezione risale, una sola resta viva",
      respinti.length === 0 && vive === 1,
      `eccezioni = ${respinti.length} · token vivi = ${vive}`,
    );
  }

  /* ---------------- S9: l'UUID nudo non pilota le rotte di verifica ------- */
  {
    /*
      **M-1 del secondo round.** `verification.userId` usciva come UUID
      dell'account, e `findUserByVerificationReference` accettava sia il
      riferimento sia l'UUID. Due conseguenze misurate qui:

      1. la rotazione del riferimento fatta dallo sfratto (S1) era **teatro**:
         l'occupante non aveva bisogno del riferimento nuovo, perche l'UUID non
         cambia mai e lo aveva gia;
      2. gli UUID utente circolano in molte proiezioni club-scoped, quindi chi
         ne aveva raccolti poteva pilotare `/verify/<canale>/send` su account
         altrui — e distinguere un identificativo vero da uno inventato dal
         modo in cui rispondevano.
    */
    const inviaTelefono = (
      await carica("src/app/api/v1/auth/verify/phone/send/route.ts")
    ).POST;

    const numero = numeroNuovo();
    const utente = await creaUtente({
      phone: numero,
      phone_verification_required: true,
    });

    const richiesta = (corpo, ip, gettone) =>
      new Request("http://easygame.local/api", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": ip,
          ...(gettone ? { cookie: `easygame_session=${gettone}` } : {}),
        },
        body: JSON.stringify(corpo),
      });
    const leggi = async (r) => ({ status: r.status, body: await r.json() });

    const prima = smsRicevuti.length;
    const conUuid = await leggi(
      await inviaTelefono(
        richiesta({ userId: utente.id }, `${reteDellaSonda}.201`),
      ),
    );
    const inventato = await leggi(
      await inviaTelefono(
        richiesta({ userId: randomUUID() }, `${reteDellaSonda}.202`),
      ),
    );
    const senzaSessione = smsRicevuti.length - prima;

    /* Controspecchio: con il riferimento l'SMS parte davvero. */
    const conRiferimento = await leggi(
      await inviaTelefono(
        richiesta(
          { userId: utente.token_verification_id },
          `${reteDellaSonda}.203`,
        ),
      ),
    );
    const conIlRiferimento = smsRicevuti.length - prima - senzaSessione;

    /* E con una sessione vera sull'account, l'UUID torna a valere. */
    const { createSessionForUser } = await carica("src/lib/server/auth.ts");
    const sessione = await createSessionForUser(utente);
    await prisma.authVerificationChallenge.updateMany({
      where: { user_id: utente.id },
      data: { created_at: new Date(Date.now() - 300_000) },
    });
    const conSessione = await leggi(
      await inviaTelefono(
        richiesta(
          { userId: utente.id },
          `${reteDellaSonda}.204`,
          sessione.access_token,
        ),
      ),
    );
    const conLaSessione =
      smsRicevuti.length - prima - senzaSessione - conIlRiferimento;

    segna(
      "S9 — senza sessione l'UUID nudo non pilota la verifica, e non si distingue da uno inventato",
      senzaSessione === 0 &&
        conUuid.status === inventato.status &&
        JSON.stringify(conUuid.body) === JSON.stringify(inventato.body) &&
        conRiferimento.status === 200 &&
        conIlRiferimento === 1 &&
        conSessione.status === 200 &&
        conLaSessione === 1,
      `SMS con UUID nudo = ${senzaSessione} · risposte indistinguibili = ${
        JSON.stringify(conUuid.body) === JSON.stringify(inventato.body)
      } · con riferimento = ${conIlRiferimento} · con sessione = ${conLaSessione}`,
    );
  }


  /* ---------------- S10: la piattaforma non si concede da se ------------- */
  {
    /*
      **CRITICAL del terzo round.** Il fix di H-1 pretendeva un indirizzo
      provato, e accettava come prova **due** sorgenti in `OR`: la colonna
      `email_verified_at` e la chiave `user_metadata.emailVerified`. La seconda
      e una colonna JSON **libera, scritta dal suo stesso soggetto**, e la
      blocklist di `PATCH /auth/user` non la conosceva: tre nomi proibiti, e
      nel frattempo il lettore ne aveva imparato un quarto.

      La catena: l'elenco degli amministratori vive in una variabile
      `NEXT_PUBLIC_*`, cioe e pubblicato a ogni browser. Si occupa un indirizzo
      di quell'elenco non ancora registrato — la casella non serve, perche
      l'indirizzo non si verifica — e si manda
      `PATCH /auth/user {"data":{"emailVerified":true}}`. Non cambia nessun
      fattore, quindi non passa nemmeno dal cancello della password attuale.
      Alla richiesta successiva: dati di pagamento di ogni societa, piani,
      profilo fiscale, conti Stripe, e le due pagine `private/`.
    */
    const aggiorna = (await carica("src/app/api/v1/auth/user/route.ts")).PATCH;
    const { createSessionForUser } = await carica("src/lib/server/auth.ts");
    const { isPlatformAdminUser } = await carica("src/lib/platform-admin.ts");

    const indirizzoDellElenco = `capo-${marchio}@easygame.invalid`;
    const elencoPrecedente = process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
    const elencoPubblicoPrecedente =
      process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS;
    process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = indirizzoDellElenco;
    process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS = indirizzoDellElenco;

    try {
      const occupante = await creaUtente({
        email: indirizzoDellElenco,
        /* Mai verificato: l'attaccante non possiede quella casella. */
        email_verified_at: null,
      });
      const sessione = await createSessionForUser(occupante);

      const prima = isPlatformAdminUser(
        await prisma.user.findUnique({ where: { id: occupante.id } }),
      );

      const esito = await aggiorna(
        new Request("http://easygame.local/api/v1/auth/user", {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            cookie: `easygame_session=${sessione.access_token}`,
          },
          body: JSON.stringify({ data: { emailVerified: true } }),
        }),
      );

      const dopoLaRiga = await prisma.user.findUnique({
        where: { id: occupante.id },
      });
      const dopo = isPlatformAdminUser(dopoLaRiga);
      const persistito = Boolean(dopoLaRiga?.user_metadata?.emailVerified);

      /*
        **Il controspecchio, senza il quale la riga non misura niente.** Con la
        colonna valorizzata — cioe con un indirizzo davvero provato — la stessa
        funzione deve rispondere `true`: altrimenti si starebbe misurando una
        funzione che nega sempre, e un amministratore vero resterebbe fuori.
      */
      const provato = isPlatformAdminUser({
        ...dopoLaRiga,
        email_verified_at: new Date(),
      });
      /*
        E la **proiezione** verso il client continua a valere, perche li
        `emailVerified` lo scrive `buildUserMetadata` dalla colonna, non il suo
        soggetto: `/auth/complete` e le due pagine `private/` chiamano con
        questa forma, che la colonna non ce l'ha.
      */
      const serializzato = isPlatformAdminUser({
        email: indirizzoDellElenco,
        user_metadata: { emailVerified: true },
      });

      segna(
        "S10 — un indirizzo mai verificato non si concede la piattaforma scrivendosi un campo addosso",
        prima === false &&
          dopo === false &&
          persistito === false &&
          provato === true &&
          serializzato === true,
        `stato PATCH = ${esito.status} · flag persistito = ${persistito} · admin prima = ${prima}, dopo = ${dopo} · controspecchi: con la colonna = ${provato}, forma serializzata = ${serializzato}`,
      );
    } finally {
      if (elencoPrecedente === undefined) {
        delete process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
      } else {
        process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = elencoPrecedente;
      }
      if (elencoPubblicoPrecedente === undefined) {
        delete process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS;
      } else {
        process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS =
          elencoPubblicoPrecedente;
      }
    }
  }


  /* --- S11: un token nasce per un recapito, e vale solo per quello --- */
  {
    /*
      **CRITICAL del quarto round.** `confirmPasswordReset` cercava la
      challenge per utente, canale, scopo e vita della riga — e **non** per
      destinatario, mentre le rotte OTP il destinatario lo filtravano da
      sempre. La differenza fra le due era invisibile finche l'indirizzo di un
      account non poteva cambiare sotto un token vivo; da PP-05 puo.

      La catena, misurata: ci si registra con un indirizzo proprio, si chiede
      il reset **sul proprio** indirizzo, si cambia l'indirizzo in uno
      dell'elenco `NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS` — che e
      pubblicato a ogni browser — e si consuma il token. Il consumo scriveva
      `email_verified_at` sulla teoria «chi apre il link controlla la casella»,
      che dopo il cambio non e piu vera: l'indirizzo dell'amministratore
      risultava provato senza che nessuna email lo avesse mai raggiunto.

      Due difese indipendenti, e la verifica per mutazione ha misurato che
      **ciascuna da sola** chiude la catena: il destinatario entra nel `where`,
      e entra nel legame crittografico dell'impronta.
    */
    const indirizzoDellElenco = `capo2-${marchio}@easygame.invalid`;
    const elencoPrecedente = process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
    const elencoPubblicoPrecedente =
      process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS;
    process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = indirizzoDellElenco;
    process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS = indirizzoDellElenco;

    try {
      const { isPlatformAdminUser } = await carica("src/lib/platform-admin.ts");

      const attaccante = await creaUtente({ email_verified_at: null });

      /* Il token nasce per l'indirizzo dell'attaccante. */
      const token = randomBytes(32).toString("hex");
      await prisma.authVerificationChallenge.create({
        data: {
          user_id: attaccante.id,
          channel: "email",
          purpose: "reset_password",
          target: attaccante.email,
          code_hash: flussi.hashOtpCode(token, {
            userId: attaccante.id,
            channel: "email",
            purpose: "reset_password",
            target: attaccante.email,
          }),
          expires_at: new Date(Date.now() + 30 * 60_000),
        },
      });

      /* L'account passa all'indirizzo dell'elenco, mai verificato. */
      await prisma.user.update({
        where: { id: attaccante.id },
        data: { email: indirizzoDellElenco, email_verified_at: null },
      });

      let consumato = false;
      try {
        await flussi.confirmPasswordReset({
          userId: attaccante.id,
          token,
          password: "NuovaPasswordVera!2026",
        });
        consumato = true;
      } catch {
        consumato = false;
      }

      const dopo = await prisma.user.findUnique({
        where: { id: attaccante.id },
      });
      const admin = isPlatformAdminUser(dopo);

      /*
        Il controspecchio: **senza** il cambio di indirizzo lo stesso token
        deve funzionare, o questa prova misurerebbe solo che il reset e rotto.
      */
      const onesto = await creaUtente({ email_verified_at: null });
      const tokenOnesto = randomBytes(32).toString("hex");
      await prisma.authVerificationChallenge.create({
        data: {
          user_id: onesto.id,
          channel: "email",
          purpose: "reset_password",
          target: onesto.email,
          code_hash: flussi.hashOtpCode(tokenOnesto, {
            userId: onesto.id,
            channel: "email",
            purpose: "reset_password",
            target: onesto.email,
          }),
          expires_at: new Date(Date.now() + 30 * 60_000),
        },
      });
      let resetOnesto = false;
      try {
        await flussi.confirmPasswordReset({
          userId: onesto.id,
          token: tokenOnesto,
          password: "NuovaPasswordVera!2026",
        });
        resetOnesto = true;
      } catch {
        resetOnesto = false;
      }

      segna(
        "S11 — un token di reset nato per un indirizzo non verifica l'indirizzo successivo",
        consumato === false &&
          dopo.email_verified_at === null &&
          admin === false &&
          resetOnesto === true,
        `token consumato = ${consumato} · indirizzo provato = ${
          dopo.email_verified_at !== null
        } · admin = ${admin} · controspecchio (nessun cambio) = ${resetOnesto}`,
      );
    } finally {
      if (elencoPrecedente === undefined) {
        delete process.env.EASYGAME_PLATFORM_ADMIN_EMAILS;
      } else {
        process.env.EASYGAME_PLATFORM_ADMIN_EMAILS = elencoPrecedente;
      }
      if (elencoPubblicoPrecedente === undefined) {
        delete process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS;
      } else {
        process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS =
          elencoPubblicoPrecedente;
      }
    }
  }

  /* --- S12: lo sfratto spegne anche cio che l'occupante ha gia in mano --- */
  {
    /*
      **CRITICAL del quarto round, secondo.** `sfrattaOccupante` toglieva tutto
      cio che esisteva **come riga sull'account** — password, numero, sessioni,
      legami esterni — e non cio che l'occupante **teneva gia in mano**. Un
      token di reset vive trenta minuti e lo si chiede prima dello sfratto: si
      occupa un indirizzo libero, ci si chiede un reset, si aspetta che la
      vittima arrivi davvero dal proprio Google, e si consuma il token dopo.

      Una challenge viva **e** un canale di accesso, e ADR-0117 dice che
      sfrattare significa chiuderli tutti: l'elenco dei canali si allunga di
      uno ogni volta che qualcuno guarda.
    */
    const occupante = await creaUtente({ email_verified_at: null });

    const token = randomBytes(32).toString("hex");
    await prisma.authVerificationChallenge.create({
      data: {
        user_id: occupante.id,
        channel: "email",
        purpose: "reset_password",
        target: occupante.email,
        code_hash: flussi.hashOtpCode(token, {
          userId: occupante.id,
          channel: "email",
          purpose: "reset_password",
          target: occupante.email,
        }),
        expires_at: new Date(Date.now() + 30 * 60_000),
      },
    });

    /* La vittima arriva davvero da Google, sullo stesso indirizzo. */
    await flussi.findOrCreateOAuthUser({
      providerId: "google",
      providerAccountId: `sonda-${marchio}-${randomUUID().slice(0, 8)}`,
      email: occupante.email,
      emailVerified: true,
    });

    const viveDopoLoSfratto = await prisma.authVerificationChallenge.count({
      where: { user_id: occupante.id, consumed_at: null },
    });

    let riuscito = false;
    try {
      await flussi.confirmPasswordReset({
        userId: occupante.id,
        token,
        password: "PasswordDellAttaccante!2026",
      });
      riuscito = true;
    } catch {
      riuscito = false;
    }

    segna(
      "S12 — lo sfratto spegne le challenge vive: un token chiesto prima non vale dopo",
      viveDopoLoSfratto === 0 && riuscito === false,
      `challenge vive dopo lo sfratto = ${viveDopoLoSfratto} · reset riuscito = ${riuscito}`,
    );
  }

  __setSmsProviderForTests(undefined);
};

main()
  .catch((error) => {
    console.error("Sonda interrotta:", error?.stack || error?.message || error);
    esiti.push({ nome: "esecuzione", ok: false });
  })
  .finally(async () => {
    await pulisci().catch((error) =>
      console.error("Pulizia incompleta:", error?.message || error),
    );
    await prisma.$disconnect();
    const verdi = esiti.filter((e) => e.ok).length;
    console.log(`\nSonda sicurezza PP-05: ${verdi}/${esiti.length} verdi.`);
    process.exit(verdi === esiti.length ? 0 : 1);
  });
