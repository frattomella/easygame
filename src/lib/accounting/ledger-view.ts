/**
 * **La specifica in TypeScript della vista `accounting_ledger_lines`.**
 *
 * Modulo **puro**: nessun Prisma, nessuna rete. Riceve le righe gia lette dai
 * cinque domini e restituisce le righe del registro, nella **stessa forma** che
 * il database produce.
 *
 * ---
 *
 * ## Perche esiste una seconda scrittura della stessa regola
 *
 * In produzione il registro lo compone Postgres, e deve: comporlo in memoria
 * significava rileggerlo tutto a ogni pagina, e su 35.000 righe il rendiconto
 * ci metteva due minuti. La vista
 * (`prisma/migrations/20260830090000_wave4_registro_unico`) e la risposta.
 *
 * Ma una regola scritta in SQL e una regola che nessun test unitario legge, e
 * questa Wave ha gia dimostrato — piu volte — che tremila test verdi non
 * bastano a dire che il denaro e giusto. Quindi la regola vive **anche** qui, e
 * i tre usi sono distinti e nessuno e ridondante:
 *
 * | Chi | Cosa ne fa |
 * |---|---|
 * | Postgres | **esegue** la regola, in produzione |
 * | questo modulo | la **dichiara**, in una forma che i test possono leggere |
 * | `scripts/wave-4-registro-riconciliazione.mjs` | prova che le due **coincidono**, riga per riga, contro il database vero |
 *
 * Senza il terzo, i primi due sarebbero due contabilita — che e esattamente
 * cio che questa Wave vieta. Il terzo e la ragione per cui non lo sono.
 *
 * ## Cosa questo modulo non fa
 *
 * Non decide i permessi. Una riga del registro non sa chi la sta leggendo: i
 * verdetti `canEdit`, `canReverse` e `canReconcile` li applica
 * `src/lib/server/accounting.ts`, che il ruolo lo conosce.
 */

import {
  fiscalYearOfEntry,
  normalizeActivityScope,
  type AccountingLine,
  type AccountingSourceDomain,
  type CounterpartyKind,
  type ReconciliationStatus,
} from "./model";
import {
  projectFundingSettlements,
  projectPaymentTransactions,
  projectSportWorkPayouts,
  sortAccountingLines,
  type FundingSettlementRow,
  type PaymentTransactionRow,
  type SportWorkOutboundRow,
} from "./projection";

/**
 * **Il testo di un valore JSON, come lo renderebbe `->>` di Postgres.**
 *
 * Due differenze, e producevano entrambe righe diverse fra le due letture del
 * registro:
 *
 * 1. `String({})` vale `"[object Object]"` e `String([1,2])` vale `"1,2"`;
 *    `->>` rende il **JSON**, cioe `"{}"` e `"[1, 2]"`;
 * 2. `String.prototype.trim` toglie tabulazioni, a capo, spazi unificatori e
 *    BOM; `btrim` toglie i **soli spazi**. Una descrizione che comincia per
 *    tabulazione usciva diversa, e quando era fatta di sola tabulazione una
 *    lettura ripiegava sul titolo e l'altra no.
 */
/**
 * Un numero come lo stampa `jsonb`: mai in notazione esponenziale.
 *
 * `String(1e21)` vale `"1e+21"` e `String(1e-7)` vale `"1e-7"`; `jsonb`
 * scrive `1000000000000000000000` e `0.0000001`.
 */
const numeroComeJsonb = (valore: number): string => {
  if (!Number.isFinite(valore)) return String(valore);
  const testo = String(valore);
  if (!/[eE]/.test(testo)) return testo;
  /* `toFixed` non basta oltre le 100 cifre: si ricostruisce dalla mantissa. */
  const [mantissa, esponente] = testo.split(/[eE]/);
  const potenza = Number(esponente);
  const segno = mantissa.startsWith("-") ? "-" : "";
  const cifre = mantissa.replace("-", "").replace(".", "");
  const virgola = mantissa.replace("-", "").indexOf(".");
  const posizione = (virgola < 0 ? cifre.length : virgola) + potenza;
  if (posizione <= 0) return `${segno}0.${"0".repeat(-posizione)}${cifre}`;
  if (posizione >= cifre.length) {
    return `${segno}${cifre}${"0".repeat(posizione - cifre.length)}`;
  }
  return `${segno}${cifre.slice(0, posizione)}.${cifre.slice(posizione)}`;
};

/**
 * **Il testo di un valore JSON, come lo scrive `->>` di Postgres.**
 *
 * Non e `JSON.stringify`. `jsonb` mette uno spazio dopo i due punti **e**
 * dopo la virgola, ma solo dove sono **separatori**: una virgola dentro una
 * stringa resta come sta. Una sostituzione testuale sul risultato di
 * `JSON.stringify` non sa distinguere i due casi, e su `{"a":"x,y"}`
 * produceva `{"a":"x, y"}` — cioe cambiava il **dato**, non la sua
 * formattazione.
 *
 * Si ricostruisce quindi il testo scendendo nella struttura, dove la
 * distinzione e ovvia.
 */
