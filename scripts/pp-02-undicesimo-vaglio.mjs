/**
 * **Undicesimo vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione.
 *
 *  §A  profile-account-links.ts:398-408 (commento di `unlinkTrainerAccount`,
 *      scritto il 2026-09-06, commit 54976f5) — «cio che si chiude non e il
 *      legame, e la **strada per rifarlo**». E il gemello dichiarato in
 *      `unlinkDirectAthleteProfile` (profile-account-links.ts:1117-1128):
 *      «Due porte per lo stesso fatto devono lasciare lo stesso stato, o
 *      quella piu debole diventa la strada che si prende.»
 *      E CLAUDE.md §2 su `profile-account-links.ts`: «qui vivono... piu lo
 *      sweep che `revokeClubAccess` e l'uscita volontaria dal club chiamano
 *      entrambi **per non lasciare riferimenti dangling dopo una revoca
 *      completa**».
 *      IPOTESI: le porte che tolgono un allenatore da un club sono **due** —
 *      «Scollega account» (`unlinkTrainerAccount`) e la Gestione accessi
 *      (`revokeClubAccess` -> `unlinkProfileResources`) — e solo la prima ha
 *      ricevuto la correzione di ieri. `clearLinkedFields`
 *      (profile-account-links.ts:234-330) azzera `accessTokenRecordId` e
 *      `access_token_record_id`, cioe **il puntatore**, e non tocca la riga
 *      `club_resource_items` che il puntatore nominava: l'invito resta
 *      `active`. I due gemelli dello stesso sweep lo chiudono — il tutore per
 *      `unlinkParentGuardians` -> `revokeGuardianAccessInClub` ->
 *      `revocaIGettoni`, l'atleta per `unlinkDirectAthleteProfile`, che
 *      l'invito lo marca `revoked` con un commento che dice **esattamente**
 *      questo — e l'allenatore no.
 *      Conseguenza attesa: la direzione revoca la tessera dalla Gestione
 *      accessi, la schermata dice revocato, l'audit scrive `clubRoleRevoked`
 *      — e chi ha il codice in tasca lo riscatta e rientra nel club con una
 *      tessera nuova.
 *
 *  §B  athlete-guardians.ts:1740-1747 (`eraseGuardianInvitesForAthlete`,
 *      scritto il 2026-09-06, commit 54976f5) — «una difesa chiusa da una
 *      porta sola non e chiusa: e la stessa forma per cui esiste questo
 *      pacchetto». E ADR-0145 — «il carico di un invito... e percio un
 *      settimo indice dove vive una persona». E CLAUDE.md §2 —
 *      `data-subject.ts` e «l'unico posto in cui si dichiara dove vive una
 *      persona».
 *      IPOTESI: la correzione e stata scritta per **l'invito del tutore** e
 *      innestata su `resource === "athletes" | "simplified_athletes"`. Il
 *      carico di un invito **d'allenatore** porta `trainer_name`,
 *      `trainer_email` e `trainer_phone` — li scrive
 *      `trainers/[id]/page.tsx:827-830 — cioe lo stesso genere di dato, con lo
 *      stesso stato `active`, e `DELETE /api/v1/trainers/:id` lo lascia in
 *      archivio. Ottavo indice, non dichiarato da nessuna parte.
 *
 *  §C  profile-account-links.ts:398-408 — la stessa correzione, dall'altro
 *      lato. Spostare la chiusura dell'invito **prima** di
 *      `if (!linkedUserId) return` chiude l'invito e lascia il `return` dov'e:
 *      la riga di audit `trainerAccountUnlinked` sta **dopo**.
 *      E audit.ts:686-694 — «Un registro che nessuno puo leggere non e un
 *      registro», e redeem/route.ts:494-503 — «L'atto che fa entrare una
 *      persona in un club... non compariva nel registro».
 *      IPOTESI: un atto di sicurezza — la chiusura di un invito vivo — avviene
 *      senza lasciare **nessuna** riga; e il carico del profilo continua a
 *      dichiarare `accessTokenStatus: "active"` su un invito che e `revoked`,
 *      quindi la schermata mostra come spendibile un codice che non lo e piu
 *      (e viceversa non mostra che qualcuno lo ha chiuso).
 *
 *  §D  CLAUDE.md §2 — `data-subject.ts` e «l'unico posto in cui si dichiara
 *      dove vive una persona... Tre classi: si cancella, si anonimizza, si
 *      conserva **con il motivo scritto**». E data-subject.ts:1144-1150 — il
 *      gettone di conferma: «Il riepilogo di cio che verra cancellato e
 *      cambiato, o non e stato letto».
 *      IPOTESI (lacuna dichiarata da due revisioni di fila, mai misurata):
 *      ventidue fette dichiarate a mano in `previewDataSubjectErasure` e un
 *      atto scritto a mano in `eraseDataSubject`, senza niente che li leghi.
 *      Si semina una riga in ogni fetta seminabile, si legge il riepilogo
 *      dalla rotta vera, si cancella dalla rotta vera, e si conta di nuovo:
 *      cio che il riepilogo dichiara `delete` deve sparire, cio che dichiara
 *      `retain` deve restare, e cio che l'atto tocca dev'essere dichiarato.
 *
 *  §E  form-submissions.ts:2155-2178 (commento scritto il 2026-09-06, commit
 *      54976f5) — «L'indirizzo del modulo viene percio per primo», e il
 *      racconto del danno che quella correzione dichiara di aver chiuso: «la
 *      riga della madre — identita, indirizzo, utenza — si ritrovava il nome
 *      di un estraneo, e da li i segnaposto `{{parent.N.*}}`, il destinatario
 *      fiscale di una ricevuta e i tre canali di notifica nominavano lui».
 *      IPOTESI: la correzione ha cambiato **quale indirizzo** risolve
 *      l'identita, non **cosa succede** quando quell'identita esiste gia. Il
 *      ramo `update` dell'`upsert` (athlete-guardians.ts:1193-1199) riscrive
 *      `first_name` e `last_name` **incondizionatamente**, e `contact_only` —
 *      il segno che una compilazione pubblica dovrebbe portare — «si mette
 *      solo su una riga che nasce». Chi conosce l'indirizzo di contatto di un
 *      tutore (che e l'indirizzo di famiglia, e sta su ogni email del club) lo
 *      dichiara nel modulo pubblico con il **proprio** nome: l'approvazione
 *      cade sulla riga esistente e la rinomina. E il danno di R-2, per la
 *      strada che R-2 non ha chiuso. La traccia dice «Genitore aggiunto».
 *
 * ---
 *
 * Ogni sezione porta il proprio CONTROLLO: la stessa misura dove l'esito deve
 * essere opposto. Senza, una sonda che dichiara ROSSO non dimostra di saper
 * dire VERDE.
 *
 * **Esito al 2026-09-06, su `54976f5` non modificato: 17/25, 8 FAIL.**
 * ROSSE: A2, A3, B1, C1, C2, D4, E0, E1.
 * VERDI e discriminanti: A0, A1, A4, A5, A6, A7, B0, B2, C0, C3, C4, D0, D1,
 * D2, D3, D5, E2.
 * **Cinque esecuzioni consecutive: stesso esito tutte e cinque, stesse rosse,
 * nessuna intermittenza.**
 *
 * **Prova che le rosse discriminano.** Mutazioni sul codice, applicate e
 * revertite con `git checkout -- src/`:
 *   M1. in `unlinkProfileResources`, dopo la ripulitura del carico, l'invito
 *       si chiude nell'archivio dei gettoni con **le due grafie**
 *       (`record.id` e `payload.id`), come fa `unlinkTrainerAccount`:
 *       **A2 e A3 verdi**.
 *   M2. in `deleteResource`, ramo `club_resource`, gli inviti che nominano un
 *       profilo `trainers`/`staff_members` si cancellano con il profilo:
 *       **B1 verde**.
 *       (M1 e M2 applicate insieme: C1, C2 e D4 **restano rosse** — nessuna
 *       contaminazione fra le sezioni.)
 *   M3+M4. in `unlinkTrainerAccount`, il ramo `if (!linkedUserId) return`
 *       allinea il carico (`accessTokenStatus: "revoked"`) e scrive la riga di
 *       audit prima di uscire: **C1 e C2 verdi**.
 *   M5. una fetta `notifications` dichiarata in `previewDataSubjectErasure`:
 *       **D4 verde**.
 *       (M3+M4+M5 applicate insieme: A2, A3 e B1 **restano rosse**.)
 *   M7+M8. nel ramo `update` dell'`upsert`, `first_name` e `last_name` non si
 *       riscrivono quando `contactOnly` (cioe da una compilazione pubblica); e
 *       l'etichetta d'audit dice «aggiornato» quando la riga scritta esisteva
 *       gia prima dell'upsert: **E0 ed E1 verdi**.
 *       (A2, A3, B1, C1, C2 e D4 **restano rosse**.)
 *
 * **Prova opposta, che i CONTROLLI sanno diventare rossi.** Spegnendo
 * `revocaIGettoni` dentro `revokeGuardianAccessInClub` — cioe iniettando nel
 * gemello del tutore il difetto che §A misura sull'allenatore — **A6 e A7
 * diventano rosse**, e A7 mostra il tutore revocato che rientra riscattando
 * (riscatto 200). I controlli non sono verdi per costruzione.
 *
 * **NON misurato** (lacuna dichiarata, non un verde): revoche concorrenti;
 * rollover di stagione x revoca; riscatto cross-club e replay; rate limiting;
 * una persona con **due utenze**; le fette `consent_records`,
 * `generated_documents` e `form_submissions` dell'oblio (richiedono
 * definizioni e modelli pubblicati e non sono seminate qui); il costo delle
 * letture; `fiscal-recipient.ts` e `document-placeholders.ts`, che leggono la
 * proiezione **per posizione** e non guardano `accessRevokedAt`.
 *
 * Esecuzione:
 *   node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *     scripts/pp-02-undicesimo-vaglio.mjs
 */

