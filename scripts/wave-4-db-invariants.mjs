/**
 * **Gli invarianti del denaro, provati contro il database e non contro un doppio.**
 *
 *     node --experimental-strip-types --import ./tests/helpers/register-hooks.mjs \
 *       scripts/wave-4-db-invariants.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * Ogni invariante di questa Wave e scritto due volte: nel codice, che produce
 * un messaggio leggibile, e nel database, che protegge da chiunque — anche da
 * uno script, anche da una `psql` aperta per sbaglio.
 *
 * La seconda meta non ha test. Il doppio di Prisma dei test unitari non conosce
 * i `CHECK`, e questa Wave ha gia pagato due volte quella distanza: un `CHECK`
 * sull'origine era nato **largo** e ammetteva l'intera lista delle origini —
 * cioe la porta per una seconda contabilita — e una sonda lo ha dimostrato in un
 * minuto; uno storno di liquidazione con importo positivo passava nei doppi e
 * il database lo rifiutava.
 *
 * Questo script prova a **violare** ogni vincolo con un `INSERT` diretto, e
 * fallisce se il database lo lascia passare.
 *
 * ## Come si legge l'esito
 *
 * `REGGE` = il database ha rifiutato, ed e cio che deve fare.
 * `CEDE`  = l'`INSERT` e passato: l'invariante e solo nel codice.
 *
 * Club dedicato, cancellato alla fine.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

if (process.env.EASYGAME_DB_ENV !== "development") {
  console.error("Rifiuto: serve EASYGAME_DB_ENV=development.");
  process.exit(1);
}

const NL = String.fromCharCode(10);
const prisma = new PrismaClient();

const CLUB = randomUUID();
const CONTO = randomUUID();
const ALTRO_CONTO = randomUUID();
const ATLETA = randomUUID();
const PERSONA = randomUUID();
const PROGRAMMA = randomUUID();
const MOVIMENTO = randomUUID();

const esiti = [];

/**
 * Prova a scrivere qualcosa che non deve poter esistere.
 *
 * `atteso` e la ragione per cui non deve esistere, scritta per chi legge
 * l'esito senza avere lo schema sotto gli occhi.
 */
const vietato = async (titolo, atteso, sql) => {
  try {
    await prisma.$executeRawUnsafe(sql);
    esiti.push({ titolo, atteso, ok: false, dettaglio: "INSERT PASSATO" });
    console.log(`  CEDE   ${titolo.padEnd(58)} l'INSERT e passato`);
    console.log(`         atteso: ${atteso}`);
  } catch (error) {
    const vincolo =
      String(error?.message).match(/"([a-z0-9_]+)"/g)?.slice(-1)[0] || "?";
    esiti.push({ titolo, atteso, ok: true, dettaglio: vincolo });
    console.log(`  REGGE  ${titolo.padEnd(58)} rifiutato da ${vincolo}`);
  }
};

/** E il controllo inverso: cio che **deve** poter esistere, esiste. */
const permesso = async (titolo, sql) => {
  try {
    await prisma.$executeRawUnsafe(sql);
    esiti.push({ titolo, atteso: "deve passare", ok: true, dettaglio: "scritto" });
    console.log(`  REGGE  ${titolo.padEnd(58)} scritto, come deve`);
  } catch (error) {
    const msg = String(error?.message).split(NL).slice(-3).join(" | ").slice(0, 140);
    esiti.push({ titolo, atteso: "deve passare", ok: false, dettaglio: msg });
    console.log(`  CEDE   ${titolo.padEnd(58)} rifiutato: ${msg}`);
    console.log("         atteso: questa riga e legittima e deve poter esistere");
  }
};

/** Una condizione che deve valere, verificata invece che tentata. */
const esito = (titolo, ok, dettaglio) => {
  esiti.push({ titolo, atteso: "deve valere", ok, dettaglio });
  console.log(`  ${ok ? "REGGE " : "CEDE  "} ${titolo.padEnd(58)} ${dettaglio}`);
};