const jsonComeTesto = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") {
    return typeof value === "number" ? numeroComeJsonb(value) : String(value);
  }
  return serializzaComeJsonb(value);
};

const serializzaComeJsonb = (valore: unknown): string => {
  if (valore === null) return "null";
  if (typeof valore === "boolean") return valore ? "true" : "false";
  if (typeof valore === "number") return numeroComeJsonb(valore);
  if (typeof valore === "string") return JSON.stringify(valore);
  if (Array.isArray(valore)) {
    return `[${valore.map((v) => serializzaComeJsonb(v)).join(", ")}]`;
  }
  const coppie = Object.entries(valore as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([chiave, v]) => `${JSON.stringify(chiave)}: ${serializzaComeJsonb(v)}`);
  return `{${coppie.join(", ")}}`;
};

/** `NULLIF(btrim(x), '')`: i soli spazi, e il vuoto diventa `null`. */
const testo = (value: unknown) => {
  const text = jsonComeTesto(value).replace(/^ +| +$/g, "");
  return text || null;
};

const iso = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Le colonne temporali sono **`Date`**, come quelle che Postgres restituisce.
 *
 * Non e cosmesi. Un filtro `entry_date: { gte, lte }` confronta la colonna con
 * un `Date`, e una riga che porta una stringa ISO non e ne maggiore ne minore:
 * il confronto risponde `false` in silenzio e la riga sparisce. E il modo in
 * cui una proiezione che sembrava corretta faceva svanire tutti gli incassi da
 * un filtro per stagione.
 */
const data = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

/**
 * I centesimi di un importo che arriva da un blob JSON, o `null`.
 *
 * **Perche non basta `Number(...)`.** Due ragioni, e sono due difetti
 * diversi trovati insieme.
 *
 * *La prima:* `Number(true)` vale 1 e `Number([5])` vale 5, mentre in SQL
 * `'true'::double precision` e `'[5]'::double precision` falliscono. La riga
 * usciva quindi da una lettura sola del registro — e valeva 1,00 euro perche
 * qualcuno aveva scritto `true`.
 *
 * *La seconda, che era la piu grave:* oltre 21.474.836,47 euro i centesimi non
 * entrano in un `int`, e Postgres non tronca: **alza un errore e la vista
 * cade**. Un solo importo fuori scala — un `Date.now()` finito nel campo
 * sbagliato — e quel club perdeva prima nota, rendiconto, export e saldi.
 *
 * Un importo che non si puo rappresentare non e un importo: la riga esce dal
 * registro, e ne esce da **entrambe** le letture.
 */
const CENTESIMI_MASSIMI = 2147483647;

/** Un numero come lo legge `strtod`, esadecimali con segno ed esponente compresi. */
const numeroDaTestoC = (testo: string): number => {
  const segno = testo.startsWith("-") ? -1 : 1;
  const senzaSegno = testo.replace(/^[+-]/, "");
  if (!/^0[xX]/.test(senzaSegno)) return segno * Number(senzaSegno);

  const corpo = senzaSegno.slice(2);
  const [cifre, esponente] = corpo.split(/[pP]/);
  const [intere, decimali = ""] = cifre.split(".");
  const mantissa =
    (intere ? parseInt(intere, 16) : 0) +
    (decimali ? parseInt(decimali, 16) / 16 ** decimali.length : 0);
  return segno * mantissa * 2 ** (esponente ? Number(esponente) : 0);
};

