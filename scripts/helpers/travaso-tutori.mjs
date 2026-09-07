/**
 * **Il travaso dei tutori, per le sonde.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * Le sonde di questo repository seminano un club e poi lo interrogano dalle
 * porte vere. I tutori li scrivevano dentro `athletes.data.guardians[]`, che
 * fino a WP-B era l'archivio; dopo WP-C e una **proiezione**, e l'autorita e
 * `athlete_guardians`.
 *
 * Una sonda che seminasse solo il blob misurerebbe percio un club **senza
 * tutori** — e direbbe che l'area famiglia non si apre, che e vero e non e il
 * difetto che sta cercando. Il modo peggiore in cui una prova possa fallire.
 *
 * ## Perche riesegue la migrazione invece di scrivere le righe
 *
 * Perche e cio che succede davvero: un ambiente che riceve questo codice
 * applica la migrazione, e da quel momento le sue schede storiche hanno le
 * righe. Riprodurre quel passaggio significa misurare **lo stato in cui il
 * prodotto si trovera**, invece di uno stato costruito a mano che potrebbe
 * essere piu ordinato del vero.
 *
 * L'`INSERT ... SELECT` si legge dal file della migrazione e si esegue tale e
 * quale: se questo modulo ne riscrivesse una versione propria, misurerebbe la
 * versione propria.
 *
 * ## L'unica cosa che cambia
 *
 * Un `AND` in coda al `WHERE` che gia c'e, per restringere ai club della sonda:
 * la migrazione gira una volta su tutto l'archivio, qui deve girare sulle
 * schede appena create e non su quelle che il travaso vero ha gia portato —
 * altrimenti cadrebbe sulla chiave unica.
 */

import { readFileSync, readdirSync } from "node:fs";

/**
 * **L'ultima migrazione che contiene il travaso, non una scritta a mano.**
 *
 * Il travaso e stato rifatto due volte — la prima perdeva quattro identita e
 * ne inventava quattro, la seconda fondeva due genitori con un indirizzo di
 * famiglia — e ogni volta le sonde che puntavano alla vecchia hanno continuato
 * a misurare la vecchia, verdi, mentre il prodotto era cambiato sotto.
 *
 * Si cerca percio **l'ultima** migrazione che porti un `INSERT INTO
 * "athlete_guardians"`, che e quella che un archivio nuovo esegue per ultima e
 * quindi lo stato in cui ogni ambiente si trova. Rifarlo a mano ogni volta e
 * la stessa forma di errore che questo pacchetto ha passato ventotto round a
 * togliere: un riferimento scritto a mano che invecchia.
 */
const FILE = (() => {
  const radice = "prisma/migrations";
  const candidate = readdirSync(radice)
    .filter((nome) => /^\d{14}_/.test(nome))
    .sort()
    .reverse()
    .map((nome) => `${radice}/${nome}/migration.sql`)
    .filter((percorso) => {
      try {
        return readFileSync(percorso, "utf8").includes('INSERT INTO "athlete_guardians"');
      } catch {
        return false;
      }
    });

  if (!candidate.length) {
    throw new Error("Nessuna migrazione con il travaso dei tutori");
  }
  return candidate[0];
})();

/**
 * Le istruzioni del travaso, ristrette a un insieme di club.
 *
 * Si tengono solo `INSERT` e `UPDATE` su `athlete_guardians`: la `DELETE` che
 * apre la migrazione svuoterebbe la tabella intera, e `ALTER` e
 * `CREATE INDEX` sono gia stati applicati.
 */
export const istruzioniDelTravaso = (organizationIds) => {
  const club = [...new Set(organizationIds.filter(Boolean))];
  if (!club.length) return [];

  const elenco = club.map((id) => `'${id}'::uuid`).join(", ");

  const senzaCommenti = readFileSync(FILE, "utf8")
    .split("\n")
    .filter((riga) => !riga.trimStart().startsWith("--"))
    .join("\n");

  return senzaCommenti
    .split(";")
    .map((istruzione) => istruzione.trim())
    .filter(
      (istruzione) =>
        istruzione.startsWith('INSERT INTO "athlete_guardians"') ||
        istruzione.startsWith('UPDATE "athlete_guardians"'),
    )
    .map((istruzione) =>
      istruzione
        .replace(
          `WHERE jsonb_typeof(a."data") = 'object'`,
          `WHERE a."organization_id" IN (${elenco})\n    AND jsonb_typeof(a."data") = 'object'`,
        )
        .replace(
          `WHERE a."id" = g."athlete_id"`,
          `WHERE g."organization_id" IN (${elenco})\n  AND a."id" = g."athlete_id"`,
        ),
    );
};

/**
 * Esegue il travaso sui club indicati.
 *
 * La transazione dichiara il permesso di scrivere i tutori, che e la sola
 * forma che l'archivio accetta: il vaglio non conosce eccezioni implicite, e
 * una sonda non e un'eccezione — e uno scrittore che si dichiara.
 */
export const travasaTutori = async (prisma, organizationIds) => {
  const istruzioni = istruzioniDelTravaso(organizationIds);
  if (!istruzioni.length) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL "easygame.guardian_writer" = 'on'`);
    for (const istruzione of istruzioni) {
      await tx.$executeRawUnsafe(istruzione);
    }
  });

  return istruzioni.length;
};