const q = (value) => (value === null ? "NULL" : `'${String(value)}'`);

const movimento = (overrides = {}) => {
  const riga = {
    id: `'${randomUUID()}'`,
    organization_id: `'${CLUB}'`,
    entry_date: `'2026-10-01'`,
    fiscal_year: "2026",
    season_id: "NULL",
    direction: "'OUT'",
    amount_cents: "1000",
    currency: "'EUR'",
    financial_account_id: `'${CONTO}'`,
    operation_type_id: "NULL",
    operation_type_code: "NULL",
    activity_scope_snapshot: "'unspecified'",
    operation_type_label_snapshot: "NULL",
    description: "'Sonda invarianti'",
    notes: "NULL",
    payment_method: "NULL",
    counterparty_kind: "NULL",
    counterparty_id: "NULL",
    counterparty_label: "NULL",
    source_domain: "'MANUAL'",
    source_id: "NULL",
    source_event_key: "NULL",
    document_kind: "NULL",
    document_id: "NULL",
    site_id: "NULL",
    reconciliation_status: "'unreconciled'",
    value_date: "NULL",
    bank_reference: "NULL",
    reconciled_at: "NULL",
    reconciled_by: "NULL",
    transfer_group_id: "NULL",
    reversal_of_id: "NULL",
    reversed_at: "NULL",
    reversed_by: "NULL",
    reversal_reason: "NULL",
    created_by: "NULL",
    created_at: "now()",
    updated_at: "now()",
    ...overrides,
  };

  const colonne = Object.keys(riga).join(", ");
  const valori = Object.values(riga).join(", ");
  return `INSERT INTO accounting_entries (${colonne}) VALUES (${valori})`;
};