const centesimiStorici = (value: unknown): number | null => {
  /*
    **Cio che `float8in` di Postgres sa leggere, e nient'altro.**

    `Number("0b101")` vale 5 e `Number("0o17")` vale 15; `'0b101'::float8`
    fallisce — ma `'0x1f'::float8` vale 31, e `Number("0x1f")` pure. Le due
    letture divergevano quindi in **tutte e due le direzioni**, e su forme
    diverse: binario e ottale li leggeva solo JavaScript, l'esadecimale lo
    accettano entrambi.

    E lo spazio non e l'unico carattere che `float8in` scarta: toglie anche
    tabulazione, a capo, ritorno, tabulazione verticale e avanzamento pagina —
    a differenza di `btrim`, che si limita agli spazi. La lettura in
    TypeScript ne toglieva uno solo, e dieci righe uscivano da una sola delle
    due.
  */
  /*
    `float8in` usa `strtod`, che accetta il segno **prima** di `0x` e la forma
    esadecimale con esponente binario (`0x1p4`); `Number()` non accetta ne
    l'uno ne l'altra. Le due forme si convertono a mano.
  */
  const DECIMALE =
    /^[+-]?((\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|0[xX][0-9a-fA-F]*(\.[0-9a-fA-F]*)?([pP][+-]?\d+)?)$/;
  const ripulito =
    typeof value === "string" ? value.replace(/^[ \t\n\r\v\f]+|[ \t\n\r\v\f]+$/g, "") : "";
  const numero =
    typeof value === "number"
      ? value
      : typeof value === "string" && DECIMALE.test(ripulito)
        ? numeroDaTestoC(ripulito)
        : NaN;
  if (!Number.isFinite(numero)) return null;
  const centesimi = Math.abs(Math.floor(numero * 100 + 0.5));
  return centesimi > CENTESIMI_MASSIMI ? null : centesimi;
};

/**
 * La data di un movimento storico, letta da un blob JSON che nessuno controlla.
 *
 * **Perche non basta `new Date(...)`.** JavaScript accetta il 31 febbraio e lo
 * fa scivolare al 3 marzo; Postgres lo rifiuta. Le due letture del registro
 * divergevano quindi su una riga che nessuna delle due dovrebbe accettare: una
 * la faceva sparire, l'altra la datava a un giorno che nel dato non c'e.
 *
 * Una data impossibile non e una data. Qui si rifiuta, e la riga esce dal
 * registro come esce dalla vista.
 */
/**
 * La forma ISO che le due letture del registro sanno leggere **uguale**.
 *
 * L'ora e vincolata a 00–23 e i secondi a 00–59 di proposito: Postgres accetta
 * `T24:00` e `T23:59:60` e li fa scorrere al momento dopo, JavaScript li
 * rifiuta. E l'anno zero non esiste per Postgres e vale 1 a.C. per JavaScript.
 */
const ISO_STORICA =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * L'anno dev'essere fra 1 e 9999, e si guarda **l'istante finale**.
 *
 * Postgres non conosce l'anno zero e non sa rileggere l'anno 10000 attraverso
 * il convertitore di Prisma: una riga sola cosi fa cadere prima nota,
 * rendiconto, export e saldi di quel club.
 */
const dentroGliAnniLeggibili = (istante: Date): string | null => {
  const anno = istante.getUTCFullYear();
  return anno < 1 || anno > 9999 ? null : istante.toISOString();
};

const dataStorica = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  /*
    Si tolgono i **soli spazi**, come fa `btrim` di Postgres: una tabulazione
    in coda la toglie `String.prototype.trim` e non la toglie `btrim`, e le due
    letture si trovavano in disaccordo su una riga per un carattere invisibile.
  */
  /*
    **`String(value)` non e cio che fa `->>`, e su un oggetto puo alzare.**

    Un valore JSON che non e una stringa arrivava qui grezzo: un array
    `["2026-01-01"]` diventava `"2026-01-01"` per JavaScript e restava un
    array per Postgres — quindi la riga usciva da una lettura sola. E un
    oggetto con una chiave `toString` che non e una funzione non ha nessuna
    conversione a primitivo: `String(...)` **alza**, e con lei cadeva
    l'**intera** lettura del registro. Cioe l'oracolo che deve accorgersi delle
    divergenze moriva su una riga scritta male.
  */
  const testo = jsonComeTesto(value).replace(/^ +| +$/g, "");
  if (!testo) return null;

  /*
    **Si accetta la sola forma su cui le due letture possono essere d'accordo.**

    Oltre alla forma ISO le due divergevano su tutto cio che ognuna interpreta
    a modo suo, e nessuna delle due sbagliava per conto proprio:

      "now" / "today" / "epoch"   Postgres li risolve, JavaScript no
      "09/03/2026"                Postgres 3 settembre, JavaScript 9 marzo
      "infinity"                  Postgres lo accetta, e poi cade sull'anno

    Una data che due letture dello stesso registro datano a due giorni diversi
    sposta l'anno fiscale a cavallo di dicembre. Non c'e un'interpretazione
    giusta da scegliere: c'e una forma sola che non ha bisogno di essere
    interpretata, e il resto non e una data.
  */
  const pezzi = ISO_STORICA.exec(testo);
  if (!pezzi) return null;

  const [, anno, mese, giorno, ore, minuti, secondi, frazione, fuso] = pezzi;
  if (Number(anno) < 1) return null;

  /*
    **Postgres rifiuta una data che non entra nel buffer del suo parser.**

    Oltre una certa lunghezza `ParseDateTime` alza `22007` e la stringa viene
    scartata per intero, mentre JavaScript la legge senza battere ciglio. Le
    due soglie sono state **misurate**, non dedotte: 130 cifre di frazione
    senza fuso, 123 con — il fuso occupa un campo in piu.

    La soglia e sulla **lunghezza complessiva**, non sulle cifre della
    frazione: 150 caratteri senza fuso e 149 con, perche il fuso occupa un
    campo in piu del buffer. Misurate, non dedotte.

    Non e una perdita: oltre il microsecondo nessuna delle due letture
    conserva altra precisione.
  */
  if (testo.length > (fuso ? 149 : 150)) return null;

  /*
    **L'orologio da muro, letto come UTC.**

    E cio che fa `valore::timestamp` in Postgres, e non e cio che faceva
    `new Date("2026-03-09T12:00")`: senza fuso JavaScript legge **l'ora
    locale**, quindi le due letture divergevano di un'ora su ogni macchina
    che non sta a Greenwich — e la sonda di riconciliazione dava un verdetto
    diverso a seconda di dove la si eseguiva.
  */
  const muro = new Date(
    `${anno}-${mese}-${giorno}T${ore || "00"}:${minuti || "00"}:${secondi || "00"}${frazione || ""}Z`,
  );
  if (Number.isNaN(muro.getTime())) return null;

  if (
    muro.getUTCFullYear() !== Number(anno) ||
    muro.getUTCMonth() + 1 !== Number(mese) ||
    muro.getUTCDate() !== Number(giorno)
  ) {
    return null;
  }

  /*
    **`timestamp(3)` arrotonda, `new Date` tronca.**

    `23:59:59.9999` diventa il secondo dopo per Postgres e resta il millesimo
    prima per JavaScript — e a cavallo di capodanno le due letture finiscono in
    **anni fiscali diversi**.

    L'arrotondamento viene **dopo** il controllo del giorno, e non prima: il
    31 dicembre alle 23:59:59.9999 e una data valida che arrotondando diventa
    il primo gennaio, e un controllo fatto dopo la rifiuterebbe come se il
    giorno non fosse esistito.

    E l'anno 10000, che nasce proprio da questo arrotondamento, esce da
    entrambe le letture: `isfinite` lo accetta e il convertitore di Prisma non
    lo sa rileggere — una riga sola cosi faceva cadere prima nota, rendiconto,
    export e saldi di quel club.
  */
  /*
    **L'offset si calcola prima, perche decide da che parte si arrotonda.**

    Postgres legge la stringa in un istante — applicando il fuso — e solo dopo
    applica `timestamp(3)`. Il verso dell'arrotondamento dipende dal segno dei
    microsecondi contati da 2000-01-01, quindi dall'istante **finale**: su
    `2000-01-01T00:00:00.9995-05:00` l'orologio da muro e del 2000 ma
    l'istante e le cinque del mattino dello stesso giorno, e le due letture
    cadevano su due millesimi diversi.
  */
  let minutiDiFuso = 0;
  if (fuso && fuso !== "Z") {
    const cifre = fuso.slice(1).replace(":", "");
    const oreDiFuso = Number(cifre.slice(0, 2));
    const minutiSpezzati = Number(cifre.slice(2));
    /*
      Postgres non conosce un fuso oltre ±15:59, ne minuti oltre 59, e rifiuta
      la stringa; JavaScript la accetta.
    */
    if (minutiSpezzati > 59) return null;
    const totale = oreDiFuso * 60 + minutiSpezzati;
    if (totale > 15 * 60 + 59) return null;
    minutiDiFuso = (fuso[0] === "-" ? 1 : -1) * totale;
  }

  const istante = new Date(muro.getTime() + minutiDiFuso * 60000);

  if (frazione) {
    /*
      **Postgres arrotonda due volte, e in un verso che non e quello di
      `Math.round`.**

      *La prima* nel leggere il testo: la parte decimale dei secondi diventa un
      intero di **microsecondi**. *La seconda* nell'applicare `timestamp(3)`:
      quei microsecondi diventano millesimi. Arrotondare una volta sola dava un
      millesimo di scarto su valori come `.1234999` — 123.499,9 µs, che
      diventano 123.500 e poi 124 — e uno scarto sul millesimo, a capodanno, e
      un **anno fiscale** diverso.

      E il verso: `AdjustTimestampForTypmod` lavora sui microsecondi **con
      segno** contati da 2000-01-01 e arrotonda per eccesso in valore assoluto.
      Sopra quell'epoca e mezzo-per-eccesso; **sotto e mezzo-per-difetto**, che
      e il contrario di `Math.round`.
    */
    const primaDelDuemila = istante.getTime() < Date.UTC(2000, 0, 1);
    const arrotonda = (valore: number) =>
      primaDelDuemila ? -Math.round(-valore) : Math.round(valore);

    const microsecondi = arrotonda(Number(`0${frazione}`) * 1e6);
    istante.setUTCMilliseconds(arrotonda(microsecondi / 1000));
    if (Number.isNaN(istante.getTime())) return null;
  }

  return dentroGliAnniLeggibili(istante);
};

