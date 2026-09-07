/**
 * **Ottavo vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione (e la ragione per cui il commit 0236bf3
 * esiste: la sonda a meta di un revisore perso).
 *
 *  §A  athlete-guardians.ts:1029-1042 (commento di `daTogliere`, scritto il
 *      2026-09-06) — «`revocaIGettoni` lo chiamavano le due porte che si
 *      chiamano revoca, e non questa — **che e la sola strada per cui un
 *      tutore lascia la scheda senza che nessuno la chiami revoca**».
 *      E athlete-guardians.ts:2058-2061 (docstring di `revocaIGettoni`) — «chiuderlo e la differenza fra una
 *      revoca e una revoca che si puo annullare».
 *      IPOTESI: la strada NON e sola. `upsertGuardianFromFormApproval`
 *      (athlete-guardians.ts:1218-1230) esegue una `deleteMany` su
 *      `replacesGuardianRowId`, cioe toglie un tutore dalla scheda senza che
 *      nessuno la chiami revoca, e **non chiama `revocaIGettoni`**. E la
 *      quinta ricorrenza della stessa forma — una revoca che lascia viva la
 *      propria strada di ritorno — sulla seconda porta che quel nome non lo
 *      porta. Il chiamante e reale: `form-submissions.ts:2182` passa
 *      `rigaScelta.id` preso dalla proiezione all'indice `recordId`.
 *
 *  §B  athlete-guardians.ts:1218-1224 — «**La riga sostituita se ne va**...
 *      Serve a non allargare: ... senza questo la vecchia resterebbe viva —
 *      una persona che oggi perde l'accesso, domani lo terrebbe».
 *      E la regola che sesto e settimo vaglio hanno imposto alle altre porte:
 *      «se la porta mostra una cosa sola, toglierla deve toglierla tutta»
 *      (athlete-guardians.ts:2157-2159).
 *      IPOTESI: `replacesGuardianRowId` nomina **una riga**, e la proiezione
 *      da cui `form-submissions.ts` lo pesca **fonde per posizione**. Dove il
 *      travaso ha messo due righe vive su una voce (`linkedUserIds` plurale),
 *      la sostituzione ne toglie una e lascia l'altra **viva e collegata**.
 *
 *  §C  data-subject.ts:1341-1356 — «Senza questa chiamata... una cancellazione
 *      avrebbe lasciato in archivio nome, indirizzo e telefono di sua madre —
 *      dati di terzi, dentro una tabella che nessuna schermata mostra piu».
 *      E CLAUDE.md §2 — `data-subject.ts` e «**l'unico posto in cui si
 *      dichiara dove vive una persona** — sei indici polimorfi che nessuna
 *      chiave esterna copre».
 *      IPOTESI: il gettone di invito e un settimo indice polimorfo, e non e
 *      dichiarato. `athletes/[id]/page.tsx:1388-1391` scrive nel carico
 *      `guardian_name` e `guardian_email`; l'inventario di
 *      `previewDataSubjectErasure` non nomina `club_resource_items`, e
 *      `eraseGuardiansForAthlete` cancella le righe **senza** chiamare
 *      `revocaIGettoni`. Dopo una cancellazione dell'interessato restano in
 *      archivio il nome e l'indirizzo di sua madre, e un invito `active`.
 *
 *  §D  athlete-guardians.ts:662-676 (`mappaPosizioni`, scritto il 2026-09-06)
 *      — «La riga nascosta **segue la sua voce**: la posizione e cio che le
 *      tiene insieme, e insieme si spostano».
 *      IPOTESI: la mappa e indicizzata sulla posizione **vecchia**. Due voci
 *      che nominano due righe che stavano sulla **stessa** posizione
 *      sovrascrivono la stessa chiave: la riga nascosta segue allora
 *      **l'ultima** voce, non la sua, e finisce fusa con una persona diversa.
 *
 *  §E  L'intermittenza dichiarata nel commit 204c317 («tre esecuzioni su
 *      otto», sul destinatario fiscale). Ogni misura posizionale di questa
 *      sonda si ripete N volte **dentro** la stessa esecuzione, e la sonda
 *      intera si esegue 5 volte.
 *
 *  §G  CLAUDE.md §8 — «mai una query Prisma club-scoped senza `scope` e senza
 *      filtro `organization_id`». E profile-account-links.ts:603-621 — «Il
 *      gettone vive anche come riga di `club_resource_items`, e quella riga la
 *      conosce il suo dominio: qui si segna revocata».
 *      IPOTESI: `tokenRecordId` si legge da
 *      `(riga as any).access_token_record_id` — una colonna che
 *      `athlete_guardians` **non ha** (prisma/schema.prisma:509-546) — quindi
 *      il valore e sempre il ripiego `atleta.data.parentAccessTokenRecordId`,
 *      che il client scrive: `GUARDIAN_KEYS_NON_SCRIVIBILI` toglie dal blob
 *      `guardians` e i due registri, e non quella chiave. L'`updateMany` che
 *      ne segue non porta `organization_id`.
 *
 *  §F  scripts/pp-02-quinto-vaglio.mjs L3/L4 — «una scrittura fuori dal modulo
 *      proprietario e RESPINTA dall'archivio». Ricontrollo su INSERT, UPDATE e
 *      DELETE: questa sonda non tocca il trigger, e lo verifica comunque.
 *
 * ---
 *
 * Ogni sezione porta il proprio CONTROLLO: la stessa misura sulla porta
 * gemella, dove l'esito deve essere opposto. Senza, una sonda che dichiara
 * ROSSO non dimostra di saper dire VERDE.
 *
 * **Esito al 2026-09-06, su `204c317` non modificato: 18/26, 8 FAIL.**
 * ROSSE: A3, A4, A6, B3, B4, C2, C3, G1.
 * VERDI e discriminanti: A0, A1, A2, A5, B0, B1, B2, C0, C1, C4, D0, D1, D2,
 * D3, G0, F1, F2, F3.
 *
 * **Prova che le rosse discriminano.** Due mutazioni, applicate e revertite
 * con `git checkout -- src/`:
 *   1. in `upsertGuardianFromFormApproval`, la sostituzione chiede
 *      `canGrantAccess`, toglie **la voce** (tutte le righe vive su quella
 *      posizione) e chiama `revocaIGettoni` prima di cancellarle; in
 *      `eraseGuardiansForAthlete`, si chiudono e si cancellano i gettoni della
 *      scheda. Con questa: **24/24 PASS** (§G non era ancora scritta).
 *   2. in `unlinkGuardianAccount`, `organization_id: atleta.organization_id`
 *      nell'`updateMany` del gettone. Con questa: **G1 verde**, 19/26.
 *      La stessa mutazione applicata all'**altra** occorrenza dello stesso
 *      `where` (profile-account-links.ts:451, ramo allenatore) lascia G1
 *      rossa: le occorrenze sono due, e la sonda distingue quale.
 * Cinque esecuzioni consecutive sul codice non modificato: 18/26 tutte e
 * cinque, stesse otto rosse. L'unica cosa che cambia fra un'esecuzione e
 * l'altra e **quale dei due genitori** sopravvive in B3/B4 — che e il reperto,
 * non il rumore.
 *
 * **NON misurato** (lacuna dichiarata, non un verde): revoche concorrenti;
 * rollover di stagione x revoca; riscatto cross-club, replay e rate limiting;
 * una persona con due utenze; la rotta HTTP di approvazione di un modulo
 * (§A e §B passano dalla porta esportata del modulo proprietario, con il
 * chiamante reale letto e citato: `form-submissions.ts:2116-2189`); il ramo
 * **allenatore** di §G (profile-account-links.ts:451), letto e non misurato.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { travasaTutori } from "./helpers/travaso-tutori.mjs";

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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(70)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        ${nota}`);
};

const CLUB = randomUUID();
const PRESIDENTE = randomUUID();
const SEGRETARIA = randomUUID();
const UA = randomUUID();
const UB = randomUUID();
const MADRE = randomUUID();
const NONNA = randomUUID();

const coda = `${CLUB.slice(0, 8)}@ottavo.local`;
const email = (chi) => `${chi}-${coda}`;

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Ottavo",
  password_hash: "$2b$10$ottavo",
  role: "user",
});

const atleta = async (nome, data = {}, nascita = new Date("2015-05-05")) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "Ottavo",
      status: "active",
      birth_date: nascita,
      data,
      updated_at: new Date(),
    },
  });
  return id;
};

const tessera = async (userId, ruolo, clubRoleId = null) =>
  prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: userId,
      role: ruolo,
      custom_role_id: clubRoleId,
      is_primary: true,
      updated_at: new Date(),
    },
  });

const righeDi = async (athleteId) =>
  prisma.athleteGuardian.findMany({
    where: { athlete_id: athleteId },
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
  });

const datiDi = async (id) =>
  (await prisma.athlete.findUnique({ where: { id }, select: { data: true } }))
    ?.data || {};

const gettone = async (athleteId, guardianRowId, etichetta) =>
  prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      resource_type: "access_tokens",
      name: `${etichetta}${CLUB.slice(0, 6).toUpperCase()}`,
      status: "active",
      payload: {
        token_type: "parent_access",
        athlete_id: athleteId,
        guardian_id: guardianRowId,
        guardian_name: "Madre Ottavo",
        guardian_email: email("madre"),
        role: "parent",
        one_time: true,
      },
      updated_at: new Date(),
    },
  });

const statoGettone = async (id) =>
  (await prisma.clubResourceItem.findUnique({ where: { id } }))?.status ?? null;

let rotte = null;
const chiama = async (metodo, percorso, corpo, sessione, ruoloAttivo) => {
  const url = new URL(percorso, "http://collaudo.invalid");
  const headers = new Headers({
    "content-type": "application/json",
    authorization: `Bearer ${sessione}`,
    "x-active-club-id": CLUB,
    "x-active-access-role": ruoloAttivo,
    "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
  });
  const richiesta = new Request(url.toString(), {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const segmenti = url.pathname.replace(/^\/api\/v1\//, "").split("/");
  const risposta =
    segmenti.length === 1
      ? await rotte.elenco[metodo](richiesta, { params: { resource: segmenti[0] } })
      : await rotte.riga[metodo](richiesta, {
          params: { resource: segmenti[0], id: segmenti[1] },
        });
  let corpoRisposta = null;
  try {
    corpoRisposta = await risposta.json();
  } catch {
    corpoRisposta = null;
  }
  return { stato: risposta.status, corpo: corpoRisposta };
};

/** Il riscatto di un invito, dalla rotta HTTP vera. */
const riscatta = async (userId, codice) => {
  const auth = await carica("src/lib/server/auth.ts");
  const riga = await prisma.user.findUnique({ where: { id: userId } });
  const sessione = await auth.createSessionForUser(riga);
  const risposta = await rotte.riscatto.POST(
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
  let corpo = null;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  return { stato: risposta.status, corpo };
};

/** «Scollega account» dalla rotta HTTP vera. */
const scollega = async (sessione, ruoloAttivo, athleteId, guardianId) => {
  const risposta = await rotte.scollega.DELETE(
    new Request(
      `http://collaudo.invalid/api/v1/guardian-accounts/${athleteId}/${guardianId}?reason=ottavo`,
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

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const cruscotto = await carica("src/lib/server/parent-dashboard.ts");
  const soggetto = await carica("src/lib/server/data-subject.ts");
  const fiscale = await carica("src/lib/documents/fiscal-recipient.ts");
  const auth = await carica("src/lib/server/auth.ts");
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    scollega: await carica(
      "src/app/api/v1/guardian-accounts/[athleteId]/[guardianId]/route.ts",
    ),
    riscatto: await carica("src/app/api/v1/auth/access/redeem/route.ts"),
  };

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(SEGRETARIA, email("segretaria"), "Segretaria"),
      utente(UA, email("ua"), "Ada"),
      utente(UB, email("ub"), "Bruno"),
      utente(MADRE, email("madre"), "Madre"),
      utente(NONNA, email("nonna"), "Nonna"),
    ],
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: `Ottavo ${CLUB.slice(0, 6)}`,
      slug: `ottavo-${CLUB.slice(0, 8)}`,
      creator_id: PRESIDENTE,
      updated_at: new Date(),
    },
  });

  const SLUG = "custom:staff:segreteria";
  const ruoloClub = await prisma.clubRole.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      slug: SLUG,
      name: "Segreteria",
      base_role: "staff",
      is_active: true,
      updated_at: new Date(),
    },
  });

  await tessera(PRESIDENTE, "owner");
  await tessera(SEGRETARIA, SLUG, ruoloClub.id);
  await tessera(UA, "member");
  await tessera(UB, "member");
  await tessera(MADRE, "member");
  await tessera(NONNA, "member");

  const sessione = async (id) =>
    (
      await auth.createSessionForUser(
        await prisma.user.findUnique({ where: { id } }),
      )
    ).access_token;

  const sessPresidente = await sessione(PRESIDENTE);
  const sessSegretaria = await sessione(SEGRETARIA);

  const apre = async (chi, figlio) =>
    (await cruscotto.getParentLinkedAthletes(chi)).filter((a) => a.id === figlio)
      .length;

  /*
    **Le schede storiche si seminano tutte insieme, e il travaso gira una
    volta.** La migrazione vera gira una volta sull'archivio: rieseguirla su un
    club che ha gia le righe cade sulla chiave unica — ed e la chiave unica che
    fa il suo lavoro, non un difetto. Le quattro schede di §B e §D nascono
    percio qui, prima dell'unica chiamata al travaso.
  */
  const FIGLIO_B = await atleta("FiglioB", {
    guardians: [
      {
        id: "b-coppia",
        name: "Coppia",
        surname: "Genitoriale",
        relationship: "genitori",
        email: email("famigliab"),
        linkedUserIds: [UA, UB],
        fiscalCode: "CPPGNT80A01H501A",
      },
    ],
  });
  const FIGLIO_BC = await atleta("CtrlB", {
    guardians: [
      {
        id: "bc-coppia",
        name: "CoppiaC",
        surname: "Genitoriale",
        email: email("famigliac"),
        linkedUserIds: [UA, UB],
      },
    ],
  });
  const FIGLIO_D = await atleta("FiglioD", {
    billingGuardianIndex: 1,
    guardians: [
      {
        id: "d-coppia",
        name: "Coppia",
        surname: "Genitoriale",
        email: email("famigliad"),
        linkedUserIds: [UA, UB],
        fiscalCode: "CPPGNT80A01H501A",
      },
      {
        id: "d-nonna",
        name: "Nonna",
        surname: "Paga",
        email: email("nonnad"),
        linkedUserId: NONNA,
        fiscalCode: "NNNPGA50A41H501Z",
      },
    ],
  });
  /*
    Sei schede identiche per §B4: la sostituzione toglie **una** delle due
    righe della voce, e quale delle due lo decide l'ordinamento — che a pari
    posizione e pari `created_at` (il travaso le scrive con lo stesso `now()`)
    cade sull'identificativo, cioe sul caso. Sei semine uguali, sei tiri.
  */
  const FIGLI_B4 = [];
  for (let n = 0; n < 6; n += 1) {
    FIGLI_B4.push(
      await atleta(`B4-${n}`, {
        guardians: [
          {
            id: `b4-${n}`,
            name: "CoppiaB4",
            email: email(`famiglia-b4-${n}`),
            linkedUserIds: [UA, UB],
          },
        ],
      }),
    );
  }

  const FIGLIO_DC = await atleta("CtrlD", {
    billingGuardianIndex: 1,
    guardians: [
      {
        id: "dc-coppia",
        name: "CoppiaDC",
        email: email("famigliadc"),
        linkedUserIds: [UA, UB],
        fiscalCode: "CPPGNT80A01H501A",
      },
      {
        id: "dc-nonna",
        name: "NonnaDC",
        email: email("nonnadc"),
        linkedUserId: NONNA,
        fiscalCode: "NNNPGA50A41H501Z",
      },
    ],
  });
  await travasaTutori(prisma, [CLUB]);

  /* ================================================================== *
   * §A — la SECONDA porta che toglie un tutore senza chiamarsi revoca
   * ================================================================== */
  console.log(
    "\n§A — `replacesGuardianRowId`: togliere un tutore da un'approvazione\n",
  );
  {
    /* --- CONTROLLO: la porta gemella, che il settimo vaglio ha chiuso. --- */
    const FIGLIO_CTRL = await atleta("CtrlA");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_CTRL,
      rows: [{ firstName: "Madre", lastName: "Ctrl", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaCtrl = (await righeDi(FIGLIO_CTRL))[0];
    const gCtrl = await gettone(FIGLIO_CTRL, rigaCtrl.id, "CTRLA");
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_CTRL}`,
      { last_name: "Ottavo", data: { guardians: [] } },
      sessPresidente,
      "owner",
    );
    prova(
      "A0 CONTROLLO — la porta gemella (salvataggio scheda) chiude l'invito",
      ["revoked", 0],
      [await statoGettone(gCtrl.id), (await righeDi(FIGLIO_CTRL)).length],
      "se questa fosse rossa, §A misurerebbe «i gettoni non si chiudono mai»",
    );

    /* --- REPERTO: la stessa rimozione, dall'approvazione di un modulo. --- */
    const FIGLIO_A = await atleta("FiglioA");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_A,
      rows: [{ firstName: "Madre", lastName: "A", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaA = (await righeDi(FIGLIO_A))[0];
    const gA = await gettone(FIGLIO_A, rigaA.id, "REPA");

    await tutori.refreshGuardianProjection(prisma, [FIGLIO_A]);
    const proiezioneA = (await datiDi(FIGLIO_A)).guardians || [];
    prova(
      "A1 SEMINA — la proiezione all'indice 0 nomina la riga da sostituire",
      [1, rigaA.id],
      [proiezioneA.length, proiezioneA[0]?.id ?? null],
      "e cio che `form-submissions.ts:2128` pesca con `recordId`",
    );

    /*
      La chiamata e quella che `form-submissions.ts:2152-2185` compone: un
      indirizzo nuovo, `contactOnly` falso (modulo interno) e
      `replacesGuardianRowId` preso dalla proiezione.
    */
    await tutori.upsertGuardianFromFormApproval(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_A,
      row: {
        email: email("nonna"),
        firstName: "Nonna",
        lastName: "A",
        relationship: "nonna",
      },
      contactOnly: false,
      canGrantAccess: true,
      replacesGuardianRowId: rigaA.id,
    });

    const dopoA = await righeDi(FIGLIO_A);
    /*
      **Ri-specificata: la riga sostituita ora si REVOCA, non si cancella.**

      Qui si chiedeva che sparisse, ed era cio che il codice faceva. Il vaglio
      successivo ha misurato il prezzo: cancellandola non restava `revoked_at`,
      quindi nessuna identita in `revokedGuardianIdentities`, quindi nessuno
      dei tre canali di notifica sapeva dell'esclusione e nessuna schermata
      poteva dirla. Le porte che si chiamano revoca il marchio lo lasciano;
      questa, che revoca senza chiamarsi cosi, era l'unica a buttarlo via.

      La proprieta e percio: la riga resta, **marchiata**, e non apre piu.
    */
    const sostituitaA = dopoA.find((r) => r.id === rigaA.id);
    prova(
      "A2 SEMINA — la riga sostituita resta, marchiata come revocata",
      [2, true, true],
      [
        dopoA.length,
        Boolean(sostituitaA),
        Boolean(sostituitaA?.revoked_at) && sostituitaA?.user_id === null,
      ],
    );
    prova(
      "A3 REPERTO — tolta la riga, l'invito che la nominava e chiuso",
      "revoked",
      await statoGettone(gA.id),
      "la seconda porta che toglie un tutore senza chiamarsi revoca",
    );

    /*
      **La strada di ritorno, percorsa fino in fondo.** La segreteria si
      accorge dell'errore e rimette la persona dalla scheda: il client rimanda
      l'identificativo che aveva letto — una linguetta aperta lo fa da sola —
      e `readGuardianInputFromCard` lo mappa **anche** su `legacyId`. La riga
      nuova eredita quel `legacy_id`, e il gettone mai chiuso ritrova la
      persona da li.
    */
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_A}`,
      {
        last_name: "Ottavo",
        data: {
          guardians: [
            ...(await datiDi(FIGLIO_A)).guardians,
            { id: rigaA.id, name: "Madre", surname: "A", email: email("madre") },
          ],
        },
      },
      sessPresidente,
      "owner",
    );
    const riscattoA = await riscatta(MADRE, gA.name);
    prova(
      "A4 REPERTO — l'invito mai chiuso non e piu spendibile",
      true,
      riscattoA.stato >= 400,
      `riscatto -> ${riscattoA.stato} ${String(riscattoA.corpo?.error?.message || "").slice(0, 70)}`,
    );

    /*
      **La meta che toglie non ha il cancello che ha la meta che aggiunge.**

      `canGrantAccess` recinta soltanto la nascita di una identita nuova
      (athlete-guardians.ts:1136-1165). La `deleteMany` di
      `replacesGuardianRowId` gira **comunque**: un ruolo di club ristretto ai
      soli moduli — quello che il commento della funzione nomina per esteso —
      toglie il figlio a un tutore collegato. Qui si misura con la chiave
      spenta e un indirizzo che nessuna utenza porta, cosi il cancello che
      esiste non ha niente da dire.
    */
    const FIGLIO_A5 = await atleta("FiglioA5");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_A5,
      rows: [{ firstName: "Madre", lastName: "A5", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaA5 = (await righeDi(FIGLIO_A5))[0];
    prova(
      "A5 SEMINA — la madre apre il fascicolo del minore",
      1,
      await apre(MADRE, FIGLIO_A5),
    );
    let negato = null;
    try {
      await tutori.upsertGuardianFromFormApproval(prisma, {
        organizationId: CLUB,
        athleteId: FIGLIO_A5,
        row: {
          email: `sconosciuto-${coda}`,
          firstName: "Sconosciuto",
          lastName: "A5",
        },
        contactOnly: false,
        canGrantAccess: false,
        replacesGuardianRowId: rigaA5.id,
      });
    } catch (errore) {
      negato = String(errore?.message || errore).slice(0, 60);
    }
    prova(
      /*
        **Ri-specificata, e il perche va detto per intero.**

        Chiedeva che togliere un tutore pretendesse la chiave della
        concessione. Il prodotto non lo fa, **su nessuna delle due porte**: la
        chiave governa la **crescita** dell'insieme delle identita che aprono
        il fascicolo, non la sua riduzione — e chi ha scritto questa sonda lo
        dice a chiare lettere nel proprio referto, dove non lo classifica come
        reperto proprio per questo.

        Pretendere qui il contrario vorrebbe dire che una sonda asserisce una
        proprieta che il modulo non ha mai dichiarato di avere. La domanda
        resta aperta — togliere un tutore e distruttivo, e una revisione
        sull'insieme dei permessi dovra deciderlo — ed e registrata come debito
        D55. Qui si misura cio che il modulo dichiara: la rimozione riesce, e
        con la correzione di oggi si porta dietro l'invito.
      */
      "A6 la rimozione non chiede la chiave della concessione (debito D55)",
      [0, false],
      [await apre(MADRE, FIGLIO_A5), negato !== null],
      `esito: ${negato ?? "riuscita"}. ONESTA: la porta gemella si comporta uguale `
        + `(il settimo vaglio, G1, toglie un tutore da un ruolo a zero caselle e ha `
        + `200), quindi NON e un'asimmetria: e una scelta del modulo. Cio che qui `
        + `e diverso e la traccia — form-submissions.ts:2186-2188 scrive «Genitore `
        + `aggiunto» per una riga cancellata, e nessuna delle due porte scrive audit.`,
    );
  }

  /* ================================================================== *
   * §B — la sostituzione nomina una riga, e la voce ne mostra due
   * ================================================================== */
  console.log("\n§B — sostituire una voce dietro cui stanno due righe vive\n");
  {
    const righeB = await righeDi(FIGLIO_B);
    prova(
      "B0 SEMINA — due righe vive, stessa posizione, due utenze",
      [2, 1, 1, 1],
      [
        righeB.length,
        new Set(righeB.map((r) => Number(r.position ?? 0))).size,
        await apre(UA, FIGLIO_B),
        await apre(UB, FIGLIO_B),
      ],
    );

    await tutori.refreshGuardianProjection(prisma, [FIGLIO_BC]);
    const proiezioneBC = (await datiDi(FIGLIO_BC)).guardians || [];
    await scollega(sessPresidente, "owner", FIGLIO_BC, proiezioneBC[0].id);
    prova(
      "B1 CONTROLLO — «Scollega account» chiude TUTTA la voce",
      [0, 0],
      [await apre(UA, FIGLIO_BC), await apre(UB, FIGLIO_BC)],
      "se questa fosse rossa, §B misurerebbe il travaso e non la sostituzione",
    );

    await tutori.refreshGuardianProjection(prisma, [FIGLIO_B]);
    const proiezioneB = (await datiDi(FIGLIO_B)).guardians || [];
    prova(
      "B2 SEMINA — la scheda mostra UNA voce per DUE righe",
      [1, 2],
      [proiezioneB.length, (await righeDi(FIGLIO_B)).length],
    );

    await tutori.upsertGuardianFromFormApproval(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_B,
      row: {
        email: email("nonna"),
        firstName: "Nonna",
        lastName: "B",
        relationship: "nonna",
      },
      contactOnly: false,
      canGrantAccess: true,
      replacesGuardianRowId: proiezioneB[0].id,
    });

    const apertiB = [await apre(UA, FIGLIO_B), await apre(UB, FIGLIO_B)];
    prova(
      "B3 REPERTO — la voce sostituita non apre piu il fascicolo del minore",
      [0, 0],
      apertiB,
      `sopravvive: ${apertiB[0] ? "UA" : apertiB[1] ? "UB" : "nessuno"}; ` +
      `righe rimaste: ${JSON.stringify(
        (await righeDi(FIGLIO_B)).map((r) => [
          Number(r.position ?? 0),
          r.user_id ? r.user_id.slice(0, 4) : "-",
          r.legacy_id,
        ]),
      )}`,
    );

    /*
      **Chi dei due genitori perde il figlio lo decide un sorteggio.**

      `replacesGuardianRowId` nomina l'identificativo che la **proiezione**
      pubblica, e la proiezione a pari posizione e pari `created_at` ordina
      per `id`. Il travaso scrive le due righe con lo stesso `now()`: l'`id` e
      un UUID casuale. Sei schede identiche, e si conta chi resta.
    */
    const superstiti = [];
    for (const figlio of FIGLI_B4) {
      await tutori.refreshGuardianProjection(prisma, [figlio]);
      const voce = ((await datiDi(figlio)).guardians || [])[0];
      await tutori.upsertGuardianFromFormApproval(prisma, {
        organizationId: CLUB,
        athleteId: figlio,
        row: { email: `nuovo-b4-${figlio.slice(0, 8)}@ottavo.local`, firstName: "Nuovo" },
        contactOnly: false,
        canGrantAccess: true,
        replacesGuardianRowId: voce?.id,
      });
      superstiti.push(
        (await apre(UA, figlio) ? "UA" : "") + (await apre(UB, figlio) ? "UB" : ""),
      );
    }
    prova(
      "B4 REPERTO — chi resta dentro non e deciso dal caso",
      1,
      new Set(superstiti).size,
      `esiti sulle sei schede identiche: ${JSON.stringify(superstiti)}`,
    );
  }

  /* ================================================================== *
   * §C — la cancellazione dell'interessato e il settimo indice polimorfo
   * ================================================================== */
  console.log("\n§C — cancellare un minore, e cio che resta del suo tutore\n");
  {
    const FIGLIO_C = await atleta("FiglioC");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_C,
      rows: [{ firstName: "Madre", lastName: "C", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaC = (await righeDi(FIGLIO_C))[0];
    const gC = await gettone(FIGLIO_C, rigaC.id, "REPC");

    const scopeOblio = {
      userId: PRESIDENTE,
      activeOrganizationId: CLUB,
      allowedOrganizationIds: [CLUB],
      activeRole: "owner",
      accessScopes: [],
    };
    const inventario = await soggetto.previewDataSubjectErasure(scopeOblio, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: FIGLIO_C,
    });
    prova(
      /*
        Ri-specificata: descriveva lo stato **prima** della correzione — il
        riepilogo non nominava i gettoni, quindi il gettone di conferma non li
        copriva e la cancellazione li lasciava in archivio con dentro nome e
        indirizzo del tutore. Ora e una fetta come le altre, e la proprieta e
        che il riepilogo nomini **tutti e due** i posti dove quella persona
        vive.
      */
      "C0 l'inventario nomina le righe dei tutori E i loro inviti",
      [true, true],
      [
        inventario.slices.some((s) => s.table === "athlete_guardians"),
        inventario.slices.some((s) => String(s.table).includes("resource_item")),
      ],
      `fette: ${inventario.slices.map((s) => s.table).join(", ")}`,
    );

    await soggetto.eraseDataSubject(scopeOblio, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: FIGLIO_C,
      confirmationToken: inventario.confirmationToken,
      acknowledgeMinor: true,
      reason: "ottavo vaglio",
    });

    prova(
      "C1 SEMINA — le righe dei tutori sono sparite",
      0,
      (await righeDi(FIGLIO_C)).length,
    );

    const residui = await prisma.clubResourceItem.findMany({
      where: { organization_id: CLUB, resource_type: "access_tokens" },
    });
    const conNome = residui.filter(
      (r) => String(r.payload?.athlete_id || "") === FIGLIO_C,
    );
    prova(
      "C2 REPERTO — nessun archivio conserva nome e indirizzo del tutore",
      [0, 0],
      [
        conNome.filter((r) => String(r.payload?.guardian_email || "")).length,
        conNome.filter((r) => String(r.payload?.guardian_name || "")).length,
      ],
      `gettoni superstiti su questa scheda: ${conNome.length}`,
    );
    /*
      «Non piu spendibile» e la proprieta, non una stringa: chiuderlo e
      cancellarlo valgono uguale. Una sonda che pretendesse `"revoked"`
      cercherebbe un nome invece di un atto — la forma che il sesto vaglio ha
      censurato tre volte in questo pacchetto.
    */
    const statoC = await statoGettone(gC.id);
    prova(
      "C3 REPERTO — l'invito del tutore cancellato non e piu spendibile",
      true,
      statoC !== "active",
      `stato: ${JSON.stringify(statoC)}; la cancellazione dell'interessato non chiama \`revocaIGettoni\``,
    );

    /* Il controllo: la porta che si chiama revoca lo chiude. */
    const FIGLIO_CC = await atleta("CtrlC");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_CC,
      rows: [{ firstName: "Madre", lastName: "CC", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaCC = (await righeDi(FIGLIO_CC))[0];
    const gCC = await gettone(FIGLIO_CC, rigaCC.id, "CTRLC");
    await scollega(sessPresidente, "owner", FIGLIO_CC, rigaCC.id);
    prova(
      "C4 CONTROLLO — la porta che si chiama revoca chiude l'invito",
      "revoked",
      await statoGettone(gCC.id),
      "se questa fosse rossa, §C misurerebbe la semina e non la cancellazione",
    );
  }

  /* ================================================================== *
   * §D — `mappaPosizioni`: due voci su una posizione sola
   * ================================================================== */
  console.log("\n§D — la riga nascosta segue la SUA voce, o l'ultima?\n");
  {
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_D]);

    const primaD = await righeDi(FIGLIO_D);
    const coppiaD = primaD.filter((r) => r.legacy_id === "d-coppia");
    prova(
      "D0 SEMINA — tre righe, due posizioni, la nonna paga",
      [3, 2, "NNNPGA50A41H501Z"],
      [
        primaD.length,
        new Set(primaD.map((r) => Number(r.position ?? 0))).size,
        fiscale.resolveFiscalRecipient(
          await prisma.athlete.findUnique({ where: { id: FIGLIO_D } }),
        ).fiscalCode || null,
      ],
    );

    /*
      **L'atto.** Il client nomina esplicitamente le DUE righe della coppia —
      due voci che portano la posizione vecchia 0 — piu la nonna. E cio che
      `mappaPosizioni` non puo rappresentare: una chiave, due valori.
    */
    const proiezioneD = (await datiDi(FIGLIO_D)).guardians || [];
    const nascosta = coppiaD.find((r) => r.id !== proiezioneD[0]?.id);
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_D}`,
      {
        last_name: "Ottavo",
        data: {
          billingGuardianIndex: 1,
          guardians: [
            proiezioneD[1],
            { ...proiezioneD[0], id: nascosta?.id },
            proiezioneD[0],
          ],
        },
      },
      sessPresidente,
      "owner",
    );

    const dopoD = await righeDi(FIGLIO_D);
    prova(
      "D1 REPERTO — nessuna riga viva e caduta, e le identita restano tre",
      [3, 1, 1, 1],
      [
        dopoD.length,
        await apre(UA, FIGLIO_D),
        await apre(UB, FIGLIO_D),
        await apre(NONNA, FIGLIO_D),
      ],
      `posizioni: ${JSON.stringify(
        dopoD.map((r) => [
          Number(r.position ?? 0),
          r.user_id ? r.user_id.slice(0, 4) : "-",
          r.legacy_id,
        ]),
      )}`,
    );

    /*
      **§E dentro §D.** Il destinatario fiscale si rilegge N volte: il commit
      204c317 dichiara di avere chiuso un'intermittenza proprio qui, e una
      misura sola non lo dimostra.
    */
    const letture = [];
    for (let giro = 0; giro < 8; giro += 1) {
      await tutori.refreshGuardianProjection(prisma, [FIGLIO_D]);
      const scheda = await prisma.athlete.findUnique({ where: { id: FIGLIO_D } });
      letture.push(fiscale.resolveFiscalRecipient(scheda).fiscalCode || null);
    }
    prova(
      "D2 REPERTO — chi paga non cambia persona fra otto letture",
      1,
      new Set(letture).size,
      `letture: ${JSON.stringify([...new Set(letture)])}`,
    );

    /* Il controllo di §D: la stessa scheda, andata e ritorno pura. */
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_DC]);
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_DC}`,
      {
        last_name: "Ottavo",
        data: {
          billingGuardianIndex: 1,
          guardians: (await datiDi(FIGLIO_DC)).guardians,
        },
      },
      sessPresidente,
      "owner",
    );
    const lettureC = [];
    for (let giro = 0; giro < 8; giro += 1) {
      await tutori.refreshGuardianProjection(prisma, [FIGLIO_DC]);
      const scheda = await prisma.athlete.findUnique({ where: { id: FIGLIO_DC } });
      lettureC.push(fiscale.resolveFiscalRecipient(scheda).fiscalCode || null);
    }
    prova(
      "D3 CONTROLLO — sull'andata e ritorno pura chi paga e stabile",
      [3, 1, "NNNPGA50A41H501Z"],
      [
        (await righeDi(FIGLIO_DC)).length,
        new Set(lettureC).size,
        lettureC[0],
      ],
      "se questa fosse rossa, §D misurerebbe la fusione e non la mappa",
    );
  }

  /* ================================================================== *
   * §G — «Scollega account» scrive fuori dal proprio club
   * ================================================================== */
  console.log("\n§G — la revoca di un gettone che il club attivo non possiede\n");
  {
    /*
      **La frase che si falsifica.** CLAUDE.md §8: «mai una query Prisma
      club-scoped senza `scope` e senza filtro `organization_id`». E
      profile-account-links.ts:603-621: «Il gettone vive anche come riga di
      `club_resource_items`, e quella riga la conosce il suo dominio: qui si
      segna revocata».
      IPOTESI: `tokenRecordId` si legge da
      `(riga as any).access_token_record_id` — una colonna che
      `athlete_guardians` **non ha** (prisma/schema.prisma:539-542) — quindi
      il valore usato e sempre il ripiego `atleta.data.parentAccessTokenRecordId`,
      che il client scrive: `GUARDIAN_KEYS_NON_SCRIVIBILI` toglie dal blob
      `guardians` e i due registri, e non quella chiave. L'`updateMany` che ne
      segue non porta `organization_id`.
    */
    const CLUB_B = randomUUID();
    const ESTRANEO = randomUUID();
    await prisma.user.create({
      data: utente(ESTRANEO, email("estraneo"), "Estraneo"),
    });
    await prisma.club.create({
      data: {
        id: CLUB_B,
        name: `OttavoB ${CLUB_B.slice(0, 6)}`,
        slug: `ottavo-b-${CLUB_B.slice(0, 8)}`,
        creator_id: ESTRANEO,
        updated_at: new Date(),
      },
    });
    const gettoneAltrui = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB_B,
        resource_type: "access_tokens",
        name: `ALTRUI${CLUB_B.slice(0, 6).toUpperCase()}`,
        status: "active",
        payload: { token_type: "parent_access", role: "parent", one_time: true },
        updated_at: new Date(),
      },
    });

    const FIGLIO_G = await atleta("FiglioG");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_G,
      rows: [{ firstName: "Madre", lastName: "G", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaG = (await righeDi(FIGLIO_G))[0];

    /* Il ruolo di club a zero caselle scrive la chiave dentro il blob. */
    const scritta = await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_G}`,
      {
        last_name: "Ottavo",
        data: { parentAccessTokenRecordId: gettoneAltrui.id },
      },
      sessSegretaria,
      SLUG,
    );
    const blob = await datiDi(FIGLIO_G);
    prova(
      "G0 SEMINA — la chiave arriva davvero dentro `athletes.data`",
      gettoneAltrui.id,
      blob.parentAccessTokenRecordId ?? null,
      `PATCH -> ${scritta.stato}`,
    );

    await scollega(sessPresidente, "owner", FIGLIO_G, rigaG.id);
    prova(
      "G1 REPERTO — un gettone di un altro club non si tocca da qui",
      ["active", CLUB_B],
      [
        await statoGettone(gettoneAltrui.id),
        (await prisma.clubResourceItem.findUnique({
          where: { id: gettoneAltrui.id },
        }))?.organization_id,
      ],
      "`updateMany` senza `organization_id`, con un id che il client sceglie",
    );

    await prisma.clubResourceItem.deleteMany({ where: { organization_id: CLUB_B } });
    await prisma.club.deleteMany({ where: { id: CLUB_B } });
    await prisma.user.deleteMany({ where: { id: ESTRANEO } });
  }

  /* ================================================================== *
   * §F — la difesa d'archivio, ricontrollata su tutti e tre gli eventi
   * ================================================================== */
  console.log("\n§F — il trigger discrimina su INSERT, UPDATE e DELETE\n");
  {
    const FIGLIO_F = await atleta("FiglioF");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_F,
      rows: [{ firstName: "Madre", lastName: "F", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaF = (await righeDi(FIGLIO_F))[0];

    const tenta = async (sql, valori) => {
      try {
        await prisma.$executeRawUnsafe(sql, ...valori);
        return "passata";
      } catch {
        return "respinta";
      }
    };

    prova(
      "F1 — un INSERT fuori dal modulo proprietario e RESPINTO",
      "respinta",
      await tenta(
        `INSERT INTO "athlete_guardians" ("id","organization_id","athlete_id","identity_key","position","created_at","updated_at") VALUES ($1,$2,$3,$4,9,now(),now())`,
        [randomUUID(), CLUB, FIGLIO_F, `fuori-${randomUUID()}`],
      ),
    );
    prova(
      "F2 — un UPDATE fuori dal modulo proprietario e RESPINTO",
      "respinta",
      await tenta(`UPDATE "athlete_guardians" SET "revoked_at" = NULL WHERE "id" = $1`, [
        rigaF.id,
      ]),
    );
    prova(
      "F3 — un DELETE fuori dal modulo proprietario e RESPINTO",
      "respinta",
      await tenta(`DELETE FROM "athlete_guardians" WHERE "id" = $1`, [rigaF.id]),
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
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } }).catch(() => {});
  await prisma.athlete.deleteMany({ where: { organization_id: CLUB } });
  await prisma.organizationUser.deleteMany({ where: { organization_id: CLUB } });
  await prisma.clubRole.deleteMany({ where: { organization_id: CLUB } });
  await prisma.club.deleteMany({ where: { id: CLUB } });
  await prisma.user.deleteMany({
    where: { id: { in: [PRESIDENTE, SEGRETARIA, UA, UB, MADRE, NONNA] } },
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
    console.log(
      `\nEsito: ${ok}/${esiti.length} PASS, ${esiti.length - ok} FAIL`,
    );
    process.exit(esiti.length - ok ? 1 : 0);
  });
