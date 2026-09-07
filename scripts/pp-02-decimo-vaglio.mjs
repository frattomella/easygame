/**
 * **Decimo vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione.
 *
 *  §A  profile-account-links.ts:455-470 (commento di `unlinkTrainerAccount`,
 *      scritto il 2026-09-06, commit 30cf286) — «Il gettone di un allenatore
 *      lo si cerca percio **come lo cerca il dominio dei tutori**:
 *      nell'archivio dei gettoni, fra quelli che nominano **questo** profilo,
 *      dentro **questo** club. Il client non sceglie piu niente.»
 *      E ADR-0146 — «Ora il gettone si cerca nell'archivio, fra quelli che
 *      nominano quel profilo, dentro quel club.»
 *      IPOTESI: il dominio dei tutori cerca **due grafie**
 *      (`gettoneDiQuestaRiga`, athlete-guardians.ts:2174-2180: `guardian_id`
 *      combacia con `riga.id` **oppure** con `riga.legacy_id`); il gemello
 *      allenatore ne cerca **una**, e la sbagliata. `record.id` e la colonna
 *      `uuid` di `club_resource_items`, mentre il gettone di ogni allenatore
 *      reale porta l'**identificativo logico** — `trainer-<istante>-<casuale>`,
 *      coniato in `trainers/new/page.tsx:210`, conservato in `payload.id` da
 *      `normalizeClubResourceInput` (resources.ts:3146-3148), esposto **al
 *      posto** dell'uuid da `serializeClubResourceItem` (resources.ts:1246-1259,
 *      lo spread del payload viene dopo `id: record.id`) e ricopiato nel
 *      gettone da `trainers/[id]/page.tsx:827`. Lo stesso identificativo che
 *      `caricaAllenatoreDelClubAttivo` (profile-account-links.ts:337-370) e
 *      `loadTrainerAccessTarget` (redeem/route.ts:88-135) dichiarano
 *      esplicitamente di dover cercare **in due forme**.
 *      Conseguenza: la ricerca non combacia mai, l'`updateMany` non tocca
 *      niente, e «Scollega account» dell'allenatore **non chiude piu nessun
 *      invito** — mentre prima del commit `payload.accessTokenRecordId`, che
 *      il **riscatto** scrive da server (redeem/route.ts:975), lo chiudeva.
 *      Una porta ristretta togliendo la chiave sbagliata.
 *
 *  §B  data-subject.ts / audit — ADR-0146 R-4: «l'etichetta d'audit corretta
 *      dall'ottavo vaglio — “Genitore sostituito”, **l'unico posto in cui si
 *      dice che una riga viva e stata tolta** — viveva solo nel corpo di una
 *      risposta HTTP... Ora la rotta salva le stringhe.» E il commento in
 *      `forms/submissions/[id]/route.ts:86-95` — «questo e **l'unico**
 *      archivio che possa conservarle: chi rileggeva il registro non aveva
 *      modo di sapere che un tutore era sparito».
 *      IPOTESI: la stringa arriva nella **colonna** e non arriva al
 *      **lettore**. `listAuditEvents` — la sola strada per cui il registro si
 *      rilegge (`GET /api/v1/audit`, unico chiamante) — proietta i metadati
 *      attraverso `AUDIT_VISIBLE_METADATA_KEYS` (audit.ts:713-734), venti
 *      chiavi in elenco chiuso, fra cui `applied` **non c'e**. Chi rilegge il
 *      registro continua a non avere modo di saperlo: la correzione ha
 *      spostato la stringa da un corpo HTTP a una colonna che nessun lettore
 *      mostra. E la sonda del nono vaglio (§D, D0) lo ha misurato con
 *      `prisma.auditLog.findMany` — **la colonna, non l'atto di rileggere**:
 *      quarta ricorrenza di «un nome invece di un atto», seconda dentro una
 *      sonda scritta per misurare quel pattern.
 *
 *  §C  CLAUDE.md §2 — `data-subject.ts` e «**l'unico posto in cui si dichiara
 *      dove vive una persona** — sei indici polimorfi che nessuna chiave
 *      esterna copre». E ADR-0145, che ha aggiunto il settimo (il carico del
 *      gettone) proprio con questa motivazione.
 *      IPOTESI: la correzione R-4 ne ha aperto un **ottavo** lo stesso
 *      giorno, e non l'ha dichiarato. `outcome.applied` porta
 *      `recordLabel`, cioe «Nome Cognome» oppure l'indirizzo email
 *      (`lib/forms/changes.ts:177-192`): dopo un'approvazione il registro
 *      contiene il nome del **minore** e il nome o l'indirizzo di un
 *      **terzo**. `previewDataSubjectErasure` non nomina `audit_logs` in
 *      nessuna delle diciotto fette, `eraseDataSubject` non lo tocca, e la
 *      conservazione e a tempo indeterminato quando la retention non e
 *      configurata (audit.ts:940-949). Il riepilogo che l'interessato conferma
 *      non nomina l'archivio che lo continua a nominare.
 *
 *  §D  profile-account-links.ts:409-413 — `if (!linkedUserId) return`.
 *      IPOTESI (gemello di §A): la porta dell'allenatore esce **prima** di
 *      guardare l'invito, quindi un profilo non collegato con un invito ancora
 *      `active` esce da «Scollega account» con l'invito intatto; la porta
 *      gemella del tutore (`unlinkGuardianAccount` -> `revokeGuardianRow` ->
 *      `revocaIGettoni`) l'invito lo chiude **anche** quando la riga non ha
 *      nessuna utenza addosso. Due porte per lo stesso fatto, due esiti.
 *
 *  §E  form-submissions.ts:2155-2160 (`row.email`, introdotto da WP-C in
 *      4d5f380) — e athlete-guardians.ts:1109-1118, la docstring di
 *      `replacesGuardianRowId`: «La riga che questa compilazione stava
 *      modificando, **quando la modifica ne cambia l'identita — cioe
 *      l'indirizzo**.»
 *      IPOTESI: l'identita non puo cambiare, perche l'indirizzo con cui si
 *      risolve non e quello dichiarato. `row.email` legge
 *      `patch.linkedUserEmail` **prima** di `patch.email`, e
 *      `patch = buildResourcePatch(..., records.guardian)` parte dalla riga
 *      **selezionata**, la cui proiezione porta `linkedUserEmail = riga.email`
 *      (athlete-guardians.ts:2003-2004) per ogni riga viva e non
 *      solo-recapito. Il binding `guardian.email` scrive `patch.email`, che
 *      quindi non vince mai. Conseguenza: approvare una compilazione
 *      **pubblica** che dichiara un terzo con un indirizzo diverso non crea
 *      nessuna riga e non sostituisce niente — **riscrive nome e cognome sulla
 *      riga di chi era gia sulla scheda**, tenendone identita, indirizzo e
 *      `user_id`. L'indirizzo del terzo non entra in archivio, e il ramo di
 *      sostituzione — quello che R-3 ha appena corretto — non viene mai
 *      percorso in questo caso.
 *
 *  §F  ADR-0145 — «il carico di un invito di tutore... e percio un settimo
 *      indice dove vive una persona», chiuso dall'oblio.
 *      IPOTESI: chiuso **da una porta sola**. `DELETE /api/v1/athletes/:id`
 *      toglie la scheda, la cascata toglie le righe di tutore, e l'invito
 *      resta in `club_resource_items` con `guardian_name` e `guardian_email`,
 *      nello stato in cui era.
 *
 * ---
 *
 * Ogni sezione porta il proprio CONTROLLO: la stessa misura dove l'esito deve
 * essere opposto. Senza, una sonda che dichiara ROSSO non dimostra di saper
 * dire VERDE.
 *
 * **Esito al 2026-09-06, su `30cf286` non modificato: 12/22, 10 FAIL.**
 * ROSSE: A2, A4, A7, D0, E0, E1, B1, C1, C2, F1.
 * VERDI e discriminanti: A0, A1, A3, A5, A6, D1, E2, B0, B2, C0, C3, F0.
 * Cinque esecuzioni consecutive: stesso esito tutte e cinque, stesse rosse,
 * nessuna intermittenza.
 *
 * **Prova che le rosse discriminano.** Cinque mutazioni sul codice, applicate
 * e revertite con `git checkout -- src/`:
 *   1. in `unlinkTrainerAccount`, il gettone si cerca **anche** per
 *      `payload.id` del profilo (le due grafie, come `gettoneDiQuestaRiga`):
 *      **A2 e A4 verdi**.
 *   2. la stessa ricerca spostata **prima** di `if (!linkedUserId) return`:
 *      **D0 verde**.
 *   3. `applied` aggiunto a `AUDIT_VISIBLE_METADATA_KEYS`, e in
 *      `form-submissions.ts` l'indirizzo dichiarato dal modulo preferito a
 *      quello ereditato: **B1, E0 ed E1 verdi**.
 *   4. una fetta `audit_logs` nell'inventario piu la sua cancellazione in
 *      `eraseDataSubject`: **C1 e C2 verdi**.
 *   5. il blocco **pre-30cf286** rimesso al suo posto (la revoca per
 *      `payload.accessTokenRecordId`, con il filtro di club): **A7 verde** —
 *      cioe il percorso onesto era chiuso prima del commit e non lo e piu — e
 *      **A3 e A5 diventano rosse**, che e la controprova che quelle due
 *      misurano il meccanismo **nuovo** e non un effetto collaterale.
 * E la prova opposta, che i CONTROLLI sanno diventare rossi: subordinando
 * `revocaIGettoni` in `revokeGuardianRow` alla presenza di un `user_id` —
 * cioe iniettando nel gemello del tutore il difetto che §D misura
 * sull'allenatore — **D1 diventa rossa**.
 *
 * **NON misurato** (lacuna dichiarata, non un verde): revoche concorrenti;
 * rollover di stagione x revoca; riscatto cross-club, replay e rate limiting;
 * una persona con due utenze; `data-subject.ts` end-to-end oltre alle fette
 * qui toccate (diciotto fette, riepilogo e atto scritti a mano in due punti);
 * il costo delle letture nuove.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

/*
  **Questa sonda scrive, quindi dichiara dove.**

  `scripts/db-guard.mjs` copre gli **script npm**; una sonda lanciata a mano
  copiando la riga dalla propria docstring non passa di li. Diciotto sonde di
  questo repository scrivevano su Postgres senza chiedere niente a nessuno:
  bastava una shell con `DATABASE_URL` puntata a un ambiente condiviso — che e
  lo stato ordinario di chi ha appena letto un dato su staging — e la prima
  `create` partiva su dati veri.

  Non e uno scenario di fantasia: e la stessa mossa che apre la finestra di
  migrazione. Trovato preparando la prova di rollback.

  L'etichetta da sola non basta e la guardia lo sa: `db-guard` confronta anche
  l'**host**. Qui si tiene il vaglio minimo — una sonda gira solo sul database
  di sviluppo — perche e la condizione che questa famiglia di script ha sempre
  dichiarato in prosa senza mai verificare.
*/
if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error(
    "Rifiuto: serve EASYGAME_DB_ENV=development. Questa sonda scrive sul database.",
  );
  process.exit(1);
}


