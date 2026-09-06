/**
 * **Dodicesimo vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione.
 *
 *  §A  profile-account-links.ts:381-401 (`chiudiGliInvitiDelProfilo`, scritto
 *      il 2026-09-06, commit 53ede47) — «Il rimedio non e correggere anche
 *      quella: e **non avere due posti**. Chi scollega un profilo — «Scollega
 *      account», la revoca della tessera, l'uscita volontaria dal club, la
 *      cancellazione del profilo — chiama questa.»
 *      E, nello stesso commento: «Cercarne una sola non combacia con **nessun
 *      gettone del prodotto**: una difesa inerte, che da fuori e identica a
 *      una che funziona (ADR-0147).»
 *      E resources.ts:7869-7878 — «**L'invito se ne va con il profilo.** Il
 *      carico di un invito di allenatore o di staff porta `trainer_name`,
 *      `trainer_email` e `trainer_phone`».
 *      IPOTESI: la funzione unica e una sola, ma il **parametro** che le si
 *      passa e stato scelto per simmetria di nome e non misurato. Le due
 *      chiamate nuove passano
 *      `resource_type === "trainers" ? "trainer_id" : "staff_id"`
 *      (profile-account-links.ts:957 e resources.ts:7890-7891), mentre
 *      `unlinkTrainerAccount` — che carica indifferentemente `trainers` **e**
 *      `staff_members` (TIPI_ALLENATORE, riga 334) — passa `trainer_id`
 *      **fisso**. Uno dei due ha ragione. La schermata che conia gli inviti e
 *      `trainers/[id]/page.tsx`, che serve **anche** le voci di
 *      `clubs.staff_members` (righe 348-358) e scrive sempre
 *      `trainer_id: trainerId` (riga 827): la stringa `staff_id` non compare
 *      in **nessun** punto del repository che scriva un carico di gettone.
 *      E percio una chiave che non combacia con nessun dato del prodotto —
 *      la definizione esatta di difesa inerte data dal commit precedente,
 *      reintrodotta dalla correzione che la citava.
 *      Conseguenza attesa: la revoca della tessera di chi ha un profilo
 *      `staff_members` non chiude il suo invito, e chi ha il codice rientra;
 *      e la cancellazione del profilo lascia in archivio nome, indirizzo e
 *      telefono.
 *
 *  §B  profile-account-links.ts:427-441 — «Elencare gli stati aperti vuol dire
 *      tenere quell'elenco allineato con cio che il riscatto accetta, e sono
 *      due posti. Si nega invece il solo stato che chiude davvero: cio che non
 *      e `revoked` si chiude.»
 *      E redeem/route.ts:484 — `String(accessToken.status || "active")`.
 *      IPOTESI: `status` e una colonna **nullabile**
 *      (prisma/schema.prisma:1295, `status String?`), e in SQL
 *      `NOT (status = 'revoked')` non e vero per `NULL`. Misurato a parte:
 *      Prisma 6.19.2 traduce `status: { not: "revoked" }` in un predicato che
 *      **esclude** le righe con `status IS NULL`. Il riscatto invece legge
 *      `status || "active"` e le accetta. Il gemello dei tutori
 *      (`revocaIGettoni`, athlete-guardians.ts:2288) filtra **in memoria** con
 *      `String(record.status || "").trim() !== "revoked"`, che su `NULL` e
 *      vero: le due porte non hanno la stessa larghezza, che e esattamente cio
 *      che il commit dichiara di aver reso impossibile scrivendone una sola.
 *      La rotta generica dei gettoni non impone `status`.
 *      Conseguenza attesa: un invito coniato senza `status` e riscattabile e
 *      **nessuna** revoca lo chiude.
 *
 *  §C  form-submissions.ts:2100-2111 — «Il criterio non e «chi ha compilato»
 *      ne «da quale porta»: e **chi ha scritto quell'indirizzo**, e l'unica
 *      compilazione di cui il presupposto di ADR-0114 sia vero e quella
 *      interna.»
 *      E athlete-guardians.ts:1213-1231 (commit 53ede47) — «ADR-0114 fa valere
 *      l'indirizzo come chiave poggiando su un presupposto: **l'ha scritto il
 *      club**. Una compilazione pubblica non e il club, ed e esattamente cio
 *      che `contactOnly` dice.»
 *      IPOTESI: `compilataDalClub` e `asText(row.source) === "internal"`, e
 *      `source` non dice chi ha scritto: dice **quale rotta e stata chiamata**.
 *      `POST /api/v1/forms/submissions` -> `submitInternalForm` marca
 *      `source: "internal"` (form-submissions.ts:1063) e la sua unica guardia
 *      e `ensureOrganizationAccess` (forms.ts:111-113), che chiede la chiave di
 *      **lettura** dei moduli. Approvare ne chiede un'altra
 *      (`forms.submissions.review`, form-submissions.ts:1863). Chi ha solo la
 *      lettura puo percio produrre una compilazione che porta l'autorita del
 *      club, e la fa approvare a un collega: da li il ramo `update` riscrive
 *      nome e cognome della riga esistente — il danno di R-2, per la porta che
 *      R-2 non ha guardato.
 *      (La prima forma dell'ipotesi — «chiunque abbia una tessera» — e falsa,
 *      e il CONTROLLO C-1 la falsifica dalla rotta vera: un genitore riceve
 *      403.)
 *
 *  §D  athlete-guardians.ts:148-152 (`CHIAVI_CON_UNA_COLONNA` / `residuo`) —
 *      «Vivono in una colonna JSON perche **non decidono niente**: nessun
 *      accesso, nessuna identita.»
 *      E athlete-guardians.ts:1141-1145 — «Una riga che nasce `contact_only`
 *      non apre niente e non ha bisogno di chiedere niente.»
 *      E proiettaRiga (athlete-guardians.ts:2050-2055) — «La proiezione
 *      riproduce **la forma vecchia per intero**, righe revocate comprese».
 *      IPOTESI (lacuna dichiarata da tre revisioni, «letta, mai misurata»):
 *      `resolveFiscalRecipient` (src/lib/documents/fiscal-recipient.ts:223-227)
 *      sceglie **la prima riga della proiezione che porta un codice fiscale**,
 *      e non guarda ne `accessRevokedAt` ne `contactOnly`;
 *      `document-placeholders.ts:263-267` prende `{{parent.1.*}}` **per
 *      posizione**, righe revocate comprese. `guardian.fiscalCode` e un campo
 *      di modulo di prima classe (forms/dynamic-fields.ts:218) e finisce in
 *      `residuo`, che non lo elenca fra le chiavi con una colonna. Quindi una
 *      riga «che non decide niente» decide **l'intestatario della ricevuta che
 *      una famiglia porta in detrazione**, e un tutore revocato resta
 *      intestatario e resta «genitore 1».
 *
 * ---
 *
 * Ogni sezione porta il proprio CONTROLLO: la stessa misura dove l'esito deve
 * essere opposto. Senza, una sonda che dichiara ROSSO non dimostra di saper
 * dire VERDE.
 *
 * ---
 *
 * **Esito al 2026-09-06, su `53ede47` non modificato: 13/26, 13 FAIL.**
 * ROSSE: A2, A3b, A3c, A7, B1, B2, B4, B5, C0, C1, D0, D3, D4.
 * VERDI e discriminanti: A0, A1, A3, A4, A5, A6, A8, B0, B3, C-1, C2, D1, D2.
 * **Cinque esecuzioni consecutive sull'albero pulito: stesso esito tutte e
 * cinque, stesse rosse, nessuna intermittenza.**
 *
 * **Prova che le rosse discriminano.** Mutazioni sul codice, applicate e
 * revertite con `git checkout -- src/`:
 *   M1. `profile-account-links.ts:957` e `resources.ts:7890-7891` passano
 *       `"trainer_id"` anche per `staff_members`, come fa gia
 *       `unlinkTrainerAccount`: **A2, A3c e A7 verdi**; tutto il resto
 *       invariato (nessuna contaminazione fra le sezioni).
 *   M2. in `chiudiGliInvitiDelProfilo`, `status: { not: "revoked" }` diventa
 *       `OR: [{ status: null }, { status: { not: "revoked" } }]`:
 *       **B1, B2, B4 e B5 verdi**; §A, §C e §D invariate.
 *   M3. `form-submissions.ts:2111`, `compilataDalClub = false`:
 *       **C1 verde**, C0 resta rossa — cioe C1 misura la riscrittura del nome
 *       e non la rotta.
 *   M3bis. `submitInternalForm` chiede `forms.submissions.review`:
 *       **C0 verde** (e C1 diventa **vacua**, e lo dichiara da se).
 *   M4. `fiscal-recipient.ts` scarta le righe con `accessRevokedAt` o
 *       `contactOnly`: **D0 e D3 verdi**, **D4 resta rossa** — due lettori
 *       distinti, e chiuderne uno non chiude l'altro.
 *   M5. `loadTrainerAccessTarget` lancia quando `getResourceById` risponde
 *       `null` invece di restituire `{record: null}`: **A3b verde** e **A3
 *       DIVENTA ROSSA** — l'allenatore di staff revocato riscatta l'invito
 *       sopravvissuto e **rientra nel club** (riscatto 200, ruolo `trainer`,
 *       una tessera nuova). Cioe: A3 oggi e verde per un secondo difetto, non
 *       per la revoca.
 *   M1+M5 insieme: **tutta §A verde**, §B §C §D invariate — la chiave e il
 *       difetto, e la sola correzione della chiave chiude anche lo
 *       sfruttamento che M5 scopre.
 *
 * **NON misurato** (lacuna dichiarata, non un verde): revoche concorrenti;
 * rollover di stagione x revoca; riscatto cross-club e replay; rate limiting;
 * una persona con **due utenze**; il costo di `previewDataSubjectErasure` sulle
 * notifiche (lettura club-wide con filtro in memoria); `GETTONE_VIVO` nella
 * proiezione, che elenca ancora `active | pending | sent` mentre il riscatto
 * accetta anche un `redeemed` multi-uso; il ramo `unlinkClubJsonProfiles`
 * (verificato per lettura: `syncClubResourceItemsFromField` tiene allineata la
 * colonna JSON alle righe, quindi non e una porta in piu).
 *
 * Esecuzione:
 *   node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *     scripts/pp-02-dodicesimo-vaglio.mjs
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(74)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        ${nota}`);
};

const CLUB = randomUUID();
const PRESIDENTE = randomUUID();
const STAFF = randomUUID();
const ALLENATORE = randomUUID();
const NULLO = randomUUID();
const NULLO2 = randomUUID();
const MADRE = randomUUID();
const GENITORE_QUALUNQUE = randomUUID();
const MODERATORE = randomUUID();

const RUOLO_MODULI = "custom:staff:moduli";
const RUOLO_LETTURA = "custom:staff:moduli-lettura";

const coda = `${CLUB.slice(0, 8)}@dodicesimo.local`;
const email = (chi) => `${chi}-${coda}`;

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Dodicesimo",
  password_hash: "$2b$10$dodicesimo",
  role: "user",
});

const atleta = async (nome, nascita = new Date("2015-05-05")) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "Dodicesimo",
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
  id
    ? ((await prisma.clubResourceItem.findUnique({ where: { id } }))?.status ??
      "<riga assente>")
    : "<gettone non coniato>";

/**
 * Lo stato del gettone cercato **per nome**, cioe come lo cerca il riscatto.
 *
 * L'identificativo restituito dalla rotta non e sempre quello della riga — per
 * `access_tokens` la risposta e filtrata — e `findUnique` su un id sbagliato
 * risponde `null` esattamente come una riga con `status` nullo: leggere per
 * nome distingue «la riga non c'e» da «la riga c'e e non dichiara uno stato»,
 * che e la differenza che §B misura.
 */
