/**
 * **La matrice di regressione del consolidamento PP-02, su PostgreSQL vero.**
 *
 * ---
 *
 * ## Perche non e il sedicesimo vaglio
 *
 * I quindici vagli precedenti cercavano difetti **nuovi**, e gli ultimi due
 * trovavano soprattutto **regressioni delle correzioni precedenti**: il ciclo
 * revisione → correzione locale → revisione aveva smesso di convergere, perche
 * ogni consumatore si ricostruiva le regole in casa e correggerne uno ne
 * creava una versione nuova.
 *
 * Questa sonda non cerca difetti nuovi. Percorre le **diciassette situazioni**
 * in cui il dominio si e rotto almeno una volta, e pretende che dopo il
 * consolidamento diano tutte la risposta del contratto
 * (`docs/knowledge-base/49-pp-02-invarianti-tutori.md`). E una matrice di
 * regressione, non un vaglio: se una riga diventa rossa, il difetto e nella
 * primitiva e non nell'endpoint.
 *
 * ## Le diciassette
 *
 * | # | Situazione | Invariante |
 * |---|---|---|
 * | 1 | salvataggio ordinario | §D4: non sposta `parent.1`/`parent.2` ne chi paga |
 * | 2 | aggiunta di un tutore | §D: le posizioni esistenti non si muovono |
 * | 3 | rimozione di un tutore | §D3: una revocata non prende il posto di una viva |
 * | 4 | revoca | §I: chiude tutte le vie di rientro |
 * | 5 | scollegamento | §B: l'utenza cade, il recapito resta |
 * | 6 | modulo pubblico | §C: nasce `contact_only`, e non intesta niente |
 * | 7 | modulo interno | §C: nasce viva |
 * | 8 | oblio dell'interessato | §I: riepilogo e atto contano la stessa cosa |
 * | 9 | riscatto di un invito | §I: scioglie le tre difese, e solo per la riga guardata |
 * | 10 | invito multi-uso | §I: `redeemed` e ancora chiudibile |
 * | 11 | passaggio di stagione | §D: le posizioni sopravvivono |
 * | 12 | righe travasate | §B: chiave d'utenza, e possono essere nascoste |
 * | 13 | righe nascoste | §D1: seguono la loro voce |
 * | 14 | riga di solo recapito | §G: non intesta e non riceve |
 * | 15 | riga revocata | §E: non presta i propri campi a una persona viva |
 * | 16 | cancellazione di un'utenza | §I: nessun riferimento dangling |
 * | 17 | salvataggio stantio × revoca concorrente | §D: il salvataggio non annulla la revoca |
 *
 * ## Come si esegue
 *
 * ```
 * node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *   scripts/pp-02-consolidamento.mjs
 * ```
 *
 * Vuole il database di sviluppo (`EASYGAME_DB_ENV=development`). Scrive e
 * cancella un club suo: non tocca niente di preesistente.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();
const carica = (rel) => import(pathToFileURL(path.resolve(rel)).href);

const CLUB = randomUUID();
const CLUB_ALTRO = randomUUID();
const PRES = randomUUID();
const PRES_ALTRO = randomUUID();
const MADRE = randomUUID();
const PADRE = randomUUID();

const marchio = CLUB.slice(0, 8);
const email = (chi) => `${chi}.${marchio}@consolidamento.test`;

/* ------------------------------------------------------------------ esiti */

const esiti = [];
let sezione = "";

const dice = (titolo) => {
  sezione = titolo;
  console.log(`\n── ${titolo}`);
};

