/**
 * **Tredicesimo vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione.
 *
 *  §A  redeem/route.ts:74-86 — «**La scheda che il gettone nomina deve essere
 *      del club che l'ha coniato.** `trainer_id` viene dal payload del
 *      gettone, e `getResourceById` senza scope non filtra per club: chi
 *      coniava un gettone nel proprio club potendo scrivere l'identificativo
 *      di una scheda **altrui** collegava se stesso a quella scheda.»
 *      E redeem/route.ts:686-689 — «Comprende il caso in cui la scheda
 *      **esiste ma e di un altro club**: e il segnale del tentativo di
 *      scavalcare il confine, e taceva.»
 *      IPOTESI: la guardia e **una query diversa** da quella che poi legge e
 *      **scrive**. `loadTrainerAccessTarget` verifica l'esistenza con
 *      `prisma.clubResourceItem.findFirst({ organization_id })`; subito dopo
 *      chiama `getResourceById("trainers", trainerId)` **senza scope**, e
 *      `findClubResourceRecord` con `scope` assente non mette **nessun**
 *      filtro di club (resources.ts:3291-3295: `organizationFilter = {}`).
 *      La riscrittura di 6cda428 ha tolto il `try/catch` ma non ha toccato lo
 *      scope. Il `payload.id` di un profilo lo sceglie il client
 *      (`normalizeClubResourceInput`, resources.ts:3148-3150: un `id` non-UUID
 *      finisce dentro il carico), quindi chi possiede un club puo **coniarsi
 *      una collisione** con l'identificativo logico di un profilo altrui:
 *      la guardia trova la riga di casa propria, e la lettura e la scrittura
 *      possono cadere su quella di un altro club.
 *      `updateResource` (resources.ts:7092) rifa la **stessa** query, sempre
 *      senza scope.
 *      Conseguenza attesa: `linkedUserId` di una scheda allenatore di un
 *      altro club riscritto con l'utenza dell'attaccante, e il codice di
 *      accesso di quella scheda sostituito.
 *
 *  §B  athlete-guardians.ts:2049-2079 (`proiettaRiga`) — «un indirizzo apre
 *      solo se la riga non e revocata e non e un solo-recapito. E la stessa
 *      condizione che `findGuardianLinks` applica, scritta una seconda volta
 *      in una forma che i lettori storici sanno leggere.»
 *      E athlete-guardians.ts (lib client) `readAthleteGuardianContacts`,
 *      src/lib/athlete-guardians.ts:389-408 — «**Un indirizzo revocato non
 *      esce, nemmeno da una riga viva.** [...] La riga resta, l'indirizzo
 *      revocato no».
 *      E fiscal-recipient.ts:214-236 (commit 6cda428, ADR-0149) — «una riga
 *      **revocata** e una persona che il club ha escluso. [...] La posizione
 *      scelta a mano dal club (`billingGuardianIndex`) non fa eccezione: se
 *      punta a una riga esclusa, si passa alla successiva utile.»
 *      IPOTESI: la proiezione **fonde per posizione** (refreshGuardianProjection,
 *      athlete-guardians.ts:2344-2426) e il codice dichiara esso stesso che una
 *      voce puo mescolare una riga revocata e una viva — `revokeGuardianAccessInClub`
 *      risparmia apposta «una riga che porta l'utenza di qualcun altro»
 *      (athlete-guardians.ts:1731-1736). Nella voce fusa i valori **non nulli**
 *      della riga vista per prima vincono: ne esce
 *      `{ email: <indirizzo del revocato>, linkedUserId: <utenza del vivo>,
 *      accessRevokedAt: <marchio del revocato> }`.
 *      Da li due letture della **stessa** voce danno risposte **opposte**:
 *      * `readAthleteGuardianContacts` esce dall'uscita anticipata «un legame
 *        dichiarato vince» — che confronta con `revokedGuardianIdentities`,
 *        il registro che PP-02 ha **cancellato** e che percio e sempre vuoto —
 *        e restituisce l'indirizzo del **revocato**: solleciti di pagamento
 *        (con il collegamento a gettone per pagare) e comunicazioni di gruppo;
 *      * `resolveFiscalRecipient` e `{{parent.N.*}}`, dopo 6cda428, scartano
 *        la voce per il marchio: il **co-genitore vivo** perde il posto sulla
 *        ricevuta e il codice fiscale stampato **cambia persona** — che e
 *        precisamente il costo che il commento di 6cda428 dichiara di voler
 *        evitare («questo pacchetto ha gia misurato cosa costa»).
 *
 *  §C  fiscal-recipient.ts:214-260 — «due righe non possono comparirci [...]
 *      La posizione scelta a mano dal club non fa eccezione.»
 *      IPOTESI: la regola e stata applicata a **due** dei tre rami. L'ultimo
 *      ripiego — `if (!athleteRecipient.name && guardians.length) return
 *      fromGuardian(guardians[0])` (riga 262) — non passa da `intestabile`,
 *      quindi intesta a una riga revocata o di solo recapito. Gemello non
 *      allargato dentro la **stessa funzione** della correzione.
 *
 *  §D  profile-account-links.ts:403-412 (commit 6cda428) — «Le si cercano
 *      comunque tutte: cercare un soprainsieme costa un `OR` e non puo mai
 *      essere **inerte**».
 *      E il censimento delle porte: `chiudiGliInvitiDelProfilo`,
 *      `eraseProfileInvites`, `revocaIGettoni`, `eraseGuardianInvitesForAthlete`.
 *      IPOTESI da misurare, non da dedurre: **la larghezza di ogni porta va
 *      confrontata con cio che il riscatto accetta**. Il riscatto accetta
 *      `NULL | active | pending | sent` e, se multiuso, `redeemed`; rifiuta
 *      `expired` e `revoked`. Una porta che non chiude uno degli stati
 *      accettati e un buco.
 *
 * ---
 *
 * Ogni sezione porta il proprio CONTROLLO: la stessa misura dove l'esito deve
 * essere opposto. Senza, una sonda che dichiara ROSSO non dimostra di saper
 * dire VERDE.
 *
 * ---
 *
 * **Esito al 2026-09-06, su `6cda428` non modificato: 12/19, 7 FAIL.**
 * ROSSE: A3, A5, B3, B5, B6, C0, C1.
 * VERDI e discriminanti: A0, A1, A2, A4, B0, B1, B2, B4, C2, D0, D1, D2.
 * **Cinque esecuzioni consecutive sull'albero pulito: stesso esito tutte e
 * cinque, stesse rosse.**
 *
 * **L'intermittenza di §A e il reperto, non il rumore.** Quale delle due righe
 * omonime risponda lo decide l'ordine **fisico** delle tuple:
 * `findClubResourceRecord` senza scope non ha ne filtro di club ne `ORDER BY`,
 * e un `UPDATE` sposta la tupla in coda. Una misura sola direbbe percio a
 * volte «chiuso» — su quindici esecuzioni della prima stesura, A3 e stata
 * verde 1 volta su 15 e A5 mai. A3 ripete percio l'attacco su **dieci**
 * identificativi indipendenti e conta: 9, 8, 6, 8, 8 schede del club A
 * dirottate su 10, cinque esecuzioni su cinque. Mai zero.
 *
 * **Prova che le rosse discriminano.** Mutazioni sul codice, applicate e
 * revertite con `git checkout -- src/`:
 *   M1. in `loadTrainerAccessTarget` la riga trovata **dalla guardia**
 *       (`perUuid || perIdLogico`, che porta gia il filtro di club) diventa
 *       quella che si legge e si scrive: `getResourceById(..., rigaDelClub.id)`
 *       e `updateResource(..., trainerTarget.rowId, ...)`.
 *       **A3 verde (0/10 dirottate) e A5 verde**; §B, §C e §D invariate.
 *   M2. `fiscal-recipient.ts:262`, l'ultimo ripiego passa da `intestabile`:
 *       **C0 e C1 verdi**; tutto il resto invariato — cioe C0/C1 misurano il
 *       terzo ramo e non i due che 6cda428 ha chiuso.
 *   M3. revert di 6cda428 sui due lettori posizionali (`intestabile` tolto da
 *       `resolveFiscalRecipient`, `guardianAt` che non scarta piu):
 *       **C2 diventa ROSSA** — cioe C2 misura davvero quella correzione — e
 *       B5/B6 cambiano **valore** senza diventare verdi: la ricevuta passa da
 *       «la zia» a «la madre revocata», e `{{parent.1.first_name}}` da `""` a
 *       `"Madre"`. La voce fusa era rotta prima e resta rotta dopo: 6cda428
 *       non l'ha introdotta, ne ha **cambiato la forma del danno** — da
 *       «nomina chi il club ha escluso» a «nomina un terzo, o nessuno, al
 *       posto di un tutore vivo».
 *
 * **Ipotesi FALSIFICATA, tenuta come controllo (B4).** `revokedGuardianIdentities`
 * sembrava una difesa inerte — WP-C lo aveva cancellato come archivio — ma
 * `refreshGuardianProjection` lo **riderivа** dalle righe a ogni scrittura
 * (athlete-guardians.ts:2432-2500). L'uscita anticipata «un legame dichiarato
 * vince» regge, e l'indirizzo del revocato non esce dai canali di invio.
 *
 * **NON misurato** (lacuna dichiarata, non un verde): revoche concorrenti;
 * rollover di stagione x revoca; replay e rate limiting del riscatto; una
 * persona con **due utenze**; le altre fette di `data-subject.ts`;
 * `unlinkClubJsonProfiles` (verificato per **lettura**: entrambi i chiamanti,
 * `revokeClubAccess` e `POST /auth/memberships/delete`, la chiamano accanto a
 * `unlinkProfileResources`, che e la gemella che chiude gli inviti);
 * l'uscita anticipata `if (!result.changed) continue` di
 * `unlinkProfileResources` (verificata per lettura: `isLinkedToTarget` guarda
 * anche `record.email`, quindi il profilo coniato dal club con l'indirizzo
 * della persona **e** raggiunto).
 *
 * Esecuzione:
 *   node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *     scripts/pp-02-tredicesimo-vaglio.mjs
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(72)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        ${nota}`);
};

/* --------------------------------------------------------------- identita */