const rigaPerNome = async (nome) =>
  prisma.clubResourceItem.findFirst({
    where: { organization_id: CLUB, resource_type: "access_tokens", name: nome },
  });

const statoPerNome = async (nome) => {
  const riga = await rigaPerNome(nome);
  return riga ? { esiste: true, status: riga.status } : { esiste: false, status: "<riga assente>" };
};

let rotte = null;

const ip = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}`;

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

/** «Scollega account» dell'allenatore, dalla rotta HTTP vera. */
const scollegaAllenatore = async (sessione, ruoloAttivo, trainerId) => {
  const risposta = await rotte.scollegaAllenatore.DELETE(
    new Request(
      `http://collaudo.invalid/api/v1/trainer-accounts/${encodeURIComponent(
        trainerId,
      )}?reason=dodicesimo`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${sessione}`,
          "x-active-club-id": CLUB,
          "x-active-access-role": ruoloAttivo,
          "x-forwarded-for": ip(),
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

/** La revoca di una tessera dalla Gestione accessi, dalla rotta HTTP vera. */
const revocaTessera = async (sessione, ruoloAttivo, membershipId) => {
  const risposta = await rotte.assegnazione.DELETE(
    new Request(
      `http://collaudo.invalid/api/v1/club-roles/assignments/${membershipId}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${sessione}`,
          "x-active-club-id": CLUB,
          "x-active-access-role": ruoloAttivo,
          "x-forwarded-for": ip(),
        },
      },
    ),
    { params: { id: membershipId } },
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
          "x-forwarded-for": ip(),
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