import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
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
const ALLENATORE = randomUUID();
const ALLENATORE2 = randomUUID();
const ALLENATORE3 = randomUUID();
const MADRE = randomUUID();
const MODERATORE = randomUUID();

const RUOLO_MODULI = "custom:staff:moduli";

const coda = `${CLUB.slice(0, 8)}@undicesimo.local`;
const email = (chi) => `${chi}-${coda}`;

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Undicesimo",
  password_hash: "$2b$10$undicesimo",
  role: "user",
});

const atleta = async (nome, nascita = new Date("2015-05-05")) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "Undicesimo",
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
      )}?reason=undicesimo`,
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

/** Il riepilogo dell'oblio, dalla rotta HTTP vera. */
const riepilogo = async (sessione, ruoloAttivo, athleteId) => {
  const risposta = await rotte.oblio.GET(
    new Request(
      `http://collaudo.invalid/api/v1/data-subject/${athleteId}?organization_id=${CLUB}`,
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${sessione}`,
          "x-active-club-id": CLUB,
          "x-active-access-role": ruoloAttivo,
        },
      },
    ),
    { params: { subjectId: athleteId } },
  );
  let corpo = null;
  try {
    corpo = await risposta.json();
  } catch {
    corpo = null;
  }
  return { stato: risposta.status, corpo };
};

/** La cancellazione dell'interessato, dalla rotta HTTP vera. */
const cancellaInteressato = async (sessione, ruoloAttivo, athleteId, gettone) => {
  const risposta = await rotte.oblio.DELETE(
    new Request(`http://collaudo.invalid/api/v1/data-subject/${athleteId}`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${sessione}`,
        "x-active-club-id": CLUB,
        "x-active-access-role": ruoloAttivo,
      },
      body: JSON.stringify({
        organization_id: CLUB,
        confirmation_token: gettone,
        acknowledge_minor: true,
        reason: "undicesimo vaglio",
      }),
    }),
    { params: { subjectId: athleteId } },
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
  const auth = await carica("src/lib/server/auth.ts");
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
    oblio: await carica("src/app/api/v1/data-subject/[subjectId]/route.ts"),
    decide: await carica("src/app/api/v1/forms/submissions/[id]/route.ts"),
  };

  await prisma.user.createMany({
    data: [
      utente(PRESIDENTE, email("presidente"), "Presidente"),
      utente(ALLENATORE, email("allenatore"), "Allenatore"),
      utente(ALLENATORE2, email("allenatore2"), "Allenatrice"),
      utente(ALLENATORE3, email("allenatore3"), "Allenatore3"),
      utente(MADRE, email("madre"), "Madre"),
      utente(MODERATORE, email("moderatore"), "Moderatore"),
    ],
  });
  await prisma.club.create({
    data: {
      id: CLUB,
      name: `undicesimo ${CLUB.slice(0, 6)}`,
      slug: `undicesimo-${CLUB.slice(0, 8)}`,
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
  const sessAllenatore = await sessione(ALLENATORE);
  const sessAllenatore2 = await sessione(ALLENATORE2);
  const sessMadre = await sessione(MADRE);

  const fraUnAnno = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

  /** Un allenatore **come lo conia il prodotto**: identificativo logico. */
  const creaAllenatore = async (idLogico, nome, utenza) =>
    chiama(
      "POST",
      "/api/v1/trainers",
      {
        organization_id: CLUB,
        id: idLogico,
        name: nome,
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

  /** Un invito d'allenatore, con il corpo di `trainers/[id]/page.tsx:815-833`. */
  const coniaGettoneAllenatore = async (valore, trainerIdNelCarico, chi) =>
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
        trainer_name: `Allenatore ${chi}`,
        trainer_email: email(chi),
        trainer_phone: "3330000000",
        expires_at: fraUnAnno,
        generated_at: new Date().toISOString(),
      },
      sessPresidente,
      "owner",
    );

  /* ================================================================== *
   * §A — la Gestione accessi revoca la tessera e lascia la strada per
   *      rifarla: il gemello che la correzione di ieri non ha toccato
   * ================================================================== */
  console.log(
    "\n§A — due porte tolgono un allenatore dal club; una chiude l'invito, l'altra no\n",
  );

  {
    /* --- IL REPERTO: la revoca dalla Gestione accessi. */
    const idA = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaAllenatore(idA, "Mario", ALLENATORE);
    const conioA = await coniaGettoneAllenatore("UNDICIREVOCA", idA, "allenatore");
    const gettoneA = conioA.corpo?.data?.id ?? null;
    const tesseraA = await tessera(ALLENATORE, "trainer", { is_primary: false });

    prova(
      "A0 SEMINA — profilo collegato, tessera viva, invito attivo che lo nomina",
      [200, "active", idA, true],
      [
        conioA.stato,
        await statoGettone(gettoneA),
        String(
          (await prisma.clubResourceItem.findUnique({ where: { id: gettoneA } }))
            ?.payload?.trainer_id ?? "",
        ),
        Boolean(
          (
            await prisma.clubResourceItem.findFirst({
              where: {
                organization_id: CLUB,
                resource_type: "trainers",
                payload: { path: ["id"], equals: idA },
              },
            })
          )?.payload?.linkedUserId,
        ),
      ],
    );

    const revoca = await revocaTessera(sessPresidente, "owner", tesseraA.id);
    const profiloA = await prisma.clubResourceItem.findFirst({
      where: {
        organization_id: CLUB,
        resource_type: "trainers",
        payload: { path: ["id"], equals: idA },
      },
    });

    prova(
      "A1 SEMINA — la revoca riesce e lo sweep scollega il profilo",
      [200, true, null, null],
      [
        revoca.stato,
        revoca.corpo?.data?.revoked === true,
        profiloA?.payload?.linkedUserId ?? null,
        profiloA?.payload?.accessTokenRecordId ?? null,
      ],
      "`clearLinkedFields` azzera il **puntatore** all'invito (accessTokenRecordId)",
    );

    prova(
      "A2 REPERTO — dopo la revoca della tessera l'invito dell'allenatore e chiuso",
      "revoked",
      await statoGettone(gettoneA),
      "`unlinkProfileResources` riscrive il carico del profilo e non tocca la riga " +
        "`club_resource_items` che il carico nominava: l'invito resta spendibile",
    );

    /* Lo sfruttamento, dalla porta vera del riscatto. */
    const rientro = await riscatta(sessAllenatore, "UNDICIREVOCA");
    const tessereDopo = await prisma.organizationUser.count({
      where: { organization_id: CLUB, user_id: ALLENATORE },
    });
    prova(
      "A3 REPERTO — l'invito sopravvissuto non rimette dentro chi e stato revocato",
      [false, 0],
      [rientro.stato === 200, tessereDopo],
      `POST /api/v1/auth/access/redeem -> ${rientro.stato} ` +
        `${JSON.stringify(
          rientro.corpo?.error?.message ||
            rientro.corpo?.data?.membership?.role ||
            null,
        )}`,
    );

    /* --- IL CONTROLLO: la porta gemella, sullo stesso stato iniziale. */
    const idB = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaAllenatore(idB, "Lucia", ALLENATORE2);
    const conioB = await coniaGettoneAllenatore(
      "UNDICISCOLLEGA",
      idB,
      "allenatore2",
    );
    const gettoneB = conioB.corpo?.data?.id ?? null;
    await tessera(ALLENATORE2, "trainer", { is_primary: false });

    const scollegamento = await scollegaAllenatore(sessPresidente, "owner", idB);
    prova(
      "A4 CONTROLLO — «Scollega account» chiude l'invito dello stesso stato iniziale",
      ["revoked", 200],
      [await statoGettone(gettoneB), scollegamento.stato],
      "se questa fosse rossa, §A misurerebbe una proprieta che nessuna porta " +
        "soddisfa invece di una difesa allargata a meta",
    );

    const rientroB = await riscatta(sessAllenatore2, "UNDICISCOLLEGA");
    prova(
      "A5 CONTROLLO — sull'invito davvero chiuso il riscatto e rifiutato",
      false,
      rientroB.stato === 200,
      `-> ${rientroB.stato}; se questa fosse verde-per-caso, A3 misurerebbe il ` +
        "riscatto e non la sopravvivenza dell'invito",
    );

    /* --- IL SECONDO CONTROLLO: lo **stesso** sweep, sul gemello tutore. */
    const FIGLIO = await atleta("FiglioA");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO,
      rows: [
        {
          firstName: "Madre",
          lastName: "A",
          email: email("madre"),
          userId: MADRE,
        },
      ],
      canGrantAccess: true,
    });
    const rigaMadre = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO } })
    )[0];
    const invitoMadre = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: "UNDICIMADRE",
        status: "active",
        payload: {
          token_type: "parent_access",
          role: "parent",
          one_time: true,
          athlete_id: FIGLIO,
          guardian_id: rigaMadre.id,
          guardian_name: "Madre A",
          guardian_email: email("madre"),
        },
        updated_at: new Date(),
      },
    });
    const tesseraMadre = await tessera(MADRE, "parent", { is_primary: false });
    const revocaMadre = await revocaTessera(
      sessPresidente,
      "owner",
      tesseraMadre.id,
    );

    prova(
      "A6 CONTROLLO — lo **stesso** sweep chiude l'invito del tutore",
      [200, "revoked"],
      [revocaMadre.stato, await statoGettone(invitoMadre.id)],
      "`unlinkParentGuardians` -> `revokeGuardianAccessInClub` -> `revocaIGettoni`. " +
        "Se questa fosse rossa, A2 misurerebbe uno sweep rotto e non un ramo " +
        "che la correzione non ha raggiunto",
    );

    const rientroMadre = await riscatta(sessMadre, "UNDICIMADRE");
    prova(
      "A7 CONTROLLO — e il tutore revocato non rientra riscattando",
      false,
      rientroMadre.stato === 200,
      `-> ${rientroMadre.stato}`,
    );
  }

  /* ================================================================== *
   * §B — l'ottavo indice: il carico di un invito d'allenatore
   * ================================================================== */
  console.log(
    "\n§B — la scheda se ne va; l'invito che porta nome, indirizzo e telefono resta?\n",
  );

  {
    /* --- IL CONTROLLO: la porta gia corretta, sull'invito del tutore. */
    const FIGLIO_B = await atleta("FiglioB");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_B,
      rows: [{ firstName: "Madre", lastName: "B", email: email("madreb") }],
      canGrantAccess: true,
    });
    const rigaB = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO_B } })
    )[0];
    const invitoB = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: "UNDICIB",
        status: "active",
        payload: {
          token_type: "parent_access",
          athlete_id: FIGLIO_B,
          guardian_id: rigaB.id,
          guardian_name: "Madre B",
          guardian_email: email("madreb"),
        },
        updated_at: new Date(),
      },
    });
    const cancellazioneAtleta = await chiama(
      "DELETE",
      `/api/v1/athletes/${FIGLIO_B}`,
      undefined,
      sessPresidente,
      "owner",
    );
    prova(
      "B0 CONTROLLO — «Elimina atleta» non lascia l'invito del tutore in archivio",
      [200, 0],
      [
        cancellazioneAtleta.stato,
        await prisma.clubResourceItem.count({ where: { id: invitoB.id } }),
      ],
      "se questa fosse rossa, §B misurerebbe una porta rotta e non un ramo mancante",
    );

    /* --- IL REPERTO: la stessa porta, sul profilo d'allenatore. */
    const idC = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const creataC = await creaAllenatore(idC, "Carlo", null);
    const conioC = await coniaGettoneAllenatore("UNDICIC", idC, "allenatore3");
    const gettoneC = conioC.corpo?.data?.id ?? null;

    const cancellazioneTrainer = await chiama(
      "DELETE",
      `/api/v1/trainers/${encodeURIComponent(idC)}`,
      undefined,
      sessPresidente,
      "owner",
    );
    const rimastoC = await prisma.clubResourceItem.findUnique({
      where: { id: gettoneC },
    });
    prova(
      "B1 REPERTO — «Elimina allenatore» non lascia l'invito in archivio",
      [200, 0, null, null],
      [
        cancellazioneTrainer.stato,
        await prisma.clubResourceItem.count({ where: { id: gettoneC } }),
        rimastoC?.payload?.trainer_email ?? null,
        rimastoC?.status ?? null,
      ],
      `profilo cancellato (${creataC.corpo?.data?.id ? "creato" : "non creato"}); ` +
        "il carico dell'invito porta trainer_name / trainer_email / trainer_phone, " +
        "che ADR-0145 dichiara «un posto dove vive una persona»",
    );

    /* Il CONTROLLO dello sfruttamento: l'invito orfano apre qualcosa? */
    const riscattoOrfano = await riscatta(await sessione(ALLENATORE3), "UNDICIC");
    prova(
      "B2 PROPRIETA — l'invito orfano non fa entrare nessuno",
      false,
      riscattoOrfano.stato === 200,
      `-> ${riscattoOrfano.stato}: il reperto B1 e sul dato conservato, non su un accesso`,
    );
  }

  /* ================================================================== *
   * §C — l'atto senza la traccia, e il carico che continua a dire «active»
   * ================================================================== */
  console.log(
    "\n§C — chiudere un invito e un atto di sicurezza: lascia una riga?\n",
  );

  {
    const idD = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaAllenatore(idD, "Dario", null);
    const conioD = await coniaGettoneAllenatore("UNDICID", idD, "allenatore3");
    const gettoneD = conioD.corpo?.data?.id ?? null;
    /* Il carico del profilo dichiara l'invito, come fa la schermata. */
    await chiama(
      "PATCH",
      `/api/v1/trainers/${encodeURIComponent(idD)}`,
      {
        name: "Dario",
        accessTokenRecordId: gettoneD,
        accessTokenStatus: "active",
        accessTokenValue: "UNDICID",
      },
      sessPresidente,
      "owner",
    );

    const primaAudit = await prisma.auditLog.count({
      where: { organization_id: CLUB, action: "trainer_account.link.removed" },
    });
    const scollegamentoD = await scollegaAllenatore(sessPresidente, "owner", idD);
    const dopoAudit = await prisma.auditLog.count({
      where: { organization_id: CLUB, action: "trainer_account.link.removed" },
    });

    prova(
      "C0 CONTROLLO — su un profilo non collegato l'invito viene chiuso lo stesso",
      ["revoked", 200],
      [await statoGettone(gettoneD), scollegamentoD.stato],
      "e la correzione R-5 di ieri: la chiusura sta prima di `if (!linkedUserId) return`",
    );

    prova(
      "C1 REPERTO — quella chiusura lascia una riga nel registro",
      true,
      dopoAudit > primaAudit,
      `righe trainer_account.link.removed: ${primaAudit} -> ${dopoAudit}; ` +
        "`recordAuditEvent` sta **dopo** l'uscita anticipata",
    );

    const profiloD = await prisma.clubResourceItem.findFirst({
      where: {
        organization_id: CLUB,
        resource_type: "trainers",
        payload: { path: ["id"], equals: idD },
      },
    });
    prova(
      "C2 REPERTO — il carico del profilo non dichiara «active» un invito revocato",
      false,
      String(profiloD?.payload?.accessTokenStatus ?? "") === "active" &&
        (await statoGettone(gettoneD)) === "revoked",
      `payload.accessTokenStatus=${JSON.stringify(
        profiloD?.payload?.accessTokenStatus ?? null,
      )}, riga=${JSON.stringify(await statoGettone(gettoneD))}`,
    );

    /* Il CONTROLLO: sul ramo collegato la riga di audit c'e, e il carico si allinea. */
    const idE = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await creaAllenatore(idE, "Elia", ALLENATORE3);
    const conioE = await coniaGettoneAllenatore("UNDICIE", idE, "allenatore3");
    const gettoneE = conioE.corpo?.data?.id ?? null;
    await chiama(
      "PATCH",
      `/api/v1/trainers/${encodeURIComponent(idE)}`,
      {
        name: "Elia",
        accessTokenRecordId: gettoneE,
        accessTokenStatus: "active",
      },
      sessPresidente,
      "owner",
    );
    const primaAuditE = await prisma.auditLog.count({
      where: { organization_id: CLUB, action: "trainer_account.link.removed" },
    });
    await scollegaAllenatore(sessPresidente, "owner", idE);
    const dopoAuditE = await prisma.auditLog.count({
      where: { organization_id: CLUB, action: "trainer_account.link.removed" },
    });
    prova(
      "C3 CONTROLLO — sul ramo collegato la riga di audit c'e",
      true,
      dopoAuditE > primaAuditE,
      "se questa fosse rossa, C1 misurerebbe un'azione che non traccia mai",
    );

    const profiloE = await prisma.clubResourceItem.findFirst({
      where: {
        organization_id: CLUB,
        resource_type: "trainers",
        payload: { path: ["id"], equals: idE },
      },
    });
    prova(
      "C4 CONTROLLO — sul ramo collegato il carico si allinea alla riga",
      ["revoked", "revoked"],
      [
        String(profiloE?.payload?.accessTokenStatus ?? ""),
        String(await statoGettone(gettoneE)),
      ],
      "se questa fosse rossa, C2 misurerebbe una proprieta che nessun ramo soddisfa",
    );
  }

  /* ================================================================== *
   * §D — il riepilogo dell'oblio e l'atto: ventidue fette, nessun legame
   * ================================================================== */
  console.log(
    "\n§D — cio che il riepilogo dichiara e cio che la cancellazione fa\n",
  );

  {
    const SOGGETTO = await atleta("Interessato");

    const evento = await prisma.clubEvent.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        kind: "training",
        title: "Allenamento",
        starts_at: new Date(),
        updated_at: new Date(),
      },
    });

    await prisma.athleteGuardian.deleteMany({ where: { athlete_id: SOGGETTO } });
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: SOGGETTO,
      rows: [{ firstName: "Madre", lastName: "D", email: email("madred") }],
      canGrantAccess: true,
    });

    const invitoD = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: "UNDICIOBLIO",
        status: "active",
        payload: {
          token_type: "parent_access",
          athlete_id: SOGGETTO,
          guardian_name: "Madre D",
          guardian_email: email("madred"),
        },
        updated_at: new Date(),
      },
    });

    await prisma.medicalCertificate.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: SOGGETTO,
        type: "agonistico",
        status: "valid",
        updated_at: new Date(),
      },
    });
    await prisma.attachment.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        owner_type: "athlete",
        owner_id: SOGGETTO,
        category: "document",
        file_name: "carta.pdf",
        mime_type: "application/pdf",
        size_bytes: 10,
        checksum: createHash("sha256").update(SOGGETTO).digest("hex"),
        updated_at: new Date(),
      },
    });
    await prisma.documentRequest.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        subject_kind: "athlete",
        subject_id: SOGGETTO,
        document_kind: "identity",
        title: "Carta d'identita",
        updated_at: new Date(),
      },
    });
    await prisma.documentSubmission.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        subject_kind: "athlete",
        subject_id: SOGGETTO,
        document_kind: "identity",
      },
    });
    await prisma.clubEventParticipant.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        event_id: evento.id,
        athlete_id: SOGGETTO,
        status: "present",
        updated_at: new Date(),
      },
    });
    await prisma.athleteCategoryMembership.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: SOGGETTO,
        category_id: "cat-1",
        category_name: "Under 12",
        updated_at: new Date(),
      },
    });
    await prisma.appointment.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: SOGGETTO,
        starts_at: new Date(),
        ends_at: new Date(Date.now() + 3600 * 1000),
        reason: "colloquio",
        updated_at: new Date(),
      },
    });
    await prisma.paymentLink.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        payment_id: randomUUID(),
        athlete_id: SOGGETTO,
        token_hash: createHash("sha256").update(`link-${SOGGETTO}`).digest("hex"),
        expires_at: new Date(Date.now() + 86400000),
        updated_at: new Date(),
      },
    });
    await prisma.athleteAccountInvite.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: SOGGETTO,
        email: email("interessato"),
        token_hash: createHash("sha256").update(`inv-${SOGGETTO}`).digest("hex"),
        status: "sent",
        expires_at: new Date(Date.now() + 86400000),
        updated_at: new Date(),
      },
    });
    await prisma.communicationDelivery.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        source_kind: "bulk",
        source_id: randomUUID(),
        dedup_key: `undicesimo-${SOGGETTO}`,
        recipient_key: email("madred"),
        recipient_name: "Madre D",
        recipient_email: email("madred"),
        athlete_ids: [SOGGETTO],
        channel: "email",
        status: "sent",
        subject: "Interessato Undicesimo — certificato",
        updated_at: new Date(),
      },
    });
    const rata = await prisma.athletePayment.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        athlete_id: SOGGETTO,
        description: "Quota",
        amount: 100,
        updated_at: new Date(),
      },
    });
    const notifica = await prisma.notification.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        title: "Il club richiede: Carta d'identita",
        message: "di Interessato Undicesimo",
        type: "document_request",
        data: { athleteId: SOGGETTO },
        updated_at: new Date(),
      },
    });

    const vista = await riepilogo(sessPresidente, "owner", SOGGETTO);
    const fette = vista.corpo?.data?.slices ?? [];
    const perTabella = new Map(fette.map((f) => [f.table, f]));

    const attese = [
      "athlete_guardians",
      "club_resource_items",
      "medical_certificates",
      "attachments",
      "document_requests",
      "document_submissions",
      "club_event_participants",
      "athlete_category_memberships",
      "appointments",
      "payment_links",
      "athlete_account_invites",
      "communication_deliveries",
      "athlete_payments",
    ];

    prova(
      "D0 SEMINA — il riepilogo dichiara almeno una riga per ogni fetta seminata",
      attese.map(() => true),
      attese.map((t) => Number(perTabella.get(t)?.count || 0) > 0),
      `fette dichiarate: ${fette.length}; ` +
        attese.map((t) => `${t}=${perTabella.get(t)?.count ?? "assente"}`).join(", "),
    );

    const gettone = vista.corpo?.data?.confirmationToken ?? "";
    const atto = await cancellaInteressato(
      sessPresidente,
      "owner",
      SOGGETTO,
      gettone,
    );

    const conteggi = {
      athlete_guardians: await prisma.athleteGuardian.count({
        where: { athlete_id: SOGGETTO },
      }),
      club_resource_items: await prisma.clubResourceItem.count({
        where: { id: invitoD.id },
      }),
      medical_certificates: await prisma.medicalCertificate.count({
        where: { athlete_id: SOGGETTO },
      }),
      attachments: await prisma.attachment.count({
        where: { owner_type: "athlete", owner_id: SOGGETTO },
      }),
      document_requests: await prisma.documentRequest.count({
        where: { subject_id: SOGGETTO },
      }),
      document_submissions: await prisma.documentSubmission.count({
        where: { subject_id: SOGGETTO },
      }),
      club_event_participants: await prisma.clubEventParticipant.count({
        where: { athlete_id: SOGGETTO },
      }),
      athlete_category_memberships: await prisma.athleteCategoryMembership.count({
        where: { athlete_id: SOGGETTO },
      }),
      appointments: await prisma.appointment.count({
        where: { athlete_id: SOGGETTO },
      }),
      payment_links: await prisma.paymentLink.count({
        where: { athlete_id: SOGGETTO },
      }),
      athlete_account_invites: await prisma.athleteAccountInvite.count({
        where: { athlete_id: SOGGETTO },
      }),
    };

    prova(
      "D1 REPERTO — ogni fetta dichiarata «delete» e a zero dopo l'atto",
      Object.fromEntries(Object.keys(conteggi).map((k) => [k, 0])),
      conteggi,
      `DELETE /api/v1/data-subject/<id> -> ${atto.stato} ` +
        JSON.stringify(atto.corpo?.error?.message ?? null),
    );

    const consegna = await prisma.communicationDelivery.findFirst({
      where: { organization_id: CLUB, dedup_key: `undicesimo-${SOGGETTO}` },
    });
    prova(
      "D2 REPERTO — la fetta «anonymize» non nomina piu nessuno",
      [true, true, true],
      [
        !String(consegna?.recipient_name ?? "").includes("Madre"),
        !String(consegna?.recipient_email ?? "").includes("madred"),
        !String(consegna?.recipient_key ?? "").includes("madred"),
      ],
      `recipient_name=${JSON.stringify(consegna?.recipient_name ?? null)}, ` +
        `recipient_email=${JSON.stringify(consegna?.recipient_email ?? null)}, ` +
        `recipient_key=${JSON.stringify(consegna?.recipient_key ?? null)}`,
    );

    prova(
      "D3 CONTROLLO — la fetta «retain» e ancora al suo posto",
      1,
      await prisma.athletePayment.count({ where: { id: rata.id } }),
      "se questa fosse rossa, D1 misurerebbe una cancellazione che passa su tutto",
    );

    const notificaRimasta = await prisma.notification.count({
      where: { id: notifica.id },
    });
    const dichiaraNotifiche = fette.some((f) =>
      String(f.table).includes("notification"),
    );
    prova(
      "D4 REPERTO — cio che l'atto distrugge, il riepilogo lo aveva dichiarato",
      { notificheRimaste: 0, dichiarate: true },
      { notificheRimaste: notificaRimasta, dichiarate: dichiaraNotifiche },
      "`eraseDataSubject` cancella le notifiche che citano il soggetto; nessuna " +
        "delle ventidue fette nomina `notifications`, quindi il gettone di " +
        "conferma non le copre e chi conferma non sa cosa sta distruggendo",
    );

    const scheda = await prisma.athlete.findUnique({ where: { id: SOGGETTO } });
    prova(
      "D5 CONTROLLO — l'anagrafica resta come segnaposto, anonimizzata",
      [true, true],
      [
        String(scheda?.first_name ?? "") === "[dato cancellato]",
        Boolean(scheda?.anonymized_at),
      ],
      "se questa fosse rossa, §D misurerebbe una cancellazione mai avvenuta",
    );
  }

  /* ================================================================== *
   * §E — l'indirizzo dichiarato vince; ma se e quello di chi c'e gia?
   * ================================================================== */
  console.log(
    "\n§E — l'`upsert` cade sull'identita dichiarata: cosa succede a chi la porta gia\n",
  );

  {
    const sessModeratore = await sessione(MODERATORE);
    const CAMPO = {
      nome: randomUUID(),
      cognome: randomUUID(),
      indirizzo: randomUUID(),
    };
    const schema = {
      title: "Iscrizione undicesimo vaglio",
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
        title: "Iscrizione undicesimo vaglio",
        status: "published",
        public_slug: `undicesimo-${CLUB.slice(0, 12)}`,
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

    /* --- IL REPERTO: l'indirizzo dichiarato e quello della madre. */
    const FIGLIO_E = await atleta("FiglioE");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_E,
      /*
        La configurazione ordinaria di ADR-0127: la segreteria scrive
        l'indirizzo di contatto, e **quello** e l'identita della riga.
      */
      rows: [
        { firstName: "Madre", lastName: "Legittima", email: email("madree") },
      ],
      canGrantAccess: true,
    });
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_E]);
    const rigaMadreE = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO_E } })
    )[0];

    const submissionE = await compila("Ignota", "Terza", email("madree"));
    /* Nessuna riga selezionata: `replacesGuardianRowId` resta nullo. */
    const approvazioneE = await approva(
      sessModeratore,
      RUOLO_MODULI,
      submissionE,
      [{ subject: "athlete", recordId: FIGLIO_E }],
    );
    const madreDopo = await prisma.athleteGuardian.findUnique({
      where: { id: rigaMadreE.id },
    });
    const righeE = await prisma.athleteGuardian.count({
      where: { athlete_id: FIGLIO_E },
    });

    prova(
      "E0 REPERTO — la riga di chi porta gia quell'indirizzo conserva il proprio nome",
      ["Madre", "Legittima", 1],
      [madreDopo?.first_name ?? null, madreDopo?.last_name ?? null, righeE],
      `POST /api/v1/forms/submissions/<id> {action:"approve"} -> ${approvazioneE.stato}; ` +
        `applied=${JSON.stringify(approvazioneE.corpo?.data?.applied ?? null)}; ` +
        `user_id=${JSON.stringify(madreDopo?.user_id ?? null)}, ` +
        `contact_only=${madreDopo?.contact_only}, revoked_at=${madreDopo?.revoked_at}`,
    );

    prova(
      "E1 REPERTO — la traccia dice cio che e successo, non «aggiunto»",
      false,
      (approvazioneE.corpo?.data?.applied || []).some((voce) =>
        String(voce).startsWith("Genitore aggiunto"),
      ),
      "nessuna riga e stata aggiunta: ne e stata **rinominata** una viva, e il " +
        "registro non ha una parola per dirlo",
    );

    /* --- IL CONTROLLO: la stessa approvazione, con un indirizzo nuovo. */
    const FIGLIO_F = await atleta("FiglioF");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_F,
      rows: [
        { firstName: "Madre", lastName: "Legittima", email: email("madref") },
      ],
      canGrantAccess: true,
    });
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_F]);
    const rigaMadreF = (
      await prisma.athleteGuardian.findMany({ where: { athlete_id: FIGLIO_F } })
    )[0];
    const submissionF = await compila("Ignota", "Terza", email("terzaf"));
    const approvazioneF = await approva(
      sessModeratore,
      RUOLO_MODULI,
      submissionF,
      [{ subject: "athlete", recordId: FIGLIO_F }],
    );
    const madreDopoF = await prisma.athleteGuardian.findUnique({
      where: { id: rigaMadreF.id },
    });
    prova(
      "E2 CONTROLLO — con un indirizzo nuovo la riga nasce e la madre non cambia nome",
      [200, "Madre", 2],
      [
        approvazioneF.stato,
        madreDopoF?.first_name ?? null,
        await prisma.athleteGuardian.count({ where: { athlete_id: FIGLIO_F } }),
      ],
      "se questa fosse rossa, §E misurerebbe l'approvazione e non la collisione " +
        "di identita",
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
    where: { id: { in: [PRESIDENTE, ALLENATORE, ALLENATORE2, ALLENATORE3, MADRE] } },
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