/**
 * Da dove viene una riga del registro.
 *
 * Non e un dettaglio di presentazione: e cio che decide **se si puo toccare**.
 * `entry` e di questa contabilita e si modifica e si storna; `projected`
 * appartiene a un dominio proprietario e si corregge li, dove ci sono i suoi
 * permessi, i suoi invarianti e il suo audit; `legacy` e il blob storico, che
 * non ha nemmeno un conto a cui appartenere.
 */
export type LedgerRowKind = "entry" | "projected" | "legacy";

/**
 * Una riga della vista, con i nomi delle **colonne** e non quelli del dominio.
 *
 * La forma e quella che Prisma restituisce leggendo `accounting_ledger_lines`,
 * ed e voluta: il codice di lettura ne conosce una sola, e il doppio dei test
 * puo produrne una identica.
 */
export type LedgerViewRow = {
  id: string;
  row_kind: LedgerRowKind;
  organization_id: string;
  entry_date: Date;
  fiscal_year: number;
  season_id: string | null;
  direction: string;
  amount_cents: number;
  currency: string;
  financial_account_id: string | null;
  financial_account_name: string | null;
  operation_type_code: string | null;
  operation_type_label: string | null;
  activity_scope: string;
  description: string;
  notes: string | null;
  payment_method: string | null;
  counterparty_kind: string | null;
  counterparty_id: string | null;
  counterparty_label: string | null;
  source_domain: string;
  source_id: string | null;
  document_kind: string | null;
  document_id: string | null;
  document_number: string | null;
  site_id: string | null;
  reconciliation_status: string;
  value_date: Date | null;
  bank_reference: string | null;
  transfer_group_id: string | null;
  reversal_of_id: string | null;
  reversed_at: Date | null;
  reversal_reason: string | null;
  created_by: string | null;
  created_at: Date | null;
  search_text: string | null;
};

