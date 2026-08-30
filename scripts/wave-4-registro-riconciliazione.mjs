/**
 * **La vista e la sua dichiarazione dicono la stessa cosa?**
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wave-4-registro-riconciliazione.mjs
 *
 * ---
 *
 * ## Perche questa sonda esiste
 *
 * Il registro di prima nota e scritto **due volte**:
 *
 * | Dove | Cosa fa |
 * |---|---|
 * | `prisma/migrations/20260830090000_wave4_registro_unico` | lo **esegue**, in SQL, ed e cio che la produzione usa |
 * | `src/lib/accounting/ledger-view.ts` | lo **dichiara**, in TypeScript, ed e cio che i test leggono |
 *
 * Due scritture della stessa regola sono due contabilita, a meno che qualcuno
 * provi che coincidono. Questo script e quel qualcuno, e lo fa nell'unico modo
 * che conta: contro **Postgres vero**, riga per riga, campo per campo.
 *
 * Senza, i tremila test verdi proverebbero soltanto che la dichiarazione e
 * coerente con se stessa — ed e esattamente il modo in cui questa Wave ha gia
 * nascosto, piu di una volta, difetti che il database avrebbe rifiutato.
 *
 * ## Cosa semina, e cosa cerca
 *
 * Un club dedicato con almeno un caso per ogni ramo della vista, e in
 * particolare quelli dove le due scritture potrebbero divergere: uno storno,
 * un rimborso, un compenso a netto zero, una liquidazione stornata, un
 * movimento storico nel blob, un documento annullato, un importo con la
 * frazione a mezzo centesimo.
 *
 * Il club viene cancellato alla fine.
 *
 * **Gira solo su un database di sviluppo.**
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { buildLedgerView } from "../src/lib/accounting/ledger-view.ts";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();

const CLUB = randomUUID();
const CASSA = randomUUID();
const BANCA = randomUUID();
const CAUSALE = randomUUID();
const ATLETA = randomUUID();
const PERSONA = randomUUID();
const PROGRAMMA = randomUUID();
const INCASSO = randomUUID();
const RIMBORSO = randomUUID();
const STORNATO = randomUUID();
const STORNO = randomUUID();
const RICEVUTA = randomUUID();
const RICEVUTA_ANNULLATA = randomUUID();
const INCASSO_ANNULLATO = randomUUID();
const COMPENSO = randomUUID();
const COMPENSO_ZERO = randomUUID();
const LIQUIDAZIONE = randomUUID();
const STORNO_LIQUIDAZIONE = randomUUID();
const MOVIMENTO = randomUUID();
const GIROCONTO_A = randomUUID();
const GIROCONTO_B = randomUUID();
const GRUPPO = randomUUID();

const d = (s) => new Date(s);

/**
 * **Una matrice generata, perche un elenco scritto a mano sceglie i casi che
 * gia funzionano.**
 *
 * Le prime versioni di questa sonda seminavano venticinque righe scelte una a
 * una. Una revisione ostile con mille righe ne ha trovate **551 divergenti** —
 * e ha mostrato la ragione: in ogni classe di difetto, il valore scritto a
 * mano era il fratello che per caso andava d'accordo. `0x1f` si, `-0x10` no.
 * `.9999` si, `.0004999` no. `{}` si, `{"a":"x,y"}` no.
 *
 * Un elenco compilato da chi ha appena corretto il difetto tende a contenere
 * cio che quella correzione gestisce. La matrice si genera invece
 * **combinando**: forme di data per fusi, per frazioni, per epoche; forme di
 * numero per basi e per spaziature; valori JSON che non sono stringhe. Nessuno
 * l'ha scelta perche passasse.
 */
