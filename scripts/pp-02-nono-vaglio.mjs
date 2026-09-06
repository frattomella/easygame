/**
 * **Nono vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione.
 *
 *  §A  athlete-guardians.ts:1719-1732 (commento di `eraseGuardiansForAthlete`,
 *      scritto il 2026-09-06) — «una cancellazione che lasciasse quelle due
 *      chiavi in `club_resource_items` non sarebbe una cancellazione... **Si
 *      chiudono e si cancellano**: e la terza porta che toglie righe di
 *      tutore, e **l'ultima che non lo faceva**».
 *      E data-subject.ts:573-582 — «Non essendoci, il riepilogo non lo
 *      nominava e il gettone di conferma non lo copriva, mentre la
 *      cancellazione lo lasciava in archivio». E ADR-0145 — «Ora e una fetta
 *      come le altre, e **l'oblio lo chiude e lo cancella**».
 *      IPOTESI: le due meta non si toccano. Il **riepilogo** conta ogni
 *      gettone con `payload.athlete_id === subjectId` (data-subject.ts:583-596,
 *      nessun altro filtro); la **cancellazione** toglie solo i gettoni che
 *      `gettoneDiQuestaRiga` abbina a una riga di `athlete_guardians`
 *      **ancora esistente** (athlete-guardians.ts:1734-1756), e se righe non
 *      ce ne sono salta il blocco per intero. Un gettone **orfano** — quello
 *      di un tutore tolto dalla scheda, che il settimo vaglio revoca e la cui
 *      riga cancella — e contato dal riepilogo, coperto dal gettone di
 *      conferma, e resta in archivio con `guardian_name` e `guardian_email`.
 *
 *  §B  profile-account-links.ts:450-459 (commento di `unlinkTrainerAccount`,
 *      scritto il 2026-09-06) — «**Il filtro di club, che qui mancava.**
 *      L'identificativo viene dal carico del profilo allenatore, che la rotta
 *      generica lascia scrivere: senza `organization_id` questa istruzione
 *      poteva portare a `revoked` la riga di un altro club».
 *      E ADR-0145, la regola che ne esce: «**Una difesa in piu che si
 *      appoggia a un dato che l'attaccante controlla non e una difesa in piu:
 *      e una porta in piu**».
 *      IPOTESI: la porta e stata ristretta su **un asse solo**. Il club l'ha
 *      chiusa; la chiave scrivibile dal client no. `access_tokens` e riservata
 *      alla direzione (access-roles.ts:351, `MANAGEMENT_ADMIN_ONLY_RESOURCES`)
 *      e `accounts.trainer.manage` e `GESTIONE` (catalog.ts:83-89), quindi uno
 *      `staff` — 403 sulla porta vera dei gettoni — scrive
 *      `accessTokenRecordId` in un profilo `trainers`, chiama «Scollega
 *      account», e revoca **un gettone qualunque del proprio club**: per
 *      esempio l'invito all'area famiglia di una famiglia.
 *
 *  §C  athlete-guardians.ts:1231-1256 (commento della sostituzione, scritto il
 *      2026-09-06) — «**si toglie la voce, non la riga**... se la porta mostra
 *      una cosa sola, toglierla deve toglierla tutta».
 *      E D55 (16-technical-debt.md) — «togliere un tutore non chiede la chiave
 *      della concessione... e coerente e dichiarato».
 *      IPOTESI: cio che D55 dichiara e il **permesso**, non il raggio ne la
 *      forma. Da quel commit la porta non cancella piu una riga ma **tutte**
 *      le righe vive su una posizione, e le **cancella**: non lascia
 *      `revoked_at`, quindi `revokedGuardianIdentities` resta vuoto e nessuna
 *      difesa ricorda chi e stato escluso — mentre le tre porte che si
 *      chiamano revoca il marchio lo lasciano. Succede anche con
 *      `contactOnly: true` e `canGrantAccess: false` — cioe dal ramo del
 *      modulo **pubblico**, dove il vaglio sulla concessione e saltato per
 *      costruzione, e da un ruolo di club che porta due sole chiavi sui
 *      moduli.
 *
 *  §D  form-submissions.ts:2185-2199 (commento di R-5, scritto il 2026-09-06)
 *      — «**La traccia dice cio che e successo**, non cio che si voleva
 *      fare... chi rileggeva il registro non aveva modo di saperlo».
 *      IPOTESI: quella stringa non finisce in nessun registro.
 *      `form-submissions.ts` non chiama `recordAuditEvent` nemmeno una volta,
 *      `applied` non viene scritto sulla riga della compilazione
 *      (form-submissions.ts:2393-2409), e la rotta registra
 *      `applied: outcome.applied.length` — **un numero**
 *      (forms/submissions/[id]/route.ts:84). Chi rilegge il registro continua
 *      a non avere modo di saperlo.
 *
 *  §E  athlete-guardians.ts:2087-2096 (`gettoniDeiTutori`) — «**Ristretta ai
 *      club delle schede che si stanno toccando.** Senza il filtro questa
 *      lettura prendeva l'archivio dei gettoni di tutti i club a ogni
 *      scrittura di tutore».
 *      IPOTESI: e ristretta al **club**, non alla **scheda**. Ogni scrittura
 *      di tutore legge in memoria l'intero archivio dei gettoni del club,
 *      dentro la transazione che tiene i blocchi sulle schede; e
 *      `eraseGuardiansForAthlete` lo fa **tre volte** — una per
 *      `revocaIGettoni` (che chiude righe che due istruzioni dopo cancella),
 *      una per scegliere cosa cancellare, una dentro
 *      `refreshGuardianProjection`.
 *
 *  §F  scripts/pp-02-quinto-vaglio.mjs L3/L4 — «una scrittura fuori dal modulo
 *      proprietario e RESPINTA dall'archivio». Questa sonda non tocca il
 *      trigger, e lo verifica comunque su INSERT, UPDATE e DELETE.
 *
 * ---
 *
 * Ogni sezione porta il proprio CONTROLLO: la stessa misura dove l'esito deve
 * essere opposto. Senza, una sonda che dichiara ROSSO non dimostra di saper
 * dire VERDE.
 *
 * **Esito al 2026-09-06, su `ca30933` non modificato: 13/20, 7 FAIL.**
 * ROSSE: A2, A3, B2, B4, C1, D0, E1.
 * VERDI e discriminanti: A0, A1, B0, B1, B3, C0, C2, C3, D1, E0, E2, F1, F2.
 *
 * **Prova che le rosse discriminano.** Cinque mutazioni sul codice, applicate
 * e revertite con `git checkout -- src/`:
 *   1. in `eraseGuardiansForAthlete`, i gettoni si cancellano per
 *      `payload.athlete_id` — cioe per lo stesso criterio con cui il riepilogo
 *      li conta — fuori dalla guardia `if (daCancellare.length)`:
 *      **A2 e A3 verdi**, 14/20.
 *   2. in `unlinkTrainerAccount`, si toglie il blocco del gettone (come il
 *      gemello sul ramo genitore): **B2 e B4 verdi**, 15/20.
 *   3. in `upsertGuardianFromFormApproval`, la sostituzione **revoca** la voce
 *      invece di cancellarla: **C1 verde**, 14/20.
 *   4. in `forms/submissions/[id]/route.ts`, l'audit registra
 *      `applied: outcome.applied` invece della sua lunghezza: **D0 verde**,
 *      14/20.
 *   5. in `eraseGuardiansForAthlete`, si toglie la chiamata ridondante a
 *      `revocaIGettoni`: **E1 verde**, 14/20.
 * E la prova opposta, che i CONTROLLI sanno diventare rossi: togliendo
 * `organization_id` dall'`updateMany` di `unlinkTrainerAccount` — cioe
 * rimettendo il difetto R-3 dell'ottavo vaglio — **B3 diventa rossa** (12/20).
 *
 * Cinque esecuzioni consecutive sul codice non modificato: 13/20 tutte e
 * cinque, stesse sette rosse, nessuna intermittenza.
 *
 * **Il costo di §E, misurato a parte** (non e un'asserzione, e un numero):
 * su un club con 32.000 gettoni, `previewDataSubjectErasure` impiega 564 ms,
 * `refreshGuardianProjection` 752 ms — e gira **dentro** ogni transazione che
 * scrive un tutore, con i blocchi presi — e `eraseGuardiansForAthlete`
 * 1.625 ms. A zero gettoni: 96 ms, 7 ms. La crescita e lineare nei gettoni
 * del **club**, e niente li cancella mai se non l'oblio.
 *
 * **NON misurato** (lacuna dichiarata, non un verde): revoche concorrenti;
 * rollover di stagione x revoca; riscatto cross-club, replay e rate limiting;
 * una persona con due utenze; `data-subject.ts` end-to-end oltre alla fetta
 * dei tutori e a quella dei gettoni; il ramo genitore di §B (tolto dal commit
 * in esame, quindi non c'e piu niente da misurare li).
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { travasaTutori } from "./helpers/travaso-tutori.mjs";

const prisma = new PrismaClient({
  log: [{ emit: "event", level: "query" }],
});

/** Le interrogazioni viste, per §E: si misura una struttura, non un tempo. */
let interrogazioni = [];
prisma.$on("query", (evento) => {
  interrogazioni.push(String(evento.query || ""));
});

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