/* ========================================================================== */
/* I movimenti propri                                                          */
/* ========================================================================== */

export type OwnEntryRow = {
  id: string;
  organization_id: string;
  entry_date: Date | string;
  fiscal_year: number;
  season_id?: string | null;
  direction: string;
  amount_cents: number;
  currency?: string | null;
  financial_account_id?: string | null;
  operation_type_id?: string | null;
  operation_type_code?: string | null;
  operation_type_label_snapshot?: string | null;
  activity_scope_snapshot?: string | null;
  description: string;
  notes?: string | null;
  payment_method?: string | null;
  counterparty_kind?: string | null;
  counterparty_id?: string | null;
  counterparty_label?: string | null;
  source_domain?: string | null;
  source_id?: string | null;
  document_kind?: string | null;
  document_id?: string | null;
  site_id?: string | null;
  reconciliation_status?: string | null;
  value_date?: Date | string | null;
  bank_reference?: string | null;
  transfer_group_id?: string | null;
  reversal_of_id?: string | null;
  reversed_at?: Date | string | null;
  reversal_reason?: string | null;
  created_by?: string | null;
  created_at?: Date | string | null;
  _accountName?: string | null;
  _operationTypeLabel?: string | null;
  _documentNumber?: string | null;
};

/**
 * Una riga di `accounting_entries` diventa una riga di registro.
 *
 * L'identificativo e **prefissato per dominio**: due domini non possono
 * collidere, e chi legge una riga sa da dove viene senza guardare altro.
 */
export const projectOwnEntries = (
  rows: readonly OwnEntryRow[],
): LedgerViewRow[] =>
  rows.map((row) => {
    /*
      L'etichetta congelata vince su quella corrente. Invertire l'ordine
      farebbe cambiare nome alle causali del passato ogni volta che qualcuno
      ne corregge una: e la stessa disciplina dello snapshot di un documento.
    */
    const etichetta =
      testo(row.operation_type_label_snapshot) || testo(row._operationTypeLabel);

    return {
      id: `accounting-entry:${row.id}`,
      row_kind: "entry",
      organization_id: String(row.organization_id),
      entry_date: data(row.entry_date) as Date,
      fiscal_year: Number(row.fiscal_year),
      season_id: testo(row.season_id),
      direction: String(row.direction),
      amount_cents: Number(row.amount_cents) || 0,
      currency: testo(row.currency) || "EUR",
      financial_account_id: testo(row.financial_account_id),
      financial_account_name: testo(row._accountName),
      operation_type_code: testo(row.operation_type_code),
      operation_type_label: etichetta,
      activity_scope: normalizeActivityScope(row.activity_scope_snapshot),
      description: String(row.description ?? ""),
      notes: testo(row.notes),
      payment_method: testo(row.payment_method),
      counterparty_kind: testo(row.counterparty_kind),
      counterparty_id: testo(row.counterparty_id),
      counterparty_label: testo(row.counterparty_label),
      source_domain: testo(row.source_domain) || "MANUAL",
      source_id: testo(row.source_id),
      document_kind: testo(row.document_kind),
      document_id: testo(row.document_id),
      document_number: testo(row._documentNumber),
      site_id: testo(row.site_id),
      reconciliation_status: testo(row.reconciliation_status) || "unreconciled",
      value_date: data(row.value_date),
      bank_reference: testo(row.bank_reference),
      transfer_group_id: testo(row.transfer_group_id),
      reversal_of_id: testo(row.reversal_of_id),
      reversed_at: data(row.reversed_at),
      reversal_reason: testo(row.reversal_reason),
      created_by: testo(row.created_by),
      created_at: data(row.created_at),
      search_text: testoDiRicerca([
        row.description,
        row.counterparty_label,
        etichetta,
        row.operation_type_code,
        row.notes,
        row.bank_reference,
      ]),
    };
  });

