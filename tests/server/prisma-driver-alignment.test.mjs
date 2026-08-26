import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * **L'adapter del driver e il client Prisma devono essere della stessa
 * generazione.**
 *
 * Il difetto trovato nel Blocco E caricando un file davvero. Il repository
 * aveva `@prisma/client` 6 e `@prisma/adapter-pg` 7: la maggior parte delle
 * query funzionava — testo, numeri, JSON, date — e **le sole colonne `Bytes`
 * no**. `attachmentBlob.upsert` rispondeva
 * `JS functions cannot be represented as a serde_json::Value`, cioe nessun
 * allegato poteva essere salvato: documenti dell'atleta, contratti e visite
 * dell'allenatore, certificati, allegati dei moduli pubblici.
 *
 * **Perche nessun test lo vedeva.** I test del servizio allegati sostituiscono
 * il client Prisma con un doppio: verificano il dominio — permessi, checksum,
 * nome del file, il fatto che il binario non stia nel record — e non toccano
 * mai il driver. E la scelta giusta per quei test, e lascia scoperta
 * **esattamente** questa classe di difetti: quelli che vivono nel confine fra
 * il client e il database.
 *
 * Questo test non prova a caricare un file: prova che le due dipendenze non
 * possano tornare a divergere in silenzio, che e la causa, non il sintomo.
 */

const leggi = (relativo) =>
  JSON.parse(readFileSync(path.join(process.cwd(), relativo), "utf8"));

/** «^6.19.2» → «6». Serve la generazione, non la versione esatta. */
const generazione = (intervallo) => {
  const match = String(intervallo).match(/(\d+)\./);
  assert.ok(match, `intervallo di versione non riconosciuto: ${intervallo}`);
  return match[1];
};

test("l'adapter PostgreSQL segue la generazione del client Prisma", () => {
  const { dependencies, devDependencies } = leggi("package.json");

  const client = dependencies["@prisma/client"];
  const adapter = dependencies["@prisma/adapter-pg"];
  const cli = devDependencies["prisma"];

  assert.ok(client, "manca @prisma/client");
  assert.ok(adapter, "manca @prisma/adapter-pg");

  assert.equal(
    generazione(adapter),
    generazione(client),
    "un adapter di una generazione diversa rompe le colonne Bytes senza rompere le altre",
  );

  assert.equal(
    generazione(cli),
    generazione(client),
    "la CLI che genera lo schema deve essere della stessa generazione del client che lo usa",
  );
});

test("quello che c'e in node_modules e quello che dichiara package.json", () => {
  /*
    L'intervallo `^7.8.0` in `package.json` e cio che era **installato** erano
    coerenti fra loro: il disallineamento era con il client. Qui si verifica
    che l'installazione non sia scivolata altrove per conto suo, che e il modo
    in cui un `npm install` distratto rimette il difetto senza toccare nessun
    file tracciato.
  */
  const dichiarato = leggi("package.json").dependencies["@prisma/adapter-pg"];
  const installato = leggi("node_modules/@prisma/adapter-pg/package.json").version;
  const client = leggi("node_modules/@prisma/client/package.json").version;

  assert.equal(
    generazione(installato),
    generazione(client),
    `installati: adapter ${installato}, client ${client}`,
  );
  assert.equal(generazione(installato), generazione(dichiarato));
});

test("il pool si costruisce con una configurazione, non con una stringa", () => {
  /*
    La firma dell'adapter 6 accetta un `pg.Pool` o la sua configurazione. La
    stringa di connessione, che era la firma della 7, con la 6 fallisce a
    tempo di esecuzione dentro `pg-pool` e non a compilazione: e un errore che
    si vede solo alla prima query.
  */
  const source = readFileSync(
    path.join(process.cwd(), "src/lib/server/prisma.ts"),
    "utf8",
  );

  assert.match(source, /new Pool\(\{ connectionString: databaseUrl \}\)/);
  assert.match(source, /new PrismaPg\(pool/);
});
