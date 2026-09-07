/**
 * **Diagnosi del travaso dei tutori. Legge e basta: non scrive niente.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * La revisione post-consolidamento ha trovato due difetti nella §3 della
 * migrazione `20260906180000_pp02_il_travaso_fondeva_due_persone`, che porta i
 * due registri di scheda dentro le righe. Le due `UPDATE` confrontano il
 * registro storico con `identity_key`, `user_id` **e `email`**:
 *
 * ```sql
 * WHERE lower(btrim(reg."valore")) IN (
 *   g."identity_key", COALESCE(g."user_id"::text,''), COALESCE(g."email",'')
 * )
 * ```
 *
 * L'indirizzo **non e unico per persona** — e il presupposto di ADR-0114 e la
 * ragione per cui `revokeGuardianAccessInClub` ha imparato a risparmiare la
 * riga che porta l'utenza di un altro (ADR-0139). Da li due esiti:
 *
 * 1. **il co-genitore revocato per indirizzo condiviso.** Madre e padre con un
 *    solo indirizzo di famiglia, la madre nel registro storico: il travaso
 *    marca **anche** la riga del padre, che ha la propria utenza. Nessuna
 *    schermata, nessun audit, nessuna revoca — il padre perde l'area famiglia
 *    al deploy;
 * 2. **la riga marcata che conserva l'utenza.** Le due `UPDATE` scrivono il
 *    marchio e **non** azzerano `user_id`, mentre `revokeGuardianRow` lo
 *    azzera sempre. Nasce cosi una coppia che il dominio non puo produrre —
 *    `contact_only`/`revoked_at` **con** `user_id` — e che per il contratto
 *    (49 §C) e una riga esclusa a tutti gli effetti.
 *
 * ## Cosa fa questo file
 *
 * Conta. Nient'altro: nessuna `UPDATE`, nessuna `DELETE`, nessuna transazione
 * di scrittura. Si puo eseguire su qualunque database, compreso quello di
 * produzione, perche non lo tocca.
 *
 * ```bash
 * node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *   scripts/pp-02-diagnosi-travaso.mjs
 * ```
 *
 * ## Come si legge l'esito
 *
 * L'impronta del travaso e `revoked_at IS NOT NULL AND user_id IS NOT NULL`
 * (oppure `contact_only`): **nessuna porta del prodotto la produce**, perche
 * ogni revoca azzera l'utenza e ogni riscatto toglie il solo-recapito. Una riga
 * cosi viene percio dalla migrazione.
 *
 * Un conteggio a zero non chiude il difetto — la logica resta sbagliata per
 * ogni scheda futura che venisse travasata — ma dice che **oggi nessuno lo sta
 * subendo**, che e cio che serve per decidere se la bonifica sia urgente.
 *
 * ## Cosa questo file NON fa, e perche
 *
 * Non ripara. La bonifica dovrebbe decidere, riga per riga, **quali revoche
 * fossero reali**, e quella distinzione il travaso l'ha gia persa: dopo la
 * migrazione la proiezione riscrive `revokedGuardianIdentities` dalle righe, e
 * il registro storico — l'unica prova di chi fosse davvero revocato — non c'e
 * piu. Serve il registro di audit e una decisione umana.
 *
 * E sarebbe comunque una scrittura di massa su un database di produzione, che
 * **richiede autorizzazione esplicita** (CLAUDE.md §8).
 */

import { PrismaClient } from "@prisma/client";

/**
 * **Quale database si sta leggendo, e detto ad alta voce.**
 *
 * Una diagnosi che non dichiara su cosa ha girato e una diagnosi su cui non si
 * puo decidere. `DIAGNOSI_DATABASE_URL` la punta altrove senza toccare `.env`:
 * e la difesa contro l'errore n. 7 di CLAUDE.md — «eseguire un comando
 * credendo di essere su un DB locale» — al rovescio, cioe credere di essere
 * altrove e leggere invece il proprio.
 */
const URL_SCELTA = String(
  process.env.DIAGNOSI_DATABASE_URL || process.env.DATABASE_URL || "",
).trim();

if (!URL_SCELTA) {
  console.error(
    "Nessuna connection string: DIAGNOSI_DATABASE_URL o DATABASE_URL.",
  );
  process.exit(1);
}

/** L'indirizzo senza credenziali: host, porta e database. */
const senzaSegreti = (url) => {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(connection string non interpretabile)";
  }
};

/**
 * **Sola lettura imposta dal server, non promessa dal codice.**
 *
 * `default_transaction_read_only=on` viaggia nei parametri di connessione:
 * PostgreSQL rifiuta **qualunque** scrittura su questa connessione, anche se
 * qualcuno domani aggiungesse una query sbagliata a questo file. Una garanzia
 * che dipende dal fatto che io abbia letto bene il codice non e una garanzia.
 *
 * Il pooler potrebbe non passarlo: in quel caso resta il vaglio qui sotto, che
 * rifiuta ogni istruzione che non cominci per `SELECT`, e l'esito lo dichiara.
 */
