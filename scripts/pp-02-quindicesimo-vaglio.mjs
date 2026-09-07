/**
 * **Quindicesimo vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione. Tutte vengono dal commit `bb082fd`
 * (quattordicesimo vaglio), cioe dalla correzione piu recente, o dal gemello
 * che quella correzione non ha allargato.
 *
 *  §A  athlete-guardians.ts, `perPosizione` (ADR-0152) — «Un marchio vale
 *      percio per la voce solo se vale per **tutte** le righe che ci stanno
 *      dietro». E, dal commit `bb082fd`: «Una voce che contiene una persona
 *      esclusa e una viva mostra la viva, e **solo** la viva».
 *      E fiscal-recipient.ts (ADR-0149) — «**Un documento nuovo non intesta a
 *      chi il club ha escluso, ne a un recapito.**»
 *      IPOTESI: i due marchi si piegano con **due AND indipendenti**
 *      (`contactOnly && contactOnly`, `accessRevokedAt && accessRevokedAt`)
 *      mentre `esclusa()` e un **OR** dei due. Una voce le cui righe sono
 *      tutte escluse ma **in due modi diversi** — una `revoked_at`, una
 *      `contact_only` — esce percio con **nessuno** dei due marchi: la voce e
 *      viva. `intestabile` non la scarta piu, e la ricevuta nuova si intesta a
 *      chi il club ha escluso, con il suo codice fiscale e il suo indirizzo.
 *      COROLLARIO (A3): `gia` e un **accumulatore**, e `esclusa(gia)` lo
 *      interroga dopo che i marchi sono gia stati piegati. Con tre righe
 *      — `contact_only`, `revoked`, **viva** — al secondo passo l'accumulatore
 *      perde tutti e due i marchi, al terzo `esclusa(gia)` risponde **falso**,
 *      e la riga viva non vince piu: la voce mostra il terzo che ha compilato
 *      il modulo pubblico, e il tutore vivo sparisce.
 *
 *  §B  athlete-guardians.ts, `saveGuardianRegistry` — «La riga nascosta
 *      **segue la sua voce**: la posizione e cio che le tiene insieme, e
 *      insieme si spostano.» E, dal commit `bb082fd`: «Una posizione nominata
 *      da una qualunque delle righe che ci stanno dietro e nominata per
 *      tutte.»
 *      IPOTESI: `if (riga.revoked_at) continue;` sta **prima** del blocco che
 *      consulta `mappaPosizioni`, quindi una riga **revocata** nascosta dietro
 *      una voce non segue mai la sua voce. Finche `occupate` teneva la sua
 *      posizione, restare ferma non faceva danno: nessun altro poteva
 *      prendergliela. `bb082fd` le ha tolto quella protezione
 *      (`!posizioniInArrivo.has(...)`) **senza** darle una strada per
 *      spostarsi, quindi adesso la posizione liberata la prende **un'altra
 *      voce** — e due persone che non c'entrano niente diventano una voce
 *      sola.
 *      Conseguenza attesa, e misurata dalla rotta HTTP vera: la riga revocata
 *      resta indietro e finisce sotto la voce di un **recapito** — cioe la
 *      configurazione di §A — e la ricevuta nuova esce intestata alla persona
 *      revocata.
 *
 *  §C  profile-account-links.ts, `chiudiGliInvitiDelProfilo` — «**Il club non
 *      e facoltativo.** Con Prisma un `organization_id: undefined` non
 *      restringe: **toglie il filtro**, e una revoca uscirebbe dal proprio
 *      club. Il gemello che cancella questa guardia ce l'ha; questa no.»
 *      E resources.ts, `findClubResourceRecord` — «Uno scope senza club attivo
 *      non cerca: esce con `null`».
 *      IPOTESI: `caricaAllenatoreDelClubAttivo` scrive
 *      `organization_id: scope.activeOrganizationId ?? undefined`, che e
 *      esattamente la forma che i due gemelli dichiarano vietata: con uno
 *      scope senza club attivo il filtro **sparisce** e la query torna la riga
 *      di chiunque. Anche la ricerca per UUID (`perUuid`) resta senza filtro.
 *      Si misura se da li esce un oracolo di esistenza cross-tenant.
 *
 * ---
 *
 * Ogni sezione porta il proprio CONTROLLO: la stessa misura dove l'esito deve
 * essere opposto. Senza, una sonda che dichiara ROSSO non dimostra di saper
 * dire VERDE.
 *
 * ---
 *
 * **Esito al 2026-09-06, su `bb082fd` non modificato: 6/12, 6 FAIL.**
 * ROSSE: A2, A3, A4, B1, B2, C2.
 * VERDI e discriminanti: A0, A1, B0, B3, C0, C1.
 * **Cinque esecuzioni consecutive sull'albero pulito: stesso esito tutte e
 * cinque, stesse rosse.** Nessuna intermittenza: `esclusa()` e i due AND non
 * dipendono dall'ordine fisico, e le righe si leggono con `ORDINE_STABILE`.
 *
 * **Le quattro mutazioni, tutte discriminanti e ortogonali:**
 *   M1. `perPosizione`: il marchio della voce vale anche quando **tutte** le
 *       righe sono escluse, comunque lo siano
 *       (`escluseTutte || (contactOnly && contactOnly)`).
 *       **A2 e A3 verdi**; B2 e C2 invariate. (B1 diventa verde anche lei: e
 *       la prova che i due difetti si **mascherano a vicenda** — chiudere §A
 *       toglierebbe il danno visibile di §B lasciando in piedi la collisione.)
 *   M2. `saveGuardianRegistry`: la riga revocata consulta `mappaPosizioni`
 *       **prima** di fermarsi, cosi segue la sua voce come il commento
 *       dichiara. **B1 e B2 verdi**; A2, A3 e C2 invariate.
 *   M3. `caricaAllenatoreDelClubAttivo`: uno scope senza club attivo non
 *       cerca. **C2 verde**; tutto il resto invariato.
 *   M4. `occupate` **com'era prima di `bb082fd`** (senza
 *       `!posizioniInArrivo.has(...)`): **B0 torna ROSSA** — cioe il difetto
 *       che `bb082fd` ha chiuso — e **B1 e B2 diventano verdi**. E la prova
 *       che la collisione di §B **nasce da `bb082fd`**, e che le due non si
 *       chiudono l'una con l'altra: serve M2.
 *
 * **NON misurato** (lacuna dichiarata, non un verde): la raggiungibilita
 * end-to-end della configurazione a **tre** righe di §A (recapito + revocata +
 * viva sulla stessa posizione) — misurata sulla proiezione, dedotta ma non
 * eseguita dalle porte; revoche concorrenti; rollover di stagione x revoca;
 * riscatto cross-club sul ramo genitore; replay e rate limiting; una persona
 * con due utenze; le altre fette di `data-subject.ts`;
 * `unlinkClubJsonProfiles`; il `recordId` dell'approvazione di un modulo come
 * terzo lettore posizionale (form-submissions.ts) — verificato per lettura,
 * non misurato; il 409 spurio del riscatto genitore su voce fusa.
 *
 * Esecuzione:
 *   node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *     scripts/pp-02-quindicesimo-vaglio.mjs
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
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(78)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (nota) console.log(`        ${nota}`);
};

/* --------------------------------------------------------------- identita */