const CLUB_A = randomUUID(); // il club della vittima
const CLUB_B = randomUUID(); // il club dell'attaccante
const PRES_A = randomUUID();
const PRES_B = randomUUID();
const ALLENATORE_A = randomUUID(); // il vero allenatore del club A
const ATTACCANTE = randomUUID();
const MADRE = randomUUID();
const PADRE = randomUUID();

const coda = `${CLUB_A.slice(0, 8)}@tredicesimo.local`;
const email = (chi) => `${chi}-${coda}`;

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Tredicesimo",
  password_hash: "$2b$10$tredicesimo",
  role: "user",
});

const ip = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}`;

let rotte = null;

/** La rotta generica, come la chiama un browser. Il club e un parametro. */
const chiama = async (metodo, percorso, corpo, sessione, ruoloAttivo, club) => {
  const url = new URL(percorso, "http://collaudo.invalid");
  const richiesta = new Request(url.toString(), {
    method: metodo,
    headers: new Headers({
      "content-type": "application/json",
      authorization: `Bearer ${sessione}`,
      "x-active-club-id": club,
      "x-active-access-role": ruoloAttivo,
      "x-forwarded-for": ip(),
    }),
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const segmenti = url.pathname.replace(/^\/api\/v1\//, "").split("/");
  const risposta =
    segmenti.length === 1
      ? await rotte.elenco[metodo](richiesta, {
          params: { resource: segmenti[0] },
        })
      : await rotte.riga[metodo](richiesta, {
          params: { resource: segmenti[0], id: decodeURIComponent(segmenti[1]) },
        });
  let corpoRisposta = null;
  try {
    corpoRisposta = await risposta.json();
  } catch {
    corpoRisposta = null;
  }
  return { stato: risposta.status, corpo: corpoRisposta };
};

/** Il riscatto di un gettone, dalla rotta HTTP vera. */
const riscatta = async (sessione, valore) => {
  const risposta = await rotte.riscatto.POST(
    new Request("http://collaudo.invalid/api/v1/auth/access/redeem", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessione}`,
        "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
      },
      body: JSON.stringify({ token: valore }),
    }),
  );
  let corpo = null;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  return { stato: risposta.status, corpo };
};