const conUrlDiSolaLettura = (url) => {
  try {
    const u = new URL(url);
    u.searchParams.set("options", "-c default_transaction_read_only=on");
    return u.toString();
  } catch {
    return url;
  }
};

/**
 * **Il pooler non passa `options`, l'endpoint diretto si.**
 *
 * Su Neon la connection string dell'applicazione punta al **pooler**, che
 * rifiuta la connessione se le si aggiunge `options` — quindi non si puo
 * imporre la sola lettura da li. L'endpoint diretto (`DIRECT_URL`, lo stesso
 * database senza `-pooler` nel nome) la accetta: verificato,
 * `transaction_read_only = on`.
 *
 * Si tenta percio con il vincolo e si ripiega senza, dicendo quale delle due
 * ha funzionato. Ripiegare **in silenzio** su una garanzia piu debole sarebbe
 * la forma di difetto che questo pacchetto ha passato quindici tornate a
 * togliere.
 */
const apri = async () => {
  const conVincolo = new PrismaClient({
    datasources: { db: { url: conUrlDiSolaLettura(URL_SCELTA) } },
  });

  try {
    await conVincolo.$queryRawUnsafe("SELECT 1");
    return { client: conVincolo, imposta: true };
  } catch {
    await conVincolo.$disconnect().catch(() => {});
  }

  return {
    client: new PrismaClient({ datasources: { db: { url: URL_SCELTA } } }),
    imposta: false,
  };
};

const { client: prisma, imposta: VINCOLO_DAL_SERVER } = await apri();

/**
 * **Il vaglio: qui passa solo cio che comincia per `SELECT`.**
 *
 * `$queryRawUnsafe` esegue quello che gli si da. Le istruzioni di questo file
 * sono tutte letture, ma «sono tutte letture» e un'affermazione su un testo, e
 * questo pacchetto ha imparato che un'affermazione su un testo non e una
 * difesa. Il vaglio la rende una proprieta del codice.
 */