const CLUB_A = randomUUID(); // il club della vittima
const CLUB_B = randomUUID(); // il club dell'attaccante
const PRES_A = randomUUID();
const PRES_B = randomUUID();
const SENZA_CLUB = randomUUID(); // un'utenza che non appartiene a nessun club
const MADRE = randomUUID();
const PADRE = randomUUID();

const coda = `${CLUB_A.slice(0, 8)}@quindicesimo.local`;
const email = (chi) => `${chi}-${coda}`;

const CF_REVOCATA = "RVCQTT80A41H501A";
const VIA_REVOCATA = "Via della Revocata 15";
const TEL_REVOCATA = "3331150001";
const CF_RECAPITO = "RCPQTT80A41H501B";
const CF_ZIA = "ZIAQTT80A41H501C";

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Quindicesimo",
  password_hash: "$2b$10$quindicesimo",
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

/** `DELETE /api/v1/trainer-accounts/:trainerId`, dalla rotta HTTP vera. */
const scollegaAllenatore = async (sessione, club, identificativo) => {
  const risposta = await rotte.scollegamento.DELETE(
    new Request(
      `http://collaudo.invalid/api/v1/trainer-accounts/${encodeURIComponent(
        identificativo,
      )}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${sessione}`,
          ...(club ? { "x-active-club-id": club } : {}),
          "x-active-access-role": "owner",
          "x-forwarded-for": ip(),
        },
      },
    ),
    { params: { trainerId: identificativo } },
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
  const auth = await carica("src/lib/server/auth.ts");
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const fiscale = await carica("src/lib/documents/fiscal-recipient.ts");
  const segnaposti = await carica("src/lib/server/document-placeholders.ts");

  rotte = {
    elenco: await carica("src/app/api/v1/[resource]/route.ts"),
    riga: await carica("src/app/api/v1/[resource]/[id]/route.ts"),
    scollegamento: await carica(
      "src/app/api/v1/trainer-accounts/[trainerId]/route.ts",
    ),
  };

  await prisma.user.createMany({
    data: [
      utente(PRES_A, email("presa"), "PresidenteA"),
      utente(PRES_B, email("presb"), "PresidenteB"),
      utente(SENZA_CLUB, email("nomade"), "Nomade"),
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
        name: `quindicesimo ${etichetta} ${id.slice(0, 6)}`,
        slug: `quindicesimo-${etichetta}-${id.slice(0, 8)}`,
        creator_id: creatore,
        updated_at: new Date(),
      },
    });
  }

  const tessera = (club, userId, ruolo) =>
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
  const sessNomade = await sessione(SENZA_CLUB);

  /** Una scheda atleta nuda nel club A. */
  const creaAtleta = async (nome, extra = {}) => {
    const id = randomUUID();
    await prisma.athlete.create({
      data: {
        id,
        organization_id: CLUB_A,
        first_name: nome,
        last_name: "Quindicesimo",
        status: "active",
        birth_date: new Date("2015-05-05"),
        data: { fiscalCode: "", ...extra },
        updated_at: new Date(),
      },
    });
    return id;
  };

  /** Una riga di tutore, scritta come la scrive il travaso. */
  const rigaTutore = (tx, atleta, campi) =>
    tx.athleteGuardian.create({
      data: {
        id: campi.id || randomUUID(),
        organization_id: CLUB_A,
        athlete_id: atleta,
        identity_key: campi.identity_key,
        user_id: campi.user_id ?? null,
        email: campi.email ?? null,
        first_name: campi.first_name ?? null,
        last_name: "Quindicesimo",
        relationship: campi.relationship ?? null,
        phone: campi.phone ?? null,
        position: campi.position,
        contact_only: Boolean(campi.contact_only),
        revoked_at: campi.revoked_at ?? null,
        legacy_id: campi.legacy_id ?? null,
        data: campi.data ?? {},
        created_at: campi.created_at ?? new Date(),
        updated_at: new Date(),
      },
    });

  const leggiScheda = (id) => prisma.athlete.findUnique({ where: { id } });

  const segnaposto = (scheda) =>
    segnaposti.buildPlaceholderValues({
      club: { id: CLUB_A, name: "quindicesimo a", settings: {} },
      athlete: scheda,
      season: null,
      now: new Date(),
      charges: [],
      transactions: [],
      paymentPlans: [],
      attendance: { sessions: 0, hours: 0 },
    });

  /** Cio che la scheda mostra e cio che un documento nuovo porterebbe. */
  const fotografia = async (id) => {
    const scheda = await leggiScheda(id);
    const voci = scheda?.data?.guardians || [];
    const destinatario = fiscale.resolveFiscalRecipient(scheda);
    const valori = segnaposto(scheda);
    return {
      voci: voci.map((v) => ({
        nome: String(v.name || ""),
        cf: String(v.fiscalCode || ""),
        revocata: Boolean(v.accessRevokedAt),
        recapito: v.contactOnly === true,
      })),
      intestatario: {
        nome: destinatario.name,
        cf: destinatario.fiscalCode,
        indirizzo: destinatario.address,
      },
      parent1: String(valori["parent.1.first_name"]?.text || ""),
      parent2: String(valori["parent.2.first_name"]?.text || ""),
    };
  };

  const righeDi = (atleta) =>
    prisma.athleteGuardian.findMany({
      where: { athlete_id: atleta },
      orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: {
        id: true,
        first_name: true,
        position: true,
        revoked_at: true,
        contact_only: true,
        data: true,
      },
    });

  /* ================================================================== *
   * §A — due marchi piegati con due AND, e un `esclusa` che e un OR
   * ================================================================== */
  console.log(
    "\n§A — una voce le cui righe sono TUTTE escluse resta esclusa?\n",
  );

  {
    /**
     * Una voce fusa (due righe alla stessa posizione) con i marchi che il
     * chiamante decide. La posizione 1 porta sempre una zia viva, cosi il
     * ripiego `withFiscalCode` ha dove cadere quando la voce 0 e esclusa
     * davvero.
     */
    const schedaConVoce = async (nome, marchi) => {
      const atleta = await creaAtleta(nome);
      await tutori.withGuardianWriter(prisma, async (tx) => {
        for (const [indice, marchio] of marchi.entries()) {
          await rigaTutore(tx, atleta, {
            identity_key: `${marchio.chi}-${atleta}`,
            email: `${marchio.chi}-${atleta.slice(0, 8)}-${coda}`,
            first_name: marchio.nome,
            relationship: marchio.chi,
            phone: marchio.phone ?? null,
            position: 0,
            contact_only: marchio.contactOnly,
            revoked_at: marchio.revocata ? new Date() : null,
            created_at: new Date(Date.now() - (10 - indice) * 60_000),
            data: marchio.cf ? { fiscalCode: marchio.cf, address: marchio.via } : {},
          });
        }
        await rigaTutore(tx, atleta, {
          identity_key: `zia-${atleta}`,
          email: `zia-${atleta.slice(0, 8)}-${coda}`,
          first_name: "Zia",
          relationship: "zia",
          position: 1,
          created_at: new Date(),
          data: { fiscalCode: CF_ZIA },
        });
      });
      await tutori.refreshGuardianProjection(prisma, [atleta]);
      return atleta;
    };

    const REVOCATA = {
      chi: "madre",
      nome: "Madre",
      contactOnly: false,
      revocata: true,
      cf: CF_REVOCATA,
      via: VIA_REVOCATA,
      phone: TEL_REVOCATA,
    };
    const RECAPITO = {
      chi: "estraneo",
      nome: "Estraneo",
      contactOnly: true,
      revocata: false,
      cf: CF_RECAPITO,
      via: "Via del Modulo Pubblico 3",
    };
    const VIVO = {
      chi: "padre",
      nome: "Padre",
      contactOnly: false,
      revocata: false,
      cf: "",
      via: "",
    };

    /* --- CONTROLLO 1: due righe revocate. Il marchio deve reggere. --- */
    const dueRevocate = await schedaConVoce("MarcoA0", [
      REVOCATA,
      { ...REVOCATA, chi: "nonna", nome: "Nonna", cf: "" },
    ]);
    const fotoA0 = await fotografia(dueRevocate);
    prova(
      "A0 CONTROLLO — due righe revocate: la voce resta revocata e non intesta",
      { revocata: true, cf: CF_ZIA },
      { revocata: fotoA0.voci[0]?.revocata, cf: fotoA0.intestatario.cf },
      "e la prova che questa sezione sa dire VERDE quando i due marchi sono " +
        "dello stesso tipo",
    );

    /* --- CONTROLLO 2: due righe di solo recapito. --- */
    const dueRecapiti = await schedaConVoce("MarcoA1", [
      RECAPITO,
      { ...RECAPITO, chi: "vicino", nome: "Vicino", cf: "" },
    ]);
    const fotoA1 = await fotografia(dueRecapiti);
    prova(
      "A1 CONTROLLO — due righe di solo recapito: la voce resta un recapito e non intesta",
      { recapito: true, cf: CF_ZIA },
      { recapito: fotoA1.voci[0]?.recapito, cf: fotoA1.intestatario.cf },
      "stesso marchio, stesso esito: `intestabile` scarta la voce",
    );

    /* --- REPERTO: una revocata e un recapito. Tutte e due escluse. --- */
    const misto = await schedaConVoce("MarcoA2", [REVOCATA, RECAPITO]);
    const fotoA2 = await fotografia(misto);
    prova(
      "A2 REPERTO — voce con due righe escluse in modi diversi: resta esclusa e non intesta",
      { esclusa: true, cf: CF_ZIA, viaRevocata: false },
      {
        esclusa: Boolean(
          fotoA2.voci[0]?.revocata || fotoA2.voci[0]?.recapito,
        ),
        cf: fotoA2.intestatario.cf,
        viaRevocata: String(fotoA2.intestatario.indirizzo || "").includes(
          VIA_REVOCATA,
        ),
      },
      "i due marchi si piegano con due AND indipendenti mentre `esclusa` e un " +
        "OR: nessuno dei due sopravvive, e la voce risulta VIVA. Intestatario: " +
        JSON.stringify(fotoA2.intestatario) +
        "  Voci: " +
        JSON.stringify(fotoA2.voci),
    );

    /* --- REPERTO: l'accumulatore avvelenato. Recapito, revocata, VIVO. --- */
    const treRighe = await schedaConVoce("MarcoA3", [RECAPITO, REVOCATA, VIVO]);
    const fotoA3 = await fotografia(treRighe);
    prova(
      "A3 REPERTO — con una riga viva la voce mostra la viva, e solo la viva",
      { nome: "Padre", cf: "", cfIntestatario: CF_ZIA },
      {
        nome: fotoA3.voci[0]?.nome,
        cf: fotoA3.voci[0]?.cf,
        cfIntestatario: fotoA3.intestatario.cf,
      },
      "`gia` e un accumulatore e `esclusa(gia)` lo interroga dopo che i marchi " +
        "sono stati piegati: al terzo passo l'accumulatore non risulta piu " +
        "escluso, la riga viva non vince, e la voce resta quella del terzo che " +
        "ha compilato il modulo pubblico. Voci: " +
        JSON.stringify(fotoA3.voci) +
        "  parent.1=" +
        fotoA3.parent1,
    );

    /*
      La domanda che il mandato pone e che nessuna sonda aveva mai fatto:
      **l'operatore vede ancora che dietro quella posizione c'e una persona
      revocata?** La voce fusa ne mostra una sola, e dal quattordicesimo vaglio
      non ne eredita piu nemmeno i campi: la riga esclusa non lascia sulla
      scheda **nessuna** traccia leggibile.
    */
    const ordinaria = await schedaConVoce("MarcoA4", [REVOCATA, VIVO]);
    const schedaA4 = await leggiScheda(ordinaria);
    const vociA4 = schedaA4?.data?.guardians || [];
    const testoDellaVoce = JSON.stringify(vociA4[0] || {});
    prova(
      "A4 — la scheda dice ancora che dietro la voce c'e una persona revocata",
      true,
      testoDellaVoce.includes(CF_REVOCATA) ||
        testoDellaVoce.includes("Madre") ||
        Boolean(vociA4[0]?.accessRevokedAt),
      "la voce mostra la persona viva e **solo** lei, quindi la revocata " +
        "sparisce dalla scheda: resta solo in `revokedGuardianIdentities`, che " +
        "nessuna schermata mostra e che porta chiavi, non nomi. Voce: " +
        testoDellaVoce +
        "  Registro: " +
        JSON.stringify(schedaA4?.data?.revokedGuardianIdentities || []),
    );
  }

  /* ================================================================== *
   * §B — la riga revocata non segue la sua voce, e la posizione la
   *      prende un'altra persona
   * ================================================================== */
  console.log(
    "\n§B — un salvataggio d'anagrafica che toglie un tutore: cosa fa la riga revocata nascosta?\n",
  );

  {
    /**
     * Il salvataggio dell'anagrafica **come lo fa la scheda**: rimanda cio
     * che ha letto, meno le voci che l'operatore ha tolto. Il corpo porta un
     * campo di dominio accanto a `data`, altrimenti la rotta lo scambia per un
     * involucro e risponde 200 senza scrivere.
     */
    const salvaLaScheda = async (id, filtro = () => true) => {
      const prima = await leggiScheda(id);
      const voci = (prima.data?.guardians || []).filter(filtro);
      return chiama(
        "PATCH",
        `/api/v1/athletes/${id}`,
        {
          first_name: prima.first_name,
          data: { ...(prima.data || {}), guardians: voci },
        },
        sessA,
        "owner",
        CLUB_A,
      );
    };

    /**
     * La configurazione ordinaria, costruita con le porte vere:
     *
     *  - posizione 0: una zia viva, che l'operatore togliera dalla scheda;
     *  - posizione 1: madre e padre, due righe alla stessa posizione (la forma
     *    che il travaso produce da una voce del blob con due utenze), con la
     *    madre revocata da `revokeGuardianAccessInClub` — che revoca **per
     *    identita**, non per voce, e percio ne risparmia una (ADR-0139);
     *  - posizione 2: un recapito, nato da `upsertGuardianFromFormApproval`,
     *    cioe da un modulo pubblico approvato.
     */
    const scenario = async (nome) => {
      const atleta = await creaAtleta(nome);
      await tutori.withGuardianWriter(prisma, async (tx) => {
        await rigaTutore(tx, atleta, {
          identity_key: `zia-${atleta}`,
          email: `ziab-${atleta.slice(0, 8)}-${coda}`,
          first_name: "Zia",
          relationship: "zia",
          position: 0,
          created_at: new Date(Date.now() - 300_000),
          data: { fiscalCode: CF_ZIA },
        });
        await rigaTutore(tx, atleta, {
          identity_key: MADRE,
          user_id: MADRE,
          email: email("madre"),
          first_name: "Madre",
          relationship: "madre",
          phone: TEL_REVOCATA,
          position: 1,
          created_at: new Date(Date.now() - 240_000),
          data: {
            fiscalCode: CF_REVOCATA,
            address: VIA_REVOCATA,
            city: "Roma",
            postalCode: "00100",
            province: "RM",
          },
        });
        await rigaTutore(tx, atleta, {
          identity_key: PADRE,
          user_id: PADRE,
          email: email("padre"),
          first_name: "Padre",
          relationship: "padre",
          position: 1,
          created_at: new Date(Date.now() - 180_000),
          data: {},
        });
      });
      await tutori.refreshGuardianProjection(prisma, [atleta]);

      /* La revoca della tessera di club della madre: per identita. */
      await tutori.revokeGuardianAccessInClub(prisma, {
        organizationId: CLUB_A,
        userId: MADRE,
        email: email("madre"),
      });

      /* Il modulo pubblico approvato: un recapito, in coda. */
      await tutori.upsertGuardianFromFormApproval(prisma, {
        organizationId: CLUB_A,
        athleteId: atleta,
        contactOnly: true,
        canGrantAccess: false,
        row: {
          email: `estraneo-${atleta.slice(0, 8)}-${coda}`,
          firstName: "Estraneo",
          lastName: "Quindicesimo",
          relationship: "contatto",
          extra: { fiscalCode: CF_RECAPITO },
        },
      });
      await tutori.refreshGuardianProjection(prisma, [atleta]);
      return atleta;
    };

    /* --- CONTROLLO: il caso che `bb082fd` ha chiuso deve restare chiuso. --- */
    const controllo = await scenario("MarcoB0");
    const primaB0 = await fotografia(controllo);
    const salvataggioB0 = await salvaLaScheda(controllo);
    const dopoB0 = await fotografia(controllo);
    prova(
      "B0 CONTROLLO — un salvataggio che rimanda cio che ha letto non sposta niente",
      { stato: 200, uguale: true },
      {
        stato: salvataggioB0.stato,
        uguale: JSON.stringify(primaB0) === JSON.stringify(dopoB0),
      },
      "e la prova che questa sezione sa dire VERDE, e che il PATCH scrive " +
        "davvero (il corpo non e un involucro). Prima: " +
        JSON.stringify(primaB0.voci) +
        "  Dopo: " +
        JSON.stringify(dopoB0.voci),
    );

    /* --- REPERTO: l'operatore toglie la zia. Cinque schede indipendenti. --- */
    const esitiB = [];
    for (let giro = 0; giro < 5; giro += 1) {
      const atleta = await scenario(`MarcoB1-${giro}`);
      const risposta = await salvaLaScheda(
        atleta,
        (voce) => String(voce.name || "") !== "Zia",
      );
      const dopo = await fotografia(atleta);
      const righe = await righeDi(atleta);
      esitiB.push({
        stato: risposta.stato,
        intestatario: dopo.intestatario,
        voci: dopo.voci,
        righe: righe.map((r) => ({
          chi: r.first_name,
          pos: r.position,
          revocata: Boolean(r.revoked_at),
          recapito: r.contact_only,
        })),
      });
    }

    const conRevocataAddosso = esitiB.filter(
      (esito) => esito.intestatario.cf === CF_REVOCATA,
    ).length;
    prova(
      "B1 REPERTO — la ricevuta nuova non si intesta alla persona che il club ha revocato",
      0,
      conRevocataAddosso,
      "la riga revocata resta ferma (`if (riga.revoked_at) continue;` precede " +
        "`mappaPosizioni`) mentre la sua voce si sposta, e la posizione che " +
        "`bb082fd` ha smesso di proteggere la prende un'altra voce. Primo " +
        "giro: " +
        JSON.stringify(esitiB[0]),
    );

    const voceMista = esitiB.filter((esito) => {
      const perPosizione = new Map();
      for (const riga of esito.righe) {
        perPosizione.set(riga.pos, [...(perPosizione.get(riga.pos) || []), riga]);
      }
      return [...perPosizione.values()].some(
        (gruppo) =>
          gruppo.some((r) => r.revocata) &&
          gruppo.some((r) => r.recapito && !r.revocata),
      );
    }).length;
    prova(
      "B2 REPERTO — nessuna posizione tiene insieme una riga revocata e un recapito estraneo",
      0,
      voceMista,
      "e la configurazione di §A, prodotta dal gesto piu ordinario: togliere " +
        "un tutore dalla scheda. Righe del primo giro: " +
        JSON.stringify(esitiB[0].righe),
    );

    const vivoSparito = esitiB.filter(
      (esito) => !esito.voci.some((v) => v.nome === "Padre"),
    ).length;
    prova(
      "B3 REPERTO — il tutore vivo resta visibile sulla scheda dopo il salvataggio",
      0,
      vivoSparito,
      "Voci del primo giro: " + JSON.stringify(esitiB[0].voci),
    );
  }

  /* ================================================================== *
   * §C — `?? undefined`: il gemello che dichiara la regola e questo che
   *      la scrive al contrario
   * ================================================================== */
  console.log(
    "\n§C — «Scollega account» con uno scope senza club attivo: il filtro c'e ancora?\n",
  );

  {
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
          email: `${idLogico}-${club.slice(0, 6)}-${coda}`,
          phone: "3330000000",
        },
        sessione_,
        "owner",
        club,
      );

    /* --- CONTROLLO: con un club attivo, la collisione non morde. --- */
    let negati = 0;
    let idCollisione = null;
    for (let giro = 0; giro < 10; giro += 1) {
      const idLogico = `trainer-${Date.now()}-c${giro}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;
      const mio = await creaProfilo(CLUB_A, sessA, idLogico, `Vittima${giro}`);
      await creaProfilo(CLUB_B, sessB, idLogico, `Sosia${giro}`);
      await chiama(
        "PATCH",
        `/api/v1/trainers/${mio.corpo?.data?.id || idLogico}`,
        { phone: `33300000${giro}` },
        sessA,
        "owner",
        CLUB_A,
      );
      const esito = await scollegaAllenatore(sessA, CLUB_A, idLogico);
      if (esito.stato !== 200) negati += 1;
      if (!idCollisione) idCollisione = idLogico;
    }
    prova(
      "C0 CONTROLLO — con un club attivo il filtro nella query regge la collisione",
      0,
      negati,
      "e la prova che questa sezione sa dire VERDE: e la correzione di " +
        "`bb082fd`, e funziona",
    );

    /*
      Uno scope **senza club attivo**: l'utenza nomade non ha tessere e non ha
      fondato niente, quindi `resolveOrganizationScopeForUser` le da
      `activeOrganizationId: null`. Da li `?? undefined` toglierebbe il filtro.
      Si misura se dalla rotta HTTP ne esce un oracolo di esistenza: con il
      filtro, «esiste in un altro club» e «non esiste» devono rispondere
      **uguale**.
    */
    const esistente = await scollegaAllenatore(sessNomade, "", idCollisione);
    const inventato = await scollegaAllenatore(
      sessNomade,
      "",
      `trainer-${Date.now()}-inesistente`,
    );
    prova(
      "C1 — dalla rotta HTTP, «esiste altrove» e «non esiste» rispondono uguale",
      true,
      esistente.stato === inventato.stato &&
        esistente.corpo?.error?.message === inventato.corpo?.error?.message,
      "il vaglio di permesso (`assertPuoScollegare`) scatta **prima** della " +
        "query, quindi il ramo senza club attivo non e raggiungibile da HTTP: " +
        "il difetto e latente, non sfruttabile. Esistente: " +
        JSON.stringify({
          stato: esistente.stato,
          messaggio: esistente.corpo?.error?.message,
        }) +
        "  Inventato: " +
        JSON.stringify({
          stato: inventato.stato,
          messaggio: inventato.corpo?.error?.message,
        }),
    );

    /*
      La stessa domanda al **confine del modulo**, dove un terzo chiamante la
      porrebbe: uno scope con il ruolo giusto e senza club attivo. Il gemello
      `findClubResourceRecord` dichiara «uno scope senza club attivo non
      cerca: esce con `null`». Qui il filtro sparisce e la query trova la riga
      di un altro club: lo si vede dal messaggio, che parla di confine invece
      che di «non trovato».
    */
    const links = await carica("src/lib/server/profile-account-links.ts");
    const esitoModulo = await links
      .unlinkTrainerAccount(
        {
          userId: SENZA_CLUB,
          activeOrganizationId: null,
          activeRole: "owner",
          allowedOrganizationIds: [],
          accessScopes: [],
          actorEmail: email("nomade"),
        },
        { trainerId: idCollisione },
      )
      .then(() => "riuscito")
      .catch((error) => String(error?.message || ""));
    /*
      **Integrazione PP-02 x PP-03: la riga non si raggiunge piu affatto.**

      PP-02 aveva chiuso il difetto facendo uscire la ricerca con `null`, e
      la risposta diventava «Allenatore non trovato» — indistinguibile da
      «non esiste», che e la forma giusta per non dire a chi chiede se una
      riga esista in un altro club.

      PP-03 ha poi messo la guardia di club attivo **prima** della ricerca:
      da qui la risposta e «nessun club attivo», cioe un rifiuto che parla
      del **chiamante** e non dell’archivio. Non e una fuga — non dice
      niente di nessun altro club — ed e piu presto della precedente.

      La proprieta da misurare resta una sola: **da uno scope senza club
      attivo non esce nessuna riga di un altro club**. Vale se la risposta e
      un rifiuto, di qualunque delle due forme; non varrebbe se fosse
      «riuscito». La sonda accetta percio entrambe le porte e rifiuta il
      successo, che e cio che il difetto produceva.
    */
    prova(
      "C2 — con uno scope senza club attivo non esce nessuna riga altrui",
      true,
      /non trovat/i.test(String(esitoModulo)) ||
        /nessun club attivo/i.test(String(esitoModulo)),
      "`organization_id: scope.activeOrganizationId ?? undefined` — con Prisma " +
        "un `undefined` **toglie** il filtro, che e la forma che " +
        "`chiudiGliInvitiDelProfilo` dichiara vietata dieci righe piu sotto e " +
        "che `findClubResourceRecord` evita uscendo con `null`. Risposta: " +
        JSON.stringify(esitoModulo),
    );
  }

  const rosse = esiti.filter((esito) => !esito.ok);
  console.log(
    `\n  ${esiti.length - rosse.length}/${esiti.length} verdi, ${rosse.length} FAIL`,
  );
  if (rosse.length) {
    console.log("  ROSSE: " + rosse.map((v) => v.titolo.split(" ")[0]).join(", "));
  }
  process.exitCode = rosse.length ? 1 : 0;
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    /* Il club porta via tutto in cascata; le utenze restano e si tolgono. */
    await prisma.club
      .deleteMany({ where: { id: { in: [CLUB_A, CLUB_B] } } })
      .catch(() => {});
    await prisma.user
      .deleteMany({ where: { email: { endsWith: coda } } })
      .catch(() => {});
    await prisma.$disconnect();
  });