/* ========================================================================== */
/* I movimenti storici, che vivono ancora nel JSON                             */
/* ========================================================================== */

/**
 * Le righe scritte prima che la prima nota esistesse, lette dal blob
 * `clubs.transactions` / `clubs.transfers` e mostrate in sola lettura.
 *
 * **Non hanno un conto**, e non gliene viene attribuito uno: il loro effetto e
 * gia dentro il saldo di apertura dei conti travasati, e assegnarle a una cassa
 * le conterebbe due volte.
 *
 * **Non hanno una causale**, e neanche questa viene inventata: compaiono come
 * `unspecified`, che e la verita. Il rendiconto le contera fra le «non
 * classificate» invece di nasconderle in un totale — ed e cosi che un club
 * capisce che ha del lavoro di classificazione da fare.
 */
export const projectLegacyClubMovements = (club: any): LedgerViewRow[] => {
  const organizationId = String(club?.id || "");
  if (!organizationId) return [];

  const guscio = (entryDate: string): Omit<LedgerViewRow, "id" | "direction" | "amount_cents" | "description" | "payment_method" | "source_domain" | "source_id" | "search_text"> => ({
    row_kind: "legacy",
    organization_id: organizationId,
    entry_date: data(entryDate) as Date,
    fiscal_year: fiscalYearOfEntry(entryDate),
    season_id: null,
    currency: "EUR",
    financial_account_id: null,
    financial_account_name: null,
    operation_type_code: null,
    operation_type_label: null,
    activity_scope: "unspecified",
    notes: null,
    counterparty_kind: null,
    counterparty_id: null,
    counterparty_label: null,
    document_kind: null,
    document_id: null,
    document_number: null,
    site_id: null,
    reconciliation_status: "unreconciled",
    value_date: null,
    bank_reference: null,
    transfer_group_id: null,
    reversal_of_id: null,
    reversed_at: null,
    reversal_reason: null,
    created_by: null,
    created_at: data(entryDate),
  });

  const movimenti = asArray(club.transactions).flatMap(
    (row, index): LedgerViewRow[] => {
      const entryDate = dataStorica(row?.date) || dataStorica(row?.created_at);
      if (!entryDate) return [];
      const amountCents = centesimiStorici(row?.amount);
      if (!amountCents) return [];

      /*
        `COALESCE` sceglie il primo **non nullo**, non il primo **vero**: con
        `{type: "", direction: "expense"}` l'SQL prendeva la stringa vuota e
        ne ricavava un'entrata, mentre `||` scavalcava fino a `direction` e
        ne ricavava un'uscita. Sei righe uscivano con il verso opposto.
      */
      const tipo = jsonComeTesto(
        row?.type ?? row?.direction ?? "income",
      ).toLowerCase();
      const descrizione =
        testo(row?.description) || testo(row?.title) || "Movimento storico";

      return [
        {
          ...guscio(entryDate),
          /*
            **L'identificativo e la posizione, non il campo `id` del JSON.**

            Due righe del blob con lo stesso `id` — e succede, perche nessuno
            ha mai imposto l'unicita dentro una colonna JSON — producevano due
            righe del registro con lo stesso identificativo. L'ordine del
            registro usa proprio l'identificativo come criterio di spareggio,
            quindi la pagina 2 poteva ripetere righe della pagina 1: cioe
            esattamente l'invariante che quel criterio esiste per garantire.
            La posizione nell'array e unica per costruzione. Il campo `id` del
            JSON, dove c'e, resta in `source_id`.
          */
          id: `legacy-transaction:${index}`,
          direction: ["expense", "uscita", "out"].includes(tipo) ? "OUT" : "IN",
          amount_cents: amountCents,
          source_domain: "MANUAL",
          /* `NULLIF(btrim(id), '')`, come nella vista. */
          source_id: testo(row?.id) || `legacy-${index}`,
          description: descrizione,
          payment_method: testo(row?.paymentMethod) || testo(row?.method),
          search_text: testoDiRicerca([descrizione]),
        },
      ];
    },
  );

  const giroconti = asArray(club.transfers).flatMap(
    (row, index): LedgerViewRow[] => {
      const entryDate = dataStorica(row?.date) || dataStorica(row?.created_at);
      if (!entryDate) return [];
      const amountCents = centesimiStorici(row?.amount);
      if (!amountCents) return [];

      /*
        Un giroconto storico e **una** riga sola nel blob, non due. Resta una
        riga qui, con verso `OUT` per convenzione e senza gruppo: non e una
        gamba di niente, e presentarlo come due meta suggerirebbe un
        collegamento che nel dato non c'e.
      */
      /*
        La gamba sola si dichiara. Il blob non dice fra quali conti sia passato
        il denaro in una forma che si possa credere, e chi legge «trasferito in
        uscita 500, in entrata 0» deve poter capire perche invece di sospettare
        un errore.
      */
      const etichetta = testo(row?.description) || "Giroconto storico";
      const descrizione = etichetta + " (storico, gamba sola)";

      return [
        {
          ...guscio(entryDate),
          id: `legacy-transfer:${index}`,
          direction: "OUT",
          amount_cents: amountCents,
          source_domain: "INTERNAL_TRANSFER",
          source_id: testo(row?.id) || `legacy-transfer-${index}`,
          description: descrizione,
          payment_method: "Giroconto",
          /* La ricerca guarda l etichetta, non la nota fra parentesi. */
          search_text: testoDiRicerca([etichetta]),
        },
      ];
    },
  );

  return [...movimenti, ...giroconti];
};