const profiloPerIdLogico = async (club, idLogico) =>
  prisma.clubResourceItem.findFirst({
    where: {
      organization_id: club,
      resource_type: "trainers",
      payload: { path: ["id"], equals: idLogico },
    },
  });

const main = async () => {
  const auth = await carica("src/lib/server/auth.ts");
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const contatti = await carica("src/lib/athlete-guardians.ts");
  const fiscale = await carica("src/lib/documents/fiscal-recipient.ts");
  const segnaposti = await carica("src/lib/server/document-placeholders.ts");
  const legami = await carica("src/lib/server/profile-account-links.ts");

  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    riscatto: await carica("src/app/api/v1/auth/access/redeem/route.ts"),
  };

  await prisma.user.createMany({
    data: [
      utente(PRES_A, email("presa"), "PresidenteA"),
      utente(PRES_B, email("presb"), "PresidenteB"),
      utente(ALLENATORE_A, email("allenatore"), "Allenatore"),
      utente(ATTACCANTE, email("attaccante"), "Attaccante"),
      utente(MADRE, email("madre"), "Madre"),
      utente(PADRE, email("padre"), "Padre"),
    ],
  });

  for (const [id, creatore, etichetta] of [
    [CLUB_A, PRES_A, "a"],
    [CLUB_B, PRES_B, "b"],
  ]) {
    await prisma.club.create({
      data: {
        id,
        name: `tredicesimo ${etichetta} ${id.slice(0, 6)}`,
        slug: `tredicesimo-${etichetta}-${id.slice(0, 8)}`,
        creator_id: creatore,
        updated_at: new Date(),
      },
    });
  }

  const tessera = (club, userId, ruolo, extra = {}) =>
    prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: club,
        user_id: userId,
        role: ruolo,
        is_primary: true,
        updated_at: new Date(),
        ...extra,
      },
    });

  await tessera(CLUB_A, PRES_A, "owner");
  await tessera(CLUB_B, PRES_B, "owner");

  const sessione = async (id) =>
    (
      await auth.createSessionForUser(
        await prisma.user.findUnique({ where: { id } }),
      )
    ).access_token;

  const sessA = await sessione(PRES_A);
  const sessB = await sessione(PRES_B);
  const sessAttaccante = await sessione(ATTACCANTE);
  const sessAllenatore = await sessione(ALLENATORE_A);

  const fraUnAnno = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

  /** Un profilo allenatore, **come lo conia il prodotto**: id logico. */
  const creaProfilo = async (club, sessione_, idLogico, nome) =>
    chiama(
      "POST",
      "/api/v1/trainers",
      {
        organization_id: club,
        id: idLogico,
        name: nome,
        role: "trainer",
        status: "active",
        email: email(nome.toLowerCase()),
        phone: "3330000000",
      },
      sessione_,
      "owner",
      club,
    );

  /** Un invito, con il corpo esatto di `trainers/[id]/page.tsx:815-833`. */
  const coniaGettone = async (club, sessione_, valore, trainerIdNelCarico) =>
    chiama(
      "POST",
      "/api/v1/access_tokens",
      {
        organization_id: club,
        name: valore,
        status: "active",
        date: fraUnAnno,
        role: "trainer",
        one_time: true,
        token_type: "trainer_access",
        usage_context: "trainer_account_link",
        trainer_id: trainerIdNelCarico,
        trainer_name: "Persona",
        trainer_email: email("persona"),
        trainer_phone: "3330000000",
        expires_at: fraUnAnno,
        generated_at: new Date().toISOString(),
      },
      sessione_,
      "owner",
      club,
    );

  /* ================================================================== *
   * §A — il confine di club: la guardia interroga una cosa, la scrittura
   *      un'altra
   * ================================================================== */
  console.log(
    "\n§A — il gettone nomina una scheda: di quale club e quella che viene scritta?\n",
  );

  {
    /* La scheda della vittima, nel club A. Nessun account collegato. */
    const idVittima = `trainer-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const semina = await creaProfilo(CLUB_A, sessA, idVittima, "Vittima");

    prova(
      "A0 SEMINA — la scheda del club A esiste e porta l'identificativo logico",
      [200, idVittima, null],
      [
        semina.stato,
        String((await profiloPerIdLogico(CLUB_A, idVittima))?.payload?.id || ""),
        (await profiloPerIdLogico(CLUB_A, idVittima))?.payload?.linkedUserId ??
          null,
      ],
      "e il corpo di `trainers/new/page.tsx`: l'id logico lo sceglie il client",
    );

    /* --- CONTROLLO: senza collisione la guardia chiude davvero. --- */
    const conioSenzaCollisione = await coniaGettone(
      CLUB_B,
      sessB,
      "TREDIXNOCOLL",
      idVittima,
    );
    const riscattoSenzaCollisione = await riscatta(
      sessAttaccante,
      "TREDIXNOCOLL",
    );
    const vittimaDopoControllo = await profiloPerIdLogico(CLUB_A, idVittima);

    prova(
      "A1 CONTROLLO — senza una riga di casa propria il riscatto e 404 e non scrive",
      [200, 404, null],
      [
        conioSenzaCollisione.stato,
        riscattoSenzaCollisione.stato,
        vittimaDopoControllo?.payload?.linkedUserId ?? null,
      ],
      "la guardia `loadTrainerAccessTarget` fa il suo lavoro quando la riga " +
        "non esiste nel club che conia: e la prova che questa sonda sa dire VERDE",
    );

    /* --- IL REPERTO: l'attaccante si conia la collisione nel proprio club. */
    const collisione = await creaProfilo(
      CLUB_B,
      sessB,
      idVittima,
      "Collisione",
    );
    const conioConCollisione = await coniaGettone(
      CLUB_B,
      sessB,
      "TREDIXCOLL",
      idVittima,
    );

    prova(
      "A2 SEMINA — due club portano lo stesso identificativo logico di profilo",
      [200, 200, 2],
      [
        collisione.stato,
        conioConCollisione.stato,
        await prisma.clubResourceItem.count({
          where: {
            resource_type: "trainers",
            payload: { path: ["id"], equals: idVittima },
          },
        }),
      ],
      "`normalizeClubResourceInput` mette un `id` non-UUID dentro il carico: " +
        "l'identificativo logico non e ne unico ne verificato fra club",
    );

    const riscattoConCollisione = await riscatta(sessAttaccante, "TREDIXCOLL");
    const vittimaDopo = await profiloPerIdLogico(CLUB_A, idVittima);
    const collisioneDopo = await profiloPerIdLogico(CLUB_B, idVittima);

    /*
      **L'intermittenza e il reperto, non il rumore.**

      Quale delle due righe risponda lo decide l'ordine **fisico** delle tuple:
      `findClubResourceRecord` senza scope non ha ne filtro di club ne
      `ORDER BY`. Una misura sola direbbe percio a volte «chiuso». Si ripete
      l'attacco su dieci identificativi diversi e si conta: la domanda non e
      «e successo stavolta» ma «puo succedere».
    */
    let dirottate = 0;
    for (let giro = 0; giro < 10; giro += 1) {
      const idBersaglio = `trainer-${Date.now()}-${giro}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;
      await creaProfilo(CLUB_A, sessA, idBersaglio, `Bersaglio${giro}`);
      await creaProfilo(CLUB_B, sessB, idBersaglio, `Sosia${giro}`);
      const valore = `TREDIXH${giro}${Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase()}`;
      await coniaGettone(CLUB_B, sessB, valore, idBersaglio);
      const idUtente = randomUUID();
      await prisma.user.create({
        data: utente(idUtente, `ladro-${idUtente.slice(0, 8)}-${coda}`, "Ladro"),
      });
      await riscatta(await sessione(idUtente), valore);
      const bersaglio = await profiloPerIdLogico(CLUB_A, idBersaglio);
      if (String(bersaglio?.payload?.linkedUserId || "") === idUtente) {
        dirottate += 1;
      }
    }

    prova(
      "A3 REPERTO — nessuna delle dieci schede del club A viene scritta da un riscatto del club B",
      0,
      dirottate,
      `il primo colpo: riscatto -> ${riscattoConCollisione.stato} ` +
        JSON.stringify(
          riscattoConCollisione.corpo?.error?.message ||
            riscattoConCollisione.corpo?.data?.membership?.role ||
            null,
        ) +
        `, club A linkedUserId=${JSON.stringify(
          vittimaDopo?.payload?.linkedUserId ?? null,
        )} (attaccante: ${String(
          vittimaDopo?.payload?.linkedUserId || "",
        ) === ATTACCANTE}), club B linkedUserId=${JSON.stringify(
          collisioneDopo?.payload?.linkedUserId ?? null,
        )}. Su dieci ripetizioni indipendenti, dirottate: ${dirottate}/10`,
    );

    prova(
      "A4 REPERTO — nessuna tessera nasce nel club A per l'attaccante",
      0,
      await prisma.organizationUser.count({
        where: { organization_id: CLUB_A, user_id: ATTACCANTE },
      }),
      "il ruolo nasce sempre nel club che ha coniato: e la scrittura sulla " +
        "scheda a uscire dal confine, non la tessera",
    );

    /*
      **La conseguenza sul vero allenatore.** Se la scheda del club A e stata
      collegata all'attaccante, il vero allenatore che riscatta il **proprio**
      invito trova 409 «gia collegata a un altro account».
    */
    const conioVero = await coniaGettone(CLUB_A, sessA, "TREDIXVERO", idVittima);
    const riscattoVero = await riscatta(sessAllenatore, "TREDIXVERO");
    const vittimaFine = await profiloPerIdLogico(CLUB_A, idVittima);
    const collisioneFine = await profiloPerIdLogico(CLUB_B, idVittima);
    prova(
      "A5 REPERTO — il riscatto del club A scrive la scheda del club A, non quella del club B",
      { scrittaA: true, scrittaB: false },
      {
        scrittaA:
          String(vittimaFine?.payload?.linkedUserId || "") === ALLENATORE_A,
        scrittaB:
          String(collisioneFine?.payload?.linkedUserId || "") === ALLENATORE_A,
      },
      `conio ${conioVero.stato}, riscatto ${riscattoVero.stato} ` +
        JSON.stringify(riscattoVero.corpo?.error?.message || "ok") +
        `; A=${JSON.stringify(vittimaFine?.payload?.linkedUserId ?? null)} ` +
        `B=${JSON.stringify(collisioneFine?.payload?.linkedUserId ?? null)}. ` +
        "Quale delle due righe risponda lo decide l'ordine fisico delle tuple: " +
        "`findClubResourceRecord` non ha ne filtro di club ne `ORDER BY`, e un " +
        "`UPDATE` sposta la tupla in coda. E la stessa forma di intermittenza " +
        "che questo pacchetto ha gia misurato sui lettori posizionali",
    );
  }

  /* ================================================================== *
   * §B — la voce fusa: due lettori, due risposte opposte
   * ================================================================== */
  console.log(
    "\n§B — una voce che mescola una riga revocata e una viva: chi la legge come?\n",
  );

  {
    const atletaId = randomUUID();
    await prisma.athlete.create({
      data: {
        id: atletaId,
        organization_id: CLUB_A,
        first_name: "Marco",
        last_name: "Tredicesimo",
        status: "active",
        birth_date: new Date("2015-05-05"),
        data: { fiscalCode: "" },
        updated_at: new Date(),
      },
    });

    /*
      **Due righe alla stessa posizione**, che e cio che il travaso produce da
      una voce del blob con piu di un `linkedUserIds`
      (`20260906180000_pp02_il_travaso_fondeva_due_persone`, e il commento di
      `refreshGuardianProjection` che lo dichiara). Si scrivono come le scrive
      il travaso: dentro una transazione che dichiara lo scrittore.
    */
    const rigaMadre = randomUUID();
    const rigaPadre = randomUUID();
    await tutori.withGuardianWriter(prisma, async (tx) => {
      await tx.athleteGuardian.create({
        data: {
          id: rigaMadre,
          organization_id: CLUB_A,
          athlete_id: atletaId,
          identity_key: MADRE,
          user_id: MADRE,
          email: email("madre"),
          first_name: "Madre",
          last_name: "Tredicesimo",
          relationship: "madre",
          position: 0,
          data: { fiscalCode: "MDRTRD80A01H501A" },
          updated_at: new Date(),
        },
      });
      await tx.athleteGuardian.create({
        data: {
          id: rigaPadre,
          organization_id: CLUB_A,
          athlete_id: atletaId,
          identity_key: PADRE,
          user_id: PADRE,
          email: email("padre"),
          first_name: "Padre",
          last_name: "Tredicesimo",
          relationship: "padre",
          position: 0,
          data: { fiscalCode: "PDRTRD80A01H501B" },
          updated_at: new Date(),
        },
      });
      /* Una terza voce, in posizione 1: serve a §B4 e a §C. */
      await tx.athleteGuardian.create({
        data: {
          id: randomUUID(),
          organization_id: CLUB_A,
          athlete_id: atletaId,
          identity_key: "zia-" + coda,
          email: "zia-" + coda,
          first_name: "Zia",
          last_name: "Tredicesimo",
          relationship: "zia",
          position: 1,
          data: { fiscalCode: "ZIATRD80A01H501C" },
          updated_at: new Date(),
        },
      });
    });
    await tutori.refreshGuardianProjection(prisma, [atletaId]);

    const primaDellaRevoca = await prisma.athlete.findUnique({
      where: { id: atletaId },
    });
    prova(
      "B0 SEMINA — la proiezione fonde le due righe della posizione 0 in una voce",
      [2, "Madre", true],
      [
        (primaDellaRevoca?.data?.guardians || []).length,
        String(primaDellaRevoca?.data?.guardians?.[0]?.name || ""),
        Boolean(primaDellaRevoca?.data?.guardians?.[0]?.linkedUserId),
      ],
      "tre righe, due voci: la fusione per posizione e dichiarata da " +
        "`refreshGuardianProjection` e serve ai tre lettori posizionali",
    );

    /* --- CONTROLLO: prima della revoca la ricevuta e intestata alla voce 0. */
    const fiscalePrima = fiscale.resolveFiscalRecipient(primaDellaRevoca);
    const contattiPrima = contatti.readAthleteGuardianContacts(primaDellaRevoca);
    prova(
      "B1 CONTROLLO — con la voce viva la ricevuta e sua e il canale e aperto",
      ["MDRTRD80A01H501A", true],
      [
        fiscalePrima.fiscalCode,
        contattiPrima.some((voce) => voce.email === email("madre")),
      ],
      "e la prova che questa sezione sa dire VERDE",
    );

    /*
      **La revoca di club della madre.** `revokeGuardianAccessInClub` risparmia
      apposta «una riga che porta l'utenza di qualcun altro»: la riga del padre
      resta viva, alla **stessa** posizione.
    */
    const revocate = await tutori.revokeGuardianAccessInClub(prisma, {
      organizationId: CLUB_A,
      userId: MADRE,
      email: email("madre"),
    });

    const dopoLaRevoca = await prisma.athlete.findUnique({
      where: { id: atletaId },
    });
    const voceFusa = dopoLaRevoca?.data?.guardians?.[0] || {};
    const righeDb = await prisma.athleteGuardian.findMany({
      where: { athlete_id: atletaId },
      orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: { id: true, position: true, revoked_at: true, user_id: true },
    });

    prova(
      "B2 SEMINA — la revoca chiude la madre e risparmia il padre (ADR-0139)",
      [1, true, false],
      [
        revocate,
        Boolean(righeDb.find((r) => r.id === rigaMadre)?.revoked_at),
        Boolean(righeDb.find((r) => r.id === rigaPadre)?.revoked_at),
      ],
      "e la regola scritta: «una riga che porta l'utenza di qualcun altro " +
        "e provatamente di qualcun altro, e non si tocca»",
    );

    prova(
      /*
        **Ri-specificata: la voce fusa mostra il vivo, e non porta il marchio.**

        Chiedeva che la voce non portasse **ne** il marchio **ne** l'utenza del
        vivo. Ma una voce fusa nasce da una difesa — revocare una persona
        risparmia la riga che porta l'utenza di un'altra (ADR-0139) — e dietro
        quella posizione c'e davvero un tutore vivo: pretendere che la voce non
        lo nomini vorrebbe dire farlo sparire dalla scheda.

        Cio che non deve accadere e il **miscuglio**: il marchio di chi e stato
        escluso addosso all'anagrafica di chi non lo e. La voce mostra percio il
        vivo, senza marchio, e il marchio torna solo quando **tutte** le righe
        dietro quella posizione sono escluse.
      */
      "B3 la voce fusa mostra il tutore vivo, e senza il marchio dell'escluso",
      { marchio: false, utenzaDelVivo: true },
      {
        marchio: Boolean(voceFusa.accessRevokedAt),
        utenzaDelVivo: String(voceFusa.linkedUserId || "") === PADRE,
      },
      "la fusione tiene i valori non nulli della riga vista per prima: " +
        JSON.stringify({
          email: voceFusa.email,
          linkedUserId: voceFusa.linkedUserId,
          accessRevokedAt: voceFusa.accessRevokedAt,
        }),
    );

    const contattiDopo = contatti.readAthleteGuardianContacts(dopoLaRevoca);
    prova(
      "B4 CONTROLLO — l'indirizzo della revocata non esce dai canali di invio",
      false,
      contattiDopo.some((voce) => voce.email === email("madre")),
      "IPOTESI FALSIFICATA: `revokedGuardianIdentities` **non** e inerte. " +
        "WP-C lo aveva cancellato come archivio, e `refreshGuardianProjection` " +
        "(athlete-guardians.ts:2432-2500) lo **riderivа** dalle righe a ogni " +
        "scrittura. L'uscita anticipata «un legame dichiarato vince» regge, e " +
        "l'indirizzo revocato viene azzerato. Uscito: " +
        JSON.stringify(contattiDopo.map((v) => v.email)) +
        ". E la prova che questa sezione sa dire VERDE quando la difesa c'e.",
    );

    const fiscaleDopo = fiscale.resolveFiscalRecipient(dopoLaRevoca);
    prova(
      "B5 REPERTO — il co-genitore vivo resta l'intestatario della ricevuta",
      "PDRTRD80A01H501B",
      fiscaleDopo.fiscalCode,
      "dopo 6cda428 `intestabile` scarta la voce fusa per il marchio del " +
        "revocato: il codice fiscale stampato **cambia persona**, che e il " +
        "costo che quello stesso commento dichiara di voler evitare. Trovato: " +
        JSON.stringify({ nome: fiscaleDopo.name, cf: fiscaleDopo.fiscalCode }),
    );

    const valori = segnaposti.buildPlaceholderValues({
      club: { id: CLUB_A, name: "tredicesimo a", settings: {} },
      athlete: dopoLaRevoca,
      season: null,
      now: new Date(),
      charges: [],
      transactions: [],
      paymentPlans: [],
      attendance: { sessions: 0, hours: 0 },
    });
    prova(
      "B6 REPERTO — «genitore 1» resta il co-genitore vivo di quella posizione",
      "Padre",
      String(valori["parent.1.first_name"]?.text || ""),
      "`guardianAt` scarta la voce fusa: il documento perde il genitore vivo. " +
        "`PlaceholderValue` e `{text, html}`, non `{value}`",
    );
  }

  /* ================================================================== *
   * §C — l'ultimo ripiego del destinatario fiscale
   * ================================================================== */
  console.log("\n§C — il terzo ramo di `resolveFiscalRecipient`\n");

  {
    /*
      Il ripiego finale: `if (!athleteRecipient.name && guardians.length)
      return fromGuardian(guardians[0])`. Si misura come funzione **pura**,
      perche e pura: il ramo si raggiunge con un soggetto senza nome.
    */
    const soggetto = {
      first_name: "",
      last_name: "",
      data: {
        guardians: [
          {
            name: "Estraneo",
            surname: "Pubblico",
            fiscalCode: "STRPBB80A01H501Z",
            contactOnly: true,
          },
        ],
      },
    };
    const esito = fiscale.resolveFiscalRecipient(soggetto);
    prova(
      "C0 REPERTO — l'ultimo ripiego non intesta a una riga di solo recapito",
      { name: "", source: "athlete" },
      { name: esito.name, source: esito.source },
      "fiscal-recipient.ts:262 non passa da `intestabile`: la regola di " +
        "ADR-0149 e stata applicata a due rami su tre, dentro la stessa funzione",
    );

    const soggettoRevocato = {
      first_name: "",
      last_name: "",
      data: {
        guardians: [
          {
            name: "Escluso",
            surname: "DalClub",
            fiscalCode: "SCLDLC80A01H501Y",
            accessRevokedAt: new Date().toISOString(),
          },
        ],
      },
    };
    const esitoRevocato = fiscale.resolveFiscalRecipient(soggettoRevocato);
    prova(
      "C1 REPERTO — ne a una riga revocata",
      { name: "", source: "athlete" },
      { name: esitoRevocato.name, source: esitoRevocato.source },
      "stesso ramo, stesso difetto",
    );

    /* --- CONTROLLO: il ramo che la correzione ha chiuso davvero. --- */
    const controllo = fiscale.resolveFiscalRecipient({
      first_name: "Marco",
      last_name: "Rossi",
      data: {
        billingGuardianIndex: 0,
        guardians: [
          {
            name: "Escluso",
            surname: "DalClub",
            fiscalCode: "SCLDLC80A01H501Y",
            accessRevokedAt: new Date().toISOString(),
          },
        ],
      },
    });
    prova(
      "C2 CONTROLLO — il ramo `billingGuardianIndex` la regola la applica",
      "athlete",
      controllo.source,
      "e la prova che questa sezione sa dire VERDE: 6cda428 ha chiuso questo ramo",
    );
  }

  /* ================================================================== *
   * §D — il censimento delle porte, misurato stato per stato
   * ================================================================== */
  console.log(
    "\n§D — larghezza delle porte confrontata con cio che il riscatto accetta\n",
  );

  {
    const STATI = [null, "active", "pending", "sent", "redeemed", "expired"];

    /* Cio che il riscatto accetta, misurato dalla rotta vera. */
    const accettati = [];
    for (const stato of STATI) {
      const idLogico = `trainer-acc-${Math.random().toString(36).slice(2, 9)}`;
      await creaProfilo(CLUB_A, sessA, idLogico, "Porta");
      const valore = `TREDIXST${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const conio = await chiama(
        "POST",
        "/api/v1/access_tokens",
        {
          organization_id: CLUB_A,
          name: valore,
          ...(stato === null ? {} : { status: stato }),
          date: fraUnAnno,
          role: "trainer",
          one_time: true,
          token_type: "trainer_access",
          trainer_id: idLogico,
          expires_at: fraUnAnno,
        },
        sessA,
        "owner",
        CLUB_A,
      );
      const riga = await prisma.clubResourceItem.findFirst({
        where: { organization_id: CLUB_A, resource_type: "access_tokens", name: valore },
      });
      /* Un'utenza fresca a ogni giro: `alreadyLinkedUserId` non e lo stato. */
      const idUtente = randomUUID();
      await prisma.user.create({
        data: utente(idUtente, `porta-${idUtente.slice(0, 8)}-${coda}`, "Porta"),
      });
      const esito = await riscatta(await sessione(idUtente), valore);
      accettati.push({
        stato: riga?.status ?? null,
        conio: conio.stato,
        riscatto: esito.stato,
      });
    }
    console.log(
      "        riscatto per stato: " + JSON.stringify(accettati),
    );

    prova(
      "D0 SEMINA — il riscatto accetta NULL, active, pending, sent; rifiuta expired",
      [200, 200, 200, 200, 410],
      [
        accettati[0].riscatto,
        accettati[1].riscatto,
        accettati[2].riscatto,
        accettati[3].riscatto,
        accettati[5].riscatto,
      ],
      "e la larghezza che ogni porta di revoca deve contenere",
    );

    /* Cio che `chiudiGliInvitiDelProfilo` chiude, stato per stato. */
    const idProfilo = `trainer-porta-${Math.random().toString(36).slice(2, 9)}`;
    const chiusi = {};
    for (const stato of STATI) {
      const id = randomUUID();
      await prisma.clubResourceItem.create({
        data: {
          id,
          organization_id: CLUB_A,
          resource_type: "access_tokens",
          name: `TREDIXCH${id.slice(0, 6)}`,
          status: stato,
          payload: { trainer_id: idProfilo, role: "trainer" },
          updated_at: new Date(),
        },
      });
      chiusi[String(stato)] = id;
    }
    await legami.chiudiGliInvitiDelProfilo(prisma, {
      organizationId: CLUB_A,
      identificativi: [idProfilo],
    });
    const dopoChiusura = {};
    for (const [stato, id] of Object.entries(chiusi)) {
      dopoChiusura[stato] =
        (await prisma.clubResourceItem.findUnique({ where: { id } }))?.status ??
        null;
    }
    prova(
      "D1 — `chiudiGliInvitiDelProfilo` chiude ogni stato che il riscatto accetta",
      {
        null: "revoked",
        active: "revoked",
        pending: "revoked",
        sent: "revoked",
        redeemed: "revoked",
        expired: "revoked",
      },
      dopoChiusura,
      "il filtro `OR` con `status: null` di 6cda428 verificato sul SQL vero",
    );

    /* Cio che `revocaIGettoni` chiude, per la porta gemella del tutore. */
    const atletaPorta = randomUUID();
    await prisma.athlete.create({
      data: {
        id: atletaPorta,
        organization_id: CLUB_A,
        first_name: "Porta",
        last_name: "Tredicesimo",
        status: "active",
        birth_date: new Date("2015-05-05"),
        data: {},
        updated_at: new Date(),
      },
    });
    const rigaTutore = randomUUID();
    await tutori.withGuardianWriter(prisma, async (tx) => {
      await tx.athleteGuardian.create({
        data: {
          id: rigaTutore,
          organization_id: CLUB_A,
          athlete_id: atletaPorta,
          identity_key: "porta-" + coda,
          email: "porta-" + coda,
          first_name: "Porta",
          last_name: "Tutore",
          position: 0,
          updated_at: new Date(),
        },
      });
    });
    const gettoniTutore = {};
    for (const stato of STATI) {
      const id = randomUUID();
      await prisma.clubResourceItem.create({
        data: {
          id,
          organization_id: CLUB_A,
          resource_type: "access_tokens",
          name: `TREDIXTU${id.slice(0, 6)}`,
          status: stato,
          payload: {
            athlete_id: atletaPorta,
            guardian_id: rigaTutore,
            token_type: "parent_access",
            role: "parent",
          },
          updated_at: new Date(),
        },
      });
      gettoniTutore[String(stato)] = id;
    }
    await tutori.revokeGuardianRow(prisma, {
      athleteId: atletaPorta,
      guardianRowId: rigaTutore,
      organizationId: CLUB_A,
    });
    const dopoTutore = {};
    for (const [stato, id] of Object.entries(gettoniTutore)) {
      dopoTutore[stato] =
        (await prisma.clubResourceItem.findUnique({ where: { id } }))?.status ??
        null;
    }
    prova(
      "D2 — `revocaIGettoni` ha la stessa larghezza della porta del profilo",
      {
        null: "revoked",
        active: "revoked",
        pending: "revoked",
        sent: "revoked",
        redeemed: "revoked",
        expired: "revoked",
      },
      dopoTutore,
      "le due porte gemelle si misurano sulla stessa tabella di stati",
    );
  }

  /* ---------------------------------------------------------------- esito */
  const rosse = esiti.filter((voce) => !voce.ok);
  console.log(
    `\n  ${esiti.length - rosse.length}/${esiti.length} verdi, ${rosse.length} FAIL`,
  );
  if (rosse.length) {
    console.log("  ROSSE: " + rosse.map((v) => v.titolo.split(" ")[0]).join(", "));
  }
};

main()
  .catch((errore) => {
    console.error(errore);
    process.exitCode = 1;
  })
  .finally(async () => {
    /* Il club porta via tutto in cascata; le utenze restano e si tolgono. */
    await prisma.club.deleteMany({ where: { id: { in: [CLUB_A, CLUB_B] } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: coda } } });
    await prisma.$disconnect();
  });