const semina = async () => {
  const utente = await prisma.user.findFirst();
  if (!utente) throw new Error("Nessun utente nel database di sviluppo");

  await prisma.club.create({
    data: {
      id: CLUB,
      slug: `invarianti-${Date.now()}`,
      name: "ASD Sonda Invarianti",
      creator_id: utente.id,
    },
  });

  await prisma.financialAccount.createMany({
    data: [
      { id: CONTO, organization_id: CLUB, name: "Cassa", kind: "CASH", updated_at: new Date() },
      { id: ALTRO_CONTO, organization_id: CLUB, name: "Banca", kind: "BANK", updated_at: new Date() },
    ],
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

  await prisma.sportWorkPerson.create({
    data: {
      id: PERSONA,
      organization_id: CLUB,
      first_name: "Luca",
      last_name: "Bianchi",
      updated_at: new Date(),
    },
  });

  await prisma.fundingProgram.create({
    data: {
      id: PROGRAMMA,
      organization_id: CLUB,
      name: "Bando sonda",
      funder_name: "Ente",
      period_amount: 100,
      athlete_plafond: 400,
      valid_from: new Date("2026-07-01T00:00:00Z"),
      valid_to: new Date("2027-06-30T00:00:00Z"),
      updated_at: new Date(),
    },
  });

  /* Un movimento vero, che serve da bersaglio agli storni. */
  await prisma.$executeRawUnsafe(movimento({ id: `'${MOVIMENTO}'` }));
};

const prove = async () => {
  console.log(`${NL}=== IL MOVIMENTO DI PRIMA NOTA ===${NL}`);

  await vietato(
    "importo zero",
    "il segno lo dice il verso, non l'importo: zero non e un movimento",
    movimento({ amount_cents: "0" }),
  );
  await vietato(
    "importo negativo",
    "un importo negativo con un verso e la stessa cosa detta due volte, e le due possono contraddirsi",
    movimento({ amount_cents: "-1000" }),
  );
  await vietato(
    "verso inventato",
    "il giroconto non e un terzo verso: sono due movimenti",
    movimento({ direction: "'TRANSFER'" }),
  );
  await vietato(
    "anno fiscale incoerente con la data",
    "l'anno fiscale non si digita: si deriva dalla data del fatto",
    movimento({ fiscal_year: "2025" }),
  );
  await vietato(
    "anno fiscale fuori scala",
    "un anno a quattro cifre plausibili, o e un errore di battitura",
    movimento({ entry_date: "'1899-01-01'", fiscal_year: "1899" }),
  );
  await vietato(
    "stato di riconciliazione inventato",
    "tre stati e non uno di piu: da riconciliare, riconciliato, contestato",
    movimento({ reconciliation_status: "'boh'" }),
  );

  console.log(`${NL}=== LA SECONDA CONTABILITA, CHE NON DEVE NASCERE ===${NL}`);

  /*
    E il vincolo piu importante della Wave. Una riga `ATHLETE_PAYMENT` in
    questa tabella sarebbe lo stesso incasso rappresentato due volte, e i
    totali lo conterebbero due volte. Il vincolo e nato **largo** — ammetteva
    l'intero catalogo delle origini — e una sonda lo ha scoperto.
  */
  for (const origine of [
    "ATHLETE_PAYMENT",
    "FUNDING_SETTLEMENT",
    "SPORT_WORK_PAYOUT",
    "SPONSOR_PAYMENT",
    "REFUND",
  ]) {
    await vietato(
      `origine proiettata scritta in tabella: ${origine}`,
      "solo MANUAL, INTERNAL_TRANSFER e REVERSAL si scrivono: il resto e proiezione",
      movimento({ source_domain: `'${origine}'` }),
    );
  }

  console.log(`${NL}=== IL GIROCONTO E LO STORNO ===${NL}`);

  await vietato(
    "giroconto senza gruppo",
    "un giroconto ha due gambe, sempre: senza gruppo la seconda non si trova",
    movimento({ source_domain: "'INTERNAL_TRANSFER'" }),
  );
  await vietato(
    "gruppo su un movimento che non e un giroconto",
    "un gruppo su un movimento manuale suggerisce un legame che non c'e",
    movimento({ transfer_group_id: `'${randomUUID()}'` }),
  );
  await vietato(
    "storno che non dice cosa compensa",
    "uno storno senza originale non spiega niente",
    movimento({ source_domain: "'REVERSAL'" }),
  );
  await vietato(
    "riferimento allo storno su un movimento che storno non e",
    "citare un originale senza essere uno storno e la meta di una coppia",
    movimento({ reversal_of_id: `'${MOVIMENTO}'` }),
  );

  /* Il doppio storno: il primo passa, il secondo si infrange. */
  await permesso(
    "il primo storno di un movimento",
    movimento({
      source_domain: "'REVERSAL'",
      reversal_of_id: `'${MOVIMENTO}'`,
      direction: "'IN'",
    }),
  );
  await vietato(
    "il secondo storno dello stesso movimento",
    "un movimento si storna una volta sola",
    movimento({
      source_domain: "'REVERSAL'",
      reversal_of_id: `'${MOVIMENTO}'`,
      direction: "'IN'",
    }),
  );

  console.log(`${NL}=== L'IDEMPOTENZA, E LA CORREZIONE CHE DEVE RESTARE POSSIBILE ===${NL}`);

  const chiave = `evento-${randomUUID()}`;
  const primoEvento = randomUUID();

  await permesso(
    "il primo movimento per un evento sorgente",
    movimento({ id: `'${primoEvento}'`, source_event_key: q(chiave) }),
  );
  await vietato(
    "lo stesso evento sorgente, una seconda volta",
    "lo stesso fatto non puo avere due rappresentazioni finanziarie",
    movimento({ source_event_key: q(chiave) }),
  );

  /*
    E la meta che mancava. Una riga stornata non rappresenta piu niente: la
    coppia originale/storno somma zero, e il fatto e tornato non registrato. Se
    l'unicita contasse anche le righe morte, la correzione consigliata dal
    prodotto — «storna e registra di nuovo» — sarebbe impossibile.
  */
  await prisma.$executeRawUnsafe(
    `UPDATE accounting_entries SET reversed_at = now() WHERE id = '${primoEvento}'`,
  );
  await permesso(
    "lo stesso evento, dopo che il primo e stato stornato",
    movimento({ source_event_key: q(chiave) }),
  );

  console.log(`${NL}=== IL DENARO DEGLI ALTRI DOMINI ===${NL}`);

  await vietato(
    "incasso da zero",
    "un incasso da zero non e un incasso",
    `INSERT INTO payment_transactions (id, organization_id, athlete_id, amount, paid_at, payment_method, source, currency, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${ATLETA}', 0, '2026-10-01', 'Contanti', 'MANUAL', 'EUR', now(), now())`,
  );

  await vietato(
    "liquidazione con importo negativo",
    "una liquidazione e denaro che entra: negativo e uno storno, e deve dirlo",
    `INSERT INTO funding_settlements (id, organization_id, program_id, settled_at, amount, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${PROGRAMMA}', '2026-10-01', -100, now(), now())`,
  );

  const liquidazione = randomUUID();
  await permesso(
    "una liquidazione positiva",
    `INSERT INTO funding_settlements (id, organization_id, program_id, settled_at, amount, created_at, updated_at)
     VALUES ('${liquidazione}', '${CLUB}', '${PROGRAMMA}', '2026-10-01', 800, now(), now())`,
  );
  await vietato(
    "storno di liquidazione con importo positivo",
    "uno storno riporta indietro: l'importo deve essere negativo",
    `INSERT INTO funding_settlements (id, organization_id, program_id, settled_at, amount, reversal_of_id, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${PROGRAMMA}', '2026-10-02', 800, '${liquidazione}', now(), now())`,
  );
  await permesso(
    "storno di liquidazione con importo negativo",
    `INSERT INTO funding_settlements (id, organization_id, program_id, settled_at, amount, reversal_of_id, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${PROGRAMMA}', '2026-10-02', -800, '${liquidazione}', now(), now())`,
  );
  await vietato(
    "un secondo storno della stessa liquidazione",
    "una liquidazione si storna una volta sola",
    `INSERT INTO funding_settlements (id, organization_id, program_id, settled_at, amount, reversal_of_id, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${PROGRAMMA}', '2026-10-03', -800, '${liquidazione}', now(), now())`,
  );

  console.log(`${NL}=== IL CONTO E DI CHI LO USA ===${NL}`);

  /*
    **Un conto di un altro club non e un dato sbagliato: e denaro invisibile.**

    I saldi si sommano per club **e** per elenco dei conti di quel club, quindi
    una riga che dichiara il club A e un conto di B non viene contata ne di qua
    ne di la. Un audit indipendente ha misurato un rendiconto da +8.500 euro
    netti con la somma dei saldi di **entrambi** i club a zero.

    La guardia applicativa chiude i quattro punti di scrittura; questa prova
    verifica la porta di sotto, che vale anche per uno script.
  */
  const CLUB_VICINO = randomUUID();
  const CONTO_VICINO = randomUUID();

  await prisma.$executeRawUnsafe(
    `INSERT INTO clubs (id, slug, name, creator_id, created_at, updated_at)
     VALUES ('${CLUB_VICINO}', 'inv-vicino-${Date.now()}', 'Club vicino',
             (SELECT creator_id FROM clubs WHERE id = '${CLUB}'), now(), now())`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO financial_accounts (id, organization_id, name, kind, created_at, updated_at)
     VALUES ('${CONTO_VICINO}', '${CLUB_VICINO}', 'Banca del vicino', 'BANK', now(), now())`,
  );

  await vietato(
    "un movimento sul conto di un altro club",
    "finirebbe nel registro e in nessun saldo, di nessuno dei due club",
    `INSERT INTO accounting_entries (id, organization_id, entry_date, fiscal_year, direction, amount_cents, financial_account_id, description, source_domain, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', now(), 2026, 'IN', 10000, '${CONTO_VICINO}', 'Movimento fuori club', 'MANUAL', now(), now())`,
  );
  await vietato(
    "un incasso sul conto di un altro club",
    "vale per ogni dominio che entra nel registro, non solo per i movimenti manuali",
    `INSERT INTO payment_transactions (id, organization_id, amount, paid_at, payment_method, source, currency, financial_account_id, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', 100, '2026-10-01', 'Bonifico', 'MANUAL', 'EUR', '${CONTO_VICINO}', now(), now())`,
  );

  await prisma.$executeRawUnsafe(`DELETE FROM clubs WHERE id = '${CLUB_VICINO}'`);

  /*
    **Che il vincolo ci sia, e che sia validato.**

    Provare che una scrittura sbagliata viene rifiutata non basta: un vincolo
    `NOT VALID` rifiuta le scritture nuove **e** tollera le righe vecchie, e
    la sua validazione fallita viene annunciata con un `RAISE NOTICE` che
    `prisma migrate deploy` non mostra. Su un database dove la validazione non
    e passata, tutte le prove qui sopra risulterebbero verdi mentre righe
    sbagliate restano dentro.

    E Prisma non conosce questi vincoli: un `migrate dev` li cancellerebbe. Qui
    la loro assenza fa fallire il gate.
  */
  const vincoliAttesi = [
    "payment_transactions_conto_dello_stesso_club",
    "accounting_entries_conto_dello_stesso_club",
    "funding_settlements_conto_dello_stesso_club",
    "sport_work_outbound_conto_dello_stesso_club",
  ];
  const presenti = await prisma.$queryRawUnsafe(
    `SELECT conname, convalidated FROM pg_constraint WHERE conname = ANY($1::text[])`,
    vincoliAttesi,
  );
  for (const atteso of vincoliAttesi) {
    const riga = presenti.find((r) => r.conname === atteso);
    esito(
      `il vincolo ${atteso} esiste ed e validato`,
      Boolean(riga?.convalidated),
      riga
        ? riga.convalidated
          ? "presente e validato"
          : "PRESENTE MA NON VALIDATO: ci sono righe fuori club da correggere"
        : "ASSENTE: una migrazione lo ha tolto",
    );
  }

  console.log(`${NL}=== QUANTO PUO VALERE UN IMPORTO ===${NL}`);

  /*
    **21.474.836,47 euro e il piu grande importo che il registro sa mostrare.**

    Non e una scelta di prodotto: e il limite della colonna della vista. Oltre
    quello i centesimi non entrano in un intero, e Postgres non tronca — alza
    `integer out of range` e **l'intera query cade**. Un solo movimento fuori
    scala, e quel club perdeva prima nota, rendiconto, export e saldi.

    Le funzioni `easygame_centesimi` reggono comunque, e in quel caso si perde
    una riga invece di un anno di contabilita; ma la riga non deve nascere, ed
    e per questo che il divieto sta qui e non nell'applicazione: la prima volta
    e nata da una scrittura che l'applicazione non ha visto.
  */

  await permesso(
    "un incasso all'importo massimo rappresentabile",
    `INSERT INTO payment_transactions (id, organization_id, athlete_id, amount, paid_at, payment_method, source, currency, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${ATLETA}', 21474836.47, '2026-10-01', 'Bonifico', 'MANUAL', 'EUR', now(), now())`,
  );
  await vietato(
    "un incasso di un centesimo oltre il rappresentabile",
    "un movimento che il registro non puo mostrare non deve poter nascere",
    `INSERT INTO payment_transactions (id, organization_id, athlete_id, amount, paid_at, payment_method, source, currency, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${ATLETA}', 21474836.48, '2026-10-01', 'Bonifico', 'MANUAL', 'EUR', now(), now())`,
  );
  await vietato(
    "un Date.now() finito nel campo dell'importo",
    "millemila miliardi non sono un incasso: sono un errore che spegneva la contabilita del club",
    `INSERT INTO payment_transactions (id, organization_id, athlete_id, amount, paid_at, payment_method, source, currency, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${ATLETA}', 1700000000000, '2026-10-01', 'Bonifico', 'MANUAL', 'EUR', now(), now())`,
  );
  await vietato(
    "una liquidazione di bando fuori scala",
    "vale per ogni dominio che entra nel registro, non solo per gli incassi",
    `INSERT INTO funding_settlements (id, organization_id, program_id, settled_at, amount, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${PROGRAMMA}', '2026-10-04', 50000000000, now(), now())`,
  );

  console.log(`${NL}=== IL LIBRO SOCI ===${NL}`);

  const socio = randomUUID();
  await permesso(
    "la prima ammissione di un socio",
    `INSERT INTO membership_events (id, organization_id, member_id, member_label, event_type, effective_date, membership_number, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${socio}', 'Anna Rossi', 'ADMISSION', '2026-09-01', '0001', now(), now())`,
  );
  await vietato(
    "una seconda ammissione dello stesso socio",
    "un socio si ammette una volta sola: chi rientra si riammette, ed e un altro evento",
    `INSERT INTO membership_events (id, organization_id, member_id, member_label, event_type, effective_date, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${socio}', 'Anna Rossi', 'ADMISSION', '2026-10-01', now(), now())`,
  );
  await vietato(
    "lo stesso numero di tessera a due soci",
    "il numero di tessera non si ripete: e cio che identifica il socio nel libro",
    `INSERT INTO membership_events (id, organization_id, member_id, member_label, event_type, effective_date, membership_number, created_at, updated_at)
     VALUES ('${randomUUID()}', '${CLUB}', '${randomUUID()}', 'Luca Bianchi', 'ADMISSION', '2026-09-02', '0001', now(), now())`,
  );

  console.log(`${NL}=== LA VISTA DEL REGISTRO, CHE NON SI SCRIVE ===${NL}`);

  await vietato(
    "scrivere una riga nella vista del registro",
    "il registro non ha righe proprie da inventare: si scrive nei domini che possiedono i numeri",
    `INSERT INTO accounting_ledger_lines (id, row_kind, organization_id, entry_date, fiscal_year, direction, amount_cents, currency, activity_scope, description, source_domain, reconciliation_status)
     VALUES ('inventata:1', 'entry', '${CLUB}', '2026-10-01', 2026, 'IN', 100, 'EUR', 'unspecified', 'Riga inventata', 'MANUAL', 'unreconciled')`,
  );
  await vietato(
    "cancellare una riga dalla vista del registro",
    "il denaro non si cancella: si storna, e lo storno e una riga nuova",
    `DELETE FROM accounting_ledger_lines WHERE organization_id = '${CLUB}'`,
  );
};

const pulisci = async () => {
  await prisma.club.delete({ where: { id: CLUB } }).catch((error) => {
    console.error(`Pulizia non riuscita, il club ${CLUB} e rimasto: ${error?.message}`);
  });
};

try {
  console.log(`${NL}Semina del club di sonda ${CLUB}...`);
  await semina();
  await prove();

  const ceduti = esiti.filter((e) => !e.ok);
  console.log(
    `${NL}${esiti.length - ceduti.length}/${esiti.length} invarianti tengono nel database.`,
  );
  if (ceduti.length) {
    console.log(`${NL}CEDUTI:`);
    for (const e of ceduti) {
      console.log(`  ${e.titolo}${NL}    atteso: ${e.atteso}${NL}    trovato: ${e.dettaglio}`);
    }
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `${NL}Sonda interrotta:${NL}${String(error?.message).split(NL).slice(0, 30).join(NL)}`,
  );
  process.exitCode = 1;
} finally {
  await pulisci();
  await prisma.$disconnect();
}
