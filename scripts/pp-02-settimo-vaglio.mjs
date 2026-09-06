/**
 * **Settimo vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione (e la stessa ragione per cui la sonda a meta
 * del revisore perso ha prodotto il commit 0236bf3).
 *
 *  §A  athlete-guardians.ts:641-643 — «Le posizioni tenute da chi sopravvive a
 *      questo salvataggio **senza esserne nominato** si saltano. Cio che il
 *      client manda conserva il proprio ordine relativo».
 *      E athlete-guardians.ts:2030-2039 (`perPosizione`) — «Una riga del blob
 *      che nominava due persone e diventata due righe, ed e giusto: due
 *      identita che aprono sono due».
 *      IPOTESI: `occupate` contiene **solo** le righe REVOCATE non nominate.
 *      Due righe VIVE sulla stessa posizione — cio che il travaso produce da
 *      **una** voce del blob con `linkedUserIds` plurale, e che il modulo
 *      dichiara a riga 2030 — la scheda le mostra come **una** voce sola, il
 *      client ne rimanda **una** sola, e quella non nominata non e revocata:
 *      cade percio nella `DELETE` di riga 967. Un tutore con l'utenza addosso
 *      sparisce al primo salvataggio ordinario, senza revoca e senza audit.
 *      D52 chiuso dal sesto vaglio solo nella forma «revocata + viva».
 *
 *  §B  athlete-guardians.ts:1333-1334 e 1384-1385 — «Resta la regola di
 *      ADR-0139: una riga che porta **l'utenza di un'altra persona** e
 *      provatamente di un'altra persona, e non si tocca» / «L'**estensione per
 *      identita** invece e inferenza nostra: li la regola vale **piena**».
 *      IPOTESI: il predicato e `!altra || !suaUtenza || altra === suaUtenza`.
 *      `suaUtenza` e l'utenza della riga **nominata**; quando la riga nominata
 *      non ha utenza — un tutore di solo recapito, la meta ordinaria di
 *      ADR-0114 — `!suaUtenza` e vero e la regola si spegne **del tutto**:
 *      l'estensione per identita revoca allora la riga collegata di un terzo.
 *      La regola non vale «piena»: non vale affatto.
 *
 *  §C  athlete-guardians.ts:1968-1969 — «chiuderlo e la differenza fra una
 *      revoca e una revoca che si puo annullare», e 0236bf3 «una revoca che
 *      lascia viva la propria strada di ritorno».
 *      IPOTESI: la `DELETE` di §A non e una revoca e non chiama
 *      `revocaIGettoni`. Il gettone che nominava la riga cancellata resta
 *      `active` per sempre, e nessuna schermata lo mostra piu.
 *
 *  §D  athlete-guardians.ts:2036-2039 — «L'autorita resta una riga per
 *      identita; cio che si perde nella ricomposizione — la seconda utenza —
 *      **non decide niente li**, perche li nessuno decide un accesso».
 *      Misurata sui lettori posizionali veri (destinatario fiscale,
 *      `{{parent.N.*}}`) prima e dopo il salvataggio di §A: mai misurati,
 *      solo dedotti, da sei revisioni.
 *
 *  §E  CLAUDE.md §2 / resources.ts:589 — `simplified_athletes` e nell'insieme
 *      `RISORSE_CON_SCHEDA_ATLETA`. Zona d'ombra mai chiusa: la rotta con
 *      quell'alias passa dalle stesse guardie? (`delegate: "athlete"`, quindi
 *      e la stessa tabella: si misura, non si deduce.)
 *
 *  §F  scripts/pp-02-quinto-vaglio.mjs L3/L4 — «una scrittura fuori dal modulo
 *      proprietario e RESPINTA dall'archivio». L3 tenta **solo** una `UPDATE`.
 *      IPOTESI: un trigger ristretto agli eventi sbagliati (o un `INSERT` /
 *      `DELETE` fuori dal modulo) passerebbe L3 e L4 verdi.
 *
 *  §G  athlete-guardians.ts:1963-1969 — «chiuderlo e la differenza fra una
 *      revoca e una revoca che si puo annullare», e il commit 0236bf3 — «una
 *      revoca che lascia viva la propria strada di ritorno».
 *      IPOTESI: `revocaIGettoni` e chiamato dalle due **revoche** e da
 *      nessun'altra parte. La `DELETE` di `saveGuardianRegistry` — la porta
 *      con cui la segreteria «toglie un tutore dalla scheda», che e il gesto
 *      ordinario — non e una revoca, non chiama lo sweep e non lascia nessun
 *      marchio. Il gettone resta `active`; e poiche `readGuardianInputFromCard`
 *      manda l'`id` letto anche come `legacyId`, la riga rimessa **ricicla
 *      quell'identificativo** e il gettone torna spendibile.
 *
 * ---
 *
 * Ogni sezione porta il proprio CONTROLLO: una variante in cui la stessa
 * misura deve dare l'esito opposto. Senza, una sonda che dichiara ROSSO non
 * dimostra di saper dire VERDE.
 *
 * **Esito al 2026-09-06, su `09e0587` non modificato: 19/29, 10 FAIL.**
 * ROSSE: §A (A3, A4, A5), §B (B2, B3), §C (C1), §E (E0), §G (G1, G2, G3).
 * VERDI e discriminanti: Ac1, Bc1, G0, D1, D2, E1, E2, E3, F0, F1, F2.
 *
 * **Prova che le rosse discriminano.** Due mutazioni, applicate insieme e poi
 * revertite (`git checkout -- src/lib/server/athlete-guardians.ts`):
 *   1. nel ciclo di `DELETE`, si risparmia una riga la cui **posizione** e
 *      tenuta anche da una riga sopravvissuta;
 *   2. in `revokeGuardianRow`, `!altra || (suaUtenza ? altra === suaUtenza :
 *      false)` al posto di `!altra || !suaUtenza || altra === suaUtenza`.
 * Con le due mutazioni: **25/25 PASS, 0 FAIL** — le sette rosse di allora
 * diventano verdi e nessun controllo si rompe. Senza: 7 FAIL. (§G e stata
 * scritta dopo la mutazione e non e coperta da quella prova: il suo controllo
 * e G0, che misura la stessa cosa sull'altra porta e resta verde.)
 *
 * **NON misurato** (lacuna dichiarata, non un verde): revoche concorrenti;
 * rollover di stagione × revoca su PostgreSQL vero; riscatto cross-club,
 * replay e rate limiting; `data-subject.ts` da un capo all'altro; una persona
 * con due utenze; il `recordId` di `form-submissions.ts` come terzo lettore
 * posizionale.
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(72)} ${JSON.stringify(trovato)}` +
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

const coda = `${CLUB.slice(0, 8)}@settimo.local`;
const email = (chi) => `${chi}-${coda}`;

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Settimo",
  password_hash: "$2b$10$settimo",
  role: "user",
});

const atleta = async (nome, data = {}) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "Settimo",
      status: "active",
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
      `http://collaudo.invalid/api/v1/guardian-accounts/${athleteId}/${guardianId}?reason=settimo`,
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
      name: `Settimo ${CLUB.slice(0, 6)}`,
      slug: `settimo-${CLUB.slice(0, 8)}`,
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

  /* ================================================================== *
   *  Semina
   * ================================================================== */

  /*
    **Una voce del blob che nomina DUE utenze.** E la forma che il modulo
    dichiara a riga 2030 («Il travaso produce due righe con la stessa
    posizione da ogni voce del blob che dichiarava piu di un identificativo
    utente») e che nessuna delle sei revisioni ha seminato: il sesto vaglio ha
    usato due voci distinte, che il travaso mette su due posizioni.
  */
  const FIGLIO_A = await atleta("FiglioA", {
    billingGuardianIndex: 1,
    guardians: [
      {
        id: "a-coppia",
        name: "Coppia",
        surname: "Genitoriale",
        relationship: "genitori",
        email: email("famiglia"),
        linkedUserIds: [UA, UB],
        fiscalCode: "CPPGNT80A01H501A",
      },
      {
        id: "a-nonna",
        name: "Nonna",
        surname: "Paga",
        relationship: "nonna",
        email: email("nonna"),
        linkedUserId: NONNA,
        fiscalCode: "NNNPGA50A41H501Z",
      },
    ],
  });

  /* Il controllo di §A: due utenze su DUE voci del blob, cioe due posizioni. */
  const FIGLIO_B = await atleta("FiglioB", {
    guardians: [
      { id: "b-uno", name: "Uno", email: email("ua"), linkedUserId: UA },
      { id: "b-due", name: "Due", email: email("ub"), linkedUserId: UB },
    ],
  });

  /*
    §B: la configurazione ordinaria di ADR-0114 — madre collegata e padre di
    solo recapito, **un solo indirizzo di famiglia**. Due voci, due posizioni.
  */
  const FIGLIO_C = await atleta("FiglioC", {
    guardians: [
      {
        id: "c-madre",
        name: "Madre",
        relationship: "madre",
        email: email("famiglia"),
        linkedUserId: MADRE,
      },
      {
        id: "c-padre",
        name: "Padre",
        relationship: "padre",
        email: email("famiglia"),
      },
    ],
  });

  /* Il controllo di §B: identico, ma la riga nominata PORTA un'utenza. */
  const FIGLIO_D = await atleta("FiglioD", {
    guardians: [
      {
        id: "d-madre",
        name: "Madre",
        relationship: "madre",
        email: email("famiglia"),
        linkedUserId: MADRE,
      },
      {
        id: "d-padre",
        name: "Padre",
        relationship: "padre",
        email: email("famiglia"),
        linkedUserId: NONNA,
      },
    ],
  });

  /* §C: la riga nascosta dietro la voce, nominata da un gettone vivo. */
  const FIGLIO_G = await atleta("FiglioG", {
    guardians: [
      {
        id: "g-coppia",
        name: "CoppiaG",
        email: email("famigliag"),
        linkedUserIds: [UA, UB],
      },
    ],
  });

  /* §E: la stessa scheda, raggiunta dall'alias `simplified_athletes`. */
  const FIGLIO_E = await atleta("FiglioE", {
    guardians: [
      {
        id: "e-coppia",
        name: "CoppiaE",
        email: email("famiglia"),
        linkedUserIds: [UA, UB],
      },
    ],
  });

  await travasaTutori(prisma, [CLUB]);

  /* ================================================================== *
   * §A — due righe VIVE sulla stessa posizione, e il salvataggio ordinario
   * ================================================================== */
  console.log(
    "\n§A — la voce del blob con DUE utenze: un salvataggio che rimanda cio che ha letto\n",
  );
  {
    const righe = await righeDi(FIGLIO_A);
    const coppia = righe.filter((r) => r.legacy_id === "a-coppia");
    prova(
      "A0 SEMINA — due righe vive, STESSA posizione, due utenze",
      [3, 2, 1, 0],
      [
        righe.length,
        coppia.length,
        new Set(coppia.map((r) => r.position)).size,
        coppia.filter((r) => r.revoked_at).length,
      ],
      `posizioni: ${JSON.stringify(righe.map((r) => [r.position, r.user_id ? r.user_id.slice(0, 4) : "-", r.legacy_id]))}`,
    );
    prova(
      "A1 CONTROLLO — tutte e due le utenze aprono l'area famiglia",
      [1, 1],
      [await apre(UA, FIGLIO_A), await apre(UB, FIGLIO_A)],
    );

    /*
      La proiezione nasce al primo salvataggio: prima si guarda cosa la scheda
      **mostra**, perche e quello che il client rimandera.
    */
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_A]);
    const proiettati = (await datiDi(FIGLIO_A)).guardians || [];
    prova(
      "A2 SEMINA — la scheda mostra DUE voci per TRE righe (la fusione)",
      [2, 3],
      [proiettati.length, (await righeDi(FIGLIO_A)).length],
      `voci: ${JSON.stringify(proiettati.map((g) => [g.id.slice(0, 4), g.name, g.linkedUserId ? g.linkedUserId.slice(0, 4) : null]))}`,
    );

    /*
      **L'atto: un'andata e ritorno pura.** La segreteria non toglie niente e
      non aggiunge niente — apre la scheda, cambia il cognome dell'atleta e
      salva. Il corpo porta la proiezione **tale e quale**. Ruolo di club con
      zero caselle spuntate.
    */
    const esito = await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_A}`,
      {
        last_name: "Settimo",
        data: { billingGuardianIndex: 1, guardians: proiettati },
      },
      sessSegretaria,
      SLUG,
    );
    console.log(
      `        PATCH andata-e-ritorno -> ${esito.stato} ${JSON.stringify(esito.corpo?.error?.message || "").slice(0, 90)}`,
    );

    const dopo = await righeDi(FIGLIO_A);
    prova(
      "A3 REPERTO — le righe sopravvivono all'andata e ritorno della scheda",
      3,
      dopo.length,
      `rimaste: ${JSON.stringify(dopo.map((r) => [r.position, r.user_id ? r.user_id.slice(0, 4) : "-", r.legacy_id]))}`,
    );
    prova(
      "A4 REPERTO — nessuna delle due utenze ha perso il figlio",
      [1, 1],
      [await apre(UA, FIGLIO_A), await apre(UB, FIGLIO_A)],
      "un tutore collegato sparito senza revoca, senza audit e senza registro",
    );
    prova(
      "A5 REPERTO — se una riga e caduta, il registro delle revoche la nomina",
      true,
      dopo.length === 3 ||
        ((await datiDi(FIGLIO_A)).revokedGuardianIdentities || []).length > 0,
      "cancellata: non revocata, quindi invisibile a ogni lettura successiva",
    );
  }

  /* ------------------------------------------------------------------ *
   * §A-controllo — la stessa sequenza su DUE voci del blob: deve reggere
   * ------------------------------------------------------------------ */
  console.log("\n§A-controllo — due utenze su DUE voci: la sonda sa dire VERDE\n");
  {
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_B]);
    const prima = await righeDi(FIGLIO_B);
    prova(
      "Ac0 SEMINA — due righe, posizioni DIVERSE",
      [2, 2],
      [prima.length, new Set(prima.map((r) => r.position)).size],
    );
    const esitoB = await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_B}`,
      { last_name: "Settimo", data: { guardians: (await datiDi(FIGLIO_B)).guardians } },
      sessSegretaria,
      SLUG,
    );
    console.log(`        PATCH andata-e-ritorno -> ${esitoB.stato}`);
    const dopo = await righeDi(FIGLIO_B);
    prova(
      "Ac1 CONTROLLO — con posizioni distinte l'andata e ritorno non toglie niente",
      [2, 1, 1],
      [dopo.length, await apre(UA, FIGLIO_B), await apre(UB, FIGLIO_B)],
      "se anche questa fosse rossa, §A misurerebbe il salvataggio e non la posizione",
    );
  }

  /* ================================================================== *
   * §D — i lettori posizionali veri, prima e dopo
   * ================================================================== */
  console.log("\n§D — i tre lettori che prendono i tutori PER POSTO\n");
  {
    const fiscale = await carica("src/lib/documents/fiscal-recipient.ts");
    const segnaposto = await carica("src/lib/server/document-placeholders.ts");
    const scheda = await prisma.athlete.findUnique({ where: { id: FIGLIO_A } });
    const destinatario = fiscale.resolveFiscalRecipient(scheda);
    prova(
      "D1 — `billingGuardianIndex: 1` nomina ancora la nonna che paga",
      "NNNPGA50A41H501Z",
      destinatario.fiscalCode || null,
      `intestatario: ${destinatario.name}`,
    );
    const valori = segnaposto.buildPlaceholderValues({
      club: await prisma.club.findUnique({ where: { id: CLUB } }),
      athlete: scheda,
      season: null,
      charges: [],
      transactions: [],
      now: new Date(),
      attendance: { sessions: 0, hours: 0 },
    });
    prova(
      "D2 — {{parent.2.*}} nomina ancora la nonna",
      "Nonna",
      (valori?.["parent.2.first_name"]?.text ??
        valori?.["parent.2.first_name"]) || null,
    );
  }

  /* ================================================================== *
   * §B — «la regola di ADR-0139 vale piena» sull'estensione per identita
   * ================================================================== */
  console.log(
    "\n§B — «Scollega account» su una riga SENZA utenza, e la riga del terzo\n",
  );
  {
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_C]);
    const righe = await righeDi(FIGLIO_C);
    const rigaMadre = righe.find((r) => r.user_id === MADRE);
    const rigaPadre = righe.find((r) => !r.user_id);
    prova(
      "B0 SEMINA — la madre e collegata, il padre e solo un recapito, un indirizzo solo",
      [2, true, true, true],
      [
        righe.length,
        Boolean(rigaMadre),
        Boolean(rigaPadre),
        rigaMadre?.email === rigaPadre?.email,
      ],
      `posizioni: ${JSON.stringify(righe.map((r) => [r.position, r.user_id ? "utenza" : "-"]))}`,
    );
    prova(
      "B1 CONTROLLO — la madre apre l'area famiglia",
      1,
      await apre(MADRE, FIGLIO_C),
    );

    /* L'operatore toglie il PADRE, che non ha nessun account da scollegare. */
    const esito = await scollega(
      sessPresidente,
      "owner",
      FIGLIO_C,
      rigaPadre.id,
    );
    console.log(`        DELETE guardian-accounts (padre) -> ${esito.stato}`);

    const dopo = await righeDi(FIGLIO_C);
    const madreDopo = dopo.find((r) => r.id === rigaMadre.id);
    prova(
      "B2 REPERTO — la riga della madre NON e stata revocata",
      [null, MADRE],
      [madreDopo?.revoked_at ?? null, madreDopo?.user_id ?? null],
      "l'estensione per identita ha travolto la riga di un terzo con utenza propria",
    );
    prova(
      "B3 REPERTO — la madre apre ancora l'area famiglia",
      1,
      await apre(MADRE, FIGLIO_C),
      "revoca collaterale: nessuna schermata la nomina, e per rientrare serve un riscatto",
    );
  }

  /* ------------------------------------------------------------------ *
   * §B-controllo — la riga nominata PORTA un'utenza: la regola deve valere
   * ------------------------------------------------------------------ */
  console.log("\n§B-controllo — la stessa mossa con la riga nominata COLLEGATA\n");
  {
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_D]);
    const righe = await righeDi(FIGLIO_D);
    const rigaMadre = righe.find((r) => r.user_id === MADRE);
    const rigaPadre = righe.find((r) => r.user_id === NONNA);
    prova(
      "Bc0 SEMINA — due righe collegate a due utenze, stesso indirizzo",
      [2, true, true],
      [righe.length, Boolean(rigaMadre), Boolean(rigaPadre)],
    );
    await scollega(sessPresidente, "owner", FIGLIO_D, rigaPadre.id);
    const madreDopo = (await righeDi(FIGLIO_D)).find((r) => r.id === rigaMadre.id);
    prova(
      "Bc1 CONTROLLO — con `suaUtenza` valorizzata il terzo e risparmiato",
      [null, MADRE],
      [madreDopo?.revoked_at ?? null, madreDopo?.user_id ?? null],
      "se questa fosse rossa, §B misurerebbe la revoca e non il predicato",
    );
  }

  /* ================================================================== *
   * §C — il gettone della riga cancellata da §A
   * ================================================================== */
  console.log("\n§C — la strada di ritorno che la cancellazione non chiude\n");
  {
    let righe = await righeDi(FIGLIO_G);
    prova("C0 SEMINA — due righe sulla stessa posizione", [2, 1], [
      righe.length,
      new Set(righe.map((r) => r.position)).size,
    ]);

    await tutori.refreshGuardianProjection(prisma, [FIGLIO_G]);
    const proiettati = (await datiDi(FIGLIO_G)).guardians || [];
    const mostrata = String(proiettati[0]?.id || "");
    const nascosta = righe.find((r) => r.id !== mostrata);

    const gettone = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: `SETTIMO${CLUB.slice(0, 6).toUpperCase()}`,
        status: "active",
        payload: {
          token_type: "parent_access",
          athlete_id: FIGLIO_G,
          guardian_id: nascosta.id,
          role: "parent",
          one_time: true,
        },
        updated_at: new Date(),
      },
    });

    const esito = await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_G}`,
      { last_name: "Settimo", data: { guardians: proiettati } },
      sessSegretaria,
      SLUG,
    );
    console.log(`        PATCH andata-e-ritorno -> ${esito.stato}`);

    righe = await righeDi(FIGLIO_G);
    const stato = (
      await prisma.clubResourceItem.findUnique({ where: { id: gettone.id } })
    )?.status;
    prova(
      "C1 REPERTO — la riga nominata dal gettone esiste ancora, o il gettone e chiuso",
      true,
      righe.some((r) => r.id === nascosta.id) || stato === "revoked",
      `righe: ${righe.length}, gettone: ${stato}`,
    );
  }

  /* ================================================================== *
   * §E — l'alias `simplified_athletes` passa dalle stesse guardie
   * ================================================================== */
  console.log("\n§E — la stessa scheda, dall'alias `simplified_athletes`\n");
  {
    await tutori.refreshGuardianProjection(prisma, [FIGLIO_E]);
    const prima = await righeDi(FIGLIO_E);
    const dati = await datiDi(FIGLIO_E);

    /* E0: la stessa andata e ritorno di §A, ma dall'alias. */
    const esitoGiro = await chiama(
      "PATCH",
      `/api/v1/simplified_athletes/${FIGLIO_E}`,
      { last_name: "Alias", data: { guardians: dati.guardians } },
      sessSegretaria,
      SLUG,
    );
    const dopoGiro = await righeDi(FIGLIO_E);
    const scheda = await prisma.athlete.findUnique({ where: { id: FIGLIO_E } });
    prova(
      "E0 — dall'alias, l'andata e ritorno non cancella la riga nascosta",
      [2, 1, 1],
      [dopoGiro.length, await apre(UA, FIGLIO_E), await apre(UB, FIGLIO_E)],
      `stato ${esitoGiro.stato}; la rotta ha davvero scritto? last_name=${scheda?.last_name}; voci in proiezione: ${(dati.guardians || []).length}`,
    );

    /* E1: la chiave `guardians` concede accessi anche da qui? */
    const esitoInvenzione = await chiama(
      "PATCH",
      `/api/v1/simplified_athletes/${FIGLIO_E}`,
      {
        /* Senza un secondo campo il corpo e un **involucro**, non una scheda. */
        last_name: "AliasDue",
        data: {
          guardians: [
            ...((await datiDi(FIGLIO_E)).guardians || []),
            {
              name: "Intrusa",
              email: email("nonna"),
              linkedUserId: NONNA,
              linked_user_id: NONNA,
            },
          ],
        },
      },
      sessSegretaria,
      SLUG,
    );
    const dopo = await righeDi(FIGLIO_E);
    const intrusa = dopo.find((r) => r.first_name === "Intrusa");
    console.log(
      `        E1 diagnostica: corpo=${JSON.stringify(esitoInvenzione.corpo).slice(0, 160)}`,
    );
    console.log(
      `        E1 diagnostica: guardians dopo = ${JSON.stringify(((await datiDi(FIGLIO_E)).guardians || []).map((g) => g.name))}`,
    );
    prova(
      "E1 — dall'alias, `linkedUserId` non arriva alla colonna",
      [null, null],
      [intrusa?.user_id ?? null, intrusa?.data?.linkedUserId ?? null],
      `stato ${esitoInvenzione.stato} ${String(esitoInvenzione.corpo?.error?.message || "").slice(0, 70)}; righe ${prima.length} -> ${dopo.length}; intrusa: ${intrusa ? "creata" : "assente"}`,
    );
    prova(
      "E2 — e la nonna non ha preso il fascicolo del minore",
      0,
      await apre(NONNA, FIGLIO_E),
      "il vaglio sulla crescita: l'indirizzo della nonna corrisponde a un'utenza",
    );

    /* E3 — lo stesso intruso dalla rotta canonica, per isolare l'alias. */
    const esitoCanonico = await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_B}`,
      {
        last_name: "SettimoB",
        data: {
          guardians: [
            ...((await datiDi(FIGLIO_B)).guardians || []),
            { name: "IntrusaB", email: email("nonna") },
          ],
        },
      },
      sessSegretaria,
      SLUG,
    );
    const righeB = await righeDi(FIGLIO_B);
    prova(
      "E3 — dalla rotta canonica il vaglio sulla crescita RISPONDE",
      [403, false],
      [
        esitoCanonico.stato,
        righeB.some((r) => r.first_name === "IntrusaB"),
      ],
      `${String(esitoCanonico.corpo?.error?.message || "").slice(0, 70)}`,
    );
  }

  /* ================================================================== *
   * §G — «Togli il tutore dalla scheda» non e una revoca, e il gettone resta
   * ================================================================== */
  console.log("\n§G — togliere una voce dalla scheda, e l'invito che sopravvive\n");
  {
    const FIGLIO_H = await atleta("FiglioH");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_H,
      rows: [
        { firstName: "Madre", lastName: "H", email: email("madre"), legacyId: "h-madre" },
      ],
      canGrantAccess: true,
    });
    const riga = (await righeDi(FIGLIO_H))[0];

    const gettone = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: `INVITO${CLUB.slice(0, 6).toUpperCase()}`,
        status: "active",
        payload: {
          token_type: "parent_access",
          athlete_id: FIGLIO_H,
          guardian_id: riga.id,
          role: "parent",
          one_time: true,
        },
        updated_at: new Date(),
      },
    });

    /*
      **Il controllo prima del reperto**: «Scollega account» — la porta che si
      chiama revoca — il gettone lo chiude. E la prova che la sonda misura la
      differenza fra le due porte, e non «i gettoni non si chiudono mai».
    */
    const FIGLIO_I = await atleta("FiglioI");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_I,
      rows: [
        { firstName: "Madre", lastName: "I", email: email("madre"), legacyId: "i-madre" },
      ],
      canGrantAccess: true,
    });
    const rigaI = (await righeDi(FIGLIO_I))[0];
    const gettoneI = await prisma.clubResourceItem.create({
      data: {
        id: randomUUID(),
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: `INVITOI${CLUB.slice(0, 6).toUpperCase()}`,
        status: "active",
        payload: {
          token_type: "parent_access",
          athlete_id: FIGLIO_I,
          guardian_id: rigaI.id,
          role: "parent",
          one_time: true,
        },
        updated_at: new Date(),
      },
    });
    await scollega(sessPresidente, "owner", FIGLIO_I, rigaI.id);
    prova(
      "G0 CONTROLLO — «Scollega account» porta il gettone a `revoked`",
      "revoked",
      (await prisma.clubResourceItem.findUnique({ where: { id: gettoneI.id } }))
        ?.status,
    );

    /* Il gesto ordinario: la segreteria toglie la voce e salva. */
    const esito = await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_H}`,
      { last_name: "Settimo", data: { guardians: [] } },
      sessSegretaria,
      SLUG,
    );
    const rimaste = await righeDi(FIGLIO_H);
    const stato = (
      await prisma.clubResourceItem.findUnique({ where: { id: gettone.id } })
    )?.status;
    prova(
      "G1 REPERTO — tolta la voce, il gettone che la nominava e chiuso",
      ["revoked", 0],
      [stato, rimaste.length],
      `PATCH -> ${esito.stato}; la riga e sparita e l'invito e ancora spendibile`,
    );

    /*
      **La strada di ritorno, percorsa.** La segreteria si accorge di avere
      tolto la persona sbagliata e la rimette: il client rimanda
      l'identificativo che aveva letto — una linguetta aperta lo fa da sola —
      e quell'identificativo diventa il `legacy_id` della riga nuova. Il
      gettone di prima, che nessuno ha mai chiuso, torna spendibile.
    */
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_H}`,
      {
        last_name: "Settimo",
        data: {
          guardians: [
            { id: riga.id, name: "Madre", surname: "H", email: email("madre") },
          ],
        },
      },
      sessPresidente,
      "owner",
    );
    const riscatto = await riscatta(MADRE, gettone.name);
    prova(
      "G2 REPERTO — l'invito mai chiuso non e piu spendibile",
      true,
      riscatto.stato >= 400,
      `riscatto -> ${riscatto.stato} ${String(riscatto.corpo?.error?.message || "").slice(0, 60)}`,
    );
    /*
      **Ri-specificata dopo la correzione.**

      Chiedeva che dopo il reinserimento la persona **non** avesse accesso: era
      giusto finche l'accesso arrivava dal gettone mai chiuso. Ora il gettone e
      chiuso (G2) e cio che resta e un fatto diverso — il reinserimento e stato
      fatto qui sopra da un **proprietario**, cioe da chi porta le due chiavi
      che governano la concessione, e ADR-0114 dice che un indirizzo scritto
      dal club **e** un legame. Pretendere zero vorrebbe dire che il club non
      puo piu rimettere un tutore che aveva tolto per sbaglio.

      La proprieta vera e G3-bis: la stessa mossa da un ruolo **senza** quelle
      chiavi non deve riuscire. E li che si vede se la strada di ritorno e
      chiusa davvero.
    */
    prova(
      "G3 il reinserimento da chi porta le chiavi e una concessione, e vale",
      1,
      await apre(MADRE, FIGLIO_H),
      "se questa fosse 0, il club non potrebbe piu correggere una rimozione sbagliata",
    );

    /* La stessa mossa, dal ruolo di club a zero caselle spuntate. */
    const FIGLIO_RIENTRO = await atleta("FiglioRientro");
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: FIGLIO_RIENTRO,
      rows: [{ firstName: "Madre", lastName: "I", email: email("madre") }],
      canGrantAccess: true,
    });
    const rigaRientro = (await righeDi(FIGLIO_RIENTRO))[0];
    await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_RIENTRO}`,
      { last_name: "Settimo", data: { guardians: [] } },
      sessPresidente,
      "owner",
    );
    const rimessa = await chiama(
      "PATCH",
      `/api/v1/athletes/${FIGLIO_RIENTRO}`,
      {
        last_name: "Settimo",
        data: {
          guardians: [
            { id: rigaRientro.id, name: "Madre", surname: "I", email: email("madre") },
          ],
        },
      },
      sessSegretaria,
      SLUG,
    );
    prova(
      "G3-bis PROPRIETA — la stessa mossa da un ruolo senza chiavi e respinta",
      [403, 0],
      [rimessa.stato, await apre(MADRE, FIGLIO_RIENTRO)],
      "la strada di ritorno non deve essere percorribile da chi non puo concedere",
    );
  }

  /* ================================================================== *
   * §F — L3 del quinto vaglio misura una UPDATE. E le altre due?
   * ================================================================== */
  console.log("\n§F — la difesa d'archivio su INSERT e DELETE, non solo UPDATE\n");
  {
    const eventi = await prisma.$queryRawUnsafe(
      `SELECT t.tgname, t.tgtype, t.tgenabled
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'athlete_guardians' AND NOT t.tgisinternal`,
    );
    console.log(`        trigger: ${JSON.stringify(eventi)}`);
    prova(
      "F0 SEMINA — il trigger e abilitato (`O`)",
      ["O"],
      [...new Set(eventi.map((r) => r.tgenabled))],
    );

    const cavia = await atleta("CaviaSettimo");
    const fuoriInsert = await prisma.athleteGuardian
      .create({
        data: {
          id: randomUUID(),
          organization_id: CLUB,
          athlete_id: cavia,
          identity_key: `riga:${randomUUID()}`,
          first_name: "Fuori",
          position: 0,
          updated_at: new Date(),
        },
      })
      .then(() => "passata")
      .catch((errore) =>
        /fuori dal modulo proprietario/i.test(String(errore?.message || errore))
          ? "respinta"
          : `altro errore: ${String(errore?.message || errore).slice(0, 50)}`,
      );
    prova(
      "F1 — un INSERT fuori dal modulo proprietario e RESPINTO",
      "respinta",
      fuoriInsert,
      "L3 del quinto vaglio tenta solo una UPDATE",
    );

    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: cavia,
      rows: [{ firstName: "Cavia", lastName: "Settimo", email: email("cavia") }],
      canGrantAccess: true,
    });
    const fuoriDelete = await prisma.athleteGuardian
      .deleteMany({ where: { athlete_id: cavia } })
      .then((e) => (e.count ? "passata" : "nessuna riga toccata"))
      .catch((errore) =>
        /fuori dal modulo proprietario/i.test(String(errore?.message || errore))
          ? "respinta"
          : `altro errore: ${String(errore?.message || errore).slice(0, 50)}`,
      );
    prova(
      "F2 — un DELETE fuori dal modulo proprietario e RESPINTO",
      "respinta",
      fuoriDelete,
    );
  }

  console.log(
    `\nEsito: ${esiti.filter((e) => e.ok).length}/${esiti.length} PASS, ${esiti.filter((e) => !e.ok).length} FAIL\n`,
  );
};

const pulisci = async () => {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
    await tx.$executeRawUnsafe(
      `DELETE FROM "athlete_guardians" WHERE "organization_id" = $1::uuid`,
      CLUB,
    );
  });
  await prisma.clubResourceItem.deleteMany({ where: { organization_id: CLUB } });
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
    console.error("\nERRORE:", errore);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pulisci().catch((e) => console.error("pulizia:", e?.message));
    await prisma.$disconnect();
  });