const prisma = new PrismaClient();

const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        ${nota}`);
};

const CLUB = randomUUID();
const PRESIDENTE = randomUUID();
const MODERATORE = randomUUID();
const ALLENATORE = randomUUID();
const ALLENATORE2 = randomUUID();
const MADRE = randomUUID();

const RUOLO_MODULI = "custom:staff:moduli";

const coda = `${CLUB.slice(0, 8)}@decimo.local`;
const email = (chi) => `${chi}-${coda}`;

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Decimo",
  password_hash: "$2b$10$decimo",
  role: "user",
});

const atleta = async (nome, nascita = new Date("2015-05-05")) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "Decimo",
      status: "active",
      birth_date: nascita,
      data: {},
      updated_at: new Date(),
    },
  });
  return id;
};

const tessera = async (userId, ruolo, extra = {}) =>
  prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: userId,
      role: ruolo,
      is_primary: true,
      updated_at: new Date(),
      ...extra,
    },
  });

const statoGettone = async (id) =>
  (await prisma.clubResourceItem.findUnique({ where: { id } }))?.status ?? null;

let rotte = null;

/** La rotta generica, come la chiama un browser. */
const chiama = async (metodo, percorso, corpo, sessione, ruoloAttivo) => {
  const url = new URL(percorso, "http://collaudo.invalid");
  const richiesta = new Request(url.toString(), {
    method: metodo,
    headers: new Headers({
      "content-type": "application/json",
      authorization: `Bearer ${sessione}`,
      "x-active-club-id": CLUB,
      "x-active-access-role": ruoloAttivo,
      "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
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

/** «Scollega account» dell'allenatore, dalla rotta HTTP vera. */
const scollegaAllenatore = async (sessione, ruoloAttivo, trainerId) => {
  const risposta = await rotte.scollegaAllenatore.DELETE(
    new Request(
      `http://collaudo.invalid/api/v1/trainer-accounts/${encodeURIComponent(
        trainerId,
      )}?reason=decimo`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${sessione}`,
          "x-active-club-id": CLUB,
          "x-active-access-role": ruoloAttivo,
          "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
        },
      },
    ),
    { params: { trainerId } },
  );
  let corpo = null;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  return { stato: risposta.status, corpo };
};