const matriceOstile = () => {
  const righe = [];
  let n = 0;
  const aggiungi = (campi) => {
    righe.push({ id: `gen-${n}`, amount: 100 + (n % 7), date: "2026-03-09", ...campi });
    n += 1;
  };

  /* --- le date: giorno × ora × frazione × fuso × epoca --- */
  const giorni = ["2026-03-09", "2026-02-28", "2026-02-29", "2026-12-31", "9999-12-31", "0001-01-01", "1999-12-31", "2000-01-01"];
  const ore = ["", "T00:00", "T12:00", "T23:59", "T23:59:59", "T24:00", "T23:59:60"];
  /* Le lunghezze al confine del buffer del parser di Postgres, misurate. */
  const lunghe = [122, 123, 124, 129, 130, 131, 140].map((n) => "." + "1".repeat(n));
  const frazioni = [...lunghe, "", ".5", ".05", ".005", ".0005", ".0015", ".0025", ".9995", ".9996", ".9999", ".0004999", ".1234999", ".99949999"];
  const fusi = ["", "Z", "+00:00", "+02:00", "-05:00", "+05:45", "+14:00", "+15:00", "+16:00", "-23:00", "+02:99", "+0230"];

  for (const giorno of giorni) {
    for (const ora of ore) {
      aggiungi({ date: `${giorno}${ora}` });
      if (!ora) continue;
      for (const frazione of frazioni) {
        if (!frazione) continue;
        if (!/:\d{2}:\d{2}$/.test(ora)) continue;
        aggiungi({ date: `${giorno}${ora}${frazione}` });
        for (const fuso of fusi) {
          if (!fuso) continue;
          aggiungi({ date: `${giorno}${ora}${frazione}${fuso}` });
        }
      }
      for (const fuso of fusi) {
        if (!fuso) continue;
        aggiungi({ date: `${giorno}${ora}${fuso}` });
      }
    }
  }

  /* --- le date che non sono stringhe, o non sono date --- */
  for (const data of [
    null, true, false, 0, 1, [], {}, ["2026-01-01"], ["2026-01-01T00:00:00Z"],
    { toString: 1 }, { toString: "x" }, { valueOf: null }, [[]], [{}],
    "now", "today", "epoch", "infinity", "-infinity", "09/03/2026", "2026-3-9",
    "2026-03-09 ", " 2026-03-09", "2026-03-09\t", "\t2026-03-09", "2026-03-09\u00a0",
    "", "   ", "0000-01-01", "10000-01-01", "2026-13-01", "2026-00-01", "2026-01-32",
  ]) {
    aggiungi({ date: data });
    aggiungi({ date: undefined, created_at: data, description: "solo created_at" });
  }

  /* --- gli importi --- */
  for (const importo of [
    0, 1, -1, 0.005, -0.005, 0.004, 100, 1e6, 21474836.47, 21474836.48, 21474836.475,
    1e15, -1e15, Infinity, -Infinity, NaN, true, false, null, [], {}, [5], [[5]],
    "5", " 5", "5 ", "\t5", "5\t", "\n5", "5\n", "\r5", "\v5", "5\f", "\u00a05",
    "0x10", "0X10", "-0x10", "+0x10", "0x1f", "0x1p4", "0X1P4", "0b101", "0o17",
    "1e3", "1E3", "1e-3", "-1e3", "+1e3", ".5", "5.", "5.5.5", "1,5", "1.234,56",
    "Infinity", "-Infinity", "NaN", "nan", "inf", "", "   ", "abc", "1abc",
  ]) {
    aggiungi({ amount: importo, description: "importo generato" });
  }

  /* --- il verso, e i testi --- */
  for (const tipo of ["", " ", "income", "expense", "uscita", "out", "IN", "Expense", null, false, 0, {}, []]) {
    aggiungi({ type: tipo, direction: "expense", description: "verso generato" });
  }
  for (const testo of [
    "", " ", "  ", "\t", "\n", "\u00a0", "\ufeff", "normale", " con spazi ",
    "\tcon tabulazione", 0, 1, true, false, null, [], {}, [1, 2], { a: 1 },
    { a: "x,y" }, ["a,b"], { nested: { deep: [1, { k: "v,w" }] } }, 1e21, 1e-7,
    "a".repeat(3000),
  ]) {
    aggiungi({ description: testo, title: "titolo di ripiego" });
    aggiungi({ description: "descrizione", paymentMethod: testo });
    aggiungi({ description: "descrizione", id: testo });
  }

  return righe;
};