/** Una compilazione **interna**, dalla rotta HTTP vera, con la sessione di chi la manda. */
const compilaInterno = async (sessione, ruoloAttivo, corpo) => {
  const risposta = await rotte.compila.POST(
    new Request("http://collaudo.invalid/api/v1/forms/submissions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessione}`,
        "x-active-club-id": CLUB,
        "x-active-access-role": ruoloAttivo,
        "x-forwarded-for": ip(),
      },
      body: JSON.stringify(corpo),
    }),
  );
  let risultato = null;
  try {
    risultato = await risposta.json();
  } catch {
    risultato = null;
  }
  return { stato: risposta.status, corpo: risultato };
};

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const auth = await carica("src/lib/server/auth.ts");
  const fiscale = await carica("src/lib/documents/fiscal-recipient.ts");
  const segnaposti_ = await carica("src/lib/server/document-placeholders.ts");
  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    scollegaAllenatore: await carica(
      "src/app/api/v1/trainer-accounts/[trainerId]/route.ts",
    ),
    assegnazione: await carica(
      "src/app/api/v1/club-roles/assignments/[id]/route.ts",
    ),
    riscatto: await carica("src/app/api/v1/auth/access/redeem/route.ts"),
    compila: await carica("src/app/api/v1/forms/submissions/route.ts"),
    decide: await carica("src/app/api/v1/forms/submissions/[id]/route.ts"),
  };

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(STAFF, email("staff"), "Staff"),
      utente(ALLENATORE, email("allenatore"), "Allenatore"),
      utente(NULLO, email("nullo"), "Nullo"),
      utente(NULLO2, email("nullo2"), "Nullo2"),
      utente(MADRE, email("madre"), "Madre"),
      utente(GENITORE_QUALUNQUE, email("qualunque"), "Qualunque"),
      utente(MODERATORE, email("moderatore"), "Moderatore"),
    ],
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: `dodicesimo ${CLUB.slice(0, 6)}`,
      slug: `dodicesimo-${CLUB.slice(0, 8)}`,
      creator_id: PRESIDENTE,
      updated_at: new Date(),
    },
  });

  await tessera(PRESIDENTE, "owner");

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
  const sessStaff = await sessione(STAFF);
  const sessAllenatore = await sessione(ALLENATORE);
  const sessNullo = await sessione(NULLO);
  const sessNullo2 = await sessione(NULLO2);

  const fraUnAnno = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

  /** Un profilo, **come lo conia il prodotto**: identificativo logico. */
  const creaProfilo = async (tipo, idLogico, nome, utenza) =>
    chiama(
      "POST",
      `/api/v1/${tipo}`,
      {
        organization_id: CLUB,
        id: idLogico,
        name: nome,
        /*
          `trainers/[id]/page.tsx` serve **anche** le voci di `staff_members`,
          ma solo quelle con `role` allenatore (righe 352-357): e la voce di
          staff a cui il prodotto sa coniare un invito.
        */
        role: "trainer",
        status: "active",
        email: email(nome.toLowerCase()),
        phone: "3330000000",
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

  /**
   * Un invito, con il corpo di `trainers/[id]/page.tsx:815-833`.
   *
   * `stato` e un parametro perche §B misura cosa succede quando la rotta
   * generica non lo riceve: la colonna e nullabile e nessuna guardia lo impone.
   */
  const SENZA_STATO = Symbol("il corpo non porta `status`");
  const coniaGettone = async (valore, trainerIdNelCarico, chi, stato = "active") =>
    chiama(
      "POST",
      "/api/v1/access_tokens",
      {
        organization_id: CLUB,
        name: valore,
        ...(stato === SENZA_STATO ? {} : { status: stato }),
        date: fraUnAnno,
        role: "trainer",
        one_time: true,
        token_type: "trainer_access",
        usage_context: "trainer_account_link",
        trainer_id: trainerIdNelCarico,
        trainer_name: `Persona ${chi}`,
        trainer_email: email(chi),
        trainer_phone: "3330000000",
        expires_at: fraUnAnno,
        generated_at: new Date().toISOString(),
      },
      sessPresidente,
      "owner",
    );

  /* ================================================================== *
   * §A — la funzione e una sola; la chiave che le si passa e due, e una
   *      non combacia con nessun gettone del prodotto
   * ================================================================== */
  console.log(
    "\n§A — `staff_id`: la chiave del carico che nessuna schermata scrive\n",
  );

  {
    /* --- LA MISURA DI INERZIA: chi scrive `staff_id` in un carico di gettone? */
    const idS = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaProfilo("staff_members", idS, "Sofia", STAFF);
    const conioS = await coniaGettone("DODICISTAFF", idS, "staff");
    const gettoneS = conioS.corpo?.data?.id ?? null;
    const caricoS =
      (await prisma.clubResourceItem.findUnique({ where: { id: gettoneS } }))
        ?.payload ?? {};

    prova(
      "A0 SEMINA — l'invito di una voce di staff porta `trainer_id`, non `staff_id`",
      { trainer_id: idS, staff_id: null, stato: 200 },
      {
        trainer_id: String(caricoS.trainer_id ?? ""),
        staff_id: caricoS.staff_id ?? null,
        stato: conioS.stato,
      },
      "e il corpo esatto di `trainers/[id]/page.tsx:815-833`, la sola schermata " +
        "che conia inviti di profilo e che serve **anche** `clubs.staff_members`",
    );

    const tesseraS = await tessera(STAFF, "trainer", { is_primary: false });
    const revocaS = await revocaTessera(sessPresidente, "owner", tesseraS.id);
    const profiloS = await prisma.clubResourceItem.findFirst({
      where: {
        organization_id: CLUB,
        resource_type: "staff_members",
        payload: { path: ["id"], equals: idS },
      },
    });

    prova(
      "A1 SEMINA — la revoca riesce e lo sweep scollega anche il profilo di staff",
      [200, true, null],
      [
        revocaS.stato,
        revocaS.corpo?.data?.revoked === true,
        profiloS?.payload?.linkedUserId ?? null,
      ],
      "`unlinkProfileResources` percorre `trainers` **e** `staff_members`",
    );

    prova(
      "A2 REPERTO — la stessa revoca chiude l'invito della voce di staff",
      "revoked",
      await statoGettone(gettoneS),
      "profile-account-links.ts:957 passa `staff_id` per `resource_type === " +
        '"staff_members"`: la chiave non combacia con nessun gettone coniato ' +
        "dal prodotto, quindi la `findMany` non trova niente e non chiude niente",
    );

    const rientroS = await riscatta(sessStaff, "DODICISTAFF");
    const tessereS = await prisma.organizationUser.count({
      where: { organization_id: CLUB, user_id: STAFF },
    });
    prova(
      "A3 REPERTO — l'invito sopravvissuto non rimette dentro chi e stato revocato",
      [false, 0],
      [rientroS.stato === 200, tessereS],
      `POST /api/v1/auth/access/redeem -> ${rientroS.stato} ` +
        JSON.stringify(
          rientroS.corpo?.error?.message ||
            rientroS.corpo?.data?.membership?.role ||
            null,
        ),
    );

    /*
      **Perche A3 e verde: non e la revoca ad averlo chiuso.**

      `loadTrainerAccessTarget` (redeem/route.ts:132-146) prova prima
      `getResourceById("trainers", id)` e, **se quella lancia**, ripiega su
      `staff_members`. Ma `getResourceById` con `scope` assente non lancia
      quando la riga non c'e: `assertRecordAccess` esce con `if (!scope ||
      !record) return`. La prima prova restituisce percio `{resource:
      "trainers", record: null}` senza eccezione, il `catch` non scatta mai e
      il ripiego sullo staff e **codice morto**. Il riscatto di un invito di
      staff risponde 404 sempre — anche quando l'invito e vivo e nessuno ha
      revocato niente. E l'unica ragione per cui A2 oggi non e uno sfruttamento
      di accesso: una difesa che nessuno ha scritto.
    */
    const idZ = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaProfilo("staff_members", idZ, "Zita", null);
    await coniaGettone("DODICIZITA", idZ, "staff");
    const rientroZ = await riscatta(sessStaff, "DODICIZITA");
    prova(
      "A3b MISURA — un invito di staff **vivo**, mai revocato, si riscatta",
      200,
      rientroZ.stato,
      "se questa e 404, A3 e verde per una ragione che non c'entra con la " +
        "revoca: il ripiego su `staff_members` del riscatto e irraggiungibile, " +
        `-> ${JSON.stringify(rientroZ.corpo?.error?.message ?? null)}`,
    );

    const vivoS = await prisma.clubResourceItem.findUnique({
      where: { id: gettoneS },
    });
    prova(
      "A3c REPERTO — dopo la revoca l'invito non e piu in forma spendibile",
      { stato: "revoked", scadutoPerData: false, riscattabilePerStato: false },
      {
        stato: vivoS?.status ?? null,
        scadutoPerData:
          new Date(String(vivoS?.payload?.expires_at || 0)).getTime() <
          Date.now(),
        /* La condizione esatta di redeem/route.ts:484. */
        riscattabilePerStato: ["active", "pending", "sent", "redeemed"].includes(
          String(vivoS?.status || "active").trim().toLowerCase(),
        ),
      },
      "e la proprieta che lo sweep esiste per garantire, indipendentemente da " +
        "quale altra porta oggi rifiuti il riscatto: la data di scadenza non e " +
        "toccata da nessuna revoca, quindi cio che chiude e **solo** lo stato",
    );

    /* --- IL CONTROLLO: lo **stesso** sweep, sul profilo `trainers`. */
    const idT = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaProfilo("trainers", idT, "Teresa", ALLENATORE);
    const conioT = await coniaGettone("DODICITRAINER", idT, "allenatore");
    const gettoneT = conioT.corpo?.data?.id ?? null;
    const tesseraT = await tessera(ALLENATORE, "trainer", { is_primary: false });
    const revocaT = await revocaTessera(sessPresidente, "owner", tesseraT.id);

    prova(
      "A4 CONTROLLO — lo stesso sweep, su `trainers`, l'invito lo chiude",
      [200, "revoked"],
      [revocaT.stato, await statoGettone(gettoneT)],
      "se questa fosse rossa, A2 misurerebbe uno sweep rotto e non una **chiave " +
        "sbagliata**: e la differenza fra «la difesa non c'e» e «la difesa non " +
        "combacia con nessun dato»",
    );

    const rientroT = await riscatta(sessAllenatore, "DODICITRAINER");
    prova(
      "A5 CONTROLLO — sull'invito davvero chiuso il riscatto e rifiutato",
      false,
      rientroT.stato === 200,
      `-> ${rientroT.stato}; se questa fosse verde-per-caso, A3 misurerebbe il ` +
        "riscatto e non la sopravvivenza dell'invito",
    );

    /* --- IL SECONDO CONTROLLO: la porta gemella, che passa `trainer_id` fisso. */
    const idU = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaProfilo("staff_members", idU, "Ugo", null);
    const conioU = await coniaGettone("DODICIUGO", idU, "staff");
    const gettoneU = conioU.corpo?.data?.id ?? null;
    const scollegaU = await scollegaAllenatore(sessPresidente, "owner", idU);

    prova(
      "A6 CONTROLLO — «Scollega account» sulla **stessa** voce di staff lo chiude",
      [200, "revoked"],
      [scollegaU.stato, await statoGettone(gettoneU)],
      "`unlinkTrainerAccount` carica `trainers` **e** `staff_members` " +
        "(TIPI_ALLENATORE) e passa `trainer_id` **fisso** (riga 538): la porta " +
        "che il commit non ha parametrizzato e quella che funziona. Due porte " +
        "sullo stesso fatto, due chiavi diverse, e una sola combacia",
    );

    /* --- IL REPERTO DELLA CANCELLAZIONE: il carico che resta in archivio. */
    const idV = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaProfilo("staff_members", idV, "Vera", null);
    const conioV = await coniaGettone("DODICIVERA", idV, "staff");
    const gettoneV = conioV.corpo?.data?.id ?? null;
    const cancellaV = await chiama(
      "DELETE",
      `/api/v1/staff_members/${encodeURIComponent(idV)}`,
      undefined,
      sessPresidente,
      "owner",
    );
    const rimastoV = await prisma.clubResourceItem.findUnique({
      where: { id: gettoneV },
    });

    prova(
      "A7 REPERTO — «Elimina» su una voce di staff non lascia l'invito in archivio",
      [200, 0, null],
      [
        cancellaV.stato,
        await prisma.clubResourceItem.count({ where: { id: gettoneV } }),
        rimastoV?.payload?.trainer_email ?? null,
      ],
      "resources.ts:7890-7891 passa `staff_id` a `eraseProfileInvites`. Il " +
        "commento sopra dichiara «Il carico di un invito di allenatore **o di " +
        "staff** porta trainer_name, trainer_email e trainer_phone»: e vero, e " +
        "sono proprio quelli che restano",
    );

    /* --- IL CONTROLLO GEMELLO: la stessa cancellazione su `trainers`. */
    const idW = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaProfilo("trainers", idW, "Walter", null);
    const conioW = await coniaGettone("DODICIWALTER", idW, "allenatore");
    const gettoneW = conioW.corpo?.data?.id ?? null;
    const cancellaW = await chiama(
      "DELETE",
      `/api/v1/trainers/${encodeURIComponent(idW)}`,
      undefined,
      sessPresidente,
      "owner",
    );

    prova(
      "A8 CONTROLLO — la stessa cancellazione su `trainers` l'invito lo toglie",
      [200, 0],
      [
        cancellaW.stato,
        await prisma.clubResourceItem.count({ where: { id: gettoneW } }),
      ],
      "se questa fosse rossa, A7 misurerebbe una porta che non cancella niente",
    );
  }

  /* ================================================================== *
   * §B — «cio che non e `revoked` si chiude»: e `NULL` non e `revoked`
   * ================================================================== */
  console.log(
    "\n§B — un invito senza `status`: il riscatto lo accetta, la revoca non lo vede\n",
  );

  {
    const idN = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaProfilo("trainers", idN, "Nora", NULLO);
    /* Il conio **senza** `status`: la rotta generica non lo impone. */
    const conioN = await coniaGettone("DODICINULLO", idN, "nullo", SENZA_STATO);
    const gettoneN = conioN.corpo?.data?.id ?? null;

    prova(
      "B0 SEMINA — la rotta generica accetta un gettone senza `status`",
      { stato: 200, esiste: true, status: null },
      { stato: conioN.stato, ...(await statoPerNome("DODICINULLO")) },
      "`club_resource_items.status` e `String?` (schema.prisma:1295) e nessuna " +
        "guardia di `guardaIlConioDiUnGettone` lo richiede. La riga si cerca " +
        "**per nome**, come fa il riscatto: `esiste: true` con `status: null` e " +
        "cio che serve, e non lo direbbe un `findUnique` che risponde `null` " +
        "anche quando la riga non c'e",
    );

    const tesseraN = await tessera(NULLO, "trainer", { is_primary: false });
    const revocaN = await revocaTessera(sessPresidente, "owner", tesseraN.id);

    prova(
      "B1 REPERTO — la revoca chiude anche l'invito che non dichiara uno stato",
      [200, "revoked"],
      [revocaN.stato, (await statoPerNome("DODICINULLO")).status],
      "`status: { not: \"revoked\" }` diventa in SQL un predicato che **esclude** " +
        "`NULL`: la riga non entra nella `findMany` e resta com'era",
    );

    const rientroN = await riscatta(sessNullo, "DODICINULLO");
    const tessereN = await prisma.organizationUser.count({
      where: { organization_id: CLUB, user_id: NULLO },
    });
    prova(
      "B2 REPERTO — e chi e stato revocato non rientra riscattandolo",
      [false, 0],
      [rientroN.stato === 200, tessereN],
      `redeem/route.ts:484 legge \`String(accessToken.status || "active")\`: ` +
        `-> ${rientroN.stato} ` +
        JSON.stringify(
          rientroN.corpo?.error?.message ||
            rientroN.corpo?.data?.membership?.role ||
            null,
        ),
    );

    /* --- IL CONTROLLO: la porta gemella dei tutori, che filtra in memoria. */
    const FIGLIO_N = await atleta("FiglioN");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_N,
      rows: [
        {
          firstName: "Madre",
          lastName: "Nulla",
          email: email("madre"),
          userId: MADRE,
        },
      ],
      canGrantAccess: true,
    });
    const rigaMadreN = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO_N } })
    )[0];
    const invitoMadreN = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: "DODICIMADRENULL",
        /* Lo **stesso** stato assente, sull'altra porta. */
        status: null,
        payload: {
          token_type: "parent_access",
          role: "parent",
          one_time: true,
          athlete_id: FIGLIO_N,
          guardian_id: rigaMadreN.id,
          guardian_name: "Madre Nulla",
          guardian_email: email("madre"),
        },
        updated_at: new Date(),
      },
    });
    const tesseraMadreN = await tessera(MADRE, "parent", { is_primary: false });
    const revocaMadreN = await revocaTessera(
      sessPresidente,
      "owner",
      tesseraMadreN.id,
    );

    prova(
      "B3 CONTROLLO — la porta gemella dei tutori chiude lo stesso invito senza stato",
      [200, "revoked"],
      [revocaMadreN.stato, await statoGettone(invitoMadreN.id)],
      "`revocaIGettoni` filtra **in memoria** con " +
        "`String(record.status || \"\").trim() !== \"revoked\"`, che su `NULL` e " +
        "vero. Se questa fosse rossa, B1 misurerebbe un caso che nessuna porta " +
        "copre invece di **due larghezze diverse** per lo stesso fatto",
    );

    /* --- IL CONTROLLO DELLO SCOLLEGAMENTO: la terza porta, stessa funzione. */
    const idM = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaProfilo("trainers", idM, "Mirco", NULLO2);
    const conioM = await coniaGettone("DODICINULLO2", idM, "nullo2", SENZA_STATO);
    const gettoneM = conioM.corpo?.data?.id ?? null;
    const scollegaM = await scollegaAllenatore(sessPresidente, "owner", idM);

    prova(
      "B4 REPERTO — «Scollega account» chiude anch'esso l'invito senza stato",
      [200, "revoked"],
      [scollegaM.stato, (await statoPerNome("DODICINULLO2")).status],
      "e la **stessa** `chiudiGliInvitiDelProfilo`: una funzione sola, quindi " +
        "un difetto solo — ma su tutte le porte che la chiamano",
    );

    const rientroM = await riscatta(sessNullo2, "DODICINULLO2");
    prova(
      "B5 REPERTO — e nemmeno da li si rientra",
      false,
      rientroM.stato === 200,
      `-> ${rientroM.stato}`,
    );
  }

  /* ================================================================== *
   * §C — `source: "internal"` non dice chi ha scritto: dice quale rotta
   * ================================================================== */
  console.log(
    "\n§C — chi puo marcare una compilazione «del club»?\n",
  );

  const sessModeratore = await sessione(MODERATORE);
  const CAMPO = {
    nome: randomUUID(),
    cognome: randomUUID(),
    indirizzo: randomUUID(),
    codice: randomUUID(),
  };
  const schema = {
    title: "Iscrizione dodicesimo vaglio",
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
      {
        id: CAMPO.codice,
        type: "short_text",
        label: "Codice fiscale del genitore",
        description: "",
        required: false,
        placeholder: "",
        options: [],
        binding: "guardian.fiscalCode",
        consentKey: "",
      },
    ],
    settings: {},
  };
  const modello = await prisma.formTemplate.create({
    data: {
      id: randomUUID(),
      organization_id: CLUB,
      title: "Iscrizione dodicesimo vaglio",
      status: "published",
      public_slug: `dodicesimo-${CLUB.slice(0, 12)}`,
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

  /** Una compilazione **pubblica**: nessuna sessione la ha prodotta. */
  const compilaPubblico = async (nome, cognome, indirizzo, codice) =>
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
            ...(codice ? { [CAMPO.codice]: codice } : {}),
          },
          subjects: [],
          files: [],
          updated_at: new Date(),
        },
      })
    ).id;

  {
    /*
      **Il ruolo che puo compilare ma non decidere.**

      La prima ipotesi — «chiunque abbia una tessera» — e **falsa**, e il
      controllo C-1 la falsifica: `ensureOrganizationAccess` (forms.ts:111-113)
      chiede `canAccessClubResource(role, "forms", "read")`, e un genitore non
      ce l'ha. Ma la chiave che serve e quella di **lettura**, e la scrittura
      che ne consegue e l'identita di un tutore. Il ruolo qui sotto ha la sola
      `forms.submissions.read`: non puo approvare (`decideFormSubmission`
      chiede `forms.submissions.review`) e non puo scrivere un'anagrafica.
    */
    const ruoloLettura = await prisma.clubRole.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        slug: RUOLO_LETTURA,
        name: "Moduli (sola lettura)",
        base_role: "staff",
        is_active: true,
        updated_at: new Date(),
        permissions: {
          create: [
            { id: randomUUID(), permission_key: "forms.submissions.read" },
          ],
        },
      },
    });
    const tesseraQ = await tessera(GENITORE_QUALUNQUE, RUOLO_LETTURA, {
      is_primary: false,
      custom_role_id: ruoloLettura.id,
    });
    const sessQualunque = await sessione(GENITORE_QUALUNQUE);

    /* --- IL CONTROLLO C-1: il genitore, che la prima ipotesi credeva bastasse. */
    const tesseraP = await tessera(MADRE, "parent", { is_primary: false });
    const sessGenitore = await sessione(MADRE);
    const tentativoGenitore = await compilaInterno(sessGenitore, "parent", {
      templateId: modello.id,
      answers: { [CAMPO.nome]: "X", [CAMPO.cognome]: "Y", [CAMPO.indirizzo]: email("x") },
      respondentName: "X Y",
      respondentEmail: email("x"),
      subjects: [],
    });
    prova(
      "C-1 CONTROLLO — un genitore non puo marcare una compilazione «del club»",
      403,
      tentativoGenitore.stato,
      "se questa fosse rossa, §C misurerebbe l'assenza totale di una guardia; " +
        `la guardia c'e: ${JSON.stringify(tentativoGenitore.corpo?.error?.message ?? null)}`,
    );
    await prisma.organizationUser.delete({ where: { id: tesseraP.id } });

    const FIGLIO_C = await atleta("FiglioC");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_C,
      rows: [
        { firstName: "Madre", lastName: "Legittima", email: email("madrec") },
      ],
      canGrantAccess: true,
    });
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_C]);
    const rigaMadreC = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO_C } })
    )[0];

    const inviato = await compilaInterno(sessQualunque, RUOLO_LETTURA, {
      templateId: modello.id,
      answers: {
        [CAMPO.nome]: "Ignota",
        [CAMPO.cognome]: "Terza",
        [CAMPO.indirizzo]: email("madrec"),
      },
      respondentName: "Ignota Terza",
      respondentEmail: email("qualunque"),
      subjects: [],
    });
    const idInviato = inviato.corpo?.data?.submissionId ?? inviato.corpo?.data?.id ?? null;
    const rigaInvio = idInviato
      ? await prisma.formSubmission.findUnique({ where: { id: idInviato } })
      : await prisma.formSubmission.findFirst({
          where: { organization_id: CLUB, template_id: modello.id },
          orderBy: { created_at: "desc" },
        });

    prova(
      "C0 REPERTO — la chiave di **lettura** dei moduli non marca «internal»",
      { stato: 403, source: null },
      { stato: inviato.stato, source: rigaInvio?.source ?? null },
      "`POST /api/v1/forms/submissions` -> `submitInternalForm` scrive " +
        "`source: \"internal\"` (form-submissions.ts:1063), e la sua unica guardia " +
        "e `canAccessClubResource(role, \"forms\", \"read\")`: la **lettura**. " +
        "`compilataDalClub` legge poi quel `source` come «l'ha scritto il club», " +
        "che e il presupposto di ADR-0114. " +
        `risposta=${JSON.stringify(inviato.corpo?.error?.message ?? null)}`,
    );

    if (rigaInvio && rigaInvio.status === "pending") {
      const approvazioneC = await approva(
        sessModeratore,
        RUOLO_MODULI,
        rigaInvio.id,
        [{ subject: "athlete", recordId: FIGLIO_C }],
      );
      const madreDopoC = await prisma.athleteGuardian.findUnique({
        where: { id: rigaMadreC.id },
      });

      prova(
        "C1 REPERTO — la riga di chi porta gia quell'indirizzo conserva il proprio nome",
        ["Madre", "Legittima", false],
        [
          madreDopoC?.first_name ?? null,
          madreDopoC?.last_name ?? null,
          Boolean(madreDopoC?.contact_only),
        ],
        `approvazione -> ${approvazioneC.stato}; ` +
          `applied=${JSON.stringify(approvazioneC.corpo?.data?.applied ?? null)}. ` +
          "`contactOnly: !compilataDalClub` e falso perche `source === \"internal\"`, " +
          "e il ramo `update` riscrive nome e cognome incondizionatamente",
      );
    } else {
      prova(
        "C1 REPERTO — la riga di chi porta gia quell'indirizzo conserva il proprio nome",
        ["Madre", "Legittima", false],
        ["Madre", "Legittima", false],
        "**VACUA**: C0 e verde, la rotta ha rifiutato e non c'e niente da " +
          "approvare. Questa riga vale solo finche C0 e rossa; letta da sola " +
          "non dimostra niente, ed e detto qui perche non venga contata",
      );
    }

    /* --- IL CONTROLLO: la stessa collisione, dalla porta pubblica. */
    const FIGLIO_D = await atleta("FiglioD");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_D,
      rows: [
        { firstName: "Madre", lastName: "Legittima", email: email("madred") },
      ],
      canGrantAccess: true,
    });
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_D]);
    const rigaMadreD = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO_D } })
    )[0];
    const submissionD = await compilaPubblico("Ignota", "Terza", email("madred"));
    const approvazioneD = await approva(
      sessModeratore,
      RUOLO_MODULI,
      submissionD,
      [{ subject: "athlete", recordId: FIGLIO_D }],
    );
    const madreDopoD = await prisma.athleteGuardian.findUnique({
      where: { id: rigaMadreD.id },
    });

    prova(
      "C2 CONTROLLO — dalla porta pubblica la correzione di ieri regge",
      [200, "Madre", "Legittima"],
      [
        approvazioneD.stato,
        madreDopoD?.first_name ?? null,
        madreDopoD?.last_name ?? null,
      ],
      "se questa fosse rossa, §C misurerebbe una correzione mai avvenuta e non " +
        "la **porta gemella** che la aggira",
    );

    await prisma.organizationUser.delete({ where: { id: tesseraQ.id } });
  }

  /* ================================================================== *
   * §D — cio che «non decide niente» decide l'intestatario di una ricevuta
   * ================================================================== */
  console.log(
    "\n§D — `contact_only` e `accessRevokedAt` davanti al destinatario fiscale\n",
  );

  {
    /* --- IL REPERTO 1: una riga di solo recapito, nata da un modulo pubblico. */
    const FIGLIO_G = await atleta("FiglioG");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_G,
      rows: [
        { firstName: "Madre", lastName: "Legittima", email: email("madreg") },
      ],
      canGrantAccess: true,
    });
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_G]);

    const submissionG = await compilaPubblico(
      "Ignota",
      "Terza",
      email("terzag"),
      "TRZGNT80A01H501X",
    );
    const approvazioneG = await approva(
      sessModeratore,
      RUOLO_MODULI,
      submissionG,
      [{ subject: "athlete", recordId: FIGLIO_G }],
    );
    const schedaG = await prisma.athlete.findUnique({
      where: { id: FIGLIO_G },
    });
    const righeG = await prisma.athleteGuardian.findMany({
      where: { athlete_id: FIGLIO_G },
      orderBy: { position: "asc" },
    });
    const nataG = righeG.find((r) => r.contact_only);
    const intestatarioG = fiscale.resolveFiscalRecipient(schedaG);

    prova(
      "D0 REPERTO — una riga «di solo recapito» non diventa intestataria della ricevuta",
      { contactOnly: true, eLaTerza: false, codiceDellaTerza: false },
      {
        contactOnly: Boolean(nataG?.contact_only),
        eLaTerza: intestatarioG.name === "Ignota Terza",
        codiceDellaTerza: intestatarioG.fiscalCode === "TRZGNT80A01H501X",
      },
      `approvazione -> ${approvazioneG.stato}; ` +
        `applied=${JSON.stringify(approvazioneG.corpo?.data?.applied ?? null)}. ` +
        "`residuo` conserva `fiscalCode` perche non e in `CHIAVI_CON_UNA_COLONNA`, " +
        "e `resolveFiscalRecipient` sceglie **la prima riga con un codice " +
        "fiscale** senza guardare `contactOnly`. Il commento di `residuo` dice " +
        "«non decidono niente: nessun accesso, nessuna identita»",
    );

    prova(
      "D1 REPERTO — e non diventa nemmeno «genitore 1» dei segnaposto",
      "Madre",
      String(
        (Array.isArray(schedaG?.data?.guardians)
          ? schedaG.data.guardians[0]
          : {})?.name ?? "",
      ),
      "`document-placeholders.ts:263-267` prende `{{parent.1.*}}` **per " +
        "posizione** sulla proiezione. Questa e verde per costruzione (la riga " +
        "nuova si accoda), ed e il CONTROLLO di posizione di D2",
    );

    /* --- IL REPERTO 2: un tutore revocato resta intestatario. */
    const FIGLIO_H = await atleta("FiglioH");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_H,
      rows: [
        {
          firstName: "Madre",
          lastName: "Revocata",
          email: email("madreh"),
          extra: { fiscalCode: "RVCMDR80A41H501Y" },
        },
      ],
      canGrantAccess: true,
    });
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_H]);
    const rigaH = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO_H } })
    )[0];

    const primaH = fiscale.resolveFiscalRecipient(
      await prisma.athlete.findUnique({ where: { id: FIGLIO_H } }),
    );

    await tutori.revokeGuardianRow(prisma, {
      athleteId: FIGLIO_H,
      guardianRowId: rigaH.id,
      organizationId: CLUB,
    });
    const schedaH = await prisma.athlete.findUnique({
      where: { id: FIGLIO_H },
    });
    const dopoH = fiscale.resolveFiscalRecipient(schedaH);
    const proiettataH = Array.isArray(schedaH?.data?.guardians)
      ? schedaH.data.guardians[0]
      : {};

    prova(
      "D2 SEMINA — prima della revoca l'intestataria e la madre",
      ["Madre Revocata", "RVCMDR80A41H501Y"],
      [primaH.name, primaH.fiscalCode],
      "se questa fosse rossa, D3 misurerebbe una proiezione vuota",
    );

    prova(
      "D3 REPERTO — dopo la revoca il tutore revocato non e piu intestatario fiscale",
      { revocata: true, eLaRevocata: false, codiceDellaRevocata: false },
      {
        revocata: Boolean(proiettataH?.accessRevokedAt),
        eLaRevocata: dopoH.name === "Madre Revocata",
        codiceDellaRevocata: dopoH.fiscalCode === "RVCMDR80A41H501Y",
      },
      "`fiscal-recipient.ts:223-227` sceglie la prima riga con un codice fiscale " +
        "e non legge `accessRevokedAt`. Una revoca chiude l'accesso e non " +
        "l'intestazione: la ricevuta che la famiglia porta in detrazione resta a " +
        "nome, codice fiscale e indirizzo di chi il club ha escluso. Lacuna " +
        "dichiarata da tre revisioni, **mai decisa per iscritto**",
    );

    /*
      **Ri-specificata: il lettore, non la proiezione.**

      Chiedeva che la **proiezione** non nominasse piu la revocata. Ma la
      proiezione deve continuare a riprodurre le righe revocate: e una
      decisione esplicita (ADR-0140), ed e cio che permette alla scheda di
      mostrare «revocato» invece di far sparire la persona. Pretendere il
      contrario avrebbe chiesto di nascondere una revoca all'operatore.

      Cio che non deve nominarla e il **segnaposto**, che e il lettore che
      finisce su un documento generato. La posizione resta dov'e — spostarla
      farebbe slittare `{{parent.2.*}}`, e questo pacchetto ha gia misurato
      quanto costa — e la voce esclusa risponde vuoto.
    */
    const segnaposti = segnaposti_.buildPlaceholderValues({
      club: { id: CLUB, name: "Dodicesimo", settings: {} },
      athlete: schedaH,
      season: null,
      now: new Date(),
      charges: [],
      transactions: [],
      attendance: { sessions: 0, hours: 0 },
    });

    /*
      **Si guarda la posizione in cui la revocata sta davvero.**

      La prima stesura leggeva `parent.1`, cioe l'indice zero, e la revocata
      puo non essere li: la misura restava verde anche rimettendo il difetto.
      Verificato per iniezione — e la sesta volta che una sonda di questo
      pacchetto misura un posto invece di un fatto.
    */
    const postoDellaRevocata =
      (Array.isArray(schedaH?.data?.guardians)
        ? schedaH.data.guardians
        : []
      ).findIndex((voce) => String(voce?.name ?? "") === "Madre") + 1;

    prova(
      "D4 SEMINA — la revocata occupa una posizione fra i segnaposto",
      true,
      postoDellaRevocata > 0,
      `posto: ${postoDellaRevocata} — proiezione: ${JSON.stringify((schedaH?.data?.guardians || []).map((v) => [v?.name, Boolean(v?.accessRevokedAt)]))}`,
    );

    prova(
      "D4 REPERTO — e non e piu «genitore N» sui documenti",
      false,
      String(
        segnaposti[`parent.${postoDellaRevocata}.first_name`]?.text ?? "",
      ) === "Madre",
      "`document-placeholders.ts:263-267` prende `{{parent.1.*}}` **per " +
        "posizione** sulla proiezione, che riproduce le righe revocate «per " +
        "intero, marchi compresi» (athlete-guardians.ts:2050-2055). Sono **due " +
        "lettori distinti**: chiudere D3 non chiude D4",
    );
  }

  const passati = esiti.filter((e) => e.ok).length;
  console.log(
    `\nEsito: ${passati}/${esiti.length} PASS, ${esiti.length - passati} FAIL\n`,
  );
};

const pulisci = async () => {
  await prisma.auditLog.deleteMany({ where: { organization_id: CLUB } });
  await prisma.club.deleteMany({ where: { id: CLUB } });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          PRESIDENTE,
          STAFF,
          ALLENATORE,
          NULLO,
          NULLO2,
          MADRE,
          GENITORE_QUALUNQUE,
          MODERATORE,
        ],
      },
    },
  });
};

main()
  .catch((error) => {
    console.error("\nSONDA INTERROTTA:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pulisci().catch(() => {});
    await prisma.$disconnect();
  });
