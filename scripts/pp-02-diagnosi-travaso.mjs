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

const prisma = new PrismaClient();

const conta = async (sql) => Number((await prisma.$queryRawUnsafe(sql))[0]?.c ?? 0);

const riga = (etichetta, valore, allarme) =>
  console.log(
    `  ${String(valore).padStart(8)}  ${etichetta}${allarme && valore > 0 ? "   <<< da guardare" : ""}`,
  );

const main = async () => {
  console.log("\n=== DIAGNOSI DEL TRAVASO DEI TUTORI (sola lettura) ===\n");

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