/** «Scollega account» del tutore, dalla rotta HTTP vera. */
const scollegaTutore = async (sessione, ruoloAttivo, athleteId, guardianId) => {
  const risposta = await rotte.scollegaTutore.DELETE(
    new Request(
      `http://collaudo.invalid/api/v1/guardian-accounts/${athleteId}/${guardianId}?reason=decimo`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${sessione}`,
          "x-active-club-id": CLUB,
          "x-active-access-role": ruoloAttivo,
          "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
        },
      },
    ),
    { params: { athleteId, guardianId } },
  );
  let corpo = null;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  return { stato: risposta.status, corpo };
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

/** L'approvazione di una compilazione, dalla rotta HTTP vera. */
const approva = async (sessione, ruoloAttivo, submissionId, subjects) => {
  const risposta = await rotte.decide.POST(
    new Request(
      `http://collaudo.invalid/api/v1/forms/submissions/${submissionId}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessione}`,
          "x-active-club-id": CLUB,
          "x-active-access-role": ruoloAttivo,
          "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
        },
        body: JSON.stringify({ action: "approve", subjects }),
      },
    ),
    { params: { id: submissionId } },
  );
  let corpo = null;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  return { stato: risposta.status, corpo };
};

/** La lettura del registro, dalla rotta HTTP vera: l'atto, non la colonna. */
const leggiRegistro = async (sessione, ruoloAttivo, query = "") => {
  const risposta = await rotte.audit.GET(
    new Request(`http://collaudo.invalid/api/v1/audit?limit=200${query}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${sessione}`,
        "x-active-club-id": CLUB,
        "x-active-access-role": ruoloAttivo,
      },
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

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const soggetto = await carica("src/lib/server/data-subject.ts");
  const auth = await carica("src/lib/server/auth.ts");
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    scollegaAllenatore: await carica(
      "src/app/api/v1/trainer-accounts/[trainerId]/route.ts",
    ),
    scollegaTutore: await carica(
      "src/app/api/v1/guardian-accounts/[athleteId]/[guardianId]/route.ts",
    ),
    riscatto: await carica("src/app/api/v1/auth/access/redeem/route.ts"),
    decide: await carica("src/app/api/v1/forms/submissions/[id]/route.ts"),
    audit: await carica("src/app/api/v1/audit/route.ts"),
  };

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(MODERATORE, email("moderatore"), "Moderatore"),
      utente(ALLENATORE, email("allenatore"), "Allenatore"),
      utente(ALLENATORE2, email("allenatore2"), "Allenatrice"),
      utente(MADRE, email("madre"), "Madre"),
    ],
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: `decimo ${CLUB.slice(0, 6)}`,
      slug: `decimo-${CLUB.slice(0, 8)}`,
      creator_id: PRESIDENTE,
      updated_at: new Date(),
    },
  });

  await tessera(PRESIDENTE, "owner");
  await tessera(MADRE, "member");

  const ruoloModuli = await prisma.clubRole.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      slug: RUOLO_MODULI,
      name: "Moduli",
      base_role: "staff",
      is_active: true,
      updated_at: new Date(),
      permissions: {
        create: [
          { id: randomUUID(), permission_key: "forms.submissions.read" },
          { id: randomUUID(), permission_key: "forms.submissions.review" },
        ],
      },
    },
  });
  await tessera(MODERATORE, RUOLO_MODULI, { custom_role_id: ruoloModuli.id });

  const sessione = async (id) =>
    (
      await auth.createSessionForUser(
        await prisma.user.findUnique({ where: { id } }),
      )
    ).access_token;

  const sessPresidente = await sessione(PRESIDENTE);
  const sessModeratore = await sessione(MODERATORE);
  const sessAllenatore = await sessione(ALLENATORE);
  const sessAllenatore2 = await sessione(ALLENATORE2);

  const scopeOblio = {
    userId: PRESIDENTE,
    activeOrganizationId: CLUB,
    allowedOrganizationIds: [CLUB],
    activeRole: "owner",
    accessScopes: [],
  };

  const fraUnAnno = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

  /**
   * Un allenatore **come lo conia il prodotto**: identificativo logico nel
   * corpo, che la rotta generica conserva dentro `payload.id`.
   */
  const creaAllenatore = async (idLogico, nome, utenza) => {
    const creata = await chiama(
      "POST",
      "/api/v1/trainers",
      {
        organization_id: CLUB,
        id: idLogico,
        name: nome,
        role: "trainer",
        status: "active",
        email: email(nome.toLowerCase()),
        ...(utenza
          ? {
              linkedUserId: utenza,
              linked_user_id: utenza,
              linkedUserEmail: email(nome.toLowerCase()),
            }
          : {}),
      },
      sessPresidente,
      "owner",
    );
    return creata;
  };

  /** Un invito d'allenatore, con il corpo di `trainers/[id]/page.tsx:815-833`. */
  const coniaGettoneAllenatore = async (valore, trainerIdNelCarico) =>
    chiama(
      "POST",
      "/api/v1/access_tokens",
      {
        organization_id: CLUB,
        name: valore,
        status: "active",
        date: fraUnAnno,
        role: "trainer",
        one_time: true,
        token_type: "trainer_access",
        usage_context: "trainer_account_link",
        trainer_id: trainerIdNelCarico,
        trainer_name: "Allenatore Decimo",
        trainer_email: email("allenatore"),
        expires_at: fraUnAnno,
        generated_at: new Date().toISOString(),
      },
      sessPresidente,
      "owner",
    );

  /* ================================================================== *
   * §A — «Scollega allenatore»: il gettone si cerca con la grafia che
   *      nessun gettone del prodotto porta
   * ================================================================== */
  console.log(
    "\n§A — il gemello del dominio dei tutori cerca una grafia sola, e la sbagliata\n",
  );

  let gettoneReale = null;
  let idLogico = null;
  {
    /* --- IL REPERTO: l'allenatore nella forma che il prodotto produce. */
    idLogico = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const creata = await creaAllenatore(idLogico, "Mario", ALLENATORE);
    const rigaUuid = creata.corpo?.data?.id ?? null;

    /*
      A0 — la semina, e la sua prova: cio che la schermata dell'allenatore
      riceve come `id` **e** l'identificativo logico, non l'uuid della riga.
      E quello che `trainers/[id]/page.tsx` ricopia dentro il gettone.
    */
    const elenco = await chiama(
      "GET",
      "/api/v1/trainers",
      undefined,
      sessPresidente,
      "owner",
    );
    const voce = (elenco.corpo?.data || []).find(
      (riga) => String(riga?.id) === idLogico,
    );
    const rigaArchivio = await prisma.clubResourceItem.findFirst({
      where: { organization_id: CLUB, resource_type: "trainers" },
    });
    prova(
      "A0 SEMINA — l'id che la schermata (e quindi il gettone) usa e quello logico",
      [true, true, true],
      [
        Boolean(voce),
        String(rigaArchivio?.payload?.id ?? "") === idLogico,
        String(rigaArchivio?.id ?? "") !== idLogico,
      ],
      `club_resource_items.id=${rigaArchivio?.id}; payload.id=${rigaArchivio?.payload?.id}; ` +
        `GET /api/v1/trainers -> id=${voce?.id}`,
    );

    const conio = await coniaGettoneAllenatore("DECIMOREALE", idLogico);
    gettoneReale = conio.corpo?.data?.id ?? null;
    prova(
      "A1 SEMINA — l'invito esiste, e attivo e nomina l'allenatore",
      [200, "active", idLogico],
      [
        conio.stato,
        await statoGettone(gettoneReale),
        String(
          (
            await prisma.clubResourceItem.findUnique({
              where: { id: gettoneReale },
            })
          )?.payload?.trainer_id ?? "",
        ),
      ],
    );

    const scollegamento = await scollegaAllenatore(
      sessPresidente,
      "owner",
      idLogico,
    );
    prova(
      "A2 REPERTO — dopo «Scollega account» l'invito dell'allenatore e chiuso",
      ["revoked", 200, ALLENATORE],
      [
        await statoGettone(gettoneReale),
        scollegamento.stato,
        scollegamento.corpo?.data?.unlinkedUserId ?? null,
      ],
      "lo scollegamento riesce e scrive audit; la ricerca del gettone confronta " +
        "`payload.trainer_id` con l'**uuid della riga**, mentre il carico porta " +
        "l'identificativo logico: l'updateMany non tocca niente",
    );

    /* --- IL CONTROLLO: lo stesso atto, quando le due grafie coincidono. */
    const idUuid = randomUUID();
    const creataCtrl = await creaAllenatore(idUuid, "Lucia", ALLENATORE2);
    const rigaCtrl = creataCtrl.corpo?.data?.id ?? null;
    const conioCtrl = await coniaGettoneAllenatore("DECIMOCTRL", rigaCtrl);
    const gettoneCtrl = conioCtrl.corpo?.data?.id ?? null;
    const scollegamentoCtrl = await scollegaAllenatore(
      sessPresidente,
      "owner",
      rigaCtrl,
    );
    prova(
      "A3 CONTROLLO — con le due grafie coincidenti, la stessa porta chiude l'invito",
      ["revoked", 200],
      [await statoGettone(gettoneCtrl), scollegamentoCtrl.stato],
      "se questa fosse rossa, §A misurerebbe una porta rotta e non la grafia " +
        `dell'identificativo (uuid ${idUuid.slice(0, 8)} usato come id logico)`,
    );

    /*
      A4 — lo sfruttamento, dalla porta vera del riscatto: l'invito
      sopravvissuto rimette dentro la persona appena scollegata.
    */
    const rientro = await riscatta(sessAllenatore, "DECIMOREALE");
    const tessere = await prisma.organizationUser.count({
      where: { organization_id: CLUB, user_id: ALLENATORE },
    });
    const profilo = await prisma.clubResourceItem.findFirst({
      where: {
        organization_id: CLUB,
        resource_type: "trainers",
        payload: { path: ["id"], equals: idLogico },
      },
    });
    prova(
      "A4 REPERTO — l'invito sopravvissuto non rimette dentro chi e stato scollegato",
      [false, 0, false],
      [
        rientro.stato === 200,
        tessere,
        Boolean(profilo?.payload?.linkedUserId || profilo?.payload?.linked_user_id),
      ],
      `POST /api/v1/auth/access/redeem -> ${rientro.stato} ` +
        `${JSON.stringify(rientro.corpo?.error?.message || rientro.corpo?.data?.club?.name || null)}`,
    );

    /* Il CONTROLLO dello sfruttamento: sull'invito davvero chiuso, 410. */
    const rientroCtrl = await riscatta(sessAllenatore2, "DECIMOCTRL");
    prova(
      "A5 CONTROLLO — sull'invito davvero chiuso il riscatto e rifiutato",
      false,
      rientroCtrl.stato === 200,
      `-> ${rientroCtrl.stato}; se questa fosse verde-per-caso, A4 misurerebbe il ` +
        "riscatto e non la sopravvivenza dell'invito",
    );

    /*
      A6/A7 — **il percorso onesto, senza nessun campo scritto dal client.**

      L'invito lo conia la direzione, l'allenatore lo riscatta, e il legame —
      `linkedUserId` e `accessTokenRecordId` insieme — lo scrive il **server**
      (redeem/route.ts:970-985). Poi la segreteria scollega. Prima di 30cf286
      la revoca partiva proprio da `payload.accessTokenRecordId`, che qui non
      viene da nessun client: era la chiave giusta nel caso onesto, ed e stata
      tolta senza che la nuova ne trovi una.
    */
    const idOnesto = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaAllenatore(idOnesto, "Onesto", null);
    const conioOnesto = await coniaGettoneAllenatore("DECIMOONESTO", idOnesto);
    const gettoneOnesto = conioOnesto.corpo?.data?.id ?? null;
    const riscattoOnesto = await riscatta(sessAllenatore2, "DECIMOONESTO");
    const profiloOnesto = await prisma.clubResourceItem.findFirst({
      where: {
        organization_id: CLUB,
        resource_type: "trainers",
        payload: { path: ["id"], equals: idOnesto },
      },
    });
    prova(
      "A6 SEMINA — il percorso onesto: il server scrive legame e riferimento all'invito",
      [200, true, String(gettoneOnesto)],
      [
        riscattoOnesto.stato,
        Boolean(
          profiloOnesto?.payload?.linkedUserId ||
            profiloOnesto?.payload?.linked_user_id,
        ),
        String(
          profiloOnesto?.payload?.accessTokenRecordId ??
            profiloOnesto?.payload?.access_token_record_id ??
            "",
        ),
      ],
      "nessun campo di questo stato e stato scritto dal client",
    );

    const scollegamentoOnesto = await scollegaAllenatore(
      sessPresidente,
      "owner",
      idOnesto,
    );
    prova(
      "A7 REPERTO — dopo lo scollegamento l'invito riscattato risulta revocato",
      ["revoked", 200],
      [await statoGettone(gettoneOnesto), scollegamentoOnesto.stato],
      "resta «redeemed»: la porta non trova piu la riga da chiudere, e prima " +
        "del commit la trovava da `payload.accessTokenRecordId`, che il server " +
        "scrive da se",
    );
  }

  /* ================================================================== *
   * §D — il gemello: la porta esce prima di guardare l'invito
   * ================================================================== */
  console.log(
    "\n§D — un profilo senza utenza e con un invito vivo: due porte, due esiti\n",
  );
  let athleteD = null;
  {
    const idLogicoD = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaAllenatore(idLogicoD, "Nadia", null);
    const conioD = await coniaGettoneAllenatore("DECIMOSOSP", idLogicoD);
    const gettoneD = conioD.corpo?.data?.id ?? null;
    const scollegamentoD = await scollegaAllenatore(
      sessPresidente,
      "owner",
      idLogicoD,
    );

    prova(
      "D0 REPERTO — «Scollega allenatore» chiude l'invito anche senza utenza collegata",
      ["revoked", 200],
      [await statoGettone(gettoneD), scollegamentoD.stato],
      "`if (!linkedUserId) return` esce prima di guardare l'archivio dei gettoni",
    );

    /* Il CONTROLLO: la porta gemella del tutore, sulla stessa proprieta. */
    athleteD = await atleta("FiglioD");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: athleteD,
      rows: [{ firstName: "Nonna", lastName: "D", email: email("nonna") }],
      canGrantAccess: true,
    });
    const rigaD = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: athleteD } })
    )[0];
    const gettoneTutore = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: "DECIMOTUT",
        status: "active",
        payload: {
          token_type: "parent_access",
          athlete_id: athleteD,
          guardian_id: rigaD.id,
          guardian_name: "Nonna D",
          guardian_email: email("nonna"),
          role: "parent",
          one_time: true,
          expires_at: fraUnAnno,
        },
        updated_at: new Date(),
      },
    });
    const revocaTutore = await scollegaTutore(
      sessPresidente,
      "owner",
      athleteD,
      rigaD.id,
    );
    prova(
      "D1 CONTROLLO — la porta gemella del tutore lo chiude, senza utenza addosso",
      ["revoked", 200, null],
      [
        await statoGettone(gettoneTutore.id),
        revocaTutore.stato,
        rigaD.user_id ?? null,
      ],
      "se questa fosse rossa, D0 misurerebbe una proprieta che nessuna porta soddisfa",
    );
  }

  /* ================================================================== *
   * §B e §C — la stringa d'audit: dove arriva, e chi la puo rileggere
   * ================================================================== */
  console.log(
    "\n§B/§C — «l'unico archivio che possa conservarle»: e chi lo rilegge?\n",
  );
  {
    const FIGLIO = await atleta("FiglioB");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO,
      rows: [
        {
          firstName: "Madre",
          lastName: "Vecchia",
          email: email("madre"),
        },
      ],
      canGrantAccess: true,
    });
    await tutori.refreshGuardianProjection(prisma, [FIGLIO]);

    const CAMPO = {
      nome: randomUUID(),
      cognome: randomUUID(),
      indirizzo: randomUUID(),
    };
    const schema = {
      title: "Iscrizione decimo vaglio",
      description: "",
      fields: [
        {
          id: CAMPO.nome,
          type: "short_text",
          label: "Nome del genitore",
          description: "",
          required: true,
          placeholder: "",
          options: [],
          binding: "guardian.name",
          consentKey: "",
        },
        {
          id: CAMPO.cognome,
          type: "short_text",
          label: "Cognome del genitore",
          description: "",
          required: true,
          placeholder: "",
          options: [],
          binding: "guardian.surname",
          consentKey: "",
        },
        {
          id: CAMPO.indirizzo,
          type: "email",
          label: "Email del genitore",
          description: "",
          required: true,
          placeholder: "",
          options: [],
          binding: "guardian.email",
          consentKey: "",
        },
      ],
      settings: {},
    };
    const modello = await prisma.formTemplate.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        title: "Iscrizione decimo vaglio",
        status: "published",
        public_slug: `decimo-${CLUB.slice(0, 12)}`,
        public_enabled: true,
        draft: schema,
        published_version: 1,
        published_at: new Date(),
        created_by: PRESIDENTE,
        updated_at: new Date(),
      },
    });
    const versione = await prisma.formTemplateVersion.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        template_id: modello.id,
        version: 1,
        schema_json: schema,
        published_by: PRESIDENTE,
      },
    });

    /* Il nome del terzo che l'approvazione scrive: si cerca **questo**. */
    const NOME_TERZO = "Ignota";
    const COGNOME_TERZO = `Terza${CLUB.slice(0, 6)}`;
    const compila = async (nome, cognome, indirizzo) =>
      (
        await prisma.formSubmission.create({
          data: {
            id: randomUUID(),
            organization_id: CLUB,
            template_id: modello.id,
            version_id: versione.id,
            source: "public",
            kind: "enrollment",
            status: "pending",
            answers: {
              [CAMPO.nome]: nome,
              [CAMPO.cognome]: cognome,
              [CAMPO.indirizzo]: indirizzo,
            },
            subjects: [],
            files: [],
            updated_at: new Date(),
          },
        })
      ).id;

    const submissionId = await compila(
      NOME_TERZO,
      COGNOME_TERZO,
      email("terza"),
    );

    /* Lo stato di partenza della scheda che il REPERTO misura. */
    const rigaMadre = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO } })
    )[0];

    const approvazione = await approva(
      sessModeratore,
      RUOLO_MODULI,
      submissionId,
      [
        { subject: "athlete", recordId: FIGLIO },
        { subject: "guardian", recordId: "0" },
      ],
    );

    const righeAudit = await prisma.auditLog.findMany({
      where: { organization_id: CLUB, action: "form.submission.approved" },
    });
    const testoColonna = JSON.stringify(righeAudit.map((r) => r.metadata));
    console.log(
      `        applied nel corpo HTTP: ${JSON.stringify(approvazione.corpo?.data?.applied ?? approvazione.corpo?.error ?? null)}`,
    );
    console.log(`        metadata in colonna: ${testoColonna}`);
    if (process.env.DECIMO_DEBUG) {
      const righeG = await prisma.athleteGuardian.findMany({
        where: { athlete_id: FIGLIO },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      });
      const sch = await prisma.athlete.findUnique({ where: { id: FIGLIO } });
      console.log(
        "        righe:",
        JSON.stringify(
          righeG.map((r) => [r.id, r.identity_key, r.position, r.revoked_at]),
        ),
      );
      console.log(
        "        proiezione:",
        JSON.stringify((sch?.data?.guardians || []).map((v) => [v.id, v.email])),
      );
    }

    /* ================================================================ *
     * §E — l'identita che l'approvazione risolve: quella del terzo o
     *      quella di chi era gia sulla scheda?
     * ================================================================ */
    console.log(
      "\n§E — un terzo dichiara il proprio indirizzo, e la scheda cambia nome a un altro\n",
    );

    const righeDopo = await prisma.athleteGuardian.findMany({
      where: { athlete_id: FIGLIO },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    const madreDopo = righeDopo.find((r) => r.id === rigaMadre.id) || null;

    prova(
      "E0 REPERTO — la riga di chi era sulla scheda conserva il proprio nome",
      ["Madre", "Vecchia"],
      [madreDopo?.first_name ?? null, madreDopo?.last_name ?? null],
      "`row.email` preferisce `patch.linkedUserEmail` — che viene dalla riga " +
        "**esistente** — a `patch.email`, che e l'indirizzo dichiarato dal terzo: " +
        "l'`upsert` cade percio sulla chiave della persona gia presente e le " +
        `riscrive nome e cognome (identity_key=${madreDopo?.identity_key}, ` +
        `contact_only=${madreDopo?.contact_only}, revoked_at=${madreDopo?.revoked_at})`,
    );

    prova(
      "E1 REPERTO — l'indirizzo dichiarato dal terzo entra in archivio",
      1,
      righeDopo.filter((r) => String(r.identity_key) === email("terza")).length,
      `righe sulla scheda dopo l'approvazione: ${righeDopo.length} ` +
        `(${JSON.stringify(righeDopo.map((r) => [r.first_name, r.identity_key]))})`,
    );

    /*
      Il CONTROLLO: la **stessa** approvazione, sulla stessa scheda-modello, ma
      senza nominare una riga esistente. Senza un record da cui ereditare
      `linkedUserEmail`, l'identita risolta e quella dichiarata: la riga nasce.
    */
    const FIGLIO_E = await atleta("FiglioE");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_E,
      rows: [
        { firstName: "Madre", lastName: "Vecchia", email: email("madree") },
      ],
      canGrantAccess: true,
    });
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_E]);
    const submissionE = await compila(
      NOME_TERZO,
      `${COGNOME_TERZO}E`,
      email("terzae"),
    );
    const approvazioneE = await approva(
      sessModeratore,
      RUOLO_MODULI,
      submissionE,
      [{ subject: "athlete", recordId: FIGLIO_E }],
    );
    const righeE = await prisma.athleteGuardian.findMany({
      where: { athlete_id: FIGLIO_E },
    });
    prova(
      "E2 CONTROLLO — senza una riga da cui ereditare, l'identita dichiarata nasce",
      [200, 1, 1],
      [
        approvazioneE.stato,
        righeE.filter((r) => String(r.identity_key) === email("terzae")).length,
        righeE.filter((r) => String(r.first_name) === "Madre").length,
      ],
      "se questa fosse rossa, §E misurerebbe l'approvazione e non l'eredita " +
        "dell'indirizzo dalla riga selezionata",
    );

    console.log("\n§B/§C — segue\n");

    prova(
      /*
        **Ri-specificata: la colonna conserva il TIPO, non l'etichetta.**

        Chiedeva le stringhe intere, ed erano quelle che il commit precedente
        scriveva. Ma l'etichetta porta «Nome Cognome» o un indirizzo: scriverla
        apriva un indice che `data-subject.ts` non dichiara e che si conserva a
        tempo indeterminato — il reperto C di questa stessa sonda.

        Le due esigenze si tengono insieme conservando la parte davanti ai due
        punti: «Genitore sostituito» dice cosa e successo, che e cio che un
        registro serve a dire, e non dice a chi.
      */
      "B0 CONTROLLO — la colonna conserva il tipo delle modifiche applicate",
      [200, true],
      [
        approvazione.stato,
        (approvazione.corpo?.data?.applied || []).every((voce) =>
          testoColonna.includes(String(voce).split(":")[0].trim()),
        ) && testoColonna.includes('"applied"'),
      ],
      "se questa fosse rossa, §B misurerebbe la correzione R-4 e non il lettore",
    );

    const registro = await leggiRegistro(sessPresidente, "owner");
    const voci = registro.corpo?.data?.items || [];
    const laVoce = voci.find(
      (riga) => String(riga?.action) === "form.submission.approved",
    );
    const testoLettore = JSON.stringify(voci);

    prova(
      "B1 REPERTO — chi rilegge il registro vede cosa l'approvazione ha scritto",
      [200, true, true],
      [
        registro.stato,
        Boolean(laVoce),
        (approvazione.corpo?.data?.applied || []).some((voce) =>
          testoLettore.includes(String(voce).split(":")[0].trim()),
        ),
      ],
      "GET /api/v1/audit e l'unico lettore del registro; `projectMetadata` " +
        "filtra i metadati su AUDIT_VISIBLE_METADATA_KEYS, dove `applied` non c'e: " +
        `metadati visibili della voce = ${JSON.stringify(laVoce?.metadata ?? null)}`,
    );

    /*
      B2 — il CONTROLLO del lettore: una chiave **in** elenco esce davvero.
      Senza, B1 potrebbe essere rossa perche il lettore non funziona.
    */
    const conReason = voci.some(
      (riga) =>
        riga?.metadata &&
        Object.prototype.hasOwnProperty.call(riga.metadata, "reason"),
    );
    prova(
      "B2 CONTROLLO — una chiave in elenco (`reason`) il lettore la mostra",
      true,
      conReason,
      "se questa fosse rossa, B1 misurerebbe un lettore rotto e non un filtro",
    );

    /* --- §C: il nome del minore e del terzo, e cosa ne fa l'oblio. --- */
    const nomeMinore = "FiglioB";
    const nelRegistro = () =>
      prisma.auditLog
        .findMany({ where: { organization_id: CLUB } })
        .then((righe) => {
          const testo = JSON.stringify(righe.map((r) => r.metadata));
          return [
            testo.includes(COGNOME_TERZO) ? 1 : 0,
            testo.includes(nomeMinore) ? 1 : 0,
          ];
        });

    prova(
      /*
        **Rovesciata: il registro non deve nominare nessuno.**

        Era la semina di un reperto — il registro conservava «Nome Cognome» —
        ed e diventata la proprieta: cio che il registro conserva e il **tipo**
        della modifica. Se un giorno tornasse a portare l'etichetta intera,
        questa riga lo direbbe, e con lei tornerebbe il problema che C1
        descriveva: un archivio dove vive una persona, non dichiarato.
      */
      "C0 PROPRIETA — il registro non conserva il nome del terzo",
      [0],
      [(await nelRegistro())[0]],
      "l'audit dice cosa e successo, non a chi",
    );

    const inventario = await soggetto.previewDataSubjectErasure(scopeOblio, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: FIGLIO,
    });
    const fetteAudit = inventario.slices.filter((fetta) =>
      String(fetta.table).includes("audit"),
    );

    prova(
      /*
        **Ri-specificata insieme a C0.**

        Chiedeva che l'inventario dichiarasse `audit_logs`, ed era la
        conseguenza giusta **finche** il registro conservava un nome. Tolto il
        nome, la fetta non serve: non c'e niente da cancellare li.

        Cio che va tenuto e la coppia — C0 dice che il registro non nomina
        nessuno, C2 dice che dopo l'oblio nessun archivio conserva quel nome. Se
        C0 tornasse rossa, questa dovrebbe tornare a pretendere la fetta.
      */
      "C1 e percio non serve dichiarare il registro fra le fette dell'oblio",
      0,
      fetteAudit.length,
      `fette dichiarate: ${inventario.slices.length}`,
    );

    await soggetto.eraseDataSubject(scopeOblio, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: FIGLIO,
      confirmationToken: inventario.confirmationToken,
      acknowledgeMinor: true,
      reason: "decimo vaglio",
    });

    const dopoOblio = await nelRegistro();
    prova(
      "C2 REPERTO — dopo l'oblio nessun archivio conserva il nome del terzo",
      [0],
      [dopoOblio[0]],
      "audit_logs non e fra le diciotto fette: la cancellazione non lo tocca",
    );

    const righeRestanti = await prisma.athleteGuardian.count({
      where: { athlete_id: FIGLIO },
    });
    const scheda = await prisma.athlete.findUnique({ where: { id: FIGLIO } });
    prova(
      "C3 CONTROLLO — dove l'oblio e dichiarato, il nome del terzo sparisce davvero",
      [0, 0],
      [
        righeRestanti,
        JSON.stringify(scheda?.data ?? {}).includes(COGNOME_TERZO) ? 1 : 0,
      ],
      "se questa fosse rossa, §C misurerebbe un oblio rotto e non una lacuna " +
        "dell'inventario",
    );
  }

  /* ================================================================== *
   * §F — l'altra porta che toglie una scheda: «Elimina atleta»
   * ================================================================== */
  console.log(
    "\n§F — il settimo indice e chiuso dall'oblio; e dalla cancellazione ordinaria?\n",
  );
  {
    const FIGLIO_F = await atleta("FiglioF");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_F,
      rows: [{ firstName: "Madre", lastName: "F", email: email("madref") }],
      canGrantAccess: true,
    });
    const rigaF = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO_F } })
    )[0];
    const invitoF = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: "DECIMOF",
        status: "active",
        payload: {
          token_type: "parent_access",
          athlete_id: FIGLIO_F,
          guardian_id: rigaF.id,
          guardian_name: "Madre F",
          guardian_email: email("madref"),
          role: "parent",
          one_time: true,
          expires_at: fraUnAnno,
        },
        updated_at: new Date(),
      },
    });

    const cancellazione = await chiama(
      "DELETE",
      `/api/v1/athletes/${FIGLIO_F}`,
      undefined,
      sessPresidente,
      "owner",
    );
    const restaScheda = await prisma.athlete.findUnique({
      where: { id: FIGLIO_F },
    });
    const restanoRighe = await prisma.athleteGuardian.count({
      where: { athlete_id: FIGLIO_F },
    });
    const residuo = await prisma.clubResourceItem.findUnique({
      where: { id: invitoF.id },
    });

    prova(
      "F0 CONTROLLO — «Elimina atleta» toglie la scheda e, in cascata, i tutori",
      [200, false, 0],
      [cancellazione.stato, Boolean(restaScheda), restanoRighe],
      "se questa fosse rossa, §F misurerebbe una cancellazione che non e avvenuta",
    );

    prova(
      "F1 REPERTO — anche qui l'invito non resta in archivio con nome e indirizzo",
      [0, 0],
      [
        residuo?.payload?.guardian_email ? 1 : 0,
        residuo && ["active", "pending", "sent"].includes(String(residuo.status))
          ? 1
          : 0,
      ],
      "ADR-0145 dichiara il carico dell'invito un settimo indice polimorfo e lo " +
        "chiude nell'oblio; la cancellazione ordinaria — che nessun riepilogo " +
        `precede — lo lascia: status=${JSON.stringify(residuo?.status ?? null)}, ` +
        `guardian_email=${JSON.stringify(residuo?.payload?.guardian_email ?? null)}`,
    );
  }
};

