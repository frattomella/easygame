/**
 * **Quattordicesimo vaglio ostile su PP-02.** Misura, non corregge.
 *
 * Le frasi che questa sonda cerca di falsificare, scritte in testa perche
 * sopravvivano a un'interruzione. Tutte e tre vengono dal commit `a771223`
 * (tredicesimo vaglio), cioe dalla correzione piu recente.
 *
 *  §A  athlete-guardians.ts:2435-2438 (ADR-0152) — «Un marchio vale percio per
 *      la voce solo se vale per **tutte** le righe che ci stanno dietro, e
 *      l'anagrafica che la voce mostra e quella della prima riga **che non sia
 *      esclusa**: la persona viva non sparisce dietro chi e stato escluso, e
 *      **chi e stato escluso non copre la persona viva**.»
 *      E fiscal-recipient.ts:214-236 (ADR-0149) — «**Un documento nuovo non
 *      intesta a chi il club ha escluso, ne a un recapito.** [...] una riga
 *      **revocata** e una persona che il club ha escluso.»
 *      IPOTESI: la fusione non sceglie **una** riga, ne mescola due. Il corpo
 *      della voce e `{...anagraficaDiFondo, ...nonNulli(anagraficaDaTenere)}`:
 *      ogni campo che la riga **viva** ha nullo o vuoto viene ereditato dalla
 *      riga **esclusa**. Codice fiscale, indirizzo, comune, CAP, provincia,
 *      telefono e partita IVA vivono in `athlete_guardians.data` e non hanno
 *      colonna, quindi il caso ordinario — il club ha il codice fiscale della
 *      madre e non quello del padre — produce una voce che porta il **nome del
 *      vivo** e il **codice fiscale dell'escluso**. E `accessRevokedAt`, che
 *      prima faceva scartare tutta la voce, adesso e `null`: la ricevuta si
 *      emette.
 *      Conseguenza attesa: `fiscal_recipient.fiscal_code` e
 *      `fiscal_recipient.address` di una ricevuta nuova portano i dati della
 *      persona che il club ha escluso, sotto il nome di un'altra. Prima di
 *      `a771223` quella voce veniva scartata da `intestabile`.
 *
 *  §B  athlete-guardians.ts:2436-2438 — «l'anagrafica che la voce mostra e
 *      quella della prima riga che non sia esclusa».
 *      E saveGuardianRegistry, athlete-guardians.ts:617-643 — «**La posizione e
 *      una chiave di fatto, e va tenuta unica.** [...] Le posizioni tenute da
 *      chi sopravvive a questo salvataggio senza esserne nominato si saltano.»
 *      IPOTESI: `id` e un campo come gli altri, quindi la voce fusa adesso
 *      pubblica l'identificativo della riga **viva** invece di quello della
 *      prima riga. La scheda rimanda quell'id
 *      (`readGuardianInputFromCard`), quindi la riga **revocata** non risulta
 *      piu «nominata», e finisce dentro `occupate`: la sua posizione viene
 *      saltata, la riga viva slitta al posto successivo, e la voce fusa **si
 *      spezza in due**. Da li ogni lettore posizionale scorre di uno —
 *      `{{parent.N.*}}`, `billingGuardianIndex` (chi paga una ricevuta), e
 *      `recordId` con cui l'approvazione di un modulo dice quale riga sta
 *      sostituendo (form-submissions.ts:2128-2143). Prima di `a771223` la voce
 *      pubblicava l'id della riga revocata, che era nominato, e il salvataggio
 *      era idempotente.
 *      E il danno che ADR-0152 e il commento di `perPosizione` dichiarano di
 *      voler evitare, prodotto da un salvataggio d'anagrafica qualunque.
 *      COROLLARIO (B3): lo stesso salvataggio **persiste** il miscuglio di §A.
 *      `readGuardianInputFromCard` porta la voce intera dentro `extra`, e
 *      `saveGuardianRegistry` la scrive con `residuo(input, bersaglio)` in
 *      `athlete_guardians.data` — cioe nella tabella che PP-02 ha eletto ad
 *      **autorita**. Da li in poi il codice fiscale della persona esclusa non
 *      e piu un artefatto di proiezione: e un dato della riga di un'altra
 *      persona, e nessuna revoca lo toglie.
 *
 *  §C  ADR-0151 — «Da qui in poi si nomina la riga per **identificativo di
 *      riga** — unico, e gia verificato dalla guardia come appartenente a
 *      questo club.» E «un identificativo che il client sceglie non e una
 *      chiave».
 *      E profile-account-links.ts:344-349 — «Le stesse due forme
 *      dell'identificativo che `access/redeem/route.ts` conosce gia».
 *      IPOTESI: il gemello non e stato allargato.
 *      `caricaAllenatoreDelClubAttivo` cerca il profilo per identificativo
 *      logico **senza filtro di club e senza `ORDER BY`**, e mette il confine
 *      **dopo** (`assertActiveClub` sulla riga che ha pescato). Con due club
 *      che portano lo stesso identificativo logico la query pesca in ordine
 *      fisico: quando pesca la riga altrui il confine scatta e «Scollega
 *      account» risponde **403 al club legittimo**, che percio non puo piu
 *      togliere l'utenza al proprio allenatore ne chiudere il suo invito.
 *      Chi possiede un club qualunque puo coniarsi la collisione, e a farla
 *      scattare basta il gesto piu ordinario del club **vittima**: un
 *      `UPDATE` sulla propria scheda sposta la tupla in coda, e da quel
 *      momento risponde sempre quella altrui.
 *
 * ---
 *
 * Ogni sezione porta il proprio CONTROLLO: la stessa misura dove l'esito deve
 * essere opposto. Senza, una sonda che dichiara ROSSO non dimostra di saper
 * dire VERDE.
 *
 * ---
 *
 * **Esito al 2026-09-06, su `a771223` non modificato: 4/10, 6 FAIL.**
 * ROSSE: A2, A3, B1, B2, B3, C1.
 * VERDI e discriminanti: A0, A1, B0, C0.
 * **Cinque esecuzioni consecutive sull'albero pulito: stesso esito tutte e
 * cinque, stesse rosse.** Nessuna intermittenza: la fusione sceglie
 * l'anagrafica con un criterio (`esclusa`) che non dipende dall'ordine delle
 * tuple, quindi il difetto e deterministico dove il suo predecessore era
 * casuale.
 *
 * **Prova che le rosse discriminano.** Mutazioni sul codice, applicate e
 * revertite con `git checkout -- src/`:
 *   M1. `perPosizione`: la riga **esclusa** non presta piu niente quando
 *       l'altra non lo e (`...(esclusa(anagraficaDiFondo) &&
 *       !esclusa(anagraficaDaTenere) ? {} : anagraficaDiFondo)`).
 *       **A2, A3 e B3 verdi**; B1, B2 e C1 invariate.
 *   M2. `saveGuardianRegistry`: `occupate` non prende le posizioni che una
 *       riga **nominata** condivide.
 *       **B1 e B2 verdi**; A2, A3, B3 e C1 invariate.
 *   M3. `caricaAllenatoreDelClubAttivo`: il filtro di club dentro la query,
 *       non dopo. **C1 verde**; tutto il resto invariato.
 * Tre difetti distinti, tre mutazioni che li separano uno per uno.
 *
 * **Non coperti dalla suite**: `npm test` risponde 4754/4754 verdi
 * sull'albero in cui questa sonda trova sei rosse.
 *
 * **NON misurato** (lacuna dichiarata, non un verde): revoche concorrenti;
 * rollover di stagione x revoca; replay e rate limiting; una persona con due
 * utenze; le altre fette di `data-subject.ts`; `unlinkClubJsonProfiles`;
 * l'indice `recordId` dell'approvazione di un modulo
 * (form-submissions.ts:2135), che e un terzo lettore posizionale e subisce lo
 * slittamento di §B — verificato per **lettura**, non misurato.
 *
 * Esecuzione:
 *   node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *     scripts/pp-02-quattordicesimo-vaglio.mjs
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

/* --------------------------------------------------------------- identita */