const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ sezione, titolo, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${titolo}`);
  if (!ok) {
    console.log(`        trovato ${JSON.stringify(trovato)}`);
    console.log(`        atteso  ${JSON.stringify(atteso)}`);
    if (nota) console.log(`        nota: ${nota}`);
  }
};

const vero = (titolo, condizione, nota = "") =>
  prova(titolo, true, Boolean(condizione), nota);

/* ---------------------------------------------------------------- fixture */

const utente = (id, indirizzo, nome) => ({
  id,
  email: indirizzo,
  email_verified_at: new Date(),
  first_name: nome,
  last_name: "Consolidamento",
  password_hash: "$2b$10$consolidamento",
  role: "user",
});

const creaAtleta = async (nome, extra = {}) => {
  const id = randomUUID();
  await prisma.athlete.create({
    data: {
      id,
      organization_id: CLUB,
      first_name: nome,
      last_name: "Consolidamento",
      status: "active",
      birth_date: new Date("2014-04-04"),
      data: { ...extra },
      updated_at: new Date(),
    },
  });
  return id;
};

/** Una riga di tutore com'e in archivio, scritta dal proprietario del dominio. */
const rigaTutore = (tutori) => async (atleta, campi) =>
  tutori.withGuardianWriter(prisma, async (tx) =>
    tx.athleteGuardian.create({
      data: {
        id: campi.id || randomUUID(),
        organization_id: campi.organization_id || CLUB,
        athlete_id: atleta,
        identity_key: campi.identity_key ?? campi.email ?? `riga:${randomUUID()}`,
        user_id: campi.user_id ?? null,
        email: campi.email ?? null,
        first_name: campi.first_name ?? null,
        last_name: campi.last_name ?? "Consolidamento",
        relationship: campi.relationship ?? null,
        phone: campi.phone ?? null,
        position: campi.position ?? 0,
        contact_only: Boolean(campi.contact_only),
        revoked_at: campi.revoked_at ?? null,
        legacy_id: campi.legacy_id ?? null,
        data: campi.data ?? {},
        created_at: campi.created_at ?? new Date(),
        updated_at: new Date(),
      },
    }),
  );

const leggiScheda = (id) => prisma.athlete.findUnique({ where: { id } });

const voci = async (id) => {
  const scheda = await leggiScheda(id);
  return Array.isArray(scheda?.data?.guardians) ? scheda.data.guardians : [];
};

/* ------------------------------------------------------------------- main */

const main = async () => {
  const tutori = await carica("src/lib/server/athlete-guardians.ts");
  const legami = await carica("src/lib/server/profile-account-links.ts");
  const fiscale = await carica("src/lib/documents/fiscal-recipient.ts");
  const segnaposti = await carica("src/lib/server/document-placeholders.ts");
  const promemoria = await carica("src/lib/server/medical-certificate-reminders.ts");
  const recapiti = await carica("src/lib/athlete-guardians.ts");

  const scrivi = rigaTutore(tutori);

  await prisma.user.createMany({
    data: [
      utente(PRES, email("pres"), "Presidente"),
      utente(PRES_ALTRO, email("presaltro"), "PresidenteAltro"),
      utente(MADRE, email("madre"), "Madre"),
      utente(PADRE, email("padre"), "Padre"),
    ],
  });

  for (const [id, creatore, etichetta] of [
    [CLUB, PRES, "uno"],
    [CLUB_ALTRO, PRES_ALTRO, "due"],
  ]) {
    await prisma.club.create({
      data: {
        id,
        name: `consolidamento ${etichetta} ${marchio}`,
        slug: `consolidamento-${etichetta}-${id.slice(0, 8)}`,
        creator_id: creatore,
        updated_at: new Date(),
      },
    });
    await prisma.organizationUser.create({
      data: {
        id: randomUUID(),
        organization_id: id,
        user_id: creatore,
        role: "owner",
        is_primary: true,
        updated_at: new Date(),
      },
    });
  }

  /* ============================================ 1, 2, 3 — il salvataggio */

  dice("1-3  salvataggio ordinario, aggiunta, rimozione");
  {
    const atleta = await creaAtleta("Uno", { billingGuardianIndex: 1 });

    const madre = randomUUID();
    const padre = randomUUID();
    await scrivi(atleta, {
      id: madre,
      position: 0,
      first_name: "Madre",
      email: email("madre"),
      data: { fiscalCode: "CF-MADRE" },
    });
    await scrivi(atleta, {
      id: padre,
      position: 1,
      first_name: "Padre",
      email: email("padre"),
      data: { fiscalCode: "CF-PADRE" },
    });
    await tutori.refreshGuardianProjection(prisma, [atleta]);

    const primaVoci = await voci(atleta);
    const primaPagante = fiscale.resolveFiscalRecipient(await leggiScheda(atleta));

    prova(
      "1a la proiezione parte con due voci in ordine",
      ["Madre", "Padre"],
      primaVoci.map((v) => v.name),
    );
    prova("1b chi paga e la posizione scelta dal club", "CF-PADRE", primaPagante.fiscalCode);

    /* Il salvataggio ordinario: si rimanda cio che si e letto. */
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      canGrantAccess: true,
      rows: primaVoci.map((v) => ({
        rowId: v.id,
        email: v.email,
        firstName: v.name,
        lastName: v.surname,
        extra: v,
      })),
    });

    const dopoVoci = await voci(atleta);
    const dopoPagante = fiscale.resolveFiscalRecipient(await leggiScheda(atleta));

    prova(
      "1c un salvataggio ordinario non muove le posizioni",
      primaVoci.map((v) => v.id),
      dopoVoci.map((v) => v.id),
    );
    prova("1d ne cambia chi paga", "CF-PADRE", dopoPagante.fiscalCode);

    /* 2 — si aggiunge una nonna in coda. */
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      canGrantAccess: true,
      rows: [
        ...dopoVoci.map((v) => ({
          rowId: v.id,
          email: v.email,
          firstName: v.name,
          extra: v,
        })),
        { email: email("nonna"), firstName: "Nonna" },
      ],
    });

    const conNonna = await voci(atleta);
    prova(
      "2a aggiungere un tutore non muove chi c'era",
      [madre, padre],
      conNonna.slice(0, 2).map((v) => v.id),
    );
    prova("2b la nonna si accoda", "Nonna", conNonna[2]?.name);
    prova(
      "2c chi paga non si sposta",
      "CF-PADRE",
      fiscale.resolveFiscalRecipient(await leggiScheda(atleta)).fiscalCode,
    );

    /* 3 — si toglie la nonna. */
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      canGrantAccess: true,
      rows: conNonna.slice(0, 2).map((v) => ({
        rowId: v.id,
        email: v.email,
        firstName: v.name,
        extra: v,
      })),
    });

    const senzaNonna = await voci(atleta);
    prova(
      "3a togliere un tutore lascia gli altri dove sono",
      [madre, padre],
      senzaNonna.map((v) => v.id),
    );
    prova(
      "3b chi paga resta lo stesso",
      "CF-PADRE",
      fiscale.resolveFiscalRecipient(await leggiScheda(atleta)).fiscalCode,
    );
  }

  /* ================================================ 4, 5 — revoca e scollega */

  dice("4-5  revoca e scollegamento");
  {
    const atleta = await creaAtleta("Due");
    const madre = randomUUID();

    await scrivi(atleta, {
      id: madre,
      position: 0,
      first_name: "Madre",
      email: email("madre"),
      user_id: MADRE,
      identity_key: MADRE,
      data: { fiscalCode: "CF-MADRE", address: "Via Madre 1" },
    });
    await tutori.refreshGuardianProjection(prisma, [atleta]);

    /* Un invito vivo per quella riga: la revoca deve chiuderlo. */
    const invito = randomUUID();
    await prisma.clubResourceItem.create({
      data: {
        id: invito,
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: "GETTONE-1",
        status: "active",
        payload: {
          athlete_id: atleta,
          guardian_id: madre,
          token_type: "parent_access",
        },
        updated_at: new Date(),
      },
    });

    await tutori.revokeGuardianRow(prisma, {
      athleteId: atleta,
      guardianRowId: madre,
      organizationId: CLUB,
    });

    const riga = await prisma.athleteGuardian.findUnique({ where: { id: madre } });
    const dopoInvito = await prisma.clubResourceItem.findUnique({ where: { id: invito } });
    const voce = (await voci(atleta))[0];

    vero("4a la riga porta il marchio", riga?.revoked_at);
    prova("4b l'utenza cade", null, riga?.user_id);
    prova("4c il recapito resta: al club serve", email("madre"), riga?.email);
    prova("4d l'invito e chiuso: nessuna via di rientro", "revoked", dopoInvito?.status);
    prova("4e la voce e esclusa", true, Boolean(voce?.accessRevokedAt));
    prova(
      "4f una riga revocata non intesta un documento nuovo",
      "",
      fiscale.resolveFiscalRecipient(await leggiScheda(atleta)).fiscalCode,
    );
    prova(
      "4g e non riceve piu avvisi",
      [],
      promemoria.getGuardianRows(await leggiScheda(atleta)),
    );

    /* 5 — lo scollegamento puro, su una riga diversa. */
    const atletaB = await creaAtleta("Tre");
    const padre = randomUUID();
    await scrivi(atletaB, {
      id: padre,
      position: 0,
      first_name: "Padre",
      email: email("padre"),
      user_id: PADRE,
      identity_key: PADRE,
    });
    await tutori.refreshGuardianProjection(prisma, [atletaB]);

    await legami.unlinkGuardianAccount(
      {
        userId: PRES,
        activeOrganizationId: CLUB,
        allowedOrganizationIds: [CLUB],
        activeRole: "owner",
      },
      { athleteId: atletaB, guardianId: padre, reason: "consolidamento" },
    );

    const rigaB = await prisma.athleteGuardian.findUnique({ where: { id: padre } });
    prova("5a lo scollegamento toglie l'utenza", null, rigaB?.user_id);
    prova("5b e lascia il recapito", email("padre"), rigaB?.email);
  }

  /* ====================================== 6, 7 — modulo pubblico e interno */

  dice("6-7  modulo pubblico e modulo interno");
  {
    const atleta = await creaAtleta("Quattro");

    await tutori.upsertGuardianFromFormApproval(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      row: {
        email: email("estraneo"),
        firstName: "Estraneo",
        extra: { fiscalCode: "CF-ESTRANEO", address: "Via Estranea 9" },
      },
      contactOnly: true,
      canGrantAccess: false,
    });

    const pubblica = (await voci(atleta))[0];
    prova("6a una compilazione pubblica nasce di solo recapito", true, pubblica?.contactOnly);
    prova(
      "6b e non intesta la ricevuta nuova",
      "",
      fiscale.resolveFiscalRecipient(await leggiScheda(atleta)).fiscalCode,
    );
    prova(
      "6c ne riceve avvisi",
      [],
      promemoria.getGuardianRows(await leggiScheda(atleta)),
    );

    const atletaB = await creaAtleta("Cinque");
    await tutori.upsertGuardianFromFormApproval(prisma, {
      organizationId: CLUB,
      athleteId: atletaB,
      row: {
        email: email("interno"),
        firstName: "Interno",
        extra: { fiscalCode: "CF-INTERNO" },
      },
      contactOnly: false,
      canGrantAccess: true,
    });

    const interna = (await voci(atletaB))[0];
    prova("7a una compilazione interna nasce viva", false, interna?.contactOnly);
    prova(
      "7b e intesta la ricevuta",
      "CF-INTERNO",
      fiscale.resolveFiscalRecipient(await leggiScheda(atletaB)).fiscalCode,
    );
  }

  /* ======================================== 8 — l'oblio dell'interessato */

  dice("8  oblio: il riepilogo e l'atto contano la stessa cosa");
  {
    const atleta = await creaAtleta("Sei");
    const madre = randomUUID();
    await scrivi(atleta, {
      id: madre,
      position: 0,
      first_name: "Madre",
      email: email("madre"),
    });

    await prisma.clubResourceItem.createMany({
      data: [
        {
          id: randomUUID(),
          organization_id: CLUB,
          resource_type: "access_tokens",
          name: "OBLIO-1",
          status: "active",
          payload: { athlete_id: atleta, guardian_id: madre },
          updated_at: new Date(),
        },
        {
          /* Un gettone di un ALTRO club che nomina questa scheda: il confine. */
          id: randomUUID(),
          organization_id: CLUB_ALTRO,
          resource_type: "access_tokens",
          name: "OBLIO-ALTROVE",
          status: "active",
          payload: { athlete_id: atleta, guardian_id: madre },
          updated_at: new Date(),
        },
      ],
    });

    const contati = await tutori.countGuardianInvitesForAthlete(prisma, atleta, CLUB);
    prova("8a il riepilogo conta solo dentro il club", 1, contati);

    let negato = null;
    try {
      await tutori.countGuardianInvitesForAthlete(prisma, atleta, null);
    } catch (errore) {
      negato = String(errore?.message || "");
    }
    vero(
      "8b senza club non si cerca: fallisce, non allarga",
      negato?.includes("Accesso negato"),
      "in Prisma `undefined` toglie il filtro: qui deve fallire",
    );

    const tolti = await tutori.eraseGuardiansForAthlete(prisma, atleta, CLUB);
    const restano = await prisma.clubResourceItem.count({
      where: { payload: { path: ["athlete_id"], equals: atleta } },
    });

    prova("8c l'atto cancella la riga che il riepilogo contava", 1, tolti);
    prova(
      "8d e il gettone dell'altro club resta dov'e",
      1,
      restano,
      "il confine vale anche quando si cancella",
    );
  }

  /* ================================= 9, 10 — riscatto e invito multi-uso */

  dice("9-10  riscatto di un invito, invito multi-uso");
  {
    const atleta = await creaAtleta("Sette");
    const nascosta = randomUUID();
    const visibile = randomUUID();

    /* Due righe sulla stessa posizione: la proiezione ne pubblica una sola. */
    await scrivi(atleta, {
      id: visibile,
      position: 0,
      first_name: "Visibile",
      email: email("visibile"),
      created_at: new Date("2026-01-01"),
    });
    await scrivi(atleta, {
      id: nascosta,
      position: 0,
      first_name: "Nascosta",
      email: email("nascosta"),
      contact_only: true,
      created_at: new Date("2026-01-02"),
    });
    await tutori.refreshGuardianProjection(prisma, [atleta]);

    const pubblicate = await voci(atleta);
    prova("9a la voce fusa pubblica un identificativo solo", 1, pubblicate.length);
    prova("9b ed e quello della riga viva", visibile, pubblicate[0]?.id);

    /*
      **La guardia del riscatto interroga le righe, non la proiezione.**

      Un invito coniato per la riga **nascosta** veniva rifiutato con 404: la
      guardia cercava dentro `athletes.data.guardians[]`, che di quella
      posizione pubblica un identificativo solo, mentre `linkGuardianAccount`
      cerca fra le righe. La promessa fatta a una famiglia smetteva di
      funzionare perche l'archivio aveva cambiato forma.
    */
    const trovataNascosta = await tutori.findGuardianRow(prisma, atleta, nascosta);
    prova("9c la riga nascosta si trova per identificativo", nascosta, trovataNascosta?.id);

    await tutori.linkGuardianAccount(prisma, {
      athleteId: atleta,
      guardianRowId: nascosta,
      identityKeys: [],
      userId: MADRE,
      email: email("madre"),
    });

    const dopo = await prisma.athleteGuardian.findUnique({ where: { id: nascosta } });
    prova("9d il riscatto scioglie il solo-recapito", false, dopo?.contact_only);
    prova("9e e scrive l'utenza", MADRE, dopo?.user_id);

    const altra = await prisma.athleteGuardian.findUnique({ where: { id: visibile } });
    prova(
      "9f e non tocca la riga accanto",
      null,
      altra?.user_id,
      "si collega la riga guardata, non un'altra per identita",
    );

    /* 10 — un invito gia riscattato e multi-uso resta chiudibile. */
    const multi = randomUUID();
    await prisma.clubResourceItem.create({
      data: {
        id: multi,
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: "MULTI-1",
        status: "redeemed",
        payload: {
          athlete_id: atleta,
          guardian_id: nascosta,
          one_time: false,
          token_type: "parent_access",
        },
        updated_at: new Date(),
      },
    });

    await tutori.revokeGuardianRow(prisma, {
      athleteId: atleta,
      guardianRowId: nascosta,
      organizationId: CLUB,
    });

    const chiuso = await prisma.clubResourceItem.findUnique({ where: { id: multi } });
    prova(
      "10a un invito `redeemed` multi-uso lo chiude la revoca",
      "revoked",
      chiuso?.status,
      "cio che si chiude e tutto cio che non e gia chiuso",
    );
  }

  /* ======================= 11, 12, 13 — stagione, travaso, righe nascoste */

  dice("11-13  stagione, righe travasate, righe nascoste");
  {
    const atleta = await creaAtleta("Otto", { billingGuardianIndex: 0 });
    const travasata = randomUUID();
    const viva = randomUUID();

    /* Una riga travasata: chiave d'utenza, chiave storica, e nascosta. */
    await scrivi(atleta, {
      id: travasata,
      position: 0,
      first_name: "Travasata",
      email: email("travasata"),
      user_id: PADRE,
      identity_key: PADRE,
      legacy_id: "guardian-0-vecchio",
      revoked_at: new Date("2026-01-01"),
      data: { fiscalCode: "CF-TRAVASATA", phone: "333-vecchio" },
    });
    await scrivi(atleta, {
      id: viva,
      position: 0,
      first_name: "Viva",
      email: email("viva"),
      created_at: new Date("2026-01-05"),
    });
    await tutori.refreshGuardianProjection(prisma, [atleta]);

    const voce = (await voci(atleta))[0];

    prova("12a la chiave storica trova la riga", travasata,
      (await tutori.findGuardianRow(prisma, atleta, "guardian-0-vecchio"))?.id);
    prova("13a le due righe fanno una voce sola", "Viva", voce?.name);
    prova(
      "13b e la voce non eredita i campi della riga esclusa",
      undefined,
      voce?.fiscalCode,
      "il difetto peggiore delle due tornate precedenti",
    );
    vero("13c ma la scheda dichiara chi sta dietro", Array.isArray(voce?.escluseDietro));
    prova(
      "13d senza portarne i dati",
      false,
      JSON.stringify(voce?.escluseDietro ?? []).includes("CF-TRAVASATA"),
    );
    prova(
      "13e la ricevuta nuova non porta il codice fiscale dell'esclusa",
      "",
      fiscale.resolveFiscalRecipient(await leggiScheda(atleta)).fiscalCode,
    );

    /* 11 — la voce si sposta: la riga nascosta la segue. */
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      canGrantAccess: true,
      rows: [
        { email: email("nuovo"), firstName: "Nuovo" },
        { rowId: viva, email: email("viva"), firstName: "Viva", extra: voce },
      ],
    });

    const spostate = await prisma.athleteGuardian.findMany({
      where: { athlete_id: atleta },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    const posizioneViva = spostate.find((r) => r.id === viva)?.position;
    const posizioneNascosta = spostate.find((r) => r.id === travasata)?.position;

    prova(
      "11a la riga nascosta segue la sua voce, anche se revocata",
      posizioneViva,
      posizioneNascosta,
      "la posizione e cio che le tiene insieme, e insieme si spostano",
    );

    const dopoVoci = await voci(atleta);
    prova("11b e la scheda resta con due voci, non tre", 2, dopoVoci.length);
  }

  /* ============================ 14, 15 — solo recapito e riga revocata */

  dice("14-15  solo recapito, riga revocata");
  {
    const atleta = await creaAtleta("Nove");

    await scrivi(atleta, {
      id: randomUUID(),
      position: 0,
      first_name: "Padre",
      email: email("padrevivo"),
      user_id: PADRE,
      identity_key: PADRE,
      data: {},
    });
    await scrivi(atleta, {
      id: randomUUID(),
      position: 1,
      first_name: "Madre",
      email: email("madrerevocata"),
      revoked_at: new Date("2026-01-01"),
      phone: "333-madre",
      data: {
        fiscalCode: "CF-MADRE-REVOCATA",
        address: "Via Madre 1",
        city: "Milano",
      },
    });
    await tutori.refreshGuardianProjection(prisma, [atleta]);

    const scheda = await leggiScheda(atleta);
    const destinatario = fiscale.resolveFiscalRecipient(scheda);

    /*
      **Il caso vietato del contratto.** Padre vivo senza codice fiscale, madre
      revocata con codice fiscale, indirizzo e telefono: la ricevuta usciva
      intestata al padre con i dati della madre.
    */
    /*
      L'intestatario cade sull'**atleta**, ed e la regola scritta: «il tutore
      marcato come intestatario; altrimenti il primo tutore che ha un codice
      fiscale; altrimenti l'atleta». Il padre non ne ha uno, e l'unica riga che
      lo porta e esclusa. Cio che il contratto vieta non e che si cada
      sull'atleta: e che si esca con il nome di uno e il codice fiscale di
      un'altra.
    */
    prova(
      "15a l'intestatario non e la persona che il club ha escluso",
      false,
      String(destinatario.name || "").includes("Madre"),
    );
    prova("15b senza il codice fiscale della madre revocata", "", destinatario.fiscalCode);
    prova("15c senza il suo indirizzo", "", destinatario.address);
    prova("15d senza la sua citta", "", destinatario.city);
    prova(
      "15d-bis e nemmeno il suo numero, da nessun campo",
      false,
      JSON.stringify(destinatario).includes("333-madre"),
    );

    const valori = segnaposti.buildPlaceholderValues({
      club: { id: CLUB, name: "Consolidamento", settings: {} },
      athlete: scheda,
      season: null,
      charges: [],
      transactions: [],
      paymentPlans: [],
      attendance: { sessions: 0, hours: 0 },
      signature: null,
      stamp: null,
      documentTitle: "prova",
      now: new Date(),
    });

    const segnaposto = (chiave) => String(valori[chiave]?.text ?? "");

    prova("15e `parent.1` e il padre vivo", "Padre", segnaposto("parent.1.first_name"));
    prova(
      "15f `parent.2` resta vuoto e non slitta",
      "",
      segnaposto("parent.2.first_name"),
      "la posizione resta dov'e, e la voce esclusa risponde vuoto",
    );
    prova("15g e non stampa il telefono della revocata", "", segnaposto("parent.2.phone"));
    prova(
      "15h ne il suo numero in `parent.1`",
      "",
      segnaposto("parent.1.phone"),
      "il padre non ha un telefono, e il suo campo vuoto resta vuoto",
    );

    /* 14 — la riga di solo recapito, dagli stessi due lettori. */
    const atletaB = await creaAtleta("Dieci");
    await scrivi(atletaB, {
      id: randomUUID(),
      position: 0,
      first_name: "Estraneo",
      email: email("estraneo2"),
      contact_only: true,
      data: { fiscalCode: "CF-ESTRANEO" },
    });
    await tutori.refreshGuardianProjection(prisma, [atletaB]);

    const schedaB = await leggiScheda(atletaB);
    prova(
      "14a un recapito dichiarato non intesta niente",
      "",
      fiscale.resolveFiscalRecipient(schedaB).fiscalCode,
    );
    prova("14b e non riceve avvisi", [], promemoria.getGuardianRows(schedaB));
    prova("14c ne solleciti", [], recapiti.readAthleteGuardianContacts(schedaB));
  }

  /* =========================== 16 — la cancellazione di un'utenza */

  dice("16  revoca della tessera: nessun riferimento dangling");
  {
    const atleta = await creaAtleta("Undici");
    const riga = randomUUID();

    await scrivi(atleta, {
      id: riga,
      position: 0,
      first_name: "Madre",
      email: email("madre"),
      user_id: MADRE,
      identity_key: MADRE,
    });
    await tutori.refreshGuardianProjection(prisma, [atleta]);

    await tutori.revokeGuardianAccessInClub(prisma, {
      organizationId: CLUB,
      userId: MADRE,
      email: email("madre"),
    });

    const dopo = await prisma.athleteGuardian.findUnique({ where: { id: riga } });
    const scheda = await leggiScheda(atleta);

    prova("16a la riga perde l'utenza", null, dopo?.user_id);
    vero("16b e porta il marchio", dopo?.revoked_at);
    prova(
      "16c l'identita finisce nel registro derivato",
      true,
      (scheda?.data?.revokedGuardianIdentities ?? []).includes(MADRE),
    );
    prova("16d e nessun canale la nomina piu", [], promemoria.getGuardianRows(scheda));
    prova("16e ne i solleciti", [], recapiti.readAthleteGuardianContacts(scheda));
  }

  /* ================== 17 — salvataggio stantio contro revoca concorrente */

  dice("17  salvataggio stantio × revoca concorrente");
  {
    const atleta = await creaAtleta("Dodici");
    const madre = randomUUID();

    await scrivi(atleta, {
      id: madre,
      position: 0,
      first_name: "Madre",
      email: email("madre"),
      user_id: MADRE,
      identity_key: MADRE,
    });
    await tutori.refreshGuardianProjection(prisma, [atleta]);

    /* La segreteria legge la scheda **prima** della revoca. */
    const stantio = await voci(atleta);

    await tutori.revokeGuardianRow(prisma, {
      athleteId: atleta,
      guardianRowId: madre,
      organizationId: CLUB,
    });

    /* E la salva dopo, rimandando cio che aveva letto. */
    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atleta,
      canGrantAccess: true,
      rows: stantio.map((v) => ({
        rowId: v.id,
        email: v.email,
        firstName: v.name,
        extra: v,
      })),
    });

    const dopo = await prisma.athleteGuardian.findUnique({ where: { id: madre } });
    vero(
      "17a un salvataggio stantio non annulla una revoca",
      dopo?.revoked_at,
      "una riga revocata non si toglie e non si riapre da qui",
    );
    prova("17b e non riscrive l'utenza", null, dopo?.user_id);
  }

  /* ============================================= 18 — la concorrenza */

  dice("18  concorrenza: otto giri, nessun deadlock e nessuna revoca persa");
  {
    let deadlock = 0;
    let revochePerse = 0;
    let paganteInstabile = 0;
    let posizioneInstabile = 0;

    for (let giro = 0; giro < 8; giro += 1) {
      const atleta = await creaAtleta(`Concorrente${giro}`, {
        billingGuardianIndex: 0,
      });
      const madre = randomUUID();
      const padre = randomUUID();

      await scrivi(atleta, {
        id: madre,
        position: 0,
        first_name: "Madre",
        email: `madre.${giro}.${marchio}@consolidamento.test`,
        user_id: null,
        data: { fiscalCode: `CF-M-${giro}` },
      });
      await scrivi(atleta, {
        id: padre,
        position: 1,
        first_name: "Padre",
        email: `padre.${giro}.${marchio}@consolidamento.test`,
        data: { fiscalCode: `CF-P-${giro}` },
      });
      await tutori.refreshGuardianProjection(prisma, [atleta]);

      const letto = await voci(atleta);

      /* Revoca e salvataggio nello stesso istante, sulla stessa scheda. */
      const esiti = await Promise.allSettled([
        tutori.revokeGuardianRow(prisma, {
          athleteId: atleta,
          guardianRowId: padre,
          organizationId: CLUB,
        }),
        tutori.saveGuardianRegistry(prisma, {
          organizationId: CLUB,
          athleteId: atleta,
          canGrantAccess: true,
          rows: letto.map((v) => ({
            rowId: v.id,
            email: v.email,
            firstName: v.name,
            extra: v,
          })),
        }),
      ]);

      for (const esito of esiti) {
        const messaggio = String(esito.reason?.message || "");
        if (/deadlock/i.test(messaggio)) deadlock += 1;
      }

      const rigaPadre = await prisma.athleteGuardian.findUnique({
        where: { id: padre },
      });
      if (!rigaPadre?.revoked_at) revochePerse += 1;

      const scheda = await leggiScheda(atleta);
      const pagante = fiscale.resolveFiscalRecipient(scheda);
      if (pagante.fiscalCode !== `CF-M-${giro}`) paganteInstabile += 1;

      const rigaMadre = await prisma.athleteGuardian.findUnique({
        where: { id: madre },
      });
      if (Number(rigaMadre?.position) !== 0) posizioneInstabile += 1;
    }

    prova("18a nessun abbraccio mortale in otto giri", 0, deadlock);
    prova("18b nessuna revoca persa", 0, revochePerse);
    prova("18c il destinatario fiscale resta deterministico", 0, paganteInstabile);
    prova("18d e la posizione della riga viva non si muove", 0, posizioneInstabile);
  }

  /* ================ 19 — i reperti della revisione indipendente ============ */

  dice("19  i reperti della revisione post-consolidamento");
  {
    /* R1 — un invito coniato sulla chiave d'identita, non sull'id di riga. */
    const atleta = await creaAtleta("Reperti");
    const riga = randomUUID();
    await scrivi(atleta, {
      id: riga,
      position: 0,
      first_name: "Madre",
      email: email("madre"),
      identity_key: email("madre"),
    });
    await tutori.refreshGuardianProjection(prisma, [atleta]);

    const gettone = randomUUID();
    await prisma.clubResourceItem.create({
      data: {
        id: gettone,
        organization_id: CLUB,
        resource_type: "access_tokens",
        name: "REPERTO-1",
        status: "active",
        /* La maniglia e l'INDIRIZZO: la terza forma di `guardian_id`. */
        payload: {
          athlete_id: atleta,
          guardian_id: email("madre"),
          token_type: "parent_access",
        },
        updated_at: new Date(),
      },
    });

    /* La scheda deve vederlo: se non lo vede, non c'e porta da cui chiuderlo. */
    await tutori.refreshGuardianProjection(prisma, [atleta]);
    const vociPrima = await voci(atleta);
    prova(
      "19a la scheda vede un gettone coniato sull'indirizzo",
      gettone,
      vociPrima[0]?.parentAccessTokenRecordId ?? null,
    );

    await tutori.revokeGuardianRow(prisma, {
      athleteId: atleta,
      guardianRowId: riga,
      organizationId: CLUB,
    });

    prova(
      "19b e la revoca lo chiude: cio che chiude contiene cio che collega",
      "revoked",
      (await prisma.clubResourceItem.findUnique({ where: { id: gettone } }))?.status,
    );

    /*
      La guardia del riscatto risolve **ancora** quella riga — ed e giusto,
      perche un invito legittimo per una riga nascosta deve funzionare. Cio che
      chiude il rientro e lo stato del gettone, che la rotta rifiuta.
    */
    prova(
      "19c la riga resta risolvibile, ed e il gettone a essere chiuso",
      riga,
      (await tutori.findGuardianRow(prisma, atleta, email("madre")))?.id ?? null,
    );

    /* R2 — la guardia della concessione vede l'indirizzo anche con un userId. */
    const atletaB = await creaAtleta("RepertiB");
    let negato = null;
    try {
      await tutori.upsertGuardianFromFormApproval(prisma, {
        organizationId: CLUB,
        athleteId: atletaB,
        row: {
          userId: randomUUID(),
          email: email("madre"),
          firstName: "Intruso",
          extra: {},
        },
        contactOnly: false,
        canGrantAccess: false,
      });
    } catch (errore) {
      negato = String(errore?.message || "");
    }

    prova(
      "19d senza il permesso non si scrive l'indirizzo di un'utenza, nemmeno con un userId",
      true,
      Boolean(negato?.includes("Accesso negato")),
    );
    prova(
      "19e e nessuna riga e nata",
      0,
      await prisma.athleteGuardian.count({ where: { athlete_id: atletaB } }),
    );

    /* R3 — una riga di solo recapito che porta un'utenza non riceve. */
    const atletaC = await creaAtleta("RepertiC");
    await scrivi(atletaC, {
      position: 0,
      first_name: "Esclusa",
      email: email("madre"),
      identity_key: MADRE,
      user_id: MADRE,
      contact_only: true,
    });
    await tutori.refreshGuardianProjection(prisma, [atletaC]);
    const schedaC = await leggiScheda(atletaC);

    prova("19f un solo recapito con utenza non riceve promemoria", [],
      promemoria.getGuardianRows(schedaC));
    prova("19g ne solleciti", [], recapiti.readAthleteGuardianContacts(schedaC));

    /* R5 — tolta l'ultima riga, il blob storico non risuscita. */
    const atletaD = await creaAtleta("RepertiD", {
      parent1: { name: "Storica", email: email("madre"), linkedUserId: MADRE },
    });
    await scrivi(atletaD, {
      position: 0,
      first_name: "Viva",
      email: email("viva"),
      identity_key: email("viva"),
    });
    await tutori.refreshGuardianProjection(prisma, [atletaD]);

    await tutori.saveGuardianRegistry(prisma, {
      organizationId: CLUB,
      athleteId: atletaD,
      canGrantAccess: true,
      rows: [],
    });

    const schedaD = await leggiScheda(atletaD);
    prova("19h tolta l'ultima riga, l'autorita dice «nessuno»", [],
      schedaD?.data?.guardians ?? null);
    prova("19i e il blob storico non risuscita", [],
      promemoria.getGuardianRows(schedaD));
    prova("19j nemmeno per i solleciti", [],
      recapiti.readAthleteGuardianContacts(schedaD));

    /* R6 — un residuo dentro `data` non marca una riga viva. */
    const atletaE = await creaAtleta("RepertiE", { billingGuardianIndex: 0 });
    await scrivi(atletaE, {
      position: 0,
      first_name: "Vivo",
      email: email("vivo2"),
      identity_key: email("vivo2"),
      data: { fiscalCode: "CF-VIVO", revoked_at: "2020-01-01T00:00:00.000Z" },
    });
    await tutori.refreshGuardianProjection(prisma, [atletaE]);

    prova(
      "19k un residuo `revoked_at` non esclude un tutore vivo",
      "CF-VIVO",
      fiscale.resolveFiscalRecipient(await leggiScheda(atletaE)).fiscalCode,
    );
  }

  /* ------------------------------------------------------------- riepilogo */

  const ko = esiti.filter((e) => !e.ok);
  console.log("\n" + "=".repeat(72));
  console.log(`Esito: ${esiti.length - ko.length}/${esiti.length}`);
  if (ko.length) {
    console.log("\nRosse:");
    for (const voce of ko) console.log(`  ${voce.sezione} → ${voce.titolo}`);
  }
  console.log("=".repeat(72) + "\n");

  return ko.length;
};

const pulisci = async () => {
  const schede = await prisma.athlete.findMany({
    where: { organization_id: { in: [CLUB, CLUB_ALTRO] } },
    select: { id: true },
  });
  const identificativi = schede.map((s) => s.id);

  if (identificativi.length) {
    await prisma.athleteGuardian.deleteMany({
      where: { athlete_id: { in: identificativi } },
    }).catch(() => {});
    await prisma.$executeRawUnsafe(
      `DELETE FROM athlete_guardians WHERE athlete_id = ANY($1::uuid[])`,
      identificativi,
    ).catch(() => {});
  }

  await prisma.clubResourceItem.deleteMany({
    where: { organization_id: { in: [CLUB, CLUB_ALTRO] } },
  });
  await prisma.athlete.deleteMany({
    where: { organization_id: { in: [CLUB, CLUB_ALTRO] } },
  });
  await prisma.clubAccessScope.deleteMany({
    where: { organization_user: { organization_id: { in: [CLUB, CLUB_ALTRO] } } },
  }).catch(() => {});
  await prisma.organizationUser.deleteMany({
    where: { organization_id: { in: [CLUB, CLUB_ALTRO] } },
  });
  await prisma.club.deleteMany({ where: { id: { in: [CLUB, CLUB_ALTRO] } } });
  await prisma.user.deleteMany({
    where: { id: { in: [PRES, PRES_ALTRO, MADRE, PADRE] } },
  });
};

let uscita = 1;
try {
  uscita = (await main()) ? 1 : 0;
} catch (errore) {
  console.error("\nLa sonda si e interrotta:", errore);
  uscita = 1;
} finally {
  await pulisci().catch((errore) =>
    console.error("pulizia incompleta:", errore?.message),
  );
  await prisma.$disconnect();
}

process.exit(uscita);