const semina = async () => {
  const utente = await prisma.user.findFirst();
  if (!utente) throw new Error("Nessun utente nel database di sviluppo");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `riconciliazione-registro-${Date.now()}`,
      name: "ASD Riconciliazione Registro",
      creator_id: utente.id,
      /* Il blob storico: due movimenti e un giroconto. */
      transactions: [
        ...matriceOstile(),
        {
          id: "st-1",
          date: "2026-03-01T00:00:00.000Z",
          amount: 123.45,
          type: "income",
          description: "Storico in entrata",
          paymentMethod: "Contanti",
        },
        {
          id: "st-2",
          date: "2026-03-02T00:00:00.000Z",
          amount: 77.7,
          type: "expense",
          title: "Storico in uscita",
        },
        /* Senza data: non deve comparire da nessuna delle due parti. */
        { id: "st-3", amount: 10, type: "income", description: "Senza data" },
        /* Importo zero: idem. */
        { id: "st-4", date: "2026-03-03T00:00:00.000Z", amount: 0, description: "Zero" },
        /*
          **Le righe sporche, che erano il difetto piu grave della Wave.**

          Una revisione ostile ha mostrato che un solo `amount` in notazione
          italiana, o una data che non esiste, faceva fallire **l'intera query**
          della vista: da quel momento, per quel club, non funzionavano piu
          prima nota, rendiconto, export e saldi. Il gemello in TypeScript
          degradava con grazia, quindi le due scritture della stessa regola non
          coincidevano — e questa sonda non lo vedeva, perche non seminava
          niente di sporco.

          Adesso lo semina. Nessuna di queste righe deve comparire, e nessuna
          deve far cadere la lettura.
        */
        { id: "sp-1", date: "2026-03-05T00:00:00.000Z", amount: "1.234,56", description: "Importo italiano" },
        { id: "sp-2", date: "2026-02-31", amount: 10, description: "Trentuno febbraio" },
        { id: "sp-3", date: "2026-03-01xyz", amount: 10, description: "Data con la coda" },
        { id: "sp-4", date: {}, amount: 10, description: "Data che e un oggetto" },
        { id: "sp-5", date: "2026-03-06T00:00:00.000Z", amount: null, description: "Importo assente" },
        /*
          **Due righe con lo stesso `id`.** Producevano due righe del registro
          con lo stesso identificativo, e l'ordine del registro lo usa come
          criterio di spareggio: la pagina 2 poteva ripetere righe della 1.
        */
        { id: "st-1", date: "2026-03-07T00:00:00.000Z", amount: 11, description: "Id ripetuto" },
        /*
          Solo `created_at`: la dichiarazione la leggeva, l'SQL no, e la riga
          spariva da una lettura e non dall'altra.
        */
        { id: "sp-6", created_at: "2026-03-08T00:00:00.000Z", amount: 7.77, description: "Solo created_at" },
        /*
          **I casi che facevano cadere la vista un centesimo piu in la.**

          I due `try-cast` intercettavano il fallimento della conversione, non
          il `::int` che veniva dopo: oltre 21.474.836,47 euro i centesimi non
          entrano in un intero e Postgres alza, portandosi via l'intera query.
          NaN e gli infiniti passano volentieri per `double precision` e
          muoiono allo stesso modo, e `'infinity'` come data moriva sull'anno.
        */
        { id: "sc-1", date: "2026-03-09T00:00:00.000Z", amount: 999999999999, description: "Fuori scala" },
        { id: "sc-2", date: "2026-03-09T00:00:00.000Z", amount: 1e15, description: "Fuori scala grande" },
        { id: "sc-3", date: "2026-03-09T00:00:00.000Z", amount: -1e15, description: "Fuori scala negativo" },
        { id: "sc-4", date: "2026-03-09T00:00:00.000Z", amount: "Infinity", description: "Infinito" },
        { id: "sc-5", date: "2026-03-09T00:00:00.000Z", amount: "NaN", description: "Non un numero" },
        { id: "sc-6", date: "2026-03-09T00:00:00.000Z", amount: " 1e400", description: "Overflow di testo" },
        { id: "sc-7", date: "infinity", amount: 10, description: "Data infinita" },
        /*
          **Cio che le due letture leggevano diverso.** Postgres risolve le
          parole del tempo e legge `09/03/2026` come il 3 settembre; JavaScript
          non le risolve e lo legge come il 9 marzo. Un giorno di scarto a
          cavallo di dicembre e un anno fiscale sbagliato.
        */
        { id: "sc-8", date: "now", amount: 10, description: "La parola adesso" },
        { id: "sc-9", date: "today", amount: 10, description: "La parola oggi" },
        { id: "sc-10", date: "epoch", amount: 10, description: "La parola epoca" },
        { id: "sc-11", date: "09/03/2026", amount: 10, description: "Data all'americana" },
        { id: "sc-12", date: "2026-03-09T12:00:00+02:00", amount: 13, description: "Data con fuso" },
        /*
          `COALESCE` sceglieva fra i due valori **grezzi**: una data sporca ma
          presente vinceva su un `created_at` buono, e la riga usciva da una
          lettura e non dall'altra.
        */
        { id: "sc-13", date: "sporca", created_at: "2026-04-01T00:00:00.000Z", amount: 21, description: "Ripiego sul created_at" },
        /* Un booleano vale 1 per JavaScript e non e un numero per Postgres. */
        { id: "sc-14", date: "2026-03-09T00:00:00.000Z", amount: true, description: "Importo booleano" },
        { id: "sc-15", date: "2026-03-09T00:00:00.000Z", amount: [5], description: "Importo in lista" },
        /*
          **Le date che le due letture leggevano ancora diverse**, trovate da
          una revisione di conferma con centodieci valori ostili invece dei
          ventidue di prima.

          *Gli offset che attraversano la mezzanotte.* Il controllo «il giorno
          scritto dev'essere il giorno letto» — che esiste per il 31 febbraio —
          veniva fatto **dopo** aver applicato il fuso, e rifiutava quindi ogni
          data valida che in UTC cade il giorno prima o dopo. La prima di
          queste finisce per giunta in un **anno fiscale** diverso.
        */
        { id: "fz-1", date: "2026-01-01T00:30:00+02:00", amount: 31, description: "Offset oltre la mezzanotte" },
        { id: "fz-2", date: "2026-12-31T23:00:00-05:00", amount: 32, description: "Offset a fine anno" },
        { id: "fz-3", date: "2026-03-09T12:00:00+14:00", amount: 33, description: "Offset estremo avanti" },
        { id: "fz-4", date: "2026-03-09T12:00:00-12:00", amount: 34, description: "Offset estremo indietro" },
        /*
          *L'ora da muro senza fuso.* Postgres la legge com'e scritta;
          `new Date("2026-03-09T12:00")` la legge **in ora locale**. Le due
          letture divergevano di un'ora su ogni macchina che non sta a
          Greenwich, e la sonda dava percio un verdetto diverso a seconda di
          dove la si eseguiva.
        */
        { id: "fz-5", date: "2026-03-09T12:00", amount: 35, description: "Ora da muro senza fuso" },
        { id: "fz-6", date: "2026-03-09 12:00:00", amount: 36, description: "Ora da muro con lo spazio" },
        { id: "fz-7", date: "2026-12-31T23:30:00", amount: 37, description: "Ora da muro a fine anno" },
        { id: "fz-8", date: "2026-03-09T00:00", amount: 38, description: "Mezzanotte da muro" },
        /*
          *Cio che una sola delle due sa leggere.* L'ora 24 e il secondo 60
          Postgres li fa scorrere al momento dopo e JavaScript li rifiuta;
          l'anno zero non esiste per Postgres e vale 1 a.C. per JavaScript; una
          tabulazione in coda la toglie `trim` e non la toglie `btrim`.
        */
        { id: "fz-9", date: "2026-03-09T24:00", amount: 39, description: "L'ora ventiquattro" },
        { id: "fz-10", date: "2026-03-09T23:59:60", amount: 40, description: "Il secondo sessanta" },
        { id: "fz-11", date: "0000-01-01", amount: 41, description: "L'anno zero" },
        { id: "fz-12", date: "2026-03-09	", amount: 42, description: "Tabulazione in coda" },
        /* E i numeri che JavaScript legge in binario e in ottale, e Postgres no. */
        { id: "fz-13", date: "2026-03-09", amount: "0b101", description: "Importo binario" },
        { id: "fz-14", date: "2026-03-09", amount: "0o17", description: "Importo ottale" },
        /*
          **Le divergenze che una revisione con 482 righe ostili ha trovato
          dove ventisei non arrivavano.**

          *L'arrotondamento del millesimo.* `timestamp(3)` arrotonda e
          `new Date` tronca: a capodanno i due finiscono in **anni fiscali
          diversi**, e a fine millennio l'arrotondamento produce l'anno 10000 —
          finito, quindi accettato da `isfinite`, e illeggibile per Prisma:
          una riga sola faceva cadere prima nota, rendiconto, export e saldi.
        */
        { id: "ms-1", date: "2025-12-31T23:59:59.9999Z", amount: 51, description: "Millesimo a capodanno" },
        { id: "ms-2", date: "2026-12-31T23:59:59.9996", amount: 52, description: "Millesimo a fine anno" },
        { id: "ms-3", date: "2026-03-09T12:00:00.0015", amount: 53, description: "Millesimo e mezzo" },
        { id: "ms-4", date: "2026-03-09T12:00:00.123999", amount: 54, description: "Sei decimali" },
        { id: "ms-5", date: "9999-12-31T23:59:59.9996", amount: 55, description: "L'anno diecimila" },
        /* Un fuso oltre ±15:59: Postgres lo rifiuta, JavaScript no. */
        { id: "fu-1", date: "2026-03-09T12:00:00+16:00", amount: 56, description: "Fuso fuori scala" },
        { id: "fu-2", date: "2026-03-09T12:00:00-23:00", amount: 57, description: "Fuso molto fuori scala" },
        { id: "fu-3", date: "2026-03-09T12:00:00+02:99", amount: 58, description: "Minuti di fuso impossibili" },
        { id: "fu-4", date: "2026-03-09T12:00:00+15:00", amount: 59, description: "Fuso al limite, valido" },
        /*
          *Lo spazio non e l'unico carattere che `float8in` scarta*, e
          l'esadecimale lo leggono **tutti e due** — al contrario di quanto il
          commento diceva.
        */
        { id: "nu-1", date: "2026-03-09", amount: "\t5", description: "Numero con tabulazione" },
        { id: "nu-2", date: "2026-03-09", amount: "5\n", description: "Numero con a capo" },
        { id: "nu-3", date: "2026-03-09", amount: "0x1f", description: "Numero esadecimale" },
        { id: "nu-4", date: "2026-03-09", amount: "0X10", description: "Esadecimale maiuscolo" },
        /*
          *`btrim` toglie i soli spazi*, `trim` toglie anche tabulazioni,
          spazi unificatori e BOM: la descrizione usciva diversa, e quando era
          fatta di sola tabulazione una lettura ripiegava sul titolo e l'altra
          no.
        */
        { id: "tx-1", date: "2026-03-09", amount: 61, description: "\tcon tabulazione" },
        { id: "tx-2", date: "2026-03-09", amount: 62, description: "\t", title: "titolo di ripiego" },
        { id: "tx-3", date: "2026-03-09", amount: 63, description: "\u00a0", title: "titolo di ripiego" },
        { id: "tx-4", date: "2026-03-09", amount: 64, description: "Metodo strano", paymentMethod: "\t" },
        { id: "tx-5", date: "2026-03-09", amount: 65, description: "Metodo con coda", paymentMethod: " Contanti\t" },
        /* `NULLIF(btrim(id), '')` contro `String(row.id || …)`. */
        { id: "  T12  ", date: "2026-03-09", amount: 66, description: "Identificativo con spazi" },
        { id: "   ", date: "2026-03-09", amount: 67, description: "Identificativo di soli spazi" },
        /*
          *`COALESCE` sceglie il primo non nullo, `||` il primo vero:* una
          stringa vuota in `type` faceva prendere due strade diverse, e la
          riga usciva con il **verso opposto**.
        */
        { id: "vr-1", date: "2026-03-09", amount: 68, type: "", direction: "expense", description: "Tipo vuoto" },
        { id: "vr-2", date: "2026-03-09", amount: 69, type: false, direction: "expense", description: "Tipo falso" },
        { id: "vr-3", date: "2026-03-09", amount: 70, type: 0, direction: "expense", description: "Tipo zero" },
        /* `->>` rende il JSON; `String()` no. */
        { id: "js-1", date: "2026-03-09", amount: 71, description: {} },
        { id: "js-2", date: "2026-03-09", amount: 72, description: [1, 2] },
      ],
      transfers: [
        {
          id: "gt-1",
          date: "2026-03-04T00:00:00.000Z",
          amount: 500,
          description: "Giroconto storico",
        },
        /* Il secondo ramo storico legge le stesse colonne: stessa matrice. */
        ...matriceOstile(),
      ],
      settings: {
        seasons: [
          {
            id: "2026-27",
            label: "2026/27",
            startDate: "2026-07-01",
            endDate: "2027-06-30",
            status: "active",
          },
        ],
      },
    },
  });

  await prisma.financialAccount.createMany({
    data: [
      { id: CASSA, organization_id: CLUB, name: "Cassa", kind: "CASH", updated_at: new Date() },
      { id: BANCA, organization_id: CLUB, name: "Banca", kind: "BANK", updated_at: new Date() },
    ],
  });

  await prisma.fiscalOperationType.create({
    data: {
      id: CAUSALE,
      organization_id: CLUB,
      code: "quota_attivita",
      label: "Quota attivita",
      activity_scope: "institutional",
      updated_at: new Date(),
    },
  });

  await prisma.athlete.create({
    data: {
      id: ATLETA,
      organization_id: CLUB,
      first_name: "Anna",
      last_name: "Rossi",
      updated_at: new Date(),
    },
  });

  await prisma.paymentTransaction.createMany({
    data: [
      {
        id: INCASSO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        /* Mezzo centesimo: e dove l'arrotondamento dei due linguaggi diverge. */
        amount: 200.005,
        paid_at: d("2026-09-10T00:00:00Z"),
        payment_method: "Contanti",
        financial_account_id: CASSA,
        operation_type_code: "quota_attivita",
        activity_scope_snapshot: "institutional",
        updated_at: new Date(),
      },
      {
        id: RIMBORSO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        amount: -50,
        paid_at: d("2026-09-11T00:00:00Z"),
        payment_method: "Bonifico",
        financial_account_id: BANCA,
        updated_at: new Date(),
      },
      {
        id: STORNATO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        amount: 100,
        paid_at: d("2026-09-12T00:00:00Z"),
        payment_method: "Contanti",
        financial_account_id: CASSA,
        reversed_at: d("2026-09-13T00:00:00Z"),
        updated_at: new Date(),
      },
      {
        id: STORNO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        amount: -100,
        paid_at: d("2026-09-13T00:00:00Z"),
        payment_method: "Contanti",
        financial_account_id: CASSA,
        reverses_transaction_id: STORNATO,
        updated_at: new Date(),
      },
      {
        id: INCASSO_ANNULLATO,
        organization_id: CLUB,
        athlete_id: ATLETA,
        amount: 60,
        paid_at: d("2026-09-14T00:00:00Z"),
        payment_method: "Contanti",
        financial_account_id: CASSA,
        updated_at: new Date(),
      },
      /*
        **Un incasso da zero non esiste**, e non per scelta di questa sonda: il
        database lo rifiuta con `payment_transactions_amount_check`. La prima
        stesura di questo script ne seminava uno, per provare che entrambe le
        letture lo scartano, e Postgres ha risposto prima che la prova
        cominciasse.
        Vale la pena scriverlo: il ramo «importo zero» delle due proiezioni e
        irraggiungibile per gli incassi, e resta esercitato solo dove un
        importo nullo e davvero possibile — il blob storico, che vincoli non ne
        ha, e il netto di un compenso interamente trattenuto.
      */
    ],
  });

  await prisma.receipt.createMany({
    data: [
      {
        id: RICEVUTA,
        organization_id: CLUB,
        athlete_id: ATLETA,
        transaction_id: INCASSO,
        receipt_number: "2026/000001",
        issue_date: d("2026-09-10T00:00:00Z"),
        amount: 200,
        description: "Quota attivita",
        updated_at: new Date(),
      },
      {
        id: RICEVUTA_ANNULLATA,
        organization_id: CLUB,
        athlete_id: ATLETA,
        transaction_id: INCASSO_ANNULLATO,
        receipt_number: "2026/000002",
        issue_date: d("2026-09-14T00:00:00Z"),
        amount: 60,
        description: "Quota attivita",
        cancelled_at: d("2026-09-15T00:00:00Z"),
        updated_at: new Date(),
      },
    ],
  });

  await prisma.sportWorkPerson.create({
    data: {
      id: PERSONA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      updated_at: new Date(),
    },
  });

  await prisma.sportWorkOutboundTransaction.createMany({
    data: [
      {
        id: COMPENSO,
        organization_id: CLUB,
        person_id: PERSONA,
        transaction_type: "COMPENSATION_PAYMENT",
        paid_at: d("2026-09-16T00:00:00Z"),
        fiscal_year: 2026,
        gross_amount: 1000,
        net_amount: 760,
        club_cost: 1240,
        financial_account_id: BANCA,
        payment_method: "Bonifico",
        reference: "CRO 12345",
        updated_at: new Date(),
      },
      /*
        Netto zero: dal conto verso la persona non e uscito niente, e la riga
        non deve comparire. E il difetto D-D, e la vista deve ripeterlo.
      */
      {
        id: COMPENSO_ZERO,
        organization_id: CLUB,
        person_id: PERSONA,
        transaction_type: "COMPENSATION_PAYMENT",
        paid_at: d("2026-09-17T00:00:00Z"),
        fiscal_year: 2026,
        gross_amount: 500,
        net_amount: 0,
        club_cost: 500,
        financial_account_id: BANCA,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.fundingProgram.create({
    data: {
      id: PROGRAMMA,
      organization_id: CLUB,
      name: "Voucher sport",
      funder_name: "Regione",
      period_amount: 100,
      athlete_plafond: 400,
      valid_from: d("2026-07-01T00:00:00Z"),
      valid_to: d("2027-06-30T00:00:00Z"),
      updated_at: new Date(),
    },
  });

  await prisma.fundingSettlement.createMany({
    data: [
      {
        id: LIQUIDAZIONE,
        organization_id: CLUB,
        program_id: PROGRAMMA,
        settled_at: d("2026-09-18T00:00:00Z"),
        amount: 800,
        financial_account_id: BANCA,
        method: "Bonifico",
        notes: "Prima tranche",
        reversed_at: d("2026-09-19T00:00:00Z"),
        updated_at: new Date(),
      },
      {
        id: STORNO_LIQUIDAZIONE,
        organization_id: CLUB,
        program_id: PROGRAMMA,
        settled_at: d("2026-09-19T00:00:00Z"),
        /*
          **Negativo, e il database lo pretende.** Il vincolo
          `funding_settlements_amount_check` impone importo positivo a una
          liquidazione e importo negativo a uno storno. E la forma che la Wave
          ha dovuto adottare dopo che una prima stesura, con lo storno
          positivo, passava nei doppi e falliva sul database vero.
        */
        amount: -800,
        financial_account_id: BANCA,
        reversal_of_id: LIQUIDAZIONE,
        updated_at: new Date(),
      },
    ],
  });

  await prisma.accountingEntry.createMany({
    data: [
      {
        id: MOVIMENTO,
        organization_id: CLUB,
        entry_date: d("2026-09-20T00:00:00Z"),
        fiscal_year: 2026,
        season_id: "2026-27",
        direction: "OUT",
        amount_cents: 48000,
        financial_account_id: CASSA,
        operation_type_id: CAUSALE,
        operation_type_code: "quota_attivita",
        operation_type_label_snapshot: "Quota attivita",
        activity_scope_snapshot: "institutional",
        description: "Affitto palestra",
        notes: "settembre",
        payment_method: "Contanti",
        counterparty_kind: "SUPPLIER",
        counterparty_label: "Comune di Prova",
        source_domain: "MANUAL",
        document_kind: "receipt",
        document_id: RICEVUTA,
        reconciliation_status: "reconciled",
        value_date: d("2026-09-21T00:00:00Z"),
        bank_reference: "EC-99",
        updated_at: new Date(),
      },
      {
        id: GIROCONTO_A,
        organization_id: CLUB,
        entry_date: d("2026-09-22T00:00:00Z"),
        fiscal_year: 2026,
        direction: "OUT",
        amount_cents: 50000,
        financial_account_id: CASSA,
        description: "Versamento in banca",
        source_domain: "INTERNAL_TRANSFER",
        transfer_group_id: GRUPPO,
        updated_at: new Date(),
      },
      {
        id: GIROCONTO_B,
        organization_id: CLUB,
        entry_date: d("2026-09-22T00:00:00Z"),
        fiscal_year: 2026,
        direction: "IN",
        amount_cents: 50000,
        financial_account_id: BANCA,
        description: "Versamento in banca",
        source_domain: "INTERNAL_TRANSFER",
        transfer_group_id: GRUPPO,
        updated_at: new Date(),
      },
    ],
  });
};

/* ------------------------------------------------------------ il confronto */

/** I campi confrontati, e sono tutti quelli che la vista dichiara. */
const CAMPI = [
  "row_kind",
  "organization_id",
  "entry_date",
  "fiscal_year",
  "season_id",
  "direction",
  "amount_cents",
  "currency",
  "financial_account_id",
  "financial_account_name",
  "operation_type_code",
  "operation_type_label",
  "activity_scope",
  "description",
  "notes",
  "payment_method",
  "counterparty_kind",
  "counterparty_id",
  "counterparty_label",
  "source_domain",
  "source_id",
  "document_kind",
  "document_id",
  "document_number",
  "site_id",
  "reconciliation_status",
  "value_date",
  "bank_reference",
  "transfer_group_id",
  "reversal_of_id",
  "reversed_at",
  "reversal_reason",
  "created_by",
  "created_at",
  "search_text",
];

/**
 * `created_at` non si confronta: il database lo assegna lui con
 * `CURRENT_TIMESTAMP`, e la dichiarazione in TypeScript lo legge dalla riga
 * che il database ha appena scritto. Confrontarli proverebbe che l'orologio
 * funziona, non che la regola coincide.
 */
const NON_CONFRONTATI = new Set(["created_at"]);

const normalizza = (valore) => {
  if (valore === undefined || valore === null) return null;
  if (valore instanceof Date) return valore.toISOString();
  if (typeof valore === "number") return valore;
  return String(valore);
};

const leggiDichiarazione = async () => {
  const [entries, incassi, compensi, liquidazioni, club, conti, causali, atleti, persone, programmi, fatture, ricevute] =
    await Promise.all([
      prisma.accountingEntry.findMany({ where: { organization_id: CLUB } }),
      prisma.paymentTransaction.findMany({ where: { organization_id: CLUB } }),
      prisma.sportWorkOutboundTransaction.findMany({ where: { organization_id: CLUB } }),
      prisma.fundingSettlement.findMany({ where: { organization_id: CLUB } }),
      prisma.club.findUnique({ where: { id: CLUB } }),
      prisma.financialAccount.findMany({ where: { organization_id: CLUB } }),
      prisma.fiscalOperationType.findMany({ where: { organization_id: CLUB } }),
      prisma.athlete.findMany({ where: { organization_id: CLUB } }),
      prisma.sportWorkPerson.findMany({ where: { organization_id: CLUB } }),
      prisma.fundingProgram.findMany({ where: { organization_id: CLUB } }),
      prisma.invoice.findMany({ where: { organization_id: CLUB } }),
      prisma.receipt.findMany({ where: { organization_id: CLUB } }),
    ]);

  const perId = (righe) => new Map(righe.map((r) => [r.id, r]));
  const contiPerId = perId(conti);
  const causaliPerId = perId(causali);
  const causaliPerCodice = new Map(causali.map((c) => [c.code, c]));
  const atletiPerId = perId(atleti);
  const personePerId = perId(persone);
  const programmiPerId = perId(programmi);
  const nome = (p) => (p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() || null : null);

  const numeroDocumento = (kind, id) => {
    if (!id) return null;
    const tipo = String(kind || "").toLowerCase();
    if (tipo === "invoice" || tipo === "fattura") {
      return fatture.find((f) => f.id === id)?.invoice_number || null;
    }
    if (tipo === "receipt" || tipo === "ricevuta") {
      return ricevute.find((r) => r.id === id)?.receipt_number || null;
    }
    return null;
  };

  return buildLedgerView({
    entries: entries.map((row) => ({
      ...row,
      _accountName: contiPerId.get(row.financial_account_id)?.name || null,
      _operationTypeLabel: causaliPerId.get(row.operation_type_id)?.label || null,
      _documentNumber: numeroDocumento(row.document_kind, row.document_id),
    })),
    paymentTransactions: incassi.map((row) => {
      const fattura = fatture.find((f) => f.transaction_id === row.id && !f.cancelled_at);
      const ricevuta = ricevute.find((r) => r.transaction_id === row.id && !r.cancelled_at);
      const documento = fattura || ricevuta;
      const causale = causaliPerCodice.get(row.operation_type_code);
      return {
        ...row,
        _athleteName: nome(atletiPerId.get(row.athlete_id)),
        _accountName: contiPerId.get(row.financial_account_id)?.name || null,
        _operationTypeLabel: causale?.label || null,
        _activityScope: causale?.activity_scope || null,
        _documentKind: documento ? (fattura ? "invoice" : "receipt") : null,
        _documentId: documento?.id || null,
        _documentNumber: fattura?.invoice_number || ricevuta?.receipt_number || null,
      };
    }),
    sportWorkPayouts: compensi.map((row) => ({
      ...row,
      _personName: nome(personePerId.get(row.person_id)),
      _accountName: contiPerId.get(row.financial_account_id)?.name || null,
    })),
    fundingSettlements: liquidazioni.map((row) => ({
      ...row,
      _programName: programmiPerId.get(row.program_id)?.name || null,
      _accountName: contiPerId.get(row.financial_account_id)?.name || null,
    })),
    clubs: [club],
  });
};

const confronta = async () => {
  const sql = await prisma.accountingLedgerLine.findMany({
    where: { organization_id: CLUB },
    orderBy: [{ entry_date: "desc" }, { id: "asc" }],
  });
  const ts = await leggiDichiarazione();

  const differenze = [];

  const idSql = new Set(sql.map((r) => r.id));
  const idTs = new Set(ts.map((r) => r.id));

  for (const id of idSql) {
    if (!idTs.has(id)) differenze.push({ id, campo: "-", sql: "presente", ts: "assente" });
  }
  for (const id of idTs) {
    if (!idSql.has(id)) differenze.push({ id, campo: "-", sql: "assente", ts: "presente" });
  }

  const tsPerId = new Map(ts.map((r) => [r.id, r]));
  for (const riga of sql) {
    const altra = tsPerId.get(riga.id);
    if (!altra) continue;
    for (const campo of CAMPI) {
      if (NON_CONFRONTATI.has(campo)) continue;
      const a = normalizza(riga[campo]);
      const b = normalizza(altra[campo]);
      if (a !== b) differenze.push({ id: riga.id, campo, sql: a, ts: b });
    }
  }

  /* L'ordine: le due letture devono restituire le righe nella stessa sequenza. */
  const ordineSql = sql.map((r) => r.id).join("|");
  const ordineTs = ts.map((r) => r.id).join("|");
  const ordineUguale = ordineSql === ordineTs;

  return { sql, ts, differenze, ordineUguale };
};

const pulisci = async () => {
  await prisma.club.delete({ where: { id: CLUB } }).catch((error) => {
    console.error(`Pulizia non riuscita, il club ${CLUB} e rimasto: ${error?.message}`);
  });
};

try {
  console.log(`${NL}Semina del club di prova ${CLUB}...`);
  await semina();

  console.log("Confronto fra la vista SQL e la dichiarazione in TypeScript...");
  const { sql, ts, differenze, ordineUguale } = await confronta();

  console.log(`  righe dalla vista SQL       : ${sql.length}`);
  console.log(`  righe dalla dichiarazione TS: ${ts.length}`);
  console.log(`  ordine identico             : ${ordineUguale ? "si" : "NO"}`);

  if (!differenze.length && ordineUguale) {
    console.log(
      `${NL}RICONCILIATO: le due letture del registro coincidono, riga per riga e campo per campo.`,
    );
  } else {
    console.log(`${NL}DIVERGENZE (${differenze.length}):`);
    for (const diff of differenze.slice(0, 60)) {
      console.log(
        `  ${diff.id}${NL}    campo ${diff.campo}${NL}    SQL: ${JSON.stringify(diff.sql)}${NL}    TS : ${JSON.stringify(diff.ts)}`,
      );
    }
    if (differenze.length > 60) console.log(`  ... e altre ${differenze.length - 60}`);
    if (!ordineUguale) console.log(`${NL}  L'ORDINE delle righe non coincide.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`${NL}Sonda non riuscita:${NL}${String(error?.message).split(NL).slice(0, 60).join(NL)}`);
  process.exitCode = 1;
} finally {
  await pulisci();
  await prisma.$disconnect();
}