/* ========================================================================== */
/* La composizione                                                             */
/* ========================================================================== */

/**
 * Il testo su cui la pagina cerca: gli stessi campi, nello stesso ordine, in
 * minuscolo. Sta nella riga e non nel codice di ricerca perche il filtro possa
 * scendere nel `WHERE` invece di scorrere in memoria trentacinquemila righe.
 */
/**
 * Il testo su cui la ricerca lavora, costruito **come lo costruisce la vista**.
 *
 * `String.prototype.trim` toglie tabulazioni, a capo, spazi unificatori e BOM;
 * `btrim` toglie i **soli spazi**. Una descrizione che comincia per
 * tabulazione produceva due testi di ricerca diversi, e quando era fatta di
 * sola tabulazione una lettura la considerava vuota e l'altra no: la stessa
 * parola trovava la riga in produzione e non nei test, o viceversa.
 */
const testoDiRicerca = (parti: readonly unknown[]) => {
  const testo = parti
    .map((parte) => jsonComeTesto(parte).replace(/^ +| +$/g, ""))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return testo || null;
};

/**
 * Una riga proiettata da un dominio proprietario, nella forma della vista.
 *
 * Le proiezioni producono `AccountingLine`, che e la forma del **dominio**;
 * qui si torna alla forma delle **colonne**, perche il registro ne abbia una
 * sola e il codice di lettura non debba distinguere.
 */
const daProiezione = (line: AccountingLine): LedgerViewRow => ({
  id: line.id,
  row_kind: "projected",
  organization_id: line.organizationId,
  entry_date: data(line.entryDate) as Date,
  fiscal_year: line.fiscalYear,
  season_id: line.seasonId ?? null,
  direction: line.direction,
  amount_cents: line.amountCents,
  currency: line.currency || "EUR",
  financial_account_id: line.financialAccountId ?? null,
  financial_account_name: line.financialAccountName ?? null,
  operation_type_code: line.operationTypeCode ?? null,
  operation_type_label: line.operationTypeLabel ?? null,
  activity_scope: line.activityScope,
  description: line.description,
  notes: line.notes ?? null,
  payment_method: line.paymentMethod ?? null,
  counterparty_kind: line.counterpartyKind ?? null,
  counterparty_id: line.counterpartyId ?? null,
  counterparty_label: line.counterpartyLabel ?? null,
  source_domain: line.sourceDomain,
  source_id: line.sourceId ?? null,
  document_kind: line.documentKind ?? null,
  document_id: line.documentId ?? null,
  document_number: line.documentNumber ?? null,
  site_id: line.siteId ?? null,
  reconciliation_status: line.reconciliationStatus,
  value_date: data(line.valueDate),
  bank_reference: line.bankReference ?? null,
  transfer_group_id: line.transferGroupId ?? null,
  reversal_of_id: line.reversalOfId ?? null,
  reversed_at: data(line.reversedAt),
  reversal_reason: line.reversalReason ?? null,
  created_by: line.createdBy ?? null,
  created_at: data(line.createdAt),
  search_text: testoDiRicerca([
    line.description,
    line.counterpartyLabel,
    line.operationTypeLabel,
    line.operationTypeCode,
    line.notes,
    line.bankReference,
  ]),
});