const CLUB = randomUUID();
const ALTRO = randomUUID();
const PRESIDENTE = randomUUID();
const SEGRETARIA = randomUUID();
const ALLENATORE = randomUUID();
const MODERATORE = randomUUID();
const UA = randomUUID();
const UB = randomUUID();
const MADRE = randomUUID();

/** Il ruolo di club che porta **solo** `forms.submissions.review`. */
const RUOLO_MODULI = "custom:staff:moduli";

const coda = `${CLUB.slice(0, 8)}@nono.local`;
const email = (chi) => `${chi}-${coda}`;

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Nono",
  password_hash: "$2b$10$nono",
  role: "user",
});

const atleta = async (nome, data = {}, nascita = new Date("2015-05-05")) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "Nono",
      status: "active",
      birth_date: nascita,
      data,
      updated_at: new Date(),
    },
  });
  return id;
};

const tessera = async (userId, ruolo, club = CLUB) =>
  prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: club,
      user_id: userId,
      role: ruolo,
      is_primary: true,
      updated_at: new Date(),
    },
  });

const righeDi = async (athleteId) =>
  prisma.athleteGuardian.findMany({
    where: { athlete_id: athleteId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  });

/** Un invito all'area famiglia, nella forma che conia `athletes/[id]/page.tsx`. */
const gettone = async (athleteId, guardianRowId, etichetta, club = CLUB) =>
  prisma.clubResourceItem.create({
    data: {
      id: randomUUID(),
      organization_id: club,
      resource_type: "access_tokens",
      name: `${etichetta}${club.slice(0, 6).toUpperCase()}`,
      status: "active",
      payload: {
        token_type: "parent_access",
        athlete_id: athleteId,
        guardian_id: guardianRowId,
        guardian_name: "Madre Nono",
        guardian_email: email("madre"),
        role: "parent",
        one_time: true,
        minted_by_role: "owner",
      },
      updated_at: new Date(),
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

/** «Scollega account» del tutore — la porta che si chiama revoca. */
const scollegaTutore = async (sessione, ruoloAttivo, athleteId, guardianId) => {
  const risposta = await rotte.scollegaTutore.DELETE(
    new Request(
      `http://collaudo.invalid/api/v1/guardian-accounts/${athleteId}/${guardianId}?reason=nono`,
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

/** «Scollega account» dell'allenatore, dalla rotta HTTP vera. */
const scollegaAllenatore = async (sessione, ruoloAttivo, trainerId) => {
  const risposta = await rotte.scollegaAllenatore.DELETE(
    new Request(
      `http://collaudo.invalid/api/v1/trainer-accounts/${trainerId}?reason=nono`,
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

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const cruscotto = await carica("src/lib/server/parent-dashboard.ts");
  const soggetto = await carica("src/lib/server/data-subject.ts");
  const auth = await carica("src/lib/server/auth.ts");
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    scollegaAllenatore: await carica(
      "src/app/api/v1/trainer-accounts/[trainerId]/route.ts",
    ),
    decide: await carica("src/app/api/v1/forms/submissions/[id]/route.ts"),
    scollegaTutore: await carica(
      "src/app/api/v1/guardian-accounts/[athleteId]/[guardianId]/route.ts",
    ),
  };

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(SEGRETARIA, email("segretaria"), "Segretaria"),
      utente(MODERATORE, email("moderatore"), "Moderatore"),
      utente(ALLENATORE, email("allenatore"), "Allenatore"),
      utente(UA, email("ua"), "Ada"),
      utente(UB, email("ub"), "Bruno"),
      utente(MADRE, email("madre"), "Madre"),
    ],
  });
  for (const [id, nome] of [
    [CLUB, "nono"],
    [ALTRO, "altro"],
  ]) {
    await prisma.club.create({
      data: {
        id,
        name: `${nome} ${id.slice(0, 6)}`,
        slug: `${nome}-${id.slice(0, 8)}`,
        creator_id: PRESIDENTE,
        updated_at: new Date(),
      },
    });
  }

  await tessera(PRESIDENTE, "owner");
  /*
    **`staff`, non un ruolo personalizzato.** Un ruolo personalizzato
    normalizza sulla base e la sonda misurerebbe due cose insieme; qui il
    ruolo canonico basta e la matrice e leggibile: `staff` porta
    `accounts.trainer.manage` (GESTIONE) e non porta `access_tokens`
    (MANAGEMENT_ADMIN_ONLY_RESOURCES).
  */
  await tessera(SEGRETARIA, "staff");
  await tessera(UA, "member");
  await tessera(UB, "member");
  await tessera(MADRE, "member");

  /*
    Il ruolo di club che il commento di `upsertGuardianFromFormApproval`
    descrive per nome: «un ruolo di club ristretto ai soli moduli —
    `forms.submissions.review` e nient'altro». Per lui `canGrantAccess` e
    falso su tutte e due i fattori.
  */
  const ruoloModuli = await prisma.clubRole.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      slug: RUOLO_MODULI,
      name: "Moduli",
      base_role: "staff",
      is_active: true,
      updated_at: new Date(),
      /*
        Due chiavi, non una: `forms.submissions.read` e il prerequisito di
        lettura che la coda impone, `forms.submissions.review` e la decisione.
        Nessuna delle due e `accounts.athlete.manage` ne `clinical.read`,
        cioe i due fattori di `canGrantAccess`.
      */
      permissions: {
        create: [
          { id: randomUUID(), permission_key: "forms.submissions.read" },
          { id: randomUUID(), permission_key: "forms.submissions.review" },
        ],
      },
    },
  });
  await prisma.organizationUser.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      user_id: MODERATORE,
      role: RUOLO_MODULI,
      custom_role_id: ruoloModuli.id,
      is_primary: true,
      updated_at: new Date(),
    },
  });

  const sessione = async (id) =>
    (
      await auth.createSessionForUser(
        await prisma.user.findUnique({ where: { id } }),
      )
    ).access_token;

  const sessPresidente = await sessione(PRESIDENTE);
  const sessSegretaria = await sessione(SEGRETARIA);
  const sessModeratore = await sessione(MODERATORE);

  const scopeOblio = {
    userId: PRESIDENTE,
    activeOrganizationId: CLUB,
    allowedOrganizationIds: [CLUB],
    activeRole: "owner",
    accessScopes: [],
  };

  const apre = async (chi, figlio) =>
    (await cruscotto.getParentLinkedAthletes(chi)).some((a) => a.id === figlio);

  /*
    **Le schede storiche si seminano tutte insieme, e il travaso gira una
    volta.** La migrazione vera gira una volta sull'archivio: rieseguirla su un
    club che ha gia le righe cade sulla chiave unica.
  */
  const FIGLIO_C = await atleta("FiglioC", {
    guardians: [
      {
        id: "c-coppia",
        name: "Coppia",
        surname: "Genitoriale",
        email: email("famigliac"),
        linkedUserIds: [UA, UB],
        fiscalCode: "CPPGNT80A01H501A",
      },
    ],
  });
  const FIGLIO_CC = await atleta("CtrlC", {
    guardians: [
      {
        id: "cc-coppia",
        name: "CoppiaCC",
        surname: "Genitoriale",
        email: email("famigliacc"),
        linkedUserIds: [UA, UB],
      },
    ],
  });
  await travasaTutori(prisma, [CLUB]);

  /*
    Un modulo **pubblico** con i soli campi del genitore, e due compilazioni
    in coda. Le righe si seminano direttamente: cio che questa sonda misura e
    l'**approvazione**, e la porta dell'invio non e in discussione.
  */
  const CAMPO = {
    nome: randomUUID(),
    cognome: randomUUID(),
    indirizzo: randomUUID(),
  };
  const schema = {
    title: "Iscrizione nono vaglio",
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
      title: "Iscrizione nono vaglio",
      status: "published",
      public_slug: `nono-${CLUB.slice(0, 12)}`,
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
  const compila = async () =>
    (
      await prisma.formSubmission.create({
        data: {
          id: randomUUID(),
          organization_id: CLUB,
          template_id: modello.id,
          version_id: versione.id,
          /* **Pubblica**: e cio che rende la riga nuova `contact_only`. */
          source: "public",
          kind: "enrollment",
          status: "pending",
          answers: {
            [CAMPO.nome]: "Sconosciuto",
            [CAMPO.cognome]: "Terzo",
            [CAMPO.indirizzo]: email("sconosciuto"),
          },
          subjects: [],
          files: [],
          updated_at: new Date(),
        },
      })
    ).id;
  const submissionId = await compila();
  const submissionIdCtrl = await compila();

  /* ================================================================== *
   * §A — l'oblio, e il gettone che nessuna riga nomina piu
   * ================================================================== */
  console.log("\n§A — cancellare un minore, e cio che resta di sua madre\n");
  {
    /* --- il CONTROLLO: la strada felice, con la riga ancora al suo posto. */
    const CTRL = await atleta("CtrlA");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: CTRL,
      rows: [{ firstName: "Madre", lastName: "A", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaCtrl = (await righeDi(CTRL))[0];
    const gCtrl = await gettone(CTRL, rigaCtrl.id, "CTRLA");

    const invCtrl = await soggetto.previewDataSubjectErasure(scopeOblio, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: CTRL,
    });
    await soggetto.eraseDataSubject(scopeOblio, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: CTRL,
      confirmationToken: invCtrl.confirmationToken,
      acknowledgeMinor: true,
      reason: "nono vaglio",
    });
    prova(
      "A0 CONTROLLO — con la riga ancora viva, l'oblio cancella l'invito",
      false,
      Boolean(await prisma.clubResourceItem.findUnique({ where: { id: gCtrl.id } })),
      "se questa fosse rossa, §A misurerebbe la semina e non la correzione dell'ottavo vaglio",
    );

    /* --- il REPERTO: la stessa scheda, ma il tutore era gia stato tolto. */
    const A = await atleta("FiglioA");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: A,
      rows: [{ firstName: "Madre", lastName: "A", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaA = (await righeDi(A))[0];
    const gA = await gettone(A, rigaA.id, "REPA");

    /*
      Il gesto naturale, e la sola porta che il settimo vaglio ha chiuso:
      la segreteria toglie la voce dalla scheda. La riga sparisce, il gettone
      resta in archivio — chiuso, e con dentro nome e indirizzo.
    */
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: A,
      rows: [],
      canGrantAccess: true,
    });
    const orfano = await prisma.clubResourceItem.findUnique({
      where: { id: gA.id },
    });
    prova(
      "A1 SEMINA — tolto il tutore, il gettone resta orfano in archivio",
      [0, true, "revoked"],
      [
        (await righeDi(A)).length,
        Boolean(orfano?.payload?.guardian_email),
        orfano?.status ?? null,
      ],
    );

    const inv = await soggetto.previewDataSubjectErasure(scopeOblio, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: A,
    });
    const fetta = inv.slices.find((s) => s.table === "club_resource_items");

    const primaDelle = await prisma.clubResourceItem.count({
      where: { organization_id: CLUB, resource_type: "access_tokens" },
    });
    await soggetto.eraseDataSubject(scopeOblio, {
      organizationId: CLUB,
      subjectKind: "athlete",
      subjectId: A,
      confirmationToken: inv.confirmationToken,
      acknowledgeMinor: true,
      reason: "nono vaglio",
    });
    const dopoLe = await prisma.clubResourceItem.count({
      where: { organization_id: CLUB, resource_type: "access_tokens" },
    });

    prova(
      "A2 REPERTO — il riepilogo conta cio che l'oblio togliera davvero",
      [Number(fetta?.count ?? -1), Number(fetta?.disposal === "delete")],
      [primaDelle - dopoLe, 1],
      `il riepilogo dichiara ${fetta?.count} riga/e con disposizione «${fetta?.disposal}»; ` +
        `l'oblio ne ha tolte ${primaDelle - dopoLe}. Il gettone di conferma copre il numero, non l'atto.`,
    );

    const residuo = await prisma.clubResourceItem.findUnique({
      where: { id: gA.id },
    });
    prova(
      "A3 REPERTO — dopo l'oblio nessun archivio conserva nome e indirizzo del tutore",
      [0, 0],
      [
        residuo?.payload?.guardian_email ? 1 : 0,
        residuo?.payload?.guardian_name ? 1 : 0,
      ],
      residuo
        ? `superstite: guardian_name=${JSON.stringify(residuo.payload?.guardian_name)}, ` +
          `guardian_email=${JSON.stringify(residuo.payload?.guardian_email)}`
        : "nessun superstite",
    );
  }

  /* ================================================================== *
   * §B — «Scollega account» dell'allenatore: una porta in piu
   * ================================================================== */
  console.log(
    "\n§B — il filtro di club chiude un asse; la chiave del client resta aperta\n",
  );
  {
    /* Il bersaglio e un invito vero all'area famiglia, del club. */
    const FIGLIO_B = await atleta("FiglioB");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_B,
      rows: [{ firstName: "Madre", lastName: "B", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaB = (await righeDi(FIGLIO_B))[0];
    const invitoFamiglia = await gettone(FIGLIO_B, rigaB.id, "FAMB");
    const invitoAltroClub = await gettone(randomUUID(), randomUUID(), "ALT", ALTRO);

    /* B0 — la porta vera, quella che il perimetro dichiara chiusa. */
    const diretto = await chiama(
      "PATCH",
      `/api/v1/access_tokens/${invitoFamiglia.id}`,
      { status: "revoked", name: "x" },
      sessSegretaria,
      "staff",
    );
    prova(
      "B0 CONTROLLO — `staff` sulla porta dei gettoni riceve 403",
      403,
      diretto.stato,
      "se questa fosse verde, §B misurerebbe un permesso che c'e, non uno aggirato",
    );

    /* B1 — la chiave che la rotta generica lascia scrivere. */
    const creata = await chiama(
      "POST",
      "/api/v1/trainers",
      {
        organization_id: CLUB,
        name: "Mario Allenatore",
        linkedUserId: ALLENATORE,
        accessTokenRecordId: invitoFamiglia.id,
      },
      sessSegretaria,
      "staff",
    );
    const trainerId = creata.corpo?.data?.id || null;
    const riletta = trainerId
      ? await prisma.clubResourceItem.findUnique({ where: { id: trainerId } })
      : null;
    prova(
      "B1 SEMINA — `staff` scrive `accessTokenRecordId` nel profilo allenatore",
      [200, invitoFamiglia.id],
      [creata.stato, riletta?.payload?.accessTokenRecordId ?? null],
    );

    const scollegamento = trainerId
      ? await scollegaAllenatore(sessSegretaria, "staff", trainerId)
      : { stato: 0 };
    const dopo = await statoGettone(invitoFamiglia.id);
    prova(
      "B2 REPERTO — l'invito della famiglia sopravvive a «Scollega allenatore»",
      "active",
      dopo,
      `DELETE /api/v1/trainer-accounts ha risposto ${scollegamento.stato}; ` +
        "un ruolo che sui gettoni prende 403 ne ha appena chiuso uno",
    );

    /* B3 — l'asse che la correzione R-3 ha davvero chiuso. */
    const creata2 = await chiama(
      "POST",
      "/api/v1/trainers",
      {
        organization_id: CLUB,
        name: "Lucia Allenatrice",
        linkedUserId: ALLENATORE,
        accessTokenRecordId: invitoAltroClub.id,
      },
      sessSegretaria,
      "staff",
    );
    const trainerId2 = creata2.corpo?.data?.id || null;
    if (trainerId2) await scollegaAllenatore(sessSegretaria, "staff", trainerId2);
    prova(
      "B3 CONTROLLO — il gettone di un ALTRO club resta intatto (R-3 tiene)",
      "active",
      await statoGettone(invitoAltroClub.id),
      "se questa fosse rossa, la correzione dell'ottavo vaglio non sarebbe applicata",
    );

    /*
      B4 — la traccia dell'atto nomina il gettone che ha chiuso?

      Si guardano **le righe dello scollegamento**, non tutte quelle del club:
      la creazione del profilo ne lascia una che porta il carico per intero, e
      contarla farebbe dire alla sonda che l'atto e tracciato quando a essere
      tracciata e la semina. E la forma vacua che questo pacchetto ha gia
      censurato tre volte.
    */
    const righeScollegamento = await prisma.auditLog.findMany({
      where: { organization_id: CLUB, action: "trainer_account.link.removed" },
      select: { action: true, resource_id: true, metadata: true },
    });
    const nominaIlGettone = righeScollegamento.some((riga) =>
      JSON.stringify(riga).includes(invitoFamiglia.id),
    );
    /*
      La proprieta e una **implicazione**, non una presenza: «se questa
      operazione ha chiuso un gettone, la sua traccia lo nomina». Cosi la
      misura resta vera anche dove il gettone non viene toccato — che e il
      comportamento del gemello sul ramo genitore — e falsa solo dove
      qualcosa e stato chiuso in silenzio.
    */
    prova(
      "B4 REPERTO — se lo scollegamento chiude un gettone, la traccia lo nomina",
      true,
      dopo !== "active" ? nominaIlGettone : true,
      `righe «trainer_account.link.removed»: ${righeScollegamento.length}; ` +
        `stato del gettone: ${JSON.stringify(dopo)}; nessuna riga lo nomina: ` +
        `${JSON.stringify(righeScollegamento[0] || null)}`,
    );
  }

  /* ================================================================== *
   * §C — l'approvazione di un modulo pubblico, e la voce che sparisce
   * ================================================================== */
  console.log(
    "\n§C — la sostituzione toglie la voce: quanto, e con quale traccia\n",
  );
  {
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_C, FIGLIO_CC]);
    const primaC = await righeDi(FIGLIO_C);
    const scheda = await prisma.athlete.findUnique({ where: { id: FIGLIO_C } });
    const proiezione = Array.isArray(scheda?.data?.guardians)
      ? scheda.data.guardians
      : [];

    prova(
      "C0 SEMINA — due righe vive su una voce sola, ed entrambe aprono il figlio",
      [2, 1, true, true],
      [
        primaC.filter((r) => !r.revoked_at && r.user_id).length,
        proiezione.length,
        await apre(UA, FIGLIO_C),
        await apre(UB, FIGLIO_C),
      ],
    );

    /*
      **Dalla porta vera.** Una compilazione **pubblica** — quindi
      `contactOnly: true`, che salta per costruzione il vaglio sulla
      concessione — approvata da un ruolo di club che porta **solo**
      `forms.submissions.review`, con `subjects` scelti dal corpo della
      richiesta (form-submissions.ts:1194, `overrideSelections`). Il
      `recordId` del genitore e la **posizione**, e da li
      `form-submissions.ts:2182` ricava `replacesGuardianRowId`.
    */
    const approvazione = await approva(sessModeratore, RUOLO_MODULI, submissionId, [
      { subject: "athlete", recordId: FIGLIO_C },
      { subject: "guardian", recordId: "0" },
    ]);
    console.log(
      `        POST /api/v1/forms/submissions/:id {action:"approve"} -> ${approvazione.stato}` +
        `  applied=${JSON.stringify(approvazione.corpo?.data?.applied || approvazione.corpo?.error)}`,
    );

    const dopoC = await righeDi(FIGLIO_C);
    console.log(
      `        raggio: ${
        primaC.filter((r) => !r.revoked_at && r.user_id).length -
        dopoC.filter((r) => !r.revoked_at && r.user_id).length
      } righe collegate a un'utenza tolte da un ruolo che porta due chiavi ` +
        `sui moduli e nient'altro; UA apre ancora? ${await apre(UA, FIGLIO_C)}; ` +
        `UB apre ancora? ${await apre(UB, FIGLIO_C)}`,
    );

    /*
      **La proprieta: chi perde una scheda resta rintracciabile come
      revocato.** E cio che fanno le tre porte che si chiamano revoca — la
      riga resta con `revoked_at`, e `refreshGuardianProjection` ne ricava
      `revokedGuardianIdentities`, che e cio su cui `findGuardianLinks`
      chiude la persona anche quando la raggiunge dall'indirizzo di famiglia
      di un'altra riga. Questa porta invece **cancella**: nessuna riga, nessun
      marchio, nessuna memoria dell'esclusione.
    */
    const marchiate = async (athleteId) => {
      const righe = await righeDi(athleteId);
      const scheda = await prisma.athlete.findUnique({ where: { id: athleteId } });
      const registro = Array.isArray(scheda?.data?.revokedGuardianIdentities)
        ? scheda.data.revokedGuardianIdentities.map(String)
        : [];
      return [UA, UB].filter(
        (chi) =>
          registro.includes(chi) ||
          righe.some((r) => r.revoked_at && String(r.user_id) === chi),
      ).length;
    };

    prova(
      "C1 REPERTO — chi perde la scheda resta rintracciabile come revocato",
      2,
      await marchiate(FIGLIO_C),
      "la sostituzione cancella invece di revocare: nessuna riga, nessun marchio, " +
        "nessuna memoria dell'esclusione su cui una difesa possa poggiare",
    );

    /* Il CONTROLLO: la stessa approvazione, senza nominare una riga. */
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_CC]);
    const primaCC = await righeDi(FIGLIO_CC);
    const controllo = await approva(
      sessModeratore,
      RUOLO_MODULI,
      submissionIdCtrl,
      [{ subject: "athlete", recordId: FIGLIO_CC }],
    );
    const dopoCC = await righeDi(FIGLIO_CC);
    prova(
      "C2 CONTROLLO — senza il soggetto `guardian` nessuna riga viva sparisce",
      [200, 2, true, true],
      [
        controllo.stato,
        dopoCC.filter((r) => !r.revoked_at && r.user_id).length,
        await apre(UA, FIGLIO_CC),
        await apre(UB, FIGLIO_CC),
      ],
      `prima erano ${primaCC.filter((r) => !r.revoked_at && r.user_id).length}; ` +
        "se questa fosse rossa, §C misurerebbe l'approvazione e non la sostituzione",
    );

    /* Il CONTROLLO: la stessa perdita, dalla porta che si chiama revoca. */
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_CC]);
    const schedaCC = await prisma.athlete.findUnique({ where: { id: FIGLIO_CC } });
    const voceCC = (
      Array.isArray(schedaCC?.data?.guardians) ? schedaCC.data.guardians : []
    )[0];
    const revoca = await scollegaTutore(
      sessPresidente,
      "owner",
      FIGLIO_CC,
      String(voceCC?.id || ""),
    );
    prova(
      "C3 CONTROLLO — dalla porta che si chiama revoca, il marchio c'e",
      [200, 2],
      [revoca.stato, await marchiate(FIGLIO_CC)],
      "se questa fosse rossa, C1 misurerebbe una proprieta che nessuna porta soddisfa",
    );

    /* ---------------------------------------------------------------- *
     * §D — la traccia che R-5 dichiara corretta, e dove finisce
     * ---------------------------------------------------------------- */
    console.log(
      "\n§D — «la traccia dice cio che e successo»: dove sta scritta?\n",
    );

    /*
      Non si cerca un nome in un sorgente: si cerca **l'atto**, in archivio,
      dopo che l'approvazione e avvenuta. La proprieta e «dopo questa
      approvazione, da qualche parte in archivio si legge che una riga viva e
      stata sostituita». Si guardano tutti e tre i posti possibili: il
      registro di audit, la riga della compilazione, e i suoi soggetti.
    */
    const audit = await prisma.auditLog.findMany({
      where: { organization_id: CLUB, action: "form.submission.approved" },
    });
    const compilazione = await prisma.formSubmission.findUnique({
      where: { id: submissionId },
    });

    /*
      Gli identificativi delle due righe cancellate, per cercarli davvero: un
      `includes("")` sarebbe sempre vero, ed e la forma di sonda vacua che
      questo pacchetto ha gia censurato.
    */
    const cancellate = primaC
      .filter((riga) => !riga.revoked_at && riga.user_id)
      .map((riga) => String(riga.id));

    const dice = (valore) => {
      const testo = JSON.stringify(valore ?? null);
      return (
        /sostitu/i.test(testo) ||
        cancellate.some((id) => id && testo.includes(id))
      );
    };

    prova(
      "D0 REPERTO — l'archivio dice che una riga viva e stata sostituita",
      true,
      dice(audit) || dice(compilazione),
      `righe «form.submission.approved»: ${audit.length}, metadata: ` +
        `${JSON.stringify(audit[0]?.metadata ?? null)}. ` +
        "`applied` non viene salvato sulla compilazione e la rotta ne registra " +
        "solo la lunghezza: la stringa corretta da R-5 vive nel corpo di una " +
        "risposta HTTP e non arriva in nessun registro.",
    );

    prova(
      "D1 CONTROLLO — l'approvazione lascia comunque una riga di audit",
      true,
      audit.length > 0,
      "se questa fosse rossa, D0 cercherebbe la traccia nel posto sbagliato",
    );
  }

  /* ================================================================== *
   * §E — «ristretta ai club»: quanto legge una cancellazione
   * ================================================================== */
  console.log(
    "\n§E — l'archivio dei gettoni si rilegge per intero, dentro i blocchi\n",
  );
  {
    /* Duecento gettoni che non riguardano questa scheda, ne questo atleta. */
    const rumore = [];
    for (let i = 0; i < 200; i += 1) {
      rumore.push({
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: `RUM${i}-${CLUB.slice(0, 6)}`,
        status: "active",
        payload: {
          token_type: "parent_access",
          athlete_id: randomUUID(),
          guardian_id: randomUUID(),
          guardian_name: `Tutore ${i}`,
          guardian_email: `t${i}-${coda}`,
          role: "parent",
          one_time: true,
        },
        updated_at: new Date(),
      });
    }
    await prisma.clubResourceItem.createMany({ data: rumore });

    const E = await atleta("FiglioE");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: E,
      rows: [{ firstName: "Madre", lastName: "E", email: email("madre") }],
      canGrantAccess: true,
    });

    /*
      Una **scansione integrale**: una `SELECT` su `club_resource_items` il cui
      `WHERE` nomina solo il tipo e il club — cioe che riporta in memoria
      l'archivio dei gettoni del club, qualunque sia la scheda che si sta
      toccando. Si guarda la clausola, non il nome della funzione.
    */
    const scansioni = (righe) =>
      righe.filter(
        (sql) =>
          /^\s*SELECT/i.test(sql) &&
          /FROM\s+"public"\."club_resource_items"/i.test(sql) &&
          /WHERE[\s\S]*"resource_type"\s*=/i.test(sql) &&
          !/athlete/i.test(sql.replace(/^[\s\S]*WHERE/i, "")) &&
          !/payload/i.test(sql.slice(sql.toUpperCase().indexOf("WHERE"))),
      ).length;

    /* Il CONTROLLO: una scheda senza tutori non deve leggere niente. */
    const SENZA = await atleta("CtrlE");
    interrogazioni = [];
    await tutori.eraseGuardiansForAthlete(prisma, SENZA, CLUB);
    await new Promise((r) => setImmediate(r));
    const senzaTutori = scansioni(interrogazioni);
    prova(
      "E0 CONTROLLO — su una scheda senza tutori non si legge l'archivio dei gettoni",
      0,
      senzaTutori,
      "se questa fosse rossa, E1 conterebbe una lettura che non dipende dalla scheda",
    );

    interrogazioni = [];
    const t0 = process.hrtime.bigint();
    await tutori.eraseGuardiansForAthlete(prisma, E, CLUB);
    const t1 = process.hrtime.bigint();
    await new Promise((r) => setImmediate(r));
    const conTutori = scansioni(interrogazioni);

    prova(
      /*
        **Ri-specificata: «al piu una» accettava il difetto.**

        La soglia era `<= 1`, e una scansione integrale e esattamente una: la
        misura passava sia con la lettura ristretta sia con quella di tutto il
        club. Verificato per iniezione — rimettendo la lettura club-wide questa
        riga restava verde.

        La proprieta non e «poche scansioni»: e **nessuna**. Una lettura che
        porta una restrizione sulla scheda non e una scansione, quante volte la
        si faccia; una che non la porta lo e, anche se e una sola.
      */
      "E1 la cancellazione non fa nessuna scansione integrale dell'archivio",
      0,
      conTutori,
      `scansioni integrali di club_resource_items dentro la transazione bloccata: ${conTutori} ` +
        `(revocaIGettoni, la scelta di cosa cancellare, refreshGuardianProjection); ` +
        `durata con 200 gettoni: ${Number(t1 - t0) / 1e6 | 0}ms. ` +
        "La prima chiude righe che due istruzioni dopo cancella: e ridondante.",
    );

    const clausola =
      (interrogazioni.find(
        (sql) =>
          /^\s*SELECT/i.test(sql) &&
          /FROM\s+"public"\."club_resource_items"/i.test(sql),
      ) || "").replace(/^[\s\S]*WHERE/i, "WHERE");
    prova(
      /*
        Il controllo, rovesciato insieme alla misura: la lettura che si fa
        **porta** una restrizione oltre il tipo e il club. Senza questa meta,
        una sonda che non contasse niente perche non si legge piu nulla — o
        perche la tabella e sparita — passerebbe E0 ed E1 a vuoto.
      */
      "E2 CONTROLLO — la clausola letta porta una restrizione sulla scheda",
      true,
      /"resource_type"/i.test(clausola) && /payload/i.test(clausola),
      `clausola misurata: ${clausola.slice(0, 200)}`,
    );
  }

  /* ================================================================== *
   * §F — l'archivio respinge chi scrive fuori dal modulo proprietario
   * ================================================================== */
  console.log("\n§F — il vaglio dell'archivio, ricontrollato\n");
  {
    const F = await atleta("FiglioF");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: F,
      rows: [{ firstName: "Madre", lastName: "F", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaF = (await righeDi(F))[0];

    const tenta = async (sql, parametri) => {
      try {
        await prisma.$executeRawUnsafe(sql, ...parametri);
        return "passata";
      } catch {
        return "respinta";
      }
    };

    prova(
      "F1 — un UPDATE fuori dal modulo proprietario e RESPINTO",
      "respinta",
      await tenta(`UPDATE "athlete_guardians" SET "revoked_at" = NULL WHERE "id" = $1`, [
        rigaF.id,
      ]),
    );
    prova(
      "F2 — un DELETE fuori dal modulo proprietario e RESPINTO",
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
  await prisma.clubResourceItem.deleteMany({
    where: { organization_id: { in: [CLUB, ALTRO] } },
  });
  await prisma.auditLog
    .deleteMany({ where: { organization_id: { in: [CLUB, ALTRO] } } })
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
    where: { organization_id: { in: [CLUB, ALTRO] } },
  });
  await prisma.clubRole.deleteMany({ where: { organization_id: CLUB } });
  await prisma.club.deleteMany({ where: { id: { in: [CLUB, ALTRO] } } });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [PRESIDENTE, SEGRETARIA, MODERATORE, ALLENATORE, UA, UB, MADRE],
      },
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