const CLUB_A = randomUUID(); // il club della vittima
const CLUB_B = randomUUID(); // il club dell'attaccante
const PRES_A = randomUUID();
const PRES_B = randomUUID();
const MADRE = randomUUID();
const PADRE = randomUUID();

const coda = `${CLUB_A.slice(0, 8)}@quattordicesimo.local`;
const email = (chi) => `${chi}-${coda}`;

const CF_ESCLUSA = "MDRQTT80A41H501A";
const CF_ZIA = "ZIAQTT80A41H501C";
const VIA_ESCLUSA = "Via della Revocata 1";
const TEL_ESCLUSA = "3331110001";

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Quattordicesimo",
  password_hash: "$2b$10$quattordicesimo",
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
          "x-active-club-id": club,
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
        name: `quattordicesimo ${etichetta} ${id.slice(0, 6)}`,
        slug: `quattordicesimo-${etichetta}-${id.slice(0, 8)}`,
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

  /** Una scheda atleta nuda nel club A. */
  const creaAtleta = async (nome, extra = {}) => {
    const id = randomUUID();
    await prisma.athlete.create({
      data: {
        id,
        organization_id: CLUB_A,
        first_name: nome,
        last_name: "Quattordicesimo",
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
        last_name: "Quattordicesimo",
        relationship: campi.relationship ?? null,
        phone: campi.phone ?? null,
        position: campi.position,
        legacy_id: campi.legacy_id ?? null,
        data: campi.data ?? {},
        updated_at: new Date(),
      },
    });

  /**
   * La configurazione che questo vaglio misura, e che il codice stesso
   * dichiara di produrre: **una voce fusa**, cioe due righe alla stessa
   * posizione di cui una revocata e una viva. La crea una difesa
   * (`revokeGuardianAccessInClub` risparmia la riga che porta l'utenza di un
   * altro, ADR-0139), non una malformazione.
   *
   * Il caso ordinario: il club ha il codice fiscale della madre e non quello
   * del padre — la ricevuta la porta in detrazione lei.
   */
  const schedaConVoceFusa = async (nome, conZia, extraScheda = {}) => {
    const atleta = await creaAtleta(nome, extraScheda);
    await tutori.withGuardianWriter(prisma, async (tx) => {
      await rigaTutore(tx, atleta, {
        identity_key: MADRE,
        user_id: MADRE,
        email: email("madre"),
        first_name: "Madre",
        relationship: "madre",
        phone: TEL_ESCLUSA,
        position: 0,
        data: {
          fiscalCode: CF_ESCLUSA,
          address: VIA_ESCLUSA,
          city: "Roma",
          postalCode: "00100",
          province: "RM",
        },
      });
      /* Il padre: vivo, e senza i dati fiscali che il club non ha mai chiesto. */
      await rigaTutore(tx, atleta, {
        identity_key: PADRE,
        user_id: PADRE,
        email: email("padre"),
        first_name: "Padre",
        relationship: "padre",
        position: 0,
        data: {},
      });
      if (conZia) {
        await rigaTutore(tx, atleta, {
          identity_key: `zia-${atleta}`,
          email: `zia-${atleta.slice(0, 8)}-${coda}`,
          first_name: "Zia",
          relationship: "zia",
          position: 1,
          data: { fiscalCode: CF_ZIA },
        });
      }
    });
    await tutori.refreshGuardianProjection(prisma, [atleta]);
    await tutori.revokeGuardianAccessInClub(prisma, {
      organizationId: CLUB_A,
      userId: MADRE,
      email: email("madre"),
    });
    return atleta;
  };

  const leggiScheda = (id) => prisma.athlete.findUnique({ where: { id } });

  /* ================================================================== *
   * §A — la voce fusa presta l'anagrafica fiscale dell'escluso al vivo
   * ================================================================== */
  console.log(
    "\n§A — chi il club ha escluso non deve comparire su un documento nuovo: ci compare il suo codice fiscale?\n",
  );

  {
    const atleta = await schedaConVoceFusa("MarcoA", false);
    const scheda = await leggiScheda(atleta);
    const voci = scheda?.data?.guardians || [];
    const voce = voci[0] || {};

    prova(
      "A0 SEMINA — la revoca lascia una voce sola, che mostra il tutore vivo e non porta il marchio",
      { voci: 1, nome: "Padre", marchio: false },
      {
        voci: voci.length,
        nome: String(voce.name || ""),
        marchio: Boolean(voce.accessRevokedAt),
      },
      "e cio che ADR-0152 ha deciso, e questa parte funziona",
    );

    /* --- CONTROLLO: una riga esclusa da sola viene scartata davvero. --- */
    const controllo = await creaAtleta("MarcoControlloA");
    await tutori.withGuardianWriter(prisma, async (tx) => {
      await rigaTutore(tx, controllo, {
        identity_key: `sola-${controllo}`,
        email: `sola-${controllo.slice(0, 8)}-${coda}`,
        first_name: "Esclusa",
        position: 0,
        data: {
          fiscalCode: CF_ESCLUSA,
          address: VIA_ESCLUSA,
          city: "Roma",
        },
      });
      await rigaTutore(tx, controllo, {
        identity_key: `zia-${controllo}`,
        email: `ziac-${controllo.slice(0, 8)}-${coda}`,
        first_name: "Zia",
        position: 1,
        data: { fiscalCode: CF_ZIA },
      });
    });
    await tutori.refreshGuardianProjection(prisma, [controllo]);
    await tutori.revokeGuardianAccessInClub(prisma, {
      organizationId: CLUB_A,
      email: `sola-${controllo.slice(0, 8)}-${coda}`,
    });
    const schedaControllo = await leggiScheda(controllo);
    const fiscaleControllo = fiscale.resolveFiscalRecipient(schedaControllo);
    prova(
      "A1 CONTROLLO — una riga esclusa **non fusa** non intesta e non presta niente",
      { cf: CF_ZIA, indirizzoDellEsclusa: false },
      {
        cf: fiscaleControllo.fiscalCode,
        indirizzoDellEsclusa: String(fiscaleControllo.address || "").includes(
          VIA_ESCLUSA,
        ),
      },
      "e la prova che questa sezione sa dire VERDE: `intestabile` funziona " +
        "quando la voce non mescola due persone",
    );

    const fiscaleFuso = fiscale.resolveFiscalRecipient(scheda);
    prova(
      "A2 REPERTO — la ricevuta non porta il codice fiscale ne l'indirizzo di chi il club ha escluso",
      { cfDellEsclusa: false, indirizzoDellEsclusa: false },
      {
        cfDellEsclusa: fiscaleFuso.fiscalCode === CF_ESCLUSA,
        indirizzoDellEsclusa: String(fiscaleFuso.address || "").includes(
          VIA_ESCLUSA,
        ),
      },
      "la fusione tiene i campi non nulli della riga viva e **eredita dalla " +
        "esclusa tutti gli altri**; `accessRevokedAt` adesso e nullo, quindi " +
        "`intestabile` non scarta piu la voce. Intestatario: " +
        JSON.stringify({
          nome: fiscaleFuso.name,
          cf: fiscaleFuso.fiscalCode,
          indirizzo: fiscaleFuso.address,
          citta: fiscaleFuso.city,
        }),
    );

    const valori = segnaposti.buildPlaceholderValues({
      club: { id: CLUB_A, name: "quattordicesimo a", settings: {} },
      athlete: scheda,
      season: null,
      now: new Date(),
      charges: [],
      transactions: [],
      paymentPlans: [],
      attendance: { sessions: 0, hours: 0 },
    });
    prova(
      "A3 REPERTO — nessun segnaposto di un documento nuovo porta un dato della persona esclusa",
      { cf: false, indirizzo: false, telefono: false },
      {
        cf: valori["fiscal_recipient.fiscal_code"]?.text === CF_ESCLUSA,
        indirizzo: String(
          valori["fiscal_recipient.address"]?.text || "",
        ).includes(VIA_ESCLUSA),
        telefono: valori["parent.1.phone"]?.text === TEL_ESCLUSA,
      },
      "`PlaceholderValue` e `{text, html}`. Trovato: " +
        JSON.stringify({
          nome: valori["fiscal_recipient.name"]?.text,
          cf: valori["fiscal_recipient.fiscal_code"]?.text,
          indirizzo: valori["fiscal_recipient.address"]?.text,
          "parent.1.first_name": valori["parent.1.first_name"]?.text,
          "parent.1.phone": valori["parent.1.phone"]?.text,
        }),
    );
  }

  /* ================================================================== *
   * §B — il salvataggio ordinario della scheda spezza la voce fusa
   * ================================================================== */
  console.log(
    "\n§B — la segreteria salva la scheda senza toccare i tutori: le posizioni restano?\n",
  );

  {
    /**
     * Il salvataggio dell'anagrafica **come lo fa la scheda**: rimanda cio
     * che ha letto. Il corpo non e un involucro — porta un campo di dominio
     * accanto a `data` — altrimenti la rotta scambierebbe il contenuto per
     * l'involucro e uscirebbe 200 senza scrivere.
     */
    const salvaLaScheda = async (id) => {
      const prima = await leggiScheda(id);
      return chiama(
        "PATCH",
        `/api/v1/athletes/${id}`,
        {
          first_name: prima.first_name,
          data: { ...(prima.data || {}) },
        },
        sessA,
        "owner",
        CLUB_A,
      );
    };

    const fotografia = async (id) => {
      const scheda = await leggiScheda(id);
      const voci = scheda?.data?.guardians || [];
      const valori = segnaposti.buildPlaceholderValues({
        club: { id: CLUB_A, name: "quattordicesimo a", settings: {} },
        athlete: scheda,
        season: null,
        now: new Date(),
        charges: [],
        transactions: [],
        paymentPlans: [],
        attendance: { sessions: 0, hours: 0 },
      });
      return {
        voci: voci.length,
        nomi: voci.map((v) => String(v.name || "")),
        parent1: String(valori["parent.1.first_name"]?.text || ""),
        parent2: String(valori["parent.2.first_name"]?.text || ""),
        intestatario: fiscale.resolveFiscalRecipient(scheda).fiscalCode,
      };
    };

    /* --- CONTROLLO: una scheda senza voci fuse e idempotente. --- */
    const controllo = await creaAtleta("MarcoControlloB", {
      billingGuardianIndex: 1,
    });
    await tutori.withGuardianWriter(prisma, async (tx) => {
      await rigaTutore(tx, controllo, {
        identity_key: `padre-${controllo}`,
        email: `padreb-${controllo.slice(0, 8)}-${coda}`,
        first_name: "Padre",
        position: 0,
        data: {},
      });
      await rigaTutore(tx, controllo, {
        identity_key: `zia-${controllo}`,
        email: `ziab-${controllo.slice(0, 8)}-${coda}`,
        first_name: "Zia",
        position: 1,
        data: { fiscalCode: CF_ZIA },
      });
    });
    await tutori.refreshGuardianProjection(prisma, [controllo]);
    const controlloPrima = await fotografia(controllo);
    const salvataggioControllo = await salvaLaScheda(controllo);
    const controlloDopo = await fotografia(controllo);
    prova(
      "B0 CONTROLLO — senza voci fuse un salvataggio che rimanda cio che ha letto non sposta niente",
      { stato: 200, prima: controlloPrima, dopo: controlloPrima },
      {
        stato: salvataggioControllo.stato,
        prima: controlloPrima,
        dopo: controlloDopo,
      },
      "e la prova che questa sezione sa dire VERDE, e che il PATCH scrive " +
        "davvero (il corpo non e un involucro)",
    );

    /* --- IL REPERTO, su cinque schede indipendenti. --- */
    const spostate = [];
    const dettagli = [];
    for (let giro = 0; giro < 5; giro += 1) {
      const atleta = await schedaConVoceFusa(`MarcoB${giro}`, true, {
        billingGuardianIndex: 1,
      });
      const prima = await fotografia(atleta);
      const salvataggio = await salvaLaScheda(atleta);
      const dopo = await fotografia(atleta);
      if (JSON.stringify(prima) !== JSON.stringify(dopo)) spostate.push(giro);
      if (giro === 0) {
        dettagli.push({ stato: salvataggio.stato, prima, dopo });
      }
    }

    prova(
      "B1 REPERTO — nessuna delle cinque schede cambia lettura posizionale per un salvataggio d'anagrafica",
      [],
      spostate,
      "la voce fusa pubblica adesso l'`id` della riga **viva**; la scheda " +
        "rimanda quello, la riga revocata non risulta nominata e la sua " +
        "posizione viene saltata: la voce si spezza in due e tutto slitta. " +
        JSON.stringify(dettagli[0]),
    );

    /*
      La conseguenza su chi paga: `billingGuardianIndex` e la posizione scelta
      a mano dal club. Se le posizioni slittano, la ricevuta cambia persona.
    */
    const atleta = await schedaConVoceFusa("MarcoBilling", true, {
      billingGuardianIndex: 1,
    });
    const primaBilling = fiscale.resolveFiscalRecipient(await leggiScheda(atleta));
    await salvaLaScheda(atleta);
    const dopoBilling = fiscale.resolveFiscalRecipient(await leggiScheda(atleta));
    prova(
      "B2 REPERTO — la posizione scelta a mano dal club indica la stessa persona prima e dopo il salvataggio",
      { prima: CF_ZIA, dopo: CF_ZIA },
      { prima: primaBilling.fiscalCode, dopo: dopoBilling.fiscalCode },
      "`billingGuardianIndex: 1` e la zia. Dopo il salvataggio la posizione 1 " +
        "e il padre. Intestatario: " +
        JSON.stringify({
          prima: primaBilling.name,
          dopo: dopoBilling.name,
        }),
    );

    /*
      **E il miscuglio non resta una proiezione.**

      `readGuardianInputFromCard` porta la voce intera dentro `extra`, e
      `saveGuardianRegistry` la scrive in `athlete_guardians.data` con
      `residuo(input, bersaglio)`. Cio che la fusione ha prestato al vivo
      finisce percio **nella tabella che e l'autorita**, sulla riga di una
      persona diversa, e da li nessuna revoca lo toglie piu.
    */
    const righeDopo = await prisma.athleteGuardian.findMany({
      where: { athlete_id: atleta },
      orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: {
        first_name: true,
        position: true,
        revoked_at: true,
        data: true,
      },
    });
    const rigaDelVivo = righeDopo.find(
      (riga) => riga.first_name === "Padre" && !riga.revoked_at,
    );
    prova(
      "B3 REPERTO — la riga del tutore vivo non porta in archivio i dati fiscali della persona esclusa",
      { cf: false, indirizzo: false },
      {
        cf: (rigaDelVivo?.data || {}).fiscalCode === CF_ESCLUSA,
        indirizzo: (rigaDelVivo?.data || {}).address === VIA_ESCLUSA,
      },
      "il miscuglio della proiezione viene **persistito** dal salvataggio " +
        "d'anagrafica: `extra` porta la voce intera e `residuo` la scrive su " +
        "`athlete_guardians.data`. Righe: " +
        JSON.stringify(
          righeDopo.map((r) => ({
            chi: r.first_name,
            pos: r.position,
            revocata: Boolean(r.revoked_at),
            cf: (r.data || {}).fiscalCode || null,
          })),
        ),
    );
  }

  /* ================================================================== *
   * §C — il gemello di ADR-0151: la stessa forma, l'altra porta
   * ================================================================== */
  console.log(
    "\n§C — «Scollega account»: il club legittimo riesce a scollegare il proprio allenatore?\n",
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
          email: email(nome.toLowerCase()),
          phone: "3330000000",
        },
        sessione_,
        "owner",
        club,
      );

    /* --- CONTROLLO: senza collisione lo scollegamento riesce sempre. --- */
    let negatiSenzaCollisione = 0;
    for (let giro = 0; giro < 10; giro += 1) {
      const idLogico = `trainer-${Date.now()}-nc${giro}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;
      await creaProfilo(CLUB_A, sessA, idLogico, `SoloA${giro}`);
      const esito = await scollegaAllenatore(sessA, CLUB_A, idLogico);
      if (esito.stato !== 200) negatiSenzaCollisione += 1;
    }
    prova(
      "C0 CONTROLLO — senza collisione «Scollega account» riesce dieci volte su dieci",
      0,
      negatiSenzaCollisione,
      "e la prova che questa sezione sa dire VERDE",
    );

    /* --- IL REPERTO: l'attaccante si conia la collisione nel proprio club.
       Quale delle due righe risponda lo decide l'ordine **fisico** delle
       tuple, perche la query non ha ne filtro di club ne `ORDER BY`. Un
       `UPDATE` sposta la tupla in coda: basta percio che il club legittimo
       **modifichi la propria scheda** — correggere un telefono — perche la
       riga altrui passi davanti. E il gesto piu ordinario che ci sia, e non
       serve all'attaccante: la fa la vittima. */
    let negati = 0;
    let primo = null;
    for (let giro = 0; giro < 10; giro += 1) {
      const idLogico = `trainer-${Date.now()}-c${giro}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;
      const mio = await creaProfilo(CLUB_A, sessA, idLogico, `Vittima${giro}`);
      await creaProfilo(CLUB_B, sessB, idLogico, `Sosia${giro}`);
      /* La segreteria corregge il telefono del proprio allenatore. */
      await chiama(
        "PATCH",
        `/api/v1/trainers/${mio.corpo?.data?.id || idLogico}`,
        { phone: `33300000${giro}` },
        sessA,
        "owner",
        CLUB_A,
      );
      const esito = await scollegaAllenatore(sessA, CLUB_A, idLogico);
      if (esito.stato !== 200) {
        negati += 1;
        if (!primo) primo = { stato: esito.stato, corpo: esito.corpo };
      }
    }
    prova(
      "C1 REPERTO — una collisione coniata in un altro club non impedisce al club legittimo di scollegare",
      0,
      negati,
      "`caricaAllenatoreDelClubAttivo` cerca per identificativo logico **senza " +
        "filtro di club e senza `ORDER BY`**, e mette il confine dopo: quando " +
        "pesca la riga altrui il club legittimo riceve 403 e non puo piu ne " +
        "togliere l'utenza al proprio allenatore ne chiudere il suo invito. " +
        `Negati ${negati}/10. Primo: ` +
        JSON.stringify(primo),
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
