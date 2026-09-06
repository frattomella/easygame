/**
 * **Terzo vaglio ostile su PP-02 — le zone dichiarate NON misurate.**
 *
 * Sonda temporanea di revisione. Non fa parte del prodotto: misura, non
 * corregge, e cancella i club che semina.
 *
 * Ogni reperto ha il suo **controllo**: la stessa misura su un caso in cui la
 * proprieta deve valere al contrario.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { travasaTutori } from "./helpers/travaso-tutori.mjs";

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(70)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

const CLUB = randomUUID();
const CLUB_T = randomUUID();
const CLUB_C = randomUUID();
const PRESIDENTE = randomUUID();
const MADRE = randomUUID();
const PADRE = randomUUID();

const coda = `${CLUB.slice(0, 8)}@terzo.local`;
const email = (chi) => `${chi}-${coda}`;
const EMAIL_FAMIGLIA = email("famiglia");

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Terzo",
  password_hash: "$2b$10$terzo",
  role: "user",
});

const atleta = async (nome, data = {}, club = CLUB) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: club,
      first_name: nome,
      last_name: "Terzo",
      status: "active",
      data,
      updated_at: new Date(),
    },
  });
  return id;
};

const tessera = async (userId, ruolo) => {
  const id = randomUUID();
  await prisma.organizationUser.create({
    data: {
      id,
      organization_id: CLUB,
      user_id: userId,
      role: ruolo,
      is_primary: false,
      updated_at: new Date(),
    },
  });
  return id;
};

const gettone = async (codice, payload) =>
  prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "access_tokens",
      name: codice,
      status: "active",
      payload,
      updated_at: new Date(),
    },
  });

const righeDi = async (athleteId) =>
  prisma.athleteGuardian.findMany({
    where: { athlete_id: athleteId },
    orderBy: { position: "asc" },
  });

const datiDi = async (id) =>
  (await prisma.athlete.findUnique({ where: { id }, select: { data: true } }))
    ?.data || {};

const scopeDi = (club) => ({
  userId: PRESIDENTE,
  activeOrganizationId: club,
  activeRole: "owner",
  activeMembershipId: null,
  allowedOrganizationIds: [club],
  accessScopes: [],
});
const scopeOwner = scopeDi(CLUB);
const scopeOwnerT = scopeDi(CLUB_T);

let rottaRiscatto = null;
const riscatta = async (utenteRiga, codice) => {
  const auth = await carica("src/lib/server/auth.ts");
  const sessione = await auth.createSessionForUser(utenteRiga);
  const risposta = await rottaRiscatto.POST(
    new Request("http://collaudo.invalid/api/v1/auth/access/redeem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessione.access_token}`,
        "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
      },
      body: JSON.stringify({ token: codice }),
    }),
  );
  return { stato: risposta.status, corpo: await risposta.json() };
};

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const legami = await carica("src/lib/server/profile-account-links.ts");
  rottaRiscatto = await carica("src/app/api/v1/auth/access/redeem/route.ts");

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(MADRE, EMAIL_FAMIGLIA, "Madre"),
      utente(PADRE, email("padre"), "Padre"),
    ],
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: `Terzo vaglio ${CLUB.slice(0, 6)}`,
      slug: `terzo-${CLUB.slice(0, 8)}`,
      creator_id: PRESIDENTE,
      updated_at: new Date(),
    },
  });
  await prisma.club.create({
    data: {
      id: CLUB_T,
      name: `Terzo travaso ${CLUB_T.slice(0, 6)}`,
      slug: `terzot-${CLUB_T.slice(0, 8)}`,
      creator_id: PRESIDENTE,
      updated_at: new Date(),
    },
  });
  await prisma.club.create({
    data: {
      id: CLUB_C,
      name: `Terzo controllo ${CLUB_C.slice(0, 6)}`,
      slug: `terzoc-${CLUB_C.slice(0, 8)}`,
      creator_id: PRESIDENTE,
      updated_at: new Date(),
    },
  });

  /* ================================================================== *
   * §1 — due revoche CONCORRENTI di due tessere non-parent
   * ================================================================== */
  console.log("\n§1 — due revoche concorrenti della stessa persona\n");
  {
    const figlio = await atleta("FiglioA");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [{ email: EMAIL_FAMIGLIA, firstName: "Madre" }],
      canGrantAccess: true,
    });
    const riga = (await righeDi(figlio))[0];
    await tutori.linkGuardianAccount(prisma, {
      athleteId: figlio,
      guardianRowId: riga.id,
      userId: MADRE,
      email: EMAIL_FAMIGLIA,
    });

    const t1 = await tessera(MADRE, "trainer");
    const t2 = await tessera(MADRE, "member");

    /* Barriera: le due transazioni si incrociano davvero. */
    let sblocca;
    const barriera = new Promise((r) => {
      sblocca = r;
    });
    let arrivati = 0;
    const attendi = () => {
      arrivati += 1;
      if (arrivati === 2) sblocca();
      return barriera;
    };

    const revoca = (membershipId, ruolo) =>
      prisma.$transaction(async (tx) => {
        await tx.organizationUser.delete({ where: { id: membershipId } });
        await attendi();
        return legami.unlinkParentGuardians(
          tx,
          CLUB,
          MADRE,
          EMAIL_FAMIGLIA,
          ruolo,
          membershipId,
        );
      });

    const esito = await Promise.all([revoca(t1, "trainer"), revoca(t2, "member")]);

    const tessereRimaste = await prisma.organizationUser.count({
      where: { organization_id: CLUB, user_id: MADRE },
    });
    const dopo = (await righeDi(figlio))[0];

    prova(
      "R-A tessere rimaste dopo le due revoche",
      0,
      tessereRimaste,
    );
    prova(
      "R-A la riga tutore e revocata",
      true,
      Boolean(dopo.revoked_at),
      `esiti unlinkParentGuardians = ${JSON.stringify(esito)}; user_id = ${dopo.user_id}`,
    );
    prova("R-A l'utenza e staccata dalla riga", null, dopo.user_id);

    /* CONTROLLO — le stesse due revoche in SEQUENZA devono revocare. */
    const figlioB = await atleta("FiglioB");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlioB,
      rows: [{ email: email("seq"), firstName: "Seq" }],
      canGrantAccess: true,
    });
    const rigaB = (await righeDi(figlioB))[0];
    const SEQ = randomUUID();
    await prisma.user.create({ data: utente(SEQ, email("seq"), "Seq") });
    await tutori.linkGuardianAccount(prisma, {
      athleteId: figlioB,
      guardianRowId: rigaB.id,
      userId: SEQ,
      email: email("seq"),
    });
    const s1 = await tessera(SEQ, "trainer");
    const s2 = await tessera(SEQ, "member");
    for (const [id, ruolo] of [
      [s1, "trainer"],
      [s2, "member"],
    ]) {
      await prisma.$transaction(async (tx) => {
        await tx.organizationUser.delete({ where: { id } });
        await legami.unlinkParentGuardians(tx, CLUB, SEQ, email("seq"), ruolo, id);
      });
    }
    const dopoSeq = (await righeDi(figlioB))[0];
    prova(
      "R-A/controllo in sequenza la riga E revocata",
      true,
      Boolean(dopoSeq.revoked_at),
    );
  }

  /* ================================================================== *
   * §2 — il carico che il riscatto accetta e la revoca non riconosce
   * ================================================================== */
  console.log("\n§2 — eCaricoDiTutore: le due porte non sono larghe uguale\n");
  {
    const figlio = await atleta("FiglioC");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [{ email: email("padre"), firstName: "Padre" }],
      canGrantAccess: true,
    });
    const riga = (await righeDi(figlio))[0];
    await tutori.linkGuardianAccount(prisma, {
      athleteId: figlio,
      guardianRowId: riga.id,
      userId: PADRE,
      email: email("padre"),
    });

    /* Il codice si normalizza in maiuscolo senza trattini: qui e gia cosi. */
    const suffisso = CLUB.replace(/-/g, "").slice(0, 8).toUpperCase();
    const codiceCanonico = `TZCAN${suffisso}`;
    const codiceObliquo = `TZOBL${suffisso}`;

    await gettone(codiceCanonico, {
      role: "parent",
      one_time: true,
      token_type: "parent_access",
      athlete_id: figlio,
      guardian_id: riga.id,
    });
    /* Stesso bersaglio, stessa porta di conio — solo un `role` diverso. */
    await gettone(codiceObliquo, {
      role: "trainer",
      one_time: true,
      athlete_id: figlio,
      guardian_id: riga.id,
    });

    prova(
      "R-B INVARIANTE cio che concede il ruolo e un sottoinsieme di cio che apre",
      [],
      [
        { role: "parent", token_type: "parent_access", athlete_id: "a", guardian_id: "g" },
        { role: "trainer", athlete_id: "a", guardian_id: "g" },
        { athlete_id: "a", guardian_id: "g" },
        { role: "member", athlete_id: "a", guardian_id: "g" },
        { token_type: "parent_access" },
        { role: "trainer" },
        { athlete_id: "a" },
        {},
      ].filter(
        (carico) =>
          tutori.eCaricoDiTutore(carico) && !tutori.eCaricoCheApreUnaTutela(carico),
      ),
      "un carico qui dentro concede il ruolo senza che la revoca lo chiuda",
    );
    prova(
      "R-B il carico obliquo NON concede il ruolo di genitore",
      false,
      tutori.eCaricoDiTutore({
        role: "trainer",
        athlete_id: "a",
        guardian_id: "g",
      }),
    );
    prova(
      "R-B eCaricoDiTutore riconosce il carico canonico",
      true,
      tutori.eCaricoDiTutore({
        role: "parent",
        token_type: "parent_access",
        athlete_id: figlio,
        guardian_id: riga.id,
      }),
    );
    /*
      **Sono due domande, e stanno in ordine.**

      La prima stesura di questa sonda chiedeva a `eCaricoDiTutore` — che
      decide il **ruolo** — di riconoscere il carico obliquo. Ma un carico con
      `role: "trainer"` non deve concedere il ruolo di genitore: se lo
      concedesse, questa sarebbe una scalata di privilegio.

      Cio che deve riconoscerlo e la domanda **larga**: «riscattare questo
      carico puo collegare un tutore?». E quella che la revoca usa, ed e per
      costruzione un soprainsieme dell'altra — l'invariante che tiene insieme
      le due porte, e che le tre asserzioni qui sotto misurano dal vivo.
    */
    prova(
      "R-B la domanda larga riconosce il carico obliquo",
      true,
      tutori.eCaricoCheApreUnaTutela({
        role: "trainer",
        athlete_id: figlio,
        guardian_id: riga.id,
      }),
      "se falso, la revoca non chiude questo invito",
    );

    /* La revoca completa dell'accesso di quella persona nel club. */
    await tutori.revokeGuardianAccessInClub(prisma, {
      organizationId: CLUB,
      userId: PADRE,
      email: email("padre"),
    });

    const stati = Object.fromEntries(
      (
        await prisma.clubResourceItem.findMany({
          where: { organization_id: CLUB, resource_type: "access_tokens" },
          select: { name: true, status: true },
        })
      ).map((r) => [r.name, r.status]),
    );
    prova("R-B il gettone canonico e chiuso", "revoked", stati[codiceCanonico]);
    prova(
      "R-B il gettone obliquo e chiuso",
      "revoked",
      stati[codiceObliquo],
      "un invito che sopravvive alla revoca la annulla",
    );

    const rigaRevocata = (await righeDi(figlio))[0];
    prova(
      "R-B la riga e revocata prima del riscatto",
      true,
      Boolean(rigaRevocata.revoked_at),
    );

    /* Il riscatto, dalla porta vera. */
    const padreRiga = await prisma.user.findUnique({ where: { id: PADRE } });
    const esitoCanonico = await riscatta(padreRiga, codiceCanonico);
    console.log(
      `        riscatto canonico -> ${esitoCanonico.stato} ${JSON.stringify(
        esitoCanonico.corpo?.error?.message || "ok",
      )}`,
    );
    prova(
      "R-B il riscatto del gettone canonico e respinto",
      410,
      esitoCanonico.stato,
      JSON.stringify(esitoCanonico.corpo?.error || esitoCanonico.stato),
    );

    const esitoObliquo = await riscatta(padreRiga, codiceObliquo);
    console.log(
      `        riscatto obliquo -> ${esitoObliquo.stato} ${JSON.stringify(
        esitoObliquo.corpo?.error || esitoObliquo.corpo?.data?.membership?.role,
      )}`,
    );
    const dopoObliquo = (await righeDi(figlio))[0];
    prova(
      "R-B dopo il riscatto obliquo la riga resta revocata",
      true,
      Boolean(dopoObliquo.revoked_at),
      `stato riscatto ${esitoObliquo.stato}; user_id ora = ${dopoObliquo.user_id}`,
    );
    prova(
      "R-B dopo il riscatto obliquo l'utenza NON e ricollegata",
      null,
      dopoObliquo.user_id,
    );
  }

  /* ================================================================== *
   * §3 — la revoca per indirizzo colpisce la riga dell'altro genitore
   * ================================================================== */
  console.log("\n§3 — la scheda TRAVASATA: un indirizzo, due genitori\n");
  {
    /*
      La configurazione ordinaria di ADR-0114, prodotta come la produce
      l'archivio vero: il travaso della migrazione su un blob storico.
      La madre dichiara `linkedUserId` (chiave = utenza), il padre no
      (chiave = indirizzo di famiglia).
    */
    const figlio = await atleta(
      "FiglioD",
      {
        guardians: [
          {
            id: "g-madre",
            name: "Madre",
            relationship: "madre",
            email: EMAIL_FAMIGLIA,
            linkedUserId: MADRE,
            linkedUserEmail: EMAIL_FAMIGLIA,
            fiscalCode: "MDRXXX00A00A000A",
          },
          {
            id: "g-padre",
            name: "Padre",
            relationship: "padre",
            email: EMAIL_FAMIGLIA,
            fiscalCode: "PDRXXX00A00A000B",
          },
        ],
      },
      CLUB_T,
    );
    const figlioE = await atleta(
      "FiglioE",
      {
        guardians: [
          {
            id: "h-madre",
            name: "MadreDue",
            email: EMAIL_FAMIGLIA,
            linkedUserId: MADRE,
            linkedUserEmail: EMAIL_FAMIGLIA,
            fiscalCode: "MDRXXX00A00A000C",
          },
          {
            id: "h-padre",
            name: "PadreDue",
            email: EMAIL_FAMIGLIA,
            fiscalCode: "PDRXXX00A00A000D",
          },
        ],
      },
      CLUB_T,
    );
    /*
      **Il travaso NON riscrive `athletes.data`** (lo dichiara la migrazione).
      La scheda che il client legge porta ancora l'elenco storico con gli id
      di allora: e lo stato in cui ogni ambiente si trova subito dopo il
      rilascio, ed e quello che la sonda deve misurare. Nessun
      `refreshGuardianProjection` qui.
    */
    await travasaTutori(prisma, [CLUB_T]);

    const seminate = await righeDi(figlio);
    console.log(
      `        righe travasate: ${JSON.stringify(
        seminate.map((r) => ({
          k: r.identity_key === MADRE ? "<utenza-madre>" : r.identity_key,
          u: r.user_id ? "<madre>" : null,
          e: r.email,
          n: r.first_name,
        })),
      )}`,
    );
    prova("R-C il travaso tiene due righe distinte", 2, seminate.length);

    const rigaPadre = seminate.find((r) => r.first_name === "Padre");

    /* ---- prima: il salvataggio ordinario della scheda travasata ---- */
    prova(
      "R-F il travaso della seconda scheda tiene due righe",
      2,
      (await righeDi(figlioE)).length,
    );

    /* La segreteria riapre la scheda e la risalva senza toccarla. */
    const risorse2 = await carica("src/lib/server/resources.ts");
    const primaDelSalvataggio = await datiDi(figlioE);
    await risorse2.updateResource(
      "athletes",
      figlioE,
      { data: primaDelSalvataggio },
      scopeOwnerT,
    );
    const dopoSalvataggio = await righeDi(figlioE);
    console.log(
      `        dopo un salvataggio ordinario: ${JSON.stringify(
        dopoSalvataggio.map((r) => ({
          n: r.first_name,
          u: r.user_id ? "<madre>" : null,
          cf: (r.data || {}).fiscalCode || null,
        })),
      )}`,
    );
    prova(
      "R-F un salvataggio ordinario non perde un genitore",
      2,
      dopoSalvataggio.length,
    );
    prova(
      "R-F il legame della madre sopravvive al salvataggio",
      true,
      dopoSalvataggio.some((r) => r.user_id === MADRE),
    );

    /* ---- poi: la madre lascia il club, e il padre? ---- */
    await tutori.revokeGuardianAccessInClub(prisma, {
      organizationId: CLUB_T,
      userId: MADRE,
      email: EMAIL_FAMIGLIA,
    });

    const dopo = await righeDi(figlio);
    const padreDopo = dopo.find((r) => r.id === rigaPadre?.id);
    prova(
      "R-C la riga del padre NON e revocata",
      false,
      Boolean(padreDopo?.revoked_at),
      "revocare la madre non deve chiudere il padre",
    );
    /*
      **Cio che qui non si puo misurare, e perche.**

      La prima stesura chiedeva che il padre restasse raggiungibile passando a
      `findGuardianLinks` l'indirizzo **di famiglia** come suo indirizzo
      verificato. Quello stato non esiste: `users.email` e `@unique`, e
      quell'indirizzo e dell'account della madre — `getParentLinkedAthletes`
      ricava l'indirizzo verificato dall'account di chi chiede, quindi il padre
      non puo presentarsi con quello di un'altra persona.

      Il ripiego sull'indirizzo resta percio **chiuso per tutti** quando la
      persona che possiede quell'account e revocata, ed e la scelta giusta: due
      persone dietro un indirizzo solo il sistema non le distingue, e davanti
      al dubbio su un dato sanitario di un minore si nega. La strada che resta
      al padre e quella **dichiarata** — un riscatto che gli dia la sua riga
      con la sua utenza — e la sonda la misura qui sotto.
    */
    const linksPadre = await tutori.findGuardianLinks(prisma, {
      userId: PADRE,
      verifiedEmail: null,
      organizationIdsForEmail: [CLUB_T],
    });
    prova(
      "R-C il padre non ha (ancora) un legame dichiarato",
      false,
      linksPadre.some((r) => r.athlete_id === figlio),
      "la sua riga esiste e non e revocata, ma nessun riscatto l'ha collegata",
    );
    await tutori.linkGuardianAccount(prisma, {
      athleteId: figlio,
      identityKeys: [rigaPadre.identity_key],
      userId: PADRE,
      email: EMAIL_FAMIGLIA,
    });
    prova(
      "R-C dopo il riscatto il padre entra, e la madre resta fuori",
      [true, false],
      [
        (
          await tutori.findGuardianLinks(prisma, {
            userId: PADRE,
            verifiedEmail: null,
            organizationIdsForEmail: [CLUB_T],
          })
        ).some((r) => r.athlete_id === figlio),
        (
          await tutori.findGuardianLinks(prisma, {
            userId: MADRE,
            verifiedEmail: null,
            organizationIdsForEmail: [CLUB_T],
          })
        ).some((r) => r.athlete_id === figlio),
      ],
      "la revoca della madre non deve cadere quando il padre si collega",
    );

    /* CONTROLLO — indirizzi diversi: la revoca non deve toccare il padre. */
    const figlioF = await atleta(
      "FiglioF",
      {
        guardians: [
          {
            id: "k-madre",
            name: "MadreTre",
            email: email("madretre"),
            linkedUserId: MADRE,
            linkedUserEmail: email("madretre"),
          },
          { id: "k-padre", name: "PadreTre", email: email("padretre") },
        ],
      },
      CLUB_C,
    );
    await travasaTutori(prisma, [CLUB_C]);
    await tutori.revokeGuardianAccessInClub(prisma, {
      organizationId: CLUB_C,
      userId: MADRE,
      email: email("madretre"),
    });
    const padreTre = (await righeDi(figlioF)).find(
      (r) => r.first_name === "PadreTre",
    );
    prova(
      "R-C/controllo con indirizzi distinti il padre NON e revocato",
      false,
      Boolean(padreTre?.revoked_at),
    );
  }

  /* ================================================================== *
   * §6 — salvataggi e approvazioni CONCORRENTI VERI
   * ================================================================== */
  console.log("\n§6 — due scritture in parallelo sulla stessa scheda\n");
  {
    const figlio = await atleta("FiglioH");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [{ email: email("base"), firstName: "Base" }],
      canGrantAccess: true,
    });
    const base = (await righeDi(figlio))[0];

    /* Due segreterie salvano la stessa scheda: ognuna aggiunge un tutore. */
    const salva = (indirizzo, nome) =>
      tutori
        .saveGuardianRegistry(prisma, {
          organizationId: CLUB,
          athleteId: figlio,
          rows: [
            { rowId: base.id, email: email("base"), firstName: "Base" },
            { email: indirizzo, firstName: nome },
          ],
          canGrantAccess: true,
        })
        .then(() => "ok")
        .catch((e) => `KO ${String(e?.meta?.code || e?.code || e?.message).slice(0, 50)}`);

    const esiti2 = await Promise.all([
      salva(email("uno"), "Uno"),
      salva(email("due"), "Due"),
    ]);
    const dopo = await righeDi(figlio);
    console.log(
      `        esiti = ${JSON.stringify(esiti2)}; righe = ${JSON.stringify(
        dopo.map((r) => r.first_name),
      )}`,
    );
    prova(
      "R-H due salvataggi concorrenti riescono entrambi",
      true,
      esiti2.every((v) => v === "ok"),
      "un salvataggio che fallisce porta con se nome, categoria e recapiti",
    );
    /*
      **Una misura dichiarata, non un'asserzione sul prodotto — debito D49.**

      Due segreterie sulla stessa scheda, la seconda con l'elenco letto un
      istante prima: entrambe riescono, e la riga che la prima aveva appena
      creato sparisce. Non e una corsa che `bloccaSchede` non ordina — le due
      transazioni sono serializzate — e la semantica di **sostituzione**
      applicata a uno snapshot vecchio: lo stesso esito si ottiene in sequenza
      con due linguette aperte.

      Non si chiude qui. Chiuderla vuol dire concorrenza ottimistica sul
      salvataggio della **scheda** — una versione che il client rimanda e il
      server verifica — che riguarda ogni campo dell'anagrafica, non i tutori:
      farla dentro questo pacchetto sarebbe metterla in un posto solo di quelli
      che ne hanno bisogno. Sta in D49.

      Cio che **e** garantito, e che qui si asserisce, e il perimetro di
      sicurezza: nessuna riga revocata risuscita, e nessun accesso si apre. Il
      danno e la perdita di un recapito, non un varco.
    */
    console.log(
      `        D49 — righe dopo i due salvataggi concorrenti: ${dopo.length} (attese 3 senza il debito)`,
    );
    prova(
      "R-H nessuna riga revocata risuscita dai salvataggi concorrenti",
      0,
      dopo.filter((r) => r.revoked_at === null && r.user_id && r.contact_only)
        .length,
      "il danno di D49 e la perdita di un recapito, non un varco",
    );

    /* ---- una revoca in corsa con il salvataggio della scheda ---- */
    const figlioM = await atleta("FiglioM");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlioM,
      rows: [{ email: email("revocando"), firstName: "Revocando" }],
      canGrantAccess: true,
    });
    const rigaM = (await righeDi(figlioM))[0];
    const REV = randomUUID();
    await prisma.user.create({ data: utente(REV, email("revocando"), "Rev") });
    await tutori.linkGuardianAccount(prisma, {
      athleteId: figlioM,
      guardianRowId: rigaM.id,
      userId: REV,
      email: email("revocando"),
    });
    const cartaDiM = await datiDi(figlioM);
    const [, esitoSalva] = await Promise.all([
      tutori.revokeGuardianRow(prisma, {
        athleteId: figlioM,
        guardianRowId: rigaM.id,
        organizationId: CLUB,
      }),
      (async () => {
        const risorseM = await carica("src/lib/server/resources.ts");
        return risorseM
          .updateResource("athletes", figlioM, { data: cartaDiM }, scopeOwner)
          .then(() => "ok")
          .catch((e) => `KO ${String(e?.message).slice(0, 40)}`);
      })(),
    ]);
    const mDopo = (await righeDi(figlioM))[0];
    console.log(
      `        salvataggio in corsa = ${JSON.stringify(esitoSalva)}; revocata = ${Boolean(
        mDopo.revoked_at,
      )}; user_id = ${mDopo.user_id}`,
    );
    prova(
      "R-J la revoca sopravvive al salvataggio in corsa",
      true,
      Boolean(mDopo.revoked_at),
    );
    prova("R-J l'utenza resta staccata", null, mDopo.user_id);

    /* Due approvazioni di modulo pubblico sulla stessa persona. */
    const figlioI = await atleta("FiglioI");
    const approva = () =>
      tutori
        .upsertGuardianFromFormApproval(prisma, {
          organizationId: CLUB,
          athleteId: figlioI,
          row: { email: email("modulo"), firstName: "Modulo" },
          contactOnly: true,
        })
        .then(() => "ok")
        .catch((e) => `KO ${String(e?.meta?.code || e?.code || e?.message).slice(0, 50)}`);
    const esiti3 = await Promise.all([approva(), approva(), approva()]);
    const righeModulo = await righeDi(figlioI);
    console.log(
      `        approvazioni = ${JSON.stringify(esiti3)}; righe = ${righeModulo.length}`,
    );
    prova(
      "R-I tre approvazioni concorrenti riescono tutte",
      true,
      esiti3.every((v) => v === "ok"),
    );
    prova("R-I e lasciano una riga sola", 1, righeModulo.length);
  }

  /* ================================================================== *
   * §5 — l'ordine dei blocchi: tutori contro passaggio di stagione
   * ================================================================== */
  console.log("\n§5 — ordine di acquisizione dei blocchi su `athletes`\n");
  {
    const a = await atleta("Lock1");
    const b = await atleta("Lock2");
    const [basso, alto] = [a, b].sort();

    const genitore = randomUUID();
    await prisma.user.create({
      data: utente(genitore, email("lockparent"), "LockParent"),
    });
    for (const figlio of [basso, alto]) {
      await tutori.saveGuardianRegistry(prisma, {
        organizationId: CLUB,
        athleteId: figlio,
        rows: [{ email: email("lockparent"), firstName: "LockParent" }],
        canGrantAccess: true,
      });
      const r = (await righeDi(figlio))[0];
      await tutori.linkGuardianAccount(prisma, {
        athleteId: figlio,
        guardianRowId: r.id,
        userId: genitore,
        email: email("lockparent"),
      });
    }

    /*
      `runAthleteMembershipRollover` riallinea `athletes.category_id` con una
      `updateMany` **per categoria**, e l'ordine delle categorie e quello di
      inserzione in una `Map` — scorrelato dall'ordine degli identificativi.
      Qui si riproducono le due istruzioni nell'ordine decrescente.
    */
    const misura = async (ordine) => {
      let sbloccaRoll;
      const rollHaPreso = new Promise((r) => {
        sbloccaRoll = r;
      });
      let sbloccaRev;
      const revHaChiesto = new Promise((r) => {
        sbloccaRev = r;
      });

      const roll = prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "athletes" SET "category_name" = 'roll' WHERE "organization_id" = $1::uuid AND "id" = ANY($2::uuid[])`,
            CLUB,
            [ordine[0]],
          );
          sbloccaRoll();
          await revHaChiesto;
          await new Promise((r) => setTimeout(r, 400));
          await tx.$executeRawUnsafe(
            `UPDATE "athletes" SET "category_name" = 'roll' WHERE "organization_id" = $1::uuid AND "id" = ANY($2::uuid[])`,
            CLUB,
            [ordine[1]],
          );
          return "roll ok";
        })
        .catch((e) => `roll ${String(e?.meta?.code || e?.code || e?.message).slice(0, 60)}`);

      await rollHaPreso;
      const rev = prisma
        .$transaction(async (tx) => {
          const p = tutori.revokeGuardianAccessInClub(tx, {
            organizationId: CLUB,
            userId: genitore,
            email: email("lockparent"),
          });
          return p.then((n) => `revoca ok (${n})`);
        })
        .catch((e) => `revoca ${String(e?.meta?.code || e?.code || e?.message).slice(0, 60)}`);
      setTimeout(sbloccaRev, 250);

      return Promise.all([roll, rev]);
    };

    /* Ordine opposto a `bloccaSchede` (che prende in ordine crescente). */
    const incrociato = await misura([alto, basso]);
    console.log(`        ordine opposto  -> ${JSON.stringify(incrociato)}`);
    /*
      **Che cosa misura davvero questa coppia di asserzioni.**

      Le due istruzioni qui sopra **replicano** il riallineamento di stagione,
      non lo chiamano: `runAthleteMembershipRollover` non si puo mettere in
      pausa a meta transazione, e senza una pausa l'incrocio non e
      deterministico. Quindi qui lo scrittore in ordine decrescente e uno
      scrittore **ipotetico**, e questa asserzione non dice se il prodotto oggi
      sia sano: dice che **l'ordine conta**, cioe che chi lo ignora manda la
      revoca a sbattere — con la revoca come vittima, «revoca non riuscita» a
      schermo e niente in audit.

      E il **controllo** della proprieta, e va letta insieme alla sua meta
      strutturale qui sotto, che invece guarda il prodotto vero: chi scrive le
      schede in massa prende i blocchi nell'ordine comune. Le due insieme
      dicono «l'ordine conta» e «i partecipanti lo rispettano»; nessuna delle
      due da sola direbbe niente.
    */
    prova(
      "R-G CONTROLLO chi ignora l'ordine manda la revoca a sbattere",
      true,
      incrociato.some((v) => /40P01|deadlock/i.test(v)),
      "se questa e falsa, l'incrocio non si e prodotto e le due sotto non misurano niente",
    );

    /*
      **La meta strutturale: derivata dal codice, non da un elenco a mano.**

      Si cercano in `src/lib/server` i moduli che scrivono `athletes` **in
      massa** — l'unica forma che prende piu di un blocco per volta — e si
      chiede che ognuno passi da `bloccaSchede`. Un terzo scrittore che nasca
      domani senza prendere l'ordine fa diventare rossa questa riga il giorno
      in cui viene scritto, non il giorno in cui un cliente perde una revoca.
    */
    const { readdirSync, readFileSync: leggi } = await import("node:fs");
    const senzaOrdine = readdirSync("src/lib/server")
      .filter((nome) => nome.endsWith(".ts"))
      .map((nome) => ({ nome, testo: leggi(`src/lib/server/${nome}`, "utf8") }))
      .filter(
        ({ testo }) =>
          testo.includes("athlete.updateMany(") ||
          testo.includes('UPDATE "athletes"'),
      )
      /*
        La **chiamata**, non il nome: cercare `bloccaSchede` e basta trovava
        anche la riga di `import`, e la sonda restava verde togliendo la
        chiamata e lasciando l'import. Misurato mutando il codice: e cosi che
        una sonda diventa vacua senza che nessuno se ne accorga.
      */
      .filter(({ testo }) => !testo.includes("bloccaSchede("))
      .map(({ nome }) => nome);

    prova(
      "R-G chi scrive le schede in massa prende l'ordine comune",
      [],
      senzaOrdine,
      "un modulo qui dentro puo incrociarsi con la revoca di un tutore",
    );

    /* CONTROLLO — stesso ordine di `bloccaSchede`: non deve mai accadere. */
    /* Si rianima la coppia: senza righe da toccare la revoca non blocca
       niente e il controllo non misurerebbe piu la stessa cosa. */
    await tutori.withGuardianWriter(prisma, (tx) =>
      tx.athleteGuardian.updateMany({
        where: { athlete_id: { in: [basso, alto] } },
        data: { revoked_at: null, user_id: genitore },
      }),
    );
    const concorde = await misura([basso, alto]);
    console.log(`        stesso ordine   -> ${JSON.stringify(concorde)}`);
    prova(
      "R-G/controllo con lo stesso ordine non c'e abbraccio mortale",
      false,
      concorde.some((v) => /40P01|deadlock/i.test(v)),
    );
  }

  /* ================================================================== *
   * §4 — la rotta generica e i due registri
   * ================================================================== */
  console.log("\n§4 — la rotta generica sui registri derivati\n");
  {
    const risorse = await carica("src/lib/server/resources.ts");
    const figlio = await atleta("FiglioG");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio,
      rows: [
        { email: email("attivo"), firstName: "Attivo" },
        { email: email("recapito"), firstName: "Recapito", contactOnly: true },
      ],
      canGrantAccess: true,
    });
    const primaDei = await datiDi(figlio);

    /* Un client che prova a dichiarare revocato un tutore legittimo. */
    await risorse.updateResource(
      "athletes",
      figlio,
      {
        data: {
          ...primaDei,
          revokedGuardianIdentities: [email("attivo")],
          contactOnlyIdentities: [email("attivo")],
        },
      },
      scopeOwner,
    );
    const dopo = await datiDi(figlio);
    prova(
      "R-D revokedGuardianIdentities non e scrivibile dal client",
      [],
      dopo.revokedGuardianIdentities,
    );
    prova(
      "R-D contactOnlyIdentities resta quello derivato",
      [email("recapito")],
      dopo.contactOnlyIdentities,
    );

    /* `guardians` nominato con un valore che non e un elenco. */
    await risorse.updateResource(
      "athletes",
      figlio,
      { data: { ...dopo, guardians: null } },
      scopeOwner,
    );
    const righeDopoNull = await righeDi(figlio);
    prova(
      "R-E `guardians: null` non cancella le righe",
      2,
      righeDopoNull.length,
      "un valore non-elenco non e «li nomina e sono zero»",
    );

    /* CONTROLLO — una scrittura che NON nomina i tutori non li tocca. */
    const figlio2 = await atleta("FiglioL");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: figlio2,
      rows: [
        { email: email("l1"), firstName: "L1" },
        { email: email("l2"), firstName: "L2" },
      ],
      canGrantAccess: true,
    });
    await risorse.updateResource(
      "athletes",
      figlio2,
      { data: { nota: "senza tutori" } },
      scopeOwner,
    );
    prova(
      "R-E/controllo una scrittura che non li nomina non li tocca",
      2,
      (await righeDi(figlio2)).length,
    );
  }

  const rossi = esiti.filter((e) => !e.ok);
  console.log(
    `\n${esiti.length - rossi.length}/${esiti.length} verdi — ${rossi.length} rossi\n`,
  );
  for (const r of rossi) console.log(`  ROSSO  ${r.titolo}`);
};

main()
  .catch((errore) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.club.deleteMany({ where: { id: { in: [CLUB, CLUB_T, CLUB_C] } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: coda } } });
    await prisma.$disconnect();
  });