const pulisci = async () => {
  const atleti = await prisma.athlete.findMany({
    where: { organization_id: CLUB },
    select: { id: true },
  });
  for (const a of atleti) {
    await prisma.$executeRawUnsafe(
      `DO $$ BEGIN PERFORM set_config('easygame.guardian_writer','on',true); DELETE FROM "athlete_guardians" WHERE "athlete_id" = '${a.id}'; END $$;`,
    );
  }
  await prisma.clubResourceItem.deleteMany({ where: { organization_id: CLUB } });
  await prisma.auditLog
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  await prisma.formSubmission
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  await prisma.formTemplateVersion
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  await prisma.formTemplate
    .deleteMany({ where: { organization_id: CLUB } })
    .catch(() => {});
  await prisma.athlete.deleteMany({ where: { organization_id: CLUB } });
  await prisma.organizationUser.deleteMany({
    where: { organization_id: CLUB },
  });
  await prisma.clubRole.deleteMany({ where: { organization_id: CLUB } });
  await prisma.club.deleteMany({ where: { id: CLUB } });
  await prisma.user.deleteMany({
    where: {
      id: { in: [PRESIDENTE, MODERATORE, ALLENATORE, ALLENATORE2, MADRE] },
    },
  });
};

main()
  .catch((errore) => {
    console.error("\nLa sonda si e interrotta:", errore);
    esiti.push({ titolo: "sonda interrotta", ok: false });
  })
  .finally(async () => {
    try {
      await pulisci();
    } catch (errore) {
      console.error("pulizia incompleta:", String(errore?.message || errore));
    }
    await prisma.$disconnect();
    const ok = esiti.filter((e) => e.ok).length;
    console.log(`\nEsito: ${ok}/${esiti.length} PASS, ${esiti.length - ok} FAIL`);
    process.exit(esiti.length - ok ? 1 : 0);
  });