/**
 * Il registro intero, dalle cinque sorgenti, nell'ordine in cui il database lo
 * restituisce: **per data decrescente, e a parita di data per identificativo**.
 *
 * L'ordine secondario non e estetico: senza, la pagina 2 puo ripetere righe
 * della pagina 1, perche due letture con lo stesso `ORDER BY` ambiguo non sono
 * obbligate a restituire lo stesso ordine.
 */
export const buildLedgerView = (input: {
  entries?: readonly OwnEntryRow[];
  paymentTransactions?: readonly PaymentTransactionRow[];
  sportWorkPayouts?: readonly SportWorkOutboundRow[];
  fundingSettlements?: readonly FundingSettlementRow[];
  clubs?: readonly any[];
}): LedgerViewRow[] => {
  const righe: LedgerViewRow[] = [
    ...projectOwnEntries(input.entries || []),
    ...projectPaymentTransactions(input.paymentTransactions || []).map(daProiezione),
    ...projectSportWorkPayouts(input.sportWorkPayouts || []).map(daProiezione),
    ...projectFundingSettlements(input.fundingSettlements || []).map(daProiezione),
    ...(input.clubs || []).flatMap((club) => projectLegacyClubMovements(club)),
  ];

  return ordinaRigheRegistro(righe);
};

/** L'ordine del registro: data decrescente, poi identificativo crescente. */
export const ordinaRigheRegistro = (righe: readonly LedgerViewRow[]) =>
  [...righe].sort((a, b) => {
    const ta = Date.parse(String(iso(a.entry_date) || ""));
    const tb = Date.parse(String(iso(b.entry_date) || ""));
    if (tb !== ta) return tb - ta;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

/* ========================================================================== */
/* Dalla riga della vista alla riga di dominio                                 */
/* ========================================================================== */

/**
 * Cosa si puo fare su una riga, e perche cosi poco.
 *
 * Una riga **stornata** e uno **storno** non si toccano: sono la coppia che
 * racconta una correzione, e modificarne una meta la renderebbe illeggibile.
 * Un **giroconto** non si modifica gamba per gamba — si storna intero,
 * altrimenti le due meta possono divergere e il denaro sparisce fra due conti.
 * Nessuna riga si **cancella**: e la regola della Wave.
 *
 * Le righe proiettate e quelle storiche non permettono niente: un compenso si
 * storna dove i compensi si erogano, perche li ci sono i permessi del dominio,
 * i suoi invarianti e il suo audit.
 */
export const ledgerRowToLine = (
  row: LedgerViewRow,
  can: { reverse: boolean; reconcile: boolean; manage: boolean },
): AccountingLine => {
  const propria = row.row_kind === "entry";
  const stornata = Boolean(row.reversed_at);
  const eStorno = row.source_domain === "REVERSAL";
  const giroconto = row.source_domain === "INTERNAL_TRANSFER";

  return {
    id: row.id,
    organizationId: row.organization_id,
    entryDate: iso(row.entry_date) as string,
    fiscalYear: Number(row.fiscal_year),
    seasonId: row.season_id || null,
    direction: row.direction as AccountingLine["direction"],
    amountCents: Number(row.amount_cents) || 0,
    currency: row.currency || "EUR",
    financialAccountId: row.financial_account_id || null,
    financialAccountName: row.financial_account_name || null,
    operationTypeCode: row.operation_type_code || null,
    operationTypeLabel: row.operation_type_label || null,
    activityScope: normalizeActivityScope(row.activity_scope),
    description: row.description,
    notes: row.notes || null,
    paymentMethod: row.payment_method || null,
    counterpartyKind: (row.counterparty_kind as CounterpartyKind) || null,
    counterpartyId: row.counterparty_id || null,
    counterpartyLabel: row.counterparty_label || null,
    sourceDomain: row.source_domain as AccountingSourceDomain,
    sourceId: row.source_id || null,
    documentKind: row.document_kind || null,
    documentId: row.document_id || null,
    documentNumber: row.document_number || null,
    siteId: row.site_id || null,
    reconciliationStatus: row.reconciliation_status as ReconciliationStatus,
    valueDate: iso(row.value_date),
    bankReference: row.bank_reference || null,
    transferGroupId: row.transfer_group_id || null,
    reversalOfId: row.reversal_of_id || null,
    reversedAt: iso(row.reversed_at),
    reversalReason: row.reversal_reason || null,
    createdBy: row.created_by || null,
    createdAt: iso(row.created_at),
    canEdit: propria && can.manage && !stornata && !eStorno && !giroconto,
    canDelete: false,
    canReverse: propria && can.reverse && !stornata && !eStorno,
    canReconcile: propria && can.reconcile && !stornata,
  };
};

export { sortAccountingLines };