const soloLettura = (sql) => {
  const pulita = sql.trim().replace(/^\(+/, "").trimStart();
  if (!/^SELECT\b/i.test(pulita)) {
    throw new Error(
      `Questa sonda legge e basta: rifiutata un'istruzione che non e una SELECT.\n${sql.slice(0, 120)}`,
    );
  }
  return sql;
};

const conta = async (sql) =>
  Number((await prisma.$queryRawUnsafe(soloLettura(sql)))[0]?.c ?? 0);

const righe = async (sql) => prisma.$queryRawUnsafe(soloLettura(sql));

const riga = (etichetta, valore, allarme) =>
  console.log(
    `  ${String(valore).padStart(8)}  ${etichetta}${allarme && valore > 0 ? "   <<< da guardare" : ""}`,
  );

const main = async () => {
  console.log("\n=== DIAGNOSI DEL TRAVASO DEI TUTORI (sola lettura) ===\n");
  console.log(`  database : ${senzaSegreti(URL_SCELTA)}`);

  /* Se il server ha accettato il vincolo, lo dice lui — non lo diciamo noi. */
  const [{ ro }] = await righe(
    `SELECT current_setting('transaction_read_only') AS ro`,
  );
  console.log(
    `  lettura  : ${
      String(ro) === "on"
        ? "imposta dal server (transaction_read_only = on)"
        : "solo il vaglio del codice — il pooler non passa `options`; " +
          "per il vincolo dal server usa l'endpoint diretto (DIRECT_URL)"
    }`,
  );
  if (String(ro) === "on" && !VINCOLO_DAL_SERVER) {
    console.log("  (nota: vincolo attivo ma non richiesto da questa sonda)");
  }
  console.log("");

  const totali = await conta(`SELECT count(*)::int c FROM athlete_guardians`);
  const revocate = await conta(
    `SELECT count(*)::int c FROM athlete_guardians WHERE revoked_at IS NOT NULL`,
  );
  const soloRecapito = await conta(
    `SELECT count(*)::int c FROM athlete_guardians WHERE contact_only = true`,
  );

  console.log("  L'archivio\n");
  riga("righe di tutore", totali);
  riga("di cui revocate", revocate);
  riga("di cui di solo recapito", soloRecapito);

  console.log("\n  L'impronta del travaso: un marchio che convive con un'utenza\n");
  console.log(
    "  Nessuna porta del prodotto la produce: ogni revoca azzera `user_id`,\n" +
      "  e ogni riscatto toglie il solo-recapito. Vengono dalla migrazione.\n",
  );

  const revocateConUtenza = await conta(
    `SELECT count(*)::int c FROM athlete_guardians
      WHERE revoked_at IS NOT NULL AND user_id IS NOT NULL`,
  );
  const recapitoConUtenza = await conta(
    `SELECT count(*)::int c FROM athlete_guardians
      WHERE contact_only = true AND user_id IS NOT NULL`,
  );

  riga("righe revocate che conservano l'utenza", revocateConUtenza, true);
  riga("righe di solo recapito che conservano l'utenza", recapitoConUtenza, true);

  console.log("\n  La configurazione che il difetto colpisce\n");
  console.log(
    "  Due righe della stessa scheda con lo stesso indirizzo: e ADR-0114,\n" +
      "  madre e padre con un solo indirizzo di famiglia. La revoca di una\n" +
      "  metteva quell'indirizzo nel registro, e il travaso marcava l'altra.\n",
  );

  const indirizziCondivisi = await conta(
    `SELECT count(*)::int c FROM (
       SELECT athlete_id, lower(btrim(email)) AS e
       FROM athlete_guardians
       WHERE email IS NOT NULL AND btrim(email) <> ''
       GROUP BY 1, 2 HAVING count(*) > 1
     ) x`,
  );

  /*
    Il sospetto forte: due righe con lo stesso indirizzo sulla stessa scheda,
    **entrambe** marcate, e una delle due con un'utenza propria. E la forma
    esatta del co-genitore travolto dalla revoca dell'altro.
  */
  const sospette = await conta(
    `SELECT count(*)::int c FROM athlete_guardians g
      WHERE g.revoked_at IS NOT NULL
        AND g.user_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM athlete_guardians h
           WHERE h.athlete_id = g.athlete_id
             AND h.id <> g.id
             AND lower(btrim(h.email)) = lower(btrim(g.email))
             AND h.revoked_at IS NOT NULL
        )`,
  );

  riga("indirizzi condivisi fra righe della stessa scheda", indirizziCondivisi);
  riga("righe che sembrano co-genitori travolti", sospette, true);

  console.log("\n  I residui di sicurezza dentro `data`\n");
  console.log(
    "  La proiezione li toglie in lettura, quindi non decidono piu niente.\n" +
      "  Restano in archivio finche quella scheda non viene risalvata.\n",
  );

  const residui = await conta(
    `SELECT count(*)::int c FROM athlete_guardians
      WHERE data ?| array['revoked_at','revokedAt','accessRevokedAt','access_revoked_at',
                          'contact_only','contactOnly','user_id','identity_key','escluseDietro']`,
  );
  riga("righe con metadati di sicurezza nel residuo", residui);

  const allarmi = revocateConUtenza + recapitoConUtenza + sospette;

  /*
    **Per club, perche la decisione e per club.** Un pilota si chiude o si
    rimanda guardando le proprie righe, non un totale che le mescola a quelle
    di chiunque altro.
  */
  const perClub = await righe(
    `SELECT c."name" AS club,
            count(*) FILTER (WHERE g."id" IS NOT NULL)::int AS righe,
            count(*) FILTER (WHERE g."revoked_at" IS NOT NULL)::int AS revocate,
            count(*) FILTER (WHERE g."contact_only" = true)::int AS recapiti,
            count(*) FILTER (
              WHERE (g."revoked_at" IS NOT NULL OR g."contact_only" = true)
                AND g."user_id" IS NOT NULL
            )::int AS impronta
       FROM "clubs" c
       JOIN "athlete_guardians" g ON g."organization_id" = c."id"
      GROUP BY c."name"
      ORDER BY impronta DESC, righe DESC`,
  );

  if (perClub.length) {
    console.log("\n  Per club\n");
    console.log(
      "    " +
        "CLUB".padEnd(34) +
        "RIGHE".padStart(7) +
        "REVOC.".padStart(8) +
        "RECAP.".padStart(8) +
        "IMPRONTA".padStart(10),
    );
    for (const r of perClub) {
      console.log(
        "    " +
          String(r.club ?? "—").slice(0, 33).padEnd(34) +
          String(r.righe).padStart(7) +
          String(r.revocate).padStart(8) +
          String(r.recapiti).padStart(8) +
          String(r.impronta).padStart(10) +
          (Number(r.impronta) > 0 ? "   <<<" : ""),
      );
    }
  }

  console.log("\n" + "=".repeat(70));
  if (allarmi === 0) {
    console.log(
      "Nessuna riga porta l'impronta del travaso.\n" +
        "La logica della migrazione resta sbagliata per ogni scheda che venisse\n" +
        "travasata da qui in avanti, ma **oggi nessuno la sta subendo**.",
    );
  } else {
    console.log(
      `${allarmi} righe portano l'impronta del travaso.\n` +
        "Vanno guardate una per una con il registro di audit: la bonifica deve\n" +
        "decidere quali revoche fossero reali, e il travaso ha gia perso quella\n" +
        "distinzione. Vedi 16-technical-debt.md §D-PP02-A.",
    );
  }
  console.log("=".repeat(70) + "\n");

  return allarmi;
};

try {
  await main();
} catch (errore) {
  console.error("La diagnosi si e interrotta:", errore?.message || errore);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
